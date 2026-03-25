import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

function buildPublicAvatarUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data?.publicUrl || '';
}

export default function AppShell({ children }) {
  const { profile, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/dashboard" className="brand">
          Ajedrez BN
        </Link>

        <nav className="topbar-nav">
          <NavLink to="/dashboard" className="nav-link">
            Inicio
          </NavLink>
          <span className="profile-chip">
            <Avatar name={profile?.display_name || profile?.username} url={buildPublicAvatarUrl(profile?.avatar_url)} size="sm" />
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
