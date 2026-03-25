import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AppShell({ children }) {
  const { profile, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/dashboard" className="brand">
          Chess Friends
        </Link>

        <nav className="topbar-nav">
          <NavLink to="/dashboard" className="nav-link">
            Inicio
          </NavLink>
          <span className="profile-chip">
            {profile?.display_name || profile?.username || 'Jugador'}
          </span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => logout().catch((error) => alert(error.message))}
          >
            Salir
          </button>
        </nav>
      </header>

      <main className="page-container">{children}</main>
    </div>
  );
}
