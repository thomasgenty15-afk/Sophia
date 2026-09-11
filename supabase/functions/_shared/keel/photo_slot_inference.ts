/**
 * FF-018 §11 — LE CRÉNEAU D'UNE PHOTO QUI N'EN DÉCLARE PAS. PUR.
 *
 * ── LA QUESTION QUE CE MODULE FERME, ET ELLE ÉTAIT OUVERTE ─────────────────
 * FF-018 §11 la posait mot pour mot: « une photo envoyée APRÈS COUP doit dire à
 * quel repas elle se rattache. Le rattachement n'est pas décidé. » Elle est
 * décidée le 2026-09-01, puis CORRIGÉE le 2026-09-09 (voir le renversement
 * ci-dessous): le créneau dont la FENÊTRE contient l'heure, annoncé dans
 * l'accusé, avec la porte de correction dans la même phrase.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ RENVERSÉ LE 2026-09-09 — LA FENÊTRE REMPLACE « LE DERNIER CRÉNEAU ÉCOULÉ »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La règle d'origine rangeait la photo au dernier créneau ÉCOULÉ, avec les
 * coupures de `SLOT_PASSED_HOUR` (10 h, 14 h, 21 h). Elle répondait à « quel
 * repas est derrière moi ? », ce qui n'est pas la question que pose une photo.
 * Sa conséquence, mesurée en lisant la table:
 *
 *   · une assiette photographiée à 11 h 30 partait au PETIT-DÉJEUNER;
 *   · une assiette photographiée à MIDI PILE aussi;
 *   · le déjeuner ne commençait qu'à 14 h.
 *
 * C'est-à-dire que la moitié de l'heure du déjeuner tombait sur le repas
 * d'avant — et avec elle le rapprochement du plat prévu, qui exige « le créneau
 * concorde » pour rendre un verdict franc (`planned_dish_match.ts`). Une photo
 * de midi ne pouvait donc PAS cocher le déjeuner composé.
 *
 * La règle est maintenant: chaque repas datable possède une FENÊTRE autour de
 * l'heure à laquelle on le prend, et l'heure de la photo tombe dans l'une
 * d'elles. Ce que ça change, à heures par défaut:
 *
 *   7 h → petit-déjeuner (avant: rien) · 11 h 30 → déjeuner (avant:
 *   petit-déjeuner) · 13 h → déjeuner (avant: petit-déjeuner) · 16 h → goûter
 *   (avant: déjeuner, faux de quatre heures) · 10 h et 22 h → inchangés, sauf
 *   chez qui a nommé son en-cas
 *
 * ⛔ CE QUI N'EST PAS RENVERSÉ: la déduction reste ANNONCÉE. §3.3bis
 * (« hypothèse annoncée + porte de correction ») est ce qui autorise cette
 * lecture d'horloge, hier comme aujourd'hui. Le refus d'origine visait la
 * déduction SILENCIEUSE, et il reste entier: rien ici n'a le droit d'écrire un
 * créneau sans le dire. D'où la forme du retour — un slot ET le fait qu'il est
 * inféré.
 *
 * ── L'HEURE DÉCLARÉE DÉPLACE LA FENÊTRE ───────────────────────────────────
 * Quelqu'un qui a dit dîner à 22 h a sa fenêtre de dîner autour de 22 h, pas
 * autour de 19 h. C'est le même arbitrage que partout ailleurs dans ce dépôt
 * (`rhythmClockFrom` bat le repli), appliqué au CENTRE plutôt qu'à une coupure.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LES SIX MOMENTS, ET LE GOÛTER QU'ON N'A PAS DÉCLARÉ — DÉCISION DU 2026-09-09
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Les six occasions ont une fenêtre, y compris les trois qu'un rythme ne nomme
 * pas toujours (`snack_am`, `snack_pm`, `before_bed`). La décision, dans les
 * mots de l'utilisateur: quelqu'un qui a déclaré trois créneaux et qui prend
 * une crêpe au Nutella à 16 h **ouvre un créneau ce jour-là dans le suivi** —
 * *« ce n'est pas en mode ça change sa préférence alimentaire »*.
 *
 * ⛔ ET C'EST STRUCTURELLEMENT VRAI, PAS UNE PROMESSE. Ce chemin écrit
 * `protocol_events.slot_key`, un fait daté. AUCUN écrivain de ce dépôt ne
 * recopie un créneau de fait vers `practical_constraints.eating_rhythm` — la
 * préférence ne se change que par l'écran qui la porte. Le journal
 * (`tracking_v2.ts`) crée alors une ligne `outside` / `reported` à ce créneau,
 * sur ce jour, et son énergie entre dans le total du jour. Le lendemain, la
 * journée n'a plus de goûter.
 *
 * ── CE QUI EMPÊCHE QUAND MÊME D'INVENTER: UN MOMENT NOMMÉ BAT UN MOMENT MUET
 * Deux heures sont AMBIGUËS — 10 h (petit-déjeuner tardif ou en-cas du matin ?)
 * et 22 h (dîner tardif ou en-cas du soir ?). Là, les deux fenêtres se
 * chevauchent, et c'est le moment que la personne a NOMMÉ qui gagne. Les trois
 * repas principaux comptent comme nommés d'office: c'est `DEFAULT_EATING_RHYTHM`
 * — ce que le produit compose quand personne n'a rien dit.
 *
 * Le goûter, lui, n'a besoin de personne: entre 15 h et 17 h, AUCUN repas
 * principal ne revendique l'heure. Le trou du milieu d'après-midi est large de
 * trois heures, et le ranger au déjeuner de midi était faux de quatre.
 *
 * ⛔ ET LA NUIT NE SE RATTRAPE PAS. Une photo à 0 h 30 ne devient pas le dîner:
 * `local_date` porte déjà le jour SUIVANT, donc ce dîner serait rangé au
 * mauvais jour. Le repli rend `null`, comme avant.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire. L'heure entre en paramètre.
 */

import { rhythmClockFrom, SLOT_PASSED_HOUR } from "./plan_hours.ts";
import type { SlotKey } from "./tokens.ts";

/**
 * LES SIX MOMENTS, DANS L'ORDRE DE LA JOURNÉE.
 *
 * `on_waking`, `pre_workout`, `post_workout`, `any_meal` et `any_time`
 * existent dans `SLOT_VOCABULARY` et ne sont pas ici: aucun n'a d'heure, et
 * `any_*` n'est pas un moment mais une absence de contrainte. Les inférer
 * serait remplir une case avec un jeton qui ne veut rien dire à cette place.
 *
 * ⚠️ L'ORDRE EST CHRONOLOGIQUE, ET C'EST LUI QUI DÉPARTAGE. À égalité de
 * distance entre deux centres — ce qui n'arrive qu'avec des heures déclarées
 * serrées — le moment le plus TÔT gagne: il a déjà été mangé, l'autre peut ne
 * pas l'être encore.
 */
const DATABLE_SLOTS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;

type DatableSlot = (typeof DATABLE_SLOTS)[number];

/**
 * LES TROIS QU'UN RYTHME NE NOMME PAS TOUJOURS.
 *
 * ⚠️ CE N'EST PLUS UNE PORTE, C'EST UN DÉPARTAGE. Leur fenêtre est armée pour
 * tout le monde — c'est la décision du 2026-09-09 (voir l'en-tête): un goûter
 * pris se range au goûter, déclaré ou non. Cet ensemble sert uniquement à
 * savoir qui gagne quand DEUX fenêtres se disputent la même heure: un moment
 * que la personne a nommé bat un moment qu'elle n'a jamais mentionné.
 *
 * Les trois repas principaux ne sont pas ici, et donc comptent comme nommés
 * d'office: `DEFAULT_EATING_RHYTHM` les pose pour tout le monde. On ne demande
 * à personne de déclarer qu'il déjeune.
 */
const OPTIONAL_SLOTS: ReadonlySet<DatableSlot> = new Set([
  "snack_am",
  "snack_pm",
  "before_bed",
]);

/**
 * LA FENÊTRE DE CHAQUE MOMENT — des CHOIX DE PRODUIT, pas des mesures.
 *
 * `center` est l'heure à laquelle on prend ce repas-là; `before` et `after`
 * disent de combien d'heures on peut s'en écarter et y rester. Elles sont
 * ASYMÉTRIQUES parce que les repas le sont: on déjeune plus souvent en retard
 * qu'en avance, et personne ne petit-déjeune à 11 h.
 *
 *   petit-déjeuner    5 h → 10 h
 *   milieu de matinée 9 h → 10 h     ← chevauche le petit-déjeuner
 *   déjeuner         11 h → 14 h
 *   goûter           15 h → 17 h     ← seule candidate sur ces trois heures
 *   dîner            18 h → 23 h
 *   avant de dormir  21 h → 23 h     ← chevauche le dîner
 *
 * ⚠️ LES DEUX CHEVAUCHEMENTS SONT DÉLIBÉRÉS, et ce sont les deux heures
 * ambiguës de la journée: 10 h et 22 h. Un petit-déjeuner à 10 h et un dîner à
 * 22 h sont ordinaires; les donner d'office à un en-cas casserait la coche du
 * plat prévu chez des gens qui n'ont jamais parlé d'en-cas. Le départage est
 * dans la boucle: le moment NOMMÉ gagne.
 *
 * ⚠️ 11 h APPARTIENT AU DÉJEUNER SEUL, et l'en-cas du matin s'arrête à 10 h
 * pour ça: à égalité de distance, il le lui reprendrait — or 11 h 30 rangé
 * ailleurs qu'au déjeuner est exactement le défaut que ce lot répare.
 *
 * ⛔ LES CENTRES SONT RECOPIÉS DE `SLOT_USUAL_HOUR`, PAS IMPORTÉS, et c'est le
 * même arbitrage que celui écrit dans `plan_hours.ts` à propos de ses deux
 * tables voisines: cette table-là répond à « reste-t-il le temps de faire les
 * courses avant ce repas ? ». La partager ferait déplacer le créneau d'une
 * photo le jour où quelqu'un ajuste une heure pour une raison de courses.
 */
const PHOTO_SLOT_WINDOW: Readonly<
  Record<DatableSlot, { center: number; before: number; after: number }>
> = {
  breakfast: { center: 8, before: 3, after: 2 },
  snack_am: { center: 10, before: 1, after: 0 },
  lunch: { center: 12, before: 1, after: 2 },
  snack_pm: { center: 16, before: 1, after: 1 },
  dinner: { center: 19, before: 1, after: 4 },
  before_bed: { center: 22, before: 1, after: 1 },
};

export type InferredSlot = {
  /** Le créneau retenu. */
  slot: SlotKey;
  /**
   * TOUJOURS `true` — le champ existe pour que l'appelant ne PUISSE PAS écrire
   * le slot sans porter la marque. Un booléen constant dans un type est un
   * rappel au compilateur; c'est délibéré, et c'est le même motif que
   * `tickedDish` dans `renderMealPhotoAck`.
   */
  inferred: true;
};

/**
 * Le repas dont la fenêtre contient `localHour`, sinon le dernier écoulé.
 *
 * @param localHour heure pleine locale de l'élève, `0`..`23`.
 * @param eatingRhythm `practical_constraints.eating_rhythm` tel qu'il est en
 *   base, ou `null`. REQUIS — l'omettre ferait retomber tout le monde sur les
 *   centres par défaut alors que la personne a peut-être déclaré ses heures, et
 *   ce dépôt appelle ça une garde désarmée.
 *
 * `null` est une RÉPONSE, pas un échec: une photo à 3 h du matin n'est le repas
 * de personne, et lui en coller un serait la déduction sans fondement que ce
 * module refuse. La ligne garde alors `slot_key: null`.
 */
export function inferSlotFromLocalHour(
  localHour: number,
  eatingRhythm: unknown,
): InferredSlot | null {
  if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) {
    return null;
  }
  const declared = new Map(
    rhythmClockFrom(eatingRhythm).map((r) => [r.slot, r.hour] as const),
  );

  // ── ① LA FENÊTRE, PUIS DEUX DÉPARTAGES DANS CET ORDRE ───────────────────
  //   ① un moment NOMMÉ bat un moment jamais mentionné (10 h et 22 h);
  //   ② à égalité, le centre le plus PROCHE;
  //   ③ à égalité encore, le plus TÔT — c'est l'ordre de `DATABLE_SLOTS`, et
  //      ça ne se joue qu'avec des heures déclarées serrées.
  let best:
    | { slot: DatableSlot; named: boolean; distance: number }
    | null = null;
  for (const slot of DATABLE_SLOTS) {
    const window = PHOTO_SLOT_WINDOW[slot];
    // `undefined` (le slot n'est pas dans le rythme) et `null` (il y est sans
    // heure) mènent tous deux au centre par défaut.
    const center = declared.get(slot) ?? window.center;
    if (localHour < center - window.before) continue;
    if (localHour > center + window.after) continue;
    // `.has()` et pas `.get()`: « je goûte », sans dire quand, est une
    // déclaration valide — elle NOMME le moment, sur le centre par défaut.
    const named = !OPTIONAL_SLOTS.has(slot) || declared.has(slot);
    const distance = Math.abs(localHour - center);
    if (best === null) {
      best = { slot, named, distance };
      continue;
    }
    if (named !== best.named) {
      if (named) best = { slot, named, distance };
      continue;
    }
    if (distance < best.distance) best = { slot, named, distance };
  }
  if (best !== null) return { slot: best.slot, inferred: true };

  // ── ② LE REPLI: LE DERNIER CRÉNEAU ÉCOULÉ ───────────────────────────────
  // Aux heures par défaut, les six fenêtres couvrent 5 h → 23 h: il ne reste
  // que la nuit, où le repli ne rend rien non plus. Il sert aux journées dont
  // les heures DÉCLARÉES ouvrent un trou — « je dîne à 22 h » laisse 17 h et
  // 18 h sans propriétaire. C'est la règle d'avant le 2026-09-09, gardée telle
  // quelle.
  //
  // ⚠️ UN MOMENT OPTIONNEL N'Y ENTRE QU'AVEC UNE HEURE DÉCLARÉE, et la règle
  // tombe toute seule: `SLOT_PASSED_HOUR` les laisse à `null`, donc seul un
  // `at` lu dans le rythme peut leur donner une coupure. Non déclaré ⇒
  // `undefined ?? null`; déclaré sans heure (« je goûte », sans dire quand) ⇒
  // `null ?? null`. Les deux sautent. C'est la ligne exacte entre LIRE une
  // heure et en INVENTER une, et c'est elle qu'on tient depuis le début.
  let fallback: DatableSlot | null = null;
  let fallbackHour = -1;
  for (const slot of DATABLE_SLOTS) {
    const declaredHour = declared.get(slot);
    const hour = declaredHour ?? SLOT_PASSED_HOUR[slot];
    if (hour === null || hour === undefined) continue;
    // `>=`: à 14 h pile, le déjeuner EST passé. La coupure est la fin du
    // créneau, pas son début (voir `SLOT_PASSED_HOUR`).
    if (localHour >= hour && hour > fallbackHour) {
      fallback = slot;
      fallbackHour = hour;
    }
  }
  return fallback === null ? null : { slot: fallback, inferred: true };
}

/**
 * La clé qui porte la marque sur la ligne de fait.
 *
 * Dans `recognized`, à côté de `student_commitment_id`, et pour la même raison:
 * `recognized` est le seul jsonb de `protocol_events` qui dit D'OÙ vient ce que
 * la ligne affirme. Une colonne dédiée demanderait une migration pour un
 * booléen que seuls l'accusé et le coach lisent.
 *
 * ⚠️ `analyze-meal-photo-v1` RÉÉCRIT `recognized` à chaque analyse. La marque
 * doit donc être recopiée à travers, exactement comme `student_commitment_id`
 * — sinon un `force: true` la perd et le créneau deviné devient un créneau
 * déclaré, en silence.
 */
export const SLOT_INFERRED_KEY = "slot_inferred";

/** La marque, relue depuis `recognized`. Faux par défaut: on n'infère rien. */
export function slotWasInferred(recognized: unknown): boolean {
  if (!recognized || typeof recognized !== "object") return false;
  return (recognized as Record<string, unknown>)[SLOT_INFERRED_KEY] === true;
}
