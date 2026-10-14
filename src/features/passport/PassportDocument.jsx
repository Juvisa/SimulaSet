import { useState } from 'react';
import './passportDocument.css';

// Documento profesional de SET Passport. Presentacional: recibe el resultado
// de buildPassportDocument() y no lee datos por su cuenta. Sin botones ni
// campos editables: es lo que se imprime/guarda como PDF.
const Layer = ({ kind, children }) => <span className={`spp-layer spp-layer--${kind}`}>{children}</span>;

const Avatar = ({ url, name }) => {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  if (url && !failed) {
    return <img className="spp-avatar" src={url} alt="" onError={() => setFailed(true)} />;
  }
  return <div className="spp-avatar spp-avatar--fallback spp-serif" aria-hidden="true">{initials}</div>;
};

const PassportDocument = ({ doc }) => (
  <article className="spp-doc" aria-label={`SET Passport de ${doc.name}`}>
    <header className="spp-header">
      <Avatar url={doc.avatarUrl} name={doc.name} />
      <div className="spp-header-text">
        <div className="spp-kicker">SET Passport · Digital SET</div>
        <h1 className="spp-name spp-serif">{doc.name}</h1>
        {doc.headline && <p className="spp-headline">{doc.headline}</p>}
        {(doc.meta.length > 0 || doc.openToOpportunities) && (
          <ul className="spp-meta">
            {doc.meta.map(item => <li key={item}>{item}</li>)}
            {doc.openToOpportunities && <li className="spp-open">Abierto a oportunidades comerciales</li>}
          </ul>
        )}
        {doc.generatedAtLabel && <p className="spp-generated">Documento generado el {doc.generatedAtLabel}</p>}
      </div>
    </header>

    <section className="spp-section">
      <div className="spp-section-head">
        <h2 className="spp-section-title spp-serif">Perfil profesional</h2>
        <Layer kind="declared">Declarado por el alumno</Layer>
      </div>
      {doc.declaredEmpty ? (
        <p className="spp-empty">El alumno aún no ha completado su información profesional.</p>
      ) : (
        <>
          {doc.summary && <p className="spp-summary">{doc.summary}</p>}
          {(doc.languages.length > 0 || doc.tagGroups.length > 0) && (
            <div className="spp-grid">
              {doc.languages.length > 0 && (
                <div className="spp-block">
                  <h3 className="spp-block-title">Idiomas</h3>
                  <ul className="spp-langs">
                    {doc.languages.map(l => (
                      <li key={l.language}><span>{l.language}</span>{l.level && <span>{l.level}</span>}</li>
                    ))}
                  </ul>
                </div>
              )}
              {doc.tagGroups.map(group => (
                <div className="spp-block" key={group.key}>
                  <h3 className="spp-block-title">{group.title}</h3>
                  <ul className="spp-chips">
                    {group.items.map(item => <li className="spp-chip" key={item}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>

    {doc.training && (
      <section className="spp-section">
        <div className="spp-section-head">
          <h2 className="spp-section-title spp-serif">Entrenamiento en SimulaSET</h2>
          <Layer kind="registered">Registrado en SimulaSET</Layer>
        </div>
        <div className="spp-stats">
          <div className="spp-stat">
            <div className="spp-stat-label">SET Score</div>
            <div className="spp-stat-value spp-serif">{doc.training.setScore}<small>/100</small></div>
            <div className="spp-stat-sub">Desempeño promedio en simulaciones puntuadas</div>
          </div>
          <div className="spp-stat">
            <div className="spp-stat-label">Simulaciones puntuadas</div>
            <div className="spp-stat-value spp-serif">{doc.training.validSimulations}</div>
            <div className="spp-stat-sub">Volumen de práctica en simulador</div>
          </div>
          <div className="spp-stat">
            <div className="spp-stat-label">Nivel de práctica</div>
            <div className="spp-stat-value spp-serif">{doc.training.practiceLevel.icon} {doc.training.practiceLevel.name}</div>
            <div className="spp-stat-sub">{doc.training.practiceMinimum}</div>
          </div>
        </div>
        {doc.training.byMode.length > 0 && (
          <p className="spp-note">
            Por modalidad: {doc.training.byMode.map(m => `${m.label} ${m.simulations}`).join(' · ')}.
          </p>
        )}
        <p className="spp-note">
          Conversaciones de venta simuladas con prospectos generados por IA. Es entrenamiento, no experiencia laboral.
        </p>
      </section>
    )}

    {doc.verified.length > 0 && (
      <section className="spp-section">
        <div className="spp-section-head">
          <h2 className="spp-section-title spp-serif">Credenciales</h2>
          <Layer kind="verified">Verificado por Digital SET</Layer>
        </div>
        <ul className="spp-credentials">
          {doc.verified.map(c => <li key={c.id}><strong>{c.title}</strong> — {c.issuedBy}, {c.issuedAt}</li>)}
        </ul>
      </section>
    )}

    <footer className="spp-footer">
      <p>{doc.disclaimer}{doc.generatedAtLabel && ` Generado el ${doc.generatedAtLabel}.`}</p>
      <span className="spp-brand">DIGITAL SET</span>
    </footer>
  </article>
);

export default PassportDocument;
