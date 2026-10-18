import { describe, expect, it } from 'vitest';
import { describeIssueOutcome, describeRequiredLesson, describeVerification, formatCredentialDate, getCertificatePanelState } from './trainingCertificateModel';

const lesson = (overrides) => ({ module_id: 'week-01', lesson_id: 'l1', title: 'Clase 1', status: 'pending', completion_source: null, verified_percent: null, ok: false, ...overrides });
const definition = { title: 'Constancia de Formación Digital SET', issuer: 'DIGITAL SET', consent_version: 'publica_v1', consent_text: 'Acepto…' };
const status = (overrides = {}) => ({
  definition,
  lessons: [
    lesson({ lesson_id: 'l1', ok: true, status: 'completed', completion_source: 'verified_watch', verified_percent: 91.4 }),
    lesson({ lesson_id: 'l2', ok: true, status: 'completed', completion_source: 'verified_watch', verified_percent: 85 }),
    lesson({ lesson_id: 'l3', status: 'completed', completion_source: 'legacy_self_reported' }),
    lesson({ lesson_id: 'l4' }),
  ],
  eligible: false,
  credential: null,
  blocked: false,
  ...overrides,
});

describe('describeRequiredLesson', () => {
  it('distingue verificada, legacy y pendiente', () => {
    expect(describeRequiredLesson(lesson({ ok: true, verified_percent: 91.4 }))).toMatchObject({ state: 'verified', label: expect.stringContaining(`91${String.fromCharCode(160)}%`) });
    expect(describeRequiredLesson(lesson({ status: 'completed', completion_source: 'legacy_self_reported' })).state).toBe('legacy');
    expect(describeRequiredLesson(lesson({ status: 'completed', completion_source: 'self_reported' })).state).toBe('unverified');
    expect(describeRequiredLesson(lesson()).state).toBe('pending');
  });
});

describe('getCertificatePanelState', () => {
  it('carga, no disponible y error', () => {
    expect(getCertificatePanelState({ loading: true }).kind).toBe('loading');
    expect(getCertificatePanelState({ unavailable: true }).kind).toBe('unavailable');
    expect(getCertificatePanelState({ error: 'x' })).toMatchObject({ kind: 'error', message: 'x' });
    expect(getCertificatePanelState({}).kind).toBe('error');
  });

  it('en progreso cuenta solo las verificadas (legacy no cuenta)', () => {
    expect(getCertificatePanelState({ status: status() })).toMatchObject({ kind: 'in_progress', verifiedCount: 2, total: 4 });
  });

  it('elegible solo si el servidor lo dice', () => {
    expect(getCertificatePanelState({ status: status({ eligible: true }) }).kind).toBe('eligible');
  });

  it('emitida tiene prioridad; bloqueada si fue revocada por fraude', () => {
    const credential = { public_code: 'DSF-1A2B-3C4D-5E6F-7A8B', status: 'active' };
    expect(getCertificatePanelState({ status: status({ eligible: true, credential }) })).toMatchObject({ kind: 'issued', credential });
    expect(getCertificatePanelState({ status: status({ eligible: true, blocked: true }) }).kind).toBe('blocked');
  });
});

describe('describeIssueOutcome', () => {
  it('traduce cada resultado del servidor', () => {
    expect(describeIssueOutcome({ outcome: 'issued', credential: { public_code: 'x' } })).toMatchObject({ ok: true, credential: { public_code: 'x' } });
    expect(describeIssueOutcome({ outcome: 'already_issued' }).ok).toBe(true);
    for (const outcome of ['consent_required', 'not_eligible', 'name_required', 'blocked', 'otra']) {
      expect(describeIssueOutcome({ outcome }).ok).toBe(false);
    }
    expect(describeIssueOutcome(null, 'fallo de red')).toMatchObject({ ok: false, text: expect.stringContaining('fallo de red') });
  });
});

describe('describeVerification', () => {
  const found = { found: true, public_code: 'DSF-1A2B-3C4D-5E6F-7A8B', holder_name: 'María José Pérez', title: 'Constancia de Formación Digital SET',
    issuer: 'DIGITAL SET', issued_at: '2026-10-17T23:30:25Z', status: 'active', revoked_at: null, is_test: false, description: 'No evalúa competencias.' };

  it('válida, revocada, de prueba y no encontrada', () => {
    expect(describeVerification(found)).toMatchObject({ kind: 'valid', holderName: 'María José Pérez', issuer: 'DIGITAL SET', isTest: false });
    expect(describeVerification({ ...found, status: 'revoked', revoked_at: '2026-10-18T10:00:00Z' })).toMatchObject({ kind: 'revoked', revokedAt: expect.stringContaining('2026') });
    expect(describeVerification({ ...found, is_test: true }).isTest).toBe(true);
    expect(describeVerification({ found: false }).kind).toBe('not_found');
    expect(describeVerification(null).kind).toBe('not_found');
  });
});

describe('formatCredentialDate', () => {
  it('formatea en español y tolera fechas inválidas', () => {
    expect(formatCredentialDate(new Date(2026, 9, 17))).toBe('17 de octubre de 2026');
    expect(formatCredentialDate('no-es-fecha')).toBe('');
  });
});
