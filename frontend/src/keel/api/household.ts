// KEEL — LE FOYER, côté écran: décisions pures d'un côté, appels de l'autre.
// Même partage que `coachSeat.ts` et `coachBroadcast.ts`.
//
// Autorité produit: docs/keel/PIVOT-FOYER.md §8.5, « les deux autorités ».
//
// ── CE QUI A DISPARU ICI LE 2026-08-10 (lots 1 et 2) ────────────────────────
// `restrictionBlock` anticipait le refus de la base pour griser un bouton, et
// `canSeeGoalOf` décidait si l'objectif d'un autre était affichable. Les deux
// dépendaient de règles qui n'existent plus: le consentement du majeur (le
// compte maître gouverne, et la contrepartie est que QUI a posé la règle reste
// affiché) et le mode colocation (sorti du produit).
//
// `isMinorBirthDate` part aussi. L'âge est DÉRIVÉ EN BASE, à trois états, et
// une seconde définition côté navigateur divergerait au premier ajustement —
// après quoi personne ne saurait laquelle ment.

import { supabase } from "../../lib/supabase";
// LA LISTE FERMÉE DES QUATRE RÉPONSES, LUE ET PAS RECOPIÉE. Une seconde liste
// ici divergerait de celle de l'entonnoir le jour où un régime entre, et
// l'écran du foyer offrirait une case que le moteur n'honore pas.
import { DIET_ANSWERS } from "./onboarding";
// LOT B — le mode de cuisson demandé à la composition. Le TYPE seul: la règle
// du plafond vit côté serveur, et ce module ne la connaît pas.
import { type CookingShape } from "./cookingShape";
import { readEdgeRefusal } from "./edgeErrors";
import { selectMealPlans } from "./mealWindow";
import {
  DEFAULT_EATING_RHYTHM,
  type EatingOccasionSlot,
  type MemberPortionView,
  parseEatingRhythm,
  readMemberPortions,
} from "./mealGeneration";
// ⚠️ `parseAwayMarks` ET SURTOUT PLUS `parseAwayDays` — voir `awayFrom`. Ce
// module ne lit plus jamais la colonne d'absences sans son jeton: c'est un
// parseur qui RETIRE de l'information, et trois écrans sur quatre passent par
// ici.
import { type AwayMark, parseAwayMarks } from "../lib/presenceMarks";
// ⚠️ LA GARDE D'ÉCRITURE D'UNE DATE DE NAISSANCE EST CELLE DU SERVEUR, IMPORTÉE
// TELLE QUELLE (D18, L9). Même geste que `groceryWaves.ts` et `coachProtocol.ts`
// avec leurs modules partagés: le front n'en écrit pas une seconde version, il
// lit la même. Voir `setOwnBirthDate`.
import {
  assessBirthDate,
  birthDateWritable,
} from "../../../../supabase/functions/_shared/keel/student_age.ts";
// LA SEULE DÉFINITION DE « DIRECTIONNEL » DU DÉPÔT, LUE ET PAS RECOPIÉE. C'est
// elle que `household_members_target_needs_direction_check` reflète en base et
// que la migration `20260822041500` nomme (arbitrage ①): `fat_loss` et
// `muscle_gain` font bouger la balance, `maintenance` non. Une seconde liste
// ici serait le doublon de constante que ce dépôt passe son temps à réparer.
import { scaleDirectionOf } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
// ⚠️ `tokens.ts` ET SURTOUT PAS `activity_floor.ts`, QUI PORTE UN AUTRE
// VOCABULAIRE (`lightly_active` / `active` / `very_active`). C'est celui-ci qui
// a la contrainte CHECK en base avec lui (`20260818100000`): son `parse` rendrait
// `null` sur trois valeurs de base sur quatre, en silence, et l'écran afficherait
// « personne n'a répondu » sur une réponse donnée.
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  APPETITE_LEVELS,
  type AppetiteLevel,
  DAY_ACTIVITY_LEVELS,
  type DayActivityLevel,
  GOAL_TOKENS,
  SPORT_FREQUENCIES,
  type SportFrequency,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  type HouseholdTradition,
  parseTraditions,
} from "../../../../supabase/functions/_shared/keel/household_traditions.ts";
import {
  type HouseholdPlanTrace,
  readHouseholdPlanTrace,
} from "./householdPlanTrace";

export type HouseholdRole = "owner" | "member";
/** Jumeau de `keel_household_member_age` en base et de `household.ts` côté edge. */
export type MemberAgeState = "minor" | "adult" | "unknown";

/** ⚠️ COPIES DE CONFORT. L'autorité est la CHECK correspondante en base. */
export const HOUSEHOLD_NAME_MAX = 80;
export const RESTRICTION_LABEL_MAX = 120;
export const ENVY_MAX_CHARS = 500;

export interface HouseholdMemberView {
  /** L'identité d'une bouche. Ne change pas le jour où elle réclame son profil. */
  memberId: string;
  /** `null` = pas de compte. C'est le cas NOMINAL d'un enfant. */
  userId: string | null;
  displayName: string;
  role: HouseholdRole;
  ageState: MemberAgeState;
  /** Trois jetons (`MEMBER_GOALS`), ou `null` = part standard. */
  goal: string | null;
  /**
   * CE QUE LE MAÎTRE A MARQUÉ (D14) — et c'est CELA que la grille modifie.
   *
   * ⚠️ NE PAS FUSIONNER LES DEUX CHAMPS AVANT DE LES RENDRE À LA GRILLE. Elle
   * réécrit ce qu'on lui donne: nourrie de l'union, elle RECOPIERAIT la
   * déclaration de la personne dans la colonne du maître, où elle survivrait
   * ensuite à sa rétractation. L'absence resterait alors marquée alors que son
   * auteur l'a retirée — et personne ne comprendrait d'où elle vient.
   *
   * ⛔ `AwayMark[]` ET PLUS `AwayDay[]` — DÉFAUT P1 (L6, 2026-08-18). Le type
   * disait `AwayDay[]` pendant que `awayFrom` rendait déjà des marques: le
   * jeton `kind` voyageait à l'exécution et disparaissait à la COMPILATION,
   * donc rien n'empêchait un écran de le reconstruire à plat. Il est nommé ici
   * parce que c'est de ce champ que partent trois des quatre grilles.
   */
  awayHousehold: AwayMark[];
  /**
   * CE QUE LA PERSONNE A DÉCLARÉ ELLE-MÊME, dans son « about you ». Toujours
   * vide pour une bouche sans compte. LECTURE SEULE ici: le maître la voit
   * (sinon il remarquerait la marque et pas le fait), il ne l'édite pas.
   */
  awaySelf: AwayMark[];
  /**
   * LES MOMENTS OÙ CETTE BOUCHE MANGE — `null` quand personne ne l'a dit.
   *
   * Déjà TRANCHÉ par le roster entre son « about you » (si elle a un compte)
   * et sa ligne (sinon), exactement comme `goal`. Cet écran ne refait pas la
   * résolution: deux avis sur qui mange quand, et le foyer sert un
   * petit-déjeuner à quelqu'un qui n'en prend pas.
   *
   * ⚠️ `null` ≠ `[]`. `null` veut dire « aux moments de la maison » (le repli
   * du produit); le tableau vide dirait « ne mange jamais », et la base le
   * refuse à l'écriture (`empty_rhythm`).
   *
   * ⚠️ AVEC LA TAILLE DEPUIS LE 2026-08-14. C'était `string[]`, et la taille
   * tombait dans la lecture: `household_members.eating_rhythm` la porte
   * maintenant comme `practical_constraints.eating_rhythm` la portait déjà, et
   * `buildPortionBrief` la dit au modèle. La projeter sur le seul `slot` ici
   * ferait demander à l'écran une réponse qu'aucun aval ne verrait.
   */
  eatingSlots: EatingOccasionSlot[] | null;
  /**
   * LE RÉGIME DE CETTE BOUCHE — `null` quand personne n'a demandé.
   *
   * Déjà TRANCHÉ par le roster entre son « about you » (si elle a un compte) et
   * sa ligne (sinon), exactement comme `goal` et `eatingSlots`. Cet écran ne
   * refait pas la résolution: deux avis sur ce que quelqu'un mange, et le foyer
   * sert de la viande à un végétarien.
   *
   * ⚠️ `omnivore` EST UNE VALEUR, PAS UN VIDE. « Je mange de tout » est une
   * réponse; `null` veut dire « on n'a jamais posé la question ». Sur une
   * question de sécurité alimentaire ces deux-là ne sont pas la même chose, et
   * l'écran doit pouvoir montrer laquelle des deux il a.
   */
  diet: string | null;
}

export interface HouseholdView {
  id: string;
  name: string;
  members: HouseholdMemberView[];
  /** Moi, retrouvé dans `members` PAR MON COMPTE. Jamais recalculé par l'écran. */
  me: HouseholdMemberView | null;
  /**
   * FF-043 — LA BOUCHE DONT LA DOCTRINE GOUVERNE LE TRONC. `null` = le défaut,
   * c'est-à-dire le membre qui compose la session.
   *
   * ⚠️ C'est un fait de GOUVERNANCE, pas un fait de corps ni d'objectif — et
   * c'est pour ça qu'il peut être lu par le foyer. Ce que FF-043 R3 interdit
   * est un référent DÉRIVÉ d'une métrique ou d'un ordre d'objectifs: là,
   * connaître le référent reviendrait à connaître l'objectif le plus bas de la
   * maison. Déclaré, il ne dit rien de personne.
   */
  referenceMemberId: string | null;
}

export interface RestrictionView {
  id: string;
  memberId: string;
  label: string;
  /**
   * `null` = le compte de l'auteur a été EFFACÉ (purge RGPD). La règle, elle,
   * survit — l'effacer changerait le menu de quelqu'un en silence. C'est
   * l'attribution qui disparaît avec la personne, pas le fait.
   */
  createdByUserId: string | null;
}

/**
 * UNE ALLERGIE DE FOYER — et ce n'est PAS une `RestrictionView`.
 *
 * Deux tables, deux natures, et le type les sépare pour la même raison que la
 * base: `household_food_restrictions` est le POUVOIR DOMESTIQUE, dont le verrou
 * serveur EFFACE le « pourquoi » du plat; une allergie est MÉDICALE et rejoint
 * l'union de sécurité du générateur, fail-closed. Les fondre dans un seul type
 * ferait de la distinction une convention, c'est-à-dire quelque chose qu'un
 * écran peut oublier.
 */
export interface AllergyView {
  id: string;
  memberId: string;
  label: string;
  /** `null` = compte de l'auteur effacé. L'ALLERGIE, elle, ne s'efface jamais. */
  createdByUserId: string | null;
}

/**
 * LES TROIS JETONS, DANS L'ORDRE OÙ L'ÉCRAN LES PROPOSE. Miroir du CHECK.
 *
 * ── ⚠️ RÉDUIT À TROIS LE 2026-08-18, ET LA VÉRIFICATION L'A TROUVÉ ROUGE ──
 * Le lot socle a replié six objectifs sur trois: la migration
 * `20260818100000` réécrit les lignes ET les CHECK
 * (`student_goals_goal_check`, `household_members_goal_check`), et les deux
 * portes RPC refusent désormais `recomposition`, `performance` et `health`
 * par `{"ok": false, "reason": "bad_goal"}`. Cette liste-ci, elle, était
 * restée à SIX — et c'est elle que `SetupPage` et `HouseholdPage` déroulent.
 *
 * Mesuré au navigateur avant le correctif: `/app/household` et `/app/setup`
 * proposaient sept `<option>` dont TROIS que la base refuse. Le pire des deux
 * est `setup-goal`: il écrit `student_goals` en direct, donc le refus serait
 * une violation de contrainte PostgreSQL rendue dans un entonnoir d'accueil —
 * très exactement ce que l'en-tête de `saveOwnGoal` dit vouloir éviter.
 *
 * ⚠️ ELLE EST DÉRIVÉE, PLUS RECOPIÉE — ET LA COPIE ÉTAIT LA CAUSE. Une
 * première version de ce correctif réécrivait les trois littéraux ici en
 * expliquant que le front ne peut pas remonter dans
 * `supabase/functions/_shared`. **C'était faux**, et le fichier le prouvait
 * dix lignes plus haut: il importe déjà `student_age.ts` de là. Huit modules
 * de production du front en importent (`groceryWaves`, `planFeedback`,
 * `coachProtocol`, `servingDivergence`…). Il n'y avait donc aucune raison de
 * garder une seconde liste — et c'est le fait d'en garder une qui a laissé
 * l'écran proposer six directions quand la base n'en acceptait plus que trois.
 *
 * `_shared/keel/household_portions.ts` avait déjà fait ce geste
 * (`export const MEMBER_GOALS = GOAL_TOKENS;`). Le front le fait maintenant
 * aussi: **une seule liste, trois lecteurs.**
 *
 * Ce qui reste testé, et qui compte encore, c'est l'autre bout: que
 * `GOAL_TOKENS` soit exactement ce que le CHECK de la base accepte à
 * l'écriture. Le test précédent (`goalsForAge("adult")` égale `MEMBER_GOALS`)
 * était paramétré par sa propre constante et est resté vert pendant toute la
 * dérive.
 */
export const MEMBER_GOALS = GOAL_TOKENS;
export type MemberGoal = (typeof MEMBER_GOALS)[number];

/**
 * UNE DIRECTION QUI FAIT BOUGER LA BALANCE — `fat_loss` ou `muscle_gain`.
 *
 * `string | null` en entrée, parce que c'est ce que la base rend (`goal` de
 * `HouseholdMemberView`, `MouthToPersist.goal`) et ce que trois écrivains
 * relisent avant d'écrire. Un jeton hors vocabulaire n'est PAS directionnel:
 * il ne sera jamais écrit (`bad_goal`), donc il ne peut pas être refusé pour
 * l'âge.
 */
export function isDirectionalGoal(goal: string | null | undefined): boolean {
  if (goal === null || goal === undefined) return false;
  const known = MEMBER_GOALS.find((g) => g === goal);
  return known !== undefined && scaleDirectionOf(known) !== null;
}

/**
 * LES DIRECTIONS QU'ON PROPOSE À CETTE BOUCHE-LÀ.
 *
 * ── ⛔ RENVERSÉ LE 2026-09-03 (chantier P3, décisions D3.1-D3.3): UN MINEUR
 *    NE VOIT QUE « MANGER NORMALEMENT » ─────────────────────────────────────
 * Du 2026-08-18 au 2026-09-03, cette fonction rendait la même liste à tout le
 * monde, et son paramètre n'était pas lu (`void kind`). La base, elle, avait
 * changé d'avis le 2026-08-22 (migration `20260822041500`, lot S4, décision
 * humaine « aucun objectif de poids sur un mineur »): les QUATRE portes
 * d'écriture refusent `fat_loss` et `muscle_gain` sur une bouche dont
 * `keel_age_state` vaut `minor` — `goal_not_for_minor` sur l'ajout, sur la
 * direction et sur la DATE (le détour temporel), `target_not_for_minor` sur la
 * cible chiffrée. Pendant douze jours, l'écran a donc proposé à un enfant deux
 * directions que la base refusait, et le refus arrivait en jeton brut.
 *
 * ⚠️ LE PARAMÈTRE EST L'ÉTAT D'ÂGE À TROIS VALEURS, PAS UN `kind` À DEUX.
 * `unknown` N'EST PAS `minor`: « je ne sais pas » et « c'est un enfant » ne
 * sont pas la même phrase. La migration le dit mot pour mot (« refuser sur
 * `unknown` fermerait l'objectif de tout adulte dont on n'a pas encore la
 * date — c'est-à-dire le cas courant de l'entonnoir »), et `goalApplies` rend
 * déjà `false` pour un âge inconnu. Un `unknown` voit donc les trois.
 *
 * ⚠️ C'EST UN FILTRE DE LISTE, TESTÉ SUR LA VALEUR RENDUE — jamais une tuile
 * masquée par `display:none`. Ce qui n'est pas proposé n'est pas dans le HTML.
 *
 * ⚠️ `maintenance` RESTE OUVERT SUR UN MINEUR, exprès (arbitrage ① de la
 * migration): l'énergie d'un mineur EST une maintenance calculée sur son âge
 * (`childEnvelopeFromBody` ne prend pas de paramètre `goal`), donc écrire
 * `maintenance` sur sa ligne n'ajoute rien à ce qui se passe déjà — et une
 * garde qui refuse l'inoffensif se fait retirer. L'écran le libelle « Manger
 * normalement » (`household.goal.minor_maintenance`), registre éducatif
 * (PIVOT-FOYER §8.4), jamais « maintenir un poids ».
 *
 * ⚠️ LA LISTE EST DÉRIVÉE, PAS RECOPIÉE: ce qui est retiré à un mineur est ce
 * que `scaleDirectionOf` dit faire bouger la balance — la même définition que
 * le CHECK `household_members_target_needs_direction_check` et que la garde
 * SQL. `household.int.test.ts` la confronte à la migration lue sur le disque.
 */
export function goalsForAge(ageState: MemberAgeState): readonly MemberGoal[] {
  if (ageState === "minor") {
    return MEMBER_GOALS.filter((g) => !isDirectionalGoal(g));
  }
  return MEMBER_GOALS;
}

/**
 * LA DIRECTION QUE L'ÉCRAN MONTRE ET ÉCRIT POUR CETTE BOUCHE-LÀ.
 *
 * C'est le pli: une direction que `goalsForAge` ne propose plus à cet âge
 * devient `maintenance` — jamais `""` (« rien de coché »), parce que la
 * personne AVAIT choisi, et parce que `maintenance` est exactement ce que la
 * base accepte à sa place. Deux cas l'atteignent, et ils partagent cette
 * seule ligne:
 *
 *   · une bouche mineure qui porte `fat_loss` EN BASE (les lignes d'avant le
 *     2026-08-22, que la migration a laissées exprès — « la garde ferme
 *     l'ENTRÉE, elle ne nettoie pas le stock »): l'écran montre « Manger
 *     normalement » coché et la phrase qui dit pourquoi
 *     (`household.goal.minor_switched`), et le Save écrit `maintenance`;
 *   · une date de naissance TAPÉE qui rend quelqu'un mineur pendant qu'une
 *     direction est posée sur lui: même bascule, même phrase, et
 *     `persistMouth` écrit la direction AVANT la date — sinon
 *     `keel_household_set_member_birth_date` refuse `goal_not_for_minor`.
 *
 * ⚠️ LE BROUILLON GARDE CE QUI A ÉTÉ TAPÉ. Le pli est une règle de LECTURE
 * (ce qui est rendu, ce qui part en base), pas une écriture dans l'état: une
 * date corrigée vers un âge adulte fait donc réapparaître la direction
 * d'origine, sans qu'on l'ait perdue — « on refuse, on n'efface pas »
 * (arbitrage ② de la migration), transposé à l'écran.
 */
export function goalForAge(goal: MemberGoal, ageState: MemberAgeState): MemberGoal;
export function goalForAge(
  goal: MemberGoal | "",
  ageState: MemberAgeState,
): MemberGoal | "";
export function goalForAge(
  goal: MemberGoal | "",
  ageState: MemberAgeState,
): MemberGoal | "" {
  if (goal === "") return "";
  if (goalsForAge(ageState).includes(goal)) return goal;
  return "maintenance";
}

// ───────────────────────────────────────────────────────────────────────────
// LES DÉCISIONS PURES
// ───────────────────────────────────────────────────────────────────────────

/**
 * Ce que la personne restreinte doit lire.
 *
 * §8.5 règle 3 et 4: elle voit QU'ELLE l'est et PAR QUI, et la phrase attribue
 * la décision au foyer — jamais à une raison de santé. Rendre un identifiant
 * de libellé plutôt qu'une phrase: la traduction appartient à `en.ts`, et une
 * phrase écrite ici serait dans une seule langue (leçon
 * `optout-confirmation-hardcoded-french`).
 */
export type RestrictionNotice =
  | { kind: "set_by_owner"; ownerName: string }
  | { kind: "set_by_me" };

export function restrictionNotice(
  household: HouseholdView | null,
  restriction: RestrictionView,
): RestrictionNotice {
  const me = household?.me?.userId;
  const author = restriction.createdByUserId;
  if (me && author === me) return { kind: "set_by_me" };
  // ⚠️ `m.userId &&` N'EST PAS DÉFENSIF, C'EST LA GARDE. Depuis que
  // `created_by` peut être NULL (compte de l'auteur effacé), un `find` naïf
  // comparerait `null === null` et attribuerait la règle à la PREMIÈRE bouche
  // sans compte du foyer — c'est-à-dire, le plus souvent, à l'enfant qu'elle
  // restreint. Deux inconnues ne sont pas la même personne.
  const owner = author
    ? household?.members.find((m) => m.userId && m.userId === author)
    : undefined;
  return { kind: "set_by_owner", ownerName: owner?.displayName ?? "" };
}

/**
 * LES BOUCHES QU'ON PEUT ENCORE INVITER À RÉCLAMER LEUR PROFIL (lot 6).
 *
 * Une seule règle, et c'est celle de la base: une ligne qui porte déjà un
 * compte n'a plus rien à réclamer (`already_claimed`). Proposer un choix que la
 * base refusera est une promesse qu'on ne tient pas — d'où ce filtre, ici et
 * pas dans le JSX, pour qu'il soit testable sans monter un écran.
 *
 * ⚠️ CE N'EST PAS « les gens sans e-mail »: le roster ne rend aucune adresse.
 * `userId === null` est l'état de la LIGNE, et c'est le seul fait disponible.
 */
/**
 * ⚠️ PLUS AUCUN LECTEUR DE PRODUCTION DEPUIS A5 (2026-09-03), ET ELLE RESTE.
 *
 * Son unique appelant était `InviteCard`, retirée avec le menu déroulant
 * « qui invites-tu ? »: chaque LIGNE dérive maintenant son propre état d'accès
 * de ses propres faits (`user_id`, invitation vivante), donc personne n'a plus
 * besoin de la liste des bouches libres du foyer.
 *
 * ⛔ ELLE N'EST PAS SUPPRIMÉE, et c'est un choix nommé: elle porte la
 * définition partagée de « libre » (`user_id is null`, et le maître n'en est
 * jamais), avec son test et son MIROIR (`mergeCounterparts`) qui ne doivent
 * jamais se recouvrir. Ce lot ne retire pas de surface qu'il n'a pas mesurée;
 * si elle doit partir, c'est avec son miroir et son test, dans un lot qui le
 * dit.
 */
export function claimableMembers(
  household: HouseholdView | null,
): HouseholdMemberView[] {
  return (household?.members ?? []).filter((m) => !m.userId);
}

/**
 * LES BOUCHES AVEC QUI UNE FUSION EST SEULEMENT CONCEVABLE (2026-08-14).
 *
 * ── LA RÈGLE PRODUIT, ET ELLE PRÉCÈDE TOUTE LECTURE ────────────────────────
 * La fusion n'existe qu'entre profils RÉCLAMÉS. Une bouche sans compte ne
 * compose rien — pas de `student_week_plans`, pas de plan validé — donc elle
 * n'a rien à fusionner, jamais, et aucun geste du maître ne changera ça.
 *
 * ⚠️ C'EST UNE CONDITION DE MONTAGE, PAS UN FILTRE D'AFFICHAGE. Sur un foyer
 * où personne n'a réclamé son profil, la carte de proposition rendait trois
 * phrases pour dire qu'il ne se passe rien, un plafond que personne n'a entamé,
 * et le nom d'une bouche suivi d'un reproche pour une chose qu'elle ne PEUT pas
 * faire. Mesuré sur `/app/household` le 2026-08-14, foyer de deux bouches.
 * L'état vide d'un bloc qui ne peut pas exister n'est pas un état vide: c'est
 * un bloc de trop.
 *
 * ⚠️ LE MAÎTRE EST EXCLU, ET CE N'EST PAS UN DÉTAIL. Il a toujours un compte:
 * le compter ferait rendre `true` pour TOUT foyer, c'est-à-dire une garde qui
 * ne garde rien. Le lecteur de propositions écarte déjà sa propre ligne
 * (`member_is_owner`) — c'est la même règle, un cran plus tôt.
 *
 * ⚠️ CE N'EST PAS « qui a un plan à fusionner ». Cette question-là est
 * arithmétique et vit AU SERVEUR (`bestMergePair`); y répondre ici ferait un
 * second avis. On répond à la seule question qu'un roster peut trancher: cette
 * bouche a-t-elle un endroit où composer ?
 */
export function mergeCounterparts(
  household: HouseholdView | null,
): HouseholdMemberView[] {
  return (household?.members ?? []).filter((m) => m.userId && m.role !== "owner");
}

/**
 * OÙ VA UNE DATE DE NAISSANCE SAISIE SUR L'ÉCRAN DU FOYER (D18, L9) ?
 *
 * Deux colonnes existent, et depuis 20260812180000 elles n'ont plus le même
 * poids: pour une bouche AVEC COMPTE, `keel_household_member_age` lit
 * `profiles.birth_date` d'abord et ne retombe sur `household_members.birth_date`
 * qu'à défaut. Écrire ma propre date sur ma FICHE ferait donc un champ qui
 * enregistre et ne change rien dès que mon « about you » en porte une.
 *
 * La règle tient en une ligne, et elle est ICI plutôt que dans le JSX pour
 * qu'elle soit vérifiable sans monter un écran:
 *
 *   · MA ligne (j'ai un compte, et c'est le mien) → mon PROFIL
 *   · tout le reste → la fiche de foyer
 *
 * « Tout le reste » n'est pas un fourre-tout: c'est un enfant (aucun compte, la
 * fiche est sa seule source) ou un titulaire qui n'est jamais passé par son
 * écran (RLS m'interdit son profil, et le repli SQL fait compter ce que je
 * saisis). Les deux sont des cas nominaux, pas des restes.
 *
 * ⚠️ `meUserId: string` ET PAS `string | null`, ET C'EST LE TYPE QUI TIENT LA
 * GARDE. Une bouche sans compte porte `userId: null`; si l'appelant pouvait
 * passer `null` pour « personne n'est connecté », `null === null` renverrait
 * l'enfant du foyer écrire dans un profil. L'écran calcule `user?.id ?? ""` —
 * la chaîne vide n'est l'identité de personne, et aucune ligne ne la porte.
 * NE PAS élargir cette signature: aucun test ne pourrait attraper le retour de
 * ce cas, seul le type le rend impossible.
 */
export function birthDateDoor(
  member: { userId: string | null },
  meUserId: string,
): "own_profile" | "member_row" {
  return member.userId === meUserId ? "own_profile" : "member_row";
}

/*
 * ── `envyRound` A ÉTÉ RETIRÉE (lot 5, 2026-08-10) ──────────────────────────
 *
 * Elle séparait ceux qui avaient déposé une envie de ceux qui s'étaient tus,
 * et l'écran en rendait le décompte. Les deux sont partis avec le conseil de
 * famille: un compteur « 3 personnes n'ont rien dit » se lit « il en reste 3 à
 * relancer », quoi qu'en dise la copie à côté — donc il recréait exactement la
 * charge mentale que le produit promet de supprimer.
 *
 * Ne pas le remettre sous une autre forme (« 2/5 ont répondu », une pastille,
 * une relance). Les envies sont UNE ligne, écrite par le compte maître pour
 * tout le monde.
 */

// ───────────────────────────────────────────────────────────────────────────
// LES APPELS
// ───────────────────────────────────────────────────────────────────────────

interface RpcResult {
  ok: boolean;
  reason: string;
  [key: string]: unknown;
}

function asResult(data: unknown): RpcResult {
  const row = (data ?? {}) as Record<string, unknown>;
  return { ...row, ok: row.ok === true, reason: String(row.reason ?? "") };
}

/**
 * LE FOYER ET SES MEMBRES.
 *
 * ── POURQUOI UNE RPC POUR LA LISTE ET PAS UN SELECT SUR `profiles` ────────
 * DÉFAUT VU AU NAVIGATEUR: la première rédaction lisait `profiles` avec un
 * `.in(ids)`. RLS sur `profiles` ne laisse lire QUE sa propre ligne — tous les
 * autres membres s'affichaient donc « — », sans nom ni étiquette « enfant »,
 * sans la moindre erreur. Un foyer à un seul habitant.
 *
 * Et on ne peut PAS ouvrir `profiles` par une policy: une policy RLS ne
 * restreint pas les COLONNES, donc la rendre lisible aux co-membres livrerait
 * téléphone, e-mail et identifiant Stripe pour afficher un prénom.
 * `keel_household_roster` rend quatre champs choisis un par un.
 */
/**
 * Les absences d'UNE source, lues dans la colonne que le roster étiquette.
 *
 * Jumeau de `parseMemberAway` côté moteur (`household_presence.ts`), et
 * volontairement écrit de la même façon: un filtre par clé, puis LE parseur.
 * Ce qui ne doit pas exister deux fois, c'est la fusion — et elle est faite en
 * base, par concaténation.
 *
 * EXPORTÉ POUR ÊTRE TESTÉ, et c'est le seul endroit du navigateur où une
 * absence change de main: si ce filtre laissait passer la déclaration de la
 * personne dans la vue « marqué par le maître », la grille la RECOPIERAIT dans
 * la colonne du foyer au premier enregistrement.
 */
export function awayFrom(raw: unknown, source: "self" | "household"): AwayMark[] {
  return parseAwayMarks(raw, source);
}

export async function loadHousehold(myUserId: string): Promise<HouseholdView | null> {
  const { data: hh, error: hhErr } = await supabase
    .from("households").select("id, name, reference_member_id").maybeSingle();
  if (hhErr) throw new Error(hhErr.message);
  if (!hh) return null;

  const { data: rows, error: rosterErr } = await supabase.rpc("keel_household_roster");
  if (rosterErr) throw new Error(rosterErr.message);

  const members: HouseholdMemberView[] = (rows ?? []).map((raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const age = String(r.age_state ?? "");
    return {
      memberId: String(r.member_id ?? ""),
      userId: typeof r.user_id === "string" && r.user_id ? r.user_id : null,
      // Un prénom vide rend le libellé de l'écran, JAMAIS l'e-mail en repli:
      // ça divulguerait une adresse à tout le foyer.
      displayName: String(r.first_name ?? "").trim() || "—",
      role: (String(r.role) === "owner" ? "owner" : "member") as HouseholdRole,
      // DÉRIVÉ EN BASE, à trois états. La date de naissance ne traverse jamais
      // le réseau: le foyer a besoin de savoir qu'il y a un enfant à table, pas
      // de sa date. Une valeur hors vocabulaire vaut `unknown`, jamais
      // `adult` — c'est la direction sûre, la même qu'en base.
      ageState: (age === "minor" || age === "adult" ? age : "unknown") as MemberAgeState,
      goal: typeof r.goal === "string" && r.goal ? r.goal : null,
      // D14 — LA COLONNE PORTE LES DEUX SOURCES, ÉTIQUETÉES. On les sépare
      // ici, avec le MÊME parseur que le moteur (`parseAwayDays`) sur le
      // sous-tableau filtré: une seconde lecture de la forme divergerait, et
      // c'est la grille qui montrerait autre chose que ce avec quoi on compose.
      awayHousehold: awayFrom(r.away_days, "household"),
      awaySelf: awayFrom(r.away_days, "self"),
      eatingSlots: readEatingSlots(r.eating_rhythm),
      // TRANCHÉ EN BASE, recopié tel quel — et VALIDÉ contre la liste fermée,
      // parce qu'un jeton hors des quatre n'a pas de bouton à allumer et ne
      // doit pas en allumer un au hasard.
      diet: (DIET_ANSWERS as readonly string[]).includes(String(r.diet ?? ""))
        ? String(r.diet)
        : null,
    };
  }).filter((m: HouseholdMemberView) => m.memberId);

  const row = hh as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    members,
    // PAR LE COMPTE, et c'est le seul endroit où `userId` sert à identifier:
    // celui qui regarde l'écran en a forcément un.
    me: members.find((m) => m.userId && m.userId === myUserId) ?? null,
    referenceMemberId: typeof row.reference_member_id === "string" && row.reference_member_id
      ? row.reference_member_id
      : null,
  };
}

export async function loadRestrictions(): Promise<RestrictionView[]> {
  const { data, error } = await supabase
    .from("household_food_restrictions")
    .select("id, member_id, label, created_by");
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      memberId: String(r.member_id),
      label: String(r.label ?? ""),
      // `null` quand le compte de l'auteur a été effacé. `String(null)` rendrait
      // la chaîne « null », qui ne vaut aucun `userId` mais n'est pas non plus
      // une absence — et l'écran ne saurait plus laquelle des deux il lit.
      createdByUserId: r.created_by == null ? null : String(r.created_by),
    };
  });
}

export async function createHousehold(name: string) {
  const { data, error } = await supabase.rpc("keel_household_create", { p_name: name });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * AJOUTER UNE BOUCHE — sans compte, sans invitation, sans attendre personne.
 *
 * C'est le geste que tout le chantier existe pour permettre. `birthDate` est
 * FACULTATIVE (le flux ne se bloque pas) mais tant qu'elle manque, la personne
 * reçoit une part standard: l'objectif ne s'applique qu'à un âge connu.
 */
export async function addHouseholdMember(
  firstName: string,
  birthDate: string | null,
  goal: string | null,
) {
  const { data, error } = await supabase.rpc("keel_household_add_member", {
    p_first_name: firstName,
    p_birth_date: birthDate,
    p_goal: goal,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * MON FOYER EST-IL EN PAUSE ? (chantier 3, D4)
 *
 * ── POURQUOI L'ÉCRAN DEMANDE, AU LIEU D'ATTENDRE LE REFUS ─────────────────
 * `supabase.functions.invoke` ne rend PAS le corps d'une réponse non-2xx: il
 * rend « Edge Function returned a non-2xx status code ». Le refus nommé de
 * `generate-household-meal-v1` (`household_frozen`, 402) arriverait donc à
 * l'écran comme une panne générique — et « un refus muet se lit comme une
 * panne » est exactement ce que ce chantier existe pour éviter. L'écran
 * demande donc son état, et le serveur refuse quand même: la garde est en
 * base, ceci n'est que la phrase.
 *
 * ── AUCUNE RÈGLE ICI ──────────────────────────────────────────────────────
 * `keel_household_my_coverage` est une dérivation de
 * `keel_household_is_covered`, la définition unique du dépôt. L'écran ne lit
 * NI `free_until` NI `subscriptions`: une seconde définition côté navigateur
 * afficherait « en pause » à quelqu'un qui compose très bien, ou l'inverse.
 *
 * En cas d'échec de lecture on rend `frozen: false` — ne pas savoir n'est pas
 * une raison d'annoncer une pause à quelqu'un qui paie.
 */
export interface HouseholdCoverage {
  inHousehold: boolean;
  frozen: boolean;
  /** Le dernier jour couvert par l'essai, ou `null` (aucun essai posé). */
  freeUntil: string | null;
}

export async function loadMyHouseholdCoverage(): Promise<HouseholdCoverage> {
  const open: HouseholdCoverage = {
    inHousehold: false,
    frozen: false,
    freeUntil: null,
  };
  const { data, error } = await supabase.rpc("keel_household_my_coverage");
  if (error) return open;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    inHousehold: row.in_household === true,
    frozen: row.frozen === true,
    freeUntil: typeof row.free_until === "string" ? row.free_until : null,
  };
}

/**
 * LE GESTE POUR REPRENDRE — le tunnel de paiement du foyer.
 *
 * Il existe côté serveur depuis le chantier 1 (`plan='keel_household'`, deux
 * articles) et n'avait AUCUN appelant. Un tunnel sans bouton est un tunnel que
 * personne ne prend: c'est le mode d'échec n°1 de ce dépôt, et un écran de
 * pause sans issue est sa version la plus chère — on annonce à quelqu'un qu'il
 * est coupé, et on ne lui montre pas comment revenir.
 *
 * ⚠️ IL PEUT REFUSER, ET C'EST NORMAL AUJOURD'HUI: tant qu'un humain n'a pas
 * créé les deux prix Stripe, la fonction edge échoue BRUYAMMENT plutôt que de
 * dégrader. L'appelant affiche le message; il ne le transforme pas en succès.
 */
export async function openHouseholdCheckout(): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    "stripe-create-checkout-session",
    { body: { plan: "keel_household", interval: "monthly" } },
  );
  if (error) throw error;
  const url = String((data as { url?: unknown } | null)?.url ?? "").trim();
  // R7: pas de no-op silencieux. Un bouton qui ne fait rien est indiscernable
  // d'un bouton qui a marché, et celui-ci déplace de l'argent.
  if (!url) throw new Error("no checkout url returned");
  return url;
}

/**
 * LES MOMENTS D'UNE BOUCHE, RELUS AVEC LE VOCABULAIRE FERMÉ DU MOTEUR.
 *
 * `null` traverse — il est une RÉPONSE (« personne ne l'a dit »), pas une
 * absence de donnée. Un tableau qui ne contient aucun moment lisible rend `null`
 * lui aussi: une liste vide affichée comme un choix explicite ferait croire que
 * quelqu'un a décoché les six moments.
 */
function readEatingSlots(raw: unknown): EatingOccasionSlot[] | null {
  if (raw === null || raw === undefined) return null;
  const slots = parseEatingRhythm(raw);
  return slots.length > 0 ? slots : null;
}

/**
 * POSER LES MOMENTS D'UNE BOUCHE SANS COMPTE, AVEC LEUR TAILLE.
 *
 * `null` efface — la bouche revient aux moments de la maison. Le tableau vide
 * n'est pas exprimable ici parce que la base le refuse (`empty_rhythm`): « elle
 * ne mange jamais » n'est pas une réponse qu'un écran doit pouvoir produire par
 * inadvertance.
 *
 * ⚠️ LA TAILLE EST FACULTATIVE, ET `null` EST UNE VALEUR. « Il n'a pas dit »
 * laisse le moment libre; écrire `medium` par défaut poserait une contrainte
 * que personne n'a exprimée, et le modèle la respecterait. La base refuse un
 * jeton hors des trois (`bad_rhythm`), donc l'écran n'en propose que trois.
 *
 * ⚠️ `at: null` EST GARDÉ DANS LE PAYLOAD, ET CE N'EST PAS UN OUBLI. C'est
 * l'ancienne clé de cette colonne (une heure), ignorée par les deux
 * `parseEatingRhythm` depuis le 2026-08-07. Les lignes déjà en base la portent;
 * la retirer de ce que NOUS écrivons ferait deux formes en base pour un seul
 * fait, sans rien gagner — et c'est ce qu'un lecteur écrit après nous lirait
 * comme une différence.
 */
export async function setMemberRhythm(
  memberId: string,
  slots: readonly EatingOccasionSlot[] | null,
) {
  const { data, error } = await supabase.rpc("keel_household_set_member_rhythm", {
    p_member: memberId,
    p_rhythm: slots === null
      ? null
      : slots.map(({ slot, size }) => ({ slot, at: null, size })),
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * POSER LE RÉGIME D'UNE BOUCHE SANS COMPTE.
 *
 * ── LE DÉFAUT QUE CE GESTE FERME ──────────────────────────────────────────
 * La question « comment vous mangez » existait pour le titulaire et pour
 * personne d'autre: les trois jetons vivaient sur `student_safety_constraints`,
 * clée sur `user_id`. Un enfant végétarien était INDÉCLARABLE, et c'est ce que
 * l'utilisateur a vu et redemandé deux fois.
 *
 * `null` efface — la bouche revient à « personne n'a demandé ». `omnivore`,
 * lui, est une RÉPONSE et s'écrit: sans lui, la base ne distinguerait pas
 * quelqu'un qui n'a rien à déclarer de quelqu'un à qui on n'a jamais posé la
 * question, et la différence vaut un plan de viande servi à un végétarien.
 *
 * ⚠️ REFUSE `has_account`, ET L'ÉCRAN DOIT LE SAVOIR AVANT D'APPELER. Le régime
 * d'une bouche qui a un compte vit dans SON « about you », et le roster ne lit
 * pas la colonne pour elle. Afficher les boutons quand même montrerait un
 * contrôle qui échoue à tous les coups — pire qu'un contrôle absent, parce
 * qu'il promet (même règle que l'objectif depuis D1).
 */
export async function setMemberDiet(memberId: string, diet: string | null) {
  const { data, error } = await supabase.rpc("keel_household_set_member_diet", {
    p_member: memberId,
    p_diet: diet,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function removeHouseholdMember(memberId: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_member", {
    p_member: memberId,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * DÉFAIRE LE FOYER — LA SORTIE DE LA BRANCHE « ON EST DEUX ».
 *
 * ⚠️ CE GESTE EXISTE PARCE QUE L'ENTONNOIR ÉTAIT SANS RETOUR. Sa branche se
 * dérive du NOMBRE DE BOUCHES (`api/onboarding.ts`, `max(2, …)`): une fois le
 * foyer créé, elle reste « à deux » même à une seule bouche, l'étape 2 refuse
 * d'avancer sur `missing_mouths`, et la tuile « Juste moi » de l'étape 1 est
 * grisée. Rien ne ramenait au solo — ni ici, ni sur `/app/household`, dont le
 * commentaire du verrou promettait pourtant le geste.
 *
 * ⚠️ LA BASE REFUSE TANT QU'IL RESTE QUELQU'UN (`not_alone`), ET C'EST LÀ QUE
 * VIT LA GARDE. L'écran ne fait que ne pas proposer le bouton: une limite d'UI
 * n'est pas une limite. Pour défaire un foyer peuplé, on retire les bouches une
 * par une, chacune derrière sa confirmation.
 *
 * Motifs nommés: `not_authenticated`, `no_household`, `not_owner`, `not_alone`
 * (avec `others`), `household_has_plans`.
 */
export async function dissolveHousehold() {
  const { data, error } = await supabase.rpc("keel_household_dissolve");
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * MA PLACE DANS UN FOYER — ce que le tunnel de suppression de compte doit
 * savoir AVANT de poser sa question (chantier 2, D3).
 *
 * Trois faits, et pas un de plus: est-ce que j'ai une place, est-ce que je la
 * gouverne, et comment s'appelle la maison. Sans eux, la case « retirer aussi
 * ma place dans ce foyer » s'afficherait pour tout le monde — y compris les
 * comptes sans foyer, à qui elle ne veut rien dire, et le compte maître, à qui
 * la base la refusera (`cannot_remove_owner`).
 *
 * ⚠️ CE N'EST PAS LA GARDE. Elle est en base, dans
 * `keel_household_set_departure`. Ceci ne décide que de ce qu'on AFFICHE — et
 * en cas d'échec de lecture on n'affiche rien plutôt que de deviner.
 */
export async function loadMyHouseholdPlace(userId: string): Promise<
  { inHousehold: boolean; isOwner: boolean; householdName: string | null }
> {
  const none = { inHousehold: false, isOwner: false, householdName: null };
  if (!userId) return none;
  const { data, error } = await supabase
    .from("household_members")
    // ⚠️ LA CLÉ EST NOMMÉE, ET C'EST OBLIGATOIRE. `households(name)` tout court
    // rend PGRST201 « ambiguous embedding »: il existe DEUX relations entre ces
    // deux tables depuis que `households.reference_member_id` pointe sur
    // `household_members` (chantier 1). Mesuré contre la pile locale — et le
    // symptôme aurait été muet, parce que cette fonction retombe sur « pas de
    // foyer » quand la lecture échoue: la case ne se serait jamais affichée.
    .select("role, households!household_members_household_id_fkey(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return none;
  const row = data as Record<string, unknown>;
  const nested = row.households as { name?: unknown } | { name?: unknown }[] | null;
  const named = Array.isArray(nested) ? nested[0] : nested;
  const name = named?.name;
  return {
    inHousehold: true,
    isOwner: String(row.role ?? "") === "owner",
    householdName: name ? String(name) : null,
  };
}

/**
 * RETIRER L'ACCÈS — et ce n'est PAS retirer du foyer (chantier 2, D2).
 *
 * `user_id` repasse à NULL, la ligne RESTE: la personne continue de manger là,
 * avec sa portion, ses allergies et ses contraintes, et `member_id` ne bouge
 * pas. Ce qu'elle perd, c'est la lecture du foyer et le droit de poser SON
 * objectif — pas sa place à table.
 *
 * Les deux gestes vivent côte à côte à l'écran, avec deux libellés, parce
 * qu'un seul bouton « retirer » signifierait deux choses irréversibles
 * différentes selon la ligne. Refus nommés de la base: `not_owner`,
 * `not_a_member`, `cannot_detach_owner`, `not_claimed`.
 */
export async function detachHouseholdMember(memberId: string) {
  const { data, error } = await supabase.rpc("keel_household_detach_member", {
    p_member: memberId,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * DEUX ÉCRIVAINS, UN SEUL CHAMP. Le compte maître pose l'objectif de n'importe
 * quelle bouche; une personne qui a réclamé son profil pose le SIEN, et rien
 * d'autre. La base tranche (`not_your_line`), l'écran ne fait que demander.
 */
export async function setMemberGoal(memberId: string, goal: string | null) {
  const { data, error } = await supabase.rpc("keel_household_set_member_goal", {
    p_member: memberId,
    p_goal: goal,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * ── L'ÉCRIVAIN DU MEMBRE DE RÉFÉRENCE EST PARTI LE 2026-08-14 ─────────────
 *
 * `setReferenceMember` appelait `keel_household_set_reference_member` pour le
 * compte de la carte « quelle façon de manger le plat commun suit ». La carte
 * a été retirée — elle demandait d'arbitrer entre deux méthodes en annonçant
 * que ça changeait « ce qu'on cuisine », sans jamais montrer l'autre version —
 * et la fonction s'est retrouvée sans un seul appelant vivant.
 *
 * ⛔ CE QUI RESTE, ET QUI N'EST PAS TOUCHÉ: la colonne
 * `households.reference_member_id`, la RPC (que la base expose toujours), et
 * la CASCADE de résolution côté moteur — `referenceMemberId()` dans
 * `_shared/keel/household_composition.ts`. Elle est documentée ainsi:
 *
 *     `null` = retour au défaut, LE MEMBRE QUI COMPOSE LA SESSION.
 *
 * Sans écrivain, la colonne reste à NULL et le moteur retombe sur le composeur
 * — le maître, qui est le cas courant et le bon défaut. C'est exactement ce
 * qui rend ce retrait sûr, et `householdReference.int.test.ts` le prouve au
 * lieu de l'affirmer. Le jour où un écran redonne ce choix, il réécrit ce
 * wrapper; il ne réécrit ni la RPC, ni la cascade, qui l'ont attendu.
 */

/** Ce que le maître a saisi du corps d'une bouche. `null` = rien de saisi. */
export interface MemberBodyView {
  memberId: string;
  heightCm: number;
  weightKg: number;
  gender: "male" | "female" | "other";
  /**
   * LE CRAN D'ACTIVITÉ — `null` = personne n'a répondu, et ce n'est PAS un
   * corps incomplet (lot L0, 2026-08-18).
   *
   * ⚠️ IL EST HORS DU TOUT-OU-RIEN, contrairement aux trois au-dessus. La
   * différence est un fait du moteur, pas un choix d'écran: une bouche sans
   * taille est SAUTÉE par `generate-household-meal-v1`, alors qu'une bouche
   * sans cran reçoit l'hypothèse documentée (facteur 1,5) et compose
   * normalement. Exiger le cran ferait donc d'une question à laquelle on a le
   * droit de ne pas répondre un mur devant deux champs qui, eux, sont exigés.
   */
  activityLevel: ActivityLevel | null;
  /**
   * ── LES DEUX AXES (2026-08-20) ─────────────────────────────────────────
   * `null` = pas répondu. `asked` dit si l'écran a DÉJÀ posé les deux
   * questions à cette fiche — sans lui, « pas posé » et « pas répondu »
   * rendraient le même vide, et le compteur du moteur mentirait.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
  activityAxesAsked: boolean;
  /**
   * ── LES TROIS CASES DU REPAS (2026-08-20) ─────────────────────────────
   * ⛔ TRI-ÉTAT. `false` = « non, je n'en prends pas », une réponse qui fait
   * MONTER la part du plat; `null` = pas répondu, et la moyenne 0,42 reprend
   * la main. Une case décochée ne peut pas dire les deux.
   */
  takesDessert: boolean | null;
  takesCheese: boolean | null;
  takesBread: boolean | null;
  mealStructureAsked: boolean;
  /**
   * ⑤ L'APPÉTIT (2026-08-20) — ±10 % sur l'ESTIMATION. `null` = pas répondu.
   *
   * ⛔ TRANSITOIRE: le lot ⑦ (boucle de poids) le remplace pour toute bouche
   * qui a un compte ET une série de pesées. Il ne mourra PAS pour les bouches
   * sans compte — `student_body_measures` est claveté sur `user_id`.
   */
  appetite: AppetiteLevel | null;
  appetiteAsked: boolean;
}

export const MEMBER_GENDERS = ["female", "male", "other"] as const;
export type MemberGender = (typeof MEMBER_GENDERS)[number];

/**
 * LE CRAN D'UNE COLONNE NULLABLE — et ce n'est PAS `parseActivityLevel`.
 *
 * ⚠️ CELUI DE `tokens.ts` LÈVE (`makeParser`, R7: « fail loudly on unknown
 * input »). C'est le bon comportement quand un jeton est REQUIS et qu'un
 * inconnu est un bug d'appelant; c'en est un très mauvais ici, où la colonne
 * est nullable par construction et où `null` est la valeur de TOUTE la base
 * d'avant le 2026-08-18. Le passer directement ferait tomber l'écran de réglage
 * de chaque foyer qui n'a pas encore répondu.
 *
 * Même lecture que `generate-household-meal-v1` fait de la même colonne, mot
 * pour mot: hors vocabulaire ⇒ `null`, jamais un repli sur un cran.
 */
function readActivityLevel(value: unknown): ActivityLevel | null {
  const slug = String(value ?? "").trim();
  return (ACTIVITY_LEVELS as readonly string[]).includes(slug)
    ? (slug as ActivityLevel)
    : null;
}

/**
 * LES CORPS DU FOYER — POUR SON COMPTE MAÎTRE SEUL.
 *
 * ⚠️ CE N'EST PAS UNE LECTURE DE TABLE, ET C'EST TOUT LE POINT.
 * `household_member_bodies` n'a AUCUN grant à `authenticated`: elle est
 * invisible à PostgREST. Sondé avant d'écrire la migration: la policy de
 * lecture de `household_members` est household-wide, donc une colonne `poids`
 * posée là-bas aurait été lisible en clair par tout co-membre ayant un compte —
 * l'adolescent qui a réclamé son profil lisant le poids de sa mère.
 *
 * Un NON-MAÎTRE reçoit zéro ligne, pas une erreur: une erreur dirait déjà
 * qu'il y a quelque chose là.
 */
export async function loadMemberBodies(): Promise<Map<string, MemberBodyView>> {
  const { data, error } = await supabase.rpc("keel_household_member_bodies");
  if (error) throw new Error(error.message);
  const out = new Map<string, MemberBodyView>();
  for (const raw of (data ?? []) as unknown[]) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const memberId = String(r.member_id ?? "").trim();
    // `numeric` arrive en CHAÎNE par PostgREST. Un `typeof === "number"` aurait
    // rendu la carte vide sans que rien n'échoue.
    const heightCm = Number(r.height_cm);
    const weightKg = Number(r.weight_kg);
    const gender = String(r.gender ?? "");
    if (!memberId || !Number.isFinite(heightCm) || !Number.isFinite(weightKg)) continue;
    if (gender !== "male" && gender !== "female" && gender !== "other") continue;
    out.set(memberId, {
      memberId,
      heightCm,
      weightKg,
      gender,
      // ⚠️ HORS VOCABULAIRE ⇒ `null`, JAMAIS UN REPLI SUR UN CRAN. C'est mot
      // pour mot ce que fait `generate-household-meal-v1` sur la même colonne:
      // le repli documenté est l'HYPOTHÈSE (1,5), et choisir un cran à la place
      // de quelqu'un ferait peser une réponse qu'il n'a pas donnée. Une valeur
      // illisible doit rendre l'écran vierge, pas une tuile cochée.
      activityLevel: readActivityLevel(r.activity_level),
      // Même lecture fail-soft que le cran: hors vocabulaire ⇒ `null`, jamais
      // un repli. Une valeur illisible doit rendre l'écran vierge, pas une
      // tuile cochée à la place de quelqu'un.
      dayActivity: (DAY_ACTIVITY_LEVELS as readonly string[])
          .includes(String(r.day_activity ?? "").trim())
        ? (String(r.day_activity).trim() as DayActivityLevel)
        : null,
      sportFrequency: (SPORT_FREQUENCIES as readonly string[])
          .includes(String(r.sport_frequency ?? "").trim())
        ? (String(r.sport_frequency).trim() as SportFrequency)
        : null,
      activityAxesAsked: r.activity_axes_asked === true,
      takesDessert: typeof r.takes_dessert === "boolean" ? r.takes_dessert : null,
      takesCheese: typeof r.takes_cheese === "boolean" ? r.takes_cheese : null,
      takesBread: typeof r.takes_bread === "boolean" ? r.takes_bread : null,
      mealStructureAsked: r.meal_structure_asked === true,
      // Même lecture fail-soft que les crans: hors vocabulaire ⇒ `null`.
      appetite: (APPETITE_LEVELS as readonly string[])
          .includes(String(r.appetite ?? "").trim())
        ? (String(r.appetite).trim() as AppetiteLevel)
        : null,
      appetiteAsked: r.appetite_asked === true,
    });
  }
  return out;
}

/**
 * ENREGISTRER LE CORPS D'UNE BOUCHE — TOUT-OU-RIEN, compte maître seul.
 *
 * Décision humaine du 2026-08-12: taille, poids, âge et sexe sont exigés pour
 * CHAQUE bouche, y compris celles qui n'ont pas de compte. Elle renverse
 * FF-047 §3 et le « cran 2 » du README du foyer, en connaissance de cause.
 *
 * ⚠️ CE QUE CE CORPS FAIT, ET CE QU'IL NE FAIT PAS. Il DIMENSIONNE dans le
 * moteur — le MIN du tronc commun et les add-ons par bouche. Il ne s'affiche
 * nulle part ailleurs qu'ici, n'entre dans aucun prompt pour un mineur, et ne
 * sort dans aucune consigne de service. Collecter et calculer, jamais énoncer.
 *
 * Refus nommés: `not_owner`, `not_a_member`, `body_incomplete`, `bad_height`,
 * `bad_weight`, `bad_gender`, `bad_activity_level`.
 *
 * ⚠️ `activityLevel` EST UN PARAMÈTRE REQUIS, ET C'EST UNE CICATRICE DU DÉPÔT.
 * « Un paramètre de garde optionnel est une garde désarmée » — `safetyBand` a
 * vécu des mois en facultatif sans qu'aucun appelant ne le passe. Ici l'enjeu
 * est le symétrique exact: cette RPC est TOUT-OU-RIEN sur le corps et elle a
 * DEUX écrans appelants. Un paramètre optionnel aurait laissé le second
 * réenregistrer taille/poids/sexe sans le cran — et la base, elle, aurait vu
 * une écriture complète. `null` reste possible; il faut juste l'écrire, donc le
 * compilateur recense qui le passe.
 *
 * (Côté base, `null` veut dire « ne touche pas à ce qui est déjà écrit »: voir
 * le `coalesce` de `20260818160000`. La ceinture est des deux côtés parce que
 * c'est le troisième appelant, celui qui n'existe pas encore, qui casse.)
 */
export async function setMemberBody(
  memberId: string,
  heightCm: number,
  weightKg: number,
  gender: MemberGender,
  activityLevel: ActivityLevel | null,
  /**
   * ── LES DEUX AXES ET LES TROIS CASES (2026-08-20), EN UN SEUL OBJET ────
   *
   * ⚠️ REQUIS, comme `activityLevel` au-dessus et pour la MÊME cicatrice: deux
   * écrans appellent cette porte, et un paramètre facultatif aurait laissé le
   * second enregistrer un corps complet en effaçant — ou en n'écrivant jamais —
   * ce que le premier avait collecté.
   *
   * ⛔ `axesAsked` / `structureAsked` NE SONT PAS DÉCORATIFS: c'est EUX que la
   * base lit pour décider d'écrire. Un écran qui ne porte pas les questions
   * passe `false` et ne touche à rien; un écran qui les porte passe `true` et
   * écrit ce qu'il a, `null` compris — c'est la seule façon de dé-répondre.
   */
  extras: {
    dayActivity: DayActivityLevel | null;
    sportFrequency: SportFrequency | null;
    axesAsked: boolean;
    takesDessert: boolean | null;
    takesCheese: boolean | null;
    takesBread: boolean | null;
    structureAsked: boolean;
    /** ⑤ (2026-08-20). `null` = pas répondu ⇒ ×1,00, un neutre vrai. */
    appetite: AppetiteLevel | null;
    appetiteAsked: boolean;
  },
) {
  const { data, error } = await supabase.rpc("keel_household_set_member_body", {
    p_member: memberId,
    p_height_cm: heightCm,
    p_weight_kg: weightKg,
    p_gender: gender,
    p_activity_level: activityLevel,
    p_day_activity: extras.dayActivity,
    p_sport_frequency: extras.sportFrequency,
    p_activity_axes_asked: extras.axesAsked,
    p_takes_dessert: extras.takesDessert,
    p_takes_cheese: extras.takesCheese,
    p_takes_bread: extras.takesBread,
    p_meal_structure_asked: extras.structureAsked,
    p_appetite: extras.appetite,
    p_appetite_asked: extras.appetiteAsked,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS — LECTURE, POUR SON MAÎTRE SEUL.
 *
 * ⚠️ CE N'EST PAS UNE LECTURE DE TABLE. `household_traditions` n'a AUCUN
 * privilège à `anon` ni `authenticated`, et RLS y est armée sans policy
 * (`20260820161000`) — parce que les privilèges par défaut de Supabase les
 * avaient tous donnés, TRUNCATE compris, et que TRUNCATE échappe à RLS.
 *
 * Un NON-MAÎTRE reçoit zéro ligne, pas une erreur: une erreur dirait déjà
 * qu'il y a quelque chose là.
 */
export async function loadTraditions(): Promise<HouseholdTradition[]> {
  const { data, error } = await supabase.rpc("keel_household_traditions");
  if (error) throw new Error(error.message);
  // ⛔ LE MÊME PARSEUR QUE LE MOTEUR, pas une seconde lecture. Un écran qui
  // accepterait un jeton que le serveur refuse afficherait une tradition qui
  // n'agit sur rien.
  return parseTraditions(data ?? []);
}

/**
 * ③ POSER OU REMPLACER LA TRADITION D'UNE CASE. Compte maître seul.
 *
 * Refus nommés: `not_owner`, `bad_weekday`, `bad_slot`, `empty_label`,
 * `label_too_long`, `too_many_traditions`.
 */
export async function setTradition(
  weekday: string,
  slot: string,
  label: string,
) {
  const { data, error } = await supabase.rpc("keel_household_set_tradition", {
    p_weekday: weekday,
    p_slot: slot,
    p_label: label,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * ③ RETIRER LA TRADITION D'UNE CASE.
 *
 * ⛔ ELLE EST OBLIGATOIRE, ET PAS UN CONFORT. Une tradition sans porte de
 * retrait est une tradition qu'on ne peut pas avoir posée par erreur: le foyer
 * qui a tapé « poisson » un vendredi où il n'en mange plus verrouillerait ce
 * vendredi pour toujours.
 */
export async function removeTradition(weekday: string, slot: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_tradition", {
    p_weekday: weekday,
    p_slot: slot,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * MARQUER QUAND QUELQU'UN N'EST PAS LÀ (D14, 2026-08-12).
 *
 * ⚠️ CE N'EST PAS LE JUMEAU DE `setMemberGoal`, ET LA DIFFÉRENCE EST LE
 * PRODUIT. La base REFUSE de poser l'objectif d'une bouche qui a un compte
 * (`has_account`), et elle ACCEPTE de marquer son absence: un objectif est une
 * opinion, dont il n'y a qu'un porteur légitime; une absence est un fait, que
 * deux personnes peuvent connaître. Le maître qui sait que sa fille part en
 * camp doit pouvoir le dire même si elle a oublié.
 *
 * Ce que la personne a déclaré de son côté n'est PAS écrasé: le roster rend
 * l'union des deux. D'où `member.awayHousehold` en entrée de la grille, jamais
 * l'union — voir `HouseholdMemberView`.
 *
 * @param away la liste COMPLÈTE à écrire, jours hors fenêtre compris. La grille
 *        s'en charge (`MealPickerGrid` refusionne), parce qu'écraser avec ce
 *        qu'elle montre effacerait « jeudi midi » parce qu'on a composé un
 *        week-end.
 *
 * ⛔ `AwayMark[]` ET PLUS `AwayDay[]` — L'AUTRE MOITIÉ DU DÉFAUT P1. La porte
 * SQL écrit `p_away` TEL QUEL (jeton compris, `20260818120000`), donc ce qui
 * arrive ici part en base: c'est le dernier endroit où « dehors » pouvait être
 * reconstruit en « absent » sans qu'aucune ligne ne proteste. Exiger la marque
 * fait échouer la compilation d'un appelant qui recomposerait la liste à plat.
 */
export async function setMemberAway(memberId: string, away: readonly AwayMark[]) {
  const { data, error } = await supabase.rpc("keel_household_set_member_away", {
    p_member: memberId,
    p_away: away,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LE RYTHME DU FOYER — celui du compte maître, comme tout ce qui gouverne la
 * composition (`generate-household-meal-v1` lit SA ligne `student_goals`).
 *
 * Sert les LIGNES de la grille de présence. Sans lui, la grille afficherait
 * trois repas par défaut à un foyer qui en déclare cinq, et le maître ne
 * pourrait marquer une absence que sur les moments qu'on aurait devinés.
 *
 * ⚠️ LE REPLI EST CELUI DU MOTEUR, pas une liste de confort. `buildMealPrompt`
 * retombe sur `DEFAULT_EATING_RHYTHM` quand rien n'est déclaré: une grille qui
 * n'afficherait rien dans ce cas — le cas le plus fréquent, un maître qui n'a
 * jamais rempli sa carte de rythme — rendrait la fonctionnalité inatteignable.
 */
export async function loadHouseholdRhythm(
  ownerUserId: string,
): Promise<EatingOccasionSlot[]> {
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const pc = (data as Record<string, unknown> | null)?.practical_constraints;
  const rhythm = parseEatingRhythm(
    (pc as Record<string, unknown> | null)?.eating_rhythm,
  );
  return rhythm.length > 0 ? rhythm : [...DEFAULT_EATING_RHYTHM];
}

/**
 * LE PRÉNOM SE CORRIGE — et ce n'est pas cosmétique.
 *
 * `household_turn_context.ts` filtre en silence toute portion dont le prénom
 * est vide, et le brief de portions le cite tel quel. `keel_household_create`
 * retombe sur « Me » quand `profiles.full_name` est vide: sans cette porte, le
 * compte maître part au modèle sous le nom « Me », définitivement.
 */
export async function setMemberName(memberId: string, firstName: string) {
  const { data, error } = await supabase.rpc("keel_household_set_member_name", {
    p_member: memberId,
    p_first_name: firstName,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LA DATE DE NAISSANCE — séparée du prénom, et l'appelant doit le savoir.
 *
 * ⚠️ LE ROSTER NE REND JAMAIS LA DATE (le foyer doit savoir qu'il y a un enfant
 * à table, pas son âge exact). Un écran ne peut donc pas la préremplir, et une
 * RPC qui prendrait prénom+date recevrait `null` à chaque correction de prénom
 * — c'est-à-dire EFFACERAIT la date sans que personne ne l'ait demandé. D'où
 * deux portes, une par champ.
 *
 * `null` est légitime côté base (« je retire la date que j'avais mise ») et
 * remet l'âge à `unknown`, donc RETIRE la direction d'objectif.
 */
export async function setMemberBirthDate(memberId: string, birthDate: string | null) {
  const { data, error } = await supabase.rpc("keel_household_set_member_birth_date", {
    p_member: memberId,
    p_birth_date: birthDate,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * MA DATE À MOI — `profiles.birth_date`, la même colonne que « about you ».
 *
 * ── POURQUOI UNE SECONDE PORTE, ET PAS `setMemberBirthDate` (D18, L9) ──────
 *
 * Depuis 20260812180000, l'âge d'une bouche QUI A UN COMPTE se résout sur
 * `profiles.birth_date` d'abord, et seulement à défaut sur la date de sa fiche
 * de foyer. Écrire ma propre date sur ma FICHE la rendrait donc muette dès que
 * mon profil en porte une — le champ aurait l'air de marcher et ne changerait
 * rien à mon assiette. C'est le défaut exact que ce chantier passe son temps à
 * réparer, et il se referme en écrivant au bon endroit.
 *
 * Bénéfice second, et il n'est pas accessoire: la même date sert la lane
 * INDIVIDUELLE (`student_body_io.ts` lit `profiles.birth_date`). Une date
 * saisie ici active l'objectif au foyer ET dimensionne le plan personnel.
 *
 * ⚠️ RÉSERVÉ À SA PROPRE LIGNE. RLS (`rls_profiles_update_self`) refuse le
 * profil d'autrui — l'appeler pour quelqu'un d'autre ne lèverait pas, il
 * mettrait à jour ZÉRO ligne et rendrait 204 en silence. D'où le `.select()`
 * derrière et le refus nommé quand rien n'a bougé (cicatrice `RLS ne remplace
 * pas un .eq(user_id)`).
 *
 * ⚠️ LA VALIDATION EST ICI PARCE QU'IL N'Y A PAS DE CHECK EN BASE. Vérifié le
 * 2026-08-12: `profiles` porte neuf contraintes CHECK, AUCUNE sur cette
 * colonne. La RPC de foyer, elle, refuse `bad_birth_date` — écrire en direct
 * sans garde échangerait donc un refus lisible contre une date future acceptée
 * en silence, que `keel_age_state` traduirait ensuite en `unknown`. La personne
 * verrait « enregistré » et perdrait sa direction d'objectif.
 *
 * LA RÈGLE N'EST PAS RÉÉCRITE ICI. `assessBirthDate` + `birthDateWritable`
 * (`_shared/keel/student_age.ts`) sont LA garde d'écriture du produit, déjà
 * testées, et déjà celle de la lane individuelle. Une seconde arithmétique de
 * bornes au navigateur divergerait au premier ajustement, et personne ne
 * saurait laquelle ment.
 */
export async function setOwnBirthDate(userId: string, birthDate: string | null) {
  if (birthDate !== null) {
    const verdict = assessBirthDate(birthDate, new Date().toISOString().slice(0, 10));
    // `absent` ne peut pas sortir d'ici (on a testé `!== null`), et un MINEUR
    // s'enregistre — c'est justement ce qu'on veut savoir. Seuls
    // `unreadable | future | implausible` sont refusés.
    if (!birthDateWritable(verdict).ok) {
      return { ok: false, reason: "bad_birth_date" };
    }
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({ birth_date: birthDate })
    .eq("id", userId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { ok: false, reason: "not_your_line" };
  return { ok: true, reason: "" };
}

/**
 * INVITER QUELQU'UN À RÉCLAMER UNE BOUCHE PRÉCISE (lot 6).
 *
 * ⚠️ `memberId` N'EST PAS UN CONFORT D'AFFICHAGE. L'invitation porte sa cible
 * parce que sinon la personne qui arrive CHOISIRAIT quelle bouche elle devient
 * — et un lien qui fuite deviendrait le droit de se déclarer n'importe qui du
 * foyer. La base l'exige (`keel_household_invite(text, uuid)`), l'écran demande
 * donc « qui invites-tu ? » avant de créer le lien.
 *
 * La réponse porte `first_name`: le maître invite plusieurs personnes dans la
 * même minute, et un jeton anonyme est un jeton envoyé à la mauvaise personne.
 */
/** Une invitation VIVANTE, telle que la ligne d'une bouche la rend. */
export interface LiveInvitation {
  memberId: string;
  email: string;
  /** ISO. La ligne dit « invitation envoyée le … ». */
  createdAt: string;
  expiresAt: string;
}

/**
 * LES INVITATIONS VIVANTES DU FOYER — A5 (§5.5), 2026-09-03.
 *
 * ⛔ JAMAIS `token_hash` DANS LA PROJECTION, et ce n'est pas une précaution de
 * style. Le jeton n'est rendu en clair QU'UNE FOIS, par la RPC qui le crée; la
 * colonne ne porte que son empreinte. La demander ici la ferait traverser le
 * réseau et vivre dans l'état d'un écran pour ne RIEN afficher — un secret
 * transporté sans usage est un secret de plus à perdre.
 *
 * ⚠️ VIVANTE = NON CONSOMMÉE ET NON EXPIRÉE. Une invitation consommée est un
 * accès (la ligne porte alors un `user_id`, et l'écran le dit autrement); une
 * invitation expirée n'ouvre plus rien, et la proposer comme « envoyée le … »
 * ferait attendre quelqu'un devant un lien mort. ⚠️ Les expirées ne sont
 * JAMAIS purgées (trou n°11, connu et non réparé ici): elles restent en base
 * avec l'adresse d'un tiers, et ce filtre est ce qui les tient hors de l'écran.
 *
 * ⚠️ SCOPÉE `.eq("household_id")`, MÊME AVEC RLS. La policy est household-wide
 * (`household_invitations_member_read`), donc un profil réclamé lit déjà les
 * adresses invitées des AUTRES bouches — c'est l'état d'aujourd'hui, nommé, pas
 * élargi. Le filtre explicite reste la cicatrice
 * `rls-is-not-a-substitute-for-eq-user-id`: une policy qui change en silence
 * ne doit pas transformer cette lecture en lecture de tout le monde.
 */
export async function loadLiveInvitations(
  householdId: string,
): Promise<Map<string, LiveInvitation>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("household_invitations")
    .select("member_id, email, created_at, expires_at, consumed_at")
    .eq("household_id", householdId)
    .is("consumed_at", null)
    .gt("expires_at", nowIso);
  if (error) throw new Error(`[keel/api] loadLiveInvitations: ${error.message}`);
  const out = new Map<string, LiveInvitation>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const memberId = String(row.member_id ?? "");
    if (memberId === "") continue;
    const created = String(row.created_at ?? "");
    const previous = out.get(memberId);
    // LA PLUS RÉCENTE GAGNE. « Renvoyer » crée un NOUVEAU jeton sans révoquer
    // l'ancien (la révocation n'existe pas, D5.9): deux lignes vivantes pour la
    // même bouche sont donc l'état normal après un renvoi, et la ligne doit
    // dire la DERNIÈRE date — celle du lien que le maître vient d'envoyer.
    if (previous !== undefined && previous.createdAt >= created) continue;
    out.set(memberId, {
      memberId,
      email: String(row.email ?? ""),
      createdAt: created,
      expiresAt: String(row.expires_at ?? ""),
    });
  }
  return out;
}

export async function inviteToHousehold(email: string, memberId: string) {
  const { data, error } = await supabase.rpc("keel_household_invite", {
    p_email: email,
    p_member: memberId,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * CE QU'UN LIEN DIT AVANT TOUTE AUTHENTIFICATION.
 *
 * La personne qui ouvre le lien n'a le plus souvent aucun compte: elle ne peut
 * RIEN lire du foyer (toutes les policies passent par `keel_household_of`).
 * Sans cet aperçu, l'écran de réclamation demanderait de se connecter pour une
 * raison qu'il ne saurait pas nommer — et la personne devinerait l'adresse à
 * employer, alors que se tromper d'adresse coûte un compte inutile.
 *
 * Trois champs, et rien d'autre: le foyer, le prénom de la bouche, l'adresse
 * invitée. Tous déjà entre les mains de qui détient le lien.
 */
export interface HouseholdInvitationPreview {
  valid: boolean;
  reason: string;
  householdName: string;
  firstName: string;
  email: string;
}

export async function previewHouseholdInvitation(
  token: string,
): Promise<HouseholdInvitationPreview> {
  const { data, error } = await supabase.rpc("keel_household_preview_invitation", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    valid: row.valid === true,
    reason: String(row.reason ?? ""),
    householdName: String(row.household_name ?? ""),
    firstName: String(row.first_name ?? ""),
    email: String(row.email ?? ""),
  };
}

/**
 * RÉCLAMER SON PROFIL — attacher son compte à une ligne qui existe déjà.
 *
 * ⚠️ CE N'EST PLUS « rejoindre » au sens d'entrer dans le produit. `member_id`
 * ne change pas, `user_id` passe de NULL à une valeur, et les portions, les
 * contraintes, les allergies et l'objectif de cette bouche lui restent. Le
 * prénom saisi par le maître n'est PAS écrasé par `profiles.full_name`.
 *
 * Ce que la réclamation donne: lire le foyer, et poser SON objectif. Rien
 * d'autre — composer, ajouter, retirer et restreindre restent au compte maître,
 * et la base rend `not_owner` à qui essaie.
 *
 * ⚠️ LE PAYS EST UN PARAMÈTRE OBLIGATOIRE depuis le chantier 4, et la 1-arité
 * a été DROPPÉE en base: un paramètre de garde optionnel est une garde
 * désarmée, et deux arités seraient deux portes dont une n'exige rien.
 *
 * `country` peut être la chaîne vide QUAND le compte a déjà un pays déclaré —
 * c'est la base qui tranche (`country_required`), pas cet appelant, parce que
 * `profiles.country` peut avoir été posé par une autre porte entre-temps. Un
 * pays déjà déclaré n'est JAMAIS écrasé par celui qu'on passe ici.
 */
export async function joinHousehold(token: string, country: string) {
  const { data, error } = await supabase.rpc("keel_household_join", {
    p_token: token,
    p_country: country,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function addRestriction(memberId: string, label: string) {
  const { data, error } = await supabase.rpc("keel_household_add_restriction", {
    p_member: memberId,
    p_label: label,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function removeRestriction(id: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_restriction", { p_id: id });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LES ALLERGIES DU FOYER — la table que le lot 4 ajoute, et le trou qu'elle
 * ferme.
 *
 * `student_safety_constraints` est clée sur `user_id`: une bouche sans compte
 * n'avait nulle part où porter son allergie, alors que l'écran la réclamait.
 * Ces lignes-ci rejoignent l'union de sécurité du générateur avec le MÊME
 * fail-closed — lecture impossible, aucune composition.
 */
export async function loadAllergies(): Promise<AllergyView[]> {
  const { data, error } = await supabase
    .from("household_member_allergies")
    .select("id, member_id, label, created_by");
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      memberId: String(r.member_id),
      label: String(r.label ?? ""),
      // `null` quand le compte de l'auteur a été effacé. `String(null)` rendrait
      // la chaîne « null », qui ne vaut aucun `userId` mais n'est pas non plus
      // une absence — et l'écran ne saurait plus laquelle des deux il lit.
      createdByUserId: r.created_by == null ? null : String(r.created_by),
    };
  });
}

export async function addAllergy(memberId: string, label: string) {
  const { data, error } = await supabase.rpc("keel_household_add_allergy", {
    p_member: memberId,
    p_label: label,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function removeAllergy(id: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_allergy", { p_id: id });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LA FALAISE QUE LE LOT 4 SUPPRIME.
 *
 * `generate-household-meal-v1` refuse de démarrer si le compte maître n'a pas
 * de ligne `student_goals` (`goal_required`, 409) — et jusqu'ici on se prenait
 * ce mur APRÈS avoir saisi trois personnes. Cette ligne ne dimensionne aucune
 * portion: elle porte la SITUATION, les contraintes pratiques et la langue,
 * c'est-à-dire ce qui gouverne la composition entière.
 *
 * @returns `true` si la ligne existe déjà.
 */
export async function hasOwnerGoalRow(userId: string): Promise<boolean> {
  // `.eq("user_id", …)` EXPLICITE, et pas seulement RLS: quelqu'un qui est à la
  // fois coach et mangeur lit aussi les lignes de ses élèves
  // (`student_goals_select_coach`), et une lecture non scopée lui rendrait la
  // ligne de l'un d'eux. Le dépôt a déjà payé ce défaut sur cette table.
  const { data, error } = await supabase
    .from("student_goals")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Écrit la ligne `student_goals` du compte maître SI ELLE N'EXISTE PAS.
 *
 * ⚠️ `ignoreDuplicates` N'EST PAS UNE PRÉCAUTION DE CONFORT. La table porte des
 * CHECK croisés (`target_weight_kg` n'est légal que sur trois objectifs,
 * `focus_axis` que sur deux): écraser `goal` sur une ligne existante ferait
 * échouer l'écriture chez exactement les gens qui ont déjà rempli une cible —
 * et personne ne l'aurait demandé depuis cet écran. Changer son objectif se
 * fait là où vivent ses cibles, sur `/app/plan`.
 *
 * @returns `true` si une ligne a VRAIMENT été écrite.
 */
export async function createOwnerGoalRow(userId: string, goal: MemberGoal): Promise<boolean> {
  const { data, error } = await supabase
    .from("student_goals")
    .upsert({
      user_id: userId,
      goal,
      // La langue DÉCLARÉE de l'app authentifiée (voir i18n/catalog.ts: la
      // vitrine est bilingue, le produit connecté est en anglais). Même valeur
      // que l'autre écrivain de cette colonne, `StudentWeekPlanPage`.
      content_locale: "en-GB",
    }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("user_id");
  if (error) throw new Error(error.message);
  return Boolean(data && data.length > 0);
}

/**
 * LA LIGNE D'ENVIES DE LA SEMAINE. Compte maître uniquement — la RPC refuse
 * tout autre membre par `not_owner`, et c'est la base qui le dit, pas l'écran.
 *
 * `weekStart` est recalée sur le lundi ISO PAR LA BASE. On la passe quand même
 * déjà normalisée (voir `HouseholdPage`) parce que la relecture, elle, filtre
 * en SQL: envoyer un mardi à l'écriture et relire un lundi rendrait « rien
 * écrit » juste après avoir écrit.
 */
export async function submitEnvy(weekStart: string, body: string) {
  const { data, error } = await supabase.rpc("keel_household_submit_envy", {
    p_week_start: weekStart,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * @param weekStart LUNDI ISO de la semaine. Une autre date rend `null` — la
 *        table n'ancre que des lundis depuis le lot 5.
 * @returns la phrase du maître, ou `null` s'il n'a rien écrit cette semaine.
 *          `null` est un état NORMAL, jamais une attente: la composition sort
 *          quand même, depuis les profils seuls.
 */
export async function loadEnvyLine(weekStart: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("household_envy_submissions")
    .select("body")
    .eq("week_start", weekStart)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  const body = String(row?.body ?? "").trim();
  return body ? body : null;
}

export interface HouseholdMealResult {
  ok: boolean;
  mealId: string | null;
  issues: string[];
}

/**
 * LE MOTIF NOMMÉ D'UN REFUS DE FONCTION EDGE, quand il y en a un.
 *
 * ⚠️ `supabase.functions.invoke` NE REND PAS LE CORPS d'une réponse non-2xx:
 * `error.message` vaut « Edge Function returned a non-2xx status code », et
 * c'est tout. Un refus soigneusement nommé côté serveur (`household_frozen`,
 * `goal_required`, `no_coach`…) arrive donc à l'écran comme une panne
 * générique — après quoi l'utilisateur ouvre un ticket au lieu de faire le
 * geste qu'on attend de lui.
 *
 * `FunctionsHttpError` porte la `Response` dans `context`. On la lit, une
 * fois, et on rend le jeton. `null` quand il n'y a rien à lire: on ne
 * fabrique pas un motif à partir d'une panne réelle.
 *
 * ⚠️ EXPORTÉE POUR `householdMerge.ts` (L8), et pas recopiée là-bas: les
 * gestes de fusion et de défusion passent par la MÊME fonction edge que la
 * composition, donc par les mêmes refus nommés. Une seconde lecture du corps
 * aurait divergé le jour où la forme de la réponse bouge, et la divergence
 * aurait été muette — on afficherait « non-2xx » à la place d'un refus qui a
 * un nom.
 *
 * ⚠️ ET C'EST EXACTEMENT CE QUI ÉTAIT ARRIVÉ, une porte plus loin:
 * `mealGeneration.ts` avait SON lecteur, et les deux ignoraient le 401 dont le
 * corps ne porte pas de clé `error` — le cas de la session périmée. La lecture
 * du corps vit maintenant une seule fois, dans `api/edgeErrors.ts`; cette
 * fonction-ci n'en garde que la FORME (un jeton, ou rien), celle qu'attendent
 * ses appelants.
 */
export async function namedEdgeRefusal(error: unknown): Promise<string | null> {
  return (await readEdgeRefusal(error))?.token ?? null;
}

export async function generateHouseholdMeal(args: {
  /**
   * ⚠️ LA TROISIÈME FORME EXISTAIT EN BASE ET PAS ICI. La fonction edge accepte
   * `{kind:'exact', starts_on, duration_days}` depuis toujours (son refus le
   * dit mot pour mot), et ce type-ci la refusait: aucun écran du foyer ne
   * pouvait donc CHOISIR ses dates — ni l'entrée, ni la page du foyer. Un
   * contrat client plus étroit que le serveur est une fonctionnalité qu'on
   * croit absente alors qu'elle est livrée.
   */
  window:
    | { kind: "until_sunday" }
    | { kind: "days"; count: number }
    | { kind: "exact"; startsOn: string; durationDays: number };
  /**
   * ── `draft` — LE TROISIÈME, ET IL N'ÉCRIT RIEN ──────────────────────────
   * Toutes les gardes AMONT s'appliquent à l'identique; le SEUL saut est
   * l'écriture. Ni plan, ni `member_portions`, ni quota de fusion consommé.
   *
   * ⚠️ `replaces` EST REFUSÉ AVEC `draft` (`unknown_intent`): un aperçu ne
   * remplace rien, puisqu'il n'écrit rien.
   */
  intent?: "replace_current" | "prepare_next" | "draft";
  replaces?: string | null;
  context?: string | null;
  /**
   * ── LOT B · LE MODE DE CUISSON DEMANDÉ ─────────────────────────────────
   * `null` = rien n'est demandé, et le calcul du moteur gouverne seul —
   * exactement comme avant ce lot, pour tout appelant qui ne passe pas ce
   * champ.
   *
   * ⚠️ C'EST UN PLAFOND, PAS UN ORDRE. Le serveur (`capCookingShape`) peut
   * refuser un second plat sur ce jeton; il n'en fabrique jamais un. Et quand
   * le plafond mord, le plan le DIT (`rationale`).
   *
   * ⚠️ IL NE S'ÉCRIT NULLE PART. Il voyage avec LA DEMANDE, comme le budget
   * depuis le 2026-08-13: une colonne s'appliquerait en silence à toutes les
   * semaines suivantes, y compris celle où on reçoit du monde.
   */
  cookingShape?: CookingShape | null;
  /**
   * ── L'ENVIE TAPÉE POUR CES REPAS-LÀ (LOT D, 2026-08-19) ────────────────
   *
   * ⚠️ ELLE MANQUAIT ICI, ET C'ÉTAIT LE DÉFAUT. `MealBuilder` rend le champ
   * « ce dont ils ont envie pour ces repas » SANS garde de lane: un maître de
   * foyer le voit, le remplit — et la branche foyer du submit ne le
   * transmettait pas, parce que cette signature ne l'acceptait pas. Le serveur,
   * lui, le lit depuis toujours: `body.preferences` est relu TROIS fois dans
   * `generate-household-meal-v1` (le prompt `:3582`, le compte-rendu FF-061
   * `:4569`, la colonne écrite `:4976`) et valait `null` sur les trois.
   *
   * ⛔ LA JUSTIFICATION ÉCRITE EN FACE ÉTAIT FAUSSE, ET C'EST MESURÉ. Le
   * commentaire de `api/planDraft.ts` disait que le corps étroit de la lane
   * foyer « est le contrat » et qu'envoyer les champs de la lane individuelle
   * « ne les ferait pas lire ». Pour `preferences`, le serveur les lit. Un
   * commentaire qui explique une absence est une affirmation à vérifier.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — même arbitrage que
   * `ComposeDraftInput.cookingShape`, et pour la cicatrice que ce dépôt paie en
   * boucle: un `?` ici aurait laissé passer un appelant qui l'oublie sans un
   * mot du compilateur, c'est-à-dire exactement le défaut qu'on ferme.
   *
   * `null` = rien n'a été tapé. Le serveur le lit comme « aucune envie », et
   * `buildMealPrompt` n'écrit alors AUCUNE ligne: le prompt d'un foyer sans
   * envie reste byte-identique à celui d'hier.
   */
  preferences: string | null;
  /**
   * « TOUT DANS UNE SESSION DE CUISINE » — 2026-09-01.
   *
   * ⚠️ REQUIS, jamais `?`. Même arbitrage que `preferences` juste au-dessus, et
   * pour la cicatrice qui y est écrite noir sur blanc: un `?` aurait laissé
   * passer sans un mot l'appelant qui l'oublie, et l'option serait construite,
   * testée, visible à l'écran — et jamais transmise.
   *
   * ⛔ IL NE S'ÉCRIT NULLE PART. Il voyage avec LA DEMANDE, comme le mode de
   * cuisson et le budget: « cette semaine-ci, je cuisine une seule fois » est un
   * arbitrage de semaine.
   */
  oneCookingSession: boolean;
  /**
   * « JE CUISINE LA VEILLE » — 2026-09-01.
   *
   * ⚠️ REQUIS, jamais `?`. Même arbitrage que `oneCookingSession` juste
   * au-dessus: un champ facultatif n'aurait fait remonter AUCUN appelant au
   * compilateur, et la case serait construite sans être transmise.
   *
   * ⛔ LE SERVEUR TRANCHE LA FAISABILITÉ (`withCookDayBefore`), et il le DIT
   * quand il refuse. L'écran pose la même porte pour ne pas PROPOSER un geste
   * qui sera refusé — le corps de la requête est écrit par le réseau, pas par
   * l'écran.
   */
  cookTheDayBefore: boolean;
}): Promise<HouseholdMealResult> {
  const { data, error } = await supabase.functions.invoke("generate-household-meal-v1", {
    body: {
      // LA FORME `exact` SE SÉRIALISE EN `snake_case`, comme sur la lane
      // individuelle: c'est le contrat de la fonction edge, et le client ne le
      // réécrit pas.
      window: args.window.kind === "exact"
        ? {
          kind: "exact",
          starts_on: args.window.startsOn,
          duration_days: args.window.durationDays,
        }
        : args.window,
      intent: args.intent ?? "replace_current",
      replaces: args.replaces ?? null,
      context: args.context ?? null,
      // `snake_case`, comme tout le reste de ce corps: c'est le contrat de la
      // fonction edge, et le client ne le réécrit pas. `null` traverse tel
      // quel — le serveur lit `null` comme « rien n'a été demandé ».
      cooking_shape: args.cookingShape ?? null,
      // L'ENVIE. Même nom que sur la lane individuelle (`preferences`), parce
      // que c'est le nom que le SERVEUR lit — les deux lanes traversent
      // `buildMealPrompt`, et un alias ici aurait fabriqué un champ que la
      // fonction edge ignore poliment.
      preferences: args.preferences,
      // ⚠️ LE NOM DU SERVEUR. `generate-household-meal-v1` lit
      // `body.one_cooking_session === true`; une autre orthographe ici serait
      // une case cochée qui ne part nulle part, et rien ne le dirait.
      one_cooking_session: args.oneCookingSession,
      cook_the_day_before: args.cookTheDayBefore,
    },
  });
  if (error) throw new Error(await namedEdgeRefusal(error) ?? error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  // `household.spoken` / `household.silent` ne sont plus rendus par la fonction
  // edge (lot 5). On ne les lit plus non plus: garder un lecteur tolérant
  // laisserait croire que le champ peut revenir.
  return {
    ok: row.ok === true,
    mealId: ((row.meal ?? null) as Record<string, unknown> | null)?.id as string ?? null,
    issues: Array.isArray(row.issues) ? row.issues.map(String) : [],
  };
}

/**
 * ⚠️ LE TYPE A DÉMÉNAGÉ DANS `api/mealGeneration.ts` (LOT 3), ET IL EST
 * RÉEXPORTÉ ICI POUR SES IMPORTATEURS. `member_portions` est une COLONNE de
 * `student_generated_meals`, au même titre que `dishes`: depuis que la vue jour
 * du plan la lit elle aussi, la garder ici en aurait fait DEUX lecteurs du même
 * JSON — et deux lecteurs divergent au premier champ ajouté (`uses` est arrivé
 * après des compositions déjà en base, et c'est le lecteur qu'on regarde le
 * moins qui garde l'ancien comportement).
 */
export { type MemberPortionView } from "./mealGeneration";

/**
 * UN PLAT DU PLAN DU FOYER, RÉDUIT À CE QUI SE DIT À TABLE (L8, D9).
 *
 * ⚠️ NI `why` NI `ingredients`. Le « pourquoi » d'un plat est écrit pour la
 * personne qu'il sert et le plan du foyer est lu à voix haute par tout le
 * foyer: c'est la même famille de risque que L4 refuse d'envoyer au prompt de
 * fusion, et que la garde de non-divulgation de L6 tient à l'entrée. Un écran
 * qui l'affiche annule les deux.
 *
 * Le titre, le jour et le moment suffisent à « ce que la maison cuisine ».
 */
export interface HouseholdDishView {
  title: string;
  day: string | null;
  slot: string | null;
  /**
   * LES PRÉPARATIONS DANS LESQUELLES CE PLAT PUISE — DES `id`, ET RIEN D'AUTRE.
   *
   * ⚠️ CE CHAMP EST L'EXCEPTION À LA RÈGLE DU DESSUS, ET IL FAUT DIRE POURQUOI.
   * `why` et `ingredients` sont écartés parce qu'ils PORTENT DU TEXTE écrit
   * pour une personne, lu à voix haute par tout le foyer. Un `preparation_id`
   * ne porte aucun texte: c'est un slug de lot (`prep_chicken_bowls`), le même
   * pour tout le monde, et il ne dit rien de personne.
   *
   * ── CE QU'IL REND POSSIBLE, ET QUI N'EXISTAIT NULLE PART ─────────────────
   * La JOINTURE PLAT → PART. `member_portions[].preparation_shares[]` est
   * indexé par `preparation_id`, donc sans ce champ la part de chacun ne peut
   * pas être posée à côté du plat qu'elle sert — c'est exactement ce que « à
   * table » ratait en récitant les parts loin du plat, et c'est ce que
   * `PlanByPerson` corrige.
   *
   * Vide = le plat se fait de zéro, donc aucune part de lot ne le concerne et
   * la ligne de chaque bouche est la même.
   */
  uses: string[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C — LA BOUCHE À QUI CE PLAT EST DÉDIÉ. `null` = le plat de la table.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE TROU QUE CE CHAMP FERME, MESURÉ LE 2026-08-14. Un plat en base ne
   * portait AUCUNE attribution: le seul marqueur que le petit-déjeuner dédié
   * était celui de Zoé était « for Zoe » écrit dans son TITRE par le modèle. La
   * vue par personne l'affichait donc aussi dans la semaine de Kid.
   *
   * ⚠️ C'EST UN `member_id`, PAS UN TEXTE, et il n'y a AUCUNE lecture de titre
   * nulle part sur ce chemin. « Jamais de matcher maison » est une cicatrice
   * mesurée (12 faux positifs sur 12), et ici un matcher se tromperait dès
   * « Chicken for Zoe and Marc » et ne trouverait rien dès que le plan sort en
   * français.
   *
   * ⚠️ LECTURE DÉFENSIVE, MÊME CICATRICE QUE `uses` JUSTE AU-DESSUS. La clé est
   * arrivée après des compositions déjà en base: son absence se lit `null`,
   * c'est-à-dire « le plat de la table » — ce que ces plans-là étaient déjà pour
   * tout le monde.
   */
  memberId: string | null;
}

export interface HouseholdMealView {
  mealId: string;
  startsOn: string;
  durationDays: number;
  portions: MemberPortionView[];
  /** Ce que la maison cuisine — la moitié qu'un secondaire n'avait nulle part. */
  dishes: HouseholdDishView[];
  /** Ce qui n'a pas fusionné, et pourquoi (D9). Voir `householdPlanTrace.ts`. */
  trace: HouseholdPlanTrace;
}

/**
 * LA COMPOSITION VIVANTE DU FOYER, s'il y en a une.
 *
 * ── POURQUOI ELLE SE LIT ICI ET PAS SUR `/app/plan` ───────────────────────
 * `/app/plan` montre les PLATS et les courses — ce qu'on cuisine. Les portions
 * par membre sont l'objet du FOYER: « qui met quoi dans son assiette ». Les
 * mettre sur le plan obligerait le chemin individuel, qui est le majoritaire
 * (l'entrée du produit est à 1, §5), à porter un bloc vide en permanence.
 *
 * `retired_at is null` et `ends_on >= today`: la même définition de « vivant »
 * que `following_io.ts`. Une composition remplacée ou périmée ne décrit plus ce
 * qu'on mange ce soir.
 */
export async function loadHouseholdMeal(today: string): Promise<HouseholdMealView | null> {
  const { data, error } = await supabase
    .from("student_generated_meals")
    // `dishes` et `generated_from` sont arrivés avec L8: le premier parce qu'un
    // secondaire n'avait NULLE PART où voir ce que la maison cuisine (D9), le
    // second parce que « ce qui n'a pas fusionné » n'est lisible que là.
    .select("id, starts_on, duration_days, member_portions, dishes, generated_from")
    .not("household_id", "is", null)
    // ⚠️ `plan_kind` EST LA MOITIÉ DU FILTRE — mesuré le 2026-08-12 sous un vrai
    // jeton. `household_id is not null` ne dit PAS « plan du foyer »: un plan
    // personnel le porte aussi, `generate-meal-v1` l'estampant pour que la
    // fusion le retrouve. Sans ce filtre, la carte se vidait dès qu'un
    // secondaire générait un plan personnel commençant après celui du foyer —
    // elle rendait sa ligne, qui n'a aucune `member_portions`.
    //
    // Le jumeau de ce défaut vivait dans `household_turn_context.ts`, où le
    // chat décrivait les plats d'un membre comme le dîner de la maison.
    .eq("plan_kind", "household")
    .is("retired_at", null)
    .gte("ends_on", today)
    // ⚠️ ON RAMÈNE TOUTES LES LIGNES VIVANTES, ET C'EST `selectMealPlans` QUI
    // TRANCHE. `starts_on desc limit 1` prenait le plan qui DÉMARRE LE PLUS
    // TARD — c'est-à-dire, dès qu'un foyer a préparé la suite (ce que
    // `prepare_next` produit, et deux plans vivants sont le cas NOMINAL), le
    // plan de la semaine PROCHAINE. Mesuré au navigateur le 2026-08-14: sur le
    // foyer Bramble, « Ta part » était vide pour Zoe alors que sa part existe
    // sur le plan courant, et « À table » ne montrait que Nina — la seule
    // bouche servie par le plan du 19.
    //
    // « Ce que la maison cuisine » est le plan qui couvre AUJOURD'HUI, et le
    // suivant seulement s'il n'y en a pas. C'est exactement ce que
    // `selectMealPlans` calcule, et il est déjà testé: re-dériver la règle ici
    // en ferait un jumeau, qui divergerait.
    .order("starts_on", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const chosen = selectMealPlans(
    rows.map((r) => ({
      startsOn: String(r.starts_on ?? ""),
      durationDays: Number(r.duration_days) || 1,
      retiredAt: null,
      raw: r,
    })),
    today,
  );
  const row = (chosen.current ?? chosen.next)?.raw;
  if (!row) return null;

  return {
    mealId: String(row.id),
    startsOn: String(row.starts_on ?? ""),
    durationDays: Number(row.duration_days) || 1,
    // LOT 3 — LE MÊME LECTEUR QUE LE RENDU DU PLAN, et pas une seconde copie
    // de ces vingt lignes. Voir `readMemberPortions`.
    portions: readMemberPortions(row.member_portions),
    dishes: readHouseholdDishes(row.dishes),
    trace: readHouseholdPlanTrace(row.generated_from),
  };
}

/**
 * Les plats d'un plan, réduits à ce qui se dit à table. Voir `HouseholdDishView`
 * pour ce qui est délibérément laissé de côté, et pourquoi.
 */
function readHouseholdDishes(raw: unknown): HouseholdDishView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      title: String(d.title ?? "").trim(),
      day: typeof d.day === "string" && d.day.trim() ? d.day.trim() : null,
      slot: typeof d.slot === "string" && d.slot.trim() ? d.slot.trim() : null,
      // ⚠️ LECTURE DÉFENSIVE, ET C'EST UNE CICATRICE. `uses` est arrivé APRÈS
      // des compositions déjà en base: un `as` sur ce JSONB compilerait et
      // jurerait que le tableau existe, puis l'écran ferait `.includes()` sur
      // `undefined` à l'ouverture d'un vieux plan. Même garde que
      // `readDishes` dans `api/mealGeneration.ts`, pour la même raison.
      uses: Array.isArray(d.uses)
        ? d.uses
          .map((u) => String(((u ?? {}) as Record<string, unknown>).preparation_id ?? ""))
          .filter((id) => id !== "")
        : [],
      // LOT C — MÊME LECTURE DÉFENSIVE, ET MÊME RAISON: la clé est arrivée
      // après des plans déjà en base. Absente ⇒ `null` ⇒ « le plat de la
      // table », c'est-à-dire ce que ces plans-là étaient déjà pour tout le
      // monde. Un `as` ici jurerait que la clé existe et rendrait `undefined`
      // à l'ouverture d'un vieux plan — « un `as` sur un type étranger désarme
      // le typecheck ».
      memberId: typeof d.member_id === "string" && d.member_id.trim()
        ? d.member_id.trim()
        : null,
    };
  }).filter((d) => d.title !== "");
}

/**
 * LE MAÎTRE ACCÈDE À TOUS LES PLANS — et sa surface de cuisine n'en affiche
 * qu'un (D9, mot pour mot).
 *
 * ── « ACCÉDER » ET « AFFICHER » NE SONT PAS LA MÊME CHOSE ─────────────────
 * C'est tout l'arbitrage du lot. Sa cuisine ne montre QUE le plan qu'il
 * cuisine — un plan validé non fusionné n'y apparaît pas, parce que le but est
 * de simplifier sa cuisine et non de lui faire suivre N plans. Mais il doit
 * pouvoir REGARDER celui d'un secondaire, sur un geste explicite, pour décider
 * s'il le fusionne. D'où: derrière un dépliant, jamais sur une carte.
 *
 * ⚠️ `.eq("user_id", …)` EXPLICITE, ET RLS N'EN DISPENSE PAS. La policy
 * `student_generated_meals_household_read` rend TOUTE ligne portant le foyer —
 * y compris le plan personnel d'un AUTRE secondaire. Ce dépôt a déjà rendu la
 * ligne d'un élève à son coach faute d'un `.eq(user_id)`; ici la même
 * négligence ferait lire à un secondaire le plan d'un autre secondaire.
 *
 * ⚠️ `plan_kind = 'personal'` EST L'AUTRE MOITIÉ. `household_id is not null` ne
 * veut pas dire « plan du foyer », et sa réciproque est vraie aussi: sans ce
 * filtre, demander « le plan de Zoé » sur le compte du maître rendrait le plan
 * DU FOYER. Voir `household_plan_kind_readers_test.ts`.
 */
export async function loadMemberPersonalPlan(
  userId: string,
  today: string,
): Promise<HouseholdDishView[] | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("student_generated_meals")
    .select("id, dishes")
    .eq("user_id", userId)
    .eq("plan_kind", "personal")
    .is("retired_at", null)
    .gte("ends_on", today)
    .order("starts_on", { ascending: true })
    .limit(1);
  // ÉCHOUE FORT. « Son plan ne contient rien » et « on n'a pas pu le lire »
  // sont deux phrases différentes, et l'appelant en rend deux.
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return readHouseholdDishes(row.dishes);
}

/**
 * LA DATE DE NAISSANCE D'UNE BOUCHE, RENDUE AU SEUL MAÎTRE DE SON FOYER.
 *
 * ── ⚠️ POURQUOI CE N'EST PAS DANS LE ROSTER ──────────────────────────────
 * `keel_household_roster_for` ne rend JAMAIS la date, seulement un état d'âge:
 * « le foyer doit savoir qu'il y a un enfant à table, pas son âge ». La règle
 * protège une bouche des AUTRES bouches — le roster est lisible par tout membre,
 * adolescent compris. Elle n'a en revanche jamais eu de raison de cacher la date
 * à la personne QUI L'A TAPÉE, et c'est exactement l'écart que cette porte
 * ouvre. Signalé le 2026-08-19: la carte affichait « Renseignée » là où elle
 * pouvait afficher la date, et le champ d'édition restait vide.
 *
 * ⛔ NE PAS LA REMPLACER PAR `keel_household_member_birth_date`: celle-là rend
 * la même valeur SANS AUCUN CONTRÔLE DE PROPRIÉTÉ, et elle est réservée à
 * `service_role` pour cette raison. L'ouvrir laisserait lire la date de
 * n'importe quelle bouche de n'importe quel foyer en devinant un uuid.
 *
 * ⚠️ `null` COUVRE DEUX CAS, ET C'EST VOULU: « pas de date » et « ça ne te
 * regarde pas » sont la même réponse. Un refus nommé apprendrait à un appelant
 * qu'il existe une bouche derrière cet uuid.
 */
export async function loadMemberBirthDate(
  memberId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc(
    "keel_household_member_birth_date_for_owner",
    { p_member: memberId },
  );
  if (error) throw new Error(error.message);
  return typeof data === "string" && data !== "" ? data : null;
}

/**
 * LES DATES DE TOUTES LES BOUCHES, EN UNE LECTURE PAR BOUCHE.
 *
 * ⚠️ UNE RPC PAR MEMBRE, ET C'EST ASSUMÉ: le foyer plafonne à huit bouches
 * (`HOUSEHOLD_MAX_MOUTHS`), donc au pire huit appels sur un écran qu'on ouvre
 * une fois. Une porte « toutes les dates du foyer » aurait rendu, dans un seul
 * jsonb, exactement ce que le roster refuse de rendre — et elle aurait fini par
 * être appelée depuis un écran de membre.
 *
 * ⛔ UN ÉCHEC NE FAIT PAS TOMBER LA CARTE: on rend la Map partielle. Une date
 * absente se lit « pas encore renseignée », ce qui est faux mais inoffensif;
 * une carte qui ne se rend pas, non.
 */
export async function loadMemberBirthDates(
  memberIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(memberIds.map(async (id) => {
    if (!id) return;
    const date = await loadMemberBirthDate(id).catch(() => null);
    if (date !== null) out.set(id, date);
  }));
  return out;
}
