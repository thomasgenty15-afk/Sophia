import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthProvider";
// ── LA VITRINE ────────────────────────────────────────────────────────────
// Deux mondes, chacun avec son hall et ses trois portes. Le hall porte la
// promesse commune et oriente; la porte fait l'argument complet d'UN acheteur.
//
// LE MONDE DU FOYER. `/` vend au foyer depuis le 2026-08-12 (il vendait au
// coach avant, et cette copie vit maintenant sous `/coaches`). Les trois portes
// correspondent aux trois branches RÉELLES du parcours d'entrée
// (`FunnelBranch = solo | pair | family`, onboarding.ts:84): la promesse d'une
// page est donc tenue par l'écran suivant.
import HomePage from "./keel/pages/HomePage";
import MealPrepPage from "./keel/pages/MealPrepPage";
import CouplesPage from "./keel/pages/CouplesPage";
import FamiliesPage from "./keel/pages/FamiliesPage";
// LE MONDE DES PROFESSIONNELS. Trois acheteurs distincts: qui vend une
// formation (douleur: le one-shot), une salle indépendante (le churn), une
// communauté payante (un fil ne répond pas à une personne — c'est de
// l'architecture, pas de la charge de travail).
// Publiques et statiques, SANS redirection pour un visiteur connecté: ce sont
// des liens qu'on envoie. Seuls les deux halls redirigent.
import ProPage from "./keel/pages/ProPage";
import CoachesPage from "./keel/pages/CoachesPage";
import GymsLandingPage from "./keel/pages/GymsLandingPage";
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
import { KeelHouseholdRoute } from "./keel/components/KeelHouseholdRoute";
import { KeelOnboardingGate } from "./keel/components/KeelOnboardingGate";
import JoinHouseholdPage from "./keel/pages/JoinHouseholdPage";
import CoachHomePage from "./keel/pages/CoachHomePage";
import CoachDoctrinePage from "./keel/pages/CoachDoctrinePage";
import CoachProtocolPage from "./keel/pages/CoachProtocolPage";
import CoachWeeklyPage from "./keel/pages/CoachWeeklyPage";
import StudentWeekPlanPage from "./keel/pages/StudentWeekPlanPage";
import StudentProgressPage from "./keel/pages/StudentProgressPage";
import StudentHealthPage from "./keel/pages/StudentHealthPage";
import HouseholdPage from "./keel/pages/HouseholdPage";
import SetupPage from "./keel/pages/SetupPage";
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
              {/* ── LA VITRINE: DEUX MONDES, DEUX HALLS, SIX PORTES ────────
                  Refonte du 2026-08-12. `/` vendait au COACH; il vend désormais
                  au FOYER, et la page coach a déménagé sous `/coaches`.
                  ⚠️ Aucune redirection n'est posée pour ce déménagement, et
                  c'est délibéré: `/` n'a pas disparu, il a changé de contenu.
                  Les liens profonds en circulation (`/gyms`, `/communities`) ne
                  bougent pas.
                  ⚠️ « keel » n'affleure dans AUCUNE de ces URL — c'est un nom
                  interne — et aucun nom de plateforme non plus (Skool, Circle,
                  Discord, Kajabi): il n'existe aucune intégration avec elles, et
                  une URL qui en nommerait une promettrait le contraire.
                  ⚠️ Seuls les deux HALLS redirigent un visiteur connecté vers
                  son espace. Les six pages segment sont des liens qu'on envoie:
                  y renvoyer un lecteur connecté ferait passer le lien pour
                  cassé. */}
              <Route path="/" element={<HomePage />} />
              <Route path="/meal-prep" element={<MealPrepPage />} />
              <Route path="/couples" element={<CouplesPage />} />
              <Route path="/families" element={<FamiliesPage />} />
              <Route path="/pro" element={<ProPage />} />
              <Route path="/coaches" element={<CoachesPage />} />
              <Route path="/gyms" element={<GymsLandingPage />} />
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
                    <KeelOnboardingGate>
                      <TodayPage />
                    </KeelOnboardingGate>
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
                    <KeelOnboardingGate>
                      <KeelChatPage />
                    </KeelOnboardingGate>
                  </KeelStudentRoute>
                }
              />
              {/* ⚠️ GARDE ÉLARGIE AU FOYER (L8/O2, 2026-08-12), et c'est la
                  MÊME correction que le lot 6 a faite pour `/app/household`,
                  pour la même population et la même raison.

                  `KeelStudentRoute` exige `profiles.keel_role = 'student'`, et
                  la réclamation d'un profil de foyer ne l'écrit PAS — c'est
                  écrit en toutes lettres dans 20260811060000. Un compte
                  secondaire tombait donc sur « tu n'es pas un élève » ICI,
                  c'est-à-dire sur le seul écran où le modèle lui demande
                  d'agir: D2 dit que `generate-meal-v1` ne sert QUE les comptes
                  secondaires qui prennent la main et les comptes individuels
                  sans foyer. Sans cette ligne, la prise de main (D7) et donc
                  toute la chaîne de fusion restent inatteignables par un vrai
                  utilisateur — le trou O2 du registre.

                  C'est de la NAVIGATION, pas de la sécurité: RLS reste la
                  frontière, et `generate-meal-v1` garde ses propres refus. */}
              <Route
                path="/app/plan"
                element={
                  <KeelHouseholdRoute>
                    <KeelOnboardingGate>
                      <StudentWeekPlanPage />
                    </KeelOnboardingGate>
                  </KeelHouseholdRoute>
                }
              />
              <Route
                path="/app/progress"
                element={
                  <KeelStudentRoute>
                    <KeelOnboardingGate>
                      <StudentProgressPage />
                    </KeelOnboardingGate>
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
                    <KeelOnboardingGate>
                      <StudentHealthPage />
                    </KeelOnboardingGate>
                  </KeelStudentRoute>
                }
              />
              {/* KEEL — /app/household. Qui mange ici, ce dont chacun a envie
                  cette semaine, et ce que la maison ne sert pas à qui.
                  Autorité produit: docs/keel/PIVOT-FOYER.md §8.
                  Même garde que les écrans au-dessus: la route est de la
                  navigation, RLS reste la vraie frontière — et ici elle porte
                  davantage que d'habitude, puisque `keel_household_of` décide
                  seul de ce que chaque membre peut lire du foyer.
                  ⚠️ GARDE ÉLARGIE AU LOT 6: quelqu'un qui a RÉCLAMÉ son profil
                  n'est l'élève de personne — `profiles.keel_role` n'est écrit
                  que par les trois portes de coaching. `KeelHouseholdRoute`
                  laisse entrer un membre de foyer, et retombe sur la garde
                  élève pour tous les autres. Sans elle, la réclamation
                  aboutissait en base et la personne atterrissait sur « tu n'es
                  pas un élève ». */}
              <Route
                path="/app/household"
                element={
                  <KeelHouseholdRoute>
                    <KeelOnboardingGate>
                      <HouseholdPage />
                    </KeelOnboardingGate>
                  </KeelHouseholdRoute>
                }
              />
              {/* KEEL — FF-060, `/app/setup`: le parcours d'entrée.
                  Trois étapes qui se terminent PAR LA GÉNÉRATION, et pas par un
                  « merci ». Avant lui, un compte neuf atterrissait sur
                  `/app/today` — vide — et tout son réglage vivait derrière un
                  bouton « Set up » qu'il fallait deviner dans une fenêtre de
                  `/app/plan`.

                  ⚠️ `KeelHouseholdRoute` ET PAS `KeelStudentRoute`, la même
                  garde que `/app/plan` et pour la même population: quelqu'un
                  qui a RÉCLAMÉ son profil de foyer n'est l'élève de personne
                  (`profiles.keel_role` reste NULL, exprès), et c'est justement
                  quelqu'un qui a besoin de régler sa direction. La route est de
                  la navigation; RLS reste la frontière. */}
              <Route
                path="/app/setup"
                element={
                  <KeelHouseholdRoute>
                    <SetupPage />
                  </KeelHouseholdRoute>
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
                  `CardsPage.tsx`, `keel/api/cards.ts`, `keel-cards-v1` et les
                  quatre tables `card_*` sont SUPPRIMÉS depuis le 2026-08-08
                  (migration 20260808070000): l'humain a confirmé que le produit
                  grand public n'a plus aucun utilisateur. Seule la redirection
                  ci-dessous survit — un lien en circulation ne doit pas
                  mourir. */}
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
              {/* KEEL — /join-household?token=… — RÉCLAMER SON PROFIL DE FOYER
                  (chantier foyer, lot 6). PUBLIQUE, comme /join et pour la même
                  raison: la personne qui ouvre le lien n'a le plus souvent
                  aucun compte. Elle parle à UNE seule RPC anon,
                  `keel_household_preview_invitation`, qui rend trois champs —
                  le nom du foyer, le prénom de la bouche, l'adresse invitée —
                  tous déjà entre les mains de qui détient le lien. La
                  réclamation elle-même exige une session, et la base compare
                  l'adresse du compte à celle de l'invitation. */}
              <Route path="/join-household" element={<JoinHouseholdPage />} />
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
                    <KeelOnboardingGate>
                      <StudentMealPlanPage />
                    </KeelOnboardingGate>
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
                  lecteur dans KEEL — la page des cartes de l'élève passait par
                  `keel-cards-v1` et `card_templates`, pas par ces panneaux
                  (chaîne elle-même supprimée le 2026-08-08). */}
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
