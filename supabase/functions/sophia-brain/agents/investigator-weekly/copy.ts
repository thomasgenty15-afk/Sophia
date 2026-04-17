/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export async function weeklyInvestigatorSay(
  key: string,
  _context?: Record<string, unknown>,
  _meta?: Record<string, unknown>,
): Promise<string> {
  switch (key) {
    case "weekly_bilan_user_stopped":
      return "Pas de souci, on reprendra le bilan hebdo une autre fois.";
    default:
      return "On garde l'essentiel et on reprend quand tu veux.";
  }
}
