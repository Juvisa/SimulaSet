import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsers, getAllSessions, getAllAnalyses, getAllProjects } from '../utils/storage';
import Layout from '../components/Layout';
import LevelBadge from '../components/LevelBadge';
import ModeBadge from '../components/ModeBadge';
import { Users, Play, BarChart2, TrendingUp, ChevronRight, Search } from 'lucide-react';

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="bg-bg-card border border-border-subtle rounded-2xl p-5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-text-secondary text-xs font-medium uppercase tracking-wider">{label}</span>
      <Icon size={16} style={{ color }} />
    </div>
    <div className="text-2xl font-black text-text-primary">{value}</div>
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');

  useEffect(() => {
    setUsers(getUsers());
    setSessions(getAllSessions());
    setAnalyses(getAllAnalyses());
  }, []);

  const today = new Date().toDateString();
  const todaySessions = sessions.filter(s => new Date(s.createdAt).toDateString() === today).length;
  const globalAvg = users.length > 0
    ? Math.round(users.reduce((sum, u) => sum + (u.totalSessions > 0 ? u.totalScore / u.totalSessions : 0), 0) / users.length)
    : 0;

  const filteredUsers = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchLevel = !filterLevel || String(u.level) === filterLevel;
    return matchSearch && matchLevel;
  });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <span className="text-accent-coral">Admin</span> — SimulaSET
        </h1>
        <p className="text-text-secondary text-sm mt-1">Panel de control global</p>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Setters" value={users.length} icon={Users} color="#E0605E" />
        <StatCard label="Sesiones hoy" value={todaySessions} icon={Play} color="#2563EB" />
        <StatCard label="Total sesiones" value={sessions.length} icon={TrendingUp} color="#1D9E75" />
        <StatCard label="Promedio global" value={`${globalAvg}/10`} icon={BarChart2} color="#C9920A" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-bg-input border border-border-subtle rounded-xl pl-9 pr-4 py-2.5 text-text-primary placeholder-text-secondary text-sm focus:border-accent-coral transition-colors"
            placeholder="Buscar setter..."
          />
        </div>
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}
          className="bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-text-primary text-sm focus:border-accent-coral transition-colors"
        >
          <option value="">Todos los niveles</option>
          <option value="1">Novato</option>
          <option value="2">Aprendiz</option>
          <option value="3">Practicante</option>
          <option value="4">Pro</option>
          <option value="5">Élite</option>
        </select>
      </div>

      {/* Setters list */}
      {filteredUsers.length === 0 ? (
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">👤</div>
          <div className="text-text-secondary">Sin setters registrados aún</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map(u => {
            const userSessions = sessions.filter(s => s.userId === u.id);
            const userAvg = u.totalSessions > 0 ? Math.round(u.totalScore / u.totalSessions) : 0;
            const modeCount = userSessions.reduce((acc, s) => { acc[s.mode] = (acc[s.mode] || 0) + 1; return acc; }, {});
            const topMode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0];

            return (
              <button
                key={u.id}
                onClick={() => navigate(`/admin/setter/${u.id}`)}
                className="w-full bg-bg-card border border-border-subtle rounded-2xl p-4 flex items-center gap-4 hover:border-accent-coral/30 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-full bg-accent-coral/20 flex items-center justify-center text-accent-coral font-bold text-sm flex-shrink-0">
                  {u.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-text-primary text-sm">{u.name}</span>
                    <LevelBadge level={u.level || 1} size="sm" showName={false} />
                  </div>
                  <div className="text-text-secondary text-xs">{u.email}</div>
                </div>
                <div className="hidden md:flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="font-bold text-text-primary">{userSessions.length}</div>
                    <div className="text-text-secondary text-xs">sesiones</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold" style={{ color: userAvg >= 80 ? '#1D9E75' : userAvg >= 60 ? '#C9920A' : '#DC2626' }}>
                      {userAvg}/10
                    </div>
                    <div className="text-text-secondary text-xs">promedio</div>
                  </div>
                  {topMode && (
                    <div className="text-center">
                      <ModeBadge mode={topMode} size="sm" />
                      <div className="text-text-secondary text-xs mt-1">modo favorito</div>
                    </div>
                  )}
                  {u.lastActivity && (
                    <div className="text-center">
                      <div className="text-text-secondary text-xs">{new Date(u.lastActivity).toLocaleDateString('es')}</div>
                      <div className="text-text-secondary text-xs">última actividad</div>
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-text-secondary flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </Layout>
  );
};

export default AdminDashboard;
