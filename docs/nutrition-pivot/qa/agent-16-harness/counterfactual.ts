// Counterfactual for P0-2: the SAME decider, the SAME clock, the SAME silence —
// the only input that changes is `hasActivePlan`, which the production loader
// derives from `plan_versions` alone and therefore always reports false for a
// masterclass student. Nothing is written; this only shows what the job WOULD
// have decided had it looked at `student_week_plans`.
import { decideReengagement } from "../../../../supabase/functions/_shared/keel/reengagement.ts";

const lastInbound = "2026-08-12T19:00:00.000Z"; // Wed 21:00 Paris
const ticks: Array<[string, string]> = [
  ["Sat 10:25 Paris", "2026-08-15T08:25:00.000Z"],
  ["Sat 21:11 Paris", "2026-08-15T19:11:00.000Z"],
  ["Sun 08:06 Paris", "2026-08-16T06:06:00.000Z"],
];

for (const [label, iso] of ticks) {
  const now = new Date(iso);
  const localHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const silent = (now.getTime() - new Date(lastInbound).getTime()) / 3600_000;
  for (const hasActivePlan of [false, true]) {
    const d = decideReengagement({
      lastInboundAt: lastInbound,
      nudgedThisEpisode: false,
      localHour,
      safetyBand: null,
      hasActivePlan,
      optedOut: false,
      now,
    });
    console.log(
      `${label} | silence=${silent.toFixed(2)}h | localHour=${localHour} | ` +
        `hasActivePlan=${hasActivePlan} -> ${JSON.stringify(d)}`,
    );
  }
}
