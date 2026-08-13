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
