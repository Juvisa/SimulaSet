import { BookOpen, CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';
import Layout from '../components/Layout';

const modules = [
  { week: 'Semana 1', title: 'El terreno y el Método S.E.T.', date: '3 de septiembre', available: true },
  { week: 'Semana 2', title: 'Conversaciones que agendan y venden', date: '10 de septiembre' },
  { week: 'Semana 3', title: 'Objeciones y seguimiento', date: '17 de septiembre' },
  { week: 'Semana 4', title: 'Oportunidades y entrevistas', date: '24 de septiembre' },
];

const Academy = () => (
  <Layout>
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-accent-coral text-sm font-bold uppercase tracking-widest mb-2">
          <BookOpen size={16} /> Academia
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-text-primary">Tu ruta DIGITAL SET</h1>
        <p className="text-text-secondary mt-2">Aprende. Entrena. Aplica.</p>
      </div>

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

export default Academy;
