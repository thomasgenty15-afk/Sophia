/// <reference path="../tsserver-shims.d.ts" />
/**
 * KEEL W8 — the card vocabulary and the DETERMINISTIC renderer.
 *
 * Authority: docs/keel/CONTRACT.md (R1, R7), BUILD_PLAN W8.1-W8.3.
 * Database side: supabase/migrations/20260727230000_keel_cards.sql
 *
 * PURE. No I/O, no clock, no client, no model. Everything here is a total
 * function of its arguments, which is the only way "the same variables always
 * produce the same card" is checkable rather than promised.
 *
 * WHY A RENDERER EXISTS ON BOTH SIDES
 * -----------------------------------
 * `student_cards.rendered` is written by a database trigger, and the trigger is
 * the authority: whatever a client sends in that column is discarded. That is
 * what makes "no LLM on the write path" structural rather than a code review
 * rule (memory: defense-card-ui-qa, where enrichment silently rewrote the text
 * the user had typed).
 *
 * This module is the PREVIEW twin: the wizard has to show the sentence before
 * the row exists. Two implementations of one rule is a divergence risk, so it
 * is handled the only honest way — `RENDER_PARITY_CASES` below is a shared
 * fixture, asserted by the Deno test AND by the SQL acceptance test. If the two
 * renderers drift, one of the two suites goes red on the same expected string.
 *
 * R7 everywhere: a missing value, an empty value, a choice outside its option
 * list, a value carrying template markers, or a slot left unresolved all THROW.
 * A card that renders "I order  at " is worse than no card.
 */

// ---------------------------------------------------------------------------
// Tokens (R1: ASCII snake_case, compared by code, never translated)
// ---------------------------------------------------------------------------

export const CARD_KINDS = ["defense", "attack"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const CARD_VARIABLE_TYPES = ["text", "choice", "time", "number"] as const;
export type CardVariableType = (typeof CARD_VARIABLE_TYPES)[number];

/** Shares its closed domain with planned_deviations.kind / upcoming_contexts.kind. */
export const CARD_TRIGGER_CONTEXTS = [
  "restaurant",
  "social",
  "travel",
  "family",
  "work",
  "other",
] as const;
export type CardTriggerContext = (typeof CARD_TRIGGER_CONTEXTS)[number];

export const CARD_TIME_BUCKETS = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
  "any",
] as const;
export type CardTimeBucket = (typeof CARD_TIME_BUCKETS)[number];

export const CARD_WIN_OUTCOMES = ["held", "slipped", "not_used"] as const;
export type CardWinOutcome = (typeof CARD_WIN_OUTCOMES)[number];

export const CARD_WIN_SOURCES = ["chat", "whatsapp", "app", "keyword"] as const;
export type CardWinSource = (typeof CARD_WIN_SOURCES)[number];

function makeParser<T extends string>(
  name: string,
  allowed: readonly T[],
): (value: unknown) => T {
  return (value: unknown): T => {
    const raw = String(value ?? "").trim();
    if ((allowed as readonly string[]).includes(raw)) return raw as T;
    // R7: never `undefined`, never a silent default. A card routed by a token
    // nobody recognises is a card that arrives at the wrong moment, and that is
    // indistinguishable from no card at all.
    throw new Error(
      `[keel/cards] unknown ${name} ${JSON.stringify(value)}. ` +
        `Expected one of: ${allowed.join(", ")}`,
    );
  };
}

export const parseCardKind = makeParser<CardKind>("card_kind", CARD_KINDS);
export const parseCardVariableType = makeParser<CardVariableType>(
  "variable type",
  CARD_VARIABLE_TYPES,
);
export const parseCardTriggerContext = makeParser<CardTriggerContext>(
  "trigger context",
  CARD_TRIGGER_CONTEXTS,
);
export const parseCardTimeBucket = makeParser<CardTimeBucket>(
  "time bucket",
  CARD_TIME_BUCKETS,
);
export const parseCardWinOutcome = makeParser<CardWinOutcome>(
  "card win outcome",
  CARD_WIN_OUTCOMES,
);
export const parseCardWinSource = makeParser<CardWinSource>(
  "card win source",
  CARD_WIN_SOURCES,
);

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface CardVariableOption {
  /** R1 token stored in `variable_values`. */
  value: string;
  /** Prose substituted into the body; R2 lives on the row's content_locale. */
  label: string;
}

export interface CardVariable {
  key: string;
  label: string;
  type: CardVariableType;
  options?: CardVariableOption[];
}

export interface CardTemplate {
  id: string;
  owner_scope: "global" | "coach";
  coach_id: string | null;
  template_key: string;
  card_kind: CardKind;
  activity_class: string;
  trigger_slot_key: string | null;
  trigger_contexts: CardTriggerContext[];
  trigger_time_bucket: CardTimeBucket;
  arm_lead_minutes: number;
  title: string;
  purpose: string;
  produces: string;
  usage: string;
  body_template: string;
  variables: CardVariable[];
  content_locale: string;
  legacy_technique_key: string | null;
}

export type CardVariableValues = Record<string, string | number>;

const VARIABLE_KEY_RE = /^[a-z][a-z0-9_]*$/;
const SLOT_RE = /\{\{([a-z][a-z0-9_]*)\}\}/g;
/** `student_cards.keyword` — the switch word, compared by code, so R1 applies. */
const KEYWORD_RE = /^[a-z0-9_]{2,32}$/;

// ---------------------------------------------------------------------------
// Parsing (fail-loud mirrors of the SQL CHECKs)
// ---------------------------------------------------------------------------

export function parseCardVariables(raw: unknown): CardVariable[] {
  if (!Array.isArray(raw)) {
    throw new Error("[keel/cards] variables must be an array");
  }
  if (raw.length < 1 || raw.length > 8) {
    throw new Error(
      `[keel/cards] a template carries 1..8 variables, got ${raw.length}`,
    );
  }
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`[keel/cards] variable #${index} is not an object`);
    }
    const record = entry as Record<string, unknown>;
    const key = String(record.key ?? "").trim();
    if (!VARIABLE_KEY_RE.test(key)) {
      throw new Error(
        `[keel/cards] variable #${index} has an invalid key ${JSON.stringify(record.key)}`,
      );
    }
    if (seen.has(key)) {
      throw new Error(`[keel/cards] duplicate variable key "${key}"`);
    }
    seen.add(key);

    const label = String(record.label ?? "").trim();
    if (!label) {
      throw new Error(`[keel/cards] variable "${key}" has no label`);
    }
    const type = parseCardVariableType(record.type);

    if (type !== "choice") {
      if (record.options !== undefined) {
        throw new Error(
          `[keel/cards] variable "${key}" is ${type} but carries options`,
        );
      }
      return { key, label, type };
    }

    const rawOptions = record.options;
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
      throw new Error(
        `[keel/cards] choice variable "${key}" needs at least 2 options`,
      );
    }
    const options = rawOptions.map((option, optionIndex) => {
      const optionRecord = (option ?? {}) as Record<string, unknown>;
      const value = String(optionRecord.value ?? "").trim();
      const optionLabel = String(optionRecord.label ?? "").trim();
      if (!VARIABLE_KEY_RE.test(value)) {
        throw new Error(
          `[keel/cards] option #${optionIndex} of "${key}" has a non-token value ` +
            JSON.stringify(optionRecord.value),
        );
      }
      if (!optionLabel) {
        throw new Error(
          `[keel/cards] option "${value}" of "${key}" has no label`,
        );
      }
      return { value, label: optionLabel };
    });
    return { key, label, type, options };
  });
}

/** Every `{{slot}}` in the body, in order of appearance, deduplicated. */
export function bodySlots(bodyTemplate: string): string[] {
  const out: string[] = [];
  for (const match of String(bodyTemplate ?? "").matchAll(SLOT_RE)) {
    if (!out.includes(match[1])) out.push(match[1]);
  }
  return out;
}

/**
 * The template-level invariant, mirroring `keel_card_body_slots_declared`:
 * every slot is declared, and there is no stray `{{`. Throws, so a coach
 * template that could never render is refused when it is authored, not when a
 * student opens it.
 */
export function assertBodyTemplateIsRenderable(
  bodyTemplate: string,
  variables: CardVariable[],
): void {
  const body = String(bodyTemplate ?? "");
  if (!body.trim()) {
    throw new Error("[keel/cards] empty body_template");
  }
  const declared = new Set(variables.map((variable) => variable.key));
  const slots = bodySlots(body);
  for (const slot of slots) {
    if (!declared.has(slot)) {
      throw new Error(
        `[keel/cards] body references undeclared variable "${slot}"`,
      );
    }
  }
  const openings = body.split("{{").length - 1;
  const wellFormed = [...body.matchAll(SLOT_RE)].length;
  if (openings !== wellFormed) {
    throw new Error(
      `[keel/cards] body carries ${openings - wellFormed} malformed slot marker(s)`,
    );
  }
}

export function parseCardTemplate(raw: unknown): CardTemplate {
  const record = (raw ?? {}) as Record<string, unknown>;
  const variables = parseCardVariables(record.variables);
  const bodyTemplate = String(record.body_template ?? "");
  assertBodyTemplateIsRenderable(bodyTemplate, variables);

  const ownerScope = String(record.owner_scope ?? "").trim();
  if (ownerScope !== "global" && ownerScope !== "coach") {
    throw new Error(
      `[keel/cards] unknown owner_scope ${JSON.stringify(record.owner_scope)}`,
    );
  }

  const contextsRaw = Array.isArray(record.trigger_contexts)
    ? record.trigger_contexts
    : [];
  const leadRaw = Number(record.arm_lead_minutes);
  if (!Number.isFinite(leadRaw) || leadRaw < 15 || leadRaw > 1440) {
    throw new Error(
      `[keel/cards] arm_lead_minutes out of range: ${JSON.stringify(record.arm_lead_minutes)}`,
    );
  }

  return {
    id: String(record.id ?? ""),
    owner_scope: ownerScope,
    coach_id: record.coach_id === null || record.coach_id === undefined
      ? null
      : String(record.coach_id),
    template_key: String(record.template_key ?? ""),
    card_kind: parseCardKind(record.card_kind),
    activity_class: String(record.activity_class ?? "other"),
    trigger_slot_key: record.trigger_slot_key === null ||
        record.trigger_slot_key === undefined ||
        String(record.trigger_slot_key).trim() === ""
      ? null
      : String(record.trigger_slot_key).trim(),
    trigger_contexts: contextsRaw.map(parseCardTriggerContext),
    trigger_time_bucket: parseCardTimeBucket(record.trigger_time_bucket ?? "any"),
    arm_lead_minutes: Math.trunc(leadRaw),
    title: String(record.title ?? ""),
    purpose: String(record.purpose ?? ""),
    produces: String(record.produces ?? ""),
    usage: String(record.usage ?? ""),
    body_template: bodyTemplate,
    variables,
    content_locale: String(record.content_locale ?? "en"),
    legacy_technique_key:
      record.legacy_technique_key === null ||
        record.legacy_technique_key === undefined
        ? null
        : String(record.legacy_technique_key),
  };
}

// ---------------------------------------------------------------------------
// THE RENDERER
// ---------------------------------------------------------------------------

/**
 * Substitute `variables` x `values` into `body_template`. Deterministic, total,
 * and identical to `public.keel_render_card` in SQL (see RENDER_PARITY_CASES).
 *
 * The rules are the interesting part, and each one is here because its absence
 * would produce a card that lies:
 *   - a missing or blank value THROWS, instead of leaving a hole;
 *   - a `choice` value must be one of the declared options, and the OPTION
 *     LABEL is what lands in the prose (the stored value stays a token: R1);
 *   - a value containing `{{` or `}}` THROWS. Without that rule the
 *     substitution is order-dependent, and "deterministic" would depend on the
 *     order the coach happened to declare the variables in;
 *   - any slot still unresolved after the pass THROWS.
 */
export function renderCard(
  template: Pick<CardTemplate, "body_template" | "variables">,
  values: CardVariableValues,
): string {
  const body = String(template.body_template ?? "");
  if (!body.trim()) {
    throw new Error("[keel/cards] empty body_template");
  }
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new Error("[keel/cards] variable_values must be an object");
  }

  const declared = new Set(template.variables.map((variable) => variable.key));
  for (const key of Object.keys(values)) {
    if (!declared.has(key)) {
      // Silently dropping an unknown key is how a wizard bug survives a whole
      // release: the card renders, just not with what the human typed.
      throw new Error(`[keel/cards] undeclared variable key "${key}"`);
    }
  }

  let out = body;
  for (const variable of template.variables) {
    const raw = values[variable.key];
    if (raw === undefined || raw === null) {
      throw new Error(
        `[keel/cards] missing value for variable "${variable.key}"`,
      );
    }

    let text: string;
    if (variable.type === "choice") {
      const token = String(raw).trim();
      const option = (variable.options ?? []).find(
        (candidate) => candidate.value === token,
      );
      if (!option) {
        throw new Error(
          `[keel/cards] value "${token}" is not an option of variable "${variable.key}"`,
        );
      }
      text = option.label;
    } else {
      text = String(raw);
    }

    if (!text.trim()) {
      throw new Error(`[keel/cards] empty value for variable "${variable.key}"`);
    }
    if (text.includes("{{") || text.includes("}}")) {
      throw new Error(
        `[keel/cards] value for variable "${variable.key}" contains template markers`,
      );
    }

    out = out.split(`{{${variable.key}}}`).join(text);
  }

  if (out.includes("{{")) {
    throw new Error(`[keel/cards] unresolved slot after substitution: ${out}`);
  }
  return out;
}

/**
 * Normalize the switch word. Lowercased, trimmed, and validated against the
 * same regex the column CHECK enforces — so the value the code compares is the
 * value the database stores.
 */
export function normalizeCardKeyword(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (!KEYWORD_RE.test(value)) {
    throw new Error(
      `[keel/cards] invalid keyword ${JSON.stringify(raw)} ` +
        "(2-32 chars, lowercase ascii letters, digits and underscore)",
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// PARITY FIXTURE — asserted by cards_test.ts and by the SQL acceptance test.
// Two renderers, one expected string. Drift shows up as a red suite, not as a
// card that reads differently depending on which side wrote it.
// ---------------------------------------------------------------------------

export interface RenderParityCase {
  name: string;
  body_template: string;
  variables: CardVariable[];
  values: CardVariableValues;
  expected: string;
}

export const RENDER_PARITY_CASES: RenderParityCase[] = [
  {
    name: "restaurant_order",
    body_template:
      "Situation: I am at {{place}}.\nSignal: {{signal}}\nThen: I order " +
      "{{go_to_dish}} before I read the rest of the menu.\nPlan B: {{plan_b}}",
    variables: [
      { key: "place", label: "Which restaurant?", type: "text" },
      { key: "go_to_dish", label: "Which dish?", type: "text" },
      {
        key: "signal",
        label: "Signal",
        type: "choice",
        options: [
          { value: "menu_arrives", label: "the menu arrives" },
          { value: "first_drink", label: "the first drink is served" },
        ],
      },
      { key: "plan_b", label: "Fallback", type: "text" },
    ],
    values: {
      place: "Chez Marco",
      go_to_dish: "grilled salmon and greens",
      signal: "menu_arrives",
      plan_b: "steak and salad, no fries",
    },
    expected:
      "Situation: I am at Chez Marco.\nSignal: the menu arrives\nThen: I order " +
      "grilled salmon and greens before I read the rest of the menu.\nPlan B: " +
      "steak and salad, no fries",
  },
  {
    name: "repeated_slot_and_number",
    body_template:
      "I cook {{dish}}, {{portions}} portions.\nEven a bad week has " +
      "{{portions}} meals handled.",
    variables: [
      { key: "dish", label: "Dish", type: "text" },
      { key: "portions", label: "Portions", type: "number" },
    ],
    values: { dish: "lentil and chicken traybake", portions: 5 },
    expected:
      "I cook lentil and chicken traybake, 5 portions.\nEven a bad week has " +
      "5 meals handled.",
  },
  {
    name: "time_variable",
    body_template: "At {{when_to_prepare}} I prepare {{prepared}}.",
    variables: [
      { key: "when_to_prepare", label: "When", type: "time" },
      { key: "prepared", label: "What", type: "text" },
    ],
    values: { when_to_prepare: "21:30", prepared: "tomorrow's lunch box" },
    expected: "At 21:30 I prepare tomorrow's lunch box.",
  },
];
