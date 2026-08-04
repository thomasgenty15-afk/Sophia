import { useEffect, useMemo, useState, type ComponentType } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Filter,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Search,
  Server,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import AdminShell from "../components/admin/AdminShell";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type SeverityFilter = "all" | "error" | "warn" | "info";

type ProductionLogRow = {
  ts: string;
  severity: "info" | "warn" | "error" | string;
  source: string;
  event_type: string;
  title: string;
  user_id: string | null;
  details: ProductionLogDetails | null;
};

type ProductionLogDetails = Record<string, unknown> & {
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

type KpiTone = "default" | "error" | "warn" | "success";

const PERIODS = [
  { label: "24h", value: "24h", minutes: 24 * 60 },
  { label: "7d", value: "7d", minutes: 7 * 24 * 60 },
  { label: "30d", value: "30d", minutes: 30 * 24 * 60 },
];

const LIMIT_OPTIONS = [100, 300, 600, 1000];

const SOURCE_LABELS: Record<string, string> = {
  checkins: "Check-ins",
  edge: "Edge",
  email: "Email",
  guards: "Gardes runtime",
  llm: "LLM",
  runtime: "Runtime",
  safety: "Safety",
  stripe: "Stripe",
  web: "Web",
  whatsapp: "WhatsApp (historique)",
};

const SEVERITY_OPTIONS: Array<{ label: string; value: SeverityFilter }> = [
  { label: "All", value: "all" },
  { label: "Errors", value: "error" },
  { label: "Warnings", value: "warn" },
  { label: "Info", value: "info" },
];

function severityOf(row: ProductionLogRow): "info" | "warn" | "error" {
  if (row.severity === "error") return "error";
  if (row.severity === "warn") return "warn";
  return "info";
}

function EventIcon({ row, className }: { row: ProductionLogRow; className?: string }) {
  if (row.source === "llm") return <Zap className={className} />;
  if (row.source === "runtime") return <Activity className={className} />;
  if (row.source === "whatsapp" || row.event_type === "chat_message") return <MessageSquare className={className} />;
  if (row.source === "edge") return <Server className={className} />;
  if (row.source === "stripe") return <Database className={className} />;
  if (severityOf(row) === "error") return <AlertCircle className={className} />;
  if (severityOf(row) === "warn") return <Clock3 className={className} />;
  return <CheckCircle2 className={className} />;
}

function rowKey(row: ProductionLogRow, index: number) {
  const d: ProductionLogDetails = row.details ?? {};
  return [
    row.ts,
    row.source,
    row.event_type,
    d.id ?? d.event_id ?? d.request_id ?? d.provider_message_id ?? row.user_id ?? index,
  ].join(":");
}

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source;
}

function severityBadgeClass(severity: string) {
  if (severity === "error") return "bg-red-500/10 text-red-300 border-red-500/25";
  if (severity === "warn") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
}

function severityRailClass(severity: string) {
  if (severity === "error") return "bg-red-400";
  if (severity === "warn") return "bg-amber-400";
  return "bg-emerald-400";
}

function sourceBadgeClass(source: string) {
  if (source === "whatsapp") return "bg-teal-500/10 text-teal-300 border-teal-500/20";
  if (source === "llm") return "bg-violet-500/10 text-violet-300 border-violet-500/20";
  if (source === "runtime") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  if (source === "stripe") return "bg-sky-500/10 text-sky-300 border-sky-500/20";
  if (source === "edge") return "bg-orange-500/10 text-orange-300 border-orange-500/20";
  return "bg-neutral-800 text-neutral-300 border-neutral-700";
}

function eventFamily(row: ProductionLogRow) {
  if (row.event_type === "chat_message") return "Chat";
  if (row.event_type.includes("retry")) return "Retry";
  if (row.event_type.includes("cost")) return "Cost";
  if (row.source === "runtime") return "Runtime";
  if (row.source === "whatsapp") return "WhatsApp (historique)";
  if (row.source === "llm") return "LLM";
  if (row.source === "edge") return "Backend";
  if (row.source === "stripe") return "Billing";
  if (row.source === "checkins") return "Check-in";
  return sourceLabel(row.source);
}

function meaningFor(row: ProductionLogRow): string | null {
  if (row.event_type === "stripe_webhook") return "Webhook Stripe reçu.";
  if (row.event_type === "llm_usage") {
    if (row.severity === "error") return "Appel LLM échoué ou marqué en erreur.";
    return "Consommation IA enregistrée.";
  }
  if (row.event_type === "llm_retry_job") {
    if (row.severity === "error") return "Retry LLM en échec terminal ou bloqué.";
    if (row.severity === "warn") return "Retry LLM en attente ou en traitement.";
    return "Retry LLM traité.";
  }
  if (row.event_type === "chat_message") {
    const ch = row.source === "whatsapp" ? "WhatsApp (historique)" : "Web";
    const role = row.details?.role;
    if (row.severity === "error") return `Erreur détectée dans un message ${ch}.`;
    if (role === "user") return `Message utilisateur ${ch}.`;
    if (role === "assistant") return `Réponse Sophia ${ch}.`;
    return `Événement de chat ${ch}.`;
  }
  if (row.event_type === "scheduled_checkin") {
    const status = row.details?.status;
    if (status === "awaiting_user") return "Check-in en attente d’action utilisateur.";
    if (status === "retrying") return "Check-in en retry après échec transitoire.";
    if (status === "failed") return "Check-in non envoyé.";
    if (status === "sent") return "Check-in envoyé.";
    if (status === "pending") return "Check-in planifié.";
    return "Cycle de vie check-in.";
  }
  if (row.event_type === "whatsapp_pending_action") {
    const st = row.details?.status;
    if (st === "expired") return "Action en attente expirée.";
    if (st === "cancelled") return "Action en attente annulée.";
    return "Action en attente.";
  }
  if (row.event_type === "whatsapp_outbound_message") {
    if (row.severity === "error") return "Livraison échouée côté sortant.";
    if (row.severity === "warn") return "Livraison en file, annulée, ignorée ou à surveiller.";
    return "Tentative de livraison enregistrée.";
  }
  // DE-WHATSAPP: cinq branches retirées avec leurs tables (statuts Meta,
  // dedup entrant, liaison, récupération d'opt-in, entrants non liés).
  // `whatsapp_cost_event` RESTE: la table est gelée, pas droppée, et son
  // historique de coûts est ce qui justifie l'abandon du canal.
  if (row.event_type === "whatsapp_cost_event") return "Coût WhatsApp enregistré (historique gelé).";
  if (row.event_type === "edge_function_error") return "Erreur Edge Function persistée.";
  if (row.event_type === "edge_function_log") return "Événement backend persisté.";
  if (row.event_type.startsWith("runtime_") || row.event_type === "turn_summary") return "Trace runtime détaillée.";
  if (row.source === "email") {
    if (row.details?.status === "failed") return "Email non envoyé.";
    return "Email envoyé ou délivré.";
  }
  return null;
}

function formatAbsolute(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function formatRelative(value: string) {
  const d = new Date(value).getTime();
  if (!Number.isFinite(d)) return "";
  const delta = Date.now() - d;
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function shortValue(value: unknown, head = 8, tail = 6) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function detailsRequestId(row: ProductionLogRow) {
  const d: ProductionLogDetails = row.details ?? {};
  return d.request_id ?? d.webhook_request_id ?? d.metadata?.request_id ?? d.payload?.request_id ?? null;
}

function detailsProviderId(row: ProductionLogRow) {
  const d: ProductionLogDetails = row.details ?? {};
  return d.provider_message_id ?? d.wa_message_id ?? d.wamid_in ?? d.checkout_session_id ?? d.stripe_subscription_id ?? null;
}

function prominentFields(row: ProductionLogRow) {
  const d = row.details ?? {};
  const fields: Array<[string, unknown]> = [
    ["status", d.status],
    ["request", detailsRequestId(row)],
    ["provider", detailsProviderId(row)],
    ["function", d.function_name],
    ["model", d.model],
    ["operation", d.operation_name],
    ["attempt", d.attempt_count != null && d.max_attempts != null ? `${d.attempt_count}/${d.max_attempts}` : null],
    ["next retry", d.next_retry_at],
    ["cost", d.cost_usd != null ? `$${Number(d.cost_usd).toFixed(4)}` : d.final_cost_eur != null ? `€${Number(d.final_cost_eur).toFixed(4)}` : null],
    ["tokens", d.total_tokens],
  ];
  return fields.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
}

export default function AdminProductionLog() {
  const { user, loading, isAdmin } = useAuth();
  const [period, setPeriod] = useState<string>("24h");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [source, setSource] = useState<string>("(all)");
  const [includeChat, setIncludeChat] = useState<boolean>(false);
  const [includeRuntime, setIncludeRuntime] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [limit, setLimit] = useState<number>(300);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [rows, setRows] = useState<ProductionLogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sinceIso = useMemo(() => {
    const p = PERIODS.find((item) => item.value === period) ?? PERIODS[0];
    return new Date(Date.now() - p.minutes * 60 * 1000).toISOString();
  }, [period]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    async function load() {
      if (!user || !isAdmin) return;
      setBusy(true);
      try {
        const { data, error } = await supabase.rpc("get_production_log", {
          p_since: sinceIso,
          p_limit: limit,
          p_only_errors: severityFilter === "error",
          p_source: source === "(all)" ? null : source,
          p_include_chat: includeChat,
          p_query: debouncedQuery || null,
          p_include_runtime: includeRuntime,
        });
        if (error) throw error;
        setRows((data as ProductionLogRow[] | null) ?? []);
        setLoadError(null);
      } catch (e) {
        console.error(e);
        setRows([]);
        setLoadError(e instanceof Error ? e.message : "Impossible de charger les logs.");
      } finally {
        setBusy(false);
      }
    }
    load();
  }, [user, isAdmin, sinceIso, severityFilter, source, includeChat, includeRuntime, debouncedQuery, limit, reloadNonce]);

  const displayedRows = useMemo(() => {
    if (severityFilter === "all" || severityFilter === "error") return rows;
    return rows.filter((row) => severityOf(row) === severityFilter);
  }, [rows, severityFilter]);

  useEffect(() => {
    if (displayedRows.length === 0) {
      setSelectedKey(null);
      return;
    }
    const stillVisible = displayedRows.some((row, index) => rowKey(row, index) === selectedKey);
    if (!stillVisible) setSelectedKey(rowKey(displayedRows[0], 0));
  }, [displayedRows, selectedKey]);

  const selectedRow = useMemo(() => {
    if (!selectedKey) return null;
    return displayedRows.find((row, index) => rowKey(row, index) === selectedKey) ?? null;
  }, [displayedRows, selectedKey]);

  const stats = useMemo(() => {
    const total = displayedRows.length;
    const errors = displayedRows.filter((row) => severityOf(row) === "error").length;
    const warns = displayedRows.filter((row) => severityOf(row) === "warn").length;
    const infos = displayedRows.filter((row) => severityOf(row) === "info").length;
    const sources = new Set(displayedRows.map((row) => row.source)).size;
    return { total, errors, warns, infos, sources };
  }, [displayedRows]);

  const sourceOptions = useMemo(() => {
    const base = ["checkins", "edge", "email", "guards", "llm", "runtime", "safety", "stripe", "web", "whatsapp"];
    const discovered = rows.map((row) => row.source).filter(Boolean);
    return Array.from(new Set([...base, ...discovered])).sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)));
  }, [rows]);

  const sourceBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of displayedRows) counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [displayedRows]);

  async function copyText(label: string, value: unknown) {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => (current === label ? null : current)), 1200);
    } catch {
      setCopied(null);
    }
  }

  function resetFilters() {
    setPeriod("24h");
    setSeverityFilter("all");
    setSource("(all)");
    setIncludeChat(false);
    setIncludeRuntime(false);
    setQuery("");
    setLimit(300);
  }

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
    <AdminShell
      active="production-log"
      title="Production log"
      description="Journal de production agrege pour verifier rapidement les erreurs, warnings, paiements, conversation, runtime et appels Edge."
      icon={Terminal}
      actions={
        <button
          onClick={() => setReloadNonce((n) => n + 1)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white"
          title="Refresh"
        >
          <RefreshCcw className={cn("w-4 h-4", busy && "animate-spin")} />
          <span className="hidden sm:inline">{busy ? "Loading" : "Refresh"}</span>
        </button>
      }
    >
      <div className="space-y-5">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard title="Visible" value={stats.total} icon={Terminal} loading={busy} />
          <KpiCard title="Errors" value={stats.errors} icon={AlertCircle} loading={busy} tone="error" />
          <KpiCard title="Warnings" value={stats.warns} icon={Clock3} loading={busy} tone="warn" />
          <KpiCard title="Info" value={stats.infos} icon={CheckCircle2} loading={busy} tone="success" />
          <KpiCard title="Sources" value={stats.sources} icon={Activity} loading={busy} />
        </section>

        <section className="border border-neutral-800 rounded-xl bg-neutral-900/35 overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 text-sm text-neutral-300">
              <Filter className="w-4 h-4 text-neutral-500" />
              <span className="font-medium">Filters</span>
              <span className="text-xs text-neutral-600 font-mono">since {formatAbsolute(sinceIso)}</span>
            </div>
            <button
              onClick={resetFilters}
              className="self-start xl:self-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-800"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>

          <div className="p-4 grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_auto] gap-4">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search logs"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-9 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-indigo-500/60"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-500 hover:text-neutral-200"
                  title="Clear"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                options={PERIODS}
                value={period}
                onChange={setPeriod}
              />

              <SegmentedControl
                options={SEVERITY_OPTIONS}
                value={severityFilter}
                onChange={(value) => setSeverityFilter(value as SeverityFilter)}
              />

              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-10 bg-neutral-950 border border-neutral-800 rounded-lg px-3 text-xs text-neutral-200 outline-none focus:border-indigo-500/60"
              >
                <option value="(all)">(all sources)</option>
                {sourceOptions.map((item) => (
                  <option key={item} value={item}>{sourceLabel(item)}</option>
                ))}
              </select>

              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-10 bg-neutral-950 border border-neutral-800 rounded-lg px-3 text-xs text-neutral-200 outline-none focus:border-indigo-500/60"
                title="Limit"
              >
                {LIMIT_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>

              <ToggleButton active={includeChat} onClick={() => setIncludeChat((v) => !v)} label="Chat" />
              <ToggleButton active={includeRuntime} onClick={() => setIncludeRuntime((v) => !v)} label="Runtime" tone="cyan" />
            </div>
          </div>

          {sourceBreakdown.length > 0 && (
            <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
              {sourceBreakdown.map(([sourceName, count]) => (
                <button
                  key={sourceName}
                  onClick={() => setSource(sourceName)}
                  className={cn(
                    "inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs transition-colors",
                    source === sourceName ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200" : sourceBadgeClass(sourceName)
                  )}
                >
                  <span>{sourceLabel(sourceName)}</span>
                  <span className="font-mono text-[11px] opacity-70">{count}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {loadError && (
          <div className="border border-red-500/20 bg-red-500/10 text-red-200 rounded-xl px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px] gap-5 items-start">
          <div className="border border-neutral-800 rounded-xl bg-neutral-900/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className="w-4 h-4 text-indigo-400 shrink-0" />
                <h2 className="font-medium text-white truncate">Activity</h2>
              </div>
              <div className="text-xs text-neutral-500 font-mono shrink-0">
                {displayedRows.length}/{rows.length}
              </div>
            </div>

            {busy ? (
              <div className="p-12 flex items-center justify-center text-neutral-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading
              </div>
            ) : displayedRows.length === 0 ? (
              <div className="p-12 text-center text-sm text-neutral-500">
                No events in this window.
              </div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {displayedRows.map((row, index) => {
                  const key = rowKey(row, index);
                  return (
                    <TimelineRow
                      key={key}
                      row={row}
                      active={key === selectedKey}
                      onSelect={() => setSelectedKey(key)}
                      onCopy={copyText}
                      copied={copied}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <Inspector row={selectedRow} copied={copied} onCopy={copyText} />
        </section>
      </div>
    </AdminShell>
  );
}

function TimelineRow({
  row,
  active,
  onSelect,
  onCopy,
  copied,
}: {
  row: ProductionLogRow;
  active: boolean;
  onSelect: () => void;
  onCopy: (label: string, value: unknown) => void;
  copied: string | null;
}) {
  const requestId = detailsRequestId(row);
  const providerId = detailsProviderId(row);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left relative p-4 hover:bg-neutral-800/35 transition-colors outline-none focus:bg-neutral-800/45",
        active && "bg-neutral-800/55"
      )}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", severityRailClass(severityOf(row)))} />
      <div className="flex gap-3 min-w-0">
        <div className={cn("mt-0.5 h-9 w-9 rounded-lg border flex items-center justify-center shrink-0", sourceBadgeClass(row.source))}>
          <EventIcon row={row} className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-bold", severityBadgeClass(row.severity))}>
              {row.severity}
            </span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", sourceBadgeClass(row.source))}>
              {sourceLabel(row.source)}
            </span>
            <span className="text-[11px] text-neutral-500 font-mono">{eventFamily(row)}</span>
            <span className="text-[11px] text-neutral-600">·</span>
            <span className="text-[11px] text-neutral-500 font-mono">{row.event_type}</span>
          </div>

          <div className="text-sm text-neutral-100 font-medium truncate">{row.title}</div>
          {meaningFor(row) && <div className="text-xs text-neutral-400 mt-1 truncate">{meaningFor(row)}</div>}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {row.user_id && (
              <MiniCopy label="user" value={row.user_id} copied={copied} onCopy={onCopy} />
            )}
            {requestId && (
              <MiniCopy label="request" value={requestId} copied={copied} onCopy={onCopy} />
            )}
            {providerId && (
              <MiniCopy label="provider" value={providerId} copied={copied} onCopy={onCopy} />
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs text-neutral-300 font-mono">{formatRelative(row.ts)}</div>
          <div className="text-[11px] text-neutral-600 mt-1">{formatAbsolute(row.ts)}</div>
        </div>
      </div>
    </button>
  );
}

function Inspector({
  row,
  copied,
  onCopy,
}: {
  row: ProductionLogRow | null;
  copied: string | null;
  onCopy: (label: string, value: unknown) => void;
}) {
  if (!row) {
    return (
      <aside className="border border-neutral-800 rounded-xl bg-neutral-900/30 p-6 text-sm text-neutral-500 xl:sticky xl:top-24">
        Select an event.
      </aside>
    );
  }

  const requestId = detailsRequestId(row);
  const providerId = detailsProviderId(row);
  const fields = prominentFields(row);

  return (
    <aside className="border border-neutral-800 rounded-xl bg-neutral-900/30 overflow-hidden xl:sticky xl:top-24">
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-start gap-3">
          <div className={cn("h-10 w-10 rounded-lg border flex items-center justify-center shrink-0", sourceBadgeClass(row.source))}>
            <EventIcon row={row} className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-bold", severityBadgeClass(row.severity))}>
                {row.severity}
              </span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", sourceBadgeClass(row.source))}>
                {sourceLabel(row.source)}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white leading-5">{row.title}</h3>
            <div className="mt-1 text-xs text-neutral-500 font-mono">{row.event_type}</div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <DetailPill label="time" value={formatAbsolute(row.ts)} />
          <DetailPill label="family" value={eventFamily(row)} />
          {row.user_id && <DetailPill label="user" value={shortValue(row.user_id)} />}
          {requestId && <DetailPill label="request" value={shortValue(requestId)} />}
          {providerId && <DetailPill label="provider" value={shortValue(providerId)} />}
        </div>

        {fields.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-600">Key fields</div>
            <div className="grid grid-cols-1 gap-2">
              {fields.slice(0, 10).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                  <span className="text-xs text-neutral-500">{label}</span>
                  <span className="text-xs text-neutral-200 font-mono truncate">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {row.user_id && <ActionCopy label="Copy user" copyKey="copy-user" value={row.user_id} copied={copied} onCopy={onCopy} />}
          {requestId && <ActionCopy label="Copy request" copyKey="copy-request" value={requestId} copied={copied} onCopy={onCopy} />}
          {providerId && <ActionCopy label="Copy provider" copyKey="copy-provider" value={providerId} copied={copied} onCopy={onCopy} />}
          <ActionCopy label="Copy JSON" copyKey="copy-json" value={row.details ?? {}} copied={copied} onCopy={onCopy} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.18em] text-neutral-600">Details</span>
          </div>
          <pre className="max-h-[52vh] overflow-auto rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 text-xs leading-5 text-neutral-300">
{JSON.stringify(row.details ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </aside>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  loading,
  tone = "default",
}: {
  title: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  loading: boolean;
  tone?: KpiTone;
}) {
  const accent =
    tone === "error"
      ? "text-red-300 bg-red-500/10 border-red-500/20"
      : tone === "warn"
        ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
        : tone === "success"
          ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
          : "text-indigo-300 bg-indigo-500/10 border-indigo-500/20";

  return (
    <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border shrink-0", accent)}>
          <Icon className="w-4 h-4" />
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
      </div>
      <div className="text-xs text-neutral-500 mb-1 truncate">{title}</div>
      <div className="text-2xl font-semibold text-white font-mono tabular-nums">{value}</div>
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="h-10 flex items-center bg-neutral-950 rounded-lg p-1 border border-neutral-800">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap",
            value === option.value
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  tone = "indigo",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "indigo" | "cyan";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-10 px-3 rounded-lg text-xs font-medium border transition-colors",
        active
          ? tone === "cyan"
            ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
            : "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
          : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
      )}
    >
      {label}
    </button>
  );
}

function MiniCopy({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: unknown;
  copied: string | null;
  onCopy: (label: string, value: unknown) => void;
}) {
  const key = `${label}:${String(value)}`;
  return (
    <span
      onClick={(event) => {
        event.stopPropagation();
        onCopy(key, value);
      }}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-neutral-800 bg-neutral-950/70 text-[11px] text-neutral-400 hover:text-neutral-200 hover:border-neutral-700"
      title={`Copy ${label}`}
      role="button"
      tabIndex={0}
    >
      <span>{label}</span>
      <span className="font-mono text-neutral-300">{shortValue(value)}</span>
      <Copy className="w-3 h-3" />
      {copied === key && <span className="text-emerald-300">copied</span>}
    </span>
  );
}

function ActionCopy({
  label,
  copyKey,
  value,
  copied,
  onCopy,
}: {
  label: string;
  copyKey: string;
  value: unknown;
  copied: string | null;
  onCopy: (label: string, value: unknown) => void;
}) {
  return (
    <button
      onClick={() => onCopy(copyKey, value)}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-950 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
    >
      <Copy className="w-3.5 h-3.5" />
      {copied === copyKey ? "Copied" : label}
    </button>
  );
}

function DetailPill({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-600 mb-1">{label}</div>
      <div className="text-xs text-neutral-200 font-mono truncate">{String(value)}</div>
    </div>
  );
}
