import { supabase } from "../../lib/supabase";
import { EATING_OCCASIONS, type EatingOccasion } from "./mealGeneration";

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

/**
 * ② LE VOCABULAIRE DU SUJET, FERMÉ, et aligné mot pour mot sur `DayEnergy.subject`
 * (`_shared/keel/plan_energy.ts`). Un jeton inconnu retombe sur `the_day` —
 * c'est-à-dire sur le comportement d'hier, jamais sur une phrase inventée.
 */
export const DAY_ENERGY_SUBJECTS = ["the_day", "what_the_plan_made"] as const;
export type DayEnergySubject = (typeof DAY_ENERGY_SUBJECTS)[number];

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
   * CE QUI S'AJOUTE À L'ASSIETTE DU LECTEUR ce jour-là, dans un foyer.
   *
   * `0` sur un plan personnel, et sur la bouche dont le besoin EST le tronc.
   * Non nul quand les portions divergent — c'est la bifurcation par objectif,
   * en nombre. Il est DÉJÀ compris dans `kcal`, et il est rendu à part pour que
   * l'écran puisse dire « le plat, plus ce qui va dans ton assiette » : deux
   * personnes autour de la même casserole doivent lire le même chiffre pour le
   * même plat.
   *
   * ⚠️ C'est l'add-on DU LECTEUR. Ceux des autres bouches ne franchissent
   * jamais le fil, pas même agrégés — ils sont dimensionnés sur un corps et un
   * objectif, et « ce qui touche le corps est à soi ».
   */
  addonKcal: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ② — DE QUOI CE NOMBRE PARLE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   *   `the_day`            — la journée entière. Le cas nominal.
   *   `what_the_plan_made` — ce que le plan a composé, et rien d'autre.
   *
   * ⛔ POURQUOI CE CHAMP EXISTE. Si un repas sur trois est pris dehors, « ta
   * journée : 1 400 · ta fourchette : 1 900–2 200 » est FAUX, et faux dans le
   * sens qui décourage: la personne lit un déficit alors qu'elle a peut-être
   * mangé un burger. Le nombre ne change pas de VALEUR, il change de SUJET.
   *
   * ⚠️ IL N'EST PAS DÉRIVÉ ICI. Le serveur le nomme (`plan_energy.ts`), et deux
   * surfaces qui calculeraient `mealsOut > 0` chacune de leur côté finiraient
   * par ne plus dire la même chose du même jour.
   */
  subject: DayEnergySubject;
  /**
   * COMBIEN DE REPAS DE CE JOUR ÉCHAPPENT AU PLAN. `0` quand le plan a composé
   * toute la journée.
   *
   * ⚠️ IL PART AVEC `subject`, JAMAIS SEUL — voir `readDay`: un sujet sans son
   * compte ne se rend pas, et un compte sans son sujet non plus.
   *
   * ⚠️ CE N'EST PAS LA MÊME INCOMPLÉTUDE QUE `dishesCounted`/`dishesTotal`.
   * Celle-là dit « je n'ai pas su lire tous les plats » et se répare par le
   * référentiel; celle-ci dit « il manquait des plats à lire » et ne se répare
   * pas — c'est la vie de quelqu'un. Un écran qui n'en verrait qu'une nommerait
   * la mauvaise.
   */
  mealsOut: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ① — LE CONSEIL DU MIDI, POUR CE JOUR-LÀ. « Au déjeuner, vise autour de 700. »
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Décision produit §2.2 ⓑ: quand quelqu'un mange dehors, le plan ne compose
   * pas ce repas **mais en fait la place**. Le repas sort du plan, il ne sort
   * pas du calcul.
   *
   * `[]` est le cas nominal, et il couvre trois situations qui ne se
   * distinguent pas ici, parce qu'elles ne se distinguent pas à l'écran: rien
   * n'est pris dehors, une porte est fermée, ou le corps manque. Le serveur ne
   * dit JAMAIS pourquoi il se tait sur ce champ — un motif de refus voyageant à
   * côté d'un chiffre absent serait encore parler du sujet à quelqu'un qu'une
   * porte protège.
   *
   * ⛔ UNE CONSIGNE, JAMAIS UN SOLDE. « Il te reste 680 kcal » est LA phrase
   * d'un tracker. Ce chiffre-ci ne soustrait rien, ne connaît pas ce qui a été
   * mangé, et se calcule sur la journée DÉCLARÉE — pas sur ce que le plan a
   * composé. Aucun reste, aucun verdict, aucune couleur, aucune barre.
   */
  eatingOutAdvice: EatingOutAdviceView[];
}

/**
 * UNE CASE « DEHORS » ET SON ORDRE DE GRANDEUR.
 *
 * Le `slot` est un jeton du vocabulaire FERMÉ des six moments; un jeton inconnu
 * fait tomber l'entrée entière, jamais un libellé brut sous les yeux de
 * quelqu'un.
 */
export interface EatingOutAdviceView {
  slot: EatingOccasion;
  /** kcal, arrondis aux 50 par le serveur. Toujours > 0 — jamais un `0`, qui
   * se lirait « ne mange rien », le sens exactement inverse. */
  kcal: number;
}

/** Ce qu'un plan rend, quand les quatre portes sont ouvertes. */
export interface PlanEnergyView {
  planId: string;
  /**
   * `false` = ce plan n'est pas calculable EN TANT QUE PLAN, indépendamment de
   * la personne. Aujourd'hui un seul cas: `household_portions_not_numeric` —
   * dans un foyer à plusieurs bouches, la part de chacun est une PHRASE
   * (« generous vegetables, full protein share »), pas un nombre. Diviser par
   * le nombre de convives rendrait l'assiette moyenne, fausse pour tout le
   * monde, et effacerait la bifurcation par objectif au lieu de la montrer.
   */
  computable: boolean;
  abstention: string | null;
  dishes: DishEnergyView[];
  days: DayEnergyView[];
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
  };

/** Un refus, sans un chiffre. La forme de repli de TOUTE erreur de ce module. */
function closed(reason: Exclude<EnergyReason, "open">): EnergyReading {
  return { show: false, reason, switchOfferable: false };
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
  const dishesTotal = Number(d.dishes_total) || 0;
  // ── ② · LE SUJET EST TOUT-OU-RIEN, comme la fourchette de `readTarget` ────
  //
  // ⚠️ LE PIÈGE QU'ON NE REJOUE PAS, ET IL A DÉJÀ COÛTÉ UNE FOIS. Le 2026-08-18,
  // le serveur s'était tu (`low: null, high: null, gap: "no_weight"`) et l'écran
  // a rendu « Autour de 0–0 par jour » — parce que `Number(null)` vaut `0`, que
  // zéro est un nombre fini, et qu'un nombre fini a l'air d'un fait. La phrase
  // fabriquée EFFAÇAIT celle qui invitait à ajouter une pesée.
  //
  // La forme dégradée qui menaçait ICI est la symétrique: un `subject` présent
  // sans son `meals_out` rendrait « ce total porte sur les 2 repas que j'ai
  // composés : 0 repas était pris dehors » — une phrase qui restreint le sujet
  // du nombre en avouant qu'il n'y a aucune raison de le restreindre. Elle
  // remplacerait « sur la journée », qui, lui, était vrai.
  //
  // D'où les TROIS conditions, toutes requises: le jeton doit être DANS le
  // vocabulaire fermé, `meals_out` doit être un vrai chiffre STRICTEMENT
  // positif (`finiteEnergyNumber`, pas `Number()`), et le plan doit avoir
  // composé au moins un repas ce jour-là — sinon « les 0 repas que j'ai
  // composés » n'est pas un sujet, c'est une journée vide, et `day_unreadable`
  // le dit déjà mieux.
  //
  // Le repli est `the_day` + `0`, c'est-à-dire EXACTEMENT le comportement
  // d'avant ce champ: un plan composé avant que la trace existe ne dit rien de
  // neuf plutôt que de dire quelque chose de faux.
  const mealsOut = finiteEnergyNumber(d.meals_out);
  const declared = String(d.subject ?? "");
  const restricted = declared === "what_the_plan_made" &&
    mealsOut !== null && mealsOut > 0 && dishesTotal > 0;
  return {
    day: d.day === null || d.day === undefined ? null : String(d.day),
    kcal: finiteEnergyNumber(d.kcal),
    basis: String(d.basis ?? ""),
    complete: d.complete === true,
    dishesCounted: Number(d.dishes_counted) || 0,
    dishesTotal,
    addonKcal: Number(d.addon_kcal) || 0,
    // ① — REMPLI PAR `attachEatingOutAdvice`, jamais par ce lecteur-ci: le
    // serveur rend les conseils À CÔTÉ des jours (un jour peut n'en avoir
    // aucun, et un conseil peut porter sur un jour que le plan n'a pas
    // composé). `[]` est donc l'état de départ, pas une ignorance.
    eatingOutAdvice: [],
    subject: restricted ? "what_the_plan_made" : "the_day",
    // ⚠️ REMIS À ZÉRO AVEC LE SUJET. Les deux champs partent ensemble ou pas du
    // tout: un `mealsOut` non nul sous `subject: "the_day"` inviterait le
    // prochain rendu à composer sa propre phrase à partir de la moitié qui
    // reste, et à refaire le calcul que ce module vient de refuser.
    mealsOut: restricted ? Math.round(mealsOut as number) : 0,
  };
}

/**
 * ② LE SUJET DU NOMBRE, EN TOUTES LETTRES, DANS LES DEUX LANGUES.
 *
 * ── CE QUE ÇA CORRIGE, MOT POUR MOT ───────────────────────────────────────
 * « Ta journée : 1 400 · ta fourchette : 1 900–2 200 » est FAUX dès qu'un repas
 * sur trois est pris dehors, et faux dans le sens qui décourage: la personne
 * lit un déficit alors qu'elle a peut-être mangé un burger. Le nombre garde sa
 * VALEUR — il est exact sur ce qu'il couvre — et change de SUJET: il ne parle
 * plus de la journée mais de ce que le plan a produit.
 *
 * ── POURQUOI UNE INCISE, ET PAS UNE SECONDE LIGNE ─────────────────────────
 * Parce que c'est le sujet DE CE NOMBRE-LÀ, et qu'un sujet se lit dans la même
 * respiration que son verbe. Une phrase posée en dessous se lirait comme un
 * commentaire — quelque chose qu'on ajoute au total — alors qu'elle dit de quoi
 * le total parle. Et pratiquement: `DayEnergyLine` est rendue en suffixe d'un
 * titre de jour (`PlanDayBlock`) et à côté d'un libellé de section
 * (`TodayPage`); une seconde ligne y changerait la hauteur de deux écrans dont
 * ce lot ne touche pas les fichiers.
 *
 * ── POURQUOI ELLE VIT ICI ET PAS DANS LE PACK i18n ────────────────────────
 * Même raison que `PACE_WARNING_LABELS` (`weight_pace.ts`) et
 * `EATING_OUT_SLOT_LABELS` (`household_portions.ts`): le nombre et le mot qui
 * l'encadre sont une seule décision. La règle tout-ou-rien qui autorise cette
 * incise vit dans `readDay`, juste au-dessus; les séparer la laisserait se dire
 * sur des chiffres que le parseur venait de refuser, ou survivre à une règle
 * qui a bougé.
 *
 * ⚠️ ELLE DIT CE QUE LE PLAN A FAIT, PAS CE QUE LA PERSONNE A MANGÉ. « Il te
 * manque un repas », « tu n'as pas atteint ta journée » seraient un solde et un
 * verdict, et ce chemin n'en porte aucun: le produit ne sait pas ce qui a été
 * mangé dehors, et il ne le saura jamais — aucune de ses entrées ne porte un
 * consommé.
 *
 * ⚠️ LE SINGULIER EST ÉCRIT, PAS INTERPOLÉ. « les 1 repas que j'ai composés »
 * est une faute dans une langue sur deux, et invisible à qui teste dans
 * l'autre — cicatrice « garde testée dans une seule langue ».
 */
/**
 * ① — LES CONSEILS DU MIDI, RANGÉS SUR LEURS JOURS.
 *
 * ── POURQUOI UNE FONCTION SÉPARÉE, ET PAS UNE LIGNE DANS `readDay` ────────
 * Parce que les deux tableaux du serveur ne sont pas alignés: un jour peut
 * n'avoir aucun conseil, et un conseil peut porter sur un jour dont le plan n'a
 * composé aucun plat. Les lire ensemble par index serait la façon la plus
 * discrète de servir à quelqu'un l'ordre de grandeur d'un autre midi.
 *
 * ⚠️ TOUT-OU-RIEN PAR ENTRÉE, comme partout dans ce module. Une entrée dont le
 * jour est vide, dont le moment n'est PAS dans le vocabulaire fermé, ou dont le
 * chiffre n'est pas un vrai nombre strictement positif, TOMBE — elle n'est
 * jamais réparée. `finiteEnergyNumber` et pas `Number()`: `Number(null)` vaut
 * `0`, et « au déjeuner, vise autour de 0 » se lirait « ne mange rien », le
 * sens exactement inverse.
 *
 * Un jeton de moment inconnu ferait sinon `EATING_OUT_SLOT_LABELS[slot]` =
 * `undefined`, et la phrase sortirait avec « undefined » dedans.
 */
export function attachEatingOutAdvice(
  days: readonly DayEnergyView[],
  raw: unknown,
): DayEnergyView[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...days];
  const byDay = new Map<string, EatingOutAdviceView[]>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry as Record<string, unknown>;
    const day = String(a.day ?? "").trim();
    const slot = String(a.slot ?? "").trim();
    const kcal = finiteEnergyNumber(a.kcal);
    if (!day) continue;
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    if (kcal === null || !(kcal > 0)) continue;
    const list = byDay.get(day) ?? [];
    list.push({ slot: slot as EatingOccasion, kcal });
    byDay.set(day, list);
  }
  return days.map((d) => ({
    ...d,
    eatingOutAdvice: d.day === null ? [] : byDay.get(d.day) ?? [],
  }));
}

export function dayEnergySubjectClause(
  locale: "en" | "fr",
  args: { dishes: number; mealsOut: number },
): string {
  const { dishes, mealsOut } = args;
  if (locale === "fr") {
    const made = dishes === 1
      ? "le seul repas que j'ai composé"
      : `les ${dishes} repas que j'ai composés`;
    const out = mealsOut === 1 ? "1 repas dehors" : `${mealsOut} repas dehors`;
    return `sur ${made} (${out})`;
  }
  const made = dishes === 1
    ? "the one meal I composed"
    : `the ${dishes} meals I composed`;
  const out = mealsOut === 1 ? "1 meal out" : `${mealsOut} meals out`;
  return `across ${made} (${out})`;
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
  //     avec « undefined » dedans, comme `EATING_OUT_SLOT_LABELS` l'a déjà fait;
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
    declaredBasis === "weight_range_with_direction" &&
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
): Promise<EnergyReading> {
  const ids = [...new Set(planIds.map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return closed("no_plan");

  const { data, error } = await supabase.functions.invoke("meal-energy-v1", {
    body: { plan_ids: ids },
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
        abstention: computable ? null : String(p.abstention ?? "") || null,
        dishes: computable && Array.isArray(p.dishes) ? p.dishes.map(readDish) : [],
        // ① LES CONSEILS SE RANGENT SUR LEURS JOURS ICI, et jamais sur un plan
        // qu'on vient de déclarer incalculable: un ordre de grandeur posé sur
        // une journée dont on refuse de dire le total serait le seul chiffre de
        // l'écran, et il aurait l'air de la remplacer.
        days: computable && Array.isArray(p.days)
          ? attachEatingOutAdvice(p.days.map(readDay), p.eating_out_advice)
          : [],
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
