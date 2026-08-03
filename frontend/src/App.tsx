import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthProvider";
// KEEL pivot: "/" sells Sophia to coaches (English, B2B). The old French
// consumer landing (pages/LandingPage) is unmounted, not deleted.
import LandingPage from "./keel/pages/LandingPage";
import PlanSavedModal from "./components/dashboard-v2/PlanSavedModal";
import DashboardV2 from "./pages/DashboardV2";
import OnboardingV2 from "./pages/OnboardingV2";
import ProductPlan from "./pages/ProductPlan";
import UpgradePlan from "./pages/UpgradePlan"; // IMPORT UPGRADE PAGE
import Account from "./pages/Account";
import Auth from "./pages/Auth";
import EmailVerified from "./pages/EmailVerified";
import ResetPassword from "./pages/ResetPassword";
import InstallAppGuide from "./pages/InstallAppGuide";
import Legal from "./pages/Legal"; // IMPORT PAGE LEGALE
import { ChatPage } from "./pages/ChatPage"; // Import ChatPage
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsageDashboard from "./pages/AdminUsageDashboard";
import AdminProductionLog from "./pages/AdminProductionLog";
import {
  RequireAdmin,
  RequireAppAccess,
  RequirePrelaunchGate,
} from "./security/RouteGuards";
import { OnboardingAmbientAudioProvider } from "./context/OnboardingAmbientAudioContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { captureReferralCodeFromUrl } from "./lib/referral";
import PlanImportPage from "./keel/pages/PlanImportPage";
import TodayPage from "./keel/pages/TodayPage";
import ProgressPage from "./keel/pages/ProgressPage";
import CardsPage from "./keel/pages/CardsPage";
import JoinPage from "./keel/pages/JoinPage";
import CoachStudentPage from "./keel/pages/CoachStudentPage";
import MealPlanPage from "./keel/pages/MealPlanPage";
import StudentMealPlanPage from "./keel/pages/mealPlan/StudentMealPlanPage";
import { KeelStudentRoute } from "./keel/components/KeelStudentRoute";
import CoachHomePage from "./keel/pages/CoachHomePage";
import CoachDoctrinePage from "./keel/pages/CoachDoctrinePage";
import CoachBillingPage from "./keel/pages/CoachBillingPage";
import TemplatesPage from "./keel/pages/TemplatesPage";
import { CoachRoute } from "./keel/components/CoachRoute";

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
              {import.meta.env.DEV ? (
                // Dev-only visual preview of the plan-saved modal (excluded
                // from production builds): lets us see both variants without
                // completing a full onboarding behind auth.
                <Route
                  path="/dev/plan-saved-modal"
                  element={
                    /* sophia-action-skin mirrors the dashboard wrapper that
                       defines --action-green; without it the Ok button renders
                       white-on-white. ?opted=1 previews the opted-in variant. */
                    <div className="sophia-action-skin">
                      <PlanSavedModal
                        open
                        whatsappOptedIn={new URLSearchParams(
                          window.location.search,
                        ).get("opted") === "1"}
                        onClose={() => {}}
                      />
                    </div>
                  }
                />
              ) : null}
              <Route
                path="/chat"
                element={
                  <RequireAppAccess>
                    <ChatPage />
                  </RequireAppAccess>
                }
              />
              {/* KEEL — coach plan import. Lives under /coach/import: "keel"
                  is internal namespace and must never surface in a URL. The
                  old /keel/import path redirects rather than 404s. Guarded by
                  CoachRoute now that coach accounts exist (W6.1). */}
              <Route
                path="/coach/import"
                element={
                  <CoachRoute>
                    <PlanImportPage />
                  </CoachRoute>
                }
              />
              <Route path="/keel/import" element={<Navigate to="/coach/import" replace />} />
              {/* KEEL — student app (W4.5). Guarded by keel_role='student';
                  deliberately NOT wrapped in RequireAppAccess, whose gate is
                  the legacy subscription tier, an axis that says nothing about
                  being a coach's student. RLS remains the real boundary. */}
              <Route
                path="/app/today"
                element={
                  <KeelStudentRoute>
                    <TodayPage />
                  </KeelStudentRoute>
                }
              />
              <Route
                path="/app/progress"
                element={
                  <KeelStudentRoute>
                    <ProgressPage />
                  </KeelStudentRoute>
                }
              />
              {/* KEEL — cards (W8.3/W8.4). Same guard as the two screens
                  above. The shell nav entry lands with W9, which owns the
                  `app.nav.cards` message key. */}
              <Route
                path="/app/cards"
                element={
                  <KeelStudentRoute>
                    <CardsPage />
                  </KeelStudentRoute>
                }
              />
              {/* KEEL — coach space (W6.1). Guarded by an ACTIVE `coaches`
                  row, not by `keel_role` and not by the legacy subscription
                  tier: keel_role is routing metadata, the coaches row is the
                  fact. Same reasoning as KeelStudentRoute above — RLS remains
                  the real boundary, this guard is navigation. */}
              <Route
                path="/coach"
                element={
                  <CoachRoute>
                    <CoachHomePage />
                  </CoachRoute>
                }
              />
              {/* PIVOT §3.7 — the Doctrine Copilot. The screen that carries
                  "c'est MON agent": the coach's beliefs, interdictions,
                  vocabulary and voice, versioned. Same CoachRoute guard;
                  coach_doctrines has a coach-owned RLS policy but every write
                  on this screen goes through coach-doctrine-v1 so publication
                  order (unpublish before publish) stays server-side. */}
              <Route
                path="/coach/doctrine"
                element={
                  <CoachRoute>
                    <CoachDoctrinePage />
                  </CoachRoute>
                }
              />
              {/* KEEL — the template library (W6.4). The coach WORKS here: a
                  plan is imported once into a template, each student is a
                  clone + diff. Same guard as /coach; plan_templates has no
                  `authenticated` RLS policy at all, so every read and write
                  goes through plan-template-v1 under the service role. */}
              <Route
                path="/coach/templates"
                element={
                  <CoachRoute>
                    <TemplatesPage />
                  </CoachRoute>
                }
              />
              {/* KEEL — coach billing (W10.3). Same CoachRoute guard: the seat
                  ledger and the billing summary are SECURITY DEFINER RPCs that
                  resolve the caller's own coaches row and raise 42501 for
                  anybody else, so this guard is navigation and the database is
                  the boundary. */}
              <Route
                path="/coach/billing"
                element={
                  <CoachRoute>
                    <CoachBillingPage />
                  </CoachRoute>
                }
              />
              {/* KEEL — invitation landing (W6.5). PUBLIC on purpose: the
                  visitor has no account yet. The page speaks to one anon RPC
                  (preview_coach_invitation) that returns the coach's first
                  name and the invited email, and nothing else. */}
              <Route path="/join" element={<JoinPage />} />
              {/* KEEL — a coach reading ONE student's space (W6.6). No route
                  guard wrapper: the page is gated by RLS itself, and it writes
                  a coach_access_events line through log_coach_student_access
                  BEFORE reading. A visitor who is not this student's active
                  coach gets the refusal panel because the RPC raises and every
                  policy returns zero rows — the guard is the database. */}
              <Route path="/coach/clients/:id" element={<CoachStudentPage />} />
              {/* KEEL — the coach composes this student's week of meals (Q6).
                  Same CoachRoute guard as the other coach work screens; the
                  composition itself goes through keel-meal-plan-v1, which
                  re-derives the coach from the JWT and checks the plan is
                  theirs. Nothing on this screen is scored: a meal id cannot
                  satisfy commitment_evaluations' foreign key. */}
              <Route
                path="/coach/clients/:studentId/meals"
                element={
                  <CoachRoute>
                    <MealPlanPage />
                  </CoachRoute>
                }
              />
              {/* KEEL — the student READS that week (Q6). Read-only by RLS:
                  the meal tables carry no student write policy at all. */}
              <Route
                path="/app/meals"
                element={
                  <KeelStudentRoute>
                    <StudentMealPlanPage />
                  </KeelStudentRoute>
                }
              />
              <Route path="/le-plan" element={<ProductPlan />} />
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
                path="/onboarding-v2"
                element={
                  <RequirePrelaunchGate>
                    <OnboardingV2 />
                  </RequirePrelaunchGate>
                }
              />
              {/* W2.A: routes legacy démontées (/architecte/*, /grimoire/*,
                  /formules, /l-architecte, /tdah, /parrainage,
                  /transformations/new). Les fichiers de pages restent en
                  place — W2.B les supprime. Il n'existait pas de route
                  /modules: ModulesPage était montée sur /architecte. */}
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
