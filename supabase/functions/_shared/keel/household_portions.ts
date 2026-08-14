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

/** Reflet du CHECK `student_goals_goal_check`. */
export const MEMBER_GOALS = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;
export type MemberGoal = (typeof MEMBER_GOALS)[number];

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
   */
  eatingSlots: readonly string[] | null;
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
  muscle_gain:
    "larger protein and starch share, same vegetables",
  recomposition:
    "full protein share, moderate starch, generous vegetables",
  performance:
    "larger starch share around training, full protein share",
  // ── `health` A CESSÉ D'ÊTRE MUET (2026-08-11) ────────────────────────────
  // Il rendait EXACTEMENT la chaîne de `maintenance`, qui est aussi le repli
  // « aucun objectif ». Choisir « santé » produisait donc l'assiette de qui n'a
  // rien déclaré: un champ qui promet un effet et n'en a aucun. C'est le choix
  // le plus naturel pour un titulaire sans objectif de performance — et c'est
  // précisément lui qui paie pour être pris en compte.
  //
  // POURQUOI CETTE FORMULATION ET PAS UNE AUTRE. « Plus de légumes, céréales
  // complètes, moins de transformé » serait une consigne de COMPOSITION: elle
  // ne veut rien dire au moment de servir un plat qui est déjà décidé. Ce
  // module ne dit que des PARTS. La seule chose que « santé » peut demander à
  // une assiette, c'est la place des légumes — sans toucher au rapport
  // protéine/féculent, ce qui la distingue de `recomposition` et de `fat_loss`.
  health:
    "generous vegetables, balanced protein and starch share",
  maintenance:
    "balanced share of every component",
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
 * ⚠️ L'ORDRE DES TROIS CAS EST LE MÊME QUE DANS `buildPortionBrief`, ET CE
 * N'EST PAS UNE COÏNCIDENCE: c'est la MÊME décision, lue deux fois. Le mineur
 * d'abord — sa direction est une TAILLE, jamais une orientation, donc il ne
 * demande rien à personne et il est servable de n'importe quelle casserole.
 * Ensuite `goalApplies`, qui refuse aussi l'âge inconnu.
 *
 * Le test `household_merge_test.ts` vérifie que les deux lectures ne peuvent
 * pas diverger: la direction rendue par `buildPortionBrief` pour un membre est
 * exactement celle dont on lit les axes ici.
 */
export function servingDemandsFor(member: PortionMember): ServingAxisDemands {
  if (member.ageState === "minor") return { ...NO_DEMAND };
  if (goalApplies(member) && member.goal) {
    return readServingDemands(SERVING_DIRECTION[member.goal]);
  }
  return readServingDemands(NEUTRAL_DIRECTION);
}

/**
 * LA DIRECTION ÉCRITE POUR CE MEMBRE — extraite de `buildPortionBrief` pour
 * qu'il n'y ait qu'UN endroit qui choisisse entre les trois.
 */
export function servingDirectionFor(member: PortionMember): string {
  if (member.ageState === "minor") return CHILD_DIRECTION;
  return goalApplies(member) && member.goal
    ? SERVING_DIRECTION[member.goal]
    : NEUTRAL_DIRECTION;
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
    const when = m.eatingSlots === null || m.eatingSlots.length === 0
      ? ""
      : ` — eats at ${m.eatingSlots.join(", ")} only`;
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
    // EN DERNIER, ET ÇA RESTE LE CAS APRÈS LE LOT 3B. Un modèle lit la
    // contrainte la plus proche de la fin comme la plus contraignante, et c'est
    // celle-ci qui doit survivre aux faits corporels qu'on vient d'ajouter.
    "NEVER state a reason, a goal, a calorie count or anything about a person's",
    "body in these instructions. They are read aloud at the table by the whole",
    "household. Write what to serve, never why.",
  ].join("\n");
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
): ReconciledPortions {
  const issues: string[] = [];
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

    const { note, violations } = sanitizePortionNote(
      row.portion_note ?? row.portionNote,
    );
    for (const v of violations) {
      issues.push(`portion_note_rejected:${member.memberId}:${v}`);
    }

    return {
      memberId: member.memberId,
      displayName: member.displayName,
      portionNote: note,
      preparationShares: parseShares(row, member, issues),
    };
  });

  return { portions, issues };
}

function parseShares(
  row: Record<string, unknown>,
  member: PortionMember,
  issues: string[],
): PreparationShare[] {
  const raw = row.preparation_shares ?? row.preparationShares;
  if (!Array.isArray(raw)) return [];
  const out: PreparationShare[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const preparationId = String(e.preparation_id ?? e.preparationId ?? "").trim();
    if (!preparationId) continue;
    const { note, violations } = sanitizePortionNote(e.note);
    for (const v of violations) {
      issues.push(`share_note_rejected:${member.memberId}:${preparationId}:${v}`);
    }
    // Une part sans consigne lisible n'apporte rien à l'écran: on la laisse
    // tomber plutôt que d'afficher une ligne vide sous un plat.
    if (note) out.push({ preparationId, note });
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
