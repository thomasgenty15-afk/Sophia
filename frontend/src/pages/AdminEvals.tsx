import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { 
  Activity, 
  AlertCircle, 
  BarChart3,
  ArrowRight, 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  FileText, 
  LayoutDashboard, 
  Loader2, 
  MessageSquare, 
  Search,
  XCircle
} from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type EvalRunRow = {
  id: string;
  created_at: string;
  dataset_key: string;
  scenario_key: string;
  status: string;
  issues: any[];
  suggestions: any[];
  transcript?: any[];
  error?: string | null;
};

type SuggestionRow = {
  id: string;
  created_at: string;
  prompt_key: string;
  action: "append" | "replace";
  proposed_addendum: string;
  rationale?: string | null;
  status: "pending" | "approved" | "rejected";
  eval_run_id?: string | null;
};

export default function AdminEvals() {
  const { user, loading, isAdmin } = useAuth();
  const [runs, setRuns] = useState<EvalRunRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) ?? null, [runs, selectedRunId]);

  useEffect(() => {
    async function load() {
      if (!user || !isAdmin) return;
      const { data: runRows, error: runErr } = await supabase
        .from("conversation_eval_runs")
        .select("id,created_at,dataset_key,scenario_key,status,issues,suggestions,transcript,error")
        .order("created_at", { ascending: false })
        .limit(50);
      if (runErr) {
        console.error(runErr);
      } else {
        setRuns((runRows as any) ?? []);
        setSelectedRunId((prev) => prev ?? (runRows as any)?.[0]?.id ?? null);
      }

      const { data: sugRows, error: sugErr } = await supabase
        .from("prompt_override_suggestions")
        .select("id,created_at,prompt_key,action,proposed_addendum,rationale,status,eval_run_id")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      if (sugErr) {
        console.error(sugErr);
      } else {
        setPendingSuggestions((sugRows as any) ?? []);
      }
    }
    load();
  }, [user, isAdmin]);

  async function applySuggestion(id: string) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("apply-prompt-override-suggestion", {
        body: { suggestion_id: id },
      });
      if (error) throw error;
      
      // Refresh suggestions list
      await refreshSuggestions();
    } finally {
      setBusy(false);
    }
  }

  async function rejectSuggestion(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("prompt_override_suggestions")
        .update({ 
          status: "rejected",
          // applied_by/approved_by are null, maybe add rejected_by if schema supported it, but it doesn't seem to explicitly.
          // Wait, the schema has approved_by and applied_by. It doesn't have rejected_by but RLS allows updating row.
          // Let's just update status for now.
        })
        .eq("id", id);

      if (error) throw error;
      
      // Refresh suggestions list
      await refreshSuggestions();
    } finally {
      setBusy(false);
    }
  }

  async function refreshSuggestions() {
    const { data: sugRows } = await supabase
      .from("prompt_override_suggestions")
      .select("id,created_at,prompt_key,action,proposed_addendum,rationale,status,eval_run_id")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    setPendingSuggestions((sugRows as any) ?? []);
  }

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user || isAdmin === false) {
    // Reuse the same access denied / login screen style if needed, 
    // but for now redirecting or showing simple message is fine as this is a sub-page
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-neutral-400">
        Access Denied
      </div>
    );
  }

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 h-16 bg-neutral-950/80 backdrop-blur border-b border-neutral-800 z-10">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/admin" className="p-2 hover:bg-neutral-900 rounded-lg transition-colors text-neutral-400 hover:text-white">
              <LayoutDashboard className="w-5 h-5" />
            </a>
            <div className="h-4 w-px bg-neutral-800" />
            <h1 className="font-semibold text-white">Conversation Evals</h1>
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
              <Activity className="w-4 h-4" />
              Production log
            </a>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span>Runs: {runs.length}</span>
            <span>Pending Suggestions: {pendingSuggestions.length}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
          
          {/* Left Column: List */}
          <div className="lg:col-span-4 flex flex-col h-full min-h-0">
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl flex flex-col overflow-hidden h-full">
              <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 shrink-0">
                <h2 className="font-medium text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Recent Runs
                </h2>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all duration-200 group relative overflow-hidden",
                      selectedRunId === r.id 
                        ? "bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]" 
                        : "bg-transparent border-transparent hover:bg-neutral-800/50 hover:border-neutral-800"
                    )}
                  >
                    {selectedRunId === r.id && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-lg" />
                    )}
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm text-neutral-200 truncate pr-2">
                        {r.scenario_key}
                      </span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold",
                        r.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-800 text-neutral-400"
                      )}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
                      <Clock className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {(r.issues ?? []).length > 0 && (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {r.issues.length}
                        </span>
                      )}
                      {(r.suggestions ?? []).length > 0 && (
                        <span className="text-blue-400 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {r.suggestions.length}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Center/Right Column: Details & Suggestions */}
          <div className="lg:col-span-8 flex flex-col gap-6 h-full overflow-y-auto pr-1 pb-10 custom-scrollbar">
            
            {/* Run Details */}
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden min-h-[300px] shrink-0">
              <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
                <h2 className="font-medium text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-neutral-400" />
                  Run Details
                </h2>
                {selectedRun && (
                  <span className="text-xs font-mono text-neutral-500">{selectedRun.id}</span>
                )}
              </div>
              
              {!selectedRun ? (
                <div className="p-10 flex flex-col items-center justify-center text-neutral-500">
                  <Search className="w-8 h-8 mb-3 opacity-20" />
                  <p>Select a run to view details</p>
                </div>
              ) : (
                <div className="p-6">
                  {selectedRun.error && (
                    <div className="mb-6 p-4 rounded-lg bg-red-950/20 border border-red-900/50 flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-red-400 font-medium text-sm">Execution Error</h4>
                        <p className="text-red-400/80 text-sm mt-1">{selectedRun.error}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-8">
                    {/* Issues Section */}
                    <div>
                      <h3 className="text-sm font-medium text-neutral-300 mb-4 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        Issues Found
                        <span className="ml-auto text-xs text-neutral-500">{(selectedRun.issues ?? []).length} items</span>
                      </h3>
                      
                      {(selectedRun.issues ?? []).length === 0 ? (
                        <div className="p-4 rounded-lg border border-neutral-800/50 bg-neutral-900/20 text-sm text-neutral-500 italic">
                          No issues detected.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(selectedRun.issues ?? []).slice(0, 30).map((i: any, idx: number) => (
                            <div key={idx} className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full mt-2 shrink-0",
                                  i.severity === "critical" ? "bg-red-500" : "bg-amber-500"
                                )} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-neutral-200">{i.code ?? "Issue"}</span>
                                    {i.severity && (
                                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800">
                                        {i.severity}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-neutral-400 leading-relaxed">{i.message}</p>
                                  {i.evidence?.snippet && (
                                    <div className="mt-3 bg-black/30 rounded border border-neutral-800/50 p-3 overflow-x-auto">
                                      <pre className="text-xs text-neutral-500 font-mono">{i.evidence.snippet}</pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Suggestions Section */}
                    <div>
                      <h3 className="text-sm font-medium text-neutral-300 mb-4 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-blue-400" />
                        Generated Suggestions
                        <span className="ml-auto text-xs text-neutral-500">{(selectedRun.suggestions ?? []).length} items</span>
                      </h3>

                      {(selectedRun.suggestions ?? []).length === 0 ? (
                        <div className="p-4 rounded-lg border border-neutral-800/50 bg-neutral-900/20 text-sm text-neutral-500 italic">
                          No suggestions available.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {(selectedRun.suggestions ?? []).slice(0, 20).map((s: any, idx: number) => (
                            <SuggestionCard key={idx} suggestion={s} readOnly />
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>

            {/* Pending Suggestions Queue */}
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden shrink-0">
              <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
                <h2 className="font-medium text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Approval Queue
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20">
                  {pendingSuggestions.length} Pending
                </span>
              </div>
              
              {pendingSuggestions.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">
                  All caught up! No suggestions waiting for approval.
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {pendingSuggestions.map((s) => (
                    <SuggestionCard 
                      key={s.id} 
                      suggestion={s} 
                      onApply={() => applySuggestion(s.id)}
                      onReject={() => rejectSuggestion(s.id)}
                      busy={busy}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Run Transcript (Standalone) */}
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden shrink-0">
              <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
                <h2 className="font-medium text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-neutral-400" />
                  Conversation Transcript
                </h2>
              </div>
              
              {!selectedRun ? (
                <div className="p-8 text-center text-sm text-neutral-500">
                  Select a run to view the conversation.
                </div>
              ) : (
                <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {(!selectedRun.transcript || selectedRun.transcript.length === 0) ? (
                     <div className="text-sm text-neutral-500 italic">No transcript available.</div>
                  ) : (
                    selectedRun.transcript.map((msg: any, i: number) => (
                      <div key={i} className={cn(
                        "flex gap-3",
                        msg.role === "user" ? "flex-row-reverse" : "flex-row"
                      )}>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                          msg.role === "user" ? "bg-neutral-800 text-neutral-300" : "bg-indigo-900/50 text-indigo-300 border border-indigo-800/50"
                        )}>
                          {msg.role === "user" ? "U" : "S"}
                        </div>
                        <div className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                          msg.role === "user" 
                            ? "bg-neutral-800 text-neutral-200 rounded-tr-sm" 
                            : "bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-tl-sm"
                        )}>
                          <div className="whitespace-pre-wrap break-words">{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}</div>
                          {msg.tool_calls && (
                            <div className="mt-2 text-xs font-mono text-neutral-500 bg-black/20 p-2 rounded border border-neutral-800/50">
                              {JSON.stringify(msg.tool_calls)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SuggestionCard({ suggestion, onApply, onReject, busy, readOnly }: any) {
  return (
    <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 group hover:border-neutral-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/30 text-indigo-300 border border-indigo-800/50 font-mono">
              {suggestion.prompt_key}
            </span>
            <span className={cn(
              "text-xs font-medium uppercase tracking-wider",
              suggestion.action === "replace" ? "text-amber-500" : "text-emerald-500"
            )}>
              {suggestion.action}
            </span>
            {!readOnly && (
              <span className="text-xs text-neutral-600">
                Run: {suggestion.eval_run_id?.slice(0, 8) ?? "—"}
              </span>
            )}
          </div>
          
          <div className="bg-neutral-900 rounded border border-neutral-800 p-3 mb-3">
            <pre className="text-xs text-neutral-300 font-mono whitespace-pre-wrap break-words">
              {suggestion.proposed_addendum}
            </pre>
          </div>
          
          {suggestion.rationale && (
            <p className="text-sm text-neutral-500 italic border-l-2 border-neutral-800 pl-3 break-words">
              "{suggestion.rationale}"
            </p>
          )}
        </div>

        {!readOnly && onApply && onReject && (
          <div className="flex flex-col gap-2 shrink-0">
            <button
              disabled={busy}
              onClick={onApply}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-24"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Valider
            </button>
            <button
              disabled={busy}
              onClick={onReject}
              className="px-4 py-2 bg-neutral-800 hover:bg-red-900/50 hover:text-red-200 text-neutral-400 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-24 border border-neutral-700 hover:border-red-900"
            >
              <XCircle className="w-3.5 h-3.5" />
              Refuser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
