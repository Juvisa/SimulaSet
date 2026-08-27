import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);
const PROFILE_FIELDS = 'id, email, name, role, level, active, created_at';

const fetchProfile = async (userId) => supabase
  .from('profiles')
  .select(PROFILE_FIELDS)
  .eq('id', userId)
  .single();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [authError, setAuthError] = useState(
    supabaseConfigured ? '' : 'Supabase no está configurado. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.'
  );

  useEffect(() => {
    if (!supabaseConfigured) {
      return undefined;
    }

    let mounted = true;

    const applySession = async (session) => {
      if (!session?.user) {
        if (mounted) setUser(null);
        return;
      }

      const { data: profile, error } = await fetchProfile(session.user.id);
      if (error || !profile?.active) {
        await supabase.auth.signOut();
        if (mounted) setUser(null);
        return;
      }
      if (mounted) setUser(profile);
    };

    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (error && mounted) setAuthError(error.message);
        await applySession(data.session);
      })
      .catch(() => {
        if (mounted) setAuthError('No se pudo conectar con Supabase. Verifica la configuración y la conexión.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(async () => {
        await applySession(session);
        if (mounted) setLoading(false);
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    if (!supabase) return { error: 'Supabase no está configurado.' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    const { data: profile, error: profileError } = await fetchProfile(data.user.id);
    if (profileError || !profile) {
      await supabase.auth.signOut();
      return { error: 'No se pudo cargar el perfil del usuario.' };
    }
    if (!profile.active) {
      await supabase.auth.signOut();
      return { error: 'Tu cuenta está desactivada.' };
    }
    setUser(profile);
    return { user: profile };
  };

  const register = async (name, email, password) => {
    if (!supabase) return { error: 'Supabase no está configurado.' };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error: error.message };
    if (!data.session) return { needsConfirmation: true };

    const { data: profile, error: profileError } = await fetchProfile(data.user.id);
    if (profileError || !profile) return { error: 'La cuenta se creó, pero no se pudo cargar el perfil.' };
    setUser(profile);
    return { user: profile };
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateUser = async ({ name }) => {
    if (!supabase) return { error: 'Supabase no está configurado.' };
    const { data, error } = await supabase.from('profiles')
      .update({ name }).eq('id', user.id).select(PROFILE_FIELDS).single();
    if (!error) setUser(data);
    return { user: data, error: error?.message };
  };

  const updatePassword = async (password) => {
    if (!supabase) return { error: 'Supabase no está configurado.' };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message };
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, updatePassword, loading, authError }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
