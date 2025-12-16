/**
 * Cursor/TypeScript workspace shims for Supabase Edge Functions (Deno).
 *
 * Why:
 * - The runtime is Deno (Edge), but the workspace TS server may not be configured for Deno.
 * - The TS server may also not resolve `jsr:` specifiers.
 *
 * This file is only for editor/linting ergonomics and does not affect Edge runtime.
 */

// Deno is provided by the Edge/Deno runtime, but TS in this repo may not know it.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: any;
} & Record<string, unknown>;

// JSR specifier shim for supabase-js (used by Edge Functions).
declare module "jsr:@supabase/supabase-js@2.87.3" {
  // Keep it loose: runtime correctness matters more than TS types here.
  export type SupabaseClient = any;
  export const createClient: any;
}


