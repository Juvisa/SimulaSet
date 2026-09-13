import { supabase } from '../lib/supabase';

const sanitizeFileName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

export const uploadAvatarFile = async ({ userId, file }) => {
  if (!supabase) return { url: null, error: 'Supabase no está configurado.' };
  const path = `${userId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: false });
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return { url: data?.publicUrl || null, error: data?.publicUrl ? undefined : 'No pudimos generar el enlace de tu foto.' };
};
