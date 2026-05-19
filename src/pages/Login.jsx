import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser } from '../utils/storage';
import { Eye, EyeOff } from 'lucide-react';

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

  const { login } = useAuth();
  const navigate = useNavigate();

  const switchMode = (m) => { setMode(m); setError(''); };

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = loginUser(loginEmail.trim(), loginPassword);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    login(result.user);
    navigate(result.user.role === 'admin' ? '/admin' : '/dashboard');
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setError('');
    if (!regName.trim()) { setError('El nombre es obligatorio'); return; }
    if (regPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (regPassword !== regConfirm) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true);
    const result = registerUser(regName.trim(), regEmail.trim(), regPassword);
    setLoading(false);
    if (result.error) {
      setError(result.error.includes('ya registrado')
        ? 'Este email ya está registrado. ¿Quieres iniciar sesión?'
        : result.error);
      return;
    }
    login(result.user);
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

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
              {error}
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
    </div>
  );
};

export default Login;
