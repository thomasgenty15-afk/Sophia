import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthContext";
import LandingPage from "./pages/LandingPage";
import DashboardV2 from "./pages/DashboardV2";
import AddTransformationPage from "./pages/AddTransformationPage";
import Grimoire from "./pages/Grimoire";
import IdentityArchitect from "./pages/IdentityArchitect";
import WeeklyAlignment from "./pages/WeeklyAlignment";
import IdentityEvolution from "./pages/IdentityEvolution";
import OnboardingV2 from "./pages/OnboardingV2";
import ProductPlan from "./pages/ProductPlan";
import ProductArchitect from "./pages/ProductArchitect";
import Formules from "./pages/Formules";
import UpgradePlan from "./pages/UpgradePlan"; // IMPORT UPGRADE PAGE
import Account from "./pages/Account";
import Auth from "./pages/Auth";
import EmailVerified from "./pages/EmailVerified";
import ResetPassword from "./pages/ResetPassword";
import InstallAppGuide from "./pages/InstallAppGuide";
import Legal from "./pages/Legal"; // IMPORT PAGE LEGALE
import { ModulesPage } from "./pages/ModulesPage"; // IMPORT DE LA NOUVELLE PAGE
import { ChatPage } from "./pages/ChatPage"; // Import ChatPage
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsageDashboard from "./pages/AdminUsageDashboard";
import AdminProductionLog from "./pages/AdminProductionLog";
import {
  RequireAdmin,
  RequireAppAccess,
  RequireArchitecte,
  RequirePrelaunchGate,
} from "./security/RouteGuards";
import { OnboardingAmbientAudioProvider } from "./context/OnboardingAmbientAudioContext";

function App() {
  return (
    <ToastProvider>
    <AuthProvider>
      <Router>
        <OnboardingAmbientAudioProvider>
          <div className="min-h-screen bg-white text-black font-sans">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route
                path="/chat"
                element={
                  <RequireAppAccess>
                    <ChatPage />
                  </RequireAppAccess>
                }
              />
              <Route path="/le-plan" element={<ProductPlan />} />
              <Route path="/l-architecte" element={<ProductArchitect />} />
              <Route path="/formules" element={<Formules />} />
              <Route
                path="/upgrade"
                element={
                  <RequireAppAccess>
                    <UpgradePlan />
                  </RequireAppAccess>
                }
              />{" "}
              {/* ROUTE UPGRADE */}
              <Route
                path="/account"
                element={
                  <RequireAppAccess>
                    <Account />
                  </RequireAppAccess>
                }
              />
              <Route path="/auth" element={<Auth />} />
              <Route path="/email-verified" element={<EmailVerified />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/installer-app" element={<InstallAppGuide />} />
              <Route path="/legal" element={<Legal />} /> {/* ROUTE LEGALE */}
              <Route
                path="/dashboard"
                element={
                  <RequireAppAccess>
                    <DashboardV2 />
                  </RequireAppAccess>
                }
              />
              <Route
                path="/transformations/new"
                element={
                  <RequireAppAccess>
                    <AddTransformationPage />
                  </RequireAppAccess>
                }
              />
              <Route
                path="/onboarding-v2"
                element={
                  <RequirePrelaunchGate>
                    <OnboardingV2 />
                  </RequirePrelaunchGate>
                }
              />
              {/* NOUVELLE ROUTE POUR LE TABLEAU DE BORD ARCHITECTE */}
              <Route
                path="/grimoire"
                element={
                  <RequireAppAccess>
                    <Grimoire />
                  </RequireAppAccess>
                }
              />
              <Route
                path="/grimoire/:id"
                element={
                  <RequireAppAccess>
                    <Grimoire />
                  </RequireAppAccess>
                }
              />
              <Route
                path="/architecte"
                element={
                  <RequireAppAccess>
                    <ModulesPage />
                  </RequireAppAccess>
                }
              />

              <Route
                path="/architecte/:weekId"
                element={
                  <RequireAppAccess>
                    <IdentityArchitect />
                  </RequireAppAccess>
                }
              />
              <Route
                path="/architecte/alignment"
                element={
                  <RequireArchitecte>
                    <WeeklyAlignment />
                  </RequireArchitecte>
                }
              />
              <Route
                path="/architecte/evolution"
                element={
                  <RequireArchitecte>
                    <IdentityEvolution />
                  </RequireArchitecte>
                }
              />
              <Route
                path="/admin/usage"
                element={
                  <RequireAdmin>
                    <AdminUsageDashboard />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/production-log"
                element={
                  <RequireAdmin>
                    <AdminProductionLog />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminDashboard />
                  </RequireAdmin>
                }
              />
            </Routes>
          </div>
        </OnboardingAmbientAudioProvider>
      </Router>
    </AuthProvider>
    </ToastProvider>
  );
}

export default App;
