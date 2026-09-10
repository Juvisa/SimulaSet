import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const INPUT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm focus:border-accent-coral transition-colors outline-none";

const ResetPassword = () => {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden'); return; }

    setLoading(true);
    const { error: updateError } = await updatePassword(newPassword);
    setLoading(false);
    if (updateError) { setError(updateError); return; }
    setSuccess(true);
    setTimeout(() => navigate('/dashboard'), 2500);
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black mb-2">
            <span className="text-accent-coral">Simula</span>
            <span className="text-text-primary">SET</span>
          </h1>
          <p className="text-text-secondary text-sm italic">Crea tu nueva contraseña.</p>
        </div>

        <div className="bg-bg-card border border-border-subtle rounded-2xl p-8">
          {success ? (
            <div className="text-center">
              <CheckCircle2 size={40} className="mx-auto text-green-400" />
              <h2 className="mt-4 text-lg font-black text-text-primary">¡Contraseña actualizada!</h2>
              <p className="mt-2 text-sm text-text-secondary">Te llevamos a tu panel en un momento...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-black text-text-primary">Restablece tu contraseña</h2>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Nueva contraseña</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT + ' pr-11'} placeholder="Mínimo 6 caracteres" required />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Confirmar nueva contraseña</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={INPUT + ' pr-11'} placeholder="Repite tu contraseña" required />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
              )}

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-accent-coral hover:bg-accent-coral/90 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 mt-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
