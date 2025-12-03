import { BarChart3, MessageCircle, TrendingUp } from 'lucide-react';
import type { GeneratedPlan } from '../../types/dashboard';

export const MetricCard = ({ plan }: { plan: GeneratedPlan | null }) => {
  if (!plan) return null; // Protection si le plan n'est pas encore chargé

  // On cherche l'action de type "constat" (Signe Vital) dans le plan
  // L'IA est supposée renvoyer un champ "vitalSignal" à la racine, sinon on cherche dans les actions ou on fallback
  let vitalSignal = (plan as any).vitalSignal;
  
  if (!vitalSignal) {
    // Fallback intelligent : on cherche la première habitude traçable
    const firstHabit = plan.phases
        .flatMap(p => p.actions)
        .find(a => a.type === 'habitude' && a.targetReps);
    
    if (firstHabit) {
        vitalSignal = {
            title: `Suivi : ${firstHabit.title}`,
            unit: "répétitions",
            startValue: 0,
            targetValue: firstHabit.targetReps
        };
    } else {
        // Fallback ultime
        vitalSignal = {
            title: "Score de Régularité",
            unit: "points",
            startValue: 0,
            targetValue: 100
        };
    }
  }

  // Correction : Le JSON de l'IA renvoie souvent "name" au lieu de "title" pour le vitalSignal
  const metricName = vitalSignal.name || vitalSignal.title || "Métrique clé";
  const unit = vitalSignal.unit || "unités";
  
  // Valeurs Mockées pour l'instant (à connecter plus tard à une table de tracking)
  const currentValue = vitalSignal.startValue || 0; 
  const startValue = vitalSignal.startValue || 0;
  const lastUpdate = "En attente de relevé";

  // Calcul simple de tendance (si start != current)
  const progress = startValue - currentValue;
  // const isPositive = progress > 0; // Unused for now

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-8 relative overflow-hidden">
      {/* Filigrane de fond */}
      <div className="absolute -right-6 -top-6 text-slate-50 opacity-50">
        <BarChart3 className="w-32 h-32" />
      </div>

      <div className="relative z-10 flex flex-col min-[400px]:flex-row items-start justify-between gap-4 min-[400px]:gap-0">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs min-[350px]:text-sm font-bold text-slate-400 uppercase tracking-wider">Signal Vital Suivi</h3>
          </div>
          <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 mb-1">{metricName}</h2>
          <p className="text-xs min-[350px]:text-sm text-slate-500 flex items-center gap-1">
            <MessageCircle className="w-3 h-3" />
            {lastUpdate}
          </p>
        </div>

        <div className="text-center self-end min-[400px]:self-auto w-full min-[400px]:w-auto mt-2 min-[400px]:mt-0 min-[400px]:text-right">
          <div className="text-xl min-[350px]:text-3xl font-bold text-slate-900 leading-none flex flex-col items-center min-[350px]:flex-row min-[350px]:items-baseline min-[400px]:justify-end">
            {currentValue}
            <span className="block min-[350px]:inline text-xs min-[350px]:text-sm font-medium text-slate-400 mt-1 min-[350px]:ml-1">
              {unit}
            </span>
          </div>
        </div>
      </div>

      {/* Zone de Tendance (Universelle) */}
      <div className="mt-6 relative z-10">
        <div className="flex items-center justify-between text-xs min-[350px]:text-sm font-bold mb-2">
          <span className="text-slate-400">Point de départ : {startValue}</span>
          <span className="text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            En attente de données
          </span>
        </div>

        {/* Jauge de Tendance Simplifiée (Grisée pour l'instant) */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-slate-300 opacity-50"
            style={{ width: `5%` }}
          />
        </div>
      </div>
    </div>
  );
};

