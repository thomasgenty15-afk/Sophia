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
// ⚠️ CE QUI N'A PAS SUIVI, ET POURQUOI. `readViewerAway` (et
// `readViewerMealsOut`, retiré le 2026-09-24) restent chez `meal-energy-v1`: ils dépendent d'un
// `viewerMemberId` que seule cette fonction résout, et ils portent l'arbitrage
// de présence du foyer. `keel-tracking-v1` ne les réimplémente pas — il
// S'ABSTIENT sur un plan de foyer, ce qui est le comportement que
// `meal-energy-v1` a lui-même choisi quand la trace lui manque.

import type { MouthEnergyDish, BoxedMouthEnergyDish } from "./mouth_energy.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionInput,
  type CompositionState,
  type CompositionUnit,
} from "./food_composition.ts";
import type { EnergyDish, EnergyPreparation } from "./plan_energy.ts";
import {
  SIDE_COURSE_KINDS,
  SIDE_COURSE_SOURCES,
  type SideCourseKind,
  type SideCourseSource,
} from "./side_courses_types.ts";

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
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT A · L'IDENTIFIANT DE RÉFÉRENCE, ENFIN TRANSMIS — 2026-09-11
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ C'EST LA LIGNE QUI MANQUAIT, ET ELLE COÛTAIT DES REPAS. Ce lecteur
    // construisait un `CompositionInput` avec `term`, `amount`, `unit`,
    // `state`, `quantity` — et rien d'autre. Toute la mesure repartait donc du
    // libellé en clair, pendant que le parseur, lui, pesait par l'identifiant.
    // Mesuré sur les deux plans de la campagne du 2026-09-11: le modèle écrit
    // `ref` sur 49 lignes sur 49 (GAIN), et DEUX ingrédients restent non
    // mesurables. `pita_wholemeal` porte `unit_grams = 60` au référentiel; le
    // libellé « pita complète » n'a aucun alias (la table porte « pita
    // complet » et « pitas completes »). Résultat: `1 unit` non pesé, plat
    // incomplet, **aucune boîte** — PERTE samedi déjeuner et GAIN vendredi
    // dîner, deux cases livrées sans portion.
    //
    // ⚠️ LE JSON DU PLAN EST EN snake_case (R1): `ref` et `ref_refused`. Le
    // second n'existe pas sur les plans écrits avant ce lot, et son absence
    // vaut `false` — c'est-à-dire le chemin historique par le terme, conservé
    // à l'identique.
    ref: typeof i.ref === "string" && i.ref.trim() !== "" ? i.ref.trim() : null,
    // ⛔ `=== true` ET PAS UNE COERCITION: une valeur absente, `null` ou un
    // `"false"` textuel d'une archive ne doivent pas refuser une ligne. Le seul
    // refus reconnu est celui que le parseur a écrit.
    refRefused: i.ref_refused === true,
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

/**
 * ⚠️ ⟳ 2026-09-11 · LOT B — CE LECTEUR NE PORTE **AUCUN GRAMME DE BOÎTE**.
 *
 * ⛔ LE DÉFAUT QU'IL A DÉJÀ CAUSÉ, MESURÉ. `scripts/2026-09-11-mesure-grille.ts`
 * appelait `planEnergy(readDishes(...))` pour les kcal et lisait les GRAMMES
 * ailleurs — sur les boîtes personnalisées. Les deux ne décrivent pas la même
 * portion: `readDishes` ne connaît que `uses.servings / servingsMade`, une part
 * CONVENTIONNELLE. Le rapport divisait donc les calories d'une part par la masse
 * d'une autre, et rendait 757 kcal là où le contenant en portait 857,9
 * (`ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` § 1, trois assiettes sur trois).
 *
 * Pour « combien y a-t-il dans CE contenant », le lecteur est
 * `readEnergyBoxDishes` juste en dessous, servi à `boxNutrition`
 * (`mouth_energy.ts`).
 */
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
// ⟳ LOT 0 (2026-09-06) — la forme est celle que `boxEnergies` attend, définie
// UNE fois côté moteur (`BoxedMouthEnergyDish`) ; les items portent la clé de
// casserole quand l'archive l'a écrite.
//
// ⟳ 2026-09-23 — ET L'IDENTIFIANT DE RÉFÉRENCE DE L'ITEM, QUAND IL EST ÉCRIT.
// Chantier « assiettes normales », flux F. Le type ÉTEND celui du moteur au
// lieu d'en être l'alias: un item qui porte `ref` reste un item que
// `boxEnergies` accepte (un champ de plus ne retire rien), et le type du moteur
// (`mouth_energy.ts`) n'a pas à bouger pour un champ qu'il ne lit pas.
//
// ⛔ L'ÉNERGIE NE LIT TOUJOURS PAS `ref`. Un item de boîte se chiffre par sa
// casserole (`preparationId`) ou par sa part du frais du plat — jamais par son
// nom, jamais par son identifiant: c'est la règle du lot 0, et elle tient.
// `ref` voyage pour les lecteurs qui ont besoin de SAVOIR quel aliment est
// dans une boîte construite par le moteur (le contrôle des exclusions et du
// régime sur les boîtes, l'écran) sans repartir du libellé.
export interface EnergyBoxItem {
  grams: number;
  preparationId?: string | null;
  /**
   * Le slug du référentiel écrit sur l'item. ABSENT (pas `null`) quand
   * l'archive ne le porte pas: un plan d'avant le lot A se relit à l'octet près
   * comme avant ce champ.
   */
  ref?: string;
}

export interface EnergyBoxDish extends BoxedMouthEnergyDish {
  boxes: readonly {
    id: string;
    memberIds: readonly string[];
    items: readonly EnergyBoxItem[];
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
          items: items.map((rawItem): EnergyBoxItem => {
            const it = (rawItem as Record<string, unknown> | null) ?? {};
            const prep = it.preparation_id;
            const itemRef = typeof it.ref === "string" ? it.ref.trim() : "";
            return {
              grams: Number(it.grams) || 0,
              // ⟳ LOT 0 — la clé est portée telle qu'écrite : une chaîne cite une
              // casserole, `null` dit « frais », et une archive d'avant v4 qui ne
              // la porte pas rend `undefined` (pliage legacy). Ne pas « réparer »
              // l'absence en `null` : ce serait promettre du frais à ce qui n'a
              // jamais été décrit.
              ...(prep === undefined ? {} : { preparationId: typeof prep === "string" && prep !== "" ? prep : null }),
              // ⟳ 2026-09-23 — l'identifiant GARDÉ quand il est écrit, absent
              // sinon. Voir `EnergyBoxItem.ref`. Le terme, lui, reste dehors.
              ...(itemRef === "" ? {} : { ref: itemRef }),
            };
          }),
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
      // ⟳ LOT 0 — la méthode nourrit la densité de la casserole (`potDensities`).
      method: String(p.method ?? ""),
    };
  }).filter((p) => p.id !== "");
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-23 — LES À-CÔTÉS D'UN PLAN, RELUS DU PAYLOAD
// ══════════════════════════════════════════════════════════════════════════
//
// Chantier « assiettes normales », flux F. Plan:
// `~/.claude/plans/lexical-gliding-lamport.md`. Un à-côté (entrée, fromage,
// dessert, pain) n'est JAMAIS un item de boîte: il vit à part, dans
// `dishes[i].side_courses[]` (`DishSideCoursePayload`, `side_courses_types.ts`),
// pour que « l'assiette = le plat » reste vrai chez tous les lecteurs de masse.
// Ce lecteur est le seul chemin du JSON vers l'énergie des à-côtés: `meal-
// energy-v1`, l'audit du plan livrable et l'énergie servie finale le partagent.
//
// ⛔ UN PLAN SANS À-CÔTÉS N'A PAS LA CLÉ, ET SE LIT COMME AVANT. Aucun plat ne
// reçoit d'à-côté inventé: pas de clé, `[]`.

/**
 * UN À-CÔTÉ TEL QUE L'ÉNERGIE LE LIT.
 *
 * `dishIndex`: l'indice du plat qui le porte dans `dishes`, pour rattacher
 * l'à-côté à la boîte de sa personne SUR CE PLAT. `null` quand l'à-côté vient
 * du registre en mémoire (`sidesFromLedger`, `served_final.ts`), qui ne connaît
 * que la personne, le jour et le moment.
 *
 * `grams`: `null` quand le payload ne porte pas une masse lisible — jamais 0.
 * Une masse inconnue rend l'à-côté illisible, elle ne le rend pas vide.
 *
 * `kind`: `null` quand le type écrit n'est pas dans `SIDE_COURSE_KINDS`. ⚠️ Il
 * reste COMPTÉ en énergie: c'est de la nourriture servie, quel que soit le mot
 * qui la range.
 */
export interface EnergySideCourse {
  dishIndex: number | null;
  memberId: string;
  day: string | null;
  slot: string | null;
  kind: SideCourseKind | null;
  term: string;
  /** Le slug du référentiel. `null` = une préparation sans slug propre, ou rien d'écrit. */
  ref: string | null;
  /** La préparation d'une session (entrée préparée, soupe), sinon `null`. */
  preparationId: string | null;
  grams: number | null;
  unitCount: number | null;
  source: SideCourseSource | null;
}

/**
 * LES À-CÔTÉS DE TOUS LES PLATS, À PLAT, DANS L'ORDRE DU PAYLOAD.
 *
 * ⛔ `ref` EST GARDÉ TEL QU'ÉCRIT (après `trim`), jamais reconstruit depuis le
 * terme: c'est le slug qui pèse. Le terme est le mot d'écran (« pomme »), et
 * un libellé de référentiel anglais n'en est pas un.
 *
 * ⚠️ UNE ENTRÉE SANS `member_id` EST JETÉE: un à-côté n'est servi qu'à une
 * personne, et sans elle il n'a ni boîte où se poser ni journée où compter.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function readEnergySideCourses(raw: unknown): EnergySideCourse[] {
  if (!Array.isArray(raw)) return [];
  const out: EnergySideCourse[] = [];
  raw.forEach((entry, dishIndex) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    if (!Array.isArray(d.side_courses)) return;
    const day = d.day === null || d.day === undefined ? null : String(d.day);
    const slot = d.slot === null || d.slot === undefined ? null : String(d.slot);
    for (const rawSide of d.side_courses) {
      if (rawSide === null || typeof rawSide !== "object") continue;
      const s = rawSide as Record<string, unknown>;
      const memberId = String(s.member_id ?? "").trim();
      if (memberId === "") continue;
      const kind = String(s.kind ?? "");
      const source = String(s.source ?? "");
      const ref = typeof s.ref === "string" ? s.ref.trim() : "";
      const prep = typeof s.preparation_id === "string" ? s.preparation_id.trim() : "";
      const grams = Number(s.grams);
      const units = Number(s.unit_count);
      out.push({
        dishIndex,
        memberId,
        day,
        slot,
        kind: (SIDE_COURSE_KINDS as readonly string[]).includes(kind) ? kind as SideCourseKind : null,
        term: String(s.term ?? "").trim(),
        ref: ref === "" ? null : ref,
        preparationId: prep === "" ? null : prep,
        grams: Number.isFinite(grams) && grams > 0 ? grams : null,
        unitCount: Number.isFinite(units) && units > 0 ? units : null,
        source: (SIDE_COURSE_SOURCES as readonly string[]).includes(source)
          ? source as SideCourseSource
          : null,
      });
    }
  });
  return out;
}
