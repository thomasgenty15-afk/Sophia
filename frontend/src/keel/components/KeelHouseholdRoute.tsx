import React from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { t } from "../i18n/t";
import { KeelStudentRoute } from "./KeelStudentRoute";

// KEEL — la garde de `/app/household`, et le trou qu'elle ferme (lot 6).
//
// ── LE DÉFAUT ─────────────────────────────────────────────────────────────
// `KeelStudentRoute` exige `profiles.keel_role = 'student'`, et ce rôle n'est
// écrit QUE par trois chemins: accepter l'invitation d'un coach, l'inscription
// libre, et l'entrée chez le coach maison. Quelqu'un qui RÉCLAME son profil de
// foyer n'en emprunte aucun — il n'est l'élève de personne. Sans cette garde,
// la réclamation aboutissait en base et la personne atterrissait sur « tu n'es
// pas un élève »: la fonctionnalité était construite et le fil non rebranché.
//
// ── POURQUOI PAS UN PARAMÈTRE OPTIONNEL SUR L'AUTRE GARDE ────────────────
// « Un paramètre de garde optionnel est une garde désarmée » — une prop
// `allowHouseholdMember` sur `KeelStudentRoute` s'oublierait à l'appel suivant,
// et l'oubli est invisible (l'écran marche pour un élève, qui est le cas de
// test le plus probable). Deux composants, deux règles, aucun défaut à choisir.
//
// ── ET POURQUOI PAS ÉCRIRE `keel_role = 'student'` À LA RÉCLAMATION ──────
// Parce que ce serait faux, et pas seulement en vocabulaire: ce rôle décrit
// une relation avec un coach qui n'existe pas ici, et il ouvre `/app/today`,
// qui lit le mode 1:1 et les repas composés PAR la personne — rien pour un
// profil réclamé, qui ne compose pas.
//
// ⟳ 2026-09-03 (A8.0, D8.1): `/app/chat` et `/app/progress` sont passés sous
// CETTE garde. Ils avaient « rien à montrer » à un membre tant que le cron du
// soir ne l'atteignait pas; depuis, il reçoit sa bande ③ et lit ses faits. Ce
// qui s'est élargi est la PORTE, pas le rôle — `keel_role` reste NULL.
//
// LA VRAIE FRONTIÈRE RESTE RLS. Cette garde est de la NAVIGATION: la
// vérification « suis-je dans un foyer ? » est la policy `for select` de
// `household_members` (`household_id = keel_household_of(auth.uid())`), donc
// zéro ligne pour qui n'y est pas. Une lecture qui ÉCHOUE ne vaut pas
// autorisation: on retombe alors sur la garde élève, qui refuse proprement.

type State = { kind: "loading" } | { kind: "in_household" } | { kind: "not_household" };

export function KeelHouseholdRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [state, setState] = React.useState<State>({ kind: "loading" });

  const userId = user?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setState({ kind: "loading" });
      return;
    }
    setState({ kind: "loading" });
    (async () => {
      try {
        // Aucun `.eq("user_id", …)`: la policy scope déjà au foyer de
        // l'appelant, et une bouche SANS COMPTE du même foyer est une ligne
        // légitime à compter. Ce qu'on demande, c'est « ai-je un foyer », pas
        // « ai-je une ligne ».
        const { data, error } = await supabase
          .from("household_members").select("member_id").limit(1);
        if (cancelled) return;
        if (error) {
          setState({ kind: "not_household" });
          return;
        }
        setState({ kind: (data ?? []).length > 0 ? "in_household" : "not_household" });
      } catch {
        if (!cancelled) setState({ kind: "not_household" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return null;
  // Pas de session: c'est `KeelStudentRoute` qui sait rediriger vers /auth avec
  // le bon `redirect`. Une seconde copie de cette redirection divergerait.
  if (!user) return <KeelStudentRoute>{children}</KeelStudentRoute>;

  if (state.kind === "loading") {
    return <p className="p-8 text-sm text-gray-500">{t("app.guard.checking")}</p>;
  }
  if (state.kind === "in_household") return <>{children}</>;

  // Personne d'un foyer: on retombe sur la règle habituelle. Un élève qui n'a
  // pas encore créé son foyer passe par là — c'est le chemin par lequel le
  // foyer se crée.
  return <KeelStudentRoute>{children}</KeelStudentRoute>;
}

export default KeelHouseholdRoute;
