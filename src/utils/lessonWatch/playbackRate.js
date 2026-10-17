// Velocidades que ofrece el selector nativo de MuxPlayer en la academia. El
// máximo (2x) coincide con lo que el servidor contabiliza en
// record_lesson_watch: ninguna opción permite ver más rápido de lo que cuenta.
export const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];
export const DEFAULT_PLAYBACK_RATE = 1;

const STORAGE_KEY = 'simulaset.academy.playbackRate';

// Normaliza a una de las opciones permitidas; cualquier otra cosa → 1x.
export const normalizePlaybackRate = (value) => {
  const rate = Number(value);
  return PLAYBACK_RATES.includes(rate) ? rate : DEFAULT_PLAYBACK_RATE;
};

// Preferencia del propio dispositivo (no es un dato del alumno en la base).
// Si el almacenamiento no está disponible (modo privado, bloqueado), 1x.
export const readPreferredPlaybackRate = (storage = globalThis.localStorage) => {
  try {
    return normalizePlaybackRate(storage?.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PLAYBACK_RATE;
  }
};

// Solo guarda velocidades del selector (no valores arbitrarios).
export const savePreferredPlaybackRate = (value, storage = globalThis.localStorage) => {
  const rate = Number(value);
  if (!PLAYBACK_RATES.includes(rate)) return false;
  try {
    storage?.setItem(STORAGE_KEY, String(rate));
    return true;
  } catch {
    return false;
  }
};
