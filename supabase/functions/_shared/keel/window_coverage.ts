/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉNOMINATEUR DU VERDICT — combien de JOURNÉES ce plan nourrit vraiment.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, MESURÉ ─────────────────────────────────
 * `verdictFor` divise l'énergie de toute la génération par `daysCovered`, et
 * les deux lanes lui passaient la fenêtre ENTIÈRE (`durationDays`). Or un plan
 * lancé en cours de journée ne compose PAS les moments déjà passés
 * (`slotsPassedToday`), un plan qui cuisine la veille ajoute un jour où l'on ne
 * mange rien (`cookOnlyDay`), et une absence déclarée retire des moments. La
 * fenêtre compte donc des journées que le plan ne nourrit pas.
 *
 * Mesuré en run réel (2026-09-03, `plan-S1-20260903-220929`): 7 142 kcal servis
 * sur **deux** journées — 3 571 kcal/j — divisés par une fenêtre de **trois**
 * rendaient 2 381 kcal/j, donc `within` sur une bande 2 414–2 668, pendant que
 * chaque jour nourri servait 3 571 contre un plafond de 2 668.
 *
 * ⛔ CE N'EST PAS UN VERDICT CASSÉ, C'EST UN VERDICT QUI FLATTE. Il a raison
 * d'une façon qui trompe, et c'est pire: la boucle de correction ne voit rien à
 * corriger, l'ancrage vise une cible trop basse, et le plan part tel quel.
 *
 * ── CE QU'ON REND ─────────────────────────────────────────────────────────
 * La somme, sur les jours de la fenêtre, de la PART de journée que le plan
 * compose ce jour-là. Une fenêtre de trois jours dont le premier ne porte qu'un
 * dîner vaut ~2,35 et non 3.
 *
 * ⛔ LA RÈGLE PAR JOUR N'EST PAS ÉCRITE ICI — `dayCoverageOf` (`mouth_anchor.ts`)
 * la tient déjà, avec ses poids (`SLOT_DAY_WEIGHT`), son repli des trois repas
 * de la maison et sa cicatrice (« un dîner seul se voit demander une journée
 * entière — 6,28 mesuré, c'est-à-dire une assiette de deux kilos »). La recopier
 * ici ferait le jumeau que ce dépôt interdit en toutes lettres. Ce module ne
 * fait que TROIS choses que la règle par jour ne peut pas faire, parce qu'elles
 * sont des questions de FENÊTRE et non de journée:
 *
 *   ① ranger les plats composés dans leur jour;
 *   ② décider qu'un jour SANS AUCUN PLAT ne nourrit rien — voir le bloc dédié;
 *   ③ additionner, et nommer le repli quand la fenêtre entière est illisible.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUE CE MODULE CASSE AILLEURS, ÉCRIT ICI PLUTÔT QUE DÉCOUVERT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `below` change de SENS pour tout le produit à partir du 2026-09-04. Les
 * quatre lecteurs, et ce qu'ils deviennent:
 *
 *   · `correctionPlanFor` .......... lève moins de `raise_energy` faux (un plan
 *     troué ne se lit plus léger) et plus de `reduce_energy` vrais. Mesuré sur
 *     le corpus: 3 plans passent `within → above`, 1 passe `below → within`.
 *   · `plan_rationale.energyBelowBand` — la SEULE ligne que l'élève lit. Un plan
 *     qui n'était léger que par dilution cesse de se déclarer léger. L'autre
 *     direction reste MUETTE par décision produit (« ton plan est trop gros »
 *     ne s'écrit pas): le lot ne peut donc ajouter aucune phrase, seulement en
 *     retirer.
 *   · `assessCoverage.floorHit` ..... le plancher de 1 550 kcal/jour se franchit
 *     moins souvent, puisque le kcal/jour monte. Même direction, même raison.
 *   · `meal_composition_verdicts` ... ⛔ LA POPULATION D'AVANT ET CELLE D'APRÈS
 *     SE MÉLANGENT DANS LA MÊME COLONNE. La table porte `prompt_version` et
 *     `doctrine_version` précisément pour séparer les populations d'un bump —
 *     et ce lot ne bumpe NI l'un NI l'autre, parce qu'il ne touche ni la
 *     consigne ni la doctrine. Il n'existe pas de version du MOTEUR DE VERDICT.
 *     Seule la date (`created_at` < 2026-09-04) sépare les deux. Quiconque
 *     agrège cette table sur une fenêtre à cheval compare deux dénominateurs.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { dayCoverageOf } from "./mouth_anchor.ts";

/** Une case composée du plan: un jour et un moment. Les deux peuvent manquer. */
export interface ComposedCell {
  /** Jeton `mon`..`sun`. `null` = le modèle n'a pas nommé le jour. */
  day: string | null;
  /** Jeton de `MEAL_SLOTS`. `null` = il n'a pas nommé le moment. */
  slot: string | null;
}

/**
 * POURQUOI CE JOUR-LÀ PÈSE CE QU'IL PÈSE. Nommé, jamais un simple nombre: c'est
 * la seule façon de lire une couverture qui a baissé sans rejouer le calcul.
 *
 *   · `fed` ........ le plan y compose au moins un moment lisible;
 *   · `not_fed` .... aucun plat: journée déjà passée, veille de cuisine, ou
 *                    absence déclarée. Elle pèse ZÉRO;
 *   · `unreadable` . des plats, mais aucun ne nomme son moment. On ne sait pas
 *                    lire la structure de ce jour: il pèse UNE journée pleine,
 *                    c'est-à-dire le comportement d'avant ce module.
 */
export type WindowDayReason = "fed" | "not_fed" | "unreadable";

export interface WindowDayCoverage {
  day: string;
  /** La part de journée que le plan compose ce jour-là, entre 0 et 1. */
  share: number;
  reason: WindowDayReason;
  /** Les moments composés ce jour-là, dédupliqués, dans l'ordre reçu. */
  slots: string[];
}

export interface WindowCoverage {
  /**
   * LE DÉNOMINATEUR — un nombre de journées ÉQUIVALENTES, souvent fractionnaire.
   *
   * ⚠️ IL PART AU VERDICT **ET** À L'ANCRAGE, jamais l'un sans l'autre. « Le
   * produit ne doit pas juger sur un nombre et corriger sur un autre » est la
   * propriété que ce champ existe pour tenir.
   */
  days: number;
  /** La SPAN de la fenêtre, en jours entiers. Ce n'est PAS le dénominateur. */
  windowDays: number;
  byDay: WindowDayCoverage[];
  /**
   * LE REPLI A-T-IL MORDU ? `true` = on rend la fenêtre entière, comme avant ce
   * module. Deux causes, et une seule est nommée par jour:
   *
   *   · aucun jour de la fenêtre ne porte de plat lisible;
   *   · un plat sans jour sur une fenêtre de plusieurs jours (voir plus bas).
   */
  fallback: boolean;
}

/**
 * LA COUVERTURE EFFECTIVE D'UNE FENÊTRE.
 *
 * @param windowDays Les jetons de jour de la fenêtre, dans l'ordre
 *   (`windowDayOrder`). REQUIS et non vide: sans fenêtre il n'y a pas de
 *   dénominateur à calculer, et rendre `1` par défaut inventerait un plan d'un
 *   jour.
 * @param declaredSlots Les moments que la personne a déclarés (`eating_rhythm`).
 *   `[]` = rien de déclaré, et `dayCoverageOf` retombe alors sur les TROIS
 *   repas de la maison — sa constante, pas une devinette d'ici.
 * @param composed Les cases que le plan compose, une par plat.
 */
export function windowCoverageOf(args: {
  windowDays: readonly string[];
  declaredSlots: readonly string[];
  composed: readonly ComposedCell[];
}): WindowCoverage {
  const span = args.windowDays.length;
  if (span === 0) {
    throw new Error(
      "[keel/window_coverage] windowDays est REQUIS et non vide — " +
        "une fenêtre sans jour n'a pas de dénominateur",
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ⛔ UN PLAT SANS JOUR SUR PLUSIEURS JOURS ⇒ ON NE TOUCHE À RIEN.
  // ══════════════════════════════════════════════════════════════════════
  //
  // `parseGeneratedMeal` jette déjà ces plats-là sur une fenêtre de plusieurs
  // jours (« no day token on a multi-day window -- dropped »), donc ce cas ne
  // devrait pas arriver. Mais s'il arrivait — un appelant qui n'est pas le
  // parseur, une ligne relue depuis la base — le plat porterait de l'ÉNERGIE
  // sans porter de COUVERTURE: le numérateur monterait, le dénominateur non, et
  // on rendrait `above` sur un plan qui ne déborde pas.
  //
  // La direction de cette erreur n'est pas neutre, et elle va dans le sens qui
  // fait RABOTER une assiette. On rend donc la fenêtre entière — le
  // comportement d'avant ce module, au jour près — et on le NOMME.
  const unplaceable = span > 1 &&
    args.composed.some((c) => !normalisedDay(c.day));

  const slotsByDay = new Map<string, string[]>();
  const dishesByDay = new Map<string, number>();
  for (const cell of args.composed) {
    // Sur une fenêtre d'UN jour, un plat sans jour est situé sans ambiguïté:
    // c'est la règle que `parseGeneratedMeal` applique déjà pour le garder.
    const day = normalisedDay(cell.day) ?? (span === 1 ? args.windowDays[0] : null);
    if (day === null) continue;
    dishesByDay.set(day, (dishesByDay.get(day) ?? 0) + 1);
    const slot = normalisedSlot(cell.slot);
    if (slot === null) continue;
    const bucket = slotsByDay.get(day) ?? [];
    if (!bucket.includes(slot)) bucket.push(slot);
    slotsByDay.set(day, bucket);
  }

  const byDay: WindowDayCoverage[] = [];
  let total = 0;
  // ⚠️ ON ITÈRE LA FENÊTRE, PAS LES PLATS. Un jour composé HORS fenêtre (un
  // jeton que le modèle a inventé, une ligne relue d'un plan plus long) ne doit
  // pas ajouter de journée à un dénominateur qui décrit CETTE fenêtre.
  for (const day of args.windowDays) {
    const dishes = dishesByDay.get(day) ?? 0;
    const slots = slotsByDay.get(day) ?? [];
    if (dishes === 0) {
      // ══════════════════════════════════════════════════════════════════
      // ⛔ ZÉRO, ET C'EST TOUT LE LOT. `dayCoverageOf` rendrait `1` ici.
      // ══════════════════════════════════════════════════════════════════
      //
      // Son repli (`covered <= 0 ⇒ 1`) répond à une question de BOUCHE — « on
      // n'a rien su lire de sa journée, ne réduis pas sa cible » — et il est
      // juste là-bas. Ici la question est celle de la FENÊTRE, et elle a une
      // réponse que la journée ne peut pas avoir: on SAIT pourquoi ce jour est
      // vide. Les trois causes sont des décisions du produit, prises en amont:
      //
      //   · les moments d'aujourd'hui déjà passés (`slotsPassedToday`);
      //   · la veille où l'on cuisine sans manger (`cookOnlyDay`);
      //   · une journée d'absence déclarée (`away_days`, `slots: []`).
      //
      // Dans les trois cas la personne ne mange RIEN de ce plan ce jour-là.
      // Compter la journée, c'est diluer l'énergie servie par une journée qui
      // n'existe pas — le défaut mesuré en tête de fichier, dans son cas le
      // plus gros: sur `plan-S1-20260903`, le PREMIER jour était entièrement
      // vide, et c'est LUI qui faisait passer 3 571 kcal/j pour 2 381.
      //
      // ⚠️ CE N'EST PAS LE REPLI DE `dayCoverageOf` QU'ON RÉÉCRIT: on ne
      // l'APPELLE PAS. La distinction compte — sa règle par jour reste intacte
      // et son seul lecteur de production est ce module.
      byDay.push({ day, share: 0, reason: "not_fed", slots: [] });
      continue;
    }
    // Des plats mais aucun moment nommé: `dayCoverageOf` rend `1` par son propre
    // repli, et c'est exactement ce qu'on veut — on ne sait pas lire ce jour,
    // donc on ne réduit rien.
    const share = dayCoverageOf(args.declaredSlots, slots);
    byDay.push({
      day,
      share,
      reason: slots.length === 0 ? "unreadable" : "fed",
      slots,
    });
    total += share;
  }

  // ⛔ LE PLANCHER DE LA FENÊTRE — pas celui du verdict. `verdictFor` a son
  // `Math.max(1, …)`, mais un `0` qui lui arriverait aurait déjà traversé
  // l'ancrage et la distance de correction, dont les planchers ne disent pas la
  // même chose. Une fenêtre sans un seul plat lisible rend donc la SPAN, ce qui
  // est le comportement d'avant ce module, au jour près.
  if (unplaceable || total <= 0) {
    return {
      days: span,
      windowDays: span,
      byDay,
      fallback: true,
    };
  }

  return { days: total, windowDays: span, byDay, fallback: false };
}

/**
 * ⚠️ AUCUNE LISTE FERMÉE ICI, ET C'EST DÉLIBÉRÉ. `DAY_TOKENS` et `MEAL_SLOTS`
 * vivent dans `tokens.ts` et `meal_generation.ts`; les recopier ferait une
 * troisième liste à tenir. Un jeton inconnu traverse: `dayCoverageOf` le pèse
 * `0` s'il n'a pas de poids, et un jour hors fenêtre n'est jamais itéré.
 */
function normalisedDay(raw: string | null): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "" ? null : v;
}

function normalisedSlot(raw: string | null): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "" ? null : v;
}
