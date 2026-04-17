import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getTestEnv() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing test env: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (pointing to Supabase local).",
    );
  }

  return { url, anonKey };
}

export function getServiceRoleEnv() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing test env: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (pointing to Supabase local).",
    );
  }

  return { url, serviceRoleKey };
}

export function createAnonClient(): SupabaseClient {
  const { url, anonKey } = getTestEnv();
  return createClient(url, anonKey);
}

export function createServiceRoleClient(): SupabaseClient {
  const { url, serviceRoleKey } = getServiceRoleEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createAuthedTestUser() {
  const client = createAnonClient();
  const password = "TestPassword!123";

  // These tests can run concurrently; guarantee uniqueness to avoid UNIQUE constraint flakes (phone_number).
  const makeNonce = () => {
    const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return rand.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  };

  let lastErr: any = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const nonce = makeNonce();
    const email = `test+${nonce}@example.com`;
    const phone = `+1555${nonce}`; // E.164-ish

    const { data: signUpData, error: signUpError } = await client.auth.signUp({
      email,
      password,
      options: { data: { phone } },
    });

    if (signUpError) {
      lastErr = signUpError;
      // Retry on transient/unique/DB errors.
      continue;
    }

    // In local dev, confirmations are disabled; still, safest is to sign in explicitly.
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) {
      lastErr = signInError;
      continue;
    }

    const user = signInData.user ?? signUpData.user;
    if (!user) {
      lastErr = new Error("Failed to create/sign-in test user");
      continue;
    }

    const session = signInData.session;
    if (!session) {
      lastErr = new Error("Missing session after sign-in (test user)");
      continue;
    }

    return {
      client,
      userId: user.id,
      email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  }

  throw lastErr ?? new Error("Failed to create test user after retries");
}





