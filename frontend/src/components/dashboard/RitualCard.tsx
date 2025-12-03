import { Sparkles, CheckCircle2, Target, Lock, Play } from 'lucide-react';
import { Action } from '../../types/dashboard';

export const RitualCard = ({ action }: { action: any }) => {
  // Casting action to any because of custom fields used here not present in strict Action interface yet
  const isLimitReached = action.subType === 'hypnose_daily' && (action.current_trial_day || 0) >= (action.free_trial_days || 5);
  const isUpsell = action.subType === 'hypnose_perso';

  if (isUpsell) {
    return (
      <div className="bg-gradient-to-r from-indigo-900 to-violet-900 border border-indigo-800 rounded-xl p-4 mb-4 shadow-md relative overflow-hidden group cursor-pointer hover:scale-[1.01] transition-transform">
        <div className="absolute top-0 right-0 -mt-2 -mr-2 w-20 h-20 bg-white opacity-5 blur-2xl rounded-full pointer-events-none"></div>
        <div className="flex flex-col min-[400px]:flex-row items-start justify-between relative z-10 gap-3 min-[400px]:gap-0">
          <div className="flex flex-col min-[350px]:flex-row items-start min-[350px]:items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-amber-400 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm min-[350px]:text-base leading-tight text-indigo-200">{action.title}</h3>
              <p className="text-indigo-200 text-xs min-[350px]:text-sm mt-1 max-w-[200px]">{action.description}</p>
            </div>
          </div>
          <div className="flex flex-col items-end self-end min-[400px]:self-auto">
            <span className="bg-amber-400 text-amber-950 text-xs font-bold px-2 py-0.5 rounded-full mb-1 shadow-sm">
              +50% de réussite
            </span>
            <span className="text-white font-bold text-lg">{action.price}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 flex items-center justify-between shadow-sm min-h-[80px]">
      <div className="flex flex-col min-[350px]:flex-row items-start min-[350px]:items-center gap-3 w-full">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${action.subType === 'hypnose_daily' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
          {action.subType === 'hypnose_daily' ? <CheckCircle2 className="w-5 h-5" /> : <Target className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1 pr-0 min-[350px]:pr-2 w-full">
          <h3 className="font-bold text-sm min-[350px]:text-base text-gray-900 leading-tight mb-1.5">{action.title}</h3>
          {action.subType === 'hypnose_daily' ? (
            <div className="flex flex-wrap items-center gap-2">
              {isLimitReached ? (
                <span className="text-red-500 text-xs font-bold flex items-center gap-1"><Lock className="w-3 h-3" /> Limite atteinte</span>
              ) : (
                <span className={`inline-block bg-gray-100 px-2 py-0.5 rounded text-xs font-medium text-gray-600 border border-gray-200 ${action.subType === 'hypnose_daily' ? 'hidden min-[430px]:inline-block' : ''}`}>
                  Essai : J-{action.current_trial_day} / {action.free_trial_days}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 leading-snug">{action.description}</p>
          )}
        </div>
      </div>
      {isLimitReached ? (
        <button className="ml-2 px-2 py-1 bg-gray-100 text-gray-400 rounded text-xs font-bold cursor-not-allowed flex-shrink-0">
          Bloqué
        </button>
      ) : (
        <button className="ml-2 w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0 shadow-md">
          <Play className="w-4 h-4 fill-current ml-0.5" />
        </button>
      )}
    </div>
  );
};

