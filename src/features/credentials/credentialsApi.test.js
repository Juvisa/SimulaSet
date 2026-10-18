import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args) => rpc(...args), from: (...args) => from(...args) } }));

const { getTrainingCertificateStatus, issueTrainingCertificate, verifyCredential } = await import('./credentialsApi');

describe('credentialsApi', () => {
  beforeEach(() => { rpc.mockReset(); from.mockReset(); });

  it('lee el estado con la RPC del servidor', async () => {
    rpc.mockResolvedValue({ data: { eligible: true }, error: null });
    expect(await getTrainingCertificateStatus()).toEqual({ status: { eligible: true }, error: undefined, unavailable: false });
    expect(rpc).toHaveBeenCalledWith('get_training_certificate_status');
  });

  it('marca "no disponible" si la migración no está aplicada (PGRST202)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await getTrainingCertificateStatus()).toMatchObject({ status: null, unavailable: true });
  });

  it('emite solo con la versión de consentimiento, sin enviar datos del alumno', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'issued' }, error: null });
    expect(await issueTrainingCertificate({ consentVersion: 'publica_v1' })).toEqual({ result: { outcome: 'issued' }, error: undefined });
    expect(rpc).toHaveBeenCalledWith('issue_training_certificate', { p_consent_version: 'publica_v1' });
  });

  it('verifica con la RPC pública', async () => {
    rpc.mockResolvedValue({ data: { found: false }, error: null });
    expect(await verifyCredential('DSF-1A2B-3C4D-5E6F-7A8B')).toMatchObject({ result: { found: false } });
    expect(rpc).toHaveBeenCalledWith('verify_credential', { p_code: 'DSF-1A2B-3C4D-5E6F-7A8B' });
  });

  it('nunca escribe tablas directamente', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await getTrainingCertificateStatus();
    await issueTrainingCertificate({ consentVersion: 'publica_v1' });
    await verifyCredential('x');
    expect(from).not.toHaveBeenCalled();
  });
});
