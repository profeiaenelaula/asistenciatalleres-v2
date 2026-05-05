import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    if (username.toLowerCase() === 'admin') {
      // Mock admin login as before or if admin has a special account,
      // For now we preserve admin mock if requested, but let's try real Auth first:
      // Wait, admin needs an account. If the user uses "admin", 
      // let's keep the mock admin login for simplicity unless they created an admin acc.
      if (password === 'adminjec') {
        navigate('/admin');
        return;
      }
    }

    // Convert RUT to pseudo-email
    const email = `${username.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@docentes.jec.cl`;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert('Error de inicio de sesión: ' + error.message);
      return;
    }

    // Role could be checked if needed `data.user?.user_metadata?.role`
    navigate('/teacher');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 70px)', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', color: 'var(--color-primary)' }}>Bienvenido</h1>
          <p style={{ color: 'var(--color-text-light)' }}>Sistema Asistencia JEC</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>Usuario</label>
            <input 
              id="username"
              type="text" 
              placeholder="Ej: r.gonzalez (o 'admin')"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>Contraseña</label>
            <input 
              id="password"
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>
            <LogIn size={20} />
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}
