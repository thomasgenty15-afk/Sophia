import React from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { hasAnsweredTheFunnel } from "../api/postLogin";

// KEEL — FF-060: LE COULOIR D'ENTRÉE EST VRAIMENT UN COULOIR.
//
// ── LE DÉFAUT, VU PAR UN VRAI INSCRIT (2026-08-13) ─────────────────────────
// L'entonnoir existait, et on pouvait cliquer à côté. `KeelAppShell` rendait
// les huit onglets de l'app élève AUTOUR de l'écran d'entrée: un clic sur
// « Today », « Plan » ou « Progress » sortait du parcours — vers des écrans
// VIDES, puisque rien n'a encore été composé. On juge alors le produit sur ces
// écrans-là, et on ne revient pas.
//
// Retirer la navigation de l'écran (voir `FunnelShell`) ne suffit PAS: l'URL
// reste tapable, un ancien onglet reste ouvert, un lien reste en circulation.
// La garde doit vivre sur les ROUTES D'ARRIVÉE, pas sur celle qu'on quitte.
//
// ── CE QU'ELLE N'EST PAS ───────────────────────────────────────────────────
// Ce n'est pas du contrôle d'accès. RLS reste la frontière, et les fonctions
// edge gardent leurs refus nommés. C'est de la NAVIGATION: on ramène quelqu'un
// là où il a quelque chose à faire.
//
// ── LE FAIT LU, ET POURQUOI CELUI-LÀ ───────────────────────────────────────
// La ligne `student_goals`, la même que `resolveHomePath` — et pas
// `profiles.onboarding_completed`, qui dirait « terminé » d'un parcours dont
// les faits ont changé depuis. Sans cette ligne, LES DEUX générateurs rendent
// `goal_required` (409): il n'y a littéralement rien à voir sur les écrans
// qu'on garde.
//
// ⚠️ FAIL SAFE, PAS FAIL CLOSED. Une lecture qui ÉCHOUE (`null`) laisse passer.
// Renvoyer dans le couloir quelqu'un dont on n'a pas pu lire la ligne
// l'enfermerait dehors de son propre produit sur un hoquet réseau — et le
// couloir a besoin de la même lecture pour s'afficher, donc il échouerait
// aussi. Seul un `false` EXPLICITE redirige.

type Gate =
  | { kind: "checking" }
  /** `true` = l'entonnoir est derrière lui; `false` = il n'a rien répondu. */
  | { kind: "known"; answered: boolean };

export function KeelOnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [gate, setGate] = React.useState<Gate>({ kind: "checking" });

  React.useEffect(() => {
    let cancelled = false;
    if (!userId) {
      // Pas de session: ce n'est pas à cette garde-ci de trancher. Celle qui
      // l'enveloppe (`KeelStudentRoute` / `KeelHouseholdRoute`) envoie déjà
      // vers `/auth`, et deux redirections concurrentes se battraient.
      setGate({ kind: "known", answered: true });
      return;
    }
    setGate({ kind: "checking" });
    void hasAnsweredTheFunnel(userId).then((answered) => {
      if (cancelled) return;
      // `null` (illisible) vaut « laisse passer ». Voir l'en-tête.
      setGate({ kind: "known", answered: answered !== false });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading || gate.kind === "checking") return null;
  if (!gate.answered) return <Navigate to="/app/setup" replace />;
  return <>{children}</>;
}

export default KeelOnboardingGate;
