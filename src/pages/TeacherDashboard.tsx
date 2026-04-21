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
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [students, setStudents] = useState<Student[]>([]);
  const [observation, setObservation] = useState('');
  const [saved, setSaved] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [pastRecords, setPastRecords] = useState<AttendanceRecord[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
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
      setSaved(false);
    } catch (error: any) {
      alert('Error: ' + error.message);
      setSaved(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
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

  if (loading) return <div className="container" style={{ textAlign: 'center', padding: '5rem' }}><Loader2 className="animate-spin" /> Cargando...</div>;

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem' }}>{selectedWorkshop?.title}</h1>
        <p style={{ color: 'var(--color-text-light)' }}>{students.length} Estudiantes | {selectedWorkshop?.schedule}</p>
      </div>
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '2rem' }}>
        <button className={activeTab === 'tomar' ? "btn-primary" : "btn-accent"} style={{ background: activeTab !== 'tomar' ? 'transparent' : '' }} onClick={() => setActiveTab('tomar')}>Asistencia</button>
        <button className={activeTab === 'historial' ? "btn-primary" : "btn-accent"} style={{ background: activeTab !== 'historial' ? 'transparent' : '' }} onClick={() => setActiveTab('historial')}>Historial</button>
      </div>
      {activeTab === 'tomar' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2>{editingSessionId ? 'Editando Sesión' : 'Nueva Sesión'}</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={markAllPresent} className="btn-accent">Marcar Todos</button>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
          </div>
          <table style={{ marginBottom: '1.5rem' }}>
            <thead><tr><th>Nombre</th><th>Asistencia</th></tr></thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <div className="toggle-group">
                      <button className={`toggle-btn ${s.status === 'present' ? 'active present' : ''}`} onClick={() => toggleStatus(s.id, 'present')}>Presente</button>
                      <button className={`toggle-btn ${s.status === 'absent' ? 'active absent' : ''}`} onClick={() => toggleStatus(s.id, 'absent')}>Ausente</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <textarea placeholder="Notas de la sesión..." value={observation} onChange={(e) => setObservation(e.target.value)} style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            {editingSessionId && <button onClick={() => { setEditingSessionId(null); setStudents(s => s.map(st => ({ ...st, status: null }))); setObservation(''); }}>Cancelar</button>}
            <button className="btn-primary" onClick={handleSave} disabled={saved}>{saved ? 'Guardando...' : 'Guardar Asistencia'}</button>
          </div>
        </div>
      )}
      {activeTab === 'historial' && (
        <div className="card">
          {pastRecords.length === 0 ? <p>No hay registros.</p> : (
            <table>
              <thead><tr><th>Fecha</th><th style={{ textAlign: 'center' }}>Presentes</th><th>Acciones</th></tr></thead>
              <tbody>
                {pastRecords.map(r => (
                  <tr key={r.id}>
                    <td style={{ textTransform: 'capitalize' }}>{format(new Date(r.date + 'T00:00:00'), 'EEEE dd MMM', { locale: es })}</td>
                    <td style={{ textAlign: 'center' }}>{r.presentCount} / {r.presentCount + r.absentCount}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-accent" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleEdit(r)}><Edit size={16}/></button>
                      <button className="btn-accent" style={{ padding: '0.25rem 0.5rem', color: 'var(--color-danger)' }} onClick={() => handleDelete(r.id)}><Trash2 size={16}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
