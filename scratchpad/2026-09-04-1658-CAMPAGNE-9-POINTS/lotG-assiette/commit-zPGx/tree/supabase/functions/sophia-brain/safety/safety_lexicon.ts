// Deterministic safety lexicon (EN + FR) — W3.1.
//
// This module is DATA + MATCHING ONLY. It knows nothing about routing, the
// dispatcher, or the LLM. Its single job: given a raw user message, decide
// whether a *deterministic* floor applies, and say WHY (entry id, cluster,
// canonical reason_code) or why NOT (named disarm condition).
//
// ---------------------------------------------------------------------------
// DOCTRINE (why the floor sits BELOW the LLM contract band)
// ---------------------------------------------------------------------------
// The dispatcher prompt (rules 1b/1c/1d) puts passive ideation, worthlessness
// and hopelessness at "medium minimum". That band is asserted by a classifier
// that sees the whole conversation, the plan, the register and the referent.
// A lexical match sees a substring. It carries strictly LESS evidence, and it
// is IRREVERSIBLE (a floor cannot be argued down). So the deterministic floor
// is deliberately one notch below the LLM contract on the ambiguous clusters:
//
//   cluster                     | deterministic floor | LLM contract band
//   suicidal_intent_active      | high (critical with imminence/means)
//   self_harm_intent            | high (critical with imminence/means)
//   suicidal_ideation_passive   | medium (high with means)  | medium min
//   distress_acute              | low  (traceable, blocks NOTHING) | medium min
//
// A floor of `low` is not decorative: `low` is the band the prompt itself uses
// to "garder la trace sans rien bloquer" (rule 1d-bis b). It guarantees that a
// message carrying worthlessness/hopelessness vocabulary can never be traced as
// `none`, which is what makes the trigger rate measurable at all.
//
// ---------------------------------------------------------------------------
// STRUCTURAL ANTI-FALSE-POSITIVE #1: every pattern carries its own referent
// ---------------------------------------------------------------------------
// No entry matches a bare verb phrase. Every entry contains an explicit
// first-person self referent (`me`, `moi`, `myself`, `i`) or an unambiguous
// life referent (`ma vie`, `mes jours`, `my life`). This is why "tout arreter"
// / "tout supprimer" — the product-frustration idiom that the dispatcher prompt
// spends a paragraph disambiguating — is NOT in this lexicon at all. A belt
// that cannot see the referent must not fire on referent-dependent language.
//
// ---------------------------------------------------------------------------
// CONDITIONS DE DESARMEMENT (doctrine P9)
// ---------------------------------------------------------------------------
// Every belt here carries, in data, the exhaustive list of conditions under
// which it does NOT fire (`disarmable_by`). The conditions are named, tested
// one by one against a false-premise carrier (`safety_pregate.disarm.test.ts`),
// and two structural tests keep the set honest:
//   - each entry's bare `probe` MUST fire      (no permanently disarmed belt)
//   - each disarm condition MUST disarm something (no dead guard)
//
// Conditions:
//   negation                 — an explicit negative particle in the same clause,
//                              within 30 chars before the span. NOT triggered by
//                              `ne`/`n'`/`plus` alone: "je n'ai plus envie de
//                              vivre" is the WORSE reading, not the negation.
//                              Itself disarmed by an escalator ("j'ai peur de",
//                              "je sais pas comment", "i'm scared i").
//   quoted_or_reported       — the span sits inside quotes or after a reported
//                              speech marker ("il m'a dit", "he said", "dans le
//                              film").
//   humor_register           — laughter markers or a fixed dark idiom
//                              ("mourir de rire", "mdr", "die laughing").
//   historical_distant       — a distant past marker with NO present anchor.
//                              A present anchor ("ca revient", "en ce moment",
//                              "again") re-arms the belt.
//   third_party_referent     — the sentence names someone else as the subject.
//   hypothetical_framing     — "si quelqu'un", "what if someone", "pour un ami".
//   task_or_product_referent — the sentence scopes the phrase to an artifact or
//                              a task (compte, appli, dossier, projet, boulot).
//                              NEVER available to the unambiguous clusters:
//                              "je veux me suicider, mon boulot me detruit"
//                              must keep firing.
//   scoped_self_deprecation  — worthlessness scoped to a usage ("je suis nulle
//                              AVEC mon telephone").
//   effort_or_accident_register — effort/gym or accidental-injury register
//                              ("me tuer a la salle", "cut myself shaving").
//                              Only offered to entries whose surface IS such an
//                              idiom.
//
// Non-input: `recent_messages`. The floor is computed from the CURRENT message
// only, per dispatcher rule 1d-bis (a) — "safety.evidence vient UNIQUEMENT du
// message COURANT". Trailing risk is a separate, already existing layer
// (`conversation_risk_history`); duplicating it here would make a floor that
// no message can lower.

import type { RiskBand } from "../contracts/turn_frame.v1.ts";

export type SafetyCluster =
  | "suicidal_intent_active"
  | "self_harm_intent"
  | "suicidal_ideation_passive"
  | "distress_acute";

export type LexiconLang = "en" | "fr";

export type DisarmId =
  | "negation"
  | "quoted_or_reported"
  | "humor_register"
  | "historical_distant"
  | "third_party_referent"
  | "hypothetical_framing"
  | "task_or_product_referent"
  | "scoped_self_deprecation"
  | "effort_or_accident_register";

export type SafetyLexiconEntry = {
  /** ASCII snake_case, stable across versions: it is written to the trace. */
  id: string;
  cluster: SafetyCluster;
  lang: LexiconLang;
  /** Canonical dispatcher vocabulary (routers branch on these exact codes). */
  reason_code: string;
  floor: RiskBand;
  pattern: RegExp;
  /** Exhaustive list of conditions that may silence THIS entry. */
  disarmable_by: DisarmId[];
  /** A message that MUST fire this entry (belt-integrity test). */
  probe: string;
};

// Conditions available to every entry: they invalidate the *utterance*, not the
// scope of the phrase.
const UNIVERSAL_DISARMS: DisarmId[] = [
  "negation",
  "quoted_or_reported",
  "humor_register",
  "historical_distant",
  "third_party_referent",
  "hypothetical_framing",
];

// Conditions available only where the phrase is genuinely scope-dependent.
const SCOPE_DISARMS: DisarmId[] = [
  ...UNIVERSAL_DISARMS,
  "task_or_product_referent",
];

export const SAFETY_LEXICON: SafetyLexiconEntry[] = [
  // -------------------------------------------------------------------------
  // FR — suicidal_intent_active
  // -------------------------------------------------------------------------
  {
    id: "fr_suicide_verb",
    cluster: "suicidal_intent_active",
    lang: "fr",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern: /\bme suicid(?:er|e|ais|erai|erais)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "je pense a me suicider",
  },
  {
    id: "fr_kill_self",
    cluster: "suicidal_intent_active",
    lang: "fr",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern: /\bme (?:tuer|flinguer|pendre|buter|foutre en l'air)\b/,
    // "me tuer" is also the French idiom for over-exertion ("me tuer a la
    // salle") — the effort register is a legitimate disarm HERE and nowhere
    // else.
    disarmable_by: [...UNIVERSAL_DISARMS, "effort_or_accident_register"],
    probe: "je vais me tuer",
  },
  {
    id: "fr_end_life",
    cluster: "suicidal_intent_active",
    lang: "fr",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern:
      /\b(?:mettre fin a (?:mes jours|ma vie)|en finir avec (?:la vie|tout ca|tout|moi))\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "je veux mettre fin a mes jours",
  },
  {
    id: "fr_end_it",
    cluster: "suicidal_intent_active",
    lang: "fr",
    reason_code: "suicidal_ideation",
    floor: "high",
    // Ambiguous surface ("en finir avec ce dossier"): scope disarms apply.
    pattern: /\bj(?:e|') ?(?:veux|vais|voudrais|compte|aimerais) en finir\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "je veux en finir",
  },
  {
    id: "fr_throw_self",
    cluster: "suicidal_intent_active",
    lang: "fr",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern: /\bme jeter (?:sous|par|du|dans)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "je veux me jeter sous le metro",
  },

  // -------------------------------------------------------------------------
  // FR — self_harm_intent
  // -------------------------------------------------------------------------
  {
    id: "fr_self_harm",
    cluster: "self_harm_intent",
    lang: "fr",
    reason_code: "self_harm_intent",
    floor: "high",
    // "me faire du mal" only — "me faire mal" is the ordinary injury idiom.
    pattern: /\bme faire du mal\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "j'ai envie de me faire du mal",
  },
  {
    id: "fr_mutilate",
    cluster: "self_harm_intent",
    lang: "fr",
    reason_code: "self_harm_intent",
    floor: "high",
    pattern: /\bme (?:mutiler|scarifier|taillader|entailler)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "j'ai envie de me scarifier",
  },
  {
    id: "fr_cut_veins",
    cluster: "self_harm_intent",
    lang: "fr",
    reason_code: "self_harm_intent",
    floor: "high",
    pattern: /\bme (?:couper|ouvrir) les veines\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "je pense a me couper les veines",
  },

  // -------------------------------------------------------------------------
  // FR — suicidal_ideation_passive
  // -------------------------------------------------------------------------
  {
    id: "fr_want_to_die",
    cluster: "suicidal_ideation_passive",
    lang: "fr",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:envie de mourir|j(?:e|') ?(?:veux|voudrais|aimerais) mourir|je veux crever)\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "j'ai envie de mourir",
  },
  {
    id: "fr_disappear",
    cluster: "suicidal_ideation_passive",
    lang: "fr",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:envie de disparaitre|j(?:e|') ?(?:aimerais|veux|voudrais) disparaitre)\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "j'ai envie de disparaitre",
  },
  {
    id: "fr_better_without_me",
    cluster: "suicidal_ideation_passive",
    lang: "fr",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:mieux sans moi|(?:ce|ca) serait mieux si j'etais pas la|personne (?:ne )?(?:me )?(?:regretterait|remarquerait))\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "tout le monde irait mieux sans moi",
  },
  {
    id: "fr_no_will_to_live",
    cluster: "suicidal_ideation_passive",
    lang: "fr",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:plus envie de vivre|plus (?:aucune )?raison de vivre|je (?:ne )?veux plus vivre|je veux plus exister|je (?:ne )?veux plus etre la)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "j'ai plus envie de vivre",
  },
  {
    id: "fr_not_wake_up",
    cluster: "suicidal_ideation_passive",
    lang: "fr",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:ne plus me reveiller|pas me reveiller demain|m'endormir et (?:ne )?plus me reveiller)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "j'aimerais m'endormir et ne plus me reveiller",
  },

  // -------------------------------------------------------------------------
  // FR — distress_acute (floor `low`: traced, blocks nothing)
  // -------------------------------------------------------------------------
  {
    id: "fr_worthlessness",
    cluster: "distress_acute",
    lang: "fr",
    reason_code: "worthlessness_thoughts",
    floor: "low",
    pattern:
      /\b(?:je (?:ne )?sers a rien|je suis (?:un|une) (?:poids|fardeau|boulet)|je (?:ne )?vaux rien|je suis (?:nul|nulle|minable|pathetique))\b/,
    disarmable_by: [...SCOPE_DISARMS, "scoped_self_deprecation"],
    probe: "je sers a rien",
  },
  {
    id: "fr_hopelessness",
    cluster: "distress_acute",
    lang: "fr",
    reason_code: "hopelessness",
    floor: "low",
    pattern:
      /\b(?:a quoi bon|j'y arriverai jamais|aucun espoir|plus aucun sens|plus rien n'a de sens)\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "a quoi bon",
  },
  {
    id: "fr_acute_exhaustion",
    cluster: "distress_acute",
    lang: "fr",
    reason_code: "emotional_distress",
    floor: "low",
    pattern:
      /\b(?:je (?:n')?en peux plus|je suis au bout(?: du rouleau)?|je craque|c'est trop dur|je tiens plus)\b/,
    disarmable_by: [...SCOPE_DISARMS, "effort_or_accident_register"],
    probe: "je n'en peux plus",
  },

  // -------------------------------------------------------------------------
  // EN — suicidal_intent_active
  // -------------------------------------------------------------------------
  {
    id: "en_kill_self",
    cluster: "suicidal_intent_active",
    lang: "en",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern: /\b(?:kill|killing) myself\b/,
    disarmable_by: [...UNIVERSAL_DISARMS, "effort_or_accident_register"],
    probe: "i want to kill myself",
  },
  {
    id: "en_end_life",
    cluster: "suicidal_intent_active",
    lang: "en",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern:
      /\b(?:end(?:ing)? my life|tak(?:e|ing) my own life|commit(?:ting)? suicide|kms)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "i am going to end my life",
  },
  {
    id: "en_end_it_all",
    cluster: "suicidal_intent_active",
    lang: "en",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern: /\b(?:end it all|off myself|hang myself|shoot myself)\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "i just want to end it all",
  },
  {
    id: "en_jump_off",
    cluster: "suicidal_intent_active",
    lang: "en",
    reason_code: "suicidal_ideation",
    floor: "high",
    pattern:
      /\b(?:jump off (?:a |the )?(?:bridge|building|roof)|throw myself)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "i want to jump off a bridge",
  },

  // -------------------------------------------------------------------------
  // EN — self_harm_intent
  // -------------------------------------------------------------------------
  {
    id: "en_self_harm",
    cluster: "self_harm_intent",
    lang: "en",
    reason_code: "self_harm_intent",
    floor: "high",
    pattern:
      /\b(?:hurt myself|harm myself|self[- ]harm(?:ing)?|cut myself|cutting myself|burn myself)\b/,
    // "i hurt myself at the gym" is the same lexical shape with a false
    // premise: the effort register disarms it.
    disarmable_by: [...UNIVERSAL_DISARMS, "effort_or_accident_register"],
    probe: "i want to hurt myself",
  },

  // -------------------------------------------------------------------------
  // EN — suicidal_ideation_passive
  // -------------------------------------------------------------------------
  {
    id: "en_want_to_die",
    cluster: "suicidal_ideation_passive",
    lang: "en",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:want to die|wanna die|wish i (?:was|were) dead|rather be dead(?! than\b)|better off dead)\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "i want to die",
  },
  {
    id: "en_disappear",
    cluster: "suicidal_ideation_passive",
    lang: "en",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:wish i could disappear|want to disappear|wish i wasn'?t here|don'?t want to be here anymore)\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "i wish i could disappear",
  },
  {
    id: "en_better_without_me",
    cluster: "suicidal_ideation_passive",
    lang: "en",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:better off without me|no one would (?:miss|notice) me|nobody would miss me)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "everyone would be better off without me",
  },
  {
    id: "en_no_reason_to_live",
    cluster: "suicidal_ideation_passive",
    lang: "en",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:no reason to live|nothing to live for|don'?t want to live anymore)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "i have no reason to live",
  },
  {
    id: "en_not_wake_up",
    cluster: "suicidal_ideation_passive",
    lang: "en",
    reason_code: "suicidal_ideation_passive",
    floor: "medium",
    pattern:
      /\b(?:never wake up|don'?t want to wake up|not wake up tomorrow)\b/,
    disarmable_by: UNIVERSAL_DISARMS,
    probe: "i hope i never wake up",
  },

  // -------------------------------------------------------------------------
  // EN — distress_acute (floor `low`)
  // -------------------------------------------------------------------------
  {
    id: "en_worthlessness",
    cluster: "distress_acute",
    lang: "en",
    reason_code: "worthlessness_thoughts",
    floor: "low",
    pattern:
      /\b(?:i'?m worthless|i'?m a burden|i'?m useless|i am worthless|i am a burden|i am useless)\b/,
    disarmable_by: [...SCOPE_DISARMS, "scoped_self_deprecation"],
    probe: "i'm worthless",
  },
  {
    id: "en_hopelessness",
    cluster: "distress_acute",
    lang: "en",
    reason_code: "hopelessness",
    floor: "low",
    pattern:
      /\b(?:what'?s the point\b(?!\s+(?:of|in|to)\b)|no hope left|nothing matters(?: anymore)?|i'?ll never get better|there'?s no way out)\b/,
    disarmable_by: SCOPE_DISARMS,
    probe: "what's the point",
  },
  {
    id: "en_acute_exhaustion",
    cluster: "distress_acute",
    lang: "en",
    reason_code: "emotional_distress",
    floor: "low",
    pattern:
      /\b(?:i can'?t take it anymore|i can'?t do this anymore|at my breaking point|i'?m breaking down|i have nothing left)\b/,
    disarmable_by: [...SCOPE_DISARMS, "effort_or_accident_register"],
    probe: "i can't take it anymore",
  },
];

// ---------------------------------------------------------------------------
// Escalators: imminence and means. They MOVE the floor up, never down.
// ---------------------------------------------------------------------------

export const IMMINENCE_MARKERS =
  /\b(?:ce soir|cette nuit|ce matin|maintenant|tout de suite|la tout de suite|aujourd'hui|demain|dans (?:une|un|\d+) (?:minute|minutes|heure|heures)|tonight|right now|this evening|today|tomorrow|in \d+ (?:minute|minutes|hour|hours))\b/;

export const MEANS_MARKERS =
  /\b(?:cachets|medicaments|boite de|corde|lame|lames|rasoir|couteau|pont|balcon|rails|metro|arme|flingue|fusil|gaz|pills|overdose|rope|blade|razor|knife|bridge|gun|firearm)\b/;

// ---------------------------------------------------------------------------
// Disarm condition detectors
// ---------------------------------------------------------------------------

/**
 * Negation particles. Deliberately EXCLUDES bare `ne` / `n'` / `plus`:
 * "je n'ai plus envie de vivre" is the aggravated reading, not the negated one.
 */
const NEGATION_MARKERS =
  /\b(?:pas|jamais|aucune envie|non|not|no|never|don'?t|won'?t|wouldn'?t|doesn'?t|didn'?t|nobody)\b/g;

/** Re-arms the belt over a negation: fear/uncertainty about one's own control. */
const NEGATION_ESCALATORS =
  /\b(?:j'ai peur de|peur de pas|je sais pas comment|je ne sais pas comment|j'arrive pas a m'empecher|i'?m scared i|i'?m afraid i|i don'?t know how to stop|i can'?t stop myself)\b/;

const REPORTED_SPEECH_MARKERS =
  /\b(?:m'a dit|a dit|ont dit|a ecrit|m'a ecrit|m'a demande|on m'a demande|d'apres|selon|dans (?:le film|la serie|la chanson|le livre|un livre)|paroles de|he said|she said|they said|told me|asked me|in the (?:movie|film|song|book|show)|lyrics|quote)\b/;

const HUMOR_MARKERS =
  /(?:\bmdr\b|\bptdr\b|\blol\b|\bmddr\b|\bjpp\b|\bxd\b|\bhaha\b|\bhahaha\b|\bhihi\b|😂|🤣|😅|💀|\bjk\b|\blmao\b|\brofl\b)/;

const HUMOR_IDIOMS =
  /\b(?:mourir de rire|mort de rire|morte de rire|m'a acheve|m'a tue|j'allais y rester|die laughing|dying laughing|dead laughing|killed me|i'?m dead)\b/;

const HISTORICAL_MARKERS =
  /\b(?:il y a (?:des annees|longtemps|\d+ ans|\d+ annees)|quand j'etais (?:ado|jeune|petit|petite|au lycee|etudiant|etudiante)|a l'epoque|autrefois|l'annee derniere|il y a des lustres|years ago|back then|when i was (?:a kid|younger|a teenager|in school)|in the past|used to)\b/;

const PRESENT_ANCHORS =
  /\b(?:aujourd'hui|en ce moment|ces temps ci|ces jours ci|ce soir|cette nuit|maintenant|la tout de suite|ca revient|ca recommence|encore|de nouveau|right now|today|tonight|these days|lately|again|it'?s back|coming back)\b/;

const THIRD_PARTY_MARKERS =
  /\b(?:mon (?:frere|pere|fils|ami|pote|copain|collegue|voisin|patient|client|mari|conjoint)|ma (?:soeur|mere|fille|amie|copine|collegue|voisine|femme|patiente)|un (?:ami|pote|collegue|patient|client)|une (?:amie|copine|collegue|patiente)|quelqu'un que je connais|my (?:brother|sister|friend|mother|father|son|daughter|colleague|coworker|neighbour|neighbor|patient|client|partner|wife|husband)|a friend of mine|someone i know)\b/;

const HYPOTHETICAL_MARKERS =
  /\b(?:si quelqu'un|et si quelqu'un|imagine que|admettons que|pour un ami|c'est pour un ami|hypothetiquement|en theorie|what if someone|if someone|asking for a friend|hypothetically|in theory|purely theoretical)\b/;

const TASK_OR_PRODUCT_MARKERS =
  /\b(?:(?:ce|cet|cette|ces|le|la|les|l'|mon|ma|mes|du|de la|des|this|these|that|those|the|my)\s?(?:compte|comptes|appli|application|abonnement|programme|plan|dossier|dossiers|projet|projets|reunion|reunions|boulot|travail|tache|taches|ticket|tickets|devis|chantier|devoirs|mail|mails|cours|revision|revisions|examen|examens|account|app|subscription|program|project|projects|meeting|meetings|task|tasks|assignment|assignments|deadline|deadlines|homework|email|emails|inbox|spreadsheet|sprint|backlog)|au (?:travail|boulot|bureau)|at work|at the office)\b/;

const SCOPED_SELF_DEPRECATION_SCOPES =
  /^(?:\s*(?:avec|en|pour|quand il s'agit de|with|at|when it comes to)\b)/;

const EFFORT_OR_ACCIDENT_MARKERS =
  /\b(?:a la salle|salle de sport|seance|entrainement|muscu|musculation|crossfit|sport|jambes|courbatures|marathon|footing|en me rasant|en cuisinant|en coupant|par accident|sans faire expres|maladroit|at the gym|the gym|workout|working out|training|leg day|lifting|the race|that run|shaving|cooking|chopping|slicing|by accident|accidentally|paper cut|on a knife)\b/;

export type DisarmDetectorContext = {
  /** Full normalized message. */
  normalized: string;
  /** Normalized sentence containing the span. */
  sentence: string;
  /** Normalized clause containing the span. */
  clause: string;
  /** Offset of the span inside `clause`. */
  spanIndexInClause: number;
  /** Offset of the span inside `sentence`. */
  spanIndexInSentence: number;
  /** The matched span itself. */
  span: string;
  /** True when the span is inside a quoted segment of the raw message. */
  insideQuotes: boolean;
};

export type DisarmCondition = {
  id: DisarmId;
  /** Human-readable condition, mirrored in the module header. */
  description: string;
  applies: (ctx: DisarmDetectorContext) => boolean;
  /**
   * False-premise carrier: rewrites an entry's probe so the SAME lexical shape
   * carries a FALSE premise. The belt must then stay silent. Used by
   * `safety_pregate.disarm.test.ts` (doctrine P9: every belt ships with the
   * test of its own disarmament).
   */
  falsePremise: (args: FalsePremiseArgs) => string;
};

export type FalsePremiseArgs = {
  probe: string;
  lang: LexiconLang;
  entry: SafetyLexiconEntry;
};

/**
 * Inserts a negative particle immediately before the matched span, so the
 * negation lands inside the guard's 30-char clause window whatever the length
 * of the surrounding sentence.
 */
function negateSpan({ probe, lang, entry }: FalsePremiseArgs): string {
  const particle = lang === "fr" ? "pas " : "not ";
  const normalized = normalizeForSafety(probe);
  const hit = entry.pattern.exec(normalized);
  if (!hit) return `${particle}${probe}`;
  return `${normalized.slice(0, hit.index)}${particle}${
    normalized.slice(hit.index)
  }`;
}

/** Distance (normalized chars) a negation particle may act over. */
const NEGATION_WINDOW = 30;

export const DISARM_CONDITIONS: DisarmCondition[] = [
  {
    id: "negation",
    description:
      "Explicit negative particle in the same clause, within 30 chars before the span. Re-armed by a control-loss escalator.",
    applies: (ctx) => {
      if (NEGATION_ESCALATORS.test(ctx.sentence)) return false;
      const before = ctx.clause.slice(0, ctx.spanIndexInClause);
      const window = before.slice(Math.max(0, before.length - NEGATION_WINDOW));
      NEGATION_MARKERS.lastIndex = 0;
      return NEGATION_MARKERS.test(window);
    },
    falsePremise: negateSpan,
  },
  {
    id: "quoted_or_reported",
    description:
      "The span sits inside quotes or follows a reported-speech marker.",
    applies: (ctx) =>
      ctx.insideQuotes || REPORTED_SPEECH_MARKERS.test(ctx.sentence),
    falsePremise: ({ probe, lang }) =>
      lang === "fr"
        ? `il m'a dit hier "${probe}"`
        : `he said yesterday "${probe}"`,
  },
  {
    id: "humor_register",
    description:
      "Laughter marker or fixed dark idiom in the sentence carrying the span.",
    applies: (ctx) =>
      HUMOR_MARKERS.test(ctx.sentence) || HUMOR_IDIOMS.test(ctx.sentence),
    falsePremise: ({ probe, lang }) =>
      lang === "fr" ? `${probe} mdr` : `${probe} lol`,
  },
  {
    id: "historical_distant",
    description:
      "Distant-past marker with NO present anchor anywhere in the message.",
    applies: (ctx) =>
      HISTORICAL_MARKERS.test(ctx.sentence) &&
      !PRESENT_ANCHORS.test(ctx.normalized),
    falsePremise: ({ probe, lang }) =>
      lang === "fr" ? `il y a des annees ${probe}` : `years ago ${probe}`,
  },
  {
    id: "third_party_referent",
    description: "The sentence names someone else as the subject.",
    applies: (ctx) => THIRD_PARTY_MARKERS.test(ctx.sentence),
    falsePremise: ({ probe, lang }) =>
      lang === "fr" ? `mon collegue ${probe}` : `my colleague ${probe}`,
  },
  {
    id: "hypothetical_framing",
    description: "Hypothetical or third-person framing of the phrase.",
    applies: (ctx) => HYPOTHETICAL_MARKERS.test(ctx.sentence),
    falsePremise: ({ probe, lang }) =>
      lang === "fr"
        ? `si quelqu'un dit ${probe}`
        : `what if someone says ${probe}`,
  },
  {
    id: "task_or_product_referent",
    description:
      "The sentence scopes the phrase to an artifact or a task (account, app, file, project, job).",
    applies: (ctx) => TASK_OR_PRODUCT_MARKERS.test(ctx.sentence),
    falsePremise: ({ probe, lang }) =>
      lang === "fr"
        ? `${probe} avec ce dossier au boulot`
        : `${probe} with this project at work`,
  },
  {
    id: "scoped_self_deprecation",
    description:
      "Worthlessness scoped to a usage rather than to the person (`nulle AVEC mon telephone`).",
    applies: (ctx) => {
      const after = ctx.sentence.slice(
        ctx.spanIndexInSentence + ctx.span.length,
      );
      return SCOPED_SELF_DEPRECATION_SCOPES.test(after);
    },
    falsePremise: ({ probe, lang }) =>
      lang === "fr" ? `${probe} avec mon telephone` : `${probe} with my phone`,
  },
  {
    id: "effort_or_accident_register",
    description:
      "Effort or accidental-injury register: the dark idiom describes exertion or a mishap, not intent (`hurt myself at the gym`, `cut myself shaving`).",
    applies: (ctx) => EFFORT_OR_ACCIDENT_MARKERS.test(ctx.sentence),
    falsePremise: ({ probe, lang }) =>
      lang === "fr" ? `${probe} a la salle de sport` : `${probe} at the gym`,
  },
];

export const DISARM_CONDITION_BY_ID: Record<DisarmId, DisarmCondition> = Object
  .fromEntries(
    DISARM_CONDITIONS.map((condition) => [condition.id, condition]),
  ) as Record<DisarmId, DisarmCondition>;

// ---------------------------------------------------------------------------
// Normalization + segmentation
// ---------------------------------------------------------------------------

/**
 * Lowercase, strip diacritics, unify apostrophes, collapse whitespace. Newlines
 * become sentence boundaries so a crisis line pasted under a shopping list is
 * not read inside the shopping list's clause.
 *
 * -- LIGATURES ARE UNFOLDED, NOT DROPPED (2026-08-22, lot S1d) --------------
 * Same wound as `allergen_catalog.ts` (2026-08-19),
 * `safety_constraint_floor.ts` (S1), `medical_condition_floor.ts` (S1c) and
 * `body_measure_floor.ts` (S1d) -- BUT NOT THE SAME MECHANISM, and the
 * difference is the reason this belt is fixed here and not by adding a spelling
 * to the marker.
 *
 * Those four normalizers run a `[^a-z0-9\s]` filter, which DESTROYED the
 * ligature into a space. This one has no such filter: measured, `ma soeur`
 * written with the ligature comes out of this function UNCHANGED. `NFD` does
 * not decompose it either (one code point, against two for `e`-acute). So the
 * ligature reaches the regex engine intact, and it is the ASCII literal
 * `soeur` inside `THIRD_PARTY_MARKERS` that fails to match it.
 *
 * The consequence is the OPPOSITE of the other four. There, the ligature killed
 * a detection. Here it kills a DISARM -- and no lexicon pattern carries a
 * digraph, so in this lane the ligature can only ever OVER-trigger, never
 * under-trigger. Measured 2026-08-22, before any fix, over the whole table:
 * 16 of 16 French entries disarmable by `third_party_referent` diverge under
 * `ma soeur` written with the ligature.
 *
 *     "ma soeur je veux en finir" (digraph)  => disarmed, band none
 *     "ma soeur je veux en finir" (ligature) => detected, band high
 *
 * Someone telling us about their SISTER was read as being in crisis themselves.
 *
 * WARNING -- THIS ALIGNS A DISARM, and that is the gesture, not a side effect.
 * The digraph behaviour is the one the author wrote, tested and shipped
 * (`third_party_referent` is a UNIVERSAL_DISARM); the ligature behaviour was an
 * accident of normalization. We are not choosing between two behaviours, we are
 * choosing between ONE and TWO. A test NAMES this change.
 *
 * WARNING -- written as escape sequences (see the executed line), like the four
 * sibling modules: this repo has already produced mojibake that neither `tsc`
 * nor the parity tests catch. Literal ligature characters live only in comments
 * and tests, never on the executed path.
 *
 * WARNING -- the unfold comes AFTER `toLowerCase()` so the uppercase ligatures
 * pass too. Indices are unaffected downstream: every offset in this lane
 * (`quotedRanges`, `spanIndexInSentence`) is computed on the string this
 * function returns, and nothing maps back to the raw message.
 */
export function normalizeForSafety(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .toLowerCase()
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .replace(/[\r\n]+/g, " . ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Segment = { text: string; start: number };

const SENTENCE_SPLIT = /[.!?;…]+/;
const CLAUSE_SPLIT = /,|\bmais\b|\bet\b|\bbut\b|\band\b|\bpuis\b|\bdonc\b/;

function segment(text: string, splitter: RegExp): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  const parts = text.split(splitter);
  for (const part of parts) {
    const start = text.indexOf(part, cursor);
    const at = start < 0 ? cursor : start;
    out.push({ text: part, start: at });
    cursor = at + part.length;
  }
  return out.filter((s) => s.text.trim().length > 0);
}

export function splitSentences(normalized: string): Segment[] {
  const sentences = segment(normalized, SENTENCE_SPLIT);
  return sentences.length > 0 ? sentences : [{ text: normalized, start: 0 }];
}

export function splitClauses(sentence: string): Segment[] {
  const clauses = segment(sentence, CLAUSE_SPLIT);
  return clauses.length > 0 ? clauses : [{ text: sentence, start: 0 }];
}

/** Character ranges (in the normalized message) covered by double quotes. */
export function quotedRanges(normalized: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let open: number | null = null;
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i] !== '"') continue;
    if (open === null) open = i;
    else {
      ranges.push([open, i]);
      open = null;
    }
  }
  return ranges;
}
