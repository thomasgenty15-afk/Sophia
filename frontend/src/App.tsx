import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthProvider";
import LandingPage from "./pages/LandingPage";
import LandingTDAH from "./pages/LandingTDAH";
import DashboardV2 from "./pages/DashboardV2";
import AddTransformationPage from "./pages/AddTransformationPage";
import Grimoire from "./pages/Grimoire";
import IdentityArchitect from "./pages/IdentityArchitect";
import IdentityEvolution from "./pages/IdentityEvolution";
import OnboardingV2 from "./pages/OnboardingV2";
import ProductPlan from "./pages/ProductPlan";
import ProductArchitect from "./pages/ProductArchitect";
import Formules from "./pages/Formules";
import UpgradePlan from "./pages/UpgradePlan"; // IMPORT UPGRADE PAGE
import Account from "./pages/Account";
import Parrainage from "./pages/Parrainage";
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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { captureReferralCodeFromUrl } from "./lib/referral";

function App() {
  // Parrainage : les liens de partage pointent vers n'importe quelle page du
  // site avec ?ref=CODE ; on capture le code dès le chargement initial.
  React.useEffect(() => {
    captureReferralCodeFromUrl();
  }, []);
  return (
    <ToastProvider>
    <AuthProvider>
      <Router>
        <OnboardingAmbientAudioProvider>
          <div className="min-h-screen bg-white text-black font-sans">
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/tdah" element={<LandingTDAH />} />
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
              <Route
                path="/parrainage"
                element={
                  <RequireAppAccess>
                    <Parrainage />
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
            </ErrorBoundary>
          </div>
        </OnboardingAmbientAudioProvider>
      </Router>
    </AuthProvider>
    </ToastProvider>
  );
}

export default App;
