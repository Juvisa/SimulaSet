import { BookOpen, CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const journeySteps = ['START', 'APRENDE', 'ENTRENA', 'DEMUESTRA', 'DESBLOQUEA'];

const modules = [
  { week: 'Semana 1', title: 'El terreno y el Método S.E.T.', date: '3 de septiembre', available: true },
  { week: 'Semana 2', title: 'Conversaciones que agendan y venden', date: '10 de septiembre' },
  { week: 'Semana 3', title: 'Objeciones y seguimiento', date: '17 de septiembre' },
  { week: 'Semana 4', title: 'Oportunidades y entrevistas', date: '24 de septiembre' },
];

const Academy = () => {
  const { user } = useAuth();
  const isStarter = user.onboarding?.classification === 'starter';

  return (
  <Layout>
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-accent-coral text-sm font-bold uppercase tracking-widest mb-2">
          <BookOpen size={16} /> Academia
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-text-primary">Tu ruta DIGITAL SET</h1>
        <p className="text-text-secondary mt-2">Aprende. Entrena. Aplica.</p>
      </div>

      <div className="grid grid-cols-5 gap-1.5 mb-6">
        {journeySteps.map((item, index) => {
          const active = isStarter ? index === 0 : index === 1;
          const optional = !isStarter && index === 0;
          return (
            <div key={item} className={`rounded-xl border px-2 py-2.5 text-center ${active ? 'border-accent-coral bg-accent-coral/10' : 'border-border-subtle bg-bg-input/60'}`}>
              <div className={`text-[9px] md:text-[10px] font-black tracking-wide ${active ? 'text-accent-coral' : 'text-text-secondary'}`}>{item}</div>
              {optional && <div className="text-[8px] text-text-secondary mt-0.5">Opcional</div>}
            </div>
          );
        })}
      </div>

      <article id="digital-set-start" className={`scroll-mt-6 rounded-2xl border p-6 mb-6 ${isStarter ? 'border-accent-coral bg-accent-coral/10' : 'border-border-subtle bg-bg-card'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-accent-coral">Módulo 0 · DIGITAL SET START</div>
            <h2 className="text-xl font-black text-text-primary mt-2">Fundamentos para comenzar con claridad</h2>
            <p className="text-sm text-text-secondary mt-2 max-w-2xl">Comprende el ecosistema digital, el rol del setter, qué es un lead y cómo funciona una conversación comercial por chat.</p>
          </div>
          <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold ${isStarter ? 'bg-accent-coral text-white' : 'bg-bg-input text-text-secondary'}`}>{isStarter ? 'Tu primer paso' : 'Opcional'}</span>
        </div>
      </article>

      <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 mb-6">
        <div className="flex justify-between text-sm mb-3">
          <span className="font-semibold text-text-primary">Progreso del programa</span>
          <span className="font-black text-accent-coral">0%</span>
        </div>
        <div className="h-2 bg-bg-input rounded-full overflow-hidden">
          <div className="h-full bg-accent-coral rounded-full" style={{ width: '0%' }} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {modules.map((module) => (
          <article key={module.week} className="bg-bg-card border border-border-subtle rounded-2xl p-5 hover:border-accent-coral/30 transition-colors">
            <div className="flex items-start justify-between gap-4 mb-5">
              <span className="text-xs font-black uppercase tracking-wider text-accent-coral">{module.week}</span>
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${module.available ? 'text-green-400 bg-green-500/10' : 'text-text-secondary bg-bg-input'}`}>
                {module.available ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                {module.available ? 'Disponible' : 'Próximamente'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-text-primary min-h-14">{module.title}</h2>
            <div className="flex items-center gap-2 text-text-secondary text-sm mt-4">
              <CalendarDays size={14} /> {module.date}
            </div>
          </article>
        ))}
      </div>
    </div>
  </Layout>
  );
};

export default Academy;
