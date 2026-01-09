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
  Filter,
  Cpu
} from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { buildBilanScenarioPack } from "../eval/bilanScenarioPack";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type Scenario = {
  dataset_key: string;
  id: string;
  scenario_target?: string;
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
  const jsonScenarios = Object.values(mods).map((m: any) => (m?.default ? m.default : m)) as Scenario[];
  // Programmatic pack: generate many bilan variants without maintaining dozens of JSON files.
  const bilanVariants = buildBilanScenarioPack();
  return [...jsonScenarios, ...bilanVariants];
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

const SCENARIO_TARGETS = [
  "(all)",
  "bilan",
  "detresse",
  "decrochage",
  "onboarding",
  "whatsapp",
  "style",
] as const;

const USER_DIFFICULTIES = ["easy", "mid", "hard"] as const;
const EVAL_MODELS = ["gemini-2.5-flash"] as const;

export default function AdminDashboard() {
  const { user, loading, isAdmin } = useAuth();
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [runs24h, setRuns24h] = useState(0);
  const [cost24h, setCost24h] = useState(0);
  const [tokens24h, setTokens24h] = useState(0);

  const [promptKey, setPromptKey] = useState<string>("(all)");
  const [scenarioTarget, setScenarioTarget] = useState<string>("(all)");
  const [maxScenarios, setMaxScenarios] = useState<number>(1);
  const [maxTurns, setMaxTurns] = useState<number>(15);
  const [bilanActionsCount, setBilanActionsCount] = useState<number>(3);
  const [testPostCheckupDeferral, setTestPostCheckupDeferral] = useState<boolean>(false);
  const [userDifficulty, setUserDifficulty] = useState<(typeof USER_DIFFICULTIES)[number]>("mid");
  const [evalModel, setEvalModel] = useState<string>("gemini-2.5-flash");
  const [stopOnFail, setStopOnFail] = useState<boolean>(false);
  const [budgetUsd, setBudgetUsd] = useState<number>(0);
  const [pricingLoaded, setPricingLoaded] = useState<boolean>(false);
  const [pricingFlashIn, setPricingFlashIn] = useState<number>(0);
  const [pricingFlashOut, setPricingFlashOut] = useState<number>(0);

  const [runBusy, setRunBusy] = useState(false);
  const [lastRun, setLastRun] = useState<any | null>(null);

  const allScenarios = useMemo(() => loadScenarioPack(), []);
  const filteredScenarios = useMemo(() => {
    let out = allScenarios;
    if (scenarioTarget !== "(all)") {
      out = out.filter((s) => String((s as any)?.scenario_target ?? "").trim() === scenarioTarget);
    }
    if (promptKey !== "(all)") {
      out = out.filter((s) => Array.isArray(s.tags) && s.tags.includes(promptKey));
    }
    return out;
  }, [allScenarios, promptKey, scenarioTarget]);

  // Special-case for "Test spécial post-bilan":
  // Avoid bilan variants that are designed to stop early ("pas le temps", "stop", etc.) because they pollute the parking-lot test.
  const filteredScenariosForRun = useMemo(() => {
    if (scenarioTarget !== "bilan") return filteredScenarios;
    if (!testPostCheckupDeferral) return filteredScenarios;
    return filteredScenarios.filter((s) => {
      const id = String((s as any)?.id ?? "");
      // Programmatic pack IDs look like: bilan_${demeanor}__${outcome}__${constraint}
      // We exclude variants that tend to end the bilan early.
      if (id.includes("__stop_midway")) return false;
      if (id.startsWith("bilan_rushed__")) return false;
      if (id.startsWith("bilan_unavailable__")) return false;
      if (id.startsWith("bilan_hostile__")) return false;
      return true;
    });
  }, [filteredScenarios, scenarioTarget, testPostCheckupDeferral]);

  // UI semantics: this is an exact requested count (not "max").
  const desiredScenarioCount = Math.max(1, Math.min(50, maxScenarios));
  const canRunExactCount = filteredScenariosForRun.length >= desiredScenarioCount;
  // Special-case: BILAN can be run with random variants and repetitions (templates are finite).
  const allowRepeatsForRun = scenarioTarget === "bilan" && filteredScenariosForRun.length > 0;
  const willRepeatScenarios = allowRepeatsForRun && filteredScenariosForRun.length < desiredScenarioCount;
  const canRunRequestedCount =
    filteredScenariosForRun.length > 0 && (canRunExactCount || allowRepeatsForRun);

  function shuffleCopy<T>(arr: T[]): T[] {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      const j = Number(buf[0] % (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

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
      setPricingLoaded(false);
      const { data, error } = await supabase
        .from("llm_pricing")
        .select("provider,model,input_per_1k_tokens_usd,output_per_1k_tokens_usd")
        .eq("provider", "gemini"); // On récupère tout pour voir

      if (error) {
        console.error(error);
        return;
      }

      // On filtre nous-même en JS pour trouver le bon modèle et voir si ça match
      const found = data?.find(row => row.model.trim() === evalModel.trim());

      setPricingFlashIn(Number(found?.input_per_1k_tokens_usd ?? 0) || 0);
      setPricingFlashOut(Number(found?.output_per_1k_tokens_usd ?? 0) || 0);
      setPricingLoaded(true);
    }
    loadPricing();
  }, [user, isAdmin, evalModel]);

  async function startRun() {
    setRunBusy(true);
    setLastRun(null);
    try {
      let selected: Scenario[] = [];
      if (scenarioTarget === "bilan" && filteredScenariosForRun.length > 0) {
        // Randomly pick N tests from the available templates (repeat + reshuffle if needed).
        const pool = shuffleCopy(filteredScenariosForRun);
        let idx = 0;
        while (selected.length < desiredScenarioCount) {
          if (idx >= pool.length) {
            idx = 0;
            const reshuffled = shuffleCopy(filteredScenariosForRun);
            pool.splice(0, pool.length, ...reshuffled);
          }
          const base = pool[idx] as Scenario;
          const testN = selected.length + 1;
          selected.push({
            ...base,
            id: `${String(base.id)}__test_${testN}`,
            description: base.description ? `${base.description} (test ${testN}/${desiredScenarioCount})` : base.description,
          });
          idx += 1;
        }
      } else if (canRunExactCount) {
        selected = filteredScenarios.slice(0, desiredScenarioCount);
      } else if (allowRepeatsForRun) {
        selected = Array.from({ length: desiredScenarioCount }, (_, i) => {
          const base = filteredScenariosForRun[i % filteredScenariosForRun.length] as Scenario;
          const rep = i + 1;
          return {
            ...base,
            id: `${String(base.id)}__rep_${rep}`,
            description: base.description ? `${base.description} (repeat ${rep}/${desiredScenarioCount})` : base.description,
          };
        });
      } else {
        // Shouldn't happen because the UI disables the button, but keep it safe.
        selected = filteredScenariosForRun.slice(0, desiredScenarioCount);
      }
      const { data, error } = await supabase.functions.invoke("run-evals", {
        body: {
          scenarios: selected,
          limits: {
            max_scenarios: desiredScenarioCount,
            max_turns_per_scenario: Math.max(1, Math.min(50, maxTurns)),
            bilan_actions_count:
              scenarioTarget === "bilan" ? Math.max(1, Math.min(20, bilanActionsCount)) : 0,
            test_post_checkup_deferral: scenarioTarget === "bilan" ? Boolean(testPostCheckupDeferral) : false,
            user_difficulty: userDifficulty,
            stop_on_first_failure: stopOnFail,
            budget_usd: Math.max(0, budgetUsd),
            model: evalModel,
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <MetricCard
            title="Runs (24h)"
            value={runs24h}
            loading={metricsLoading}
            icon={Play}
            trend="active"
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
                {/* Eval Model */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <Cpu className="w-3 h-3" /> Modèle d'évaluation
                  </label>
                  <select
                    value={evalModel}
                    onChange={(e) => setEvalModel(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    {EVAL_MODELS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

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

                {/* Scenario Target */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Scénario cible
                  </label>
                  <select
                    value={scenarioTarget}
                    onChange={(e) => setScenarioTarget(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option value="(all)">Tous</option>
                    {SCENARIO_TARGETS.filter((t) => t !== "(all)").map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* User difficulty */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Difficulté user
                  </label>
                  <select
                    value={userDifficulty}
                    onChange={(e) => setUserDifficulty(e.target.value as any)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    {USER_DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup 
                    label="Nombre de tests (exact)"
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

                {scenarioTarget === "bilan" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <InputGroup
                        label="Nb actions à confirmer"
                        value={bilanActionsCount}
                        onChange={setBilanActionsCount}
                        min={1}
                        max={20}
                      />
                    </div>

                    <label className="flex items-center gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition-colors">
                      <input
                        type="checkbox"
                        checked={testPostCheckupDeferral}
                        onChange={(e) => setTestPostCheckupDeferral(e.target.checked)}
                        className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-offset-neutral-950 focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm text-neutral-300">Test spécial: post-bilan (“on en reparle après”)</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Continue après la fin du bilan pour tester la machine à état (parking lot).
                        </div>
                      </div>
                    </label>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-4">
                  <InputGroup 
                    label="Budget Limit ($)"
                    value={budgetUsd}
                    onChange={setBudgetUsd}
                    min={0} step={0.01}
                    icon={DollarSign}
                  />
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

                {pricingLoaded && pricingFlashIn + pricingFlashOut <= 0 ? (
                  <div className="text-xs text-amber-300">
                    Pricing Gemini non configuré (llm_pricing=0). Les tokens remonteront, mais le coût restera à 0.
                  </div>
                ) : null}

                <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5" />
                      Pricing · {evalModel} (USD / 1K tokens)
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Input</div>
                      <div className="w-full bg-neutral-900/50 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-400">
                        {pricingLoaded ? pricingFlashIn : "..."}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Output</div>
                      <div className="w-full bg-neutral-900/50 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-400">
                        {pricingLoaded ? pricingFlashOut : "..."}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-neutral-600 italic">
                    Valeurs définies en base de données (llm_pricing).
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800/50">
                  <div className="flex justify-between items-center text-xs text-neutral-500 mb-2">
                    <span>Templates dispo (après filtres):</span>
                    <span className="text-white font-mono bg-neutral-800 px-1.5 py-0.5 rounded">{filteredScenariosForRun.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-neutral-500 mb-4">
                    <span>Tests à exécuter:</span>
                    <span className="text-white font-mono bg-neutral-800 px-1.5 py-0.5 rounded">{desiredScenarioCount}</span>
                  </div>

                  <div className="text-xs text-neutral-500 mb-3">
                    Ce run va exécuter{" "}
                    <span className="text-neutral-200 font-mono">{desiredScenarioCount}</span>{" "}
                    test(s)
                    {!canRunExactCount && !allowRepeatsForRun && (
                      <span className="text-rose-300">
                        {" "}
                        — pas assez de scénarios avec ces filtres (seulement {filteredScenariosForRun.length})
                      </span>
                    )}
                    {willRepeatScenarios && (
                      <span className="text-amber-300">
                        {" "}
                        — seulement {filteredScenariosForRun.length} template(s) “bilan”, répétition automatique
                      </span>
                    )}
                    {stopOnFail && (
                      <span className="text-amber-300">
                        {" "}
                        — arrêt au 1er échec activé
                      </span>
                    )}
                  </div>
                  
                  <button
                    disabled={runBusy || filteredScenariosForRun.length === 0 || !canRunRequestedCount}
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
                    {!runBusy && filteredScenariosForRun.length > 0 && canRunRequestedCount && (
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
                      Mode: REAL
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
                    {"requested_scenarios" in lastRun && "selected_scenarios" in lastRun && (
                      <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950/10 text-xs text-neutral-500">
                        Requested: <span className="text-neutral-200 font-mono">{lastRun.requested_scenarios}</span>{" "}
                        · Sent: <span className="text-neutral-200 font-mono">{lastRun.selected_scenarios}</span>{" "}
                        · Ran: <span className="text-neutral-200 font-mono">{lastRun.ran}</span>
                      </div>
                    )}
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
                              <div className="mt-2">
                                <a
                                  href={`/admin/evals?run=${encodeURIComponent(String(r.eval_run_id))}`}
                                  className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  View transcript
                                  <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                                </a>
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
