/**
 * LA BIFURCATION — une cuisson, des portions qui divergent. PUR.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §3 et §7.1.
 *
 * C'est l'intersection vide du marché: les apps de batch cooking optimisent la
 * session mais n'ont AUCUN modèle nutritionnel par personne; les apps
 * nutritionnelles ont le modèle par personne mais aucun modèle de cuisson. Le
 * père en sèche et le fils en prise de masse dans la même casserole n'existe
 * nulle part. Ce module est la moitié qui manque aux deux.
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER ────────────────────────────────
 * Une consigne de portion est une INSTRUCTION DE SERVICE, jamais un
 * diagnostic. « Marc : 1,5 part, féculent en plus » — pas « parce que tu es en
 * prise de masse », pas « 2 400 kcal ».
 *
 * Deux raisons distinctes, et il faut les deux:
 *
 *   1. CONFIDENTIALITÉ. `member_portions` est lisible par TOUT le foyer (c'est
 *      le but: on sert à table). Faire figurer la raison y divulguerait
 *      l'objectif d'un membre à ses colocataires. `household.ts` autorise
 *      l'instruction en public précisément parce que le pourquoi n'y est pas —
 *      les deux modules tiennent la même promesse par les deux bouts.
 *
 *   2. LES MINEURS. Expliquer à un enfant que sa part est plus petite « pour
 *      son poids » est à une phrase d'un dégât réel (§8.4). Le registre est
 *      éducatif, jamais correctif sur le corps.
 *
 * D'où `sanitizePortionNote`, qui n'est pas une politesse: c'est une ceinture
 * déterministe sur du texte de modèle, du même genre que le verrou de
 * doctrine, et elle utilise LE MÊME moteur (`forbidden_matcher.ts`) plutôt
 * qu'une seconde implémentation qui divergerait.
 *
 * ── NI UN MINEUR, NI UNE BOUCHE SANS ÂGE N'ONT D'OBJECTIF ────────────────
 * Deux cas, une seule conséquence: aucune direction dérivée d'un objectif.
 *
 *   MINEUR    — la ceinture est en amont (`student_age.ts`, `weekPlanAgeGate`);
 *               ici on ne fait que ne pas pouvoir la contourner.
 *   ÂGE INCONNU — le cas NEUF, et celui qui compte. Depuis que le compte maître
 *               saisit des bouches à la main, une ligne peut n'avoir aucune
 *               date. L'ancienne garde traitait « pas de date » comme
 *               « majeur » et aurait servi une direction d'adulte à un enfant
 *               dont personne n'avait renseigné l'âge. `goalApplies` refuse les
 *               deux, et c'est `household.ts` qui porte la règle — un seul
 *               endroit, parce que l'écran la lit aussi.
 */

import { goalApplies, type MemberAgeState } from "./household.ts";
import { GOAL_TOKENS, type GoalToken } from "./tokens.ts";
// ⛔ L8 — LA PORTE TCA EST IMPORTÉE, JAMAIS RÉÉCRITE. `energy_gate.ts` est en
// LECTURE SEULE pour ce lot: il porte la seule écriture de la chaîne ①②③, et ce
// fichier s'inscrit à la main dans son allowlist d'appelants
// (`energy_gate_mouth_test.ts`, clause C3). Recopier les trois `if` ici ferait
// les deux points de décision que le module interdit en toutes lettres.
import {
  canSizeFromTarget,
  type CountingStance,
  energySafetyGates,
} from "./energy_gate.ts";
import { KEEL_MINOR_AGE, type BirthDateVerdict } from "./student_age.ts";
import type { MouthBody } from "./meal_envelope.ts";
// L8 — LE RYTHME **EXÉCUTÉ**, pas celui que le curseur autorise. Voir
// `mouthTargetFactor`: c'est toute la différence entre un grammage tenable et
// une promesse que la casserole ne livre pas.
import {
  executedPaceFor,
  type ExecutedPace,
  type PaceSubject,
  type ScaleDirection,
  scaleDirectionOf,
} from "./weight_pace.ts";
import { findForbiddenMatches, type ForbiddenTerm } from "./forbidden_matcher.ts";
import { householdBodyFacts, type MealBodyContext } from "./meal_body.ts";
// G4 — LE MODULE DES HABITUDES EST IMPORTÉ, JAMAIS RECOPIÉ. Le fragment de
// ligne et sa phrase de conséquence vivent avec la lecture du jsonb: deux
// endroits qui écriraient le marqueur `has their own` finiraient par en écrire
// deux formes différentes, et la conséquence ne s'attacherait plus à rien.
import {
  habitFragment,
  habitNoteFragment,
  HABIT_CONSEQUENCE,
  type MemberHabit,
} from "./household_habits.ts";
// LA TAILLE D'UN MOMENT VIENT DU MOTEUR, ELLE N'EST PAS REDÉCLARÉE ICI. Une
// seconde union `"small" | "medium" | "large"` écrite dans ce fichier
// divergerait de `MEAL_SIZES` au premier ajustement, et c'est ce fichier-là qui
// écrit la ligne du prompt — donc c'est lui qui aurait tort en silence.
import type { EatingOccasion, EatingOccasionSlot } from "./meal_generation.ts";

/**
 * Reflet du CHECK `household_members_goal_check`, lui-même aligné sur
 * `student_goals_goal_check` — trois valeurs depuis la migration
 * `20260818100000`.
 *
 * ⚠️ CE N'EST PLUS UNE SECONDE LISTE. Elle est dérivée de `GOAL_TOKENS`, qui
 * est le vocabulaire du dépôt: deux copies d'une énumération fermée est le
 * mode d'échec que `tokens.ts` documente en tête de fichier, et celle-ci en
 * était une — elle a survécu au passage de six à trois uniquement parce que le
 * lot est allé la chercher.
 */
export const MEMBER_GOALS = GOAL_TOKENS;
export type MemberGoal = GoalToken;

export interface PortionMember {
  /**
   * L'identité de la bouche, PAS son compte. Une bouche sans compte en a un;
   * c'est tout l'objet du re-clavetage du 2026-08-10.
   */
  memberId: string;
  displayName: string;
  /**
   * `null` = aucune direction dérivée d'un objectif. Vrai pour tout mineur,
   * pour toute bouche dont l'âge est inconnu, et pour tout majeur qui n'a rien
   * déclaré.
   */
  goal: MemberGoal | null;
  /** Trois états. Sert le libellé d'âge et la garde, jamais un calcul. */
  ageState: MemberAgeState;
  /**
   * CE QU'ON SAIT DE SON CORPS — lot 3B.
   *
   * `null` pour une bouche sans compte (les mesures et le profil restent clés
   * sur `auth.users`), pour un compte dont la lecture a échoué, et pour un
   * compte qui n'a rien saisi. Les trois se ressemblent volontairement: voir
   * `buildPortionBrief`.
   *
   * ⚠️ REQUIS, jamais optionnel. « Paramètre de garde optionnel = garde
   * désarmée » est une leçon déjà payée par ce dépôt: un champ facultatif
   * n'aurait fait remonter aucun appelant au compilateur, et le lot serait
   * construit sans être branché — le mode d'échec n°1 d'ici.
   */
  body: MealBodyContext | null;
  /**
   * LES MOMENTS OÙ CETTE BOUCHE MANGE — `null` quand personne ne l'a dit.
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME ──────────────────────────────────────
   * Le rythme était UNE valeur, posée sur la ligne du maître, et l'écran
   * l'assumait: « demandé une fois, pour toute la maison ». Un ado qui saute
   * le petit-déjeuner et un petit qui goûte à 16 h recevaient donc la même
   * journée — et le foyer composait un repas pour quelqu'un qui n'en prend
   * pas.
   *
   * ⚠️ `null` ET TABLEAU VIDE NE VEULENT PAS DIRE LA MÊME CHOSE, et la base
   * refuse le second (`empty_rhythm`). `null` = « personne ne l'a dit » ⇒
   * cette bouche mange aux moments de la maison, ce qui est le repli du
   * produit et pas une supposition sur elle. Un tableau vide dirait « elle ne
   * mange jamais », et aucun écran ne doit pouvoir l'écrire par inadvertance.
   *
   * ⚠️ REQUIS, jamais optionnel — même raison que `body` ci-dessus: un champ
   * facultatif ne fait remonter aucun appelant au compilateur, et le lot se
   * construit sans être branché.
   *
   * ── LA TAILLE VOYAGE AVEC LE MOMENT (2026-08-14) ──────────────────────
   * C'était `readonly string[]`, et la taille tombait ici. Un compte pouvait
   * dire « gros dîner » (`rhythmLines`, lane individuelle); une bouche du
   * foyer disait seulement QUAND. Le champ porte donc le même
   * `EatingOccasionSlot` que le reste du moteur — le type auquel
   * `parseEatingRhythm` rend déjà — et `buildPortionBrief` dit la taille sur
   * la ligne où il dit le moment. Sans ça, cet écran aurait demandé une
   * donnée que personne ne lit, la faute exacte que ce chantier a corrigée
   * deux fois.
   */
  eatingSlots: readonly EatingOccasionSlot[] | null;
  /**
   * G4 — CE QU'ELLE MANGE QUAND ELLE NE MANGE PAS LE PLAT DE LA MAISON.
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME, ET IL A UNE DATE ────────────────────
   * Un plan réel a servi des ŒUFS BROUILLÉS SEPT MATINS D'AFFILÉE à une femme
   * qui mange une pomme. Le plan n'a pas ignoré son habitude: personne ne la
   * lui a demandée, et il n'existait aucun champ pour la ranger. `body` savait
   * sa taille, `eatingSlots` savait qu'elle prend un petit-déjeuner — rien ne
   * savait ce qu'elle y mange.
   *
   * ⚠️ `[]` EST LE CAS MAJORITAIRE, ET IL N'Y A PAS DE `null`. Contrairement à
   * `eatingSlots`, les deux valeurs diraient ici la MÊME chose: « personne n'a
   * rien dit » et « elle mange le plat de la maison partout » produisent le
   * même prompt, la même assiette et la même liste de courses. Deux
   * représentations d'un seul fait finissent toujours par être testées à
   * moitié; celle-ci n'en a qu'une.
   *
   * ⚠️ REQUIS, jamais optionnel — même raison que `body` et `eatingSlots`
   * au-dessus. Un `?` n'aurait fait remonter aucun appelant au compilateur, et
   * le lot se serait construit sans être branché: la table remplie, l'écran
   * livré, et le brief inchangé.
   */
  habits: readonly MemberHabit[];
  /**
   * G4 — SA LIGNE LIBRE, ou `null`. UNE ligne, durable, par bouche (B3).
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — la troisième fois dans cette
   * interface. `null` dit « elle n'a rien ajouté »; `""` ne doit jamais arriver
   * ici, la garde d'entrée le rend `null`.
   *
   * ⚠️ ELLE A DÉJÀ PASSÉ `readHabitText` QUAND ELLE ARRIVE. Ce module n'ouvre
   * aucune seconde garde de texte: `gateMemberHabits` est la porte, et une
   * seconde ici divergerait de la première dans la semaine.
   */
  habitNote: string | null;
}

export interface PreparationShare {
  preparationId: string;
  note: string;
}

export interface MemberPortion {
  memberId: string;
  displayName: string;
  /**
   * `null` = part standard. DÉLIBÉRÉMENT PAS une phrase par défaut: une phrase
   * écrite ici serait dans UNE langue, et ce dépôt a déjà payé « confirmation
   * STOP codée en dur en français ». L'écran rend son propre libellé.
   */
  portionNote: string | null;
  preparationShares: PreparationShare[];
}

/**
 * LA DIRECTION DE SERVICE, par objectif. En anglais parce que c'est la langue
 * du prompt (`MEAL_PROMPT_VERSION`, dont le préfixe est `meal.en.`), et ces
 * phrases ne sont JAMAIS montrées à l'utilisateur — elles instruisent le
 * modèle, qui rend ensuite la consigne dans la langue de l'élève.
 *
 * La version EXACTE n'est plus recopiée ici: elle a bougé au premier chantier
 * qui a touché la consigne (FF-030), et une valeur figée dans un commentaire
 * survit toujours à sa cause. Ce qui compte est le `en`, et il est dans le
 * préfixe.
 *
 * Aucune ne nomme une raison. « bigger share of the protein » se lit à table;
 * « because you are cutting » se lirait aussi, et par tout le monde.
 */
export const SERVING_DIRECTION: Record<MemberGoal, string> = {
  fat_loss:
    "generous vegetables, full protein share, smaller starch share",
  // ── LES QUATRE NUANCES SE REPLIENT ICI (2026-08-18) ──────────────────────
  // `recomposition`, `performance` et `health` avaient chacune leur chaîne, et
  // ce fichier porte la MESURE qui justifie le repli: `health` a rendu
  // EXACTEMENT cette chaîne-ci pendant des semaines sans que rien n'échoue.
  // Les trois autres en étaient à un mot près — « full protein share, moderate
  // starch, generous vegetables » et « generous vegetables, balanced protein
  // and starch share » demandent la même chose à la casserole une fois lues
  // par `readServingDemands`, qui est le seul lecteur qui compte.
  //
  // CE QUI SE PERD, ET IL FAUT LE NOMMER: « larger starch share around
  // training » (`performance`). C'était la seule des quatre à demander
  // quelque chose de distinct — et elle le demandait « autour de
  // l'entraînement », c'est-à-dire une information que le produit ne collecte
  // pas (jours d'entraînement déclarés: aucun). Une consigne conditionnée à
  // une donnée absente est une consigne inconditionnelle, et celle-ci servait
  // donc du féculent en plus tous les jours à qui cochait « performance ».
  maintenance:
    "balanced share of every component",
  muscle_gain:
    "larger protein and starch share, same vegetables",
};

/**
 * L'ASSIETTE DE QUI N'A RIEN DÉCLARÉ — nommée à part, exprès.
 *
 * Elle valait `SERVING_DIRECTION.maintenance`. La chaîne est la même
 * aujourd'hui, et c'est correct: ne rien déclarer, c'est demander l'équilibre.
 * Mais l'emprunter COUPLAIT le repli à un objectif: changer ce que dit
 * `maintenance` déplaçait en silence l'assiette de tous ceux qui n'ont pas
 * d'objectif. Deux intentions différentes méritent deux noms, même quand elles
 * disent la même chose.
 */
export const NEUTRAL_DIRECTION = "balanced share of every component";

/** Ce qu'on dit d'un mineur au modèle. Une taille, jamais une direction. */
export const CHILD_DIRECTION = "child-size share of the same dish";

// ---------------------------------------------------------------------------
// D6 — CE QU'UNE DIRECTION DE SERVICE DEMANDE, AXE PAR AXE
//
// ⚠️ LE TABLEAU N'EST PAS ÉCRIT À LA MAIN: IL EST *LU* DANS LES CHAÎNES
// CI-DESSUS. C'est la seule forme qui ne peut pas dériver. Une table
// `Record<MemberGoal, {protein: …}>` recopiée à côté aurait raconté ce que les
// chaînes disaient LE JOUR OÙ ON L'A ÉCRITE — et le dépôt a déjà mesuré
// « `health` rendait la chaîne de `maintenance` » sans que rien n'échoue.
// Ici, changer une direction change mécaniquement ce que la fusion en déduit.
//
// ── POURQUOI CE MODULE, ET PAS `household_merge.ts` ─────────────────────────
// Parce que les chaînes vivent ICI. Lire `SERVING_DIRECTION` depuis ailleurs
// pour en refaire une table serait exactement la seconde définition qu'on
// refuse. Ce qui DÉCIDE de la fusion est ailleurs; ce qui LIT une direction est
// ici, avec la direction.
//
// ── CE QUE LA GRAMMAIRE COUVRE, ET RIEN DE PLUS ─────────────────────────────
// Un qualificatif gouverne les noms d'axes qui le SUIVENT, jusqu'au prochain
// qualificatif. Les six chaînes s'y rangent, et le test le prouve axe par axe:
//
//   « generous vegetables, full protein share, smaller starch share »
//      generous → légumes · full → protéine · smaller → féculent
//   « larger protein and starch share, same vegetables »
//      larger → protéine ET féculent · same → légumes
//   « balanced share of every component »   → les trois d'un coup
//
// ⚠️ CE N'EST PAS UN MATCHER SUR DU TEXTE ALIMENTAIRE. « laitue ≠ lait » est
// une cicatrice de ce dépôt, et elle vise l'appariement d'INGRÉDIENTS écrits
// par un modèle. Ici on lit SIX constantes anglaises que ce fichier écrit
// lui-même, dans un vocabulaire fermé de dix mots. Le jour où une direction
// sort de ce vocabulaire, la lecture rend `unreadable` — jamais une valeur
// devinée — et `unreadable` fait RENONCER la fusion au niveau ①.
// ---------------------------------------------------------------------------

/** Les trois composants qu'une direction de service sait nommer. */
export const SERVING_AXES = ["protein", "starch", "vegetables"] as const;
export type ServingAxis = (typeof SERVING_AXES)[number];

/**
 * L'ÉCHELLE, DU MOINS AU PLUS. L'ordre EST le sens: `mergeLadder` compare des
 * rangs, et « plus que ce que la table demande » est la seule chose qu'une
 * casserole déjà composée ne peut pas rendre.
 */
export const SERVING_DEMANDS = [
  "smaller",
  "moderate",
  "balanced",
  "full",
  "larger",
] as const;
export type ServingDemand = (typeof SERVING_DEMANDS)[number];

/**
 * `null` = l'axe n'est pas nommé par la direction, donc elle n'en demande
 * RIEN — n'importe quelle part convient. `"unreadable"` = l'axe est nommé mais
 * la grammaire ci-dessus n'a pas su dire combien; c'est un échec de LECTURE, et
 * il se traite comme un conflit (direction sûre: on descend d'un barreau).
 */
export type AxisDemand = ServingDemand | "unreadable" | null;
export type ServingAxisDemands = Record<ServingAxis, AxisDemand>;

/** `share of every component` — le raccourci qui gouverne les trois axes. */
const EVERY_COMPONENT = "component";

const QUALIFIERS: Record<string, ServingDemand> = {
  generous: "larger",
  larger: "larger",
  full: "full",
  moderate: "moderate",
  balanced: "balanced",
  // « same vegetables » = la part de tout le monde, donc l'équilibre.
  same: "balanced",
  smaller: "smaller",
};

const AXIS_WORDS: Record<string, ServingAxis> = {
  protein: "protein",
  starch: "starch",
  vegetable: "vegetables",
  vegetables: "vegetables",
};

export const NO_DEMAND: ServingAxisDemands = Object.freeze({
  protein: null,
  starch: null,
  vegetables: null,
});

/**
 * CE QU'UNE DIRECTION DEMANDE, AXE PAR AXE. Lecture, jamais recopie.
 *
 * Un axe nommé sans qualificatif devant lui rend `"unreadable"`: on ne devine
 * pas. La direction d'erreur est choisie — un axe illisible fait renoncer la
 * fusion au niveau ①, ce qui coûte un plat de plus et jamais une assiette qui
 * ment.
 */
export function readServingDemands(direction: string): ServingAxisDemands {
  const out: ServingAxisDemands = { protein: null, starch: null, vegetables: null };
  const words = String(direction ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let current: ServingDemand | null = null;
  for (const word of words) {
    const qualifier = QUALIFIERS[word];
    if (qualifier) {
      current = qualifier;
      continue;
    }
    if (word === EVERY_COMPONENT) {
      for (const axis of SERVING_AXES) out[axis] = current ?? "unreadable";
      continue;
    }
    const axis = AXIS_WORDS[word];
    if (!axis) continue;
    out[axis] = current ?? "unreadable";
  }
  return out;
}

/**
 * CE QUE CETTE BOUCHE DEMANDE À LA CASSEROLE.
 *
 * ⚠️ L'ORDRE DES CAS EST LE MÊME QUE DANS `servingDirectionFor`, ET CE N'EST
 * PAS UNE COÏNCIDENCE: c'est la MÊME décision, lue deux fois. `goalApplies`
 * d'abord — il porte la règle du mineur ET celle de l'âge inconnu — puis le
 * repli, qui pour un mineur est une TAILLE (`CHILD_DIRECTION`) et pour tout le
 * monde une part équilibrée.
 *
 * Le test `household_merge_test.ts` vérifie que les deux lectures ne peuvent
 * pas diverger: la direction rendue par `buildPortionBrief` pour un membre est
 * exactement celle dont on lit les axes ici.
 */
export function servingDemandsFor(member: PortionMember): ServingAxisDemands {
  return readServingDemands(servingDirectionFor(member));
}

/**
 * LA DIRECTION ÉCRITE POUR CE MEMBRE — le SEUL endroit qui choisisse.
 *
 * ── LE RENVERSEMENT DU 2026-08-18, ET LE DÉFAUT QU'IL FERME ───────────────
 * Cette fonction commençait par `if (member.ageState === "minor") return
 * CHILD_DIRECTION;`, AVANT toute lecture de l'objectif. Depuis le 2026-08-13
 * la base acceptait pourtant qu'un mineur porte `muscle_gain`: on pouvait donc
 * poser « prendre du muscle » sur un ado, la ligne s'écrivait, l'écran
 * l'affichait, et le moteur l'ignorait. **La décision était en base, le
 * comportement n'a jamais suivi** — une migration livrée à moitié, et le genre
 * de défaut qu'aucun test ne trouve parce que rien n'échoue.
 *
 * Décision humaine du 2026-08-18: un mineur porte les TROIS objectifs, comme
 * un majeur. `CHILD_DIRECTION` devient donc le repli d'un mineur qui n'a PAS
 * d'objectif, au lieu d'écraser celui qui en a un.
 *
 * ⚠️ CE QUI PROTÈGE À LA PLACE, ET C'EST LA MOITIÉ QUI COMPTE. La raison
 * écrite le 13/08 n'était pas « pas de direction », c'était « pas de direction
 * qui fasse d'un enfant une cible de poids ». Ce qui tient cette phrase après
 * l'ouverture, et qui n'est pas ici:
 *
 *   · L'ÉNERGIE. `childEnvelopeFromBody` ne prend pas de `goal` — pas un `if`,
 *     un paramètre qui n'existe pas. Un mineur reste en MAINTENANCE calculée
 *     sur son âge (Schofield), quoi qu'il y ait dans sa colonne. La direction
 *     est une consigne de service; la bande est un déficit. On ouvre la
 *     première, jamais la seconde.
 *   · LE RYTHME. `weight_pace.ts` borne le slider d'un mineur sur son propre
 *     besoin estimé, pas sur le plafond de l'adulte.
 *   · LE SILENCE. Le corps d'un enfant n'est jamais ÉNONCÉ (FF-047): ni taille
 *     ni pesée à côté de son prénom dans le prompt. On calcule avec, on ne le
 *     dit pas — sans quoi sa direction deviendrait dérivable par n'importe qui
 *     à table. Cette garde-là ne bouge pas.
 *
 * ⚠️ L'ÂGE INCONNU NE SUIT PAS. `goalApplies` rend `false` pour lui, et il
 * retombe donc sur `NEUTRAL_DIRECTION` — pas sur `CHILD_DIRECTION`. « Je ne
 * sais pas » et « c'est un enfant » ne sont pas la même phrase.
 */
export function servingDirectionFor(member: PortionMember): string {
  if (goalApplies(member) && member.goal) {
    return SERVING_DIRECTION[member.goal];
  }
  return member.ageState === "minor" ? CHILD_DIRECTION : NEUTRAL_DIRECTION;
}

/**
 * COMBIEN DE DIRECTIONS DE SERVICE DISTINCTES CE FOYER PORTE-T-IL ?
 *
 * ── CE QU'ELLE SERT ────────────────────────────────────────────────────────
 * « Quelle façon de manger le plat commun suit » est un ARBITRAGE. Un
 * arbitrage sans deux positions n'a pas de sujet, et la carte qui le pose
 * s'affichait quand même — devant deux adultes qui n'ont rien déclaré, ou qui
 * ont déclaré la même chose, elle demandait de trancher entre une chose et
 * elle-même.
 *
 * ⚠️ ON COMPARE LES CHAÎNES, PAS LES JETONS. `NEUTRAL_DIRECTION` est
 * EXACTEMENT `SERVING_DIRECTION.maintenance`: deux objectifs différents
 * peuvent demander la MÊME assiette, et compter les jetons ferait afficher un
 * arbitrage qui n'a pas de sujet. Le module a déjà payé ce défaut dans l'autre
 * sens avec `health`, qui a rendu la chaîne de `maintenance` pendant des
 * semaines sans que rien n'échoue.
 *
 * ⚠️ LES MINEURS SONT HORS DU COMPTE, ET C'EST À L'APPELANT DE LES FILTRER.
 * `CHILD_DIRECTION` est une TAILLE, pas une orientation: elle ne gouverne rien
 * et ne peut pas gagner un arbitrage — un mineur n'est jamais référent. Un âge
 * INCONNU en est hors aussi: `goalApplies` rend déjà `false` pour lui, donc il
 * porte `NEUTRAL_DIRECTION`, et le compter reviendrait à faire d'une ignorance
 * une position.
 *
 * ⚠️ ET DEPUIS LE 2026-08-18 LE FILTRE DE L'APPELANT EST LA SEULE BARRIÈRE.
 * `goalApplies` accepte désormais les trois objectifs d'un mineur; une bouche
 * mineure passée ici sans filtre apporterait donc SA direction au compte, et
 * ferait afficher un arbitrage « qui commande la casserole » entre un adulte
 * et un enfant. La fonction reste pure et croit ce qu'on lui donne — mais ce
 * qui était auparavant rattrapé par la garde de lecture ne l'est plus.
 *
 * ⚠️ L'OBJECTIF LU DOIT ÊTRE L'OBJECTIF RÉSOLU. Pour une bouche qui a réclamé
 * son compte, l'objectif qui fait foi est celui de `student_goals`, pas la
 * colonne du roster. Cette fonction est PURE: elle croit ce qu'on lui donne.
 * Un appelant qui lui passe une colonne périmée obtient une réponse juste sur
 * une donnée fausse.
 *
 * ⚠️ UN JETON INCONNU NE VAUT PAS UNE POSITION. `goal` est typé `string | null`
 * parce qu'il vient de la base: un jeton hors de `MEMBER_GOALS` (colonne
 * élargie, ligne écrite par une version plus récente) retombe sur
 * `NEUTRAL_DIRECTION` plutôt que de rendre `undefined` et de compter comme une
 * septième direction fantôme.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function distinctServingDirections(
  members: readonly { ageState: MemberAgeState; goal: string | null }[],
): string[] {
  const seen = new Set<string>();
  for (const member of members) {
    const applies = goalApplies(member) && member.goal !== null &&
      (MEMBER_GOALS as readonly string[]).includes(member.goal);
    seen.add(
      applies
        ? SERVING_DIRECTION[member.goal as MemberGoal]
        : NEUTRAL_DIRECTION,
    );
  }
  // L'ORDRE EST CELUI DE LA RENCONTRE, et il est stable: l'appelant affiche
  // « X mange ceci, Y mange cela » dans l'ordre du roster, pas dans un ordre
  // alphabétique qui remettrait les deux personnes dans le désordre à chaque
  // changement d'objectif.
  return [...seen];
}

/**
 * D6 — CE QUE LA CUISINE A LE DROIT DE FAIRE.
 *
 * `one_dish` est le contrat historique du foyer, et il reste le défaut de
 * TOUTE composition: une cuisson, des parts qui divergent. Les deux autres
 * n'existent que pour une FUSION, et seulement quand le moteur a établi —
 * par un critère vérifiable, pas par goût — qu'un plat commun forcerait
 * quelqu'un hors de sa direction de service.
 */
export const COOKING_SHAPES = [
  "one_dish",
  "one_session",
  "separate_sessions",
] as const;
export type CookingShape = (typeof COOKING_SHAPES)[number];

// ---------------------------------------------------------------------------
// LE MODE DE CUISSON DÉCLARÉ À LA COMPOSITION — UN PLAFOND, JAMAIS UN ORDRE
//
// ── LE DÉFAUT QUE CE BLOC FERME ────────────────────────────────────────────
// L'échelle ci-dessus est CALCULÉE (`mergeLadder`, et depuis le 2026-08-14 la
// divergence en composition ordinaire), elle change la CONSIGNE du modèle, et
// personne ne la choisit ni ne la voit. Le même foyer bascule d'un barreau à
// l'autre d'une semaine à l'autre sans un mot.
//
// ── ET POURQUOI C'EST UN PLAFOND ───────────────────────────────────────────
// Le calcul reste le calcul: il sait, LUI, qu'une casserole déjà dimensionnée
// ne peut pas donner plus qu'elle ne contient. Un choix qui REMPLACERAIT le
// calcul ferait promettre un plat dédié là où rien ne diverge (une cuisson de
// plus pour rien) ou, dans l'autre sens, servirait une assiette qui ment.
//
// Le choix BORNE donc, dans un seul sens: il peut refuser un second plat, il ne
// peut pas en fabriquer un. « Chacun le sien » n'ouvre qu'une possibilité —
// c'est la divergence qui la lève, comme avant ce lot.
//
// ⛔ ET QUAND LE PLAFOND MORD, LE PLAN LE DIT. La phrase va dans
// `plan_rationale.ts`, qui existe exactement pour ça. Un choix silencieusement
// ignoré est pire que pas de choix: il apprend que les réglages ne servent à
// rien.
//
// ⚠️ AUCUNE MÉMOIRE. Ce module ne lit ni n'écrit: le choix voyage avec LA
// DEMANDE, comme le budget depuis le 2026-08-13, et pour le motif écrit dans
// `CookingCapacityCard` — « un réglage de profil s'écrit une fois et s'applique
// en silence à toutes les semaines suivantes, y compris celle où on reçoit du
// monde ».
// ---------------------------------------------------------------------------

/**
 * L'ORDRE DE L'ÉCHELLE, EN RANGS. C'est `COOKING_SHAPES` lu, jamais une seconde
 * liste: un quatrième barreau ajouté là-haut et oublié ici rendrait `undefined`,
 * et une comparaison contre `undefined` est `false` — c'est-à-dire un plafond
 * désarmé en silence, le motif que ce dépôt paie en boucle. D'où le calcul par
 * `indexOf` plutôt qu'une table écrite à la main.
 */
export function cookingShapeRank(shape: CookingShape): number {
  return COOKING_SHAPES.indexOf(shape);
}

/**
 * LE JETON DEMANDÉ, LU D'UNE ENTRÉE BRUTE. `null` = rien n'a été demandé.
 *
 * ⚠️ UNE VALEUR HORS LISTE REND `null`, JAMAIS UN DÉFAUT. « Je n'ai pas su lire
 * ce que tu as demandé » et « tu n'as rien demandé » produisent le même
 * comportement — le calcul gouverne seul — et c'est la direction sûre: retomber
 * sur `one_dish` clouerait au barreau ① un foyer qui a demandé l'inverse, et
 * retomber sur `separate_sessions` ouvrirait un plafond que personne n'a levé.
 */
export function readCookingShape(raw: unknown): CookingShape | null {
  const token = typeof raw === "string" ? raw.trim() : "";
  return (COOKING_SHAPES as readonly string[]).includes(token)
    ? token as CookingShape
    : null;
}

export interface CookingShapeCap {
  /** LA FORME SERVIE — celle qui part dans la consigne, et la seule. */
  shape: CookingShape;
  /**
   * LE PLAFOND A-T-IL MORDU ? `true` = le calcul voulait aller plus loin sur
   * l'échelle et le choix l'a retenu. C'est la prémisse de la phrase du plan.
   */
  capped: boolean;
  /**
   * LE CHOIX A-T-IL OUVERT PLUS QUE LE CALCUL N'EN DEMANDE ? `true` = quelqu'un
   * a demandé « chacun le sien » et personne ne sort de la casserole commune.
   *
   * ⚠️ C'EST UN FAIT DISTINCT DE `capped`, PAS SON INVERSE: les deux sont faux
   * quand la demande et le calcul tombent d'accord, et ils ne peuvent pas être
   * vrais ensemble. Les confondre en un booléen ferait dire « on n'a pas pu
   * tenir ton choix » à quelqu'un dont le choix a été tenu à la lettre.
   */
  unused: boolean;
}

/**
 * CE QU'ON SERT, DU CALCUL ET DU CHOIX.
 *
 * `asked === null` ⇒ le calcul gouverne seul, et la sortie est byte-identique à
 * celle d'avant ce lot. C'est le chemin de TOUTE requête qui ne porte pas le
 * champ — y compris toutes celles écrites avant lui.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function capCookingShape(
  computed: CookingShape,
  asked: CookingShape | null,
): CookingShapeCap {
  if (asked === null) return { shape: computed, capped: false, unused: false };
  const wanted = cookingShapeRank(asked);
  const found = cookingShapeRank(computed);
  if (wanted < found) {
    // LE PLAFOND MORD: on sert le choix, et le plan dit ce qu'il coûte.
    return { shape: asked, capped: true, unused: false };
  }
  // LE CALCUL RESTE LE CALCUL. Demander « chacun le sien » ne fabrique pas une
  // divergence: on sert ce qui a été trouvé, et on note que le choix n'a rien
  // eu à retenir — sinon il aurait été ignoré en silence.
  return { shape: computed, capped: false, unused: wanted > found };
}

/**
 * LA LIGNE QUI DIT COMBIEN DE PLATS. C'est le CONTRAT de composition, et c'est
 * la raison du bump de `MEAL_PROMPT_VERSION` en v9: jusqu'au 2026-08-12 le
 * brief interdisait purement et simplement de proposer deux plats.
 */
const COOKING_SHAPE_LINES: Record<CookingShape, readonly string[]> = {
  one_dish: [
    "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
  ],
  // ── C6 · « UN SECOND PLAT » SE LISAIT « UN POUR LA SEMAINE » ────────────
  //
  // MESURÉ LE 2026-08-12, créneau par créneau: barreau ② demandé sur un conflit
  // à DEUX axes (`protein:larger_above_table` + `starch:larger_above_table`),
  // NEUF repas pour la personne reprise, et le modèle a rendu UN seul plat
  // dédié. Elle a mangé la casserole commune 8 fois sur 9 — c'est-à-dire
  // très exactement ce que le barreau existe pour interdire, huit fois.
  //
  // « give them a SECOND dish […] Never more than two » est une lecture
  // parfaitement raisonnable de ce qu'on avait écrit: UN plat, deux au total,
  // pour toute la fenêtre. Le compte est désormais PAR REPAS, et « never more
  // than two » devient ce qu'il voulait dire — deux plats à un même repas, pas
  // deux plats dans la semaine.
  //
  // ⚠️ LE NOMBRE EXACT N'EST PAS ICI: il vit dans `buildMergeBlock`, qui est le
  // seul endroit à connaître la personne et ses repas. Deux copies d'un même
  // nombre dont une seule reçoit la modification est le défaut que ce dépôt
  // documente le plus souvent.
  one_session: [
    "Cook ONE set of preparations for the table. ONE person below cannot be",
    "served from it (their line says so): at EVERY meal they eat here they get",
    "a dish of their OWN, cooked in the SAME cooking session as the rest — one",
    "session at the stove, the table's dish and theirs out of it. Two dishes at",
    "any one meal, never three.",
  ],
  separate_sessions: [
    "Cook ONE set of preparations for the table. ONE person below cannot be",
    "served from it (their line says so) and cannot share the session either:",
    "at EVERY meal they eat here they get a dish of their OWN, cooked in their",
    "OWN session, on their own day.",
  ],
};

/**
 * G5 — « ONE person below » ÉTAIT VRAI D'UNE FUSION, ET FAUX D'UNE COMPOSITION.
 *
 * Une fusion reprend UNE personne: le singulier y est exact, et c'est pour ça
 * qu'il a été écrit. Depuis le 2026-08-14 le barreau ② est atteignable en
 * COMPOSITION ORDINAIRE — là, plusieurs bouches peuvent diverger à la fois, et
 * « ONE person » ferait servir un seul plat de plus à trois personnes dont les
 * directions s'opposent.
 *
 * ⚠️ LE CHEMIN DE FUSION NE BOUGE PAS D'UN OCTET, ET C'EST TESTÉ. Une fusion
 * passe TOUJOURS `1` (elle reprend une personne, jamais deux), donc elle rend
 * exactement le tableau ci-dessus. Le pluriel n'existe que pour une population
 * qui, avant le 2026-08-14, n'atteignait jamais ce barreau: il ne peut donc
 * re-stamper aucun plan existant.
 *
 * ⚠️ IL N'Y A PAS DE PLURIEL POUR ③. Le barreau ③ (session propre, jour propre)
 * reste RÉSERVÉ À LA FUSION, où il a été mesuré: un budget de temps permet un
 * second plat DANS LA MÊME SESSION, il ne permet pas une seconde session.
 */
const ONE_SESSION_LINES_MANY: readonly string[] = [
  "Cook ONE set of preparations for the table. SOME of the people below cannot",
  "be served from it (their lines say so): at EVERY meal they eat here, each of",
  "them gets a dish of their OWN, cooked in the SAME cooking session as the",
  "rest — one session at the stove, the table's dish and theirs out of it.",
  "Never more dishes at one meal than the table's dish plus one per person",
  "marked that way.",
];

/**
 * LA LIGNE DE FORME, POUR CE BARREAU ET CE NOMBRE DE BOUCHES QUI DIVERGENT.
 *
 * ⚠️ `divergingCount` EST REQUIS, jamais optionnel et jamais défaut-é. « Un
 * paramètre de garde optionnel = une garde désarmée » est la cicatrice
 * fondatrice de ce fichier (`buildPortionBrief` porte déjà la même note sur
 * `cooking`): un `?` ici n'aurait fait remonter AUCUN appelant au compilateur,
 * et une composition à trois divergents aurait servi la phrase du singulier.
 *
 * `0` et `1` rendent la MÊME chose, et ce n'est pas un oubli: à `one_dish` le
 * nombre ne gouverne rien, et un barreau ② à zéro divergent est une
 * contradiction d'appelant que ce module ne peut pas réparer — il rend la
 * consigne la moins bavarde des deux plutôt que d'inventer un pluriel vide.
 */
export function cookingShapeLines(
  cooking: CookingShape,
  divergingCount: number,
): readonly string[] {
  const many = Number.isFinite(divergingCount) && divergingCount >= 2;
  if (cooking === "one_session" && many) return ONE_SESSION_LINES_MANY;
  return COOKING_SHAPE_LINES[cooking];
}

// ---------------------------------------------------------------------------
// G5 — LE TEMPS PLAFONNE, LA DIVERGENCE DÉCLENCHE (arbitrage B1, 2026-08-14)
//
// LES DEUX MOITIÉS NE SE REMPLACENT PAS:
//
//   · LE TEMPS PLAFONNE. Sous le seuil, `one_dish` est FORCÉ, quoi que les
//     directions demandent. Un second plat qu'on n'a pas le temps de cuire est
//     une promesse que la semaine ne tient pas, et le plan préfère le dire
//     (`plan_rationale.ts`) que le promettre.
//   · LA DIVERGENCE DÉCLENCHE. Au-dessus du seuil, le barreau ② devient
//     ATTEIGNABLE et rien de plus: il ne se lève que là où une direction de
//     service ne peut pas sortir de la casserole commune. Le temps ne fabrique
//     pas de plats inutiles.
//
// ⚠️ `cookingTimeMin` EST PAR SESSION, VÉRIFIÉ LE 2026-08-14 AVANT DE MULTIPLIER,
// trois fois plutôt qu'une:
//   · le prompt l'écrit littéralement — « time per cooking session: about N
//     minutes » (`meal_generation.ts`);
//   · la garde d'intégrité compare N au total d'UNE session, jour par jour
//     (`meal_generation.ts`: « cooking session on ${day} runs ${n} min »);
//   · l'écran ne propose que six durées de SESSION, de 30 min à 3 h
//     (`frontend/src/keel/api/planBudget.ts#COOKING_SESSION_MINUTES`).
// Si ce champ devenait un total HEBDOMADAIRE, la multiplication ci-dessous
// serait fausse d'un facteur `cookDays.length` et le seuil ne voudrait plus
// rien — c'est la première chose à re-vérifier avant de toucher à ce bloc.
// ---------------------------------------------------------------------------

/**
 * 1 h 30 PAR SEMAINE, DÉCIDÉ PAR L'UTILISATEUR LE 2026-08-14.
 *
 * Ce n'est pas une mesure, c'est un ARBITRAGE, et il est écrit ici en un seul
 * endroit pour que le déplacer soit un geste et pas une chasse. Le foyer du
 * constat en déclare 180 (2 jours × 90 min) et passe donc largement — le seuil
 * n'existe pas pour lui, il existe pour le foyer qui déclare une heure et à qui
 * on promettrait deux plats.
 */
export const SEPARATE_DISH_MIN_WEEKLY_MINUTES = 90;

/**
 * LE TEMPS DE CUISINE D'UNE SEMAINE, ou `null` si on ne le sait pas.
 *
 * ⚠️ `null` N'EST PAS ZÉRO, et les traiter pareil serait le défaut. « Aucun jour
 * coché » et « pas de durée déclarée » veulent dire QU'ON NE SAIT PAS, et un
 * foyer qui n'a rien dit ne doit pas se voir refuser un second plat au nom d'un
 * budget qu'il n'a jamais posé — ni s'en voir promettre un. `null` remonte tel
 * quel jusqu'à `plan_rationale`, qui se tait alors: on n'explique pas une
 * décision qu'on n'a pas prise.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function weeklyCookingMinutes(args: {
  cookDays: readonly string[];
  cookingTimeMin: number | null;
}): number | null {
  const days = Array.isArray(args.cookDays) ? args.cookDays.length : 0;
  const per = Number(args.cookingTimeMin);
  if (days === 0) return null;
  if (!Number.isFinite(per) || per <= 0) return null;
  return days * Math.floor(per);
}

/**
 * LE TEMPS PERMET-IL UN SECOND PLAT ?
 *
 * ⚠️ `null` (on ne sait pas) rend `true`, et c'est un arbitrage explicite. Le
 * seuil existe pour REFUSER une promesse qu'un budget déclaré ne tient pas; il
 * n'existe pas pour punir un foyer qui n'a pas rempli la carte de cuisine.
 * Traiter l'ignorance comme un refus ferait retomber sur `one_dish` toute la
 * population qui n'a jamais vu la question — c'est-à-dire changer le
 * comportement de gens à qui on n'a rien demandé, ce que ce lot ne fait pas.
 */
export function timeAllowsASecondDish(minutes: number | null): boolean {
  if (minutes === null || !Number.isFinite(minutes)) return true;
  return minutes >= SEPARATE_DISH_MIN_WEEKLY_MINUTES;
}

/**
 * LES DEUX BARREAUX QUI DEMANDENT UN PLAT DE PLUS — lu sur les lignes
 * ci-dessus, jamais recopié.
 *
 * ⚠️ IL EXISTE PARCE QUE DEUX ENDROITS DOIVENT RÉPONDRE À LA MÊME QUESTION, ET
 * QU'ILS L'ONT DÉJÀ MAL RÉPONDUE. Le plafond de plats et la garde de
 * préparation (`meal_generation.ts`) doivent tous deux savoir si la consigne
 * servie réclame un second plat. Le jour où un quatrième barreau apparaît, une
 * comparaison écrite à la main quelque part continuerait de rendre `false` sans
 * rien casser — c'est exactement le motif « garde désarmée en silence » que ce
 * dépôt paie en boucle.
 */
export function asksForASecondDish(cooking: CookingShape): boolean {
  return cooking !== "one_dish";
}

/**
 * COMBIEN DE PLATS LA FUSION AJOUTE AU PLAFOND — et d'où le nombre vient.
 *
 * ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-12, ET C'EST LE DÉFAUT QUE CETTE FONCTION
 * RÉPARE. Le plafond valait `créneaux × jours` et ne savait rien de la fusion:
 * le MÊME prompt annonçait « au plus 15 plats » ET « donne-lui un SECOND
 * plat ». Le modèle a rendu 16 plats, le parseur a jeté le seizième — et le
 * plat perdu n'était PAS celui de la personne reprise, c'était le DÎNER DU
 * DIMANCHE DU FOYER. Reprendre quelqu'un à table coûtait un repas à tout le
 * monde, en silence.
 *
 * LE NOMBRE N'EST PAS UNE CONSTANTE INVENTÉE: il se lit sur les deux seules
 * consignes qui réclament ces plats.
 *
 *   ① `one_dish` — « Do NOT propose separate dishes. » ZÉRO, et c'est le point
 *      le plus important de cette fonction. Ouvrir un budget que la consigne
 *      interdit d'utiliser ferait « déborder poliment pour le remplir »: c'est
 *      écrit noir sur blanc dans `dishCapFor`, et c'est déjà arrivé une fois
 *      (un plan du jeudi qui proposait à manger jusqu'au mercredi d'après).
 *
 *   ②/③ — la ligne de forme réclame « a SECOND dish » (donc AU MOINS un), et
 *      `buildMergeBlock` pose sous les yeux du modèle les plats propres de la
 *      personne, en lui disant « Keep the dishes below as THEIR dishes ». Le
 *      budget est donc EXACTEMENT ce qu'on lui montre — `ownDishesShown`,
 *      c'est-à-dire la liste APRÈS le filtre de fenêtre et APRÈS
 *      `MERGE_MATERIAL_CAP` (`mergeMaterialShown`, `household_merge.ts`).
 *
 * ── LE PLAFOND DU BONUS EST LE PLAFOND DE BASE, ET IL SE DÉDUIT ───────────
 * Une bouche de plus mange au plus ce qu'une bouche mange: `créneaux × jours`,
 * c'est-à-dire le plafond de base lui-même. Un `ownDishesShown` aberrant (un
 * plan personnel bavard, un appelant qui compte autre chose que ce qui est
 * montré) ne peut donc pas doubler deux fois le budget de la table.
 *
 * ⚠️ CE N'EST PAS `MERGE_MATERIAL_CAP` QUI BORNE ICI, ET C'EST VOULU: importer
 * `household_merge.ts` depuis ce fichier ferait un cycle (il importe déjà
 * celui-ci). Le plafond de base est la borne JUSTE de toute façon — 42 lignes
 * de matière sur une fenêtre de trois jours resteraient trois jours de repas.
 */
export function mergeDishBonus(args: {
  cooking: CookingShape;
  /** La matière du plan personnel, telle que le modèle la VOIT. */
  ownDishesShown: number;
  /**
   * C6 — COMBIEN DE PLATS DÉDIÉS LA CONSIGNE RÉCLAME VRAIMENT.
   *
   * ⚠️ REQUIS, jamais optionnel, et c'est la moitié du lot. Le budget valait
   * « ce qu'on montre »; depuis C6 la consigne réclame UN plat PAR REPAS de la
   * personne reprise, et ce nombre-là n'a aucune raison d'être celui de sa
   * matière — une fusion dont la fenêtre recomposée déborde son plan personnel
   * (L10 ①) montre MOINS de plats qu'elle n'a de repas. Sans ce champ, le
   * modèle recevrait « neuf plats pour elle » et un plafond ouvert pour six:
   * le parseur jetterait les DERNIERS plats de la liste, et on a déjà mesuré ce
   * que ça coûte — le dîner du dimanche du foyer, perdu en silence.
   */
  dedicatedDishesAsked: number;
  baseCap: number;
}): number {
  if (!asksForASecondDish(args.cooking)) return 0;
  const shown = Number.isFinite(args.ownDishesShown)
    ? Math.floor(args.ownDishesShown)
    : 0;
  const asked = Number.isFinite(args.dedicatedDishesAsked)
    ? Math.floor(args.dedicatedDishesAsked)
    : 0;
  const ceiling = Number.isFinite(args.baseCap)
    ? Math.max(1, Math.floor(args.baseCap))
    : 1;
  // LE PLUS GRAND DES DEUX, ET JAMAIS LE PLUS PETIT. Le budget doit couvrir ce
  // que la consigne DEMANDE (`asked`) sans jamais retirer la place qu'elle
  // MONTRE (`shown`): prendre `asked` seul rétrécirait le budget de toute
  // fusion dont le plan personnel est plus bavard que son rythme, et un budget
  // qui rétrécit est exactement le défaut mesuré, par l'autre bout.
  return Math.max(1, Math.min(Math.max(shown, asked), ceiling));
}

/**
 * C6 — COMBIEN DE PLATS DÉDIÉS ON DEMANDE, ET D'OÙ LE NOMBRE VIENT.
 *
 * ⚠️ MESURÉ LE 2026-08-12: barreau ② demandé, conflit sur DEUX axes
 * (`protein:larger_above_table` + `starch:larger_above_table`), NEUF repas pour
 * la personne reprise — et UN seul plat dédié rendu. Elle a mangé la casserole
 * commune 8 fois sur 9.
 *
 * ── LE NOMBRE N'EST PAS UNE CONSTANTE, ET CE N'EST PAS UN SEUIL INVENTÉ ────
 * C'est le DÉNOMINATEUR du constat de forme (`observeMergeShape`, C3 ⑥): ses
 * repas à elle sur la fenêtre écrite, résolus par `memberMealCells`. La mesure
 * qui juge le plan est donc la mesure que la consigne réclame — toute autre
 * valeur rendrait `honoured: false` par construction, et un constat qui ne peut
 * pas être satisfait ne constate rien.
 *
 * ── POURQUOI *TOUS* SES REPAS, ET PAS « CEUX OÙ LE CONFLIT MORD » ─────────
 * Parce que le conflit ne mord pas par créneau: c'est une DIRECTION DE SERVICE
 * (D6), et L4 a tranché que le barreau se décide « pour la table entière, pas
 * par créneau ». Une direction qui dépasse la casserole la dépasse à chaque
 * fois qu'on sert. Les axes en conflit disent ce qui doit CHANGER dans son
 * plat; ils ne disent pas combien de fois on la sert.
 *
 * ── LE PLANCHER EST UN, ET IL RESTE ──────────────────────────────────────
 * `eaterMeals = 0` est déjà refusé bien avant le modèle
 * (`merge_member_away_all_window`). S'il arrivait quand même, rendre 0 ferait
 * un prompt qui réclame un plat dédié (la ligne de forme) avec un budget qui
 * n'en ouvre aucun — la contradiction exacte que L4 a payée.
 */
export function dedicatedDishesFor(
  cooking: CookingShape,
  eaterMeals: number,
): number {
  if (!asksForASecondDish(cooking)) return 0;
  const meals = Number.isFinite(eaterMeals) ? Math.floor(eaterMeals) : 0;
  return Math.max(1, meals);
}

/**
 * LE GARDE-FOU QUI VOYAGE AVEC LES FAITS CORPORELS — lot 3B.
 *
 * Il n'est ajouté au brief QUE si au moins une bouche porte des faits. Sans
 * cette condition, un foyer où personne n'a rempli quoi que ce soit lirait une
 * mise en garde sur des chiffres absents — et une consigne qui parle du corps
 * dans un prompt où il n'y en a pas est exactement l'invitation qu'on veut
 * éviter.
 *
 * DEUX PHRASES, DEUX PORTES DIFFÉRENTES:
 *
 *   1. « for ONE thing: the SIZE » — reprise de `mealBodyBlocks`, et pour la
 *      même raison qu'elle y existe: taille + poids + âge + sexe est la
 *      signature d'entrée d'une formule de métabolisme de base, et un modèle
 *      sait la calculer sans qu'on le lui demande. `CONTRACT.md` refuse les
 *      calories; livrer un compteur par la porte de derrière serait la même
 *      chose en pire, puisque personne ne l'aurait décidé.
 *
 *   2. L'HOMOGÉNÉITÉ À TABLE — celle-ci est PROPRE au foyer et n'a aucun
 *      équivalent sur le chemin individuel. Le foyer mixte est le cas nominal
 *      (deux membres avec corps, trois sans), et un modèle à qui on donne plus
 *      de matière sur une personne écrit spontanément une consigne plus longue
 *      et plus personnelle pour elle. Cette asymétrie se lit à table: elle
 *      annonce à tout le monde qui a rempli son profil, et laisse entendre que
 *      la précision est une faveur. Personne ne l'a demandée.
 */
const BODY_FACTS_CAVEAT = [
  "The bracketed facts are there for ONE thing: the SIZE of a portion. A palm",
  "of protein is not the same palm on a small person and a tall one. Never",
  "derive anything else from them: no daily energy need, no calorie figure,",
  "no BMI, no category, no target.",
  "We know more about some people than others, and that is only an accident of",
  "who filled in what. It is NEVER a reason to write a longer, more precise or",
  "more personal instruction for them: every line must read the same way when",
  "it is said out loud at the table.",
] as const;

/**
 * LE BLOC QUI PART DANS LE PROMPT.
 *
 * Une ligne par membre, ordre stable (celui reçu), et une consigne finale qui
 * n'est pas décorative: sans elle, un modèle confronté à quatre directions
 * contradictoires propose parfois deux plats. Or le produit vend UNE cuisson.
 *
 * ── LOT 3B: L'ENTRÉE GAGNE DES FAITS, LA SORTIE N'EN GAGNE AUCUN ──────────
 * La ligne d'un membre porte désormais ce qu'on sait de son corps, entre
 * crochets. C'est la moitié ENTRÉE de la règle du lot; la moitié SORTIE ne
 * bouge pas d'un pouce — `FORBIDDEN_PORTION_TERMS` et `sanitizePortionNote`
 * sont exactement ce qui empêche « pour ton poids » de ressortir, et brancher
 * le corps augmente mécaniquement la pression sur eux.
 *
 * ── TROIS ABSENCES QUI SE RESSEMBLENT, ET C'EST VOULU ─────────────────────
 * Une bouche sans compte, un compte dont la lecture a échoué, un compte sous
 * plancher TCA et un compte qui n'a rien saisi produisent TOUS la même ligne:
 * celle d'avant ce lot. Aucun « height: not stated », aucune mention d'absence.
 * Deux raisons: une ligne qui annonce un manque invite le modèle à le commenter
 * (même posture que `mealBodyBlocks`), et surtout le plancher TCA deviendrait
 * OBSERVABLE dans le brief — un membre marqué « on ne vous dira rien de lui »
 * est un membre désigné.
 */
export function buildPortionBrief(
  members: readonly PortionMember[],
  /**
   * ⚠️ REQUIS, jamais optionnel, et jamais défaut-é à `one_dish`. « Paramètre
   * de garde optionnel = garde désarmée » est une cicatrice de ce dépôt: un
   * paramètre facultatif n'aurait fait remonter AUCUN appelant au compilateur,
   * et la fusion aurait interdit au modèle, dans le même prompt, exactement ce
   * qu'elle lui demande de faire.
   */
  cooking: CookingShape,
  /**
   * G5 — COMBIEN DE BOUCHES NE PEUVENT PAS SORTIR DE LA CASSEROLE COMMUNE.
   *
   * ⚠️ REQUIS, jamais optionnel, exactement comme `cooking` juste au-dessus, et
   * pour la même raison mesurée: un `?` n'aurait fait remonter aucun appelant, et
   * une composition à trois divergents aurait servi « ONE person below » — la
   * phrase du singulier, écrite pour une fusion, qui promet UN plat de plus à
   * trois personnes dont les directions s'opposent.
   *
   * ⚠️ CE N'EST PAS CE MODULE QUI LE CALCULE, et c'est délibéré. Le critère est
   * `servingConflicts` (`household_merge.ts`), et l'importer d'ici ferait un
   * CYCLE — ce fichier est déjà importé par celui-là. L'appelant qui décide du
   * barreau est le seul à pouvoir répondre, et c'est lui qui a la réponse sous
   * la main de toute façon: il vient de la calculer pour choisir `cooking`.
   *
   * Une FUSION passe toujours `1` — elle reprend une personne, jamais deux — et
   * rend donc le texte byte-identique à celui d'avant le lot G.
   */
  divergingCount: number,
): string {
  if (members.length === 0) return "";
  let anyBodyFacts = false;
  // ⚠️ MÊME DISCIPLINE QUE `anyBodyFacts` ET `anyRhythm`, POUR LA TROISIÈME
  // FOIS DANS CETTE FONCTION: la conséquence des habitudes n'est énoncée que si
  // au moins une bouche en porte une. Servie à un foyer où personne n'a rien
  // dit, elle apprend au modèle qu'il existe un marquage « elle mange autre
  // chose » — et l'invite à en inventer un.
  let anyHabit = false;
  // ⚠️ MÊME DISCIPLINE QUE `anyBodyFacts`, ET POUR LA MÊME RAISON: on n'énonce
  // pas une contrainte que personne n'a posée. Une consigne « quand quelqu'un
  // est marqué… » servie à un foyer où personne ne l'est apprend au modèle
  // qu'il existe un marquage, et l'invite à en inventer un.
  let anyRhythm = false;
  const lines = members.map((m) => {
    // L'ORDRE DES TROIS CAS EST LA RÈGLE, pas un style — et il est écrit UNE
    // fois, dans `servingDirectionFor`, parce que la fusion doit lire
    // EXACTEMENT la direction que ce brief écrit (D6). Deux lectures de la
    // même règle finiraient par diverger, et la fusion renoncerait — ou
    // n'aurait pas renoncé — sur une direction que personne n'a servie.
    const direction = servingDirectionFor(m);
    // AUCUNE DES DEUX GARDES N'EST APPLIQUÉE ICI — ni le plancher TCA, ni la
    // règle du mineur. `householdBodyFacts` les porte toutes les deux, dans le
    // même fichier que `mealBodyBlocks`: une garde qu'un appelant applique est
    // une garde que le prochain appelant oublie (FF-030 R5). Les deux
    // paramètres sont requis, donc il n'y a pas d'appel « partiel » possible.
    const facts = householdBodyFacts(m.body, m.ageState);
    // ── QUAND CETTE BOUCHE MANGE, SUR SA PROPRE LIGNE ────────────────────
    // On donne le FAIT, pas la déduction: « eats at breakfast, dinner » plutôt
    // qu'une grille par personne. C'est le patron du dépôt (`country` et
    // `today` partent bruts, la saison ne part pas), et c'est ce qui permet au
    // modèle de sauter un créneau pour une personne sans que la grille du
    // foyer change.
    //
    // Rien n'est écrit quand `null`: cette bouche mange aux moments de la
    // maison, que le prompt annonce déjà plus haut. Une ligne « eats at
    // breakfast, lunch, dinner » recopiée pour tout le monde noierait
    // précisément celle qui dit une différence.
    //
    // ── LA TAILLE SE DIT SUR CETTE LIGNE-LÀ, ET PAS AILLEURS ─────────────
    // « (large for them) » est repris MOT POUR MOT de `rhythmLines`
    // (`meal_generation.ts`), qui écrit la même chose pour la lane
    // individuelle. Le possessif est load-bearing: sans lui, le modèle lit une
    // portion ABSOLUE, alors qu'on parle de la journée de CETTE personne — gros
    // pour elle n'est pas gros dans l'absolu. Deux formulations pour un seul
    // fait finiraient par se contredire dans le même prompt, puisque le foyer
    // et l'individuel partagent le modèle.
    //
    // Rien n'est écrit quand la taille est `null`: « il n'a pas dit » laisse le
    // moment libre, et écrire « medium » par défaut poserait une contrainte que
    // personne n'a exprimée — que le modèle respecterait.
    const when = m.eatingSlots === null || m.eatingSlots.length === 0
      ? ""
      : ` — eats at ${
        m.eatingSlots
          .map((o) => (o.size ? `${o.slot} (${o.size} for them)` : o.slot))
          .join(", ")
      } only`;
    if (when !== "") anyRhythm = true;
    // ── G4 · CE QU'ELLE MANGE À LA PLACE, SUR SA PROPRE LIGNE ────────────
    // APRÈS le rythme, et l'ordre porte du sens: `— eats at breakfast only`
    // dit QUAND elle mange, `— has their own at breakfast: une pomme` dit CE
    // QU'ELLE Y MANGE. Le second se lit comme une précision du premier; dans
    // l'autre sens il se lirait comme une exception à une règle pas encore
    // énoncée.
    //
    // Rien n'est écrit quand la liste est vide — le cas majoritaire. Une
    // mention « eats the household dish » recopiée pour tout le monde noierait
    // précisément celle qui dit une différence, et c'est le raisonnement exact
    // qui gouverne déjà `when` deux lignes plus haut.
    const own = habitFragment(m.habits ?? []);
    if (own !== "") anyHabit = true;
    // LA LIGNE LIBRE VIENT APRÈS LES MOMENTS MARQUÉS, et avant les faits
    // corporels. Elle ne compte PAS dans `anyHabit`: la conséquence parle du
    // marqueur `has their own`, et une note seule n'en pose aucun. Énoncer la
    // conséquence pour une note ferait dire au modèle qu'une bouche est
    // dispensée du plat commun alors que personne ne l'a écrit.
    const said = habitNoteFragment(m.habitNote ?? null);
    if (facts.length === 0) return `- ${m.displayName}: ${direction}${when}${own}${said}`;
    anyBodyFacts = true;
    return `- ${m.displayName}: ${direction}${when}${own}${said} [${facts.join("; ")}]`;
  });
  return [
    "HOUSEHOLD SERVING PLAN — one cooking session, portions that differ.",
    ...cookingShapeLines(cooking, divergingCount),
    "For each person below, give a short serving instruction: how much of which",
    "component goes on their plate, and which side is added or dropped.",
    // ══ LOT 4C ② · LE CHIFFRE DANS LA CONSIGNE, COLLÉ À LA PROMESSE ══════════
    //
    // ⛔ IL EST ICI, ET NULLE PART AILLEURS, POUR LA RAISON QUE 3C A MESURÉE:
    // une consigne séparée de la phrase qui promet la matière est une consigne
    // satisfaite ailleurs. La promesse, c'est la ligne juste au-dessus — « how
    // much of which component goes on their plate ». Le chiffre s'y colle.
    //
    // ⚠️ MESURE QUI A MOTIVÉ CES QUATRE LIGNES: 93 notes de portion réelles,
    // ZÉRO gramme. `vague_portions` lisait `0` parce que le modèle n'employait
    // aucun des mots de la liste — il écrivait « One standard table portion. »,
    // « Balanced share of the shared dish. », « Child-size share of the same
    // dish. » La ceinture n'était pas cassée: son vocabulaire n'était pas celui
    // du modèle. La réponse est le NOMBRE demandé, pas une liste plus longue.
    //
    // ① LE NOMBRE ATTENDU (`members.length`), même levier que `boxingOrderLines`.
    // ② L'ÉCHAPPATOIRE NOMMÉE — et ici elle est LITTÉRALE: on renvoie au modèle
    //    les trois tournures qu'il a réellement écrites, parce qu'une consigne
    //    qui dit « sois précis » sans nommer ce qu'elle refuse se fait satisfaire
    //    par une paraphrase.
    //
    // ⛔ ET AUCUN POURQUOI. Les exemples sont des grammes d'ALIMENT — du même
    // côté de la frontière que « 400 g de cuisses de poulet » sur une liste de
    // courses. Les trois dernières lignes du brief l'interdisent explicitement,
    // et elles RESTENT les dernières.
    "Every one of those instructions carries a number and a unit: 150 g of the",
    "chicken, 80 g of dry pasta, 2 tbsp of the sauce. All " +
    `${members.length} of them, not some.`,
    `"A standard portion", "a balanced share", "take your box" tell nobody how`,
    "much to put on a plate: write the grams, even when a box already holds them.",
    // LA CONSÉQUENCE DU « eats at ... only », DITE UNE FOIS, ET SEULEMENT SI
    // QUELQU'UN EST MARQUÉ. Sans elle, le modèle lit le fait et sert quand
    // même: une contrainte qu'on énonce sans dire ce qu'elle interdit est une
    // contrainte décorative.
    ...(anyRhythm
      ? [
        'When a person is marked "eats at ... only", give them NO serving at any',
        "other moment — do not shift their meal, do not compensate elsewhere.",
      ]
      : []),
    // ── G4 · LA CONSÉQUENCE DES HABITUDES, DITE UNE FOIS ────────────────────
    // Juste après celle du rythme, et pour la même raison qu'elle existe: une
    // contrainte qu'on énonce sans dire ce qu'elle INTERDIT est une contrainte
    // décorative. Le fait « elle a son habitude au petit-déjeuner » sans cette
    // phrase produit exactement le plan mesuré — sept petits-déjeuners servis à
    // quelqu'un qui n'en mange pas.
    ...(anyHabit ? [...HABIT_CONSEQUENCE] : []),
    "",
    ...lines,
    "",
    ...(anyBodyFacts ? [...BODY_FACTS_CAVEAT, ""] : []),
    // ── LOT 4 · LA MISE EN BOÎTES, COLLÉE À LA PROMESSE ────────────────────
    // Elle est ICI, dans le même souffle que les lignes par personne, et c'est
    // la moitié qui décide du lot — voir `boxingOrderLines`.
    ...boxingOrderLines(members),
    // EN DERNIER, ET ÇA RESTE LE CAS APRÈS LE LOT 3B, PUIS APRÈS LE LOT 4. Un
    // modèle lit la contrainte la plus proche de la fin comme la plus
    // contraignante, et c'est celle-ci qui doit survivre aux faits corporels
    // qu'on a ajoutés — ET aux grammes qu'on ajoute maintenant. C'est
    // précisément quand le brief se met à porter des NOMBRES par personne que
    // l'interdit du « pourquoi » doit rester la dernière chose lue.
    "NEVER state a reason, a goal, a calorie count or anything about a person's",
    "body in these instructions. They are read aloud at the table by the whole",
    "household. Write what to serve, never why.",
  ].join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — L'ORDRE DE PESER, LÀ OÙ LA MATIÈRE EST PROMISE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA POSITION EST LA MOITIÉ DU LOT, ET ELLE A UNE DATE. Le 2026-08-17, un
 * champ réclamé au modèle a été mesuré à ZÉRO déclaration sur 291 plats — non
 * pas parce que le modèle refusait, mais parce que la PROMESSE de la matière
 * vivait dans le message utilisateur pendant que la CLÉ du schéma vivait dans le
 * prompt système, sans rien pour les relier. Rapproché de sa promesse, avec le
 * NOMBRE attendu et l'échappatoire NOMMÉE, le même champ est passé à onze.
 *
 * Ici la promesse est ce brief-ci: « portions that differ », « how much of which
 * component goes on their plate ». L'ordre de peser doit donc être DEDANS, pas
 * dans un bloc voisin — et il l'est, juste avant les trois lignes de fin.
 *
 * Trois choses y sont load-bearing, chacune reprise d'une mesure:
 *
 *   ① LE NOMBRE. « ADD ONE dish » → le nombre exact avait déjà changé le
 *      résultat sur la lane fusion (C6, 2026-08-12), puis sur le plat dédié
 *      (LOT 3C). Ici c'est le nombre de BOUCHES à peser sur chaque préparation.
 *      Il vient de `members.length` — la MÊME liste qui écrit les lignes juste
 *      au-dessus, jamais un second calcul.
 *   ② L'ÉCHAPPATOIRE, NOMMÉE. Le modèle a DÉJÀ un champ où ranger « qui mange
 *      combien »: `member_portions`, qui lui est demandé. Une consigne qui
 *      demande des grammes sans dire que la note de portion n'en est pas une
 *      est une consigne qu'il satisfait dans l'autre champ — c'est exactement ce
 *      qui a été capturé le 2026-08-17, la consigne renvoyée mot pour mot dans
 *      le mauvais champ.
 *   ③ LA BOÎTE PARTAGÉE EST LÉGITIME. Sans cette phrase, un modèle obéissant
 *      écrirait quatre boîtes identiques là où une seule suffit, et la table de
 *      pesée deviendrait illisible — après quoi quelqu'un désarmerait la
 *      consigne. Ce qui compte est que CHAQUE bouche soit dans exactement une
 *      boîte de chaque préparation.
 *
 * ⛔ ET AUCUN POURQUOI, JAMAIS. Le bloc ne dit pas d'où viennent les grammes: ce
 * sont des grammes d'ALIMENT dans une boîte, du même côté de la frontière que
 * « 400 g de cuisses de poulet » sur une liste de courses. Les trois lignes qui
 * SUIVENT ce bloc l'interdisent explicitement, et elles restent les dernières.
 *
 * ⚠️ MUET À UNE SEULE BOUCHE. Une boîte par personne n'a de sujet qu'à partir de
 * deux, et servir le bloc à un foyer d'un lui apprendrait qu'un marquage par
 * personne existe — le raisonnement de `anyHabit`/`anyRhythm` juste au-dessus,
 * quatrième fois. Un foyer à une bouche rend donc un brief byte-identique à
 * celui d'avant ce lot, et un test le tient.
 */
export function boxingOrderLines(
  members: readonly PortionMember[],
): readonly string[] {
  if (members.length < 2) return [];
  const names = members.map((m) => m.displayName).join(", ");
  return [
    "WEIGH IT ONCE, INTO NAMED BOXES.",
    "Nobody weighs anything at mealtime. Everything is weighed at the cooking",
    "session, straight into boxes with a name on the lid, and a meal later just",
    `takes its box out. Every preparation you write carries "boxes": one entry`,
    "per box, with the exact member_ids it belongs to and its weight in grams of",
    "READY food.",
    `That is ${members.length} people to weigh out on EVERY preparation: ${names}.`,
    "Count them before you answer — a person missing from a preparation's boxes",
    "is a person standing at the fridge with nothing that says how much.",
    // ══ LOT 4C ③ · CE QUE `grams` DÉSIGNE, ET COMBIEN DE BOÎTES PAR BOUCHE ══
    //
    // ⛔ EN REMPLACEMENT DE DEUX LIGNES, PAS EN AJOUT: la lane foyer frôle le mur
    // de temps du worker (mesuré par 3C), et ce bloc est déjà le plus long du
    // brief. Deux lignes deviennent quatre; rien d'autre ne bouge.
    //
    // ⚠️ LES DEUX TROUS QUE CETTE RÉDACTION FERME, MESURÉS SUR QUATRE RUNS RÉELS:
    //   ① `grams` ÉTAIT AMBIGU. « ONE box may carry both their ids » ne disait
    //      pas si le nombre est la part d'UNE personne ou le contenu du bac. Un
    //      run l'a écrit comme le total (7500 g pour cinq), et l'écran imprime
    //      les deux cas à l'identique: « Boîte Paul, Zoe, … — 430 g » se lit
    //      « prends 430 g » et valait peut-être 72.
    //   ② TREIZE BOUCHES DANS DEUX BOÎTES de la même casserole, TROIS dans
    //      aucune. « Chaque bouche dans exactement une boîte » n'était énoncé
    //      nulle part — seulement suggéré par « a person missing … ».
    `"grams" is what ONE person takes out, never the size of the tub. Two people`,
    "on the same weight share ONE box that lists both ids; when their shares",
    "differ they get one box each. Every name above is in exactly ONE box of each",
    "preparation -- never two, never none.",
    "A line in member_portions is NOT a box. It is a sentence read aloud at the",
    "table; a box has a weight and a name on it, and it is what stops the weighing",
    "from happening again at every meal. Writing the serving instruction instead",
    "of the boxes leaves the household weighing at every meal, which is the one",
    "thing this plan exists to prevent.",
    "",
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// LOT L8 — LA CIBLE DIMENSIONNE LES GRAMMAGES, ET RIEN D'AUTRE.
//
// Décision produit de l'utilisateur, 2026-08-18, écrite dans
// `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §3 et reprise à la
// source dans `energy_target.ts` et `docs/keel/CALORIE_REVERSAL.md` §7:
//
//     « La cible contraint les GRAMMAGES, pas le choix des plats. »
//
// ⛔ C'EST UN RENVERSEMENT, ET IL EST ÉCRIT COMME TEL. `energy_target.ts` disait,
// en toutes lettres: « Elle n'entre pas dans le générateur. Un plan qui vise un
// chiffre est un régime chiffré, et ce n'est pas ce produit. » Cette phrase
// portait une vraie protection, elle a été renversée par une décision humaine
// datée, et le renversement est nommé aux trois endroits qui portaient
// l'ancienne règle. Si tu lis ceci en te disant « quelqu'un a oublié de refermer
// la vanne »: non. Va lire `CALORIE_REVERSAL.md` §7 avant de « réparer ».
//
// ── LE RAISONNEMENT, CORRIGÉ ───────────────────────────────────────────────
// Ce n'est PAS « parce qu'il n'y a qu'une cuisson »: c'est faux, le mode de
// cuisson est un choix à trois valeurs (`COOKING_SHAPES`, plus haut dans ce
// fichier). C'est parce que **le gramme est le bon niveau de précision**: « une
// poignée » ne veut rien dire, peser à chaque repas est intenable, donc on pèse
// UNE fois à la session dans des boîtes nommées et le jour J on cite la boîte.
// Les deux leviers — le grammage et le mode de cuisson — se composent; ils ne
// se remplacent pas.
//
// ── CE QUE ÇA N'OUVRE PAS ──────────────────────────────────────────────────
// Aucun kcal ne sort d'ici. Ce bloc rend des FACTEURS (sans unité) et des
// GRAMMES D'ALIMENT, du même côté de la frontière que « 400 g de cuisses de
// poulet » sur une liste de courses. Le seul nombre en kcal qu'il produit est le
// conseil du midi (② ci-dessous), et il ne sort que pour la bouche QUI LE
// DEMANDE, après les cinq portes.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE VERDICT D'ÂGE D'UNE BOUCHE, DEPUIS SON ÉTAT À TROIS VALEURS.
 *
 * ── POURQUOI CETTE FONCTION EXISTE, ET CE QU'ELLE COÛTE ───────────────────
 * `energySafetyGates` prend un `BirthDateVerdict` — le verdict riche que
 * `assessBirthDate` construit depuis une DATE. La lane foyer ne voit jamais de
 * date: `keel_household_member_age(member_id)` résout `profiles.birth_date` puis
 * `household_members.birth_date` **en base** et ne rend que trois valeurs, qui
 * arrivent ici dans `PortionMember.ageState`. Il faut donc un pont, et il vaut
 * mieux qu'il soit nommé, exporté et testé qu'écrit trois fois en ligne.
 *
 * ⚠️ LES CHAMPS AUTRES QUE `status` SONT DES SENTINELLES, PAS DES DONNÉES. Le
 * verdict exige un `isoDate` et un `age` pour ses deux statuts datés; on n'a ni
 * l'un ni l'autre. `MOUTH_AGE_SENTINEL_ISO` est délibérément une date
 * impossible à confondre avec une naissance, et l'âge est la borne elle-même
 * (`KEEL_MINOR_AGE`), c'est-à-dire le seul entier qui soit COHÉRENT avec le
 * statut plutôt qu'inventé. Aucun de ces deux champs n'est lu par la chaîne:
 * `energySafetyGates` passe par `weekPlanAgeGate`, qui ne teste que `status`.
 * Si un jour la chaîne se met à lire `age`, ce commentaire est le premier
 * endroit où il faut revenir.
 *
 * ⚠️ LA PROPRIÉTÉ QUI TIENT CE PONT est le ROND-TRIP:
 * `ageStateFromVerdict(mouthAgeVerdict(s)) === s` pour les trois états. Elle est
 * testée. Sans elle, `unknown` pourrait dériver vers `adult` — c'est-à-dire vers
 * la porte ouverte — sans qu'aucun test ne bouge.
 */
export const MOUTH_AGE_SENTINEL_ISO = "0001-01-01";

export function mouthAgeVerdict(ageState: MemberAgeState): BirthDateVerdict {
  switch (ageState) {
    case "minor":
      return {
        status: "minor",
        isoDate: MOUTH_AGE_SENTINEL_ISO,
        age: KEEL_MINOR_AGE - 1,
      };
    case "adult":
      return {
        status: "adult",
        isoDate: MOUTH_AGE_SENTINEL_ISO,
        age: KEEL_MINOR_AGE,
      };
    // `absent` et non `unreadable`: les deux se réduisent à `unknown` chez
    // `ageStateFromVerdict`, et `absent` est le seul des deux qui ne mente pas
    // sur l'existence d'une saisie illisible.
    case "unknown":
      return { status: "absent" };
  }
}

/**
 * POURQUOI CETTE BOUCHE EST — OU N'EST PAS — DIMENSIONNÉE SUR SA CIBLE.
 *
 * Liste FERMÉE, et `sized` en fait partie: un journal qui ne nomme que les refus
 * ne distingue pas « la porte a laissé passer » de « la porte n'a pas tourné ».
 * Les quatre premiers refus sont ceux de la chaîne de sécurité, repris tels
 * quels — le motif de la PREMIÈRE porte fermée survit, comme partout ailleurs.
 */
export const BOX_SIZING_REASONS = Object.freeze(
  [
    /** Le facteur a été calculé et il s'applique. */
    "sized",
    /** ① le plancher TCA de CETTE bouche. */
    "restriction_floor",
    /** ② la ceinture d'âge de CETTE bouche — clause C8, réécrite par L4-B. */
    "minor",
    /** ③ la méthode du coach. */
    "doctrine_no_counting",
    /**
     * L'âge de cette bouche est inconnu. `weekPlanAgeGate` laisse passer
     * « absent » — c'est sa règle, et elle est juste pour un plan de semaine.
     * Elle ne l'est PAS pour un grammage: « je ne sais pas » et « c'est un
     * adulte » ne sont pas la même phrase, et la seconde ouvre un déficit.
     */
    "age_unknown",
    /** Ni perte ni prise: la balance ne bouge pas, il n'y a rien à viser. */
    "no_direction",
    /** Personne n'a réglé le curseur. C'est le cas de TOUTE la base au 18/08. */
    "no_pace",
    /** Pas de corps exploitable ⇒ pas d'entretien ⇒ pas de facteur. */
    "no_body",
    /**
     * Le facteur est sorti des bornes de plausibilité. ⚠️ CE MOTIF NE PEUT PAS
     * SORTIR D'UN CORPS RÉEL passé par `executedPaceFor` — voir
     * `BOX_FACTOR_MIN`. Il existe pour l'appelant qui court-circuiterait le
     * rythme exécuté, et c'est le seul chemin par lequel un grammage absurde
     * pourrait atteindre une assiette.
     */
    "implausible_factor",
  ] as const,
);
export type BoxSizingReason = (typeof BOX_SIZING_REASONS)[number];

/**
 * LES BORNES DE PLAUSIBILITÉ D'UN FACTEUR DE BOÎTE.
 *
 * ── ELLES NE SONT PAS LA BORNE OPÉRANTE, ET C'EST IMPORTANT ───────────────
 * Ce qui borne réellement un facteur est `executedPaceFor`. Le minimum
 * STRUCTUREL se calcule, il ne se devine pas — sur une PERTE d'adulte:
 *
 *     facteur ≥ max( 1 − 500/entretien , plancher/entretien )
 *
 * parce que l'écart est le MIN d'A1 (500 kcal/j) et de la marge au-dessus du
 * plancher. Les deux branches se croisent à `entretien = 500 + plancher`, et
 * c'est là que le facteur est le plus bas. Avec le plancher le plus bas du
 * dépôt (1 200 kcal, `ENERGY_FLOOR_KCAL.female`): 1 700 kcal d'entretien ⇒
 * **0,7059**. Aucun corps ne descend en dessous, quel que soit son gabarit.
 * Sur un mineur, la fraction de 10 % donne exactement 0,90.
 *
 * ⚠️ ET `0,75` ÉTAIT TROP SERRÉ — MESURÉ, PAS SUPPOSÉ. Un corps de 30 kg pour
 * 195 cm (aberrant mais constructible) rend un entretien de ~1 774 kcal et donc
 * un facteur de **0,718**: la première rédaction de cette borne REFUSAIT un
 * dimensionnement parfaitement légitime, dont la journée reste au-dessus du
 * plancher (1 274 ≥ 1 200). Une ceinture qui mord sur du juste se fait désarmer
 * dans la semaine. `0,70` passe donc sous le minimum structurel, et le
 * balayage de `target_grams_test.ts` le prouve sur des centaines de corps.
 *
 * ⛔ ELLES NE SONT PAS DORMANTES POUR AUTANT: elles mordent sur un appelant qui
 * fabriquerait un écart quotidien à la main, sans passer par `executedPaceFor`.
 * C'est la seule porte par laquelle « 600 kcal/jour » pourrait redevenir un
 * grammage.
 *
 * ⚠️ UN FACTEUR HORS BORNES NE SE RABOTE PAS, IL SE REFUSE. Ramener 0,4 à 0,70
 * servirait un déficit que personne n'a validé en ayant l'air d'avoir protégé
 * quelqu'un; rendre 1 et nommer le motif laisse l'assiette telle que le modèle
 * l'a écrite, ce qui est le produit d'hier.
 */
export const BOX_FACTOR_MIN = 0.70;
export const BOX_FACTOR_MAX = 1.25;

export interface MouthSizing {
  /** Sans unité. `1` = la boîte que le modèle a écrite, inchangée. */
  factor: number;
  reason: BoxSizingReason;
}

/** `1`, avec son motif. Jamais un `1` nu: un facteur neutre a une raison. */
function noSizing(reason: BoxSizingReason): MouthSizing {
  return { factor: 1, reason };
}

/**
 * LE FACTEUR DE GRAMMAGE D'UNE BOUCHE — LA SEULE PORTE VERS LE DIMENSIONNEMENT.
 *
 * ── LA CHAÎNE, DANS L'ORDRE, ET ELLE EST **PAR BOUCHE** (clause C8) ────────
 * L4-B a mesuré et corrigé l'erreur qui rendait cette clause fausse: il est FAUX
 * que « la seule ceinture qui existe appartient au compte maître ». L'âge de
 * CHAQUE bouche est connu par `member_id` (`keel_household_member_age`), son
 * jumeau TypeScript est `ageStateFromVerdict`, et `mouthEnvelope` le lit DÉJÀ
 * pour servir une maintenance pédiatrique. Ce qui ne le lisait pas, c'était la
 * chaîne de portes. Sans ce paramètre, **une cible dimensionnerait les
 * grammages d'un enfant de douze ans parce que son parent est adulte** — c'est
 * le trou exact que L4-B a nommé, et c'est ici qu'il se ferme.
 *
 * ⛔ `canSizeFromTarget` EST LA PORTE, ET ELLE EST UNIQUE. Elle ne lit NI ④ NI
 * ⑤ — masquer un chiffre à l'écran ne change pas le dîner — et un test de source
 * de `energy_gate_mouth_test.ts` empêche de « réparer » ça. Ce fichier est
 * inscrit À LA MAIN dans l'allowlist d'appelants de ce test (clause C3): tant
 * qu'il n'y était pas, le banc rougissait, et c'est voulu.
 *
 * ── TOUS LES PARAMÈTRES SONT REQUIS, ET C'EST LA CICATRICE ────────────────
 * « Un paramètre de garde optionnel est une garde désarmée » (`safetyBand:
 * null`). Les cinq champs sont requis et validés à l'exécution: une entrée
 * incomplète LÈVE, elle ne rend jamais un facteur.
 */
export function mouthTargetFactor(args: {
  /**
   * ② L'ÂGE DE **CETTE** BOUCHE, jamais celui du compte maître. REQUIS.
   * Vient de `keel_household_member_age(member_id)` par `PortionMember.ageState`.
   */
  ageState: MemberAgeState;
  /**
   * ① LE PLANCHER TCA DE CETTE BOUCHE. REQUIS.
   *
   * ⚠️ FAIL-CLOSED CHEZ L'APPELANT: une lecture en échec, et une bouche sans
   * compte dont on ne peut rien évaluer, valent `true`. Se fermer rend le
   * produit d'hier (la boîte que le modèle a écrite); s'ouvrir dimensionne
   * l'assiette de quelqu'un qu'on n'a pas su évaluer. Même arbitrage que
   * `MealBodyContext.restrictionFlag` (FF-030 R6).
   */
  restrictionFlag: boolean;
  /** ③ La position du coach, telle que `countingStanceFrom` l'a réduite. REQUIS. */
  coachCounting: CountingStance;
  /**
   * La direction de la balance de cette bouche, dérivée de son objectif.
   * `null` = `maintenance` ou aucun objectif ⇒ rien à viser.
   */
  direction: ScaleDirection | null;
  /**
   * Le cran du curseur, en kg/semaine — `household_members.target_pace_kg_per_week`
   * ou `student_goals.target_pace_kg_per_week`. `null` = personne n'a réglé.
   */
  paceKgPerWeek: number | null;
  /** Le corps de cette bouche, pour estimer son entretien. */
  subject: PaceSubject;
}): MouthSizing {
  if (args === null || typeof args !== "object") {
    throw new Error("[keel/household_portions] mouthTargetFactor requires an input object");
  }
  for (
    const key of [
      "ageState",
      "restrictionFlag",
      "coachCounting",
      "direction",
      "paceKgPerWeek",
      "subject",
    ]
  ) {
    const bag = args as unknown as Record<string, unknown>;
    if (!Object.hasOwn(bag, key) || bag[key] === undefined) {
      throw new Error(
        `[keel/household_portions] missing required sizing input: ${key} — ` +
          `an absent gate is a disarmed gate`,
      );
    }
  }

  // ── ①②③ — LA CHAÎNE DE SÉCURITÉ, PAR BOUCHE, PUIS LA PORTE ──────────────
  const gate = canSizeFromTarget({
    safety: energySafetyGates({
      restrictionFlag: args.restrictionFlag,
      ageVerdict: mouthAgeVerdict(args.ageState),
      coachCounting: args.coachCounting,
    }),
  });
  if (!gate.size) {
    // Le motif de la première porte fermée survit tel quel. `student_off` et
    // `target_off` ne peuvent pas sortir de cette chaîne — elle ne lit aucun
    // interrupteur — donc la coercition ci-dessous est totale, et un test le
    // tient sur la table de vérité entière.
    return noSizing(gate.reason as BoxSizingReason);
  }
  // ── LA PORTE QUE `weekPlanAgeGate` NE FERME PAS, ET QU'IL FAUT FERMER ICI ──
  // « absent » passe la chaîne (c'est sa règle, et elle est juste pour un plan
  // de semaine: on ne bloque pas quelqu'un dont la date manque). Un GRAMMAGE
  // n'est pas un plan: dimensionner sur une cible demande de savoir si le corps
  // qui la porte est en croissance.
  if (args.ageState === "unknown") return noSizing("age_unknown");

  if (args.direction === null) return noSizing("no_direction");
  const pace = Number(args.paceKgPerWeek);
  if (args.paceKgPerWeek === null || !Number.isFinite(pace) || pace <= 0) {
    return noSizing("no_pace");
  }

  // ── LE RYTHME **EXÉCUTÉ**, JAMAIS LE CRAN CHOISI ────────────────────────
  // Le curseur d'une PRISE monte plus haut que ce que `envelopeCore` exécute
  // (+10 %, `MAX_SURPLUS_FRACTION`) depuis l'ouverture du §Bloc 2. Dimensionner
  // une boîte sur le cran choisi promettrait un rythme que la casserole ne
  // livre pas — et la date d'arrivée calculée dessus serait fausse dès le
  // premier jour. C'est l'écart que `weight_pace.ts` annonçait à refermer.
  const executed: ExecutedPace | null = executedPaceFor(
    args.direction,
    args.subject,
    pace,
  );
  if (executed === null || executed.maintenanceKcal <= 0) return noSizing("no_body");

  const sign = args.direction === "down" ? -1 : 1;
  // ⚠️ LE DÉNOMINATEUR EST L'ENTRETIEN, PAS LA CIBLE. Le facteur dit « de
  // combien la boîte que le modèle a écrite pour un jour ordinaire doit
  // bouger », et le modèle écrit sur les enveloppes de MAINTENANCE (le tronc est
  // le MIN de celles-ci, les add-ons rendent le reste). Diviser par la cible
  // ferait porter au grammage un écart qu'il a déjà.
  const factor = (executed.maintenanceKcal + sign * executed.dailyDeltaKcal) /
    executed.maintenanceKcal;
  if (
    !Number.isFinite(factor) || factor < BOX_FACTOR_MIN || factor > BOX_FACTOR_MAX
  ) {
    return noSizing("implausible_factor");
  }
  // Un écart exécuté NUL (un corps déjà sous son plancher) rend exactement 1.
  // On le nomme `no_pace` plutôt que `sized`: rendre « dimensionné, facteur 1 »
  // ferait lire à un compteur qu'une cible a mordu là où elle n'a rien pu faire.
  if (executed.dailyDeltaKcal === 0) return noSizing("no_pace");
  return { factor, reason: "sized" };
}

/**
 * LE FACTEUR D'UNE BOUCHE, DEPUIS SA LIGNE DE FOYER — le raccourci d'appel.
 *
 * ⚠️ IL NE PORTE AUCUNE DÉCISION. Il lit `goalApplies` (la règle du mineur et de
 * l'âge inconnu, écrite une seule fois dans `household.ts`) et `scaleDirectionOf`
 * (la règle des trois directions, écrite une seule fois dans `weight_pace.ts`),
 * puis passe la main. Deux lectures d'une même règle finiraient par diverger, et
 * celle-ci gouverne des grammes dans une assiette.
 */
export function memberTargetFactor(
  member: PortionMember,
  args: {
    coachCounting: CountingStance;
    paceKgPerWeek: number | null;
    /** Le corps de la FICHE de cette bouche. `null` = rien à estimer. */
    body: MouthBody | null;
  },
): MouthSizing {
  if (args.body === null) {
    // ⚠️ ON NE SAUTE PAS LA PORTE POUR AUTANT. Un corps absent est une raison de
    // ne rien dimensionner, pas une raison de ne pas évaluer la ceinture: le
    // motif rendu doit rester celui de la première porte fermée, sans quoi un
    // journal dirait « pas de corps » d'un enfant que la porte ② protège.
    const gate = canSizeFromTarget({
      safety: energySafetyGates({
        restrictionFlag: member.body?.restrictionFlag ?? true,
        ageVerdict: mouthAgeVerdict(member.ageState),
        coachCounting: args.coachCounting,
      }),
    });
    if (!gate.size) return noSizing(gate.reason as BoxSizingReason);
    if (member.ageState === "unknown") return noSizing("age_unknown");
    return noSizing("no_body");
  }
  const goal = goalApplies(member) && member.goal ? member.goal : null;
  return mouthTargetFactor({
    ageState: member.ageState,
    // FAIL-CLOSED: pas de contexte de corps lu ⇒ on se ferme. Une bouche sans
    // compte n'a jamais de `MealBodyContext` (les mesures restent clées sur
    // `auth.users`), donc c'est le cas NOMINAL d'un enfant — et c'est très
    // exactement la personne pour qui se fermer est juste.
    restrictionFlag: member.body?.restrictionFlag ?? true,
    coachCounting: args.coachCounting,
    direction: goal === null ? null : scaleDirectionOf(goal),
    paceKgPerWeek: args.paceKgPerWeek,
    subject: { body: args.body, isMinor: member.ageState === "minor" },
  });
}

// ---------------------------------------------------------------------------
// ① LES BOÎTES, REDIMENSIONNÉES — déterministe, après le parseur
// ---------------------------------------------------------------------------

/** Une boîte, réduite à ce que le redimensionnement lit. */
export interface SizableBox {
  id: string;
  memberIds: readonly string[];
  grams: number;
}

export interface SizablePreparation {
  id: string;
  boxes: readonly SizableBox[];
  /**
   * CE QUE LA CASSEROLE PRODUIT VRAIMENT, en grammes de PRÊT
   * (`preparationReadyGrams`). `null` = non reconstructible.
   *
   * ⚠️ C'EST LA PART **FIXE**, et c'est toute la leçon de
   * `scaling-factor-applies-only-to-the-mobile-part`: un facteur qui ignore ce
   * que le récipient contient fait grossir un plan sans rien lui donner à
   * manger. Ici la nourriture existante ne bouge pas d'un gramme — seul son
   * PARTAGE bouge — et le plafond du récipient est ce qui le garantit.
   */
  readyGrams: number | null;
}

export interface BoxSizingResult {
  /**
   * Les nouveaux grammages, par ID de boîte. Une boîte absente de cette table
   * n'a pas bougé — on ne rend PAS la boîte entière, pour que l'appelant ne
   * puisse pas reconstruire une préparation en perdant ses autres champs.
   */
  grams: Map<string, number>;
  /**
   * ⚠️ TROIS NOMBRES, ET LEUR SOMME EST UNE PROPRIÉTÉ TESTÉE:
   * `sized + unchanged + shared_mixed === boxes`. Un compteur à deux nombres
   * rendrait le même zéro pour « aucune cible » et pour « une cible qu'on n'a
   * pas su appliquer », et c'est le zéro ambigu que ce dépôt paie en boucle.
   *
   *   · `boxes`        — le dénominateur: toutes les boîtes gardées du plan.
   *   · `sized`        — celles dont les grammes ont bougé.
   *   · `unchanged`    — facteur 1 sur toutes leurs bouches. Le cas NOMINAL.
   *   · `shared_mixed` — une boîte partagée dont les bouches n'ont PAS le même
   *                      facteur. Laissée telle quelle, et comptée: on ne peut
   *                      pas la couper en deux sans inventer un identifiant de
   *                      boîte que rien ne cite.
   *   · `capped_by_pot`— les préparations dont la somme redimensionnée dépassait
   *                      ce que la casserole produit, ramenées au plafond.
   *   · `unverifiable` — les préparations dont la production n'est pas
   *                      reconstructible (`readyGrams === null`): on
   *                      redimensionne, on ne peut pas vérifier la somme.
   */
  counts: {
    boxes: number;
    sized: number;
    unchanged: number;
    shared_mixed: number;
    capped_by_pot: number;
    unverifiable: number;
  };
  issues: string[];
}

/**
 * LE PLANCHER D'UNE BOÎTE, en grammes. Une boîte à zéro n'est pas une part,
 * c'est une consigne qui dit « rien » — et l'écran l'imprimerait telle quelle.
 */
export const BOX_MIN_SIZED_GRAMS = 1;

/**
 * LES BOÎTES, REDIMENSIONNÉES SUR LA CIBLE DE CHAQUE BOUCHE.
 *
 * ── POURQUOI C'EST DÉTERMINISTE ET APRÈS LE PARSEUR ───────────────────────
 * L'autre sortie était de demander les grammages au modèle, en lui donnant la
 * cible dans le prompt. Elle est écartée, et pour trois raisons mesurées:
 *
 *   1. **Le prompt de la lane foyer expire à quatre minutes** (mesuré par 3C,
 *      reconfirmé par L7). Ce lot n'ajoute pas une ligne au prompt et ne bumpe
 *      aucune version: la population qui voit une consigne différente est
 *      VIDE, et c'est vérifiable à l'octet.
 *   2. Un facteur de grammage dit dans le prompt est un nombre que le modèle
 *      RECOPIE. Mesuré au LOT E: il a écrit `box_prep_chicken_shared` dans une
 *      note lue à voix haute à table. « Zoé: 0,85 de la part de Marc » lu à
 *      table est un verdict comparatif sur deux corps.
 *   3. Un grammage déclaré par le modèle ne peut être que COMPTÉ, jamais
 *      garanti; un grammage calculé ici est exact et rejouable.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────
 * Elle ne crée aucune boîte, n'en supprime aucune, ne change aucun `member_id`,
 * ne touche à aucun ingrédient et n'écrit aucun texte. Elle ne fait que
 * multiplier des grammes par un facteur sans unité — et elle refuse de le faire
 * quand la casserole ne suivrait pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeBoxesFromTarget(
  preparations: readonly SizablePreparation[],
  /**
   * Le facteur de CHAQUE bouche, par `member_id`. Une bouche absente de la table
   * vaut `1` — c'est-à-dire « on n'a rien à lui appliquer », le cas nominal.
   *
   * ⚠️ REQUIS, JAMAIS `?`. Un paramètre facultatif ferait de « aucune cible » le
   * défaut silencieux de tous les appelants, et le lot serait construit,
   * branché, désarmé — le mode d'échec n°1 de ce fichier.
   */
  factors: ReadonlyMap<string, number>,
  /** La tolérance de somme, reprise du parseur. REQUISE pour la même raison. */
  sumToleranceRatio: number,
): BoxSizingResult {
  const grams = new Map<string, number>();
  const issues: string[] = [];
  const counts = {
    boxes: 0,
    sized: 0,
    unchanged: 0,
    shared_mixed: 0,
    capped_by_pot: 0,
    unverifiable: 0,
  };

  for (const prep of preparations) {
    // Les grammes CANDIDATS de cette préparation, avant le plafond du récipient.
    const candidate = new Map<string, number>();
    let anySized = false;
    for (const box of prep.boxes) {
      counts.boxes++;
      const mouthFactors = box.memberIds.map((id) => factors.get(id) ?? 1);
      const first = mouthFactors[0] ?? 1;
      const uniform = mouthFactors.every((f) => Math.abs(f - first) < 1e-9);
      if (!uniform) {
        // ⛔ ON NE COUPE PAS UNE BOÎTE EN DEUX. Fabriquer un second identifiant
        // laisserait `dishes[].uses[].box_id` pointer sur une boîte qui n'a plus
        // le bon contenu, et l'écran citerait une boîte que personne n'a pesée.
        // La consigne du prompt dit déjà « when their shares differ they get one
        // box each »: une boîte partagée à facteurs divergents est le modèle qui
        // ne l'a pas suivie, et c'est une MESURE, pas une réparation.
        counts.shared_mixed++;
        issues.push(
          `preparations[${prep.id}].boxes[${box.id}]: shared by mouths whose ` +
            `targets differ, grams left as written`,
        );
        candidate.set(box.id, box.grams);
        continue;
      }
      if (first === 1) {
        counts.unchanged++;
        candidate.set(box.id, box.grams);
        continue;
      }
      anySized = true;
      candidate.set(
        box.id,
        Math.max(BOX_MIN_SIZED_GRAMS, Math.round(box.grams * first)),
      );
    }

    // ── LE PLAFOND DU RÉCIPIENT — ET IL NE TOURNE QUE SI ON A TOUCHÉ QUELQUE
    //    CHOSE ────────────────────────────────────────────────────────────
    // ⚠️ LA CONDITION `anySized` EST LA GARANTIE DE BYTE-IDENTITÉ. Sans elle, ce
    // bloc « réparerait » au passage les plans où le modèle a sur-rempli ses
    // boîtes — c'est-à-dire changerait le produit pour la population qui n'a
    // AUCUNE cible, qui est aujourd'hui la population entière. Le parseur a déjà
    // sa propre `issue` pour ce cas-là; ce n'est pas à ce lot de la doubler.
    if (!anySized) continue;
    if (prep.readyGrams === null) {
      counts.unverifiable++;
      for (const [id, g] of candidate) grams.set(id, g);
      counts.sized += countSized(prep, candidate);
      continue;
    }
    const ceiling = prep.readyGrams * sumToleranceRatio;
    let sum = 0;
    for (const g of candidate.values()) sum += g;
    if (sum > ceiling && sum > 0) {
      // ⚠️ ON RABOTE **PROPORTIONNELLEMENT**, ET SUR TOUTE LA PRÉPARATION. Ce
      // qu'une cible achète est le RAPPORT entre les parts; le préserver est la
      // seule façon de ne pas retirer sa part à quelqu'un pour l'arithmétique
      // d'un autre. La quantité de nourriture, elle, est fixe: c'est le point de
      // `scaling-factor-applies-only-to-the-mobile-part`, et ici la part fixe
      // est le contenu de la casserole.
      const shrink = ceiling / sum;
      for (const [id, g] of candidate) {
        candidate.set(id, Math.max(BOX_MIN_SIZED_GRAMS, Math.round(g * shrink)));
      }
      counts.capped_by_pot++;
      issues.push(
        `preparations[${prep.id}]: sized boxes would hold ${Math.round(sum)} g ` +
          `but the batch makes about ${Math.round(prep.readyGrams)} g, all boxes ` +
          `scaled back to fit`,
      );
    }
    for (const [id, g] of candidate) grams.set(id, g);
    counts.sized += countSized(prep, candidate);
  }

  // ⚠️ `sized` SE COMPTE SUR CE QUI A RÉELLEMENT BOUGÉ, jamais par soustraction.
  // Une boîte dont le facteur ≠ 1 mais dont l'arrondi rend le MÊME nombre n'a
  // pas bougé, et la compter dirait qu'une cible a mordu là où l'assiette est
  // identique. Cicatrice `withheld`/`over_cap`, écrite trois fois dans
  // `meal_generation.ts`.
  counts.unchanged = counts.boxes - counts.sized - counts.shared_mixed;
  return { grams, counts, issues };
}

/** Combien de boîtes de CETTE préparation portent un grammage différent. */
function countSized(
  prep: SizablePreparation,
  candidate: ReadonlyMap<string, number>,
): number {
  let n = 0;
  for (const box of prep.boxes) {
    const next = candidate.get(box.id);
    if (next !== undefined && next !== box.grams) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// ② LE CONSEIL CHIFFRÉ DU MIDI — une consigne, JAMAIS un solde
// ---------------------------------------------------------------------------

/**
 * ⛔ CE QUE CE BLOC N'ÉCRIRA JAMAIS, ET LA PHRASE EXACTE QUI EST INTERDITE.
 *
 *     « Il te reste 680 kcal. »
 *
 * C'est LA phrase d'un tracker, et elle n'existe sur aucun chemin de ce produit
 * (`energy_target.ts`, en toutes lettres). Un conseil du midi est une CONSIGNE:
 * il ne soustrait rien de ce qui a été mangé, il ne connaît pas ce qui a été
 * mangé, et il ne peut pas le connaître — aucune de ses entrées ne porte un
 * consommé. Pas de reste, pas de verdict, pas de couleur, pas de barre.
 *
 * ⚠️ ET C'EST POURQUOI IL SE CALCULE SUR LA JOURNÉE DÉCLARÉE, PAS SUR LE PLAN.
 * « Vise 700 au déjeuner » est vrai que la personne ait pris son petit-déjeuner
 * ou non. Le dériver de ce que le plan a composé le rendrait dépendant du reste
 * de la journée, c'est-à-dire un solde déguisé.
 */
export const EATING_OUT_ADVICE_REASONS = Object.freeze(
  [
    "advised",
    /** ① ② ③ — la chaîne de sécurité du LECTEUR, motifs repris tels quels. */
    "restriction_floor",
    "minor",
    "doctrine_no_counting",
    /** ④ l'interrupteur d'affichage, ⑤ celui de la cible. */
    "student_off",
    "target_off",
    /** La bouche n'est pas le lecteur — FF-059 §11 n°4, `canEmitMouthEnergy`. */
    "other_mouth",
    /** C9.a — l'âge de CETTE bouche. */
    "mouth_minor",
    "mouth_age_unknown",
    /** C9.b — le vocabulaire de présence n'est pas dans la liste fermée. */
    "unknown_state",
    /** Cette case n'est pas un « dehors »: il n'y a rien à conseiller. */
    "not_eating_out",
    /** Pas de journée déclarée, ou pas de corps: rien à répartir. */
    "no_rhythm",
    "no_body",
  ] as const,
);
export type EatingOutAdviceReason = (typeof EATING_OUT_ADVICE_REASONS)[number];

/**
 * LE VOCABULAIRE DE PRÉSENCE, RECOPIÉ — ET LE POURQUOI DE LA RECOPIE.
 *
 * ⛔ CE N'EST PAS UN OUBLI D'IMPORT. `PRESENCE_STATES` vit dans
 * `household_presence.ts`, qui importe `meal_generation.ts`, qui importe CE
 * fichier: en importer une VALEUR ferait un cycle d'exécution
 * (`household_portions` → `household_presence` → `meal_generation` →
 * `household_portions`). Les seuls imports que ce fichier prend de cette
 * branche-là sont des TYPES, effacés à la compilation.
 *
 * ⚠️ ET C'EST DONC UNE SECONDE COPIE D'UNE ÉNUMÉRATION FERMÉE, le mode d'échec
 * que `tokens.ts` documente en tête. Ce qui l'empêche de dériver est un test
 * d'égalité stricte avec `PRESENCE_STATES` — un test peut importer les deux
 * modules sans créer de cycle de production. Sans ce test, un quatrième état
 * ajouté là-bas serait lu « inconnu » ici, donc muet, et le lot ressemblerait à
 * un lot qui marche.
 */
export const KNOWN_PRESENCE_STATES = Object.freeze(
  ["at_table", "eating_out", "away"] as const,
);

/**
 * LE POIDS D'UN MOMENT DANS LA JOURNÉE DE CETTE PERSONNE.
 *
 * ── CE N'EST PAS UNE TABLE DE RÉPARTITION UNIVERSELLE ─────────────────────
 * Les poids ne sont lus que RELATIVEMENT aux moments que CETTE bouche a
 * déclarés: quelqu'un qui ne prend que déjeuner et dîner répartit sa journée en
 * deux, pas en six. Une table de pourcentages absolus (« le déjeuner vaut 35 %
 * d'une journée ») serait fausse pour tout le monde sauf pour la journée type
 * qu'elle décrit.
 *
 * ⚠️ LA TAILLE DÉCLARÉE GAGNE SUR LE DÉFAUT DU MOMENT, et c'est le seul
 * arbitrage de cette table: `EatingOccasionSlot.size` est ce que la personne a
 * dit de SON repas (« gros dîner »), le défaut n'est que ce qu'un moment pèse
 * quand personne n'a rien dit. Trois repas principaux à `medium`, trois
 * collations à `small`: c'est la lecture la plus plate possible, et elle est
 * délibérément grossière — le nombre sort arrondi aux 50 kcal, exactement comme
 * `maintenanceRange`, parce qu'un « 683 » se lirait comme une mesure.
 */
export const MEAL_SIZE_WEIGHT: Readonly<Record<"small" | "medium" | "large", number>> =
  Object.freeze({ small: 1, medium: 2, large: 3 });

const DEFAULT_SLOT_WEIGHT: Readonly<Record<EatingOccasion, number>> = Object.freeze({
  breakfast: MEAL_SIZE_WEIGHT.medium,
  snack_am: MEAL_SIZE_WEIGHT.small,
  lunch: MEAL_SIZE_WEIGHT.medium,
  snack_pm: MEAL_SIZE_WEIGHT.small,
  dinner: MEAL_SIZE_WEIGHT.medium,
  before_bed: MEAL_SIZE_WEIGHT.small,
});

function slotWeight(occasion: EatingOccasionSlot): number {
  return occasion.size
    ? MEAL_SIZE_WEIGHT[occasion.size]
    : DEFAULT_SLOT_WEIGHT[occasion.slot];
}

export interface EatingOutAdvice {
  /**
   * kcal, arrondis aux 50. `null` dès que le motif n'est pas `advised` — jamais
   * un `0`, qui se lirait « ne mange rien », le sens exactement inverse.
   */
  kcal: number | null;
  reason: EatingOutAdviceReason;
}

/**
 * LE CONSEIL CHIFFRÉ D'UNE CASE « DEHORS », OU LE MOTIF NOMMÉ DE SON ABSENCE.
 *
 * ── LA CLAUSE C9, ARMÉE ICI ET AVANT LA PREMIÈRE MULTIPLICATION ───────────
 * C9 (L4-B §7) dit: *la porte est traversée par ce qui PRODUIT le nombre, pas
 * seulement par ce qui l'affiche; l'état de présence « dehors » en est une
 * entrée.* Deux trous mesurés le motivent, et aucun des deux n'est réparable
 * ici:
 *
 *   · `keel_household_set_member_away` **ne consulte aucun âge** — reconfirmé
 *     sur `prosrc`. « Dehors » est donc posable sur un mineur;
 *   · le vocabulaire de présence est fermé côté maître et **ouvert côté
 *     personne** — un `.update()` PostgREST direct passe sans contrainte.
 *
 * D'où les deux gardes ci-dessous, dans cet ordre:
 *
 *   **C9.b** — `presenceState` est typé `string`, PAS `PresenceState`, et c'est
 *   délibéré. Un jeton hors liste fermée vaut « on ne sait pas » ⇒ AUCUN
 *   chiffre, et **jamais un repli sur `at_table`**. Même règle que
 *   `parseGoalToken`, qui lève plutôt que de deviner. Si le type était
 *   `PresenceState`, le compilateur donnerait une garantie que PostgREST ne
 *   donne pas, et la garde naîtrait désarmée.
 *
 *   **C9.a** — le verdict d'âge de CETTE bouche, avant tout chiffre. Un mineur
 *   ou un âge inconnu ⇒ pas de chiffre, motif nommé. La part, elle, reste
 *   dimensionnée sur les enveloppes de maintenance, comme aujourd'hui.
 *
 * ── ET LE LECTEUR, PARCE QU'UN CHIFFRE QUI SORT EST UN CHIFFRE AFFICHÉ ────
 * Contrairement au dimensionnement (①), ce conseil-ci se LIT. Il traverse donc
 * les cinq portes, interrupteurs compris, et il ne sort que pour la bouche QUI
 * LE DEMANDE (`other_mouth`). Une bouche sans compte n'a aucun interrupteur:
 * lui adresser un chiffre serait un tracker qu'elle ne peut pas éteindre. C'est
 * exactement le manque que le levier d'invitation du §2.2 ⓒ existe pour nommer
 * — « invite-la, elle pourra les déclarer elle-même ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function eatingOutAdvice(args: {
  /**
   * L'ÉTAT DE PRÉSENCE DE CETTE CASE, BRUT. REQUIS, et typé `string` — C9.b.
   */
  presenceState: string;
  /**
   * LA CHAÎNE DU LECTEUR, telle que `canShowTarget` l'a rendue. REQUISE: c'est
   * la seule porte d'entrée des interrupteurs ④ et ⑤.
   */
  reader: { show: boolean; reason: string };
  /** Cette bouche EST-ELLE le lecteur ? REQUIS. */
  mouthIsReader: boolean;
  /** ② L'âge de CETTE bouche — C9.a. REQUIS. */
  mouthAgeState: MemberAgeState;
  /** La journée déclarée de cette bouche. `[]` ⇒ rien à répartir. */
  slots: readonly EatingOccasionSlot[];
  /** La case dont on parle. */
  occasion: EatingOccasionSlot;
  /**
   * L'entretien de cette bouche, en kcal/jour, et l'écart exécuté de sa cible.
   * `null` ⇒ pas de corps ⇒ pas de conseil.
   */
  executed: ExecutedPace | null;
  /** La direction de sa balance. `null` = maintenance: la cible EST l'entretien. */
  direction: ScaleDirection | null;
}): EatingOutAdvice {
  const refuse = (reason: EatingOutAdviceReason): EatingOutAdvice => ({
    kcal: null,
    reason,
  });
  // ── C9.b — LE VOCABULAIRE, AVANT TOUT ───────────────────────────────────
  if (!(KNOWN_PRESENCE_STATES as readonly string[]).includes(args.presenceState)) {
    return refuse("unknown_state");
  }
  if (args.presenceState !== "eating_out") return refuse("not_eating_out");

  // ── LA CHAÎNE DU LECTEUR, ET SON MOTIF SURVIT TEL QUEL ──────────────────
  if (!args.reader.show) {
    return refuse(
      (EATING_OUT_ADVICE_REASONS as readonly string[]).includes(args.reader.reason)
        ? args.reader.reason as EatingOutAdviceReason
        // Un motif que ce vocabulaire ne porte pas est un refus qu'on ne sait
        // pas dire: on refuse quand même, et on le range dans le motif le plus
        // fermé. Jamais un `advised` par défaut.
        : "unknown_state",
    );
  }
  if (!args.mouthIsReader) return refuse("other_mouth");

  // ── C9.a — L'ÂGE DE CETTE BOUCHE ────────────────────────────────────────
  if (args.mouthAgeState === "minor") return refuse("mouth_minor");
  if (args.mouthAgeState === "unknown") return refuse("mouth_age_unknown");

  if (args.executed === null || args.executed.maintenanceKcal <= 0) {
    return refuse("no_body");
  }
  const weights = args.slots.map(slotWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (args.slots.length === 0 || total <= 0) return refuse("no_rhythm");
  const here = args.slots.findIndex((s) => s.slot === args.occasion.slot);
  if (here < 0) return refuse("no_rhythm");

  const sign = args.direction === "down" ? -1 : args.direction === "up" ? 1 : 0;
  const dayKcal = args.executed.maintenanceKcal +
    sign * args.executed.dailyDeltaKcal;
  const share = (dayKcal * weights[here]) / total;
  // ARRONDI AUX 50, MÊME ARBITRAGE QUE `maintenanceRange`: « 700 » se lit comme
  // un ordre de grandeur, « 683 » comme une mesure — et une mesure invite à
  // viser le chiffre exact, ce qui est précisément le geste d'un tracker.
  const kcal = Math.round(share / 50) * 50;
  // Un conseil à zéro n'est pas un conseil. On préfère se taire.
  if (!(kcal > 0)) return refuse("no_body");
  return { kcal, reason: "advised" };
}

/**
 * LA PHRASE, DANS LES DEUX LANGUES.
 *
 * Elle vit ICI et pas dans un pack i18n du front, pour la même raison que
 * `PACE_WARNING_LABELS` (`weight_pace.ts`) et `QUESTION_LABELS`
 * (`plan_feedback.ts`): le nombre et le mot qui l'encadre sont une seule
 * décision, et les séparer laisse l'un bouger sans l'autre.
 *
 * ⚠️ « AUTOUR DE » EST LOAD-BEARING, DANS LES DEUX LANGUES. « Vise 700 » est une
 * cible qu'on rate; « vise autour de 700 » est un ordre de grandeur. C'est la
 * même décision que la fourchette de `energy_target.ts` — « personne ne rate un
 * intervalle ».
 *
 * ⚠️ LE LABEL PORTE SA PRÉPOSITION, ET C'EST UNE LEÇON DE CE DÉPÔT. Une phrase
 * assemblée en `Au ${label}` rend « Au ta collation du matin »: la préposition
 * française se contracte avec le genre du mot, et un gabarit qui l'ignore
 * fabrique une faute dans une langue sur deux — invisible à qui teste en
 * anglais (cicatrice « garde testée dans une seule langue »).
 */
export const EATING_OUT_SLOT_LABELS: Readonly<
  Record<EatingOccasion, { en: string; fr: string }>
> = Object.freeze({
  breakfast: { en: "At breakfast", fr: "Au petit-déjeuner" },
  snack_am: { en: "At your morning snack", fr: "À ta collation du matin" },
  lunch: { en: "At lunch", fr: "Au déjeuner" },
  snack_pm: {
    en: "At your afternoon snack",
    fr: "À ta collation de l'après-midi",
  },
  dinner: { en: "At dinner", fr: "Au dîner" },
  before_bed: { en: "At your evening snack", fr: "À ta collation du soir" },
});

export function eatingOutAdviceSentence(
  locale: "en" | "fr",
  occasion: EatingOccasion,
  kcal: number,
): string {
  const label = EATING_OUT_SLOT_LABELS[occasion][locale];
  return locale === "fr"
    ? `${label}, vise autour de ${kcal}.`
    : `${label}, aim for around ${kcal}.`;
}

/**
 * LA LISTE FERMÉE — ce qu'une consigne de service ne peut pas contenir.
 *
 * Les deux langues, parce que ce dépôt a déjà payé « garde testée dans une
 * seule langue »: une ceinture qui ne connaît que `weight` laisse passer
 * `poids`, et le produit sort en français par défaut (`profiles.locale`).
 *
 * ── CE QUE LE LOT 3B Y A AJOUTÉ, ET POURQUOI ──────────────────────────────
 * La liste couvrait le POIDS et l'OBJECTIF, parce que c'était tout ce que le
 * modèle avait de quoi dire. Depuis que le brief porte la TAILLE, la BANDE
 * D'ÂGE et le TOUR DE TAILLE de chaque bouche, il a de quoi en dire davantage —
 * et une ceinture armée sur ce qu'on lui donnait HIER est une ceinture désarmée.
 *
 * Vérifié plutôt que supposé: avant ce lot, « 1,5 part vu ta taille », « a
 * bigger share for your height » et « selon tes mesures » PASSAIENT tous les
 * trois, dans les deux langues.
 *
 * ── LA FRONTIÈRE, ET CE QUI RESTE DEHORS ──────────────────────────────────
 * On n'ajoute que du vocabulaire qui DÉSIGNE LE CORPS D'UNE PERSONNE. Les
 * unités nues (`kg`, `cm`) restent HORS liste, et c'est un arbitrage, pas un
 * oubli: « coupe les carottes en morceaux de 3 cm » est une consigne de service
 * parfaitement légitime, et une ceinture qui mord dessus met la personne en
 * part standard sans que personne comprenne pourquoi. « Une ceinture qui mord
 * sur tout se fait désarmer dans la semaine. »
 *
 * ⚠️ CONSÉQUENCE CONNUE ET NON REFERMÉE: un ÉCHO NUMÉRIQUE NU — « pour tes
 * 84 kg », « tu mesures 186 cm » — n'est mordu par personne. Le moteur apparie
 * des séquences de MOTS; il n'a aucun moyen d'exprimer « un nombre suivi d'une
 * unité, rattaché à une personne ». Le refermer demande soit une seconde
 * ceinture d'un autre genre (une expression régulière sur nombre+unité), soit
 * d'accepter les faux positifs des unités nues. C'est une décision de produit,
 * elle n'est pas prise ici.
 */
export const FORBIDDEN_PORTION_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "portion.body",
    token: "weight",
    surfaceForms: ["poids", "weight loss", "weight gain", "perte de poids", "prise de poids"],
  },
  {
    ruleId: "portion.body",
    token: "maigrir",
    surfaceForms: ["mincir", "grossir", "slim down", "lose weight", "gain weight"],
  },
  {
    ruleId: "portion.body",
    token: "silhouette",
    surfaceForms: ["body fat", "belly", "ventre", "masse grasse"],
  },
  {
    ruleId: "portion.goal",
    token: "calories",
    // `bmi` / `imc`: le brief dit maintenant en toutes lettres « no BMI », et
    // ce qui entre dans un prompt finit par en sortir. Un verdict sur un corps
    // n'a rien à faire dans une phrase lue à table.
    surfaceForms: [
      "calorie",
      "kcal",
      "calorie deficit",
      "deficit calorique",
      "bmi",
      "imc",
    ],
  },
  // ── LOT 3B — LA TAILLE ET LE TOUR DE TAILLE ─────────────────────────────
  // `taille` NUE reste hors liste: « une part de la taille d'une paume » est la
  // bonne façon d'écrire une portion, et c'est même celle que le brief
  // encourage. Ce sont les formes POSSESSIVES qui désignent le corps de
  // quelqu'un, et elles seules.
  {
    ruleId: "portion.body",
    token: "height",
    surfaceForms: [
      "ta taille",
      "ta hauteur",
      "votre taille",
      "sa taille",
      "your height",
      "his height",
      "her height",
      "how tall",
      "tour de taille",
      "waist",
    ],
  },
  // ── LOT 3B — LES MESURES, DÉSIGNÉES COMME TELLES ────────────────────────
  // Encore les formes possessives seulement: « prends deux mesures de riz » est
  // une consigne de cuisine, pas une fuite.
  {
    ruleId: "portion.body",
    token: "measurements",
    surfaceForms: [
      "tes mesures",
      "vos mesures",
      "ses mesures",
      "your measurements",
      "body measurements",
    ],
  },
  // ── LOT 3B — L'ÂGE ──────────────────────────────────────────────────────
  // La bande d'âge entre désormais dans le brief. Le jeton nu suffit et couvre
  // les deux langues d'un coup (`âge` se normalise en `age`); aucune consigne
  // de service n'a de raison légitime de nommer l'âge de quelqu'un.
  {
    ruleId: "portion.body",
    token: "age",
    surfaceForms: ["years old", "year old", "ans"],
  },
  {
    ruleId: "portion.goal",
    token: "cutting",
    surfaceForms: ["bulking", "seche", "prise de masse", "surplus"],
  },
  {
    ruleId: "portion.goal",
    token: "diet",
    surfaceForms: ["regime", "objectif", "goal"],
  },
  // ── D2 (QA du 2026-08-12) — LES SIX OBJECTIFS, PAR LEUR NOM ─────────────
  //
  // ⚠️ L'ASYMÉTRIE QUE CE BLOC FERME. L6 a réparé le 2026-08-12 la liste des
  // ENTRÉES (`FORBIDDEN_VOICE_TERMS`) et cette liste-ci — celle des SORTIES,
  // c'est-à-dire du texte LU À VOIX HAUTE À TABLE — a gardé le trou intact.
  // Mesuré sur `findForbiddenMatches`, `allowNegatedMentions: false`:
  //
  //     « a smaller starch share for fat loss »   PASSAIT
  //     « extra rice for muscle gain »            PASSAIT
  //     « recomposition »                         PASSAIT
  //     « perte de graisse »                      PASSAIT
  //     « prise de masse »                        mordait (`cutting`)
  //
  // La liste était armée sur le POIDS, le CORPS et les CALORIES, et pas une
  // seule fois sur les six valeurs de `MEMBER_GOALS` — c'est-à-dire sur ce que
  // le produit range dans la colonne que D4 interdit d'énoncer. Rien n'avait
  // fui (1 393 champs passés au crible, 0 morsure), mais parce que le modèle ne
  // les avait pas écrits, pas parce que la garde les aurait arrêtés.
  //
  // ── LES TOKENS SONT LES VALEURS DE `MEMBER_GOALS`, MOT POUR MOT ─────────
  // Pas par élégance: la trace devient alors le vocabulaire du produit
  // (`voice_line_withheld:<membre>:fat_loss`), et un test peut BOUCLER sur la
  // constante réelle plutôt que sur une liste recopiée à côté — un test
  // paramétré par sa propre copie reste vert quand on ajoute un septième
  // objectif.
  //
  // ── CE QUI RESTE DEHORS, ET CE QUE ÇA COÛTE ─────────────────────────────
  //   `fat` NU        « low-fat yogurt », « retire le gras du jambon » sont des
  //                   consignes de service ordinaires. Seul `fat loss` mord —
  //                   le jeton est une SÉQUENCE, pas un mot.
  //   `graisse` NU    « graisse de canard » est un ingrédient.
  //   `muscle` NU     un plat peut nommer un muscle (« blanc », « paleron »).
  //   `maintien` NU   « maintien au chaud » est de la cuisine. C'est
  //                   `maintien du poids` qui parle de quelqu'un.
  //
  // ⚠️ `health`/`sante` ET `performance` MORDENT NUS, ET ILS COÛTENT. Mesuré
  // sur le banc passant: « Il fait attention à sa santé » et « She is very
  // health conscious » sont désormais RETENUES à l'entrée (2 lignes sur 16).
  // C'est assumé dans ce sens-là — ce sont deux des six objectifs, ils se
  // rendent EXACTEMENT par ce mot dans les deux langues (`household.goal.health`
  // = « Health »), et une ceinture qui laisserait passer deux objectifs sur six
  // serait la même asymétrie qu'on ferme ici. Le prix d'une morsure est une
  // ligne non montrée au modèle (tracée), jamais un repas perdu.
  {
    ruleId: "portion.goal",
    token: "fat_loss",
    surfaceForms: [
      "losing fat",
      "lose fat",
      "perte de graisse",
      "perte de gras",
      "perdre de la graisse",
      "perdre du gras",
    ],
  },
  {
    ruleId: "portion.goal",
    token: "muscle_gain",
    surfaceForms: [
      "gaining muscle",
      "gain muscle",
      "building muscle",
      "build muscle",
      "muscle building",
      "prise de muscle",
      "prendre du muscle",
      "gain musculaire",
    ],
  },
  {
    ruleId: "portion.goal",
    token: "recomposition",
    // Le jeton couvre les deux langues d'un coup (« recomposition corporelle »,
    // « body recomposition »): il est le même mot des deux côtés.
    surfaceForms: ["recomp"],
  },
  { ruleId: "portion.goal", token: "performance" },
  { ruleId: "portion.goal", token: "health", surfaceForms: ["sante"] },
  {
    ruleId: "portion.goal",
    token: "maintenance",
    surfaceForms: ["maintien du poids", "maintenir son poids"],
  },
];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — LE VOCABULAIRE DU FLOU. UNE LISTE FERMÉE, DEUX LANGUES, ET ELLE NE
 * RETIRE RIEN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE N'EST PAS `FORBIDDEN_PORTION_TERMS`, ET LES DEUX NE FONT PAS LE MÊME
 * MÉTIER. Celle-là porte des termes de CORPS et elle MORD: la note part à
 * `null`, parce qu'une phrase qui parle du poids de quelqu'un devant toute la
 * table est un dommage qu'on ne répare pas après coup. Celle-ci porte des termes
 * de QUANTITÉ et elle COMPTE: « une bonne portion de poulet » n'est pas
 * dangereux, c'est juste inutile — et le retirer laisserait la bouche sans
 * aucune consigne, ce qui est PIRE que la consigne floue. On mesure, et c'est la
 * mesure qui dira si la consigne resserrée du prompt a porté.
 *
 * ── LA FRONTIÈRE, ET CE QUI RESTE DEHORS ──────────────────────────────────
 * On n'ajoute que du vocabulaire qui remplace UN NOMBRE par une impression.
 *   `un peu` / `a little`   « un peu de sel » est une consigne de cuisine
 *                           parfaitement juste — le sel a droit à la pincée
 *                           dans le prompt depuis FF-038.
 *   `cuillere` / `spoonful` une cuillère EST une unité (`tbsp`/`tsp` sont dans
 *                           `COMPOSITION_UNITS`); mordre dessus punirait une
 *                           quantité vraie.
 *   `louche`                idem: une louche est un ustensile calibré, pas une
 *                           impression.
 * « Une ceinture qui mord sur tout se fait désarmer dans la semaine » — c'est
 * l'arbitrage écrit vingt lignes plus haut pour les unités nues, appliqué ici.
 *
 * ⚠️ AUCUN MATCHER MAISON. On réutilise `findForbiddenMatches`, qui porte déjà
 * les frontières de mot, la normalisation des accents et les pluriels. Écrire un
 * `includes()` ici ferait mordre « poignée » à l'intérieur d'un autre mot et
 * raterait « poignées » — c'est la douzième fois que ce dépôt l'écrit.
 */
export const VAGUE_PORTION_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "portion.vague",
    token: "handful",
    surfaceForms: ["poignee"],
  },
  {
    ruleId: "portion.vague",
    token: "generous portion",
    surfaceForms: [
      "generous helping",
      "generous serving",
      "generous share",
      "large portion",
      "grosse portion",
      "grosse part",
      "belle portion",
      "belle part",
      "grande portion",
    ],
  },
  {
    ruleId: "portion.vague",
    token: "as much as you like",
    surfaceForms: [
      "as much as they like",
      "as much as they want",
      "a volonte",
      "a discretion",
    ],
  },
  {
    ruleId: "portion.vague",
    token: "a good amount",
    surfaceForms: [
      "a good amount of",
      "plenty of",
      "une bonne quantite",
      "une bonne dose",
    ],
  },
];

/**
 * LES MOTIFS DE FLOU D'UNE CONSIGNE. `[]` = elle est chiffrée, ou muette.
 *
 * ⚠️ `allowNegatedMentions: false`, EXACTEMENT COMME `sanitizePortionNote`. « pas
 * une poignée mais 80 g » reste une phrase qui propose une poignée comme repère,
 * et la lecture absolue est celle qu'on veut ici comme là-bas.
 *
 * ⛔ ET ELLE NE REND PAS DE TEXTE, elle rend des motifs. Le texte, lui, sort
 * intact de cette fonction — c'est tout l'écart avec la ceinture du dessus, et
 * c'est ce qui rend le cas passant vérifiable: « Your box: 150 g of the chicken »
 * rend `[]` et sa phrase arrive telle quelle sur l'écran.
 */
export function vaguePortionMatches(raw: unknown): string[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return [];
  const matches = findForbiddenMatches(text, VAGUE_PORTION_TERMS, {
    allowNegatedMentions: false,
  });
  return [...new Set(matches.map((m) => m.token))].sort();
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4C ② — UN NOMBRE SUIVI D'UNE UNITÉ. LE SEUL FAIT VÉRIFIABLE ICI.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI CE COMPTEUR EXISTE, ET CE QU'IL RÉPARE. Le 2026-08-17,
 * `vague_portions` a rendu **0 flou sur 93 notes réelles** — et ce zéro était un
 * FEU VERT FAUX. Voici ce qu'il recouvrait, mot pour mot: « One standard table
 * portion. », « Balanced share of the shared dish. », « Child-size share of the
 * same dish. » ZÉRO note sur 93 portait un gramme. Un compteur qui affiche 0
 * pendant que 93 notes sur 93 sont sans chiffre est PIRE qu'absent: il dit « tout
 * va bien » à qui ouvre le tableau de bord.
 *
 * ⛔ ET CE N'EST PAS UNE LISTE DE MOTS PLUS LONGUE. Ajouter « standard portion »,
 * « balanced share », « child-size » à `VAGUE_PORTION_TERMS` ferait la ceinture
 * qui mord sur tout et qu'on désarme dans la semaine. Le manque est un COMPTEUR,
 * pas du vocabulaire — patron `unquantified_dish_ingredients`, qui constate un
 * champ et ne juge aucun mot.
 *
 * ⚠️ CE N'EST PAS UN MATCHER D'ALIMENT, et la distinction est celle qui compte:
 * cette expression ne connaît AUCUN nom d'aliment, ne décide d'aucun mot, et ne
 * peut donc pas confondre « laitue » et « lait ». Elle constate un CHIFFRE suivi
 * d'une UNITÉ — la forme exacte de `ENERGY_UNIT_RE` (`meal_generation.ts:2656`),
 * qui vit dans ce dépôt depuis FF-038 pour la même raison.
 *
 * ── CE QU'ELLE NE COMPTE PAS, ET C'EST ASSUMÉ ─────────────────────────────
 *   · « half a lemon », « deux tranches » — les DÉNOMBRABLES. Les reconnaître
 *     demanderait de savoir ce qui se compte à l'unité, c'est-à-dire un savoir
 *     sur les ALIMENTS. Conséquence: un plan honnête n'est jamais à 100 %, et ce
 *     nombre est un PLANCHER à surveiller, pas un verdict — exactement le statut
 *     de `unquantified_dish_ingredients`, qui ne fait aucune exception pour le
 *     sel.
 *   · « 3 cm » — `cm` n'est pas une unité de portion. « Coupe les carottes en
 *     morceaux de 3 cm » est une consigne de découpe, pas une part, et la
 *     compter comme chiffrée gonflerait le taux avec des phrases qui ne disent
 *     rien de combien on mange.
 *
 * Les symboles viennent de `COMPOSITION_UNITS` (`g`, `ml`, `tbsp`, `tsp`); les
 * formes écrites en toutes lettres s'y ajoutent parce que ce texte-ci est de la
 * PROSE lue à voix haute, pas un champ structuré. `unit` n'a pas de forme en
 * prose et n'y est donc pas.
 */
const PORTION_QUANTITY_RE =
  /\d[\d.,]*\s*(g|gr|grammes?|grams?|kg|ml|cl|tbsp|tablespoons?|tsp|teaspoons?)\b/i;

/** `true` quand la consigne porte au moins un nombre suivi d'une unité connue. */
export function portionCarriesAQuantity(raw: unknown): boolean {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return false;
  return PORTION_QUANTITY_RE.test(text);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT E — UN IDENTIFIANT DE BOÎTE N'A RIEN À FAIRE DANS UNE PHRASE LUE À TABLE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ MESURÉ, PAS CRAINT. Le 2026-08-17 (run C du LOT 4C), le modèle a écrit,
 * littéralement, dans deux notes de portion: « Use box_prep_chicken_shared. » et
 * « Shares box_chicken_me with the Kid. » L'écran n'affiche JAMAIS d'id de boîte
 * — `data-box-id` est un attribut, jamais du texte — sauf quand le modèle en
 * glisse un dans une PHRASE, et là il traverse tout et se lit à voix haute.
 *
 * ⛔ CE N'EST PAS UN MATCHER MAISON, et c'est toute la différence. On ne cherche
 * pas « ce qui ressemble à un identifiant »: on cherche les ids de boîte de CE
 * PLAN, une liste fermée de quelques chaînes que le parseur vient de garder.
 * Aucun savoir sur les aliments, aucune forme devinée — le patron
 * `preparation_id`, une fois de plus.
 *
 * ⛔ LA LANGUE N'Y CHANGE RIEN, ET C'EST STRUCTUREL: `MEAL_TOKEN_FIELDS` range
 * `preparations[].boxes[].id` parmi les jetons « ASCII snake_case, English words
 * only » — un id n'est jamais traduit. La ceinture mord donc à l'identique sur
 * une note anglaise et sur une note française, et les deux sont testées.
 *
 * ── LE PLANCHER, ASSUMÉ ───────────────────────────────────────────────────
 * Un id SANS souligné (`zoe`) est un mot ordinaire: « Zoe takes a bigger share »
 * le contient, et le nuller serait la cicatrice « laitue ≠ lait » — 12 faux
 * positifs sur 12 mesurés. Ces ids-là sont donc IGNORÉS. Le parseur n'impose pas
 * le snake_case (il n'exige qu'un id non vide et unique), donc le cas existe;
 * il n'a jamais été observé en réel. Comme `quantified`, ce compteur est un
 * PLANCHER, pas un verdict.
 */
export function boxIdsInNote(
  raw: unknown,
  boxIds: ReadonlySet<string>,
): string[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || boxIds.size === 0) return [];
  const found: string[] = [];
  for (const id of boxIds) {
    // ⚠️ LE SOULIGNÉ EST LA CONDITION D'ENTRÉE. Voir le plancher, ci-dessus.
    if (!id.includes("_")) continue;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Les bornes sont écrites à la main plutôt que `\b`: en JavaScript `\w`
    // CONTIENT le souligné, donc `\b` ne borne pas un jeton snake_case comme on
    // l'attendrait. `[^A-Za-z0-9_]` dit exactement ce qu'on veut.
    const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "i");
    if (re.test(text)) found.push(id);
  }
  return [...new Set(found)].sort();
}

export interface SanitizedNote {
  note: string | null;
  /** Les motifs qui ont mordu. Vide = la consigne est passée telle quelle. */
  violations: string[];
}

/**
 * LA CEINTURE, sur le texte rendu par le modèle.
 *
 * ── POURQUOI `allowNegatedMentions: false` ───────────────────────────────
 * Le moteur blanchit par défaut les mentions niées, et c'est le bon réglage
 * pour le verrou de doctrine: « pain sans gluten » ne contredit pas un interdit
 * sur le gluten.
 *
 * Ici c'est l'inverse. « une part sans perte de poids » reste une consigne qui
 * parle de perte de poids devant toute la table — la négation ne rachète rien,
 * parce que ce qu'on interdit n'est pas d'ENCOURAGER le sujet, c'est de
 * l'ÉVOQUER. C'est la lecture absolue, celle que le moteur appelle « audit
 * mode », et elle est le bon choix pour ce cas-ci seulement.
 *
 * ── PAS DE RÉÉCRITURE, UNE MISE À NULL ───────────────────────────────────
 * On ne tente pas de retirer le mot fautif pour sauver la phrase. Une consigne
 * amputée est illisible, et bricoler du texte de modèle produit des phrases
 * dont personne ne répond. `null` = part standard, ce qui est vrai, lisible,
 * et rendu par l'écran dans sa langue.
 */
export function sanitizePortionNote(raw: unknown): SanitizedNote {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { note: null, violations: [] };

  const matches = findForbiddenMatches(text, FORBIDDEN_PORTION_TERMS, {
    allowNegatedMentions: false,
  });
  if (matches.length === 0) return { note: text, violations: [] };

  const violations = [...new Set(matches.map((m) => m.token))].sort();
  return { note: null, violations };
}

export interface ReconciledPortions {
  portions: MemberPortion[];
  /** Ce qui a été corrigé. Tracé, jamais silencieux. */
  issues: string[];
  /**
   * LOT 4 — LE FLOU, COMPTÉ SUR LES CONSIGNES QUI SORTENT VRAIMENT.
   *
   *   · `notes` — les textes examinés: une `portion_note` qui a survécu à
   *     `sanitizePortionNote`, plus chaque note de part gardée. Le dénominateur.
   *   · `vague` — ceux qui portent au moins un motif de `VAGUE_PORTION_TERMS`.
   *
   * ⚠️ LE DÉNOMINATEUR N'EST PAS DÉCORATIF. « 3 consignes floues » ne veut rien
   * dire: sur trois consignes c'est un échec total, sur quarante c'est du bruit.
   * Ce dépôt a déjà écrit deux fois qu'un compteur sans population est un
   * compteur qui ment.
   *
   * ⚠️ MESURÉ APRÈS LA CEINTURE DE CORPS, ET DANS CET ORDRE. Une note mise à
   * `null` parce qu'elle parlait d'un poids n'est plus une consigne: la compter
   * comme « chiffrée » ou comme « floue » raconterait dans les deux cas quelque
   * chose de faux sur un texte que personne ne lira.
   *
   *   · `quantified` — LOT 4C: ceux qui portent au moins un nombre suivi d'une
   *     unité (`portionCarriesAQuantity`). ⛔ C'EST LE CHIFFRE QUI MANQUAIT, et
   *     `vague` ne le remplace pas: `vague: 0` a été mesuré sur 93 notes dont
   *     AUCUNE ne portait un gramme. « Pas de mot flou » et « une part précise »
   *     sont deux faits différents, et c'est le second que P4 demande.
   */
  /**
   *   · `box_ids` — LOT E: les notes MISES À NULL parce qu'elles nommaient un
   *     identifiant technique de boîte.
   *
   * ⛔ `box_ids` N'EST PAS UN SOUS-ENSEMBLE DE `notes`, ET LE RAPPORT
   * `box_ids / notes` NE VEUT RIEN DIRE. Une note nullée n'est plus une
   * consigne: elle sort du dénominateur, exactement comme celles que
   * `sanitizePortionNote` refuse. `box_ids` est un décompte d'ÉVÉNEMENTS, à lire
   * seul.
   */
  vagueCounts: {
    notes: number;
    vague: number;
    quantified: number;
    box_ids: number;
  };
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LOT 4C ① — LES PARTS QUI DÉSIGNENT UNE PRÉPARATION QUI N'EXISTE PAS.
   * ══════════════════════════════════════════════════════════════════════════
   *
   *   · `shares`  — les parts gardées (note lisible ET préparation résolue).
   *   · `unknown` — celles dont le `preparation_id` n'est dans aucune
   *                 préparation du plan. JETÉES, et comptées.
   *
   * ⚠️ MESURÉ LE 2026-08-17: 18 parts sur 18 d'un plan réel citaient
   * `prep_chicken_roast`, `prep_rice_batch`, `prep_veg_tray` — trois
   * préparations qui n'existaient pas dans ce plan. Le lecteur ne joignait rien,
   * la ligne était filtrée, et la surface « les grammes de chaque bouche » ne
   * rendait RIEN, sur des données réelles, sans qu'aucun compteur ne bouge.
   *
   * ⚠️ `unknown` SE COMPTE, IL NE SE DÉDUIT PAS. `shares` compte ce qui sort,
   * `unknown` ce qui tombe; les dériver l'un de l'autre est la cicatrice
   * `withheld`/`over_cap`, et elle est écrite trois fois dans `meal_generation.ts`.
   */
  shareCounts: { shares: number; unknown: number };
}

/**
 * CE QUE LE MODÈLE A RENDU, RÉCONCILIÉ AVEC LE FOYER RÉEL.
 *
 * Trois écarts possibles, trois traitements différents — et c'est le partage
 * qui compte:
 *
 *   MEMBRE MANQUANT   → complété d'une part standard, tracé. On ne jette PAS
 *                       le repas: une consigne absente pour une personne sur
 *                       quatre est un défaut mineur, et perdre la cuisson du
 *                       samedi soir pour ça serait la vraie perte.
 *   MEMBRE FANTÔME    → jeté. Une consigne pour quelqu'un qui n'habite pas là
 *                       est du texte inventé, et le rendre à l'écran ferait
 *                       apparaître un inconnu à table.
 *   CONSIGNE FAUTIVE  → mise à null, tracée. Voir `sanitizePortionNote`.
 *
 * L'ordre de sortie suit celui des MEMBRES, pas celui du modèle: l'écran doit
 * lister le foyer dans un ordre stable d'un repas à l'autre.
 */
export function reconcilePortions(
  members: readonly PortionMember[],
  raw: unknown,
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LOT 4C ① — LA LISTE FERMÉE DES PRÉPARATIONS DE CE PLAN.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS, JAMAIS `?`, ET C'EST LA MOITIÉ DE LA GARDE. Un paramètre optionnel
   * n'aurait fait remonter AUCUN appelant au compilateur; la liste serait vide
   * par défaut, donc TOUTE part serait jetée — ou, avec un repli « liste vide =
   * on ne vérifie pas », la garde naîtrait désarmée. « Paramètre de garde
   * optionnel = garde désarmée » est une cicatrice de ce dépôt, et `boxMemberIds`
   * est le patron exact, à trois cents lignes d'ici.
   *
   * ⚠️ CE SONT LES IDS DES PRÉPARATIONS **GARDÉES**, pas ceux que le modèle a
   * écrits. Une préparation refusée par le parseur (une portion, cible numérique,
   * titre manquant) n'existe plus dans le plan: une part qui la cite ne joindra
   * rien à l'écran, et la laisser passer rendrait une ligne muette.
   *
   * C'est le patron `preparation_id` de `dishes[].uses[]`
   * (`meal_generation.ts`, « unknown preparation, dropped »), appliqué au seul
   * champ du plan qui l'avait manqué.
   */
  preparationIds: readonly string[],
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LOT E — LES IDS DE BOÎTE DE CE PLAN. REQUIS, JAMAIS `?`.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Même raison que `preparationIds` juste au-dessus, et elle a déjà servi deux
   * fois dans ce fichier: un paramètre de garde optionnel est une garde
   * désarmée. Avec un `?`, l'unique appelant de production pourrait cesser de le
   * passer sans qu'aucun compilateur ni aucun test ne bouge, et la note
   * continuerait de dire « Use box_prep_chicken_shared » à toute la table.
   *
   * ⚠️ CE SONT LES BOÎTES **GARDÉES** (`preparations[].boxes[].id` en sortie du
   * parseur), pas celles que le modèle a déclarées. Une boîte refusée n'existe
   * nulle part: son id dans une phrase est du bruit exactement comme les autres,
   * et il n'y a aucune raison de le laisser passer — mais la liste fermée est
   * celle du plan qu'on écrit, comme partout ailleurs.
   *
   * ⚠️ `[]` EST LÉGITIME ET FRÉQUENT: la lane individuelle n'a aucune boîte, et
   * un foyer où le modèle n'a pas obéi non plus. La ceinture est alors muette —
   * et c'est juste: sans boîte, il n'y a aucun id à faire fuir.
   */
  boxIds: readonly string[],
): ReconciledPortions {
  const issues: string[] = [];
  // LOT 4 — LES NOMBRES DU FLOU. Passés par référence à `parseShares` pour
  // qu'il n'existe qu'UN compteur: une seconde addition côté appelant
  // divergerait au premier changement de forme des parts.
  const vagueCounts = { notes: 0, vague: 0, quantified: 0, box_ids: 0 };
  const shareCounts = { shares: 0, unknown: 0 };
  const knownPreparations = new Set(
    preparationIds.map((id) => String(id).trim()).filter(Boolean),
  );
  const knownBoxIds = new Set(
    boxIds.map((id) => String(id).trim()).filter(Boolean),
  );
  const byMember = new Map<string, Record<string, unknown>>();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      // AUCUN REPLI SUR `user_id`, et c'est délibéré. Un lecteur qui accepte
      // les deux clés accepte aussi un générateur qui a cessé d'émettre la
      // bonne — après quoi le repli DEVIENT le chemin nominal sans que rien ne
      // le dise. Il n'y a pas d'utilisateur réel: la bascule est sèche.
      const memberId = String(row.member_id ?? row.memberId ?? "").trim();
      if (!memberId) continue;
      if (!members.some((m) => m.memberId === memberId)) {
        issues.push(`portion_for_unknown_member:${memberId}`);
        continue;
      }
      byMember.set(memberId, row);
    }
  }

  const portions = members.map((member) => {
    const row = byMember.get(member.memberId);
    if (!row) {
      issues.push(`portion_missing:${member.memberId}`);
      return {
        memberId: member.memberId,
        displayName: member.displayName,
        portionNote: null,
        preparationShares: [],
      };
    }

    const sanitized = sanitizePortionNote(
      row.portion_note ?? row.portionNote,
    );
    let note = sanitized.note;
    for (const v of sanitized.violations) {
      issues.push(`portion_note_rejected:${member.memberId}:${v}`);
    }
    // ── LOT E · L'ID DE BOÎTE, APRÈS LA CEINTURE DE CORPS ET AVANT LES DEUX
    //           COMPTEURS DE NOTE ──────────────────────────────────────────
    //
    // ⚠️ L'ORDRE EST LE SUJET, comme pour la liste fermée des préparations. Une
    // note nullée ici ne sera jamais lue: la compter dans `notes` gonflerait le
    // dénominateur du flou avec du texte que personne ne voit.
    //
    // ⛔ MISE À NULL, PAS DE RÉÉCRITURE. Retirer le slug pour sauver la phrase
    // donnerait « Use . » ou « Shares  with the Kid. » — du texte de modèle
    // amputé, dont personne ne répond. C'est le choix que `sanitizePortionNote`
    // a déjà tranché quinze lignes plus haut, pour la même raison.
    //
    // ⚠️ CE QUE ÇA COÛTE, ET POURQUOI ON LE PAIE: si la phrase portait un
    // gramme, il tombe avec elle. Mais ce gramme-là n'est pas perdu à l'écran —
    // il vient de la BOÎTE (`preparations[].boxes[].grams`), qui est structurée,
    // et que `DishCard` comme la ligne de part rendent déjà (« Box Zoe — 220 g »).
    const leakedBoxIds = boxIdsInNote(note, knownBoxIds);
    if (leakedBoxIds.length > 0) {
      vagueCounts.box_ids++;
      note = null;
      for (const id of leakedBoxIds) {
        issues.push(`portion_note_box_id:${member.memberId}:${id}`);
      }
    }
    // LOT 4 — LE FLOU, SUR LA CONSIGNE QUI SORT. Après la ceinture de corps, et
    // seulement sur ce qui a survécu: une note mise à `null` n'est plus une
    // consigne, et la compter dirait quelque chose sur un texte que personne ne
    // lira.
    if (note !== null) {
      vagueCounts.notes++;
      // LOT 4C ② — LE CHIFFRE, COMPTÉ AU MÊME ENDROIT QUE LE FLOU, SUR LA MÊME
      // POPULATION. Deux dénominateurs pour deux propriétés du même texte
      // finiraient par ne plus se comparer.
      if (portionCarriesAQuantity(note)) vagueCounts.quantified++;
      const vague = vaguePortionMatches(note);
      if (vague.length > 0) {
        vagueCounts.vague++;
        for (const v of vague) {
          issues.push(`portion_note_vague:${member.memberId}:${v}`);
        }
      }
    }

    return {
      memberId: member.memberId,
      displayName: member.displayName,
      portionNote: note,
      preparationShares: parseShares(
        row,
        member,
        issues,
        vagueCounts,
        shareCounts,
        knownPreparations,
        knownBoxIds,
      ),
    };
  });

  return { portions, issues, vagueCounts, shareCounts };
}

function parseShares(
  row: Record<string, unknown>,
  member: PortionMember,
  issues: string[],
  vagueCounts: {
    notes: number;
    vague: number;
    quantified: number;
    box_ids: number;
  },
  shareCounts: { shares: number; unknown: number },
  knownPreparations: ReadonlySet<string>,
  knownBoxIds: ReadonlySet<string>,
): PreparationShare[] {
  const raw = row.preparation_shares ?? row.preparationShares;
  if (!Array.isArray(raw)) return [];
  const out: PreparationShare[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const preparationId = String(e.preparation_id ?? e.preparationId ?? "").trim();
    if (!preparationId) continue;
    // ── LOT 4C ① · LA LISTE FERMÉE, AVANT TOUT LE RESTE ───────────────────
    //
    // ⛔ AVANT LA CEINTURE DE CORPS ET AVANT LES DEUX COMPTEURS DE NOTE, et
    // l'ordre est le sujet: une part qui ne joint aucune préparation ne sera
    // JAMAIS rendue. La compter dans `notes` gonflerait le dénominateur du flou
    // avec du texte que personne ne lit — exactement l'erreur que
    // `sanitizePortionNote` évite déjà en ne comptant que ce qui SORT.
    //
    // ⚠️ ET ÇA NE REJETTE NI LE PLAT NI LA PRÉPARATION NI LA BOUCHE. Seule la
    // ligne tombe; `portion_note` — la consigne principale de cette personne —
    // sort intacte. Posture de tout le lot: compter, nommer, ne rien perdre
    // d'autre.
    if (!knownPreparations.has(preparationId)) {
      shareCounts.unknown++;
      issues.push(
        `share_for_unknown_preparation:${member.memberId}:${preparationId}`,
      );
      continue;
    }
    const sanitized = sanitizePortionNote(e.note);
    let note = sanitized.note;
    for (const v of sanitized.violations) {
      issues.push(`share_note_rejected:${member.memberId}:${preparationId}:${v}`);
    }
    // ── LOT E · L'ID DE BOÎTE, ICI AUSSI ──────────────────────────────────
    //
    // ⛔ ET C'EST LA MOITIÉ QUI COMPTE LE PLUS. La fuite mesurée au run C du
    // LOT 4C (« Use box_prep_chicken_shared. ») vit dans une note de PART: c'est
    // le texte accroché sous un plat, celui qui dit à une personne ce qu'elle
    // sort du frigo. Ne ceinturer que `portion_note` aurait laissé passer
    // exactement le cas observé — la cicatrice « garde testée dans une seule
    // langue », transposée à « garde posée sur un seul des deux champs ».
    const leakedBoxIds = boxIdsInNote(note, knownBoxIds);
    if (leakedBoxIds.length > 0) {
      vagueCounts.box_ids++;
      note = null;
      for (const id of leakedBoxIds) {
        issues.push(
          `share_note_box_id:${member.memberId}:${preparationId}:${id}`,
        );
      }
    }
    // Une part sans consigne lisible n'apporte rien à l'écran: on la laisse
    // tomber plutôt que d'afficher une ligne vide sous un plat.
    if (note) {
      // LOT 4 — MÊME MESURE QUE SUR LA NOTE PRINCIPALE, ET AU MÊME MOMENT:
      // après la ceinture de corps, sur ce qui sort vraiment.
      vagueCounts.notes++;
      if (portionCarriesAQuantity(note)) vagueCounts.quantified++;
      const vague = vaguePortionMatches(note);
      if (vague.length > 0) {
        vagueCounts.vague++;
        for (const v of vague) {
          issues.push(`share_note_vague:${member.memberId}:${preparationId}:${v}`);
        }
      }
      shareCounts.shares++;
      out.push({ preparationId, note });
    }
  }
  return out;
}

/** Le format stocké dans `student_generated_meals.member_portions`. */
export function memberPortionsPayload(
  portions: readonly MemberPortion[],
): Array<Record<string, unknown>> {
  return portions.map((p) => ({
    member_id: p.memberId,
    display_name: p.displayName,
    portion_note: p.portionNote,
    preparation_shares: p.preparationShares.map((s) => ({
      preparation_id: s.preparationId,
      note: s.note,
    })),
  }));
}
