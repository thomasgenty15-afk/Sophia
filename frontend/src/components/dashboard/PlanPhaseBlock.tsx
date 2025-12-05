import { Check, Lock } from 'lucide-react';
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
    onMasterHabit
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
    onMasterHabit?: (action: Action) => void
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
        
        {/* Bouton Unlock Manuel de PHASE (optionnel si on veut débloquer tout le bloc) */}
        {isPhaseLocked && onUnlockPhase && (
            <button 
                onClick={onUnlockPhase}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1 transition-colors"
            >
                <Lock className="w-3 h-3" />
                Débloquer Phase
            </button>
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
                />
            );
        })}
      </div>
    </div>
  );
};

