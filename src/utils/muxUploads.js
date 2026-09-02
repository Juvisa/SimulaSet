import { supabase } from '../lib/supabase';

export const createMuxDirectUpload = async (academyLessonId) => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error('Sesión administrativa requerida');

  const response = await fetch('/api/mux/create-upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ academyLessonId }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la subida');
  return payload;
};

export const uploadFileToMux = (uploadUrl, file, onProgress) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open('PUT', uploadUrl);
  request.setRequestHeader('Content-Type', file.type || 'video/mp4');
  request.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
  });
  request.addEventListener('load', () => {
    if (request.status >= 200 && request.status < 300) resolve();
    else reject(new Error('Mux rechazó el archivo'));
  });
  request.addEventListener('error', () => reject(new Error('La conexión con Mux se interrumpió')));
  request.send(file);
});
