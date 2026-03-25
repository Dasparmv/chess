import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
}

function buildFallbackProfile(user) {
  const rawUsername = user?.user_metadata?.username || user?.email?.split('@')[0] || 'jugador';
  const username = normalizeUsername(rawUsername) || `jugador${String(user?.id || '').replace(/-/g, '').slice(0, 6)}`;
  const displayName = user?.user_metadata?.display_name || username;

  return {
    id: user.id,
    username,
    display_name: displayName,
    avatar_url: user?.user_metadata?.avatar_url || null,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (currentUser) => {
    if (!currentUser?.id) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (data) {
      setProfile(data);
      return data;
    }

    const fallbackProfile = buildFallbackProfile(currentUser);

    const { data: createdProfile, error: insertError } = await supabase
      .from('profiles')
      .upsert(fallbackProfile, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (!insertError && createdProfile) {
      setProfile(createdProfile);
      return createdProfile;
    }

    if (error) {
      console.warn('No fue posible cargar el perfil:', error.message);
    }
    if (insertError) {
      console.warn('No fue posible crear el perfil automáticamente:', insertError.message);
    }

    setProfile(fallbackProfile);
    return fallbackProfile;
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(initialSession);

        if (initialSession?.user) {
          await loadProfile(initialSession.user);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.warn('No fue posible restaurar la sesión:', error?.message || error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);

      window.setTimeout(async () => {
        if (!mounted) return;

        try {
          if (nextSession?.user) {
            await loadProfile(nextSession.user);
          } else {
            setProfile(null);
          }
        } catch (error) {
          console.warn('No fue posible actualizar la sesión:', error?.message || error);
        } finally {
          if (mounted) setLoading(false);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const register = async ({ email, password, username, displayName }) => {
    const normalizedUsername = normalizeUsername(username);

    const { data: existingUser, error: usernameLookupError } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (usernameLookupError) throw usernameLookupError;
    if (existingUser) {
      throw new Error('Ese username ya está en uso.');
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: normalizedUsername,
          display_name: displayName.trim(),
        },
      },
    });

    if (error) throw error;
  };

  const login = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      loading,
      login,
      register,
      logout,
      refreshProfile: async () => {
        if (session?.user) {
          await loadProfile(session.user);
        }
      },
    }),
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
