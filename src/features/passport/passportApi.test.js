import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cliente Supabase simulado: registra cada llamada y responde con lo que el
// test programe en `responses` (en orden), ya sea al resolver `.single()` /
// `.maybeSingle()` o al hacer `await` de la consulta (paginación).
const calls = [];
let responses = [];
const builder = (table) => {
  const record = { table, ops: [] };
  calls.push(record);
  const chain = {};
  ['select', 'eq', 'insert', 'update', 'order', 'range'].forEach((op) => {
    chain[op] = (...args) => { record.ops.push([op, ...args]); return chain; };
  });
  const settle = () => Promise.resolve(responses.shift() || { data: null, error: null });
  chain.maybeSingle = settle;
  chain.single = settle;
  chain.then = (resolve, reject) => settle().then(resolve, reject);
  return chain;
};
vi.mock('../../lib/supabase', () => ({ supabase: { from: (table) => builder(table) } }));

const { getMyPassport, saveMyPassport, getMyTrainingSessions, describeSaveError } = await import('./passportApi');

beforeEach(() => { calls.length = 0; responses = []; });

const row = (i, scores = [8]) => ({ id: `s${i}`, mode: 'outbound', scores, created_at: `2026-09-${String(i).padStart(2, '0')}T10:00:00Z` });

describe('getMyPassport', () => {
  it('alumno sin registro previo → passport null, disponible', async () => {
    responses = [{ data: null, error: null }];
    expect(await getMyPassport('u1')).toEqual({ passport: null, unavailable: false, error: undefined });
  });

  it('tabla aún no creada (respuesta real de Supabase: PGRST205) → unavailable, sin error visible', async () => {
    responses = [{ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.setter_passports' in the schema cache" } }];
    expect(await getMyPassport('u1')).toEqual({ passport: null, unavailable: true, error: undefined });
  });

  it('otros errores sí se reportan', async () => {
    responses = [{ data: null, error: { code: '42501', message: 'permission denied' } }];
    expect((await getMyPassport('u1')).error).toBe('permission denied');
  });
});

describe('getMyTrainingSessions — historial completo paginado', () => {
  it('historial corto: una sola consulta, filtrada por el alumno y con orden estable', async () => {
    responses = [{ data: [row(1), row(2, [])], error: null, count: 2 }];
    const result = await getMyTrainingSessions('u1');
    expect(result).toMatchObject({ complete: true, error: undefined });
    expect(result.sessions).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].ops).toContainEqual(['eq', 'user_id', 'u1']);
    expect(calls[0].ops).toContainEqual(['order', 'created_at', { ascending: true }]);
    expect(calls[0].ops).toContainEqual(['order', 'id', { ascending: true }]);
    expect(calls[0].ops).toContainEqual(['select', 'id, mode, scores, created_at', { count: 'exact' }]);
  });

  it('max_rows del servidor menor que la página (2 filas por respuesta): sigue hasta el total', async () => {
    responses = [
      { data: [row(1), row(2)], error: null, count: 5 },
      { data: [row(3), row(4)], error: null },
      { data: [row(5)], error: null },
    ];
    const result = await getMyTrainingSessions('u1');
    expect(result.complete).toBe(true);
    expect(result.sessions.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    // Avanza con las filas realmente recibidas, no con el tamaño de página pedido.
    expect(calls[1].ops).toContainEqual(['range', 2, 1001]);
    expect(calls[2].ops).toContainEqual(['range', 4, 1003]);
  });

  it('no cuenta dos veces una sesión que aparece en dos páginas', async () => {
    responses = [
      { data: [row(1), row(2)], error: null, count: 3 },
      { data: [row(2), row(3)], error: null },
    ];
    const result = await getMyTrainingSessions('u1');
    expect(result.sessions.map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('historial vacío (alumno nuevo)', async () => {
    responses = [{ data: [], error: null, count: 0 }];
    expect(await getMyTrainingSessions('u1')).toEqual({ sessions: [], error: undefined, complete: true });
  });

  it('error a mitad de la paginación → se reporta como incompleto', async () => {
    responses = [
      { data: [row(1), row(2)], error: null, count: 4 },
      { data: null, error: { message: 'timeout' } },
    ];
    const result = await getMyTrainingSessions('u1');
    expect(result).toMatchObject({ complete: false, error: 'timeout' });
    expect(result.sessions).toHaveLength(2);
  });

  it('sin count del servidor: se detiene cuando una página viene incompleta', async () => {
    responses = [{ data: [row(1)], error: null, count: null }];
    const result = await getMyTrainingSessions('u1');
    expect(result.complete).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('normaliza scores no-array a [] (no cuentan como válidas)', async () => {
    responses = [{ data: [{ id: 'x', mode: 'inbound', scores: null, created_at: '2026-09-01' }], error: null, count: 1 }];
    expect((await getMyTrainingSessions('u1')).sessions[0].scores).toEqual([]);
  });
});

describe('saveMyPassport', () => {
  const payload = { headline: 'Setter', skills: [] };

  it('primer guardado (sin registro previo) → insert con user_id', async () => {
    responses = [{ data: { user_id: 'u1', headline: 'Setter' }, error: null }];
    const result = await saveMyPassport({ userId: 'u1', payload, exists: false });
    expect(result.error).toBeUndefined();
    const [, insert] = calls[0].ops.find(op => op[0] === 'insert');
    expect(insert).toEqual({ headline: 'Setter', skills: [], user_id: 'u1' });
  });

  it('registro existente → update SIN user_id en el payload', async () => {
    responses = [{ data: { user_id: 'u1' }, error: null }];
    await saveMyPassport({ userId: 'u1', payload, exists: true });
    const ops = calls[0].ops;
    expect(ops.some(op => op[0] === 'insert')).toBe(false);
    const [, update] = ops.find(op => op[0] === 'update');
    expect(update).not.toHaveProperty('user_id');
    expect(ops).toContainEqual(['eq', 'user_id', 'u1']);
  });

  it('solo escribe en setter_passports (nunca en onboarding, commercial_profiles ni simulator_sessions)', async () => {
    responses = [{ data: { user_id: 'u1' }, error: null }];
    await saveMyPassport({ userId: 'u1', payload, exists: false });
    expect(calls.map(c => c.table)).toEqual(['setter_passports']);
  });

  it('carrera entre pestañas: insert con PK duplicada (23505) cae a update', async () => {
    responses = [
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: { user_id: 'u1', headline: 'Setter' }, error: null },
    ];
    const result = await saveMyPassport({ userId: 'u1', payload, exists: false });
    expect(result.error).toBeUndefined();
    expect(result.passport.headline).toBe('Setter');
    expect(calls[1].ops.some(op => op[0] === 'update')).toBe(true);
  });

  it('rechazo por RLS (p. ej. cuenta inactiva) → mensaje claro, sin jerga técnica', async () => {
    responses = [{ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "setter_passports"' } }];
    const { error } = await saveMyPassport({ userId: 'u1', payload, exists: false });
    expect(error).toMatch(/no tiene permiso/);
    expect(error).not.toMatch(/row-level/);
  });
});

describe('describeSaveError', () => {
  it.each([
    [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, /Recarga la página/],
    [{ code: '23514', message: 'violates check constraint' }, /límites permitidos/],
    [{ code: 'PGRST205', message: "Could not find the table 'public.setter_passports'" }, /no está habilitado/],
    [{ code: 'XX000', message: 'algo raro' }, /algo raro/],
  ])('%o', (error, expected) => {
    expect(describeSaveError(error)).toMatch(expected);
  });

  it('sin error → undefined', () => {
    expect(describeSaveError(null)).toBeUndefined();
  });
});
