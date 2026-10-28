// Modalidad Inbound — Primer contacto: lógica propia (sin IA real; todo con
// datos fijos o fetch simulado).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BEHAVIOR_MATRIX,
  FALLBACK_OPENINGS,
  buildPrimerContactoProfilePrompt,
  buildProjectContext,
  describeBehavior,
  normalizePrimerContactoProfile,
  pickOpeningMessage,
  sanitizeText,
} from './primerContacto';
import { buildFinalReportPrompt, buildPrimerContactoSystemPrompt } from './prompts';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }), refreshSession: async () => ({ data: { session: null } }) } },
  supabaseConfigured: true,
}));

const PROJECT = {
  name: 'Agenda Llena',
  expertName: 'Dra. Ana Torres',
  niche: 'Odontólogos con consultorio propio',
  promise: 'Llenar la agenda sin depender de referidos en 90 días',
  price: '1.800 USD o 3 cuotas de 650 USD',
  avatarBusiness: 'Consultorio dental de 1 a 3 sillones',
  avatarCurrentSituation: 'Depende de referidos y la agenda va al 60 %',
  avatarPain: 'Meses flojos sin pacientes nuevos',
  avatarDesire: 'Abrir un segundo consultorio',
  avatarDescription: 'Odontólogo independiente de 30 a 50 años',
  commonObjections: 'Ya probé con una agencia; no tengo tiempo',
  testimonials: [{ nombre: 'Dr. Luis', resultado: '+40 pacientes nuevos en 3 meses' }],
  recursos: { guias_pdfs: [], videos_testimonios: [], vsl_presentacion: { activo: false }, scripts_apertura: {} },
};
const PROFILE = {
  nombre: 'Valeria Ríos', origen: 'Un reel sobre pacientes que no vuelven', identidad: 'Odontóloga con consultorio propio en Medellín',
  situacion: 'Agenda al 60 %, depende de referidos', emocion: 'Frustración y miedo a no crecer', motivacion: 'Quiere abrir otro consultorio',
  objeciones: ['Ya probé con una agencia'], hechos_ocultos: ['Perdió 2.000 USD con una agencia', 'Decide con su esposo'],
  encaje: 'alto', apertura_inicial: 'Info', temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media',
};

describe('temperatura × resistencia', () => {
  it('las 9 combinaciones producen comportamientos distintos', () => {
    const cells = new Set();
    for (const t of ['frio', 'tibio', 'caliente']) for (const r of ['baja', 'media', 'alta']) cells.add(describeBehavior(t, r).combinacion);
    expect(cells.size).toBe(9);
  });
  it('temperatura y resistencia cambian el contexto por separado', () => {
    expect(describeBehavior('frio', 'media').temperatura).not.toBe(describeBehavior('caliente', 'media').temperatura);
    expect(describeBehavior('tibio', 'baja').resistencia).not.toBe(describeBehavior('tibio', 'alta').resistencia);
  });
  it('valores desconocidos caen en frío/media sin romper', () => {
    expect(describeBehavior(undefined, 'x').combinacion).toBe(BEHAVIOR_MATRIX.frio.media);
  });
});

describe('contexto del proyecto', () => {
  it('incluye todos los campos guardados del proyecto', () => {
    const ctx = buildProjectContext(PROJECT);
    for (const v of [PROJECT.expertName, PROJECT.niche, PROJECT.promise, PROJECT.price, PROJECT.avatarBusiness,
      PROJECT.avatarCurrentSituation, PROJECT.avatarPain, PROJECT.avatarDesire, PROJECT.avatarDescription, PROJECT.commonObjections, 'Dr. Luis']) {
      expect(ctx).toContain(v);
    }
  });
  it('marca como "no documentado" lo que falta (no se inventa)', () => {
    const ctx = buildProjectContext({ ...PROJECT, price: '', commonObjections: '  ', testimonials: [] });
    expect(ctx).toContain('- Precio documentado: no documentado');
    expect(ctx).toContain('- Objeciones comunes: no documentado');
    expect(ctx).toContain('- Testimonios documentados: no documentado');
  });
});

describe('perfil privado', () => {
  it('el prompt usa el proyecto, exige un personaje ficticio y un esquema compacto', () => {
    const prompt = buildPrimerContactoProfilePrompt(PROJECT, { temperatura: 'frio', resistencia: 'alta', canal: 'Instagram DM' });
    expect(prompt).toContain(PROJECT.avatarPain);
    expect(prompt).toContain('100 % ficticio');
    expect(prompt).toContain('ni datos de contacto');
    expect(prompt).toContain('máximo 20 palabras');
    expect(prompt).toContain('máximo 12 palabras');
    expect(prompt).toContain('Canal: Instagram DM');
    expect(prompt).toContain(BEHAVIOR_MATRIX.frio.alta);
    expect(prompt).toContain('"encaje"');
  });
  it('elimina correos, teléfonos y enlaces, pero conserva cifras de dinero', () => {
    expect(sanitizeText('Escríbeme a ana@mail.com o al +57 300 123 4567, mira www.x.co')).toBe('Escríbeme a o al , mira');
    expect(sanitizeText('Gana 3.000.000 al mes y pagó 1,800 USD')).toBe('Gana 3.000.000 al mes y pagó 1,800 USD');
  });
  it('normaliza listas, encaje y detecta campos esenciales faltantes', () => {
    const p = normalizePrimerContactoProfile({ nombre: 'Luis', identidad: 'Coach', situacion: '', motivacion: 'Crecer',
      objeciones: ['a', 'b', 'c', 'd'], hechos_ocultos: 'uno solo', encaje: 'ALTO' });
    expect(p.objeciones).toEqual(['a', 'b', 'c']);
    expect(p.hechos_ocultos).toEqual(['uno solo']);
    expect(p.encaje).toBe('alto');
    expect(p.campos_faltantes).toEqual(['situacion']);
    expect(normalizePrimerContactoProfile(null).campos_faltantes).toEqual(['nombre', 'identidad', 'situacion', 'motivacion']);
    expect(normalizePrimerContactoProfile({ encaje: 'quizá' }).encaje).toBe('medio');
  });
});

describe('primer mensaje del prospecto', () => {
  it('conserva una apertura breve y natural', () => {
    expect(pickOpeningMessage('Info', 'frio')).toEqual({ text: 'Info', source: 'perfil' });
    expect(pickOpeningMessage('«Hola, vi tu publicación y quisiera información»', 'tibio').text).toBe('Hola, vi tu publicación y quisiera información');
  });
  it('sustituye aperturas largas, con saltos de línea, enlaces o vacías por una de respaldo', () => {
    const long = 'Hola buenas tardes quería saber toda la información completa del programa y además el precio';
    for (const bad of [long, 'Hola\n¿cómo funciona?', 'Info en https://x.co', '', null]) {
      const r = pickOpeningMessage(bad, 'caliente', () => 0);
      expect(r).toEqual({ text: FALLBACK_OPENINGS.caliente[0], source: 'respaldo' });
    }
  });
  it('las aperturas de respaldo dependen de la temperatura y son breves', () => {
    for (const [temp, options] of Object.entries(FALLBACK_OPENINGS)) {
      expect(options).toContain(pickOpeningMessage('', temp, () => 0.99).text);
      for (const o of options) expect(o.split(/\s+/).length).toBeLessThanOrEqual(12);
    }
  });
});

describe('prompt del prospecto (Primer contacto)', () => {
  const prompt = buildPrimerContactoSystemPrompt(PROJECT, PROFILE);
  it('usa los datos reales del proyecto y el perfil privado', () => {
    for (const v of [PROJECT.promise, PROJECT.price, PROJECT.avatarDesire, PROFILE.motivacion, 'Perdió 2.000 USD con una agencia']) expect(prompt).toContain(v);
    expect(prompt).toContain('el setter NO lo conoce');
  });
  it('revelación progresiva sin guion fijo', () => {
    expect(prompt).toContain('Revelas tu historia de a poco');
    expect(prompt).toContain('ni sigas un guion fijo');
  });
  it('precio: insiste ante evasivas y no penaliza la respuesta honesta', () => {
    expect(prompt).toContain('insistes con naturalidad');
    expect(prompt).toContain('Una respuesta honesta (el precio, un rango o una referencia de ese precio');
    expect(prompt).toContain('NO se penaliza');
    expect(prompt).toContain('evasivas reiteradas sobre el precio');
  });
  it('sin precio documentado, una respuesta honesta no es evasiva e inventar una cifra sí se penaliza', () => {
    const p = buildPrimerContactoSystemPrompt({ ...PROJECT, price: '' }, PROFILE);
    expect(p).toContain('El proyecto NO documenta un precio');
    expect(p).toContain('inventar una cifra SÍ');
  });
  it('no inventar condiciones y marcar promesas no documentadas', () => {
    expect(prompt).toContain('Nunca inventes datos de la oferta');
    expect(prompt).toContain('promesa no documentada');
  });
  it('no fuerza la cita y valora la falta de encaje', () => {
    expect(prompt).toContain('NO aceptas una cita si el setter no entendió tu situación');
    expect(prompt).toContain('Con encaje "bajo", no aceptas la cita');
    expect(prompt).toContain('Identificar correctamente la falta de encaje');
    expect(prompt).toContain('no_califica');
  });
  it('mantiene el método S.E.T. y la combinación de temperatura y resistencia', () => {
    expect(prompt).toContain('S (Situación)');
    expect(prompt).toContain('E (Emoción)');
    expect(prompt).toContain('T (Transición)');
    expect(prompt).toContain(BEHAVIOR_MATRIX.tibio.media);
  });
  it('pide el contrato JSON que el simulador espera', () => {
    expect(prompt).toContain('"respuesta_prospecto"');
    expect(prompt).toContain('"probabilidad_cita"');
    expect(prompt).toContain('abierto | interesado | resistente | pidio_llamada | no_califica | cerrado');
  });
  it('el reporte final añade el objetivo solo en Primer contacto', () => {
    expect(buildFinalReportPrompt('primer_contacto', PROJECT, [], [], 0, 'no_califica')).toContain('"no_califica" es un resultado legítimo');
    expect(buildFinalReportPrompt('outbound', PROJECT, [], [], 0, 'cerrado')).not.toContain('Primer contacto');
  });
});

describe('generación del perfil (fetch simulado)', () => {
  let fetchMock;
  const reply = (obj) => ({ ok: true, status: 200, json: async () => ({ text: JSON.stringify(obj) }) });
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('usa la operación simulator_prospect con Haiku y 500 tokens, y el prompt propio', async () => {
    fetchMock.mockResolvedValue(reply({ ...PROFILE, telefono_extra: 'ignorado' }));
    const { generateProspectProfile } = await import('./anthropic.js');
    const profile = await generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'frio', canal: 'WhatsApp', resistencia: 'alta' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ operation: 'simulator_prospect', model: 'haiku', maxTokens: 500 });
    expect(body.messages[0].content).toContain('perfil PRIVADO');
    expect(profile).toMatchObject({ nombre: 'Valeria Ríos', encaje: 'alto', temperatura: 'frio', resistencia: 'alta', canal: 'WhatsApp', campos_faltantes: [] });
    expect(profile).not.toHaveProperty('telefono_extra');
  });
  it('si faltan campos esenciales (respuesta cortada) lo pide una vez más', async () => {
    fetchMock.mockResolvedValueOnce(reply({ nombre: 'X' })).mockResolvedValueOnce(reply(PROFILE));
    const { generateProspectProfile } = await import('./anthropic.js');
    const profile = await generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(profile.nombre).toBe('Valeria Ríos');
  });
  it('si sigue incompleto, no arranca con un prospecto vacío', async () => {
    fetchMock.mockResolvedValue(reply({ nombre: 'X' }));
    const { generateProspectProfile } = await import('./anthropic.js');
    await expect(generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media' })).rejects.toThrow('Perfil inválido');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('un rechazo del servidor (sesión, acceso, límite) se muestra tal cual', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Límite alcanzado', code: 'rate_limited' }) });
    const { generateProspectProfile, AiRequestError } = await import('./anthropic.js');
    const err = await generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media' }).catch((e) => e);
    expect(err).toBeInstanceOf(AiRequestError);
    expect(err.message).toBe('Límite alcanzado');
  });
});
