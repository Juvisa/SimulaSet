import { describe, it, expect } from 'vitest';
import { buildPassportDocument, passportDocumentTitle, formatGeneratedAt, PASSPORT_DISCLAIMER } from './passportDocumentModel';
import { buildPassportEvidence, emptyPassport, passportFromRow } from './passportModel';

const session = (mode = 'outbound', scores = [8]) => ({ mode, scores });
const sessions = (n, mode, scores) => Array.from({ length: n }, () => session(mode, scores));
const GENERATED = new Date('2026-10-13T15:00:00Z');

const fullRow = {
  headline: 'Setter de alto ticket',
  summary: 'Dos años calificando leads.\nEnfocada en infoproductos.',
  country: 'Colombia',
  city: 'Medellín',
  timezone: 'GMT-5',
  availability: 'part_time',
  hours_per_week: 25,
  open_to_opportunities: true,
  languages: [{ language: 'Español', level: 'nativo' }, { language: 'Inglés', level: 'intermedio' }],
  skills: ['Calificación de leads'],
  tools: ['Kommo'],
  niches: ['Infoproductos'],
};

const build = (overrides = {}) => buildPassportDocument({
  name: 'Ronald Monsalve',
  avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/u1/a.png',
  passport: passportFromRow(fullRow),
  evidence: buildPassportEvidence({ sessions: sessions(25), setScore: 80 }),
  generatedAt: GENERATED,
  ...overrides,
});

describe('documento — alumnos existentes y nuevos', () => {
  it('alumno antiguo con simulaciones: evidencia oficial y perfil completo', () => {
    const doc = build();
    expect(doc.training).toMatchObject({ setScore: 80, validSimulations: 25, practiceMinimum: '✓ Mínimo de práctica cumplido' });
    expect(doc.training.practiceLevel.name).toBe('Avanzado');
    expect(doc.training.byMode).toEqual([{ label: 'Outbound', simulations: 25 }]);
    expect(doc.headline).toBe('Setter de alto ticket');
    expect(doc.meta).toEqual(['Medellín, Colombia', 'Medio tiempo · 25 h/semana', 'Zona horaria: GMT-5']);
    expect(doc.openToOpportunities).toBe(true);
    expect(doc.languages).toEqual([{ language: 'Español', level: 'Nativo' }, { language: 'Inglés', level: 'Intermedio' }]);
    expect(doc.tagGroups.map(g => g.title)).toEqual(['Habilidades', 'Herramientas comerciales', 'Nichos de interés']);
    expect(doc.declaredEmpty).toBe(false);
  });

  it('alumno nuevo sin simulaciones ni Passport guardado: sin inventar contenido', () => {
    const doc = build({ name: 'Alumna Nueva', avatarUrl: null, passport: null, evidence: buildPassportEvidence({ sessions: [], setScore: 0 }) });
    expect(doc.declaredEmpty).toBe(true);
    expect(doc.headline).toBe('');
    expect(doc.summary).toBe('');
    expect(doc.meta).toEqual([]);
    expect(doc.languages).toEqual([]);
    expect(doc.tagGroups).toEqual([]);
    expect(doc.training).toMatchObject({ setScore: 0, validSimulations: 0, practiceMinimum: 'En entrenamiento' });
    expect(doc.training.practiceLevel.name).toBe('En inicio');
    expect(doc.training.byMode).toEqual([]);
    expect(doc.avatarUrl).toBeNull();
  });

  it('sesiones sin puntuar no aparecen como práctica en el documento', () => {
    const doc = build({ evidence: buildPassportEvidence({ sessions: [...sessions(4, 'inbound'), session('inbound', [])], setScore: 82 }) });
    expect(doc.training.validSimulations).toBe(4);
    expect(doc.training.byMode).toEqual([{ label: 'Inbound', simulations: 4 }]);
  });
});

describe('documento — perfil incompleto y datos faltantes', () => {
  it('omite cada campo vacío sin dejar huecos ni textos de relleno', () => {
    const doc = build({ passport: { ...emptyPassport(), headline: 'Closer', country: 'México', hoursPerWeek: '' } });
    expect(doc.headline).toBe('Closer');
    expect(doc.meta).toEqual(['México']);
    expect(doc.summary).toBe('');
    expect(doc.languages).toEqual([]);
    expect(doc.tagGroups).toEqual([]);
    expect(doc.declaredEmpty).toBe(false);
  });

  it('disponibilidad sin horas y horas sin disponibilidad', () => {
    expect(build({ passport: { ...emptyPassport(), availability: 'freelance' } }).meta).toEqual(['Freelance / por proyecto']);
    expect(build({ passport: { ...emptyPassport(), hoursPerWeek: '10' } }).meta).toEqual(['10 h/semana']);
  });

  it('solo "abierto a oportunidades" cuenta como contenido declarado', () => {
    const doc = build({ passport: { ...emptyPassport(), openToOpportunities: true } });
    expect(doc.declaredEmpty).toBe(false);
    expect(doc.openToOpportunities).toBe(true);
  });

  it('idiomas sin nombre se descartan; nivel desconocido no se inventa', () => {
    const doc = build({ passport: { ...emptyPassport(), languages: [{ language: '  ', level: 'nativo' }, { language: 'Portugués', level: '' }] } });
    expect(doc.languages).toEqual([{ language: 'Portugués', level: '' }]);
  });

  it('textos largos se conservan íntegros (sin truncar) para que el PDF los muestre completos', () => {
    const summary = 'Párrafo '.repeat(140).trim();
    const doc = build({ passport: { ...emptyPassport(), summary } });
    expect(doc.summary).toBe(summary);
    expect(doc.summary.length).toBeGreaterThan(1000);
  });

  it('sin nombre en el perfil usa un rótulo neutro', () => {
    expect(build({ name: '   ' }).name).toBe('Alumno de SimulaSET');
  });
});

describe('documento — credenciales y privacidad', () => {
  it('sin registros oficiales no hay sección de credenciales', () => {
    expect(build().verified).toEqual([]);
    expect(build({ credentials: undefined }).verified).toEqual([]);
  });

  it('descarta "credenciales" sin emisor, fecha o id (no se simulan)', () => {
    const doc = build({ credentials: [{ title: 'Setter Verified' }, { id: 'c1', title: 'Setter Verified', issuedBy: '', issuedAt: '2026-10-01' }] });
    expect(doc.verified).toEqual([]);
  });

  it('un registro oficial completo sí se muestra', () => {
    const doc = build({ credentials: [{ id: 'c1', title: 'Constancia', issuedBy: 'Digital SET', issuedAt: '2026-10-01T12:00:00Z' }] });
    expect(doc.verified).toHaveLength(1);
    expect(doc.verified[0]).toMatchObject({ title: 'Constancia', issuedBy: 'Digital SET', code: '', verifyUrl: '', isTest: false });
  });

  it('la constancia emitida muestra su código, su verificación pública y si es de prueba', () => {
    const doc = build({ credentials: [{
      id: 'DSF-1A2B-3C4D-5E6F-7A8B', title: 'Constancia de Formación Digital SET', issuedBy: 'DIGITAL SET', issuedAt: '2026-10-17T23:30:25Z',
      code: 'DSF-1A2B-3C4D-5E6F-7A8B', verifyUrl: 'https://project-jscj2.vercel.app/verificar/DSF-1A2B-3C4D-5E6F-7A8B', isTest: true,
    }] });
    expect(doc.verified[0]).toMatchObject({
      title: 'Constancia de Formación Digital SET', issuedBy: 'DIGITAL SET', code: 'DSF-1A2B-3C4D-5E6F-7A8B',
      verifyUrl: 'https://project-jscj2.vercel.app/verificar/DSF-1A2B-3C4D-5E6F-7A8B', isTest: true,
    });
  });

  it('no incluye correo ni datos de contacto aunque vengan en la entrada', () => {
    const doc = build({ passport: { ...passportFromRow(fullRow), email: 'ronald@example.com', phone: '+57 300' } });
    const serialized = JSON.stringify(doc);
    expect(serialized).not.toMatch(/@example\.com|\+57 300/);
    expect(Object.keys(doc)).not.toContain('email');
  });

  it('incluye la nota de que las métricas no son una certificación y la fecha de generación', () => {
    const doc = build();
    expect(doc.disclaimer).toBe(PASSPORT_DISCLAIMER);
    expect(doc.disclaimer).toMatch(/no constituyen por sí mismas una certificación profesional/);
    expect(doc.generatedAtLabel).toBe(formatGeneratedAt(GENERATED));
    expect(doc.generatedAtLabel).toMatch(/2026/);
  });
});

describe('helpers', () => {
  it('título del PDF sin caracteres inválidos de archivo', () => {
    expect(passportDocumentTitle('Ana / Pérez: "QA"')).toBe('SET Passport - Ana Pérez QA');
    expect(passportDocumentTitle('')).toBe('SET Passport');
  });

  it('fecha inválida no rompe', () => {
    expect(formatGeneratedAt('no-es-fecha')).toBe('');
  });
});
