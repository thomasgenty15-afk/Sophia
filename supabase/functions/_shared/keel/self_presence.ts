/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA PRÉSENCE DU TITULAIRE, QUAND AUCUN PLAN NE L'A ARCHIVÉE — 2026-09-09
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE TROU QUE CE MODULE FERME, ET IL ÉTAIT ENTIER ───────────────────────
 * Le conseil chiffré d'un créneau « dehors » (`eatingOutAdvice`,
 * `household_portions.ts`) existe, il est rendu (`DayEnergyLine`), et il n'a
 * jamais pu sortir POUR UN PLAN PERSONNEL. Son unique lecture de présence
 * (`readViewerAway`, `meal-energy-v1`) part de
 * `generated_from.household.presence.members[]` — une trace que SEULE la lane
 * foyer écrit. Un plan personnel n'en porte pas, donc `null`, donc silence.
 *
 * Or c'est exactement la personne à qui le conseil s'adresse: quelqu'un qui
 * déjeune au bureau, dont le plan compose le petit-déjeuner et le dîner, et
 * qui n'a AUCUN repère sur le repas que le plan ne compose pas.
 *
 * ── LES DEUX SOURCES, ET ELLES SONT CELLES DU MOTEUR ──────────────────────
 * `generate-meal-v1` (D6.1, 2026-09-03) compose contre l'UNION de:
 *   · `student_goals.practical_constraints.away_days` — ce que la personne a
 *     écrit pour elle-même dans la grille (`MealPickerGrid` est l'autorité);
 *   · `household_members.away_days` de SA ligne — ce que la porte
 *     `keel_household_set_member_work_lunch` y pose (les cinq midis de semaine).
 *
 * ⛔ ON RELIT LES MÊMES DEUX SOURCES, DANS LE MÊME ORDRE, PAR LE MÊME PARSEUR.
 * `parseMemberAway` porte déjà l'arbitrage des trois états et le « le silence
 * gagne » entre `away` et `eating_out`. Écrire ici une seconde idée de « qui
 * est dehors » ferait le défaut que ce dépôt paie en boucle: deux lectures de
 * la même donnée, et c'est celle qu'on relit le moins qui garde l'ancien sens.
 *
 * ── ⚠️ CE QU'UNE LECTURE VIVANTE COÛTE, ET LA CEINTURE QUI LE PAIE ────────
 * La trace du foyer est FIGÉE à la composition; ces deux colonnes-ci sont
 * VIVANTES. Quelqu'un peut donc marquer « mardi midi dehors » APRÈS avoir fait
 * composer son plan — le plan porte alors un déjeuner du mardi, et le conseil
 * dirait « vise autour de 700 » à côté d'un plat déjà servi. C'est mot pour mot
 * le défaut que `presenceStateFor` nomme: **deux nourritures pour un seul
 * midi**.
 *
 * D'où `composedCells`: une case que le plan A COMPOSÉE ne reçoit jamais de
 * conseil, quoi que disent les colonnes. La garde est plus directe que la trace
 * — elle ne lit pas une intention, elle lit ce qui est dans l'assiette.
 *
 * ⛔ ET ELLE NE VAUT QUE POUR UN PLAN PERSONNEL. Sur un plan de foyer, un plat
 * composé au déjeuner du mardi peut appartenir à quelqu'un d'AUTRE pendant que
 * le lecteur, lui, déjeune dehors: la même garde y supprimerait un conseil
 * juste. C'est pour ça que la lane foyer garde sa trace et n'appelle pas ce
 * module.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import {
  type MemberAway,
  parseMemberAway,
  presenceStateFor,
} from "./household_presence.ts";
import type {
  EatingOccasion,
  EatingOccasionSlot,
} from "./meal_generation.ts";

/**
 * LA PRÉSENCE DU TITULAIRE, DEPUIS SES DEUX COLONNES.
 *
 * ⚠️ LA CONCATÉNATION **EST** L'UNION, et c'est la propriété sur laquelle
 * `parseMemberAway` est construit (il la tient déjà pour le roster, qui range
 * les deux sources dans un seul tableau étiqueté). Il n'y a donc rien à
 * fusionner ici, et surtout aucune préférence à exprimer entre les deux: en
 * préférer une effacerait l'autre en silence.
 *
 * ⚠️ CE QUI N'EST PAS UN TABLEAU VAUT LE TABLEAU VIDE, des deux côtés. Une
 * colonne absente est une personne qui n'a rien déclaré — jamais une panne
 * qu'on maquillerait en présence à table.
 */
export function selfPresenceFrom(args: {
  /** `student_goals.practical_constraints.away_days`, brut. */
  declared: unknown;
  /** `household_members.away_days` de la ligne du titulaire, brut. */
  roster: unknown;
}): MemberAway {
  const declared = Array.isArray(args?.declared) ? args.declared : [];
  const roster = Array.isArray(args?.roster) ? args.roster : [];
  return parseMemberAway([...declared, ...roster]);
}

/** La clé d'une case: un jour, un moment. Une seule écriture, les deux bouts. */
export function cellKey(day: string, slot: string): string {
  return `${String(day ?? "").trim()}|${String(slot ?? "").trim()}`;
}

/**
 * LES CASES QUE CE PLAN A RÉELLEMENT COMPOSÉES.
 *
 * ⛔ UN PLAT SANS JOUR OU SANS MOMENT N'ENTRE PAS DANS L'ENSEMBLE, et ce n'est
 * pas un oubli: la garde sert à SUPPRIMER un conseil, donc une clé approximative
 * en supprimerait un juste. Un plat qu'on ne sait pas situer ne prouve rien sur
 * la case dont on parle.
 */
export function composedCells(
  dishes: ReadonlyArray<{ day: string | null; slot: string | null }>,
): Set<string> {
  const out = new Set<string>();
  for (const dish of dishes ?? []) {
    const day = String(dish?.day ?? "").trim();
    const slot = String(dish?.slot ?? "").trim();
    if (!day || !slot) continue;
    out.add(cellKey(day, slot));
  }
  return out;
}

/**
 * COMBIEN DE REPAS DÉCLARÉS ÉCHAPPENT AU PLAN, JOUR PAR JOUR — le jumeau de
 * `readViewerMealsOut` pour un plan personnel.
 *
 * ── ⛔ LE DÉFAUT QUE ÇA FERME, ET IL S'ÉCRIVAIT À L'ÉCRAN ─────────────────
 * `PlanEnergyDay.subject` existe pour une raison écrite noir sur blanc dans
 * `plan_energy.ts`: « si un repas sur trois est pris dehors, *ta journée:
 * 1 400* est FAUX ». Il bascule sur `mealsOut > 0`, et `mealsOut` venait de
 * `readViewerMealsOut` — qui, exactement comme `readViewerAway`, ne lit que la
 * trace de la lane FOYER.
 *
 * MESURÉ À L'ÉCRAN LE 2026-09-09 sur un plan personnel: l'en-tête du jour
 * disait **« 2 385 kcal sur la journée »** juste au-dessus de **« Au déjeuner,
 * vise autour de 700 »**. La première phrase revendique la journée entière; la
 * seconde annonce un repas qui n'y est pas. Deux phrases qui se contredisent à
 * trois centimètres l'une de l'autre.
 *
 * ⚠️ AUCUN kcal ICI, ET C'EST CE QUI L'AUTORISE HORS DES PORTES. C'est un
 * COMPTE de repas, pas un nombre sur un corps: il se calcule quel que soit
 * l'état des interrupteurs, exactement comme son jumeau du foyer. Quelqu'un qui
 * a éteint les calories doit quand même lire « sur les 2 repas que j'ai
 * composés ».
 *
 * ⛔ LA MÊME CEINTURE QUE LE CONSEIL: une case que le plan A COMPOSÉE n'est pas
 * un repas « dehors », quoi que dise la colonne. Les deux lectures doivent
 * compter le MÊME ensemble de cases — sinon l'écran annoncerait un repas dehors
 * sans conseil, ou l'inverse.
 */
export function selfMealsOutByDay(args: {
  /** Sa présence, telle que `selfPresenceFrom` l'a rendue. */
  away: MemberAway;
  /** Sa journée déclarée. `[]` ⇒ rien à compter: on ne devine aucun moment. */
  slots: readonly EatingOccasionSlot[];
  /** Les plats de ce plan, pour savoir ce qu'il a réellement composé. */
  dishes: ReadonlyArray<{ day: string | null; slot: string | null }>;
}): Map<string | null, number> {
  const out = new Map<string | null, number>();
  const composed = composedCells(args.dishes);
  const days = new Set<string>();
  for (const dish of args.dishes ?? []) {
    const day = String(dish?.day ?? "").trim();
    if (day) days.add(day);
  }
  for (const day of days) {
    let n = 0;
    for (const occasion of args.slots) {
      if (composed.has(cellKey(day, occasion.slot))) continue;
      if (presenceStateFor(args.away, day, occasion.slot as EatingOccasion) !== "eating_out") {
        continue;
      }
      n += 1;
    }
    if (n > 0) out.set(day, n);
  }
  return out;
}
