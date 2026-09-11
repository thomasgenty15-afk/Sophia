import {
  type CookingStyle,
  type GroceryRunsAnswer,
  readCookingStyle,
  readGroceryRunsAnswer,
} from "./cookingPlan";
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
import type { PracticalConstraints } from "./practicalConstraints";
// ⚠️ LE MODULE DU MOTEUR, LU ET PAS RECOPIÉ — même geste que `household.ts`
// avec `student_age.ts`. Le plancher n'a pas de seconde version côté écran:
// une table de prix dupliquée diverge au premier ajustement, et c'est celle
// que personne ne regarde qui refuserait quelqu'un.
import {
  assessBudget,
  type BudgetFloorMouth,
  budgetMarketFor,
  budgetMouthDays,
  type BudgetVerdict,
} from "../../../../supabase/functions/_shared/keel/budget_floor.ts";
import { type AwayMark, presenceStateOf } from "../lib/presenceMarks";
import type { EatingOccasion, EatingOccasionSlot } from "./mealGeneration";

export type { BudgetFloorMouth, BudgetVerdict };
export { assessBudget };

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
  cookingTimeMin: number | null;
  /**
   * ⟳ P2 (2026-09-03) — LES DEUX RÉPONSES DURABLES DE LA CUISINE.
   *
   * ⚠️ REQUISES ET NULLABLES, jamais `?`: les deux sites de composition
   * (`/app/plan` et l'entonnoir) doivent remonter au compilateur, sinon l'un
   * d'eux écrirait sans elles et effacerait la réponse de l'autre.
   *
   * `null` = pas encore répondu, et il S'ÉCRIT. Omettre la clé laisserait un
   * compte qui vient d'effacer sa réponse avec l'ancienne — un réglage qu'on
   * ne peut plus retirer, la cicatrice « contrainte qu'on ne peut plus lever »
   * de `cook_days`, dix lignes plus bas.
   */
  cookingStyle: string | null;
  /**
   * ⟳ 2026-09-09 — `number | string`, PARCE QUE « peu importe » S'ÉCRIT COMME
   * UN JETON. Le champ vit dans le jsonb `practical_constraints`, qui ne
   * contraint pas la forme — c'est donc au type de dire que la colonne porte
   * maintenant deux natures, plutôt qu'à un `as` de le cacher.
   *
   * ⛔ ET PAS UN NOMBRE SENTINELLE (`0`, `-1`). Un sentinelle se lit comme une
   * valeur par tout ce qui compare, et `readGroceryRuns` le rendrait `null` un
   * jour et `0` un autre selon qui l'appelle.
   */
  groceryRuns: number | string | null;
}

/**
 * CE QUE LA MÊME LECTURE REND EN PLUS — 2026-09-01.
 *
 * ⛔ SÉPARÉ DE `PlanRequestInputs`, ET C'EST LA MOITIÉ QUI COMPTE. Les trois
 * champs du dessus sont ÉCRITS par `savePlanInputs`; l'inventaire de cuisine ne
 * l'est PAS — il se déclare à l'étape « table » de l'entonnoir
 * (`KitchenEquipmentCard`), et il est durable. Les fondre dans une seule forme
 * aurait fait passer, tôt ou tard, un `kitchen_equipment` dans le `patch` de
 * l'écriture — c'est-à-dire réécrire l'inventaire d'un foyer depuis un
 * formulaire de plan qui ne l'a jamais demandé.
 *
 * ⚠️ C'EST LA MÊME LIGNE DE BASE, PAS UN SECOND ALLER-RETOUR. La colonne est
 * déjà lue ici; en tirer aussi l'inventaire coûte zéro requête, alors qu'un
 * lecteur séparé en aurait coûté une par ouverture du formulaire.
 */
export interface PlanRequestFacts extends PlanRequestInputs {
  /**
   * LA COLONNE, BRUTE — pour ce que l'écran de plan doit LIRE sans l'écrire.
   *
   * ⚠️ ELLE EST RENDUE TELLE QUELLE, ET PAS PRÉ-DIGÉRÉE. Deux consommateurs en
   * ont besoin et ils n'en veulent pas la même chose: la porte de « tout dans
   * une session » veut l'inventaire PARSÉ (`readKitchenEquipment`), et
   * `KitchenEquipmentCard` veut la colonne pour PRÉ-COCHER ses pastilles. Poser
   * ici un champ parsé aurait obligé à en poser un second, brut, à la première
   * carte montée — c'est-à-dire deux lectures d'une même colonne.
   *
   * ⛔ ELLE NE SERT JAMAIS À ÉCRIRE. C'est une photo prise au montage, et
   * `mergePracticalConstraints` réécrit l'objet EN ENTIER: fusionner sur elle
   * effacerait tout ce qu'une autre surface a écrit depuis. Cicatrice payée
   * deux fois, documentée dans `api/kitchenEquipment.ts`.
   */
  /**
   * ⟳ P2 (2026-09-03) — LES DEUX RÉPONSES DURABLES, RELUES POUR PRÉ-REMPLIR.
   * `null` = pas encore répondu.
   */
  cookingStyle: CookingStyle | null;
  /** ⟳ 2026-09-09 — « peu importe » compris: c'est une réponse qui s'écrit. */
  groceryRuns: GroceryRunsAnswer | null;
  practicalConstraints: PracticalConstraints;
  /**
   * Y A-T-IL UNE LIGNE `student_goals` À METTRE À JOUR ?
   *
   * ⚠️ MESURÉ, PAS SUPPOSÉ. `mergePracticalConstraints` refuse un update qui
   * n'a touché AUCUNE ligne — PostgREST répond 204 sans corps ni erreur, et
   * l'écran affichait « Enregistré » sur une saisie partie nulle part. Une
   * carte montée sur cet écran doit pouvoir dire ce qui la lève AVANT le clic,
   * plutôt que d'échouer après.
   */
  hasGoal: boolean;
}

export async function readPlanInputs(userId: string): Promise<PlanRequestFacts> {
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
    // ⟳ P2 — RELUES POUR PRÉ-REMPLIR, avec LES parseurs du moteur. Une
    // seconde lecture du vocabulaire ferait un écran qui montre autre chose
    // que ce avec quoi on compose.
    cookingStyle: readCookingStyle(pc),
    groceryRuns: readGroceryRunsAnswer(pc),
    cookingTimeMin: Number.isFinite(time) && time > 0 ? time : null,
    practicalConstraints: pc as PracticalConstraints,
    // `data === null` = aucune ligne. `maybeSingle` rend `null` sans erreur, et
    // c'est le seul endroit où on le sait.
    hasGoal: data !== null,
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
      // ⟳ P2 — LA MÊME ROUTE QUE LE BUDGET: écrit avant de partir, relu par
      // le générateur dans `practical_constraints`. Le passer dans le corps
      // de la requête ferait deux sources pour un seul réglage, et c'est
      // toujours celle que l'écran ne montre pas qui gagne.
      cooking_style: inputs.cookingStyle,
      grocery_runs: inputs.groceryRuns,
      // ══════════════════════════════════════════════════════════════════
      // ⛔ ÉCRIT VIDE, ET C'EST LA MOITIÉ DE LA SUPPRESSION.
      // ══════════════════════════════════════════════════════════════════
      //
      // Le champ « les jours où tu cuisines » a été retiré des deux écrans le
      // 2026-09-01. Cesser simplement de l'écrire aurait laissé, sur tous les
      // comptes qui avaient répondu, une valeur qui CONTINUE de décider leurs
      // plans (`cookDayLines`, `addedCookDays`, `daysOutOfBatchReach` la lisent
      // en base) et que plus aucun écran ne peut changer. C'est la pire forme
      // de la cicatrice « port à null = champ incollectable »: pas un champ
      // qu'on ne peut plus remplir, une contrainte qu'on ne peut plus lever.
      //
      // ⚠️ `[]` ET « CLÉ ABSENTE » SONT ÉQUIVALENTS ICI, contrairement à
      // `kitchen_equipment`: `capacity.cookDays` retombe sur `[]` dans les deux
      // cas, et `cookDayLines` sort sur `declared.length === 0`. Il n'y a donc
      // pas de troisième valeur à préserver — écrire `[]` DIT ce que l'absence
      // dirait, à un endroit où on peut le lire.
      cook_days: [],
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

// ═══════════════════════════════════════════════════════════════════════════
// LE PLANCHER, CÔTÉ ÉCRAN — 2026-09-11
// ═══════════════════════════════════════════════════════════════════════════
//
// ── POURQUOI LE REFUS VIT ICI, ET PAS DANS LA FONCTION EDGE ───────────────
// Un budget impossible n'est pas une panne: c'est une réponse à une question
// posée. Le seul endroit où quelqu'un peut la corriger est le champ qui l'a
// posée, et ce dépôt a déjà payé trois fois la cicatrice « refus loin du geste
// = bouton mort » (`SetupPage`, 2026-09-06). Le serveur, lui, ne refuse pas: il
// CESSE d'écrire un plafond qu'aucun panier ne peut tenir, et il NOMME ce qu'il
// a fait sur la ligne — voir `meal_generation.ts`. Les deux moitiés lisent le
// même module et les mêmes prix, donc elles ne peuvent pas se contredire.
//
// ⛔ ET LES DEUX ÉCRANS QUI COMPOSENT PORTENT LE CHAMP. C'est l'invariant écrit
// en tête de ce fichier (« un écran qui composerait SANS montrer le champ
// ferait revenir le défaut du lieu »), et le plancher en dépend entièrement:
// il se rend à côté du champ, jamais ailleurs.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE MARCHÉ DE CE COMPTE, ou `null` hors de France et des États-Unis.
 *
 * ⚠️ LA SOURCE EST `profiles.country`, ET C'EST LA MÊME QUE LE PROMPT. Le
 * fuseau du navigateur (`countryFromTimezone`) sert à DÉDUIRE un pays à
 * l'inscription; s'en servir ici ferait bouger le plancher de quelqu'un qui
 * voyage, et diverger de ce que le serveur mesure au même instant.
 *
 * ⚠️ UNE PANNE DE LECTURE REND `null`, c'est-à-dire « pas de plancher » — et
 * pas un plancher français par défaut. Un refus posé sur une lecture ratée
 * refuserait quelqu'un pour une raison qui ne le concerne pas.
 */
export async function readBudgetMarket(userId: string): Promise<"fr" | "us" | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return budgetMarketFor((data as { country: string | null } | null)?.country ?? null);
}

/** Une bouche telle que les DEUX écrans de composition la connaissent. */
export interface PlanMouthPresence {
  /** Pour retrouver le titulaire, et pour rien d'autre ici. */
  memberId: string | null;
  /** `omnivore`, un des quatre régimes, ou `null` — la question jamais posée. */
  diet: string | null;
  /** `null` = aux moments de la maison, JAMAIS « ne mange rien ». */
  eatingSlots: readonly EatingOccasionSlot[] | null;
  /** ⚠️ LA COLONNE DU FOYER SEULE (`awayHousehold` / `mouth.away`). */
  away: readonly AwayMark[];
}

/**
 * LES BOUCHES DE CETTE DEMANDE, AVEC LEUR PART DE JOURNÉE.
 *
 * ⚠️ « DEHORS » ET « ABSENT » COMPTENT PAREIL ICI, et seulement ici: le
 * plancher parle d'ARGENT, et dans les deux cas le plan ne compose rien à
 * acheter. Ailleurs dans le produit les deux états se séparent, parce que ce
 * qui les distingue est ce que le produit DIT — un conseil chiffré pour un midi
 * dehors, le silence pour des vacances. Une liste de courses ne se dit pas.
 *
 * ⚠️ LE RYTHME DE LA MAISON EST LE REPLI, exactement comme la grille de
 * présence le fait deux lignes plus loin dans les mêmes écrans
 * (`member.eatingSlots ?? rhythm`). Un second repli ferait compter des journées
 * que la grille, elle, ne propose pas de marquer.
 */
export function budgetMouthsFor(args: {
  /** Les jours de la fenêtre, en jetons (`mon`…`sun`). */
  dayTokens: readonly string[];
  /** Les moments de la maison — le rythme de la personne qui compose. */
  houseSlots: readonly EatingOccasionSlot[];
  mouths: readonly PlanMouthPresence[];
  /**
   * LE TITULAIRE, ET SA PROPRE DÉCLARATION D'ABSENCE.
   *
   * ⛔ REQUIS TOUS LES DEUX, jamais `?`. D14 tient DEUX colonnes: ce que le
   * maître a marqué pour une bouche (`awayHousehold`) et ce que la personne a
   * déclaré pour elle-même (`practical_constraints.away_days`). Le moteur
   * compose sur l'UNION (`away.effective`); ne lire ici que la première ferait
   * un plancher TROP HAUT pour quelqu'un qui a dit « je suis absent trois
   * jours » — c'est-à-dire un refus contre un budget honnête, la seule
   * direction que ce module n'a pas le droit d'avoir.
   *
   * ⚠️ ET L'UNION NE SE FAIT QUE SUR SA LIGNE À LUI. Appliquée à tout le
   * monde, elle recopierait sa déclaration sur des bouches qui n'ont rien dit
   * — l'interdit écrit sur `awayHousehold`, dans l'autre sens.
   */
  selfMemberId: string | null;
  selfAway: readonly AwayMark[];
}): BudgetFloorMouth[] {
  return args.mouths.map((mouth) => {
    const rhythm = mouth.eatingSlots ?? args.houseSlots;
    const declaredSlots = rhythm.map((s) => s.slot);
    const away = mouth.memberId !== null && mouth.memberId === args.selfMemberId
      ? [...mouth.away, ...args.selfAway]
      : [...mouth.away];
    return {
      diet: mouth.diet,
      mouthDays: budgetMouthDays(
        args.dayTokens.map((day) => ({
          declaredSlots,
          askedSlots: declaredSlots.filter((slot) =>
            presenceStateOf(away, day, slot as EatingOccasion) === "at_table"
          ),
        })),
      ),
    };
  });
}
