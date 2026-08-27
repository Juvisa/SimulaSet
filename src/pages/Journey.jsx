import { ArrowRight, BriefcaseBusiness, CalendarCheck, Check, CircleDollarSign, Flame, LockKeyhole, Medal, Mic2, Sparkles, Target, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

const missionItems = [
  'Asiste a la sesión en vivo',
  'Completa 3 entrenamientos en SimulaSET AI',
  'Supera un SET Score de 60',
  'Practica una conversación real',
];

const spotlightMetrics = ['Agendas', 'Ventas atribuidas', 'SET Score', 'Consistencia'];

const firsts = [
  { icon: CalendarCheck, title: 'Primera agenda conseguida', status: 'Disponible', color: '#1D9E75' },
  { icon: CircleDollarSign, title: 'Primera venta atribuida', status: 'Disponible', color: '#C9920A' },
  { icon: Target, title: 'Primer SET Score +90', status: 'Disponible', color: '#E0605E' },
  { icon: Trophy, title: 'Primer SET Master', status: 'Bloqueado', color: '#9A9A9A' },
];

const unlocks = [
  { icon: Mic2, title: 'INTERVIEW LAB', text: 'Prepárate para entrevistas y pruebas de selección.' },
  { icon: BriefcaseBusiness, title: 'SET OPPORTUNITY HUB', text: 'Accede a lanzamientos, proyectos y oportunidades.' },
  { icon: Trophy, title: 'SET MASTER', text: 'El nivel más alto del ecosistema DIGITAL SET.' },
];

const Journey = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="max-w-5xl mx-auto animate-fade-in space-y-8">
        <header className="text-center py-4">
          <div className="text-accent-coral text-xs font-black uppercase tracking-[0.3em] mb-3">Tu recorrido</div>
          <h1 className="text-3xl md:text-5xl font-black text-text-primary">Tu camino DIGITAL SET comienza aquí</h1>
          <p className="text-text-secondary mt-3">Aprende. Entrena. Demuestra. Desbloquea.</p>
        </header>

        <section className="bg-bg-card border border-accent-coral/20 rounded-2xl p-6 md:p-8">
          <div className="grid md:grid-cols-3 gap-5 mb-6">
            <div><div className="text-xs text-text-secondary uppercase tracking-wider">Nivel actual</div><div className="text-xl font-black mt-1">SET Rookie 🌱</div></div>
            <div><div className="text-xs text-text-secondary uppercase tracking-wider">SET Score</div><div className="text-xl font-black text-accent-coral mt-1">0</div></div>
            <div><div className="text-xs text-text-secondary uppercase tracking-wider">Próximo nivel</div><div className="text-xl font-black mt-1">SET Operator ⚡</div></div>
          </div>
          <div className="h-2.5 bg-bg-input rounded-full overflow-hidden"><div className="h-full w-[8%] bg-gradient-to-r from-accent-coral to-accent-gold rounded-full" /></div>
          <p className="text-sm text-text-secondary mt-3">Estás a 3 entrenamientos de desbloquear tu primera insignia.</p>
        </section>

        <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5">
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-6">
            <div className="flex items-center gap-2 text-accent-coral font-black mb-5"><Flame size={18} /> Tu misión esta semana</div>
            <div className="text-xs font-black tracking-widest text-text-secondary">MISIÓN #01</div>
            <h2 className="text-2xl font-black text-text-primary mt-1">First SET</h2>
            <div className="space-y-3 my-6">
              {missionItems.map(item => <div key={item} className="flex items-center gap-3 text-sm text-text-secondary"><span className="w-5 h-5 rounded-md border border-border-subtle flex items-center justify-center"><Check size={12} className="opacity-20" /></span>{item}</div>)}
            </div>
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-border-subtle">
              <span className="text-sm font-bold text-accent-gold">🏅 Badge First SET</span>
              <button onClick={() => navigate('/simulate')} className="flex items-center gap-2 bg-accent-coral text-white px-4 py-2.5 rounded-xl text-sm font-bold">Comenzar misión <ArrowRight size={14} /></button>
            </div>
          </div>

          <div className="relative bg-bg-card border border-accent-gold/30 rounded-2xl p-6 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-coral via-accent-gold to-accent-coral" />
            <div className="flex items-center gap-2 text-accent-gold font-black mb-5"><Trophy size={18} /> SET Spotlight</div>
            <div className="text-xs tracking-widest font-black">SETTER OF THE WEEK</div>
            <h2 className="text-xl font-black mt-4">Este lugar todavía está disponible.</h2>
            <p className="text-text-secondary text-sm mt-2">¿Será tu nombre el primero en aparecer aquí?</p>
            <p className="text-text-secondary text-xs mt-4">Aquí reconocemos a quienes convierten entrenamiento en resultados.</p>
            <div className="grid grid-cols-2 gap-2 mt-6">{spotlightMetrics.map(metric => <div key={metric} className="bg-bg-input rounded-xl p-3"><div className="text-xs text-text-secondary">{metric}</div><div className="font-black mt-1">—</div></div>)}</div>
          </div>
        </section>

        <section>
          <div className="mb-4"><h2 className="text-xl font-black">🔥 ¿Quién será el primero?</h2><p className="text-text-secondary text-sm mt-1">La historia de esta generación todavía no está escrita.</p></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{firsts.map(({ icon: Icon, title, status, color }) => <div key={title} className="bg-bg-card border border-border-subtle rounded-2xl p-4"><Icon size={19} style={{ color }} /><div className="text-sm font-bold mt-4 min-h-10">{title}</div><div className="text-xs mt-3" style={{ color }}>{status}</div></div>)}</div>
        </section>

        <section>
          <h2 className="text-xl font-black mb-4">Próximos desbloqueos</h2>
          <div className="grid md:grid-cols-3 gap-3">{unlocks.map(({ icon: Icon, title, text }) => <div key={title} className="bg-bg-card/60 border border-border-subtle rounded-2xl p-5 opacity-75"><div className="flex justify-between"><Icon size={20} className="text-text-secondary" /><LockKeyhole size={16} className="text-text-secondary" /></div><div className="font-black text-sm mt-5">{title}</div><p className="text-text-secondary text-xs mt-2 leading-relaxed">{text}</p></div>)}</div>
          <p className="text-center text-text-secondary text-sm leading-relaxed mt-6">No todos los espacios se desbloquean por comprar.<br />Algunos se desbloquean demostrando que estás listo.</p>
        </section>

        <section className="relative overflow-hidden bg-bg-card border border-accent-gold/30 rounded-2xl p-7 md:p-10">
          <Sparkles className="absolute right-8 top-8 text-accent-gold/20" size={70} />
          <div className="text-xs font-black tracking-[0.25em] text-accent-gold">FOUNDING SETTERS · 2026</div>
          <h2 className="text-2xl font-black mt-4">Estás entrando en la primera generación de DIGITAL SET.</h2>
          <p className="text-text-secondary mt-3 max-w-2xl">Quienes completen esta edición inaugural conservarán la insignia Founding Setter en su SET Passport.</p>
          <div className="inline-flex items-center gap-3 border border-accent-gold/40 bg-accent-gold/10 rounded-2xl px-5 py-4 mt-6"><Medal className="text-accent-gold" /><div><div className="text-xs font-black text-accent-gold tracking-widest">FOUNDING SETTER</div><div className="font-black">GEN 01 · 2026</div></div></div>
          <div className="text-xs text-text-secondary mt-4">Solo existe una primera generación.</div>
        </section>
      </div>
    </Layout>
  );
};

export default Journey;
