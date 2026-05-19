import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { migrarDatosExistentes } from './utils/migration';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
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
import Profile from './pages/Profile';
import Migrate from './pages/Migrate';
import RestoreData from './pages/RestoreData';

// Run migration once on app load
migrarDatosExistentes();

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Setter routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/projects/new" element={<ProtectedRoute><ProjectForm /></ProtectedRoute>} />
          <Route path="/projects/:id/edit" element={<ProtectedRoute><ProjectForm /></ProtectedRoute>} />
          <Route path="/simulate" element={<ProtectedRoute><ModeSelector /></ProtectedRoute>} />
          <Route path="/simulator" element={<ProtectedRoute><Simulator /></ProtectedRoute>} />
          <Route path="/simulation-report" element={<ProtectedRoute><SimulationReport /></ProtectedRoute>} />
          <Route path="/analyzer" element={<ProtectedRoute><Analyzer /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          {/* Copiloto en Vivo / Leads Reales */}
          <Route path="/leads-reales" element={<ProtectedRoute><RealLeads /></ProtectedRoute>} />
          <Route path="/leads-reales/nuevo" element={<ProtectedRoute><RealLeadForm /></ProtectedRoute>} />
          <Route path="/leads-reales/:leadId" element={<ProtectedRoute><RealLeadConversation /></ProtectedRoute>} />

          {/* Analytics */}
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/setter/:setterId" element={<ProtectedRoute adminOnly><AdminSetterDetail /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute adminOnly><AdminAnalytics /></ProtectedRoute>} />

          {/* Utilities */}
          <Route path="/migrate" element={<Migrate />} />
          <Route path="/restore" element={<RestoreData />} />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
