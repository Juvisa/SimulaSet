import { Buffer } from 'node:buffer';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { academyLessonId } = req.body || {};
  if (typeof academyLessonId !== 'string' || !UUID_PATTERN.test(academyLessonId)) {
    return res.status(400).json({ error: 'academyLessonId inválido' });
  }

  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const muxTokenId = process.env.MUX_TOKEN_ID;
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
  const allowedOrigins = (process.env.MUX_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const requestOrigin = req.headers.origin;

  if (!supabaseUrl || !supabaseAnonKey || !muxTokenId || !muxTokenSecret || allowedOrigins.length === 0) {
    return res.status(500).json({ error: 'La integración de video no está configurada' });
  }
  if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return res.status(401).json({ error: 'Sesión inválida' });

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || !isAdmin) return res.status(403).json({ error: 'Acceso administrativo requerido' });

  const { data: lesson, error: lessonError } = await supabase
    .from('academy_lessons')
    .select('id, title')
    .eq('id', academyLessonId)
    .single();
  if (lessonError || !lesson) return res.status(404).json({ error: 'Clase no encontrada' });

  try {
    const muxResponse = await fetch('https://api.mux.com/video/v1/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cors_origin: requestOrigin,
        timeout: 3600,
        new_asset_settings: {
          playback_policies: ['public'],
          passthrough: academyLessonId,
          meta: { external_id: academyLessonId, title: lesson.title },
        },
      }),
    });
    const muxPayload = await muxResponse.json();
    if (!muxResponse.ok || !muxPayload?.data?.id || !muxPayload?.data?.url) {
      return res.status(502).json({ error: 'Mux no pudo crear la URL de subida' });
    }

    const { data: updatedLesson, error: updateError } = await supabase
      .from('academy_lessons')
      .update({
        video_provider: 'mux',
        mux_upload_id: muxPayload.data.id,
        mux_asset_id: null,
        mux_playback_id: null,
        mux_playback_policy: 'public',
        video_status: 'waiting_for_upload',
        duration_seconds: null,
      })
      .eq('id', academyLessonId)
      .select('id, video_provider, mux_upload_id, mux_asset_id, mux_playback_id, mux_playback_policy, video_status, duration_seconds')
      .single();

    if (updateError || !updatedLesson) {
      return res.status(500).json({ error: 'No se pudo asociar la subida con la clase' });
    }

    return res.status(201).json({
      uploadUrl: muxPayload.data.url,
      uploadId: muxPayload.data.id,
      lesson: updatedLesson,
    });
  } catch {
    return res.status(502).json({ error: 'No se pudo iniciar la subida a Mux' });
  }
}
