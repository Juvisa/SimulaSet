import { BriefcaseBusiness, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';

const Opportunities = () => (
  <Layout>
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="bg-bg-card border border-border-subtle rounded-2xl p-8 md:p-12 text-center overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-coral via-accent-gold to-accent-coral" />
        <div className="w-16 h-16 rounded-2xl bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center mx-auto mb-6">
          <BriefcaseBusiness size={30} className="text-accent-gold" />
        </div>
        <div className="flex items-center justify-center gap-2 text-accent-gold text-xs font-black uppercase tracking-widest mb-3">
          <Sparkles size={14} /> Próximamente
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-text-primary">SET Opportunity Hub</h1>
        <p className="text-lg text-text-secondary mt-3">Tu conexión con oportunidades reales.</p>
        <p className="max-w-xl mx-auto text-text-secondary leading-relaxed mt-8">
          Próximamente encontrarás aquí lanzamientos, proyectos y oportunidades comerciales donde podrás aplicar lo aprendido en DIGITAL SET.
        </p>
      </div>
    </div>
  </Layout>
);

export default Opportunities;
