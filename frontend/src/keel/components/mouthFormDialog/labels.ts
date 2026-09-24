// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les libellés: l'exemple de chaque moment, les mots des directions, le nombre
// dans la langue de l'écran.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import { type MessageKey, t } from "../../i18n/t";
import { uiLocale } from "../../i18n/runtime";
import type { MemberGoal } from "../../api/household";
import type { EatingOccasion } from "../../api/mealGeneration";

/**
 * L'EXEMPLE DE CHAQUE MOMENT — `Record` COMPLET, jamais un repli.
 *
 * ⛔ PAS DE CLÉ GÉNÉRIQUE EN SECOURS. Il y en avait une, la même pour les six,
 * et c'est ce qui mettait « un café et deux tartines » sous DÎNER. Un repli
 * muet la réintroduirait au premier moment ajouté; le `Record` fait échouer la
 * compilation à la place.
 */
export const HABIT_PLACEHOLDERS: Record<EatingOccasion, MessageKey> = {
  breakfast: "household.mouth.habit_placeholder_breakfast",
  snack_am: "household.mouth.habit_placeholder_snack_am",
  lunch: "household.mouth.habit_placeholder_lunch",
  snack_pm: "household.mouth.habit_placeholder_snack_pm",
  dinner: "household.mouth.habit_placeholder_dinner",
  before_bed: "household.mouth.habit_placeholder_before_bed",
};

/**
 * LES MOTS DES TROIS DIRECTIONS — ET IL N'EN RESTE QU'UN JEU.
 *
 * ⟳ 2026-09-06 — PASSÉ DE `household.goal.*` À `setup.goal.*`. Deux libellés
 * pour les trois mêmes jetons vivaient à un doigt l'un de l'autre depuis que le
 * lot A5 (2026-09-03) a monté cette fiche dans l'étape 2 de l'entonnoir: la
 * carte du titulaire disait « Perdre du poids », la fiche de la personne qu'on
 * ajoute « Perte de masse grasse » — le même choix, deux registres, sur le même
 * écran. `GoalTiles` porte encore un `labelOf` par appelant (« les mots restent
 * à la page »), et cette règle valait tant qu'il y avait DEUX pages.
 *
 * ⛔ ET C'EST LE VOCABULAIRE CLINIQUE QUI TOMBE, PAS L'AUTRE. Sa justification
 * était écrite dans le catalogue et elle est MORTE: « forme nominale pour
 * toutes: ce sont des étiquettes dans une liste déroulante, pas des phrases ».
 * La liste déroulante n'existe plus — le chantier P3 l'a remplacée par des
 * tuiles le 2026-09-03. `/mealprep` avait déjà quitté ce registre le
 * 2026-09-01 (« le vocabulaire d'une fiche clinique »), et `plan.goal.*` porte
 * l'argument du mot retenu: « Perdre du poids » et pas « perdre du gras », le
 * second demandant de savoir ce qu'on perd, ce que personne ne sait avant de
 * commencer.
 *
 * ⚠️ LES CLÉS `household.goal.minor_*` NE BOUGENT PAS. Elles ne nomment pas une
 * direction: elles disent le pli de l'âge, et `GoalTiles` les écrit en littéral
 * pour les cinq sites d'un coup.
 */
export function goalLabel(goal: MemberGoal): string {
  return t(`setup.goal.${goal}` as "setup.goal.fat_loss");
}

/**
 * LA LISTE DE CE QUI MANQUE, DANS LA GRAMMAIRE DE LA LANGUE.
 *
 * ⚠️ PAS DE CLÉ i18n POUR LE SÉPARATEUR, ET LA GARDE DE PARITÉ L'A DIT AVANT
 * MOI. Une première version portait `household.mouth.block_join` = « , » dans
 * les deux packs: le test « ne recopie pas l'anglais pour faire verdir la CI »
 * l'a rougi, et il avait raison deux fois — une virgule n'est pas une
 * traduction, et un `join(", ")` rend « a, b, c » là où les deux langues
 * disent « a, b et c » / « a, b and c ».
 *
 * `Intl.ListFormat` connaît la règle des deux; il vient du même endroit que
 * `i18n/format.ts` (une seule autorité de locale, jamais `navigator.language`).
 */
// ⟳ `blockList` A DÉMÉNAGÉ DANS `lib/mouthForm.ts` — A5, 2026-09-03.
// La fiche d'une bouche sur `/app/household` rend le MÊME récapitulatif sous
// son cadre replié, et un `.join(", ")` recopié là-bas aurait rendu « a, b, c »
// là où les deux langues disent « a, b et c » / « a, b and c ». La grammaire
// est une règle de langue: elle vit dans le module partagé, pas dans un `.tsx`
// (que `react-refresh/only-export-components` interdit d'ailleurs d'exporter).

/**
 * LE NOMBRE DANS LA LANGUE DE L'ÉCRAN.
 *
 * `0.45` doit se lire « 0,45 » en français. `toLocaleString` sans argument
 * prendrait `navigator.language`, c'est-à-dire la langue du NAVIGATEUR et non
 * celle de la page — vingt-six sites du produit ont déjà divergé comme ça.
 */
export function pace(value: number): string {
  return value.toLocaleString(uiLocale() === "fr" ? "fr-FR" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
