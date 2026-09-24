// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// Les libellés des objectifs et des moments de repas.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import type { MemberGoal } from "../../api/household";
import { t, type MessageKey } from "../../i18n/t";

// ── LES TROIS TABLES DE LIBELLÉS, ET CE QUI A CHANGÉ ───────────────────────
//
// Elles portaient les DIX-NEUF PHRASES elles-mêmes, en dur. Le compilateur les
// gardait complètes (`Record<MemberGoal, string>` réclame un mot par objectif),
// et c'est justement ce qui les rendait invisibles: elles avaient l'air d'être
// tenues. Mais un `const` de module est figé à la langue du bundle — `t()` ne
// peut pas y être appelé, la règle MODULE_SCOPE_T du lint le refuse et elle a
// raison —, donc dix-neuf mots anglais survivaient au milieu d'un formulaire
// français.
//
// Les tables gardent leur complétude et changent de contenu: elles portent des
// CLÉS, et la résolution se fait à l'appel, dans les trois accesseurs
// ci-dessous. Un objectif ajouté sans son mot ne compile toujours pas.
const GOAL_KEYS: Record<MemberGoal, MessageKey> = {
  fat_loss: "setup.goal.fat_loss",
  muscle_gain: "setup.goal.muscle_gain",
  // Trois clés retirées le 2026-08-18 avec leurs jetons. Le `Record` est
  // COMPLET sur les trois qui restent — c'est lui qui refuse de compiler le
  // jour où un quatrième objectif arrive sans son mot.
  maintenance: "setup.goal.maintenance",
};

const OCCASION_KEYS: Record<string, MessageKey> = {
  breakfast: "setup.occasion.breakfast",
  snack_am: "setup.occasion.snack_am",
  lunch: "setup.occasion.lunch",
  snack_pm: "setup.occasion.snack_pm",
  dinner: "setup.occasion.dinner",
  before_bed: "setup.occasion.before_bed",
};

export function goalLabel(goal: MemberGoal): string {
  return t(GOAL_KEYS[goal]);
}

/* ⟳ 2026-09-20 — `funnelMouthAgeState` EST PARTIE DANS
   `lib/mouthCardTarget.ts`, avec la décision qu'elle sert: c'est l'âge qui
   décide de la direction, et la direction qui décide si une cible a le droit
   d'exister. Elle reste importée ici — deux appelants la lisent encore. */

/**
 * Les deux suivants gardent le repli sur le JETON BRUT qu'avait le `??` des
 * tables d'origine, et c'est délibéré: les créneaux et les jours viennent de
 * `api/mealGeneration.ts`, et un jeton neuf ajouté là-bas doit se voir à
 * l'écran plutôt que faire tomber le formulaire d'inscription de quelqu'un.
 * C'est la même posture que `allergenLabel` — jamais un écran vide pour un mot
 * manquant.
 */
export function occasionLabel(slot: string): string {
  const key = OCCASION_KEYS[slot];
  return key ? t(key) : slot;
}
