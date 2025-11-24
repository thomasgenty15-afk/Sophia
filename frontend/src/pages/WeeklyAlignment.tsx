import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Target, 
  CheckCircle2, 
  XCircle, 
  MinusCircle, 
  Save, 
  Calendar,
  Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- MOCK DATA (Piliers Génériques & Universels) ---
const WEEKLY_STEPS = [
  { 
    id: 1, 
    title: "Check-in Énergétique", 
    definition: "Jauge ton niveau d'énergie actuel (0-100%). Sois honnête.",
    type: "energy"
  },
  { 
    id: 2, 
    title: "Revue des Faits", 
    definition: "Identifie 3 victoires (Gratitude) et 1 blocage majeur (Analyse).",
    type: "review"
  },
  { 
    id: 3, 
    title: "Alignement Identitaire", 
    definition: "As-tu honoré tes standards cette semaine ? As-tu agi comme la personne que tu veux devenir ?",
    type: "identity"
  }
];

const WeeklyAlignment = () => {
  const navigate = useNavigate();
  const [ratings, setRatings] = useState<Record<number, 'yes' | 'no' | 'mixed' | null>>({});
  const [energyLevel, setEnergyLevel] = useState(50);
  const [wins, setWins] = useState("");
  const [block, setBlock] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRating = (id: number, status: 'yes' | 'no' | 'mixed') => {
    setRatings(prev => ({ ...prev, [id]: status }));
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      navigate('/dashboard', { state: { mode: 'architecte' } });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-emerald-950 text-emerald-50 font-sans flex flex-col">
      
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-emerald-950/90 backdrop-blur-md border-b border-emerald-900 p-4 md:p-6 flex items-center justify-between">
        <button 
          onClick={() => navigate('/dashboard', { state: { mode: 'architecte' } })} 
          className="flex items-center gap-2 text-emerald-400 hover:text-emerald-200 transition-colors text-xs md:text-sm font-bold uppercase tracking-wider"
        >
          <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Retour
        </button>
        <div className="flex items-center gap-2 text-emerald-100 font-serif">
          <Calendar className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
          <span className="text-sm md:text-lg font-bold">La Table Ronde</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full p-4 md:p-6 pb-24">
        
        {/* HERO SECTION */}
        <div className="text-center mb-10 md:mb-14 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6 animate-fade-in-up">
            <Activity className="w-3 h-3" />
            On ne pilote pas un navire en regardant le sillage, mais en vérifiant le cap
          </div>
          
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-4">La Table Ronde</h1>
          
          <p className="text-emerald-200/60 text-xs md:text-sm mt-4 max-w-md mx-auto">
            C'est ton rendez-vous sacré avec toi-même. 15 minutes pour fermer les onglets de la semaine passée et ouvrir ceux de la semaine à venir avec intention.
          </p>
        </div>

        {/* ETAPE 1: SCAN ÉNERGÉTIQUE */}
        <div className="space-y-6 mb-12 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3 mb-4">
             <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">1</div>
             <h2 className="text-base md:text-lg font-bold text-white">Check-in Énergétique</h2>
          </div>

          <div className="bg-emerald-900/30 border border-emerald-800 rounded-xl p-6">
             <label className="block text-emerald-200 text-sm font-bold mb-4 text-center">
               Niveau de Batterie Interne : {energyLevel}%
             </label>
             <input 
               type="range" 
               min="0" 
               max="100" 
               value={energyLevel} 
               onChange={(e) => setEnergyLevel(parseInt(e.target.value))}
               className="w-full h-2 bg-emerald-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
             />
             <div className="flex justify-between text-[10px] text-emerald-500 mt-2 uppercase font-bold tracking-wider">
               <span>Épuisé</span>
               <span>Neutre</span>
               <span>Survolté</span>
             </div>
          </div>
        </div>

        {/* ETAPE 2: REVUE DES FAITS */}
        <div className="space-y-6 mb-12 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-3 mb-4">
             <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">2</div>
             <h2 className="text-base md:text-lg font-bold text-white">La Revue des Faits</h2>
          </div>

          <div className="grid gap-4">
            <div className="bg-emerald-900/30 border border-emerald-800 rounded-xl p-4">
               <label className="block text-emerald-200 text-xs font-bold uppercase mb-2">3 Victoires (Gratitude)</label>
               <textarea 
                 value={wins}
                 onChange={(e) => setWins(e.target.value)}
                 placeholder="Qu'est-ce qui a bien fonctionné ? De quoi es-tu fier ?"
                 className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-emerald-700/50 resize-none min-h-[80px]"
               />
            </div>
            <div className="bg-emerald-900/30 border border-emerald-800 rounded-xl p-4">
               <label className="block text-red-300/80 text-xs font-bold uppercase mb-2">1 Blocage Majeur</label>
               <textarea 
                 value={block}
                 onChange={(e) => setBlock(e.target.value)}
                 placeholder="Qu'est-ce qui t'a freiné ? Sois honnête."
                 className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-emerald-700/50 resize-none min-h-[60px]"
               />
            </div>
          </div>
        </div>

        {/* ETAPE 3: ALIGNEMENT */}
        <div className="space-y-6 mb-12 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center gap-3 mb-4">
             <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">3</div>
             <h2 className="text-base md:text-lg font-bold text-white">Alignement Identitaire</h2>
              </div>

          <div className="bg-emerald-900/30 border border-emerald-800 rounded-xl p-6">
             <p className="text-emerald-100 text-sm mb-6 text-center italic">
               "Ai-je honoré mes standards cette semaine ? Ai-je agi comme la personne que je veux devenir ?"
             </p>
             
             <div className="flex items-center justify-between gap-4">
                <button 
                  onClick={() => handleRating(3, 'no')}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-2 transition-all border ${
                    ratings[3] === 'no' ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-emerald-950/50 border-transparent hover:border-emerald-700 text-emerald-600'
                  }`}
                >
                  <XCircle className="w-6 h-6" />
                  <span className="text-[10px] font-bold uppercase">Non</span>
                </button>

                <button 
                  onClick={() => handleRating(3, 'mixed')}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-2 transition-all border ${
                    ratings[3] === 'mixed' ? 'bg-amber-500/20 text-amber-400 border-amber-500' : 'bg-emerald-950/50 border-transparent hover:border-emerald-700 text-emerald-600'
                  }`}
                >
                  <MinusCircle className="w-6 h-6" />
                  <span className="text-[10px] font-bold uppercase">Moyen</span>
                </button>

                <button 
                  onClick={() => handleRating(3, 'yes')}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-2 transition-all border ${
                    ratings[3] === 'yes' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500' : 'bg-emerald-950/50 border-transparent hover:border-emerald-700 text-emerald-600'
                  }`}
                >
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="text-[10px] font-bold uppercase">Oui</span>
                </button>
              </div>
            </div>
        </div>

        {/* ETAPE 4: LE CAP */}
        <div className="space-y-6 mb-12 animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center gap-3 mb-4">
             <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">4</div>
             <h2 className="text-base md:text-lg font-bold text-white">L'Intention (Le Cap)</h2>
          </div>

            <div className="relative">
               <Target className="absolute top-4 left-4 w-5 h-5 text-amber-400" />
               <input
                type="text"
                value={nextFocus}
                onChange={(e) => setNextFocus(e.target.value)}
              placeholder="Quelle est TA priorité absolue pour la semaine à venir ?"
              className="w-full bg-emerald-900/30 border border-emerald-800 rounded-xl pl-12 pr-4 py-4 text-sm md:text-base text-white placeholder-emerald-700 focus:ring-1 focus:ring-amber-500 outline-none"
              />
          </div>
        </div>

        {/* SUBMIT */}
        <button
          onClick={handleSubmit}
          disabled={!ratings[3] || !wins || !nextFocus || isSubmitting}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg transition-all ${
            !ratings[3] || !wins || !nextFocus || isSubmitting
              ? 'bg-emerald-900 text-emerald-600 cursor-not-allowed'
              : 'bg-amber-500 text-emerald-950 hover:bg-amber-400 hover:scale-[1.02]'
          }`}
        >
          {isSubmitting ? (
            'Synchronisation...'
          ) : (
            <>
              <Save className="w-5 h-5" /> Clôturer la Table Ronde
            </>
          )}
        </button>

      </main>
    </div>
  );
};

export default WeeklyAlignment;
