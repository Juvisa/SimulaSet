import { describe, it, expect } from 'vitest';
import { emptyPassport } from '../passportModel.js';
import { validateAssistantAnswers } from './assistantContract.js';
import {
  buildAssistantContext, getVisibleQuestions, planDraftApplication, toAnswersPayload, validateQuestionAnswers,
} from './assistantQuestions.js';

const exp = (patch) => ({ kind: 'setter', role: 'Setter', context: '', period: '', functions: [], ...patch });
const form = (patch = {}) => ({ ...emptyPassport(), ...patch });
const visibleFor = (savedForm, track, extra = {}) => {
  const ctx = buildAssistantContext({ savedForm, suggestedTrack: '', ...extra });
  return getVisibleQuestions({ ...ctx.defaults, track }, ctx);
};

describe('preguntas — entre 3 y 5, sin repetir lo que ya está en el perfil', () => {
  const profiles = {
    vacío: form(),
    completo_setter: form({ experienceTrack: 'setter_closer', preferredRoles: ['setter'], experiences: [exp({ functions: ['Calificar leads', 'Agendar llamadas'] })] }),
    completo_transferible: form({ experienceTrack: 'comercial_transferible', preferredRoles: ['setter'], experiences: [exp({ kind: 'ventas', role: 'Asesora', functions: ['Seguimiento', 'Atención'] })] }),
    solo_roles: form({ preferredRoles: ['closer'] }),
  };

  it('todas las combinaciones de perfil × trayectoria quedan entre 3 y 5', () => {
    for (const [name, saved] of Object.entries(profiles)) {
      for (const track of ['setter_closer', 'comercial_transferible', 'en_formacion', '']) {
        const n = visibleFor(saved, track).length;
        expect(n, `${name}/${track}`).toBeGreaterThanOrEqual(3);
        expect(n, `${name}/${track}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('siempre: trayectoria, destacar y tono', () => {
    expect(visibleFor(profiles.completo_setter, 'setter_closer')).toEqual(['track', 'highlight', 'tone']);
  });

  it('setter: pide funciones solo si el perfil no tiene al menos 2', () => {
    expect(visibleFor(profiles.vacío, 'setter_closer')).toContain('functions');
    expect(visibleFor(profiles.completo_setter, 'setter_closer')).not.toContain('functions');
  });

  it('transferible: pide la experiencia solo si no está guardada con detalle', () => {
    expect(visibleFor(profiles.vacío, 'comercial_transferible')).toContain('transferable');
    expect(visibleFor(profiles.completo_transferible, 'comercial_transferible')).not.toContain('transferable');
  });

  it('en formación: siempre pregunta fortalezas (no se guardan en ningún sitio)', () => {
    expect(visibleFor(profiles.completo_setter, 'en_formacion')).toContain('strengths');
  });

  it('roles: no se preguntan si ya están guardados', () => {
    expect(visibleFor(profiles.solo_roles, 'en_formacion')).not.toContain('roles');
    expect(visibleFor(profiles.vacío, 'en_formacion')).toContain('roles');
  });
});

describe('precarga — usa lo guardado sin modificarlo', () => {
  it('trayectoria guardada > sugerida por el diagnóstico', () => {
    expect(buildAssistantContext({ savedForm: form({ experienceTrack: 'en_formacion' }), suggestedTrack: 'setter_closer' }).defaults.track).toBe('en_formacion');
    expect(buildAssistantContext({ savedForm: form(), suggestedTrack: 'setter_closer' }).defaults.track).toBe('setter_closer');
  });

  it('funciones y experiencia transferible precargadas desde el perfil', () => {
    const ctx = buildAssistantContext({ savedForm: form({ experiences: [exp({ functions: ['A'] }), exp({ kind: 'ventas', role: 'Asesora', context: 'Tienda' })] }) });
    expect(ctx.defaults.functions).toEqual(['A']);
    expect(ctx.defaults.transferableRole).toEqual({ role: 'Asesora', context: 'Tienda' });
  });

  it('roles: guardados > rol de la Bolsa de Empleo', () => {
    expect(buildAssistantContext({ savedForm: form(), commercialProfile: { role_type: 'closer' } }).defaults.preferredRoles).toEqual(['closer']);
    expect(buildAssistantContext({ savedForm: form({ preferredRoles: ['setter'] }), commercialProfile: { role_type: 'closer' } }).defaults.preferredRoles).toEqual(['setter']);
    expect(buildAssistantContext({ savedForm: form(), commercialProfile: { role_type: 'sales_leader' } }).defaults.preferredRoles).toEqual([]);
  });

  it('no muta el formulario guardado', () => {
    const saved = form({ experiences: [exp({ functions: ['A'] })], preferredRoles: ['setter'] });
    const before = JSON.stringify(saved);
    buildAssistantContext({ savedForm: saved, suggestedTrack: 'setter_closer' });
    expect(JSON.stringify(saved)).toBe(before);
  });
});

describe('envío — solo respuestas visibles y siempre válidas para el servidor', () => {
  it('el payload pasa la validación estricta del servidor en cada trayectoria', () => {
    for (const track of ['setter_closer', 'comercial_transferible', 'en_formacion']) {
      const ctx = buildAssistantContext({ savedForm: form() });
      const answers = { ...ctx.defaults, track, functions: ['Agendar'], transferableRole: { role: 'Cajero', context: '' }, strengths: ['empatia'], preferredRoles: ['setter'], highlight: ' Constancia ' };
      const payload = toAnswersPayload(answers, getVisibleQuestions(answers, ctx));
      expect(validateAssistantAnswers(payload).ok, track).toBe(true);
      expect(Object.keys(payload)).not.toContain('setScore');
    }
  });

  it('omite lo que no se preguntó', () => {
    const ctx = buildAssistantContext({ savedForm: form({ preferredRoles: ['setter'] }) });
    const answers = { ...ctx.defaults, track: 'en_formacion', strengths: ['empatia'] };
    expect(toAnswersPayload(answers, getVisibleQuestions(answers, ctx))).toEqual({ track: 'en_formacion', tone: 'cercano', strengths: ['empatia'] });
  });

  it('validación previa en el navegador', () => {
    const ctx = buildAssistantContext({ savedForm: form() });
    const a = (patch) => ({ ...ctx.defaults, ...patch });
    expect(validateQuestionAnswers(a({ track: '' }), ['track'])).toMatch(/situación/);
    expect(validateQuestionAnswers(a({ track: 'setter_closer', functions: [] }), ['track', 'functions'])).toMatch(/función/);
    expect(validateQuestionAnswers(a({ track: 'comercial_transferible' }), ['track', 'transferable'])).toMatch(/trabajo comercial/);
    expect(validateQuestionAnswers(a({ track: 'en_formacion' }), ['track', 'strengths'])).toBeNull();
  });
});

describe('aplicación del borrador — aprobación explícita', () => {
  const draft = { headline: 'Nuevo titular', summary: 'Nuevo resumen' };

  it('solo titular, solo resumen o ambos', () => {
    expect(planDraftApplication({ current: { headline: '', summary: '' }, draft, selection: { headline: true, summary: false } }).changes).toEqual({ headline: 'Nuevo titular' });
    expect(planDraftApplication({ current: { headline: '', summary: '' }, draft, selection: { headline: false, summary: true } }).changes).toEqual({ summary: 'Nuevo resumen' });
    expect(planDraftApplication({ current: { headline: '', summary: '' }, draft, selection: { headline: true, summary: true } }).changes).toEqual(draft);
  });

  it('reemplazar un texto existente requiere confirmación', () => {
    const plan = planDraftApplication({ current: { headline: 'Mi titular', summary: '' }, draft, selection: { headline: true, summary: true } });
    expect(plan.replacements).toEqual(['titular']);
  });

  it('nada seleccionado, vacío o idéntico → sin cambios', () => {
    expect(planDraftApplication({ current: { headline: '', summary: '' }, draft, selection: { headline: false, summary: false } }).changes).toEqual({});
    expect(planDraftApplication({ current: { headline: '', summary: '' }, draft: { headline: '  ', summary: '' }, selection: { headline: true, summary: true } }).changes).toEqual({});
    expect(planDraftApplication({ current: draft, draft, selection: { headline: true, summary: true } })).toEqual({ changes: {}, replacements: [] });
  });
});
