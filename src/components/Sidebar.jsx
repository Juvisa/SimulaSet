import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { verificarSeguimientosPendientes } from '../utils/followUpChecker';
import { getLevelInfo, getProgressToNext } from '../utils/levels';
import {
  LayoutDashboard, Dumbbell, Zap, BookOpen, Shield, ShieldCheck, ListChecks, TrendingUp,
  BriefcaseBusiness, Gift, Trophy, Search, LogOut, X, GraduationCap, Sparkles,
} from 'lucide-react';

const isPathActive = (pathname, to) => pathname === to || pathname.startsWith(to + '/');

const SidebarLink = ({ to, icon: Icon, label, badge, disabled, active, onNavigate }) => {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary/50 cursor-not-allowed select-none">
        <Icon size={17} />
        <span className="flex-1 truncate">{label}</span>
        <span className="text-[10px] border border-border-subtle rounded-full px-1.5 py-0.5 shrink-0">Pronto</span>
      </div>
    );
  }
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-input'
      }`}
    >
      <Icon size={17} />
      <span className="flex-1 truncate">{label}</span>
      {Boolean(badge) && badge > 0 && (
        <span className="text-[11px] bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold shrink-0">
          {badge}
        </span>
      )}
    </Link>
  );
};

const NavSection = ({ title, items, pathname, onNavigate }) => (
  <div className="mb-5">
    <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/70">{title}</p>
    <div className="space-y-0.5">
      {items.map((item) => (
        <SidebarLink
          key={item.label}
          {...item}
          active={item.to ? isPathActive(pathname, item.to) : false}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  </div>
);

const Sidebar = ({ mobileOpen, onCloseMobile }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('ds_view_mode') || 'alumno';
    } catch {
      return 'alumno';
    }
  });
  useEffect(() => {
    if (!isAdmin) return;
    try {
      localStorage.setItem('ds_view_mode', viewMode);
    } catch {
      /* almacenamiento no disponible, se ignora */
    }
  }, [viewMode, isAdmin]);
  const adminView = isAdmin && viewMode === 'admin';

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');

  const pendingFollowUpCount = user?.id
    ? verificarSeguimientosPendientes(user.id).total_activos
    : 0;

  const trainingItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Panel / Inicio' },
    { to: '/simulate', icon: Dumbbell, label: 'Simulador IA' },
    { to: '/leads-reales', icon: Zap, label: 'SET Copilot', badge: pendingFollowUpCount },
    { to: '/value-builder', icon: Sparkles, label: 'SET Value Builder' },
    { to: '/academy', icon: BookOpen, label: 'SET Academy' },
  ];

  const trackingItems = [
    ...(adminView ? [
      { to: '/admin', icon: Shield, label: 'Pulso de Cohorte' },
      { to: '/empresa', icon: ShieldCheck, label: 'Centro de Auditoría' },
    ] : []),
    { to: '/missions', icon: ListChecks, label: 'Misiones & Tareas' },
    { to: adminView ? '/admin/analytics' : '/analytics', icon: TrendingUp, label: 'Analítica' },
    { to: '/oportunidades', icon: BriefcaseBusiness, label: 'Bolsa de Empleo' },
  ];

  const communityItems = [
    { to: '/set-wins', icon: Trophy, label: 'SET WINS' },
    { to: '/recompensas', icon: Gift, label: 'Tienda de Recompensas' },
  ];

  const allSearchable = [...trainingItems, ...trackingItems, ...communityItems].filter((item) => item.to);
  const searchQuery = query.trim().toLowerCase();
  const filteredResults = searchQuery
    ? allSearchable.filter((item) => item.label.toLowerCase().includes(searchQuery))
    : allSearchable;

  const closePalette = () => {
    setPaletteOpen(false);
    setQuery('');
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === 'Escape') closePalette();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleNavigate = () => {
    if (onCloseMobile) onCloseMobile();
  };

  const goTo = (to) => {
    navigate(to);
    closePalette();
    handleNavigate();
  };

  const initials = (user?.name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const levelInfo = getLevelInfo(user?.level || 1);
  const progress = getProgressToNext(user);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-[260px] h-screen flex flex-col bg-bg-card border-r border-border-subtle transform transition-transform duration-200 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" onClick={handleNavigate} className="flex items-center gap-1">
              <span className="text-xl font-black text-accent-coral">DIGITAL</span>
              <span className="text-xl font-black text-text-primary">SET</span>
            </Link>
            <button onClick={onCloseMobile} className="md:hidden text-text-secondary hover:text-text-primary">
              <X size={20} />
            </button>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            <Search size={15} />
            <span className="flex-1 text-left">Buscar...</span>
            <kbd className="text-[10px] border border-border-subtle rounded px-1.5 py-0.5">Ctrl K</kbd>
          </button>

          {isAdmin && (
            <div className="mt-3 flex items-center gap-1 bg-bg-input rounded-lg p-1">
              <button
                onClick={() => setViewMode('alumno')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
                  !adminView ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Vista Alumno
              </button>
              <button
                onClick={() => setViewMode('admin')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
                  adminView ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Vista Admin
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavSection title="Entrenamiento" items={trainingItems} pathname={location.pathname} onNavigate={handleNavigate} />
          <NavSection title="Seguimiento & Cohorte" items={trackingItems} pathname={location.pathname} onNavigate={handleNavigate} />
          <NavSection title="Comunidad" items={communityItems} pathname={location.pathname} onNavigate={handleNavigate} />
        </nav>

        {/* Footer: perfil */}
        <div className="border-t border-border-subtle p-3">
          <Link
            to="/profile"
            onClick={handleNavigate}
            className="w-full flex items-center gap-3 rounded-lg p-2 hover:bg-bg-input transition-colors text-left"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ backgroundColor: levelInfo.color }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{user?.name || 'Usuario'}</p>
              <p className="text-xs text-text-secondary truncate flex items-center gap-1">
                <GraduationCap size={11} /> Nivel {user?.level || 1} · {levelInfo.name}
              </p>
              <div className="mt-1 h-1 rounded-full bg-bg-input overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, progress.percent || 0))}%`, backgroundColor: levelInfo.color }}
                />
              </div>
            </div>
          </Link>
          <button
            onClick={logout}
            className="mt-1 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-secondary hover:text-accent-coral hover:bg-bg-input transition-colors"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Command palette */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center pt-24 px-4"
          onClick={closePalette}
        >
          <div
            className="w-full max-w-md bg-bg-card border border-border-subtle rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
              <Search size={16} className="text-text-secondary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar sección..."
                className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-secondary"
              />
              <kbd className="text-[10px] text-text-secondary border border-border-subtle rounded px-1.5 py-0.5">Esc</kbd>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filteredResults.length === 0 && (
                <p className="px-4 py-6 text-sm text-text-secondary text-center">Sin resultados</p>
              )}
              {filteredResults.map((item) => (
                <button
                  key={item.label}
                  onClick={() => goTo(item.to)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary text-left transition-colors"
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
