import { useState, useEffect } from 'react';
import { 
  Sword, Shield, Zap, FileText, CheckCircle2, Sparkles, 
  FastForward, PlusCircle, Check, LifeBuoy, Edit3, Lock, Settings, Trash2, PauseCircle
} from 'lucide-react';
import type { Action } from '../../types/dashboard';
import { isSameIsoWeekLocal } from '../../lib/isoWeek';

export const PlanActionCard = ({ action, isLocked, isPending, canActivate = true, onHelp, onOpenFramework, onOpenHistory, onUnlock, onToggleMission, onIncrementHabit, onMasterHabit, onOpenHabitSettings, onEdit, onDelete, onDeactivate }: { 
    action: Action, 
    isLocked: boolean, 
    isPending?: boolean, 
    canActivate?: boolean, 
    onHelp: (action: Action) => void, 
    onOpenFramework: (action: Action) => void, 
    onOpenHistory?: (action: Action) => void, 
    onUnlock?: () => void,
    onToggleMission?: (action: Action) => void,
    onIncrementHabit?: (action: Action) => void,
    onMasterHabit?: (action: Action) => void,
    onOpenHabitSettings?: (action: Action) => void,
    onEdit?: (action: Action) => void,
    onDelete?: (action: Action) => void,
    onDeactivate?: (action: Action) => void
}) => {
  const isHabit = action.type?.toLowerCase().trim() === 'habitude' || action.type?.toLowerCase().trim() === 'habit';
  const lastPerformed = action.lastPerformedAt ? new Date(action.lastPerformedAt) : null;
  const now = new Date();
  const effectiveInitialReps = isHabit && lastPerformed && !isSameIsoWeekLocal(lastPerformed, now) ? 0 : (action.currentReps || 0);

  const [currentReps, setCurrentReps] = useState(effectiveInitialReps);
  const targetReps = action.targetReps || 1;
  const progress = Math.min((currentReps / targetReps) * 100, 100); // Cap visual progress at 100%
  const [isChecked, setIsChecked] = useState(action.isCompleted);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);

  // Sync state with props when they change (e.g. after DB update)
  useEffect(() => {
      if (action.currentReps !== undefined) {
          const last = action.lastPerformedAt ? new Date(action.lastPerformedAt) : null;
          const effective = isHabit && last && !isSameIsoWeekLocal(last, new Date()) ? 0 : (action.currentReps || 0);
          setCurrentReps(effective);
      }
      setIsChecked(action.isCompleted);
  }, [action.currentReps, action.isCompleted, action.lastPerformedAt, isHabit]);

  // Couleurs et Icônes selon le Groupe
  // Groupe A (Répétable/Habitude) => Bleu/Vert
  // Groupe B (Mission/Framework) => Orange/Violet
  const normalizedType = action.type?.toLowerCase().trim();
  const isGroupA = normalizedType === 'habitude' || normalizedType === 'habit';
  const isFramework = normalizedType === 'framework';
  const isMainQuest = action.questType === 'main';
  const timeLabelMap: Record<string, string> = {
    morning: 'Matin',
    afternoon: 'Apres-midi',
    evening: 'Soir',
    night: 'Nuit',
    any_time: 'Flexible',
  };

  // Si l'action est pending (verrouillée individuellement), elle est considérée comme locked visuellement
  const isVisuallyLocked = isLocked || isPending;

  const handleIncrement = () => {
    if (isVisuallyLocked) return;
    if (currentReps < targetReps) {
        setCurrentReps(prev => prev + 1);
        if (onIncrementHabit) onIncrementHabit(action);
    }
  };

  const handleToggleCheck = () => {
    if (isVisuallyLocked) return;
    setIsChecked(!isChecked);
    if (onToggleMission) onToggleMission(action);
  };

  return (
    <div className={`relative bg-white border rounded-xl p-3 min-[260px]:p-4 shadow-sm transition-all duration-300 group ${isVisuallyLocked ? 'opacity-80 grayscale border-gray-100 bg-gray-50/50' :
        isMainQuest ? 'border-blue-200 shadow-md ring-1 ring-blue-100' : 'hover:shadow-md border-gray-200'
      }`}>

      {/* OVERLAY D'ACTIVATION SI PENDING */}
      {isPending && !isLocked && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 backdrop-blur-[1px] rounded-xl">
            {canActivate ? (
                <button 
                    onClick={onUnlock}
                    className="bg-white text-indigo-600 px-6 py-2 rounded-xl font-bold shadow-lg border border-indigo-100 hover:scale-105 hover:bg-indigo-50 transition-all flex flex-col items-center gap-1"
                >
                    <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        <span>ACTIVER</span>
                    </div>
                    <span className="text-[9px] min-[350px]:text-[10px] font-normal opacity-80 text-indigo-500 whitespace-nowrap">
                        (Recommandé : terminer la phase précédente)
                    </span>
                </button>
            ) : (
                <div className="bg-gray-100 text-gray-400 px-4 py-2 rounded-full font-bold text-xs shadow-sm border border-gray-200 flex items-center gap-2 cursor-not-allowed">
                    <Lock className="w-3 h-3" />
                    Verrouillé (Activer phase précédente)
                </div>
            )}
        </div>
      )}

      {/* Badge Quest Type */}
      <div className={`absolute -top-3 left-1/2 -translate-x-1/2 min-[350px]:left-4 min-[350px]:translate-x-0 px-1.5 min-[330px]:px-2 py-0.5 rounded-full text-[10px] min-[330px]:text-xs font-bold uppercase tracking-wider border shadow-sm flex items-center justify-center gap-1 whitespace-nowrap ${isVisuallyLocked ? 'bg-gray-100 text-gray-400 border-gray-200' :
          isMainQuest ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
        }`}>
        {isMainQuest ? <><Sword className="w-2.5 h-2.5 min-[330px]:w-3 min-[330px]:h-3" /> Quête Principale</> : <><Shield className="w-2.5 h-2.5 min-[330px]:w-3 min-[330px]:h-3" /> Quête Secondaire</>}
      </div>

      <div className="flex items-start gap-4 mt-2">
        {/* Icône Type */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 hidden min-[350px]:flex ${isVisuallyLocked ? 'bg-gray-100 text-gray-400' :
            isGroupA ? 'bg-emerald-100 text-emerald-600' :
              isFramework ? 'bg-violet-100 text-violet-600' : 'bg-amber-100 text-amber-600'
          }`}>
          {isGroupA ? <Zap className="w-5 h-5" /> :
            isFramework ? <FileText className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>

        <div className="flex-1 pr-0 min-[350px]:pr-6 min-w-0">
          {/* En-tête */}
          <div className="flex flex-wrap items-center gap-2 mb-1 pr-8 min-[350px]:pr-0 mt-4 min-[350px]:mt-0">
            <span className={`text-[10px] min-[330px]:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${isVisuallyLocked ? 'bg-gray-100 text-gray-400' :
                isGroupA ? 'bg-emerald-50 text-emerald-600' :
                  isFramework ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'
              }`}>
              {action.type}
            </span>
            <h3 className={`font-bold text-sm min-[350px]:text-base md:text-lg leading-tight ${isVisuallyLocked ? 'text-gray-400' : 'text-gray-900'}`}>{action.title}</h3>
          </div>

          <p className="text-xs min-[350px]:text-sm text-gray-500 mb-3 leading-snug min-h-[32px] break-words">{action.description}</p>

          {isGroupA && (
            <div className="mb-3 flex items-center gap-2 text-[10px] min-[330px]:text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                {timeLabelMap[String(action.timeOfDay || 'any_time')] || 'Flexible'}
              </span>
              {Array.isArray(action.scheduledDays) && action.scheduledDays.length > 0 && (
                <span className="text-slate-500 font-medium">
                  {action.scheduledDays.join(', ').toUpperCase()}
                </span>
              )}
            </div>
          )}

          {/* EXPLICATION STRATEGIQUE (RATIONALE) SI PRESENTE */}
          {action.rationale && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 min-[330px]:p-3 mb-3 text-[10px] min-[330px]:text-xs min-[350px]:text-sm text-amber-900 relative">
              <div className="absolute -top-2 -left-2 bg-amber-100 rounded-full p-1">
                <Sparkles className="w-2.5 h-2.5 min-[330px]:w-3 min-[330px]:h-3 text-amber-600" />
              </div>
              <span className="font-bold text-amber-700 block mb-0.5 uppercase text-[9px] min-[330px]:text-[10px] min-[350px]:text-xs tracking-wide">Pourquoi ça t'aide :</span>
              {action.rationale}
            </div>
          )}

          {/* LOGIQUE D'INTERACTION */}
          {!isVisuallyLocked && (
            <div className="mt-2">
              {isGroupA || isFramework ? (
                /* --- PROGRESS BAR (Habitudes & Tous les Frameworks) --- */
                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                  <div className="flex flex-col items-start gap-1 min-[260px]:flex-row min-[260px]:items-center min-[260px]:justify-between mb-1.5">
                    <span className="text-[10px] min-[330px]:text-xs font-bold text-gray-400 uppercase">
                      {isGroupA ? "Cette semaine" : "Progression"}
                    </span>
                    <span className="text-[10px] min-[330px]:text-xs font-bold text-emerald-600">
                      {isGroupA ? `${currentReps}/${targetReps} (×/semaine)` : `${currentReps}/${targetReps}`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex flex-col min-[260px]:flex-row gap-2">
                    {isFramework ? (
                        /* Boutons Framework */
                        <div className="flex gap-2 w-full">
                            <button 
                                onClick={() => onOpenFramework(action)}
                                className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded text-[10px] min-[330px]:text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                            >
                                <Edit3 className="w-3 h-3" />
                                {(action as any).frameworkDetails?.type === 'one_shot' ? "Remplir (Unique)" : "Remplir"}
                            </button>
                            {onOpenHistory && (
                                <button 
                                onClick={() => onOpenHistory(action)}
                                className="hidden min-[250px]:flex px-3 py-1.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded transition-colors border border-violet-200 items-center justify-center"
                                title="Voir l'historique"
                                >
                                <FileText className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ) : (
                        /* Boutons Habitude */
                        <>
                            <button
                            onClick={() => onOpenHabitSettings && onOpenHabitSettings(action)}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[10px] min-[330px]:text-xs font-bold flex items-center justify-center gap-1 transition-colors border border-emerald-200"
                            title="Réglages (jours / fréquence)"
                            >
                            <Settings className="w-3 h-3" />
                            </button>
                            <button
                            onClick={handleIncrement}
                            disabled={currentReps >= targetReps}
                            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded text-[10px] min-[330px]:text-xs font-bold flex items-center justify-center gap-2 transition-colors text-center"
                            >
                            <PlusCircle className="hidden min-[386px]:block w-3.5 h-3.5 flex-shrink-0" /> 
                            <span>Valider pour aujourd'hui</span>
                            </button>
                        </>
                    )}
                  </div>
                </div>
              ) : (
                /* --- GROUPE B : MISSION (CHECKBOX) --- */
                <div
                  onClick={handleToggleCheck}
                  className={`cursor-pointer flex items-center justify-between p-2 rounded-lg border transition-all ${isChecked ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200 hover:border-amber-200'
                    }`}
                >
                  <span className={`text-xs min-[350px]:text-sm font-bold ${isChecked ? 'text-amber-700' : 'text-gray-500'}`}>
                    {isChecked ? "Mission accomplie" : "Marquer comme fait"}
                  </span>
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-300'
                    }`}>
                    {isChecked && <Check className="w-3 h-3" />}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Help / Settings Menu (Repositionné pour Mobile) */}
      {!isLocked && !action.isCompleted && !isChecked && (
        <div className="flex justify-center mt-2 min-[350px]:absolute min-[350px]:top-3 min-[350px]:right-3 min-[350px]:mt-0 z-30">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-slate-300 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all"
            title="Options"
          >
            <Settings className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <>
                <div className="fixed inset-0 z-30" onClick={() => setIsMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-100 p-1 z-40 min-w-[160px] animate-in fade-in zoom-in-95 duration-200">
                    <button
                        onClick={() => {
                            onHelp(action);
                            setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 text-slate-600 hover:text-amber-600 text-xs font-bold flex items-center gap-2 transition-colors"
                    >
                        <LifeBuoy className="w-3.5 h-3.5" />
                        SOS Blocage
                    </button>
                    
                    {onEdit && !isFramework && (
                        <button
                            onClick={() => {
                                onEdit(action);
                                setIsMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-xs font-bold flex items-center gap-2 transition-colors"
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            Modifier l'action
                        </button>
                    )}
                    
                    {onDeactivate && (
                        <button
                            onClick={() => {
                                setIsDeactivateConfirmOpen(true);
                                setIsMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 text-slate-600 hover:text-amber-600 text-xs font-bold flex items-center gap-2 transition-colors"
                        >
                            <PauseCircle className="w-3.5 h-3.5" />
                            Mettre en pause
                        </button>
                    )}

                    {onDelete && (
                        <button
                            onClick={() => {
                                setIsDeleteConfirmOpen(true);
                                setIsMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-bold flex items-center gap-2 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Supprimer l'action
                        </button>
                    )}
                </div>
            </>
          )}
        </div>
      )}

      {/* MODAL DE CONFIRMATION DÉSACTIVATION */}
      {isDeactivateConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Mettre en pause cette action ?</h3>
                <p className="text-sm text-slate-500 mb-6">
                    L'action sera désactivée temporairement. Tu pourras la réactiver quand tu voudras.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsDeactivateConfirmOpen(false)}
                        className="flex-1 py-2.5 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={() => {
                            if (onDeactivate) onDeactivate(action);
                            setIsDeactivateConfirmOpen(false);
                        }}
                        className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200 transition-colors"
                    >
                        Mettre en pause
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL DE CONFIRMATION SUPPRESSION */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Supprimer cette action ?</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Cette action sera retirée de votre plan. Cette opération est irréversible.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        className="flex-1 py-2.5 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={() => {
                            if (onDelete) onDelete(action);
                            setIsDeleteConfirmOpen(false);
                        }}
                        className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                    >
                        Supprimer
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

