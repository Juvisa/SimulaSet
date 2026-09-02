import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HANDLED_EVENTS = new Set([
  'video.upload.asset_created',
  'video.asset.ready',
  'video.upload.errored',
  'video.upload.cancelled',
  'video.asset.errored',
]);

const readRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
};

const verifyMuxSignature = (rawBody, signatureHeader, secret) => {
  if (!signatureHeader || !secret) return false;
  const values = signatureHeader.split(',').reduce((result, part) => {
    const [key, value] = part.trim().split('=');
    if (key && value) result[key] = [...(result[key] || []), value];
    return result;
  }, {});
  const timestamp = values.t?.[0];
  const signatures = values.v1 || [];
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return signatures.some((signature) => {
    const received = Buffer.from(signature, 'hex');
    const calculated = Buffer.from(expected, 'hex');
    return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Webhook no configurado' });
  }

  const rawBody = await readRawBody(req);
  if (!verifyMuxSignature(rawBody, req.headers['mux-signature'], webhookSecret)) {
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  if (!HANDLED_EVENTS.has(event.type)) return res.status(200).json({ received: true });

  const data = event.data || {};
  const academyLessonId = data.passthrough || data.new_asset_settings?.passthrough || data.meta?.external_id;
  const isUploadEvent = event.type.startsWith('video.upload.');
  if (!UUID_PATTERN.test(academyLessonId || '') || !data.id) {
    return res.status(200).json({ received: true, ignored: true });
  }

  let updates;
  if (event.type === 'video.upload.asset_created') {
    updates = { video_provider: 'mux', mux_asset_id: data.asset_id, video_status: 'processing' };
  } else if (event.type === 'video.asset.ready') {
    const playbackId = data.playback_ids?.find(playback => playback.policy === 'public')?.id;
    if (!data.id || !playbackId) return res.status(500).json({ error: 'Asset listo sin playback público' });
    updates = {
      video_provider: 'mux',
      mux_asset_id: data.id,
      mux_playback_id: playbackId,
      mux_playback_policy: 'public',
      video_status: 'ready',
      duration_seconds: Number.isFinite(data.duration) ? Math.round(data.duration) : null,
    };
  } else {
    updates = { video_status: 'errored' };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let updateQuery = supabase
    .from('academy_lessons')
    .update(updates)
    .eq('id', academyLessonId);

  updateQuery = isUploadEvent
    ? updateQuery.eq('mux_upload_id', data.id)
    : updateQuery.eq('mux_asset_id', data.id);

  const { data: updatedRows, error } = await updateQuery.select('id');

  if (error) return res.status(500).json({ error: 'No se pudo actualizar la clase' });
  return res.status(200).json({ received: true, updated: updatedRows.length === 1 });
}
