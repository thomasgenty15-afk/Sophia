// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — LE REFUS TARDIF, PLIÉ DANS LA LIGNE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `index.ts` (découpage des gros fichiers,
// lot 3a). Aucune logique changée. Seul `index.ts` l'importe; ce module
// n'importe jamais `index.ts`, et il n'a aucun effet au chargement.
//
// Ce qui est ici : `foldLateOutcome`, appelée par le wrapper `Deno.serve`
// d'`index.ts` quand `handle` rend sa réponse après le 202. Le long
// commentaire « LOT A — ACCEPTER TÔT, FINIR DANS LE WORKER » qui l'explique
// est resté dans `index.ts`, au-dessus du wrapper.

import { failDraft } from "../_shared/keel/draft_store.ts";
import { adminClient } from "./env.ts";

/**
 * LE REFUS TARDIF, PLIÉ DANS LA LIGNE. Un 2xx ne touche à rien: la RPC a écrit
 * `done`. Au-delà de 400, le jeton du corps devient `error_code` — `failDraft`
 * refuse d'écraser `done`/`adopted`, donc un refus arrivé après l'écriture ne
 * défait rien.
 */
async function foldLateOutcome(draftId: string, late: Response, wallMs: number): Promise<void> {
  if (late.status < 400) return;
  const body = await late.clone().json().catch(() => ({})) as Record<string, unknown>;
  const token = typeof body.error === "string" ? body.error.trim() : "";
  const errorCode = token !== "" ? token : "compose_failed";
  // ⚠️ LE POURQUOI, PAS SEULEMENT LE JETON. Mesuré le 2026-09-15 sur staging :
  // un `plan_not_deliverable` plié avec `error: null` — le 422 ne porte pas de
  // `detail`, il porte `refusals`/`unevaluated`/`incomplete`. Sans eux, la
  // ligne dit « refusé » et personne ne sait par quel contrôle.
  const why: Record<string, unknown> = {};
  for (const key of ["detail", "refusals", "unevaluated", "incomplete"]) {
    if (body[key] != null) why[key] = body[key];
  }
  const detail = typeof body.detail === "string" && Object.keys(why).length === 1
    ? body.detail
    : Object.keys(why).length === 0
    ? null
    : JSON.stringify(why);
  await failDraft(adminClient(), draftId, { errorCode, error: detail, wallMs });
  console.log(JSON.stringify({
    tag: "keel.household_meal.late_outcome",
    draft_id: draftId,
    status: late.status,
    error: errorCode,
  }));
}

export { foldLateOutcome };
