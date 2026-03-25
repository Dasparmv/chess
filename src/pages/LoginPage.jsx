import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'No fue posible iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Ajedrez BN</h1>

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
            required
            value={form.password}
            onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
          />
        </label>

        {error ? <div className="form-error">{error}</div> : null}

        <button className="button button-primary" disabled={submitting} type="submit">
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="auth-footer">
          ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
        </p>
      </form>
    </div>
  );
}
