import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Target, 
  CheckCircle2, 
  XCircle, 
  MinusCircle, 
  Save, 
  Calendar,
  Activity,
  Sparkles,
  TrendingUp,
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

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

interface FeedbackData {
  feedback: string;
  insight: string;
  tip: string;
}

interface HistoryEntry {
  energy_level: number;
  identity_alignment: 'yes' | 'no' | 'mixed' | 'oui' | 'non' | 'moyen'; // Adapter selon DB
  created_at: string;
}

const FeedbackOverlay = ({ 
  energyLevel, 
  identityLevel, 
  feedbackData, 
  history, 
  onClose 
}: { 
  energyLevel: number, 
  identityLevel: 'yes' | 'no' | 'mixed' | null,
  feedbackData?: FeedbackData | null, 
  history: HistoryEntry[],
  onClose: () => void 
}) => {
  const getFallbackFeedback = (energy: number) => {
    if (energy >= 75) return "Tu es dans une dynamique puissante ! Ton niveau d'énergie élevé suggère que tes actions sont bien alignées avec tes besoins. Profite de cet élan pour t'attaquer à tes plus grands défis la semaine prochaine.";
    if (energy >= 40) return "Tu as maintenu un bon équilibre cette semaine. C'est une fondation solide. Pour passer au niveau supérieur, identifie ce qui t'a donné le plus d'énergie et essaie de le reproduire davantage.";
    return "Cette semaine a semblé coûteuse en énergie. C'est un signal important de ton corps. La priorité pour la semaine à venir n'est pas la performance, mais la régénération. Un guerrier fatigué ne gagne pas de batailles.";
  };

  const feedbackText = feedbackData?.feedback || getFallbackFeedback(energyLevel);
  
  // Construction des données pour les graphiques
  // On prend les 4 derniers + le courant
  const recentHistory = history.slice(0, 4).reverse(); // On assume que history est trié DESC
  
  // Mapping alignement pour le graph (Non=0, Moyen=50, Oui=100)
  const mapAlignmentToScore = (align: string | null) => {
    if (!align) return 0;
    const a = align.toLowerCase();
    if (a === 'oui' || a === 'yes') return 100;
    if (a === 'moyen' || a === 'mixed') return 50;
    return 0; // non / no
  };

  const currentIdentityScore = mapAlignmentToScore(identityLevel);

  const chartData = [
    ...recentHistory.map(h => ({
      energy: h.energy_level,
      identity: mapAlignmentToScore(h.identity_alignment),
      label: new Date(h.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    })),
    { energy: energyLevel, identity: currentIdentityScore, label: 'Auj.' }
  ];

  const maxVal = 100;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/95 backdrop-blur-md p-4 overflow-y-auto"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-emerald-900/50 border border-emerald-800 rounded-2xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative my-auto"
      >
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 mb-4 shadow-lg shadow-amber-500/20">
            <Sparkles className="w-6 h-6 text-emerald-950" />
          </div>
          <h3 className="text-2xl font-serif font-bold text-white mb-2">Table Ronde Clôturée</h3>
          <p className="text-emerald-200/80 text-sm">Bravo pour ce moment de clarté.</p>
        </div>

        <div className="space-y-6">
          {/* AI Insight Card */}
          <div className="bg-emerald-950/50 rounded-xl p-4 border border-emerald-800/50">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mt-1 hidden min-[320px]:flex">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-100 mb-1 uppercase tracking-wider">
                    {feedbackData ? "L'analyse de Sophia" : "Analyse de ton énergie"}
                </h4>
                <p className="text-sm text-emerald-300/90 leading-relaxed">
                  {feedbackText}
                </p>
              </div>
            </div>
          </div>

          {/* AI Tip Card */}
          {feedbackData?.tip && (
            <div className="bg-gradient-to-r from-amber-900/20 to-emerald-900/20 rounded-xl p-4 border border-amber-500/20 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
               <div className="flex items-start gap-3 pl-2">
                 <div className="shrink-0 mt-0.5 hidden min-[320px]:block">
                   <Sparkles className="w-5 h-5 text-amber-400" />
                 </div>
                 <div>
                   <h4 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-1">Conseil de la semaine</h4>
                   <p className="text-sm text-emerald-100 italic font-medium leading-relaxed">
                     "{feedbackData.tip}"
                   </p>
                 </div>
               </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Energy Chart */}
            <div className="bg-emerald-950/50 rounded-xl p-4 border border-emerald-800/50">
                <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Énergie</h4>
                </div>
                
                <div className="flex items-end justify-between h-24 gap-2 px-2">
                {chartData.map((d, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                     <div className="relative w-full flex justify-center h-full items-end">
                         {/* Value Label */}
                        <div className="absolute bottom-full mb-1 text-[10px] font-bold text-emerald-300 pointer-events-none whitespace-nowrap z-10">
                        {d.energy}
                        </div>
                        {/* Bar */}
                        <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: `${(d.energy / maxVal) * 100}%` }}
                        transition={{ delay: 0.2 + (idx * 0.1), duration: 0.5 }}
                        className={`w-full max-w-[20px] rounded-t-sm ${idx === chartData.length - 1 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-emerald-700/50'}`}
                        />
                    </div>
                    <span className={`text-[9px] ${idx === chartData.length - 1 ? 'text-amber-400 font-bold' : 'text-emerald-500/50'}`}>
                        {d.label}
                    </span>
                    </div>
                ))}
                </div>
            </div>

            {/* Identity Chart */}
            <div className="bg-emerald-950/50 rounded-xl p-4 border border-emerald-800/50">
                <div className="flex items-center gap-2 mb-4">
                <UserCheck className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">Alignement</h4>
                </div>
                
                <div className="flex items-end justify-between h-24 gap-2 px-2">
                {chartData.map((d, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                    <div className="relative w-full flex justify-center h-full items-end">
                         {/* Value Label */}
                        <div className="absolute bottom-full mb-1 text-[10px] font-bold text-blue-300 pointer-events-none whitespace-nowrap z-10">
                        {d.identity === 100 ? 'Oui' : d.identity === 50 ? 'Moy' : 'Non'}
                        </div>
                        {/* Bar */}
                        <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: `${(d.identity / maxVal) * 100}%` }}
                        transition={{ delay: 0.3 + (idx * 0.1), duration: 0.5 }}
                        className={`w-full max-w-[20px] rounded-t-sm ${idx === chartData.length - 1 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-blue-900/50'}`}
                        />
                    </div>
                    <span className={`text-[9px] ${idx === chartData.length - 1 ? 'text-blue-400 font-bold' : 'text-emerald-500/50'}`}>
                        {d.label}
                    </span>
                    </div>
                ))}
                </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-full py-3 bg-white text-emerald-950 font-bold rounded-xl hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
          >
            Retour au Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const WeeklyAlignment = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [ratings, setRatings] = useState<Record<number, 'yes' | 'no' | 'mixed' | null>>({});
  const [energyLevel, setEnergyLevel] = useState(50);
  const [wins, setWins] = useState("");
  const [block, setBlock] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [moduleId, setModuleId] = useState<string>("");

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('user_round_table_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error("Erreur fetch history:", error);
          return;
        }

        if (data) {
          setHistory(data);
          // Calculer le prochain ID de module (ex: round_table_5 si on en a 4)
          // On suppose que les tables rondes sont séquentielles
          setModuleId(`round_table_${data.length + 1}`);
        } else {
            setModuleId('round_table_1');
        }
      } catch (err) {
        console.error("Erreur inattendue:", err);
      }
    };

    fetchHistory();
  }, [user]);

  const handleRating = (id: number, status: 'yes' | 'no' | 'mixed') => {
    setRatings(prev => ({ ...prev, [id]: status }));
  };

  const handleSubmit = async () => {
    if (!user || !moduleId) return;
    setIsSubmitting(true);
    
    // Mapping pour la DB et l'affichage
    const identityAlignment = ratings[3] === 'yes' ? 'oui' : ratings[3] === 'mixed' ? 'moyen' : 'non';
    
    try {
      // 1. Sauvegarde en DB
      const { error: saveError } = await supabase
        .from('user_round_table_entries')
        .insert({
            user_id: user.id,
            module_id: moduleId,
            energy_level: energyLevel,
            wins_3: wins,
            main_blocker: block,
            identity_alignment: identityAlignment,
            week_intention: nextFocus
        });

      if (saveError) {
        console.error("Erreur sauvegarde DB:", saveError);
        // On continue quand même pour afficher le feedback, mais on alerte peut-être ?
        // alert("Attention: Sauvegarde impossible. Vérifiez votre connexion.");
      }

      // 2. Gestion de l'état du module (Lock/Unlock)
      // On met à jour UNIQUEMENT la "Porte d'entrée" (round_table_1) pour la verrouiller jusqu'au dimanche suivant.
      // On ne crée pas d'entrée 'completed' pour chaque round_table_N dans user_week_states, 
      // car l'historique est déjà dans user_round_table_entries.
      
      const gatekeeperModuleId = 'round_table_1';
      
      const nextSunday = new Date();
      // On calcule le nombre de jours jusqu'au prochain dimanche (si on est dimanche, c'est dans 7 jours)
      const daysUntilNextSunday = 7 - nextSunday.getDay(); 
      nextSunday.setDate(nextSunday.getDate() + (daysUntilNextSunday === 0 ? 7 : daysUntilNextSunday));
      nextSunday.setHours(0, 0, 0, 0); // À minuit

      // Mise à jour du verrou sur round_table_1
      await supabase.from('user_week_states').upsert({
          user_id: user.id,
          module_id: gatekeeperModuleId,
          status: 'available', // Reste 'available' pour être visible (mais verrouillé par available_at)
          available_at: nextSunday.toISOString()
      }, { onConflict: 'user_id, module_id' });

      // 3. Appel IA pour le feedback avec l'historique
      const { data, error } = await supabase.functions.invoke('generate-feedback', {
        body: {
          energyLevel,
          wins,
          block,
          ratings,
          nextFocus,
          history: history.slice(0, 5) // On envoie les 5 derniers pour l'analyse
        }
      });

      if (error) {
        console.error("Erreur IA:", error);
      } else {
        setFeedbackData(data);
      }
    } catch (err) {
      console.error("Erreur inattendue:", err);
    } finally {
      setIsSubmitting(false);
      setShowFeedback(true);
    }
  };

  return (
    <div className="min-h-screen bg-emerald-950 text-emerald-50 font-sans flex flex-col">
      <AnimatePresence>
        {showFeedback && (
          <FeedbackOverlay 
            energyLevel={energyLevel}
            identityLevel={ratings[3]}
            feedbackData={feedbackData}
            history={history}
            onClose={() => navigate('/dashboard', { state: { mode: 'architecte' } })}
          />
        )}
      </AnimatePresence>
      
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
             <div className="flex justify-between text-xs text-emerald-500 mt-2 uppercase font-bold tracking-wider">
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
               <label className="block text-emerald-200 text-xs md:text-sm font-bold uppercase mb-2">3 Victoires (Gratitude)</label>
               <textarea 
                 value={wins}
                 onChange={(e) => setWins(e.target.value)}
                 placeholder="Qu'est-ce qui a bien fonctionné ? De quoi es-tu fier ?"
                 className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-emerald-700/50 resize-none min-h-[80px]"
               />
            </div>
            <div className="bg-emerald-900/30 border border-emerald-800 rounded-xl p-4">
               <label className="block text-red-300/80 text-xs md:text-sm font-bold uppercase mb-2">1 Blocage Majeur</label>
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
                  <span className="text-xs font-bold uppercase">Non</span>
                </button>

                <button 
                  onClick={() => handleRating(3, 'mixed')}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-2 transition-all border ${
                    ratings[3] === 'mixed' ? 'bg-amber-500/20 text-amber-400 border-amber-500' : 'bg-emerald-950/50 border-transparent hover:border-emerald-700 text-emerald-600'
                  }`}
                >
                  <MinusCircle className="w-6 h-6" />
                  <span className="text-xs font-bold uppercase">Moyen</span>
                </button>

                <button 
                  onClick={() => handleRating(3, 'yes')}
                  className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-2 transition-all border ${
                    ratings[3] === 'yes' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500' : 'bg-emerald-950/50 border-transparent hover:border-emerald-700 text-emerald-600'
                  }`}
                >
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="text-xs font-bold uppercase">Oui</span>
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
