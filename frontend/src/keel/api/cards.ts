// KEEL W8 — the card client.
//
// THE CATALOGUE LIVES IN THE DATABASE, AND ONLY THERE.
// Before this module, the six attack techniques existed in three hardcoded
// copies that had already diverged: `generate-attack-card-v1/index.ts:37-127`,
// `components/dashboard-v2/attackTechniquePreviews.ts`, and the merge inside
// `AttackCards.tsx`. Each had its own question wording. `card_templates`
// (owner_scope='global') is now the single source; this module reads it, and
// `toAttackTechniqueViews` adapts it to the shape the legacy attack panel
// already speaks so the retirement of the copies is a deletion, not a rewrite.
//
// THERE IS NO RENDERER IN THIS FILE, ON PURPOSE.
// `student_cards.rendered` is written by a database trigger from
// `body_template` x `variable_values`. A client-side renderer would be a third
// implementation of one rule, and the moment it drifted the wizard would show a
// sentence the stored card does not contain. So the card text displayed
// anywhere in the app is ALWAYS the value read back from the row — the same
// write-through discipline `keelClient.ts` applies to facts. The cost is one
// round trip before the student sees their sentence; the gain is that the
// sentence they see is the one that exists.

import { supabase } from "../../lib/supabase";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ---------------------------------------------------------------------------
// Tokens (R1 — mirrors of the CHECK vocabularies, never translated)
// ---------------------------------------------------------------------------

export type CardKind = "defense" | "attack";
export type CardVariableType = "text" | "choice" | "time" | "number";
export type CardTriggerContext =
  | "restaurant"
  | "social"
  | "travel"
  | "family"
  | "work"
  | "other";
export type CardWinOutcome = "held" | "slipped" | "not_used";
export type CardWinSource = "chat" | "whatsapp" | "app" | "keyword";

export interface CardVariableOption {
  value: string;
  label: string;
}

export interface CardVariable {
  key: string;
  label: string;
  type: CardVariableType;
  options?: CardVariableOption[];
}

export interface CardTemplateRow {
  id: string;
  owner_scope: "global" | "coach";
  template_key: string;
  card_kind: CardKind;
  activity_class: string;
  trigger_slot_key: string | null;
  trigger_contexts: CardTriggerContext[];
  trigger_time_bucket: string;
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

export interface StudentCardRow {
  id: string;
  template_id: string;
  variable_values: Record<string, string | number>;
  /** Written by the database trigger. Never composed in the browser. */
  rendered: string;
  rendered_at: string;
  keyword: string | null;
  coach_approved: boolean;
  status: "draft" | "active" | "archived";
  created_at: string;
}

export interface CardArmingRow {
  id: string;
  student_card_id: string;
  trigger_kind: "planned_deviation" | "upcoming_context";
  local_date: string;
  slot_key: string | null;
  event_at: string;
  arm_at: string;
  status: "pending" | "delivered" | "skipped" | "expired";
}

const TEMPLATE_COLUMNS =
  "id, owner_scope, template_key, card_kind, activity_class, trigger_slot_key, " +
  "trigger_contexts, trigger_time_bucket, arm_lead_minutes, title, purpose, " +
  "produces, usage, body_template, variables, content_locale, legacy_technique_key";

const CARD_COLUMNS =
  "id, template_id, variable_values, rendered, rendered_at, keyword, " +
  "coach_approved, status, created_at";

const ARMING_COLUMNS =
  "id, student_card_id, trigger_kind, local_date, slot_key, event_at, arm_at, status";

/** R7 at the network boundary: a PostgREST error is raised, never swallowed. */
function unwrap(
  result: { data: unknown; error: { message: string } | null },
  what: string,
): unknown {
  if (result.error) {
    throw new Error(`[keel/cards] ${what} failed: ${result.error.message}`);
  }
  return result.data ?? [];
}

// ---------------------------------------------------------------------------
// Reads (PostgREST, under the student's own JWT — RLS is the access control)
// ---------------------------------------------------------------------------

/**
 * The catalogue this user may see: every active global template, plus the
 * templates of the coach who is actually coaching them. Both halves come from
 * RLS policies, not from a filter written here — a filter in the client is a
 * suggestion, a policy is a rule.
 */
export async function loadCardTemplates(
  cardKind?: CardKind,
): Promise<CardTemplateRow[]> {
  let query = supabase
    .from("card_templates")
    .select(TEMPLATE_COLUMNS)
    .order("card_kind", { ascending: true })
    .order("template_key", { ascending: true });
  if (cardKind) query = query.eq("card_kind", cardKind);
  return unwrap(await query, "loadCardTemplates") as CardTemplateRow[];
}

export async function loadStudentCards(userId: string): Promise<StudentCardRow[]> {
  const res = await supabase
    .from("student_cards")
    .select(CARD_COLUMNS)
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  return unwrap(res, "loadStudentCards") as StudentCardRow[];
}

/**
 * The cards armed for the moments still ahead. `event_at > now` is in the
 * query, not only in the sweep: a card whose event has passed is not "late",
 * it is wrong, and showing it would be the product's own thesis reversed.
 */
export async function loadArmedCards(
  userId: string,
  now: Date = new Date(),
): Promise<CardArmingRow[]> {
  const res = await supabase
    .from("card_armings")
    .select(ARMING_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("event_at", now.toISOString())
    .order("arm_at", { ascending: true });
  return unwrap(res, "loadArmedCards") as CardArmingRow[];
}

// ---------------------------------------------------------------------------
// Writes (edge function — the render is server-side, so the write is too)
// ---------------------------------------------------------------------------

async function callCards<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("[keel/cards] no active session");

  const res = await fetch(`${FUNCTIONS_BASE}/keel-cards-v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `[keel/cards] ${String(payload.action)} failed: ${
        String((json as { error?: unknown })?.error ?? `HTTP ${res.status}`)
      }`,
    );
  }
  return json as T;
}

/** Returns the row as the database rendered it, never the payload we sent. */
export async function createStudentCard(args: {
  templateId: string;
  variableValues: Record<string, string | number>;
  keyword?: string | null;
  planVersionId?: string | null;
  commitmentId?: string | null;
}): Promise<StudentCardRow> {
  const json = await callCards<{ card: StudentCardRow }>({
    action: "create_card",
    template_id: args.templateId,
    variable_values: args.variableValues,
    keyword: args.keyword ?? null,
    plan_version_id: args.planVersionId ?? null,
    commitment_id: args.commitmentId ?? null,
  });
  return json.card;
}

export async function updateStudentCard(args: {
  cardId: string;
  variableValues?: Record<string, string | number>;
  keyword?: string | null;
  status?: StudentCardRow["status"];
}): Promise<StudentCardRow> {
  const json = await callCards<{ card: StudentCardRow }>({
    action: "update_card",
    card_id: args.cardId,
    ...(args.variableValues ? { variable_values: args.variableValues } : {}),
    ...(args.keyword !== undefined ? { keyword: args.keyword } : {}),
    ...(args.status ? { status: args.status } : {}),
  });
  return json.card;
}

export async function logCardWin(args: {
  studentCardId: string;
  localDate: string;
  outcome: CardWinOutcome;
  source?: CardWinSource;
  armingId?: string | null;
  slotKey?: string | null;
  note?: string | null;
}): Promise<{ id: string; outcome: CardWinOutcome }> {
  const json = await callCards<{ win: { id: string; outcome: CardWinOutcome } }>({
    action: "log_win",
    student_card_id: args.studentCardId,
    arming_id: args.armingId ?? null,
    local_date: args.localDate,
    slot_key: args.slotKey ?? null,
    outcome: args.outcome,
    source: args.source ?? "app",
    note: args.note ?? null,
  });
  return json.win;
}

// ---------------------------------------------------------------------------
// Adapter for the legacy attack panel
// ---------------------------------------------------------------------------

/**
 * The shape `AttackCards.tsx` and the stored `user_attack_cards.content`
 * already speak. Field-by-field mapping, no invention:
 *   technique_key <- legacy_technique_key ?? template_key
 *   questions     <- variables[].label   (the questions ARE the variables)
 *
 * `legacy_technique_key` is why this is a mapping and not a break: the six
 * stored technique keys are French-spelled (`texte_recadrage`) while KEEL
 * tokens are English (R1). Preferring the legacy key here keeps every card a
 * student already generated joined to its catalogue entry.
 */
export interface AttackTechniqueCatalogueEntry {
  technique_key: string;
  title: string;
  pour_quoi: string;
  objet_genere: string;
  questions: string[];
  mode_emploi: string;
  generated_result: null;
}

export function toAttackTechniqueViews(
  templates: CardTemplateRow[],
): AttackTechniqueCatalogueEntry[] {
  return templates
    .filter((template) => template.card_kind === "attack")
    .map((template) => ({
      technique_key: template.legacy_technique_key ?? template.template_key,
      title: template.title,
      pour_quoi: template.purpose,
      objet_genere: template.produces,
      questions: (template.variables ?? []).map((variable) => variable.label),
      mode_emploi: template.usage,
      generated_result: null,
    }));
}

/** The single fetch behind the attack panel: one query, one adapter. */
export async function loadAttackTechniqueCatalogue(): Promise<
  AttackTechniqueCatalogueEntry[]
> {
  return toAttackTechniqueViews(await loadCardTemplates("attack"));
}
