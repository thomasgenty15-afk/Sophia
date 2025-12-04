import { useState } from 'react';
import { LifeBuoy, X, Hammer } from 'lucide-react';
import type { Action } from '../../types/dashboard';

export const ActionHelpModal = ({ action, onClose, onGenerateStep }: { action: Action, onClose: () => void, onGenerateStep: (problem: string) => Promise<void> | void }) => {
  const [problem, setProblem] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!problem) return;
    setIsGenerating(true);
    try {
      await onGenerateStep(problem);
      onClose();
    } catch (error) {
      console.error("Error generating step:", error);
      // Optionally handle error in UI
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="bg-slate-900 p-6 flex justify-between items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
              <LifeBuoy className="w-3 h-3" />
              SOS Blocage
            </div>
            <h3 className="text-white font-bold text-xl leading-tight">
              On ne reste pas bloqué.
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Action : <span className="text-white font-medium">"{action.title}"</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-slate-600 text-sm font-medium mb-4">
            Dis-moi ce qui coince. Plus tu es précis, mieux je peux t'aider.
          </p>

          {/* Text Area */}
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="C'est trop dur ? Pas le temps ? Peur de mal faire ? Explique-moi..."
            className="w-full p-4 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none mb-6 resize-none h-32 shadow-sm"
            autoFocus
          />

          {/* Actions */}
          <button
            onClick={handleGenerate}
            disabled={!problem || isGenerating}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                Analyse en cours...
              </>
            ) : (
              <>
                <Hammer className="w-5 h-5" />
                Découper l'action (Générer une étape facile)
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-400 mt-3">
            L'IA va créer un "pont" stratégique pour contourner ce blocage.
          </p>
        </div>

      </div>
    </div>
  );
};

