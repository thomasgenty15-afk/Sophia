/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Legacy executable router intentionally removed from the nominal
 * select_state_potion perimeter.
 *
 * `select_state_potion` is now owned by `handoff.ts` as a non-mutant
 * platform_handoff_skill. This shim exists only to keep stale imports from
 * compiling while making accidental use visible in telemetry/tests.
 */
export async function maybeRunSelectStatePotionOperation(): Promise<null> {
  console.warn(
    "[SelectStatePotion] legacy executable router disabled; use runSelectStatePotionHandoffSkill",
  );
  return null;
}
