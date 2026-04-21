import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import AdminDashboard from './pages/AdminDashboard';
import './index.css';

function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === '/login' || location.pathname === '/';

  const handleLogout = () => {
    navigate('/login');
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div>
          <div className="navbar-brand">
            <span>JEC</span> Asistencia
          </div>
          <div style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Portal Educativo
          </div>
        </div>
        
        {!isLoginPage && (
          <button 
            className="btn-accent" 
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            onClick={handleLogout}
          >
            <LogOut size={16} /> Cerrar Sesión
          </button>
        )}
      </nav>
      
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <MainLayout />
    </Router>
  );
}

export default App;
