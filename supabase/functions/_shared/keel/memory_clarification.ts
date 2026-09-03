/**
 * LA QUESTION QUI NE BLOQUE PAS — le vocabulaire, le lecteur, la résolution.
 *
 * Autorité produit: docs/keel/NOMENCLATURE-MEMOIRE.md §2.2, §2.3, §8.1.
 *
 * ── LE DÉFAUT QUE CE MODULE FERME ─────────────────────────────────────────
 * Le classifieur reçoit le roster avec l'âge et le sexe, et résout « mon fils »
 * quand UNE SEULE personne correspond. Quand deux correspondent — deux filles,
 * « elle » sans antécédent — sa consigne lui dit de ne rien ranger, et c'est la
 * bonne décision. Mais l'entrée est jetée **sans trace**: aucun motif de rejet
 * ne dit « je n'ai pas su de qui on parle », donc rien ne peut relancer.
 *
 * Ce module porte les trois choses qu'une relance demande, et rien d'autre:
 * ce qu'on peut demander (`about`), comment un tap se lit, et ce qu'il écrit.
 *
 * ── DEUX RÈGLES DE FORME, ET ELLES PORTENT TOUT LE RESTE ──────────────────
 *
 *   ⛔ L'INDEX, JAMAIS LA VALEUR. Un terme d'aliment peut contenir une barre
 *   verticale, une espace, une apostrophe — le séparateur des charges est une
 *   barre. Un index à UN chiffre ne le peut pas, et il se compare aux options
 *   **stockées en base**, jamais à ce que la bulle affichait. C'est ce qui rend
 *   une charge forgée sans effet: elle ne peut désigner que ce que le runtime a
 *   proposé lui-même.
 *
 *   ⛔ LE PRODUCTEUR RESTE `draft_note`. Le chat n'écrit rien (§2.8), et ce tap
 *   ne le fait pas écrire: il COMPLÈTE une entrée que la personne a tapée
 *   elle-même sur son brouillon ou dans le champ libre de son bilan, et que le
 *   classifieur aurait rangée sans ambiguïté. La citation reste SA phrase.
 *
 * PURE MODULE: no I/O, no clock, no randomness. L'instant arrive en paramètre.
 */

import {
  type MemoLine,
  type MemoWhen,
  parseMemoLine,
} from "./memo.ts";
import {
  canProduce,
  defaultScopeFor,
  memberSubject,
  parseRetainedItem,
  type RetainedItem,
  type RetainedKind,
  type RetainedSubject,
} from "./retained_item.ts";
import type { NextPlanEntry } from "./retained_next_plan.ts";

/** Le producteur de toute ligne née d'une note — le tap n'en change pas. */
const CLARIFICATION_PRODUCER = "draft_note" as const;

// ===========================================================================
// 1. Le vocabulaire
// ===========================================================================

/**
 * CE QU'ON PEUT NE PAS AVOIR COMPRIS. Liste fermée, miroir du CHECK `about`
 * de la migration `20260904090000`.
 *
 * ⛔ DEUX, ET PAS TROIS. « Quand » a été écarté: une note sans moment se range
 * très bien sans moment (`when: null` veut dire « tous les jours »), donc la
 * question n'aurait rien débloqué — elle aurait juste demandé une précision que
 * personne n'a proposée. On ne demande que ce qui, sans réponse, fait JETER
 * l'entrée.
 */
export const MEMORY_CLARIFICATION_ABOUTS = ["who", "what"] as const;
export type ClarificationAbout = (typeof MEMORY_CLARIFICATION_ABOUTS)[number];

/**
 * QUATRE OPTIONS AU PLUS — miroir du CHECK `options between 1 and 4`.
 *
 * ⚠️ LE NOMBRE VIT AUX DEUX ENDROITS, et c'est voulu: la base est le dernier
 * mot, le module est le premier. Les laisser diverger ferait composer une
 * question que la base refuse au moment de l'écrire — c'est-à-dire une question
 * perdue après l'appel modèle qui l'a produite.
 *
 * Au-delà de quatre, ce n'est plus une clarification: c'est un formulaire, et
 * le produit a déjà écrit qu'au-delà de quatre gestes on a perdu la personne.
 */
export const MEMORY_CLARIFICATION_MAX_OPTIONS = 4;

/** Les trois portes du classifieur qu'une entrée en attente peut viser. */
export const MEMORY_CLARIFICATION_GATES = [
  "preferences",
  "next_plan",
  "notes",
] as const;
export type ClarificationGate = (typeof MEMORY_CLARIFICATION_GATES)[number];

/**
 * L'ENTRÉE EN ATTENTE — tout ce qu'il faut pour l'écrire quand la réponse
 * arrive, et rien de plus.
 *
 * ⚠️ ELLE PORTE `note`, la phrase entière, alors que `text` n'en porte qu'un
 * morceau. Les deux sont nécessaires: `text` est ce que la ligne dira (« pas de
 * poisson »), `note` est ce qui la JUSTIFIE sur la carte (« sans la citation,
 * "Défaire" est un pari »). Une seule des deux ne suffit jamais.
 */
export interface PendingClarification {
  readonly about: ClarificationAbout;
  readonly gate: ClarificationGate;
  /** `null` pour une note (le mémo n'a pas de famille). */
  readonly kind: RetainedKind | null;
  readonly text: string;
  /** Le sujet DÉJÀ connu. `null` quand c'est justement ce qu'on demande. */
  readonly subject: RetainedSubject | null;
  readonly when: MemoWhen | null;
  /** La phrase de la personne — elle devient la citation de la ligne. */
  readonly note: string;
  /** `YYYY-MM-DD`, le jour de la source. */
  readonly at: string;
  /** Le lundi ISO visé par l'encart. Ignoré par les deux autres portes. */
  readonly anchor: string;
}

// ===========================================================================
// 2. Les charges de boutons
// ===========================================================================

export const MEMORY_CLARIFICATION_BUTTON_PREFIX = "KEEL_MEMCLAR_";

/**
 * LE PRÉFIXE DES BOUTONS QUI NAVIGUENT, ET IL N'A PAS DE LECTEUR.
 *
 * ⛔ UN BOUTON DE NAVIGATION N'EST PAS UNE RÉPONSE. « Voir » ouvre un écran
 * dans le navigateur de la personne; il ne part JAMAIS au serveur. Le préfixe
 * est quand même enregistré côté routeur pour qu'une charge forgée tombe dans
 * la garde des charges inutilisables — et non au dispatcher, où un modèle
 * répondrait à la chaîne.
 *
 * ⚠️ ET IL EST DISJOINT DE CELUI DES RÉPONSES, dans les deux sens. Si l'un
 * était préfixe de l'autre, le lecteur des réponses avalerait un « Voir »: ce
 * dépôt a déjà payé exactement ça sur `never_again_subject`, lu comme
 * `never_again`, et le tap se perdait en silence.
 */
export const NAVIGATION_BUTTON_PREFIX = "KEEL_VIEW_";
export const MEMORY_VIEW_BUTTON_PAYLOAD_PREFIX = "KEEL_VIEW_ABOUT_YOU|";

const SEP = "|";
const PICK = `${MEMORY_CLARIFICATION_BUTTON_PREFIX}PICK`;
const NONE = `${MEMORY_CLARIFICATION_BUTTON_PREFIX}NONE`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** ⛔ UN SEUL CHIFFRE. Voir `readMemoryClarificationReply`. */
const INDEX_RE = /^\d$/;

/** `KEEL_MEMCLAR_PICK|<uuid>|<index>` — l'option choisie, par sa POSITION. */
export function memoryClarificationPickId(id: string, index: number): string {
  return `${PICK}${SEP}${id}${SEP}${index}`;
}

/** `KEEL_MEMCLAR_NONE|<uuid>` — « aucun de ceux-là », qui n'écrit rien. */
export function memoryClarificationNoneId(id: string): string {
  return `${NONE}${SEP}${id}`;
}

export type MemoryClarificationReply =
  | { readonly kind: "pick"; readonly id: string; readonly index: number }
  | { readonly kind: "none_of_them"; readonly id: string }
  | { readonly kind: "none" };

const REFUSED: MemoryClarificationReply = { kind: "none" };

/**
 * LIT UNE CHARGE, ET REFUSE TOUT CE QU'ELLE N'A PAS COMPOSÉ ELLE-MÊME.
 *
 * `{ kind: "none" }` est le refus universel — jamais une exception: une charge
 * d'une autre famille passe ici avant d'atteindre son propre lecteur, et lever
 * ferait tomber le routeur sur le bouton de quelqu'un d'autre.
 *
 * ⛔ `INDEX_RE = /^\d$/`, ET JAMAIS `Number(x)`. `Number("")` vaut **0** et
 * `Number(" 1 ")` vaut 1: un index vide lu comme zéro écrirait la PREMIÈRE
 * option sur un tap qui n'a désigné personne. C'est la faute la plus chère
 * possible ici — elle attribue un goût à quelqu'un qui n'a pas été nommé, ce
 * que tout ce lot existe pour empêcher. La borne HAUTE, elle, n'est pas ici:
 * elle se compare aux options stockées, que ce module pur ne connaît pas.
 */
export function readMemoryClarificationReply(
  payload: string | null | undefined,
): MemoryClarificationReply {
  const raw = String(payload ?? "").trim();
  if (!raw.startsWith(MEMORY_CLARIFICATION_BUTTON_PREFIX)) return REFUSED;

  const parts = raw.split(SEP);
  const verb = parts[0];

  if (verb === NONE) {
    if (parts.length !== 2) return REFUSED;
    const id = parts[1].trim().toLowerCase();
    return UUID_RE.test(id) ? { kind: "none_of_them", id } : REFUSED;
  }

  if (verb === PICK) {
    if (parts.length !== 3) return REFUSED;
    const id = parts[1].trim().toLowerCase();
    if (!UUID_RE.test(id)) return REFUSED;
    const rawIndex = parts[2];
    if (!INDEX_RE.test(rawIndex)) return REFUSED;
    return { kind: "pick", id, index: Number(rawIndex) };
  }

  return REFUSED;
}

// ===========================================================================
// 3. La résolution — ce que le tap écrira
// ===========================================================================

/** Ce qui part au port d'écriture, dans la forme qu'il attend déjà. */
export interface ResolvedClarification {
  readonly durable?: RetainedItem[];
  readonly nextPlan?: NextPlanEntry[];
  readonly memo?: MemoLine[];
}

/**
 * L'ENTRÉE EN ATTENTE + L'OPTION CHOISIE → LA LIGNE À ÉCRIRE, ou `null`.
 *
 * ⛔ LE SOCLE EST LE DERNIER MOT. On reconstruit un objet nu et on le fait
 * relire par `parseRetainedItem` / `parseMemoLine`: si la ligne stockée a
 * vieilli entre la question et la réponse — une famille retirée de la matrice,
 * un `when` devenu illisible, un sujet difforme — on rend `null` et l'appelant
 * clôt la question. Écrire une ligne que le socle ne saurait pas relire est
 * pire que ne rien écrire: elle a l'air enregistrée et n'atteint personne.
 *
 * ⚠️ `who` REMPLACE LE SUJET, `what` REMPLACE LE TEXTE. Jamais l'inverse, et
 * jamais les deux: on ne demande qu'UNE chose à la fois, et l'autre moitié de
 * l'entrée est celle que le classifieur a comprise.
 */
export function resolveClarification(
  pending: PendingClarification,
  option: string,
  args: { readonly writtenAt: string },
): ResolvedClarification | null {
  const chosen = String(option ?? "").trim();
  if (!chosen) return null;

  const subject = pending.about === "who"
    ? memberSubject(chosen)
    : pending.subject;
  if (subject === null) return null;

  const text = pending.about === "what" ? chosen : pending.text;
  if (!text.trim()) return null;

  // ── LA NOTE — elle n'a pas de famille, et son moment survit ─────────────
  if (pending.gate === "notes") {
    const line = parseMemoLine({
      text,
      at: pending.at,
      source: CLARIFICATION_PRODUCER,
      quote: pending.note,
      subject,
      when: pending.when,
    });
    return line === null ? null : { memo: [line] };
  }

  // ── LES DEUX PORTES À FAMILLE ──────────────────────────────────────────
  const kind = pending.kind;
  if (kind === null) return null;
  // La matrice du socle vaut des deux côtés: ce que ce producteur ne peut pas
  // ranger au classement, il ne peut pas le ranger au tap non plus.
  if (!canProduce(CLARIFICATION_PRODUCER, kind)) return null;

  const scope = pending.gate === "next_plan"
    ? "next_plan"
    : defaultScopeFor(CLARIFICATION_PRODUCER, kind);
  if (scope === null) return null;

  const item = parseRetainedItem({
    kind,
    scope,
    subject,
    source: CLARIFICATION_PRODUCER,
    text,
    at: pending.at,
    item: "",
    confidence: null,
    quote: pending.note,
    value: null,
  });
  if (item === null) return null;

  if (pending.gate === "next_plan") {
    // ⚠️ L'INSTANT D'ÉCRITURE VOYAGE AVEC LA LIGNE. C'est contre lui que la
    // validation du plan suivant compare pour la tuer (§2.5); sans lui, la vie
    // de l'entrée retombe sur son jour et l'encart redevient calendaire — ce
    // que le lot A a précisément retiré.
    return {
      nextPlan: [{
        item,
        anchor: pending.anchor,
        writtenAt: args.writtenAt,
      }],
    };
  }
  return { durable: [item] };
}

// ===========================================================================
// 4. Ce que la question dit
// ===========================================================================

export type ClarificationLanguage = "fr" | "en";

/**
 * ⚠️ ON CITE LE MORCEAU, PAS LA NOTE ENTIÈRE. « Tu as écrit "ma fille n'aime
 * pas le poisson, et sinon c'était très bien cette semaine, merci" — c'est pour
 * qui ? » noie la question. `text` est ce que le classifieur a extrait: c'est
 * exactement la partie sur laquelle il a buté.
 *
 * ⚠️ ET LES DEUX QUESTIONS SONT DIFFÉRENTES. Poser « c'est pour qui ? » quand
 * on n'a pas compris l'aliment demande à la personne de deviner ce qu'on n'a
 * pas compris — ce qui est la seule chose qu'une relance ne doit jamais faire.
 */
const QUESTION = {
  fr: {
    who: (text: string) => `Tu as écrit « ${text} » — c'est pour qui ?`,
    what: (text: string) => `Tu as écrit « ${text} » — tu parlais de quoi ?`,
    escapeWho: "Personne de la liste",
    escapeWhat: "Aucun de ceux-là",
    view: "Voir",
    declined: "D'accord, je n'ai rien noté.",
    writeFailed: "Je n'ai pas pu l'enregistrer. Réessaie dans un moment.",
  },
  en: {
    who: (text: string) => `You wrote "${text}" — who is that for?`,
    what: (text: string) => `You wrote "${text}" — which one did you mean?`,
    escapeWho: "None of them",
    escapeWhat: "None of those",
    view: "See",
    declined: "OK, I have not saved anything.",
    writeFailed: "I could not save that. Try again in a moment.",
  },
} as const;

export function renderClarificationQuestion(args: {
  readonly about: ClarificationAbout;
  readonly text: string;
  readonly language: ClarificationLanguage;
}): string {
  const copy = QUESTION[args.language] ?? QUESTION.en;
  return args.about === "who" ? copy.who(args.text) : copy.what(args.text);
}

/** Le libellé de l'échappatoire — il suit ce qu'on a demandé. */
export function clarificationEscapeLabel(
  about: ClarificationAbout,
  language: ClarificationLanguage,
): string {
  const copy = QUESTION[language] ?? QUESTION.en;
  return about === "who" ? copy.escapeWho : copy.escapeWhat;
}

export function clarificationViewLabel(language: ClarificationLanguage): string {
  return (QUESTION[language] ?? QUESTION.en).view;
}

export function clarificationDeclinedBody(
  language: ClarificationLanguage,
): string {
  return (QUESTION[language] ?? QUESTION.en).declined;
}

/**
 * ⛔ ON NE DIT JAMAIS « NOTÉ » SUR UNE ÉCRITURE QU'ON N'A PAS FAITE. C'est la
 * moitié qui rend l'autre crédible: un accusé optimiste sur un port en panne
 * apprend à la personne que les accusés ne veulent rien dire.
 */
export function clarificationWriteFailedBody(
  language: ClarificationLanguage,
): string {
  return (QUESTION[language] ?? QUESTION.en).writeFailed;
}
