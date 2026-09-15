/**
 * PIVOT C5 — the coach's words for `coach_syntheses.flagged_students.reason_code`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LIVES IN ITS OWN FILE
 * ---------------------------------------------------------------------------
 * The reason codes are a CLOSED vocabulary owned by the engine
 * (`supabase/functions/_shared/keel/coach_synthesis.ts`, `FLAG_REASONS`). This
 * screen is the only place a human ever reads them, so the two lists have to
 * stay in step — and they had not. Found in QA on 2026-08-03: the screen was
 * keyed on `silent_contact`, `hard_week`, `low_coverage` and `restriction_flag`
 * while the engine emits `silent_5d`, `week_too_hard`, `coverage_below_gate`
 * and `restriction_signal`. Six codes out of eight fell through to the raw
 * token, and a coach with a silent student read the literal string
 * `silent_5d` on his Monday screen.
 *
 * The one that mattered: `restriction_signal`. Its copy — "handle directly" —
 * was written, shipped, and unreachable, because it was filed under a key the
 * engine never produces.
 *
 * A separate module is what makes the drift TESTABLE: `flagReasons.int.test.ts`
 * reads the engine file and asserts a bijection with the keys below. Adding a
 * reason code without its coach-words now fails a test instead of surfacing as
 * jargon in front of a paying coach.
 *
 * ---------------------------------------------------------------------------
 * LOT 5 — LA PHRASE A QUITTÉ CE FICHIER, LA BIJECTION EST RESTÉE
 * ---------------------------------------------------------------------------
 * Ce module portait les huit phrases anglaises en dur, c'est-à-dire un `t()`
 * réimplémenté hors du seed: ni la garde de `t()` ni le scanner de coutures ne
 * les voyaient, et `/coach/weekly` ne pouvait pas basculer de langue quoi qu'on
 * écrive dans `fr.ts`. Ce qui reste ici est la seule chose que le seed ne sait
 * pas dire: QUEL code du moteur mène à QUELLE clé. C'est exactement ce que le
 * test de dérive vérifie, et il le vérifie toujours.
 */

import type { MessageKey } from "../i18n/t";
import { t } from "../i18n/t";

/**
 * One line per code. R2 on the prose: what was OBSERVED, never a diagnosis of
 * the person — "Barely logged anything", not "Not committed".
 */
export const FLAG_REASON_KEYS: Record<string, MessageKey> = {
  // Safety first, and the only line that names the coach's action: adherence
  // pressure stops here (§3.4), so there is nothing for Sophia to nudge.
  restriction_signal: "coach.flag.restriction_signal",
  silent_5d: "coach.flag.silent_5d",
  slipping_contact: "coach.flag.slipping_contact",
  week_too_hard: "coach.flag.week_too_hard",
  coverage_below_gate: "coach.flag.coverage_below_gate",
  no_evaluable_plan: "coach.flag.no_evaluable_plan",
  adherence_at_risk: "coach.flag.adherence_at_risk",
  outcome_mismatch: "coach.flag.outcome_mismatch",
};

/**
 * R7: an unknown code is shown RAW rather than hidden or renamed. A coach
 * seeing `some_new_code` can report it; a coach seeing nothing cannot.
 *
 * ⚠️ LE `hasOwnProperty` N'EST PAS DE LA PRUDENCE DÉCORATIVE, IL EST LA GARDE.
 * `t()` LÈVE en DEV sur une clé inconnue: passer `FLAG_REASON_KEYS[code]` sans
 * l'avoir vérifié transformerait le repli « montre le code brut » — celui que
 * le test d'à côté asserte — en écran blanc au premier code que le moteur
 * ajoutera. Les deux règles disent la même chose et se contrediraient si on les
 * enchaînait naïvement: on ne demande une traduction que d'une clé qui existe.
 */
export function flagReasonCopy(code: string): string {
  if (!Object.prototype.hasOwnProperty.call(FLAG_REASON_KEYS, code)) return code;
  return t(FLAG_REASON_KEYS[code]);
}
