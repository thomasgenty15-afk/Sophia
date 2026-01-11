/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Thin facade: keep existing import paths stable while the implementation lives in `agents/investigator/*`.
export { runInvestigator } from "./investigator/run.ts"

// Test/support exports kept stable.
export { megaTestLogItem, getYesterdayCheckupSummary } from "./investigator/db.ts"
export { getMissedStreakDays, getCompletedStreakDays, maybeHandleStreakAfterLog } from "./investigator/streaks.ts"

 