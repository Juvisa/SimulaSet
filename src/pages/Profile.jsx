import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSessions, getUsers, updatePassword } from '../utils/storage';
import { getRealLeads } from '../utils/storage';
import Layout from '../components/Layout';
import { User, Lock, LogOut, Check, AlertTriangle } from 'lucide-react';

const INPUT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm focus:border-accent-coral transition-colors outline-none";
const LABEL = "block text-sm font-medium text-text-secondary mb-1.5";

const NIVEL_LABELS = {
  1: 'Setter Novato',
  2: 'Setter Activo',
  3: 'Setter Intermedio',
  4: 'Setter Pro',
  5: 'Setter Élite',
};

const Profile = () => {
  const { user, logout } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const sessions = getSessions(user.id);
  const leads = getRealLeads(user.id);
  const avg = sessions.length > 0
    ? Math.round(sessions.reduce((a, s) => a + (s.globalScore || 0), 0) / sessions.length)
    : 0;

  const nivel = NIVEL_LABELS[user.level] || 'Setter Novato';
  const stars = Math.min(user.level || 1, 5);

  const fechaRegistro = (() => {
    const users = getUsers();
    const u = users.find(x => x.id === user.id);
    if (!u?.fecha_registro) return 'N/A';
    return new Date(u.fecha_registro).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  })();

  const handleChangePw = (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (newPw.length < 6) { setPwError('Mínimo 6 caracteres'); return; }
    if (newPw !== confirmPw) { setPwError('Las contraseñas no coinciden'); return; }
    setSaving(true);
    const result = updatePassword(user.id, newPw);
    setSaving(false);
    if (result.error) { setPwError(result.error); return; }
    setPwSuccess(true);
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setTimeout(() => setPwSuccess(false), 3000);
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Mi Perfil</h1>

        {/* Avatar + info */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-accent-coral/20 border border-accent-coral/30 flex items-center justify-center text-xl font-black text-accent-coral flex-shrink-0">
              {(user.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-text-primary text-lg">{user.name}</div>
              <div className="text-text-secondary text-sm">{user.email}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-sm font-medium text-accent-gold">{nivel}</span>
                <span className="text-accent-gold text-xs">{'⭐'.repeat(stars)}</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-text-secondary border-t border-border-subtle pt-3">
            Miembro desde {fechaRegistro}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
            <div className="text-xl font-black text-accent-coral">{sessions.length}</div>
            <div className="text-text-secondary text-xs">Simulaciones</div>
          </div>
          <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
            <div className="text-xl font-black text-color-success">{avg}</div>
            <div className="text-text-secondary text-xs">Promedio</div>
          </div>
          <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
            <div className="text-xl font-black text-accent-gold">{leads.filter(l => l.estado === 'activo' || l.estado === 'agendado').length}</div>
            <div className="text-text-secondary text-xs">Leads activos</div>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-text-secondary" />
            <h3 className="font-bold text-text-primary">Cambiar contraseña</h3>
          </div>
          {pwError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3 text-red-400 text-xs">
              <AlertTriangle size={12} /> {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2 mb-3 text-green-400 text-xs">
              <Check size={12} /> Contraseña actualizada
            </div>
          )}
          <form onSubmit={handleChangePw} className="space-y-3">
            <div>
              <label className={LABEL}>Nueva contraseña</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={INPUT} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label className={LABEL}>Confirmar contraseña</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={INPUT} placeholder="Repite la nueva contraseña" />
            </div>
            <button type="submit" disabled={saving || !newPw || !confirmPw}
              className="flex items-center gap-2 bg-accent-coral text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-accent-coral/90 transition-all disabled:opacity-40">
              <Check size={14} />
              {saving ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        </div>

        {/* Logout */}
        <button onClick={logout}
          className="w-full flex items-center justify-center gap-2 bg-bg-card border border-red-500/30 text-red-400 py-3 rounded-2xl font-medium hover:bg-red-500/10 transition-all">
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </Layout>
  );
};

export default Profile;
