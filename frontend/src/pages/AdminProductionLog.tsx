import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Filter,
  LayoutDashboard,
  Loader2,
  Terminal,
} from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type ProductionLogRow = {
  ts: string;
  severity: "info" | "warn" | "error" | string;
  source: string;
  event_type: string;
  title: string;
  user_id: string | null;
  details: any;
};

const PERIODS = [
  { label: "24 Hours", value: "24h", minutes: 24 * 60 },
  { label: "7 Days", value: "7d", minutes: 7 * 24 * 60 },
  { label: "30 Days", value: "30d", minutes: 30 * 24 * 60 },
];

const SOURCE_LABELS: Record<string, string> = {
  email: "Email",
  web: "Web",
  whatsapp: "WhatsApp",
  checkins: "Check-ins",
  stripe: "Stripe",
  evals: "Evals",
  llm: "LLM",
};

function meaningFor(row: ProductionLogRow): string | null {
  if (row.event_type === "stripe_webhook") {
    return "Stripe a envoyé un event à ton backend (réception confirmée).";
  }
  if (row.event_type === "llm_usage") {
    if (row.severity === "error") return "Un appel LLM a échoué (voir metadata pour le détail).";
    return "Consommation IA (tokens / coût) enregistrée.";
  }
  if (row.event_type === "chat_message") {
    const ch = row.source === "whatsapp" ? "WhatsApp" : "Web";
    const role = row.details?.role;
    if (row.severity === "error") return `Erreur détectée dans un message (${ch}).`;
    if (role === "user") return `Message utilisateur (${ch}).`;
    if (role === "assistant") return `Réponse Sophia (${ch}).`;
    return `Événement de chat (${ch}).`;
  }
  if (row.event_type === "scheduled_checkin") {
    const status = row.details?.status;
    if (status === "awaiting_user") return "Check-in en attente d’une action utilisateur (souvent opt-in/template WhatsApp).";
    if (status === "sent") return "Check-in envoyé.";
    if (status === "pending") return "Check-in planifié (pas encore envoyé).";
    return "Événement lié aux check-ins planifiés.";
  }
  if (row.event_type === "whatsapp_pending_action") {
    const st = row.details?.status;
    if (st === "expired") return "Action WhatsApp expirée (timeout / fenêtre).";
    if (st === "cancelled") return "Action WhatsApp annulée.";
    return "Action WhatsApp en attente (flow template/anti-spam).";
  }
  if (row.event_type === "conversation_eval_run") {
    if (row.severity === "error") return "Un run d’éval a échoué (utile pour détecter des régressions).";
    return "Run d’éval exécuté.";
  }
  if (row.source === "email") {
    if (row.details?.status === "failed") return "L’email n’a pas pu être envoyé (provider/clé/sender/deliverability).";
    return "Email envoyé (ou délivré) via le provider.";
  }
  return null;
}

function badgeClass(sev: string) {
  if (sev === "error") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (sev === "warn") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
}

export default function AdminProductionLog() {
  const { user, loading, isAdmin } = useAuth();
  const [period, setPeriod] = useState<string>("24h");
  const [onlyErrors, setOnlyErrors] = useState<boolean>(false);
  const [source, setSource] = useState<string>("(all)");

  const [rows, setRows] = useState<ProductionLogRow[]>([]);
  const [busy, setBusy] = useState(false);

  const sinceIso = useMemo(() => {
    const p = PERIODS.find((p) => p.value === period) ?? PERIODS[0];
    return new Date(Date.now() - p.minutes * 60 * 1000).toISOString();
  }, [period]);

  useEffect(() => {
    async function load() {
      if (!user || !isAdmin) return;
      setBusy(true);
      try {
        const { data, error } = await supabase.rpc("get_production_log", {
          p_since: sinceIso,
          p_limit: 300,
          p_only_errors: onlyErrors,
          p_source: source === "(all)" ? null : source,
        });
        if (error) throw error;
        setRows((data as any) ?? []);
      } catch (e) {
        console.error(e);
        setRows([]);
      } finally {
        setBusy(false);
      }
    }
    load();
  }, [user, isAdmin, sinceIso, onlyErrors, source]);

  const stats = useMemo(() => {
    const total = rows.length;
    const errors = rows.filter((r) => r.severity === "error").length;
    const warns = rows.filter((r) => r.severity === "warn").length;
    const sources = new Set(rows.map((r) => r.source)).size;
    return { total, errors, warns, sources };
  }, [rows]);

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user || isAdmin === false) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-neutral-400">
        Access Denied
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/admin" className="p-2 hover:bg-neutral-900 rounded-lg transition-colors text-neutral-400 hover:text-white">
              <LayoutDashboard className="w-5 h-5" />
            </a>
            <div className="h-4 w-px bg-neutral-800" />
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <h1 className="font-semibold text-white">Production log</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/admin/usage"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              Usage & Costs
            </a>
            <a
              href="/admin/evals"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <Activity className="w-4 h-4" />
              Evals & Logs
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <KpiCard title="Events" value={stats.total} icon={Terminal} loading={busy} />
          <KpiCard title="Errors" value={stats.errors} icon={AlertCircle} loading={busy} tone="error" />
          <KpiCard title="Warnings" value={stats.warns} icon={Filter} loading={busy} tone="warn" />
          <KpiCard title="Sources" value={stats.sources} icon={Activity} loading={busy} />
        </div>

        {/* Filters */}
        <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <Filter className="w-4 h-4 text-neutral-400" />
            <span>Filters</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-neutral-900 rounded-lg p-1 border border-neutral-800">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all",
                    period === p.value
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200"
            >
              <option value="(all)">(all sources)</option>
              <option value="email">email</option>
              <option value="web">web</option>
              <option value="whatsapp">whatsapp</option>
              <option value="checkins">checkins</option>
              <option value="stripe">stripe</option>
              <option value="evals">evals</option>
              <option value="llm">llm</option>
            </select>

            <button
              onClick={() => setOnlyErrors((v) => !v)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                onlyErrors
                  ? "bg-red-500/10 border-red-500/20 text-red-300"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
              )}
            >
              {onlyErrors ? "Errors only" : "All severities"}
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <h3 className="font-medium text-white">Activity</h3>
            </div>
            <div className="text-xs text-neutral-500 font-mono">
              since {new Date(sinceIso).toLocaleString()}
            </div>
          </div>

          {busy ? (
            <div className="p-10 flex items-center justify-center text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              No events in this window.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {rows.map((r, idx) => (
                <div key={`${r.ts}-${idx}`} className="p-4 hover:bg-neutral-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-bold", badgeClass(r.severity))}>
                          {r.severity}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {SOURCE_LABELS[r.source] ?? r.source}
                        </span>
                        <span className="text-xs text-neutral-600">·</span>
                        <span className="text-xs text-neutral-500 font-mono">{r.event_type}</span>
                      </div>
                      <div className="text-sm text-neutral-100 font-medium truncate">
                        {r.title}
                      </div>
                      {meaningFor(r) && (
                        <div className="text-xs text-neutral-400 mt-1">
                          {meaningFor(r)}
                        </div>
                      )}
                      {r.user_id && (
                        <div className="text-[11px] text-neutral-500 font-mono mt-2">
                          user_id: {r.user_id}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-neutral-400">
                        {new Date(r.ts).toLocaleDateString()}{" "}
                        {new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  {/* Details preview */}
                  <details className="mt-3">
                    <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300">
                      Details
                    </summary>
                    <pre className="mt-2 text-xs bg-neutral-950/60 border border-neutral-800 rounded-lg p-3 overflow-auto text-neutral-300">
{JSON.stringify(r.details ?? {}, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  loading,
  tone,
}: {
  title: string;
  value: number;
  icon: any;
  loading: boolean;
  tone?: "error" | "warn";
}) {
  const accent =
    tone === "error"
      ? "text-red-400 bg-red-500/10 border-red-500/20"
      : tone === "warn"
        ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
        : "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";

  return (
    <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center border", accent)}>
          <Icon className="w-4 h-4" />
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
      </div>
      <div className="text-xs text-neutral-500 mb-1">{title}</div>
      <div className="text-2xl font-semibold text-white font-mono">{value}</div>
    </div>
  );
}


