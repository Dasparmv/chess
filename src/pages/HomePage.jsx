import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="auth-shell">
      <section className="hero-card">
        <div>
          <span className="eyebrow">Ajedrez online</span>
          <h1>Juega con tus amigos en partidas privadas y rápidas.</h1>
          <p>
            Crea tu cuenta, abre una partida, comparte el enlace y empieza a jugar en tiempo real.
          </p>
        </div>

        <div className="hero-actions">
          <Link to="/register" className="button button-primary">
            Crear cuenta
          </Link>
          <Link to="/login" className="button button-secondary">
            Iniciar sesión
          </Link>
        </div>

        <ul className="feature-list">
          <li>Invitación por enlace o username</li>
          <li>Reloj con tiempo base e incremento</li>
          <li>Historial, ranking y marcador entre rivales</li>
        </ul>
      </section>
    </div>
  );
}
