/**
 * PIVOT NUTRITION §3.3 + §3.7 — the coach's method, compiled into a prompt
 * layer, and the deterministic lock that stands behind it.
 *
 * THE PRODUCT CLAIM THIS FILE IS RESPONSIBLE FOR: "tes élèves sont relancés au
 * jour 9 — dans TA méthode et TA voix". Everything here exists to make that
 * true message after message, and — more importantly — to make its FAILURE
 * impossible to ship silently.
 *
 * ── THE DOUBLE LOCK (§3.3), and why one lock is not enough ────────────────
 * A prompt is advisory. It is a very good instruction and a very bad guarantee:
 * a model that has been told "never recommend six small meals" will comply
 * almost always, and "almost always" is the wrong number when a single public
 * contradiction of the coach destroys the reason he is paying. So the interdits
 * are enforced twice, by two mechanisms that fail differently:
 *
 *   lock 1 — INJECTED: `compileDoctrineBlock` puts them in the prompt.
 *   lock 2 — VERIFIED: `findDoctrineViolations` scans the generated text before
 *            it is sent, deterministically, with no model in the loop.
 *
 * Lock 2 shares its engine with the STUDENT's medical lock
 * (`forbidden_matcher.ts`) — read that file's header for why that sharing is
 * not a convenience but a correctness requirement.
 *
 * ── THE ONE PLACE THE TWO LOCKS DELIBERATELY DIVERGE ──────────────────────
 * They mean different things by "naming the forbidden thing":
 *
 *   allergy  — the danger is the SUGGESTION. "Add peanut butter" is the harm.
 *   interdit — the danger is the ADVOCACY, not the word. The agent must remain
 *              able to say "your coach doesn't do six small meals" — that
 *              sentence is the doctrine WORKING, and rejecting it would make
 *              the agent unable to explain its own coach's method.
 *
 * Both therefore run with negation exceptions ON by default, and this is the
 * case that makes the exception list load-bearing rather than cosmetic
 * (`doctrine_test.ts` pins it).
 *
 * ── CACHING (§3.3) ────────────────────────────────────────────────────────
 * The doctrine block is the same tokens on every turn for a given coach, so it
 * is the natural cache unit. `compileDoctrineBlock` returns a content hash:
 * cache key in, cache invalidation out. §3.7 brique 6 requires an edit to be
 * visible on the NEXT message, so the key is derived from the content itself
 * rather than from a version number a caller could forget to bump.
 *
 * PURE MODULE: no I/O, no clock, no randomness. Everything decidable is
 * decidable here, in tests.
 */

import {
  findForbiddenMatches,
  type ForbiddenMatch,
  type ForbiddenMatchOptions,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";

// ---------------------------------------------------------------------------
// The doctrine, as stored in `coach_doctrines`
// ---------------------------------------------------------------------------

/**
 * ONE conviction of the coach's method.
 *
 * `key` is ASCII snake_case (R1) and it carries far more weight than it looks:
 * it is THE anchor a student's week plan is traced to. A nutrition line in
 * `student_week_plans` names the belief it applies, and the database refuses
 * the line if the key is absent (CHECK `..._doctrine_traceable_check`).
 *
 * WHY A KEY AND NOT THE CLAIM TEXT: the claim is prose the coach re-words
 * between versions. A plan generated in March must still be able to say which
 * conviction it came from in June, and matching on prose would break the first
 * time a comma moved.
 *
 * STABILITY: a doctrine version is an immutable snapshot, so deriving the key
 * from that version's claim is deterministic and stable. `parseCoachDoctrine`
 * therefore honours a stored `key` when present and derives one when it is not
 * -- an older row with no key resolves to the same key it would be given today.
 */
export interface DoctrineBelief {
  key: string;
  claim: string;
  rationale?: string | null;
}

/**
 * ONE interdit.
 *
 * `token` is ASCII snake_case (R1) because code branches on it: the violation
 * report, the incident log, and the coach-facing "why was this regenerated"
 * screen all key on it. `surfaceForms` carries the phrasings a model would
 * actually emit -- an interdit whose token is `six_small_meals` will never
 * appear as those two words in French prose, so without surface forms lock 2
 * would be decorative.
 */
export interface DoctrineForbidden {
  token: string;
  surfaceForms?: readonly string[];
  reason?: string | null;
  /**
   * WHAT THE COACH DOES INSTEAD, in the coach's own words.
   *
   * This is the difference between a gag and an answer. A student in a
   * masterclass has NO one-to-one channel back to the coach: telling them "ask
   * your coach" points at a door that does not exist, and it is the opposite of
   * what a coach buys us for -- they want their position stated in their
   * absence, not a referral back to them.
   *
   * So when lock 2 catches a reply endorsing this interdit, the replacement is
   * THIS text. Answering in the coach's place is legitimate precisely because
   * the coach wrote the replacement. When it is missing the lock degrades to a
   * neutral refusal that still never invents a channel.
   */
  instead?: string | null;
}

export interface DoctrineVocabularyEntry {
  term: string;
  meaning?: string | null;
}

/** A hard case the coach answered in his own words: the few-shot that makes it his. */
export interface DoctrineArbitration {
  situation: string;
  coachAnswer: string;
  source?: "interview" | "weekly_suggestion" | "test_mode" | null;
}

export interface DoctrineVoice {
  /** 'tu' | 'vous' — French address form, when it applies. */
  address?: string | null;
  length?: "short" | "medium" | null;
  emojis?: "none" | "light" | null;
  /** R3: the language the AI WRITES in. Distinct from ui_locale. */
  language?: string | null;
}

export interface CoachDoctrine {
  coachId: string;
  version: number;
  coachDisplayName?: string | null;
  beliefs: readonly DoctrineBelief[];
  forbidden: readonly DoctrineForbidden[];
  vocabulary: readonly DoctrineVocabularyEntry[];
  arbitrations: readonly DoctrineArbitration[];
  voice: DoctrineVoice;
  contentLocale: string;
}

// ---------------------------------------------------------------------------
// Parsing the jsonb columns — tolerant on shape, strict on emptiness
// ---------------------------------------------------------------------------

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Derive an ASCII snake_case key from a claim (R1).
 *
 * Diacritics are folded rather than dropped: "équilibre" must not become
 * "quilibre". Capped at six words because the key is read by humans on the
 * coach's screen and in violation reports, and a forty-character key is a key
 * nobody checks.
 */
export function deriveBeliefKey(claim: string): string {
  const words = claim
    .normalize("NFD")
    // Escaped, never literal: a combining-mark range typed into the source is
    // invisible in a diff and one careless editor pass silently empties it.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // A claim of pure punctuation or non-Latin script leaves nothing to derive
  // from. `belief` is a deliberate, visible placeholder: the caller's dedup
  // turns a second one into `belief_2`, so it degrades without ever colliding.
  return words.slice(0, 6).join("_") || "belief";
}

/**
 * Build a `CoachDoctrine` from a `coach_doctrines` row.
 *
 * Malformed entries are DROPPED and counted, never guessed at: a belief with no
 * claim is not a belief, and an interdit with no token is an interdit that
 * cannot be enforced -- keeping it would put a rule in the prompt that lock 2
 * is structurally unable to check, which is the worst of both worlds.
 */
export function parseCoachDoctrine(
  row: Record<string, unknown>,
): { doctrine: CoachDoctrine; issues: string[] } {
  const issues: string[] = [];

  const beliefs: DoctrineBelief[] = [];
  const beliefKeys = new Set<string>();
  for (const [i, raw] of asArray(row.beliefs).entries()) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const claim = str(b.claim);
    if (!claim) {
      issues.push(`beliefs[${i}]: empty claim, dropped`);
      continue;
    }
    // Honour a stored key; derive one when the row predates keys. Either way
    // the result must be UNIQUE within the doctrine, because a week plan
    // resolves its lines by this key -- two beliefs sharing one key would make
    // a plan line point at an ambiguous origin, which is worse than no origin.
    let key = str(b.key) || deriveBeliefKey(claim);
    if (beliefKeys.has(key)) {
      let n = 2;
      while (beliefKeys.has(`${key}_${n}`)) n++;
      issues.push(`beliefs[${i}]: key ${JSON.stringify(key)} already used, stored as ${key}_${n}`);
      key = `${key}_${n}`;
    }
    beliefKeys.add(key);
    beliefs.push({ key, claim, rationale: str(b.rationale) || null });
  }

  const forbidden: DoctrineForbidden[] = [];
  for (const [i, raw] of asArray(row.forbidden).entries()) {
    const f = (raw ?? {}) as Record<string, unknown>;
    const token = str(f.token);
    if (!token) {
      issues.push(`forbidden[${i}]: empty token, dropped (unenforceable)`);
      continue;
    }
    const surfaceForms = asArray(f.surface_forms ?? f.surfaceForms)
      .map(str)
      .filter(Boolean);
    forbidden.push({
      token,
      surfaceForms,
      reason: str(f.reason) || null,
      instead: str(f.instead) || null,
    });
  }

  const vocabulary: DoctrineVocabularyEntry[] = [];
  for (const [i, raw] of asArray(row.vocabulary).entries()) {
    const v = (raw ?? {}) as Record<string, unknown>;
    const term = str(v.term);
    if (!term) {
      issues.push(`vocabulary[${i}]: empty term, dropped`);
      continue;
    }
    vocabulary.push({ term, meaning: str(v.meaning) || null });
  }

  const arbitrations: DoctrineArbitration[] = [];
  for (const [i, raw] of asArray(row.arbitrations).entries()) {
    const a = (raw ?? {}) as Record<string, unknown>;
    const situation = str(a.situation);
    const coachAnswer = str(a.coach_answer ?? a.coachAnswer);
    if (!situation || !coachAnswer) {
      // Half an arbitration is not a weaker example, it is a misleading one:
      // a situation with no answer teaches the model the situation matters and
      // leaves it to invent the response -- the opposite of the intent.
      issues.push(`arbitrations[${i}]: needs both situation and answer, dropped`);
      continue;
    }
    const source = str(a.source);
    arbitrations.push({
      situation,
      coachAnswer,
      source: (["interview", "weekly_suggestion", "test_mode"].includes(source)
        ? source
        : null) as DoctrineArbitration["source"],
    });
  }

  const voiceRaw = (row.voice ?? {}) as Record<string, unknown>;
  const length = str(voiceRaw.length);
  const emojis = str(voiceRaw.emojis);

  return {
    doctrine: {
      coachId: str(row.coach_id ?? row.coachId),
      version: Number(row.version ?? 0),
      coachDisplayName: str(row.coach_display_name ?? row.coachDisplayName) || null,
      beliefs,
      forbidden,
      vocabulary,
      arbitrations,
      voice: {
        address: str(voiceRaw.address) || null,
        length: (length === "short" || length === "medium" ? length : null),
        emojis: (emojis === "none" || emojis === "light" ? emojis : null),
        language: str(voiceRaw.language) || null,
      },
      contentLocale: str(row.content_locale ?? row.contentLocale) || "en",
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Lock 1 — the compiled prompt layer
// ---------------------------------------------------------------------------

export interface CompiledDoctrine {
  /** The block injected as the [DOCTRINE COACH] layer. */
  text: string;
  /**
   * Content hash. THE cache key, and THE invalidation signal: it moves when and
   * only when the compiled text moves, so a coach who edits at 14:02 is served
   * by a different key at 14:03 without anybody remembering to bump a version.
   */
  hash: string;
  /** True when the coach has published nothing usable yet. */
  isEmpty: boolean;
}

/**
 * FNV-1a, 64-bit, hex. Synchronous on purpose: `crypto.subtle` is async, and an
 * async cache key turns every call site into an await for no benefit. This is a
 * cache key and an equality check, never a security primitive.
 */
function contentHash(text: string): string {
  let hi = 0x811c9dc5;
  let lo = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    lo = (lo ^ c) >>> 0;
    lo = Math.imul(lo, 0x01000193) >>> 0;
    hi = (hi ^ ((c << 5) | (c >>> 3))) >>> 0;
    hi = Math.imul(hi, 0x01000193) >>> 0;
  }
  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}

/**
 * Compile the doctrine into the prompt block, deterministically.
 *
 * DETERMINISM IS A REQUIREMENT, not a nicety: the hash is the cache key, so a
 * compilation that reordered anything between two calls would miss the cache on
 * every turn and quietly multiply the bill. Nothing here iterates an object's
 * key order or depends on anything outside its argument.
 */
export function compileDoctrineBlock(doctrine: CoachDoctrine): CompiledDoctrine {
  const who = doctrine.coachDisplayName || "the coach";
  const lines: string[] = [];

  lines.push(`== ${who.toUpperCase()}'S METHOD — YOU SPEAK AS THIS COACH'S AGENT ==`);
  lines.push("");
  lines.push(
    "You are not a general nutrition assistant. You carry ONE coach's method. " +
      "Where this block and your own knowledge disagree, this block wins. " +
      "You never modify, soften or extend the coach's protocol.",
  );

  if (doctrine.beliefs.length > 0) {
    lines.push("");
    lines.push("-- WHAT THIS COACH BELIEVES --");
    for (const b of doctrine.beliefs) {
      lines.push(b.rationale ? `- ${b.claim} (${b.rationale})` : `- ${b.claim}`);
    }
  }

  if (doctrine.forbidden.length > 0) {
    lines.push("");
    lines.push("-- FORBIDDEN: NEVER RECOMMEND, NEVER ENDORSE --");
    lines.push(
      "These are this coach's red lines. You may EXPLAIN that the coach does " +
        "not do these things; you may never advise the student to do them.",
    );
    for (const f of doctrine.forbidden) {
      const forms = (f.surfaceForms ?? []).filter(Boolean);
      const alias = forms.length > 0 ? ` (also phrased: ${forms.join("; ")})` : "";
      lines.push(f.reason ? `- ${f.token}${alias} — ${f.reason}` : `- ${f.token}${alias}`);
    }
  }

  if (doctrine.vocabulary.length > 0) {
    lines.push("");
    lines.push("-- THIS COACH'S WORDS — use them, do not translate them away --");
    for (const v of doctrine.vocabulary) {
      lines.push(v.meaning ? `- "${v.term}": ${v.meaning}` : `- "${v.term}"`);
    }
  }

  if (doctrine.arbitrations.length > 0) {
    lines.push("");
    lines.push("-- HOW THIS COACH ANSWERS (follow these, they are his own words) --");
    for (const a of doctrine.arbitrations) {
      lines.push(`- Situation: ${a.situation}`);
      lines.push(`  He answers: ${a.coachAnswer}`);
    }
  }

  const v = doctrine.voice;
  const voiceBits: string[] = [];
  if (v.address) voiceBits.push(`address the student with "${v.address}"`);
  if (v.length === "short") voiceBits.push("keep replies short — two or three sentences");
  if (v.length === "medium") voiceBits.push("replies of a short paragraph");
  if (v.emojis === "none") voiceBits.push("no emojis");
  if (v.emojis === "light") voiceBits.push("at most one emoji");
  if (v.language) voiceBits.push(`write in ${v.language}`);
  if (voiceBits.length > 0) {
    lines.push("");
    lines.push("-- VOICE --");
    for (const bit of voiceBits) lines.push(`- ${bit}`);
  }

  const text = lines.join("\n");
  const isEmpty = doctrine.beliefs.length === 0 &&
    doctrine.forbidden.length === 0 &&
    doctrine.vocabulary.length === 0 &&
    doctrine.arbitrations.length === 0 &&
    voiceBits.length === 0;

  return { text, hash: contentHash(text), isEmpty };
}

// ---------------------------------------------------------------------------
// The layered assembly (§3.3)
// ---------------------------------------------------------------------------

export interface PromptLayers {
  /** Product rules, safety, coach authority. Invariant across coaches. */
  systemCore: string;
  /** `compileDoctrineBlock().text`. Empty string when the coach has none. */
  doctrineBlock: string;
  /** THIS student's current week, from the tables. Never prose from a model. */
  protocolBlock: string;
  /** Digest: recurring meals, preferences, hard constraints, momentum. */
  studentMemoryBlock: string;
  /** The last turns. */
  conversationBlock: string;
}

/**
 * Assemble the five layers, in the order §3.3 fixes.
 *
 * THE ORDER IS THE CONTRACT, not a formatting choice. Two properties depend on
 * it and are pinned by tests:
 *
 *   1. SYSTEM CORE comes first and is never overridable by anything below it —
 *      safety and coach authority are not negotiable by a doctrine edit. A
 *      coach cannot write "ignore the safety rules" into his beliefs and have
 *      it land above them.
 *   2. DOCTRINE comes second, as ONE contiguous block, because that is the unit
 *      that gets cached. Interleaving it with per-student material would make
 *      the cacheable prefix student-specific, i.e. not cacheable at all.
 *
 * Empty layers are omitted rather than emitted as empty headers: a header with
 * nothing under it reads to a model as "this exists and is empty", which is a
 * different claim from "this does not apply".
 */
export function assembleTurnPrompt(layers: PromptLayers): string {
  const blocks: string[] = [];
  const push = (header: string, body: string) => {
    const trimmed = String(body ?? "").trim();
    if (!trimmed) return;
    blocks.push(`${header}\n${trimmed}`);
  };

  push("### SYSTEM CORE", layers.systemCore);
  push("### COACH DOCTRINE", layers.doctrineBlock);
  push("### PROTOCOL — THIS STUDENT, THIS WEEK", layers.protocolBlock);
  push("### STUDENT MEMORY", layers.studentMemoryBlock);
  push("### CONVERSATION", layers.conversationBlock);
  return blocks.join("\n\n");
}

/**
 * The cacheable PREFIX of the assembled prompt: everything that is identical
 * for every student of this coach. Callers that use provider-side prompt
 * caching key on this; callers that do not can ignore it.
 */
export function doctrineCachePrefix(
  systemCore: string,
  compiled: CompiledDoctrine,
): { text: string; key: string } {
  const text = assembleTurnPrompt({
    systemCore,
    doctrineBlock: compiled.text,
    protocolBlock: "",
    studentMemoryBlock: "",
    conversationBlock: "",
  });
  return { text, key: `${contentHash(systemCore)}.${compiled.hash}` };
}

// ---------------------------------------------------------------------------
// Lock 2 — the deterministic post-generation check
// ---------------------------------------------------------------------------

export interface DoctrineViolation {
  /** The interdit's ASCII token. */
  token: string;
  /** The phrasing that actually matched (token or surface form). */
  matchedForm: string;
  matchedText: string;
  index: number;
  reason: string | null;
}

export class DoctrineViolationError extends Error {
  readonly violations: DoctrineViolation[];
  constructor(violations: DoctrineViolation[]) {
    super(
      `[keel/doctrine] Generated text endorses ${violations.length} coach ` +
        `interdit(s): ` +
        violations.map((v) => `${v.token} ("${v.matchedText}")`).join(", ") +
        ". Output rejected; regenerate.",
    );
    this.name = "DoctrineViolationError";
    this.violations = violations;
  }
}

/**
 * Scan generated text for endorsements of a coach interdit.
 *
 * `allowNegatedMentions` defaults to TRUE, and that default is the whole design
 * (see the header). "Marc ne fait pas de 6 petits repas" must pass: it is the
 * doctrine doing its job. "Essaie 6 petits repas dans la journée" must fail.
 */
export function findDoctrineViolations(
  text: string,
  doctrine: Pick<CoachDoctrine, "forbidden">,
  options: ForbiddenMatchOptions = {},
): DoctrineViolation[] {
  const byToken = new Map<string, DoctrineForbidden>();
  const terms: ForbiddenTerm[] = [];
  for (const f of doctrine.forbidden) {
    const token = String(f.token ?? "").trim();
    if (!token) continue;
    byToken.set(token, f);
    terms.push({
      ruleId: token,
      token,
      surfaceForms: f.surfaceForms,
    });
  }
  return findForbiddenMatches(text, terms, options).map((
    m: ForbiddenMatch,
  ): DoctrineViolation => ({
    token: m.ruleId,
    matchedForm: m.token,
    matchedText: m.matchedText,
    index: m.index,
    reason: byToken.get(m.ruleId)?.reason ?? null,
  }));
}

/**
 * Fail-loud gate. Callers that regenerate should use `findDoctrineViolations`
 * and feed the violated rule back into the retry as an explicit instruction —
 * a blind retry of the same prompt reproduces the same output surprisingly
 * often.
 */
export function assertNoDoctrineViolation(
  text: string,
  doctrine: Pick<CoachDoctrine, "forbidden">,
  options: ForbiddenMatchOptions = {},
): void {
  const violations = findDoctrineViolations(text, doctrine, options);
  if (violations.length === 0) return;
  console.error("keel.doctrine.violation", {
    violation_count: violations.length,
    tokens: [...new Set(violations.map((v) => v.token))].join(","),
    detail: "Generated output rejected before delivery; regenerate.",
  });
  throw new DoctrineViolationError(violations);
}

/**
 * The instruction to append on a regeneration attempt.
 *
 * Named and exported because the retry prompt is part of the lock, not an
 * implementation detail of one call site: a retry that does not NAME what was
 * violated is a retry that rolls the dice again.
 */
export function doctrineRetryInstruction(
  violations: readonly DoctrineViolation[],
): string {
  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const v of violations) {
    if (seen.has(v.token)) continue;
    seen.add(v.token);
    bullets.push(
      v.reason
        ? `- You endorsed "${v.matchedText}", which this coach forbids (${v.reason}). Do not recommend it.`
        : `- You endorsed "${v.matchedText}", which this coach forbids. Do not recommend it.`,
    );
  }
  return [
    "Your previous answer broke this coach's method and was rejected:",
    ...bullets,
    "Answer again, keeping everything else, without endorsing those.",
  ].join("\n");
}
