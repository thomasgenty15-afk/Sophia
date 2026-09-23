/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE FÉCULENT À CÔTÉ — 2026-09-22, lot C du chantier « féculent à côté ».
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, MESURÉ ─────────────────────────────────
 * Brouillon réel `6e4e5548` (foyer de trois, 2026-09-22): sur les cases
 * partagées, la densité protéique de la casserole est celle du PLANCHER le
 * plus exigeant à table (`sharedProteinCaps`, « le plancher gagne »). Le
 * dimensionnement appliquait ensuite UN facteur par boîte: l'homme en prise de
 * masse héritait, à 3 300 kcal, de la densité écrite pour l'homme en perte à
 * 2 192 kcal. `protein_brief.floor_wins_cells` 15/15,
 * `protein_ceiling.over` 9 jours-bouche sur 15, pire +46 %.
 *
 * ── LE LEVIER ─────────────────────────────────────────────────────────────
 * Une assiette partagée écrite en DEUX casseroles — la préparation principale
 * (protéine, légumes, sauce) et le féculent à part, rôle `separable_side` —
 * peut être servie en deux proportions. La recette ne change pas; la densité
 * de la casserole principale est la même pour tous (c'est la même casserole),
 * seuls les grammes changent.
 *
 * ⟳ 2026-09-22 — DÉCISION PRODUIT: LE PLAFOND PROTÉIQUE EST UNE MESURE, PAS
 * UNE CIBLE. La première version de ce module poussait la casserole
 * principale vers le bas jusqu'au plafond de la bouche — 161 g de saumon pour
 * 503 g de couscous sur le run `505f8d7f`, pour faire passer un compteur. Le
 * code l'écrit lui-même (`sharedProteinCaps`): « un plancher est un besoin; un
 * plafond est une borne de confort ». Le partage suit donc l'ÉNERGIE, comme à
 * une vraie table: celui qui mange plus reprend du féculent, pas un deuxième
 * morceau de viande. La casserole principale d'une grosse assiette est servie
 * comme celle de la personne du milieu de la table; le surplus d'énergie part
 * dans le féculent, dans des proportions modérées. Le PLANCHER reste une
 * contrainte: une part qui passerait sous le plancher de sa bouche reprend de
 * la casserole principale.
 *
 * ⛔ L'ÉNERGIE DE LA CASE EST L'INVARIANT. Les deux facteurs sont choisis sur
 * la droite `f_main × K_main + f_side × K_side = f × (K_main + K_side)`: la
 * bouche reçoit exactement les kcal que le facteur uniforme lui donnait.
 *
 * ⛔ UNE ÉTIQUETTE DU MODÈLE N'OUVRE RIEN SEULE. Une casserole n'est un
 * féculent à côté que si le modèle la DÉCLARE `separable_side` ET que le
 * référentiel le confirme: au moins une ligne pesée dans un groupe féculent,
 * aucune dans un groupe protéique. Même sens d'erreur que
 * `demoteDenseSeasoning`: on ajuste moins, on ne ment jamais.
 *
 * ⟳ 2026-09-23 — LA FORME DE L'ASSIETTE SUIT L'OBJECTIF (audit des dosages,
 * lot 2). Mesuré sur trois plans récents: Fabrice, en perte de poids, recevait
 * 33 % de féculent et 32 % de légumes — la recette de Christèle, à ses grammes
 * près. L'objectif ne décidait d'aucune proportion; seul le plancher protéique
 * retirait parfois du féculent, par accident. Depuis ce lot:
 *   · perte et maintien plafonnent la PART D'ÉNERGIE du féculent
 *     (`STARCH_KCAL_SHARE_MAX`), à table comme seul, au-dessus comme en
 *     dessous de la personne du milieu;
 *   · une bande basse garde un vrai féculent (`STARCH_KCAL_SHARE_MIN`, jamais
 *     plus que la recette n'en porte);
 *   · la perte seule élargit les bornes de rapport, et seulement dans le sens
 *     « plus de casserole principale »;
 *   · la grosse assiette garde AU MOINS la casserole principale de la personne
 *     du milieu, après la forme d'objectif de celle-ci.
 * `goal: null` (mineur, âge inconnu) rend la règle d'avant, mot pour mot.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */
import type { FoodGroupRef, GoalToken } from "./tokens.ts";
import { proteinFloorAllocation } from "./final_plan_audit.ts";
import { PROTEIN_GROUPS } from "./proportion_adjust.ts";
import { CEILING_STARCH_GROUPS } from "./protein_ceiling_adjust.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① OÙ LE FÉCULENT PART À CÔTÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES MOMENTS OÙ UNE CASE PARTAGÉE SÉPARE SON FÉCULENT.
 *
 * ⚠️ LE DÉJEUNER ET LE DÎNER SEULEMENT: la consigne (`standardRecipeBlock`)
 * ne le demande qu'à eux, et un petit-déjeuner n'a pas de « casserole ».
 *
 * ⟳ 2026-09-23 — v38: la consigne demande le féculent à part pour TOUT
 * déjeuner et tout dîner, mangé seul ou partagé. « Une case mangée seul garde
 * son assiette en UN plat » n'est plus vrai du texte servi. À table, une case
 * mangée par une seule bouche reste hors du partage (`starchAsideCellsOf`):
 * ses deux casseroles sont servies au même facteur (`partFactorOf` avec
 * `starchSide: null`), donc dans les proportions de la recette.
 */
export const STARCH_ASIDE_SLOTS: ReadonlySet<string> = new Set(["lunch", "dinner"]);

/**
 * LES CASES (`dayToken|slot`) OÙ LA CONSIGNE DEMANDE LE FÉCULENT À CÔTÉ:
 * partagées (au moins deux mangeurs) ET au déjeuner ou au dîner.
 * ⟳ 2026-09-23 — v38: la consigne le demande aussi à une case mangée seul;
 * cette fonction dit désormais où la TABLE partage le féculent, pas où la
 * consigne le demande. Le seuil de deux mangeurs est gardé.
 *
 * ⚠️ LA CLÉ EST `dayToken|slot` (celle de `sharedProteinCaps`), pas celle de
 * la grille (`day/slot`).
 */
export function starchAsideCellsOf(
  cells: readonly { day: string; slot: string; eaters: readonly string[] }[],
): Set<string> {
  const out = new Set<string>();
  for (const c of cells) {
    if (c.eaters.length < 2) continue;
    if (!STARCH_ASIDE_SLOTS.has(c.slot)) continue;
    out.add(`${c.day}|${c.slot}`);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② QUELLE CASSEROLE EST LE FÉCULENT
// ═══════════════════════════════════════════════════════════════════════════

/** Pourquoi un plat n'est pas servi en deux proportions. Aucun refus muet. */
export const STARCH_SIDE_REFUSALS = [
  /** Le plat tire moins de deux casseroles. */
  "single_pot",
  /** Aucune casserole tirée n'est déclarée `separable_side` en entier. */
  "no_side_declared",
  /** Deux casseroles ou plus le sont: laquelle bouger est indéterminé. */
  "two_sides",
  /** Déclarée à côté, mais le référentiel n'y voit pas un féculent seul. */
  "side_not_starch",
] as const;
export type StarchSideRefusal = (typeof STARCH_SIDE_REFUSALS)[number];

/** Une casserole telle que ce module la lit. */
export interface SidePotInput {
  readonly id: string;
  /** Les rôles des composants DÉCLARÉS sur la casserole. */
  readonly roles: readonly (string | null)[];
  /** Les groupes du RÉFÉRENTIEL de ses lignes PESÉES. `null` = non résolu. */
  readonly weighedGroups: readonly (FoodGroupRef | null)[];
}

/**
 * LA CASSEROLE-FÉCULENT D'UN PLAT, OU LE MOTIF DU REFUS.
 *
 * ⛔ UNE CASSEROLE EST « À CÔTÉ » QUAND TOUS SES COMPOSANTS DÉCLARÉS LE SONT.
 * Un bloc qui mélange `main` et `separable_side` est une assiette complète,
 * pas un accompagnement.
 *
 * ⛔ LE RÉFÉRENTIEL CONFIRME. Au moins une ligne pesée dans un groupe féculent
 * (`CEILING_STARCH_GROUPS`), aucune dans un groupe protéique
 * (`PROTEIN_GROUPS`). Une ligne non résolue ne compte pour aucun des deux —
 * elle ne peut ni ouvrir ni fermer.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function starchSideOf(args: {
  /** Les identifiants de casserole que le plat tire, dans l'ordre de `uses`. */
  readonly usedPrepIds: readonly string[];
  readonly pots: ReadonlyMap<string, SidePotInput>;
}): { sidePrepId: string; refusal: null } | { sidePrepId: null; refusal: StarchSideRefusal } {
  const used = [...new Set(args.usedPrepIds.filter((id) => id !== ""))];
  if (used.length < 2) return { sidePrepId: null, refusal: "single_pot" };
  const declared = used.filter((id) => {
    const pot = args.pots.get(id);
    if (pot === undefined || pot.roles.length === 0) return false;
    return pot.roles.every((r) => r === "separable_side");
  });
  if (declared.length === 0) return { sidePrepId: null, refusal: "no_side_declared" };
  if (declared.length > 1) return { sidePrepId: null, refusal: "two_sides" };
  const side = args.pots.get(declared[0])!;
  const starch = side.weighedGroups.some((g) => g !== null && CEILING_STARCH_GROUPS.has(g));
  const protein = side.weighedGroups.some((g) => g !== null && PROTEIN_GROUPS.has(g));
  if (!starch || protein) return { sidePrepId: null, refusal: "side_not_starch" };
  return { sidePrepId: declared[0], refusal: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE PLANCHER PROTÉIQUE D'UNE BOUCHE À UNE CASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE PLANCHER DU JOUR × PART KCAL DU MOMENT — le repli d'une journée illisible.
 *
 * ⛔ LA MÊME RÈGLE DE TROIS QUE `sharedProteinCaps`: la densité d'une bouche
 * est `grammes du jour ÷ énergie composée du jour`, et sa part à une case est
 * cette densité × l'énergie de SA part.
 *
 * `null` quand le plancher ou l'énergie est illisible: on ne fabrique pas un
 * nombre.
 */
export function proteinFloorAt(args: {
  readonly dayFloorG: number | null;
  /** La somme des `composeKcal` de la journée de cette bouche. */
  readonly dayComposeKcal: number | null;
  /** L'énergie de SA part à cette case. */
  readonly targetKcal: number | null;
}): number | null {
  const { dayFloorG, dayComposeKcal, targetKcal } = args;
  if (
    dayFloorG === null || !Number.isFinite(dayFloorG) || !(dayFloorG > 0) ||
    dayComposeKcal === null || !Number.isFinite(dayComposeKcal) || !(dayComposeKcal > 0) ||
    targetKcal === null || !Number.isFinite(targetKcal) || !(targetKcal > 0)
  ) {
    return null;
  }
  return (dayFloorG / dayComposeKcal) * targetKcal;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ bis — LE PLANCHER DE JOURNÉE (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════

/** POURQUOI UNE JOURNÉE-BOUCHE RETOMBE SUR LE PLANCHER PAR CASE. Fermé, compté. */
export const DAY_LANE_REASONS = [
  /** Le plancher de journée est posé. */
  "day",
  /** La protéine d'un plat hors partage ne se mesure pas: le reste est inconnu. */
  "rest_unknown",
  /** Une case partagée n'a pas d'énergie cible: la répartition est impossible. */
  "target_unknown",
  /** Pas de plancher couvert lisible pour ce jour. */
  "no_bound",
] as const;
export type DayLaneReason = (typeof DAY_LANE_REASONS)[number];

/**
 * LE PLANCHER D'UNE JOURNÉE, RÉPARTI SUR SES CASES SERVIES EN DEUX PROPORTIONS.
 *
 *     plancher_i = max(0, plancher couvert du jour − protéine du reste) × T_i / Σ T
 *
 * Le reste est tout ce que la bouche mange ce jour HORS cases à deux
 * casseroles. Une journée dont le reste manque de protéine fait remonter la
 * casserole principale de ses cases partagées; une journée dont le reste
 * suffit ne leur demande rien.
 *
 * ⛔ LE PLANCHER EST CELUI DU CONTRÔLE FINAL: `proteinFloorAllocation`
 * (plancher COUVERT, apports fixes déduits une fois), appelée ici avec les
 * mêmes entrées. ⚠️ Et l'appel vit ICI, pas dans `index.ts`: le test
 * `output_contract_wiring_test.ts` épingle la PREMIÈRE occurrence de cet appel
 * dans le générateur.
 *
 * ⛔ AUCUN PLAFOND. Depuis le 2026-09-22 le plafond protéique est une mesure:
 * il se compte (`protein_ceiling`, garde finale), il ne se poursuit pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dayProteinFloors(args: {
  /** Les entrées de `proteinFloorAllocation` pour ce jour. `null` = inconnues. */
  readonly allocation: Parameters<typeof proteinFloorAllocation>[0] | null;
  /** La protéine de tout ce que la bouche mange ce jour HORS partage. */
  readonly restProteinG: number | null;
  /** Les cases de ce jour servies en deux proportions, avec l'énergie de SA part. */
  readonly rows: readonly { readonly key: string; readonly targetKcal: number | null }[];
}): {
  readonly reason: DayLaneReason;
  readonly floors: ReadonlyMap<string, number>;
  /** Le plancher couvert du jour, pour le journal. */
  readonly dayFloorG: number | null;
} {
  const a = args.allocation === null ? null : proteinFloorAllocation(args.allocation);
  const dayFloorG = a?.coveredFloorG ?? null;
  const empty = new Map<string, number>();
  if (dayFloorG === null) return { reason: "no_bound", floors: empty, dayFloorG };
  const rest = args.restProteinG;
  if (rest === null || !Number.isFinite(rest)) {
    return { reason: "rest_unknown", floors: empty, dayFloorG };
  }
  let total = 0;
  for (const r of args.rows) {
    if (r.targetKcal === null || !Number.isFinite(r.targetKcal) || !(r.targetKcal > 0)) {
      return { reason: "target_unknown", floors: empty, dayFloorG };
    }
    total += r.targetKcal;
  }
  const floors = new Map<string, number>();
  if (!(total > 0)) return { reason: "day", floors, dayFloorG };
  const remaining = Math.max(0, dayFloorG - rest);
  for (const r of args.rows) {
    floors.set(r.key, remaining * ((r.targetKcal as number) / total));
  }
  return { reason: "day", floors, dayFloorG };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES DEUX FACTEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA PART DE RÉFÉRENCE DE LA TABLE SUR UN PLAT: le facteur du MILIEU.
 *
 * La médiane des facteurs des mangeurs dimensionnés; à nombre pair, la plus
 * petite des deux du milieu. ⚠️ PAS LE MINIMUM: un enfant à table ramènerait
 * la casserole principale de tous les adultes à une part d'enfant. `null` sous
 * deux mangeurs: il n'y a pas de table.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function tableReferenceFactor(factors: readonly number[]): number | null {
  const ok = factors.filter((f) => Number.isFinite(f) && f > 0).sort((a, b) => a - b);
  if (ok.length < 2) return null;
  return ok[Math.floor((ok.length - 1) / 2)];
}

/**
 * LES BORNES DE RAPPORT AU FACTEUR UNIFORME — des proportions MODÉRÉES.
 *
 * ⚠️ ELLES GARDENT L'ASSIETTE RECONNAISSABLE: la casserole principale ne
 * descend pas sous 75 % de ce que la bouche en aurait reçu, le féculent ne
 * dépasse pas 1,75 fois sa part. Dans l'autre sens (le plancher), la casserole
 * monte jusqu'à 1,5 fois et le féculent ne descend pas sous 0,4 fois.
 * ⟳ 2026-09-22: 0,6 et 2,5 à la première version, quand le module poursuivait
 * le plafond — 161 g de saumon pour 503 g de couscous.
 */
export const MAIN_FACTOR_MIN_RATIO = 0.75;
export const MAIN_FACTOR_MAX_RATIO = 1.5;
export const SIDE_FACTOR_MIN_RATIO = 0.4;
export const SIDE_FACTOR_MAX_RATIO = 1.75;

// ═══════════════════════════════════════════════════════════════════════════
// ④ bis — L'OBJECTIF QUI DÉCIDE DE LA FORME (⟳ 2026-09-23, lot 2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'OBJECTIF LU PAR CE MODULE. `null` (dans le paramètre, pas dans la liste) =
 * un mineur ou un âge inconnu: la règle d'avant ce lot, sans forme d'objectif.
 */
export const STARCH_GOALS = ["fat_loss", "maintenance", "muscle_gain"] as const;
export type StarchGoal = (typeof STARCH_GOALS)[number];

/**
 * L'OBJECTIF D'UNE BOUCHE POUR LE PARTAGE — la même lecture que `bucketOf`
 * dans le générateur (âge inconnu, puis mineur, puis objectif).
 *
 * ⛔ UN ADULTE SANS OBJECTIF EST EN MAINTIEN, pas en « règle d'avant »: c'est
 * l'assiette ordinaire, et c'est elle que la forme de maintien décrit.
 * ⚠️ UN MINEUR N'A PAS DE FORME: son assiette n'est pas celle d'un régime, et
 * `null` lui rend exactement le partage d'avant.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function starchGoalOf(args: {
  readonly ageYears: number | null;
  readonly goal: GoalToken | null;
}): StarchGoal | null {
  const age = args.ageYears;
  if (age === null || !Number.isFinite(age)) return null;
  if (age < 18) return null;
  if (args.goal === "fat_loss") return "fat_loss";
  if (args.goal === "muscle_gain") return "muscle_gain";
  return "maintenance";
}

/**
 * LA PART D'ÉNERGIE DE L'ASSIETTE QUI PEUT VENIR DU FÉCULENT, AU PLUS.
 *
 * ⛔ UNE PART D'ÉNERGIE, PAS DE MASSE: c'est ce qui se garde exact sur la
 * droite d'énergie constante — le partage ne change jamais les kcal de la case.
 * ⚠️ LA PRISE DE MUSCLE N'A PAS DE PLAFOND: sa règle du féculent à part est
 * inchangée (audit du 2026-09-23, lot 2, « contraintes respectées »).
 *
 * Calculé sur l'audit (`sim/synthese/plan_retenu_dist.txt`): Fabrice passe de
 * 0,38 à 0,28 de part médiane, Christèle de 0,48 à 0,41.
 */
export const STARCH_KCAL_SHARE_MAX: Readonly<Record<"fat_loss" | "maintenance", number>> = Object
  .freeze({
    fat_loss: 0.30,
    maintenance: 0.45,
  });

/**
 * LA BANDE BASSE: la part d'énergie du féculent ne descend pas sous
 * `min(STARCH_KCAL_SHARE_MIN, part de la recette)`.
 *
 * ⛔ LE « PLUS PETIT » EST LA RÈGLE, PAS UN DÉTAIL. Sans lui, une recette déjà
 * pauvre en féculent en recevrait PLUS que prévu — 1e553ca1, pommes de terre à
 * 0,18 de la recette, servies à 0,20 chez Fabrice. Avec lui, la bande basse
 * n'ajoute jamais de féculent: elle borne seulement ce qu'on en retire.
 * ⚠️ Conséquence assumée: sur une recette à 0,18, le plancher protéique ne
 * peut plus retirer de féculent du tout (issue `share_floor`).
 */
export const STARCH_KCAL_SHARE_MIN = 0.20;

/**
 * LES BORNES DE RAPPORT ÉLARGIES, POUR LA PERTE SEULEMENT.
 *
 * ⛔ DANS UN SEUL SENS: plus de casserole principale, moins de féculent. Les
 * deux autres bornes (`MAIN_FACTOR_MIN_RATIO`, `SIDE_FACTOR_MAX_RATIO`) ne
 * bougent pas. L'échec des rapports 0,6 / 2,5 du 2026-09-22 ne se répète pas:
 * la part d'énergie reste entre la bande basse et le plafond de l'objectif.
 * ⚠️ POURQUOI PAS PLUS LARGE: bornes élargies ET plancher à 126 g, la céréale
 * médiane de Fabrice tombait à 22 g, avec des cases à 13 g (audit, lot 2).
 */
export const FAT_LOSS_MAIN_FACTOR_MAX_RATIO = 2.0;
export const FAT_LOSS_SIDE_FACTOR_MIN_RATIO = 0.25;

/** Les quatre bornes de rapport au facteur uniforme, pour un objectif. */
export interface StarchRatioBounds {
  readonly mainMin: number;
  readonly mainMax: number;
  readonly sideMin: number;
  readonly sideMax: number;
}

/**
 * LES BORNES DE RAPPORT D'UN OBJECTIF. La perte élargit `mainMax` et
 * `sideMin`; tous les autres (maintien, prise, `null`) gardent celles d'avant.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function starchRatioBoundsFor(goal: StarchGoal | null): StarchRatioBounds {
  return {
    mainMin: MAIN_FACTOR_MIN_RATIO,
    mainMax: goal === "fat_loss" ? FAT_LOSS_MAIN_FACTOR_MAX_RATIO : MAIN_FACTOR_MAX_RATIO,
    sideMin: goal === "fat_loss" ? FAT_LOSS_SIDE_FACTOR_MIN_RATIO : SIDE_FACTOR_MIN_RATIO,
    sideMax: SIDE_FACTOR_MAX_RATIO,
  };
}

/** Le plafond de part d'un objectif. `null` = aucune forme (prise, mineur). */
function shareCapOf(goal: StarchGoal | null): number | null {
  return goal === "fat_loss" || goal === "maintenance" ? STARCH_KCAL_SHARE_MAX[goal] : null;
}

/**
 * LA PERSONNE DU MILIEU D'UNE TABLE: son facteur ET son objectif.
 *
 * ⛔ LA MÊME RÈGLE QUE `tableReferenceFactor` (médiane, à nombre pair la plus
 * petite des deux du milieu, rien sous deux mangeurs). L'objectif est celui de
 * LA LIGNE retenue: la grosse assiette garde au moins la casserole principale
 * que CETTE personne reçoit après SA forme d'objectif.
 * ⚠️ À FACTEURS ÉGAUX, L'ORDRE D'ENTRÉE DÉPARTAGE (tri stable): le module reste
 * déterministe.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function tableReferenceOf(
  rows: readonly { readonly factor: number; readonly goal: StarchGoal | null }[],
): { factor: number; goal: StarchGoal | null } | null {
  const ok = rows
    .filter((r) => Number.isFinite(r.factor) && r.factor > 0)
    .map((r, k) => ({ r, k }))
    .sort((a, b) => (a.r.factor - b.r.factor) || (a.k - b.k));
  if (ok.length < 2) return null;
  const mid = ok[Math.floor((ok.length - 1) / 2)].r;
  return { factor: mid.factor, goal: mid.goal };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ ter — LES LIGNES QUE L'AJUSTEUR DE PROPORTIONS NE REÇOIT PLUS (lot 5 c)
// ═══════════════════════════════════════════════════════════════════════════

/** Ce que `rowsForProportionAdjust` lit d'une ligne (plat, bouche). */
export interface ProportionAdjustRow {
  readonly dishIndex: number;
  /** Le facteur uniforme de la bouche sur ce plat (`sizeDishForMouth`). */
  readonly factor: number;
  /** `false` = ligne `unmeasurable`: elle ne compte pas dans la part du milieu. */
  readonly sized: boolean;
  /** Le plat est servi en deux casseroles, ses deux moitiés mesurées. */
  readonly twoPot: boolean;
}

/**
 * LES LIGNES DONT LA FOURCHETTE DE DENSITÉ PART À L'AJUSTEUR.
 *
 * ⛔ LE DÉFAUT (audit du 2026-09-23, C7). Sur un plat servi en deux
 * casseroles, la grosse assiette reçoit la casserole principale de la personne
 * du milieu et son surplus en féculent. Sa fourchette de densité, calculée sur
 * SON énergie, demandait pourtant à l'ajusteur de densifier la recette COMMUNE
 * — que tout le monde mange. Son surplus est déjà porté par le féculent à part:
 * sa ligne ne dit plus rien de la recette.
 *
 * ⚠️ SEULES LES LIGNES AU-DESSUS DU MILIEU sautent, et seulement sur un plat à
 * deux casseroles. `>` strict, la même comparaison que `splitStarchSide`: la
 * personne du milieu garde sa ligne. Une ligne non dimensionnée est rendue
 * telle quelle (l'appelant filtre déjà ses bornes).
 * ⛔ LE COMPTEUR COMPTE AUSSI LE ZÉRO: `skipped_split_rows` à 0 sur une table
 * de trois avec féculent à part dit « personne au-dessus du milieu », pas
 * « la règle n'est pas branchée ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function rowsForProportionAdjust<R extends ProportionAdjustRow>(
  rows: readonly R[],
): { rows: R[]; skipped_split_rows: number } {
  const refByDish = new Map<number, number | null>();
  const refOf = (dishIndex: number): number | null => {
    if (!refByDish.has(dishIndex)) {
      refByDish.set(
        dishIndex,
        tableReferenceFactor(
          rows.filter((r) => r.dishIndex === dishIndex && r.sized).map((r) => r.factor),
        ),
      );
    }
    return refByDish.get(dishIndex) ?? null;
  };
  const kept: R[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.twoPot && r.sized) {
      const ref = refOf(r.dishIndex);
      if (ref !== null && Number.isFinite(r.factor) && r.factor > ref) {
        skipped++;
        continue;
      }
    }
    kept.push(r);
  }
  return { rows: kept, skipped_split_rows: skipped };
}

/** La part standard d'une moitié de l'assiette, pour UN tirage. */
export interface PartMeasure {
  readonly kcal: number;
  readonly proteinG: number;
  readonly readyG: number;
}

export const STARCH_SPLIT_OUTCOMES = [
  /** À la part de référence ou en dessous, plancher tenu: un seul facteur. */
  "uniform",
  /** Grosse assiette: la casserole de la référence, le surplus en féculent. */
  "starch_carries_extra",
  /** Sous le plancher: la casserole principale monte, le féculent descend. */
  "to_floor",
  /** Le déplacement a buté sur une borne de RAPPORT. */
  "bounded",
  /**
   * Le déplacement a buté sur la borne de MASSE de l'assiette: il s'arrête là
   * (partiel), ou n'a pas pu commencer (les deux facteurs restent uniformes).
   */
  "mass_bound",
  /** Une des deux moitiés ne se mesure pas. */
  "unmeasurable",
  /** Plancher manqué, mais la casserole n'est pas plus protéique que le féculent. */
  "no_gradient",
  /**
   * ⟳ 2026-09-23 — LA FORME DE L'OBJECTIF: la part d'énergie du féculent
   * ramenée au plafond de l'objectif (perte, maintien), ou la grosse assiette
   * relevée à la casserole principale de la personne du milieu après SA forme.
   */
  "goal_shape",
  /**
   * ⟳ 2026-09-23 — Le déplacement a buté sur la BANDE BASSE de part
   * (`STARCH_KCAL_SHARE_MIN`): l'assiette garde un vrai féculent. Partiel, ou
   * rien du tout (les deux facteurs restent uniformes).
   */
  "share_floor",
] as const;
export type StarchSplitOutcome = (typeof STARCH_SPLIT_OUTCOMES)[number];

export interface StarchSplit {
  readonly mainFactor: number;
  readonly sideFactor: number;
  readonly outcome: StarchSplitOutcome;
  /** La protéine de la part au facteur uniforme, puis après. `null` = illisible. */
  readonly proteinBeforeG: number | null;
  readonly proteinAfterG: number | null;
  /** Les kcal que le féculent porte EN PLUS de sa part uniforme. Signé. */
  readonly starchCarriedKcal: number;
  /**
   * ⟳ 2026-09-23 — LA PART D'ÉNERGIE DU FÉCULENT dans la part, avant (celle de
   * la recette) puis après. `null` = illisible. C'est le nombre que la grille
   * d'acceptation lit (« part d'énergie du féculent dans le plat de Fabrice
   * ≤ 0,32 »): le rendre ici évite de le recalculer ailleurs.
   */
  readonly starchShareBefore: number | null;
  readonly starchShareAfter: number | null;
}

/**
 * LE FACTEUR DE LA CASSEROLE PRINCIPALE ET CELUI DU FÉCULENT, POUR UNE BOUCHE.
 *
 * ① L'ÉNERGIE DÉCIDE: une bouche au-dessus de la part de référence reçoit la
 *    casserole principale de la référence; le féculent porte le reste de son
 *    énergie. Au niveau de la référence ou en dessous, un seul facteur.
 *    ⟳ 2026-09-23 — « la casserole de la référence » est celle que la personne
 *    du milieu reçoit APRÈS SA forme d'objectif (`tableGoal`): au plus juste, la
 *    grosse assiette n'a jamais moins de légumes que la personne du milieu.
 *    Mesuré sur la simulation de l'audit (e0325544, jeudi midi): Thomas
 *    recevait 186 g de légumes contre 207 pour Christèle.
 * ①bis ⟳ 2026-09-23 — LA FORME DE SON OBJECTIF: en perte et en maintien, la part
 *    d'énergie du féculent ne dépasse pas `STARCH_KCAL_SHARE_MAX`, au-dessus
 *    comme en dessous de la personne du milieu, à table comme seul.
 * ② LE PLANCHER CONTRAINT: si la protéine de la part passe sous le plancher de
 *    la bouche, la casserole principale remonte jusqu'à lui. Sur la droite
 *    d'énergie constante, `P(f_m) = T × P_s / K_s + f_m × (P_m − K_m × P_s / K_s)`.
 * ③ LES BORNES: rapports modérés (élargis pour la perte), puis la bande basse
 *    de part (perte, maintien), puis masse de l'assiette (elle ne s'éloigne pas
 *    de ses bornes plus que la masse uniforme). L'énergie reste exacte.
 *
 * ⛔ AUCUN PLAFOND PROTÉIQUE ICI: c'est une mesure, pas une cible.
 * ⛔ `goal: null` REND LA RÈGLE D'AVANT CE LOT, MOT POUR MOT: ni forme, ni
 * bande basse, ni bornes élargies, et la casserole de la référence telle quelle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function splitStarchSide(args: {
  readonly main: PartMeasure | null;
  readonly side: PartMeasure | null;
  /** Le facteur uniforme de la bouche sur ce plat (`sizeDishForMouth`). */
  readonly uniformFactor: number;
  /** `tableReferenceFactor` du plat. `null` = pas de table: un seul facteur. */
  readonly tableFactor: number | null;
  /**
   * ⟳ 2026-09-23 — L'OBJECTIF DE LA PERSONNE DU MILIEU (`tableReferenceOf`).
   * REQUIS: la grosse assiette garde au moins la casserole principale que
   * cette personne reçoit après SA forme. Sans effet quand `tableFactor` est
   * `null`, ou quand CETTE bouche est `goal: null`.
   */
  readonly tableGoal: StarchGoal | null;
  /** Le plancher de CETTE part, en grammes. `null` = aucun plancher lisible. */
  readonly floorG: number | null;
  /**
   * Les bornes de masse de SON assiette. REQUISES: `null` = pas de borne.
   * Le partage ne doit pas éloigner la masse de ces bornes plus que le facteur
   * uniforme ne le fait déjà.
   */
  readonly bounds: { readonly min: number; readonly max: number } | null;
  /**
   * ⟳ 2026-09-23 — L'OBJECTIF DE CETTE BOUCHE (`starchGoalOf`).
   * ⛔ REQUIS, JAMAIS `?`: un oubli rendrait la règle d'avant partout, et le
   * plan serait identique à un plan où la forme marche — une garde désarmée
   * en silence. `null` = mineur ou âge inconnu.
   */
  readonly goal: StarchGoal | null;
}): StarchSplit {
  const u = args.uniformFactor;
  const uniform = (
    outcome: StarchSplitOutcome,
    before: number | null,
    share: number | null,
  ): StarchSplit => ({
    mainFactor: u,
    sideFactor: u,
    outcome,
    proteinBeforeG: before,
    proteinAfterG: before,
    starchCarriedKcal: 0,
    starchShareBefore: share,
    starchShareAfter: share,
  });
  const { main, side, goal } = args;
  if (
    main === null || side === null || !Number.isFinite(u) || !(u > 0) ||
    !(main.kcal > 0) || !(side.kcal > 0) ||
    !Number.isFinite(main.proteinG) || !Number.isFinite(side.proteinG)
  ) {
    return uniform("unmeasurable", null, null);
  }
  const before = u * (main.proteinG + side.proteinG);
  const partKcal = main.kcal + side.kcal;
  const T = u * partKcal;
  /** La part d'énergie du féculent dans la RECETTE — celle du facteur uniforme. */
  const recipeShare = side.kcal / partKcal;
  const sideDensity = side.proteinG / side.kcal;
  const slope = main.proteinG - main.kcal * sideDensity;
  const proteinAt = (f: number) => T * sideDensity + f * slope;
  /**
   * Le facteur de casserole principale où le féculent porte la part `s` de
   * l'énergie `energy`. Sur la droite d'énergie constante, la part du féculent
   * vaut `1 − f_m × K_m / E`.
   */
  const mainAtShare = (energy: number, s: number) => ((1 - s) * energy) / main.kcal;
  /**
   * La casserole principale d'une assiette au facteur `f`, APRÈS la forme de
   * l'objectif `g`: plafond de part, dans les bornes de rapport de `g`. Sans
   * plancher ni masse: c'est la FORME, pas la part servie.
   */
  const shapedMainAt = (f: number, g: StarchGoal | null): number => {
    const c = shareCapOf(g);
    if (c === null || recipeShare <= c) return f;
    const energy = f * partKcal;
    const rb = starchRatioBoundsFor(g);
    const hiAt = Math.min(f * rb.mainMax, (energy - f * rb.sideMin * side.kcal) / main.kcal);
    return Math.min(hiAt, mainAtShare(energy, c));
  };

  // ① L'énergie.
  const ref = args.tableFactor;
  let target = u;
  if (ref !== null && Number.isFinite(ref) && ref > 0 && u > ref) {
    // ⛔ `goal: null`: la casserole de la référence telle quelle, comme avant.
    target = goal === null ? ref : Math.max(ref, shapedMainAt(ref, args.tableGoal));
  }
  // ⚠️ `target > u` arrive quand la forme de la personne du milieu lui donne
  // plus de casserole principale qu'à cette grosse assiette au facteur
  // uniforme: « au moins la casserole du milieu » l'emporte, c'est une forme.
  let reason: StarchSplitOutcome = target < u
    ? "starch_carries_extra"
    : target > u
    ? "goal_shape"
    : "uniform";

  // ①bis La forme de SON objectif: un plafond de part, donc un PLANCHER de
  // casserole principale.
  const cap = shareCapOf(goal);
  if (cap !== null) {
    const capMain = mainAtShare(T, cap);
    if (target < capMain - 1e-12) {
      target = capMain;
      reason = "goal_shape";
    }
  }

  // ② Le plancher.
  const floor = args.floorG;
  if (floor !== null && Number.isFinite(floor) && proteinAt(target) < floor - 1e-9) {
    if (slope > 1e-9) {
      target = (floor - T * sideDensity) / slope;
      reason = "to_floor";
    } else if (target === u) {
      return uniform("no_gradient", before, recipeShare);
    }
  }
  if (Math.abs(target - u) < 1e-12) return uniform(reason, before, recipeShare);

  // ③ Les bornes de rapport DE SON OBJECTIF, sur la droite d'énergie
  // constante. Elles contiennent `u` (rapports 1 et 1).
  const rb = starchRatioBoundsFor(goal);
  const lo = Math.max(
    u * rb.mainMin,
    (T - u * rb.sideMax * side.kcal) / main.kcal,
  );
  const hi = Math.min(
    u * rb.mainMax,
    (T - u * rb.sideMin * side.kcal) / main.kcal,
  );
  // ⟳ 2026-09-23 — LA BANDE BASSE DE PART, en perte et en maintien: une borne
  // HAUTE de casserole principale. ⛔ `min(…, part de la recette)`: elle
  // contient `u`, donc elle ne pousse jamais du féculent en plus.
  const hiShare = cap === null
    ? Infinity
    : mainAtShare(T, Math.min(STARCH_KCAL_SHARE_MIN, recipeShare));
  // ⛔ LA MASSE EST UNE BORNE, PAS UN VETO. Sur la droite d'énergie constante,
  // `M(f_m) = f_m × (R_m − K_m × R_s / K_s) + T × R_s / K_s`. Mesuré au run
  // réel `44c61a40`: en veto, 4 lignes sur 7 de la bouche en prise de masse
  // restaient uniformes pour quelques grammes au-dessus de 700.
  let loM = -Infinity;
  let hiM = Infinity;
  if (args.bounds !== null) {
    const uniformMass = u * (main.readyG + side.readyG);
    const maxM = Math.max(args.bounds.max, uniformMass);
    const minM = Math.min(args.bounds.min, uniformMass);
    const massSlope = main.readyG - (main.kcal * side.readyG) / side.kcal;
    const massAt0 = (T * side.readyG) / side.kcal;
    if (massSlope > 1e-9) {
      hiM = (maxM - massAt0) / massSlope;
      loM = (minM - massAt0) / massSlope;
    } else if (massSlope < -1e-9) {
      loM = (maxM - massAt0) / massSlope;
      hiM = (minM - massAt0) / massSlope;
    }
  }
  const byRatio = Math.min(hi, Math.max(lo, target));
  const byShare = Math.min(hiShare, byRatio);
  const fMain = Math.min(hiM, Math.max(loM, byShare));
  const massStopped = fMain !== byShare;
  const shareStopped = byShare !== byRatio;
  if (massStopped && Math.abs(fMain - u) < 1e-9) {
    return uniform("mass_bound", before, recipeShare);
  }
  if (!massStopped && shareStopped && Math.abs(fMain - u) < 1e-9) {
    return uniform("share_floor", before, recipeShare);
  }
  const fSide = (T - fMain * main.kcal) / side.kcal;
  const outcome: StarchSplitOutcome = massStopped
    ? "mass_bound"
    : shareStopped
    ? "share_floor"
    : byRatio !== target
    ? "bounded"
    : reason;
  return {
    mainFactor: fMain,
    sideFactor: fSide,
    outcome,
    proteinBeforeG: before,
    proteinAfterG: fMain * main.proteinG + fSide * side.proteinG,
    starchCarriedKcal: (fSide - u) * side.kcal,
    starchShareBefore: recipeShare,
    starchShareAfter: (fSide * side.kcal) / T,
  };
}
