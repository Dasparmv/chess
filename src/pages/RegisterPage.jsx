import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: '',
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      await register(form);
      setMessage('Cuenta creada. Si Supabase tiene confirmación de email activa, revisa tu correo antes de entrar.');
      navigate('/login');
    } catch (err) {
      setError(err.message || 'No fue posible crear la cuenta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Crear cuenta</h1>

        <label>
          Nombre visible
          <input
            type="text"
            required
            value={form.displayName}
            onChange={(e) => setForm((current) => ({ ...current, displayName: e.target.value }))}
          />
        </label>

        <label>
          Username
          <input
            type="text"
            pattern="[a-zA-Z0-9_]{3,20}"
            title="Usa entre 3 y 20 caracteres: letras, números o guion bajo"
            required
            value={form.username}
            onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            minLength="6"
            required
            value={form.password}
            onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
          />
        </label>

        {error ? <div className="form-error">{error}</div> : null}
        {message ? <div className="form-message">{message}</div> : null}

        <button className="button button-primary" disabled={submitting} type="submit">
          {submitting ? 'Creando...' : 'Crear cuenta'}
        </button>

        <p className="auth-footer">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </form>
    </div>
  );
}
