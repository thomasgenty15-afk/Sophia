import type { HouseholdCoverage } from "../api/householdCoverage";
import type { HouseholdAccessStatus } from "../../context/HouseholdAccessContext";

// ---------------------------------------------------------------------------
// FF-064 — CE QUE LE MUR DÉCIDE, ET RIEN D'AUTRE
// ---------------------------------------------------------------------------
//
// Hors du `.tsx` pour la raison habituelle du dépôt (Fast Refresh), et pour
// une seconde qui compte davantage: une décision d'argent doit se tester sans
// monter React. Les cinq entrées ci-dessous sont exactement les cinq états
// possibles, et `paywallGate.int.test.ts` les épingle une par une — y compris
// LE CAS QUI PASSE, sans lequel une garde cassée ressemble à une garde qui
// marche.
//
// ⚠️ CE MODULE NE DÉFINIT PAS « COUVERT ». Il n'y a qu'une définition, en SQL
// (`keel_household_is_covered`), et `frozen` en est la projection, calculée par
// le serveur. Écrire ici « gelé = pas d'abonnement et essai fini » créerait la
// seconde définition que le chantier 3 a existé pour retirer.

export type PaywallDecision =
  /** La couverture n'est pas encore lue: on ne rend RIEN, comme les autres gardes. */
  | "wait"
  /** Rien ne s'oppose au passage. */
  | "pass"
  /** Gelé, et cette personne porte la carte: on lui montre le geste. */
  | "owner_panel"
  /** Gelé, mais le tunnel lui répondrait 403: on lui dit à qui s'adresser. */
  | "member_panel";

/**
 * ── FAIL-OPEN, EN TROIS CAS NOMMÉS ────────────────────────────────────────
 *   1. `status === "loading"` — on attend. Un mur affiché pendant une lecture
 *      couperait tout le monde une fraction de seconde à chaque chargement.
 *   2. `coverage === null` — la lecture a échoué. `loadMyHouseholdCoverage`
 *      replie déjà toute erreur sur `{frozen:false}`; ce `null` ne survient
 *      qu'en l'absence de session, et il passe pour la même raison.
 *   3. `inHousehold === false` — l'immense majorité des comptes, dont l'élève
 *      d'un coach, dont le siège est payé par quelqu'un d'autre. La même
 *      phrase est déjà dans le commentaire SQL de
 *      `keel_household_coverage_for_user`: « un gel par défaut couperait tout
 *      le produit ».
 *
 * Se tromper de sens coupe quelqu'un qui paie, et aucun nouvel essai ne répare
 * ça. `frozen !== true` et pas `!frozen`: seul un `true` EXPLICITE ferme.
 */
export function paywallDecision(
  status: HouseholdAccessStatus,
  coverage: HouseholdCoverage | null,
): PaywallDecision {
  if (status === "loading") return "wait";
  if (!coverage) return "pass";
  if (!coverage.inHousehold) return "pass";
  if (coverage.frozen !== true) return "pass";
  return coverage.role === "owner" ? "owner_panel" : "member_panel";
}
