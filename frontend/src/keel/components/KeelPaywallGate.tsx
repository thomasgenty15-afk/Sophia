import React from "react";

import { useHouseholdAccess } from "../../context/HouseholdAccessContext";
import { PaywallPanel } from "./PaywallPanel";
import { paywallDecision } from "./paywallDecision";

// ---------------------------------------------------------------------------
// FF-064 — LE MUR DE PAIEMENT: TOUT `/app/*` SE FERME AU 8ᵉ JOUR
// ---------------------------------------------------------------------------
//
// ── CE QUE CE GARDE N'EST PAS ─────────────────────────────────────────────
// De la sécurité. RLS reste la frontière, et les DEUX refus `402
// household_frozen` (`generate-meal-v1`, `generate-household-meal-v1`) restent
// en place. ⛔ Ne les retire pas au motif que le front bloque déjà: ce serait
// rouvrir l'API à qui sait faire un `curl`, et c'est précisément le défaut que
// `generate-meal-v1` a dû réparer le 2026-08-11 — le 402 du foyer se
// contournait par la porte voisine, pour 19 805 jetons.
//
// ── CE QUI A CHANGÉ LE 2026-09-09, ET CE QUI N'A PAS CHANGÉ ───────────────
// Le commentaire SQL de `keel_household_is_covered` disait « le gel ne ferme
// que la PRODUCTION: aucune lecture n'en dépend ». Ce n'est plus vrai côté
// écran, par décision du propriétaire: au 8ᵉ jour, tout `/app/*` passe
// derrière ce panneau. La RÈGLE, elle, n'a pas bougé d'une ligne — ce qui a
// bougé, c'est le nombre d'écrans qui la lisent.
//
// ── FAIL-OPEN, TROIS CAS, ET ILS SONT TESTÉS ──────────────────────────────
// `loading`, lecture en échec, hors foyer. Le troisième couvre l'élève d'un
// coach, dont le siège est payé par quelqu'un d'autre. La décision vit dans
// `paywallDecision.ts` pour être testable sans monter React.
//
// ── SUR PLACE, JAMAIS EN REDIRECTION ──────────────────────────────────────
// Trois raisons, et la première est la plus chère: rediriger vers
// `/app/billing` mettrait un profil réclamé devant un écran dont l'unique
// action lui est refusée (403 `not_household_owner`). Ensuite, une redirection
// à chaque navigation rend le bouton retour inutilisable. Enfin, elle efface
// l'écran demandé — on ne saurait plus d'où l'on vient.
//
// ── OÙ IL N'EST PAS, ET POURQUOI CE N'EST PAS UNE LISTE ───────────────────
// `/app/billing` ne reçoit simplement pas ce composant, et `/account`,
// `/legal`, `/upgrade` vivent hors de `/app/*`. Il n'y a donc aucun
// `isPaywallAllowedPath()` à tenir: une liste de chemins est une garde qu'on
// désarme en ajoutant une ligne, tandis que l'absence d'un composant se lit
// dans le routeur.
//
// ⚠️ IL SE POSE AVANT `KeelOnboardingGate`. Gelé, on ne doit pas être renvoyé
// vers `/app/setup`, dont l'étape finale EST une génération — donc un 402. Un
// couloir d'entrée qui finit sur un refus de paiement est pire qu'un mur franc.

export function KeelPaywallGate({ children }: { children: React.ReactNode }) {
  const { status, coverage } = useHouseholdAccess();
  const decision = paywallDecision(status, coverage);

  if (decision === "wait") return null;
  if (decision === "pass") return <>{children}</>;
  return <PaywallPanel isOwner={decision === "owner_panel"} />;
}

export default KeelPaywallGate;
