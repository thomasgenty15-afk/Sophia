// LE PAYLOAD D'UN PLAN, RELU POUR `plan_energy.ts` — module PUR, aucune I/O.
//
// ══════════════════════════════════════════════════════════════════════════
// POURQUOI CES QUATRE LECTEURS ONT QUITTÉ `meal-energy-v1/index.ts`
// ══════════════════════════════════════════════════════════════════════════
//
// Ils y vivaient seuls tant qu'une seule fonction calculait l'énergie d'un
// plan. `keel-tracking-v1` (A7, 2026-09-03) en calcule une seconde: le total
// d'une JOURNÉE, où la part du plan est la base exacte.
//
// ⛔ ET UNE SECONDE COPIE AURAIT DÉRIVÉ, dans la direction la plus coûteuse.
// `readIngredient` porte trois arbitrages qui ne se devinent pas et qui valent
// des dizaines de pour cent: `null` plutôt qu'un `state` deviné (« raw » sur du
// riz vaut un facteur 2,6, toujours dans le sens qui gonfle), `null` plutôt
// qu'une unité inconnue, et la SECONDE copie de la quantité en prose — la ligne
// sans laquelle 3 833 lignes de plans déjà écrits seraient comptées « sans
// quantité » alors que leur masse est en clair. Une réimplémentation en aurait
// perdu une, et le chiffre serait resté plausible.
//
// ⚠️ LE CODE EST DÉPLACÉ, PAS RÉÉCRIT. Aucun comportement ne change: les corps
// sont ceux de `meal-energy-v1` au commit `31ee930f`, avec leurs commentaires,
// et `meal-energy-v1` les importe désormais d'ici.
//
// ⚠️ CE QUI N'A PAS SUIVI, ET POURQUOI. `readViewerAddons`, `readViewerMealsOut`
// et `readViewerAway` restent chez `meal-energy-v1`: ils dépendent d'un
// `viewerMemberId` que seule cette fonction résout, et ils portent l'arbitrage
// de présence du foyer. `keel-tracking-v1` ne les réimplémente pas — il
// S'ABSTIENT sur un plan de foyer, ce qui est le comportement que
// `meal-energy-v1` a lui-même choisi quand la trace lui manque.

import type { MouthEnergyDish } from "./mouth_energy.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionInput,
  type CompositionState,
  type CompositionUnit,
} from "./food_composition.ts";
import type { EnergyDish, EnergyPreparation } from "./plan_energy.ts";

/** Une quantité structurée telle que la ligne de plan la porte (FF-038). */
export function readIngredient(raw: unknown): CompositionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  const term = String(i.term ?? "").trim();
  if (!term) return null;
  const amount = Number(i.amount);
  const unit = String(i.unit ?? "");
  const state = String(i.state ?? "");
  return {
    term,
    // `null` PLUTÔT QU'UN DÉFAUT, à chaque champ. Un `state` deviné « raw » sur
    // du riz vaut un facteur 2,6, et toujours dans le sens qui gonfle. Ce
    // lecteur ne répare rien: il transmet l'inconnu, et `plan_energy` en fait
    // une abstention.
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: (COMPOSITION_UNITS as readonly string[]).includes(unit)
      ? (unit as CompositionUnit)
      : null,
    state: (COMPOSITION_STATES as readonly string[]).includes(state)
      ? (state as CompositionState)
      : null,
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT `L-1-b` · LA SECONDE COPIE DE LA QUANTITÉ — 2026-08-22
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ TRANSMISE, PAS INTERPRÉTÉE. `resolveIngredients` ne la lit QUE lorsque
    // la copie structurée ci-dessus a rendu `null`, et la lecture elle-même est
    // dans `quantity_from_prose.ts`: un nombre suivi d'un symbole de mesure
    // ancré des deux bouts, ou rien. Aucun mot n'est lu.
    //
    // ⛔ C'EST LE CHEMIN QUI FAIT BOUGER LE CORPUS DÉJÀ ÉCRIT. `grams_raw` est
    // FIGÉ à la génération; cette lane recalcule sur l'index d'aujourd'hui.
    // Sans cette ligne, 3 833 lignes de plans existants continueraient d'être
    // comptées « sans quantité » alors que leur masse est écrite en clair.
    quantity: typeof i.quantity === "string" ? i.quantity : null,
  };
}

export function readIngredients(raw: unknown): CompositionInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CompositionInput[] = [];
  for (const entry of raw) {
    const i = readIngredient(entry);
    if (i) out.push(i);
  }
  return out;
}

export function readDishes(raw: unknown): EnergyDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      day: d.day === null || d.day === undefined ? null : String(d.day),
      method: String(d.method ?? ""),
      ingredients: readIngredients(d.ingredients),
      uses: Array.isArray(d.uses)
        ? d.uses.map((rawUse) => {
          const u = (rawUse ?? {}) as Record<string, unknown>;
          return {
            preparationId: String(u.preparation_id ?? ""),
            servings: Number(u.servings) || 1,
          };
        }).filter((u) => u.preparationId !== "")
        : [],
    };
  });
}

/**
 * ⟳ LOT F (2026-09-04) — LES PLATS **AVEC LEURS CONTENANTS**, tels que
 * `boxEnergies` les attend.
 *
 * ⛔ UN SECOND LECTEUR À CÔTÉ DE `readDishes`, ET C'EST VOULU. `readDishes`
 * nourrit `planEnergy` — l'assiette DU LECTEUR, tronc + add-ons — et n'a rien à
 * savoir des couvercles. Celui-ci nourrit le kcal PAR CONTENANT, qui a besoin
 * du `slot`, des `member_ids` et des grammes de chaque item. Les faire porter
 * par un seul type obligerait l'un des deux appelants à ignorer des champs, et
 * c'est le champ ignoré qui se perd en silence (cicatrice `ingredientPayload`).
 *
 * ⚠️ IL S'APPUIE SUR `readDishes` pour tout ce qu'ils ont en commun: deux
 * lectures de `uses` ou de `ingredients` divergeraient au premier champ ajouté.
 */
export interface EnergyBoxDish extends MouthEnergyDish {
  boxes: readonly {
    id: string;
    memberIds: readonly string[];
    items: readonly { grams: number }[];
    legacyTotalGrams: number | null;
  }[];
}

export function readEnergyBoxDishes(raw: unknown): EnergyBoxDish[] {
  if (!Array.isArray(raw)) return [];
  const common = readDishes(raw);
  return raw.map((entry, i) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    const boxes = Array.isArray(d.boxes) ? d.boxes : [];
    return {
      ...common[i],
      slot: d.slot === null || d.slot === undefined ? null : String(d.slot),
      boxes: boxes.map((rawBox) => {
        const b = (rawBox ?? {}) as Record<string, unknown>;
        const items = Array.isArray(b.items) ? b.items : [];
        const legacy = Number(b.legacy_total_grams);
        return {
          id: String(b.id ?? ""),
          memberIds: Array.isArray(b.member_ids)
            ? b.member_ids.map((m) => String(m ?? "").trim()).filter(Boolean)
            : [],
          items: items.map((rawItem) => ({
            grams: Number((rawItem as Record<string, unknown> | null)?.grams) || 0,
          })),
          legacyTotalGrams: Number.isFinite(legacy) && legacy > 0 ? legacy : null,
        };
      }).filter((b) => b.id !== ""),
    };
  });
}

export function readPreparations(raw: unknown): EnergyPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      servingsMade: Math.max(1, Number(p.servings_made) || 1),
      ingredients: readIngredients(p.ingredients),
    };
  }).filter((p) => p.id !== "");
}
