import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectForm from './pages/ProjectForm';
import ModeSelector from './pages/ModeSelector';
import Simulator from './pages/Simulator';
import SimulationReport from './pages/SimulationReport';
import Analyzer from './pages/Analyzer';
import AdminDashboard from './pages/AdminDashboard';
import AdminSetterDetail from './pages/AdminSetterDetail';
import RealLeads from './pages/RealLeads';
import RealLeadForm from './pages/RealLeadForm';
import RealLeadConversation from './pages/RealLeadConversation';
import Analytics from './pages/Analytics';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminAcademy from './pages/AdminAcademy';
import AdminRewards from './pages/AdminRewards';
import Profile from './pages/Profile';
import Migrate from './pages/Migrate';
import RestoreData from './pages/RestoreData';
import Academy from './pages/Academy';
import Opportunities from './pages/Opportunities';
import Journey from './pages/Journey';
import Onboarding from './pages/Onboarding';
import Missions from './pages/Missions';
import MissionConversationHunt from './pages/MissionConversationHunt';
import SetWins from './pages/SetWins';
import Rewards from './pages/Rewards';
import OpportunityHub from './pages/OpportunityHub';
import TalentVault from './pages/TalentVault';
import ValueBuilder from './pages/ValueBuilder';

// La cuenta admin es exclusivamente administrativa — al entrar a "/" o a
// cualquier ruta no reconocida, se la manda a su panel en vez de al
// dashboard de alumno (que además ya la rebotaría por studentOnly en
// ProtectedRoute, pero así evita el salto doble).
const HomeRedirect = () => {
  const { user, loading } = useAuth();
  // Espera a que resuelva la sesión antes de decidir el destino — si no,
  // "user" llega null en el primer render y siempre manda a /dashboard,
  // aunque termine siendo admin (ProtectedRoute lo rebotaría después de
  // todos modos por studentOnly, pero con un salto extra innecesario).
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-accent-coral text-2xl font-black animate-pulse">SimulaSET</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/onboarding" element={<ProtectedRoute onboardingOnly><Onboarding /></ProtectedRoute>} />

          {/* Setter routes — studentOnly: la cuenta admin nunca debe quedar en
              estas pantallas, sin importar cómo llegue (link, marcador, URL a
              mano). El alumno tiene su propia cuenta separada para esto. */}
          <Route path="/dashboard" element={<ProtectedRoute studentOnly><Dashboard /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute studentOnly><Projects /></ProtectedRoute>} />
          <Route path="/projects/new" element={<ProtectedRoute studentOnly><ProjectForm /></ProtectedRoute>} />
          <Route path="/projects/:id/edit" element={<ProtectedRoute studentOnly><ProjectForm /></ProtectedRoute>} />
          <Route path="/simulate" element={<ProtectedRoute studentOnly><ModeSelector /></ProtectedRoute>} />
          <Route path="/simulator" element={<ProtectedRoute studentOnly><Simulator /></ProtectedRoute>} />
          <Route path="/simulation-report" element={<ProtectedRoute studentOnly><SimulationReport /></ProtectedRoute>} />
          <Route path="/analyzer" element={<ProtectedRoute studentOnly><Analyzer /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/academy" element={<ProtectedRoute studentOnly><Academy /></ProtectedRoute>} />
          <Route path="/opportunities" element={<ProtectedRoute studentOnly><Opportunities /></ProtectedRoute>} />
          <Route path="/journey" element={<ProtectedRoute studentOnly><Journey /></ProtectedRoute>} />
          <Route path="/missions" element={<ProtectedRoute studentOnly><Missions /></ProtectedRoute>} />
          <Route path="/missions/mission_01_conversation_hunt" element={<ProtectedRoute studentOnly><MissionConversationHunt /></ProtectedRoute>} />
          <Route path="/set-wins" element={<ProtectedRoute studentOnly><SetWins /></ProtectedRoute>} />
          <Route path="/recompensas" element={<ProtectedRoute studentOnly><Rewards /></ProtectedRoute>} />
          <Route path="/oportunidades" element={<ProtectedRoute studentOnly><OpportunityHub /></ProtectedRoute>} />
          <Route path="/empresa" element={<ProtectedRoute adminOnly><TalentVault /></ProtectedRoute>} />
          <Route path="/value-builder" element={<ProtectedRoute studentOnly><ValueBuilder /></ProtectedRoute>} />

          {/* Copiloto en Vivo / Leads Reales */}
          <Route path="/leads-reales" element={<ProtectedRoute studentOnly><RealLeads /></ProtectedRoute>} />
          <Route path="/leads-reales/nuevo" element={<ProtectedRoute studentOnly><RealLeadForm /></ProtectedRoute>} />
          <Route path="/leads-reales/:leadId" element={<ProtectedRoute studentOnly><RealLeadConversation /></ProtectedRoute>} />

          {/* Analytics */}
          <Route path="/analytics" element={<ProtectedRoute studentOnly><Analytics /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/setter/:setterId" element={<ProtectedRoute adminOnly><AdminSetterDetail /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute adminOnly><AdminAnalytics /></ProtectedRoute>} />
          <Route path="/admin/academy" element={<ProtectedRoute adminOnly><AdminAcademy /></ProtectedRoute>} />
          <Route path="/admin/rewards" element={<ProtectedRoute adminOnly><AdminRewards /></ProtectedRoute>} />

          {/* Utilities */}
          <Route path="/migrate" element={<Migrate />} />
          <Route path="/restore" element={<RestoreData />} />

          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
