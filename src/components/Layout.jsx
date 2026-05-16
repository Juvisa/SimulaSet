import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import { Home } from 'lucide-react';

const HOME_PATHS = ['/dashboard', '/admin'];

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const homePath = '/dashboard';
  const isHome = HOME_PATHS.some(p => location.pathname === p);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 pb-24 md:pb-8 pt-4 md:pt-8">
        {!isHome && (
          <button
            onClick={() => navigate(homePath)}
            className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm mb-5 transition-colors"
          >
            <Home size={14} /> Inicio
          </button>
        )}
        {children}
      </main>
    </div>
  );
};

export default Layout;
