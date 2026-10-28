// Modalidad Inbound — Primer contacto: lógica propia sin IA real. Los casos
// marcados «ronda 1» reproducen errores observados con Haiku el 2026-10-28.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BEHAVIOR_MATRIX, FALLBACK_OPENINGS, FIT_WEIGHTS, OPENING_TYPES, RESISTANCE_RULES,
  buildPrimerContactoProfilePrompt, buildProjectContext, deriveLeadState, describeBehavior, drawProfileSeeds,
  findUndocumentedClaims, isEcho, normalizePrimerContactoProfile, normalizeStage, pickOpeningMessage,
  sanitizeCoaching, sanitizeText, validateScore,
} from './primerContacto';
import {
  buildFinalReportPrompt, buildPrimerContactoCoachMessage, buildPrimerContactoCoachPrompt, buildPrimerContactoSystemPrompt,
} from './prompts';
import { PROFILE, PROJECT } from './primerContacto.fixtures';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }), refreshSession: async () => ({ data: { session: null } }) } },
  supabaseConfigured: true,
}));

const sequence = (...values) => { let i = 0; return () => values[i++ % values.length]; };

describe('temperatura × resistencia', () => {
  it('las 9 combinaciones producen comportamientos distintos', () => {
    const cells = new Set();
    for (const t of ['frio', 'tibio', 'caliente']) for (const r of ['baja', 'media', 'alta']) cells.add(describeBehavior(t, r).combinacion);
    expect(cells.size).toBe(9);
  });
  it('la resistencia fija límites observables: menos palabras, menos revelación y menos paciencia cuanto más alta', () => {
    expect(RESISTANCE_RULES.baja.maxPalabras).toBeGreaterThan(RESISTANCE_RULES.media.maxPalabras);
    expect(RESISTANCE_RULES.media.maxPalabras).toBeGreaterThan(RESISTANCE_RULES.alta.maxPalabras);
    expect(RESISTANCE_RULES.alta.evasivas).toBeLessThan(RESISTANCE_RULES.baja.evasivas);
    expect(describeBehavior('frio', 'alta')).toMatchObject({ maxPalabras: 14, evasivas: 2 });
  });
  it('valores desconocidos caen en frío/media sin romper', () => {
    expect(describeBehavior(undefined, 'x').combinacion).toBe(BEHAVIOR_MATRIX.frio.media);
  });
});

describe('contexto del proyecto', () => {
  it('incluye los campos guardados y marca como «no documentado» lo que falta', () => {
    const ctx = buildProjectContext(PROJECT);
    for (const v of [PROJECT.promise, PROJECT.price, PROJECT.avatarPain, PROJECT.avatarDesire, PROJECT.commonObjections, 'Dr. Luis']) expect(ctx).toContain(v);
    const empty = buildProjectContext({ ...PROJECT, price: '', testimonials: [] });
    expect(empty).toContain('- Precio documentado: no documentado');
    expect(empty).toContain('- Testimonios documentados: no documentado');
  });
});

describe('variedad del prospecto (semillas)', () => {
  it('las aperturas incluyen «Info» y «Precio» con peso real en frío', () => {
    const textos = OPENING_TYPES.frio.map((o) => o.texto);
    expect(textos).toContain('Info');
    expect(textos).toContain('Precio');
    const counts = {};
    for (let i = 0; i < 400; i += 1) {
      const s = drawProfileSeeds({ temperatura: 'frio' }, () => (i + 0.5) / 400);
      counts[s.apertura.texto || 'propia'] = (counts[s.apertura.texto || 'propia'] || 0) + 1;
    }
    expect(counts.Info).toBeGreaterThan(60);
    expect(counts.Precio).toBeGreaterThan(60);
  });
  it('el encaje lo decide el código e incluye casos que no califican', () => {
    expect(FIT_WEIGHTS.map(([f]) => f)).toEqual(['alto', 'medio', 'bajo']);
    const fits = new Set(Array.from({ length: 50 }, (_, i) => drawProfileSeeds({ temperatura: 'tibio' }, () => (i + 0.5) / 50).encaje));
    expect([...fits].sort()).toEqual(['alto', 'bajo', 'medio']);
  });
  it('varía nombre, ciudad, edad, momento, motivo y estilo', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => drawProfileSeeds({ temperatura: 'frio' }, sequence((i * 7 % 30) / 30, (i * 11 % 30) / 30, (i * 13 % 30) / 30)));
    for (const k of ['nombre', 'lugar', 'edad', 'etapa', 'disparador', 'estilo']) expect(new Set(seeds.map((s) => s[k])).size).toBeGreaterThan(3);
  });
  it('las pruebas pueden forzar encaje y apertura; la app no lo hace', () => {
    expect(drawProfileSeeds({ temperatura: 'frio' }, Math.random, { encaje: 'bajo', apertura: 'precio' })).toMatchObject({ encaje: 'bajo', apertura: { texto: 'Precio' } });
  });
});

describe('perfil privado', () => {
  const seeds = drawProfileSeeds({ temperatura: 'frio' }, () => 0, { encaje: 'bajo', apertura: 'info' });
  it('el prompt usa el proyecto, las semillas, exige un personaje ficticio y no copiar el avatar', () => {
    const prompt = buildPrimerContactoProfilePrompt(PROJECT, { temperatura: 'frio', resistencia: 'alta', canal: 'Instagram DM' }, seeds);
    for (const v of [PROJECT.avatarPain, seeds.nombre, seeds.lugar, seeds.estilo, 'Encaje con la oferta: bajo', 'NO copies las cifras', '100 % ficticio', 'exactamente "Info"', 'Canal: Instagram DM']) {
      expect(prompt).toContain(v);
    }
  });
  it('el código fija nombre, encaje y apertura aunque la IA devuelva otros', () => {
    const p = normalizePrimerContactoProfile({ nombre: 'Martín', identidad: 'x', situacion: 'y', motivacion: 'z', encaje: 'alto', apertura_inicial: '¿Funciona de verdad?' }, seeds);
    expect(p).toMatchObject({ nombre: seeds.nombre, encaje: 'bajo', apertura_inicial: 'Info', campos_faltantes: [] });
  });
  it('detecta campos esenciales faltantes y limita listas', () => {
    const p = normalizePrimerContactoProfile({ nombre: 'Luis', identidad: 'Coach', situacion: '', motivacion: 'Crecer', objeciones: ['a', 'b', 'c', 'd'] });
    expect(p.campos_faltantes).toEqual(['situacion']);
    expect(p.objeciones).toEqual(['a', 'b', 'c']);
  });
  it('elimina correos, teléfonos y enlaces, pero conserva cifras de dinero', () => {
    expect(sanitizeText('Escríbeme a ana@mail.com o al +57 300 123 4567, mira www.x.co')).toBe('Escríbeme a o al , mira');
    expect(sanitizeText('Gana 3.000.000 al mes y pagó 1,800 USD')).toBe('Gana 3.000.000 al mes y pagó 1,800 USD');
  });
});

describe('primer mensaje', () => {
  it('conserva una apertura breve y usa una de respaldo si no lo es', () => {
    expect(pickOpeningMessage('Info', 'frio')).toEqual({ text: 'Info', source: 'perfil' });
    expect(pickOpeningMessage('Hola buenas tardes quería saber toda la información completa del programa y además el precio', 'caliente', () => 0))
      .toEqual({ text: FALLBACK_OPENINGS.caliente[0], source: 'respaldo' });
  });
});

describe('C5 · eco del mensaje del alumno', () => {
  it('ronda 1 (C05 turno 2): repetición literal', () => {
    const setter = 'Entiendo. ¿Y cómo te llegan hoy los pacientes nuevos al consultorio?';
    expect(isEcho('Entiendo. ¿Y cómo te llegan hoy los pacientes nuevos al consultorio?', setter)).toBe(true);
    expect(isEcho('entiendo ¿y cómo te llegan hoy los pacientes nuevos al consultorio', setter)).toBe(true);
  });
  it('una respuesta real que reutiliza palabras no es eco', () => {
    expect(isEcho('Principalmente por referidos, pero los nuevos casi no llegan.', '¿Y cómo te llegan hoy los pacientes nuevos al consultorio?')).toBe(false);
    expect(isEcho('Sí', 'Sí')).toBe(true);
    expect(isEcho('', 'algo')).toBe(false);
  });
});

describe('C4 · aceptación de la cita', () => {
  it('solo «si» registra pidio_llamada', () => {
    expect(deriveLeadState('interesado', 'si')).toBe('pidio_llamada');
    expect(deriveLeadState('pidio_llamada', 'condicionada')).toBe('interesado');
    expect(deriveLeadState('pidio_llamada', 'no')).toBe('interesado');
    expect(deriveLeadState('pidio_llamada', undefined)).toBe('interesado');
  });
  it('los demás estados se conservan; los desconocidos quedan en abierto', () => {
    for (const s of ['abierto', 'interesado', 'resistente', 'no_califica', 'cerrado']) expect(deriveLeadState(s, 'no')).toBe(s);
    expect(deriveLeadState('confirmado_con_entusiasmo', 'no')).toBe('abierto');
  });
});

describe('C3 · puntuaciones', () => {
  it('solo enteros de 1 a 10; nada se reemplaza por otro número', () => {
    for (const ok of [1, 7, 10, '8']) expect(validateScore(ok)).toBe(Number(ok));
    for (const bad of [0, 11, -1, 7.5, '', 'diez', null, undefined, '0']) expect(validateScore(bad)).toBeNull();
  });
  it('ronda 1 (C05 turno 3): un 0/10 con elogio queda sin puntuación, no como 0 ni como 10', () => {
    const raw = { puntuacion_mensaje: 0, etapa_set: 'E', que_hizo_bien: 'Excelente pregunta abierta.', que_mejorar: 'Ninguno.', mensaje_alternativo: '', alerta: '' };
    const { coaching, issues } = sanitizeCoaching(raw, PROJECT);
    expect(coaching.puntuacion_mensaje).toBeNull();
    expect(coaching.que_hizo_bien).toBe('Excelente pregunta abierta.');
    expect(issues).toContain('puntuacion_invalida:0');
  });
  it('la etapa se normaliza a S, E o T (ronda 1: «E→T»)', () => {
    expect(normalizeStage('E→T')).toBe('E');
    expect(normalizeStage('t')).toBe('T');
    expect(normalizeStage('x')).toBeNull();
  });
});

describe('C1 · el coaching no puede afirmar condiciones no documentadas', () => {
  it('ronda 1 (C01 turno 6): horas de dedicación inventadas', () => {
    const alt = 'Perfecto. La inversión es 1.800 USD o 3 cuotas de 650. Sobre el tiempo: la mayoría de nuestros clientes dedican 5-7 horas en la primera semana.';
    expect(findUndocumentedClaims(alt, PROJECT)).toEqual(['cifra «5-7 horas»']);
  });
  it('ronda 1 (C14 turno 5): garantía inventada', () => {
    expect(findUndocumentedClaims('Lo que garantizamos es que en 90 días veas pacientes nuevos.', PROJECT)).toContain('garantia');
  });
  it('lo documentado, lo dicho en la conversación y las preguntas no se marcan', () => {
    expect(findUndocumentedClaims('La inversión es de 1.800 USD o 3 cuotas de 650 USD.', PROJECT)).toEqual([]);
    expect(findUndocumentedClaims('¿Cuántos pacientes nuevos te entraron en los últimos 3 meses?', PROJECT)).toEqual([]);
    expect(findUndocumentedClaims('Entiendo que tienes 2 asistentes.', PROJECT, 'Prospecto: tengo 2 asistentes')).toEqual([]);
    expect(findUndocumentedClaims('Eso te lo detalla el equipo en la llamada. ¿Te parece el jueves?', PROJECT)).toEqual([]);
  });
  it('sin precio documentado, cualquier cifra de dinero en una afirmación se marca', () => {
    expect(findUndocumentedClaims('El programa sale 900 USD.', { ...PROJECT, price: '' })).toEqual(['cifra «900 USD»']);
  });
  it('el mensaje sugerido con afirmaciones inventadas se descarta (no se corrige)', () => {
    const { coaching, issues } = sanitizeCoaching({ puntuacion_mensaje: 4, mensaje_alternativo: 'Tienes garantía de devolución del 100 %.', que_mejorar: 'No inventes una garantía.' }, PROJECT);
    expect(coaching.mensaje_alternativo).toBe('');
    expect(coaching.que_mejorar).toBe('No inventes una garantía.');
    expect(issues.some((i) => i.startsWith('mensaje_alternativo_descartado'))).toBe(true);
  });
});

describe('prompt del prospecto (Primer contacto)', () => {
  const prompt = buildPrimerContactoSystemPrompt(PROJECT, PROFILE);
  it('solo actúa como prospecto: no evalúa ni puntúa', () => {
    expect(prompt).toContain('NO evalúas al setter');
    expect(prompt).not.toContain('puntuacion_mensaje');
    expect(prompt).not.toContain('coaching');
  });
  it('usa el proyecto y el perfil privado, con revelación progresiva y sin guion', () => {
    for (const v of [PROJECT.promise, PROFILE.motivacion, 'Perdió 2.300 USD con una agencia', 'Revelas tu historia de a poco', 'ni sigas un guion fijo']) expect(prompt).toContain(v);
  });
  it('mensajes breves según la resistencia, sin eco', () => {
    expect(prompt).toContain('máximo 22 palabras por mensaje');
    expect(buildPrimerContactoSystemPrompt(PROJECT, { ...PROFILE, resistencia: 'alta' })).toContain('máximo 14 palabras por mensaje');
    expect(prompt).toContain('Nunca repites ni copias el mensaje del setter');
  });
  it('precio: insiste ante evasivas y se despide tras las que permita su resistencia', () => {
    expect(prompt).toContain('insistes con naturalidad');
    expect(prompt).toContain('Tras 3 evasivas seguidas, te despides');
    expect(buildPrimerContactoSystemPrompt(PROJECT, { ...PROFILE, resistencia: 'alta' })).toContain('Tras 2 evasivas seguidas');
  });
  it('acepta respuestas honestas sobre lo no documentado y no inventa la oferta', () => {
    expect(prompt).toContain('responde con honestidad que lo verán en la llamada, lo aceptas');
    expect(prompt).toContain('Nunca inventes datos de la oferta');
  });
  it('no fuerza la cita y define la aceptación explícita (C4)', () => {
    expect(prompt).toContain('Con encaje "bajo", no aceptas la cita');
    expect(prompt).toContain('"si": aceptas la llamada o un día/horario');
    expect(prompt).toContain('"condicionada": dices que sí pero pones una condición previa');
    expect(prompt).toContain('"acepta_cita": "no"');
  });
});

describe('prompt del coaching (Primer contacto)', () => {
  const coach = buildPrimerContactoCoachPrompt(PROJECT);
  it('C2: no recibe el perfil privado (solo el proyecto)', () => {
    expect(buildPrimerContactoCoachPrompt.length).toBe(1);
    for (const secret of PROFILE.hechos_ocultos) expect(coach).not.toContain(secret);
    expect(coach).toContain('No conoces lo que el prospecto responderá después');
  });
  it('C1: prohíbe inventar la oferta en el feedback y en lo copiable', () => {
    expect(coach).toContain('Nunca inventes ni sugieras características, precios, garantías, condiciones, plazos o resultados');
    expect(coach).toContain('"mensaje_alternativo" solo puede usar lo documentado');
  });
  it('precio honesto correcto en cualquier momento, con o sin precio documentado', () => {
    expect(coach).toContain('es correcto EN CUALQUIER MOMENTO');
    expect(buildPrimerContactoCoachPrompt({ ...PROJECT, price: '' })).toContain('NO es una evasiva; inventar una cifra sí es un error');
  });
  it('C3: escala 1–10 anclada, nunca 0, y la puntuación al final del JSON', () => {
    expect(coach).toContain('10 excelente, sin nada relevante que mejorar. Nunca uses 0.');
    expect(coach.indexOf('"puntuacion_mensaje": 7')).toBeGreaterThan(coach.indexOf('"que_mejorar"'));
  });
  it('feedback breve y alertas solo para casos definidos; valora la falta de encaje', () => {
    expect(coach).toContain('máximo 25 palabras cada uno');
    expect(coach).toContain('En los demás casos, "alerta" va vacía');
    expect(coach).toContain('reconocer con respeto que no hay encaje (es un buen resultado: puntúalo alto)');
  });
  it('el mensaje a evaluar incluye la conversación previa y el mensaje del alumno, nada más', () => {
    const msg = buildPrimerContactoCoachMessage([
      { role: 'prospect', content: 'Info' }, { role: 'setter', content: '¡Hola! ¿Qué te llamó la atención?' },
      { role: 'prospect', content: 'Lo de los referidos' }, { role: 'system', content: 'Error de red' },
    ], '¿Y cómo te llegan hoy los pacientes?');
    expect(msg).toContain('Prospecto: Info');
    expect(msg).toContain('Alumno: ¡Hola! ¿Qué te llamó la atención?');
    expect(msg).not.toContain('Error de red');
    expect(msg.trim().endsWith('¿Y cómo te llegan hoy los pacientes?')).toBe(true);
  });
  it('el reporte final añade el objetivo solo en Primer contacto', () => {
    expect(buildFinalReportPrompt('primer_contacto', PROJECT, [], [], 0, 'no_califica')).toContain('"no_califica" es un resultado legítimo');
    expect(buildFinalReportPrompt('outbound', PROJECT, [], [], 0, 'cerrado')).not.toContain('Primer contacto');
  });
});

describe('generación del perfil en la app (fetch simulado)', () => {
  let fetchMock;
  const reply = (obj) => ({ ok: true, status: 200, json: async () => ({ text: JSON.stringify(obj) }) });
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('usa simulator_prospect con Haiku y 500 tokens; nombre, encaje y apertura vienen de las semillas', async () => {
    fetchMock.mockResolvedValue(reply({ ...PROFILE, nombre: 'Martín', encaje: 'alto' }));
    const { generateProspectProfile } = await import('./anthropic.js');
    const profile = await generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'frio', canal: 'WhatsApp', resistencia: 'alta' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ operation: 'simulator_prospect', model: 'haiku', maxTokens: 500 });
    expect(body.messages[0].content).toContain('DATOS FIJOS DE ESTE PROSPECTO');
    expect(profile.nombre).toBe(profile.seeds.nombre);
    expect(profile.encaje).toBe(profile.seeds.encaje);
    expect(profile).toMatchObject({ temperatura: 'frio', resistencia: 'alta', canal: 'WhatsApp', campos_faltantes: [] });
  });
  it('si faltan campos esenciales lo pide una vez más; si sigue incompleto, no arranca', async () => {
    fetchMock.mockResolvedValueOnce(reply({ nombre: 'X' })).mockResolvedValueOnce(reply(PROFILE));
    const { generateProspectProfile } = await import('./anthropic.js');
    await generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(reply({ nombre: 'X' }));
    await expect(generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media' })).rejects.toThrow('Perfil inválido');
  });
  it('un rechazo del servidor se muestra tal cual', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Límite alcanzado', code: 'rate_limited' }) });
    const { generateProspectProfile, AiRequestError } = await import('./anthropic.js');
    const err = await generateProspectProfile(PROJECT, 'primer_contacto', { temperatura: 'tibio', canal: 'WhatsApp', resistencia: 'media' }).catch((e) => e);
    expect(err).toBeInstanceOf(AiRequestError);
    expect(err.message).toBe('Límite alcanzado');
  });
});
