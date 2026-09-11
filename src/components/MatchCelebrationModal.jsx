import { PartyPopper, MessageCircle } from 'lucide-react';

const MatchCelebrationModal = ({ vacancy, onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
    <div className="w-full max-w-sm rounded-2xl border border-accent-gold/40 bg-bg-card p-6 text-center" onClick={(e) => e.stopPropagation()}>
      <PartyPopper size={40} className="mx-auto text-accent-gold" />
      <h3 className="mt-4 text-xl font-black text-text-primary">¡Es un Match!</h3>
      <p className="mt-2 text-sm text-text-secondary">{vacancy?.company_name} quiere conectar contigo.</p>
      {vacancy?.contact_link ? (
        <a href={vacancy.contact_link} target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white">
          <MessageCircle size={16} /> Ir al contacto
        </a>
      ) : (
        <p className="mt-5 text-xs text-text-secondary">La empresa se pondrá en contacto pronto a través de DIGITAL SET.</p>
      )}
      <button onClick={onClose} className="mt-3 text-xs font-bold text-text-secondary hover:text-text-primary">Cerrar</button>
    </div>
  </div>
);

export default MatchCelebrationModal;
