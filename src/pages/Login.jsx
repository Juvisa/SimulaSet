import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, X, Loader2 } from 'lucide-react';

const INPUT = "w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary text-sm focus:border-accent-coral transition-colors outline-none";

const Login = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('mode') === 'register' ? 'register' : 'login');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const { login, register, requestPasswordReset, authError } = useAuth();
  const navigate = useNavigate();

  const switchMode = (m) => { setMode(m); setError(''); };

  const closeReset = () => { setShowReset(false); setResetEmail(''); setResetSent(false); setResetError(''); };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    const { error: resetErrorMsg } = await requestPasswordReset(resetEmail.trim());
    setResetLoading(false);
    if (resetErrorMsg) { setResetError(resetErrorMsg); return; }
    setResetSent(true);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(loginEmail.trim(), loginPassword);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    navigate(result.user.role === 'admin' ? '/admin' : '/dashboard');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!regName.trim()) { setError('El nombre es obligatorio'); return; }
    if (regPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (regPassword !== regConfirm) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true);
    const result = await register(regName.trim(), regEmail.trim(), regPassword);
    setLoading(false);
    if (result.error) {
      setError(result.error.includes('ya registrado')
        ? 'Este email ya está registrado. ¿Quieres iniciar sesión?'
        : result.error);
      return;
    }
    if (result.needsConfirmation) {
      setError('Revisa tu correo para confirmar la cuenta antes de iniciar sesión.');
      setMode('login');
      return;
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black mb-2">
            <span className="text-accent-coral">Simula</span>
            <span className="text-text-primary">SET</span>
          </h1>
          <p className="text-text-secondary text-sm italic">Practica sin miedo. Cierra con convicción.</p>
        </div>

        <div className="bg-bg-card border border-border-subtle rounded-2xl p-8">
          <div className="flex gap-1 bg-bg-primary rounded-xl p-1 mb-6">
            {['login', 'register'].map(m => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                {m === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </button>
            ))}
          </div>

          {(error || authError) && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
              {error || authError}
              {error.includes('iniciar sesión') && (
                <button onClick={() => switchMode('login')} className="underline ml-1 font-medium">Ir a login</button>
              )}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
                <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className={INPUT} placeholder="tu@email.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Contraseña</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className={INPUT + ' pr-11'} placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button type="button" onClick={() => setShowReset(true)} className="mt-1.5 text-xs font-medium text-text-secondary hover:text-accent-coral">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-accent-coral hover:bg-accent-coral/90 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 mt-2">
                {loading ? 'Entrando...' : 'Entrar →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre completo</label>
                <input type="text" value={regName} onChange={e => setRegName(e.target.value)} className={INPUT} placeholder="Tu nombre completo" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} className={INPUT} placeholder="tu@email.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Contraseña</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)} className={INPUT + ' pr-11'} placeholder="Mínimo 6 caracteres" required />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Confirmar contraseña</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} value={regConfirm} onChange={e => setRegConfirm(e.target.value)} className={INPUT + ' pr-11'} placeholder="Repite tu contraseña" required />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-accent-coral hover:bg-accent-coral/90 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 mt-2">
                {loading ? 'Creando cuenta...' : 'Crear mi cuenta →'}
              </button>
            </form>
          )}
        </div>
      </div>

      {showReset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" onClick={closeReset}>
          <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-black text-text-primary">Recuperar contraseña</h2>
              <button onClick={closeReset} className="text-text-secondary hover:text-text-primary"><X size={18} /></button>
            </div>

            {resetSent ? (
              <p className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                Te enviamos un enlace de recuperación. Revisa tu bandeja de entrada y la carpeta de spam.
              </p>
            ) : (
              <form onSubmit={handleRequestReset} className="mt-4 space-y-3">
                <p className="text-sm text-text-secondary">Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>
                <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={INPUT} placeholder="tu@email.com" required />
                {resetError && <p className="text-xs text-red-400">{resetError}</p>}
                <button type="submit" disabled={resetLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-coral py-3 text-sm font-bold text-white transition-all hover:bg-accent-coral/90 disabled:opacity-50">
                  {resetLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {resetLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
