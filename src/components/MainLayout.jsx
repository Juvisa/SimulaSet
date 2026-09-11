import { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import SetCoachWidget from './SetCoachWidget';

const MainLayout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-bg-primary">
      {/* Barra superior solo en móvil, para abrir el sidebar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 bg-bg-card border-b border-border-subtle">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-text-secondary hover:text-text-primary"
          aria-label="Abrir menú"
        >
          <Menu size={22} />
        </button>
        <span className="flex items-center gap-1">
          <span className="text-lg font-black text-accent-coral">DIGITAL</span>
          <span className="text-lg font-black text-text-primary">SET</span>
        </span>
        <span className="w-[22px]" />
      </div>

      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <main className="flex-1 overflow-y-auto p-6 md:p-8 pt-20 md:pt-8">
        {children}
      </main>

      <SetCoachWidget />
    </div>
  );
};

export default MainLayout;
