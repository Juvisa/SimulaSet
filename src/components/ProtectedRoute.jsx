import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, adminOnly = false, studentOnly = false, onboardingOnly = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-accent-coral text-2xl font-black animate-pulse">SimulaSET</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!user.active) return <Navigate to="/login?error=inactive" replace />;

  // La cuenta admin es exclusivamente administrativa (el alumno tiene su
  // propia cuenta separada) — todo redirect "de vuelta a casa" dentro de este
  // guard debe mandar al admin a /admin, nunca a /dashboard.
  const homeRoute = user.role === 'admin' ? '/admin' : '/dashboard';

  if (onboardingOnly) {
    return user.onboardingCompleted ? <Navigate to={homeRoute} replace /> : children;
  }
  if (!user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to={homeRoute} replace />;
  // Bloquea a la cuenta admin de las rutas de alumno sin importar cómo haya
  // llegado ahí (link viejo del sidebar, marcador, URL escrita a mano) — no
  // solo se le ocultan los links, se le impide quedarse en esas pantallas.
  if (studentOnly && user.role === 'admin') return <Navigate to={homeRoute} replace />;
  return children;
};

export default ProtectedRoute;
