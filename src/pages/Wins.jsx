import { Award, CalendarCheck, CircleDollarSign, Flame, Rocket, Sparkles, Trophy } from 'lucide-react';
import Layout from '../components/Layout';

const categories = [
  { label: 'Agendas conseguidas', icon: CalendarCheck, color: '#1D9E75' },
  { label: 'Ventas generadas', icon: CircleDollarSign, color: '#C9920A' },
  { label: 'Primeras oportunidades', icon: Rocket, color: '#2563EB' },
  { label: 'Logros de entrenamiento', icon: Trophy, color: '#E0605E' },
];

const levels = ['SET Rookie', 'SET Operator', 'SET Pro', 'SET Elite', 'SET Master'];
const metrics = ['Agendas', 'Ventas atribuidas', 'SET Score', 'Consistencia'];

const Wins = () => (
  <Layout>
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-accent-gold text-sm font-black uppercase tracking-widest mb-2">
          <Trophy size={16} /> Comunidad DIGITAL SET
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-text-primary">SET Wins</h1>
        <p className="text-text-secondary mt-2">Los resultados también se entrenan.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {categories.map(({ label, icon: Icon, color }) => (
          <div key={label} className="bg-bg-card border border-border-subtle rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${color}18` }}>
              <Icon size={19} style={{ color }} />
            </div>
            <div className="text-sm font-bold text-text-primary">{label}</div>
            <div className="text-2xl font-black mt-2" style={{ color }}>—</div>
          </div>
        ))}
      </div>

      <section className="bg-bg-card border border-border-subtle rounded-2xl p-6 md:p-8 mb-6">
        <div className="grid md:grid-cols-[1fr_0.9fr] gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 text-accent-coral text-xs font-black uppercase tracking-widest mb-3">
              <Sparkles size={14} /> SET Spotlight
            </div>
            <h2 className="text-2xl font-black text-text-primary">Resultados que inspiran acción</h2>
            <p className="text-text-secondary mt-3 leading-relaxed">
              Cada semana reconoceremos a quienes estén convirtiendo el método S.E.T. en resultados reales.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-6">
              {metrics.map(metric => (
                <div key={metric} className="bg-bg-input rounded-xl px-3 py-2.5 text-xs font-semibold text-text-secondary">{metric}</div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-accent-gold/30 bg-bg-primary p-6">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-coral via-accent-gold to-accent-coral" />
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-black text-accent-gold tracking-widest">SETTER OF THE WEEK</span>
              <Award size={20} className="text-accent-gold" />
            </div>
            <div className="text-xl font-black text-text-primary mb-5">Próximamente</div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-text-secondary">Agendas</span><span>—</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Ventas</span><span>—</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">SET Score</span><span>—</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-bg-card border border-border-subtle rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Flame size={16} className="text-accent-coral" />
          <h2 className="font-bold text-text-primary">Tu evolución en DIGITAL SET</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {levels.map((level, index) => (
            <span key={level} className={`px-3 py-1.5 rounded-full border text-xs font-bold ${index === 0 ? 'border-accent-coral/40 bg-accent-coral/10 text-accent-coral' : 'border-border-subtle bg-bg-input text-text-secondary'}`}>
              {level}
            </span>
          ))}
        </div>
        <p className="text-text-secondary text-xs mt-4">Vista previa de niveles. Próximamente vincularemos tu progreso.</p>
      </section>
    </div>
  </Layout>
);

export default Wins;
