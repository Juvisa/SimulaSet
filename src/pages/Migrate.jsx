import { useState } from 'react';
import { Download, Upload, Check, AlertTriangle } from 'lucide-react';

const KEYS = ['simulaset_projects', 'simulaset_sessions', 'simulaset_analyses',
  'simulaset_admin_feedback', 'real_leads_sessions', 'follow_up_schedule',
  'simulaset_users', 'simulaset_current_user'];

const Migrate = () => {
  const [exported, setExported] = useState('');
  const [importText, setImportText] = useState('');
  const [importDone, setImportDone] = useState(false);
  const [importError, setImportError] = useState('');

  const handleExport = () => {
    const data = {};
    KEYS.forEach(k => {
      const val = localStorage.getItem(k);
      if (val) data[k] = val;
    });
    setExported(JSON.stringify(data));
  };

  const handleImport = () => {
    setImportError('');
    setImportDone(false);
    try {
      const data = JSON.parse(importText);
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
      setImportDone(true);
      setTimeout(() => window.location.href = '/dashboard', 1500);
    } catch {
      setImportError('JSON inválido — asegúrate de pegar el texto completo');
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black text-text-primary mb-1">Migración de datos</h1>
      <p className="text-text-secondary text-sm mb-8">Transfiere tus datos de localhost a Vercel</p>

      {/* Export */}
      <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-text-primary mb-1">Paso 1 — Exportar (en localhost)</h2>
        <p className="text-text-secondary text-xs mb-4">Abre esta página en <b>localhost:5173/migrate</b> y haz click en Exportar</p>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-accent-coral text-white px-4 py-2.5 rounded-xl font-bold hover:bg-accent-coral/90 transition-all text-sm mb-4"
        >
          <Download size={16} />
          Exportar mis datos
        </button>
        {exported && (
          <div>
            <p className="text-green-400 text-xs mb-2 flex items-center gap-1"><Check size={12} /> Datos listos — selecciona todo y copia (Ctrl+A, Ctrl+C)</p>
            <textarea
              readOnly
              value={exported}
              className="w-full bg-bg-input border border-border-subtle rounded-xl p-3 text-text-secondary text-xs font-mono h-32 focus:outline-none"
              onClick={e => e.target.select()}
            />
          </div>
        )}
      </div>

      {/* Import */}
      <div className="bg-bg-card border border-border-subtle rounded-2xl p-6">
        <h2 className="font-bold text-text-primary mb-1">Paso 2 — Importar (en Vercel)</h2>
        <p className="text-text-secondary text-xs mb-4">Abre esta misma página en tu URL de Vercel, pega el texto copiado y haz click en Importar</p>
        <textarea
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder='Pega aquí el JSON copiado del paso 1...'
          className="w-full bg-bg-input border border-border-subtle rounded-xl p-3 text-text-secondary text-xs font-mono h-32 focus:outline-none focus:border-accent-coral mb-4 resize-none"
        />
        {importError && (
          <div className="flex items-center gap-2 text-red-400 text-xs mb-3">
            <AlertTriangle size={12} /> {importError}
          </div>
        )}
        {importDone && (
          <div className="flex items-center gap-2 text-green-400 text-xs mb-3">
            <Check size={12} /> Datos importados — redirigiendo al dashboard...
          </div>
        )}
        <button
          onClick={handleImport}
          disabled={!importText.trim()}
          className="flex items-center gap-2 bg-accent-gold text-black px-4 py-2.5 rounded-xl font-bold hover:bg-accent-gold/90 transition-all text-sm disabled:opacity-40"
        >
          <Upload size={16} />
          Importar y restaurar datos
        </button>
      </div>
    </div>
  );
};

export default Migrate;
