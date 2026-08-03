import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Card, SectionLabel } from "../components/ui/Card";
import { displayWeights, type ReviewRow } from "./studentProgressWeight";

/**
 * PIVOT N3 — `/app/progress` : l'avancée, semaine et mois.
 *
 * ---------------------------------------------------------------------------
 * L'ORDRE DES BLOCS EST UNE DÉCISION, PAS UNE MISE EN PAGE
 * ---------------------------------------------------------------------------
 * 1. LA RÉGULARITÉ d'abord. C'est la seule métrique dont ce dépôt a la preuve
 *    qu'elle prédit le résultat (PHOTO_QUANTIFICATION §5, Peterson 2014,
 *    n=220, p<0,0001 sur la fréquence de log ; la COMPLÉTUDE du log, elle, ne
 *    prédit rien, p>0,05). Elle passe donc en premier et en gros.
 * 2. LA VIVABILITÉ ensuite — les taps du soir. « Est-ce que ça tient ? »
 * 3. LES PORTIONS — la réponse à « je mange beaucoup ou peu ? » sans un kcal.
 * 4. LE POIDS en dernier, et c'est délibéré : la variation d'eau quotidienne
 *    (±1-2 kg) dépasse le signal hebdomadaire, et c'est la métrique la plus
 *    associée aux troubles alimentaires. Il est affiché en clair — arbitrage
 *    produit du 2026-08-03 — mais il ne mène jamais.
 *
 * ---------------------------------------------------------------------------
 * CE QUI N'EST PAS ICI, ET NE DOIT PAS Y ARRIVER
 * ---------------------------------------------------------------------------
 * Aucun score, aucun pourcentage de réalisation, aucune série, aucun badge.
 * Le coach RECOMMANDE, l'élève DÉCIDE, personne ne note (§1.3 bannit
 * explicitement streaks et badges : un jour raté ne casse rien).
 *
 * ---------------------------------------------------------------------------
 * LE GARDE-FOU TCA
 * ---------------------------------------------------------------------------
 * Si `restriction_guard` a levé un drapeau, l'écran chiffré se masque
 * entièrement — doctrine W3.2 : « plus aucun score affiché à l'élève ». Ce
 * n'est pas une préférence d'affichage, c'est une règle clinique, et elle
 * s'applique AVANT toute autre considération de lisibilité.
 */

type Range = "week" | "month";

interface PulseRow {
  local_date: string;
  overall: "good" | "mixed" | "hard";
  axis: string | null;
}
interface EventRow {
  local_date: string;
  portion_band: string | null;
}
type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "restricted" }
  | { kind: "ready" };

const AXIS_LABELS: Record<string, string> = {
  energy: "energy",
  hunger: "hunger",
  sleep: "sleep",
};

function daysBack(range: Range): number {
  return range === "week" ? 7 : 30;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

export default function StudentProgressPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [range, setRange] = React.useState<Range>("week");
  const [pulses, setPulses] = React.useState<PulseRow[]>([]);
  const [events, setEvents] = React.useState<EventRow[]>([]);
  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        const since = isoDaysAgo(daysBack(range));

        // Le garde TCA d'abord. Si un drapeau est levé, on ne lit même pas le
        // reste: l'écran ne doit pas exister pour cet élève cette semaine.
        const flagRes = await supabase
          .from("weekly_reviews")
          .select("risk_band, week_start_date")
          .order("week_start_date", { ascending: false })
          .limit(1);
        if (flagRes.error) throw new Error(flagRes.error.message);
        const latest = (flagRes.data ?? [])[0] as { risk_band?: string } | undefined;
        if (latest?.risk_band === "restriction_flag") {
          if (!cancelled) setState({ kind: "restricted" });
          return;
        }

        const [pulseRes, eventRes, reviewRes] = await Promise.all([
          supabase
            .from("student_daily_checkins")
            .select("local_date, overall, axis")
            .gte("local_date", since)
            .order("local_date", { ascending: true }),
          supabase
            .from("protocol_events")
            .select("local_date, portion_band")
            .gte("local_date", since),
          supabase
            .from("weekly_reviews")
            .select("week_start_date, outcomes, biofeedback")
            .gte("week_start_date", since)
            .order("week_start_date", { ascending: true }),
        ]);
        if (pulseRes.error) throw new Error(pulseRes.error.message);
        if (eventRes.error) throw new Error(eventRes.error.message);
        if (reviewRes.error) throw new Error(reviewRes.error.message);

        if (cancelled) return;
        setPulses((pulseRes.data ?? []) as PulseRow[]);
        setEvents((eventRes.data ?? []) as EventRow[]);
        setReviews((reviewRes.data ?? []) as ReviewRow[]);
        setState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const total = daysBack(range);

  // 1. RÉGULARITÉ — des jours DISTINCTS avec au moins un fait.
  const loggedDays = new Set(events.map((e) => e.local_date)).size;

  // 2. VIVABILITÉ — les taps.
  const good = pulses.filter((p) => p.overall === "good").length;
  const mixed = pulses.filter((p) => p.overall === "mixed").length;
  const hard = pulses.filter((p) => p.overall === "hard").length;
  const taps = good + mixed + hard;
  const axisCounts = new Map<string, number>();
  for (const p of pulses) {
    if (p.axis) axisCounts.set(p.axis, (axisCounts.get(p.axis) ?? 0) + 1);
  }
  // Tri déterministe sur égalité, comme côté serveur.
  const dominantAxis = [...axisCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  // 3. PORTIONS.
  const bands = events.map((e) => e.portion_band).filter(Boolean) as string[];
  const bandCount = (b: string) => bands.filter((x) => x === b).length;

  // 4. POIDS — la pesée du point du dimanche. Voir `displayWeights`.
  const weights = displayWeights(reviews);
  const firstWeight = weights[0] ?? null;
  const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null;

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="student" title="My progress">
        <p className="text-sm text-gray-500">Loading…</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell variant="student" title="My progress">
        <Card tone="warning">
          <p className="text-sm text-gray-900">We could not load your data.</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }
  if (state.kind === "restricted") {
    // Doctrine W3.2 — aucun chiffre affiché à l'élève quand le plancher TCA
    // est levé. On ne dit pas pourquoi: nommer le drapeau ici serait un
    // diagnostic posé par une machine.
    return (
      <KeelAppShell variant="student" title="My progress">
        <Card>
          <p className="text-sm leading-6 text-gray-800">
            We are setting the numbers aside for now. What matters this week
            is how you feel — and your coach knows.
          </p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="student" title="My progress">
      <div className="space-y-6">
        <div className="flex gap-2">
          {(["week", "month"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                range === r
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-700 ring-1 ring-gray-200"
              }`}
            >
              {r === "week" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>

        {/* 1. LA RÉGULARITÉ — la seule métrique dont on a la preuve qu'elle prédit. */}
        <Card>
          <SectionLabel>Your consistency</SectionLabel>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {loggedDays}<span className="text-lg text-gray-400"> / {total} days</span>
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            This is the thing that matters most, by a distance. Not how perfect
            the days were — the fact that they got logged at all.
          </p>
        </Card>

        {/* 2. LA VIVABILITÉ */}
        <Card>
          <SectionLabel>How it went</SectionLabel>
          {taps === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No evening check-ins in this period yet.
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={"positive" as BadgeTone}>{good} all good</Badge>
                <Badge tone={"caution" as BadgeTone}>{mixed} so-so</Badge>
                <Badge tone={"critical" as BadgeTone}>{hard} rough</Badge>
              </div>
              {dominantAxis && (mixed + hard) > 0 ? (
                <p className="mt-3 text-sm text-gray-700">
                  When it is hard, it is most often{" "}
                  <span className="font-medium">{AXIS_LABELS[dominantAxis] ?? dominantAxis}</span>.
                </p>
              ) : null}
            </>
          )}
        </Card>

        {/* 3. LES PORTIONS — la réponse à "beaucoup ou peu", sans un kcal. */}
        <Card>
          <SectionLabel>Your plates</SectionLabel>
          {bands.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No photos read in this period.</p>
          ) : (
            <p className="mt-3 text-sm text-gray-800">
              {bands.length} plate{bands.length > 1 ? "s" : ""}:{" "}
              {bandCount("small")} small,{" "}
              {bandCount("moderate")} regular,{" "}
              {bandCount("large")} large
              {bandCount("unclear") > 0 ? `, ${bandCount("unclear")} unclear` : ""}.
            </p>
          )}
        </Card>

        {/* 4. LE POIDS, EN DERNIER. Une pesée par semaine, lue comme une
            tendance: le chiffre du jour n'est pas l'information. */}
        <Card>
          <SectionLabel>Your weight</SectionLabel>
          {lastWeight === null ? (
            <p className="mt-2 text-sm text-gray-600">
              No weight in this period yet. You enter it in the Sunday
              check-in.
            </p>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {lastWeight.toFixed(1)}<span className="text-lg text-gray-400"> kg</span>
              </p>
              {firstWeight !== null && weights.length > 1 ? (
                <p className="mt-1 text-sm text-gray-700">
                  {(lastWeight - firstWeight >= 0 ? "+" : "")}
                  {(lastWeight - firstWeight).toFixed(1)} kg over the period
                </p>
              ) : null}
              <p className="mt-2 text-xs leading-5 text-gray-500">
                One weigh-in a week, read as a line and not as a number: day to
                day, water moves the scale more than a whole week of eating
                does.
              </p>
            </>
          )}
        </Card>
      </div>
    </KeelAppShell>
  );
}
