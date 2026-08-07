import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthProvider";
// KEEL pivot: "/" sells Sophia to coaches (English, B2B). The old French
// consumer landing (pages/LandingPage) is unmounted, not deleted.
import LandingPage from "./keel/pages/LandingPage";
// La seconde page de vente. Même produit, autre acheteur: `/` parle à qui vend
// une formation, `/gyms` au propriétaire-coach d'une salle indépendante, dont la
// douleur est le churn et pas le one-shot. Publique, statique, aucune redirection
// pour un visiteur connecté — voir l'en-tête du fichier.
import GymsLandingPage from "./keel/pages/GymsLandingPage";
// La troisième. Le propriétaire d'une communauté payante a DÉJÀ le récurrent —
// ni le one-shot de `/`, ni le churn de `/gyms`: sa douleur est qu'un fil ne
// peut pas répondre à une personne. Publique, statique, sans redirection pour
// un visiteur connecté, comme `/gyms`.
import CommunitiesPage from "./keel/pages/CommunitiesPage";
import ProductPlan from "./pages/ProductPlan";
import UpgradePlan from "./pages/UpgradePlan"; // IMPORT UPGRADE PAGE
import Account from "./pages/Account";
import Auth from "./pages/Auth";
import EmailVerified from "./pages/EmailVerified";
import ResetPassword from "./pages/ResetPassword";
import InstallAppGuide from "./pages/InstallAppGuide";
import Legal from "./pages/Legal"; // IMPORT PAGE LEGALE
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsageDashboard from "./pages/AdminUsageDashboard";
import AdminProductionLog from "./pages/AdminProductionLog";
import {
  RequireAdmin,
  RequireAppAccess,
} from "./security/RouteGuards";
import { OnboardingAmbientAudioProvider } from "./context/OnboardingAmbientAudioContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import PlanImportPage from "./keel/pages/PlanImportPage";
import TodayPage from "./keel/pages/TodayPage";
import KeelChatPage from "./keel/pages/ChatPage";
import JoinPage from "./keel/pages/JoinPage";
import StartPage from "./keel/pages/StartPage";
import CoachStudentPage from "./keel/pages/CoachStudentPage";
// ⚠️ RÉPARATION TRANSITOIRE, NON COMMITTÉE — `MealPlanPage` et trois
// composants `mealPlan/` ont été SUPPRIMÉS (suppressions `staged`) par un autre
// chantier en cours, sans que cet import ni sa route soient retirés: l'arbre ne
// typecheckait plus. L'import et la route sont neutralisés ici juste pour que
// le dépôt compile. C'est le refactor d'autrui — à eux de décider ce qui prend
// la place de `/coach/clients/:studentId/meals`.
import StudentMealPlanPage from "./keel/pages/mealPlan/StudentMealPlanPage";
import { KeelStudentRoute } from "./keel/components/KeelStudentRoute";
import CoachHomePage from "./keel/pages/CoachHomePage";
import CoachDoctrinePage from "./keel/pages/CoachDoctrinePage";
import CoachProtocolPage from "./keel/pages/CoachProtocolPage";
import CoachWeeklyPage from "./keel/pages/CoachWeeklyPage";
import StudentWeekPlanPage from "./keel/pages/StudentWeekPlanPage";
import StudentProgressPage from "./keel/pages/StudentProgressPage";
import StudentHealthPage from "./keel/pages/StudentHealthPage";
import HouseholdPage from "./keel/pages/HouseholdPage";
import NotFoundPage from "./keel/pages/NotFoundPage";
import CoachBillingPage from "./keel/pages/CoachBillingPage";
import TemplatesPage from "./keel/pages/TemplatesPage";
import CoachMealsPage from "./keel/pages/CoachMealsPage";
import { CoachRoute } from "./keel/components/CoachRoute";

function App() {
  // Parrainage : les liens de partage pointent vers n'importe quelle page du
  // site avec ?ref=CODE ; on capture le code dès le chargement initial.
  React.useEffect(() => {
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
              {/* La page de vente aux SALLES DE SPORT indépendantes. `/gyms` et
                  pas `/keel/gyms`: « keel » est un nom interne et ne doit jamais
                  affleurer dans une URL. */}
              <Route path="/gyms" element={<GymsLandingPage />} />
              {/* La page de vente aux PROPRIÉTAIRES DE COMMUNAUTÉ PAYANTE
                  (Skool, Circle, Discord, Kajabi). Même règle d'URL que
                  ci-dessus, et le nom d'aucune de ces plateformes n'y figure:
                  il n'existe aucune intégration avec elles, et une URL qui en
                  nommerait une promettrait le contraire. */}
              <Route path="/communities" element={<CommunitiesPage />} />
              {/* DE-WHATSAPP — `/chat` était le simulateur WhatsApp web (le trio
                  ChatPage + ChatInterface + useChat). Il redirige vers la vraie
                  bulle plutôt que de 404: un lien en circulation ne doit pas
                  mourir, et l'écran qu'il visait EST maintenant `/app/chat`. */}
              <Route path="/chat" element={<Navigate to="/app/chat" replace />} />
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
              {/* PIVOT N3 — le plan de la semaine, celui de l'ÉLÈVE.
                  §1.2 disait « l'élève n'a AUCUNE interface » ; l'arbitrage du
                  2026-08-03 l'a inversé (voir l'amendement en tête de
                  PLAN-NUIT.md). La décision P0.0(a) — auth.users fantôme —
                  avait été prise pour garder ce chemin ouvert : il suffit de
                  poser un mot de passe sur la même ligne. */}
              {/* DE-WHATSAPP — LA BULLE. C'est le canal de conversation, plus
                  un simulateur: `/app/chat` remplace le couple
                  ChatPage+whatsapp-sim-inbound, qui meurt en P5. Même garde que
                  les autres écrans élève. */}
              <Route
                path="/app/chat"
                element={
                  <KeelStudentRoute>
                    <KeelChatPage />
                  </KeelStudentRoute>
                }
              />
              <Route
                path="/app/plan"
                element={
                  <KeelStudentRoute>
                    <StudentWeekPlanPage />
                  </KeelStudentRoute>
                }
              />
              <Route
                path="/app/progress"
                element={
                  <KeelStudentRoute>
                    <StudentProgressPage />
                  </KeelStudentRoute>
                }
              />
              {/* KEEL — /app/health. Ce que l'élève ne peut pas manger:
                  allergies, intolérances, médicaments. La table existait et
                  alimentait déjà le verrou de sortie; il n'existait aucune
                  surface pour la remplir. Même garde que les écrans
                  au-dessus — RLS reste la vraie frontière. */}
              <Route
                path="/app/health"
                element={
                  <KeelStudentRoute>
                    <StudentHealthPage />
                  </KeelStudentRoute>
                }
              />
              {/* KEEL — /app/household. Qui mange ici, ce dont chacun a envie
                  cette semaine, et ce que la maison ne sert pas à qui.
                  Autorité produit: docs/keel/PIVOT-FOYER.md §8.
                  Même garde que les écrans au-dessus: la route est de la
                  navigation, RLS reste la vraie frontière — et ici elle porte
                  davantage que d'habitude, puisque `keel_household_of` décide
                  seul de ce que chaque membre peut lire du foyer. */}
              <Route
                path="/app/household"
                element={
                  <KeelStudentRoute>
                    <HouseholdPage />
                  </KeelStudentRoute>
                }
              />
              {/* KEEL — `/app/cards` est DÉMONTÉE (cartes d'attaque/défense,
                  W8.3/W8.4). Pas parce que l'écran était imparfait: il exige un
                  `plan_versions` publié et tombe sinon sur l'état `no_plan`, et
                  le modèle 1:N n'en publie JAMAIS (docs/keel/MODEL.md). L'onglet
                  menait donc à un écran vide en permanence, pour tout élève
                  KEEL. Il redirige vers `/app/today` plutôt que de 404 — même
                  raison que `/chat` plus haut: un lien en circulation ne doit
                  pas mourir.
                  `CardsPage.tsx`, `keel/api/cards.ts`, `keel-cards-v1`, le cron
                  `keel-arm-cards` et les quatre tables restent EN PLACE: le
                  produit grand public tourne encore depuis ce même code sur un
                  autre projet Supabase. Démonté, pas détruit. */}
              <Route path="/app/cards" element={<Navigate to="/app/today" replace />} />
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
              {/* PIVOT C5 — the Monday read. `coach-synthesis-v1` had been
                  writing a row every Monday at 06:00 UTC with `delivered_at`
                  null and no screen referencing the table: the synthesis
                  existed only in the database. Same CoachRoute guard; the row
                  is readable through the coach-owned RLS policy, and marking
                  it read goes through a SECURITY DEFINER function so a coach
                  cannot rewrite a report about their own students. */}
              <Route
                path="/coach/weekly"
                element={
                  <CoachRoute>
                    <CoachWeeklyPage />
                  </CoachRoute>
                }
              />
              {/* KEEL — `/coach/protocol`: LA MÉTHODE DU COACH.
                  Le coach n'écrit plus d'engagements structurés (polarité,
                  target_op, evaluation_grain, autonomy…) : il coche une posture
                  par groupe d'aliments et pose quelques règles temporelles à
                  gabarits fermés, et les engagements en sont DÉRIVÉS
                  (`_shared/keel/protocol_compiler.ts`).
                  Cet écran prend la place de `/coach/templates` dans la
                  navigation. `/coach/templates` reste joignable par URL le
                  temps que la migration des coachs qui ont déjà des engagements
                  écrits à la main soit tranchée — retirer la route avant
                  ferait perdre à ces coachs l'accès à ce qu'ils ont écrit. */}
              <Route
                path="/coach/protocol"
                element={
                  <CoachRoute>
                    <CoachProtocolPage />
                  </CoachRoute>
                }
              />
              {/* KEEL — la bibliothèque de recettes du coach. Elle existait en
                  base, en fonction edge et en API cliente depuis le 04/08 sans
                  aucune surface: six fonctions exportées, zéro appelant. Le
                  coach écrit un plat UNE fois et toute sa cohorte le lit — rien
                  ici n'assigne quoi que ce soit à un élève nommé, c'est
                  précisément le 1:1 que le pivot a retiré (docs/keel/MODEL.md).
                  Même garde que le reste de l'espace coach; `meal_ideas` porte
                  une policy `for all` qui borne le coach à ses propres lignes,
                  donc la base est la vraie frontière. */}
              <Route
                path="/coach/meals"
                element={
                  <CoachRoute>
                    <CoachMealsPage />
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
              {/* KEEL — la porte d'entrée LIBRE, sans invitation. PUBLIQUE, et
                  elle parle à une seule RPC anon (keel_free_signup_available)
                  qui rend un booléen sur l'état de NOTRE programme de découverte
                  — rien sur personne. C'est la seule inscription élève du
                  produit depuis que /auth a perdu la sienne: elle demande le
                  PAYS, que /auth ne demandait pas et que le numéro de téléphone
                  déduisait avant le pivot. */}
              <Route path="/start" element={<StartPage />} />
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
              {/* Route neutralisée avec l'import ci-dessus — voir la note. */}
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
              {/* PIVOT KEEL — `/dashboard` et `/onboarding-v2` sont démontées
                  ET supprimées. C'étaient les deux écrans du produit grand
                  public: le tableau de bord des plans, des cartes d'attaque et
                  de défense, et son onboarding. Aucun des deux n'avait de
                  lecteur dans KEEL — la page des cartes de l'élève passe par
                  `keel-cards-v1` et `card_templates`, pas par ces panneaux. */}
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
              {/* PIVOT / ANNEXE A.6 point 1 — LE CATCH-ALL, et il doit rester
                  EN DERNIER: React Router prend la première route qui matche,
                  donc un "*" placé plus haut avalerait tout ce qui suit.
                  Avant lui, une URL inconnue rendait un écran blanc — déjà un
                  défaut aujourd'hui, et le prérequis du démontage legacy: le
                  jour où /dashboard ou /onboarding-v2 disparaissent, tous les
                  liens encore en circulation tombent ici plutôt que dans le
                  vide. */}
              <Route path="*" element={<NotFoundPage />} />
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
