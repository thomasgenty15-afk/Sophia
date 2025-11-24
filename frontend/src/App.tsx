import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import Grimoire from './pages/Grimoire';
import IdentityArchitect from './pages/IdentityArchitect';
import WeeklyAlignment from './pages/WeeklyAlignment';
import IdentityEvolution from './pages/IdentityEvolution';
import PlanPriorities from './pages/PlanPriorities';
import ActionPlanGenerator from './pages/ActionPlanGenerator';
import ProductPlan from './pages/ProductPlan';
import ProductArchitect from './pages/ProductArchitect';
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
            <Route path="/auth" element={<Auth />} /> 
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/plan-priorities" element={<PlanPriorities />} />
            <Route path="/plan-generator" element={<ActionPlanGenerator />} />
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