import { supabase } from '../../lib/supabase';

// Todas las credenciales se leen, emiten y verifican en el servidor
// (migración 202610170005_training_certificates.sql). El navegador no escribe
// ninguna tabla de credenciales: solo llama a estas funciones.

// PostgREST responde PGRST202 si la función no existe (migración sin aplicar).
const isMissingFunction = (error) => error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '');

export const getTrainingCertificateStatus = async () => {
  const { data, error } = await supabase.rpc('get_training_certificate_status');
  if (error) return { status: null, error: error.message, unavailable: isMissingFunction(error) };
  return { status: data, error: undefined, unavailable: false };
};

export const issueTrainingCertificate = async ({ consentVersion }) => {
  const { data, error } = await supabase.rpc('issue_training_certificate', { p_consent_version: consentVersion });
  if (error) return { result: null, error: error.message };
  return { result: data, error: undefined };
};

export const verifyCredential = async (code) => {
  const { data, error } = await supabase.rpc('verify_credential', { p_code: code });
  if (error) return { result: null, error: error.message, unavailable: isMissingFunction(error) };
  return { result: data, error: undefined, unavailable: false };
};
