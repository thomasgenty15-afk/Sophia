import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { 
  Activity, 
  AlertCircle, 
  BarChart3, 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  CreditCard, 
  DollarSign, 
  LayoutDashboard, 
  Play, 
  Settings2, 
  Terminal,
  Loader2,
  Filter
} from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type Scenario = {
  dataset_key: string;
  id: string;
  description?: string;
  tags?: string[];
  steps?: { user: string }[];
  persona?: any;
  objectives?: any[];
  max_turns?: number;
  assertions?: any;
};

function loadScenarioPack(): Scenario[] {
  const mods = import.meta.glob("../../eval/scenarios/*.json", { eager: true }) as Record<string, any>;
  return Object.values(mods).map((m: any) => (m?.default ? m.default : m)) as Scenario[];
}

const PROMPT_KEYS = [
  "sophia.dispatcher",
  "sophia.investigator",
  "sophia.companion",
  "sophia.architect",
  "sophia.firefighter",
  "sophia.assistant",
  "sophia.watcher",
] as const;

export default function AdminDashboard() {
  const { user, loading, isAdmin } = useAuth();
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [runs24h, setRuns24h] = useState(0);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const [cost24h, setCost24h] = useState(0);
  const [tokens24h, setTokens24h] = useState(0);

  const [promptKey, setPromptKey] = useState<string>("(all)");
  const [sinceMinutes, setSinceMinutes] = useState<number>(60);
  const [useSinceFilter, setUseSinceFilter] = useState<boolean>(false);
  const [maxScenarios, setMaxScenarios] = useState<number>(10);
  const [maxTurns, setMaxTurns] = useState<number>(8);
  const [stopOnFail, setStopOnFail] = useState<boolean>(false);
  const [budgetUsd, setBudgetUsd] = useState<number>(0);
  const [useRealAi, setUseRealAi] = useState<boolean>(false);
  const [pricingLoaded, setPricingLoaded] = useState<boolean>(false);
  const [pricingFlashIn, setPricingFlashIn] = useState<number>(0);
  const [pricingFlashOut, setPricingFlashOut] = useState<number>(0);

  const [runBusy, setRunBusy] = useState(false);
  const [lastRun, setLastRun] = useState<any | null>(null);

  const allScenarios = useMemo(() => loadScenarioPack(), []);
  const filteredScenarios = useMemo(() => {
    if (promptKey === "(all)") return allScenarios;
    return allScenarios.filter((s) => Array.isArray(s.tags) && s.tags.includes(promptKey));
  }, [allScenarios, promptKey]);

  useEffect(() => {
    async function loadMetrics() {
      if (!user || !isAdmin) return;
      setMetricsLoading(true);
      try {
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: cntRuns } = await supabase
          .from("conversation_eval_runs")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceIso);
        setRuns24h(cntRuns ?? 0);

        const { count: cntSug } = await supabase
          .from("prompt_override_suggestions")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending");
        setPendingSuggestions(cntSug ?? 0);

        const { data: lastRuns } = await supabase
          .from("conversation_eval_runs")
          .select("metrics,created_at")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(200);
        const sum = (lastRuns ?? []).reduce((acc: number, r: any) => acc + (Number(r?.metrics?.cost_usd ?? 0) || 0), 0);
        const tok = (lastRuns ?? []).reduce((acc: number, r: any) => acc + (Number(r?.metrics?.total_tokens ?? 0) || 0), 0);
        setCost24h(sum);
        setTokens24h(tok);
      } finally {
        setMetricsLoading(false);
      }
    }
    loadMetrics();
  }, [user, isAdmin]);

  useEffect(() => {
    async function loadPricing() {
      if (!user || !isAdmin) return;
      const { data, error } = await supabase
        .from("llm_pricing")
        .select("provider,model,input_per_1k_tokens_usd,output_per_1k_tokens_usd")
        .eq("provider", "gemini")
        .eq("model", "gemini-2.0-flash")
        .maybeSingle();
      if (error) {
        console.error(error);
        return;
      }
      setPricingFlashIn(Number((data as any)?.input_per_1k_tokens_usd ?? 0) || 0);
      setPricingFlashOut(Number((data as any)?.output_per_1k_tokens_usd ?? 0) || 0);
      setPricingLoaded(true);
    }
    loadPricing();
  }, [user, isAdmin]);

  async function savePricing() {
    const { error } = await supabase.from("llm_pricing").upsert({
      provider: "gemini",
      model: "gemini-2.0-flash",
      input_per_1k_tokens_usd: pricingFlashIn,
      output_per_1k_tokens_usd: pricingFlashOut,
      currency: "USD",
      updated_at: new Date().toISOString(),
    });
    if (error) console.error(error);
  }

  async function startRun() {
    setRunBusy(true);
    setLastRun(null);
    try {
      const selected = filteredScenarios.slice(0, Math.max(1, Math.min(50, maxScenarios)));
      const { data, error } = await supabase.functions.invoke("run-evals", {
        body: {
          scenarios: selected,
          limits: {
            max_scenarios: Math.max(1, Math.min(50, maxScenarios)),
            max_turns_per_scenario: Math.max(1, Math.min(50, maxTurns)),
            stop_on_first_failure: stopOnFail,
            budget_usd: Math.max(0, budgetUsd),
            use_real_ai: useRealAi,
          },
        },
      });
      if (error) throw error;
      setLastRun(data);
    } finally {
      setRunBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900/50 backdrop-blur border border-neutral-800 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-neutral-800 rounded-xl flex items-center justify-center mx-auto mb-4">
            <LayoutDashboard className="w-6 h-6 text-neutral-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Sophia Control Room</h1>
          <p className="text-neutral-400 mb-6">Accès restreint au personnel autorisé uniquement.</p>
          <a
            href="/auth?redirect=/admin"
            className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-medium rounded-xl transition-colors"
          >
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-red-950/20 border border-red-900/50 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-red-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-red-200 mb-2">Accès Refusé</h1>
          <p className="text-red-400/80 mb-4 text-sm">
            Votre compte n'a pas les privilèges administrateur requis.
          </p>
          <div className="text-xs text-neutral-500 bg-neutral-900/50 p-2 rounded border border-neutral-800 break-all">
            {user.email}
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center border border-indigo-500/20">
              <LayoutDashboard className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h1 className="font-semibold text-white leading-none">Sophia Control Room</h1>
              <p className="text-xs text-neutral-500 mt-1 font-mono">SYS.ADMIN.V2</p>
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
              href="/admin/production-log"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <Terminal className="w-4 h-4" />
              Production log
            </a>
            <a
              href="/admin/evals"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <Activity className="w-4 h-4" />
              Evals & Logs
            </a>
            <div className="h-4 w-px bg-neutral-800" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-full border border-neutral-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-neutral-300">System Online</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MetricCard
            title="Runs (24h)"
            value={runs24h}
            loading={metricsLoading}
            icon={Play}
            trend="active"
          />
          <MetricCard
            title="Suggestions Pending"
            value={pendingSuggestions}
            loading={metricsLoading}
            icon={AlertCircle}
            trend={pendingSuggestions > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            title="Est. Cost (24h)"
            value={`$${cost24h.toFixed(4)}`}
            loading={metricsLoading}
            icon={DollarSign}
            trend="neutral"
            subtext={`Tokens (24h): ${tokens24h}`}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Left Column: Controls */}
          <div className="xl:col-span-4 space-y-6">
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-medium text-white">Configuration du Run</h3>
                </div>
                {runBusy && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
              </div>
              
              <div className="p-5 space-y-5">
                {/* Prompt Key */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Target Persona
                  </label>
                  <select
                    value={promptKey}
                    onChange={(e) => setPromptKey(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option value="(all)">All Personas</option>
                    {PROMPT_KEYS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup 
                    label="Max Scenarios"
                    value={maxScenarios}
                    onChange={setMaxScenarios}
                    min={1} max={50}
                  />
                  <InputGroup 
                    label="Max Turns"
                    value={maxTurns}
                    onChange={setMaxTurns}
                    min={1} max={50}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup 
                    label="Since (min)"
                    value={sinceMinutes}
                    onChange={setSinceMinutes}
                    min={0}
                    disabled={!useSinceFilter}
                  />
                  <InputGroup 
                    label="Budget Limit ($)"
                    value={budgetUsd}
                    onChange={setBudgetUsd}
                    min={0} step={0.01}
                    icon={DollarSign}
                  />
                </div>

                <div className="pt-1">
                  <label className="flex items-start gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={useSinceFilter}
                      onChange={(e) => setUseSinceFilter(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-offset-neutral-950 focus:ring-indigo-500"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm text-neutral-300">Activer “Since (min)”</span>
                      <span className="text-xs text-neutral-500">
                        Filtre temporel optionnel. OFF = aucun filtrage.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={stopOnFail} 
                      onChange={(e) => setStopOnFail(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-offset-neutral-950 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-neutral-300">Stop on first failure</span>
                  </label>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={useRealAi}
                      onChange={(e) => setUseRealAi(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-offset-neutral-950 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-neutral-300">Real AI (Gemini) pour ce run</span>
                  </label>
                </div>

                {useRealAi && pricingLoaded && pricingFlashIn + pricingFlashOut <= 0 ? (
                  <div className="text-xs text-amber-300">
                    Pricing Gemini non configuré (llm_pricing=0). Les tokens remonteront, mais le coût restera à 0 tant que tu ne mets pas les prix.
                  </div>
                ) : null}

                <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5" />
                      Pricing · gemini-2.0-flash (USD / 1K tokens)
                    </div>
                    <button
                      onClick={savePricing}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-neutral-600 text-neutral-200"
                    >
                      Sauver
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Input</div>
                      <input
                        type="number"
                        min={0}
                        step={0.0001}
                        value={pricingFlashIn}
                        onChange={(e) => setPricingFlashIn(Number(e.target.value))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Output</div>
                      <input
                        type="number"
                        min={0}
                        step={0.0001}
                        value={pricingFlashOut}
                        onChange={(e) => setPricingFlashOut(Number(e.target.value))}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800/50">
                  <div className="flex justify-between items-center text-xs text-neutral-500 mb-4">
                    <span>Available Scenarios:</span>
                    <span className="text-white font-mono bg-neutral-800 px-1.5 py-0.5 rounded">{filteredScenarios.length}</span>
                  </div>
                  
                  <button
                    disabled={runBusy || filteredScenarios.length === 0}
                    onClick={startRun}
                    className="group relative w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-indigo-600 active:scale-[0.98]"
                  >
                    {runBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Execution en cours...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Lancer la séquence de test</span>
                      </>
                    )}
                    {/* Glow effect */}
                    {!runBusy && filteredScenarios.length > 0 && (
                      <div className="absolute inset-0 rounded-xl bg-indigo-400/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="xl:col-span-8">
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden min-h-[600px] flex flex-col">
              <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-medium text-white">Live Execution Output</h3>
                </div>
                {lastRun && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                      Mode: {lastRun.use_real_ai ? "REAL" : "STUB"}
                    </span>
                    <span className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                      Time: {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 p-0 relative">
                {!lastRun ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600">
                    <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
                      <Activity className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="text-sm">En attente d'exécution...</p>
                  </div>
                ) : (
                  <div className="h-full flex flex-col">
                    {/* Summary Header */}
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-neutral-800 bg-neutral-950/30">
                      <StatItem label="Scenarios Executed" value={lastRun.ran} />
                      <StatItem label="Total Cost" value={`$${Number(lastRun.total_cost_usd ?? 0).toFixed(4)}`} />
                      <StatItem 
                        label="Status" 
                        value={lastRun.stopped_reason ? "Stopped" : "Completed"} 
                        valueClass={lastRun.stopped_reason ? "text-amber-400" : "text-emerald-400"}
                      />
                    </div>
                    <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950/20 text-xs text-neutral-400 font-mono">
                      tokens_total={Number(lastRun.total_tokens ?? 0)} in={Number(lastRun.total_prompt_tokens ?? 0)} out={Number(lastRun.total_output_tokens ?? 0)}
                    </div>

                    {lastRun.stopped_reason && (
                      <div className="px-5 py-3 bg-amber-950/20 border-b border-amber-900/30 text-amber-200 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Stop Reason: {lastRun.stopped_reason}
                      </div>
                    )}

                    {/* Results List */}
                    <div className="flex-1 overflow-auto p-5 space-y-3">
                      {(lastRun.results ?? []).map((r: any) => (
                        <div 
                          key={r.eval_run_id} 
                          className="group rounded-lg bg-neutral-950 border border-neutral-800 p-4 hover:border-neutral-700 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-xs text-indigo-400 px-1.5 py-0.5 rounded bg-indigo-950/30 border border-indigo-900/50">
                                  {r.dataset_key}
                                </span>
                                <span className="font-medium text-sm text-neutral-200">{r.scenario_key}</span>
                              </div>
                              <div className="text-xs text-neutral-500 font-mono">
                                ID: {r.eval_run_id}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <div className={cn("flex items-center gap-1.5", r.issues_count > 0 ? "text-red-400" : "text-neutral-500")}>
                                <AlertCircle className="w-3.5 h-3.5" />
                                {r.issues_count} issues
                              </div>
                              <div className={cn("flex items-center gap-1.5", r.suggestions_count > 0 ? "text-blue-400" : "text-neutral-500")}>
                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                {r.suggestions_count} sugg.
                              </div>
                              <div className="text-neutral-400 font-mono">
                                ${Number(r.cost_usd ?? 0).toFixed(4)}
                              </div>
                              <div className="text-neutral-500 font-mono">
                                {Number(r.total_tokens ?? 0)} tok
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value, loading, icon: Icon, trend, subtext }: any) {
  return (
    <div className="rounded-xl bg-neutral-900/30 border border-neutral-800 p-5 relative overflow-hidden group hover:border-neutral-700 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "p-2.5 rounded-lg border", 
          trend === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : 
          trend === "active" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
          "bg-neutral-800/50 border-neutral-700/50 text-neutral-400"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />}
      </div>
      <div>
        <div className="text-3xl font-bold text-white mb-1 tracking-tight">
          {loading ? "..." : value}
        </div>
        <div className="text-sm text-neutral-500 font-medium">{title}</div>
        {subtext && <div className="text-xs text-neutral-600 mt-1">{subtext}</div>}
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, min, max, step, icon: Icon, disabled }: any) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 block">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={Boolean(disabled)}
          className={cn(
            "w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pl-3",
            Boolean(disabled) && "opacity-50 cursor-not-allowed",
          )}
        />
        {Icon && (
          <div className="absolute right-3 top-2.5 text-neutral-500 pointer-events-none">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value, valueClass = "text-white" }: any) {
  return (
    <div>
      <div className="text-xs text-neutral-500 mb-1 uppercase tracking-wider">{label}</div>
      <div className={cn("text-xl font-semibold", valueClass)}>{value}</div>
    </div>
  );
}
