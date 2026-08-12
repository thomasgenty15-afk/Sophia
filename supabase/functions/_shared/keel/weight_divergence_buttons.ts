/**
 * FF-056 — LES BOUTONS DE LA DIVERGENCE. Le branchement, rendu déterministe.
 *
 * ── LE DÉFAUT QUE CE MODULE RETIRE ──────────────────────────────────────────
 * Les neuf catégories de la fiche §3 sont FERMÉES depuis le premier jour
 * (`skills/weight_divergence/contract.ts`). Le produit demandait pourtant à un
 * modèle de projeter du texte libre dessus, à chaque tour. Le dispatcher de ce
 * dépôt a été mesuré `[0,3,3,0]` SUR UNE PHRASE IDENTIQUE: la même réponse
 * changeait donc de branche d'un soir à l'autre, sur le sujet le plus sensible
 * du produit. On ne tire pas au sort une conversation sur le poids de
 * quelqu'un quand l'espace des réponses est connu d'avance.
 *
 * Ce module rend l'énumération TAPABLE. Le modèle ne classe plus rien sur le
 * chemin nominal; il ne reste que la phrase, et la confabulation meurt avec le
 * jugement (mesurée en run réel: « la semaine prochaine QUE JE TE PRÉPARE »,
 * commit `eb01c2d1`).
 *
 * ── CE QUI NE BOUGE PAS, ET C'EST LA MOITIÉ DE LA FICHE ────────────────────
 * LA QUESTION D'OUVERTURE RESTE OUVERTE (R3). Les boutons ne la referment pas:
 * ils COUVRENT l'ensemble fermé au complet, et le texte libre reste accepté à
 * tout moment (`classifyDivergenceReply` devient le chemin de secours, pas la
 * route). Une personne qui écrit obtient exactement ce qu'elle obtenait; une
 * personne qui tape obtient la même branche, à tous les coups.
 *
 * ── DEUX NIVEAUX, ET C'EST LE PATRON DU DÉPÔT ──────────────────────────────
 * Neuf boutons sous une question sur le poids se lisent comme un
 * interrogatoire. FF-058 dépliait déjà (`Pas tout` → les plats), FF-057 aussi
 * (le formulaire → la question de session). Ici: CINQ au premier niveau, puis
 * un dépliage FERMÉ sur les deux branches composées.
 *
 *   niveau 1  ·  « je crois savoir d'où ça vient »  → le MOMENT (6 boutons)
 *             ·  « c'est autre chose »              → la CIRCONSTANCE (4)
 *             ·  « rien d'anormal de mon côté »     → not_a_divergence
 *             ·  « je ne sais pas »                 → unknown
 *             ·  « je préfère ne pas en parler »    → declined
 *
 * `other` n'est PAS tapable, et c'est voulu: c'est la soupape du texte libre
 * (§9). Un bouton « autre chose que tout ça » ne dirait rien de plus qu'une
 * phrase, et il coûterait un tour.
 *
 * ── LES LIBELLÉS NOMMENT DES CIRCONSTANCES, JAMAIS DES FAUTES ──────────────
 * Le poids qui monte quand on veut le perdre n'est pas un sujet neutre. « Je
 * craque le soir » est un aveu; « le soir » est un moment. La différence n'est
 * pas de ton, elle est GRAMMATICALE — aucun libellé ne prend la personne pour
 * sujet d'un verbe de faute — et `acceptDivergenceText` l'arme sur le texte
 * exact, dans les deux langues, plutôt que de l'espérer.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire. Les écritures vivent dans
 * `_shared/chat/weight_divergence_tap.ts`.
 */

import {
  FORBIDDEN_BLAME_TERMS,
  FORBIDDEN_ENERGY_TERMS,
  FORBIDDEN_PLAN_DELIVERY_PHRASES,
  FORBIDDEN_SUSPICION_PHRASES,
  FORBIDDEN_WEIGH_IN_LINK_PHRASES,
  WEIGHT_DIVERGENCE_SLOTS,
  isWeightDivergenceSlot,
  type WeightDivergenceCategory,
  type WeightDivergenceSlot,
} from "../../sophia-brain/skills/weight_divergence/contract.ts";
import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { recommendationButtonId } from "./daily_recommendation.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE DES IDENTIFIANTS
// ---------------------------------------------------------------------------

/**
 * Le préfixe de tous les identifiants de ce flow.
 *
 * DISJOINT des quatre autres (`KEEL_RECO_`, `KEEL_STRIP_`, `KEEL_FIX_`,
 * `KEEL_PULSE_`): chaque lecteur rend « rien » sur ce qui ne le concerne pas,
 * donc l'ordre de lecture dans `deterministic_buttons.ts` est sans conséquence.
 * Un test le pinne — ce n'est pas une propriété qu'on relit à l'œil.
 */
export const DIVERGENCE_BUTTON_PREFIX = "KEEL_WDIV_";

/**
 * Le séparateur. `|` comme la bande du soir, et pour la même raison: la charge
 * porte des jetons qui peuvent contenir `_`, et un séparateur qui obligerait à
 * compter les segments serait un séparateur qui devine.
 */
const SEP = "|";

export const DIVERGENCE_KIND = {
  /** Déplier un niveau. N'ÉCRIT RIEN — le geste ne dit encore rien. */
  step: "KEEL_WDIV_STEP",
  /** Une catégorie terminale. La charge porte le jeton de catégorie. */
  category: "KEEL_WDIV_CAT",
  /** Un moment nommé ⇒ `named_spot`. La charge porte le jeton de moment. */
  spot: "KEEL_WDIV_SPOT",
} as const;

/** Les deux dépliages. Liste FERMÉE. */
export const DIVERGENCE_BRANCHES = ["where", "other_cause"] as const;
export type DivergenceBranch = (typeof DIVERGENCE_BRANCHES)[number];

/**
 * LES CATÉGORIES ATTEIGNABLES PAR UN TAP.
 *
 * Sept sur neuf. Les deux absentes le sont par construction:
 *   · `named_spot` passe par `DIVERGENCE_KIND.spot`, parce qu'il lui faut le
 *     MOMENT — sans lui, l'action tombe au mauvais endroit, ce qui est le
 *     défaut mesuré en run réel (« le matin je grignote » → une collation
 *     l'après-midi) et que §1 de la fiche décrit mot pour mot;
 *   · `other` est la soupape du TEXTE LIBRE (§9) et n'a pas de bouton.
 */
export const TAPPABLE_CATEGORIES = [
  "plan_mismatch",
  "activity_drop",
  "medical",
  "life_factor",
  "not_a_divergence",
  "unknown",
  "declined",
] as const;
export type TappableCategory = (typeof TAPPABLE_CATEGORIES)[number];

function isTappableCategory(value: string): value is TappableCategory {
  return (TAPPABLE_CATEGORIES as readonly string[]).includes(value);
}

function isBranch(value: string): value is DivergenceBranch {
  return (DIVERGENCE_BRANCHES as readonly string[]).includes(value);
}

/**
 * L'IDENTIFIANT D'ÉPISODE EST LE SEUL LIEN ENTRE LE BOUTON ET LA LIGNE.
 *
 * Il est validé en FORME ici, et en APPARTENANCE chez l'appelant (l'épisode
 * vivant du porteur du JWT, `.eq('user_id', …)`). Les deux sont nécessaires:
 * une forme valide qui désigne l'épisode de quelqu'un d'autre reste une charge
 * forgée, et une charge tronquée qui passerait la forme désignerait n'importe
 * quoi. Cicatrice `rls-is-not-a-substitute-for-eq-user-id`.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function requireEpisodeId(episodeId: string): string {
  const id = String(episodeId ?? "").trim().toLowerCase();
  if (!UUID_RE.test(id)) {
    throw new Error(`[keel/weight_divergence_buttons] bad episode id`);
  }
  return id;
}

export function divergenceStepId(
  episodeId: string,
  branch: DivergenceBranch,
): string {
  return [DIVERGENCE_KIND.step, requireEpisodeId(episodeId), branch].join(SEP);
}

export function divergenceCategoryId(
  episodeId: string,
  category: TappableCategory,
): string {
  return [DIVERGENCE_KIND.category, requireEpisodeId(episodeId), category]
    .join(SEP);
}

export function divergenceSpotId(
  episodeId: string,
  slot: WeightDivergenceSlot,
): string {
  return [DIVERGENCE_KIND.spot, requireEpisodeId(episodeId), slot].join(SEP);
}

// ---------------------------------------------------------------------------
// RELIRE UN TAP — déterministe, et il ne devine jamais
// ---------------------------------------------------------------------------

export type DivergenceReply =
  | { kind: "step"; episodeId: string; branch: DivergenceBranch }
  | { kind: "category"; episodeId: string; category: TappableCategory }
  | { kind: "spot"; episodeId: string; slot: WeightDivergenceSlot }
  | { kind: "none" };

const NONE: DivergenceReply = { kind: "none" };

/**
 * Interprète un `button_payload`. Rend `{kind:"none"}` sur tout ce qui n'est
 * pas EXACTEMENT une charge de ce flow — jamais une supposition.
 *
 * ⚠️ TROIS SEGMENTS, NI PLUS NI MOINS. Une charge tronquée (`…|<uuid>|`) rend
 * `none`, elle ne retombe pas sur le premier jeton de la liste. Ce dépôt a la
 * cicatrice exacte: `Number("")` vaut 0, et une charge tronquée visait l'index
 * 0 en silence (`evening_strip.ts`). Ici le jeton est textuel, donc le piège
 * change de forme — une chaîne vide n'est membre d'aucune liste fermée — mais
 * on l'écrit quand même, parce que le prochain jeton pourrait être numérique.
 */
export function readDivergenceReply(
  payload: string | null | undefined,
): DivergenceReply {
  const raw = String(payload ?? "").trim();
  if (!raw.startsWith(DIVERGENCE_BUTTON_PREFIX)) return NONE;

  const parts = raw.split(SEP);
  if (parts.length !== 3) return NONE;
  const [kind, rawId, token] = parts;

  const episodeId = rawId.trim().toLowerCase();
  if (!UUID_RE.test(episodeId)) return NONE;
  if (!token) return NONE;

  if (kind === DIVERGENCE_KIND.step) {
    return isBranch(token) ? { kind: "step", episodeId, branch: token } : NONE;
  }
  if (kind === DIVERGENCE_KIND.category) {
    return isTappableCategory(token)
      ? { kind: "category", episodeId, category: token }
      : NONE;
  }
  if (kind === DIVERGENCE_KIND.spot) {
    return isWeightDivergenceSlot(token)
      ? { kind: "spot", episodeId, slot: token }
      : NONE;
  }
  return NONE;
}

/** La catégorie qu'un tap DÉSIGNE. Un moment est toujours un `named_spot`. */
export function categoryOfReply(
  reply: Exclude<DivergenceReply, { kind: "none" } | { kind: "step" }>,
): WeightDivergenceCategory {
  return reply.kind === "spot" ? "named_spot" : reply.category;
}

// ---------------------------------------------------------------------------
// LA CEINTURE — « des circonstances, pas des fautes »
// ---------------------------------------------------------------------------

/**
 * LA FAMILLE NEUVE. Les cinq autres viennent du contrat de la skill et sont
 * RÉUTILISÉES telles quelles — ce dépôt paie en boucle les deux
 * implémentations d'une même règle.
 *
 * ── CE QU'ELLE ATTRAPE, ET POURQUOI ELLE EST PROPRE AUX BOUTONS ────────────
 * Un libellé est ce que la personne DIT en tapant. Le texte libre est le sien;
 * un libellé est le NÔTRE, mis dans sa bouche. « Je craque le soir » posé par
 * nous sous une question sur le poids fabrique un aveu que personne n'a fait,
 * et le fabrique à la première personne. Les cinq familles existantes ne
 * mordent pas dessus: aucune ne parle de ce que la personne s'accuse de faire.
 *
 * ⚠️ ELLE VISE LE VERBE DE FAUTE À LA PREMIÈRE PERSONNE, pas le mot. « le
 * soir » et « je mange dehors » doivent passer — ce sont des circonstances, et
 * ce sont littéralement des libellés de ce module. C'est pour ça que ce sont
 * des LOCUTIONS, et c'est pour ça qu'un test fait passer les quinze libellés
 * réels: une garde qui bloque tout ressemble à une garde qui marche
 * (cicatrice `guards-need-a-passing-case`).
 */
export const FORBIDDEN_SELF_BLAME_LABELS: readonly string[] = Object.freeze([
  // --- FR ---
  "je craque",
  "je craquais",
  "j ai craque",
  "je triche",
  "j ai triche",
  "je me lache",
  "je me suis lache",
  "je me laisse aller",
  "je me suis laisse aller",
  "je mange trop",
  "j ai trop mange",
  "je grignote trop",
  "je me goinfre",
  "mes exces",
  "mon ecart",
  "mes ecarts",
  "je ne me tiens pas",
  "je n y arrive pas",
  "c est ma faute",
  // --- EN ---
  "i cheat",
  "i cheated",
  "i binge",
  "i binged",
  "i overeat",
  "i overate",
  "i slipped",
  "i slip up",
  "i gave in",
  "i give in",
  "i eat too much",
  "i ate too much",
  "i lost control",
  "i can t stick to it",
  "my fault",
  "i messed up",
]);

function labelTerms(): ForbiddenTerm[] {
  const build = (ruleId: string, list: readonly string[]): ForbiddenTerm[] =>
    list.map((term) => ({ ruleId, token: term }));
  return [
    ...build("energy", FORBIDDEN_ENERGY_TERMS),
    ...build("suspicion", FORBIDDEN_SUSPICION_PHRASES),
    ...build("blame", FORBIDDEN_BLAME_TERMS),
    ...build("weigh_in_link", FORBIDDEN_WEIGH_IN_LINK_PHRASES),
    ...build("plan_delivery", FORBIDDEN_PLAN_DELIVERY_PHRASES),
    ...build("self_blame", FORBIDDEN_SELF_BLAME_LABELS),
  ];
}

const LABEL_TERMS = labelTerms();

export type DivergenceTextVerdict =
  | { ok: true }
  | { ok: false; reason: string; detail: string };

/**
 * Le texte que NOUS écrivons est-il émettable ?
 *
 * @param banNumbers REQUIS. `true` partout dans ce flow — R11 (« aucun chiffre
 *   d'énergie, nulle part ») et le validateur de l'agent visible interdisent
 *   déjà tout chiffre dans une sortie de divergence. Requis et non optionnel:
 *   un paramètre de garde optionnel est une garde désarmée, et ce dépôt a payé
 *   exactement cette cicatrice (`safetyBand` jamais passé).
 *
 * ⚠️ `allowNegatedMentions: false`. « Je ne dis pas que tu triches » dit « tu
 * triches ». Même lecture absolue que l'agent visible de la skill: ici on
 * cherche une INSINUATION, pas un aliment cité.
 *
 * ⚠️ Les apostrophes deviennent des espaces AVANT le scan. `tokenPattern` joint
 * les mots par `[\s\-_]*` et l'apostrophe n'est ni un séparateur ni une lettre:
 * sans ce remplacement, « c'est ma faute » ne matcherait pas « c est ma faute »
 * — le trou exact que le validateur de la skill a payé, en français seulement.
 */
export function acceptDivergenceText(
  text: string,
  banNumbers: boolean,
): DivergenceTextVerdict {
  const raw = String(text ?? "");
  if (!raw.trim()) return { ok: false, reason: "empty", detail: "" };

  if (banNumbers) {
    const digit = raw.match(/\d/);
    if (digit) return { ok: false, reason: "carries_a_number", detail: digit[0] };
  }

  const scannable = raw.replace(/['’`]/g, " ");
  const found = findForbiddenMatches(scannable, LABEL_TERMS, {
    allowNegatedMentions: false,
  });
  if (found.length > 0) {
    return {
      ok: false,
      reason: found[0].ruleId,
      detail: found[0].token,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// LES TEXTES — deux langues, tables fermées
// ---------------------------------------------------------------------------

/**
 * La langue. REQUISE et résolue par l'appelant (`isFrenchLocale`):
 * `profiles.locale` vaut `fr-FR` par défaut en base, donc un défaut implicite
 * ici mentirait sur la langue de la moitié des fixtures.
 */
export type DivergenceLanguage = "fr" | "en";

interface DivergenceCopy {
  /** Niveau 1 — les cinq. */
  knowWhere: string;
  somethingElse: string;
  nothingOff: string;
  dontKnow: string;
  ratherNot: string;
  /** Le dépliage du MOMENT. */
  whereLead: string;
  morning: string;
  midday: string;
  afternoon: string;
  evening: string;
  night: string;
  noParticularMoment: string;
  /** Le dépliage de la CIRCONSTANCE. */
  causeLead: string;
  planMismatch: string;
  medical: string;
  activityDrop: string;
  lifeFactor: string;
  /** L'accusé d'une charge qui ne désigne plus rien. */
  stale: string;
  /** LA PROPOSITION DURABLE, une par action FF-028. Voir `divergenceActionProposal`. */
  proposeBreakfast: string;
  proposeAfternoonSnack: string;
  yesAdd: string;
  noThanks: string;
  /** `named_spot` sans action disponible: on le dit, on ne bricole pas. */
  notedNoChange: string;
}

/**
 * ⚠️ CHAQUE LITTÉRAL CI-DESSOUS PASSE `acceptDivergenceText`, et le test le
 * prouve en les soumettant tous — un libellé qu'on ne peut pas émettre est un
 * libellé qui n'existe pas.
 *
 * ⚠️ LA PERSONNE N'EST SUJET D'AUCUN VERBE DE FAUTE. Relire à voix haute est le
 * test: « Je crois savoir d'où ça vient » est une lucidité, « Je craque le
 * soir » serait un aveu. « Je bouge moins qu'avant » est un fait, « Je ne fais
 * plus de sport » serait un manquement.
 */
const COPY: Readonly<Record<DivergenceLanguage, DivergenceCopy>> = {
  fr: {
    knowWhere: "Je crois savoir d'où ça vient",
    somethingElse: "C'est autre chose",
    nothingOff: "Rien d'anormal de mon côté",
    dontKnow: "Je ne sais pas",
    ratherNot: "Je préfère ne pas en parler",

    whereLead: "D'accord. À quel moment de la journée ?",
    morning: "Le matin",
    midday: "Le midi",
    afternoon: "L'après-midi",
    evening: "Le soir",
    night: "La nuit",
    noParticularMoment: "Pas un moment précis",

    causeLead: "D'accord. Qu'est-ce qui a changé ?",
    planMismatch: "Le plan n'est pas ce que je mange",
    medical: "Un traitement, ma santé",
    activityDrop: "Je bouge moins qu'avant",
    lifeFactor: "Le sommeil, le stress",

    stale: "Celui-là n'est plus d'actualité — rien n'a été enregistré.",
    proposeBreakfast:
      "Merci de me le dire. C'est quelque chose à changer dans le plan : un " +
      "vrai petit-déjeuner, à partir de maintenant. On l'ajoute ?",
    proposeAfternoonSnack:
      "Merci de me le dire. C'est quelque chose à changer dans le plan : une " +
      "collation l'après-midi, à partir de maintenant. On l'ajoute ?",
    yesAdd: "Oui, on l'ajoute",
    noThanks: "Non merci",
    notedNoChange:
      "Merci de me le dire — c'est la partie que je ne pouvais pas voir. " +
      "C'est noté, et la prochaine semaine que tu composeras en tiendra compte.",
  },
  en: {
    knowWhere: "I think I know where it comes from",
    somethingElse: "It's something else",
    nothingOff: "Nothing looks off to me",
    dontKnow: "I don't know",
    ratherNot: "I'd rather not go into it",

    whereLead: "Alright. Which moment of the day?",
    morning: "Morning",
    midday: "Midday",
    afternoon: "Afternoon",
    evening: "Evening",
    night: "At night",
    noParticularMoment: "No particular moment",

    causeLead: "Alright. What changed?",
    planMismatch: "The plan isn't what I eat",
    medical: "A treatment, my health",
    activityDrop: "I move less than before",
    lifeFactor: "Sleep, stress",

    stale: "That one's no longer open — nothing has been saved.",
    proposeBreakfast:
      "Thanks for telling me. That's something to change in the plan: a " +
      "proper breakfast, from here on. Add it?",
    proposeAfternoonSnack:
      "Thanks for telling me. That's something to change in the plan: an " +
      "afternoon snack, from here on. Add it?",
    yesAdd: "Yes, add it",
    noThanks: "No thanks",
    notedNoChange:
      "Thanks for telling me — that's the part I couldn't see. I've noted it, " +
      "and the next week you put together will take it into account.",
  },
};

export interface DivergenceButton {
  id: string;
  title: string;
}

export interface DivergenceStep {
  /** `null` pour l'ouverture: la question du moteur EST le corps. */
  body: string | null;
  buttons: DivergenceButton[];
}

/**
 * Le seul chemin par lequel un texte de ce module sort. Il VÉRIFIE, il ne
 * suppose pas: une constante changée un mardi soir n'est relue par personne,
 * un vérificateur qui tourne à chaque rendu, si.
 *
 * Rend `null` quand la ceinture refuse — fail-closed du côté du silence. Le
 * moteur retombe alors sur la question NUE, qui reste exactement ce qu'elle
 * était avant ce lot.
 */
function guarded(step: DivergenceStep): DivergenceStep | null {
  const authored = [step.body ?? "", ...step.buttons.map((b) => b.title)]
    .filter(Boolean)
    .join("\n");
  const verdict = acceptDivergenceText(authored, true);
  if (verdict.ok) return step;
  console.warn(JSON.stringify({
    tag: "keel.weight_divergence.buttons_refused",
    reason: verdict.reason,
    detail: verdict.detail,
  }));
  return null;
}

/**
 * LES CINQ BOUTONS DE L'OUVERTURE.
 *
 * Ils s'attachent à la question gelée du moteur du soir; ils ne la remplacent
 * pas et ils ne la reformulent pas. R2 (le sujet est le plan) et R3 (la
 * question est ouverte) vivent dans la PHRASE, et la phrase ne change pas.
 */
export function buildDivergenceOpening(args: {
  episodeId: string;
  language: DivergenceLanguage;
  /** REQUIS (R8). Sous plancher, AUCUN bouton — et aucune question non plus. */
  restrictionFlag: boolean;
}): DivergenceStep | null {
  if (args.restrictionFlag) return null;
  const copy = COPY[args.language];
  const id = args.episodeId;
  return guarded({
    body: null,
    buttons: [
      { id: divergenceStepId(id, "where"), title: copy.knowWhere },
      { id: divergenceStepId(id, "other_cause"), title: copy.somethingElse },
      {
        id: divergenceCategoryId(id, "not_a_divergence"),
        title: copy.nothingOff,
      },
      { id: divergenceCategoryId(id, "unknown"), title: copy.dontKnow },
      { id: divergenceCategoryId(id, "declined"), title: copy.ratherNot },
    ],
  });
}

/**
 * LE DÉPLIAGE DU MOMENT — les six moments, dont `unspecified`.
 *
 * Les six sont là, et pas seulement les deux qui portent une action FF-028
 * (`morning`, `afternoon`). C'est le sujet: quelqu'un qui tape « Le soir » doit
 * obtenir « c'est noté, il n'y a rien à changer dans le plan pour ça » — jamais
 * la collation de l'après-midi. `SLOT_TO_RECOMMENDATION_ACTION` est trouée
 * exprès, et ces boutons rendent les trous atteignables au lieu de les cacher.
 */
export function buildDivergenceWhereStep(args: {
  episodeId: string;
  language: DivergenceLanguage;
  restrictionFlag: boolean;
}): DivergenceStep | null {
  if (args.restrictionFlag) return null;
  const copy = COPY[args.language];
  const id = args.episodeId;
  const titles: Record<WeightDivergenceSlot, string> = {
    morning: copy.morning,
    midday: copy.midday,
    afternoon: copy.afternoon,
    evening: copy.evening,
    night: copy.night,
    unspecified: copy.noParticularMoment,
  };
  return guarded({
    body: copy.whereLead,
    // L'ordre de la liste fermée du contrat, pas un ordre à nous: deux ordres
    // de la même énumération finissent par diverger.
    buttons: WEIGHT_DIVERGENCE_SLOTS.map((slot) => ({
      id: divergenceSpotId(id, slot),
      title: titles[slot],
    })),
  });
}

/** LE DÉPLIAGE DE LA CIRCONSTANCE — quatre causes, aucune interprétée. */
export function buildDivergenceCauseStep(args: {
  episodeId: string;
  language: DivergenceLanguage;
  restrictionFlag: boolean;
}): DivergenceStep | null {
  if (args.restrictionFlag) return null;
  const copy = COPY[args.language];
  const id = args.episodeId;
  return guarded({
    body: copy.causeLead,
    buttons: [
      { id: divergenceCategoryId(id, "plan_mismatch"), title: copy.planMismatch },
      { id: divergenceCategoryId(id, "medical"), title: copy.medical },
      {
        id: divergenceCategoryId(id, "activity_drop"),
        title: copy.activityDrop,
      },
      { id: divergenceCategoryId(id, "life_factor"), title: copy.lifeFactor },
    ],
  });
}

/**
 * L'ACCUSÉ D'UNE CHARGE QUI NE DÉSIGNE PLUS RIEN.
 *
 * Épisode clos, épisode d'un autre jour, charge citant l'épisode de quelqu'un
 * d'autre: LA MÊME PHRASE pour les trois. Un accusé qui distinguerait
 * « n'existe pas » de « n'est pas à toi » serait un oracle d'énumération sur
 * des identifiants d'autrui — c'est le raisonnement de
 * `RECOMMENDATION_UNKNOWN_ACK`, et il tient ici mot pour mot.
 */
export function renderDivergenceStaleAck(language: DivergenceLanguage): string {
  const text = COPY[language].stale;
  const verdict = acceptDivergenceText(text, true);
  if (verdict.ok) return text;
  console.warn(JSON.stringify({
    tag: "keel.weight_divergence.stale_ack_refused",
    reason: verdict.reason,
  }));
  return language === "fr" ? "Rien n'a été enregistré." : "Nothing was saved.";
}

/**
 * `named_spot` SANS ACTION DISPONIBLE — on le dit, on n'invente rien.
 *
 * C'est le cas MAJORITAIRE, et c'est correct: quatre moments sur six n'ont
 * aucune action pré-calculée (`SLOT_TO_RECOMMENDATION_ACTION` est trouée
 * exprès), et le plan ne sait pas encore absorber une reprise à table le soir.
 * Un `else` qui retomberait sur l'action disponible la plus proche
 * refabriquerait le défaut mesuré en run réel.
 */
export function renderDivergenceNoted(language: DivergenceLanguage): string {
  const text = COPY[language].notedNoChange;
  const verdict = acceptDivergenceText(text, true);
  if (verdict.ok) return text;
  console.warn(JSON.stringify({
    tag: "keel.weight_divergence.noted_refused",
    reason: verdict.reason,
  }));
  return language === "fr" ? "C'est noté." : "Noted.";
}

/**
 * LA PROPOSITION DURABLE — le texte est à NOUS, l'effet est à FF-028.
 *
 * ── POURQUOI CE N'EST PAS LE LITTÉRAL DE FF-028, ET C'EST UNE DÉCISION ─────
 * `RECOMMENDATION_ACTIONS[*].proposal` commence par « You've told me more than
 * once that you were still hungry ». Sous CE flow, c'est FAUX: la personne n'a
 * pas parlé de faim, elle vient de taper un moment de la journée. Réutiliser la
 * phrase telle quelle produirait exactement la confabulation que ce lot existe
 * pour tuer — un fait attribué à quelqu'un qui ne l'a pas dit.
 *
 * Ce qui est réutilisé, c'est ce qui compte: l'ACTION (`RecommendationActionId`),
 * sa ligne (`insertProposal`), ses boutons (`recommendationButtonId`), son
 * écrivain et sa relecture. Il n'existe toujours qu'UN chemin qui change le
 * rythme d'un élève. Seule la phrase d'offre diffère, parce que les deux
 * prémisses diffèrent.
 *
 * ⚠️ LE SUJET N'EST PAS « LE PLAN » COMME ACTEUR. « Le plan peut ajouter une
 * collation » a été mesuré en run réel et c'est le résidu que ce lot retire:
 * le plan ne décide pas, il se change. D'où « c'est quelque chose à changer
 * dans le plan », impersonnel.
 */
export function divergenceActionProposal(args: {
  actionId: "add_breakfast" | "add_afternoon_snack";
  proposalId: string;
  language: DivergenceLanguage;
}): { body: string; buttons: DivergenceButton[] } | null {
  const copy = COPY[args.language];
  const body = args.actionId === "add_breakfast"
    ? copy.proposeBreakfast
    : copy.proposeAfternoonSnack;
  const buttons: DivergenceButton[] = [
    {
      id: recommendationButtonId("accept", args.proposalId),
      title: copy.yesAdd,
    },
    {
      id: recommendationButtonId("decline", args.proposalId),
      title: copy.noThanks,
    },
  ];
  // `banNumbers: false`: aucun chiffre n'est écrit ici non plus, mais la garde
  // qui compte sur ce texte est celle des familles interdites. On la passe
  // quand même à `true` — il n'existe aucun cas légitime à sauver.
  const verdict = acceptDivergenceText(
    [body, copy.yesAdd, copy.noThanks].join("\n"),
    true,
  );
  if (!verdict.ok) {
    console.warn(JSON.stringify({
      tag: "keel.weight_divergence.proposal_refused",
      reason: verdict.reason,
      detail: verdict.detail,
    }));
    return null;
  }
  return { body, buttons };
}

/** Exporté pour que le test énumère les DEUX packs, pas seulement l'anglais. */
export const DIVERGENCE_COPY_PACKS = Object.freeze(COPY);
