import { X, RefreshCw, SkipForward, Trash2 } from 'lucide-react';

export const PlanSettingsModal = ({ 
  isOpen, 
  onClose, 
  onReset, 
  onSkip,
  onGlobalReset,
  currentAxisTitle 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onReset: () => void, 
  onSkip: () => void,
  onGlobalReset: () => void,
  currentAxisTitle: string
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Gestion du Plan</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-3">
          <div className="mb-4">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Axe actuel</p>
            <p className="text-sm font-medium text-slate-900">{currentAxisTitle}</p>
          </div>

          <button 
            onClick={onReset}
            data-testid="plan-settings-reset"
            className="w-full p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left group transition-all flex items-center gap-3 cursor-pointer active:scale-95"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-slate-200 text-slate-500 group-hover:text-slate-600 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm group-hover:text-slate-700">Refaire ce plan</p>
              <p className="text-xs text-slate-500">Garder l'objectif, régénérer les actions.</p>
            </div>
          </button>

          <button 
            onClick={onSkip}
            data-testid="plan-settings-skip"
            className="w-full p-3 rounded-xl border border-slate-200 hover:border-amber-200 hover:bg-amber-50 text-left group transition-all flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-amber-100 text-slate-500 group-hover:text-amber-600 flex items-center justify-center flex-shrink-0">
              <SkipForward className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm group-hover:text-amber-700">Lancer la prochaine transformation</p>
              <p className="text-xs text-slate-500">Archiver ce plan et commencer le prochain.</p>
            </div>
          </button>

          <div className="my-2 border-t border-slate-100"></div>

          <button 
            onClick={onGlobalReset}
            data-testid="plan-settings-global-reset"
            className="w-full p-3 rounded-xl border border-red-100 hover:border-red-300 hover:bg-red-50 text-left group transition-all flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-red-50 group-hover:bg-red-100 text-red-400 group-hover:text-red-600 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-red-600 text-sm group-hover:text-red-800">Réinitialiser le plan global</p>
              <p className="text-xs text-red-400">Tout effacer et reprendre à zéro.</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

