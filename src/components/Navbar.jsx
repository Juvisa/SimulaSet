import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRealLeads } from '../utils/storage';
import { verificarSeguimientosPendientes } from '../utils/followUpChecker';
import { LayoutDashboard, FolderOpen, MessageSquare, LogOut, Shield, Users, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [activeLeads, setActiveLeads] = useState(0);
  const [pendingFollowUpCount, setPendingFollowUpCount] = useState(0);

  useEffect(() => {
    if (user?.id) {
      const leads = getRealLeads(user.id);
      setActiveLeads(leads.filter(l => l.estado === 'activo' || l.estado === 'fantasma').length);
      const fu = verificarSeguimientosPendientes(user.id);
      setPendingFollowUpCount(fu.total_activos);
    }
  }, [user, location.pathname]);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const setterLinks = [
    { to: '/dashboard',  icon: LayoutDashboard, label: 'Inicio', badge: pendingFollowUpCount },
    { to: '/projects',   icon: FolderOpen,      label: 'Proyectos' },
    { to: '/leads-reales', icon: Users,          label: 'Leads', badge: activeLeads },
    { to: '/analyzer',   icon: MessageSquare,    label: 'Copilot' },
    { to: '/analytics',  icon: TrendingUp,       label: 'Stats' },
  ];

  const adminLinks = [
    { to: '/dashboard',        icon: LayoutDashboard, label: 'Inicio' },
    { to: '/admin',            icon: Shield,          label: 'Admin' },
    { to: '/admin/analytics',  icon: TrendingUp,      label: 'Analítica' },
  ];

  const links = user?.role === 'admin' ? adminLinks : setterLinks;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg-card border-t border-border-subtle md:relative md:border-t-0 md:border-b md:border-border-subtle">
      <div className="max-w-6xl mx-auto px-4">
        {/* Desktop */}
        <div className="hidden md:flex items-center justify-between h-16">
          <Link to={user?.role === 'admin' ? '/admin' : '/dashboard'} className="flex items-center gap-1">
            <span className="text-xl font-black text-accent-coral">Simula</span>
            <span className="text-xl font-black text-text-primary">SET</span>
          </Link>
          <div className="flex items-center gap-1">
            {links.map(({ to, icon: Icon, label, badge }) => (
              <Link
                key={to}
                to={to}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive(to)
                    ? to === '/leads-reales'
                      ? 'text-white'
                      : 'bg-accent-coral text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-input'
                }`}
                style={isActive(to) && to === '/leads-reales' ? { backgroundColor: '#C9920A' } : {}}
              >
                <Icon size={16} />
                {label}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 text-xs bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-secondary">{user?.name}</span>
            <button onClick={logout} className="text-text-secondary hover:text-accent-coral transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Mobile */}
        <div className="flex md:hidden items-center justify-around h-16">
          {links.map(({ to, icon: Icon, label, badge }) => (
            <Link
              key={to}
              to={to}
              className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all ${
                isActive(to)
                  ? to === '/leads-reales' ? '' : 'text-accent-coral'
                  : 'text-text-secondary'
              }`}
              style={isActive(to) && to === '/leads-reales' ? { color: '#C9920A' } : {}}
            >
              <Icon size={20} />
              <span className="text-xs">{label}</span>
              {badge > 0 && (
                <span className="absolute -top-0 right-1 text-xs bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                  {badge}
                </span>
              )}
            </Link>
          ))}
          <button onClick={logout} className="flex flex-col items-center gap-1 px-3 py-2 text-text-secondary">
            <LogOut size={20} />
            <span className="text-xs">Salir</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
