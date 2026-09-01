import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);
const PROFILE_FIELDS = 'id, email, name, role, level, active, created_at';

const fetchProfile = async (userId) => supabase
  .from('profiles')
  .select(PROFILE_FIELDS)
  .eq('id', userId)
  .single();

const fetchUser = async (userId) => {
  const { data: profile, error: profileError } = await fetchProfile(userId);
  if (profileError || !profile) return { profile: null, error: profileError };

  const { data: onboarding, error: onboardingError } = await supabase
    .from('onboarding')
    .select('classification, experience_score, completed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (onboardingError) return { profile: null, error: onboardingError };
  return {
    profile: {
      ...profile,
      onboardingCompleted: Boolean(onboarding?.completed_at),
      onboarding: onboarding || null,
    },
    error: null,
  };
};

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

      const { profile, error } = await fetchUser(session.user.id);
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

    const { profile, error: profileError } = await fetchUser(data.user.id);
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

    const { profile, error: profileError } = await fetchUser(data.user.id);
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
    if (!error) setUser(current => ({ ...current, ...data }));
    return { user: data, error: error?.message };
  };

  const updatePassword = async (password) => {
    if (!supabase) return { error: 'Supabase no está configurado.' };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message };
  };

  const completeOnboarding = async (answers) => {
    if (!supabase || !user) return { error: 'No se pudo guardar el onboarding.' };

    const classification = answers.worked_setter || answers.worked_closer || answers.sold_by_chat
      ? 'experienced'
      : 'starter';
    const experienceScore =
      Number(answers.worked_digital_business)
      + Number(answers.knows_lead)
      + Number(answers.crm !== 'none')
      + (Number(answers.worked_setter) * 2)
      + (Number(answers.worked_closer) * 2)
      + Number(answers.participated_launch)
      + (Number(answers.sold_by_chat) * 2);

    const payload = {
      user_id: user.id,
      ...answers,
      crm_other: answers.crm === 'other' ? answers.crm_other.trim() : null,
      goal_other: answers.primary_goal === 'other' ? answers.goal_other.trim() : null,
      classification,
      experience_score: experienceScore,
      completed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('onboarding')
      .upsert(payload, { onConflict: 'user_id' })
      .select('classification, experience_score, completed_at')
      .single();

    if (error) return { error: error.message };
    setUser(current => ({ ...current, onboardingCompleted: true, onboarding: data }));
    return { onboarding: data };
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, updatePassword, completeOnboarding, loading, authError }}>
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
