import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { 
  Activity, 
  BarChart3, 
  Calendar, 
  DollarSign, 
  LayoutDashboard, 
  Loader2, 
  MessageSquare, 
  Search, 
  Users,
  Server
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import clsx from "clsx";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type UserStat = {
  user_id: string;
  full_name: string;
  email: string;
  plans_count: number;
  messages_count: number;
  total_cost_usd: number;
  total_revenue_usd: number;
};

type SourceStat = {
  source: string;
  total_cost_usd: number;
  total_tokens: number;
  call_count: number;
};

const PERIODS = [
  { label: "24 Hours", value: "24h", minutes: 24 * 60 },
  { label: "7 Days", value: "7d", minutes: 7 * 24 * 60 },
  { label: "30 Days", value: "30d", minutes: 30 * 24 * 60 },
  { label: "All Time", value: "all", minutes: 365 * 24 * 60 * 10 } // 10 years
];

export default function AdminUsageDashboard() {
  const { user, loading, isAdmin } = useAuth();
  const [stats, setStats] = useState<UserStat[]>([]);
  const [sourceStats, setSourceStats] = useState<SourceStat[]>([]);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [totalMargin, setTotalMargin] = useState<number>(0);
  const [dataLoading, setDataLoading] = useState(false);
  const [period, setPeriod] = useState<string>("7d");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      if (!user || !isAdmin) return;
      setDataLoading(true);
      try {
        const p = PERIODS.find(p => p.value === period) || PERIODS[1];
        const since = new Date(Date.now() - p.minutes * 60 * 1000).toISOString();

        // Load Global Cost
        const { data: costData, error: costError } = await supabase
          .rpc("get_global_ai_cost", { period_start: since });
        
        if (costError) console.error("Error loading cost:", costError);
        setTotalCost(Number(costData ?? 0));

        // Load Source Stats (System/Anon Functions)
        const { data: sourceData, error: sourceError } = await supabase
          .rpc("get_usage_by_source", { period_start: since });
        
        if (sourceError) console.error("Error loading source stats:", sourceError);
        setSourceStats((sourceData as any) ?? []);

        // Load User Stats
        const { data: userData, error: userError } = await supabase
          .rpc("get_admin_user_stats", { period_start: since });
        
        if (userError) console.error("Error loading user stats:", userError);

        const realStats = (userData as any) ?? [];
        setStats(realStats);
        
        const rev = realStats.reduce((acc: number, s: any) => acc + (Number(s.total_revenue_usd) || 0), 0);
        setTotalRevenue(rev);
        setTotalMargin(rev - Number(costData ?? 0));

      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, [user, isAdmin, period]);

  const filteredStats = useMemo(() => {
    if (!search) return stats;
    const lower = search.toLowerCase();
    return stats.filter(s => 
      (s.full_name?.toLowerCase() || "").includes(lower) || 
      (s.email?.toLowerCase() || "").includes(lower)
    );
  }, [stats, search]);

  const totalMessages = useMemo(() => stats.reduce((acc, s) => acc + s.messages_count, 0), [stats]);
  const totalPlans = useMemo(() => stats.reduce((acc, s) => acc + s.plans_count, 0), [stats]);

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
      {/* Header */}
      <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/admin" className="p-2 hover:bg-neutral-900 rounded-lg transition-colors text-neutral-400 hover:text-white">
              <LayoutDashboard className="w-5 h-5" />
            </a>
            <div className="h-4 w-px bg-neutral-800" />
            <h1 className="font-semibold text-white">Usage Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/admin/production-log"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <Server className="w-4 h-4" />
              Production log
            </a>
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Revenue"
            value={`$${totalRevenue.toFixed(2)}`}
            loading={dataLoading}
            icon={DollarSign}
            trend="active"
            subtext="Estimated subscriptions"
          />
           <MetricCard
            title="Total Margin"
            value={`$${totalMargin.toFixed(4)}`}
            loading={dataLoading}
            icon={Activity}
            trend={totalMargin > 0 ? "active" : "warning"}
            subtext="Revenue - AI Cost"
          />
          <MetricCard
            title="Total AI Cost"
            value={`$${totalCost.toFixed(4)}`}
            loading={dataLoading}
            icon={DollarSign}
            trend="neutral"
            subtext="Gemini API only"
          />
          <MetricCard
            title="Total Activity"
            value={totalMessages}
            loading={dataLoading}
            icon={MessageSquare}
            trend="active"
            subtext={`${totalPlans} plans generated`}
          />
        </div>

        {/* System / Public API Usage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                <h3 className="font-medium text-white">System Functions (Anonymous)</h3>
              </div>
            </div>
            <div className="p-0">
              {sourceStats.filter(s => ["sort-priorities", "recommend-transformations"].includes(s.source)).length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">No system function usage recorded.</div>
              ) : (
                <div className="divide-y divide-neutral-800">
                  {sourceStats
                    .filter(s => ["sort-priorities", "recommend-transformations"].includes(s.source))
                    .map((s) => (
                    <div key={s.source} className="flex items-center justify-between p-4 hover:bg-neutral-800/30 transition-colors">
                      <div>
                        <div className="font-medium text-neutral-200 text-sm mb-1">{s.source}</div>
                        <div className="text-xs text-neutral-500 font-mono">{s.call_count} calls · {s.total_tokens} tokens</div>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-400 font-mono text-sm">${Number(s.total_cost_usd).toFixed(4)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden">
             <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <h3 className="font-medium text-white">Top Sources Breakdown</h3>
              </div>
            </div>
            <div className="p-0">
               {sourceStats.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">No usage recorded.</div>
              ) : (
                <div className="divide-y divide-neutral-800">
                  {sourceStats.slice(0, 5).map((s) => (
                    <div key={s.source} className="flex items-center justify-between p-4 hover:bg-neutral-800/30 transition-colors">
                      <div>
                        <div className="font-medium text-neutral-200 text-sm mb-1">{s.source}</div>
                        <div className="text-xs text-neutral-500 font-mono">{s.call_count} calls</div>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-400 font-mono text-sm">${Number(s.total_cost_usd).toFixed(4)}</div>
                        <div className="text-xs text-neutral-500 font-mono">{((s.total_cost_usd / (totalCost || 1)) * 100).toFixed(1)}% of total</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* User Table */}
        <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <h3 className="font-medium text-white">User Breakdown</h3>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search user..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 focus:outline-none focus:border-indigo-500 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-950 text-neutral-400 font-medium border-b border-neutral-800">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3 text-right">Plans</th>
                  <th className="px-5 py-3 text-right">Messages</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">Cost (Est.)</th>
                  <th className="px-5 py-3 text-right">Margin</th>
                  <th className="px-5 py-3 text-right">Activity Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {dataLoading ? (
                   <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-neutral-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading data...
                    </td>
                   </tr>
                ) : filteredStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-neutral-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredStats.map((stat) => (
                    <tr key={stat.user_id} className="hover:bg-neutral-800/30 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-xs border border-indigo-500/20">
                            {stat.full_name?.charAt(0).toUpperCase() || "U"}
                          </div>
                          <div>
                            <div className="font-medium text-neutral-200">{stat.full_name || "Unknown"}</div>
                            <div className="text-xs text-neutral-500 font-mono">{stat.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-neutral-300">
                        {stat.plans_count}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-neutral-300">
                        {stat.messages_count}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-emerald-400">
                        ${Number(stat.total_revenue_usd || 0).toFixed(2)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-amber-400">
                        ${Number(stat.total_cost_usd || 0).toFixed(4)}
                      </td>
                      <td className={cn(
                        "px-5 py-4 text-right font-mono font-medium",
                        (stat.total_revenue_usd - stat.total_cost_usd) > 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        ${(stat.total_revenue_usd - stat.total_cost_usd).toFixed(4)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <ActivityBar value={stat.messages_count + stat.plans_count * 10} max={Math.max(...stats.map(s => s.messages_count + s.plans_count * 10), 10)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
          trend === "active" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
          "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
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

function ActivityBar({ value, max }: { value: number, max: number }) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden ml-auto">
      <div 
        className="h-full bg-emerald-500 rounded-full" 
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

