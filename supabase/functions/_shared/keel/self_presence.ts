/**
 * LA PRÉSENCE DU TITULAIRE, DEPUIS SES DEUX COLONNES — 2026-09-09.
 *
 * Le moteur compose contre l'UNION de:
 *   · `student_goals.practical_constraints.away_days` — ce que la personne a
 *     écrit pour elle-même dans la grille (`MealPickerGrid` est l'autorité);
 *   · `household_members.away_days` de SA ligne — ce que le maître y a marqué.
 *
 * ⛔ ON RELIT LES MÊMES DEUX SOURCES, PAR LE MÊME PARSEUR (`parseMemberAway`).
 * Une seconde idée de « qui est absent » ferait le défaut que ce dépôt paie en
 * boucle: deux lectures de la même donnée, et c'est celle qu'on relit le moins
 * qui garde l'ancien sens.
 *
 * ⟳ 2026-09-24 — le compte des repas « dehors » (`selfMealsOutByDay`) et la
 * garde des cases composées qui le servaient sont partis avec l'état « dehors ».
 *
 * PURE: no I/O, no clock, no randomness.
 */

import { type MemberAway, parseMemberAway } from "./household_presence.ts";

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
