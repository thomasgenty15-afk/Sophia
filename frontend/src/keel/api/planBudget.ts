// KEEL — L'ARGENT DE CE PLAN-LÀ, LU ET ÉCRIT EN UN SEUL ENDROIT.
//
// ── CE QUE CE FICHIER REMPLACE, ET POURQUOI ────────────────────────────────
// Le budget était `practical_constraints.budget_band`: trois mots — « serré /
// normal / confortable » — saisis UNE FOIS dans « À propos de toi », puis
// appliqués en silence à toutes les semaines suivantes.
//
// Deux défauts, et ils sont indépendants.
//
// LE MOT. Il part au modèle tel quel. « Serré » pour une personne seule et
// « serré » pour une table de cinq ne désignent ni la même somme, ni le même
// arbitrage — et c'est l'arbitrage qui est demandé: quand il n'y a pas
// d'argent, on ne « fait pas attention », on RENONCE À LA VIANDE. Un montant se
// compare à un panier; un adjectif ne se compare à rien.
//
// LE LIEU. Un réglage de profil vaut pour la semaine où on reçoit du monde, pour
// celle d'après les vacances et pour celle d'avant la paie, sans que personne ne
// l'ait jamais redit. La question appartient donc à LA COMPOSITION — décision
// humaine du 2026-08-13 — et se pose sur chaque écran qui compose.
//
// ── POURQUOI LA VALEUR EST QUAND MÊME CONSERVÉE ───────────────────────────
// Pour PRÉ-REMPLIR la prochaine, et pour rien d'autre. C'est un défaut proposé,
// pas un réglage caché: le champ est sur l'écran qui lance la composition, il
// porte le chiffre de la dernière fois, et il est modifiable avant de partir.
// La distinction tient à ça et elle est fragile — un écran qui composerait SANS
// montrer le champ ferait revenir le défaut du « lieu » à l'identique.
//
// ── PAS DE DEVISE, ET C'EST DÉLIBÉRÉ ──────────────────────────────────────
// Le chiffre est dans la monnaie du pays de l'élève. Le prompt porte déjà
// `country` (il en a besoin pour les saisons), donc le modèle sait de quelle
// monnaie il s'agit. Une table pays → devise serait une LISTE FERMÉE de plus:
// `api/countries.ts` explique pourquoi ce dépôt n'en garde pas — elle refuse un
// pays légitime le jour où quelqu'un s'y inscrit.

import { supabase } from "../../lib/supabase";
import { mergePracticalConstraints } from "./practicalConstraints";

/**
 * LE PLAFOND DE SAISIE, ET SON AUTORITÉ EST LE SERVEUR.
 *
 * Il ne juge le train de vie de personne: il attrape le zéro de trop — « 5000 »
 * tapé pour « 500 » — avant qu'il ne parte au modèle comme une consigne, où il
 * ne produit pas une erreur mais un plan au homard.
 *
 * ⚠️ LA COPIE QUI DÉCIDE EST CELLE DE DENO
 * (`supabase/functions/_shared/keel/meal_generation.ts#BUDGET_MAX`): c'est elle
 * qui filtre ce qui entre dans le prompt, donc un client plus permissif ne peut
 * rien faire passer. Celle-ci existe pour que le champ refuse AVANT d'écrire,
 * plutôt que de laisser quelqu'un composer avec un montant que le moteur
 * ignorera en silence.
 *
 * ⚠️ ET ELLE EST ICI, PAS DANS `onboarding.ts`. Ce module-là porte la copie de
 * l'entonnoir (allergènes, objectifs, motifs); l'importer depuis
 * `MealBuilder` ou la page du foyer traînait tout ce vocabulaire dans des
 * pages qui ne le déclarent pas — la garde de coutures de `pageSeams` l'a
 * attrapé le jour même.
 */
export const BUDGET_MAX = 5000;

/**
 * COMBIEN DE TEMPS ON PASSE À CUISINER, EN CHOIX FERMÉS.
 *
 * ── POURQUOI PAS UN NOMBRE LIBRE ──────────────────────────────────────────
 * Le champ était un `<input type="number">` de 5 à 240, et personne ne sait
 * quoi y écrire: « 37 » n'est pas une réponse qu'un humain a. Le moteur, lui,
 * n'en fait rien de précis — `meal_generation.ts` écrit littéralement
 * « time per cooking session: about ${n} minutes ». Un nombre exact y est donc
 * une FAUSSE PRÉCISION: on demande un chiffre au décimal près pour le rendre
 * flou une ligne plus loin.
 *
 * Six durées qu'on reconnaît, de la demi-heure de semaine aux trois heures du
 * dimanche. Le plafond du moteur est 240 (`Math.min(240, …)`), et le plus
 * grand choix reste dessous exprès: proposer une valeur que le lecteur rogne
 * ferait afficher un chiffre et en composer un autre.
 */
export const COOKING_SESSION_MINUTES: readonly number[] = [30, 45, 60, 90, 120, 180];

/**
 * UNE DURÉE, DÉCOUPÉE POUR ÊTRE DITE — pas formatée ici.
 *
 * Rend le NOMBRE et son UNITÉ séparément, parce que les mots appartiennent au
 * catalogue de langue et pas à ce module. Écrire « 1 hr » ici ferait une
 * étiquette anglaise qu'aucune traduction ne pourrait reprendre — la cicatrice
 * `optout-confirmation-hardcoded-french`, dans l'autre sens.
 *
 * Une valeur hors des choix (quelqu'un a saisi 37 sur `/app/plan`, dont la
 * carte garde son champ libre) rend ses minutes telles quelles: on préfère
 * afficher « 37 min » que faire semblant qu'elle n'existe pas.
 */
export function cookingTimeParts(
  minutes: number,
): { unit: "minutes" | "hours"; value: string } {
  if (minutes >= 60 && minutes % 60 === 0) {
    return { unit: "hours", value: String(minutes / 60) };
  }
  // La demi-heure se dit « 1½ », jamais « 1.5 »: c'est une durée lue par un
  // humain, pas une mesure.
  if (minutes > 60 && minutes % 30 === 0) {
    return { unit: "hours", value: `${Math.floor(minutes / 60)}½` };
  }
  return { unit: "minutes", value: String(minutes) };
}


/**
 * LE MONTANT DE LA DERNIÈRE FOIS, ou `null` s'il n'y en a pas encore.
 *
 * Les mêmes bornes que `canGenerate` — et c'est volontairement le MÊME
 * prédicat, importé, pas une seconde arithmétique: deux lectures de la même
 * borne divergent au premier ajustement, et celle qui pré-remplit un champ
 * proposerait alors une valeur que celle qui garde refuse.
 */
export function isUsableBudgetAmount(amount: unknown): amount is number {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 && n <= BUDGET_MAX;
}

/**
 * LES TROIS ENTRÉES D'UNE DEMANDE DE PLAN, lues ensemble.
 *
 * ── POURQUOI ELLES VOYAGENT ENSEMBLE DEPUIS LE 2026-08-13 ────────────────
 * Les jours de cuisine et la durée d'une session vivaient dans « À propos de
 * toi », à côté du niveau de recette — donc décidés UNE FOIS et appliqués à
 * toutes les semaines suivantes, y compris celle où on travaille le dimanche.
 * Ce sont des propriétés du PLAN qu'on fabrique, pas de la personne, et elles
 * rejoignent le budget: posées sur l'écran qui compose, pré-remplies avec la
 * dernière réponse.
 *
 * Ce qui RESTE dans « À propos de toi » est ce qui décrit vraiment quelqu'un:
 * le niveau de recette qu'il veut, la répétition qu'il accepte.
 */
export interface PlanRequestInputs {
  budgetAmount: number | null;
  cookDays: string[];
  cookingTimeMin: number | null;
}

export async function readPlanInputs(userId: string): Promise<PlanRequestInputs> {
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[keel/planBudget] ${error.message}`);
  const pc = (data?.practical_constraints ?? {}) as Record<string, unknown>;
  const time = Number(pc.cooking_time_min);
  return {
    budgetAmount: isUsableBudgetAmount(pc.budget_amount)
      ? Number(pc.budget_amount)
      : null,
    cookDays: Array.isArray(pc.cook_days) ? pc.cook_days.map(String) : [],
    cookingTimeMin: Number.isFinite(time) && time > 0 ? time : null,
  };
}

/**
 * ÉCRIT LES TROIS, EN FUSIONNANT — même discipline que `saveBudgetAmount`: la
 * photo la plus fraîche possible est celle qu'on prend soi-même, juste avant.
 */
export async function savePlanInputs(
  userId: string,
  inputs: PlanRequestInputs,
): Promise<void> {
  if (!isUsableBudgetAmount(inputs.budgetAmount)) {
    throw new Error(`[keel/planBudget] budget hors bornes: ${inputs.budgetAmount}`);
  }
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[keel/planBudget] ${error.message}`);
  await mergePracticalConstraints({
    userId,
    current: (data?.practical_constraints ?? {}) as Record<string, unknown>,
    patch: {
      budget_amount: inputs.budgetAmount,
      cook_days: inputs.cookDays,
      cooking_time_min: inputs.cookingTimeMin,
    },
    source: "planInputs",
  });
}

export async function readBudgetAmount(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[keel/planBudget] ${error.message}`);
  const pc = (data?.practical_constraints ?? {}) as Record<string, unknown>;
  const raw = pc.budget_amount;
  return isUsableBudgetAmount(raw) ? Number(raw) : null;
}

/**
 * ÉCRIT LE MONTANT, EN FUSIONNANT — jamais en remplaçant la colonne.
 *
 * ⚠️ LA LECTURE EST FAITE ICI, JUSTE AVANT. `practical_constraints` est un
 * jsonb partagé par le rythme, les jours de cuisine, les absences, le régime et
 * les accusés d'allergie: écrire à partir d'une photo que l'écran a prise à son
 * montage efface tout ce qui a bougé depuis, sans un bruit. La photo la plus
 * fraîche possible est celle qu'on prend soi-même.
 */
export async function saveBudgetAmount(
  userId: string,
  amount: number,
): Promise<void> {
  if (!isUsableBudgetAmount(amount)) {
    throw new Error(`[keel/planBudget] montant hors bornes: ${amount}`);
  }
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[keel/planBudget] ${error.message}`);
  await mergePracticalConstraints({
    userId,
    current: (data?.practical_constraints ?? {}) as Record<string, unknown>,
    patch: { budget_amount: amount },
    source: "planBudget",
  });
}
