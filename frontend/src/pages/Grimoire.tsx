import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Book, ArrowLeft, Check, Play, Star, Calendar, Zap, FileText, Sword, History, Loader2 } from 'lucide-react';
import FrameworkHistoryModal from '../components/FrameworkHistoryModal';
import type { Action, CompletedTransformation } from '../types/grimoire';
import { fetchCompletedTransformations, reactivateAction } from '../lib/grimoire';

// --- COMPONENTS ---

interface GrimoireHomeProps {
  transformations: CompletedTransformation[];
}

function GrimoireHome({ transformations }: GrimoireHomeProps) {
  const navigate = useNavigate();
  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      <button 
        onClick={() => navigate('/dashboard')} 
        className="flex items-center gap-2 text-gray-400 hover:text-indigo-600 transition-colors text-xs min-[350px]:text-sm md:text-base font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3 h-3 min-[350px]:w-4 min-[350px]:h-4" /> Retour au tableau de bord
      </button>

      <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
        <h2 className="text-xl min-[350px]:text-2xl md:text-3xl font-serif font-bold text-indigo-900 mb-2 md:mb-4">Tes Conquêtes</h2>
        <p className="text-xs min-[350px]:text-sm md:text-base text-indigo-600/80 leading-snug md:leading-normal">
          "Le passé n'est pas un poids, c'est une bibliothèque de victoires."<br className="hidden md:block"/>
          Retrouve ici toutes tes transformations achevées et tes outils acquis.
        </p>
      </div>
      
      {transformations.length === 0 ? (
        <div className="text-center py-12 bg-white/50 rounded-xl border border-dashed border-indigo-200">
           <p className="text-indigo-900/60 font-medium">Aucune transformation complétée pour le moment.</p>
           <p className="text-sm text-indigo-400 mt-2">Continue tes efforts, ton grimoire se remplira bientôt !</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {transformations.map(t => (
            <div 
              key={t.id}
              onClick={() => navigate(`/grimoire/${t.id}`)}
              className="bg-white border border-indigo-100 rounded-xl p-4 min-[350px]:p-6 flex flex-col items-center text-center shadow-sm hover:shadow-md hover:border-indigo-300 hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-1 ${t.status === 'completed' ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-indigo-400 to-violet-500'}`} />
              
              {/* Status Badge */}
              <div className="absolute top-3 right-3">
                 {t.status === 'completed' ? (
                    <span className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        <Star className="w-3 h-3 fill-amber-700" /> Succès
                    </span>
                 ) : (
                    <span className="bg-indigo-50 text-indigo-500 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        Archivé
                    </span>
                 )}
              </div>

              <div className={`w-12 h-12 min-[350px]:w-16 min-[350px]:h-16 rounded-full flex items-center justify-center mb-3 min-[350px]:mb-4 group-hover:scale-110 transition-all ${t.status === 'completed' ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-100' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100'}`}>
                <Book className="w-6 h-6 min-[350px]:w-8 min-[350px]:h-8" />
              </div>
              
              <span className={`text-xs font-bold uppercase tracking-wider mb-1 min-[350px]:mb-2 ${t.status === 'completed' ? 'text-amber-600' : 'text-indigo-400'}`}>{t.theme}</span>
              <h3 className={`font-bold text-sm min-[350px]:text-lg mb-3 min-[350px]:mb-4 leading-tight ${t.status === 'completed' ? 'text-amber-950' : 'text-indigo-900'}`}>{t.title}</h3>
              
              <div className="mt-auto flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
                <Calendar className="w-3 h-3" />
                {t.status === 'completed' ? 'Accompli le' : 'Archivé le'} {t.completedDate}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface GrimoireDetailProps {
  transformation: CompletedTransformation;
}

function GrimoireDetail({ transformation }: GrimoireDetailProps) {
  const navigate = useNavigate();
  const [selectedFramework, setSelectedFramework] = useState<{title: string} | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  // On sépare les hypnoses des autres actions pour l'affichage
  const hypnoses = transformation.actions.filter(a => a.isHypnosis);
  const regularActions = transformation.actions.filter(a => !a.isHypnosis);

  const handleReactivate = async (action: Action) => {
    if (!confirm(`Veux-tu réactiver "${action.title}" et l'ajouter à ton plan actuel ?`)) return;
    
    setReactivatingId(action.id);
    try {
        await reactivateAction(action);
        alert("Action ajoutée à ton tableau de bord !");
        navigate('/dashboard');
    } catch (err: any) {
        console.error("Reactivation error:", err);
        alert(err.message || "Erreur lors de la réactivation");
    } finally {
        setReactivatingId(null);
    }
  };

  const handlePlayHypnosis = (action: Action) => {
      if (action.media_duration) {
          alert(`Lecture de l'hypnose "${action.title}" (${action.media_duration}).\n\n(Le lecteur audio sera bientôt disponible ici)`);
      } else {
          alert("Fichier audio introuvable.");
      }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in max-w-4xl mx-auto">
      <button onClick={() => navigate('/grimoire')} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-[10px] min-[350px]:text-sm font-bold uppercase tracking-wide mb-4 md:mb-6 transition-colors">
        <ArrowLeft className="w-3 h-3 min-[350px]:w-4 min-[350px]:h-4" /> Retour à la bibliothèque
      </button>

      <header className="mb-6 md:mb-10">
         <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
           <span className="bg-indigo-100 text-indigo-700 text-[10px] min-[350px]:text-xs font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-full uppercase tracking-wider">{transformation.theme}</span>
           <span className="text-gray-400 text-[10px] min-[350px]:text-xs font-bold uppercase tracking-wider">Archivé le {transformation.completedDate}</span>
         </div>
         <h1 className="text-xl min-[350px]:text-3xl md:text-4xl font-bold text-gray-900 mb-2 leading-tight">{transformation.title}</h1>
      </header>

      {/* Point de Départ (Contexte) - NOUVEAU */}
      {transformation.contextProblem && (
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 min-[350px]:p-6 mb-6 md:mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 md:mb-3 flex items-center gap-2">
                <History className="w-3 h-3 md:w-4 md:h-4" />
                Le Point de Départ
            </h3>
            <p className="text-sm md:text-base text-slate-600 italic leading-relaxed">
                "{transformation.contextProblem}"
            </p>
        </section>
      )}

      {/* Stratégie Gagnante */}
      <section className="bg-white border border-indigo-100 rounded-2xl p-4 min-[350px]:p-8 shadow-sm relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-2xl" />
        <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6 pl-2">
          <div className="p-1.5 md:p-2 bg-indigo-100 rounded-lg text-indigo-600">
             <Star className="w-4 h-4 min-[350px]:w-5 min-[350px]:h-5" />
          </div>
          <h3 className="text-base min-[350px]:text-xl font-bold text-indigo-900">Ta Stratégie Gagnante</h3>
        </div>
        
        <div className="mb-6 md:mb-8 pl-2">
          <p className="font-serif text-sm min-[350px]:text-base md:text-lg text-indigo-900 italic leading-relaxed">
            "{transformation.strategy.identity}"
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-8 text-sm border-t border-indigo-50 pt-4 md:pt-6">
          <div className="flex flex-col h-full">
            <h4 className="font-bold text-indigo-400 uppercase tracking-wider mb-2 md:mb-3 text-xs min-[350px]:text-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                Ton Pourquoi Profond
            </h4>
            <div className="bg-indigo-50/50 p-3 md:p-5 rounded-xl border border-indigo-100 flex-1">
                <p className="text-xs min-[350px]:text-base text-indigo-900 leading-relaxed">
                    {transformation.strategy.bigWhy || "Pourquoi non défini"}
                </p>
            </div>
          </div>
          <div className="flex flex-col h-full">
            <h4 className="font-bold text-amber-500 uppercase tracking-wider mb-2 md:mb-3 text-xs min-[350px]:text-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Tes Règles d'Or
            </h4>
            <div className="bg-amber-50/50 p-3 md:p-5 rounded-xl border border-amber-100 flex-1">
                <p className="text-xs min-[350px]:text-base text-amber-900 whitespace-pre-line leading-relaxed">
                    {transformation.strategy.goldenRules || "Règles non définies"}
                </p>
            </div>
          </div>
        </div>
      </section>

      {/* Hypnoses Personnalisées */}
      {hypnoses.length > 0 && (
        <section className="bg-gradient-to-br from-violet-50 to-white border border-violet-100 rounded-2xl p-4 min-[350px]:p-8 shadow-sm">
          <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
            <div className="p-1.5 md:p-2 bg-violet-100 rounded-lg text-violet-600">
              <Play className="w-4 h-4 min-[350px]:w-5 min-[350px]:h-5" />
            </div>
            <h3 className="text-base min-[350px]:text-xl font-bold text-violet-900">Tes Hypnoses Personnalisées</h3>
          </div>
          <div className="space-y-3">
            {hypnoses.map(hypnosis => (
              <div key={hypnosis.id} onClick={() => handlePlayHypnosis(hypnosis)} className="bg-white border border-violet-100 rounded-xl p-3 md:p-4 flex items-center justify-between hover:shadow-md transition-all cursor-pointer group">
                <div className="min-w-0 pr-2">
                  <h4 className="font-bold text-sm min-[350px]:text-lg text-violet-900 group-hover:text-violet-700 transition-colors truncate">{hypnosis.title}</h4>
                  <p className="text-xs min-[350px]:text-base text-violet-500 truncate">{hypnosis.description} ({hypnosis.media_duration})</p>
                </div>
                <button className="w-8 h-8 min-[350px]:w-10 min-[350px]:h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-all flex-shrink-0">
                  <Play className="w-3 h-3 min-[350px]:w-4 min-[350px]:h-4 fill-current ml-0.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Réactiver une Action */}
      <section className="bg-white border border-green-100 rounded-2xl p-4 min-[350px]:p-8 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
          <div className="p-1.5 md:p-2 bg-green-100 rounded-lg text-green-600">
            <Check className="w-4 h-4 min-[350px]:w-5 min-[350px]:h-5" />
          </div>
          <h3 className="text-base min-[350px]:text-xl font-bold text-green-900">Réactiver une action</h3>
        </div>
        <div className="space-y-3 md:space-y-4">
          {regularActions.map(action => (
            <div key={action.id} className="bg-green-50/50 border border-green-100 rounded-xl p-3 md:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4 hover:bg-green-50 transition-colors w-full">
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-start gap-2 mb-1">
                  {/* Icône selon le type */}
                  <div className="mt-0.5 flex-shrink-0">
                    {action.type === 'habitude' && <Zap className="w-3 h-3 min-[350px]:w-4 min-[350px]:h-4 text-emerald-600" />}
                    {action.type === 'mission' && <Sword className="w-3 h-3 min-[350px]:w-4 min-[350px]:h-4 text-blue-600" />}
                    {action.type === 'framework' && <FileText className="w-3 h-3 min-[350px]:w-4 min-[350px]:h-4 text-violet-600" />}
                  </div>
                  
                  <h4 className="font-bold text-sm min-[350px]:text-lg text-green-900 break-words leading-tight">{action.title}</h4>
                </div>
                {action.description && (
                    <p className="text-xs min-[350px]:text-sm text-green-800/80 mb-1.5 line-clamp-2 leading-snug break-words">
                        {action.description}
                    </p>
                )}
                {action.mantra && <p className="text-xs min-[350px]:text-base text-green-700 mt-1 italic font-serif truncate">"{action.mantra}"</p>}
              </div>
              
              {action.type === 'framework' ? (
                <button 
                  onClick={() => setSelectedFramework({ title: action.title })}
                  className="w-full sm:w-auto px-4 py-2 bg-white border border-violet-200 text-violet-700 rounded-lg text-xs min-[350px]:text-sm font-bold hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-all shadow-sm flex-shrink-0 whitespace-nowrap flex items-center justify-center gap-2"
                >
                  <History className="w-4 h-4" />
                  Journal & Archives
                </button>
              ) : (
                <button 
                    onClick={() => handleReactivate(action)}
                    disabled={reactivatingId === action.id}
                    className="w-full sm:w-auto px-4 py-2 bg-white border border-green-200 text-green-700 rounded-lg text-xs min-[350px]:text-sm font-bold hover:bg-green-600 hover:text-white hover:border-green-600 transition-all shadow-sm flex-shrink-0 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {reactivatingId === action.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                  ) : "Réactiver"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {selectedFramework && (
        <FrameworkHistoryModal 
          frameworkTitle={selectedFramework.title} 
          onClose={() => setSelectedFramework(null)} 
        />
      )}
    </div>
  );
}

// Main Grimoire Component
export default function Grimoire() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [transformations, setTransformations] = useState<CompletedTransformation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchCompletedTransformations();
        setTransformations(data);
      } catch (error) {
        console.error('Error loading grimoire:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const selectedTransformation = id ? transformations.find(t => t.id === id) : undefined;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24">
      <header className="bg-white px-4 md:px-6 py-4 md:py-6 sticky top-0 z-20 shadow-sm border-b border-gray-100">
        <div className="max-w-5xl mx-auto flex justify-between items-end">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-indigo-400 text-[10px] min-[350px]:text-xs uppercase font-bold tracking-wider mb-1">Mon Espace Sacré</p>
              <h1 className="text-lg min-[350px]:text-2xl font-bold flex items-center gap-2 md:gap-3 text-indigo-950">
                Le Grimoire
              </h1>
            </div>
          </div>
          <div 
            onClick={() => navigate('/dashboard')}
            className="w-8 h-8 min-[350px]:w-10 min-[350px]:h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-xs min-[350px]:text-base text-gray-500 border-2 border-white shadow-sm cursor-pointer hover:bg-gray-300 transition-colors"
          >
            {/* Initials placeholder */}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {id && !selectedTransformation ? (
           <div className="text-center py-10">
             <p>Transformation introuvable ou non terminée.</p>
             <button onClick={() => navigate('/grimoire')} className="text-indigo-600 underline mt-2">Retour au Grimoire</button>
           </div>
        ) : selectedTransformation ? (
          <GrimoireDetail transformation={selectedTransformation} />
        ) : (
          <GrimoireHome transformations={transformations} />
        )}
      </main>
    </div>
  );
}
