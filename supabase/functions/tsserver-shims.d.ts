/**
 * Cursor/TypeScript workspace shims for Supabase Edge Functions (Deno).
 *
 * Why:
 * - The runtime is Deno (Edge), but the workspace TS server may not be configured for Deno.
 * - The TS server may also not resolve `jsr:` specifiers.
 *
 * This file is only for editor/linting ergonomics and does not affect Edge runtime.
 */

// NOTE: Do not redeclare the global `Deno` value here.
// - Deno v2 ships its own global typings, and redeclaring `const Deno` breaks `deno test` type-checking.
// - This file remains useful for shimming `jsr:` modules in editors that don't understand them.

// JSR specifier shim for supabase-js (used by Edge Functions).
declare module "jsr:@supabase/supabase-js@2.87.3" {
  // Keep it loose: runtime correctness matters more than TS types here.
  export type SupabaseClient = any;
  export const createClient: any;
}


