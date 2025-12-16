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

export function createAnonClient(): SupabaseClient {
  const { url, anonKey } = getTestEnv();
  return createClient(url, anonKey);
}

export async function createAuthedTestUser() {
  const client = createAnonClient();
  const email = `test+${Date.now()}@example.com`;
  const password = "TestPassword!123";

  const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password });
  if (signUpError) throw signUpError;

  // In local dev, confirmations are disabled; still, safest is to sign in explicitly.
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const user = signInData.user ?? signUpData.user;
  if (!user) throw new Error("Failed to create/sign-in test user");

  return { client, userId: user.id, email };
}


