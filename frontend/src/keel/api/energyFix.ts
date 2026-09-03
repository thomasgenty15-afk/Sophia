// FF-062 R11 — CORRIGER LE CHIFFRE D'ÉNERGIE D'UNE PHOTO, côté client.
//
// ── CE QUE LE FRONT A À CONNAÎTRE, ET C'EST TOUT ──────────────────────────
// La FORME du jeton, et la décision de soumission. Ce qui change en base — la
// bascule de base `photo_estimate` → `declared_quantities` — vit côté serveur
// (`correctEnergy`), et c'est délibéré: une base décidée par le client serait
// une base que le client choisit.
//
// ⚠️ MIROIR DU LECTEUR DENO. Le front est en Vite/TS et le back en Deno: aucun
// import n'est possible entre les deux runtimes. `proactiveTokens.int.test.ts`
// lit les deux fichiers sur le disque et vérifie que les formes coïncident.

/** Le préfixe du jeton. Neuvième vocabulaire, disjoint des huit autres. */
export const ENERGY_FIX_TOKEN_PREFIX = "KEEL_KCAL_";

/**
 * `true` si ce payload ouvre le dialogue de correction du chiffre.
 *
 * Ancré aux deux bouts, comme les deux autres jetons de formulaire. Un
 * `startsWith` accepterait une charge tronquée, et l'identifiant d'événement
 * qu'elle porte deviendrait `undefined` en aval — c'est-à-dire un formulaire
 * que le serveur refusera après que la personne l'a rempli.
 */
export function isEnergyFixToken(payload: string): boolean {
  return /^KEEL_KCAL_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    .test(String(payload ?? "").trim());
}

// Les bornes de plausibilité d'un repas, en kcal. Copie assumée du back
// (`ENERGY_KCAL_MIN/MAX` dans `meal_analysis.ts`), gardée par le test de
// jetons: aucun import n'est possible entre les deux runtimes.
export const ENERGY_KCAL_MIN = 1;
export const ENERGY_KCAL_MAX = 5000;

export type EnergyFixError =
  /** Rien n'a été saisi. On ne remplace pas un chiffre par du vide. */
  | { kind: "empty" }
  | { kind: "not_a_number" }
  | { kind: "out_of_range"; min: number; max: number };

export type EnergyFixSubmission =
  | { ok: true; values: { kcal: number } }
  | { ok: false; error: EnergyFixError };

/**
 * Ce qui part quand l'élève valide — ou ce qui le refuse.
 *
 * ── LE VIDE EST UN REFUS, PAS UNE SUPPRESSION ────────────────────────────
 * « Modifier » puis valider à blanc ne doit pas effacer l'estimation: la
 * personne a ouvert un champ, elle n'a pas demandé le silence. Retirer un
 * chiffre est un autre geste, et il n'existe pas.
 *
 * ── HORS BORNES = REFUSÉ ET NOMMÉ ────────────────────────────────────────
 * Le serveur applique la même règle (`correctEnergy`); ici c'est pour que
 * l'élève voie son erreur au lieu de la subir en silence.
 */
export function buildEnergyFixSubmission(raw: string): EnergyFixSubmission {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: { kind: "empty" } };
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, error: { kind: "not_a_number" } };
  const kcal = Math.round(n);
  if (kcal < ENERGY_KCAL_MIN || kcal > ENERGY_KCAL_MAX) {
    return {
      ok: false,
      error: { kind: "out_of_range", min: ENERGY_KCAL_MIN, max: ENERGY_KCAL_MAX },
    };
  }
  return { ok: true, values: { kcal } };
}
