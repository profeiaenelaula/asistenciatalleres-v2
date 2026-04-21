import React, { useState, useEffect } from 'react';
import { Plus, Users, Calendar, UploadCloud, GraduationCap, ChevronLeft, Check, Save, History as HistoryIcon, Calendar as CalendarIcon, ChevronDown, ChevronUp, Download, FileText, PieChart, Trash2, Edit, CheckCircle } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';

const NIVELES = ['1° Medio', '2° Medio', '3° Medio', '4° Medio'];

interface Teacher { id: string; name: string; username: string; }
interface Student {
  id: string;
  name: string;
  rut: string;
  course?: string;
  status: 'present' | 'absent' | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  presentCount: number;
  absentCount: number;
  observation: string;
  studentRecords: { id: string; name: string; status: 'present' | 'absent' }[];
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<string>('1° Medio');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [workshops, setWorkshops] = useState<any[]>([]);
  
  useEffect(() => {
    fetchTeachers();
    fetchWorkshops();
  }, []);

  const fetchTeachers = async () => {
    const { data } = await supabase.from('teachers').select('*').order('name');
    if (data) setTeachers(data);
  };

  const fetchWorkshops = async () => {
    const { data } = await supabase.from('workshops').select('*, teachers(name), enrollments(id)');
    if (data) {
      const withCount = data.map((w: any) => ({ ...w, enrolled_count: w.enrollments?.length || 0 }));
      setWorkshops(withCount);
    }
  };

  const fetchWorkshopStudents = async (workshopId: string) => {
    try {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, student_name, student_rut, course')
        .eq('workshop_id', workshopId)
        .order('student_name');
      
      if (enrollments) {
        setStudents(enrollments.map(e => ({
          id: e.id,
          name: e.student_name,
          rut: e.student_rut,
          course: e.course,
          status: null
        })));
      }

      const { data: sessions } = await supabase
        .from('attendance_sessions')
        .select(`
          id, 
          date, 
          observation,
          attendance_records (enrollment_id, student_name, status)
        `)
        .eq('workshop_id', workshopId)
        .order('date', { ascending: false });

      if (sessions) {
        const formattedHistory: AttendanceRecord[] = sessions.map(s => {
          const records = (s.attendance_records as any[]) || [];
          return {
            id: s.id,
            date: s.date,
            presentCount: records.filter(r => r.status === 'present').length,
            absentCount: records.filter(r => r.status === 'absent').length,
            observation: s.observation || '',
            studentRecords: records.map(r => ({
              id: r.enrollment_id,
              name: r.student_name,
              status: r.status
            }))
          };
        });
        setPastRecords(formattedHistory);
      }
    } catch (error) {
      console.error('Error fetching workshop students/history:', error);
    }
  };
  
  const [editingCalendar, setEditingCalendar] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [creatingWorkshop, setCreatingWorkshop] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherUsername, setNewTeacherUsername] = useState('');
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);
  const [selectedWorkshop, setSelectedWorkshop] = useState<any>(null);
  const [wsActiveTab, setWsActiveTab] = useState<'nomina' | 'historial' | 'tomar' | 'estadisticas'>('nomina');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [students, setStudents] = useState<Student[]>([]);
  const [observation, setObservation] = useState('');
  const [saved, setSaved] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [pastRecords, setPastRecords] = useState<AttendanceRecord[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const markAllPresent = () => {
    setStudents(prev => prev.map(s => ({ ...s, status: 'present' })));
  };

  const deleteSession = async (sessionId: string) => {
    if (!window.confirm('¿Eliminar este registro de asistencia permanentemente?')) return;
    try {
      const { error } = await supabase.from('attendance_sessions').delete().eq('id', sessionId);
      if (error) throw error;
      if (selectedWorkshop) fetchWorkshopStudents(selectedWorkshop.id);
      alert('Registro eliminado.');
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const toggleStatus = (id: string, newStatus: 'present' | 'absent') => {
    setStudents(prev => 
      prev.map(student => 
        student.id === id ? { ...student, status: newStatus } : student
      )
    );
  };

  const handleEdit = (record: AttendanceRecord) => {
    setEditingSessionId(record.id);
    setSelectedDate(record.date);
    setObservation(record.observation);
    const updatedStudents = students.map(s => {
      const past = record.studentRecords.find(psr => psr.id === s.id);
      return { ...s, status: past ? past.status : null };
    });
    setStudents(updatedStudents);
    setWsActiveTab('tomar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAttendance = async () => {
    if (!selectedWorkshop) return;
    if (students.some(s => s.status === null)) {
      alert('Por favor, marca la asistencia de todos los estudiantes.');
      return;
    }
    setSaved(true);
    try {
      if (editingSessionId) {
        const { error: sessionError } = await supabase
          .from('attendance_sessions')
          .update({ date: selectedDate, observation: `${observation} (Editado por Admin)` })
          .eq('id', editingSessionId);
        if (sessionError) throw sessionError;
        await supabase.from('attendance_records').delete().eq('session_id', editingSessionId);
        const recordsToInsert = students.map(s => ({
          session_id: editingSessionId,
          enrollment_id: s.id,
          student_name: s.name,
          student_rut: s.rut,
          status: s.status
        }));
        await supabase.from('attendance_records').insert(recordsToInsert);
        alert('Asistencia actualizada con éxito.');
        setEditingSessionId(null);
      } else {
        const { data: session, error: sessionError } = await supabase
          .from('attendance_sessions')
          .insert({
            workshop_id: selectedWorkshop.id,
            date: selectedDate,
            observation: `${observation} (Vía Dashboard Admin)`
          })
          .select()
          .single();
        if (sessionError) throw sessionError;
        const recordsToInsert = students.map(s => ({
          session_id: session.id,
          enrollment_id: s.id,
          student_name: s.name,
          student_rut: s.rut,
          status: s.status
        }));
        const { error: recordsError } = await supabase.from('attendance_records').insert(recordsToInsert);
        if (recordsError) throw recordsError;
        alert('Asistencia guardada con éxito.');
      }
      fetchWorkshopStudents(selectedWorkshop.id);
      setObservation('');
      setWsActiveTab('historial');
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSaved(false);
    }
  };

  const calculateStudentStats = (studentId: string) => {
    let presences = 0;
    let absences = 0;
    pastRecords.forEach(record => {
      const stuRecord = record.studentRecords.find(s => s.id === studentId);
      if (stuRecord?.status === 'present') presences++;
      if (stuRecord?.status === 'absent') absences++;
    });
    const total = presences + absences;
    const percentage = total > 0 ? Math.round((presences / total) * 100) : 0;
    return { presences, absences, total, percentage };
  };

  const calculateGlobalStats = () => {
    const totalClasses = pastRecords.length;
    if (totalClasses === 0 || students.length === 0) return 0;
    let totalPercentSum = 0;
    students.forEach(s => {
      totalPercentSum += calculateStudentStats(s.id).percentage;
    });
    return Math.round(totalPercentSum / students.length);
  };

  const exportGlobalPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Reporte de Asistencia: ${selectedWorkshop.name}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Nivel: ${activeTab}`, 14, 30);
    doc.text(`Docente Titular: ${selectedWorkshop.teacher}`, 14, 36);
    doc.text(`Días Dictados: ${pastRecords.length}`, 14, 42);
    doc.text(`Rendimiento de Asistencia Promedio (Curso): ${calculateGlobalStats()}%`, 14, 48);
    const studentData = students.map(s => {
      const stats = calculateStudentStats(s.id);
      return [s.name, s.rut, `${stats.presences}`, `${stats.absences}`, `${stats.percentage}%`];
    });
    autoTable(doc, {
      startY: 55,
      head: [['Estudiante', 'RUT', 'Días Presente', 'Días Ausente', '% Asistencia']],
      body: studentData,
      theme: 'grid',
      headStyles: { fillColor: [14, 165, 233] },
    });
    doc.save(`Reporte_Global_${selectedWorkshop.name.replace(/ /g, '_')}.pdf`);
  };

  const exportIndividualPDF = (student: Student, stats: { presences: number, absences: number, total: number, percentage: number }) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Reporte Individual: ${student.name}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`RUT: ${student.rut}`, 14, 30);
    doc.text(`Taller: ${selectedWorkshop.name} (${activeTab})`, 14, 36);
    doc.text(`Asistencia Total: ${stats.percentage}% (${stats.presences} de ${stats.total} clases)`, 14, 42);
    doc.text(`Fecha Emisión: ${format(new Date(), "dd 'de' MMMM, yyyy", { locale: es })}`, 14, 48);
    const historyData = pastRecords.map(record => {
      const r = record.studentRecords.find(s => s.id === student.id);
      return [
        record.date, 
        r?.status === 'present' ? 'Presente' : 'Ausente',
        record.observation || 'Sin observaciones'
      ];
    });
    autoTable(doc, {
      startY: 55,
      head: [['Fecha', 'Estado', 'Nota de la Sesión']],
      body: historyData,
      theme: 'grid',
      headStyles: { fillColor: [234, 179, 8] },
    });
    doc.save(`Reporte_Individual_${student.name.replace(/ /g, '_')}.pdf`);
  };

  const renderWorkshopDetail = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn-accent" style={{ padding: '0.5rem', borderRadius: '50%' }} onClick={() => setSelectedWorkshop(null)}><ChevronLeft size={24} /></button>
        <div>
          <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Panel de Taller: {selectedWorkshop.name}</h2>
          <p style={{ color: 'var(--color-text-light)' }}>Docente Titular: {selectedWorkshop.teacher} | Nivel: {activeTab}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '2rem', overflowX: 'auto' }}>
        <button className={wsActiveTab === 'nomina' ? "btn-primary" : "btn-accent"} style={{ padding: '0.5rem 1rem', background: wsActiveTab !== 'nomina' ? 'transparent' : '', color: wsActiveTab !== 'nomina' ? 'var(--color-text)' : '', whiteSpace: 'nowrap' }} onClick={() => setWsActiveTab('nomina')}><Users size={18} /> Nómina ({students.length})</button>
        <button className={wsActiveTab === 'historial' ? "btn-primary" : "btn-accent"} style={{ padding: '0.5rem 1rem', background: wsActiveTab !== 'historial' ? 'transparent' : '', color: wsActiveTab !== 'historial' ? 'var(--color-text)' : '', whiteSpace: 'nowrap' }} onClick={() => setWsActiveTab('historial')}><HistoryIcon size={18} /> Historial</button>
        <button className={wsActiveTab === 'estadisticas' ? "btn-primary" : "btn-accent"} style={{ padding: '0.5rem 1rem', background: wsActiveTab !== 'estadisticas' ? 'transparent' : '', color: wsActiveTab !== 'estadisticas' ? 'var(--color-text)' : '', whiteSpace: 'nowrap' }} onClick={() => setWsActiveTab('estadisticas')}><PieChart size={18} /> Estadísticas y Reportes</button>
        <div style={{ width: '2px', backgroundColor: 'var(--color-border)', margin: '0 0.5rem' }}></div>
        <button className={wsActiveTab === 'tomar' ? "btn-danger" : "btn-accent"} style={{ padding: '0.5rem 1rem', background: wsActiveTab === 'tomar' ? 'var(--color-danger)' : 'transparent', color: wsActiveTab === 'tomar' ? '#fff' : 'var(--color-text)', whiteSpace: 'nowrap' }} onClick={() => setWsActiveTab('tomar')}><Check size={18} /> Registrar Anomalía / Emergencia</button>
      </div>
      {wsActiveTab === 'nomina' && (
        <div className="card">
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Estudiantes Inscritos ({students.length})</h3>
          {students.length === 0 ? <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>No hay estudiantes inscritos.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Nombre Estudiante</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>RUT</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Curso</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => (
                    <tr key={student.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-light)', fontSize: '0.875rem' }}>{index + 1}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{student.name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-light)' }}>{student.rut}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{student.course || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {wsActiveTab === 'historial' && (
        <div className="card">
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Historial de Sesiones</h3>
          {pastRecords.length === 0 ? <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>No hay registros.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'center' }}>Asistencia</th>
                    <th>Observación</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pastRecords.map((record) => {
                    let formattedDate = record.date;
                    try {
                      const dateObj = new Date(record.date + 'T00:00:00'); 
                      formattedDate = format(dateObj, "EEEE, dd 'de' MMMM yyyy", { locale: es });
                    } catch (e) {}
                    const total = record.presentCount + record.absentCount;
                    const percent = total > 0 ? Math.round((record.presentCount / total) * 100) : 0;
                    const isExpanded = expandedDate === record.date;
                    return (
                      <React.Fragment key={record.date}>
                        <tr style={{ backgroundColor: isExpanded ? 'rgba(0,0,0,0.02)' : 'transparent', borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ fontWeight: 500, textTransform: 'capitalize', padding: '1rem' }}>{formattedDate}</td>
                          <td style={{ textAlign: 'center', padding: '1rem' }}><span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{record.presentCount}</span> / {total} <span style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', marginLeft: '0.5rem' }}>({percent}%)</span></td>
                          <td style={{ color: 'var(--color-text-light)', padding: '1rem' }}>{record.observation || '-'}</td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button onClick={() => setExpandedDate(isExpanded ? null : record.date)} className="btn-accent" style={{ padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{isExpanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
                              <button onClick={() => handleEdit(record)} className="btn-accent" style={{ padding: '0.25rem 0.5rem', borderRadius: '4px' }}><Edit size={16} /></button>
                              <button onClick={() => deleteSession(record.id)} className="btn-accent" style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}>
                            <td colSpan={4} style={{ padding: '1.5rem 3rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                {record.studentRecords.map(sr => (
                                  <div key={sr.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px dashed var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text)' }}>{sr.name}</span>
                                    <span className={`badge ${sr.status === 'present' ? 'badge-present' : 'badge-absent'}`} style={{ fontSize: '0.75rem' }}>{sr.status === 'present' ? 'Presente' : 'Ausente'}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {wsActiveTab === 'estadisticas' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem' }}>Rendimiento General ({calculateGlobalStats()}%)</h3>
            <button className="btn-primary" onClick={exportGlobalPDF}><Download size={20} /> Exportar Reporte Global</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Estudiante</th><th style={{ textAlign: 'center' }}>Presente</th><th style={{ textAlign: 'center' }}>Ausente</th><th style={{ textAlign: 'center' }}>%</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
              </thead>
              <tbody>
                {students.map(student => {
                  const stats = calculateStudentStats(student.id);
                  return (
                    <tr key={student.id}>
                      <td>{student.name}</td>
                      <td style={{ textAlign: 'center' }}>{stats.presences}</td>
                      <td style={{ textAlign: 'center' }}>{stats.absences}</td>
                      <td style={{ textAlign: 'center' }}>{stats.percentage}%</td>
                      <td style={{ textAlign: 'right' }}><button className="btn-accent" style={{ padding: '0.25rem 0.5rem' }} onClick={() => exportIndividualPDF(student, stats)}><FileText size={16}/></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {wsActiveTab === 'tomar' && (
        <div className="card" style={{ border: '2px solid var(--color-danger)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ color: 'var(--color-danger)' }}>Registrar Anomalía</h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={markAllPresent} className="btn-accent" style={{ border: '1px solid var(--color-success)', color: 'var(--color-success)' }}>Confirmar Todos Presentes</button>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table>
              <thead>
                <tr><th>Estudiante</th><th style={{ textAlign: 'center' }}>Asistencia</th></tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id}>
                    <td>{student.name}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div className="toggle-group">
                          <button className={`toggle-btn ${student.status === 'present' ? 'active present' : ''}`} onClick={() => toggleStatus(student.id, 'present')}>Presente</button>
                          <button className={`toggle-btn ${student.status === 'absent' ? 'active absent' : ''}`} onClick={() => toggleStatus(student.id, 'absent')}>Ausente</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <textarea placeholder="Observaciones de emergencia..." value={observation} onChange={(e) => setObservation(e.target.value)} style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" style={{ backgroundColor: 'var(--color-danger)' }} onClick={handleSaveAttendance} disabled={saved}>{saved ? 'Guardando...' : 'Forzar Registro'}</button>
          </div>
        </div>
      )}
    </div>
  );

  const renderDocentesTab = () => (
    <div>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Directorio de Docentes</h2>
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: 'var(--color-bg)', border: 'none' }}>
        <form style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }} onSubmit={async (e) => {
          e.preventDefault();
          if (newTeacherName && newTeacherUsername && newTeacherPassword) {
            setIsCreatingTeacher(true);
            const { data, error } = await supabase.functions.invoke('create_teacher', {
              body: { username: newTeacherUsername, name: newTeacherName, password: newTeacherPassword }
            });
            setIsCreatingTeacher(false);
            if (error || data?.error) alert('Error: ' + (error?.message || data?.error));
            else { fetchTeachers(); setNewTeacherName(''); setNewTeacherUsername(''); setNewTeacherPassword(''); alert('Docente creado.'); }
          }
        }}>
          <input type="text" value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} placeholder="Nombre Completo" required />
          <input type="text" value={newTeacherUsername} onChange={e => setNewTeacherUsername(e.target.value)} placeholder="Usuario" required />
          <input type="text" value={newTeacherPassword} onChange={e => setNewTeacherPassword(e.target.value)} placeholder="Contraseña" required />
          <button type="submit" className="btn-primary" disabled={isCreatingTeacher}>{isCreatingTeacher ? 'Cargando...' : 'Crear Cuenta'}</button>
        </form>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Acciones</th></tr></thead>
          <tbody>{teachers.map(t => (<tr key={t.id}><td>{t.name}</td><td>{t.username}</td><td><a href="#" style={{ color: 'var(--color-danger)' }}>Eliminar</a></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );

  const renderLevelTab = (nivel: string) => (
    <div>
      <div className="card" style={{ marginBottom: '2rem', borderTop: '4px solid var(--color-accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3>Horario del Nivel</h3><p>{nivel}</p></div>
          <button className="btn-accent" onClick={() => setEditingCalendar(!editingCalendar)}>{editingCalendar ? 'Cerrar' : 'Configurar Horario'}</button>
        </div>
        {editingCalendar && (
          <div style={{ marginTop: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <DayPicker mode="multiple" selected={selectedDates} onSelect={setSelectedDates as any} defaultMonth={new Date(2026, 2)} fromYear={2026} toYear={2026} />
            <button className="btn-primary" onClick={() => setEditingCalendar(false)}>Guardar Fechas Selecciónadas</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Talleres en {nivel}</h2>
        <button className="btn-primary" onClick={() => setCreatingWorkshop(true)}><Plus size={18} /> Nuevo Taller</button>
      </div>
      <table>
        <thead><tr><th>Taller</th><th>Docente</th><th>Horario</th><th>Inscritos</th><th>Acciones</th></tr></thead>
        <tbody>
          {workshops.filter(w => w.target_level === nivel).map(w => (
            <tr key={w.id}>
              <td>{w.title}</td>
              <td>
                <select value={w.teacher_id || ''} onChange={async (e) => { await supabase.from('workshops').update({ teacher_id: e.target.value || null }).eq('id', w.id); fetchWorkshops(); }}>
                  <option value="">Sin Asignar</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </td>
              <td>{w.schedule || 'Por definir'}</td>
              <td style={{ textAlign: 'center' }}>{w.enrolled_count}</td>
              <td style={{ textAlign: 'right' }}><button className="btn-accent" onClick={() => { setSelectedWorkshop({ id: w.id, name: w.title, teacher: w.teachers?.name || 'Sin Asignar' }); fetchWorkshopStudents(w.id); }}>Ver Detalle</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="container">
      {selectedWorkshop ? renderWorkshopDetail() : (
        <div className="card">
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
            {NIVELES.map(n => (<button key={n} className={activeTab === n ? "btn-primary" : "btn-accent"} style={{ background: activeTab !== n ? 'transparent' : '' }} onClick={() => setActiveTab(n)}>{n}</button>))}
            <button className={activeTab === 'Docentes' ? "btn-primary" : "btn-accent"} style={{ background: activeTab !== 'Docentes' ? 'transparent' : '' }} onClick={() => setActiveTab('Docentes')}>Docentes</button>
          </div>
          {activeTab === 'Docentes' ? renderDocentesTab() : renderLevelTab(activeTab)}
        </div>
      )}
    </div>
  );
}
