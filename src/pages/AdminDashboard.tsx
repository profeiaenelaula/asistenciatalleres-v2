import React, { useState, useEffect } from 'react';
import { Plus, Users, Calendar, UploadCloud, GraduationCap, ChevronLeft, Check, Save, History as HistoryIcon, Calendar as CalendarIcon, ChevronDown, ChevronUp, Download, FileText, PieChart, Trash2, Edit, CheckCircle, Copy, X } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';

const NIVELES = ['1° Medio', '2° Medio', '3° Medio', '4° Medio'];

interface Teacher { id: string; name: string; username: string; password?: string; }
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
      // 1. Fetch Students
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

      // 2. Fetch History (Sessions and Records)
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
  
  // Nivel Configuration states
  const [editingCalendar, setEditingCalendar] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  
  // Workshop Creation
  const [creatingWorkshop, setCreatingWorkshop] = useState(false);
  
  // Docentes Creation
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherUsername, setNewTeacherUsername] = useState('');
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMassUpdateModal, setShowMassUpdateModal] = useState(false);
  const [genericPassword, setGenericPassword] = useState('');
  const [isMassUpdating, setIsMassUpdating] = useState(false);
  
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [editTeacherName, setEditTeacherName] = useState('');
  const [editTeacherUsername, setEditTeacherUsername] = useState('');
  const [editTeacherPassword, setEditTeacherPassword] = useState('');
  const [isUpdatingTeacher, setIsUpdatingTeacher] = useState(false);

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setIsUpdatingTeacher(true);
    try {
      const { data, error } = await supabase.functions.invoke('update_teacher', {
        body: { id: editingTeacher.id, username: editTeacherUsername, password: editTeacherPassword, name: editTeacherName }
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      alert('Docente actualizado exitosamente.');
      setEditingTeacher(null);
      fetchTeachers();
    } catch (e: any) {
      alert('Error al actualizar: ' + e.message);
    } finally {
      setIsUpdatingTeacher(false);
    }
  };

  const handleMassUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genericPassword) return;
    if (!window.confirm(`¿Estás seguro de cambiar la clave de TODOS los docentes a "${genericPassword}"? Esta acción no se puede deshacer.`)) return;
    
    setIsMassUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke('mass_update_teacher_passwords', {
        body: { generic_password: genericPassword }
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      alert(`Claves actualizadas exitosamente para ${data.count} docentes.`);
      setShowMassUpdateModal(false);
      setGenericPassword('');
      fetchTeachers();
    } catch (e: any) {
      alert('Error al actualizar claves: ' + e.message);
    } finally {
      setIsMassUpdating(false);
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este docente? Se borrará su cuenta permanentemente.')) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete_teacher', {
        body: { id }
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      alert('Docente eliminado exitosamente.');
      fetchTeachers();
    } catch (e: any) {
      alert('Error al eliminar: ' + e.message);
    }
  };

  // Workshop Detail View (Admin Taking Over)
  const [selectedWorkshop, setSelectedWorkshop] = useState<any>(null);
  const [wsActiveTab, setWsActiveTab] = useState<'nomina' | 'historial' | 'tomar' | 'estadisticas'>('nomina');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [students, setStudents] = useState<Student[]>([]);
  const [observation, setObservation] = useState('');
  const [saved, setSaved] = useState(false);
  
  // Detalle expandido
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
    
    // Sincronizar estados de asistencia de los estudiantes
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
        // Update existing
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
        // Create new
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
    if (totalClasses === 0) return 0;

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
      headStyles: { fillColor: [14, 165, 233] }, // primary
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
      headStyles: { fillColor: [234, 179, 8] }, // accent
    });

    doc.save(`Reporte_Individual_${student.name.replace(/ /g, '_')}.pdf`);
  };

  const renderWorkshopDetail = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          className="btn-accent" 
          style={{ padding: '0.5rem', borderRadius: '50%' }}
          onClick={() => setSelectedWorkshop(null)}
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Panel de Taller: {selectedWorkshop.name}
          </h2>
          <p style={{ color: 'var(--color-text-light)' }}>
            Docente Titular: {selectedWorkshop.teacher} | Nivel: {activeTab}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '2rem', overflowX: 'auto' }}>
        <button 
          className={wsActiveTab === 'nomina' ? "btn-primary" : "btn-accent"} 
          style={{ padding: '0.5rem 1rem', background: wsActiveTab !== 'nomina' ? 'transparent' : '', color: wsActiveTab !== 'nomina' ? 'var(--color-text)' : '', whiteSpace: 'nowrap' }}
          onClick={() => setWsActiveTab('nomina')}
        >
          <Users size={18} /> Nómina ({students.length})
        </button>
        <button 
          className={wsActiveTab === 'historial' ? "btn-primary" : "btn-accent"} 
          style={{ padding: '0.5rem 1rem', background: wsActiveTab !== 'historial' ? 'transparent' : '', color: wsActiveTab !== 'historial' ? 'var(--color-text)' : '', whiteSpace: 'nowrap' }}
          onClick={() => setWsActiveTab('historial')}
        >
          <HistoryIcon size={18} /> Historial
        </button>
        <button 
          className={wsActiveTab === 'estadisticas' ? "btn-primary" : "btn-accent"} 
          style={{ padding: '0.5rem 1rem', background: wsActiveTab !== 'estadisticas' ? 'transparent' : '', color: wsActiveTab !== 'estadisticas' ? 'var(--color-text)' : '', whiteSpace: 'nowrap' }}
          onClick={() => setWsActiveTab('estadisticas')}
        >
          <PieChart size={18} /> Estadísticas y Reportes
        </button>
        <div style={{ width: '2px', backgroundColor: 'var(--color-border)', margin: '0 0.5rem' }}></div>
        <button 
          className={wsActiveTab === 'tomar' ? "btn-danger" : "btn-accent"} 
          style={{ padding: '0.5rem 1rem', background: wsActiveTab === 'tomar' ? 'var(--color-danger)' : 'transparent', color: wsActiveTab === 'tomar' ? '#fff' : 'var(--color-text)', whiteSpace: 'nowrap' }}
          onClick={() => setWsActiveTab('tomar')}
        >
          <Check size={18} /> Registrar Anomalía / Emergencia
        </button>
      </div>

      {wsActiveTab === 'nomina' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Estudiantes Inscritos ({students.length})</h3>
          </div>
          {students.length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>No hay estudiantes inscritos en este taller.</p>
          ) : (
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
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Registro Detallado de Asistencias del Taller</h3>
          {pastRecords.length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>No hay registros.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th>Fecha de Sesión</th>
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
                    } catch (e) {
                      console.error('Invalid date:', record.date);
                    }
                    const total = record.presentCount + record.absentCount;
                    const percent = total > 0 ? Math.round((record.presentCount / total) * 100) : 0;
                    const isExpanded = expandedDate === record.date;

                    return (
                      <React.Fragment key={record.date}>
                        <tr style={{ backgroundColor: isExpanded ? 'rgba(0,0,0,0.02)' : 'transparent', borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ fontWeight: 500, textTransform: 'capitalize', padding: '1rem' }}>{formattedDate}</td>
                          <td style={{ textAlign: 'center', padding: '1rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{record.presentCount}</span> / {total} 
                            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', marginLeft: '0.5rem' }}>({percent}%)</span>
                          </td>
                          <td style={{ color: 'var(--color-text-light)', padding: '1rem' }}>{record.observation || '-'}</td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                onClick={() => setExpandedDate(isExpanded ? null : record.date)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isExpanded ? 'var(--color-primary)' : 'transparent', color: isExpanded ? 'white' : 'var(--color-text)', border: '1px solid', borderColor: isExpanded ? 'var(--color-primary)' : 'var(--color-border)', padding: '0.25rem 0.75rem', fontSize: '0.875rem', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                {isExpanded ? <><ChevronUp size={16} /> Ocultar Lista</> : <><ChevronDown size={16} /> Ver Estudiantes</>}
                              </button>
                              <button onClick={() => handleEdit(record)} className="btn-accent" style={{ padding: '0.25rem 0.5rem', borderRadius: '4px' }}><Edit size={16} /></button>
                              <button onClick={() => deleteSession(record.id)} className="btn-accent" style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}>
                            <td colSpan={4} style={{ padding: '0', borderBottom: '2px solid var(--color-border)' }}>
                              <div style={{ padding: '1.5rem 3rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                {record.studentRecords.map(sr => (
                                  <div key={sr.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px dashed var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text)' }}>{sr.name}</span>
                                    <span className={`badge ${sr.status === 'present' ? 'badge-present' : 'badge-absent'}`} style={{ fontSize: '0.75rem' }}>
                                      {sr.status === 'present' ? 'Presente' : 'Ausente'}
                                    </span>
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
        <>
          <div className="card" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Rendimiento y Asistencia de Curso</h3>
              <p style={{ color: 'var(--color-text-light)', margin: 0 }}>Días lectivos registrados: <strong>{pastRecords.length}</strong> | Promedio general del curso: <strong>{calculateGlobalStats()}%</strong></p>
            </div>
            <button className="btn-primary" onClick={exportGlobalPDF}>
              <Download size={20} /> Exportar Reporte General (PDF)
            </button>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Desglose por Estudiante</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: '1rem', textAlign: 'left' }}>Estudiante</th>
                    <th style={{ padding: '1rem', textAlign: 'center' }}>Total Presente</th>
                    <th style={{ padding: '1rem', textAlign: 'center' }}>Total Ausente</th>
                    <th style={{ padding: '1rem', textAlign: 'center' }}>Asistencia (%)</th>
                    <th style={{ padding: '1rem', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => {
                    const stats = calculateStudentStats(student.id);
                    // Color code the percentage (Green > 75%, Yellow > 50%, Red < 50%)
                    const pctColor = stats.percentage >= 75 ? 'var(--color-success)' : stats.percentage >= 50 ? 'var(--color-accent)' : 'var(--color-danger)';
                    return (
                      <tr key={student.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>
                          {student.name}
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>RUT: {student.rut}</div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 600 }}>{stats.presences}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-light)' }}>{stats.absences}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-block', padding: '0.25rem 0.5rem', borderRadius: '4px', backgroundColor: `rgba(${pctColor === 'var(--color-success)' ? '16, 185, 129' : pctColor === 'var(--color-accent)' ? '234, 179, 8' : '239, 68, 68'}, 0.1)`, color: pctColor, fontWeight: 700 }}>
                            {stats.percentage}%
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button 
                            className="btn-accent"
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', background: 'transparent', border: '1px solid var(--color-border)' }}
                            onClick={() => exportIndividualPDF(student, stats)}
                          >
                            <FileText size={16} /> PDF Individual
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {wsActiveTab === 'tomar' && (
        <div style={{ border: '2px solid var(--color-danger)', borderRadius: 'var(--border-radius)', overflow: 'hidden' }}>
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderBottom: '1px solid var(--color-danger)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-danger)' }}>{editingSessionId ? 'Editando Registro de Anomalía' : 'Modo Administrador: Registro de Anomalía / Emergencia'}</h3>
                <p style={{ margin: 0, color: 'var(--color-text-light)', fontSize: '0.875rem' }}>Utilice esta función únicamente si el docente titular se encuentra ausente o hubo una falla sistémica.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={markAllPresent} className="btn-accent" style={{ backgroundColor: 'white', border: '1px solid var(--color-success)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={18} /> Todos Presentes
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ fontWeight: 500 }} htmlFor="dateSelectAdmin">Fecha:</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    id="dateSelectAdmin" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                    style={{ paddingLeft: '2.5rem', fontWeight: 600, border: '1px solid var(--color-danger)' }}
                  />
                  <CalendarIcon size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-danger)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
          <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-surface)' }}>
            <table style={{ marginBottom: '2rem', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Estudiante</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>RUT</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Asistencia</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{student.name}</td>
                    <td style={{ padding: '1rem', color: 'var(--color-text-light)' }}>{student.rut}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div className="toggle-group">
                          <button 
                            className={`toggle-btn ${student.status === 'present' ? 'active present' : ''}`}
                            onClick={() => toggleStatus(student.id, 'present')}
                          >
                            Presente
                          </button>
                          <button 
                            className={`toggle-btn ${student.status === 'absent' ? 'active absent' : ''}`}
                            onClick={() => toggleStatus(student.id, 'absent')}
                          >
                            Ausente
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Observaciones Administrativas</h3>
            <textarea 
              placeholder="Indique motivo por el cual la asistencia fue modificada o tomada por administración (Ej: Docente con licencia médica o error del sistema)."
              rows={3}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              style={{ marginBottom: '1.5rem', border: '1px solid var(--color-danger)' }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={handleSaveAttendance}
                style={{ padding: '1rem 2rem', fontSize: '1.125rem', backgroundColor: 'var(--color-danger)', color: 'white', border: 'none', borderRadius: 'var(--border-radius)', display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}
                disabled={saved}
              >
                {saved ? <><Check size={24} /> Guardando...</> : <><Save size={24} /> Forzar Registro de Asistencia</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderDocentesTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Directorio de Docentes</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="btn-danger" 
            onClick={() => setShowMassUpdateModal(true)}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 1rem', backgroundColor: 'var(--color-danger)', color: 'white', border: 'none', borderRadius: 'var(--border-radius)', cursor: 'pointer' }}
          >
            <Edit size={18} /> Cambio Masivo de Claves
          </button>
          <button 
            className="btn-accent" 
            onClick={() => setShowPasswordModal(true)}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', cursor: 'pointer', background: 'transparent' }}
          >
            <Users size={18} /> Ver Usuarios y Claves
          </button>
        </div>
      </div>
      
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: 'var(--color-bg)', border: 'none' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Añadir Nuevo Docente</h3>
        <form 
          style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }} 
          onSubmit={async (e) => {
            e.preventDefault();
            if (newTeacherName && newTeacherUsername && newTeacherPassword) {
              setIsCreatingTeacher(true);
              const { data, error } = await supabase.functions.invoke('create_teacher', {
                body: { username: newTeacherUsername, name: newTeacherName, password: newTeacherPassword }
              });
              setIsCreatingTeacher(false);
              if (error || data?.error) {
                alert('Error al crear docente: ' + (error?.message || data?.error));
              } else {
                fetchTeachers();
                setNewTeacherName(''); setNewTeacherUsername(''); setNewTeacherPassword('');
                alert('Docente creado exitosamente y cuenta de acceso habilitada.');
              }
            }
          }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre Completo</label>
            <input type="text" value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} required />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre de Usuario</label>
            <input type="text" value={newTeacherUsername} onChange={e => setNewTeacherUsername(e.target.value)} required placeholder="Ej: r.gonzalez" />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Clave de Acceso</label>
            <input type="text" value={newTeacherPassword} onChange={e => setNewTeacherPassword(e.target.value)} required placeholder="Ej: JEC2026!" />
          </div>
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 1.5rem' }} disabled={isCreatingTeacher}>
            {isCreatingTeacher ? 'Creando...' : 'Añadir Docente'}
          </button>
        </form>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Nombre Completo</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Usuario</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{t.name}</td>
                <td style={{ padding: '1rem', color: 'var(--color-text-light)' }}>{t.username}</td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      onClick={() => {
                        setEditingTeacher(t);
                        setEditTeacherName(t.name);
                        setEditTeacherUsername(t.username);
                        setEditTeacherPassword('');
                      }}
                      style={{ color: 'var(--color-primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                    >
                      Editar
                    </button>
                    <button 
                      onClick={() => handleDeleteTeacher(t.id)}
                      style={{ color: 'var(--color-danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPasswordModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Usuarios y Claves de Acceso</h3>
              <button onClick={() => setShowPasswordModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ marginBottom: '1.5rem', backgroundColor: 'rgba(14, 165, 233, 0.1)', padding: '1rem', borderRadius: 'var(--border-radius)', color: 'var(--color-primary)', fontSize: '0.875rem' }}>
              <strong>Nota:</strong> Solo se muestran las claves de los docentes creados recientemente. Las claves de usuarios antiguos están encriptadas de forma segura y no pueden ser visualizadas.
            </div>
            <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Usuario</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Clave</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 500 }}>{t.name}</td>
                      <td style={{ padding: '0.75rem' }}>{t.username}</td>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: t.password ? 'var(--color-text)' : 'var(--color-text-light)' }}>
                        {t.password || 'Oculta (Antigua)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn-primary" 
                onClick={() => {
                  const text = teachers.map(t => `${t.name} | Usuario: ${t.username} | Clave: ${t.password || 'Oculta (Antigua)'}`).join('\n');
                  navigator.clipboard.writeText(text);
                  alert('Lista copiada al portapapeles');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Copy size={18} /> Copiar Lista
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTeacher && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Editar Docente</h3>
              <button onClick={() => setEditingTeacher(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)' }}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdateTeacher} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre Completo</label>
                <input type="text" value={editTeacherName} onChange={e => setEditTeacherName(e.target.value)} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre de Usuario</label>
                <input type="text" value={editTeacherUsername} onChange={e => setEditTeacherUsername(e.target.value)} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nueva Clave de Acceso (Opcional)</label>
                <input type="text" value={editTeacherPassword} onChange={e => setEditTeacherPassword(e.target.value)} placeholder="Dejar en blanco para mantener la actual" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-accent" onClick={() => setEditingTeacher(null)} style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', background: 'transparent', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '0.75rem 1.5rem' }} disabled={isUpdatingTeacher}>
                  {isUpdatingTeacher ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMassUpdateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-danger)' }}>Cambio Masivo de Claves</h3>
              <button onClick={() => setShowMassUpdateModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)' }}>
                <X size={24} />
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem', color: 'var(--color-text-light)' }}>
              Al utilizar esta función, <strong>TODOS</strong> los docentes registrados tendrán exactamente la misma clave de acceso. Las claves anteriores dejarán de funcionar inmediatamente.
            </p>
            <form onSubmit={handleMassUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>Nueva Clave Genérica para Todos</label>
                <input type="text" value={genericPassword} onChange={e => setGenericPassword(e.target.value)} required placeholder="Ej: JEC2026_GEN" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn-accent" onClick={() => setShowMassUpdateModal(false)} style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', background: 'transparent', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-danger" style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--color-danger)', color: 'white', border: 'none', borderRadius: 'var(--border-radius)', cursor: 'pointer' }} disabled={isMassUpdating}>
                  {isMassUpdating ? 'Procesando...' : 'Aplicar a Todos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  const renderLevelTab = (nivel: string) => (
    <div>
      <div className="card" style={{ marginBottom: '2rem', borderTop: '4px solid var(--color-accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={20} className="text-accent" />
              Horario Base del Nivel
            </h2>
            <p style={{ color: 'var(--color-text-light)', marginTop: '0.25rem' }}>Cursos: {nivel}.</p>
          </div>
          <button 
            className="btn-accent" 
            onClick={() => setEditingCalendar(!editingCalendar)}
          >
            {editingCalendar ? 'Cerrar Calendario' : 'Editar Calendario 2026'}
          </button>
        </div>

        {editingCalendar && (
          <div style={{ marginTop: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Selecciona los días de clase:</h3>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', display: 'inline-block', backgroundColor: 'var(--color-surface)' }}>
                <DayPicker
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={setSelectedDates as any}
                  defaultMonth={new Date(2026, 2)}
                  fromYear={2026}
                  toYear={2026}
                />
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-primary)' }}>
                Días seleccionados: {selectedDates.length}
              </p>
            </div>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Rango de Horario (Global):</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Hora de Inicio</label>
                  <input type="time" defaultValue="14:00" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Hora de Término</label>
                  <input type="time" defaultValue="15:30" />
                </div>
              </div>
              <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={() => setEditingCalendar(false)}>
                Guardar Horario General
              </button>
            </div>
          </div>
        )}
      </div>

      {creatingWorkshop && (
        <div className="card" style={{ marginBottom: '2rem', backgroundColor: 'rgba(14, 165, 233, 0.05)', border: '1px solid var(--color-primary)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Crear Taller en {nivel}</h2>
          <form 
            style={{ display: 'grid', gap: '1.5rem' }}
            onSubmit={(e) => { e.preventDefault(); setCreatingWorkshop(false); }}
          >
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 300px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nombre del Taller</label>
                <input type="text" placeholder="Ej: Voleibol Avanzado" required />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Docente Asignado</label>
                <select required>
                  <option value="">Seleccione un docente...</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Lista de Estudiantes (Curso)</label>
              <div style={{ border: '2px dashed var(--color-primary)', borderRadius: 'var(--border-radius)', padding: '2rem', textAlign: 'center', backgroundColor: 'var(--color-surface)', cursor: 'pointer' }}>
                <UploadCloud size={32} style={{ color: 'var(--color-primary)', margin: '0 auto 0.5rem' }} />
                <p style={{ margin: 0, fontWeight: 500 }}>Arrastra tu archivo Excel/CSV aquí</p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-light)' }}>para cargar la nómina de estudiantes</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button type="button" className="toggle-btn" style={{ border: '1px solid var(--color-border)' }} onClick={() => setCreatingWorkshop(false)}>Cancelar</button>
              <button type="submit" className="btn-primary">Guardar Taller</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Talleres Activos en {nivel}</h2>
        {!creatingWorkshop && (
          <button className="btn-primary" onClick={() => setCreatingWorkshop(true)}>
            <Plus size={18} /> Nuevo Taller
          </button>
        )}
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Nombre Taller</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Asignar Docente</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Horario</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Inscritos</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {workshops.filter(w => w.target_level === nivel).map(w => (
              <tr key={w.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{w.title}</td>
                <td style={{ padding: '1rem' }}>
                  <select 
                    value={w.teacher_id || ''} 
                    onChange={async (e) => {
                      const newTeacherId = e.target.value;
                      const { error } = await supabase.from('workshops').update({ teacher_id: newTeacherId || null }).eq('id', w.id);
                      if (!error) fetchWorkshops();
                    }}
                    style={{ padding: '0.25rem', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                  >
                    <option value="">Sin Asignar</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '1rem', color: 'var(--color-text-light)' }}>{w.schedule || 'Por definir'}</td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>{w.enrolled_count}</td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button 
                    className="btn-accent" 
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', marginRight: '0.5rem' }}
                    onClick={() => {
                      setSelectedWorkshop({ id: w.id, name: w.title, teacher: w.teachers?.name || 'Sin Asignar' });
                      fetchWorkshopStudents(w.id);
                    }}
                  >
                    Ver Detalle y Asistencia
                  </button>
                </td>
              </tr>
            ))}
            {workshops.filter(w => w.target_level === nivel).length === 0 && (
              <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>No hay talleres registrados en este nivel.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="container">
      {selectedWorkshop ? renderWorkshopDetail() : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <GraduationCap size={28} color="var(--color-primary)" />
              Panel de Administración
            </h1>
          </div>

          <div className="card" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', overflowX: 'auto' }}>
              {NIVELES.map(nivel => (
                <button 
                  key={nivel}
                  className={activeTab === nivel ? "btn-primary" : "btn-accent"} 
                  style={{ padding: '0.5rem 1rem', background: activeTab !== nivel ? 'transparent' : '', color: activeTab !== nivel ? 'var(--color-text)' : '', whiteSpace: 'nowrap' }}
                  onClick={() => { setActiveTab(nivel); setCreatingWorkshop(false); setEditingCalendar(false); }}
                >
                  {nivel}
                </button>
              ))}
              <div style={{ width: '2px', backgroundColor: 'var(--color-border)', margin: '0 0.5rem' }}></div>
              <button 
                className={activeTab === 'Docentes' ? "btn-primary" : "btn-accent"} 
                style={{ padding: '0.5rem 1rem', background: activeTab !== 'Docentes' ? 'transparent' : '', color: activeTab !== 'Docentes' ? 'var(--color-text)' : '' }}
                onClick={() => setActiveTab('Docentes')}
              >
                <Users size={16} /> Directorio Docentes
              </button>
            </div>

            <div style={{ paddingTop: '2rem' }}>
              {activeTab === 'Docentes' ? renderDocentesTab() : renderLevelTab(activeTab)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
