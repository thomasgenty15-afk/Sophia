import { supabase } from "../../lib/supabase";

// ---------------------------------------------------------------------------
// LA COUVERTURE DU FOYER — DANS SON PROPRE MODULE (FF-064)
// ---------------------------------------------------------------------------
//
// ⚠️ CE FICHIER EXISTE POUR UNE RAISON MESURÉE, PAS POUR RANGER. Ces deux
// déclarations vivaient dans `api/household.ts`. Le mur de paiement les lit
// depuis le contexte, qui est monté sur les SEPT routes `/app/*` — et
// `pageSeams.int.test.ts` a rougi: un `import type` suffit à faire « atteindre »
// tout le namespace `household.*` à `/app/today`, `/app/chat`, `/app/progress`
// et `/app/about-you`, qui n'affichent pas une seule de ses phrases.
//
// Le remède habituel du dépôt est « déclarer plutôt qu'éviter ». Il ne
// s'applique pas ici: déclarer dirait que ces quatre écrans montrent du
// vocabulaire de foyer, ce qui est FAUX, et la déclaration serait alors un
// mensonge qui fait taire le seul scanner capable de repérer une vraie couture.
// Un TYPE ne doit pas traîner une API derrière lui: on coupe l'arête.
//
// `api/household.ts` les RÉEXPORTE, donc aucun appelant existant ne bouge.

/**
 * MON FOYER EST-IL EN PAUSE ? (chantier 3, D4)
 *
 * ── POURQUOI L'ÉCRAN DEMANDE, AU LIEU D'ATTENDRE LE REFUS ─────────────────
 * `supabase.functions.invoke` ne rend PAS le corps d'une réponse non-2xx: il
 * rend « Edge Function returned a non-2xx status code ». Le refus nommé de
 * `generate-household-meal-v1` (`household_frozen`, 402) arriverait donc à
 * l'écran comme une panne générique — et « un refus muet se lit comme une
 * panne » est exactement ce que ce chantier existe pour éviter. L'écran
 * demande donc son état, et le serveur refuse quand même: la garde est en
 * base, ceci n'est que la phrase.
 *
 * ── AUCUNE RÈGLE ICI ──────────────────────────────────────────────────────
 * `keel_household_my_coverage` est une dérivation de
 * `keel_household_is_covered`, la définition unique du dépôt. L'écran ne lit
 * NI `free_until` NI `subscriptions`: une seconde définition côté navigateur
 * afficherait « en pause » à quelqu'un qui compose très bien, ou l'inverse.
 *
 * En cas d'échec de lecture on rend `frozen: false` — ne pas savoir n'est pas
 * une raison d'annoncer une pause à quelqu'un qui paie.
 */
export interface HouseholdCoverage {
  inHousehold: boolean;
  frozen: boolean;
  /** Le dernier jour couvert par l'essai, ou `null` (aucun essai posé). */
  freeUntil: string | null;
  /**
   * `'owner'` = le compte maître, celui dont la carte porte l'abonnement.
   *
   * ⚠️ IL EST LU DEPUIS LE 2026-09-09 ET IL ÉTAIT DÉJÀ RENDU. La RPC en rend
   * SIX (`in_household, household_id, role, free_until, covered, frozen`,
   * migration 20260811050000 §3a) et cette fonction en gardait trois. Le mur
   * de paiement (FF-064) doit distinguer le maître, à qui on montre un geste,
   * d'un profil réclamé, à qui le tunnel répondrait `not_household_owner`
   * (403) — « montrer un contrôle qui échoue à tous les coups est pire qu'un
   * contrôle absent ».
   *
   * `null` hors foyer: la RPC ne rend alors que `{in_household:false,
   * frozen:false}`, et inventer `'member'` par défaut ferait croire à une
   * place que personne n'occupe.
   */
  role: string | null;
}

export async function loadMyHouseholdCoverage(): Promise<HouseholdCoverage> {
  const open: HouseholdCoverage = {
    inHousehold: false,
    frozen: false,
    freeUntil: null,
    role: null,
  };
  const { data, error } = await supabase.rpc("keel_household_my_coverage");
  if (error) return open;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    inHousehold: row.in_household === true,
    frozen: row.frozen === true,
    freeUntil: typeof row.free_until === "string" ? row.free_until : null,
    role: typeof row.role === "string" ? row.role : null,
  };
}
