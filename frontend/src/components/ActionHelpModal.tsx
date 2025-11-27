import React from 'react';
import { 
  Swords, 
  X, 
  ArrowRight,
  Layout,
  CheckSquare,
  Zap
} from 'lucide-react';
import type { Action } from '../types/plan';

interface ActionHelpModalProps {
  action: Action;
  onClose: () => void;
  onGenerateStep: (problem: string) => void;
}

const ActionHelpModal: React.FC<ActionHelpModalProps> = ({ action, onClose, onGenerateStep }) => {
  const [problem, setProblem] = React.useState('');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up border border-slate-200">
        
        {/* HEADER */}
        <div className="bg-slate-50 p-4 md:p-6 border-b border-slate-100 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${
                action.type === 'habitude' ? 'bg-emerald-100 text-emerald-700' :
                action.type === 'framework' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {action.type === 'habitude' ? <Zap className="w-4 h-4" /> :
                 action.type === 'framework' ? <Layout className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
              </div>
              <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Déblocage Rapide</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">{action.title}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-4 md:p-6 space-y-6">
          {/* CONSEIL IMMÉDIAT */}
          <div className="bg-violet-50 p-4 rounded-xl border border-violet-100">
            <h4 className="text-sm font-bold text-violet-900 mb-2 flex items-center gap-2">
              <Swords className="w-4 h-4" />
              Le conseil de Sophia
            </h4>
            <p className="text-sm text-violet-800 leading-relaxed">
              {action.tips || "Cette action est conçue pour être simple. Si tu bloques, c'est que tu essaies de la faire trop parfaitement."}
            </p>
          </div>

          {/* INPUT PROBLÈME */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Qu'est-ce qui te bloque vraiment ?
            </label>
            <textarea 
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Ex: Je n'ai pas le temps, j'ai peur de mal faire..."
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm min-h-[80px] resize-none"
            />
          </div>

          {/* ACTION */}
          <button 
            onClick={() => {
              onGenerateStep(problem);
              onClose();
            }}
            disabled={!problem.trim()}
            className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-violet-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            Générer une étape intermédiaire
          </button>
        </div>

      </div>
    </div>
  );
};

export default ActionHelpModal;
