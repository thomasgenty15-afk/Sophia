import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Activity, BarChart3, Calendar, Download, LayoutDashboard, Loader2, Search, Server, Users } from "lucide-react";
import { twMerge } from "tailwind-merge";
import clsx from "clsx";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type Bucket = "day" | "week" | "month";
type Preset = "24h" | "7d" | "30d" | "all";

type OverviewRow = {
  bucket_start: string;
  total_cost_usd: number;
  ai_cost_usd: number;
  whatsapp_cost_eur: number;
  whatsapp_cost_usd: number;
  total_calls: number;
  total_tokens: number;
  unique_users: number;
};

type UserRow = {
  bucket_start: string;
  user_id: string;
  full_name: string;
  email: string;
  ai_cost_usd: number;
  whatsapp_cost_eur: number;
  total_cost_usd: number;
  total_calls: number;
  total_tokens: number;
};

type OperationRow = {
  bucket_start: string;
  operation_family: string;
  operation_name: string;
  source: string;
  provider: string;
  model: string;
  cost_domain: string;
  ai_cost_usd: number;
  whatsapp_cost_eur: number;
  total_cost_usd: number;
  total_calls: number;
  total_tokens: number;
};

type LegacySourceRow = { source: string | null };
type LegacyModelRow = { model: string | null };

const PRESETS: Record<Preset, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  all: 3650,
};

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll(`"`, `""`)}"`;
  return [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function normalizeLegacyFamily(source: string): string {
  const s = String(source || "").trim().toLowerCase();
  if (!s) return "other";
  if (s.startsWith("sophia-brain:")) {
    const tag = s.split(":")[1] || "";
    if (tag) return tag;
  }
  if (s.includes("dispatcher")) return "dispatcher";
  if (s.includes("companion")) return "companion";
  if (s.includes("sentry")) return "sentry";
  if (s.includes("watcher")) return "watcher";
  if (s.includes("memorizer") || s.includes("topic_memory")) return "memorizer";
  if (s.includes("summarize-context") || s.includes("summary")) return "summarize_context";
  if (s.includes("sort-priorities")) return "sort_priorities";
  if (s.includes("ethical")) return "ethics_check";
  return s.split(":")[0] || s;
}

function normalizeLegacyOperation(source: string): string {
  const s = String(source || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.startsWith("sophia-brain:")) return s.replace("sophia-brain:", "");
  return s;
}

export default function AdminUsageDashboard() {
  const { user, loading, isAdmin } = useAuth();
  const [dataLoading, setDataLoading] = useState(false);
  const [preset, setPreset] = useState<Preset>("7d");
  const [bucket, setBucket] = useState<Bucket>("day");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [operationFilter, setOperationFilter] = useState("all");

  const [overview, setOverview] = useState<OverviewRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [compare, setCompare] = useState<any>(null);
  const [daily, setDaily] = useState<any>(null);
  const [legacySources, setLegacySources] = useState<string[]>([]);
  const [legacyModels, setLegacyModels] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appliedBucket, setAppliedBucket] = useState<Bucket>("day");
  const [appliedStartDate, setAppliedStartDate] = useState<string>("");
  const [appliedEndDate, setAppliedEndDate] = useState<string>("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedModelFilter, setAppliedModelFilter] = useState("all");
  const [appliedProviderFilter, setAppliedProviderFilter] = useState("all");
  const [appliedFamilyFilter, setAppliedFamilyFilter] = useState("all");
  const [appliedOperationFilter, setAppliedOperationFilter] = useState("all");

  useEffect(() => {
    if (!startDate || !endDate) {
      const end = new Date();
      const start = new Date(Date.now() - PRESETS[preset] * 24 * 60 * 60 * 1000);
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(end.toISOString().slice(0, 10));
      setAppliedStartDate(start.toISOString().slice(0, 10));
      setAppliedEndDate(end.toISOString().slice(0, 10));
    }
  }, [preset, startDate, endDate]);

  useEffect(() => {
    async function loadData() {
      if (!user || !isAdmin || !appliedStartDate || !appliedEndDate) return;
      setDataLoading(true);
      try {
        const startAt = new Date(`${appliedStartDate}T00:00:00.000Z`).toISOString();
        const endAt = new Date(`${appliedEndDate}T23:59:59.999Z`).toISOString();
        const [overviewRes, userRes, opRes, compareRes, dailyRes] = await Promise.all([
          supabase.rpc("get_admin_cost_overview", { p_start: startAt, p_end: endAt, p_bucket: appliedBucket }),
          supabase.rpc("get_admin_cost_by_user", { p_start: startAt, p_end: endAt, p_bucket: appliedBucket }),
          supabase.rpc("get_admin_cost_by_operation", { p_start: startAt, p_end: endAt, p_bucket: appliedBucket }),
          supabase.rpc("get_admin_cost_compare_previous", { p_start: startAt, p_end: endAt }),
          supabase.rpc("get_admin_daily_cost_synthesis", { p_target_day: appliedEndDate }),
        ]);
        if (overviewRes.error) throw overviewRes.error;
        if (userRes.error) throw userRes.error;
        if (opRes.error) throw opRes.error;
        if (compareRes.error) throw compareRes.error;
        if (dailyRes.error) throw dailyRes.error;
        setOverview((overviewRes.data as any) ?? []);
        setUsers((userRes.data as any) ?? []);
        setOperations((opRes.data as any) ?? []);
        setCompare((compareRes.data as any)?.[0] ?? null);
        setDaily((dailyRes.data as any)?.[0] ?? null);
        setLoadError(null);
        // Fallback pools for filters: old RPCs provide model/source even if operation rows are sparse.
        const [legacySourceRes, legacyModelRes] = await Promise.all([
          supabase.rpc("get_usage_by_source", { period_start: startAt }),
          supabase.rpc("get_usage_by_model", { period_start: startAt }),
        ]);
        setLegacySources(
          ((legacySourceRes.data as LegacySourceRow[] | null) ?? [])
            .map((x) => String(x.source ?? "").trim())
            .filter(Boolean),
        );
        setLegacyModels(
          ((legacyModelRes.data as LegacyModelRow[] | null) ?? [])
            .map((x) => String(x.model ?? "").trim())
            .filter(Boolean),
        );
      } catch (e) {
        console.error("admin usage dashboard load failed", e);
        setLoadError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, [user, isAdmin, appliedStartDate, appliedEndDate, appliedBucket]);

  const providerOptions = useMemo(() => ["all", ...Array.from(new Set(operations.map((o) => o.provider).filter(Boolean)))], [operations]);
  const modelOptions = useMemo(
    () => ["all", ...Array.from(new Set([...operations.map((o) => o.model).filter(Boolean), ...legacyModels]))],
    [operations, legacyModels],
  );
  const familyOptions = useMemo(
    () =>
      [
        "all",
        ...Array.from(
          new Set([
            ...operations.map((o) => o.operation_family).filter(Boolean),
            ...legacySources.map((s) => normalizeLegacyFamily(s)),
          ]),
        ),
      ],
    [operations, legacySources],
  );
  const operationOptions = useMemo(
    () =>
      [
        "all",
        ...Array.from(
          new Set([
            ...operations.map((o) => o.operation_name).filter(Boolean),
            ...legacySources.map((s) => normalizeLegacyOperation(s)),
          ]),
        ),
      ],
    [operations, legacySources],
  );

  const filteredOps = useMemo(
    () =>
      operations.filter((o) => {
        if (appliedModelFilter !== "all" && o.model !== appliedModelFilter) return false;
        if (appliedProviderFilter !== "all" && o.provider !== appliedProviderFilter) return false;
        if (appliedFamilyFilter !== "all" && o.operation_family !== appliedFamilyFilter) return false;
        if (appliedOperationFilter !== "all" && o.operation_name !== appliedOperationFilter) return false;
        return true;
      }),
    [operations, appliedProviderFilter, appliedModelFilter, appliedFamilyFilter, appliedOperationFilter],
  );

  const filteredUsers = useMemo(() => {
    const q = appliedSearch.toLowerCase().trim();
    return users.filter((u) => {
      if (!q) return true;
      return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, appliedSearch]);

  function applyFilters() {
    setAppliedBucket(bucket);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedSearch(search);
    setAppliedModelFilter(modelFilter);
    setAppliedProviderFilter(providerFilter);
    setAppliedFamilyFilter(familyFilter);
    setAppliedOperationFilter(operationFilter);
  }

  function resetFilters() {
    const end = new Date();
    const start = new Date(Date.now() - PRESETS[preset] * 24 * 60 * 60 * 1000);
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);
    setBucket("day");
    setStartDate(s);
    setEndDate(e);
    setSearch("");
    setModelFilter("all");
    setProviderFilter("all");
    setFamilyFilter("all");
    setOperationFilter("all");
    setAppliedBucket("day");
    setAppliedStartDate(s);
    setAppliedEndDate(e);
    setAppliedSearch("");
    setAppliedModelFilter("all");
    setAppliedProviderFilter("all");
    setAppliedFamilyFilter("all");
    setAppliedOperationFilter("all");
  }

  const totals = useMemo(() => {
    return overview.reduce(
      (acc, row) => {
        acc.total += Number(row.total_cost_usd || 0);
        acc.ai += Number(row.ai_cost_usd || 0);
        acc.wa += Number(row.whatsapp_cost_eur || 0);
        acc.calls += Number(row.total_calls || 0);
        acc.tokens += Number(row.total_tokens || 0);
        return acc;
      },
      { total: 0, ai: 0, wa: 0, calls: 0, tokens: 0 },
    );
  }, [overview]);

  function exportOpsCsv() {
    const headers = [
      "bucket_start",
      "operation_family",
      "operation_name",
      "source",
      "provider",
      "model",
      "cost_domain",
      "ai_cost_usd",
      "whatsapp_cost_eur",
      "total_cost_usd",
      "total_calls",
      "total_tokens",
    ];
    const csv = toCsv(headers, filteredOps as any);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-usage-costs-${appliedStartDate}-${appliedEndDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user || isAdmin === false) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-neutral-400">Access Denied</div>;
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
            <h1 className="font-semibold text-white">Usage & costs</h1>
          </div>
          <div className="flex items-center gap-4">
            <a href="/admin/production-log" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white">
              <Server className="w-4 h-4" />
              Production log
            </a>
            <button onClick={exportOpsCsv} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-neutral-700 hover:border-neutral-600">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {loadError ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-200">
            Impossible de charger toutes les métriques ({loadError}). Les listes de filtres peuvent être partielles.
          </section>
        ) : null}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <FilterField label="Preset">
            <select
              value={preset}
              onChange={(e) => {
                const next = e.target.value as Preset;
                setPreset(next);
                const end = new Date();
                const start = new Date(Date.now() - PRESETS[next] * 24 * 60 * 60 * 1000);
                setStartDate(start.toISOString().slice(0, 10));
                setEndDate(end.toISOString().slice(0, 10));
              }}
              className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full"
            >
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="all">all</option>
            </select>
          </FilterField>
          <FilterField label="Granularite">
            <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </FilterField>
          <FilterField label="Date debut">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full" />
          </FilterField>
          <FilterField label="Date fin">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full" />
          </FilterField>
          <FilterField label="Provider">
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
              {providerOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Modele">
            <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
              {modelOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Type d'appel">
            <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
              {familyOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Operation">
            <select value={operationFilter} onChange={(e) => setOperationFilter(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
              {operationOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Recherche user">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou email" className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm" />
            </div>
          </FilterField>
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs font-medium whitespace-nowrap"
            >
              Appliquer
            </button>
            <button onClick={resetFilters} className="px-2.5 py-1.5 rounded-md border border-neutral-700 hover:border-neutral-600 text-xs">
              Reset
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <KpiCard title="Total Cost (USD)" value={`$${totals.total.toFixed(4)}`} icon={Activity} loading={dataLoading} />
          <KpiCard title="AI Cost (USD)" value={`$${totals.ai.toFixed(4)}`} icon={BarChart3} loading={dataLoading} />
          <KpiCard title="WA Templates (EUR)" value={`€${totals.wa.toFixed(4)}`} icon={Calendar} loading={dataLoading} />
          <KpiCard title="Calls" value={String(totals.calls)} icon={Server} loading={dataLoading} />
          <KpiCard title="Tokens" value={String(totals.tokens)} icon={Users} loading={dataLoading} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
            <h3 className="text-sm font-semibold text-neutral-200 mb-2">Daily synthesis</h3>
            <div className="text-sm text-neutral-400 space-y-1">
              <div>Day: <span className="text-neutral-200">{daily?.target_day ?? "-"}</span></div>
              <div>Top family: <span className="text-neutral-200">{daily?.top_operation_family ?? "-"}</span></div>
              <div>Top model: <span className="text-neutral-200">{daily?.top_model ?? "-"}</span></div>
              <div>Unpriced events: <span className="text-amber-400">{Number(daily?.unpriced_event_count ?? 0)}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
            <h3 className="text-sm font-semibold text-neutral-200 mb-2">Vs previous period</h3>
            <div className="text-sm text-neutral-400 space-y-1">
              <div>Current: <span className="text-neutral-200">${Number(compare?.current_total_cost_usd ?? 0).toFixed(4)}</span></div>
              <div>Previous: <span className="text-neutral-200">${Number(compare?.previous_total_cost_usd ?? 0).toFixed(4)}</span></div>
              <div>Delta: <span className={Number(compare?.delta_cost_usd ?? 0) >= 0 ? "text-amber-300" : "text-emerald-300"}>${Number(compare?.delta_cost_usd ?? 0).toFixed(4)}</span></div>
              <div>Delta %: <span className="text-neutral-200">{compare?.delta_pct == null ? "-" : `${Number(compare.delta_pct).toFixed(2)}%`}</span></div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Cost over time</div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400">
              <tr>
                <th className="px-4 py-2 text-left">Bucket</th>
                <th className="px-4 py-2 text-right">Total USD</th>
                <th className="px-4 py-2 text-right">AI USD</th>
                <th className="px-4 py-2 text-right">WA EUR</th>
                <th className="px-4 py-2 text-right">Calls</th>
                <th className="px-4 py-2 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {overview.map((r) => (
                <tr key={r.bucket_start}>
                  <td className="px-4 py-2">{new Date(r.bucket_start).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">${Number(r.total_cost_usd).toFixed(4)}</td>
                  <td className="px-4 py-2 text-right">${Number(r.ai_cost_usd).toFixed(4)}</td>
                  <td className="px-4 py-2 text-right">€{Number(r.whatsapp_cost_eur).toFixed(4)}</td>
                  <td className="px-4 py-2 text-right">{r.total_calls}</td>
                  <td className="px-4 py-2 text-right">{r.total_tokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 font-medium">Cost by user</div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-950 text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 text-left">User</th>
                    <th className="px-4 py-2 text-right">Total USD</th>
                    <th className="px-4 py-2 text-right">AI USD</th>
                    <th className="px-4 py-2 text-right">WA EUR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredUsers.map((u, idx) => (
                    <tr key={`${u.user_id}-${idx}`}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{u.full_name || "Unknown"}</div>
                        <div className="text-xs text-neutral-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-2 text-right">${Number(u.total_cost_usd).toFixed(4)}</td>
                      <td className="px-4 py-2 text-right">${Number(u.ai_cost_usd).toFixed(4)}</td>
                      <td className="px-4 py-2 text-right">€{Number(u.whatsapp_cost_eur).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 font-medium">Breakdown action (operation/model)</div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-950 text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Operation</th>
                    <th className="px-4 py-2 text-left">Model</th>
                    <th className="px-4 py-2 text-right">Total USD</th>
                    <th className="px-4 py-2 text-right">Calls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredOps.map((o, idx) => (
                    <tr key={`${o.operation_name}-${o.model}-${idx}`}>
                      <td className="px-4 py-2">
                        <div>{o.operation_family}</div>
                        <div className="text-xs text-neutral-500">{o.operation_name}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div>{o.model}</div>
                        <div className="text-xs text-neutral-500">{o.provider}</div>
                      </td>
                      <td className="px-4 py-2 text-right">${Number(o.total_cost_usd).toFixed(4)}</td>
                      <td className="px-4 py-2 text-right">{o.total_calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function KpiCard({ title, value, loading, icon: Icon }: any) {
  return (
    <div className="rounded-xl bg-neutral-900/30 border border-neutral-800 p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="p-2 rounded-lg border border-indigo-500/20 text-indigo-400 bg-indigo-500/10">
          <Icon className="w-4 h-4" />
        </div>
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-neutral-500" /> : null}
      </div>
      <div className="text-2xl font-semibold">{loading ? "..." : value}</div>
      <div className="text-xs text-neutral-500">{title}</div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

