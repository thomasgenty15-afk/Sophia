import { createClient } from "jsr:@supabase/supabase-js@2"
import { assertEquals, assertExists } from "jsr:@std/assert@1"

import {
  loadProfileFactsForOnboarding,
  loadOnboardingContext,
  isReturningUser,
  getDeferredOnboardingSteps,
  setDeferredOnboardingSteps,
  removeDeferredOnboardingStep,
} from "./onboarding_helpers.ts"
import { buildWhatsAppOnboardingContext, buildAdaptiveOnboardingContext } from "./onboarding_context.ts"

function getEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`)
  return v.trim()
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18)
}

async function createTestUser(anon: any, admin: any) {
  const nonce = makeNonce()
  const email = `waonboardingtest+${nonce}@example.com`
  const password = "TestPassword!123"
  const phone = `+1555${nonce}`

  const { error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { phone } },
  })
  if (signUpError) throw signUpError

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  if (!signInData.user) throw new Error("Missing user after sign-in")

  return { userId: signInData.user.id, email, phone }
}

async function cleanupTestUser(admin: any, userId: string) {
  // Cleanup in order (due to foreign keys)
  await admin.from("user_profile_facts").delete().eq("user_id", userId)
  await admin.from("memories").delete().eq("user_id", userId)
  await admin.from("chat_messages").delete().eq("user_id", userId)
  await admin.from("profiles").delete().eq("id", userId)
  await admin.auth.admin.deleteUser(userId)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE FACTS LOADING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("onboarding_helpers: loadProfileFactsForOnboarding returns empty for user with no facts", async () => {
  let url: string
  let anonKey: string
  let serviceRoleKey: string
  try {
    url = getEnv("SUPABASE_URL")
    anonKey = getEnv("VITE_SUPABASE_ANON_KEY")
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  } catch (e) {
    console.warn("[handlers_onboarding_db_test] skipping (missing env)", e)
    return
  }

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { userId } = await createTestUser(anon, admin)

  try {
    const facts = await loadProfileFactsForOnboarding(admin, userId)
    assertEquals(Object.keys(facts).length, 0)
  } finally {
    await cleanupTestUser(admin, userId)
  }
})

Deno.test("onboarding_helpers: loadProfileFactsForOnboarding loads tone and verbosity facts", async () => {
  let url: string
  let anonKey: string
  let serviceRoleKey: string
  try {
    url = getEnv("SUPABASE_URL")
    anonKey = getEnv("VITE_SUPABASE_ANON_KEY")
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  } catch (e) {
    console.warn("[handlers_onboarding_db_test] skipping (missing env)", e)
    return
  }

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { userId } = await createTestUser(anon, admin)

  try {
    // Insert profile facts
    await admin.from("user_profile_facts").insert([
      {
        user_id: userId,
        scope: "global",
        key: "conversation.tone",
        value: "direct",
        status: "active",
        confidence: 0.9,
        source_type: "explicit_user",
      },
      {
        user_id: userId,
        scope: "global",
        key: "conversation.verbosity",
        value: "concis",
        status: "active",
        confidence: 0.85,
        source_type: "explicit_user",
      },
    ])

    const facts = await loadProfileFactsForOnboarding(admin, userId)
    assertEquals(facts.tone, "direct")
    assertEquals(facts.verbosity, "concis")
  } finally {
    await cleanupTestUser(admin, userId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// RETURNING USER DETECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("onboarding_helpers: isReturningUser returns false for new user", async () => {
  let url: string
  let anonKey: string
  let serviceRoleKey: string
  try {
    url = getEnv("SUPABASE_URL")
    anonKey = getEnv("VITE_SUPABASE_ANON_KEY")
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  } catch (e) {
    console.warn("[handlers_onboarding_db_test] skipping (missing env)", e)
    return
  }

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { userId } = await createTestUser(anon, admin)

  try {
    const result = await isReturningUser(admin, userId)
    assertEquals(result.returning, false)
    assertEquals(result.hasWebHistory, false)
    assertEquals(result.hasWhatsAppHistory, false)
  } finally {
    await cleanupTestUser(admin, userId)
  }
})

Deno.test("onboarding_helpers: isReturningUser returns true for user with web messages", async () => {
  let url: string
  let anonKey: string
  let serviceRoleKey: string
  try {
    url = getEnv("SUPABASE_URL")
    anonKey = getEnv("VITE_SUPABASE_ANON_KEY")
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  } catch (e) {
    console.warn("[handlers_onboarding_db_test] skipping (missing env)", e)
    return
  }

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { userId } = await createTestUser(anon, admin)

  try {
    // Insert a web message
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "web",
      role: "user",
      content: "Hello Sophia",
    })

    const result = await isReturningUser(admin, userId)
    assertEquals(result.returning, true)
    assertEquals(result.hasWebHistory, true)
    assertEquals(result.hasWhatsAppHistory, false)
  } finally {
    await cleanupTestUser(admin, userId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED STEPS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("onboarding_helpers: setDeferredOnboardingSteps and getDeferredOnboardingSteps work correctly", async () => {
  let url: string
  let anonKey: string
  let serviceRoleKey: string
  try {
    url = getEnv("SUPABASE_URL")
    anonKey = getEnv("VITE_SUPABASE_ANON_KEY")
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  } catch (e) {
    console.warn("[handlers_onboarding_db_test] skipping (missing env)", e)
    return
  }

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { userId } = await createTestUser(anon, admin)

  try {
    // Initially should be empty
    const initial = await getDeferredOnboardingSteps(admin, userId)
    assertEquals(initial.length, 0)

    // Set deferred steps
    await setDeferredOnboardingSteps(admin, userId, ["motivation", "personal_fact"])

    const afterSet = await getDeferredOnboardingSteps(admin, userId)
    assertEquals(afterSet.length, 2)
    assertEquals(afterSet[0], "motivation")
    assertEquals(afterSet[1], "personal_fact")

    // Remove one step
    await removeDeferredOnboardingStep(admin, userId, "motivation")

    const afterRemove = await getDeferredOnboardingSteps(admin, userId)
    assertEquals(afterRemove.length, 1)
    assertEquals(afterRemove[0], "personal_fact")

    // Remove the last step
    await removeDeferredOnboardingStep(admin, userId, "personal_fact")

    const afterRemoveAll = await getDeferredOnboardingSteps(admin, userId)
    assertEquals(afterRemoveAll.length, 0)
  } finally {
    await cleanupTestUser(admin, userId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("onboarding_context: buildWhatsAppOnboardingContext includes profile facts", () => {
  const context = buildWhatsAppOnboardingContext({
    state: "awaiting_plan_motivation",
    siteUrl: "https://sophia-coach.ai",
    supportEmail: "sophia@sophia-coach.ai",
    planPolicy: "plan_active",
    phase: "onboarding",
    profileFacts: {
      tone: "direct",
      verbosity: "concis",
    },
    isReturningUser: false,
  })

  // Check that profile facts are included
  assertEquals(context.includes("STYLE PERSONNALISÉ"), true)
  assertEquals(context.includes("Ton: direct"), true)
  assertEquals(context.includes("Longueur: concis"), true)
})

Deno.test("onboarding_context: buildWhatsAppOnboardingContext includes returning user flag", () => {
  const context = buildWhatsAppOnboardingContext({
    state: "optin_welcome",
    siteUrl: "https://sophia-coach.ai",
    supportEmail: "sophia@sophia-coach.ai",
    planPolicy: "no_plan",
    phase: "onboarding",
    isReturningUser: true,
  })

  assertEquals(context.includes("USER REVENANT"), true)
  assertEquals(context.includes("Content de te retrouver"), true)
})

Deno.test("onboarding_context: buildAdaptiveOnboardingContext includes urgent flow instructions", () => {
  const context = buildAdaptiveOnboardingContext({
    flow: "urgent",
    state: "optin_welcome",
    siteUrl: "https://sophia-coach.ai",
    supportEmail: "sophia@sophia-coach.ai",
    planPolicy: "no_plan",
  })

  assertEquals(context.includes("URGENCE DÉTECTÉE"), true)
  assertEquals(context.includes("SKIP la question motivation"), true)
})

Deno.test("onboarding_context: buildAdaptiveOnboardingContext includes serious topic flow instructions", () => {
  const context = buildAdaptiveOnboardingContext({
    flow: "serious_topic",
    state: "optin_welcome",
    siteUrl: "https://sophia-coach.ai",
    supportEmail: "sophia@sophia-coach.ai",
    planPolicy: "no_plan",
    detectedTopic: "problème au travail",
  })

  assertEquals(context.includes("SUJET SÉRIEUX DÉTECTÉ"), true)
  assertEquals(context.includes("problème au travail"), true)
})

Deno.test("onboarding_context: buildAdaptiveOnboardingContext includes deferred flow instructions", () => {
  const context = buildAdaptiveOnboardingContext({
    flow: "deferred",
    state: "deferred_motivation",
    siteUrl: "https://sophia-coach.ai",
    supportEmail: "sophia@sophia-coach.ai",
    planPolicy: "unknown",
  })

  assertEquals(context.includes("ÉTAPES DIFFÉRÉES"), true)
  assertEquals(context.includes("bon moment pour les poser"), true)
})

// ═══════════════════════════════════════════════════════════════════════════════
// FULL CONTEXT LOADER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("onboarding_helpers: loadOnboardingContext returns complete context", async () => {
  let url: string
  let anonKey: string
  let serviceRoleKey: string
  try {
    url = getEnv("SUPABASE_URL")
    anonKey = getEnv("VITE_SUPABASE_ANON_KEY")
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  } catch (e) {
    console.warn("[handlers_onboarding_db_test] skipping (missing env)", e)
    return
  }

  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim()
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000")
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase)
  const hasGemini = Boolean((Deno.env.get("GEMINI_API_KEY") ?? "").trim())
  if (!hasGemini && !megaEnabled) {
    console.warn("[handlers_onboarding_db_test] skipping loadOnboardingContext (missing GEMINI_API_KEY)")
    return
  }

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { userId } = await createTestUser(anon, admin)

  try {
    const ctx = await loadOnboardingContext(admin, userId, "test query")

    assertExists(ctx.profileFacts)
    assertExists(ctx.memories)
    assertEquals(typeof ctx.isReturning, "boolean")
    assertEquals(typeof ctx.hasWebHistory, "boolean")
    assertEquals(typeof ctx.hasWhatsAppHistory, "boolean")
  } finally {
    await cleanupTestUser(admin, userId)
  }
})

