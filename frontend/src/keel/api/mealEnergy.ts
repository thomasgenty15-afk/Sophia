import { supabase } from "../../lib/supabase";

// FF-059 — LE CHIFFRE AFFICHÉ, CÔTÉ CLIENT.
//
// Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
//
// ── CE FICHIER NE CALCULE RIEN, ET NE PEUT PAS ─────────────────────────────
// Le référentiel de composition (`food_composition_refs`) est révoqué pour
// `anon` et `authenticated`: un client ne peut pas convertir des grammes en
// kilocalories, même s'il le voulait. C'est voulu, et c'est la moitié de la
// garde — l'autre moitié est que la CHAÎNE DE GARDES vit dans la fonction
// `meal-energy-v1`, où aucun code d'écran ne peut l'oublier.
//
// ── QUAND UNE PORTE EST FERMÉE, IL N'Y A RIEN À CACHER ─────────────────────
// La réponse ne contient alors AUCUN chiffre: pas de tableau vide, pas de zéro,
// pas de valeur qu'un composant pourrait rendre par mégarde ou qu'un onglet
// réseau pourrait révéler. Un `EnergyReading` fermé ne porte qu'un motif. C'est
// la propriété qu'on veut pouvoir prouver par l'ABSENCE DE CHEMIN, et elle
// commence par l'absence de donnée.
//
// ── RIEN N'EST MIS EN CACHE ICI (R5) ───────────────────────────────────────
// Aucun `localStorage`, aucun module-level store. Le chiffre se redemande avec
// le plan; un plan modifié rend un autre chiffre au chargement suivant, et il
// n'y a aucun état à invalider parce qu'il n'y en a aucun. Le seul cache est
// celui du composant React qui l'affiche, et il meurt avec la page.

/**
 * POURQUOI UN ÉLÈVE NE VOIT PAS DE CHIFFRE. Vocabulaire FERMÉ, aligné sur
 * `_shared/keel/energy_gate.ts` plus les deux motifs de la fonction.
 *
 * ⚠️ Les quatre refus ne se disent PAS pareil à l'écran, et c'est pour ça
 * qu'ils sont nommés: `doctrine_no_counting` se raconte (« ton coach ne compte
 * pas ici »), `restriction_floor` et `minor` ne se racontent PAS DU TOUT —
 * expliquer à quelqu'un qu'on lui cache un chiffre de calories, c'est encore
 * lui parler de calories.
 */
export const ENERGY_REASONS = [
  "open",
  "restriction_floor",
  "minor",
  /**
   * ⟳ S3 (2026-08-22) — la porte ②bis du back. Elle rejoint la famille des
   * refus qui NE SE RACONTENT PAS: « on ne connaît pas ta date de naissance,
   * donc pas de chiffre » se lit comme un marchandage — donne ta date, reçois
   * des calories — et il concernerait 91 % des comptes. L'écran se tait,
   * exactement comme sur `minor` et `restriction_floor`. Le jour où la date se
   * redemande, elle se redemandera depuis « about you », pas depuis un chiffre
   * absent.
   */
  "age_unknown",
  "doctrine_no_counting",
  "student_off",
  "unavailable",
  "no_plan",
] as const;
export type EnergyReason = (typeof ENERGY_REASONS)[number];

/** La base, et il n'y en a qu'une sur ce chemin: le plan porte ses quantités. */
export const PLAN_ENERGY_BASIS = "plan_quantities";

export interface DishEnergyView {
  /** `null` = ce plat n'est pas calculable. Jamais une somme partielle. */
  kcal: number | null;
  basis: string;
  complete: boolean;
  /** `unknown_ingredient` · `missing_quantity` · `no_ingredients`. */
  gaps: string[];
}

export interface DayEnergyView {
  day: string | null;
  kcal: number | null;
  basis: string;
  /**
   * `false` = au moins un plat du jour n'a pas pu être compté.
   *
   * ⚠️ L'ÉCRAN DOIT RENDRE `dishesCounted` / `dishesTotal`, pas seulement le
   * mot « incomplet ». Un total qui paraît exhaustif et ne l'est pas est pire
   * que pas de total — c'est le rabbit hole n°3 de la fiche, et c'est à
   * l'affichage qu'il se commet.
   */
  complete: boolean;
  dishesCounted: number;
  dishesTotal: number;
  /**
   * ⛔ LOT A1 (2026-09-22) — `addonKcal` EST PARTI D'ICI ET DU FIL.
   *
   * Il portait les `member_deltas` de FF-043, et ces kcal étaient AUSSI dans
   * `kcal`. Mesuré le 2026-09-22 : 1 373 kcal/jour d'un riz qui n'avait ni
   * boîte, ni ligne de courses, ni carte. Le total du jour ne compte plus que
   * ce que le plan a composé.
   */
  /**
   * ⟳ 2026-09-24 — `subject`, `mealsOut` et `eatingOutAdvice` SONT PARTIS avec
   * l'état « dehors »: leur seul producteur était un repas marqué pris dehors.
   */
}

/** Ce qu'un plan rend, quand les quatre portes sont ouvertes. */
/**
 * ⟳ LOT F (2026-09-04) — LE KCAL D'UN CONTENANT À UN NOM.
 *
 * Décision: « dès qu'il y a un objectif de perte ou de gain de poids, c'est
 * affiché, peu importe qui regarde ». Le serveur ne rend une ligne ici QUE pour
 * une boîte à UN nom dont la bouche a une direction et passe SA chaîne de
 * sécurité (`canEmitBoxEnergy`). Un bac partagé n'a jamais de kcal: ses grammes
 * sont une quantité de bac, pas la portion de quelqu'un.
 *
 * ⚠️ `kcal` EST TOUJOURS UN NOMBRE ICI: le serveur ne rend pas les boîtes
 * refusées. L'absence d'une boîte dans cette liste est un silence, jamais un 0.
 */
export interface BoxEnergyView {
  boxId: string;
  memberId: string;
  kcal: number;
  basis: string;
}

export function readBox(raw: unknown): BoxEnergyView | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  const boxId = String(b.box_id ?? "").trim();
  const memberId = String(b.member_id ?? "").trim();
  const kcal = finiteEnergyNumber(b.kcal);
  // ⛔ TOUT OU RIEN. Une boîte sans id, sans bouche ou sans nombre ne se rend
  // pas: un kcal qu'on ne saurait pas poser sur un couvercle précis est un
  // chiffre qui atterrirait sur le mauvais.
  if (!boxId || !memberId || kcal === null) return null;
  return { boxId, memberId, kcal: Math.round(kcal), basis: String(b.basis ?? PLAN_ENERGY_BASIS) };
}

/** ⟳ LOT F — les boîtes d'un plan, telles que le serveur les rend. Tout ou rien par ligne. */
export function readBoxes(raw: unknown): BoxEnergyView[] {
  return Array.isArray(raw) ? raw.map(readBox).filter((b): b is BoxEnergyView => b !== null) : [];
}

/**
 * ⟳ 2026-09-24 — LE TOTAL DU JOUR D'UNE PERSONNE, pour le tableau de la semaine.
 *
 * Le serveur le calcule comme la SOMME DE SES BOÎTES DÉJÀ ÉMISES
 * (`memberDayEnergy`, `served_final.ts`): il ne sort donc que pour une
 * personne dont les boîtes passent déjà leurs portes — un adulte qui vise une
 * perte ou une prise. Un enfant, une personne sans objectif, un lecteur qui a
 * éteint: aucune ligne, et l'écran rend « — ».
 *
 * `complete: false` = certains repas de ce jour ne sont pas dans une boîte à
 * son nom (bac commun): le nombre est vrai sur ce qu'il couvre, et l'écran le
 * marque.
 */
export interface MemberDayEnergyView {
  memberId: string;
  day: string;
  kcal: number;
  complete: boolean;
  mealsCounted: number;
  mealsTotal: number;
}

export function readMemberDay(raw: unknown): MemberDayEnergyView | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  const memberId = String(m.member_id ?? "").trim();
  const day = String(m.day ?? "").trim();
  const kcal = finiteEnergyNumber(m.kcal);
  // ⛔ TOUT OU RIEN, comme `readBox`: un total sans personne ou sans jour
  // atterrirait dans la mauvaise case du tableau.
  if (!memberId || !day || kcal === null || kcal <= 0) return null;
  const counted = finiteEnergyNumber(m.meals_counted);
  const total = finiteEnergyNumber(m.meals_total);
  return {
    memberId,
    day,
    kcal: Math.round(kcal),
    complete: m.complete === true,
    mealsCounted: counted === null ? 0 : Math.round(counted),
    mealsTotal: total === null ? 0 : Math.round(total),
  };
}

/** Tout ou rien par ligne; un champ absent (serveur d'avant ce lot) rend `[]`. */
export function readMemberDays(raw: unknown): MemberDayEnergyView[] {
  return Array.isArray(raw)
    ? raw.map(readMemberDay).filter((d): d is MemberDayEnergyView => d !== null)
    : [];
}

export interface PlanEnergyView {
  planId: string;
  /**
   * `false` = ce plan n'est pas calculable EN TANT QUE PLAN, indépendamment de
   * la personne.
   *
   * ⛔ LOT A1 (2026-09-22) — `abstention` EST PARTIE AVEC SON UNIQUE MOTIF.
   * `household_portions_not_numeric` ne se déclenchait que sur l'absence des
   * `member_deltas` du lecteur; ces deltas ne sont plus lus par personne, donc
   * ce motif n'a plus de cause. Le serveur n'envoie plus de plan
   * `computable: false` aujourd'hui — ce lecteur garde la porte fermée par
   * défaut, comme avant, mais sans mot à rendre.
   */
  computable: boolean;
  dishes: DishEnergyView[];
  days: DayEnergyView[];
  /** ⟳ LOT F — les contenants à un nom dont la bouche a droit à son chiffre. */
  boxes: BoxEnergyView[];
  /** ⟳ 2026-09-24 — le total du jour de chaque personne dont les boîtes sortent. */
  memberDays: MemberDayEnergyView[];
}

/**
 * ⟳ LOT 4 (2026-09-01) — LES DEUX FORMES DE FOURCHETTE, VOCABULAIRE FERMÉ.
 *
 * ⚠️ LA BASE N'EST PAS DÉCORATIVE, C'EST ELLE QUI CHOISIT LA PHRASE. « Autour
 * de 2 100–2 500 pour ton poids » et « … pour ta perte de poids » ne sont pas
 * le même énoncé, même quand les nombres coïncident. Un jeton inconnu retombe
 * sur `weight_range`, c'est-à-dire sur le comportement d'hier — jamais sur une
 * phrase inventée.
 */
export const ENERGY_TARGET_BASES = [
  "weight_range",
  "weight_range_with_direction",
  /**
   * ⟳ 2026-09-09 — LA TROISIÈME BASE, et c'est celle qui s'affiche par défaut
   * depuis cette date: l'équation du corps (taille, âge, sexe, poids et les
   * DEUX axes d'activité) portée par la bande de l'objectif, au lieu du
   * raccourci `poids × kcal/kg`. Le jeton du serveur est
   * `ENERGY_TARGET_BASIS_BODY` (`_shared/keel/energy_target.ts`), qui porte la
   * mesure ayant produit la décision.
   *
   * ⚠️ ELLE SE LIT COMME `weight_range_with_direction`: la bande DESCEND de
   * l'objectif, donc la phrase dirigée est la vraie. Les deux anciens jetons
   * restent servis — une fiche sans taille ni bande d'âge ne peut pas entrer
   * dans l'équation et retombe sur le raccourci, en le disant.
   */
  "body_equation_with_goal_band",
] as const;

/**
 * ⟳ LOT 4 — LA DIRECTION QUE LA FOURCHETTE A SUIVIE. Vocabulaire FERMÉ, aligné
 * sur `ScaleDirection` du back (`weight_pace.ts`).
 */
export const ENERGY_TARGET_DIRECTIONS = ["up", "down"] as const;
export type EnergyTargetDirection = (typeof ENERGY_TARGET_DIRECTIONS)[number];

/**
 * FF-059 LOT 3 — LA CIBLE, NIVEAU C.
 *
 * ⚠️ UNE FOURCHETTE, JAMAIS UN POINT, et c'est la forme qui décide si ce
 * chiffre devient un objectif. Personne ne « rate » un intervalle de 400 kcal.
 *
 * ⚠️ AUCUN RESTE N'EXISTE, ni ici ni ailleurs. Le serveur ne soustrait rien du
 * total du jour, et l'écran ne doit pas le faire non plus: « il te reste 680
 * kcal » est LA phrase d'un tracker. Le total et la fourchette se posent côte à
 * côte, et c'est l'élève qui lit.
 *
 * ⟳ **CE N'EST PLUS TOUJOURS UNE MAINTENANCE (lot 4, 2026-09-01).** Quand la
 * personne vise une perte ou une prise, le serveur décale la fourchette de
 * l'écart que le MOTEUR exécute déjà sur ses grammages — pas d'un écart calculé
 * pour l'écran. Ce qui reste vrai, et qui ne bougera pas: la largeur ne change
 * pas, rien n'est soustrait du total du jour, et aucun verdict n'accompagne le
 * nombre.
 */
export interface EnergyTargetView {
  /** `null` avec un `gap` nommé: `no_weight` ou `implausible_weight`. */
  low: number | null;
  high: number | null;
  basis: string;
  gap: string | null;
  /** La semaine de la pesée qui a servi. Aucune fraîcheur n'en est dérivée. */
  weightWeekStart: string | null;
  /**
   * ⟳ LOT 4 — `null` = c'est une maintenance, et c'est le cas nominal.
   *
   * ⚠️ IL PART AVEC `basis`, JAMAIS SEUL — voir `readTarget`. Une direction
   * sans sa base ferait dire « pour ta perte de poids » à des nombres
   * d'entretien: le défaut d'origine, avec l'étiquette en plus.
   */
  direction: EnergyTargetDirection | null;
  /**
   * ⟳ LOT 4 — POURQUOI ELLE N'A PAS SUIVI: `no_pace` · `below_energy_floor` ·
   * `condition_cancelled`. `null` quand il n'y a rien à expliquer.
   *
   * ⛔ AUCUN DES TROIS NE SE RACONTE À L'ÉCRAN AUJOURD'HUI, et c'est délibéré:
   * « ta fourchette n'a pas bougé parce que tu es enceinte » serait parler de
   * déficit à quelqu'un à qui on vient de le retirer, et « … parce que ça
   * passerait sous ton plancher » serait nommer un nombre de famine pour dire
   * qu'on refuse de l'afficher. Le champ voyage pour être COMPTÉ, pas dit.
   */
  directionGap: string | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-10 · LOT 3 — L'OBJECTIF NE S'EXÉCUTE PAS, ET ON SAIT POURQUOI.
   * ══════════════════════════════════════════════════════════════════════
   *
   * `"pace_unavailable_missing_body"` ou `null`. Écrit par
   * `loadDailyEnergyTarget` (`_shared/keel/meal_energy_shared.ts`), vocabulaire
   * FERMÉ et épinglé côté serveur (`constant_pins_test.ts`).
   *
   * ⛔ LE DÉFAUT QU'IL FERME, ET IL EST MUET SANS LUI. Sur une fiche SANS
   * TAILLE, la cible passe par le raccourci au poids — donc une fourchette
   * sort — pendant que l'entretien du rythme rend `null`, donc l'écart vaut
   * ZÉRO. L'écran disait « pour perdre à ton rythme » au-dessus de nombres
   * d'entretien: l'objectif de la personne était annulé sans un mot.
   *
   * ⚠️ IL NE SE CONFOND PAS AVEC `directionGap`. Celui-là dit pourquoi la
   * DIRECTION n'a pas suivi (`no_pace`, `below_energy_floor`,
   * `condition_cancelled`), et il ne se raconte pas. Celui-ci dit qu'un rythme
   * RÉGLÉ n'a pas pu être calculé faute d'une donnée que la personne peut
   * ajouter — donc il se DIT, et il dit où réparer.
   *
   * ⚠️ CONTRAIREMENT À `direction`, IL N'EST PAS TOUT-OU-RIEN AVEC LA BASE. Le
   * lire seulement quand la direction sort ferait taire le motif exactement
   * dans le cas où il compte le plus.
   */
  paceUnavailable: string | null;
}

export type EnergyReading =
  | {
    show: true;
    reason: "open";
    /** L'élève peut éteindre: la bascule s'affiche, allumée. */
    switchOfferable: true;
    basis: string;
    plans: PlanEnergyView[];
    /**
     * `null` = la porte ⑤ est fermée, ou le poids n'a pas pu être lu. Dans le
     * premier cas le serveur n'a même pas LU le poids: rien de dérivé du corps
     * de l'élève n'a voyagé.
     */
    target: EnergyTargetView | null;
    /** La bascule de la cible ne se propose que si son seul refus est elle. */
    targetOfferable: boolean;
  }
  | {
    show: false;
    reason: Exclude<EnergyReason, "open">;
    /**
     * VRAI SEULEMENT quand le seul refus est `student_off`.
     *
     * C'est ce qui permet de proposer « voir les calories » à qui l'a éteint,
     * sans jamais en parler à qui le plancher TCA, l'âge ou son coach
     * protègent — leur montrer une bascule serait déjà leur parler du sujet.
     */
    switchOfferable: boolean;
    /**
     * ⟳ LOT F — LES BOÎTES DES BOUCHES À OBJECTIF, MÊME QUAND LE LECTEUR EST
     * FERMÉ PAR DÉFAUT. Non vide seulement quand le lecteur est en maintenance
     * et n'a rien choisi (`student_off` par `no_direction`): les boîtes de ceux
     * qui visent une perte ou une prise sortent quand même sur son écran —
     * c'est la décision « peu importe qui regarde ». Un lecteur qui a
     * EXPLICITEMENT éteint ne reçoit rien ici (R7). Un lecteur fermé par le
     * plancher, l'âge ou son coach non plus. Le serveur décide; ici on lit.
     */
    boxes: Array<{ planId: string; boxes: BoxEnergyView[]; memberDays: MemberDayEnergyView[] }>;
  };

/** Un refus, sans un chiffre. La forme de repli de TOUTE erreur de ce module. */
function closed(reason: Exclude<EnergyReason, "open">): EnergyReading {
  return { show: false, reason, switchOfferable: false, boxes: [] };
}

/**
 * L'ABSENCE D'UN CHIFFRE NE DOIT PAS DEVENIR LE CHIFFRE ZÉRO.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME, MESURÉ LE 2026-08-18 ──────────────
 * `Number(null)` vaut `0`, et `Number.isFinite(0)` vaut `true`. Un
 * `Number.isFinite(Number(x))` laisse donc passer `null` — en le transformant
 * en zéro. Mesuré en session réelle: le serveur rendait
 * `target: { low: null, high: null, gap: "no_weight" }` — l'abstention exacte
 * d'une personne sans pesée — et l'écran affichait
 * « Autour de 0–0 par jour pour ton poids », sous la phrase « à peu près ce
 * qu'un corps de ta taille dépense en une journée ».
 *
 * Ce que ça coûtait, et pourquoi c'est cette garde-ci qui doit le porter:
 *
 *   1. C'était un chiffre de NIVEAU C — celui qui parle du corps, pas de la
 *      nourriture — FABRIQUÉ par l'écran, pour quelqu'un dont le serveur avait
 *      décidé de se taire. La chaîne de gardes avait dit non; le parseur a dit
 *      oui à sa place.
 *   2. Le motif `no_weight` voyageait, et personne ne le lisait: la copie
 *      « ajoute une pesée » (`meals.energy.target_no_weight`) était donc
 *      INATTEIGNABLE. La réparation disparaissait avec l'abstention.
 *   3. Sur le total d'un jour, le même piège rend « 0 kcal » là où
 *      `DayEnergyLine` croit rendre « journée illisible » — le sens
 *      exactement inverse, et c'est le rabbit hole n°3 de la fiche.
 *
 * ⚠️ NE PAS REVENIR À `Number.isFinite(Number(x))`. Le test
 * `mealEnergy.int.test.ts` porte la valeur RENDUE pour chacun des trois
 * chemins, et il rougit sur ce geste précis.
 */
export function finiteEnergyNumber(value: unknown): number | null {
  // `null`, `undefined` et la chaîne vide sont les trois formes sous lesquelles
  // « pas de chiffre » arrive sur le fil. `Number()` les rend toutes `0`.
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function readDish(raw: unknown): DishEnergyView {
  const d = (raw ?? {}) as Record<string, unknown>;
  const kcal = finiteEnergyNumber(d.kcal);
  const complete = d.complete === true;
  return {
    // ⚠️ LE CHIFFRE NE SURVIT PAS À `complete: false`, même si le serveur en
    // envoyait un. Deux écritures de la même règle, aux deux bouts du fil: le
    // jour où l'une se relâche, l'autre tient.
    kcal: complete ? kcal : null,
    basis: String(d.basis ?? ""),
    complete,
    gaps: Array.isArray(d.gaps) ? d.gaps.map((g) => String(g)) : [],
  };
}

export function readDay(raw: unknown): DayEnergyView {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    day: d.day === null || d.day === undefined ? null : String(d.day),
    kcal: finiteEnergyNumber(d.kcal),
    basis: String(d.basis ?? ""),
    complete: d.complete === true,
    dishesCounted: Number(d.dishes_counted) || 0,
    dishesTotal: Number(d.dishes_total) || 0,
  };
}

/**
 * LA FOURCHETTE, LUE. Extraite pour être éprouvée sur sa valeur RENDUE.
 *
 * ⚠️ TOUT-OU-RIEN: une borne seule se rendrait comme un POINT à l'écran, et un
 * point est exactement la forme qu'on refuse — personne ne « rate » un
 * intervalle, tout le monde rate un nombre.
 */
export function readTarget(raw: unknown): EnergyTargetView | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const low = finiteEnergyNumber(t.low);
  const high = finiteEnergyNumber(t.high);
  const both = low !== null && high !== null;

  // ── ⟳ LOT 4 · LA DIRECTION EST TOUT-OU-RIEN AVEC SA BASE ET SES BORNES ──
  //
  // TROIS conditions, toutes requises, et chacune ferme un énoncé faux:
  //
  //   · le jeton doit être DANS le vocabulaire fermé — sinon la phrase sortirait
  //     avec « undefined » dedans;
  //   · la BASE doit dire `weight_range_with_direction` — une direction posée
  //     sur une base d'entretien ferait dire « pour ta perte de poids » à des
  //     nombres qui n'ont pas bougé, c'est-à-dire le défaut que ce lot répare,
  //     avec une étiquette qui le rend indétectable;
  //   · les DEUX bornes doivent exister — une direction annoncée au-dessus d'un
  //     `no_weight` promettrait une fourchette adaptée là où il n'y a rien.
  //
  // Le repli est `null`, c'est-à-dire EXACTEMENT le comportement d'avant ce
  // champ: la phrase de maintenance, qui était vraie et le reste.
  const declaredBasis = String(t.basis ?? "");
  const declaredDirection = String(t.direction ?? "");
  const directed = both &&
    // ⟳ 2026-09-09 — DEUX BASES DIRIGÉES, PAS UNE. `body_equation_with_goal_band`
    // porte la direction par construction (sa bande EST celle de l'objectif).
    // L'oublier ici ferait dire « pour ton poids » à des nombres bâtis sur une
    // prise — le contresens exact que ce test de base existe pour empêcher.
    (declaredBasis === "weight_range_with_direction" ||
      declaredBasis === "body_equation_with_goal_band") &&
    (ENERGY_TARGET_DIRECTIONS as readonly string[]).includes(declaredDirection);

  return {
    low: both ? low : null,
    high: both ? high : null,
    basis: declaredBasis,
    gap: t.gap === null || t.gap === undefined ? null : String(t.gap),
    weightWeekStart: t.weight_week_start === null || t.weight_week_start === undefined
      ? null
      : String(t.weight_week_start),
    direction: directed ? (declaredDirection as EnergyTargetDirection) : null,
    directionGap: t.direction_gap === null || t.direction_gap === undefined
      ? null
      : String(t.direction_gap),
    // ⟳ 2026-09-10 · LOT 3 — MÊME LECTURE QUE SES DEUX VOISINS, ET LA MÊME
    // GARDE: absent, `null` ou chaîne vide ⇒ `null`. Une chaîne vide qui
    // survivrait ici serait « truthy: non » côté écran mais « il y a un motif »
    // côté compteur — deux lectures d'un même champ, dont la plus permissive
    // décide.
    paceUnavailable: t.pace_unavailable === null || t.pace_unavailable === undefined
      ? null
      : String(t.pace_unavailable).trim() || null,
  };
}

/**
 * L'énergie des plans demandés, ou le motif nommé du silence.
 *
 * ── NE JETTE JAMAIS ────────────────────────────────────────────────────────
 * Une panne réseau rend `unavailable`, pas une exception. Ce n'est pas de la
 * complaisance: l'appelant est un écran de plan, et une exception y ferait
 * disparaître le PLAN pour un chiffre qui est un supplément. La direction
 * d'échec est la bonne — on perd le nombre, jamais le repas.
 *
 * ⚠️ Corollaire à ne pas oublier: `unavailable` ne doit RIEN afficher. Pas
 * « chiffre indisponible », pas un tiret à la place du nombre. Un espace réservé
 * dit « il y a un chiffre ici d'habitude », ce qui est exactement le message
 * qu'on ne veut pas laisser à qui vient d'être protégé par une porte fermée —
 * de l'extérieur, une panne et un refus doivent se ressembler.
 */
export async function loadMealEnergy(
  planIds: readonly string[],
  /**
   * ⟳ 2026-09-08 — LES BROUILLONS RANGÉS (`student_meal_drafts`).
   *
   * ⛔ REQUIS, jamais `?`. Ce dépôt paie en boucle le « paramètre optionnel =
   * garde désarmée »: un champ facultatif ici aurait laissé l'appelant existant
   * compiler sans le voir, et le chiffre du brouillon serait construit puis
   * débranché — un lot désarmé qui ressemble trait pour trait à un lot qui
   * marche. `[]` est la valeur de qui regarde un plan écrit.
   *
   * ⚠️ CE N'EST PAS UN CALCULATEUR. On envoie des IDENTIFIANTS, jamais des
   * grammes: le serveur lit une ligne qu'il a écrite lui-même. Le référentiel de
   * composition est révoqué pour `anon` et `authenticated` exprès — un client ne
   * peut pas convertir des grammes en kilocalories, même s'il le voulait, et
   * cette fonction ne doit pas devenir le service qui le fait pour lui.
   */
  draftIds: readonly string[],
): Promise<EnergyReading> {
  const ids = [...new Set(planIds.map((v) => String(v ?? "").trim()).filter(Boolean))];
  const drafts = [...new Set(draftIds.map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (ids.length === 0 && drafts.length === 0) return closed("no_plan");

  const { data, error } = await supabase.functions.invoke("meal-energy-v1", {
    body: { plan_ids: ids, draft_ids: drafts },
  });
  if (error) return closed("unavailable");

  const row = (data ?? {}) as Record<string, unknown>;
  const reason = String(row.reason ?? "");
  const known = (ENERGY_REASONS as readonly string[]).includes(reason)
    ? (reason as EnergyReason)
    : "unavailable";

  // LE `show` DU SERVEUR EST LA DÉCISION, et il doit être D'ACCORD avec son
  // propre motif. Un `show: true` accompagné d'un motif de refus est une
  // réponse incohérente — on la traite comme une panne plutôt que comme une
  // autorisation, parce que c'est la seule des deux lectures qui ne blesse
  // personne si elle est fausse.
  if (row.show !== true || known !== "open") {
    return {
      show: false,
      reason: known === "open" ? "unavailable" : known,
      switchOfferable: row.switch_offerable === true && known === "student_off",
      // ⟳ LOT F — les boîtes des bouches à objectif voyagent sur une fermeture
      // PAR DÉFAUT du lecteur, et sur elle seule. Le serveur ne les envoie que
      // dans ce cas; on ne fait ici que les lire.
      boxes: known === "student_off" && Array.isArray(row.plans)
        ? row.plans.map((entry) => {
          const p = (entry ?? {}) as Record<string, unknown>;
          return {
            planId: String(p.plan_id ?? ""),
            boxes: readBoxes(p.boxes),
            // ⟳ 2026-09-24 — les totaux du jour de ces mêmes bouches: une somme
            // des boîtes ci-dessus, faite par le serveur, jamais ici.
            memberDays: readMemberDays(p.member_days),
          };
        }).filter((p) => p.planId !== "" && p.boxes.length > 0)
        : [],
    };
  }

  return {
    show: true,
    reason: "open",
    switchOfferable: true,
    basis: String(row.basis ?? PLAN_ENERGY_BASIS),
    targetOfferable: row.target_offerable === true,
    // ⚠️ LA FOURCHETTE EST TOUT-OU-RIEN, et son absence n'est pas un zéro:
    // `readTarget` porte les deux règles, et son banc porte la valeur rendue.
    target: readTarget(row.target ?? null),
    plans: (Array.isArray(row.plans) ? row.plans : []).map((entry) => {
      const p = (entry ?? {}) as Record<string, unknown>;
      const computable = p.computable === true;
      return {
        planId: String(p.plan_id ?? ""),
        computable,
        dishes: computable && Array.isArray(p.dishes) ? p.dishes.map(readDish) : [],
        // ⟳ LOT F — INDÉPENDANT DE `computable`: une boîte à un nom a son kcal
        // par ses propres grammes.
        boxes: readBoxes(p.boxes),
        // ⟳ 2026-09-24 — le total du jour de chaque personne dont les boîtes
        // sortent. Indépendant de `computable`, comme les boîtes qu'il somme.
        memberDays: readMemberDays(p.member_days),
        days: computable && Array.isArray(p.days) ? p.days.map(readDay) : [],
      };
    }).filter((p) => p.planId !== ""),
  };
}

/**
 * L'INTERRUPTEUR — porte ④, et la seule que l'élève tient.
 *
 * `update` puis `select()`: un update qui ne matche aucune ligne répond 204
 * sans erreur, et l'écran dirait « c'est éteint » sur une bascule partie nulle
 * part. Même arbitrage que `saveBasic` sur l'écran du plan.
 */
export async function setEnergyDisplay(enabled: boolean): Promise<void> {
  await writeSwitch({ energy_display_enabled: enabled });
}

/**
 * FF-059 LOT 3 — LA PORTE ⑤, et elle est SÉPARÉE de la ④ exprès.
 *
 * Accepter de voir ce que pèse son dîner n'est pas accepter qu'on estime ce que
 * son corps devrait manger. Un interrupteur unique ferait de la seconde le prix
 * de la première — sur exactement la distinction (un fait sur la nourriture
 * contre un jugement sur la personne) que tout ce chantier existe pour tenir.
 */
export async function setEnergyTarget(enabled: boolean): Promise<void> {
  await writeSwitch({ energy_target_enabled: enabled });
}

async function writeSwitch(patch: Record<string, boolean>): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error("not_signed_in");
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", uid)
    .select("id");
  if (error) throw new Error(`[keel/mealEnergy] switch failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("[keel/mealEnergy] switch saved nothing");
  }
}
