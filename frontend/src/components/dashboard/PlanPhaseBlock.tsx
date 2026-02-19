import { Check, Lock, Plus } from 'lucide-react';
import type { PlanPhase, Action } from '../../types/dashboard';
import { PlanActionCard } from './PlanActionCard';

export const PlanPhaseBlock = ({ 
    phase, 
    isLast, 
    canActivateActions = true, 
    onHelpAction, 
    onOpenFramework, 
    onOpenHistory, 
    onUnlockPhase, 
    onUnlockAction,
    onToggleMission,
    onIncrementHabit,
    onMasterHabit,
    onOpenHabitSettings,
    onCreateAction,
    onEditAction,
    onDeleteAction,
    onDeactivateAction
}: { 
    phase: PlanPhase, 
    isLast: boolean, 
    canActivateActions?: boolean, 
    onHelpAction: (action: Action) => void, 
    onOpenFramework: (action: Action) => void, 
    onOpenHistory?: (action: Action) => void, 
    onUnlockPhase?: () => void, 
    onUnlockAction?: (action: Action) => void,
    onToggleMission?: (action: Action) => void,
    onIncrementHabit?: (action: Action) => void,
    onMasterHabit?: (action: Action) => void,
    onOpenHabitSettings?: (action: Action) => void,
    onCreateAction?: () => void,
    onEditAction?: (action: Action) => void,
    onDeleteAction?: (action: Action) => void,
    onDeactivateAction?: (action: Action) => void
}) => {
  const isPhaseLocked = phase.status === 'locked'; // Le verrouillage de phase global
  const isActive = phase.status === 'active';

  return (
    <div className="relative pl-0 md:pl-8 pb-10 last:pb-0">
      {/* Ligne Verticale */}
      {!isLast && (
        <div className={`hidden md:block absolute left-[11px] top-8 bottom-0 w-0.5 ${isActive ? 'bg-emerald-200' : 'bg-gray-100'
          }`} />
      )}

      {/* Puce Timeline */}
      <div className={`hidden md:flex absolute left-0 top-1 w-6 h-6 rounded-full border-4 items-center justify-center z-10 ${phase.status === 'completed' ? 'bg-emerald-500 border-emerald-100' :
          isActive ? 'bg-white border-emerald-500 shadow-md scale-110' :
            'bg-gray-100 border-gray-50'
        }`}>
        {phase.status === 'completed' && <Check className="w-3 h-3 text-white" />}
        {isActive && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />}
        {isPhaseLocked && <Lock className="w-3 h-3 text-gray-400" />}
      </div>

      {/* En-tête Phase */}
      <div className="mb-6 mt-1 flex items-start justify-between">
        <div>
            <h3 className={`text-sm min-[350px]:text-base font-bold uppercase tracking-wide ${isActive ? 'text-emerald-700' : isPhaseLocked ? 'text-gray-400' : 'text-emerald-900'
            }`}>
            {phase.title}
            </h3>
            <p className="text-xs min-[350px]:text-sm text-gray-400">{phase.subtitle}</p>
        </div>
        
        {/* Bouton Unlock Manuel de PHASE */}
        {isPhaseLocked && onUnlockPhase && (
            <button 
                onClick={onUnlockPhase}
                className="group relative px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                <Lock className="w-3.5 h-3.5 group-hover:hidden transition-all" />
                <svg className="w-3.5 h-3.5 hidden group-hover:block transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <span className="relative z-10">débloquer</span>
            </button>
        )}
        
        {/* Badge indiquant que la phase est verrouillée car phases précédentes non complètes */}
        {isPhaseLocked && !onUnlockPhase && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-400 text-[10px] font-medium rounded-lg">
                <Lock className="w-3 h-3" />
                <span>Activer les phases précédentes</span>
            </div>
        )}
      </div>

      {/* Liste Verticale Actions */}
      <div className={`space-y-6 transition-all duration-500 ${isPhaseLocked ? 'opacity-50 grayscale blur-[1px] pointer-events-none' : ''}`}>
        {phase.actions.map(action => {
            // L'action est verrouillée si son statut est 'pending' OU si la phase est verrouillée
            // Mais ici on gère le 'pending' au niveau de la carte pour afficher le bouton 'Activer'
            // Si la PHASE est verrouillée, tout est désactivé (pointer-events-none au dessus)
            
            return (
                <PlanActionCard
                    key={action.id}
                    action={action}
                    isLocked={isPhaseLocked} // Verrouillage visuel global
                    isPending={action.status === 'pending'} // Verrouillage spécifique action
                    canActivate={canActivateActions} // NOUVEAU: Autorisation d'activation
                    onHelp={onHelpAction}
                    onOpenFramework={onOpenFramework}
                    onOpenHistory={onOpenHistory}
                    onUnlock={() => onUnlockAction && onUnlockAction(action)}
                    onToggleMission={onToggleMission}
                    onIncrementHabit={onIncrementHabit}
                    onMasterHabit={onMasterHabit}
                    onOpenHabitSettings={onOpenHabitSettings}
                    onEdit={onEditAction}
                    onDelete={onDeleteAction}
                    onDeactivate={onDeactivateAction}
                />
            );
        })}

        {/* Bouton Créer Action */}
        {onCreateAction && !isPhaseLocked && (
            <button
                onClick={onCreateAction}
                className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-400 hover:text-indigo-600 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all group"
            >
                <div className="p-1 rounded-full bg-slate-100 group-hover:bg-indigo-100 transition-colors">
                    <Plus className="w-3 h-3" />
                </div>
                Ajouter une action
            </button>
        )}
      </div>
    </div>
  );
};

