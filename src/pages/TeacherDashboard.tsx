import React, { useState, useEffect } from 'react';
import { Save, Check, Users, Calendar as CalendarIcon, History, Loader2, ChevronDown, ChevronUp, Trash2, Edit, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../lib/supabase';

interface Student {
  id: string;
  name: string;
  rut: string;
  status: 'present' | 'absent' | null;
  enrollment_id: string;
}

interface Workshop {
  id: string;
  title: string;
  schedule: string;
  target_level: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  presentCount: number;
  absentCount: number;
  observation: string;
  studentRecords: { id: string, name: string, rut: string, status: 'present' | 'absent' }[];
}

export default function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState<'tomar' | 'historial'>('tomar');
  const [loading, setLoading] = useState(true);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);
  
  // Tomar asistencia state
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [students, setStudents] = useState<Student[]>([]);
  const [observation, setObservation] = useState('');
  const [saved, setSaved] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  
  // Historial state
  const [pastRecords, setPastRecords] = useState<AttendanceRecord[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      // FIX: allow mock session for testing or if logged in via local mock
      if (!user) {
        // If no user is found, we might be in a mock environment or session expired
        console.warn('No active Supabase session found.');
        // For production, we should redirect to login. 
        // But let's check if we have a mock flag or just redirect safely:
        window.location.href = '/login';
        return;
      }

      const { data: workshopsData, error: wsError } = await supabase
        .from('workshops')
        .select('id, title, schedule, target_level')
        .eq('teacher_id', user.id);

      if (wsError) throw wsError;

      if (workshopsData && workshopsData.length > 0) {
        setWorkshops(workshopsData);
        setSelectedWorkshop(workshopsData[0]);
        await fetchWorkshopData(workshopsData[0].id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      setLoading(false);
    }
  };

  const fetchWorkshopData = async (workshopId: string) => {
    try {
      const { data: enrollments, error: enError } = await supabase
        .from('enrollments')
        .select('id, student_name, student_rut')
        .eq('workshop_id', workshopId);

      if (enError) throw enError;

      const formattedStudents: Student[] = (enrollments || []).map(e => ({
        id: e.id,
        name: e.student_name,
        rut: e.student_rut,
        status: null,
        enrollment_id: e.id
      }));

      setStudents(formattedStudents);
      await fetchHistory(workshopId);
      setLoading(false);
    } catch (error) {
      console.error('Error loading workshop data:', error);
      setLoading(false);
    }
  };

  const fetchHistory = async (workshopId: string) => {
    const { data: sessions, error } = await supabase
      .from('attendance_sessions')
      .select(`
        id, 
        date, 
        observation,
        attendance_records (enrollment_id, student_name, student_rut, status)
      `)
      .eq('workshop_id', workshopId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching history:', error);
      return;
    }

    const formattedHistory: AttendanceRecord[] = (sessions || []).map(s => {
      const records = (s.attendance_records as any[]) || [];
      return {
        id: s.id,
        date: s.date,
        observation: s.observation || '',
        presentCount: records.filter(r => r.status === 'present').length,
        absentCount: records.filter(r => r.status === 'absent').length,
        studentRecords: records.map(r => ({
          id: r.enrollment_id,
          name: r.student_name,
          rut: r.student_rut,
          status: r.status
        }))
      };
    });

    setPastRecords(formattedHistory);
  };

  const markAllPresent = () => {
    setStudents(prev => prev.map(s => ({ ...s, status: 'present' })));
  };

  const toggleStatus = (id: string, newStatus: 'present' | 'absent') => {
    setStudents(prev => 
      prev.map(s => s.id === id ? { ...s, status: newStatus } : s)
    );
  };

  const handleSave = async () => {
    if (!selectedWorkshop) return;
    if (students.some(s => s.status === null)) {
      alert('Por favor, marca la asistencia de todos los estudiantes.');
      return;
    }

    const confirmSave = window.confirm(`¿Está seguro que desea guardar la asistencia del día ${selectedDate}?`);
    if (!confirmSave) return;
    
    setSaved(true);
    try {
      if (editingSessionId) {
        const { error: sessionError } = await supabase
          .from('attendance_sessions')
          .update({ date: selectedDate, observation })
          .eq('id', editingSessionId);
        if (sessionError) throw sessionError;

        await supabase.from('attendance_records').delete().eq('session_id', editingSessionId);
        
        const recordsToInsert = students.map(s => ({
          session_id: editingSessionId,
          enrollment_id: s.enrollment_id,
          student_name: s.name,
          student_rut: s.rut,
          status: s.status
        }));
        await supabase.from('attendance_records').insert(recordsToInsert);

        alert('Registro actualizado con éxito.');
        setEditingSessionId(null);
      } else {
        const { data: session, error: sessionError } = await supabase
          .from('attendance_sessions')
          .insert({ workshop_id: selectedWorkshop.id, date: selectedDate, observation })
          .select().single();
        if (sessionError) throw sessionError;

        const recordsToInsert = students.map(s => ({
          session_id: session.id,
          enrollment_id: s.enrollment_id,
          student_name: s.name,
          student_rut: s.rut,
          status: s.status
        }));
        await supabase.from('attendance_records').insert(recordsToInsert);
        alert('Asistencia guardada con éxito.');
      }
      
      await fetchHistory(selectedWorkshop.id);
      setStudents(prev => prev.map(s => ({ ...s, status: null })));
      setObservation('');
      setActiveTab('historial');
      setSaved(false);
    } catch (error: any) {
      alert('Error: ' + error.message);
      setSaved(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este registro de asistencia?')) return;
    try {
      const { error } = await supabase.from('attendance_sessions').delete().eq('id', sessionId);
      if (error) throw error;
      if (selectedWorkshop) fetchHistory(selectedWorkshop.id);
      alert('Registro eliminado.');
    } catch (error: any) {
      alert('Error al eliminar: ' + error.message);
    }
  };

  const handleEdit = (record: AttendanceRecord) => {
    setEditingSessionId(record.id);
    setSelectedDate(record.date);
    setObservation(record.observation);
    
    const updatedStudents = students.map(s => {
      const past = record.studentRecords.find(psr => psr.id === s.enrollment_id);
      return { ...s, status: past ? past.status : null };
    });
    setStudents(updatedStudents);
    setActiveTab('tomar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: '1rem' }}>
        <Loader2 className="animate-spin" style={{ color: 'var(--color-primary)' }} size={48} />
        <p style={{ color: 'var(--color-text-light)' }}>Cargando información del taller...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <h1 style={{ fontSize: '1.875rem', margin: 0 }}>{selectedWorkshop?.title}</h1>
            {workshops.length > 1 && (
              <select style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                value={selectedWorkshop?.id}
                onChange={(e) => {
                  const ws = workshops.find(w => w.id === e.target.value);
                  if (ws) { setSelectedWorkshop(ws); fetchWorkshopData(ws.id); }
                }}
              >
                {workshops.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
            )}
          </div>
          <p style={{ color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> {students.length} Estudiantes</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CalendarIcon size={16} /> {selectedWorkshop?.schedule}</span>
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <button className={activeTab === 'tomar' ? "btn-primary" : "btn-accent"} style={{ padding: '0.5rem 1rem', background: activeTab !== 'tomar' ? 'transparent' : '', color: activeTab !== 'tomar' ? 'var(--color-text)' : '' }} onClick={() => setActiveTab('tomar')}>
          <Check size={18} /> {editingSessionId ? 'Editando Asistencia' : 'Tomar Asistencia'}
        </button>
        <button className={activeTab === 'historial' ? "btn-primary" : "btn-accent"} style={{ padding: '0.5rem 1rem', background: activeTab !== 'historial' ? 'transparent' : '', color: activeTab !== 'historial' ? 'var(--color-text)' : '' }} onClick={() => setActiveTab('historial')}>
          <History size={18} /> Historial
        </button>
      </div>

      {activeTab === 'tomar' && (
        <>
          <div className="card" style={{ marginBottom: '2rem', borderTop: '4px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{editingSessionId ? 'Editando Registro' : 'Nueva Sesión'}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={markAllPresent} className="btn-accent" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--color-success)', color: 'var(--color-success)' }}>
                  <CheckCircle size={18} /> Todos Presentes
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor="dateSelect" style={{ fontWeight: 500, color: 'var(--color-text-light)' }}>Fecha:</label>
                  <input id="dateSelect" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '2rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Estudiante</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>RUT</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{student.name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-light)' }}>{student.rut}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
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
          </div>

          <div className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Observaciones</h2>
            <textarea placeholder="Observaciones generales de la sesión..." rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            {editingSessionId && <button className="btn-accent" onClick={() => { setEditingSessionId(null); setStudents(s => s.map(st => ({ ...st, status: null }))); setObservation(''); }} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px' }}>Cancelar Edición</button>}
            <button className="btn-primary" onClick={handleSave} style={{ padding: '1rem 2rem' }} disabled={saved}>
              {saved ? <><Loader2 className="animate-spin" size={24} /> Guardando...</> : <><Save size={24} /> {editingSessionId ? 'Actualizar Registro' : 'Finalizar y Guardar'}</>}
            </button>
          </div>
        </>
      )}

      {activeTab === 'historial' && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Registro de Asistencias Anteriores</h2>
          {pastRecords.length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: '2rem' }}>No hay registros anteriores.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Fecha</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Asistencia</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Observación</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
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
                    const isExpanded = expandedRowId === record.id;
                    const totalCount = record.presentCount + record.absentCount;
                    return (
                      <React.Fragment key={record.id}>
                        <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--color-border)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 500, textTransform: 'capitalize' }}>{formattedDate}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{record.presentCount}</span> / {totalCount}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-light)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.observation || '-'}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button onClick={() => setExpandedRowId(isExpanded ? null : record.id)} style={{ background: 'transparent', border: '1px solid var(--color-border)', padding: '0.25rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {isExpanded ? <><ChevronUp size={16} /> Cerrar</> : <><ChevronDown size={16} /> Detalle</>}
                              </button>
                              <button onClick={() => handleEdit(record)} style={{ background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}><Edit size={16} /></button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--color-border)' }}>
                            <td colSpan={4} style={{ padding: '1rem 3rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                {record.studentRecords.map(sr => (
                                  <div key={sr.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem', borderBottom: '1px dashed var(--color-border)' }}>
                                    <span style={{ fontSize: '0.875rem' }}>{sr.name}</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: sr.status === 'present' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                      {sr.status === 'present' ? 'PRESENTE' : 'AUSENTE'}
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
    </div>
  );
}
