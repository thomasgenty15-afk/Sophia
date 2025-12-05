import { useState } from 'react';
import { BarChart3, MessageCircle, TrendingUp, Edit2, CheckCircle2 } from 'lucide-react';
import type { GeneratedPlan, VitalSignal } from '../../types/dashboard';
import { VitalSignModal } from './VitalSignModal';

export const MetricCard = ({ plan, vitalSignData, onUpdateVitalSign }: { 
    plan: GeneratedPlan | null, 
    vitalSignData: VitalSignal | null,
    onUpdateVitalSign: (value: string) => Promise<void>
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!plan) return null; 

  // 1. Déterminer le Vital Signal (Priorité : DB > Plan JSON > Fallback)
  let activeVitalSignal: VitalSignal;

  if (vitalSignData) {
      activeVitalSignal = vitalSignData;
  } else {
      // Fallback JSON du plan
      const jsonSignal = (plan as any).vitalSignal;
      if (jsonSignal) {
          activeVitalSignal = {
              title: jsonSignal.title || jsonSignal.name || "Métrique clé",
              unit: jsonSignal.unit || "unités",
              startValue: jsonSignal.startValue || 0,
              targetValue: jsonSignal.targetValue || 0,
              currentValue: jsonSignal.startValue // Par défaut si rien en base
          };
      } else {
          // Fallback Ultime
          activeVitalSignal = {
              title: "Suivi de progression",
              unit: "points",
              startValue: 0,
              targetValue: 100,
              currentValue: 0
          };
      }
  }

  const metricName = activeVitalSignal.title;
  const unit = activeVitalSignal.unit;
  const currentValue = activeVitalSignal.currentValue ?? activeVitalSignal.startValue;
  const startValue = activeVitalSignal.startValue;
  const targetValue = activeVitalSignal.targetValue;

  // Check if already updated today
  const isAlreadyUpdatedToday = activeVitalSignal.last_checked_at && new Date(activeVitalSignal.last_checked_at).toDateString() === new Date().toDateString();

  // Formatage de la date (Mock ou réelle si dispo dans vitalSignData)
  const lastUpdate = activeVitalSignal.last_checked_at 
    ? `Dernier relevé : ${new Date(activeVitalSignal.last_checked_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
    : "Pas encore relevé";

  return (
    <>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-8 relative overflow-hidden group">
        {/* Filigrane de fond */}
        <div className="absolute -right-6 -top-6 text-slate-50 opacity-50 group-hover:scale-110 transition-transform duration-700">
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

            <div className="text-center self-end min-[400px]:self-auto w-full min-[400px]:w-auto mt-2 min-[400px]:mt-0 min-[400px]:text-right flex flex-col items-center min-[400px]:items-end gap-2">
                <div className="text-xl min-[350px]:text-3xl font-bold text-slate-900 leading-none flex flex-col items-center min-[350px]:flex-row min-[350px]:items-baseline min-[400px]:justify-end">
                    {currentValue}
                    <span className="block min-[350px]:inline text-xs min-[350px]:text-sm font-medium text-slate-400 mt-1 min-[350px]:ml-1">
                    {unit}
                    </span>
                </div>
                
                {isAlreadyUpdatedToday ? (
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full opacity-80 cursor-default">
                        <CheckCircle2 className="w-3 h-3" />
                        Fait aujourd'hui
                    </div>
                ) : (
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                    >
                        <Edit2 className="w-3 h-3" />
                        Mettre à jour
                    </button>
                )}
            </div>
        </div>

        {/* Zone de Tendance (Universelle) */}
        <div className="mt-6 relative z-10">
            <div className="flex items-center justify-between text-xs min-[350px]:text-sm font-bold mb-2">
            <span className="text-slate-400">Départ : {startValue}</span>
            <span className="text-emerald-600 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Cible : {targetValue}
            </span>
            </div>

            {/* Jauge de Tendance Simplifiée */}
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex relative">
                {/* Calcul simpliste de la jauge pour l'instant */}
                <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000"
                    style={{ width: '50%' }} // À dynamiser : (current - start) / (target - start) * 100
                />
            </div>
        </div>
        </div>

        <VitalSignModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={onUpdateVitalSign}
            vitalSign={{
                label: metricName,
                currentValue: String(currentValue),
                targetValue: String(targetValue),
                unit: unit
            }}
        />
    </>
  );
};

