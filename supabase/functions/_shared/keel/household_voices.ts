/**
 * CE QUE CHAQUE TITULAIRE A DIT DE SA BOUFFE — D4, la moitié PURE. Aucun I/O.
 *
 * Autorité: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, D4 —
 * « Préférences durables ET mémoire de chaque titulaire entrent dans la
 * composition, avec un plafond de tokens par membre et la garde de
 * non-divulgation étendue. »
 *
 * ---------------------------------------------------------------------------
 * LE TROU QUE ÇA FERME, ET IL SE MESURE EN EUROS
 * ---------------------------------------------------------------------------
 * `reconcileFoodPreferencesFor` est paramétré PAR UTILISATEUR depuis toujours,
 * et `generate-household-meal-v1` ne l'appelait que pour le MAÎTRE. Les
 * préférences durables d'un conjoint, d'un colocataire, d'un enfant majeur —
 * tout ce qu'ils avaient confirmé sur leur propre écran — n'atteignaient jamais
 * la composition. Payer un siège dont le « about you » n'arrive pas dans
 * l'assiette, c'est ne rien acheter.
 *
 * ---------------------------------------------------------------------------
 * CE N'EST PAS UN SECOND PONT VERS LA MÉMOIRE
 * ---------------------------------------------------------------------------
 * Ce module ne lit RIEN de `memory_items`. Le pont mémoire → générateurs existe,
 * il est unique, il exige un « Keep » explicite de l'élève, et il a cinq clés de
 * domaine (`food_preference_promotion.ts`). Ce lot le fait passer par toutes les
 * bouches AU LIEU d'une seule; il n'en ouvre pas un second, qui aurait dupliqué
 * l'origine, le `dismissed`, la réconciliation et la vue datée.
 *
 * « La mémoire d'un titulaire » est donc, ici, exactement ce que
 * `foodPreferencesForPrompt` rend pour lui: ce qu'il a confirmé, daté, le plus
 * récent d'abord, et débarrassé de ce que le memorizer a démenti depuis.
 *
 * ---------------------------------------------------------------------------
 * DEUX GARDES, ET AUCUNE DES DEUX N'EST OPTIONNELLE
 * ---------------------------------------------------------------------------
 *   1. LE PLAFOND PAR MEMBRE (`VOICE_TOKEN_CAP_PER_MEMBER`). « Tout ce qu'on
 *      sait » sur quatre personnes n'a aucune borne naturelle. Le plafond est
 *      PAR MEMBRE et pas seulement global: un plafond global se ferait manger
 *      par la première personne lue, et les suivantes disparaîtraient en
 *      silence — c'est-à-dire que le siège payé d'un secondaire dépendrait de
 *      l'ordre du roster.
 *   2. LA GARDE DE NON-DIVULGATION (`FORBIDDEN_VOICE_TERMS`, DÉRIVÉE de
 *      `FORBIDDEN_PORTION_TERMS`). Le plan du foyer est LU PAR TOUT LE FOYER, à
 *      table. Une ligne qui dit pourquoi quelqu'un mange autrement n'a rien à
 *      faire dans le prompt qui écrit ce plan.
 *
 * Les deux TRACENT. Une troncature muette est un mensonge sur ce que le modèle
 * a vu.
 */

import {
  type ForbiddenMatch,
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { FORBIDDEN_PORTION_TERMS } from "./household_portions.ts";

/**
 * CE QU'UNE BOUCHE AVEC COMPTE APPORTE — avant toute garde.
 *
 * ⚠️ Une bouche SANS compte n'a rien à apporter et n'a pas à figurer ici: pas de
 * `student_goals`, pas de mémoire, donc pas de ligne. C'est D3, et ce n'est pas
 * un manque (`docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md`).
 */
/**
 * LA MARQUE DE PORTÉE, IMPORTÉE ET JAMAIS RÉÉCRITE. Deux littéraux — celui qui
 * marque la ligne et celui qui déclenche la règle — divergeraient au premier
 * changement de formulation, et la règle sortirait sans les lignes qu'elle
 * gouverne, ou l'inverse.
 */
import { VOICE_REACH_MARK } from "./retained_items_routing.ts";
export { VOICE_REACH_MARK };

export interface RawMemberVoice {
  /** L'identité de la BOUCHE, pas du compte — comme partout dans cette lane. */
  memberId: string;
  displayName: string;
  /**
   * Ce que `foodPreferencesForPrompt` a rendu pour CE titulaire: daté, le plus
   * récent d'abord. L'ordre est porteur — le plafond coupe par la queue, donc
   * par le plus ancien, exactement comme `MAX_PROMPT_PREFERENCES`.
   */
  lines: readonly string[];
}

/** Ce qui reste d'un membre après les deux gardes. */
export interface MemberVoice {
  memberId: string;
  displayName: string;
  lines: string[];
}

/**
 * LES LIGNES D'UN MEMBRE, COMPTÉES — et ce sont bien des LIGNES.
 *
 * ⚠️ CE QUI A ÉTÉ MESURÉ, ET POURQUOI CES CHAMPS EXISTENT. La trace du plan
 * dérivait ses deux nombres des `issues`, en comptant des CHAÎNES:
 *
 *     1 ligne retenue par la garde  ⇒ `"withheld": 3`   (une phrase peut
 *                                      mordre sur trois formes de surface)
 *     2 lignes tombées au plafond   ⇒ `"over_cap": 1`   (une seule `issue`,
 *                                      qui portait `:2` dans son texte)
 *
 * Les deux nombres du même objet étaient gonflé et dégonflé, EN SENS
 * INVERSES. Un compteur qui se dérive d'un format de trace ment dès que le
 * format change; celui-ci est compté là où les lignes passent.
 *
 * Et surtout: `heard` compte des MEMBRES. Aucun nombre ne disait combien de
 * lignes le modèle a réellement vues — la seule question qui compte pour
 * relire une composition trois jours plus tard.
 */
export interface MemberLineCount {
  memberId: string;
  /** Lignes non vides reçues pour ce membre, avant toute garde. */
  in: number;
  /** Lignes réellement écrites dans le prompt. */
  used: number;
  /** LIGNES retenues par la garde de non-divulgation. Pas des motifs. */
  withheld: number;
  /** LIGNES tombées parce que le budget du membre était épuisé. */
  over_cap: number;
  /**
   * LIGNES sautées parce qu'elles ne tiennent pas SEULES sous le plafond.
   *
   * ⚠️ DISJOINT DE `over_cap`, et ce n'est pas de la comptabilité fine: les
   * deux nombres accusent des choses différentes. Un `over_cap` qui monte dit
   * que le plafond est peut-être trop bas pour ce foyer; un `too_long` qui
   * monte dit qu'un PRODUCTEUR écrit des lignes impubliables. Les additionner
   * rendrait les deux illisibles — c'est la cicatrice `withheld`/`over_cap` de
   * ce fichier, en plus discret.
   */
  too_long: number;
}

export interface VoiceLineCounts {
  /** Toutes bouches confondues: ce qui est entré, avant toute garde. */
  linesIn: number;
  /** Toutes bouches confondues: CE QUE LE MODÈLE A VU. */
  linesUsed: number;
  linesWithheld: number;
  linesOverCap: number;
  /** Toutes bouches confondues: les lignes impubliables à elles seules. */
  linesTooLong: number;
  /**
   * Le même détail, par bouche. Il porte les membres dont TOUT est tombé —
   * `heard` ne les porte pas, et c'est précisément le cas qu'on veut pouvoir
   * relire (« son about-you n'a servi à rien » ≠ « il n'avait rien confirmé »).
   */
  perMember: MemberLineCount[];
}

export interface HouseholdVoices {
  /** Le bloc à greffer au prompt. `""` si personne n'a rien à dire. */
  block: string;
  /** Ce qui a été entendu, après gardes. Sert la trace, pas le prompt. */
  heard: MemberVoice[];
  /** Ce qui a été coupé, nommément. Jamais silencieux. */
  issues: string[];
  /** Des LIGNES, comptées à l'endroit où elles passent. Voir `MemberLineCount`. */
  counts: VoiceLineCounts;
}

/**
 * LE PLAFOND, PAR MEMBRE, EN TOKENS ESTIMÉS.
 *
 * ── D'OÙ VIENT LE NOMBRE ───────────────────────────────────────────────────
 * Mesuré sur le corpus local le 2026-08-12, sur les 36 lignes réellement
 * gardées par 10 comptes:
 *
 *     ligne la plus longue     120 caractères
 *     ligne moyenne             52 caractères
 *     p90                       77 caractères
 *     titulaire le plus bavard   6 lignes, 361 caractères
 *
 * Avec le préfixe de date que `foodPreferencesForPrompt` ajoute (13 car. par
 * ligne), le titulaire le plus bavard du corpus pèse 439 caractères, soit ~110
 * tokens estimés. 150 laisse ~36 % de marge au-dessus du pire cas RÉEL, et
 * borne un foyer plein — le plafond de bouches est de 8, en base
 * (`20260810260000_household_billable_profiles.sql`) — à 1 200 tokens, contre
 * un prompt mesuré en production à ~11 400 + ~3 300 caractères, soit ~3 700
 * tokens. Le pire cas structurel ajoute donc ~⅓, et il est BORNÉ: avant ce lot
 * il ne l'était pas du tout.
 *
 * ── POURQUOI UN PLAFOND, ET PAS « ça tiendra bien » ────────────────────────
 * Le dépôt a déjà mesuré ce défaut ailleurs: un bloc de doctrine sans plafond
 * atteignait 10 000 tokens dès le premier document. Ce qui se fait noyer quand
 * un prompt gonfle, ce sont les contraintes de sécurité et la doctrine du
 * coach — celles-là mêmes qui doivent survivre à tout. Sans plafond par membre,
 * le prompt grossirait avec le FOYER, et le pire foyer est celui qui paie le
 * plus.
 *
 * ⚠️ IL NE REMPLACE PAS `MAX_PROMPT_PREFERENCES` (20 lignes, dans
 * `food_preference_promotion.ts`): l'un borne un NOMBRE DE LIGNES, l'autre une
 * LONGUEUR. Vingt lignes de 300 caractères passeraient le premier sans
 * difficulté.
 */
export const VOICE_TOKEN_CAP_PER_MEMBER = 150;

/**
 * L'ESTIMATION DE TOKENS — quatre caractères pour un, l'heuristique que ce
 * dépôt utilise déjà dans `_shared/llm.ts` et `_shared/gemini.ts` quand le
 * fournisseur ne rend pas son décompte.
 *
 * Elle est APPROXIMATIVE et c'est assumé: un plafond de prompt n'a pas besoin
 * d'être juste au token près, il a besoin d'exister et d'être stable. Compter
 * les vrais tokens demanderait le tokenizer du fournisseur, c'est-à-dire un
 * appel réseau au milieu d'un module pur.
 */
export function estimateVoiceTokens(text: string): number {
  const chars = String(text ?? "").length;
  return chars === 0 ? 0 : Math.ceil(chars / 4);
}

/**
 * LA LIGNE TELLE QU'ELLE ENTRE DANS LE PROMPT. Le plafond compte CE texte-là,
 * pas la préférence nue: la puce et l'espace partent aussi dans le budget, et
 * un plafond qui compte autre chose que ce qui est envoyé est un plafond qui
 * ment de 12 % sans que personne ne le sache.
 */
function renderLine(text: string): string {
  return `- ${text}`;
}

/**
 * LE SEUL TERME DE LA LISTE DE SORTIE QUI NE GARDE PAS UNE ENTRÉE.
 *
 * ── CE QUI A ÉTÉ MESURÉ ───────────────────────────────────────────────────
 * Banc adverse, une ligne par appel:
 *
 *     « Végétarien depuis 5 ans. »    → COUPÉE (forme de surface `ans`)
 *     « Vegetarian for five years. »  → PASSE (aucune forme EN pour un
 *                                       décompte d'années)
 *
 * Les deux phrases disent la même chose, dans deux langues, et la garde n'en
 * coupe qu'une. C'est la cicatrice « garde testée dans une seule langue » de ce
 * dépôt, sur une liste que ce lot a recyclée.
 *
 * ── LEQUEL DES DEUX EST LE BUG ────────────────────────────────────────────
 * Ce n'est PAS la version anglaise qui devrait tomber. « Végétarien depuis 5
 * ans » est une préférence alimentaire parfaitement légitime, et c'est
 * exactement le genre de ligne que D4 existe pour faire arriver dans la
 * casserole. Symétriser vers le HAUT (ajouter `years`, `year`) aurait coupé les
 * deux, c'est-à-dire aurait doublé le faux positif au lieu de le retirer.
 *
 * ── POURQUOI L'ÂGE N'EST PAS UN SECRET *EN ENTRÉE* ────────────────────────
 * `FORBIDDEN_PORTION_TERMS` a été écrite pour la SORTIE: interdire à une
 * consigne de portion — une phrase que le modèle écrit et qu'on lit à table —
 * d'énoncer un âge, un objectif, un compte de calories. La voix d'un titulaire
 * est une ENTRÉE: du texte libre écrit par une personne, qui n'est jamais rendu
 * tel quel. Et l'âge du foyer n'y est pas un secret: `household_members.
 * birth_date` le porte, `householdBodyFacts` le donne DÉJÀ au modèle dans le
 * brief de portions, et la table connaît les âges de la table.
 *
 * ── CE QUE ÇA NE FAIT PAS ─────────────────────────────────────────────────
 * La liste de SORTIE ne bouge pas d'un caractère: `sanitizePortionNote`
 * continue de refuser un âge dans une consigne de service, et
 * `household_portions.ts` n'est pas touché. C'est une SOUSTRACTION nommée, du
 * côté entrée seulement — l'option la plus réversible: remettre `"age"` dans ce
 * tableau restaure exactement le comportement d'avant, sans autre changement.
 *
 * ⚠️ CE N'EST PAS UNE SECONDE LISTE. `FORBIDDEN_VOICE_TERMS` est DÉRIVÉE de
 * `FORBIDDEN_PORTION_TERMS` par filtre; une correction faite sur la liste de
 * sortie arrive ici sans que personne n'y pense, et un test le tient.
 */
export const VOICE_GUARD_DROPPED_TOKENS: readonly string[] = ["age"];

/**
 * LE REGISTRE QUE LA LISTE DE SORTIE NE CONNAÎT PAS — et qui est précisément ce
 * que D4 dit d'interdire.
 *
 * ── POURQUOI IL FALLAIT L'AJOUTER ─────────────────────────────────────────
 * La liste de sortie a été écrite contre un modèle BRIDÉ qui écrit des
 * consignes de portion. Ce lot lui donne un emploi neuf: du TEXTE LIBRE écrit
 * par un élève, sur lui-même ou sur quelqu'un de sa table. Mesuré, avant ce
 * correctif, ces trois-là passaient intégralement:
 *
 *     « Elle mange peu le soir parce qu'elle se trouve trop grosse. »
 *     « She skips dinner when she feels she has eaten too much at lunch. »
 *     « Elle pèse ses portions de riz au gramme près. »
 *
 * Une composition lue à voix haute à table ne porte pas ça. Ce sont les trois
 * familles du registre TCA — image du corps, compensation, pesée — et elles
 * sont écrites DANS LES DEUX LANGUES, parce que ce dépôt a déjà payé une garde
 * dont le `not` ne couvrait pas `doesn't`.
 *
 * ── CE QUI EST VOLONTAIREMENT HORS LISTE, ET POURQUOI ─────────────────────
 * Une garde trop large rend D4 décoratif — c'est le défaut même que ce lot
 * répare. Sont donc EXCLUS, chacun pour une raison mesurée sur le banc passant:
 *
 *   `gros` / `grosse` NUS      « coupe les morceaux trop gros » est de la
 *                              cuisine. Seules les formes RÉFLEXIVES (« se
 *                              trouve trop grosse ») désignent quelqu'un.
 *   `balance` / `scale`        « uses a kitchen scale for bread dough » est un
 *                              ustensile. C'est « au gramme près » qui parle.
 *   `trop manger` (infinitif)  « éviter de trop manger le soir » est de la
 *                              modération ordinaire. C'est le PARTICIPE (« a
 *                              trop mangé », « has eaten too much ») qui porte
 *                              la compensation.
 *   `se priver`                « se priver de gluten » est une ligne de régime
 *                              médical banale. La compensation se dit par
 *                              « se rattraper » / « compenser ».
 *   `vomir` NU                 « les épinards, ça la fait vomir » est un
 *                              DÉGOÛT, donc une préférence. Seule la forme
 *                              provoquée (« se faire vomir ») est retenue.
 *
 * ⚠️ AUCUN MATCHER MAISON. Ce sont des `ForbiddenTerm` passés au même moteur
 * que tout le reste (`forbidden_matcher.ts`): mêmes frontières de mots, même
 * normalisation des diacritiques, même lecture absolue. « laitue » ≠ « lait »,
 * 12 faux positifs sur 12 mesurés le jour où quelqu'un a voulu écrire le sien.
 *
 * Les `token` sont des slugs qui n'apparaissent JAMAIS en prose (`food_
 * compensation`): c'est la forme que `forbidden_matcher.ts` documente pour un
 * interdit dont l'identité canonique est une catégorie et pas un mot. Tout le
 * travail est dans les formes de surface — et c'est le `token` que la trace
 * nomme.
 */
export const VOICE_DISCLOSURE_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "voice.body_image",
    token: "body_image",
    surfaceForms: [
      // FR — les formes réflexives seulement.
      "se trouve grosse",
      "se trouve gros",
      "se trouve trop grosse",
      "se trouve trop gros",
      "se sent grosse",
      "se sent gros",
      "se trouve enorme",
      "mal dans son corps",
      "deteste son corps",
      "honte de son corps",
      "complexee par son corps",
      // EN
      "feels fat",
      "feels too fat",
      "feels overweight",
      "thinks she is too fat",
      "thinks he is too fat",
      "hates her body",
      "hates his body",
      "ashamed of her body",
      "ashamed of his body",
      "self conscious about her body",
      "self conscious about his body",
    ],
  },
  {
    ruleId: "voice.compensation",
    token: "food_compensation",
    surfaceForms: [
      // FR
      "a trop mange",
      "trop mange",
      "se rattrape",
      "se rattraper",
      "compenser",
      "compense",
      "se punit",
      "se punir",
      "se fait vomir",
      "se faire vomir",
      // EN
      "ate too much",
      "eaten too much",
      "eats too much",
      "overate",
      "overeaten",
      "overeating",
      "binge",
      "binged",
      "binge eating",
      "make up for it",
      "makes up for it",
      "punishes herself",
      "punishes himself",
      "starves herself",
      "starves himself",
      "makes herself sick",
      "makes himself sick",
    ],
  },
  {
    ruleId: "voice.weighing",
    token: "food_weighing",
    surfaceForms: [
      // FR
      "pese ses portions",
      "pese ses aliments",
      "pese sa nourriture",
      "pese chaque",
      "pese tout ce qu elle mange",
      "pese tout ce qu il mange",
      "au gramme pres",
      // EN
      "weighs her portions",
      "weighs his portions",
      "weighs her food",
      "weighs his food",
      "weighs everything",
      "weighs every meal",
      "to the gram",
    ],
  },
];

/**
 * LA LISTE QUI GARDE LES VOIX — dérivée, jamais recopiée.
 *
 * Une seconde liste divergerait à la première correction, et c'est le motif que
 * `forbidden_matcher.ts` documente en tête de fichier comme sa raison d'être.
 * Le `filter` ci-dessous est donc le SEUL écart avec la sortie, il est nommé, et
 * un test vérifie que tout le reste de `FORBIDDEN_PORTION_TERMS` est bien passé
 * par ici — sans quoi un terme ajouté demain à la sortie manquerait ici en
 * silence.
 */
export const FORBIDDEN_VOICE_TERMS: readonly ForbiddenTerm[] = [
  ...FORBIDDEN_PORTION_TERMS.filter(
    (t) => !VOICE_GUARD_DROPPED_TOKENS.includes(t.token),
  ),
  ...VOICE_DISCLOSURE_TERMS,
];

/**
 * DE L'AIGUILLE QUI A MORDU À LA CATÉGORIE QUI SE RELIT.
 *
 * ── LE DÉFAUT QUE ÇA FERME ────────────────────────────────────────────────
 * `findForbiddenMatches` rend `token: needle.toLowerCase()` — l'AIGUILLE, pas
 * la catégorie. La trace disait donc `voice_line_withheld:<membre>:kcal`,
 * `:tour de taille`, `:prise de masse`, `:ans`… c'est-à-dire un vocabulaire
 * OUVERT, qui grandit à chaque forme de surface ajoutée, et dont aucun lecteur
 * ne peut faire la liste. Le commentaire du module, lui, promettait `:age`.
 *
 * ── POURQUOI UNE TABLE ICI ET PAS UN CHAMP DE PLUS DANS LE MOTEUR ─────────
 * `ForbiddenMatch` porte `ruleId` (trop gros: `portion.body` couvre le poids,
 * la silhouette, la taille) et le needle (trop fin). La catégorie est le
 * `token` du TERME, que seul l'appelant connaît puisque c'est lui qui a
 * composé la liste. Ajouter un champ à `forbidden_matcher.ts` aurait touché un
 * module partagé par le verrou d'allergies et celui de doctrine pour un besoin
 * de trace; la table est locale, pure, et se retire sans rien casser ailleurs.
 *
 * Une aiguille inconnue retombe sur elle-même: la trace reste écrite, jamais
 * vide. C'est le repli, pas le cas nominal, et un test le tient.
 */
const VOICE_CATEGORY_BY_NEEDLE: ReadonlyMap<string, string> = new Map(
  FORBIDDEN_VOICE_TERMS.flatMap((term) =>
    [term.token, ...(term.surfaceForms ?? [])].map(
      (needle) => [String(needle).toLowerCase(), term.token] as const,
    )
  ),
);

/** La catégorie d'une morsure, ou l'aiguille si la table ne la connaît pas. */
function categoryOf(match: ForbiddenMatch): string {
  return VOICE_CATEGORY_BY_NEEDLE.get(match.token) ?? match.token;
}

/**
 * LA GARDE DE NON-DIVULGATION, ÉTENDUE À L'ENTRÉE — et c'est le point le plus
 * facile à rater de tout ce lot.
 *
 * ── POURQUOI (PRESQUE) LA MÊME LISTE QUE LA SORTIE ────────────────────────
 * `FORBIDDEN_PORTION_TERMS` existe parce qu'une consigne de portion est lue à
 * table par tout le monde: elle interdit d'y énoncer une raison, un objectif,
 * un compte de calories, quoi que ce soit du corps de quelqu'un. Le plan
 * ENTIER — titres, `why`, liste de courses — est lu par les mêmes personnes.
 * Si la mémoire d'un membre remonte à la composition, la garde remonte avec
 * elle; sinon le menu de la semaine devient l'endroit où le foyer apprend que
 * quelqu'un a repris un régime.
 *
 * ⚠️ DÉRIVÉE, PAS RECOPIÉE. Une seconde liste divergerait à la première
 * correction, et c'est le motif que `forbidden_matcher.ts` documente en tête de
 * fichier comme la raison même de son existence. `FORBIDDEN_VOICE_TERMS` est
 * donc `FORBIDDEN_PORTION_TERMS` moins UN terme nommé (`VOICE_GUARD_DROPPED_
 * TOKENS`) plus le registre que la sortie ne connaît pas
 * (`VOICE_DISCLOSURE_TERMS`) — les deux écarts sont justifiés à leur
 * déclaration, et un test tient l'héritage du reste. Et on n'écrit PAS de
 * matcher maison: « laitue » ≠ « lait », 12 faux positifs sur 12 mesurés.
 *
 * ── `allowNegatedMentions: false`, comme `sanitizePortionNote` ─────────────
 * « une part sans perte de poids » parle encore de perte de poids devant toute
 * la table. Ce qu'on interdit n'est pas d'ENCOURAGER le sujet, c'est de
 * l'ÉVOQUER.
 *
 * ── ON JETTE LA LIGNE, ON NE LA RÉÉCRIT PAS ───────────────────────────────
 * Même posture que `sanitizePortionNote`, et pour la même raison: amputer une
 * phrase produit un texte dont personne ne répond, et ici l'amputation pourrait
 * INVERSER un sens (« ne mange pas de porc, sauf … »). La ligne tombe entière,
 * et son motif est tracé.
 *
 * ── LE CAS QUI PASSE, ET IL EST LA MOITIÉ DE LA GARDE ─────────────────────
 * Une préférence alimentaire ORDINAIRE doit arriver. « Il n'aime pas le
 * poisson », « batch cooking le dimanche », « saute le petit-déjeuner » n'ont
 * rien à cacher: une garde qui coupe tout est indiscernable d'une garde qui
 * marche, et elle rendrait D4 décoratif.
 *
 * ── LE BRUIT, MESURÉ — BANC ADVERSE, UNE LIGNE PAR APPEL ──────────────────
 * Les 36 lignes réelles du corpus local passées dans cette garde: **0
 * morsure** (la plus longue fait 120 caractères).
 *
 * Banc écrit à la main, 17 lignes à couper (9 fr / 8 en) et 15 à laisser
 * passer (7 fr / 8 en). Avant les deux correctifs ci-dessus: **8 lignes
 * divulgantes passaient** (tout le registre TCA) et **1 ligne légitime
 * tombait** (« Végétarien depuis 5 ans »). Après: 17/17 coupées, 15/15
 * passées. Le banc vit dans `household_voices_test.ts`, dans les deux langues,
 * parce qu'un `not` ne couvre pas `doesn't`.
 *
 * ⚠️ UN TROU CONNU, HÉRITÉ, ET NON REFERMÉ ICI: l'écho numérique nu (« il fait
 * 1m90 et 95 kg », « Zoe is 32 and eats late ») n'est mordu par personne,
 * exactement comme le dit le commentaire de `FORBIDDEN_PORTION_TERMS`. Vérifié
 * en le mesurant: ces lignes-là passent. Ce n'est pas un défaut de ce lot,
 * c'est la borne du moteur — et le corps de chaque membre est de toute façon
 * DÉJÀ donné au modèle par le brief de portions (`householdBodyFacts`), donc la
 * ligne ne divulguerait rien de neuf AU MODÈLE. Ce qu'elle changerait, c'est la
 * probabilité qu'il l'écrive en prose.
 *
 * ── CE QUI EST RENDU: LA CATÉGORIE, PAS L'AIGUILLE ────────────────────────
 * `voice_line_withheld:<membre>:<catégorie>`, où la catégorie est le `token`
 * du terme (`weight`, `calories`, `body_image`…) et JAMAIS la forme de surface
 * qui a mordu (`kcal`, `tour de taille`, `prise de masse`). Le vocabulaire de
 * la trace est ainsi FERMÉ et se relit; et il divulgue moins, ce qui compte
 * puisque ces `issues` reviennent au maître dans la réponse HTTP.
 */
function withheldCategories(line: string): string[] {
  const matches = findForbiddenMatches(line, FORBIDDEN_VOICE_TERMS, {
    allowNegatedMentions: false,
  });
  if (matches.length === 0) return [];
  return [...new Set(matches.map(categoryOf))].sort();
}

const VOICE_HEADER = [
  "== WHAT EACH PERSON HAS TOLD ME ==",
  "What these people have said about their own eating, in their own words, most",
  "recent first. Every one of them eats at this table: compose with all of it.",
] as const;

/**
 * EN DERNIER DANS LE BLOC, et ce n'est pas de la mise en page: un modèle lit la
 * contrainte la plus proche de la fin comme la plus contraignante — c'est le
 * motif que `buildPortionBrief` et les règles de maison appliquent déjà.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QU'UNE LIGNE MARQUÉE AUTORISE, ET CE QU'ELLE N'AUTORISE PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CETTE RÈGLE EXISTE ──────────────────────────────────────────
 * Jusqu'au 2026-09-04, la lane foyer ne servait au modèle que les lignes de la
 * TABLE et celles du composeur. Celles d'une bouche nommée étaient comptées et
 * jetées — la garde était juste (« la règle d'une bouche n'est pas celle de la
 * table »), sa conséquence ne l'était pas: mesuré sur deux plans vivants,
 * quatre plats de lentilles pour quelqu'un qui les évite, puis du cabillaud
 * pour deux bouches qui évitent le poisson.
 *
 * Maintenant la ligne SORT, marquée. L'axe 3 tient toujours — mais par la
 * FORME de la ligne, pas par son absence.
 *
 * ── LA HIÉRARCHIE, DITE UNE FOIS ET PAS SUR CHAQUE LIGNE ────────────────
 * Le plafond par bouche coupe par la queue: recopier la hiérarchie sur chaque
 * ligne mangerait le budget et ferait tomber les plus anciennes. Elle est donc
 * ici, une fois, et le suffixe de chaque ligne n'en porte que le pointeur.
 *
 * ⚠️ ELLE NOMME LES TROIS CANAUX PAR LEUR EN-TÊTE RÉEL. « Si la table l'a
 * demandé » ne veut rien dire pour un modèle qui lit dix blocs: il faut lui
 * dire OÙ regarder, sinon il arbitre au jugé.
 *
 * ⚠️ ET ELLE NE SORT QUE S'IL Y A UNE LIGNE MARQUÉE. Un foyer dont personne
 * n'a de ligne nommée reçoit le bloc d'avant ce lot, à l'octet près.
 */
const VOICE_REACH_RULE = [
  "A line marked THIS PERSON ONLY never becomes a rule for the table. When it",
  "refuses a food: leave that food out of the shared dish if nothing else calls",
  "for it. If the table asked for it -- the \"WHAT THIS HOUSEHOLD ASKED FOR THIS",
  "WEEK\" line, a liking written under a name WITHOUT that mark, or the coach's",
  "\"REACH FOR THESE FIRST\" list -- serve it to the table and give that one",
  "person a box of the SAME dish where that component is replaced -- cooked in",
  "a preparation of its own, never inside the one that carries the original.",
  "Never a separate dish for a dislike, never a ban for everyone. A liking marked THIS",
  "PERSON ONLY is a hint for that person's box, nothing more.",
] as const;

const VOICE_FOOTER = [
  "NEVER quote, repeat or allude to any of these lines in what you write, and",
  "never say whose line shaped a dish. This plan is read out loud by the whole",
  'household: a dish title, a "why", or a serving instruction must never reveal',
  "that someone eats differently, nor why.",
] as const;

/**
 * LE BLOC, ET LES DEUX GARDES AVEC LUI.
 *
 * ⚠️ LES GARDES SONT *DANS* CETTE FONCTION, PAS EN AMONT D'ELLE. Un appelant
 * qui construirait le bloc à partir de lignes déjà filtrées ailleurs pourrait
 * un jour oublier le filtre, et rien n'échouerait — le prompt n'a pas de
 * compilateur. Il n'y a donc qu'une porte, et elle garde.
 *
 * L'ORDRE DES MEMBRES est celui reçu (celui du roster), pour la même raison que
 * `buildPortionBrief`: l'écran et le prompt doivent lister le foyer dans un
 * ordre stable d'un repas à l'autre.
 */
export function buildHouseholdVoices(
  members: readonly RawMemberVoice[],
): HouseholdVoices {
  const issues: string[] = [];
  const heard: MemberVoice[] = [];
  const perMember: MemberLineCount[] = [];

  for (const member of members) {
    const memberId = String(member?.memberId ?? "").trim();
    if (!memberId) continue;

    // ── PASSE 1 · LA GARDE, SUR TOUTES LES LIGNES ─────────────────────────
    // Elle passe AVANT le plafond et sur la liste ENTIÈRE, y compris ce que le
    // plafond va couper juste après. Deux raisons, et la seconde est la vraie:
    //
    //   1. Une ligne divulgante ne doit consommer aucun budget — sinon un
    //      secret ferait taire une préférence ordinaire.
    //   2. Le plafond s'ARRÊTE (voir passe 2). Enchaîner les deux gardes dans
    //      une seule boucle rendrait le motif d'une ligne divulgante située
    //      après le point d'arrêt INVISIBLE: elle serait comptée « au plafond »
    //      alors qu'elle a été retenue. La sécurité, elle, ne changerait pas —
    //      la ligne n'entre pas dans les deux cas — mais la trace mentirait, et
    //      c'est exactement le défaut que ce lot répare ailleurs.
    const survivors: string[] = [];
    let linesIn = 0;
    let withheldLines = 0;
    for (const raw of member.lines ?? []) {
      const line = String(raw ?? "").trim();
      if (!line) continue;
      linesIn += 1;

      const categories = withheldCategories(line);
      if (categories.length > 0) {
        withheldLines += 1;
        for (const category of categories) {
          issues.push(`voice_line_withheld:${memberId}:${category}`);
        }
        continue;
      }
      survivors.push(line);
    }

    // ── PASSE 2 · LE PLAFOND, QUI S'ARRÊTE ────────────────────────────────
    // IL COUPE PAR LA QUEUE. La liste arrive triée par `foodPreferencesForPrompt`:
    // depuis le 2026-08-13, ce que le titulaire a ÉCRIT d'abord, puis ce que le
    // memorizer a récolté, du plus récent au plus ancien. Ce qui tombe est donc
    // la plus vieille RÉCOLTE — jamais une consigne écrite. La règle se raconte
    // toujours en une phrase, ce qui est la seule chose que cette passe exige.
    //
    // ⚠️ `break`, PAS `continue`, ET C'EST UN DÉFAUT QUI A ÉTÉ MESURÉ. Avec
    // `continue`, un plan réel a gardé pour son maître:
    //
    //     08-11 ✓  08-10 ✓  08-09 ✓  08-08 ✓  08-07 ✗  08-06 ✗  08-05 ✓
    //
    // — les deux lignes RÉCENTES tombées et la PLUS ANCIENNE (« Hates
    // olives. », courte) sauvée par sa longueur. Personne ne peut relire ça:
    // ce que le modèle a vu dépendait alors du nombre de caractères de chaque
    // phrase, pas de leur fraîcheur. « Le modèle a vu les k premières lignes de
    // cette personne » est la seule règle qui se raconte, et c'est la même que
    // celle de `MAX_PROMPT_PREFERENCES`, qui fait un `.slice(0, 20)`.
    //
    // ⚠️ UNE LIGNE QUI NE TIENT PAS *SEULE* EST SAUTÉE, PAS UN POINT D'ARRÊT —
    // ET C'EST UNE RÉGRESSION QUI A ÉTÉ MESURÉE. Le commentaire ci-dessus
    // acceptait qu'une ligne trop longue fasse taire tout ce qui la suit, sur
    // un argument de données: « la plus longue préférence réelle fait 120
    // caractères et le plus long texte de `memory_items` 126, contre ~598 pour
    // saturer 150 tokens à elle seule — le cas n'existe pas dans les données ».
    //
    // Cet argument portait sur des PRÉFÉRENCES PLATES. Il ne couvre plus rien
    // depuis que le lot 1C place EN TÊTE de cette liste les `food.*`/`method.*`
    // retenus, dont le `text` n'a AUCUNE longueur maximale (contrat de phase 0,
    // §4: « aucune longueur maximale sur `text` », et le socle accepte 600
    // caractères sans broncher). Mesure du vérificateur, un item structuré de
    // 600 caractères en tête, puis un item court, puis deux phrases plates:
    //
    //     structurés GARDÉS: 0 · plats GARDÉS: 0 · structurés TOMBÉS: 2
    //
    // Une seule ligne longue faisait taire LE BLOC ENTIER du titulaire — y
    // compris ses phrases plates, qui étaient servies AVANT ce chantier.
    //
    // POURQUOI CE `continue`-CI NE ROUVRE PAS CELUI QU'ON A REFUSÉ. L'argument
    // du `break` est un argument d'ORDRE: une ligne plus VIEILLE ne doit pas
    // doubler une ligne plus récente parce qu'elle est plus courte (mesuré sur
    // un plan réel: `08-11 ✓ 08-10 ✓ … 08-07 ✗ 08-06 ✗ 08-05 ✓`). Cet argument
    // n'a rien à dire d'une ligne dont le coût PROPRE dépasse le plafond: elle
    // ne tient à AUCUNE position, donc la sauter ne prend la place de personne
    // et ne fait doubler personne. La règle se raconte toujours en une phrase —
    // « le modèle a vu les k premières lignes SERVABLES de cette personne » —
    // et c'est la seule chose que cette passe exige.
    //
    // ⚠️ ET ELLE EST TRACÉE À PART. Les deux motifs ne se relisent pas pareil:
    // `voice_over_cap` dit « ce titulaire a plus à dire que le budget », donc
    // que le plafond est peut-être mal calibré; `voice_line_too_long` dit « une
    // ligne est impubliable à elle seule », donc qu'un producteur écrit trop
    // long. Les confondre dans un seul nombre, c'est la cicatrice
    // `withheld`/`over_cap` de ce fichier, en plus discret.
    const kept: string[] = [];
    let spent = 0;
    let tooLong = 0;
    for (const line of survivors) {
      const cost = estimateVoiceTokens(renderLine(line));
      if (cost > VOICE_TOKEN_CAP_PER_MEMBER) {
        tooLong += 1;
        continue;
      }
      if (spent + cost > VOICE_TOKEN_CAP_PER_MEMBER) break;
      spent += cost;
      kept.push(line);
    }
    // LES DEUX COMPTES SONT DISJOINTS, et `overCap` se dérive de ce qui reste:
    // tout ce qui n'est ni gardé ni trop long est tombé par la queue.
    const overCap = survivors.length - kept.length - tooLong;

    if (tooLong > 0) {
      // AVANT `voice_over_cap`, parce que c'est la ligne trop longue qui
      // explique le reste quand les deux sont là.
      issues.push(`voice_line_too_long:${memberId}:${tooLong}`);
    }
    if (overCap > 0) {
      // TRACÉ AVEC SON COMPTE: « il en manque » et « il en manque sept » ne se
      // relisent pas pareil, et c'est le second qui dit qu'un plafond est mal
      // calibré.
      issues.push(`voice_over_cap:${memberId}:${overCap}`);
    }
    if (linesIn > 0) {
      // ÉCRIT MÊME QUAND TOUT EST TOMBÉ — c'est le seul endroit où « on a tout
      // jeté » se distingue de « il n'avait rien confirmé ». `heard`, lui, ne
      // porte que les membres qui ont survécu.
      perMember.push({
        memberId,
        in: linesIn,
        used: kept.length,
        withheld: withheldLines,
        over_cap: overCap,
        too_long: tooLong,
      });
    }
    if (kept.length > 0) {
      heard.push({
        memberId,
        displayName: String(member.displayName ?? "").trim() || "Member",
        lines: kept,
      });
    }
  }

  const counts: VoiceLineCounts = {
    linesIn: perMember.reduce((n, m) => n + m.in, 0),
    linesUsed: perMember.reduce((n, m) => n + m.used, 0),
    linesWithheld: perMember.reduce((n, m) => n + m.withheld, 0),
    linesOverCap: perMember.reduce((n, m) => n + m.over_cap, 0),
    linesTooLong: perMember.reduce((n, m) => n + m.too_long, 0),
    perMember,
  };

  if (heard.length === 0) return { block: "", heard, issues, counts };

  const body: string[] = [];
  for (const voice of heard) {
    body.push(`${voice.displayName}:`);
    for (const line of voice.lines) body.push(renderLine(line));
  }

  // ⚠️ ENTRE LE CORPS ET LE PIED, JAMAIS APRÈS. Le pied de non-divulgation
  // reste la DERNIÈRE chose lue — c'est sa place depuis qu'un modèle a écrit
  // « pour respecter le régime de X » dans une phrase lue à voix haute.
  const marked = body.some((line) => line.includes(VOICE_REACH_MARK));
  return {
    block: [
      ...VOICE_HEADER,
      "",
      ...body,
      ...(marked ? ["", ...VOICE_REACH_RULE] : []),
      "",
      ...VOICE_FOOTER,
    ].join("\n"),
    heard,
    issues,
    counts,
  };
}
