/// <reference path="../../../tsserver-shims.d.ts" />

/**
 * W8 — CEINTURE « ACCUSÉ FANTÔME SANS EFFET » (la garde la plus importante du
 * produit).
 *
 * LE DÉFAUT MESURÉ, en run réel: un `keel_student` écrit « j'ai fait ma marche
 * de 30 minutes ». Le dispatcher n'émet AUCUN effet. Aucune ligne
 * `protocol_events` n'est écrite. Et le composeur répond quand même « c'est
 * pris en compte ✅ ». L'évaluateur clôture ensuite la ligne mouvement en
 * `missed`. L'élève a suivi son protocole, l'a dit, a été remercié, et est
 * noté défaillant.
 *
 * POURQUOI LES CEINTURES EXISTANTES NE COUVRENT PAS ÇA. Toute la famille
 * `stripTrackClaimWithoutCommit` / `stripCommitClaimBeforeClarify` /
 * `ensureCommittedRenderParity` RÉCONCILIE un rendu avec un LEDGER: elle a
 * besoin d'un effet DEMANDÉ puis bloqué/clarifié pour mordre. Quand le
 * dispatcher n'émet rien, `direct_effect_lane` est vide,
 * `buildDirectEffectConfirmationContext` rend `null`, il n'y a rien à
 * réconcilier — et le composeur écrit librement. C'est exactement le trou:
 * la garde du contrat est indexée sur l'EFFET, alors que le mensonge est
 * indexé sur le MESSAGE DE L'ÉLÈVE.
 *
 * D'où la bascule d'ancrage de ce module: on ne part plus du ledger, on part
 * du FAIT RAPPORTÉ. Si l'élève rapporte un fait accompli et que le tour ne
 * committe RIEN, aucune formule d'accusé n'est autorisée dans le rendu.
 *
 * DOCTRINE P9 — CONDITION DE DÉSARMEMENT (obligatoire, testée):
 *   1. `disarmed_not_keel_student` — hors tour d'élève KEEL, aucune ligne de
 *      protocole n'existe: il n'y a pas de fait à accuser.
 *   2. `disarmed_safety_turn` / `disarmed_restriction_floor_turn` — en crise,
 *      ZÉRO effet durable est le comportement CORRECT (P3/P4); et sous
 *      plancher TCA, la question de liage de plan EST de la pression
 *      d'adhérence. Une garde d'honnêteté ne rachète pas son mensonge en
 *      violant un plancher clinique.
 *   3. `disarmed_effect_committed` — un seul effet committé ce tour et la
 *      ceinture se désarme entièrement: l'accusé est alors VRAI. C'est la
 *      condition principale, et c'est elle qui fera disparaître la garde le
 *      jour où le dispatcher n'émettra plus jamais zéro sur un fait rapporté.
 *   4. `disarmed_future_intent`    — « je vais faire ma marche » n'est pas un
 *      fait. `protocol_events` est APPEND-ONLY: la bonne réponse du runtime
 *      est de ne rien écrire, donc l'absence de commit n'est pas un défaut.
 *   5. `disarmed_question`         — « tu l'as noté ? » est une LECTURE.
 *      L'absence d'écriture est la réponse, pas un mensonge.
 *   6. `disarmed_no_ack_claim`     — le rendu ne prétend rien: rien à retirer.
 *
 * LE DEGRADE EST UTILE, PAS MUET. Se taire réintroduit le même mal sous une
 * autre forme (l'élève croit que c'est passé). La ceinture retire les phrases
 * d'accusé et pose la question de LIAGE manquante — c'est aussi la meilleure
 * UX: elle ramène l'élève vers la ligne du plan, ce qui est précisément
 * l'information que le dispatcher n'a pas su produire.
 *
 * PURETÉ. Tout ce fichier est PUR (aucun I/O, aucune horloge, aucun réseau).
 * Le compteur d'observabilité est isolé dans `recordKeelAckGuardTrigger`, que
 * l'appelant (`router/run.ts`) invoque explicitement — la garde elle-même ne
 * mute rien.
 */

export type AckGuardLocale = "en" | "fr";

export type ReportedFactReasonCode =
  | "completed_fact"
  | "future_intent"
  | "question"
  | "no_completed_fact_marker"
  | "empty_message";

export type ReportedFactDetection = {
  reports_completed_fact: boolean;
  /** Langue du LEXIQUE qui a mordu — jamais devinée par statistique. */
  locale: AckGuardLocale;
  reason_code: ReportedFactReasonCode;
  /**
   * L'objet rapporté, cité depuis le message BRUT (accents et casse
   * préservés) — jamais une reformulation. Null quand rien de citable ne
   * suit le marqueur.
   */
  reported_object: string | null;
};

export type KeelAckGuardReasonCode =
  | "ack_without_committed_effect"
  | "disarmed_not_keel_student"
  | "disarmed_safety_turn"
  | "disarmed_restriction_floor_turn"
  | "disarmed_effect_committed"
  | "disarmed_future_intent"
  | "disarmed_question"
  | "disarmed_no_completed_fact"
  | "disarmed_no_ack_claim";

export type KeelAckGuardResult = {
  text: string;
  triggered: boolean;
  reason_code: KeelAckGuardReasonCode;
  stripped_sentences: number;
  detection: ReportedFactDetection;
};

// ---------------------------------------------------------------------------
// Normalisation — tokens, pour garder la trace vers le texte BRUT
// ---------------------------------------------------------------------------

type Token = {
  /** ASCII minuscule sans diacritique ni ponctuation. */
  norm: string;
  /** Bornes du token dans le message ORIGINAL — ce qui rend la citation exacte. */
  start: number;
  end: number;
  /** Le token est suivi d'une ponctuation de fin de proposition. */
  terminates: boolean;
};

const TOKEN_SPLIT = /[^\s ’'`]+/gu;

/**
 * Découpe sur les espaces ET les apostrophes (« j'ai » → `j` + `ai`), pour que
 * les motifs de fait restent lisibles.
 *
 * On garde les BORNES dans le message original plutôt que le morceau découpé:
 * une citation reconstruite depuis les morceaux rendrait « aujourd'hui » en
 * « aujourd hui ». La ceinture CITE l'élève, elle ne le réécrit pas.
 */
function tokenize(message: string): Token[] {
  const src = String(message ?? "");
  const tokens: Token[] = [];
  TOKEN_SPLIT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_SPLIT.exec(src)) !== null) {
    const piece = match[0];
    const norm = piece
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!norm) continue;
    tokens.push({
      norm,
      start: match.index,
      end: match.index + piece.length,
      terminates: /[.!?;:,…]$/.test(piece),
    });
  }
  return tokens;
}

/** ` t0 t1 … tn ` + l'offset de départ de chaque token dans cette chaîne. */
function joinNormalized(
  tokens: readonly Token[],
): { text: string; offsets: number[] } {
  let text = " ";
  const offsets: number[] = [];
  for (const token of tokens) {
    offsets.push(text.length);
    text += `${token.norm} `;
  }
  return { text, offsets };
}

/** Normalisation d'une phrase du RENDU (pas d'index à conserver ici). */
function normalizeSentence(text: string): string {
  return joinNormalized(tokenize(text)).text;
}

// ---------------------------------------------------------------------------
// Lexiques — FAIT ACCOMPLI
// ---------------------------------------------------------------------------

/**
 * Adverbes tolérés ENTRE l'auxiliaire et le participe. `pas`/`plus`/`jamais`
 * sont dedans À DESSEIN: « j'ai pas fait ma marche » est un fait rapporté
 * (il doit produire un `missed`), et un accusé sans écriture y est
 * exactement aussi mensonger que sur un succès.
 */
const FR_INTERSTITIAL = [
  "bien", "deja", "enfin", "juste", "quand", "meme", "pas", "plus", "jamais",
  "rien", "presque", "quasiment", "vraiment", "finalement", "aussi", "tout",
  "quasi", "carrement", "meme",
];

/**
 * Participes passés — liste EXPLICITE. Un motif purement morphologique
 * (« tout mot en -é/-i/-u après j'ai ») attrape « j'ai une question » et
 * « j'ai un problème »: la ceinture la plus importante du produit ne peut pas
 * mordre sur une question. Le prix est une liste à étendre; le bénéfice est
 * qu'un faux positif se voit en revue de liste, pas en run.
 */
const FR_PAST_PARTICIPLES = [
  "fait", "faite", "faits", "faites",
  "mange", "mangee", "manges", "mangees",
  "pris", "prise", "prises",
  "bu", "bue", "bus",
  "marche", "marchee",
  "couru", "courue",
  "nage", "nagee",
  "dormi", "dormie",
  "medite", "meditee",
  "respire", "respiree",
  "termine", "terminee",
  "fini", "finie", "finis",
  "avale", "avalee",
  "complete", "completee",
  "suivi", "suivie",
  "tenu", "tenue",
  "reussi", "reussie",
  "saute", "sautee",
  "rate", "ratee",
  "oublie", "oubliee",
  "prepare", "preparee",
  "cuisine", "cuisinee",
  "teste", "testee",
  "essaye", "essayee",
  "commence", "commencee",
  "arrete", "arretee",
  "ajoute", "ajoutee",
  "evite", "evitee",
  "remplace", "remplacee",
  "pese", "pesee",
  "mesure", "mesuree",
  "entraine", "entrainee",
  "bouge", "bougee",
  "etire", "etiree",
  "hydrate", "hydratee",
  "applique", "appliquee",
  "sorti", "sortie",
  "alle", "allee",
  "parti", "partie",
  "reste", "restee",
  "rentre", "rentree",
  "vu", "vue",
  "lu", "lue",
  "eu", "eue",
];

const FR_FACT_SUBJECTS = [
  "j ai", "jai",
  "je l ai", "je lai", "je les ai",
  "je me suis", "je suis",
  "on a", "on est",
  "nous avons", "nous sommes",
];

/** Marqueurs FR sans objet extractible — le fait est porté par la locution. */
const FR_STANDALONE_FACT = [
  " c est fait ", " cest fait ", " c etait fait ",
  " ca y est ", " voila c est fait ", " mission accomplie ",
];

const EN_INTERSTITIAL = [
  "just", "already", "finally", "also", "actually", "only", "barely",
  "totally", "really", "this", "morning", "afternoon", "evening", "today",
  "yesterday", "tonight", "all", "my", "the",
];

const EN_PAST_FORMS = [
  "did", "done",
  "ate", "eaten",
  "took", "taken",
  "had",
  "drank", "drunk",
  // `run` et `hit` sont EXCLUS: leurs formes de présent sont identiques
  // (« I run every morning » n'est pas un rapport de fait daté). Les formes
  // ambiguës coûtent des faux positifs à une ceinture qui réécrit le rendu.
  "walked", "ran", "jogged", "swam", "cycled", "biked",
  "slept", "napped",
  "meditated", "breathed", "stretched", "trained", "worked", "lifted",
  "moved", "hydrated",
  "finished", "completed", "made", "cooked", "prepped", "prepared",
  "skipped", "missed", "forgot", "avoided", "replaced", "swapped",
  "weighed", "measured", "tested", "tried", "started", "stopped",
  "managed", "went", "kept", "followed", "logged",
];

const EN_FACT_SUBJECTS = [
  "i ve", "ive", "i have", "we ve", "weve", "we have",
  "i", "we",
];

/**
 * Négation EN: « I didn't do my walk ». Le FR l'obtient gratuitement par
 * l'interstitiel `pas`; l'anglais a besoin de sa propre passe parce que le
 * verbe y revient à la BASE après l'auxiliaire nié.
 */
const EN_NEGATED_AUX = [
  "did not", "didn t", "didnt",
  "have not", "haven t", "havent",
  "was not", "wasn t", "wasnt",
];

const EN_BASE_VERBS = [
  "do", "eat", "take", "drink", "walk", "run", "jog", "swim", "sleep",
  "meditate", "breathe", "stretch", "train", "cook", "prep", "prepare",
  "finish", "complete", "make", "manage", "get", "go", "hit", "follow",
  "log", "weigh", "measure", "move",
];

const EN_STANDALONE_FACT = [
  " it s done ", " its done ", " that s done ", " thats done ",
  " all done ", " done and dusted ",
];

// ---------------------------------------------------------------------------
// Lexiques — QUESTION (désarmement) et INTENTION FUTURE (désarmement)
// ---------------------------------------------------------------------------

/**
 * Question de STATUT: elle bat le marqueur de fait, y compris quand les deux
 * cohabitent (« j'ai fait ma marche, tu l'as notée ? »). Le tour est une
 * lecture; l'absence d'écriture y est la réponse, pas un accusé fantôme.
 */
const STATUS_QUESTION_PATTERNS: RegExp[] = [
  / tu (l |les |le |la )?as (bien )?(note|notee|enregistre|enregistree|coche|cochee|compte|comptee|pris en compte) /,
  / (c est|cest) (bien )?(note|enregistre|coche|compte) \?/,
  / est ce que (tu|c est|ca) /,
  / tu peux (verifier|confirmer|regarder) /,
  / (verifie|confirme) (stp|s il te plait|que) /,
  / (did|have) you (log|logged|record|recorded|note|noted|track|tracked) /,
  / (is|was) (it|that|this) (logged|recorded|noted|tracked|counted) /,
  / (can|could) you (check|confirm) /,
  / (what|where|how much|how many) /,
];

const FUTURE_INTENT_PATTERNS: RegExp[] = [
  / (je |j )(vais|compte|prevois|pense|dois|devrais|essaierai|ferai)( bien| encore| juste)?( le| la| les| l| m y| y| en| me| m)* /,
  / (je le|je la|je les|j y) (ferai|prendrai|mangerai|boirai) /,
  / (ce soir|demain|tout a l heure|plus tard) je /,
  / on verra (si|ce|demain|ca) /,
  / (i|we) (will|ll|am going to|m going to|are going to|re going to|plan to|intend to|might|should|need to|have to|want to) /,
  / (i|we) (ll|will) (do|eat|take|drink|walk|run|try|start|get) /,
  / (later|tonight|tomorrow) (i|we) (will|ll|m|am) /,
];

// ---------------------------------------------------------------------------
// Lexiques — FORMULE D'ACCUSÉ dans le RENDU
// ---------------------------------------------------------------------------

/**
 * Les deux lexiques sont testés QUELLE QUE SOIT la langue détectée du
 * message: la langue de réponse (R3 `conversation_locale`) est un axe
 * distinct de la langue du message, et le pilote force `en-US` pendant que
 * les personas écrivent en français.
 */
const ACK_CLAIM_PATTERNS: RegExp[] = [
  // Accusé SEC en tête de phrase (« Noté. », « Recorded. », « Logged ✅ »):
  // aucun sujet, aucun objet — les motifs sujet+verbe ci-dessous le rataient
  // alors que c'est la forme la plus courante du composeur.
  /^ (note|notee|enregistre|enregistree|coche|cochee|logged|recorded|noted|tracked|counted) /,
  // ── FR
  / pris en compte /,
  / (c est|cest|c etait|ca y est|voila) (bien |deja |c est )?(note|notee|enregistre|enregistree|coche|cochee|compte|comptee|valide|validee|ajoute|ajoutee) /,
  / (bien|super|parfait|nickel) (note|notee|enregistre|enregistree|recu et note) /,
  / (j ai|jai|je l ai|je lai|je les ai) (bien |deja |tout )?(note|notee|notes|enregistre|enregistree|coche|cochee|compte|comptee|ajoute|ajoutee|valide|validee|marque|marquee) /,
  / je (note|enregistre|coche|compte|marque|valide|ajoute) (ca|cela|tout ca|ton|ta|tes|le|la|les|donc) /,
  / (ajoute|ajoutee|enregistre|enregistree|note|notee|verse|versee) (a|dans|sur) (ton|ta|tes) (suivi|journal|plan|bilan|protocole|releve) /,
  / (est|sont) (bien )?(note|notee|notes|notees|enregistre|enregistree|enregistres|enregistrees|coche|cochee|coches|cochees|compte|comptee|comptes|comptees) /,
  / (mis|mise|ajoute|ajoutee) (dans|a) (ton|ta|tes) (suivi|journal|plan|bilan|protocole) /,
  // ── EN
  / taken into account /,
  / (i ve|ive|i have|i just|i) (logged|recorded|noted|marked|tracked|counted|added) /,
  / (logged|recorded|noted|marked|tracked|counted) (it|that|this|your|both|them) /,
  / (it s|its|that s|thats|this is|it is|that is|all) (now )?(logged|recorded|noted|tracked|counted|marked) /,
  / (added|logged|recorded|saved) (it |that |this )?(to|in|on) your (log|plan|tracker|record|protocol|journal) /,
  / (checked|ticked) (it |that |them )?off /,
  / marked as (done|complete|completed) /,
  / (is|are) (now )?(logged|recorded|noted|tracked|counted|marked) /,
  / (consider|considered) (it|that) (done|logged|recorded) /,
];

/** Les cases à cocher du produit: « ✅ » EST une formule d'accusé. */
const ACK_GLYPH_PATTERN = /[✅✔☑🟢]/u;

/**
 * « got it » n'est un accusé QUE au sens de consigne enregistrée. Nu, dans
 * « got it, that makes sense », c'est de l'écoute. On exige donc soit une
 * phrase COURTE et autonome (l'accusé sec), soit un co-occurrent de
 * journalisation dans la même phrase.
 */
function isDirectiveGotIt(normalizedSentence: string): boolean {
  if (!/ got it /.test(normalizedSentence)) return false;
  const tokenCount = normalizedSentence.trim().split(/\s+/).filter(Boolean)
    .length;
  if (tokenCount <= 6) return true;
  return /(logged|recorded|noted|tracked|counted|marked|plan|protocol|log)/
    .test(normalizedSentence);
}

// ---------------------------------------------------------------------------
// Construction des motifs de fait
// ---------------------------------------------------------------------------

function alternation(values: readonly string[]): string {
  // Les plus longs d'abord: « je viens de » ne doit pas être mangé par « je ».
  return [...values]
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const FR_FACT_PATTERN = new RegExp(
  ` (?:${alternation(FR_FACT_SUBJECTS)}) ` +
    `(?:(?:${alternation(FR_INTERSTITIAL)}) )*` +
    `(?:${alternation(FR_PAST_PARTICIPLES)}) `,
);

const EN_FACT_PATTERN = new RegExp(
  ` (?:${alternation(EN_FACT_SUBJECTS)}) ` +
    `(?:(?:${alternation(EN_INTERSTITIAL)}) )*` +
    `(?:${alternation(EN_PAST_FORMS)}) `,
);

/**
 * Passé récent FR: après « je viens de » le verbe repasse à l'INFINITIF, donc
 * la liste de participes ne peut pas l'attraper. Motif STRUCTUREL (morphologie
 * -er/-ir/-re/-oir), sans risque de faux positif ici parce que la locution
 * « venir de + infinitif » n'existe qu'au sens accompli.
 */
const FR_RECENT_PAST_PATTERN = new RegExp(
  ` (?:je viens de|je viens d|on vient de|on vient d|je venais de) ` +
    `(?:(?:${alternation(FR_INTERSTITIAL)}) )*` +
    `[a-z]{2,}(?:er|ir|re|oir) `,
);

const EN_NEGATED_FACT_PATTERN = new RegExp(
  ` (?:i|we) (?:${alternation(EN_NEGATED_AUX)}) ` +
    `(?:(?:${alternation(EN_INTERSTITIAL)}) )*` +
    `(?:${alternation(EN_BASE_VERBS)}) `,
);

// ---------------------------------------------------------------------------
// Extraction de l'objet rapporté
// ---------------------------------------------------------------------------

const OBJECT_STOP_TOKENS = new Set([
  "et", "mais", "puis", "donc", "alors", "car", "parce", "sinon",
  "and", "but", "then", "so", "because", "although", "though",
]);

const POSSESSIVE_FLIP: Record<string, string> = {
  ma: "ta", mon: "ton", mes: "tes",
  my: "your", our: "your",
};

const MAX_OBJECT_TOKENS = 12;
const MAX_OBJECT_CHARS = 70;

function firstTokenIndexAtOrAfter(
  offsets: readonly number[],
  charIndex: number,
): number {
  for (let i = 0; i < offsets.length; i += 1) {
    if (offsets[i] >= charIndex) return i;
  }
  return -1;
}

/**
 * L'objet est CITÉ, jamais reformulé: on rend une TRANCHE du message original
 * (accents, casse, traits d'union, apostrophes internes préservés). La seule
 * transformation autorisée est le retournement du possessif de 1re en 2e
 * personne (« ma marche » → « ta marche »), qui est de la grammaire, pas de
 * l'interprétation.
 */
function extractReportedObject(
  message: string,
  tokens: readonly Token[],
  offsets: readonly number[],
  matchEndCharIndex: number,
): string | null {
  const source = String(message ?? "");
  const start = firstTokenIndexAtOrAfter(offsets, matchEndCharIndex);
  if (start < 0) return null;
  let last = -1;
  let picked = 0;
  for (
    let i = start;
    i < tokens.length && picked < MAX_OBJECT_TOKENS;
    i += 1
  ) {
    const token = tokens[i];
    if (OBJECT_STOP_TOKENS.has(token.norm)) break;
    last = i;
    picked += 1;
    if (token.terminates) break;
  }
  if (last < 0) return null;
  // Un objet fait de mots-outils (« le », « ça ») n'est pas citable: mieux
  // vaut la formulation générique que de renvoyer « ta le » à l'élève.
  const meaningful = tokens.slice(start, last + 1).some((token) =>
    token.norm.length >= 3
  );
  if (!meaningful) return null;
  const flipped = POSSESSIVE_FLIP[tokens[start].norm];
  const head = flipped ?? source.slice(tokens[start].start, tokens[start].end);
  let out = (head + source.slice(tokens[start].end, tokens[last].end))
    .replace(/[.,;:!?…]+$/, "")
    .trim();
  while (out.length > MAX_OBJECT_CHARS && out.includes(" ")) {
    out = out.slice(0, out.lastIndexOf(" ")).replace(/[.,;:!?…]+$/, "");
  }
  return out || null;
}

// ---------------------------------------------------------------------------
// LE DÉTECTEUR (pur)
// ---------------------------------------------------------------------------

/**
 * Le message de l'élève rapporte-t-il un FAIT ACCOMPLI ?
 *
 * Ordre d'arbitrage, et il est intentionnel:
 *   question de statut  >  fait accompli  >  intention future  >  interrogative nue
 *
 * Le fait passe AVANT le futur (doctrine intake track: « le passé composé
 * désarme le futur » — « j'ai fait ma marche, je ferai le yoga demain » est
 * un rapport de fait). La question de statut passe avant TOUT: une lecture
 * n'a rien à committer, donc rien à accuser.
 */
export function detectCompletedFactReport(message: string): ReportedFactDetection {
  const tokens = tokenize(message);
  if (tokens.length === 0) {
    return {
      reports_completed_fact: false,
      locale: "en",
      reason_code: "empty_message",
      reported_object: null,
    };
  }
  const { text, offsets } = joinNormalized(tokens);
  const raw = String(message ?? "");

  if (STATUS_QUESTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      reports_completed_fact: false,
      locale: guessLexiconLocale(text),
      reason_code: "question",
      reported_object: null,
    };
  }

  const frMatch = FR_RECENT_PAST_PATTERN.exec(text) ?? FR_FACT_PATTERN.exec(text);
  if (frMatch) {
    return {
      reports_completed_fact: true,
      locale: "fr",
      reason_code: "completed_fact",
      reported_object: extractReportedObject(
        raw,
        tokens,
        offsets,
        frMatch.index + frMatch[0].length,
      ),
    };
  }
  if (FR_STANDALONE_FACT.some((phrase) => text.includes(phrase))) {
    return {
      reports_completed_fact: true,
      locale: "fr",
      reason_code: "completed_fact",
      reported_object: null,
    };
  }

  const enMatch = EN_NEGATED_FACT_PATTERN.exec(text) ??
    EN_FACT_PATTERN.exec(text);
  if (enMatch) {
    return {
      reports_completed_fact: true,
      locale: "en",
      reason_code: "completed_fact",
      reported_object: extractReportedObject(
        raw,
        tokens,
        offsets,
        enMatch.index + enMatch[0].length,
      ),
    };
  }
  if (EN_STANDALONE_FACT.some((phrase) => text.includes(phrase))) {
    return {
      reports_completed_fact: true,
      locale: "en",
      reason_code: "completed_fact",
      reported_object: null,
    };
  }

  if (FUTURE_INTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      reports_completed_fact: false,
      locale: guessLexiconLocale(text),
      reason_code: "future_intent",
      reported_object: null,
    };
  }
  if (raw.trim().endsWith("?")) {
    return {
      reports_completed_fact: false,
      locale: guessLexiconLocale(text),
      reason_code: "question",
      reported_object: null,
    };
  }
  return {
    reports_completed_fact: false,
    locale: guessLexiconLocale(text),
    reason_code: "no_completed_fact_marker",
    reported_object: null,
  };
}

/**
 * Langue du message quand aucun lexique de fait n'a mordu. Ne sert QUE à
 * choisir la langue d'un dégradé; jamais à décider si la garde mord.
 */
function guessLexiconLocale(normalizedText: string): AckGuardLocale {
  const frenchMarkers =
    / (je|j|tu|le|la|les|ma|mon|mes|pas|est|c est|ce|ca|pour|avec|demain|soir|matin) /g;
  const hits = normalizedText.match(frenchMarkers)?.length ?? 0;
  return hits >= 2 ? "fr" : "en";
}

/** Le rendu contient-il une formule d'accusé ? (pur) */
export function containsAcknowledgementClaim(text: string): boolean {
  return acknowledgementClaimSentenceIndexes(text).length > 0;
}

/** Index des phrases du rendu qui portent une formule d'accusé. (pur) */
export function acknowledgementClaimSentenceIndexes(text: string): number[] {
  const sentences = splitSentences(String(text ?? ""));
  const hits: number[] = [];
  sentences.forEach((sentence, index) => {
    if (!sentence.trim()) return;
    const normalized = normalizeSentence(sentence);
    const matched =
      ACK_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized)) ||
      isDirectiveGotIt(normalized) ||
      ACK_GLYPH_PATTERN.test(sentence);
    if (matched) hits.push(index);
  });
  return hits;
}

/**
 * Le glyphe de coche est un TERMINATEUR ici, au même titre qu'un point. Le
 * composeur écrit « ...c'est pris en compte ✅ Continue comme ça ! » sans
 * ponctuation intercalaire: sans cette règle, retirer l'accusé emporterait
 * l'encouragement légitime avec lui (la ceinture doit être chirurgicale,
 * pas mutilante).
 */
/**
 * W12-V — LE DRAPEAU `u` EST LA CORRECTION, PAS UN DÉTAIL DE STYLE.
 *
 * Sans lui, `🟢` (U+1F7E2) n'entre pas dans la classe comme UN point de code
 * mais comme ses DEUX demi-surrogates `\uD83D` et `\uDFE2`. Or `\uD83D` est
 * aussi la moitié haute de 🙂 (U+1F642), de 🎉, de 🙏 — de la quasi-totalité
 * des émojis que le composeur pose en fin d'accusé. Le lookbehind coupait donc
 * ENTRE les deux moitiés: « Recorded 🙂 » se découpait en
 * `["Recorded \uD83D", "\uDE42"]`, la première moitié partait avec l'accusé
 * retiré et la seconde restait en tête du rendu. Sortie mesurée:
 * `"\uDE42\n\nI couldn't tell which line…"` — une chaîne UTF-16 MAL FORMÉE,
 * qui s'affiche « � » chez l'élève et casse toute sérialisation stricte en
 * aval. La ceinture la plus importante du produit produisait un artefact
 * visible sur le style de composeur le PLUS courant.
 *
 * Avec `u`, la classe contient quatre points de code et le lookbehind ne peut
 * plus tomber au milieu d'une paire.
 */
/**
 * ⚠️ DÉFAUT CONNU, NON CORRIGÉ ICI (constaté le 2026-08-12, lot « couture »):
 * ce découpage coupe sur le POINT DÉCIMAL. « Nutella has 56.3 g of sugar. »
 * devient `["Nutella has 56.", "3 g of sugar."]`, et une ceinture qui retire
 * la seconde laisse « Nutella has 56. » dans la bulle.
 *
 * Non touché EXPRÈS: `guardKeelAckWithoutCommittedEffect` est la garde la plus
 * importante du produit, épinglée par 7 tests et par une cicatrice de mémoire
 * (`ack-guard-eats-grounded-citations`). En changer le découpage déplace CHAQUE
 * frontière de phrase de la garde, donc chaque morsure — c'est un lot à soi,
 * avec sa campagne de mesure. `_shared/keel/turn_ledger.ts` porte le découpage
 * corrigé (`splitBeltSentences`) et explique pourquoi il n'emprunte pas
 * celui-ci.
 */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?\n✅✔☑🟢])/u);
}

// ---------------------------------------------------------------------------
// LE DÉGRADÉ — honnête ET utile
// ---------------------------------------------------------------------------

/**
 * Prose de repli. Elle vit ici, côté runtime, comme TOUS les replis de
 * ceinture de `router/run.ts`: c'est une sortie de secours déterministe, pas
 * une chaîne d'interface. Le jour où le pack i18n couvre le backend, ces
 * quatre chaînes deviennent des clés — la structure est déjà là.
 */
export function keelUnboundReportClarifyQuestion(
  locale: AckGuardLocale,
  reportedObject: string | null,
): string {
  const object = String(reportedObject ?? "").trim();
  // Les quatre variantes POSENT UNE QUESTION, toujours: un dégradé affirmatif
  // laisserait l'élève sans prise et reproduirait le mal (il croirait que
  // c'est passé). La question est la sortie vers le liage explicite.
  if (locale === "fr") {
    return object
      ? `Je n'ai pas su à quelle ligne de ton plan rattacher ça — c'est bien « ${object} » ? Dis-moi laquelle et je l'enregistre.`
      : "Je n'ai pas su à quelle ligne de ton plan rattacher ce que tu me dis — c'est laquelle ?";
  }
  return object
    ? `I couldn't tell which line of your plan to attach that to — is it "${object}"? Tell me which one and I'll log it.`
    : "I couldn't tell which line of your plan to attach that to — which one is it?";
}

// ---------------------------------------------------------------------------
// LA CEINTURE (pure)
// ---------------------------------------------------------------------------

export type KeelAckGuardInput = {
  /** Le rendu tel que le composeur l'a produit. */
  text: string;
  /** Le message de l'élève, VERBATIM. */
  userMessage: string;
  isKeelStudent: boolean;
  /** Nombre d'effets durables COMMITTÉS ce tour (lignes relues, pas demandes). */
  committedEffectCount: number;
  /** Tour de crise: la ceinture reste au fourreau (condition 2). */
  isSafetyTurn?: boolean;
  /**
   * Tour tenu par le PLANCHER TCA (`disordered_eating_guard`). Même
   * traitement que la crise, pour une raison propre: le dégradé de cette
   * ceinture demande « à quelle ligne de ton plan je rattache ça ? », ce qui
   * est de la PRESSION D'ADHÉRENCE — exactement ce que le plancher existe
   * pour interdire. Une garde d'honnêteté ne rachète pas son mensonge en
   * violant un plancher clinique.
   */
  isRestrictionFloorTurn?: boolean;
};

export function guardKeelAckWithoutCommittedEffect(
  input: KeelAckGuardInput,
): KeelAckGuardResult {
  const source = String(input.text ?? "");
  const detection = detectCompletedFactReport(input.userMessage);
  const disarmed = (reason: KeelAckGuardReasonCode): KeelAckGuardResult => ({
    text: source,
    triggered: false,
    reason_code: reason,
    stripped_sentences: 0,
    detection,
  });

  if (!input.isKeelStudent) return disarmed("disarmed_not_keel_student");
  if (input.isSafetyTurn === true) return disarmed("disarmed_safety_turn");
  if (input.isRestrictionFloorTurn === true) {
    return disarmed("disarmed_restriction_floor_turn");
  }
  if ((input.committedEffectCount ?? 0) > 0) {
    return disarmed("disarmed_effect_committed");
  }
  if (!detection.reports_completed_fact) {
    if (detection.reason_code === "future_intent") {
      return disarmed("disarmed_future_intent");
    }
    if (detection.reason_code === "question") {
      return disarmed("disarmed_question");
    }
    return disarmed("disarmed_no_completed_fact");
  }
  if (!source.trim()) return disarmed("disarmed_no_ack_claim");

  const offending = new Set(acknowledgementClaimSentenceIndexes(source));
  if (offending.size === 0) return disarmed("disarmed_no_ack_claim");

  const sentences = splitSentences(source);
  const kept = sentences.filter((_sentence, index) => !offending.has(index));
  const cleaned = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  const clarify = keelUnboundReportClarifyQuestion(
    detection.locale,
    detection.reported_object,
  );
  return {
    text: cleaned ? `${cleaned}\n\n${clarify}` : clarify,
    triggered: true,
    reason_code: "ack_without_committed_effect",
    stripped_sentences: offending.size,
    detection,
  };
}

// ---------------------------------------------------------------------------
// Observabilité — le SEUL état mutable du module, isolé de la garde
// ---------------------------------------------------------------------------

let triggerCount = 0;

/**
 * Compteur d'isolat. Le canal de mesure DURABLE est
 * `logRuntimeGuardEvent({ guard: KEEL_ACK_GUARD_NAME })` côté appelant, qui
 * écrit dans `system_error_logs` (source `guards`) et remonte dans le fil
 * admin: c'est là qu'on lit le TAUX RÉEL. Ce compteur-ci sert au log de tour
 * et aux tests.
 */
export const KEEL_ACK_GUARD_NAME = "keel_ack_without_committed_effect";

export function recordKeelAckGuardTrigger(): number {
  triggerCount += 1;
  return triggerCount;
}

export function keelAckGuardTriggerCount(): number {
  return triggerCount;
}

export function resetKeelAckGuardTriggerCount(): void {
  triggerCount = 0;
}
