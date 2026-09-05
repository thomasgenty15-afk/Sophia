/**
 * L'HEURE QU'IL EST QUAND ON DEMANDE UN PLAN. Module PUR.
 *
 * ── LE TROU QUE CE MODULE FERME ────────────────────────────────────────────
 * Le backend ne connaissait QUE la date. Quelqu'un qui compose à 20 h un jeudi
 * recevait un jeudi complet: un petit-déjeuner déjà pris, un déjeuner déjà pris,
 * une liste de courses à faire dans un magasin fermé. Trois lignes de plan
 * périmées à la livraison, et l'élève apprend que le plan se lit de travers.
 *
 * ── TROIS COUPURES, TROIS CONSTANTES NOMMÉES ──────────────────────────────
 * Elles sont des choix de produit, pas des faits: elles se changent en UNE
 * ligne, et le nom dit lequel on change. Une coupure enfouie dans une condition
 * est une décision qu'on ne peut plus discuter.
 *
 *   · `SHOPPING_CUTOFF_HOUR` .. après elle, on ne fait plus les courses NI la
 *                               cuisine du jour.
 *   · `SLOT_PASSED_HOUR` ...... après elle, ce moment-là de la journée
 *                               d'aujourd'hui n'est plus une question.
 *
 * ── `hourNow` EST REQUIS PARTOUT, ET NULLABLE ─────────────────────────────
 * Sept paramètres de garde optionnels ont déjà été des gardes désarmées dans ce
 * dépôt; `safetyBand` est la cicatrice fondatrice. Propriété REQUISE + valeur
 * NULLABLE: l'absence doit s'écrire. Et `null` ne veut pas dire « minuit »: il
 * veut dire « je n'ai pas su lire l'horloge », et chaque règle ci-dessous dit
 * NOMMÉMENT ce qu'elle fait de cette ignorance — toutes rendent le produit
 * D'HIER, jamais un raccourci deviné.
 *
 * ── ⚠️ RIEN ICI N'EST UN REFUS SERVEUR ────────────────────────────────────
 * `proposedWindowStart` est une PROPOSITION D'ÉCRAN. L'humain garde le droit de
 * demander aujourd'hui à 23 h, et le serveur doit le lui écrire. Une coupure
 * d'heure qui devient un 400 est une règle de confort transformée en mur.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { addDays } from "./local_date.ts";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
} from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LES COUPURES
// ---------------------------------------------------------------------------

/**
 * APRÈS 18 H, ON NE FAIT PLUS LES COURSES DU JOUR — ni la cuisine qui en
 * dépend.
 *
 * Décidée par l'utilisateur, mot pour mot: « si une personne fait son plan à
 * 20h un jeudi ça sert à rien de lui mettre le jeudi parce qu'il faut faire les
 * courses ». Le nombre est un choix de vie, pas une mesure: il se change ici.
 */
export const SHOPPING_CUTOFF_HOUR = 18;

/**
 * L'HEURE APRÈS LAQUELLE UN MOMENT DE LA JOURNÉE EST PASSÉ.
 *
 * ⚠️ CE SONT DES REPLIS. Une ligne `eating_rhythm` qui porte encore une heure
 * (`at`, écrite jusqu'au 2026-08-07) l'emporte sur ces valeurs: si quelqu'un a
 * déclaré dîner à 22 h, son dîner n'est pas passé à 21 h. Voir
 * `rhythmClockFrom`.
 *
 * ⚠️ LES TROIS MOMENTS SANS COUPURE VALENT `null`, ET C'EST DÉLIBÉRÉ.
 * `snack_am`, `snack_pm` et `before_bed` n'ont pas d'heure de référence dans ce
 * dépôt, et en inventer une ferait tomber un grignotage sur une valeur que
 * personne n'a choisie. `null` ⇒ le moment ne tombe JAMAIS par l'horloge; il ne
 * tombe que par une absence déclarée.
 */
export const SLOT_PASSED_HOUR: Readonly<Record<EatingOccasion, number | null>> =
  {
    breakfast: 10,
    snack_am: null,
    lunch: 14,
    snack_pm: null,
    dinner: 21,
    before_bed: null,
  };

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'HEURE À LAQUELLE ON PREND CE MOMENT-LÀ — 2026-09-04.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE N'EST PAS `SLOT_PASSED_HOUR`, ET LES DEUX DOIVENT COEXISTER. Celle-là
 * répond « ce moment est-il DERRIÈRE nous ? » et elle a trois lecteurs qui n'ont
 * rien à voir avec un plan (`photo_slot_inference`, `slot_meal_ask`,
 * `meal-photo-upload-v1`): un dîner reste photographiable à 22 h. Celle-ci
 * répond « à quelle heure ce repas se mange-t-il ? », et elle sert à savoir s'il
 * reste le temps d'ALLER ACHETER puis de CUISINER avant.
 *
 * Fondre les deux ferait déplacer l'inférence de créneau d'une photo pour une
 * raison de courses.
 *
 * ⚠️ LES GOÛTERS ONT UNE HEURE ICI, LÀ OÙ ILS N'EN ONT PAS LÀ-BAS, et ce n'est
 * pas une contradiction. `SLOT_PASSED_HOUR` refuse d'inventer l'heure à laquelle
 * un grignotage « tombe » — un goûter pris à 17 h 30 n'est pas en retard. Mais
 * un goûter se mange bien vers 16 h, et c'est tout ce dont on a besoin pour dire
 * s'il reste le temps de faire les courses avant.
 *
 * ⚠️ CE SONT DES REPLIS. Une ligne `eating_rhythm` qui porte `at` l'emporte,
 * exactement comme pour sa voisine.
 */
export const SLOT_USUAL_HOUR: Readonly<Record<EatingOccasion, number>> = {
  breakfast: 8,
  snack_am: 10,
  lunch: 12,
  snack_pm: 16,
  dinner: 19,
  before_bed: 22,
};

/**
 * COMBIEN DE TEMPS IL FAUT ENTRE « JE COMPOSE » ET « JE MANGE ».
 *
 * Décidé par l'utilisateur, mot pour mot: « si il est 12h, alors ne pas inclure
 * le repas de 12h parce qu'il faut faire les courses entre temps ». Il faut
 * sortir, acheter, rentrer, cuisiner.
 *
 * ⚠️ DEUX HEURES EST UN CHOIX DE VIE, PAS UNE MESURE, et il se change ICI. Sa
 * conséquence la plus visible est assumée: à 11 h, un déjeuner de midi tombe
 * (12 < 11 + 2). La direction inverse — servir un repas qu'on n'a pas le temps
 * d'acheter — est celle que ce lot existe pour fermer.
 */
export const SHOPPING_AND_COOKING_LEAD_HOURS = 2;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'ON NE PEUT PLUS SERVIR AUJOURD'HUI — et pour LAQUELLE des deux raisons.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE TROU QUE ÇA FERME, MESURÉ EN REJOUANT LES FONCTIONS PURES ──────────
 *
 *     12 h  le déjeuner est SERVI     (il ne « passe » qu'à 14 h)
 *     16 h  le goûter est SERVI       (les goûters ne tombent jamais par l'horloge)
 *     19 h  le dîner est SERVI        (il ne passe qu'à 21 h)
 *           ⛔ alors que `SHOPPING_CUTOFF_HOUR` vaut 18: le produit SAIT que les
 *           courses sont fermées, et sert quand même un dîner du jour.
 *
 * ── DEUX LISTES, PAS UNE, ET C'EST TOUT L'INTÉRÊT ─────────────────────────
 * `passed` et `heldForShopping` ne se réparent pas par le même geste et ne se
 * disent pas avec les mêmes mots: « la journée est déjà entamée » n'est pas
 * « il faut le temps de faire les courses ». Fondre les deux rendrait la phrase
 * fausse dans un cas sur deux — et une phrase fausse est pire qu'un silence.
 *
 * ⚠️ ELLES PEUVENT SE RECOUVRIR, et `heldForShopping` exclut alors ce que
 * `passed` porte déjà: à 12 h le petit-déjeuner est PASSÉ (10 h) et le déjeuner
 * est RETENU. Une bouche ne peut pas perdre son repas deux fois.
 *
 * ⛔ PASSÉ LA COUPURE DES COURSES, TOUT CE QUI RESTE EST RETENU. Entre 18 h et
 * 21 h, le produit servait un dîner qu'aucun magasin ne pouvait fournir. La
 * coupure vit dans `SHOPPING_CUTOFF_HOUR`, jamais recopiée.
 *
 * `hourNow === null` ⇒ les deux listes sont vides: le produit d'hier, nommé.
 *
 * PURE: no I/O, no clock.
 */
export function slotsUnservableToday(input: {
  hourNow: number | null;
  rhythm: readonly { slot: EatingOccasion }[];
  declaredHours: readonly RhythmHour[];
}): { passed: EatingOccasion[]; heldForShopping: EatingOccasion[] } {
  assertHourNow(input, "slotsUnservableToday");
  // ⛔ UNE SEULE LECTURE DE LA RÈGLE D'AVANT: on APPELLE `slotsPassedToday`, on
  // ne recopie pas son corps. Deux calculs de « ce moment est passé »
  // divergeraient, et c'est la forme de défaut que ce dépôt paie en boucle.
  const passed = slotsPassedToday(input);
  if (input.hourNow === null) return { passed, heldForShopping: [] };

  const declared = new Map(
    input.declaredHours.filter((d) => d.hour !== null).map((d) => [d.slot, d.hour!]),
  );
  const inRhythm = new Set(input.rhythm.map((r) => r.slot));
  const already = new Set(passed);
  const cutoffReached = !cookingAskedToday({ hourNow: input.hourNow });
  const earliest = input.hourNow + SHOPPING_AND_COOKING_LEAD_HOURS;

  const held = EATING_OCCASIONS.filter((slot) => {
    if (!inRhythm.has(slot)) return false;
    if (already.has(slot)) return false;
    // Après la coupure, plus rien n'est achetable aujourd'hui: le moment le plus
    // tardif du monde ne se cuisine pas avec un magasin fermé.
    if (cutoffReached) return true;
    // ⚠️ `<` ET PAS `<=`: un dîner de 19 h reste servi à 17 h (17 + 2 = 19).
    // La borne est INCLUSIVE côté service — on ne retire pas un repas qu'on a
    // exactement le temps de préparer.
    return (declared.get(slot) ?? SLOT_USUAL_HOUR[slot]) < earliest;
  });
  return { passed, heldForShopping: held };
}

// ---------------------------------------------------------------------------
// L'HORLOGE DÉCLARÉE PAR L'ÉLÈVE
// ---------------------------------------------------------------------------

/** Un moment de la journée et l'heure à laquelle l'élève dit le prendre. */
export interface RhythmHour {
  slot: EatingOccasion;
  /** Heure pleine locale (`0`..`23`). `null` = il ne l'a pas dite. */
  hour: number | null;
}

/**
 * L'HEURE DÉCLARÉE, LUE DEPUIS `practical_constraints.eating_rhythm[].at`.
 *
 * ⚠️ CE N'EST PAS UNE RÉSURRECTION DE `at` COMME CONTRAINTE DE COMPOSITION.
 * `parseEatingRhythm` l'ignore, et il a raison de l'ignorer: « 20:00 » ne dit
 * pas si le dîner est GROS, et en déduire une taille serait deviner. Ici on ne
 * déduit rien — on lit une heure pour répondre à une question d'heure: « ce
 * dîner-là est-il déjà passé ? ». C'est le seul usage pour lequel ce champ a
 * jamais été juste.
 *
 * Les lignes qui ne portent pas `at` rendent `hour: null`, et l'appelant
 * retombe sur `SLOT_PASSED_HOUR`. Un `at` illisible rend `null` aussi: une
 * heure devinée déplacerait un repas sur la foi d'une faute de frappe.
 */
export function rhythmClockFrom(raw: unknown): RhythmHour[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, number | null>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    const at = String(e.at ?? "").trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(at);
    const hour = m ? Number(m[1]) : NaN;
    const minute = m ? Number(m[2]) : NaN;
    const usable = Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
      Number.isInteger(minute) && minute >= 0 && minute <= 59;
    bySlot.set(slot as EatingOccasion, usable ? hour : null);
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    hour: bySlot.get(s) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// LES TROIS RÈGLES
// ---------------------------------------------------------------------------

/** Pourquoi la fenêtre proposée ne démarre pas aujourd'hui. Nommé, pas booléen. */
export type WindowShiftReason = "shopping_cutoff";

export interface ProposedWindowStart {
  /** La date proposée à l'écran. */
  startsOn: string;
  /** `null` = elle démarre aujourd'hui, et il n'y a rien à expliquer. */
  shifted: WindowShiftReason | null;
}

/**
 * LA FENÊTRE QU'ON PROPOSE — pas celle qu'on impose.
 *
 * Passé `SHOPPING_CUTOFF_HOUR`, un plan qui démarre aujourd'hui demande des
 * courses ce soir. On propose donc DEMAIN.
 *
 * ⚠️ APPELÉE POUR REMPLIR UN CHAMP, JAMAIS POUR REFUSER UNE REQUÊTE. Le
 * serveur qui recevrait `starts_on = aujourd'hui` à 22 h l'accepte: quelqu'un
 * qui a déjà ses courses dans le coffre a raison contre cette règle.
 *
 * `hourNow === null` ⇒ AUJOURD'HUI. On ne déplace pas la semaine de quelqu'un
 * sur une horloge qu'on n'a pas su lire.
 *
 * @param todayLocalDate `YYYY-MM-DD` dans le fuseau de l'élève.
 * @param hourNow REQUIS. `null` = l'horloge n'a pas été résolue.
 */
export function proposedWindowStart(input: {
  todayLocalDate: string;
  hourNow: number | null;
}): ProposedWindowStart {
  assertHourNow(input, "proposedWindowStart");
  const today = String(input.todayLocalDate ?? "").trim();
  if (!today) {
    throw new Error("[keel/plan_hours] todayLocalDate est REQUIS");
  }
  if (input.hourNow === null) return { startsOn: today, shifted: null };
  if (input.hourNow >= SHOPPING_CUTOFF_HOUR) {
    // `addDays` et pas une arithmétique locale: il ancre à midi UTC, seule
    // façon de ne pas rendre la veille une nuit de changement d'heure.
    return { startsOn: addDays(today, 1), shifted: "shopping_cutoff" };
  }
  return { startsOn: today, shifted: null };
}

/**
 * LES MOMENTS D'AUJOURD'HUI QUI SONT DÉJÀ PASSÉS.
 *
 * ⚠️ POUR LE PREMIER JOUR DE LA FENÊTRE, ET SEULEMENT S'IL EST AUJOURD'HUI.
 * L'appelant en est responsable: cette fonction ne connaît pas la fenêtre. Une
 * fenêtre qui démarre demain n'a aucun moment passé, et appliquer la coupure à
 * chaque jour effacerait tous les petits-déjeuners de la semaine.
 *
 * `hourNow === null` ⇒ `[]`. Ne rien retirer est le produit d'hier; retirer sur
 * une horloge inconnue supprimerait des repas que personne n'a demandé de
 * supprimer.
 *
 * L'ordre de sortie est celui de la JOURNÉE (`EATING_OCCASIONS`), jamais celui
 * du tableau reçu: la liste se lit à voix haute dans une phrase.
 */
export function slotsPassedToday(input: {
  hourNow: number | null;
  /** Le rythme de l'élève, dans l'ordre de la journée. `[]` = rien de déclaré. */
  rhythm: readonly { slot: EatingOccasion }[];
  /** Les heures qu'il a déclarées. `[]` = aucune; les replis s'appliquent. */
  declaredHours: readonly RhythmHour[];
}): EatingOccasion[] {
  assertHourNow(input, "slotsPassedToday");
  if (!Array.isArray(input.rhythm)) {
    throw new Error("[keel/plan_hours] rhythm est REQUIS — `[]` dit « rien de déclaré »");
  }
  if (!Array.isArray(input.declaredHours)) {
    throw new Error(
      "[keel/plan_hours] declaredHours est REQUIS — `[]` dit « aucune heure déclarée »",
    );
  }
  const now = input.hourNow;
  if (now === null) return [];
  const declared = new Map(
    input.declaredHours.filter((d) => d.hour !== null).map((d) => [d.slot, d.hour!]),
  );
  const inRhythm = new Set(input.rhythm.map((r) => r.slot));
  return EATING_OCCASIONS.filter((slot) => {
    if (!inRhythm.has(slot)) return false;
    const cutoff = declared.get(slot) ?? SLOT_PASSED_HOUR[slot];
    // `null` ⇒ ce moment ne tombe jamais par l'horloge. Voir SLOT_PASSED_HOUR.
    if (cutoff === null) return false;
    return now >= cutoff;
  });
}

/**
 * PEUT-ON ENCORE DEMANDER UNE SESSION DE CUISINE AUJOURD'HUI ?
 *
 * Non passé `SHOPPING_CUTOFF_HOUR`: la session que le moteur ajoute d'office
 * (branche `tooLate` de `buildMealPrompt`) suppose qu'on peut acheter puis
 * cuisiner. À 21 h, ni l'un ni l'autre.
 *
 * `hourNow === null` ⇒ `true`, le comportement d'hier.
 */
export function cookingAskedToday(input: { hourNow: number | null }): boolean {
  assertHourNow(input, "cookingAskedToday");
  if (input.hourNow === null) return true;
  return input.hourNow < SHOPPING_CUTOFF_HOUR;
}

/**
 * LE PREMIER JOUR DE LA FENÊTRE EST-IL ENCORE CUISINABLE ?
 *
 * C'est la seule forme dont `buildMealPrompt` a besoin, et elle vit ICI pour
 * que la coupure des 18 h n'ait qu'une définition. Les deux lanes de génération
 * l'appellent; recopier `hourNow < 18` dans chacune ferait deux règles qui
 * divergeraient au premier ajustement — et celle qu'on regarde le moins
 * garderait l'ancienne valeur.
 *
 * Une fenêtre qui démarre APRÈS aujourd'hui est toujours cuisinable: l'heure
 * qu'il est ne dit rien de demain matin.
 */
export function firstWindowDayIsCookable(input: {
  windowStartsOn: string;
  todayLocalDate: string;
  hourNow: number | null;
}): boolean {
  assertHourNow(input, "firstWindowDayIsCookable");
  const start = String(input.windowStartsOn ?? "").trim();
  const today = String(input.todayLocalDate ?? "").trim();
  if (!start || !today) {
    throw new Error(
      "[keel/plan_hours] firstWindowDayIsCookable: windowStartsOn et todayLocalDate sont REQUIS",
    );
  }
  if (start !== today) return true;
  return cookingAskedToday({ hourNow: input.hourNow });
}

// ---------------------------------------------------------------------------
// LA VEILLE — DÉRIVÉE, PLUS JAMAIS COCHÉE (chantier-0903/CUISINE, A1, P1)
// ---------------------------------------------------------------------------

/**
 * QUAND ON CUISINE PAR RAPPORT AU PREMIER REPAS.
 *
 *   · `day_before`   — courses et cuisson LA VEILLE du premier jour mangé;
 *   · `same_morning` — courses et cuisson DÈS LE MATIN du premier jour, pour
 *                      être prêt à midi. C'est l'avertissement, et il se rend.
 */
export type LeadTiming = "day_before" | "same_morning";

/**
 * POURQUOI ce timing-là. Chaque valeur est une phrase de `plan_rationale`.
 *
 *   · `day_before`          — le plan commence dans deux jours ou plus: la
 *                             veille est un jour plein, l'heure n'y change rien;
 *   · `before_cutoff_today` — le plan commence DEMAIN et il n'est pas encore
 *                             `SHOPPING_CUTOFF_HOUR`: la veille, c'est ce soir;
 *   · `after_cutoff`        — le plan commence demain, il est trop tard ce
 *                             soir pour les courses: dès le matin;
 *   · `starts_today`        — le plan commence aujourd'hui: la veille est hier;
 *   · `clock_unreadable`    — le plan commence demain et l'horloge n'a pas été
 *                             lue: on ne DEVINE pas qu'il est avant 18 h.
 */
export type LeadDayReason =
  | "day_before"
  | "before_cutoff_today"
  | "after_cutoff"
  | "starts_today"
  | "clock_unreadable";

export interface LeadDayVerdict {
  /** La date de la veille (`YYYY-MM-DD`), ou `null` = pas de veille. */
  leadDay: string | null;
  timing: LeadTiming;
  reason: LeadDayReason;
}

/**
 * LA VEILLE, DÉRIVÉE DE LA DATE ET DE L'HEURE — plus jamais d'une case.
 *
 * ── CE QUE ÇA REMPLACE ────────────────────────────────────────────────────
 * Jusqu'au 2026-09-03, « je cuisine la veille » était une case
 * (`CookDayBeforeField`), cochée par la personne, envoyée dans le corps HTTP
 * (`cook_the_day_before`). La règle produit du 03/09 (P1): les courses et la
 * cuisson se font LA VEILLE, automatiquement, avec une coupure à 18 h — et
 * quand la veille n'est plus possible, on le DIT (« dès le matin »).
 *
 * ── LA TABLE, TELLE QUE L'ANALYSE §1.2 L'A ÉCRITE ─────────────────────────
 *
 *   startsOn ≥ today + 2                → leadDay = startsOn − 1   day_before
 *   startsOn = today + 1, hourNow < 18  → leadDay = today          day_before
 *   startsOn = today + 1, hourNow ≥ 18  → leadDay = null           same_morning
 *   startsOn = today                    → leadDay = null           same_morning
 *   startsOn = today + 1, hourNow null  → leadDay = null           same_morning
 *                                         (`clock_unreadable` — JAMAIS deviné)
 *
 * ⛔ L'HEURE NE DÉCIDE QUE QUAND LA VEILLE SERAIT AUJOURD'HUI. Un plan qui
 * commence dans deux jours a une veille pleine quelle que soit l'heure; un plan
 * qui commence aujourd'hui n'en a aucune quelle que soit l'heure. Entre les
 * deux, c'est l'horloge — et une horloge illisible n'est pas « minuit »: on
 * rend le produit d'hier (pas de veille) et on le nomme.
 *
 * ⚠️ `today` est PASSÉ, jamais lu ici; le fuseau est celui du compositeur
 * (décision D1.4). `startsOn < today` est un contrat violé par l'appelant —
 * `resolveRequestedWindow` refuse déjà un départ passé — et JETTE.
 *
 * PURE: no I/O, no clock.
 */
export function leadDayFor(input: {
  startsOn: string;
  today: string;
  hourNow: number | null;
}): LeadDayVerdict {
  assertHourNow(input, "leadDayFor");
  const startsOn = String(input.startsOn ?? "").trim();
  const today = String(input.today ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error("[keel/plan_hours] leadDayFor: startsOn et today sont REQUIS (YYYY-MM-DD)");
  }
  if (startsOn < today) {
    throw new Error(`[keel/plan_hours] leadDayFor: le plan commence dans le passé (${startsOn} < ${today})`);
  }
  if (startsOn === today) {
    return { leadDay: null, timing: "same_morning", reason: "starts_today" };
  }
  const tomorrow = addDays(today, 1);
  if (startsOn > tomorrow) {
    return { leadDay: addDays(startsOn, -1), timing: "day_before", reason: "day_before" };
  }
  // startsOn === tomorrow: la veille serait AUJOURD'HUI, et seule l'heure sait
  // s'il reste le temps de faire les courses et de cuisiner ce soir.
  if (input.hourNow === null) {
    return { leadDay: null, timing: "same_morning", reason: "clock_unreadable" };
  }
  if (input.hourNow < SHOPPING_CUTOFF_HOUR) {
    return { leadDay: today, timing: "day_before", reason: "before_cutoff_today" };
  }
  return { leadDay: null, timing: "same_morning", reason: "after_cutoff" };
}

/**
 * ⚠️ LA MOITIÉ « EXÉCUTION » DE LA GARDE DE §4.0.
 *
 * Le type dit « REQUIS, nullable ». Il ne dit rien à un appelant JavaScript, ni
 * à un objet construit par `JSON.parse`, ni à un `as` sur un type étranger —
 * trois chemins par lesquels ce dépôt a déjà reçu `undefined` là où un type
 * promettait autre chose. Un `undefined` qui traverserait ici deviendrait
 * `false` à la première comparaison, c'est-à-dire « il est minuit », c'est-à-dire
 * une journée entière rendue muette.
 */
function assertHourNow(input: { hourNow?: unknown }, fn: string): void {
  const h = input?.hourNow;
  if (h === null) return;
  if (typeof h !== "number" || !Number.isFinite(h) || h < 0 || h > 23) {
    throw new Error(
      `[keel/plan_hours] ${fn}: hourNow est REQUIS (0..23 ou null) — ` +
        "`null` dit « je n'ai pas su lire l'horloge », `undefined` ne dit rien " +
        `(reçu: ${JSON.stringify(h)})`,
    );
  }
}
