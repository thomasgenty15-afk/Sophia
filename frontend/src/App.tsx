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
import Auth from './pages/Auth'; 

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-white text-black font-sans">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/le-plan" element={<ProductPlan />} />
            <Route path="/l-architecte" element={<ProductArchitect />} />
            <Route path="/formules" element={<Formules />} />
            <Route path="/auth" element={<Auth />} /> 
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/global-plan" element={<GlobalPlan />} />
            <Route path="/global-plan-follow" element={<GlobalPlanFollow />} />
            <Route path="/plan-priorities" element={<PlanPriorities />} />
            <Route path="/plan-priorities-follow" element={<PlanPrioritiesFollow />} />
            <Route path="/plan-generator" element={<ActionPlanGenerator />} />
            <Route path="/plan-generator-recraft" element={<ActionPlanGeneratorRecraft />} />
            <Route path="/plan-generator-follow" element={<ActionPlanGeneratorFollow />} />
            <Route path="/recraft" element={<Recraft />} />
            <Route path="/next-plan" element={<NextPlan />} />
            <Route path="/plan-generator-next" element={<ActionPlanGeneratorNext />} />
            <Route path="/framework-execution" element={<FrameworkExecution />} />
            <Route path="/grimoire" element={<Grimoire />} />
            <Route path="/grimoire/:id" element={<Grimoire />} />
            <Route path="/architecte/:weekId" element={<IdentityArchitect />} />
            <Route path="/architecte/alignment" element={<WeeklyAlignment />} />
            <Route path="/architecte/evolution" element={<IdentityEvolution />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;