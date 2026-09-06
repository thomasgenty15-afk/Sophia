/**
 * KEEL — L'ALLERGÈNE DÉCLARÉ CONTRE LE GROUPE ALIMENTAIRE DÉCLARÉ.
 *
 * ── LE DÉFAUT MESURÉ (audit externe, 2026-09-05, plan réel A06-r2) ────────
 * Tom porte `allergen_ref='egg'`, `severity='medical'`. Le plan rendu contient
 * une préparation dont un ingrédient s'écrit `œufs` ET porte `group = "eggs"`.
 * La ceinture de sortie n'a rien vu: elle lit du TEXTE, la ligature « œ » lui
 * échappait, et **le groupe déclaré ne servait à rien**. Le plan est parti.
 *
 * La ligature est réparée dans `forbidden_matcher.ts`. Ce fichier répare
 * l'autre moitié, et la répare à un endroit où l'orthographe n'a plus son mot
 * à dire: quand le modèle ÉCRIT LUI-MÊME que cet ingrédient est du groupe
 * `eggs`, aucune graphie ne peut plus le sauver. Une garde de texte et une
 * garde de structure ratent des choses différentes; c'est pour ça qu'on en
 * veut deux, pas une meilleure.
 *
 * ── POURQUOI LA TABLE DÉMÉNAGE ICI ────────────────────────────────────────
 * `ALLERGEN_FOOD_GROUPS` vivait dans
 * `sophia-brain/skills/plan_question/allergen_bridge.ts`. C'est l'argument que
 * `allergen_surface_forms.ts` écrit déjà en tête, mot pour mot: « un skill ne
 * peut pas être la maison d'une donnée dont dépend un générateur ». Le skill
 * la RÉ-EXPORTE depuis ici; sa question à lui (« substituer vers ce groupe
 * met-il l'allergène dans l'assiette ? ») et la question d'ici (« ce que le
 * modèle a écrit contient-il l'allergène ? ») restent deux questions, une
 * seule table.
 *
 * ── CE QUE CE FICHIER N'EST PAS ───────────────────────────────────────────
 * Pas une ontologie, pas une inférence. Liste plate, fermée, écrite à la main.
 * Un slug absent garde exactement le comportement d'avant: `null`, c'est-à-dire
 * « cette table ne sait pas », JAMAIS « il n'y a rien ». Le troisième état est
 * le point: `swap_resolver.ts` s'abstient dessus, et la ceinture ci-dessous ne
 * prétend pas couvrir ce qu'elle ne lit pas — la garde de TEXTE reste la
 * première ligne.
 */

import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";
import {
  isBeltBlockingSeverity,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";

const FOOD_GROUP_SET: ReadonlySet<string> = new Set(FOOD_GROUP_REFS);

/**
 * Graine étroite. Les clés sont les slugs d'allergène/intolérance réellement
 * vus à l'intake; les valeurs sont les slugs de `food_groups` qui les
 * contiennent structurellement.
 *
 * Conservateur exprès: `nuts_seeds` est UN groupe, donc une allergie à
 * l'arachide bloque toutes les graines. Sur-bloquer escalade vers une relance;
 * sous-bloquer sert l'allergène. Seul le premier est récupérable.
 */
export const ALLERGEN_FOOD_GROUPS: Readonly<
  Record<string, readonly FoodGroupRef[]>
> = {
  gluten: ["whole_grain", "refined_grain"],
  wheat: ["whole_grain", "refined_grain"],
  lactose: ["dairy_yogurt", "dairy_cheese"],
  dairy: ["dairy_yogurt", "dairy_cheese"],
  milk: ["dairy_yogurt", "dairy_cheese"],
  casein: ["dairy_yogurt", "dairy_cheese"],
  egg: ["eggs"],
  eggs: ["eggs"],
  fish: ["fatty_fish", "white_fish"],
  shellfish: ["shellfish"],
  crustacean: ["shellfish"],
  mollusc: ["shellfish"],
  peanut: ["nuts_seeds"],
  tree_nut: ["nuts_seeds"],
  nuts: ["nuts_seeds"],
  sesame: ["nuts_seeds"],
  soy: ["tofu_tempeh"],
  soya: ["tofu_tempeh"],
  alcohol: ["alcohol"],
  pork: ["red_meat"],
  red_meat: ["red_meat"],
  meat: ["red_meat", "poultry"],
  legume: ["legumes"],
  legumes: ["legumes"],
};

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Les groupes qu'une contrainte couvre, ou `null` quand ce pont ne sait pas.
 * `null` n'est PAS une liste vide: c'est le troisième état qui fait s'abstenir.
 */
export function foodGroupsCoveredBy(
  constraintRef: string,
): FoodGroupRef[] | null {
  const slug = normalizeSlug(constraintRef);
  if (slug === "") return null;
  const mapped = ALLERGEN_FOOD_GROUPS[slug];
  if (mapped) return [...mapped];
  // Une contrainte qui nomme déjà un groupe est trivialement résolvable.
  if (FOOD_GROUP_SET.has(slug)) return [slug as FoodGroupRef];
  return null;
}

/** Un ingrédient tel que le parseur le rend: un mot, et parfois son groupe. */
export interface GroupedIngredient {
  readonly term: string;
  readonly group?: string | null;
  readonly food_group?: string | null;
}

/** Un porteur d'ingrédients — un plat ou une préparation, indifféremment. */
export interface GroupedFoodBearer {
  readonly title: string;
  readonly ingredients: readonly GroupedIngredient[];
}

export interface AllergenGroupViolation {
  /** L'identifiant de la contrainte enfreinte. */
  readonly constraintId: string;
  /** Le slug déclaré côté personne (`allergenRef` ou `substanceRef`). */
  readonly allergenRef: string;
  /** Le groupe écrit par le modèle sur l'ingrédient. */
  readonly foodGroup: string;
  /** Le mot de l'ingrédient, pour que le message nomme ce qu'on a vu. */
  readonly term: string;
  /** Le titre du plat ou de la préparation qui le porte. */
  readonly bearer: string;
}

function groupOf(ing: GroupedIngredient): string {
  const raw = ing.group ?? ing.food_group ?? "";
  return normalizeSlug(String(raw ?? ""));
}

/**
 * LA CEINTURE DE STRUCTURE. Elle ne lit aucune prose: seulement le groupe que
 * le modèle a lui-même écrit sur l'ingrédient, contre les slugs déclarés par
 * les contraintes BLOQUANTES (`medical`/`strict` — `isBeltBlockingSeverity`,
 * la même porte que la ceinture de texte, jamais une seconde définition).
 *
 * ⚠️ ELLE NE REMPLACE PAS LA GARDE DE TEXTE, et ne peut pas: un ingrédient
 * sans `group` lui est invisible. Les deux tournent, et une seule morsure
 * suffit. C'est aussi pour ça qu'elle ne rend jamais « propre »: elle rend une
 * LISTE, et une liste vide veut dire « je n'ai rien vu », pas « il n'y a
 * rien » — voir le compteur `checked` chez l'appelant.
 */
export function allergenGroupViolations(
  bearers: readonly GroupedFoodBearer[],
  constraints: readonly StudentSafetyConstraint[],
): AllergenGroupViolation[] {
  // Le repli du groupe vers les contraintes, calculé une fois.
  const blockedGroups = new Map<string, { id: string; ref: string }[]>();
  for (const constraint of constraints ?? []) {
    if (!constraint || !isBeltBlockingSeverity(constraint.severity)) continue;
    const refs = [constraint.allergenRef, constraint.substanceRef]
      .filter((ref): ref is string => Boolean(ref && ref.trim()));
    for (const ref of refs) {
      const groups = foodGroupsCoveredBy(ref);
      if (groups === null) continue;
      for (const group of groups) {
        const rows = blockedGroups.get(group) ?? [];
        rows.push({ id: constraint.id, ref: normalizeSlug(ref) });
        blockedGroups.set(group, rows);
      }
    }
  }
  if (blockedGroups.size === 0) return [];

  const out: AllergenGroupViolation[] = [];
  const seen = new Set<string>();
  for (const bearer of bearers ?? []) {
    for (const ing of bearer?.ingredients ?? []) {
      const group = groupOf(ing);
      if (!group) continue;
      for (const rule of blockedGroups.get(group) ?? []) {
        const term = String(ing.term ?? "").trim();
        // Une occurrence = une morsure, par (règle, porteur, mot): le même
        // groupe cité deux fois dans le même plat reste UN constat.
        const key = `${rule.id} | ${bearer.title} | ${term} | ${group}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          constraintId: rule.id,
          allergenRef: rule.ref,
          foodGroup: group,
          term,
          bearer: String(bearer?.title ?? ""),
        });
      }
    }
  }
  return out;
}

/** Combien d'ingrédients portaient un groupe — le dénominateur de la ceinture. */
export function groupedIngredientCount(
  bearers: readonly GroupedFoodBearer[],
): number {
  let n = 0;
  for (const bearer of bearers ?? []) {
    for (const ing of bearer?.ingredients ?? []) if (groupOf(ing)) n++;
  }
  return n;
}
