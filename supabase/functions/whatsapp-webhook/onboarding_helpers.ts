import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateEmbedding } from "../_shared/gemini.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE FACTS LOADING FOR WHATSAPP ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProfileFacts {
  tone?: string          // "direct" | "doux" | "cash"
  verbosity?: string     // "concis" | "détaillé"
  useEmojis?: string     // "avec" | "sans" | "peu"
  wakeTime?: string      // "6h30", "7h"
  sleepTime?: string     // "23h", "minuit"
  workHours?: string     // "9h-18h", "mi-temps"
  energyPeaks?: string   // "matin", "soir"
  job?: string           // "développeur", "médecin"
  hobbies?: string       // "course, lecture"
  family?: string        // "2 enfants", "célibataire"
}

const PROFILE_KEY_MAP: Record<string, keyof ProfileFacts> = {
  "conversation.tone": "tone",
  "conversation.verbosity": "verbosity",
  "conversation.use_emojis": "useEmojis",
  "schedule.wake_time": "wakeTime",
  "schedule.sleep_time": "sleepTime",
  "schedule.work_hours": "workHours",
  "schedule.energy_peaks": "energyPeaks",
  "personal.job": "job",
  "personal.hobbies": "hobbies",
  "personal.family": "family",
}

export async function loadProfileFactsForOnboarding(
  admin: SupabaseClient,
  userId: string,
): Promise<ProfileFacts> {
  const { data, error } = await admin
    .from("user_profile_facts")
    .select("key, value")
    .eq("user_id", userId)
    .in("scope", ["global", "whatsapp"])
    .eq("status", "active")

  if (error) {
    console.warn("[onboarding_helpers] loadProfileFacts failed:", error)
    return {}
  }

  const facts: ProfileFacts = {}
  for (const row of (data ?? []) as any[]) {
    const key = String(row?.key ?? "").trim()
    const factKey = PROFILE_KEY_MAP[key]
    if (factKey && row?.value != null) {
      facts[factKey] = typeof row.value === "string" ? row.value : JSON.stringify(row.value)
    }
  }
  return facts
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORIES LOADING FOR WHATSAPP ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnboardingMemory {
  content: string
  sourceType: string
  date: string
}

export async function loadRecentMemoriesForOnboarding(
  admin: SupabaseClient,
  userId: string,
  queryText: string,
  limit: number = 3,
): Promise<OnboardingMemory[]> {
  try {
    // Use RAG to find relevant memories
    const embedding = await generateEmbedding(queryText || "bienvenue onboarding motivation")

    const { data: memories, error: memErr } = await admin.rpc("match_memories_for_user", {
      target_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.55, // Lower threshold to catch more context
      match_count: limit,
      filter_status: ["consolidated"],
    } as any)

    if (memErr) {
      console.warn("[onboarding_helpers] match_memories_for_user failed:", memErr)
      return []
    }

    return ((memories ?? []) as any[]).map((m: any) => ({
      content: String(m.content ?? "").slice(0, 200),
      sourceType: String(m.source_type ?? "unknown"),
      date: m.created_at ? new Date(m.created_at).toLocaleDateString("fr-FR") : "Date inconnue",
    }))
  } catch (e) {
    console.warn("[onboarding_helpers] loadRecentMemories error:", e)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK IF RETURNING USER (has prior interactions)
// ═══════════════════════════════════════════════════════════════════════════════

export async function isReturningUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ returning: boolean; hasWebHistory: boolean; hasWhatsAppHistory: boolean }> {
  // Check for prior memories (any scope)
  const { count: memCount } = await admin
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .limit(1)

  // Check for prior WhatsApp messages
  const { count: waCount } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .eq("role", "user")
    .limit(1)

  // Check for prior web messages
  const { count: webCount } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("scope", "web")
    .eq("role", "user")
    .limit(1)

  const hasWhatsAppHistory = (waCount ?? 0) > 0
  const hasWebHistory = (webCount ?? 0) > 0 || (memCount ?? 0) > 0
  const returning = hasWhatsAppHistory || hasWebHistory

  return { returning, hasWebHistory, hasWhatsAppHistory }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL ONBOARDING CONTEXT LOADER
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnboardingContext {
  profileFacts: ProfileFacts
  memories: OnboardingMemory[]
  isReturning: boolean
  hasWebHistory: boolean
  hasWhatsAppHistory: boolean
}

export async function loadOnboardingContext(
  admin: SupabaseClient,
  userId: string,
  queryText: string = "",
): Promise<OnboardingContext> {
  // Load all in parallel for speed
  const [profileFacts, memories, returningStatus] = await Promise.all([
    loadProfileFactsForOnboarding(admin, userId),
    loadRecentMemoriesForOnboarding(admin, userId, queryText, 3),
    isReturningUser(admin, userId),
  ])

  return {
    profileFacts,
    memories,
    isReturning: returningStatus.returning,
    hasWebHistory: returningStatus.hasWebHistory,
    hasWhatsAppHistory: returningStatus.hasWhatsAppHistory,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED ONBOARDING STEPS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export type DeferredOnboardingStep = "motivation" | "personal_fact"

export async function getDeferredOnboardingSteps(
  admin: SupabaseClient,
  userId: string,
): Promise<DeferredOnboardingStep[]> {
  const { data } = await admin
    .from("profiles")
    .select("whatsapp_deferred_onboarding")
    .eq("id", userId)
    .maybeSingle()

  const raw = (data as any)?.whatsapp_deferred_onboarding
  if (!Array.isArray(raw)) return []
  return raw.filter((s: any) => s === "motivation" || s === "personal_fact") as DeferredOnboardingStep[]
}

export async function setDeferredOnboardingSteps(
  admin: SupabaseClient,
  userId: string,
  steps: DeferredOnboardingStep[],
): Promise<void> {
  await admin
    .from("profiles")
    .update({
      whatsapp_deferred_onboarding: steps.length > 0 ? steps : null,
    })
    .eq("id", userId)
}

export async function removeDeferredOnboardingStep(
  admin: SupabaseClient,
  userId: string,
  step: DeferredOnboardingStep,
): Promise<void> {
  const current = await getDeferredOnboardingSteps(admin, userId)
  const updated = current.filter((s) => s !== step)
  await setDeferredOnboardingSteps(admin, userId, updated)
}


