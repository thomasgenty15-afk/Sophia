import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import GlobalPlan from './pages/GlobalPlan';
import GlobalPlanFollow from './pages/GlobalPlanFollow';
import Grimoire from './pages/Grimoire';
import IdentityArchitect from './pages/IdentityArchitect';
import WeeklyAlignment from './pages/WeeklyAlignment';
import IdentityEvolution from './pages/IdentityEvolution';
import PlanPriorities from './pages/PlanPriorities';
import PlanPrioritiesFollow from './pages/PlanPrioritiesFollow';
import NextPlan from './pages/NextPlan';
import ActionPlanGenerator from './pages/ActionPlanGenerator';
import ActionPlanGeneratorRecraft from './pages/ActionPlanGeneratorRecraft';
import ActionPlanGeneratorFollow from './pages/ActionPlanGeneratorFollow';
import ActionPlanGeneratorNext from './pages/ActionPlanGeneratorNext';
import FrameworkExecution from './pages/FrameworkExecution';
import Recraft from './pages/Recraft';
import ProductPlan from './pages/ProductPlan';
import ProductArchitect from './pages/ProductArchitect';
import Formules from './pages/Formules';
import UpgradePlan from './pages/UpgradePlan'; // IMPORT UPGRADE PAGE
import Auth from './pages/Auth'; 
import ResetPassword from './pages/ResetPassword';
import Legal from './pages/Legal'; // IMPORT PAGE LEGALE
import { ModulesPage } from './pages/ModulesPage'; // IMPORT DE LA NOUVELLE PAGE
import { ChatPage } from './pages/ChatPage'; // Import ChatPage
import AdminEvals from './pages/AdminEvals';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsageDashboard from './pages/AdminUsageDashboard';
import AdminProductionLog from './pages/AdminProductionLog';
import { RequireAdmin, RequireAppAccess, RequireArchitecte, RequirePrelaunchGate } from './security/RouteGuards';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-white text-black font-sans">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/chat" element={<RequireAppAccess><ChatPage /></RequireAppAccess>} />
            <Route path="/le-plan" element={<ProductPlan />} />
            <Route path="/l-architecte" element={<ProductArchitect />} />
            <Route path="/formules" element={<Formules />} />
            <Route path="/upgrade" element={<RequireAppAccess><UpgradePlan /></RequireAppAccess>} /> {/* ROUTE UPGRADE */}
            <Route path="/auth" element={<Auth />} /> 
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/legal" element={<Legal />} /> {/* ROUTE LEGALE */}
            <Route path="/dashboard" element={<RequireAppAccess><Dashboard /></RequireAppAccess>} />
            <Route path="/global-plan" element={<RequirePrelaunchGate><GlobalPlan /></RequirePrelaunchGate>} />
            <Route path="/global-plan-follow" element={<RequirePrelaunchGate><GlobalPlanFollow /></RequirePrelaunchGate>} />
            <Route path="/plan-priorities" element={<RequirePrelaunchGate><PlanPriorities /></RequirePrelaunchGate>} />
            <Route path="/plan-priorities-follow" element={<RequirePrelaunchGate><PlanPrioritiesFollow /></RequirePrelaunchGate>} />
            <Route path="/plan-generator" element={<RequireAppAccess><ActionPlanGenerator /></RequireAppAccess>} />
            <Route path="/plan-generator-recraft" element={<RequireAppAccess><ActionPlanGeneratorRecraft /></RequireAppAccess>} />
            <Route path="/plan-generator-follow" element={<RequireAppAccess><ActionPlanGeneratorFollow /></RequireAppAccess>} />
            <Route path="/recraft" element={<RequireAppAccess><Recraft /></RequireAppAccess>} />
            <Route path="/next-plan" element={<RequireAppAccess><NextPlan /></RequireAppAccess>} />
            <Route path="/plan-generator-next" element={<RequireAppAccess><ActionPlanGeneratorNext /></RequireAppAccess>} />
            <Route path="/framework-execution" element={<RequireAppAccess><FrameworkExecution /></RequireAppAccess>} />
            <Route path="/grimoire" element={<RequireAppAccess><Grimoire /></RequireAppAccess>} />
            <Route path="/grimoire/:id" element={<RequireAppAccess><Grimoire /></RequireAppAccess>} />
            
            {/* NOUVELLE ROUTE POUR LE TABLEAU DE BORD ARCHITECTE */}
            <Route path="/architecte" element={<RequireAppAccess><ModulesPage /></RequireAppAccess>} />
            
            <Route path="/architecte/:weekId" element={<RequireAppAccess><IdentityArchitect /></RequireAppAccess>} />
            <Route path="/architecte/alignment" element={<RequireArchitecte><WeeklyAlignment /></RequireArchitecte>} />
            <Route path="/architecte/evolution" element={<RequireArchitecte><IdentityEvolution /></RequireArchitecte>} />
            <Route path="/admin/evals" element={<RequireAdmin><AdminEvals /></RequireAdmin>} />
            <Route path="/admin/usage" element={<RequireAdmin><AdminUsageDashboard /></RequireAdmin>} />
            <Route path="/admin/production-log" element={<RequireAdmin><AdminProductionLog /></RequireAdmin>} />
            <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;