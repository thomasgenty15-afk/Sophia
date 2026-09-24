// ⟳ 2026-09-24 — SORTI DE `StudentWeekPlanPage.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Le type partagé par la page et `PersonalNumbers`.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

/**
 * LES TROIS FAITS QUI NE BOUGENT PAS. Vides = jamais renseignés.
 *
 * `birthDate` et pas `age`: l'âge se déduit et se périme, la date non. Stocker
 * l'âge obligerait à le corriger chaque année, ce que personne ne fait — après
 * quoi le générateur compose pour quelqu'un qui a trois ans de moins.
 */
export interface Basics {
  height: string;
  birthDate: string;
  gender: string;
}
