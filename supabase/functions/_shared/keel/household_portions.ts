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
import type { RequiredDensity, SlotDensity } from "./portion_sizing.ts";
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
import { type BirthDateVerdict, KEEL_MINOR_AGE } from "./student_age.ts";
import type { MouthBody } from "./meal_envelope.ts";
// L8 — LE RYTHME **EXÉCUTÉ**, pas celui que le curseur autorise. Voir
// `mouthTargetFactor`: c'est toute la différence entre un grammage tenable et
// une promesse que la casserole ne livre pas.
import {
  DEFAULT_PACE_KG_PER_WEEK,
  estimatedMaintenanceFor,
  type ExecutedPace,
  executedPaceFor,
  type PaceSubject,
  type ScaleDirection,
  scaleDirectionOf,
} from "./weight_pace.ts";
import {
  conditionGatePopulationOf,
  conditionGateReason,
} from "./condition_energy_gate.ts";
import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { householdBodyFacts, type MealBodyContext } from "./meal_body.ts";
// G4 — LE MODULE DES HABITUDES EST IMPORTÉ, JAMAIS RECOPIÉ. Le fragment de
// ligne et sa phrase de conséquence vivent avec la lecture du jsonb: deux
// endroits qui écriraient le marqueur `has their own` finiraient par en écrire
// deux formes différentes, et la conséquence ne s'attacherait plus à rien.
import {
  HABIT_CONSEQUENCE,
  habitFragment,
  habitNoteFragment,
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
   * ⟳ 2026-09-07 — LES MOMENTS QU'ELLE A MARQUÉS « LÉGER ».
   *
   * ⛔ REQUIS, jamais `?`, pour la raison écrite juste au-dessus pour `body`:
   * un champ facultatif ne fait remonter aucun appelant au compilateur, et le
   * marqueur `(light)` serait écrit, testé, servi à personne.
   *
   * `[]` = aucun moment marqué. C'est le cas de toute la base d'avant le lot 2.
   */
  lightSlots: readonly string[];
  /**
   * ⟳ 2026-09-08 — CE QUE LES PLATS SERVIS À CETTE BOUCHE DOIVENT PESER EN
   * ÉNERGIE, moment par moment (`requiredDensityFor`, `portion_sizing.ts`).
   *
   * ── POURQUOI UNE DENSITÉ ET PAS UNE CIBLE ─────────────────────────────
   * « au moins 182 kcal pour 100 g » est un fait sur une CASSEROLE; « tu vises
   * 3 180 kcal » est un fait sur quelqu'un. Le premier peut se dire au modèle
   * (v33 lui a retiré le corps de tout le monde, et ce champ ne le lui rend
   * pas); le second ne sort jamais du moteur. Mesuré le 2026-09-07: sans ce
   * fait, le modèle écrit des plats à 113 kcal/100 g pour une cible qui en
   * demande 159, et 383 kcal sur 3 080 meurent au plafond d'assiette.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif ne fait remonter
   * AUCUN appelant au compilateur: la ligne serait écrite, testée, et servie à
   * personne — le mode d'échec n°1 de ce fichier, déjà payé par `body`.
   *
   * `null` = PERSONNE N'A CALCULÉ (chemin legacy, référentiel absent), ce qui
   * n'est pas « le calcul n'a rien trouvé » — ce cas-là rend un objet dont les
   * deux listes sont vides et dont `reason` dit pourquoi.
   */
  requiredDensity: RequiredDensity | null;
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
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LES MOMENTS OÙ CETTE BOUCHE MANGE, TELS QU'ILS ÉTAIENT À LA COMPOSITION.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT QUE ÇA FERME (2026-08-19) ──────────────────────────────
   * L'écran nomme les bouches sous chaque plat. Il les nommait TOUTES, sans
   * jamais demander si elles mangent à ce moment-là: Christèle, qui a déclaré
   * déjeuner et dîner, se retrouvait marquée au petit-déjeuner à côté d'iku.
   *
   * ⛔ ET C'EST LE PLAN QUI LES PORTE, PAS UNE RELECTURE DU FOYER À
   * L'AFFICHAGE. Demandé mot pour mot: « il faut que le plan respecte les
   * créneaux qui sont renseignés AU MOMENT DE FAIRE LE PLAN ». Un écran qui
   * relirait le roster montrerait les créneaux d'AUJOURD'HUI sous un plan
   * composé la semaine dernière — et c'est précisément la divergence que ce
   * dépôt paie à chaque fois qu'une même question a deux sources.
   *
   * ⚠️ `null` = elle n'a rien déclaré, donc elle suit la maison. Ce n'est PAS
   * « elle ne mange jamais »: les deux se rendraient pareil à l'écran, et
   * confondre les deux ferait disparaître une bouche muette de tous ses repas.
   * Le repli sur le rythme de la maison est celui du moteur, à l'identique.
   */
  eatingSlots: readonly EatingOccasionSlot[] | null;
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
  fat_loss: "generous vegetables, full protein share, smaller starch share",
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
  maintenance: "balanced share of every component",
  muscle_gain: "larger protein and starch share, same vegetables",
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LES DIRECTIONS SANS TAILLE — ce qu'on dit quand LE MOTEUR possède le nombre.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ SUR LE PLAN `cfd44e89` (2026-08-19 00:35) ───────────
 * `child-size` était mort, et la comparaison GÉNÉRIQUE avait survécu. Quatre
 * phrases lues à table, deux qui disent l'inverse de ce qu'elles servent:
 *
 *     Odalric  (79 kg)  « Serve a larger share of the chicken and rice » 273 g ✅
 *     Peregrine(47 kg)  « Serve a larger share of chicken and rice »     134 g ❌
 *     Casimir  (70 kg)  « Serve the standard share of all components »   271 g ❌
 *     Wilfrid  (23 kg)  « Serve the standard share of all components »   147 g ✅
 *
 * Le modèle décrit par CLASSE — adultes « larger », mineurs « standard » —
 * pendant que le moteur chiffre par CORPS. Peregrine s'entend dire « une plus
 * grande part » et reçoit la plus petite; Casimir s'entend dire « la part
 * normale » et reçoit presque le double.
 *
 * ⛔ C'EST PIRE QUE LE DÉFAUT D'AVANT SUR UN POINT PRÉCIS: avant, la phrase
 * était fausse mais COHÉRENTE. Là elle se contredit DANS LA MÊME LIGNE, et
 * quelqu'un qui la suit ne sait pas quoi faire.
 *
 * ── LE PRINCIPE QUI TRANCHE: UNE SEULE AUTORITÉ SUR LA TAILLE ────────────
 * Le moteur possède le nombre ⇒ le modèle ne décrit plus AUCUNE taille — ni
 * « larger », ni « standard », ni « the same as ». Sa phrase porte ce que lui
 * seul sait: la manière, l'ordre, les substitutions, les précautions
 * (« retirer les croûtes », « sauce piquante à part », « pas de fenouil »).
 * C'est exactement ce que font déjà les bonnes moitiés des phrases mesurées.
 *
 * ── CE QUI SE PERD, ET IL FAUT LE NOMMER ─────────────────────────────────
 * La MAGNITUDE de la composition (« smaller starch share », « larger protein
 * share ») sort du texte de l'assiette; il n'en reste que l'ORDRE. C'est un
 * arbitrage assumé: un mot de composition que le modèle rend comme une
 * comparaison entre DEUX PERSONNES est pire qu'aucun mot, parce que deux
 * bouches sur quatre s'entendent dire le contraire de ce qu'elles reçoivent.
 * ⚠️ Rien ne se perd côté MOTEUR: `servingDemandsFor` / `readServingDemands`
 * lisent toujours `SERVING_DIRECTION`, que ce lot ne touche pas — la fusion et
 * l'arbitrage voient exactement ce qu'ils voyaient hier.
 *
 * ── UNE SEULE LECTURE DE LA RÈGLE DES TROIS CAS ──────────────────────────
 * ⚠️ CE N'EST PAS UN SECOND `if`. L'ordre des trois cas (objectif applicable →
 * mineur → repli) reste écrit UNE fois, dans `servingDirectionFor`; ce qui suit
 * est une TRADUCTION pure, clée sur ce qu'elle rend. Deux lectures de la même
 * règle divergeraient, et celle-ci gouverne une phrase lue à voix haute.
 */
const SIZE_FREE_DIRECTIONS: ReadonlyArray<readonly [string, string]> = [
  [
    SERVING_DIRECTION.fat_loss,
    "vegetables first on the plate, then the protein, then the starch",
  ],
  [SERVING_DIRECTION.maintenance, "all the components together on the plate"],
  [
    SERVING_DIRECTION.muscle_gain,
    "protein and starch first on the plate, then the vegetables",
  ],
  [NEUTRAL_DIRECTION, "all the components together on the plate"],
  [CHILD_DIRECTION, "all the components together on the plate"],
];

/**
 * LE REPLI, NOMMÉ. Il ne devrait jamais servir — un test exige que la table
 * couvre TOUTE sortie possible de `servingDirectionFor`, donc l'ajout d'un
 * objectif casse le banc avant d'atteindre une assiette. Il existe parce qu'une
 * chaîne inconnue ne doit pas rendre `undefined` dans un prompt.
 */
export const SIZE_FREE_FALLBACK_DIRECTION =
  "all the components together on the plate";

/**
 * LA DIRECTION DE SERVICE **SANS TAILLE** DE CETTE BOUCHE.
 *
 * ⚠️ N'EST APPELÉE QUE QUAND LE MOTEUR DIMENSIONNE. Sans moteur, c'est le
 * modèle qui porte le nombre, et lui retirer les mots de taille le laisserait
 * sans rien à dire — la vague de 93 notes sans un gramme, mesurée au LOT 4C.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeFreeDirectionFor(member: PortionMember): string {
  const said = servingDirectionFor(member);
  for (const [from, to] of SIZE_FREE_DIRECTIONS) if (from === said) return to;
  return SIZE_FREE_FALLBACK_DIRECTION;
}

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
  const out: ServingAxisDemands = {
    protein: null,
    starch: null,
    vegetables: null,
  };
  const words = String(direction ?? "").toLowerCase().split(/[^a-z]+/).filter(
    Boolean,
  );
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
/**
 * ⟳ 2026-09-08 — CE QU'UNE DENSITÉ EST, ET CE QU'ELLE N'EST PAS.
 *
 * ⛔ « as served » EST LA MOITIÉ QUI COMPTE. Sans elle, un modèle atteint la
 * densité demandée en écrivant les grammes CRUS d'un riz qui triple à la
 * cuisson: la recette annonce 180 kcal/100 g et l'assiette en sert 60. C'est le
 * même piège que `cooked-rows-read-as-raw-in-the-referential`, du côté du
 * prompt cette fois.
 *
 * ⛔ ET ON NOMME L'ÉCHAPPATOIRE. « Rends ce plat plus dense » se satisfait en
 * servant moins — ce qui laisse la personne avec la même assiette rabotée, par
 * l'autre bout. La consigne dit donc que la MASSE ne bouge pas: c'est la
 * recette qu'on change.
 */
/**
 * LA DENSITÉ REQUISE, EN BOUT DE LIGNE — ou rien.
 *
 * ⛔ « dishes served here », PAS « <prénom> needs ». La formule décide de ce que
 * le modèle croit lire: la première décrit une casserole, la seconde décrit
 * quelqu'un — et v33 lui a retiré le corps de tout le monde exprès. Un test lit
 * le prompt entier et refuse tout `kcal` qui ne soit pas suivi de `per 100 g`.
 *
 * ⚠️ LE PREMIER MOMENT PORTE L'UNITÉ, LES SUIVANTS NON. « at least 182 kcal per
 * 100 g at lunch, 159 at dinner » se lit d'un trait; répéter l'unité quatre
 * fois fait une ligne qu'on saute.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * ⛔ EXPORTÉE LE 2026-09-08 POUR LE BRIEF DU FOYER, et sans toucher un mot.
 * Les cartes v34 doivent porter la MÊME phrase que la ligne de portion v33:
 * deux rédactions du même fait divergeraient au premier ajustement, et c'est
 * celle qu'on relit le moins qui écrirait les recettes.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C · C4 (2026-09-11) — LA VISÉE ET LA DENSITÉ DE LA CIBLE, LES DEUX
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE TYPE EXISTE POUR NE PAS SUPPOSER UN CHAMP QUI N'EST PAS ENCORE LÀ.
 * `targetAnchoredPer100G` (= `100 × E / Gpréf`) est ajouté à `SlotDensity` par
 * le lot B, dans `portion_sizing.ts`. Tant qu'il n'y est pas, `undefined` se lit
 * comme « ce couloir ne dit rien de sa cible », et on s'abstient — jamais un
 * `as` sur le type du voisin, qui rendrait un `undefined` indiscernable d'un
 * nombre (`as-cast-on-foreign-type-disarms-typecheck`).
 *
 * ⚠️ `SlotDensity[]` EST ASSIGNABLE À CE TYPE: la propriété est optionnelle, donc
 * aucun appelant ne change, et le jour où le lot B pose le champ il arrive ici
 * tout seul.
 */
export type SlotDensityWithAnchor = SlotDensity & {
  readonly targetAnchoredPer100G?: number | null;
};

/**
 * L'ÉCART À PARTIR DUQUEL ON NOMME LES DEUX NOMBRES.
 *
 * ⛔ 15 %, ET CE N'EST PAS UN RÉGLAGE DE GOÛT. Ce dépôt assume déjà ±10 à 15 %
 * d'erreur de table et de cuisson (`food_composition.ts`, pavé `ML_TO_G`).
 * En dessous de ce bruit, « 145 » et « 152 » décrivent la même assiette, et
 * écrire les deux ferait une ligne plus longue pour une distinction que
 * personne ne peut agir. Au-dessus, ce sont deux assiettes différentes — et
 * c'est exactement le cas mesuré sous le nom A15: un déjeuner de 1 120 kcal
 * dont la cible seule demanderait **236 kcal/100 g** quand les plats réels de
 * ce dépôt vivent entre **113 et 156**.
 */
export const ANCHOR_DIVERGENCE_RATIO = 1.15;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI ON NOMME LES DEUX, ET POURQUOI ON NE SUBSTITUE PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le chantier demande `Dpréf = 100 × cible / grammage préféré` (lot C.4). Ce
 * dépôt a tranché l'INVERSE, avec des mesures, sous le nom **A15**
 * (`docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md:573`): cette formule rend
 * 236 kcal/100 g sur un déjeuner de 1 120 kcal, et on a mesuré **389 demandés
 * au dîner, 126,7 rendus** — consigne ignorée. Y revenir réintroduirait un
 * défaut mesuré.
 *
 * ⛔ CE QU'ON RETIENT DE LA DEMANDE, C'EST LE MOT « SILENCIEUSEMENT ». La visée
 * ne vient PAS de la cible, elle vient du bas du couloir (l'assiette la plus
 * grande, la plus facile à composer). Présenter ce nombre seul le fait lire
 * comme s'il venait de la cible. Quand les deux divergent, la ligne dit les
 * deux et dit lequel vise: rien n'est substitué en silence, et la mesure qui a
 * fondé A15 n'est pas jetée.
 */
function anchorClause(d: SlotDensityWithAnchor, aim: number): string {
  const anchored = d.targetAnchoredPer100G;
  if (typeof anchored !== "number" || !Number.isFinite(anchored)) return "";
  if (anchored <= 0 || aim <= 0) return "";
  const ratio = anchored > aim ? anchored / aim : aim / anchored;
  if (ratio < ANCHOR_DIVERGENCE_RATIO) return "";
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 (fin de chantier) — LE NOMBRE PAR MOMENT, L'EXPLICATION UNE
  // SEULE FOIS
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ MESURÉ EN BRANCHANT LE TÉMOIN. L'écart entre la visée et
  // `100 × E / Gpréf` n'est PAS un cas rare: il vaut à peu près
  // `(Gmax / Gpréf) / 1,10`, donc ~1,34 partout. Sur le premier tir réel
  // branché, la clause est sortie sur **4 moments sur 4** — et l'explication,
  // identique, 4 fois dans la même phrase. Sur une table de quatre bouches,
  // c'est 16 fois le même membre de phrase dans un prompt déjà à sa limite.
  //
  // ⚠️ UN BRIEF QUI RÉPÈTE CESSE D'ÊTRE LU: c'est l'objection déjà retenue au
  // lot 4 pour la borne basse redondante, et elle vaut ici mot pour mot. On
  // sépare donc les deux moitiés — le NOMBRE est une donnée du moment et il
  // reste sur le moment; l'EXPLICATION est la même partout et se dit une fois,
  // en queue de phrase (`anchorNote`). Même propriété que l'unité, écrite sur
  // la première entrée seulement.
  return `, not ${Math.round(anchored)}`;
}

/**
 * L'EXPLICATION DES DEUX NOMBRES — UNE FOIS PAR PHRASE, JAMAIS PAR MOMENT.
 *
 * Vide quand aucun moment n'a divergé: une note qui explique un « not N » qui
 * n'existe pas serait une consigne sans objet.
 */
function anchorNote(slots: readonly SlotDensityWithAnchor[]): string {
  const diverges = slots.some((d) =>
    anchorClause(d, d.preferredPer100G) !== ""
  );
  if (!diverges) return "";
  return ` (the "not N" numbers are the target spread over an average plate; ` +
    `we ask for the bigger plate, so aim for the first number)`;
}

export function densityFragment(slots: readonly SlotDensityWithAnchor[]): string {
  if (slots.length === 0) return "";
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — UN COULOIR, PLUS « AU MOINS N »
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ « AU MOINS N » N'A PAS DE HAUT, ET ÇA S'EST MESURÉ DANS LES DEUX SENS.
  // Sur 40 densités demandées puis pesées (2026-09-09/10), l'écart consigne↔
  // recette va de **−23 % à +63 %**, médiane +3,1 %. Le centre était bon; la
  // DISPERSION coûtait. Et au tir SPLICE3, la consigne inverse (« reste sous
  // 145 ») sans plancher a rendu un bouillon à 57,8: une assiette passée de
  // trop petite à trop grosse. Un seul bout, quel qu'il soit, laisse le modèle
  // partir de l'autre côté.
  //
  // ⚠️ LA VISÉE EST DITE, ET ELLE EST À L'INTÉRIEUR. C'est ce qui remplace
  // `REPAIR_DENSITY_HEADROOM` sur ce chemin: on ne pousse plus la cible de
  // 10 % au-delà du nécessaire (ça déplace un centre déjà juste), on donne le
  // centre et les deux bords.
  //
  // ⛔ ET LA FORME RESTE LA GARDE. « dishes served here » décrit une casserole;
  // « <prénom> needs » décrirait quelqu'un — et v33 a retiré le corps de tout
  // le monde exprès. Un test lit le prompt entier et refuse tout `kcal` qui ne
  // soit pas suivi de `per 100 g`: les bornes s'écrivent donc « A to B kcal per
  // 100 g », jamais « A kcal to B kcal ».
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 · LOT 4 — LA BORNE BASSE REDONDANTE NE SE RÉPÈTE PAS
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QUI A CHANGÉ EN AMONT: `requiredDensityFor` ne JETTE plus un moment
  // dont la borne basse ne dépasse pas le plancher commun du bloc. Il le
  // jetait pour éviter de répéter « au moins 100 » — mais il emportait le
  // PLAFOND, que le plancher du bloc ne porte pas et que rien d'autre ne
  // porte.
  //
  // ⚠️ L'OBJECTION ÉTAIT JUSTE, ET ELLE VIT ICI MAINTENANT. Un brief qui
  // répète cesse d'être lu: quand `redundantMin` est vrai, on écrit le
  // PLAFOND seul (« up to N »), pas la bande. Le nombre bas continue
  // d'atteindre le modèle par le plancher commun, comme avant; ce qui est
  // nouveau, c'est que le nombre haut l'atteint aussi.
  const one = (d: SlotDensityWithAnchor, unit: boolean) => {
    const suffix = unit ? " kcal per 100 g" : "";
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-11 — UNE BANDE INTENABLE SE DIT, ELLE NE SE DÉGUISE PAS
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT QUE CECI FERME. `incompatible` était calculé, épinglé par
    // des tests, écrit dans le type — et AUCUN lecteur. La consigne envoyée au
    // modèle pour une intersection VIDE était indistinguable d'une bande
    // parfaitement tenable: on lui demandait poliment de viser un point qui
    // n'existe pas, et on comptait son échec comme une désobéissance.
    //
    // ⛔ ET CE N'EST PAS UNE CONSIGNE DE PLUS: c'est un AVEU. Le modèle ne peut
    // rien faire d'une bande vide; lui dire « fais au plus près » est la seule
    // chose vraie qu'on puisse lui demander. Le taire lui apprend que ces
    // nombres-là sont décoratifs — ce que ce dépôt a déjà mesuré (389 demandés
    // au dîner, 126,7 rendus).
    //
    // ⚠️ LE NOMBRE RESTE, ET C'EST VOULU. On ne retire pas la cible: une case
    // sans aucun chiffre se compose au hasard. On dit le chiffre ET on dit
    // qu'il est hors de portée.
    if (d.incompatible !== null) {
      const cause = d.incompatible === "above_askable_cap"
        // Le besoin dépasse ce qu'on s'autorise à demander: la part ne TIENT
        // pas dans l'assiette, quelle que soit la recette.
        ? `its share does not fit the plate; get as close as you can`
        // Deux occurrences de ce moment n'ont aucune densité commune: aucune
        // recette unique ne peut servir les deux jours.
        : `these days need different recipes; cook them apart if you must`;
      return `${d.preferredPer100G}${suffix} at ${d.slot} — ${cause}`;
    }
    if (d.redundantMin && d.maxPer100G > d.minPer100G) {
      // ⚠️ « up to N », ET LA VISÉE AVEC. Sans la visée, « au plus 135 » fait
      // partir le modèle vers le bas — l'erreur miroir de « au moins N », et
      // elle a été mesurée (tir SPLICE3, un bouillon à 57,8).
      return `up to ${d.maxPer100G}${suffix} at ${d.slot} (aim ${d.preferredPer100G}${
        anchorClause(d, d.preferredPer100G)
      })`;
    }
    const range = d.maxPer100G > d.minPer100G
      ? `${d.minPer100G} to ${d.maxPer100G}`
      : `${d.minPer100G}`;
    const head = `${range}${suffix}`;
    return `${head} at ${d.slot} (aim ${d.preferredPer100G}${
      anchorClause(d, d.preferredPer100G)
    })`;
  };
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT B — QUAND UN MOMENT PORTE DEUX BANDES, ON DIT LES JOURS
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ « NE PAS FUSIONNER TOUS LES DÎNERS PAR LEUR VALEUR MAXIMALE. Une
  // consigne commune n'est possible que si les contrats sont effectivement
  // compatibles et LES CASES CONCERNÉES RESTENT IDENTIFIABLES. » C'est la règle
  // du chantier, et sans les jours elle est impossible à tenir: deux lignes
  // « at dinner » côte à côte se lisent comme une contradiction, pas comme deux
  // journées.
  //
  // ⚠️ ET LE CAS NOMINAL NE CHANGE PAS D'UN CARACTÈRE. Un moment qui ne porte
  // QU'UNE bande n'a rien à dater: ses jours sont tous ses jours. La phrase
  // archivée du 2026-09-11 reste reproductible telle quelle.
  const lignesParMoment = new Map<string, number>();
  for (const d of slots) {
    lignesParMoment.set(d.slot, (lignesParMoment.get(d.slot) ?? 0) + 1);
  }
  const all = slots.map((d, i) => {
    const texte = one(d, i === 0);
    const jours = d.days ?? [];
    if ((lignesParMoment.get(d.slot) ?? 1) < 2 || jours.length === 0) {
      return texte;
    }
    // ⚠️ LE JOUR SE COLLE AU MOMENT, pas à la fin de la phrase: `at dinner on
    // fri` se lit d'un trait, `at dinner (… ) on fri` fait chercher à quoi il
    // se rapporte.
    return texte.replace(
      ` at ${d.slot}`,
      ` at ${d.slot} on ${[...jours].join("/")}`,
    );
  });
  return ` — dishes served here: ${all.join(", ")}${anchorNote(slots)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOT C · C3 (2026-09-11) — LE COULOIR D'UNE CASE, ET SES CONSOMMATEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UNE CASSEROLE PARTAGÉE DOIT TENIR POUR TOUS CEUX QUI Y PUISENT.
 *
 * ⛔ LE DÉFAUT QUE CECI FERME, ET IL EST ÉCRIT DANS LE PROMPT LUI-MÊME.
 * `methodBlock` étape 3 demande au modèle de « lire les cartes, prendre le plus
 * grand chiffre » — c'est-à-dire de faire une INTERSECTION à la main, sur
 * quatre cartes et trois moments. Mesuré au tir DENSITE (2026-09-08): les
 * quatre cartes demandaient 105, 122, 139 et **167** au déjeuner, et le modèle
 * a écrit **136** — la moyenne. Une personne s'est retrouvée avec 724 g dans
 * l'assiette. Un calcul déterministe qu'on délègue au modèle est un calcul
 * qu'on paie deux fois: en jetons, et en erreurs.
 *
 * ⛔ LES BOUCHES QUI ONT LEUR PROPRE PLAT NE COMPTENT PAS DANS L'INTERSECTION.
 * C'est tout l'intérêt d'un plat dédié: la casserole commune n'a plus à les
 * servir. Les garder resserrerait la bande commune au nom de quelqu'un qui ne
 * mange pas dedans — exactement le conflit que le plat dédié existe pour
 * dénouer.
 *
 * ⛔ ET L'INTERSECTION VIDE EST CONSERVÉE, jamais rabotée. « Si aucune densité
 * commune n'existe, le dire » est la demande du chantier, et c'est la même
 * règle que `empty_intersection` applique déjà entre deux JOURS d'un même
 * moment: une consigne intenable présentée comme tenable apprend au modèle que
 * ces nombres-là sont décoratifs (mesuré: 389 demandés, 126,7 rendus).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export interface CellDensity {
  minPer100G: number;
  maxPer100G: number;
  /** La visée: le plus haut `preferred` des mangeurs, ramené dans la bande. */
  aimPer100G: number;
  /** Vrai quand le plancher commun dépasse le plafond commun. */
  empty: boolean;
  /** Qui impose le plancher, et qui impose le plafond. Nommés dans le conflit. */
  floorFrom: string;
  ceilingFrom: string;
  /** Combien de mangeurs de la case portent un couloir NOMMÉ. */
  eatersWithCorridor: number;
}

export function cellDensityOf(
  eaters: readonly { name: string; slots: readonly SlotDensity[] }[],
  slot: string,
  /**
   * ⟳ 2026-09-11 · LOT B — LE JOUR DE CETTE CASE. ⛔ REQUIS, jamais `?`.
   *
   * Depuis le lot B, un moment peut porter DEUX couloirs — un par grappe de
   * jours compatibles. Chercher « le » couloir du dîner sans dire QUEL dîner
   * rendrait celui de l'autre jour, c'est-à-dire ferait exactement ce que le
   * lot répare: le vendredi imposant sa bande au dimanche. Un `?` aurait laissé
   * « le premier trouvé » être la réponse silencieuse de tous les appelants.
   *
   * ⚠️ UNE LIGNE SANS JOURS (`days: []`) VAUT POUR TOUS LES JOURS: c'est le
   * décor de test, et le comportement d'avant ce lot.
   */
  day: string,
): CellDensity | null {
  let floor = -Infinity;
  let ceiling = Infinity;
  let aim = -Infinity;
  let floorFrom = "";
  let ceilingFrom = "";
  let counted = 0;
  for (const e of eaters) {
    // ⚠️ `?? []` PARCE QUE CETTE LIGNE PEUT VENIR D'UN PAYLOAD RELU ou d'un
    // décor antérieur au lot B: sans jours, elle vaut pour tous les jours —
    // le comportement d'avant, et jamais une exception silencieuse.
    const corridor = e.slots.find((d) => {
      const jours = d.days ?? [];
      return d.slot === slot && (jours.length === 0 || jours.includes(day));
    });
    if (!corridor) continue;
    counted++;
    if (corridor.minPer100G > floor) {
      floor = corridor.minPer100G;
      floorFrom = e.name;
    }
    if (corridor.maxPer100G < ceiling) {
      ceiling = corridor.maxPer100G;
      ceilingFrom = e.name;
    }
    if (corridor.preferredPer100G > aim) aim = corridor.preferredPer100G;
  }
  if (counted === 0) return null;
  const empty = floor > ceiling;
  return {
    minPer100G: floor,
    maxPer100G: ceiling,
    // ⚠️ LA VISÉE EST LE PLUS HAUT `preferred`, RAMENÉ DANS LA BANDE — et pas
    // la moyenne. C'est la règle que l'étape 3 de la méthode énonce en toutes
    // lettres depuis le 2026-09-08, et la raison y est écrite: en dessous, une
    // seule personne se retrouve avec une assiette énorme et personne d'autre
    // ne le remarque.
    aimPer100G: empty ? floor : Math.min(ceiling, Math.max(floor, aim)),
    empty,
    floorFrom,
    ceilingFrom,
    eatersWithCorridor: counted,
  };
}

/**
 * LA PHRASE D'UNE CASE — sans unité, parce que l'en-tête du calendrier la porte.
 *
 * ⚠️ L'UNITÉ EST DITE UNE FOIS, EN TÊTE DU CALENDRIER, ET PAS SUR CHAQUE
 * LIGNE. C'est la propriété que `densityFragment` tient déjà sur ses moments
 * (`one(d, i === 0)`): « at least 182 kcal per 100 g at lunch, 159 at dinner »
 * se lit d'un trait, la répéter fait une ligne qu'on saute. Ici il peut y avoir
 * vingt et une cases: la répétition coûterait vingt fois.
 *
 * ⛔ ET LE CONFLIT NOMME LES DEUX PERSONNES. Le modèle ne peut rien faire d'une
 * bande vide s'il ignore qui la vide: dire « ça ne tient pas » sans dire pour
 * qui, c'est lui demander d'échouer poliment.
 */
export function cellDensitySentence(cell: CellDensity): string {
  if (cell.empty) {
    return ` No single density suits them all: ${cell.floorFrom} needs at least ` +
      `${cell.minPer100G}, ${cell.ceilingFrom} at most ${cell.maxPer100G}. ` +
      `Aim ${cell.aimPer100G} and cook the other one apart if you can.`;
  }
  const band = cell.maxPer100G > cell.minPer100G
    ? `${cell.minPer100G}-${cell.maxPer100G}`
    : `${cell.minPer100G}`;
  return ` Shared dish ${band}, aim ${cell.aimPer100G}.`;
}

/**
 * LE PLANCHER DE DENSITÉ DU BLOC — la base, relevée par ce qu'on ne peut pas
 * nommer.
 *
 * ⛔ IL NE LIT QUE `floorOnly`, ET C'EST LA DÉCISION DU LOT. Une bouche sous
 * plancher TCA ne peut recevoir aucun nombre en face de son nom; son exigence
 * doit pourtant atteindre le modèle, sans quoi le plan la sous-nourrit en
 * silence pour la protéger d'un chiffre. Elle passe donc par le plancher
 * COMMUN, où elle se confond avec celle de tout le monde.
 *
 * ⛔ ET IL NE LIT PAS `named`. Faire monter le plancher commun avec la densité
 * NOMMÉE d'une personne imposerait au petit-déjeuner de tout le foyer la
 * densité du déjeuner de la plus exigeante — mesuré sur le corps du 2026-09-07:
 * 182 au lieu de 114, sur un moment qui n'en avait aucun besoin. La ligne est
 * l'instrument précis; le plancher est l'instrument grossier, réservé à qui ne
 * peut pas être nommé.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function densityFloorsOf(
  members: readonly PortionMember[],
  base: { normal: number; light: number },
): { normal: number; light: number } {
  let normal = base.normal;
  let light = base.light;
  for (const m of members) {
    for (const d of m.requiredDensity?.floorOnly ?? []) {
      if (d.light) light = Math.max(light, d.kcalPer100G);
      else normal = Math.max(normal, d.kcalPer100G);
    }
  }
  return { normal, light };
}

/**
 * ⛔ EXPORTÉ LE 2026-09-08 POUR LE BRIEF DU FOYER, sans toucher un mot.
 *
 * Le foyer portait les CHIFFRES de densité sur les cartes et aucune de ces cinq
 * lignes. Un nombre en kcal/100 g au bout d'une carte, sans elles, se lit comme
 * une information sur la PERSONNE — c'est-à-dire comme le corps que v33 lui a
 * retiré — et rien n'interdit de « l'atteindre » en imaginant une assiette plus
 * petite, ce qui est précisément le geste que le moteur reprendra ensuite.
 *
 * C'est le principe que ce fichier énonce trois fois: **une contrainte qu'on
 * énonce sans dire ce qu'elle INTERDIT est une contrainte décorative.**
 */
export const DENSITY_CONSEQUENCE = [
  "A density on someone's line is a fact about the DISH served at that moment,",
  "as served, not a fact about them: write that recipe at least that dense.",
  "Reach it by what the dish is MADE OF — more of the starch, the protein or",
  "the fat it already carries, less water and less watery vegetable. Do not",
  "reach it by serving a smaller plate: the plate stays a plate.",
] as const;

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
  /**
   * COMBIEN DE POIDS DIFFÉRENTS SONT SERVIS À CETTE TABLE — le nombre de
   * groupes de bouches dont le facteur de grammage diffère (`bodyShareFactors`,
   * puis `householdMouthFactors`). REQUIS.
   *
   * ⚠️ CE PARAMÈTRE EST LA MOITIÉ QUI MANQUAIT AU LOT DU 2026-08-19, ET IL EST
   * MESURÉ. Le moteur calculait enfin quatre facteurs distincts, et n'en
   * appliquait AUCUN: le modèle écrivait une boîte pour tout le monde (ou une
   * par CLASSE — adultes ensemble, mineurs ensemble), et
   * `sizeBoxesFromTarget` refuse de couper une boîte partagée dont les bouches
   * n'ont pas le même facteur (`shared_mixed`, 3 boîtes sur 3 au run A1). Le
   * moteur était armé et inerte, parce que rien dans le prompt ne disait au
   * modèle que ces quatre parts diffèrent.
   *
   * ⛔ C'EST UN NOMBRE DE BOÎTES, JAMAIS UN FAIT DE CORPS. Il ne dit ni l'âge,
   * ni la taille, ni le poids de personne — il dit combien de poids distincts
   * la casserole doit produire. Le corps d'un mineur ne s'énonce toujours pas.
   *
   * `1` (ou moins) = un seul poids à cette table, ou aucun corps saisi: le bloc
   * rend alors le texte byte-identique à celui d'avant ce lot. La population
   * qui voit une consigne différente est exactement celle dont les corps
   * diffèrent, et c'est vérifiable à l'octet.
   */
  weightGroups: number,
  /**
   * ⟳ 2026-09-07 — QUEL CHEMIN DE DIMENSIONNEMENT (lot 3 du plan solo).
   *
   * ⛔ REQUIS, jamais optionnel, et c'est la troisième fois que ce fichier
   * l'écrit: un `?` ici aurait laissé le brief servir des faits de corps et un
   * ordre de mise en boîtes à un foyer dont le moteur ne veut ni l'un ni
   * l'autre — c'est-à-dire un prompt qui promet une recette standard et un
   * brief qui demande des portions nominatives, dans le même message.
   *
   * Sous `"portion_v1"`: AUCUN fait de corps, AUCUN avertissement de corps,
   * AUCUN ordre de mise en boîtes, direction sans mot de taille, et le
   * marqueur `(light)` sur les moments concernés.
   */
  sizingPath: "portion_v1" | "legacy_measure",
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
  // ⟳ 2026-09-08 — MÊME DISCIPLINE, QUATRIÈME FOIS: la phrase qui dit ce
  // qu'une densité EST n'est servie que si au moins une ligne en porte une.
  // Servie à un foyer sans densité, elle apprend au modèle qu'il existe une
  // grandeur qu'on lui impose parfois, et l'invite à en inventer une.
  let anyDensity = false;
  // Le moteur pèse-t-il les parts de ce foyer ? Une seule lecture, et c'est la
  // même que celle du bloc des boîtes: deux façons de répondre à « le moteur
  // dimensionne-t-il ? » finiraient par se contredire dans le même prompt.
  // ⟳ 2026-09-07 — SOUS `portion_v1` LE MOTEUR DIMENSIONNE TOUT, y compris un
  // foyer d'une seule bouche. `weightGroups >= 2` décrivait la seule situation
  // où le legacy pesait; ce n'est plus la seule.
  const sizedByEngine = sizingPath === "portion_v1" ||
    (Number.isFinite(weightGroups) && weightGroups >= 2);
  // ⛔ SOUS `portion_v1`, LE CORPS NE PART PAS AU MODÈLE. C'est le cœur du lot
  // 3: il écrit UNE RECETTE STANDARD, et une recette standard ne dépend
  // d'aucun corps. Lui donner « 170 cm, 70 kg » l'invite à dimensionner
  // lui-même — c'est-à-dire à faire le travail que l'algorithme vient de
  // reprendre, avec un instrument qu'on ne peut ni mesurer ni corriger.
  const bodyFactsGo = sizingPath !== "portion_v1";
  const lines = members.map((m) => {
    // L'ORDRE DES TROIS CAS EST LA RÈGLE, pas un style — et il est écrit UNE
    // fois, dans `servingDirectionFor`, parce que la fusion doit lire
    // EXACTEMENT la direction que ce brief écrit (D6). Deux lectures de la
    // même règle finiraient par diverger, et la fusion renoncerait — ou
    // n'aurait pas renoncé — sur une direction que personne n'a servie.
    const rawDirection = servingDirectionFor(m);
    // ══ LA TAILLE SORT DE LA LIGNE QUAND LE MOTEUR LA CALCULE ══════════════
    //
    // ⛔ `CHILD_DIRECTION` EST UNE TAILLE, la seule des trois — son propre
    // commentaire le dit: « une taille, jamais une direction ». Mesuré aux runs
    // E3 et F3: le modèle la RECOPIE mot pour mot dans la phrase lue à table
    // (« Child-size share. — Beef and Red Lentil Ragu 271 g »), à côté du
    // grammage du moteur, qui est le PLUS GROS de la table pour cet ado de
    // 70 kg. Les mots et le nombre se contredisent, dans une phrase lue à voix
    // haute, et c'est le mot qui blesse: expliquer à un enfant que sa part est
    // plus petite est à une phrase d'un dégât réel (§8.4, en tête de fichier).
    //
    // ⚠️ ON NE TOUCHE PAS `servingDirectionFor`: la fusion doit lire EXACTEMENT
    // la même règle (D6), et `distinctServingDirections` compte des positions,
    // pas des tailles. C'est le BRIEF qui cesse de dire la taille, et seulement
    // quand le moteur la dit à sa place — les deux directions d'OBJECTIF
    // (protéine, féculent) passent intactes, elles parlent de composition.
    // ⛔ TOUTES LES DIRECTIONS, PAS SEULEMENT CELLE DU MINEUR. Le premier
    // correctif ne relayait que `CHILD_DIRECTION`, et la comparaison GÉNÉRIQUE
    // a survécu: mesuré sur `cfd44e89`, l'adulte de 47 kg lisait « a larger
    // share » et recevait la plus petite part de la table. Une seule autorité
    // sur la taille veut dire AUCUN mot de taille, pas un mot de moins.
    const direction = sizedByEngine ? sizeFreeDirectionFor(m) : rawDirection;
    // AUCUNE DES DEUX GARDES N'EST APPLIQUÉE ICI — ni le plancher TCA, ni la
    // règle du mineur. `householdBodyFacts` les porte toutes les deux, dans le
    // même fichier que `mealBodyBlocks`: une garde qu'un appelant applique est
    // une garde que le prochain appelant oublie (FF-030 R5). Les deux
    // paramètres sont requis, donc il n'y a pas d'appel « partiel » possible.
    const facts = bodyFactsGo ? householdBodyFacts(m.body, m.ageState) : [];
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
    // ⟳ 2026-09-07 — `(light)` SUR SA LIGNE, ET LA TAILLE N'Y VA PLUS.
    //
    // ⛔ LES DEUX NE COHABITENT PAS, et c'est le mode d'échec n°6 du plan:
    // « léger » compté deux fois. Sous `portion_v1` la taille déclarée
    // (`o.size`) ne se rend PAS — le poids du moment porte déjà l'information,
    // et l'écrire aussi en mots ferait rétrécir le dîner une seconde fois.
    //
    // ⚠️ ET `(light)` EST UNE DEMANDE DE RECETTE, pas une portion. Il dit au
    // modèle « écris une recette légère pour ce moment »; combien la personne
    // en mange reste l'affaire de l'algorithme.
    const lightAt = new Set(m.lightSlots ?? []);
    const when = m.eatingSlots === null || m.eatingSlots.length === 0
      ? ""
      : ` — eats at ${
        m.eatingSlots
          .map((o) => {
            if (sizingPath === "portion_v1") {
              return lightAt.has(o.slot) ? `${o.slot} (light)` : o.slot;
            }
            return o.size ? `${o.slot} (${o.size} for them)` : o.slot;
          })
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
    // ── LA DENSITÉ REQUISE, EN DERNIER SUR LA LIGNE ─────────────────────
    // Après le rythme et les habitudes, avant les faits corporels: elle parle
    // du PLAT servi à ces moments-là, donc elle se lit comme une précision de
    // « eats at lunch, dinner only ». Avant, elle se lirait comme une règle
    // générale dont les moments seraient l'exception.
    //
    // ⛔ SOUS `portion_v1` SEULEMENT, et ce n'est pas une commodité: le chemin
    // legacy ne dimensionne pas les plats — lui annoncer une densité ferait une
    // promesse que rien n'exécute.
    //
    // ⚠️ ET L'EMPREINTE SHA-256 DU PROMPT LEGACY NE GARDE PAS CE GATE. Mesuré
    // le 2026-09-08 en le retirant: elle reste verte, parce que ses trois
    // foyers canoniques portent `requiredDensity: null`. Le gardien est le test
    // « la densité ne traverse PAS vers legacy_measure », qui donne une densité
    // à une bouche de la lane legacy exprès.
    //
    // ⛔ `named` SEULEMENT. `floorOnly` porte la densité d'une bouche sous
    // plancher TCA: elle atteint le modèle par le plancher COMMUN du bloc, et
    // jamais en face d'un nom. Voir `RequiredDensity`.
    const density = sizingPath === "portion_v1"
      ? densityFragment(m.requiredDensity?.named ?? [])
      : "";
    if (density !== "") anyDensity = true;
    if (facts.length === 0) {
      return `- ${m.displayName}: ${direction}${when}${own}${said}${density}`;
    }
    anyBodyFacts = true;
    return `- ${m.displayName}: ${direction}${when}${own}${said}${density} [${
      facts.join("; ")
    }]`;
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
    // ══ 2026-08-19 · LE CHIFFRE CHANGE D'AUTORITÉ QUAND LE MOTEUR DIMENSIONNE ══
    //
    // ⛔ MESURÉ, TROIS PLANS SUR TROIS. Les BOÎTES portaient bien le facteur par
    // corps (492 / 241 / 366 / 198), et `member_portions[].portion_note` — la
    // phrase lue à voix haute à table, celle qu'un humain EXÉCUTE — portait
    // toujours DEUX étages: « Serve 2 eggs, 120 g potatoes, 150 g traybake » aux
    // deux adultes (79 kg et 47 kg), et « 1 egg, 80 g, 100 g » aux deux mineurs
    // (70 kg et 23 kg). Le défaut d'origine, intact, sur la surface la plus lue.
    //
    // ⛔ ET IL NE SE RÉPARE PAS EN RÉÉCRIVANT LA PHRASE. Multiplier les nombres
    // d'une prose de modèle demanderait de deviner lesquels sont des parts:
    // « le bidon de 500 g », « 2 tranches », « 3 cm » — c'est la cicatrice
    // « laitue ≠ lait », 12 faux positifs sur 12, sur un texte lu à table.
    //
    // La réparation est donc de retirer la DEUXIÈME AUTORITÉ: quand le moteur
    // dimensionne, le poids vient de la boîte de la personne (calculé, exact,
    // rejouable), et la phrase dit ce qui va dans l'assiette et ce qui change.
    // Le gramme n'est pas perdu — `attachSizedQuantities` le RECOLLE à la
    // phrase, depuis les boîtes, après le dimensionnement.
    //
    // ⚠️ CE QUE CES QUATRE LIGNES NE FONT PAS: revenir à la vague d'avant le
    // LOT 4C (93 notes réelles, ZÉRO gramme, « One standard table portion. »).
    // Les deux tournures mesurées restent refusées LITTÉRALEMENT, et le gramme
    // devient GARANTI au lieu d'espéré — il est écrit par le moteur, pas par le
    // modèle. C'est un renversement d'autorité, pas un abandon d'exigence.
    ...(Number.isFinite(weightGroups) && weightGroups >= 2
      ? [
        "Every one of those instructions names the food and the change -- never a",
        "weight. Each person's own box already carries their exact grams, and this",
        "plan hands it to them; a second number written here would contradict it.",
        // ══ ET AUCUNE COMPARAISON DE TAILLE — MESURÉ AU RUN E3 ══════════════
        //
        // ⛔ « Serve a smaller child-sized share of all components. — Roast
        // chicken 610 g » à côté de « a larger share … 301 g ». Les MOTS du
        // modèle et le NOMBRE du moteur se contredisaient dans la même phrase,
        // et la phrase est lue à voix haute à table.
        //
        // ⛔ ET C'EST DÉJÀ LA DOCTRINE DU FICHIER, §8.4: « expliquer à un enfant
        // que sa part est plus petite est à une phrase d'un dégât réel ». Une
        // comparaison de taille EST un verdict sur un corps — « ta part », pas
        // « ta part parce que ». La taille appartient au moteur; la phrase dit
        // ce qu'on met dans l'assiette et ce qui change.
        // ⚠️ LE VOCABULAIRE EST NOMMÉ LITTÉRALEMENT, parce que la première
        // rédaction (« bigger, smaller or child-sized ») a été mesurée: le
        // modèle a écrit « a larger share » et « the standard share », deux
        // tournures qu'elle ne nommait pas. Une interdiction qui ne nomme pas ce
        // qu'elle refuse se fait satisfaire par un synonyme — troisième fois
        // dans ce fichier.
        "Never describe the size of anyone's share: not bigger, not smaller, not",
        "larger, not standard, not normal, not child-sized, not the same as",
        "someone else's. How much each person takes is settled by this plan. Say",
        // ⟳ 2026-09-04 — « the swaps » RETIRÉ D'ICI. Un échange est désormais
        // une BOÎTE (voir le bloc de régime), et laisser le mot dans la consigne
        // de service rouvrait exactement l'échappatoire que ce bloc-là ferme:
        // écrire la divergence dans `member_portions` au lieu d'un contenant.
        "the manner, the order, the sides and the care -- what only you know.",
      ]
      : [
        "Every one of those instructions carries a number and a unit: 150 g of the",
        "chicken, 80 g of dry pasta, 2 tbsp of the sauce. All " +
        `${members.length} of them, not some.`,
        `"A standard portion", "a balanced share", "take your box" tell nobody how`,
        "much to put on a plate: write the grams, even when a box already holds them.",
      ]),
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
    // ⟳ 2026-09-08 — CE QU'UNE DENSITÉ EST, DIT UNE FOIS. Sans elle, un nombre
    // en kcal/100 g au bout d'une ligne se lit comme une information sur la
    // personne — c'est-à-dire comme le corps que v33 lui a retiré. La phrase
    // dit que la grandeur porte sur le PLAT, et ce qu'il faut en faire.
    ...(anyDensity ? [...DENSITY_CONSEQUENCE] : []),
    "",
    ...lines,
    "",
    ...(anyBodyFacts ? [...BODY_FACTS_CAVEAT, ""] : []),
    // ── LOT 4 · LA MISE EN BOÎTES, COLLÉE À LA PROMESSE ────────────────────
    // Elle est ICI, dans le même souffle que les lignes par personne, et c'est
    // la moitié qui décide du lot — voir `boxingOrderLines`.
    // ⛔ AUCUN ORDRE DE MISE EN BOÎTES SOUS `portion_v1`. Le modèle n'écrit plus
    // de boîte du tout: c'est le moteur qui les autore (lot 4). Lui en demander
    // ferait écrire des grammes par personne qu'on jetterait ensuite — et un
    // modèle à qui on jette la moitié de sa sortie finit par mal écrire l'autre.
    ...(sizingPath === "portion_v1"
      ? []
      : boxingOrderLines(members, weighedPortionMembers(members))),
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
 *      (LOT 3C). Ici c'est le nombre de BOUCHES à placer sur CHAQUE REPAS pris
 *      sur un lot. Il vient de `members.length` — la MÊME liste qui écrit les
 *      lignes juste au-dessus, jamais un second calcul.
 *   ② L'ÉCHAPPATOIRE, NOMMÉE. Le modèle a DÉJÀ un champ où ranger « qui mange
 *      combien »: `member_portions`, qui lui est demandé. Une consigne qui
 *      demande des grammes sans dire que la note de portion n'en est pas une
 *      est une consigne qu'il satisfait dans l'autre champ — c'est exactement ce
 *      qui a été capturé le 2026-08-17, la consigne renvoyée mot pour mot dans
 *      le mauvais champ.
 *   ③ LA BOÎTE PARTAGÉE EST LÉGITIME, ET DEPUIS LE 2026-08-19 ELLE EST LE CAS
 *      NOMINAL D'UN REPAS COMMUN. Sans cette phrase, un modèle obéissant
 *      fabriquerait un contenant par personne là où le foyer en remplit un — et
 *      c'est très exactement le contenant en moins qui est voulu. Ce qui compte
 *      est que chaque bouche attablée soit UNE part de la boîte de ce repas,
 *      jamais deux, jamais aucune.
 *
 * ⚠️ CE QUE ③ A CESSÉ DE DIRE, ET IL FAUT LE LIRE: « une boîte par casserole »
 * n'existe plus. Une boîte porte un REPAS ENTIER, toutes préparations confondues.
 * Un lecteur qui « répare » en redemandant une boîte par préparation rouvre les
 * trois défauts du run `76be8ce3` d'un seul geste.
 *
 * ⛔ ET AUCUN POURQUOI, JAMAIS. Le bloc ne dit pas d'où viennent les grammes: ce
 * sont des grammes d'ALIMENT dans une boîte, du même côté de la frontière que
 * « 400 g de cuisses de poulet » sur une liste de courses. Les trois lignes qui
 * SUIVENT ce bloc l'interdisent explicitement, et elles restent les dernières.
 *
 * ⚠️ MUET À UNE SEULE BOUCHE. Une part par personne n'a de sujet qu'à partir de
 * deux, et servir le bloc à un foyer d'un lui apprendrait qu'un marquage par
 * personne existe — le raisonnement de `anyHabit`/`anyRhythm` juste au-dessus,
 * quatrième fois. Un foyer à une bouche rend donc un brief byte-identique à
 * celui d'avant ce lot, et un test le tient.
 */
export function boxingOrderLines(
  members: readonly PortionMember[],
  /**
   * LES BOUCHES DONT L'OBJECTIF OUVRE UNE PORTION MILLIMÉTRÉE. REQUIS.
   *
   * ⛔ IL A REMPLACÉ `weightGroups` LE 2026-08-20, ET C'EST LE LOT. Le nombre de
   * poids différents que la table sert ne décide plus rien ici: ce qui décide
   * est QUI a demandé une portion à soi. `weightGroups` reste ailleurs dans
   * `buildPortionBrief`, où il gouverne autre chose.
   *
   * ⚠️ LA MÊME LISTE QUE `boxSchemaBlock` ET QUE `weighedMemberIds` CÔTÉ
   * PARSEUR — `weighedPortionMembers(members)`, appelée, jamais recopiée.
   */
  weighed: readonly PortionMember[],
): readonly string[] {
  if (members.length < 2) return [];
  const names = members.map((m) => m.displayName).join(", ");
  // ══ CE QUE LE NOMBRE COMPTE A CHANGÉ AVEC L'UNITÉ ════════════════════════
  //
  // ⚠️ MESURÉ, PAS SUPPOSÉ. Le levier du NOMBRE ATTENDU est la recette de ce
  // dépôt (0→11 plats, 0→38 % de notes), et il reste ici — mais il ne compte
  // plus « combien de boîtes par casserole ». Il compte **qui est sur les
  // couvercles de ce repas-ci**, parce que c'est là que le défaut n°1 vivait:
  // sur le run `76be8ce3`, `box_id` étant unique par reprise, le modèle pointait
  // la boîte d'UNE personne et orphelinait l'autre — Christèle n'aurait eu de
  // boîte à AUCUN repas, sur seize boîtes déclarées.
  //
  // ⛔ LE BLOC NE S'ALLONGE PAS. La lane foyer frôle le mur de temps du worker
  // (mesuré par 3C, reconfirmé par L7): ce qui est ajouté REMPLACE, il ne
  // s'empile pas, et les trois lignes « NEVER state a reason » restent les
  // dernières du brief.
  //
  // ══ CE QUI A DISPARU LE 2026-08-20, ET IL FAUT LE LIRE ═══════════════════
  //
  // ⛔ « Give every share of a meal the SAME ordinary figure -- one plate's
  // worth of that meal » ET SES TROIS LIGNES SONT PARTIES. Elles ordonnaient au
  // modèle le même chiffre pour tout le monde, et elles n'ont plus d'objet dès
  // lors que le commun est un BAC et non une somme de parts: il n'y a plus de
  // part par personne à uniformiser. Ne les remets pas « pour l'équité » — ce
  // qu'elles réparaient (le découpage par classe compté deux fois) n'existe plus
  // non plus, puisque plus personne d'autre qu'une bouche à objectif ne reçoit
  // un nombre qui la vise.
  //
  // ⛔ ET « grams is what THAT person takes out of the box » AUSSI. C'était la
  // lecture v2 du bac partagé — une part par nom sur un couvercle collectif,
  // c'est-à-dire la balance de retour au service.
  const weighedNames = weighed.map((m) => m.displayName).join(", ");
  const groupLines = weighedNames === ""
    ? [
      "Nobody here asked for a portion of their own, so that meal has exactly ONE",
      "box, with everyone who eats it named on the lid.",
    ]
    : [
      `These people each get a box of their OWN, alone on the lid: ${weighedNames}.`,
      "Everyone else who eats that meal shares ONE box, named with all of them.",
    ];
  return [
    "WEIGH IT ONCE, INTO BOXES NAMED BY MEAL.",
    "Nobody weighs anything at mealtime. Everything is weighed at the cooking",
    "session, straight into containers, and a meal later just takes its box out.",
    'Every dish that takes from a preparation carries "boxes": one container per',
    "GROUP of people eating that meal, each holding everything that group takes",
    "out -- all its preparations together in the same box, not one tub per pan.",
    `That is ${members.length} people to place at every such meal: ${names}. Each of`,
    "them who eats that meal is named on EXACTLY one of that meal's boxes --",
    "never two, never none.",
    ...groupLines,
    // ⛔ ET LA SEULE CHOSE QUI CHANGE ENTRE LES DEUX LECTURES: LE NOMBRE DE
    // NOMS. Il n'y a aucun autre marqueur, aucun booléen, aucun type — un second
    // marqueur finirait par contredire la liste des noms, et c'est la liste
    // qu'on croirait.
    "When ONE name is on the lid, its grams are that person's portion: they open",
    "it and eat, and nothing is weighed at the table.",
    "When SEVERAL names are on the lid, its grams are how much goes IN the tub for",
    "all of them together. That number aims at nobody: never split it per person,",
    "never write a figure next to a name on a shared lid.",
    // ⛔ ET LE DÉROULÉ DE SESSION NE PORTE AUCUN POIDS (2026-08-19). Mesuré:
    // « répartir six portions de 450 g » sur un foyer de DEUX, un grammage qui
    // ne nommait aucun aliment et ne correspondait à aucune boîte. L'interdit
    // existait pour `member_portions` seulement; le déroulé passait à travers.
    "The cooking session run_through is the ORDER of the gestures, and nothing",
    "else: no weights, no gram figures, no portion counts. Those live in the",
    "boxes, where each one already carries the name of what is in it and whose",
    "it is. A weight written in the run_through names no food and matches no",
    'lid — say "portion it into the named boxes" and let the boxes speak.',
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
    /** Le facteur a été calculé sur un rythme RÉGLÉ, et il s'applique. */
    "sized",
    /**
     * LOT B ① — LE FACTEUR A ÉTÉ CALCULÉ SUR LE RYTHME **PAR DÉFAUT** DE LA
     * DIRECTION, parce que personne n'a réglé le curseur.
     *
     * ── LE DÉFAUT QUE CE MOTIF FERME, ET IL A ÉTÉ MESURÉ ─────────────────
     * « Assez de direction pour coûter un plat, pas assez pour peser un
     * gramme. » La MÊME déclaration `muscle_gain` était lue par deux
     * sous-systèmes qui répondaient l'inverse:
     *
     *   · `servingDemandsFor` — « cette bouche a-t-elle besoin de son propre
     *     plat ? » — lit LA DIRECTION SEULE. Deux bouches divergeaient, et ça
     *     leur ouvrait un plat dédié, archivé dans SIX plans (`cooking.diverging`).
     *   · `mouthTargetFactor` — « combien lui sert-on ? » — EXIGEAIT un rythme.
     *     Sans lui: facteur **1,000**, motif `no_pace`, c'est-à-dire la part de
     *     quelqu'un qui n'a rien demandé.
     *
     * Et le chemin par défaut du produit y menait tout seul:
     * `keel_household_add_member` prend un OBJECTIF et PAS de rythme, donc
     * toute bouche ajoutée était dans cet état tant que personne n'ouvrait son
     * formulaire. Mesuré le 2026-08-19: `box_sizing.mouths` = `{"sized": 1,
     * "no_pace": 2, "minor": 1}` sur un foyer de quatre.
     *
     * ⚠️ IL EST DISTINCT DE `sized`, ET C'EST TOUT L'INTÉRÊT. « La personne a
     * réglé 0,4 kg/semaine » et « on a dérivé un cran d'une direction nue » ne
     * se lisent pas pareil, ne se réparent pas pareil, et l'écran qui posera un
     * jour la question doit pouvoir compter combien de bouches attendent encore
     * qu'on la leur pose. Un seul jeton pour les deux serait le compteur à deux
     * nombres que ce dépôt paie en boucle.
     *
     * ⛔ CE MOTIF NE DESSERRE AUCUNE GARDE. Il arrive APRÈS ①②③, après l'âge
     * inconnu et après la direction; le cran dérivé traverse `executedPaceFor`
     * comme n'importe quel autre, donc le plancher d'énergie, le plafond A1 et
     * la fraction du mineur mordent exactement pareil.
     */
    "sized_default_pace",
    /** ① le plancher TCA de CETTE bouche, RÉELLEMENT levé sur son compte. */
    "restriction_floor",
    /**
     * ① bis — ON N'A PAS PU ÉVALUER LA CEINTURE DE CETTE BOUCHE, ET C'EST UNE
     * AUTRE PHRASE QUE « SON PLANCHER EST LEVÉ ».
     *
     * ── LE DÉFAUT D'OBSERVABILITÉ QUE CE MOTIF FERME ─────────────────────
     * Jusqu'au 2026-08-19, `memberTargetFactor` évaluait
     * `member.body?.restrictionFlag ?? true`. `member.body` est un
     * `MealBodyContext`, qui n'existe QUE pour un compte: toute bouche SANS
     * compte valait donc `true`, sortait `restriction_floor`, et le journal
     * d'un foyer ordinaire annonçait « plancher TCA » ×3 pour trois personnes
     * qui n'ont simplement pas de compte. Mesuré sur 4 plans / 3 foyers:
     * `{"mouths":{"sized":1,"restriction_floor":3,"minor":0,"no_body":0}}`.
     * Un lecteur du journal en concluait un plancher alimentaire là où il n'y
     * avait qu'une absence de compte — l'observabilité masquait la cause.
     *
     * `restriction_unknown` est le fail-closed HONNÊTE: on ne dimensionne pas,
     * et on dit pourquoi on ne l'a pas fait. « Pas de compte » n'est plus dans
     * ce sac: une bouche sans compte n'a pas de plancher à lire, elle a un
     * CORPS DE FICHE, et c'est lui qui la dimensionne.
     */
    "restriction_unknown",
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
    /**
     * AUCUN ÉCART N'EST EXÉCUTABLE SUR CE CORPS — le moteur ne déplace rien.
     *
     * ⚠️ SON SENS A CHANGÉ LE 2026-08-19 (LOT B ①), ET IL FAUT LE SAVOIR POUR
     * RELIRE UNE ARCHIVE. Il voulait dire « personne n'a réglé le curseur »,
     * et c'était le cas de TOUTE la base au 18/08. Cette branche-là n'existe
     * plus: une direction sans cran reçoit désormais
     * `DEFAULT_PACE_KG_PER_WEEK` et sort en `sized_default_pace`. Ce qui reste
     * ici est le seul cas où `executedPaceFor` rend un écart NUL — un corps
     * déjà sous son propre plancher d'énergie. Un plan archivé AVANT cette
     * date qui porte `no_pace` dit l'ancienne phrase, pas celle-ci.
     */
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
    /**
     * L0bis (2026-08-22) — UNE GROSSESSE DÉCLARÉE, ET LE DÉFICIT TOMBE À ZÉRO.
     *
     * ── LE DÉFAUT QUE CE MOTIF FERME, MESURÉ ─────────────────────────────
     * `pregnancy` était dans la liste fermée du plancher de maladie depuis le
     * 2026-08-06, mais `conditionRef` n'était lu par AUCUN calcul d'énergie:
     * ni ici, ni dans `meal_envelope.ts`, ni dans `weight_pace.ts`. Mesuré le
     * 2026-08-22 à 03:19:55 CEST sur une femme de 68 kg portant `pregnancy` et
     * `fat_loss`: facteur **0,7475**, et la journée la plus basse que le moteur
     * exécute pour elle est **1 200 kcal** — c'est-à-dire `ENERGY_FLOOR_KCAL.
     * female`, un plancher qui n'a jamais entendu parler de grossesse. **Elle
     * recevait une boîte pesée en déficit.**
     *
     * ⛔ IL NE MORD QUE VERS LE BAS (`direction === "down"`). Sur une prise, le
     * facteur reste celui d'hier: rabattre un surplus retirerait de l'énergie à
     * quelqu'un qui en demande, sous le nom d'une protection.
     *
     * Le bon chiffre de déficit ici est ZÉRO, pas « un plancher plus haut »:
     * un plafond n'est pas un interdit.
     */
    "pregnancy",
    /** L0bis — même geste, même raison, pour un allaitement déclaré. */
    "breastfeeding",
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
 *
 * ── ⟳ 2026-09-09 — LE MAXIMUM SUIT LE CURSEUR: 1,25 → 1,50 ─────────────────
 * Tant qu'`executedPaceFor` rabotait une prise à +10 % de l'entretien, 1,25
 * laissait de la marge. Le curseur est désormais le contrat (en-tête de
 * `weight_pace.ts`): à son plafond — 1 kg ou 1 % du poids par semaine —, le
 * facteur MAXIMAL structurel d'une prise vaut `1 + plafond × 7700 / 7 /
 * entretien`, et il est le plus haut sur un corps LOURD et à FAIBLE entretien.
 * Balayé sur 2 580 corps adultes (40-250 kg × 4 tailles × 3 genres × 5 crans):
 * **1,477**, atteint à 100 kg / 150 cm / femme / sédentaire. Laisser 1,25
 * aurait rendu `implausible_factor` — c'est-à-dire l'assiette d'ENTRETIEN —
 * précisément à la personne qui a poussé le curseur le plus loin, et sans un
 * mot. `target_grams_test.ts` rejoue ce balayage contre CETTE constante.
 */
export const BOX_FACTOR_MIN = 0.70;
export const BOX_FACTOR_MAX = 1.50;

// ⟳ 2026-09-09 — `DEFAULT_PACE_KG_PER_WEEK` A DÉMÉNAGÉ CHEZ `weight_pace.ts`,
// et il est RÉEXPORTÉ ICI pour ses lecteurs. Le motif n'est pas un rangement:
// `envelopeDirectionFor` (weight_pace) a besoin du même défaut, et
// `weight_pace.ts` ne peut pas importer ce fichier-ci (ce fichier l'importe
// déjà). Le laisser ici aurait obligé chaque appelant de l'enveloppe à
// re-décider « curseur réglé, ou défaut » — c'est-à-dire deux endroits où la
// même règle diverge.
export { DEFAULT_PACE_KG_PER_WEEK } from "./weight_pace.ts";

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
  /**
   * L0bis — LES `condition_ref` DE CETTE BOUCHE. REQUIS, jamais optionnel.
   *
   * Sixième champ requis, et pour la raison écrite au-dessus des cinq autres:
   * un `?` n'aurait fait remonter aucun appelant au compilateur, et la garde de
   * grossesse serait écrite, testée, branchée nulle part. `[]` = rien de
   * déclaré. Source unique: `student_safety_constraints.condition_ref`.
   */
  conditionRefs: readonly string[];
}): MouthSizing {
  if (args === null || typeof args !== "object") {
    throw new Error(
      "[keel/household_portions] mouthTargetFactor requires an input object",
    );
  }
  for (
    const key of [
      "ageState",
      "restrictionFlag",
      "coachCounting",
      "direction",
      "paceKgPerWeek",
      "subject",
      "conditionRefs",
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
  // ── L0bis — LA GROSSESSE, POSÉE SUR LE DÉFICIT ET PAS SUR LA PERSONNE ───
  //
  // ⚠️ LA POSITION EST L'ARBITRAGE. Placé en tête de la chaîne, ce garde aurait
  // effacé du journal `restriction_floor`, `age_unknown` et `no_direction` de
  // toute bouche enceinte — trois motifs qui disent chacun une chose vraie et
  // différente. Placé ICI, à l'endroit exact où le cran va devenir un écart, il
  // ne change le verdict que des bouches qui allaient recevoir un DÉFICIT.
  // Toute autre bouche — y compris une bouche portant un AUTRE `condition_ref`
  // — sort octet pour octet comme hier, et un test le tient.
  if (args.direction === "down") {
    const population = conditionGatePopulationOf(args.conditionRefs);
    const reason = conditionGateReason(population);
    if (reason !== null) return noSizing(reason);
  }
  // ── LOT B ① — UNE DIRECTION DÉCLARÉE PÈSE SUR LES GRAMMES ───────────────
  // Le cran choisi s'il existe; sinon celui que la direction porte par défaut.
  // Voir `DEFAULT_PACE_KG_PER_WEEK` pour l'arbitrage, et `sized_default_pace`
  // pour la mesure qui l'a ouvert. Le retour `no_pace` n'est PAS ici: il vit
  // plus bas, sur l'écart réellement exécuté, et il ne parle plus du curseur.
  const chosen = Number(args.paceKgPerWeek);
  const paceIsSet = args.paceKgPerWeek !== null && Number.isFinite(chosen) &&
    chosen > 0;
  const pace = paceIsSet ? chosen : DEFAULT_PACE_KG_PER_WEEK;

  // ── LE RYTHME **EXÉCUTÉ**, ET IL PASSE PAR LA MÊME PORTE QUE LE CURSEUR ──
  // ⟳ 2026-09-09: un cran du curseur est exécuté tel quel dans les deux sens
  // (en-tête de `weight_pace.ts`). On lit quand même `executedPaceFor` et pas
  // le cran nu: c'est lui qui nomme la borne qui mord (A1, plancher, fraction
  // du mineur, ou un cran de base au-dessus du curseur), et une seconde
  // arithmétique ici serait celle qu'on oublie d'ajuster.
  const executed: ExecutedPace | null = executedPaceFor(
    args.direction,
    args.subject,
    pace,
  );
  if (executed === null || executed.maintenanceKcal <= 0) {
    return noSizing("no_body");
  }

  const sign = args.direction === "down" ? -1 : 1;
  // ⚠️ LE DÉNOMINATEUR EST L'ENTRETIEN, PAS LA CIBLE. Le facteur dit « de
  // combien la boîte que le modèle a écrite pour un jour ordinaire doit
  // bouger », et le modèle écrit sur les enveloppes de MAINTENANCE (le tronc est
  // le MIN de celles-ci, les add-ons rendent le reste). Diviser par la cible
  // ferait porter au grammage un écart qu'il a déjà.
  const factor = (executed.maintenanceKcal + sign * executed.dailyDeltaKcal) /
    executed.maintenanceKcal;
  if (
    !Number.isFinite(factor) || factor < BOX_FACTOR_MIN ||
    factor > BOX_FACTOR_MAX
  ) {
    return noSizing("implausible_factor");
  }
  // Un écart exécuté NUL (un corps déjà sous son plancher) rend exactement 1.
  // On le nomme `no_pace` plutôt que `sized`: rendre « dimensionné, facteur 1 »
  // ferait lire à un compteur qu'une cible a mordu là où elle n'a rien pu faire.
  if (executed.dailyDeltaKcal === 0) return noSizing("no_pace");
  return { factor, reason: paceIsSet ? "sized" : "sized_default_pace" };
}

// ---------------------------------------------------------------------------
// ⛔ LA CEINTURE TCA D'UNE BOUCHE — QUATRE ÉTATS, PAS UN BOOLÉEN
// ---------------------------------------------------------------------------

/**
 * CE QU'ON SAIT DU PLANCHER TCA DE CETTE BOUCHE.
 *
 * ── POURQUOI QUATRE ÉTATS, ET PAS UN `boolean` ───────────────────────────
 * Un booléen fail-closed rendait le même `true` pour trois phrases qui n'ont
 * rien à voir, et c'est le défaut mesuré du 2026-08-19 (4 plans, 3 foyers):
 *
 *   · « son plancher est levé »        → il FAUT se fermer, et c'est le produit.
 *   · « on n'a pas pu l'évaluer »      → il FAUT se fermer, c'est le fail-closed.
 *   · « elle n'a pas de compte »       → il n'y a RIEN à lire. Le plancher TCA
 *     vit sur `auth.users` (série de pesées + verdict); une bouche sans compte
 *     n'en a pas, et n'en a jamais eu. Se fermer là-dessus ne protège personne:
 *     ça retire à la personne le seul fait qu'on ait sur elle — le corps que le
 *     compte maître a saisi sur sa FICHE — pendant que le prompt, lui, ne le
 *     voit déjà pas. Les deux mécanismes rataient le même monde.
 *
 * ⚠️ « PAS DE COMPTE » N'EST PAS UNE PORTE OUVERTE. Elle ne débloque QUE la
 * part de la fiche (`bodyShareFactors`, une MAINTENANCE relative). Elle
 * n'ouvre aucun déficit: la chaîne d'objectif garde ses autres portes (âge,
 * direction, cran de rythme), et la part de fiche ne prend aucun `goal`.
 */
export const MOUTH_RESTRICTION_STATES = Object.freeze(
  [
    /** Compte lu, verdict rendu, plancher NON levé. */
    "clear",
    /** Compte lu, plancher RÉELLEMENT levé. La porte se ferme, et c'est le produit. */
    "raised",
    /**
     * Cette bouche N'A PAS DE COMPTE. Rien à lire, donc rien à craindre d'une
     * lecture: son corps est celui de sa fiche, et c'est la seule chose qu'on ait.
     */
    "no_account",
    /**
     * Elle A un compte, et on n'a pas su l'évaluer (lecture en échec, verdict
     * illisible, rien de saisi). FAIL-CLOSED, et c'est le seul état qui garde
     * l'ancien arbitrage — mais il porte désormais son propre nom.
     */
    "unreadable",
  ] as const,
);
export type MouthRestrictionState = (typeof MOUTH_RESTRICTION_STATES)[number];

/**
 * L'ÉTAT, RÉDUIT AU BOOLÉEN QUE `energySafetyGates` DEMANDE.
 *
 * ⚠️ UNE SEULE ÉCRITURE DE CETTE RÉDUCTION. Deux `switch` sur quatre états
 * divergent, et celui qui divergerait ici gouverne l'assiette d'un enfant.
 */
export function restrictionFlagOf(state: MouthRestrictionState): boolean {
  switch (state) {
    case "raised":
    case "unreadable":
      return true;
    case "clear":
    case "no_account":
      return false;
  }
}

/**
 * LE MOTIF DU PLANCHER, NOMMÉ POUR CE QU'IL EST.
 *
 * `energySafetyGates` ne connaît qu'un booléen: il rend donc `restriction_floor`
 * pour les deux `true`. Ici on sait lequel des deux c'était, et un compteur qui
 * ne le dirait pas serait le compteur à deux nombres que ce dépôt paie en boucle.
 */
function namedFloorReason(
  reason: BoxSizingReason,
  state: MouthRestrictionState,
): BoxSizingReason {
  if (reason !== "restriction_floor") return reason;
  return state === "unreadable" ? "restriction_unknown" : "restriction_floor";
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
    /**
     * ⛔ LA CEINTURE TCA DE CETTE BOUCHE, À QUATRE ÉTATS — REQUIS.
     *
     * C'ÉTAIT `member.body?.restrictionFlag ?? true`, ET C'ÉTAIT LE DÉFAUT.
     * Cette expression lit l'objet du COMPTE pour décider du sort du corps de
     * la FICHE. Elle confondait trois mondes en un seul `true`, et fermait la
     * porte du moteur sur exactement la population que le prompt ne voit pas
     * déjà. Voir `MouthRestrictionState` pour les quatre états et l'arbitrage.
     */
    restriction: MouthRestrictionState;
    /**
     * L0bis — LES `condition_ref` DE CETTE BOUCHE. REQUIS.
     *
     * ⚠️ IL NE PORTE AUCUNE DÉCISION ICI: il traverse jusqu'à
     * `mouthTargetFactor`, où la règle est écrite une seule fois. Deux lectures
     * d'une même règle finiraient par diverger, et celle-ci gouverne l'assiette
     * d'une femme enceinte.
     */
    conditionRefs: readonly string[];
  },
): MouthSizing {
  const restriction = args.restriction;
  if (
    restriction === undefined ||
    !(MOUTH_RESTRICTION_STATES as readonly string[]).includes(restriction)
  ) {
    throw new Error(
      `[keel/household_portions] memberTargetFactor: unknown restriction ` +
        `state ${
          JSON.stringify(restriction)
        } — an absent gate is a disarmed gate`,
    );
  }
  if (args.body === null) {
    // ⚠️ ON NE SAUTE PAS LA PORTE POUR AUTANT. Un corps absent est une raison de
    // ne rien dimensionner, pas une raison de ne pas évaluer la ceinture: le
    // motif rendu doit rester celui de la première porte fermée, sans quoi un
    // journal dirait « pas de corps » d'un enfant que la porte ② protège.
    const gate = canSizeFromTarget({
      safety: energySafetyGates({
        restrictionFlag: restrictionFlagOf(restriction),
        ageVerdict: mouthAgeVerdict(member.ageState),
        coachCounting: args.coachCounting,
      }),
    });
    if (!gate.size) {
      return noSizing(
        namedFloorReason(gate.reason as BoxSizingReason, restriction),
      );
    }
    if (member.ageState === "unknown") return noSizing("age_unknown");
    return noSizing("no_body");
  }
  const goal = goalApplies(member) && member.goal ? member.goal : null;
  const out = mouthTargetFactor({
    ageState: member.ageState,
    restrictionFlag: restrictionFlagOf(restriction),
    coachCounting: args.coachCounting,
    direction: goal === null ? null : scaleDirectionOf(goal),
    paceKgPerWeek: args.paceKgPerWeek,
    subject: { body: args.body, isMinor: member.ageState === "minor" },
    conditionRefs: args.conditionRefs,
  });
  return out.reason === "restriction_floor"
    ? noSizing(namedFloorReason(out.reason, restriction))
    : out;
}

// ---------------------------------------------------------------------------
// ① bis — LA PART DE LA FICHE: le corps saisi dimensionne enfin l'assiette
// ---------------------------------------------------------------------------

/**
 * POURQUOI CETTE BOUCHE A — OU N'A PAS — UNE PART CALCULÉE SUR SON CORPS.
 *
 * ⚠️ VOCABULAIRE À PART, ET C'EST VOULU. `BOX_SIZING_REASONS` est le vocabulaire
 * de la chaîne d'OBJECTIF (perte/prise, cran de rythme). Celui-ci est celui de
 * la chaîne de MAINTENANCE. Les fondre en une seule liste ferait un compteur où
 * la moitié des valeurs seraient structurellement à zéro dans chaque colonne —
 * c'est-à-dire un compteur qu'on ne relit plus.
 */
export const BODY_SHARE_REASONS = Object.freeze(
  [
    /** Une part relative a été calculée sur le corps de la fiche. */
    "sized",
    /** Plancher TCA RÉELLEMENT levé sur son compte. Rien ne bouge, et c'est le produit. */
    "restriction_floor",
    /** Compte présent, ceinture non évaluable. Fail-closed, nommé. */
    "restriction_unknown",
    /**
     * ⛔ RETIRÉ DU VOCABULAIRE LE 2026-08-19 (LOT B ④) — LISEZ AVANT DE LE
     * REMETTRE. La porte ③ ne ferme plus la part de FICHE; elle continue de
     * fermer la chaîne d'OBJECTIF (`mouthTargetFactor`), qui est la seule des
     * deux à produire une cible. Le jeton est laissé ici, commenté, parce
     * qu'un plan archivé AVANT cette date le porte: sur `617ab89c` et ses
     * voisins, `box_sizing.shares` compte des bouches fermées par la doctrine.
     * Le garder DANS la liste en ferait une colonne structurellement à zéro,
     * c'est-à-dire un compteur qu'on ne relit plus (l'argument de l'en-tête).
     *
     *   "doctrine_no_counting",
     */
    /**
     * L'âge n'a pas été saisi. On ne sait donc pas QUELLE équation d'entretien
     * s'applique — Mifflin-St Jeor sur un corps d'enfant SOUS-ESTIME son besoin,
     * donc lui servirait une part réduite. « Je ne sais pas » n'est pas
     * « c'est un adulte », et la seconde phrase rétrécit une assiette.
     */
    "age_unknown",
    /** Corps de fiche absent ou insuffisant ⇒ pas d'entretien ⇒ pas de part. */
    "no_body",
    /**
     * Une seule bouche calculable à cette table. Une part est un RAPPORT: seule,
     * elle vaut 1 par construction. Rendre `sized` ferait lire à un compteur
     * qu'un corps a mordu là où il n'y avait rien à comparer.
     */
    "no_reference",
  ] as const,
);
export type BodyShareReason = (typeof BODY_SHARE_REASONS)[number];

export interface BodyShare {
  /**
   * Sans unité. `1` = la boîte que le modèle a écrite, inchangée.
   *
   * ⚠️ BRUT, NON RABOTÉ. Le rabotage est fait UNE fois, sur le PRODUIT des deux
   * chaînes (`householdMouthFactors`), et il y est compté. Raboter ici aussi
   * ferait deux rabotages dont un invisible: le second ne mordrait plus, et
   * `clamped` rendrait `false` sur une part qui a bel et bien été bornée.
   */
  factor: number;
  reason: BodyShareReason;
}

/**
 * LES BORNES DE LA PART DE FICHE.
 *
 * ── ELLES SE RABOTENT, ET C'EST L'INVERSE DE `BOX_FACTOR_MIN/MAX` ────────
 * Sur la chaîne d'objectif, « un facteur hors bornes ne se rabote pas, il se
 * refuse »: rendre 0,70 au lieu de 0,40 servirait un déficit que personne n'a
 * validé en ayant l'air d'avoir protégé quelqu'un.
 *
 * Ici l'arbitrage s'inverse, et pour une raison MESURÉE. Refuser rend `1`,
 * c'est-à-dire **la boîte de l'adulte de 79 kg servie à l'enfant de 23 kg** —
 * exactement le défaut que ce lot corrige, et il mordrait d'abord sur le plus
 * petit corps de la maison, celui dont le rapport à la moyenne est le plus
 * extrême. Une ceinture qui se referme précisément sur le cas qu'elle est
 * censée servir est le mode d'échec que ce fichier documente déjà deux fois
 * (voir `BOX_FACTOR_MIN`, « 0,75 était trop serré »).
 *
 * ── D'OÙ VIENNENT CES DEUX NOMBRES ───────────────────────────────────────
 * La part est normalisée sur la MOYENNE de la table (voir `bodyShareFactors`),
 * donc la somme des facteurs vaut le nombre de bouches: la casserole ne gonfle
 * pas. Les extrêmes réels d'un foyer ordinaire:
 *
 *   · un enfant de 3 ans (~1 000 kcal) à une table de deux adultes (~2 400):
 *     moyenne 1 933, part 0,52 — le plus bas rapport constructible sans corps
 *     aberrant. On s'arrête à 0,55: en dessous, on ne redistribue plus un plat
 *     de famille, on sert un autre repas — et c'est une décision de produit,
 *     pas d'arithmétique.
 *   · l'adulte le plus grand de la même table monte à ~1,24. 1,45 laisse la
 *     place à un foyer d'un adulte et de deux jeunes enfants sans que la part
 *     de l'adulte vide la casserole des deux autres.
 *
 * ⚠️ UN RABOTAGE SE COMPTE. `MouthFactor.clamped` le porte jusqu'au journal:
 * une borne qui mord sans qu'on le sache est une borne qu'on croit inerte.
 */
export const BODY_SHARE_FACTOR_MIN = 0.55;
export const BODY_SHARE_FACTOR_MAX = 1.45;

/** Ce que la part de fiche lit d'une bouche. Rien d'autre n'entre. */
export interface ShareMouth {
  memberId: string;
  ageState: MemberAgeState;
  restriction: MouthRestrictionState;
  /** Le corps de sa FICHE (`household_member_bodies`), mineurs compris. */
  body: MouthBody | null;
}

function clampShare(factor: number): { factor: number; clamped: boolean } {
  if (factor < BODY_SHARE_FACTOR_MIN) {
    return { factor: BODY_SHARE_FACTOR_MIN, clamped: true };
  }
  if (factor > BODY_SHARE_FACTOR_MAX) {
    return { factor: BODY_SHARE_FACTOR_MAX, clamped: true };
  }
  return { factor, clamped: false };
}

/**
 * LA PART DE CHAQUE BOUCHE, RELATIVE À LA TABLE — et c'est ici que le corps
 * saisi sur la fiche cesse d'être collecté pour rien.
 *
 * ── LE DÉFAUT, ET SA MESURE ──────────────────────────────────────────────
 * Trois runs, neuf comparaisons, zéro écart: une adulte de 152 cm / 47 kg
 * recevait 220 g de poulet, un ado de 178 cm / 70 kg en recevait 140 —
 * exactement comme un enfant de 7 ans de 122 cm / 23 kg. Le corps des trois
 * était en base (`household_member_bodies`), chargé (`lineBodies`), passé à
 * `memberTargetFactor` — et jeté par une porte qui lisait l'objet du COMPTE.
 *
 * ── CE QUE CETTE FONCTION EST, ET CE QU'ELLE N'EST PAS ───────────────────
 * C'est une **maintenance relative**, jamais un objectif. Elle ne prend aucun
 * `goal`, aucun cran de rythme, aucune direction: il n'existe donc aucun chemin
 * par lequel un `fat_loss` écrit sur la fiche d'un enfant atteigne ce facteur.
 * C'est le même patron que `childEnvelopeFromBody` — la garde est l'ABSENCE
 * d'un paramètre, pas un `if` qu'on pourrait oublier de rejouer.
 *
 * ── LA NORMALISATION EST LA MOYENNE, ET ELLE PROTÈGE LA CASSEROLE ───────
 * `facteur = entretien / moyenne(entretiens de la table)`. Somme des facteurs
 * = nombre de bouches: ce qui est retiré à un petit corps est très exactement
 * ce qui est ajouté à un grand, et la production de la casserole n'a pas à
 * grossir. `sizeBoxesFromTarget` garde de toute façon son plafond de récipient.
 *
 * ── ⛔ LES PORTES ② (MINEUR) ET ③ (DOCTRINE) SONT ÉVALUÉES PUIS DÉPASSÉES ──
 * `energySafetyGates` est appelée avec le VRAI verdict d'âge de cette bouche
 * ET la VRAIE position du coach, dans l'ordre du contrat, et le motif de ①
 * survit tel quel. Deux motifs seulement sont dépassés — `minor` et
 * `doctrine_no_counting` — et l'arbitrage est le même pour les deux:
 *
 *   · les portes ② et ③ ferment une **cible d'énergie** — un déficit, un
 *     surplus, une date d'arrivée. Aucun de ces trois objets n'existe ici.
 *   · une **maintenance pédiatrique** calculée sur le corps d'un mineur est
 *     déjà le produit de ce dépôt: `mouthEnvelope` la sert par
 *     `childEnvelopeFromBody` (Schofield, FAO/WHO/UNU), et `lineBodies` est
 *     chargée pour ça. `estimatedMaintenanceFor` choisit l'équation sur
 *     `isMinor`, jamais sur `ageYears`.
 *   · maintenir ② ici, c'est servir à un enfant de 7 ans la boîte d'un adulte
 *     de 79 kg **au nom de sa protection**. C'est la mesure du 2026-08-19, et
 *     c'est le contraire d'une protection.
 *
 * ── ③ · CE QUE LE COACH A DIT, ET CE QU'IL N'A PAS DIT (LOT B ④) ─────────
 * Le jeton de la porte ③ est `count_calories`: « on ne compte pas les
 * calories ». Il porte sur un CHIFFRE mis devant quelqu'un. Répartir une même
 * casserole au prorata des corps qui la mangent n'est pas un comptage: rien
 * n'est énoncé, aucun nombre de corps n'entre nulle part, et ce qui sort est
 * une part de plat — la grandeur que ce dépôt autorise en toutes lettres.
 *
 * ⚠️ ET `countingStanceFrom` REND `no_counting` POUR DEUX PHRASES DIFFÉRENTES:
 * « le coach l'a écrit » et « on n'a pas su lire sa doctrine » (fail-closed).
 * La seconde n'est la décision de personne. Tant que la porte ③ fermait la
 * part de fiche, une panne de lecture de doctrine rendait à l'enfant de 23 kg
 * la boîte de l'adulte de 61 kg — un défaut d'infrastructure servi à table
 * sous le nom d'une méthode pédagogique.
 *
 * ⛔ CE QUE ÇA NE FAIT PAS: la porte ③ reste ENTIÈRE sur `mouthTargetFactor`.
 * Un coach qui ne compte pas garde donc exactement ce qu'il a demandé — aucun
 * déficit, aucun surplus, aucune cible pour personne de sa cohorte — et ce
 * qu'il perd est seulement le droit de faire manger à un enfant la part d'un
 * adulte. C'est la ligne: la position du coach gouverne une CIBLE, elle ne
 * gouverne pas QUI reçoit le plus grand creux de la même casserole.
 *
 * ⚠️ CE QUE ÇA N'OUVRE PAS: le plancher TCA reste PREMIER et gagne contre tout,
 * mineur et doctrine compris; l'âge inconnu ferme; et rien de ce qui est
 * calculé ici ne s'énonce — ni au prompt, ni dans une note, ni dans un log
 * nominatif.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * QUI A DROIT À UNE PORTION PESÉE — et personne d'autre.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Décision produit du 2026-08-19** (`docs/keel/BOITES-PAR-REPAS.md`):
 *
 *   > Un objectif de poids ouvre une portion millimétrée. Rien d'autre ne la
 *   > demande, et personne d'autre ne la subit.
 *
 * ── CE QUE ÇA REMPLACE ───────────────────────────────────────────────────
 * Les deux modèles précédents pesaient TOUT LE MONDE. Une personne qui se
 * maintient, un enfant, quelqu'un qui veut juste dîner recevaient un grammage
 * que personne n'avait demandé — et le foyer entier héritait d'un protocole de
 * balance pour la cible d'une seule personne.
 *
 * ⛔ `maintenance` N'OUVRE RIEN, ET CE N'EST PAS UN OUBLI. C'est le cœur de la
 * décision: se maintenir, c'est précisément ne pas vouloir qu'on compte à sa
 * place. Le jour où quelqu'un « répare » ça, il rétablit le défaut.
 *
 * ⚠️ ET CE N'EST PAS LA MÊME QUESTION QUE `dishBearingMembers`. Un objectif dit
 * COMBIEN on met dans l'assiette; un régime dit qu'on ne peut pas manger la
 * casserole commune. Les deux se composent — une bouche végane qui prend du
 * muscle a son plat À ELLE, pesé.
 *
 * ⚠️ AUCUNE PORTE DE SÉCURITÉ ICI. Le plancher TCA, la minorité et la position
 * du coach ferment plus bas, dans `memberTargetFactor`, où elles ont accès à
 * l'état de ceinture. Les rejouer ici en ferait un second avis sur une
 * question qui n'en supporte pas deux.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function weighedPortionMembers(
  members: readonly PortionMember[],
): PortionMember[] {
  return members.filter((m) =>
    m.goal === "fat_loss" || m.goal === "muscle_gain"
  );
}

// ---------------------------------------------------------------------------
// L'APPÉTIT DE LA TABLE — ce qui dimensionne la CASSEROLE (2026-08-19)
// ---------------------------------------------------------------------------

/**
 * L'ENTRETIEN D'UN ADULTE DE RÉFÉRENCE, en kcal/jour. LE DÉNOMINATEUR.
 *
 * ⚠️ CE N'EST PAS UNE RECOMMANDATION NUTRITIONNELLE, c'est une UNITÉ. Elle sert
 * à exprimer « cette table mange comme 2,3 adultes » — un rapport, pas une
 * cible. Personne ne reçoit ce nombre, personne n'est comparé à lui.
 *
 * ⚠️ ET ELLE EST GROSSIÈRE EXPRÈS, POUR L'INSTANT. Le socle chiffré est un
 * chantier à part (`scratchpad/2026-08-19-BRAINSTORM-CALCULATEUR-NUTRITIONNEL.md`).
 * Déplacer cette constante déplace toutes les casseroles: c'est le seul endroit
 * à changer, et c'est pour ça qu'elle est nommée.
 */
export const REFERENCE_ADULT_MAINTENANCE_KCAL = 2000;

/** Ce que la table mange, exprimé en adultes de référence. */
export interface HouseholdAppetite {
  /**
   * L'ÉQUIVALENT, arrondi au demi. `null` = on n'a pas su, et l'appelant
   * retombe sur le compte de têtes.
   */
  equivalent: number | null;
  /** Combien de bouches ont un corps calculable — le NUMÉRATEUR du constat. */
  known: number;
  /** Combien de bouches à table — le dénominateur. Un compteur seul ment. */
  mouths: number;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * COMBIEN CETTE TABLE MANGE — et rien sur QUI mange quoi.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE ÇA FERME (2026-08-19) ──────────────────────────────────
 * `presence.servings` est un COMPTE DE TÊTES (`Math.max(1, total)`), et c'est
 * la seule chose qui dimensionnait la casserole. Un homme de 73 kg qui
 * s'entraîne dur et une femme de 59 kg comptaient tous les deux pour 1. Le
 * gaspillage n'était pas un risque, il était structurel — et le manque aussi.
 * Demandé: « c'est important de ne pas faire de gaspillage non plus ».
 *
 * ── LA SOMME SURVIT, LA DIVISION MEURT ───────────────────────────────────
 * `bodyShareFactors` calculait déjà ces entretiens, puis en faisait une
 * MOYENNE pour diviser les parts les unes contre les autres. C'est la division
 * qui couplait les convives et produisait le défaut « une ceinture posée sur
 * l'un retire à l'autre ». La somme, elle, n'a jamais couplé personne.
 *
 * ⛔ AUCUNE PORTE NE RETIRE QUELQU'UN DE CETTE SOMME. Ni le plancher TCA, ni
 * la minorité, ni la position du coach. Ces portes existent pour ne pas donner
 * un CHIFFRE à quelqu'un; l'en retirer ici ne lui donnerait pas moins de
 * chiffres, ça lui donnerait moins à MANGER. Sous-dimensionner la casserole
 * d'une personne sous plancher alimentaire serait l'exact contraire de ce que
 * cette ceinture protège.
 *
 * ⛔ TOUT OU RIEN. Une seule bouche sans corps calculable ⇒ `null`, et
 * l'appelant retombe sur le compte de têtes. Sommer les corps CONNUS
 * sous-dimensionne systématiquement — et se tromper dans ce sens-là veut dire
 * que quelqu'un ne mange pas. Le repli est le côté sûr.
 *
 * ⚠️ ARRONDI AU DEMI, ET L'ARRONDI EST UNE GARDE. Sur un foyer de deux, une
 * précision au centième laisse deviner un corps par soustraction. Elle
 * n'ajoute par ailleurs rien à une casserole.
 *
 * ⚠️ PLANCHER À 1. Une table sert au moins une assiette, même si l'équation
 * rend moins pour un tout petit corps.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function householdAppetite(
  mouths: readonly {
    ageState: MemberAgeState;
    body: MouthBody | null;
  }[],
): HouseholdAppetite {
  let sum = 0;
  let known = 0;
  for (const m of mouths) {
    const kcal = m.body === null ? null : estimatedMaintenanceFor({
      body: m.body,
      isMinor: m.ageState === "minor",
    });
    if (kcal === null || !Number.isFinite(kcal) || kcal <= 0) continue;
    known++;
    sum += kcal;
  }
  if (mouths.length === 0 || known !== mouths.length || sum <= 0) {
    return { equivalent: null, known, mouths: mouths.length };
  }
  const raw = sum / REFERENCE_ADULT_MAINTENANCE_KCAL;
  return {
    equivalent: Math.max(1, Math.round(raw * 2) / 2),
    known,
    mouths: mouths.length,
  };
}

export function bodyShareFactors(
  mouths: readonly ShareMouth[],
  coachCounting: CountingStance,
): Map<string, BodyShare> {
  const out = new Map<string, BodyShare>();
  const maintenance = new Map<string, number>();

  for (const m of mouths) {
    // ①②③ — LA MÊME CHAÎNE, LE MÊME ORDRE, LA MÊME ÉCRITURE. On n'en recopie
    // aucun `if`: on l'appelle, et on ne dépasse QUE `minor` (voir en tête).
    let gate = canSizeFromTarget({
      safety: energySafetyGates({
        restrictionFlag: restrictionFlagOf(m.restriction),
        ageVerdict: mouthAgeVerdict(m.ageState),
        coachCounting,
      }),
    });
    if (
      !gate.size &&
      (gate.reason === "minor" || gate.reason === "doctrine_no_counting")
    ) {
      // ⛔ ON NE DÉPASSE QUE ② ET ③, ET C'EST POURQUOI LA CHAÎNE EST REJOUÉE.
      // `energySafetyGates` ne rend que la PREMIÈRE porte fermée. Rejouer la
      // MÊME chaîne — avec un verdict de majeur et sans position de coach — est
      // la seule façon de dépasser ces deux portes-là sans recopier leurs `if`
      // ici; ce qui reste évalué est ①, et lui seul.
      //
      // ⚠️ LE PLANCHER ① EST ÉVALUÉ AVANT ② ET ③ DANS LES DEUX PASSES, et c'est
      // ce qui rend ce dépassement sûr: une ceinture TCA levée sort
      // `restriction_floor` à la PREMIÈRE passe, la condition ci-dessus est
      // fausse, et la seconde passe n'a jamais lieu. Une mutation qui inverse
      // l'ordre des portes dans `energy_gate.ts` fait rougir son propre test de
      // source (« ② est passée avant ① »).
      gate = canSizeFromTarget({
        safety: energySafetyGates({
          restrictionFlag: restrictionFlagOf(m.restriction),
          ageVerdict: mouthAgeVerdict("adult"),
          // ⛔ LITTÉRAL, PAS `coachCounting`. Voir l'en-tête, §③: la position du
          // coach gouverne une CIBLE (`mouthTargetFactor`, où elle reste
          // entière), jamais le partage d'une même casserole. Repasser
          // `coachCounting` ici rendrait à l'enfant de 23 kg la boîte de
          // l'adulte de 61 kg dès qu'une doctrine est illisible.
          coachCounting: "no_position",
        }),
      });
    }
    if (!gate.size) {
      out.set(m.memberId, {
        factor: 1,
        reason: namedFloorReason(
          gate.reason as BoxSizingReason,
          m.restriction,
        ) as BodyShareReason,
      });
      continue;
    }
    if (m.ageState === "unknown") {
      out.set(m.memberId, { factor: 1, reason: "age_unknown" });
      continue;
    }
    const kcal = m.body === null ? null : estimatedMaintenanceFor({
      body: m.body,
      isMinor: m.ageState === "minor",
    });
    if (kcal === null || !Number.isFinite(kcal) || kcal <= 0) {
      out.set(m.memberId, { factor: 1, reason: "no_body" });
      continue;
    }
    maintenance.set(m.memberId, kcal);
  }

  // ── LA RÉFÉRENCE — LA TABLE, PAS UNE CONSTANTE ──────────────────────────
  // Une constante universelle (« l'adulte de référence ») rendrait un facteur
  // qui ne dit plus rien du PARTAGE d'une casserole: à une table de deux
  // enfants, les deux verraient leur part rabotée sans que personne ne
  // récupère les grammes. La moyenne de la table est le seul dénominateur qui
  // conserve la production.
  let sum = 0;
  for (const kcal of maintenance.values()) sum += kcal;
  if (maintenance.size < 2 || sum <= 0) {
    for (const id of maintenance.keys()) {
      out.set(id, { factor: 1, reason: "no_reference" });
    }
    return out;
  }
  const mean = sum / maintenance.size;
  for (const [id, kcal] of maintenance) {
    out.set(id, { factor: kcal / mean, reason: "sized" });
  }
  return out;
}

/**
 * COMBIEN DE POIDS DIFFÉRENTS CETTE TABLE SERT — le nombre que le prompt dit.
 *
 * ⚠️ CE N'EST PAS UN FAIT DE CORPS, C'EST UN NOMBRE DE BOÎTES. Il ne nomme
 * personne, ne dit ni âge ni poids, et ne permet de reconstruire aucun corps:
 * c'est la seule forme sous laquelle le résultat du moteur peut entrer dans un
 * prompt sans violer « le corps d'un mineur ne s'énonce jamais ».
 *
 * ⚠️ COMPTÉ SUR LA PART DE FICHE SEULE, PAS SUR LE FACTEUR APPLIQUÉ. Le cran de
 * rythme est lu APRÈS le modèle (`paceByMember`), donc il n'existe pas encore
 * quand le prompt s'écrit. La chaîne d'objectif ne peut que SÉPARER davantage
 * de bouches, jamais en fusionner deux qui divergeaient déjà; le nombre dit est
 * donc un PLANCHER, et la phrase du prompt nomme sa propre échappatoire (« deux
 * noms sur une boîte seulement s'ils prennent le même poids »), ce qui la rend
 * juste même quand le compte est bas d'une unité.
 *
 * ⚠️ ON GROUPE SUR LE **FACTEUR**, PAS SUR LE MOTIF, et c'est une simplification
 * MESURÉE: la version d'origine rangeait les bouches non dimensionnées dans un
 * sac « unsized » à part. Muter cette branche (M7) n'a fait tomber AUCUN test —
 * et pour cause: toute bouche non dimensionnée porte le facteur `1` exactement,
 * donc elle se range déjà avec les autres `1`. Une branche qu'aucun test ne
 * distingue est une branche qui ment sur ce qu'elle protège; celle-ci est
 * partie. Ce qui reste est la seule question qui compte pour une boîte: deux
 * bouches prennent-elles le MÊME poids ?
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function weightGroupCount(
  shares: ReadonlyMap<string, BodyShare>,
): number {
  const groups = new Set<string>();
  // Six décimales: deux corps qui diffèrent d'un millième de facteur ne sont
  // pas deux poids de boîte, et l'égalité flottante exacte ferait deux groupes
  // d'un même arrondi.
  for (const s of shares.values()) groups.add(s.factor.toFixed(6));
  return groups.size;
}

// ---------------------------------------------------------------------------
// LE FACTEUR APPLIQUÉ — les deux chaînes, composées, et DEUX compteurs
// ---------------------------------------------------------------------------

export interface MouthFactor {
  /** Ce qui est réellement multiplié dans `sizeBoxesFromTarget`. */
  factor: number;
  /** La chaîne d'OBJECTIF (perte/prise + cran de rythme), avec son motif. */
  target: MouthSizing;
  /** La chaîne de MAINTENANCE (le corps de la fiche), avec son motif. */
  share: BodyShare;
  /** Le produit des deux a-t-il été raboté par les bornes de part ? */
  clamped: boolean;
}

export interface FactorMouth {
  member: PortionMember;
  restriction: MouthRestrictionState;
  /** Le corps de la FICHE. La MÊME lecture que `mouthEnvelope`, jamais une seconde. */
  body: MouthBody | null;
  paceKgPerWeek: number | null;
  /**
   * L0bis — LES `condition_ref` DE CETTE BOUCHE. REQUIS, jamais `?`.
   *
   * ⚠️ SOURCE UNIQUE, ET ELLE EXCLUT UNE POPULATION ENTIÈRE:
   * `student_safety_constraints.condition_ref` est clée sur `user_id`. Il
   * n'existe pas de `household_member_conditions`, donc une bouche SANS COMPTE
   * porte toujours `[]` — la garde de grossesse ne peut PAS la protéger
   * aujourd'hui. C'est un trou NOMMÉ (fiche `L0bis-a`), pas un oubli, et il
   * demande une décision produit avant toute table.
   */
  conditionRefs: readonly string[];
}

/**
 * LE FACTEUR DE CHAQUE BOUCHE DE LA TABLE — le seul appelant côté générateur.
 *
 * ── POURQUOI LES DEUX CHAÎNES SE MULTIPLIENT ────────────────────────────
 * Elles répondent à deux questions orthogonales: « ce corps est-il plus grand
 * que la moyenne de cette table ? » et « cette personne vise-t-elle une perte
 * ou une prise, et à quel cran ? ». Une personne peut être les deux. Les
 * additionner mélangerait deux échelles; en prendre le max en jetterait une.
 *
 * ⚠️ LE PRODUIT EST RABOTÉ, ET LE RABOTAGE EST COMPTÉ. Les deux facteurs
 * peuvent pousser dans le même sens (un petit corps qui perd du poids); leurs
 * bornes ne se composent pas, donc le produit reçoit la sienne.
 *
 * ⚠️ AUCUN MOTIF UNIQUE N'EST RENDU. Deux décisions ⇒ deux motifs ⇒ deux
 * compteurs. Un seul motif rendrait le même zéro pour « aucune cible » et
 * « aucun corps », et c'est le zéro ambigu que ce dépôt paie en boucle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function householdMouthFactors(
  mouths: readonly FactorMouth[],
  coachCounting: CountingStance,
): Map<string, MouthFactor> {
  const shares = bodyShareFactors(
    mouths.map((m) => ({
      memberId: m.member.memberId,
      ageState: m.member.ageState,
      restriction: m.restriction,
      body: m.body,
    })),
    coachCounting,
  );
  const out = new Map<string, MouthFactor>();
  for (const m of mouths) {
    const target = memberTargetFactor(m.member, {
      coachCounting,
      paceKgPerWeek: m.paceKgPerWeek,
      body: m.body,
      restriction: m.restriction,
      conditionRefs: m.conditionRefs,
    });
    const share = shares.get(m.member.memberId) ??
      { factor: 1, reason: "no_body" as BodyShareReason };
    const clamped = clampShare(share.factor * target.factor);
    out.set(m.member.memberId, {
      factor: clamped.factor,
      target,
      share,
      clamped: clamped.clamped,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ① LES BOÎTES, REDIMENSIONNÉES — déterministe, après le parseur
// ---------------------------------------------------------------------------

/** UN COMPOSANT d'un contenant, réduit à ce que le dimensionnement lit. */
export interface SizableItem {
  /**
   * LA CASSEROLE D'OÙ IL SORT. `null` = ajouté frais le jour même, donc hors du
   * contrôle de fournée: aucun plafond de récipient ne le borne, parce qu'aucune
   * casserole ne le produit.
   */
  preparationId: string | null;
  grams: number;
}

/** UN CONTENANT: son groupe, son contenu, et ce que son repas tire des casseroles. */
export interface SizableMeal {
  boxId: string;
  /**
   * ⛔ LE NOMBRE DE NOMS DÉCIDE CE QUE SES GRAMMES VEULENT DIRE (v4, 2026-08-20).
   *
   *   · **un seul** → une PRESCRIPTION. C'est très exactement ce que la cible
   *     de cette bouche achète.
   *   · **plusieurs** → une QUANTITÉ DE BAC. Le bac n'est la portion de
   *     personne: aucun facteur d'UNE de ses bouches ne peut le redimensionner,
   *     parce que ce serait faire payer aux autres l'arithmétique d'un tiers —
   *     le défaut « une ceinture posée sur l'un retire à l'autre », repris par
   *     l'autre bout.
   *
   * ⟳ 2026-09-04 — CE CHAMP NE DÉCIDE PLUS RIEN **ICI**. La règle n'a pas
   * changé, son lieu si: `resolveBoxFactors` la tient désormais, et cette
   * fonction ne fait qu'appliquer le facteur qu'on lui donne pour ce contenant.
   * La distinction reste comptée (`counts.common`). Le déplacement est ce qui
   * rend possible un facteur de BAC calculé sur la somme des besoins de ses
   * mangeurs — un nombre qui n'est celui d'aucun d'eux, donc que ce champ ne
   * pouvait pas exprimer.
   */
  memberIds: readonly string[];
  /**
   * LE JOUR DE CE CONTENANT (`mon`..`sun`), ou `null` pour un plat sans jour.
   *
   * ⛔ REQUIS, JAMAIS `?`. L'ancrage rend un facteur par (bouche, JOUR) — il l'a
   * calculé sur l'énergie, les moments et la masse de CE jour-là. Sans le jour
   * ici, l'appelant devait en choisir UN pour toute la fenêtre, et il prenait
   * « le plus proche de 1 » faute de mieux: un pansement de prudence sur une
   * approximation. Le champ est ce qui retire les deux.
   */
  day: string | null;
  /**
   * ⚠️ L'ORDRE EST LE CONTRAT. Le résultat rend les nouveaux grammes indexés sur
   * CETTE liste: l'appelant doit réécrire dans le même tableau, dans le même
   * ordre. Il n'existe pas de clé stable pour un composant — deux `term`
   * identiques sur un couvercle sont légitimes.
   */
  items: readonly SizableItem[];
  /**
   * LES REPRISES DU REPAS. ⚠️ ELLES NE SERVENT PLUS AU PRORATA — un `item` nomme
   * sa casserole, donc le plafond se pose EXACTEMENT. Elles restent pour dire
   * quelles casseroles ce repas touche, ce qui est ce que `touched` lit.
   */
  uses: readonly { preparationId: string; servings: number }[];
}

export interface SizablePreparation {
  id: string;
  /** > 0. Ce qui sort de la cuisson, en nombre de portions. */
  servingsMade: number;
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
   * Les nouveaux grammages, par contenant puis par INDEX de composant. Un
   * composant absent de cette table n'a pas bougé — on ne rend PAS le contenant
   * entier, pour que l'appelant ne puisse pas reconstruire un repas en perdant
   * ses autres champs.
   *
   * ⚠️ L'INDEX, PAS UNE CLÉ. Voir `SizableMeal.items`: il n'existe pas de clé
   * stable pour un composant, et l'ordre est le contrat.
   */
  items: Map<string, Map<number, number>>;
  /**
   * ⚠️ QUATRE NOMBRES, ET UNE PROPRIÉTÉ TESTÉE: `sized + unchanged === shares`.
   * Un compteur à deux nombres rendrait le même zéro pour « aucune cible » et
   * pour « une cible qu'on n'a pas su appliquer », et c'est le zéro ambigu que
   * ce dépôt paie en boucle.
   *
   *   · `boxes`         — les contenants du plan. Le contexte.
   *   · `common`        — ceux qui portent PLUSIEURS noms, donc qu'aucun facteur
   *                       ne touche. ⛔ SANS CE NOMBRE, un plan v4 où tout le
   *                       monde est dans un bac commun rendrait `sized: 0` —
   *                       exactement ce que rend un lot désarmé.
   *   · `items`         — les composants, tous contenants confondus. Le
   *                       dénominateur.
   *   · `sized`         — ceux dont les grammes ont bougé.
   *   · `unchanged`     — les autres. Le cas NOMINAL (aucune cible réglée).
   *   · `capped_by_pot` — les préparations dont la somme redimensionnée dépassait
   *                       ce qu'elles produisent, ramenées au plafond.
   *   · `unverifiable`  — les préparations dont la production n'est pas
   *                       reconstructible: on redimensionne, on ne peut pas
   *                       vérifier la somme.
   *
   * ⚠️ PROPRIÉTÉ TESTÉE: `sized + unchanged === items`.
   *
   * ⛔ `shared_mixed` ET `shared_scaled` ONT DISPARU, ET CE N'EST PAS UNE PERTE.
   * Ils existaient parce qu'une boîte à N noms ne portait qu'UN nombre: le
   * moteur la pesait à la MOYENNE des facteurs de ses bouches et rendait à
   * chacune sa part dans la phrase de table. v4 les rend inutiles autrement —
   * un bac à N noms ne se dimensionne pas du tout, et `common` le dit.
   */
  counts: {
    boxes: number;
    common: number;
    items: number;
    sized: number;
    unchanged: number;
    capped_by_pot: number;
    unverifiable: number;
  };
  issues: string[];
  /**
   * LE RABOT DU PLAFOND DE RÉCIPIENT, PAR CASSEROLE. `1` (ou absent) = elle a
   * suivi; `0,8` = tout ce qui tire sur elle a été ramené à 80 %.
   *
   * ⛔ IL EST RENDU PARCE QUE `unmetDemand` (`pot_demand.ts`) LE RÉCLAME, et que
   * cette fonction est la SEULE à le connaître. Il vivait en local (§③) et
   * mourait avec l'appel: le module qui devait mesurer le fork aval/amont était
   * construit, testé, et privé de sa dernière entrée — le lot désarmé, une
   * troisième fois.
   *
   * ⚠️ IL EST CLÉ PAR `preparationId`, PAS PAR BOUCHE. C'est l'appelant qui sait
   * quelle bouche tire sur quelle casserole quel jour; refaire ce partage ici
   * ferait une seconde arithmétique du même prorata, et ce dépôt en compte déjà
   * le prix (`neededPotFactor`, « une seconde arithmétique du même partage
   * divergerait de celle qui fait autorité au premier ajustement »).
   */
  shrink: Map<string, number>;
}

/**
 * LE PLANCHER D'UNE PART, en grammes. Une part à zéro n'est pas une portion,
 * c'est une consigne qui dit « rien » — et l'écran l'imprimerait telle quelle.
 */
export const BOX_MIN_SIZED_GRAMS = 1;

/**
 * D'OÙ VIENT LE FACTEUR D'UN CONTENANT. Fermé, et nommé pour la même raison que
 * tous les vocabulaires de ce fichier: `anchor` et `relative` ne se réparent pas
 * au même endroit, et un compteur qui les fondrait enverrait au mauvais.
 */
export const BOX_FACTOR_SOURCES = Object.freeze(
  [
    /** L'ancrage absolu de CE jour a tiré (`anchored` ou `clamped`). */
    "anchor",
    /**
     * LE BAC, dimensionné sur la SOMME des besoins de ses mangeurs (A2).
     *
     * ⛔ CE N'EST PAS « le facteur d'une de ses bouches ». C'est un nombre qui
     * n'appartient à aucune d'elles, et c'est pour ça qu'il a sa propre source:
     * le confondre avec `anchor` ferait lire « on a ancré Marc » là où on a
     * rempli une casserole.
     */
    "pot",
    /** La part relative de la table — un RAPPORT, qui ne décide pas du niveau. */
    "relative",
    /** Rien à appliquer: le contenant sort tel que le modèle l'a écrit. */
    "none",
  ] as const,
);
export type BoxFactorSource = (typeof BOX_FACTOR_SOURCES)[number];

export interface BoxFactor {
  factor: number;
  source: BoxFactorSource;
}

/**
 * QUEL FACTEUR POUR QUEL CONTENANT — l'unique autorité, et une BASCULE.
 *
 * ── ⛔ JAMAIS LE PRODUIT DES DEUX COUCHES ─────────────────────────────────
 * L'ancrage REMPLACE le relatif, il ne le multiplie pas. C'est la décision du
 * chantier grammage (« ancrage tiré → son facteur REMPLACE le relatif; sinon le
 * relatif reste, seul »), et la raison est un double comptage mesuré sur trois
 * runs: le modèle découpait par classe, le moteur multipliait par-dessus, et
 * l'ado de 70 kg dont le corps demande 2,03x la part de l'adulte de 47 kg en
 * recevait 1,02x.
 *
 * ── ⟳ CE QUI CHANGE LE 2026-09-04: LA GRANULARITÉ ────────────────────────
 * La bascule se faisait PAR BOUCHE, sur un facteur élu parmi ses jours ancrés —
 * « le plus proche de 1 gagne ». Cette prudence n'existait que parce qu'UN
 * facteur servait toute la fenêtre: l'ancrage avait calculé pour un jour précis
 * (son énergie, ses moments, sa masse), et l'appliquer à un autre jour était
 * l'approximation que la prudence pansait. La bascule est désormais par
 * (bouche, JOUR), donc chaque contenant reçoit le facteur qui a été calculé
 * pour lui. Il n'y a plus d'élection, donc plus rien à panser.
 *
 * ⚠️ UNE BOUCHE DANS UN BAC N'EST PAS UNE BOUCHE SANS FACTEUR. Elle rend `none`
 * ici — c'est-à-dire « ce contenant-là ne se dimensionne pas sur elle » — et sa
 * boîte à un nom du même jour, si elle en a une, garde le sien. Le silence est
 * porté par le CONTENANT, jamais par la personne.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function resolveBoxFactors(args: {
  boxes: readonly {
    boxId: string;
    memberIds: readonly string[];
    day: string | null;
  }[];
  /**
   * L'ancrage absolu, clé `<memberId> <day>` — la clé de `householdAnchors`.
   *
   * ⚠️ TYPE STRUCTUREL, PAS `AnchorFactor` IMPORTÉ. `mouth_anchor.ts` importe ce
   * fichier; l'importer en retour ferait un cycle. C'est le même patron que
   * `PotDraw` dans `pot_demand.ts`, et pour la même raison.
   */
  anchors: ReadonlyMap<string, { factor: number; reason: string }>;
  /** La part relative, par `member_id`. */
  relative: ReadonlyMap<string, number>;
  /**
   * LE FACTEUR DE CHAQUE BAC, par `boxId` — déjà calculé (`potFactorFor`).
   *
   * ⚠️ CALCULÉ DEHORS, ET C'EST UNE CONTRAINTE DE COUCHES, PAS UN CHOIX.
   * `pot_demand.ts` importe `mouth_anchor.ts`, qui importe CE fichier: l'appeler
   * d'ici ferait un cycle. Ce que cette fonction garde est ce qu'elle doit
   * garder — l'ARBITRAGE entre les sources — et pas leur calcul.
   *
   * ⛔ SEUL UN BAC RÉELLEMENT DIMENSIONNÉ ENTRE ICI. L'appelant n'y met que les
   * `pot_sized`/`pot_clamped`; un bac qui s'est abstenu n'a pas d'entrée, et
   * sort donc `none` — c'est-à-dire tel que le modèle l'a écrit, comme avant.
   */
  pot: ReadonlyMap<string, number>;
}): Map<string, BoxFactor> {
  const out = new Map<string, BoxFactor>();
  for (const box of args.boxes) {
    // ⛔ UN BAC NE PREND JAMAIS LE FACTEUR D'UNE DE SES BOUCHES. Il prend le
    // sien — la somme des besoins de ceux qui y mangent — ou aucun. C'est le
    // cœur de v4 par l'autre bout: multiplier un bac par la cible de l'un
    // ferait payer aux autres l'arithmétique d'un tiers.
    if (box.memberIds.length !== 1) {
      const potFactor = args.pot.get(box.boxId);
      out.set(
        box.boxId,
        potFactor === undefined || potFactor === 1
          ? { factor: 1, source: "none" }
          : { factor: potFactor, source: "pot" },
      );
      continue;
    }
    const memberId = box.memberIds[0];
    const anchor = args.anchors.get(`${memberId} ${box.day ?? ""}`);
    if (
      anchor && (anchor.reason === "anchored" || anchor.reason === "clamped")
    ) {
      out.set(box.boxId, { factor: anchor.factor, source: "anchor" });
      continue;
    }
    const relative = args.relative.get(memberId);
    out.set(
      box.boxId,
      relative === undefined || relative === 1
        ? { factor: 1, source: "none" }
        : { factor: relative, source: "relative" },
    );
  }
  return out;
}

/**
 * LES PARTS, REDIMENSIONNÉES SUR LA CIBLE DE CHAQUE BOUCHE.
 *
 * ── POURQUOI C'EST DÉTERMINISTE ET APRÈS LE PARSEUR ───────────────────────
 * L'autre sortie était de demander les grammages au modèle, en lui donnant la
 * cible dans le prompt. Elle est écartée, et pour trois raisons mesurées:
 *
 *   1. **Le prompt de la lane foyer expire à quatre minutes** (mesuré par 3C,
 *      reconfirmé par L7). Ce lot n'ajoute pas une ligne au prompt pour ça.
 *   2. Un facteur de grammage dit dans le prompt est un nombre que le modèle
 *      RECOPIE. Mesuré au LOT E: « Zoé: 0,85 de la part de Marc » lu à table est
 *      un verdict comparatif sur deux corps.
 *   3. Un grammage déclaré par le modèle ne peut être que COMPTÉ, jamais
 *      garanti; un grammage calculé ici est exact et rejouable.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────
 * Elle ne crée aucune boîte, n'en supprime aucune, ne change aucun `member_id`,
 * ne touche à aucun ingrédient et n'écrit aucun texte. Elle ne fait que
 * multiplier des grammes par un facteur sans unité — et elle refuse de le faire
 * quand la casserole ne suivrait pas.
 *
 * ── LE PLAFOND DU RÉCIPIENT, EXACT DEPUIS v4 (2026-08-20) ────────────────
 * ⛔ C'ÉTAIT LA SEULE VRAIE DIFFICULTÉ DE L'UNITÉ « UN CONTENANT PAR REPAS », ET
 * ELLE A DISPARU. Sous v2, un couvercle portait UN total pour N casseroles: il
 * fallait le répartir au prorata de ce que chaque reprise tire vraiment, et
 * s'abstenir dès qu'un morceau manquait. Un `item` porte son `preparation_id` —
 * l'attribution est EXACTE, et une casserole illisible n'empêche plus de
 * vérifier ses voisines.
 *
 * ⚠️ `unverifiable` NE COMPTE PLUS QUE LES CASSEROLES DONT LA PRODUCTION est
 * irreconstructible (`readyGrams: null`). On ne présente jamais « vérifié » ce
 * qui est « on ne sait pas ».
 *
 * ⚠️ LE RABOT EST CELUI DE **SA** CASSEROLE, ET LE RAPPORT ENTRE LES BOUCHES
 * SURVIT QUAND MÊME: le facteur de rabot est le même pour tous ceux qui tirent
 * sur cette casserole-là. Ce qu'une cible achète est ce rapport, et le préserver
 * est la seule façon de ne pas retirer sa part à quelqu'un pour l'arithmétique
 * d'un autre.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeBoxesFromTarget(
  meals: readonly SizableMeal[],
  preparations: readonly SizablePreparation[],
  /**
   * Le facteur de CHAQUE CONTENANT, par `boxId`. Un contenant absent de la table
   * vaut `1` — « on n'a rien à lui appliquer », le cas nominal.
   *
   * ⟳ 2026-09-04 — PAR CONTENANT, ET PLUS PAR BOUCHE. Trois raisons mesurées:
   *
   *   1. L'ancrage rend un facteur par (bouche, JOUR); une table par bouche
   *      forçait l'appelant à en élire un pour toute la fenêtre. Il prenait « le
   *      plus proche de 1 » — un pansement de prudence sur une approximation.
   *   2. Une bouche peut avoir une boîte à elle à midi et une part de bac le
   *      soir. Un seul nombre pour les deux est faux dans les deux sens.
   *   3. Un BAC a besoin d'un facteur qui n'est celui d'aucun de ses mangeurs
   *      (la somme de leurs besoins). Une table par bouche ne peut pas le dire.
   *
   * ⛔ CETTE FONCTION NE DÉCIDE PLUS QUI REÇOIT QUOI. Elle applique. Le choix
   * — ancrage, relatif, bac, ou rien — est à `resolveBoxFactors`, et l'y avoir
   * remonté est ce qui garde UNE seule autorité sur le facteur d'un contenant.
   *
   * ⚠️ REQUIS, JAMAIS `?`. Un paramètre facultatif ferait de « aucune cible » le
   * défaut silencieux de tous les appelants, et le lot serait construit,
   * branché, désarmé — le mode d'échec n°1 de ce fichier.
   */
  factorsByBox: ReadonlyMap<string, number>,
  /** La tolérance de somme, reprise du parseur. REQUISE pour la même raison. */
  sumToleranceRatio: number,
): BoxSizingResult {
  const items = new Map<string, Map<number, number>>();
  const issues: string[] = [];
  const counts = {
    boxes: 0,
    common: 0,
    items: 0,
    sized: 0,
    unchanged: 0,
    capped_by_pot: 0,
    unverifiable: 0,
  };
  const prepById = new Map(preparations.map((p) => [p.id, p]));

  // ── ① CHAQUE COMPOSANT, MULTIPLIÉ PAR LE FACTEUR DE **SA** BOUCHE ───────
  //
  // ⛔ ET SEULEMENT SUR UN CONTENANT À UN SEUL NOM. Un bac commun n'est la
  // portion de personne: il n'a pas de bouche dont la cible pourrait le
  // redimensionner, et lui appliquer le facteur de l'un de ses mangeurs ferait
  // payer aux autres l'arithmétique d'un tiers.
  /** Les grammes candidats, par contenant puis par index, avant tout plafond. */
  const candidate = new Map<string, Map<number, number>>();
  /** Les préparations dont AU MOINS un composant a bougé — voir le plafond. */
  const touched = new Set<string>();
  for (const meal of meals) {
    counts.boxes++;
    const next = new Map<number, number>();
    candidate.set(meal.boxId, next);
    // ⚠️ COMPTÉ, PLUS SAUTÉ. Un bac reste un bac — `common` dit combien il y en
    // a, et c'est le nombre qui empêche de lire `sized: 0` comme un lot désarmé
    // là où toute la table est dans un contenant partagé. Mais il traverse
    // désormais la même boucle que les autres: sans facteur, il en ressort
    // identique au gramme près, et avec un facteur de BAC (A2) il se
    // dimensionne. Le `continue` d'avant rendait le second cas inexprimable.
    if (meal.memberIds.length !== 1) counts.common++;
    const factor = factorsByBox.get(meal.boxId) ?? 1;
    let anySized = false;
    for (const [index, item] of meal.items.entries()) {
      counts.items++;
      const sized = factor === 1
        ? item.grams
        : Math.max(BOX_MIN_SIZED_GRAMS, Math.round(item.grams * factor));
      if (sized !== item.grams) anySized = true;
      next.set(index, sized);
    }
    // ⚠️ LA CONDITION `anySized` EST LA GARANTIE DE BYTE-IDENTITÉ. Sans elle, le
    // plafond « réparerait » au passage les plans où le modèle a sur-rempli ses
    // contenants — c'est-à-dire changerait le produit pour la population qui n'a
    // AUCUNE cible. Le parseur a déjà sa propre `issue` pour ce cas-là; ce n'est
    // pas à ce lot de la doubler.
    if (!anySized) continue;
    for (const use of meal.uses) touched.add(use.preparationId);
  }

  // ── ② CE QUE CHAQUE CASSEROLE SE VOIT TIRER — EXACTEMENT, PLUS AU PRORATA ─
  //
  // ⚠️ C'EST LE SEUL ENDROIT OÙ v4 SIMPLIFIE. Sous v2 un couvercle portait UN
  // total pour N casseroles, et il fallait le répartir au prorata de ce que
  // chaque reprise tire — donc s'abstenir dès qu'une casserole n'était pas
  // reconstructible. Un `item` porte son `preparation_id`: l'attribution est
  // exacte, et une casserole illisible n'empêche plus de vérifier ses voisines.
  //
  // ⚠️ UN COMPOSANT À `preparationId: null` NE TIRE SUR AUCUNE FOURNÉE. Il est
  // ajouté frais le jour même; l'attribuer à une casserole la ferait déborder
  // avec du pain acheté le matin.
  const drawn = new Map<string, number>();
  for (const meal of meals) {
    const next = candidate.get(meal.boxId);
    for (const [index, item] of meal.items.entries()) {
      if (item.preparationId === null) continue;
      const grams = next?.get(index) ?? item.grams;
      drawn.set(
        item.preparationId,
        (drawn.get(item.preparationId) ?? 0) + grams,
      );
    }
  }

  // ── ③ LE PLAFOND DU RÉCIPIENT, CASSEROLE PAR CASSEROLE ──────────────────
  const shrink = new Map<string, number>();
  for (const prep of preparations) {
    if (!touched.has(prep.id)) continue;
    if (prep.readyGrams === null) {
      counts.unverifiable++;
      continue;
    }
    const ceiling = prep.readyGrams * sumToleranceRatio;
    const taken = drawn.get(prep.id) ?? 0;
    if (taken <= ceiling || taken <= 0) continue;
    shrink.set(prep.id, ceiling / taken);
    counts.capped_by_pot++;
    issues.push(
      `preparations[${prep.id}]: the sized meals would take ${
        Math.round(taken)
      } g ` +
        `but the batch makes about ${
          Math.round(prep.readyGrams)
        } g, every share ` +
        `that draws on it scaled back to fit`,
    );
  }

  // ── ④ CE QUI SORT: CHAQUE COMPOSANT, RABOTÉ PAR SA PROPRE CASSEROLE ─────
  //
  // ⚠️ LE RABOT EST CELUI DE LA CASSEROLE QUI DÉBORDE, ET DE PERSONNE D'AUTRE.
  // Ce qu'une cible achète est le RAPPORT entre les bouches; il est préservé
  // parce que le facteur de rabot est le MÊME pour tous ceux qui tirent sur
  // cette casserole-là. Le riz d'un plat dont seul le poulet manque ne bouge
  // pas, ce qui est la réalité du récipient.
  for (const meal of meals) {
    const next = candidate.get(meal.boxId);
    if (!next || next.size === 0) continue;
    const out = new Map<number, number>();
    for (const [index, item] of meal.items.entries()) {
      const sized = next.get(index) ?? item.grams;
      const ratio = item.preparationId === null
        ? 1
        : (shrink.get(item.preparationId) ?? 1);
      const final = ratio === 1
        ? sized
        : Math.max(BOX_MIN_SIZED_GRAMS, Math.round(sized * ratio));
      // ⚠️ `sized` SE COMPTE SUR CE QUI A RÉELLEMENT BOUGÉ, jamais par
      // soustraction. Un composant dont le facteur ≠ 1 mais dont l'arrondi rend
      // le MÊME nombre n'a pas bougé, et le compter dirait qu'une cible a mordu
      // là où l'assiette est identique. Cicatrice `withheld`/`over_cap`.
      if (final === item.grams) continue;
      counts.sized++;
      out.set(index, final);
    }
    if (out.size > 0) items.set(meal.boxId, out);
  }
  counts.unchanged = counts.items - counts.sized;
  return { items, counts, issues, shrink };
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
export const MEAL_SIZE_WEIGHT: Readonly<
  Record<"small" | "medium" | "large", number>
> = Object.freeze({ small: 1, medium: 2, large: 3 });

const DEFAULT_SLOT_WEIGHT: Readonly<Record<EatingOccasion, number>> = Object
  .freeze({
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
   * ⟳ 2026-09-09 — LA JOURNÉE DE CETTE PERSONNE, EN kcal, **TELLE QUE LE
   * PRODUIT LA LUI DIT DÉJÀ**. `null` ⇒ pas de corps ⇒ pas de conseil.
   *
   * ══════════════════════════════════════════════════════════════════════
   * ⛔ CE QUI VIVAIT ICI, ET LE DÉFAUT MESURÉ QUI L'A FAIT TOMBER
   * ══════════════════════════════════════════════════════════════════════
   *
   * L'entrée était `executed: ExecutedPace` + `direction`, et la journée se
   * calculait ici: `executed.maintenanceKcal ± dailyDeltaKcal`.
   *
   * ⚠️ `ExecutedPace.maintenanceKcal` PORTE SON PROPRE INTERDIT, en toutes
   * lettres à sa déclaration (`weight_pace.ts`): « ELLE NE REND AUCUN NOMBRE
   * DESTINÉ À ÊTRE LU. `dailyDeltaKcal` et `maintenanceKcal` sont des
   * grandeurs de CALCUL […]. Les afficher serait la cible chiffrée que
   * `energy_target.ts` refuse de servir. » Ce conseil, lui, se LIT.
   *
   * Et ce ne sont pas deux façons de dire le même nombre. MESURÉ EN RUN RÉEL
   * LE 2026-09-09 (homme 82 kg, 180 cm, 36 ans, `trains_some`, `fat_loss`,
   * 0,5 kg/sem — plan personnel du mercredi, `qa-midi-dehors@keeltest.dev`):
   *
   *     fourchette AFFICHÉE sous le plan     1 950 – 2 200 kcal/j
   *       (`maintenanceRange` 2 450–2 700, poids × kcal/kg, moins 500)
   *     journée du CONSEIL                   3 177 − 500 = 2 677 kcal/j
   *       (`estimatedMaintenanceFor`, métabolisme de base × facteur d'activité)
   *     ⇒ conseil rendu                      « au déjeuner, vise autour de 900 »
   *
   * 900 × 3 = 2 700, soit **500 kcal au-dessus du haut de la fourchette
   * imprimée trois centimètres plus haut**. Les deux nombres se contredisent
   * sur le même écran, et le second promet une journée que le premier refuse.
   * `energy_target_test.ts` REFUSE explicitement la formule qui a produit
   * 3 177 — « une cible fausse avec l'aplomb d'un tableau ».
   *
   * ══════════════════════════════════════════════════════════════════════
   * D'OÙ VIENT CE NOMBRE MAINTENANT, ET POURQUOI L'APPELANT LE CALCULE
   * ══════════════════════════════════════════════════════════════════════
   *
   * De `directedRange` — c'est-à-dire de la fourchette que l'écran imprime,
   * déficit, plancher d'énergie et annulation de condition compris. Le conseil
   * est une PART de la journée que le produit annonce; il ne peut pas descendre
   * d'une autre estimation que celle-là.
   *
   * ⛔ ET IL SE PASSE, IL NE SE RECALCULE PAS ICI. Refaire la fourchette dans ce
   * module en ferait un second point de décision sur « quelle journée » — la
   * forme de défaut que ce lot vient précisément de fermer.
   */
  dayKcal: number | null;
}): EatingOutAdvice {
  const refuse = (reason: EatingOutAdviceReason): EatingOutAdvice => ({
    kcal: null,
    reason,
  });
  // ── C9.b — LE VOCABULAIRE, AVANT TOUT ───────────────────────────────────
  if (
    !(KNOWN_PRESENCE_STATES as readonly string[]).includes(args.presenceState)
  ) {
    return refuse("unknown_state");
  }
  if (args.presenceState !== "eating_out") return refuse("not_eating_out");

  // ── LA CHAÎNE DU LECTEUR, ET SON MOTIF SURVIT TEL QUEL ──────────────────
  if (!args.reader.show) {
    return refuse(
      (EATING_OUT_ADVICE_REASONS as readonly string[]).includes(
          args.reader.reason,
        )
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

  if (args.dayKcal === null || !(args.dayKcal > 0)) return refuse("no_body");
  const weights = args.slots.map(slotWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (args.slots.length === 0 || total <= 0) return refuse("no_rhythm");
  const here = args.slots.findIndex((s) => s.slot === args.occasion.slot);
  if (here < 0) return refuse("no_rhythm");

  const share = (args.dayKcal * weights[here]) / total;
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
    surfaceForms: [
      "poids",
      "weight loss",
      "weight gain",
      "perte de poids",
      "prise de poids",
    ],
  },
  {
    ruleId: "portion.body",
    token: "maigrir",
    surfaceForms: [
      "mincir",
      "grossir",
      "slim down",
      "lose weight",
      "gain weight",
    ],
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
 * ═══════════════════════════════════════════════════════════════════════════
 * LA TAILLE DITE EN MOTS — le compteur de la contradiction, 2026-08-19.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'IL COMPTE, ET POURQUOI IL EXISTE. Quand le moteur possède le
 * grammage, tout mot de taille écrit par le modèle est un second avis sur le
 * même nombre — et il a été mesuré FAUX une fois sur deux: sur `cfd44e89`,
 * « Serve a larger share » à l'adulte de 47 kg qui reçoit 134 g (la plus petite
 * part de la table) et « the standard share » à l'ado de 70 kg qui en reçoit
 * 271 g (presque la plus grande). La phrase se contredit dans sa propre ligne,
 * et elle est lue à voix haute à table.
 *
 * ⛔ ON COMPTE, ON NE RÉÉCRIT PAS. Nuller la note ferait tomber avec elle la
 * moitié UTILE — « retirer les croûtes », « sauce piquante à part », « pas de
 * fenouil » — c'est-à-dire ce que le modèle est le seul à savoir. La ceinture
 * est le BRIEF (qui nomme le vocabulaire refusé); ceci est l'instrument qui dit
 * s'il a été suivi.
 *
 * ⛔ CE N'EST PAS UN MATCHER MAISON. Aucune forme devinée, aucun savoir sur les
 * aliments: une LISTE FERMÉE de tournures, passée au moteur du dépôt
 * (`findForbiddenMatches`), exactement comme `VAGUE_PORTION_TERMS` juste
 * au-dessus. `allowNegatedMentions: false`, même posture que
 * `sanitizePortionNote`: « pas une plus grosse part » parle quand même de la
 * taille de la part de quelqu'un.
 *
 * ⚠️ CE QU'IL NE COMPTE PAS, ET C'EST ASSUMÉ. Une comparaison écrite sans aucun
 * de ces mots (« Odalric gets the bowl, Wilfrid the small plate ») lui échappe.
 * C'est un PLANCHER de mesure, pas un verdict — le même statut que
 * `vague_portions` et `unquantified_dish_ingredients`.
 */
export const SIZE_WORD_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "portion.size_word",
    token: "larger share",
    surfaceForms: [
      "large share",
      "larger portion",
      "bigger share",
      "bigger portion",
      "big portion",
      "plus grande part",
      "plus grosse part",
      "part plus grande",
      "portion plus grande",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "smaller share",
    surfaceForms: [
      "small share",
      "smaller portion",
      "small portion",
      "reduced portion",
      "plus petite part",
      "part plus petite",
      "portion plus petite",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "standard share",
    surfaceForms: [
      "standard portion",
      "normal share",
      "normal portion",
      "usual share",
      "usual portion",
      "regular portion",
      "part standard",
      "portion standard",
      "portion normale",
      "part normale",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "child-size share",
    surfaceForms: [
      "child size share",
      "child-sized share",
      "child sized share",
      "child-size portion",
      "child-sized portion",
      "child portion",
      "kid-size portion",
      "part d'enfant",
      "portion d'enfant",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "same share as",
    surfaceForms: [
      "same portion as",
      "same share",
      "same amount as",
      "meme part que",
      "meme portion que",
    ],
  },
];

/**
 * LES TOURNURES DE TAILLE D'UNE CONSIGNE, dédupliquées et triées.
 * `[]` quand il n'y en a aucune — le cas voulu dès que le moteur pèse.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeWordMatches(raw: unknown): string[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return [];
  const matches = findForbiddenMatches(text, SIZE_WORD_TERMS, {
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
 * `dishes[].box.id` parmi les jetons « ASCII snake_case, English words only » —
 * un id n'est jamais traduit. La ceinture mord donc à l'identique sur
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
  /**
   * ⚠️ `regime_refused` EST UN TROISIÈME NOMBRE, ET IL NE SE DÉDUIT PAS. Une
   * part retirée parce que la préparation rompt la LIGNE DÉCLARÉE de cette
   * bouche n'est pas une part orpheline (`unknown`): l'une dit « le modèle a
   * cité une préparation qui n'existe pas », l'autre « le modèle a servi du
   * bœuf à une végane ». Les fondre rendrait la seconde invisible derrière la
   * première.
   */
  shareCounts: { shares: number; unknown: number; regime_refused: number };
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
   * ⚠️ CE SONT LES BOÎTES **GARDÉES** (`dishes[].boxes[].id` en sortie du parseur),
   * pas celles que le modèle a déclarées. Une boîte refusée n'existe
   * nulle part: son id dans une phrase est du bruit exactement comme les autres,
   * et il n'y a aucune raison de le laisser passer — mais la liste fermée est
   * celle du plan qu'on écrit, comme partout ailleurs.
   *
   * ⚠️ `[]` EST LÉGITIME ET FRÉQUENT: la lane individuelle n'a aucune boîte, et
   * un foyer où le modèle n'a pas obéi non plus. La ceinture est alors muette —
   * et c'est juste: sans boîte, il n'y a aucun id à faire fuir.
   */
  boxIds: readonly string[],
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LA CEINTURE DE RÉGIME, SECONDE SURFACE — CE QUE LE PARSEUR A DÉJÀ RETIRÉ.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS, `[]` pour « rien à retirer », JAMAIS `?`. Troisième fois dans
   * cette signature, et la raison n'a pas changé: un paramètre de garde
   * optionnel est une garde désarmée. Avec un `?`, l'unique appelant de
   * production pourrait cesser de le passer sans qu'un compilateur ni un test
   * ne bouge, et la ligne « une portion de bœuf » resterait accrochée sous le
   * plat d'une bouche végane.
   *
   * ⚠️ LU, JAMAIS RECALCULÉ. C'est `parseGeneratedMeal` qui a fait le scan
   * (liste fermée, analogues végétaux désamorcés) et qui rend
   * `meal.regime_refusals`. Refaire ici une seconde lecture des mêmes
   * préparations produirait deux verdicts sur la même casserole, et c'est
   * toujours celui qu'on relit le moins qui garderait l'ancienne liste.
   *
   * ⚠️ CE SONT LES PRÉPARATIONS **GARDÉES**, comme `preparationIds` et
   * `boxIds` au-dessus: une préparation refusée par le parseur n'existe plus.
   */
  regimeRefusals: readonly {
    preparation_id: string;
    member_ids: readonly string[];
  }[],
  /**
   * ⟳ 2026-09-07 (lot 8) — LE MODÈLE A-T-IL ÉTÉ PRIÉ D'ÉCRIRE DES PORTIONS ?
   *
   * ⛔ REQUIS, jamais `?`. Sous `portion_v1` le prompt ne demande PLUS
   * `member_portions` (il contredisait les boîtes calculées: 200 g de yaourt
   * annoncés, 326 g servis — mesuré le 2026-09-07). Leur absence est alors
   * ATTENDUE, et la signaler `portion_missing` ferait rougir un journal pour
   * une décision qu'on vient de prendre.
   *
   * ⚠️ ET ON NE SE CONTENTE PAS DE TAIRE: le motif change de nom
   * (`portion_standard_recipe`). « Le modèle a oublié » et « on ne lui a rien
   * demandé » sont deux faits différents, et un silence les confondrait.
   */
  standardRecipe: boolean,
): ReconciledPortions {
  const issues: string[] = [];
  /** `preparation_id` → les bouches que leur ligne déclarée en tient dehors. */
  const regimeHeldOff = new Map<string, Set<string>>();
  for (const entry of regimeRefusals) {
    const preparationId = String(entry?.preparation_id ?? "").trim();
    if (!preparationId) continue;
    const ids = new Set(
      (entry.member_ids ?? []).map((id) => String(id).trim()).filter(Boolean),
    );
    if (ids.size === 0) continue;
    regimeHeldOff.set(preparationId, ids);
  }
  // LOT 4 — LES NOMBRES DU FLOU. Passés par référence à `parseShares` pour
  // qu'il n'existe qu'UN compteur: une seconde addition côté appelant
  // divergerait au premier changement de forme des parts.
  const vagueCounts = { notes: 0, vague: 0, quantified: 0, box_ids: 0 };
  const shareCounts = { shares: 0, unknown: 0, regime_refused: 0 };
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
      issues.push(
        standardRecipe
          ? `portion_standard_recipe:${member.memberId}`
          : `portion_missing:${member.memberId}`,
      );
      return {
        memberId: member.memberId,
        displayName: member.displayName,
        portionNote: null,
        preparationShares: [],
        eatingSlots: member.eatingSlots,
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
    // il vient de la BOÎTE (`dishes[].box.shares[].grams`), qui est structurée,
    // et que `DishCard` comme la ligne de part rendent déjà (« Zoé — jeudi
    // midi · 220 g »).
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
      eatingSlots: member.eatingSlots,
      preparationShares: parseShares(
        row,
        member,
        issues,
        vagueCounts,
        shareCounts,
        knownPreparations,
        knownBoxIds,
        regimeHeldOff,
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
  shareCounts: { shares: number; unknown: number; regime_refused: number },
  knownPreparations: ReadonlySet<string>,
  knownBoxIds: ReadonlySet<string>,
  /** Voir `reconcilePortions`: LU du parseur, jamais recalculé ici. */
  regimeHeldOff: ReadonlyMap<string, ReadonlySet<string>>,
): PreparationShare[] {
  const raw = row.preparation_shares ?? row.preparationShares;
  if (!Array.isArray(raw)) return [];
  const out: PreparationShare[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const preparationId = String(e.preparation_id ?? e.preparationId ?? "")
      .trim();
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
    // ── LA CEINTURE DE RÉGIME, SUR LA SECONDE SURFACE ─────────────────────
    //
    // ⛔ JUSTE APRÈS LA LISTE FERMÉE, ET AVANT TOUT LE RESTE, pour la raison
    // écrite au-dessus: une part qui ne sera jamais rendue n'a rien à faire
    // dans le dénominateur du flou.
    //
    // ⚠️ ET ÇA NE TOUCHE NI `portion_note` NI LE PLAT NI LA BOUCHE. Seule la
    // LIGNE tombe — c'est-à-dire l'affectation d'une préparation à quelqu'un,
    // pas une phrase qu'on récrirait. La consigne principale de cette
    // personne sort intacte, comme pour une part orpheline: compter, nommer,
    // ne rien perdre d'autre.
    //
    // ⛔ MESURÉ: `separate_sessions`/run-1 du 2026-08-19 attachait à Théodule
    // (végane, 9 ans) une part de `Roasted Chicken and Smoked Tofu` — le
    // modèle avait écrit « one portion of smoked tofu » sous un titre qui
    // porte du poulet. La casserole est mixte; on ne peut pas garantir que sa
    // moitié végétale n'a pas touché l'autre, et une garantie fausse est pire
    // qu'aucune garantie.
    if (regimeHeldOff.get(preparationId)?.has(member.memberId)) {
      shareCounts.regime_refused++;
      issues.push(
        `share_against_declared_line:${member.memberId}:${preparationId}`,
      );
      continue;
    }
    const sanitized = sanitizePortionNote(e.note);
    let note = sanitized.note;
    for (const v of sanitized.violations) {
      issues.push(
        `share_note_rejected:${member.memberId}:${preparationId}:${v}`,
      );
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
          issues.push(
            `share_note_vague:${member.memberId}:${preparationId}:${v}`,
          );
        }
      }
      shareCounts.shares++;
      out.push({ preparationId, note });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LA PHRASE DE TABLE, MESURÉE — le gramme, lui, vit sur le couvercle
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE LA PHRASE DU MODÈLE PORTE ENCORE, ET QU'ELLE NE DEVRAIT PAS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUI A DISPARU ICI LE 2026-08-19, ET POURQUOI CE N'EST PAS UN RECUL.
 * `attachSizedQuantities` recollait à chaque bouche « titre de casserole + ses
 * grammes de boîte », parce qu'une boîte pendait à UNE casserole et qu'une
 * bouche y avait exactement une part: « Poulet rôti 150 g · Quinoa 80 g » était
 * alors une phrase VRAIE pour toute la semaine.
 *
 * Ce n'est plus le cas. Une boîte porte un REPAS, donc la part d'iku sur le
 * poulet du jeudi midi n'est pas celle du vendredi soir. Recoller un nombre par
 * casserole à une note valable pour toute la fenêtre écrirait un gramme faux
 * quatre fois sur cinq — et il serait lu à voix haute à table.
 *
 * ⚠️ LE GRAMME N'EST PAS PERDU: IL EST À L'ENDROIT OÙ ON L'EXÉCUTE. Chaque part
 * est écrite sur le couvercle de son repas, avec le nom de la personne. Un seul
 * nom sur la boîte ⇒ elle EST la portion. Plusieurs noms ⇒ l'étiquette porte le
 * partage. C'est très exactement ce que l'arbitrage a décidé, et c'est ce que le
 * brief promet au modèle (« Each person's own box already carries their exact
 * grams »).
 *
 * ── CE QUI RESTE, ET POURQUOI IL RESTE ────────────────────────────────────
 * Les deux compteurs de DÉSOBÉISSANCE. Sans eux, « le modèle a obéi » et « on
 * n'a rien mesuré » rendent le même silence:
 *   · `notes`            — les bouches qui sortent avec une consigne lisible.
 *   · `model_quantity`   — celles dont la phrase porte encore un POIDS alors que
 *                          le brief lui demande de n'en écrire aucun.
 *   · `model_size_word`  — celles dont la phrase DÉCRIT une taille en MOTS
 *                          (« a larger share », « the standard share ») alors
 *                          que le nombre vit sur le couvercle. Mesuré FAUX une
 *                          fois sur deux sur `cfd44e89`: deux bouches sur quatre
 *                          lisaient l'inverse de ce qu'elles recevaient.
 *
 * ⛔ ET IL EST CALCULÉ SUR TOUS LES PLANS, PAS SEULEMENT QUAND LE MOTEUR
 * DIMENSIONNE. L'ancien compteur ne tournait que dans la branche « une cible a
 * mordu »: un foyer sans corps saisi pouvait donc écrire n'importe quoi dans sa
 * phrase de table sans qu'aucun nombre ne bouge. Une mesure qui ne se prend que
 * quand tout va bien ne mesure rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function countPortionNoteDrift(
  portions: readonly MemberPortion[],
): { notes: number; model_quantity: number; model_size_word: number } {
  const counts = { notes: 0, model_quantity: 0, model_size_word: 0 };
  for (const p of portions) {
    if (p.portionNote !== null) counts.notes++;
    if (portionCarriesAQuantity(p.portionNote)) counts.model_quantity++;
    if (sizeWordMatches(p.portionNote).length > 0) counts.model_size_word++;
  }
  return counts;
}

/** Le format stocké dans `student_generated_meals.member_portions`. */
export function memberPortionsPayload(
  portions: readonly MemberPortion[],
): Array<Record<string, unknown>> {
  return portions.map((p) => ({
    member_id: p.memberId,
    display_name: p.displayName,
    portion_note: p.portionNote,
    // ⚠️ LES JETONS SEULS, PAS LES TAILLES. L'écran ne pose la question que
    // « mange-t-elle à ce moment-là ? »; la TAILLE d'une part est un fait de
    // corps, et `member_portions` est lisible par TOUT le foyer (§1 de ce
    // fichier). Un `{slot, size}` recopié ici ferait passer la frontière à une
    // donnée qui n'a rien à faire devant les autres bouches.
    eating_slots: p.eatingSlots === null
      ? null
      : p.eatingSlots.map((o) => o.slot),
    preparation_shares: p.preparationShares.map((s) => ({
      preparation_id: s.preparationId,
      note: s.note,
    })),
  }));
}
