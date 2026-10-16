// ─── SET Passport — zona horaria (puro, sin I/O) ─────────────────────────────
//
// El campo timezone es texto libre desde el bloque 1, así que puede contener
// valores escritos a mano ("GMT-5", "Bogotá", "hora colombia"...). Este módulo
// solo INTERPRETA el valor para mostrarlo; nunca lo corrige ni lo reescribe.
// Si no se reconoce, el editor avisa y el alumno decide.

// Zonas IANA más habituales entre los alumnos (Latinoamérica, España y EE. UU.).
export const TIMEZONE_OPTIONS = [
  { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { value: 'America/Mexico_City', label: 'México (Ciudad de México)' },
  { value: 'America/Lima', label: 'Perú (Lima)' },
  { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { value: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { value: 'America/Santiago', label: 'Chile (Santiago)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { value: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
  { value: 'America/Asuncion', label: 'Paraguay (Asunción)' },
  { value: 'America/La_Paz', label: 'Bolivia (La Paz)' },
  { value: 'America/Panama', label: 'Panamá' },
  { value: 'America/Costa_Rica', label: 'Costa Rica' },
  { value: 'America/Guatemala', label: 'Guatemala' },
  { value: 'America/El_Salvador', label: 'El Salvador' },
  { value: 'America/Tegucigalpa', label: 'Honduras' },
  { value: 'America/Managua', label: 'Nicaragua' },
  { value: 'America/Santo_Domingo', label: 'República Dominicana' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { value: 'Europe/Madrid', label: 'España (Madrid)' },
  { value: 'Atlantic/Canary', label: 'España (Canarias)' },
  { value: 'America/New_York', label: 'EE. UU. Este (Nueva York, Miami)' },
  { value: 'America/Chicago', label: 'EE. UU. Centro (Chicago)' },
  { value: 'America/Denver', label: 'EE. UU. Montaña (Denver)' },
  { value: 'America/Los_Angeles', label: 'EE. UU. Pacífico (Los Ángeles)' },
];

const OPTION_BY_VALUE = new Map(TIMEZONE_OPTIONS.map(o => [o.value, o]));
const MINUS = '−';

// "UTC−5", "UTC+5:30" a partir de minutos.
const formatOffset = (minutes) => {
  if (minutes === 0) return 'UTC';
  const sign = minutes < 0 ? MINUS : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
};

// Desfase actual de una zona IANA (respeta horario de verano). null si el
// navegador no la reconoce o no soporta 'shortOffset'.
export const getIanaOffsetLabel = (timeZone, date = new Date()) => {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(date)
      .find(p => p.type === 'timeZoneName')?.value;
    if (!part) return null;
    if (part === 'GMT') return 'UTC';
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(part);
    if (!match) return null;
    const minutes = (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === '-' ? -1 : 1);
    return formatOffset(minutes);
  } catch {
    return null;
  }
};

const isValidIana = (value) => {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

// "GMT-5", "UTC +01:00", "gmt-5 (Bogotá)", "UTC−3" → minutos. null si no es un desfase.
const parseOffset = (value) => {
  const match = /^(?:GMT|UTC)\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?(?:\s*\(.*\))?$/i.exec(value);
  if (!match) return null;
  const hours = Number(match[2]);
  const mins = Number(match[3] || 0);
  if (hours > 14 || mins >= 60) return null;
  return (hours * 60 + mins) * (match[1] === '+' ? 1 : -1);
};

// Interpreta el valor guardado. Nunca lo modifica.
//   empty   → sin dato
//   known   → zona de la lista            ("Colombia (Bogotá) · UTC−5")
//   iana    → zona IANA válida fuera de la lista
//   offset  → desfase escrito a mano       ("GMT-5" → "UTC−5")
//   unknown → no reconocible: el editor avisa y el PDF no lo imprime
export const describeTimezone = (raw, date = new Date()) => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { kind: 'empty', display: '' };

  const option = OPTION_BY_VALUE.get(value);
  if (option) {
    const offset = getIanaOffsetLabel(value, date);
    return { kind: 'known', display: offset ? `${option.label} · ${offset}` : option.label };
  }
  if (/^(?:GMT|UTC)$/i.test(value)) return { kind: 'offset', display: 'UTC' };
  const minutes = parseOffset(value);
  if (minutes !== null) return { kind: 'offset', display: formatOffset(minutes) };
  if (isValidIana(value)) {
    const offset = getIanaOffsetLabel(value, date);
    return { kind: 'iana', display: offset ? `${value.replace(/_/g, ' ')} · ${offset}` : value.replace(/_/g, ' ') };
  }
  return { kind: 'unknown', display: '' };
};

export const isListedTimezone = (value) => OPTION_BY_VALUE.has(typeof value === 'string' ? value.trim() : '');
