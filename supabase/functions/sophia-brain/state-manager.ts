import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateEmbedding } from "../_shared/gemini.ts";

export type AgentMode =
  | "dispatcher"
  | "sentry"
  | "companion";

export interface UserChatState {
  current_mode: AgentMode;
  risk_level: number;
  investigation_state: any; // JSON
  short_term_context: string;
  unprocessed_msg_count: number;
  last_processed_at: string;
  last_interaction_at?: string;
  // Free-form JSON used for lightweight, non-critical features (e.g. global parking-lot).
  temp_memory?: any;
}

export function normalizeScope(input: unknown, fallback: string): string {
  const raw = (typeof input === "string" ? input : "").trim();
  const s = raw || fallback;
  // Keep scopes short + safe for logs/DB.
  // Allowed: letters/digits/._:- (covers "module:week_1", etc)
  const cleaned = s.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 180);
  return cleaned || fallback;
}

function envGet(name: string): string {
  try {
    return String((globalThis as any)?.Deno?.env?.get?.(name) ?? "").trim();
  } catch {
    return "";
  }
}

async function serviceRoleInsertChatMessage(
  row: Record<string, unknown>,
  opts?: { selectId?: boolean },
): Promise<{ data: any | null; error: Error | null }> {
  const url = envGet("SUPABASE_URL");
  const key = envGet("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return { data: null, error: new Error("missing_service_role_env") };
  }
  try {
    const endpoint = `${url.replace(/\/$/, "")}/rest/v1/chat_messages${
      opts?.selectId ? "?select=id" : ""
    }`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: opts?.selectId ? "return=representation" : "return=minimal",
      },
      body: JSON.stringify(row),
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      return {
        data: null,
        error: new Error(
          String(
            body?.message ?? body?.msg ?? body?.error ?? response.statusText,
          ),
        ),
      };
    }
    return { data: Array.isArray(body) ? body[0] ?? null : body, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export async function getUserState(
  supabase: SupabaseClient,
  userId: string,
  scopeRaw: unknown = "web",
): Promise<UserChatState> {
  const scope = normalizeScope(scopeRaw, "web");
  const { data, error } = await supabase
    .from("user_chat_states")
    .select("*")
    .eq("user_id", userId)
    .eq("scope", scope)
    .single();

  if (error && error.code === "PGRST116") {
    // Pas d'état -> On initialise
    const initialState: UserChatState = {
      current_mode: "companion",
      risk_level: 0,
      investigation_state: null,
      short_term_context: "",
      unprocessed_msg_count: 0,
      last_processed_at: new Date().toISOString(),
      last_interaction_at: new Date().toISOString(),
      temp_memory: {},
    };
    await supabase.from("user_chat_states").insert({
      user_id: userId,
      scope,
      ...initialState,
    });
    return initialState;
  }

  if (error) throw error;
  return data as UserChatState;
}

export async function updateUserState(
  supabase: SupabaseClient,
  userId: string,
  scopeRaw: unknown,
  updates: Partial<UserChatState>,
) {
  const scope = normalizeScope(scopeRaw, "web");
  const { error } = await supabase
    .from("user_chat_states")
    .update(updates)
    .eq("user_id", userId)
    .eq("scope", scope);

  if (error) throw error;
}

export async function logMessage(
  supabase: SupabaseClient,
  userId: string,
  scopeRaw: unknown,
  role: "user" | "assistant" | "system",
  content: string,
  agentUsed?: AgentMode,
  metadata?: Record<string, unknown>,
) {
  await insertChatMessage(
    supabase,
    userId,
    scopeRaw,
    role,
    content,
    agentUsed,
    metadata,
  );
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  userId: string,
  scopeRaw: unknown,
  role: "user" | "assistant" | "system",
  content: string,
  agentUsed?: AgentMode,
  metadata?: Record<string, unknown>,
  opts?: { selectId?: boolean },
): Promise<{ id: string | null }> {
  const scope = normalizeScope(scopeRaw, "web");
  const row: Record<string, unknown> = {
    user_id: userId,
    scope,
    role,
    content,
    metadata: metadata ?? {},
  };
  if (agentUsed) row.agent_used = agentUsed;

  async function perform(client: SupabaseClient) {
    const query = (client as any).from("chat_messages").insert(row);
    return opts?.selectId ? await query.select("id").single() : await query;
  }

  const { data, error } = await perform(supabase);
  if (!error) return { id: data?.id ?? null };

  const { data: adminData, error: adminError } =
    await serviceRoleInsertChatMessage(row, opts);
  if (!adminError) return { id: adminData?.id ?? null };
  if (adminError) {
    console.warn("[state-manager] service-role chat_messages insert failed", {
      role,
      scope,
      error: String((adminError as any)?.message ?? adminError ?? "").slice(
        0,
        280,
      ),
    });
    throw new Error(
      `chat_messages_insert_failed role=${
        String(row.role)
      } scope=${scope} error=${
        String((adminError as any)?.message ?? adminError ?? "").slice(0, 280)
      }`,
    );
  }
  throw new Error(
    `chat_messages_insert_failed role=${String(row.role)} scope=${scope}`,
  );
}

export async function getCoreIdentity(
  _supabase: SupabaseClient,
  _userId: string,
  _opts?: unknown,
): Promise<string> {
  // PIVOT — l'Identité Profonde (Architecte) est supprimée avec ses tables
  // (`user_core_identity`, `user_core_identity_archive`) et sa RPC
  // `match_core_identity_by_embedding`.
  //
  // La fonction SURVIT en rendant "" plutôt que d'être retirée: son unique
  // appelant (`context/loader.ts`) compose un bloc de contexte, et "" y est
  // déjà une valeur légitime (« rien à dire sur cet axe »). Supprimer l'appel
  // demanderait de retoucher l'assemblage du contexte du cerveau — beaucoup
  // plus de surface pour zéro gain, alors que le contrat de retour, lui, est
  // déjà exactement celui-là.
  //
  // Elle ne fait plus AUCUN appel réseau: avant ce changement elle payait un
  // embedding + une RPC + une lecture de table à chaque tour pour un axe
  // produit qui n'existe plus.
  return "";
}
