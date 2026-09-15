import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Activity, BarChart3, Calendar, Download, Loader2, Search, Server, Users } from "lucide-react";
import { twMerge } from "tailwind-merge";
import clsx from "clsx";
import AdminShell from "../components/admin/AdminShell";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type Bucket = "day" | "week" | "month";
type Preset = "24h" | "7d" | "30d" | "all";
type RunTypeFilter = "all" | "prod" | "qa" | "smoke" | "non_prod";

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

type UserOperationRow = {
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

type DataQualityRow = {
  total_events: number;
  attributed_events: number;
  unattributed_events: number;
  unpriced_events: number;
  missing_operation_events: number;
  missing_source_events: number;
  total_cost_usd: number;
  attributed_cost_usd: number;
  unattributed_cost_usd: number;
  attribution_rate: number;
  pricing_coverage_rate: number;
};

type CompareRow = {
  current_total_cost_usd: number;
  previous_total_cost_usd: number;
  delta_cost_usd: number;
  delta_pct: number | null;
};

type DailySynthesisRow = {
  target_day: string;
  total_cost_usd: number;
  ai_cost_usd: number;
  whatsapp_cost_eur: number;
  total_calls: number;
  total_tokens: number;
  top_operation_family: string | null;
  top_model: string | null;
  unpriced_event_count: number;
};

type UserDailyCostRow = {
  day: string;
  user_id: string;
  full_name: string;
  email: string;
  ai_cost_usd: number;
  whatsapp_cost_eur: number;
  whatsapp_cost_usd: number;
  total_cost_usd: number;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_calls: number;
  unpriced_events: number;
  top_operation_family: string | null;
  top_model: string | null;
};

type UsageSourceRow = { source: string | null };
type UsageModelRow = { model: string | null };
type CoverageGapRow = {
  gap_type: string;
  provider: string | null;
  model: string | null;
  source: string | null;
  operation_family: string | null;
  event_count: number;
  total_cost_usd: number;
};

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

function normalizeUsageFamily(source: string): string {
  const s = String(source || "").trim().toLowerCase();
  if (!s) return "other";
  if (s.includes("embed")) return "embedding";
  if (s.includes("generate-plan") || s.includes("plan")) return "plan_generation";
  if (s.includes("dispatcher")) return "dispatcher";
  if (s.includes("summary")) return "summarize_context";
  if (s.includes("ethical")) return "ethics_check";
  if (s.includes("companion") || s.includes("firefighter") || s.includes("sentry")) return "message_generation";
  if (s.includes("memorizer") || s.includes("topic_memory") || s.includes("topic_") || s.includes("synthesizer")) return "memorizer";
  if (s.includes("watcher")) return "watcher";
  if (s.includes("schedule") || s.includes("checkin") || s.includes("reminder")) return "scheduling";
  if (s.includes("duplicate")) return "duplicate_check";
  return "other";
}

function normalizeUsageOperation(source: string): string {
  const s = String(source || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.startsWith("sophia-brain:")) return s;
  return s;
}

function rpcFilterValue(value: string): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized && normalized !== "all" ? normalized : null;
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
  const [runTypeFilter, setRunTypeFilter] = useState<RunTypeFilter>("prod");

  const [overview, setOverview] = useState<OverviewRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [compare, setCompare] = useState<CompareRow | null>(null);
  const [daily, setDaily] = useState<DailySynthesisRow | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityRow | null>(null);
  const [userDailyCosts, setUserDailyCosts] = useState<UserDailyCostRow[]>([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGapRow[]>([]);
  const [usageSources, setUsageSources] = useState<string[]>([]);
  const [usageModels, setUsageModels] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userOperationRows, setUserOperationRows] = useState<UserOperationRow[]>([]);
  const [userOperationLoading, setUserOperationLoading] = useState(false);
  const [appliedBucket, setAppliedBucket] = useState<Bucket>("day");
  const [appliedStartDate, setAppliedStartDate] = useState<string>("");
  const [appliedEndDate, setAppliedEndDate] = useState<string>("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedModelFilter, setAppliedModelFilter] = useState("all");
  const [appliedProviderFilter, setAppliedProviderFilter] = useState("all");
  const [appliedFamilyFilter, setAppliedFamilyFilter] = useState("all");
  const [appliedOperationFilter, setAppliedOperationFilter] = useState("all");
  const [appliedRunTypeFilter, setAppliedRunTypeFilter] = useState<RunTypeFilter>("prod");

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
        const provider = rpcFilterValue(appliedProviderFilter);
        const model = rpcFilterValue(appliedModelFilter);
        const family = rpcFilterValue(appliedFamilyFilter);
        const operation = rpcFilterValue(appliedOperationFilter);
        const runType = appliedRunTypeFilter;
        const [overviewRes, userRes, opRes, compareRes, dailyRes, qualityRes, userDailyRes, coverageGapRes] = await Promise.all([
          supabase.rpc("get_admin_cost_overview", { p_start: startAt, p_end: endAt, p_bucket: appliedBucket, p_provider: provider, p_model: model, p_family: family, p_operation: operation, p_run_type: runType }),
          supabase.rpc("get_admin_cost_by_user", { p_start: startAt, p_end: endAt, p_bucket: appliedBucket, p_provider: provider, p_model: model, p_family: family, p_operation: operation, p_run_type: runType }),
          supabase.rpc("get_admin_cost_by_operation", { p_start: startAt, p_end: endAt, p_bucket: appliedBucket, p_provider: provider, p_model: model, p_family: family, p_operation: operation, p_run_type: runType }),
          supabase.rpc("get_admin_cost_compare_previous", { p_start: startAt, p_end: endAt, p_provider: provider, p_model: model, p_family: family, p_operation: operation, p_run_type: runType }),
          supabase.rpc("get_admin_daily_cost_synthesis", { p_target_day: appliedEndDate, p_provider: provider, p_model: model, p_family: family, p_operation: operation, p_run_type: runType }),
          supabase.rpc("get_admin_cost_data_quality_v2", { p_start: startAt, p_end: endAt, p_provider: provider, p_model: model, p_family: family, p_operation: operation, p_run_type: runType }),
          supabase.rpc("get_admin_user_daily_costs", { p_start: startAt, p_end: endAt, p_provider: provider, p_model: model, p_family: family, p_operation: operation, p_run_type: runType }),
          supabase.rpc("get_admin_cost_coverage_gaps", { p_start: startAt, p_end: endAt, p_run_type: runType }),
        ]);
        if (overviewRes.error) throw overviewRes.error;
        if (userRes.error) throw userRes.error;
        if (opRes.error) throw opRes.error;
        if (compareRes.error) throw compareRes.error;
        if (dailyRes.error) throw dailyRes.error;
        if (qualityRes.error) throw qualityRes.error;
        if (userDailyRes.error) throw userDailyRes.error;
        if (coverageGapRes.error) throw coverageGapRes.error;
        setOverview((overviewRes.data as OverviewRow[] | null) ?? []);
        setUsers((userRes.data as UserRow[] | null) ?? []);
        setOperations((opRes.data as OperationRow[] | null) ?? []);
        setCompare((compareRes.data as CompareRow[] | null)?.[0] ?? null);
        setDaily((dailyRes.data as DailySynthesisRow[] | null)?.[0] ?? null);
        setDataQuality((qualityRes.data as DataQualityRow[] | null)?.[0] ?? null);
        setUserDailyCosts((userDailyRes.data as UserDailyCostRow[] | null) ?? []);
        setCoverageGaps((coverageGapRes.data as CoverageGapRow[] | null) ?? []);
        setLoadError(null);
        // Extra filter pools: usage RPCs provide model/source even if operation rows are sparse.
        const [usageSourceRes, usageModelRes] = await Promise.all([
          supabase.rpc("get_usage_by_source", { period_start: startAt }),
          supabase.rpc("get_usage_by_model", { period_start: startAt }),
        ]);
        setUsageSources(
          ((usageSourceRes.data as UsageSourceRow[] | null) ?? [])
            .map((x) => String(x.source ?? "").trim())
            .filter(Boolean),
        );
        setUsageModels(
          ((usageModelRes.data as UsageModelRow[] | null) ?? [])
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
  }, [
    user,
    isAdmin,
    appliedStartDate,
    appliedEndDate,
    appliedBucket,
    appliedProviderFilter,
    appliedModelFilter,
    appliedFamilyFilter,
    appliedOperationFilter,
    appliedRunTypeFilter,
  ]);

  useEffect(() => {
    async function loadUserBreakdown() {
      if (!user || !isAdmin || !appliedStartDate || !appliedEndDate || !selectedUserId) {
        setUserOperationRows([]);
        return;
      }
      setUserOperationLoading(true);
      try {
        const startAt = new Date(`${appliedStartDate}T00:00:00.000Z`).toISOString();
        const endAt = new Date(`${appliedEndDate}T23:59:59.999Z`).toISOString();
        const provider = rpcFilterValue(appliedProviderFilter);
        const model = rpcFilterValue(appliedModelFilter);
        const family = rpcFilterValue(appliedFamilyFilter);
        const operation = rpcFilterValue(appliedOperationFilter);
        const res = await supabase.rpc("get_admin_user_operation_breakdown", {
          p_start: startAt,
          p_end: endAt,
          p_user_id: selectedUserId,
          p_provider: provider,
          p_model: model,
          p_family: family,
          p_operation: operation,
          p_run_type: appliedRunTypeFilter,
        });
        if (res.error) throw res.error;
        setUserOperationRows((res.data as UserOperationRow[] | null) ?? []);
      } catch (e) {
        console.error("admin usage dashboard user breakdown load failed", e);
        setUserOperationRows([]);
      } finally {
        setUserOperationLoading(false);
      }
    }
    loadUserBreakdown();
  }, [
    user,
    isAdmin,
    appliedStartDate,
    appliedEndDate,
    selectedUserId,
    appliedProviderFilter,
    appliedModelFilter,
    appliedFamilyFilter,
    appliedOperationFilter,
    appliedRunTypeFilter,
  ]);

  const providerOptions = useMemo(() => ["all", ...Array.from(new Set(operations.map((o) => o.provider).filter(Boolean)))], [operations]);
  const modelOptions = useMemo(
    () => ["all", ...Array.from(new Set([...operations.map((o) => o.model).filter(Boolean), ...usageModels]))],
    [operations, usageModels],
  );
  const familyOptions = useMemo(
    () =>
      [
        "all",
        ...Array.from(
          new Set([
            ...operations.map((o) => (o.operation_family === "other" ? normalizeUsageFamily(o.source) : o.operation_family)).filter(Boolean),
            ...usageSources.map((s) => normalizeUsageFamily(s)),
          ]),
        ),
      ],
    [operations, usageSources],
  );
  const operationOptions = useMemo(
    () =>
      [
        "all",
        ...Array.from(
          new Set([
            ...operations.map((o) => normalizeUsageOperation(o.operation_name || o.source)).filter(Boolean),
            ...usageSources.map((s) => normalizeUsageOperation(s)),
          ]),
        ),
      ],
    [operations, usageSources],
  );

  useEffect(() => {
    if (appliedProviderFilter !== "all" && !providerOptions.includes(appliedProviderFilter)) setAppliedProviderFilter("all");
    if (appliedModelFilter !== "all" && !modelOptions.includes(appliedModelFilter)) setAppliedModelFilter("all");
    if (appliedFamilyFilter !== "all" && !familyOptions.includes(appliedFamilyFilter)) setAppliedFamilyFilter("all");
    if (appliedOperationFilter !== "all" && !operationOptions.includes(appliedOperationFilter)) setAppliedOperationFilter("all");
  }, [
    providerOptions,
    modelOptions,
    familyOptions,
    operationOptions,
    appliedProviderFilter,
    appliedModelFilter,
    appliedFamilyFilter,
    appliedOperationFilter,
  ]);

  const filteredOps = operations;
  const hasActiveOpFilters =
    appliedProviderFilter !== "all" ||
    appliedModelFilter !== "all" ||
    appliedFamilyFilter !== "all" ||
    appliedOperationFilter !== "all";

  const filteredUsers = useMemo(() => {
    const byUser = new Map<string, UserRow>();
    for (const u of users) {
      const key = String(u.user_id || u.email || "unknown");
      const existing = byUser.get(key);
      if (!existing) {
        byUser.set(key, { ...u });
        continue;
      }
      existing.ai_cost_usd = Number(existing.ai_cost_usd || 0) + Number(u.ai_cost_usd || 0);
      existing.whatsapp_cost_eur = Number(existing.whatsapp_cost_eur || 0) + Number(u.whatsapp_cost_eur || 0);
      existing.total_cost_usd = Number(existing.total_cost_usd || 0) + Number(u.total_cost_usd || 0);
      existing.total_calls = Number(existing.total_calls || 0) + Number(u.total_calls || 0);
      existing.total_tokens = Number(existing.total_tokens || 0) + Number(u.total_tokens || 0);
      if (!existing.full_name && u.full_name) existing.full_name = u.full_name;
      if (!existing.email && u.email) existing.email = u.email;
    }
    const merged = Array.from(byUser.values()).sort((a, b) => Number(b.total_cost_usd || 0) - Number(a.total_cost_usd || 0));
    const q = appliedSearch.toLowerCase().trim();
    return merged.filter((u) => {
      if (!q) return true;
      return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, appliedSearch]);

  useEffect(() => {
    if (!selectedUserId) return;
    const exists = filteredUsers.some((u) => String(u.user_id || "") === selectedUserId);
    if (!exists) setSelectedUserId(null);
  }, [filteredUsers, selectedUserId]);

  const selectedUser = useMemo(
    () => filteredUsers.find((u) => String(u.user_id || "") === selectedUserId) ?? null,
    [filteredUsers, selectedUserId],
  );

  const filteredUserOps = userOperationRows;

  function applyFilters() {
    setAppliedBucket(bucket);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedSearch(search);
    setAppliedModelFilter(modelFilter);
    setAppliedProviderFilter(providerFilter);
    setAppliedFamilyFilter(familyFilter);
    setAppliedOperationFilter(operationFilter);
    setAppliedRunTypeFilter(runTypeFilter);
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
    setRunTypeFilter("prod");
    setAppliedBucket("day");
    setAppliedStartDate(s);
    setAppliedEndDate(e);
    setAppliedSearch("");
    setAppliedModelFilter("all");
    setAppliedProviderFilter("all");
    setAppliedFamilyFilter("all");
    setAppliedOperationFilter("all");
    setAppliedRunTypeFilter("prod");
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
    const csv = toCsv(headers, filteredOps as unknown as Array<Record<string, unknown>>);
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
    <AdminShell
      active="usage"
      title="Usage & costs"
      description="Suivi des couts reels par periode, utilisateur, operation, modele et qualite d'attribution."
      icon={BarChart3}
      actions={
        <button
          onClick={exportOpsCsv}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-600 hover:bg-neutral-800"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      }
    >
      <div className="space-y-6">
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
          <FilterField label="Run type">
            <select value={runTypeFilter} onChange={(e) => setRunTypeFilter(e.target.value as RunTypeFilter)} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm w-full">
              <option value="prod">Prod only</option>
              <option value="all">All runs</option>
              <option value="non_prod">Non-prod</option>
              <option value="qa">QA</option>
              <option value="smoke">Smoke</option>
            </select>
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

        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-200">Data quality</h3>
              <p className="text-xs text-neutral-500 mt-1">
                Run type: <span className="text-neutral-300">{appliedRunTypeFilter}</span>. Totaux et tables utilisent le même filtre.
              </p>
            </div>
            {dataQuality && Number(dataQuality.unpriced_events || 0) > 0 ? (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                Pricing incomplet
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <QualityStat
              label="Attribution"
              value={`${(Number(dataQuality?.attribution_rate ?? 1) * 100).toFixed(1)}%`}
              detail={`${Number(dataQuality?.unattributed_events ?? 0)} unattributed / ${Number(dataQuality?.total_events ?? 0)} events`}
            />
            <QualityStat
              label="Pricing coverage"
              value={`${(Number(dataQuality?.pricing_coverage_rate ?? 1) * 100).toFixed(1)}%`}
              detail={`${Number(dataQuality?.unpriced_events ?? 0)} unpriced events`}
            />
            <QualityStat
              label="Attributed cost"
              value={`$${Number(dataQuality?.attributed_cost_usd ?? 0).toFixed(4)}`}
              detail={`Unattributed $${Number(dataQuality?.unattributed_cost_usd ?? 0).toFixed(4)}`}
            />
            <QualityStat
              label="Metadata gaps"
              value={String(Number(dataQuality?.missing_operation_events ?? 0) + Number(dataQuality?.missing_source_events ?? 0))}
              detail={`${Number(dataQuality?.missing_operation_events ?? 0)} operation, ${Number(dataQuality?.missing_source_events ?? 0)} source`}
            />
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-200">Coverage gaps</h3>
              <p className="text-xs text-neutral-500 mt-1">Unpriced models, unattributed users and unclassified operations.</p>
            </div>
            {coverageGaps.length > 0 ? (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                {coverageGaps.length} gaps
              </span>
            ) : (
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                clean
              </span>
            )}
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-950 text-neutral-400 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">Gap</th>
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-left">Model</th>
                  <th className="px-4 py-2 text-left">Family</th>
                  <th className="px-4 py-2 text-right">Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {coverageGaps.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-neutral-500" colSpan={5}>Aucun trou de couverture détecté sur la période.</td>
                  </tr>
                ) : coverageGaps.slice(0, 50).map((gap, idx) => (
                  <tr key={`${gap.gap_type}-${gap.provider}-${gap.model}-${gap.source}-${idx}`} className="hover:bg-neutral-900/60">
                    <td className="px-4 py-2">
                      <span className={cn(
                        "rounded-md border px-2 py-1 text-xs",
                        gap.gap_type === "unpriced_model"
                          ? "border-red-500/30 bg-red-500/10 text-red-200"
                          : gap.gap_type === "unattributed_user"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                            : "border-neutral-700 bg-neutral-950 text-neutral-300"
                      )}>
                        {gap.gap_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-neutral-300">{gap.source || "-"}</td>
                    <td className="px-4 py-2">
                      <div>{gap.model || "-"}</div>
                      <div className="text-xs text-neutral-500">{gap.provider || "-"}</div>
                    </td>
                    <td className="px-4 py-2 text-neutral-400">{gap.operation_family || "-"}</td>
                    <td className="px-4 py-2 text-right font-mono">{Number(gap.event_count || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Cost by user/day</div>
          <div className="max-h-[460px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-950 text-neutral-400 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">Day</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-right">Total USD</th>
                  <th className="px-4 py-2 text-right">AI USD</th>
                  <th className="px-4 py-2 text-right">WA USD</th>
                  <th className="px-4 py-2 text-right">Calls</th>
                  <th className="px-4 py-2 text-right">Tokens</th>
                  <th className="px-4 py-2 text-left">Top model</th>
                  <th className="px-4 py-2 text-right">Unpriced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {userDailyCosts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-neutral-500" colSpan={9}>
                      Aucun coût utilisateur/jour pour cette période et ces filtres.
                    </td>
                  </tr>
                ) : userDailyCosts.map((r) => (
                  <tr key={`${r.day}-${r.user_id}`} className="hover:bg-neutral-900/60">
                    <td className="px-4 py-2">{new Date(r.day).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.full_name || "Unknown"}</div>
                      <div className="text-xs text-neutral-500">{r.email || r.user_id}</div>
                    </td>
                    <td className="px-4 py-2 text-right">${Number(r.total_cost_usd || 0).toFixed(4)}</td>
                    <td className="px-4 py-2 text-right">${Number(r.ai_cost_usd || 0).toFixed(4)}</td>
                    <td className="px-4 py-2 text-right">${Number(r.whatsapp_cost_usd || 0).toFixed(4)}</td>
                    <td className="px-4 py-2 text-right">{Number(r.total_calls || 0)}</td>
                    <td className="px-4 py-2 text-right">{Number(r.total_tokens || 0)}</td>
                    <td className="px-4 py-2">
                      <div>{r.top_model || "-"}</div>
                      <div className="text-xs text-neutral-500">{r.top_operation_family || "-"}</div>
                    </td>
                    <td className={cn("px-4 py-2 text-right", Number(r.unpriced_events || 0) > 0 && "text-amber-300")}>
                      {Number(r.unpriced_events || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  {filteredUsers.map((u) => (
                    <tr
                      key={u.user_id || u.email}
                      className={cn(
                        "cursor-pointer hover:bg-neutral-900/60",
                        selectedUserId && String(u.user_id || "") === selectedUserId && "bg-indigo-500/10",
                      )}
                      onClick={() => setSelectedUserId(u.user_id || null)}
                    >
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
            <div className="border-t border-neutral-800 p-3">
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
                {selectedUser
                  ? `Detail utilisateur: ${selectedUser.full_name || selectedUser.email || selectedUser.user_id}`
                  : "Clique un utilisateur pour voir le detail par type d'appel"}
              </div>
              <div className="max-h-[280px] overflow-y-auto rounded-lg border border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-950 text-neutral-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Operation</th>
                      <th className="px-3 py-2 text-left">Model</th>
                      <th className="px-3 py-2 text-right">Total USD</th>
                      <th className="px-3 py-2 text-right">Calls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {!selectedUser ? (
                      <tr>
                        <td className="px-3 py-3 text-neutral-500" colSpan={4}>
                          Selectionne un utilisateur.
                        </td>
                      </tr>
                    ) : userOperationLoading ? (
                      <tr>
                        <td className="px-3 py-3 text-neutral-500" colSpan={4}>
                          Chargement...
                        </td>
                      </tr>
                    ) : filteredUserOps.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-neutral-500" colSpan={4}>
                          Aucun appel pour cet utilisateur sur la periode/filtres.
                        </td>
                      </tr>
                    ) : (
                      filteredUserOps.map((o, idx) => {
                        const family = o.operation_family === "other" ? normalizeUsageFamily(o.source) : o.operation_family;
                        const operation = normalizeUsageOperation(o.operation_name || o.source);
                        return (
                          <tr key={`${operation}-${o.model}-${idx}`}>
                            <td className="px-3 py-2">
                              <div>{family}</div>
                              <div className="text-xs text-neutral-500">{operation}</div>
                            </td>
                            <td className="px-3 py-2">
                              <div>{o.model}</div>
                              <div className="text-xs text-neutral-500">{o.provider}</div>
                            </td>
                            <td className="px-3 py-2 text-right">${Number(o.total_cost_usd).toFixed(4)}</td>
                            <td className="px-3 py-2 text-right">{o.total_calls}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
                  {filteredOps.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-neutral-500" colSpan={4}>
                        {hasActiveOpFilters
                          ? "Aucune operation pour ces filtres sur la periode. Clique sur Reset ou ajuste les filtres."
                          : "Aucune operation enregistree sur cette periode."}
                      </td>
                    </tr>
                  ) : filteredOps.map((o, idx) => {
                    const family = o.operation_family === "other" ? normalizeUsageFamily(o.source) : o.operation_family;
                    const operation = normalizeUsageOperation(o.operation_name || o.source);
                    return (
                      <tr key={`${operation}-${o.model}-${idx}`}>
                        <td className="px-4 py-2">
                          <div>{family}</div>
                          <div className="text-xs text-neutral-500">{operation}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div>{o.model}</div>
                          <div className="text-xs text-neutral-500">{o.provider}</div>
                        </td>
                        <td className="px-4 py-2 text-right">${Number(o.total_cost_usd).toFixed(4)}</td>
                        <td className="px-4 py-2 text-right">{o.total_calls}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function KpiCard({
  title,
  value,
  loading,
  icon: Icon,
}: {
  title: string;
  value: ReactNode;
  loading: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
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

function QualityStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <div className="text-lg font-semibold text-neutral-100">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{label}</div>
      <div className="text-[11px] text-neutral-600 mt-2">{detail}</div>
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
