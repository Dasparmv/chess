import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="auth-shell">
      <section className="hero-card hero-card-compact">
        <h1>Ajedrez BN</h1>

        <div className="hero-actions">
          <Link to="/register" className="button button-primary">
            Crear cuenta
          </Link>
          <Link to="/login" className="button button-secondary">
            Iniciar sesión
          </Link>
        </div>
      </section>
    </div>
  );
}
