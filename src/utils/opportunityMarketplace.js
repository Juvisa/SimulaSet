import { supabase } from '../lib/supabase';
import { MISSION_01 } from '../data/missions';

const VACANCY_SELECT = 'id, company_name, industry_niche, role_needed, offer_ticket_range, compensation_type, compensation_details, min_set_score, spots, status, contact_link, created_at';
const PROFILE_SELECT = 'user_id, role_type, primary_niche, ticket_experience, monthly_lead_capacity, bio_pitch, verified_status, created_at';
const MATCH_SELECT = 'id, vacancy_id, match_score, status, company_notes, created_at';

export const getOpenVacancies = async () => {
  const { data, error } = await supabase
    .from('company_vacancies')
    .select(VACANCY_SELECT)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  return { vacancies: data || [], error: error?.message };
};

export const getMyCommercialProfile = async (userId) => {
  const { data, error } = await supabase
    .from('commercial_profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  return { profile: data || null, error: error?.message };
};

export const upsertCommercialProfile = async ({ userId, roleType, primaryNiche, ticketExperience, monthlyLeadCapacity, bioPitch }) => {
  if (!primaryNiche?.trim()) return { profile: null, error: 'Indica tu nicho principal.' };

  const payload = {
    user_id: userId,
    role_type: roleType,
    primary_niche: primaryNiche.trim(),
    ticket_experience: ticketExperience?.trim() || null,
    monthly_lead_capacity: Number.isFinite(monthlyLeadCapacity) ? monthlyLeadCapacity : null,
    bio_pitch: bioPitch?.trim() || null,
  };

  const { data, error } = await supabase
    .from('commercial_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select(PROFILE_SELECT)
    .single();

  return { profile: data || null, error: error?.message };
};

export const getMyMatches = async (userId) => {
  const { data, error } = await supabase
    .from('talent_matches')
    .select(MATCH_SELECT)
    .eq('user_id', userId);

  return { matches: data || [], error: error?.message };
};

export const requestMatch = async ({ userId, vacancyId, matchScore }) => {
  const { data, error } = await supabase
    .from('talent_matches')
    .insert({ vacancy_id: vacancyId, user_id: userId, match_score: matchScore, status: 'matched' })
    .select(MATCH_SELECT)
    .single();

  return { match: data || null, error: error?.message };
};

export const updateMatchStatus = async ({ matchId, status, companyNotes }) => {
  const payload = { status };
  if (companyNotes !== undefined) payload.company_notes = companyNotes;

  const { data, error } = await supabase
    .from('talent_matches')
    .update(payload)
    .eq('id', matchId)
    .select(MATCH_SELECT)
    .single();

  return { match: data || null, error: error?.message };
};

export const getVacancyApplicants = async (vacancyId) => {
  const { data: matchRows, error } = await supabase
    .from('talent_matches')
    .select(`${MATCH_SELECT}, user_id, profiles(name)`)
    .eq('vacancy_id', vacancyId)
    .order('created_at', { ascending: false });

  if (error) return { applicants: [], error: error.message };
  if (!matchRows || matchRows.length === 0) return { applicants: [], error: undefined };

  const userIds = matchRows.map((m) => m.user_id);
  const { data: profilesData } = await supabase
    .from('commercial_profiles')
    .select(PROFILE_SELECT)
    .in('user_id', userIds);
  const profileByUser = Object.fromEntries((profilesData || []).map((p) => [p.user_id, p]));

  return {
    applicants: matchRows.map((m) => ({
      ...m,
      name: m.profiles?.name || 'Alumno DIGITAL SET',
      commercialProfile: profileByUser[m.user_id] || null,
    })),
    error: undefined,
  };
};

// Reporte técnico del setter: reutiliza la evaluación IA de "Caza Conversaciones"
// (mission_progress, MISSION_01) como fuente real de fortalezas/feedback cualitativo
// para el Centro de Auditoría Comercial. Admin puede leer mission_progress de
// cualquier usuario (RLS: user_id = auth.uid() or is_admin()).
export const getSetEvaluationSummary = async (userId) => {
  const { data, error } = await supabase
    .from('mission_progress')
    .select('responses')
    .eq('user_id', userId)
    .eq('mission_id', MISSION_01.id)
    .maybeSingle();

  if (error) return { evaluation: null, error: error.message };
  const evaluation = data?.responses?._evaluation;
  if (evaluation?.version !== MISSION_01.version || !evaluation?.data) return { evaluation: null, error: undefined };
  return { evaluation: evaluation.data, error: undefined };
};

export const createVacancy = async (payload) => {
  const { data, error } = await supabase
    .from('company_vacancies')
    .insert(payload)
    .select(VACANCY_SELECT)
    .single();

  return { vacancy: data || null, error: error?.message };
};
