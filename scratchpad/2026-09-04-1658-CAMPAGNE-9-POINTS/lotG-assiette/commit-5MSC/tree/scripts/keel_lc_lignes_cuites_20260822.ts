/**
 * ══════════════════════════════════════════════════════════════════════════
 * L-C — LES LIGNES CUITES LUES COMME DU CRU · le prédicat, publié
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-C`.
 * Lancé par `scripts/keel_lc_lignes_cuites_20260822.sh`, jamais seul.
 *
 *     deno run --allow-read scripts/keel_lc_lignes_cuites_20260822.ts <dir>
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN, NI EN BASE NI SUR LE FIL ────────────────────
 * Aucun `insert`, aucun `update`, aucun appel de modèle. Il lit des fichiers
 * et il imprime des lignes.
 *
 * ── ⛔ POURQUOI IL EXISTE : LE PRÉDICAT DOIT ÊTRE PUBLIÉ AVEC LE LOT ───────
 * La fiche annonçait « 131 lignes, 130 en `neutral` ». Un regex de libellé en
 * rendait 128/128, et le registre §⑨ n° 18 l'avait noté: **sans la liste
 * exacte, le test « qui liste les 131 » est inconstructible.** Ce fichier
 * porte donc DEUX choses indissociables:
 *
 *   ① `PREDICAT_CUIT` — le regex, écrit une seule fois, exécuté sur le
 *      référentiel VIVANT (jamais sur un compte recopié);
 *   ② `DECISIONS` — la liste LITTÉRALE, une ligne par slug, avec sa classe,
 *      son rendement AVANT et son rendement APRÈS.
 *
 * ⛔ ET LA GARDE EST LÀ-DESSUS: **toute ligne que ① attrape et que ② ne
 * nomme pas fait rougir ce script** (`rc=1`). C'est très exactement ce que la
 * fiche demande — « un test qui refuse qu'une ligne entre dans la liste sans
 * décision » — et c'est la seule forme qui survive à un référentiel qui
 * bouge: la ligne neuve d'un import CIQUAL ne peut pas entrer en silence.
 *
 * ── ⛔ AUCUN RAPPROCHEMENT AUTOMATIQUE ────────────────────────────────────
 * Le lot 30 a MESURÉ que l'automatisation rate: 12 lignes cuites ne portent
 * aucun mot-clé de cuisson (« Noodles », « Mashed potatoes », « Bread,
 * home-made ») et ont dû être lues une par une. Le prédicat ① n'est donc PAS
 * la source des décisions: il est le FILET qui vérifie qu'aucune ligne
 * attrapable n'a été oubliée. Les décisions, elles, sont écrites à la main,
 * et quatre d'entre elles sont marquées `hors-regex` parce qu'aucun `grep` ne
 * les trouve.
 *
 * ── ⚠️ CE QU'ON NE PEUT PAS VÉRIFIER, ET IL FAUT LE DIRE ──────────────────
 * 689 des 923 lignes se déclarent `ciqual` SANS `ciqual_code`. Pour elles,
 * remonter à la source est IMPOSSIBLE (lot `O9`). Ce script imprime ce
 * compte à côté de la liste plutôt que de laisser croire à une vérification
 * qui n'a pas eu lieu.
 */

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
  type CompositionState,
  type CompositionUnit,
  nutrientsOf,
  resolveIngredients,
  YIELD_FACTORS,
  type YieldClass,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import { dishEnergy } from "../supabase/functions/_shared/keel/plan_energy.ts";
import {
  fileClient,
  readDishes,
  readPreparations,
} from "./keel_v0e_resolveur_20260821.ts";

const dir = Deno.args[0] ?? ".";

function readNdjson(file: string): Record<string, unknown>[] {
  const raw = Deno.readTextFileSync(`${dir}/${file}`);
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    out.push(JSON.parse(t) as Record<string, unknown>);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ① LE PRÉDICAT — ÉCRIT UNE FOIS, PUBLIÉ, EXÉCUTÉ SUR LE RÉFÉRENTIEL VIVANT
// ---------------------------------------------------------------------------

/**
 * ⛔ CE REGEX N'EST PAS LA SOURCE DES DÉCISIONS. C'est le FILET.
 *
 * Il attrape les libellés qui DISENT un état cuit. Il en rate — le lot 30 l'a
 * mesuré — et les quatre qu'il rate sont marquées `horsRegex: true` plus bas.
 * Sa seule fonction est de rendre impossible qu'une ligne attrapable reste
 * SANS DÉCISION: c'est la garde ⓐ.
 *
 * ⚠️ Il est volontairement plus large que celui de la v1 du plan (128 lignes):
 * `steamed`, `toasted`, `puree`, `mashed`, `rehydrated`, `infused` et
 * `deep-fried` y sont ajoutés. Le compte publié est donc 141 et pas 128 — et
 * l'écart est une INFORMATION, pas une correction cosmétique: les six purées
 * de ce référentiel sont exactement des lignes cuites, et le regex de la v1
 * ne les voyait pas.
 */
export const PREDICAT_CUIT =
  /(braised|boiled|cooked|grilled|pan-fried|deep-fried|fried|roasted|baked|saut(e|é)ed|reheated|steamed|toasted|pur(e|é)e|mashed|rehydrated|infused)/i;

// ---------------------------------------------------------------------------
// ② LES DÉCISIONS — LA LISTE LITTÉRALE, UNE LIGNE PAR SLUG
// ---------------------------------------------------------------------------

export interface Decision {
  slug: string;
  /** Le rendement AVANT le lot, tel qu'il était en base le 2026-08-22. */
  avant: YieldClass;
  /** Le rendement que le lot DÉCIDE. Égal à `avant` = décision de NE PAS bouger. */
  apres: YieldClass;
  /** A · B · C · D — voir les directions, écrites AVANT l'`update`. */
  classe: "A" | "B" | "C" | "D";
  /** ⚠️ Vraie quand aucun `grep` de libellé ne trouve la ligne. */
  horsRegex?: true;
}

export const DECISIONS: readonly Decision[] = [
  // ── CLASSE A — ligne CUITE, déjà `neutral`. ⛔ DÉCISION: ON NE BOUGE PAS. ──
  //    `energy_kcal` y est la densité de l'aliment CUIT; `nutrientsOf` multiplie
  //    `gramsRaw` par elle. `neutral` est donc la SEULE classe qui rend juste, et
  //    c'est aussi la seule qui accepte un `state` absent (3 903 lignes du corpus).
  { slug: "apricot_pitted_rehydrated_35", avant: "neutral", apres: "neutral", classe: "A" }, // 200 · Apricot, pitted, dried, rehydrated to 35-45% water
  { slug: "artichoke", avant: "neutral", apres: "neutral", classe: "A" }, // 47.3 · Artichoke, steamed
  { slug: "asparagus_green_water", avant: "neutral", apres: "neutral", classe: "A" }, // 26.6 · Asparagus, green, boiled/cooked in water
  { slug: "asparagus_white_water", avant: "neutral", apres: "neutral", classe: "A" }, // 18.6 · Asparagus, white, boiled/cooked in water
  { slug: "baked_beans", avant: "neutral", apres: "neutral", classe: "A" }, // 94.0 · Baked beans
  { slug: "beef", avant: "neutral", apres: "neutral", classe: "A" }, // 240 · Beef, braised
  { slug: "beef_bolar_blade_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 144 · Beef, bolar-blade, grilled/pan-fried
  { slug: "beef_flank_steak_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 162 · Beef, flank steak, grilled/pan-fried
  { slug: "beef_ground", avant: "neutral", apres: "neutral", classe: "A" }, // 231 · Beef, ground, cooked (average)
  { slug: "beef_knuckle_water", avant: "neutral", apres: "neutral", classe: "A" }, // 161 · Beef, knuckle, boiled/cooked in water
  { slug: "beef_meat_balls", avant: "neutral", apres: "neutral", classe: "A" }, // 217 · Beef, meat balls, cooked
  { slug: "beef_oxtail_water", avant: "neutral", apres: "neutral", classe: "A" }, // 196 · Beef, oxtail, boiled/cooked in water
  { slug: "beef_rib_steak_lean", avant: "neutral", apres: "neutral", classe: "A" }, // 198 · Beef, rib steak, lean, grilled/pan-fried
  { slug: "beef_roast_beef", avant: "neutral", apres: "neutral", classe: "A" }, // 117 · Beef, roast beef, roasted/baked
  { slug: "beef_sirloin_steak_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 182 · Beef, sirloin steak, grilled/pan-fried
  { slug: "beef_thin_flank_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 174 · Beef, thin flank, grilled/pan-fried
  { slug: "beef_topside_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 141 · Beef, topside, grilled/pan-fried
  { slug: "black_pudding_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 246 · Black pudding (blood sausage), sautéed/pan-fried
  { slug: "broccoli_water_crunchy", avant: "neutral", apres: "neutral", classe: "A" }, // 23.5 · Broccoli, boiled/cooked in water, crunchy
  { slug: "broccoli_water_tender", avant: "neutral", apres: "neutral", classe: "A" }, // 23.1 · Broccoli, boiled/cooked in water, tender
  { slug: "brussels_sprout_water", avant: "neutral", apres: "neutral", classe: "A" }, // 45.4 · Brussels sprout, boiled/cooked in water
  { slug: "butter_bean_yellow_bean", avant: "neutral", apres: "neutral", classe: "A" }, // 34.6 · Butter bean or yellow bean, boiled/cooked in water
  { slug: "calf_head_water", avant: "neutral", apres: "neutral", classe: "A" }, // 187 · Calf, head, boiled/cooked in water
  { slug: "carrot_water_crunchy", avant: "neutral", apres: "neutral", classe: "A" }, // 35.7 · Carrot, boiled/cooked in water, crunchy
  { slug: "carrot_water_tender", avant: "neutral", apres: "neutral", classe: "A" }, // 31.6 · Carrot, boiled/cooked in water, tender
  { slug: "celeriac_water", avant: "neutral", apres: "neutral", classe: "A" }, // 26.2 · Celeriac, boiled/cooked in water
  { slug: "chayote_island_la_reunion", avant: "neutral", apres: "neutral", classe: "A" }, // 22.2 · Chayote, without skin, steamed, from the Island La Réunion (Sechium edule)
  { slug: "chicken_ham_slices", avant: "neutral", apres: "neutral", classe: "A" }, // 106 · Chicken cooked ham, in slices
  { slug: "chicken_leg_meat_water", avant: "neutral", apres: "neutral", classe: "A" }, // 188 · Chicken leg, meat, boiled/cooked in water
  { slug: "chicken_marinated_wing", avant: "neutral", apres: "neutral", classe: "A" }, // 213 · Chicken, marinated wing, roasted/baked
  { slug: "chinese_cabbageor_bok_choi", avant: "neutral", apres: "neutral", classe: "A" }, // 17.7 · Chinese cabbageor bok choï bredes, rods and leafs, steamed, from the island La
  { slug: "chinese_japanese_artichokes", avant: "neutral", apres: "neutral", classe: "A" }, // 50.8 · Chinese or Japanese artichokes, cooked
  { slug: "chipolata_sausage", avant: "neutral", apres: "neutral", classe: "A" }, // 282 · Chipolata sausage, cooked
  { slug: "chips_fries", avant: "neutral", apres: "neutral", classe: "A", horsRegex: true }, // 213.0 · Chips / fries
  { slug: "chitterling_sausage_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 271 · Chitterling sausage, pan-reheated
  { slug: "chitterling_sausage_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 303 · Chitterling sausage, sautéed/pan-fried
  { slug: "cooked_rice", avant: "neutral", apres: "neutral", classe: "A" }, // 145.0 · Cooked rice
  { slug: "crispbread_extruded", avant: "neutral", apres: "neutral", classe: "A" }, // 379 · Crispbread, extruded and grilled
  { slug: "duck_confit_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 195 · Duck confit (conserved in rendered fat), meat (leg) without skin, reheated
  { slug: "duck_magret_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 222 · Duck, magret, cooked in pan
  { slug: "early_potato_water", avant: "neutral", apres: "neutral", classe: "A" }, // 71.6 · Early potato, boiled/cooked in water, peeled
  { slug: "egg_added_fat", avant: "neutral", apres: "neutral", classe: "A" }, // 147 · Egg, fried without added fat
  { slug: "egg_hard", avant: "neutral", apres: "neutral", classe: "A" }, // 134 · Egg, hard-boiled
  { slug: "egg_soft", avant: "neutral", apres: "neutral", classe: "A" }, // 142 · Egg, soft-boiled
  { slug: "eggplant_pulp", avant: "neutral", apres: "neutral", classe: "A" }, // 33.8 · Eggplant, pulp and skin, roasted/baked
  { slug: "feathered_game_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 217 · Feathered game, meat, cooked (average)
  { slug: "french_bean_water", avant: "neutral", apres: "neutral", classe: "A" }, // 28 · French bean, boiled/cooked in water
  { slug: "french_fries_chips", avant: "neutral", apres: "neutral", classe: "A" }, // 213 · French fries or chips, frozen, roasted/baked
  { slug: "french_fries_chips_aw", avant: "neutral", apres: "neutral", classe: "A" }, // 254 · French fries or chips, frozen, pre-fried, aw, intended to be microwaved
  { slug: "french_fries_chips_deep", avant: "neutral", apres: "neutral", classe: "A" }, // 285 · French fries or chips, frozen, deep-fried
  { slug: "french_fries_chips_intended", avant: "neutral", apres: "neutral", classe: "A" }, // 244 · French fries or chips, frozen, pre-fried, raw, intended to be deep-fried
  { slug: "fruits_puree_apple_sugar", avant: "neutral", apres: "neutral", classe: "A" }, // 56.4 · Fruits puree, apple, without sugar added
  { slug: "fruits_puree_sugar_added", avant: "neutral", apres: "neutral", classe: "A" }, // 58.9 · Fruits puree, without sugar added
  { slug: "game", avant: "neutral", apres: "neutral", classe: "A" }, // 152 · Game, cooked (average)
  { slug: "garden_peas_water", avant: "neutral", apres: "neutral", classe: "A" }, // 80.3 · Garden peas, boiled/cooked in water
  { slug: "green_cabbage_water", avant: "neutral", apres: "neutral", classe: "A" }, // 21.6 · Green cabbage, boiled/cooked in water
  { slug: "ham_choice", avant: "neutral", apres: "neutral", classe: "A" }, // 125 · Cooked ham, choice
  { slug: "ham_choice_rind_less", avant: "neutral", apres: "neutral", classe: "A" }, // 114 · Cooked ham, choice, rind less and fatless
  { slug: "ham_choice_w_rind", avant: "neutral", apres: "neutral", classe: "A" }, // 137 · Cooked ham, choice, w rind
  { slug: "ham_on_bone", avant: "neutral", apres: "neutral", classe: "A" }, // 238 · Braised ham on the bone
  { slug: "ham_parisian_style_rind", avant: "neutral", apres: "neutral", classe: "A" }, // 115 · Cooked ham, Parisian-style, rind less and fatless
  { slug: "ham_smoked", avant: "neutral", apres: "neutral", classe: "A" }, // 135 · Cooked ham, smoked
  { slug: "ham_superior_quality", avant: "neutral", apres: "neutral", classe: "A" }, // 125 · Cooked ham, superior quality
  { slug: "ham_superior_quality_reduced", avant: "neutral", apres: "neutral", classe: "A" }, // 121 · Cooked ham, superior quality, reduced salt
  { slug: "ham_superior_quality_rind", avant: "neutral", apres: "neutral", classe: "A" }, // 137 · Cooked ham, superior quality, with rind
  { slug: "horse_rib_steak_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 169 · Horse, rib steak, grilled/pan-fried
  { slug: "horse_sirloin_steak_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 163 · Horse, sirloin steak, grilled/pan-fried
  { slug: "horse_topside_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 135 · Horse, topside, grilled/pan-fried
  { slug: "kidney_all_types", avant: "neutral", apres: "neutral", classe: "A" }, // 161 · Kidney, all types, cooked
  { slug: "kidney_veal_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 167 · Kidney, veal, sautéed/pan-fried
  { slug: "knuckle_ham", avant: "neutral", apres: "neutral", classe: "A" }, // 162 · Knuckle of ham, cooked
  { slug: "lamb_chop_fillet_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 157 · Lamb, chop fillet, grilled/pan-fried
  { slug: "lamb_leg_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 174 · Lamb, leg, grilled/pan-fried
  { slug: "lamb_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 208 · Lamb, meat, cooked (average)
  { slug: "lamb_rib_chop_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 185 · Lamb, rib chop, grilled/pan-fried
  { slug: "lamb_saddle_lean", avant: "neutral", apres: "neutral", classe: "A" }, // 153 · Lamb, saddle, lean, roasted/baked
  { slug: "lamb_saddle_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 153 · Lamb, saddle, grilled/pan-fried
  { slug: "leek_water", avant: "neutral", apres: "neutral", classe: "A" }, // 27.4 · Leek, boiled/cooked in water
  { slug: "lentils_cooked", avant: "neutral", apres: "neutral", classe: "A" }, // 104.1 · Lentils (cooked)
  { slug: "mashed_potato_balls", avant: "neutral", apres: "neutral", classe: "A" }, // 181 · Mashed potato balls pre-fried, frozen, raw
  { slug: "meat", avant: "neutral", apres: "neutral", classe: "A" }, // 182 · Meat, cooked (average)
  { slug: "morteaux_sausage_water", avant: "neutral", apres: "neutral", classe: "A" }, // 323 · Morteaux sausage, boiled/cooked in water
  { slug: "offal", avant: "neutral", apres: "neutral", classe: "A" }, // 162 · Offal, cooked (average)
  { slug: "onion_red_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 42.4 · Onion, red, sautéed/pan-fried, without fat
  { slug: "onion_white_yellow_sauteed", avant: "neutral", apres: "neutral", classe: "A" }, // 40.2 · Onion, white or yellow, sautéed/pan-fried, without fat
  { slug: "pepper_sweet_green_sauteed", avant: "neutral", apres: "neutral", classe: "A" }, // 28.6 · Pepper, sweet, green, sautéed/pan-fried, without fat
  { slug: "pepper_sweet_red_sauteed", avant: "neutral", apres: "neutral", classe: "A" }, // 35.7 · Pepper, sweet, red, sautéed/pan-fried, without fat
  { slug: "pepper_sweet_yellow_sauteed", avant: "neutral", apres: "neutral", classe: "A" }, // 35.8 · Pepper, sweet, yellow, sautéed/pan-fried, without fat
  { slug: "pigeon_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 213 · Pigeon, meat, roasted/baked
  { slug: "plantain_banana", avant: "neutral", apres: "neutral", classe: "A" }, // 125 · Plantain banana, cooked
  { slug: "pork_ham_intended_be", avant: "neutral", apres: "neutral", classe: "A" }, // 161 · Pork ham, intended to be cooked or pork ham, intended to be roast/bake
  { slug: "pork_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 205 · Pork, meat, cooked (average)
  { slug: "pork_shoulder_choice", avant: "neutral", apres: "neutral", classe: "A" }, // 121 · Cooked pork shoulder, choice
  { slug: "pork_shoulder_standard_rind", avant: "neutral", apres: "neutral", classe: "A" }, // 123 · Cooked pork shoulder, standard, rind less and fatless
  { slug: "pork_tenderloin_roast", avant: "neutral", apres: "neutral", classe: "A" }, // 198 · Pork tenderloin roast, cooked
  { slug: "potato_chip_quarter_spiced", avant: "neutral", apres: "neutral", classe: "A" }, // 174 · Potato chip, quarter, spiced, frozen, cooked
  { slug: "potato_into_cubes", avant: "neutral", apres: "neutral", classe: "A" }, // 135 · Potato, pre-fried into cubes, frozen, raw
  { slug: "potato_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 137 · Potato, sautéed/pan-fried
  { slug: "potato_sauteed_pan_goose", avant: "neutral", apres: "neutral", classe: "A" }, // 213 · Potato, sautéed/pan-fried, with goose fat
  { slug: "potato_vacuum", avant: "neutral", apres: "neutral", classe: "A" }, // 73.6 · Potato, steamed, vacuum-packed
  { slug: "potato_water", avant: "neutral", apres: "neutral", classe: "A" }, // 80.5 · Potato, boiled/cooked in water
  { slug: "poultry", avant: "neutral", apres: "neutral", classe: "A" }, // 166 · Poultry, cooked (average)
  { slug: "pumpkin", avant: "neutral", apres: "neutral", classe: "A" }, // 30.2 · Pumpkin, roasted/baked
  { slug: "pumpkin_pulp", avant: "neutral", apres: "neutral", classe: "A" }, // 30.7 · Pumpkin (cucurbita moschata), pulp, cooked
  { slug: "red_kuri_squash_pulp", avant: "neutral", apres: "neutral", classe: "A" }, // 44.8 · Red kuri squash, pulp, braised
  { slug: "red_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 195 · Red meat, cooked (average)
  { slug: "romanesco_cauliflower_romanesco_broccoli", avant: "neutral", apres: "neutral", classe: "A" }, // 35.8 · Romanesco cauliflower or romanesco broccoli, cooked
  { slug: "round_ham", avant: "neutral", apres: "neutral", classe: "A" }, // 182 · Round of ham, cooked
  { slug: "salsify_water", avant: "neutral", apres: "neutral", classe: "A" }, // 57.9 · Salsify, boiled/cooked in water
  { slug: "salt_curing_roast_poultry", avant: "neutral", apres: "neutral", classe: "A" }, // 110 · Salt curing roast poultry, cooked
  { slug: "sausage_brioche_crust", avant: "neutral", apres: "neutral", classe: "A" }, // 309 · Sausage in a brioche crust, cooked
  { slug: "sausage_pure_pork", avant: "neutral", apres: "neutral", classe: "A" }, // 322 · Cooked sausage, pure pork
  { slug: "shallot_pan_fat", avant: "neutral", apres: "neutral", classe: "A" }, // 66.9 · Shallot, grilled/pan-fried, without fat
  { slug: "snow_pea_water", avant: "neutral", apres: "neutral", classe: "A" }, // 30.5 · Snow pea, boiled/cooked in water
  { slug: "spinach_water", avant: "neutral", apres: "neutral", classe: "A" }, // 28.1 · Spinach, boiled/cooked in water
  { slug: "spring_onion_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 27.6 · Spring onion, sautéed/pan-fried, without fat
  { slug: "sweet_potato_puree_cream", avant: "neutral", apres: "neutral", classe: "A" }, // 79.8 · Sweet potato, puree, cooked with cream
  { slug: "sweetbread_calf_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 136 · Sweetbread, calf, sautéed/pan-fried
  { slug: "swiss_chard_leaf_stalk", avant: "neutral", apres: "neutral", classe: "A" }, // 16.9 · Swiss chard, leaf and stalk, boiled/cooked in water
  { slug: "tomato_puree", avant: "neutral", apres: "neutral", classe: "A" }, // 99.2 · Tomato purée
  { slug: "turkey_escalope_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 124 · Turkey, escalope, sautéed/pan-fried, with salt
  { slug: "turkey_ham_slices", avant: "neutral", apres: "neutral", classe: "A" }, // 104 · Turkey cooked ham, in slices
  { slug: "turnip_water", avant: "neutral", apres: "neutral", classe: "A" }, // 21.1 · Turnip, boiled/cooked in water
  { slug: "veal_bread_escalope", avant: "neutral", apres: "neutral", classe: "A" }, // 271 · Veal, bread escalope, cooked
  { slug: "veal_chop_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 156 · Veal, chop, grilled/pan-fried
  { slug: "veal_loin_sauteed_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 171 · Veal, loin, sautéed/pan-fried
  { slug: "veal_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 169 · Veal, meat, cooked (average)
  { slug: "veal_shoulder_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 166 · Veal, shoulder, grilled/pan-fried
  { slug: "veal_tenderloin_pan", avant: "neutral", apres: "neutral", classe: "A" }, // 147 · Veal, tenderloin, grilled/pan-fried
  { slug: "vegetable", avant: "neutral", apres: "neutral", classe: "A" }, // 43.5 · Vegetable, cooked (average)
  { slug: "ware_potato_water", avant: "neutral", apres: "neutral", classe: "A" }, // 76.1 · Ware potato, boiled/cooked in water, peeled
  { slug: "white_cabbage_water", avant: "neutral", apres: "neutral", classe: "A" }, // 23.5 · White cabbage, boiled/cooked in water
  { slug: "white_meat", avant: "neutral", apres: "neutral", classe: "A" }, // 173 · white meat, cooked (average)
  { slug: "yam_indian_potato_water", avant: "neutral", apres: "neutral", classe: "A" }, // 109 · Yam or Indian potato, peeled, boiled/cooked in water

  // ── CLASSE B — ligne CUITE portant une classe NON NEUTRE. → `neutral` ──────
  //    Le rendement y est appliqué DEUX FOIS: la valeur est déjà cuite et
  //    `gramsRawOf` divise encore. C'est le classement du lot 30.
  { slug: "black_white_pudding_sauteed", avant: "meat_shrinks", apres: "neutral", classe: "B" }, // 246 · Black or white pudding (blood sausage), sautéed (average)
  { slug: "bread_flour_bread_preparation", avant: "grain_absorbs", apres: "neutral", classe: "B", horsRegex: true }, // 256 · Bread, home-made, with flour for home-made bread preparation
  { slug: "carrots_puree", avant: "veg_shrinks", apres: "neutral", classe: "B" }, // 31.5 · Carrots, puree
  { slug: "carrots_puree_cream", avant: "veg_shrinks", apres: "neutral", classe: "B" }, // 44.4 · Carrots, puree with cream
  { slug: "country_style_bread", avant: "grain_absorbs", apres: "neutral", classe: "B", horsRegex: true }, // 240 · Country-style bread, home-made (with flour for bread making machine)
  { slug: "mashed_potatoes", avant: "veg_shrinks", apres: "neutral", classe: "B" }, // 91.8 · Mashed potatoes (average)
  { slug: "noodles", avant: "grain_absorbs", apres: "neutral", classe: "B", horsRegex: true }, // 104.0 · Noodles
  { slug: "potato_puree_flakes_reconstituted", avant: "veg_shrinks", apres: "neutral", classe: "B" }, // 97.9 · Potato puree, made from flakes, reconstituted with whole milk, with added fat
  { slug: "potato_puree_milk_butter", avant: "veg_shrinks", apres: "neutral", classe: "B" }, // 88.8 · Potato puree, with milk and butter, unsalted
  { slug: "toasted_bread", avant: "grain_absorbs", apres: "neutral", classe: "B" }, // 317 · Toasted bread, home-made
  { slug: "vegetables_mashed", avant: "veg_shrinks", apres: "neutral", classe: "B" }, // 61.8 · Vegetables (3-4 types), mashed

  // ── CLASSE C — PRODUIT FINI DE PANIFICATION en `grain_absorbs`. → `neutral` ─
  //    Le pain ne boit pas d'eau à la cuisson: la farine l'a bue à la boulangerie.
  //    Aucun mot-clé de cuisson dans le libellé — lues une par une.
  { slug: "english_muffin_wholewheat_flour", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 217 · English muffin, wholewheat flour, prepacked
  { slug: "english_muffin", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 228 · English muffin, prepacked
  { slug: "bread_wholemeal_integral_bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 244 · Bread, wholemeal or integral bread (made with flour type 150)
  { slug: "bran_grain_bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 249 · Bran grain bread
  { slug: "country_style_bread_french", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 253 · Country-style bread, French bread (baguette or ball)
  { slug: "brear_t55_t110_flour", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 257 · Brear (baguette or ball), made with type T55-T110 flour
  { slug: "rye_bread_wheat", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 260 · Rye bread, and wheat
  { slug: "bread_french_bread_yeast", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 261 · Bread, French bread (baguette or ball), with yeast
  { slug: "bread_gluten_free", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 261 · Bread, gluten free
  { slug: "sandwich_loaf_wholemeal", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 262 · Sandwich loaf, wholemeal
  { slug: "brown_bread_french_bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 265 · Brown bread, French bread (baguette or ball), with flour type 80 or 110
  { slug: "bread_french_bread_ball", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 266 · Bread, French bread, ball, 400g
  { slug: "bread_french_bread_multigrain", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 269 · Bread, French bread, (baguette or ball), multigrain, from bakery
  { slug: "sandwich_loaf_crust_less", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 271 · Sandwich loaf, crust less, prepacked
  { slug: "panini_bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 272 · Panini bread
  { slug: "sandwich_loaf_multigrain", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 274 · Sandwich loaf, multigrain
  { slug: "bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 276 · Bread (average)
  { slug: "sandwich_loaf", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 278 · Sandwich loaf
  { slug: "sandwich_loaf_bran_grain", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 278 · Sandwich loaf, bran grain
  { slug: "bread_french_bread_salt", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 279 · Bread, French bread, without salt
  { slug: "rolls_hamburger_hotdog_wholemeal", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 285 · Rolls for hamburger/hotdog (buns), wholemeal, prepacked
  { slug: "bread_french_bread_baguette", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 287 · Bread, French bread, baguette
  { slug: "rolls_hamburger_hotdog", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 293 · Rolls for hamburger/hotdog (buns), prepacked
  { slug: "brioche_sandwich_bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 309 · Brioche sandwich bread, prepacked
  { slug: "corn_tortilla_wrap_be", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 313 · Corn tortilla wrap, to be filled
  { slug: "wheat_tortilla_wrap_be", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 327 · Wheat tortilla wrap, to be filled
  { slug: "bretzel", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 330 · Bretzel
  { slug: "breadcrumbs", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 374 · Breadcrumbs
  { slug: "croutons_spreads", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 374 · Croutons, for spreads
  { slug: "puffed_rice_textured_bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 385 · Puffed rice textured bread, wholemeal
  { slug: "rusk_wholemeal_rich_fibre", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 393 · Rusk, wholemeal or rich in fibre
  { slug: "puffed_cereals_textured_bread", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 394 · Puffed cereals textured bread
  { slug: "swedish_toast_linseeds", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 396 · Swedish toast, with linseeds
  { slug: "rusk_multigrain", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 398 · Rusk, multigrain
  { slug: "wheat_swedish_toast_wholemeal", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 398 · Wheat swedish toast, wholemeal
  { slug: "swedish_toast_fruits", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 401 · Swedish toast, with fruits
  { slug: "wheat_swedish_toast", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 402 · Wheat swedish toast
  { slug: "rusk_slice_wheat", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 404 · Rusk, slice, wheat
  { slug: "rusk", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 409 · Rusk
  { slug: "rusk_w_eggs", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 417 · Rusk, w eggs
  { slug: "rusk_eggs", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 419 · Rusk with eggs, sliced, prepacked
  { slug: "rusk_slice_multigrain", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 419 · Rusk , slice, multigrain
  { slug: "grissini_bread_stick", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 433 · Grissini or bread stick
  { slug: "wheat_crackers", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 450 · Wheat crackers
  { slug: "crouton_garlic_herbs_onions", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 492 · Crouton with garlic, herbs or onions, prepacked
  { slug: "croutons", avant: "grain_absorbs", apres: "neutral", classe: "C" }, // 495 · Croutons, plain, prepacked

  // ── CLASSE D — CÉRÉALE/LÉGUMINEUSE SÈCHE. ⛔ DÉCISION: ON NE BOUGE PAS. ─────
  //    Elles absorbent VRAIMENT leur eau de cuisson. C'est la contre-épreuve du
  //    lot: si ces quinze-là bougeaient, le riz cuit se compterait 2,6 fois trop.
  { slug: "lentils_dry", avant: "legume_absorbs", apres: "legume_absorbs", classe: "D" }, // 331.3 · Lentils (dry)
  { slug: "white_pasta", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 336.0 · Pasta
  { slug: "couscous_wholemeal", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 345 · Wholemeal couscous
  { slug: "barley", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 346.0 · Barley
  { slug: "bulgur_wheat", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 347 · Bulgur wheat
  { slug: "brown_rice", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 350.0 · Brown rice
  { slug: "noodles_wholewheat", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 350 · Wholewheat noodles
  { slug: "polenta", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 350.0 · Polenta
  { slug: "bulgur", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 351.0 · Bulgur
  { slug: "chickpeas_dry", avant: "legume_absorbs", apres: "legume_absorbs", classe: "D" }, // 351.2 · Chickpeas (dry)
  { slug: "couscous", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 352.0 · Couscous
  { slug: "white_rice", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 352.0 · White rice
  { slug: "wholewheat_pasta", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 353.0 · Wholewheat pasta
  { slug: "buckwheat", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 356.0 · Buckwheat
  { slug: "quinoa", avant: "grain_absorbs", apres: "grain_absorbs", classe: "D" }, // 358.0 · Quinoa

];

const parSlug = new Map<string, Decision>(DECISIONS.map((d) => [d.slug, d]));

/** Le millésime de prompt VIVANT — `meal_generation.ts`. Registre §⑨ n° 50. */
const PROMPT_VIVANT = "meal.en.v18_one_box_per_group";

// ---------------------------------------------------------------------------
// LES OUTILS DE MESURE
// ---------------------------------------------------------------------------

/**
 * Le même référentiel, avec les décisions APPLIQUÉES en mémoire.
 *
 * ⛔ C'est ce qui rend ce script utilisable AVANT et APRÈS la migration, avec
 * la même sortie de référence: avant, la colonne « APRÈS » est une PRÉDICTION;
 * après, le correctif est en base et les deux colonnes se rejoignent. Une
 * prédiction qui ne se reproduit pas est visible immédiatement.
 */
function indexAvecDecisions(index: CompositionIndex): CompositionIndex {
  const refs: CompositionRef[] = [];
  for (const ref of index.bySlug.values()) {
    const d = parSlug.get(ref.slug);
    refs.push(d && d.apres !== ref.yieldClass ? { ...ref, yieldClass: d.apres } : ref);
  }
  const aliases: { alias: string; slug: string }[] = [];
  for (const [alias, slug] of index.byAlias) aliases.push({ alias, slug });
  return buildCompositionIndex(refs, aliases);
}

/** L'énergie d'UN ingrédient, par le chemin de production. `null` = abstention. */
function temoin(
  index: CompositionIndex,
  term: string,
  amount: number,
  unit: CompositionUnit,
  state: CompositionState | null,
): number | null {
  const r = resolveIngredients(index, [{ term, amount, unit, state }]);
  if (r.resolved.length === 0) return null;
  const n = nutrientsOf(r.resolved);
  return n === "unknown" ? null : n.energyKcal;
}

const kcal = (v: number | null) => v === null ? "  abstention" : `${String(v).padStart(6)} kcal`;
const pct = (num: number, den: number) => den === 0 ? "n/a" : `${(100 * num / den).toFixed(1)} %`;

interface Compte {
  lignes: number;
  pesees: number;
  plats: number;
  platsCalculables: number;
  jours: number;
  joursCalculables: number;
  /** ⛔ LA GRANDEUR QUE CE LOT DÉPLACE. Somme des plats calculables des DEUX côtés. */
  kcalCommuns: number;
  platsCommuns: number;
  platsDeplaces: number;
}
const compteVide = (): Compte => ({
  lignes: 0,
  pesees: 0,
  plats: 0,
  platsCalculables: 0,
  jours: 0,
  joursCalculables: 0,
  kcalCommuns: 0,
  platsCommuns: 0,
  platsDeplaces: 0,
});

/**
 * Le corpus, plié, mesuré par le chemin de production.
 *
 * ⛔ `autre` n'est pas décoratif: l'énergie ne se compare que sur les plats
 * calculables DES DEUX CÔTÉS. Sommer d'un côté des plats que l'autre ne sait
 * pas calculer ferait passer un GAIN DE COUVERTURE pour un DÉPLACEMENT
 * D'ÉNERGIE — deux effets opposés dans un seul nombre.
 */
function mesureCorpus(
  index: CompositionIndex,
  plans: Record<string, unknown>[],
  autre: CompositionIndex,
): Compte {
  const c = compteVide();
  for (const row of plans) {
    const dishes = readDishes(row.dishes);
    const preparations = readPreparations(row.preparations);
    const folded = foldPreparationsIntoDishes({
      dishes: dishes.map((d) => ({
        slot: null,
        method: d.method,
        ingredients: d.ingredients,
        uses: d.uses,
      })),
      preparations: preparations.map((p) => ({
        id: p.id,
        servingsMade: p.servingsMade,
        ingredients: p.ingredients,
      })),
    });
    const parJour = new Map<string, boolean>();
    folded.forEach((dish, i) => {
      const ings = dish.ingredients as readonly CompositionInput[];
      const r = resolveIngredients(index, ings);
      c.lignes += r.total;
      c.pesees += r.resolved.length;
      c.plats += 1;
      const method = dishes[i]?.method ?? "";
      const e = dishEnergy(index, { method, ingredients: ings });
      const f = dishEnergy(autre, { method, ingredients: ings });
      // ⚠️ `complete` ET `kcal !== null` : `dishEnergy` rend `null` quand il
      // s'abstient, et un `0` y serait un plat qui ne nourrit pas — pas la
      // même chose. Les deux sont lus, jamais l'un pour l'autre.
      const eKcal = e.complete ? e.kcal : null;
      const fKcal = f.complete ? f.kcal : null;
      const ok = eKcal !== null;
      if (ok) c.platsCalculables += 1;
      if (eKcal !== null && fKcal !== null) {
        c.platsCommuns += 1;
        c.kcalCommuns += eKcal;
        if (eKcal !== fKcal) c.platsDeplaces += 1;
      }
      const jour = dishes[i]?.day ?? "(sans jour)";
      parJour.set(jour, (parJour.get(jour) ?? true) && ok);
    });
    for (const ok of parJour.values()) {
      c.jours += 1;
      if (ok) c.joursCalculables += 1;
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// LA SORTIE
// ---------------------------------------------------------------------------

let sections = 0;
let rouge = 0;
const titre = (t: string) => {
  sections += 1;
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 74 - t.length))}`);
};

async function main() {
  const index = await loadCompositionIndex(fileClient(dir));
  const apres = indexAvecDecisions(index);
  const plans = readNdjson("plans.ndjson");
  const refs = [...index.bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));

  // ═══ ① LE PRÉDICAT, ET LA LISTE PUBLIÉE ═════════════════════════════════
  titre("① LE PRÉDICAT, EXÉCUTÉ SUR LE RÉFÉRENTIEL VIVANT");
  const attrapes = refs.filter((r) => PREDICAT_CUIT.test(r.label));
  const attrapesNeutres = attrapes.filter((r) => r.yieldClass === "neutral");
  console.log(`   regex           ${PREDICAT_CUIT.source}`);
  console.log(`   référentiel     ${refs.length} lignes`);
  console.log(`   libellé CUIT    ${attrapes.length}   dont neutral ${attrapesNeutres.length}, non neutral ${attrapes.length - attrapesNeutres.length}`);
  console.log(`   décisions       ${DECISIONS.length}   dont ${DECISIONS.filter((d) => d.horsRegex).length} HORS REGEX (lues à la main, aucun grep ne les trouve)`);
  const sansDecision = attrapes.filter((r) => !parSlug.has(r.slug));
  console.log(`   ⓐ ligne à libellé cuit SANS décision : ${sansDecision.length}`);
  for (const r of sansDecision) console.log(`        ⛔ ${r.slug} · ${r.label}`);
  if (sansDecision.length > 0) rouge += 1;
  const inconnues = DECISIONS.filter((d) => !index.bySlug.has(d.slug));
  console.log(`   ⓑ décision portant sur un slug ABSENT du référentiel : ${inconnues.length}`);
  for (const d of inconnues) console.log(`        ⛔ ${d.slug}`);
  if (inconnues.length > 0) rouge += 1;
  const derive = DECISIONS.filter((d) => {
    const ref = index.bySlug.get(d.slug);
    return ref !== undefined && ref.yieldClass !== d.avant && ref.yieldClass !== d.apres;
  });
  console.log(`   ⓒ décision PÉRIMÉE (la base n'est ni « avant » ni « après ») : ${derive.length}`);
  for (const d of derive) {
    console.log(`        ⛔ ${d.slug} · base=${index.bySlug.get(d.slug)?.yieldClass} · avant=${d.avant} · après=${d.apres}`);
  }
  if (derive.length > 0) rouge += 1;
  const applique = DECISIONS.filter((d) => index.bySlug.get(d.slug)?.yieldClass === d.apres && d.avant !== d.apres).length;
  const aFaire = DECISIONS.filter((d) => d.avant !== d.apres).length;
  console.log(`   ÉTAT DE LA BASE : ${applique} / ${aFaire} décisions de CHANGEMENT déjà appliquées`);
  // ⓓ ⛔ LA GARDE QUI EMPÊCHE UN PATCH DÉSARMÉ DE PASSER POUR UN PATCH VERT.
  // Sans elle, un `indexAvecDecisions` rendu no-op imprime un tableau de
  // témoins entièrement à ×1.00 et sort `rc=0`: le lot aurait l'air mesuré et
  // n'aurait rien mesuré. C'est le mode d'échec n° 1 de ce dépôt.
  let deplacees = 0;
  for (const [slug, ref] of index.bySlug) {
    if (apres.bySlug.get(slug)?.yieldClass !== ref.yieldClass) deplacees += 1;
  }
  const attendu = aFaire - applique;
  console.log(`   ⓓ le patch en mémoire déplace ${deplacees} ligne(s), ${attendu} attendue(s)`);
  if (deplacees !== attendu) {
    console.log(`        ⛔ le patch ne fait pas ce que la liste dit`);
    rouge += 1;
  }
  // ⓔ ⛔ LA MÊME GARDE, MAIS QUI NE DÉPEND PAS DE L'ÉTAT DE LA BASE.
  //
  // ⓓ ne mord QUE tant que la base est encore en « avant »: une fois la
  // migration appliquée, `attendu` vaut 0 et un patch no-op redevient
  // indiscernable d'un patch juste. Une garde qui s'éteint le jour où elle a
  // fini de servir laisse le fichier suivant sans filet — et c'est très
  // exactement le mode d'échec que ce dépôt paie en boucle.
  //
  // Celle-ci construit une base SYNTHÉTIQUE forcée à l'état « avant » de
  // chaque décision, y applique le même patch, et exige qu'il déplace
  // EXACTEMENT le nombre de lignes que la liste annonce. Elle mord toujours.
  const synth = buildCompositionIndex(
    [...index.bySlug.values()].map((r) => {
      const d = parSlug.get(r.slug);
      return d ? { ...r, yieldClass: d.avant } : r;
    }),
    [...index.byAlias].map(([alias, slug]) => ({ alias, slug })),
  );
  const synthApres = indexAvecDecisions(synth);
  let bougees = 0;
  for (const [slug, ref] of synth.bySlug) {
    if (synthApres.bySlug.get(slug)?.yieldClass !== ref.yieldClass) bougees += 1;
  }
  console.log(`   ⓔ sur une base forcée à « avant », le patch déplace ${bougees} ligne(s), ${aFaire} attendue(s)`);
  if (bougees !== aFaire) {
    console.log(`        ⛔ la liste des décisions ne fait pas ce qu'elle annonce`);
    rouge += 1;
  }

  // ═══ ② LA LISTE, LITTÉRALE ══════════════════════════════════════════════
  titre("② LA LISTE PUBLIÉE — une ligne par slug, classe par classe");
  for (const cls of ["A", "B", "C", "D"] as const) {
    const bloc = DECISIONS.filter((d) => d.classe === cls);
    const change = bloc.filter((d) => d.avant !== d.apres).length;
    console.log(`\n   CLASSE ${cls} — ${bloc.length} lignes, ${change} changées`);
    for (const d of bloc) {
      const ref = index.bySlug.get(d.slug);
      const marque = d.horsRegex ? " ⚠️hors-regex" : "";
      const fleche = d.avant === d.apres ? "=" : "→";
      console.log(
        `     ${d.slug.padEnd(38)} ${String(ref?.energyKcal ?? "?").padStart(6)} kcal  ${d.avant.padEnd(14)} ${fleche} ${d.apres.padEnd(14)}${marque}`,
      );
    }
  }

  // ═══ ③ LES TÉMOINS ══════════════════════════════════════════════════════
  titre("③ LES PLATS TÉMOINS — l'énergie recalculée, AVANT et APRÈS");
  const cas: [string, string, number, CompositionUnit, CompositionState | null][] = [
    ["⛔ LE TÉMOIN DE LA FICHE", "beef", 200, "g", "cooked"],
    ["   le même, state=raw", "beef", 200, "g", "raw"],
    ["   le même, state absent", "beef", 200, "g", null],
    ["   nouilles cuites", "noodles", 200, "g", "cooked"],
    ["   nouilles, state absent", "noodles", 200, "g", null],
    ["   une tranche de pain", "bread", 35, "g", "cooked"],
    ["   la même, state absent", "bread", 35, "g", null],
    ["   pain grillé maison", "toasted_bread", 35, "g", "cooked"],
    ["   purée de pommes de terre", "mashed_potatoes", 200, "g", "cooked"],
    ["   boudin poêlé", "black_white_pudding_sauteed", 100, "g", "cooked"],
    ["⚠️ CONTRE-ÉPREUVE riz cru", "white_rice", 200, "g", "cooked"],
    ["⚠️ CONTRE-ÉPREUVE lentilles", "lentils_dry", 200, "g", "cooked"],
  ];
  console.log(`   ${"cas".padEnd(30)} ${"AVANT".padStart(12)} ${"APRÈS".padStart(12)}   écart`);
  for (const [nom, term, amount, unit, state] of cas) {
    const a = temoin(index, term, amount, unit, state);
    const b = temoin(apres, term, amount, unit, state);
    let ecart = "—";
    if (a === null && b !== null) ecart = "abstention → chiffre";
    else if (a !== null && b === null) ecart = "⛔ chiffre → abstention";
    else if (a !== null && b !== null && a !== 0) ecart = `×${(b / a).toFixed(2)}`;
    console.log(`   ${nom.padEnd(30)} ${kcal(a)} ${kcal(b)}   ${ecart}`);
  }

  // ═══ ④ LE CORPUS — LES DEUX DÉNOMINATEURS, TOUJOURS ═════════════════════
  titre("④ LE CORPUS — ⛔ LES DEUX DÉNOMINATEURS, ET LA POPULATION EXCLUE");
  const millesime = (row: Record<string, unknown>) => String(row.prompt_version ?? "") || "(aucun)";
  const vivant = plans.filter((p) => millesime(p).startsWith(PROMPT_VIVANT));
  const exclus = plans.filter((p) => !millesime(p).startsWith(PROMPT_VIVANT));
  console.log(`   prompt VIVANT   ${PROMPT_VIVANT}   (registre §⑨ n° 50)`);
  console.log(`   ⓵ CORPUS ENTIER          ${plans.length} plans`);
  console.log(`   ⓶ POPULATION VIVANTE     ${vivant.length} plans  ⚠️ le produit ne peut plus produire les autres`);
  console.log(`   POPULATION EXCLUE, NOMMÉE ET COMPTÉE : ${exclus.length} plans`);
  const parMillesime = new Map<string, number>();
  for (const p of exclus) parMillesime.set(millesime(p), (parMillesime.get(millesime(p)) ?? 0) + 1);
  for (const [m, n] of [...parMillesime].sort((a, b) => b[1] - a[1])) {
    console.log(`       ${String(n).padStart(4)}  ${m}`);
  }
  for (const [nom, pop] of [["⓵ CORPUS ENTIER", plans], ["⓶ POPULATION VIVANTE", vivant]] as const) {
    const a = mesureCorpus(index, pop, apres);
    const b = mesureCorpus(apres, pop, index);
    console.log(`\n   ${nom} — ${pop.length} plans`);
    console.log(`     lignes pliées          ${a.lignes}`);
    console.log(`     résolues ET pesées     ${a.pesees} (${pct(a.pesees, a.lignes)})   →   ${b.pesees} (${pct(b.pesees, b.lignes)})`);
    console.log(`     plats calculables      ${a.platsCalculables} / ${a.plats} (${pct(a.platsCalculables, a.plats)})   →   ${b.platsCalculables} / ${b.plats} (${pct(b.platsCalculables, b.plats)})`);
    console.log(`     journées calculables   ${a.joursCalculables} / ${a.jours} (${pct(a.joursCalculables, a.jours)})   →   ${b.joursCalculables} / ${b.jours} (${pct(b.joursCalculables, b.jours)})`);
    console.log(`     ⛔ ÉNERGIE, sur les ${a.platsCommuns} plats calculables DES DEUX CÔTÉS :`);
    console.log(`          ${Math.round(a.kcalCommuns)} kcal   →   ${Math.round(b.kcalCommuns)} kcal   (${b.kcalCommuns === a.kcalCommuns ? "inchangée" : `${a.kcalCommuns === 0 ? "n/a" : ((100 * (b.kcalCommuns - a.kcalCommuns)) / a.kcalCommuns).toFixed(2) + " %"}`})`);
    console.log(`          plats dont le chiffre BOUGE : ${a.platsDeplaces} / ${a.platsCommuns} (${pct(a.platsDeplaces, a.platsCommuns)})`);
  }

  // ═══ ⑤ CE QUE LE LOT NE RÉPARE PAS ══════════════════════════════════════
  titre("⑤ LE RÉSIDU — ⛔ CE QUE `yield_class` NE PEUT PAS RÉPARER");
  const parClasse = new Map<string, { raw: number; cooked: number; absent: number }>();
  const termesRaw = new Map<string, number>();
  let atteintes = 0;
  for (const row of plans) {
    for (const holder of [readDishes(row.dishes), readPreparations(row.preparations)]) {
      for (const d of holder) {
        for (const i of d.ingredients) {
          // ⚠️ `resolveIngredients` et pas une comparaison de chaîne: c'est le
          // chemin de production, alias compris. Un `slug` deviné ici ne
          // mesurerait pas ce que le produit atteint.
          const r = resolveIngredients(index, [i]);
          const slug = r.resolved[0]?.ref.slug ?? null;
          if (slug === null) continue;
          const dec = parSlug.get(slug);
          if (!dec) continue;
          atteintes += 1;
          const cell = parClasse.get(dec.classe) ?? { raw: 0, cooked: 0, absent: 0 };
          if (i.state === "raw") {
            cell.raw += 1;
            if (dec.classe === "A" || dec.classe === "B") {
              termesRaw.set(i.term, (termesRaw.get(i.term) ?? 0) + 1);
            }
          } else if (i.state === "cooked") cell.cooked += 1;
          else cell.absent += 1;
          parClasse.set(dec.classe, cell);
        }
      }
    }
  }
  console.log(`   lignes du corpus qui ATTEIGNENT une ligne de la liste : ${atteintes}`);
  console.log(`     classe   state=raw   state=cooked   state absent`);
  for (const cls of ["A", "B", "C", "D"] as const) {
    const c = parClasse.get(cls) ?? { raw: 0, cooked: 0, absent: 0 };
    console.log(`       ${cls}    ${String(c.raw).padStart(8)}   ${String(c.cooked).padStart(11)}   ${String(c.absent).padStart(12)}`);
  }
  console.log(`\n   ⛔ CE QUE CE LOT NE RÉPARE PAS — le `+"`state: \"raw\"`"+` sur une ligne CUITE (A+B) :`);
  console.log(`     ${(parClasse.get("A")?.raw ?? 0) + (parClasse.get("B")?.raw ?? 0)} lignes. La valeur du référentiel y est une densité CUITE, la ligne`);
  console.log(`     déclare des grammes CRUS, et `+"`gramsRawOf`"+` ne divise QUE sur « cooked » :`);
  console.log(`     aucune valeur de `+"`yield_class`"+` ne change ce chiffre. Fiche NEUVE `+"`L-C-a`"+`.`);
  for (const [t, n] of [...termesRaw].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`         ${String(n).padStart(4)}  ${t}`);
  }
  console.log(`\n   ⚠️ VÉRIFICATION IMPOSSIBLE (lot O9) : lignes 'ciqual' SANS ciqual_code`);
  const sansCode = readNdjson("food_composition_refs.ndjson")
    .filter((r) => String(r.source) === "ciqual" && (r.ciqual_code === null || r.ciqual_code === undefined || String(r.ciqual_code) === ""));
  console.log(`     ${sansCode.length} / ${refs.length} — pour elles, remonter à la source est impossible.`);
  const cuitesSansCode = sansCode.filter((r) => parSlug.has(String(r.slug))).length;
  console.log(`     dont ${cuitesSansCode} portent une décision de ce lot.`);

  // ═══ ⑥ LA CARDINALITÉ ═══════════════════════════════════════════════════
  titre("⑥ CARDINALITÉ — la garde qui refuse une sortie amputée");
  const attendues = 6;
  console.log(`   sections imprimées ${sections} / ${attendues}`);
  if (sections !== attendues) {
    console.error(`⛔ CARDINALITÉ: ${sections}/${attendues}`);
    rouge += 1;
  }

  if (rouge > 0) {
    console.error(`\n⛔ L-C: ${rouge} garde(s) ROUGE(s).`);
    Deno.exit(1);
  }
}

if (import.meta.main) await main();
