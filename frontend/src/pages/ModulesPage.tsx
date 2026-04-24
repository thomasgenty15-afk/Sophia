import React, { useState } from 'react';
import { useModules } from '../hooks/useModules';
import type { EnrichedModule } from '../hooks/useModules';
import { Check, Lock, Clock, ArrowRight, BookOpen, Star, Sparkles } from 'lucide-react';
import { WishlistTab } from '../components/architect/WishlistTab';
import { StoriesTab } from '../components/architect/StoriesTab';

const ModuleCard = ({ module, onComplete }: { module: EnrichedModule; onComplete: (id: string) => void }) => {
  // STYLE : Basé sur ton screenshot (Vert Foncé & Élégant)
  
  // CAS 1 : VERROUILLÉ (Futur lointain)
  if (module.isLocked) {
    return (
      <div className="relative p-6 rounded-xl border border-white/10 bg-[#0a2e26]/40 opacity-60 cursor-not-allowed overflow-hidden">
        <div className="flex justify-between items-center">
            <div>
                <p className="text-xs uppercase tracking-wider text-emerald-500 font-semibold mb-1">
                    {module.type === 'week' ? 'Semaine' : 'Module'}
                </p>
                <h3 className="text-xl font-serif text-white/50">{module.title}</h3>
            </div>
            <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center">
                <Lock className="w-5 h-5 text-white/30" />
            </div>
        </div>
      </div>
    );
  }

  const isCompleted = module.state?.status === 'completed';

  // CAS 2 : TERMINÉ (Vert check)
  if (isCompleted) {
      return (
        <div className="group relative p-6 rounded-xl border border-emerald-500/30 bg-[#032b23] transition-all hover:border-emerald-500/50">
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold mb-1">
                        {module.type === 'week' ? 'Semaine Validée' : 'Terminé'}
                    </p>
                    <h3 className="text-xl font-serif text-white">{module.title}</h3>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Check className="w-6 h-6 text-[#021a15]" strokeWidth={3} />
                </div>
            </div>
        </div>
      );
  }

  // CAS 3 : EN ATTENTE (Compte à rebours)
  if (!module.isAvailableNow) {
      const days = Math.ceil((module.timeRemaining || 0) / (1000 * 60 * 60 * 24));
      return (
        <div className="relative p-6 rounded-xl border border-orange-500/30 bg-orange-900/10">
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-xs uppercase tracking-wider text-orange-400 font-bold mb-1">
                        Bientôt Disponible
                    </p>
                    <h3 className="text-xl font-serif text-white/80">{module.title}</h3>
                    <p className="text-sm text-orange-300/80 mt-2 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Ouvre dans {days} jours
                    </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                    <Lock className="w-5 h-5 text-orange-400" />
                </div>
            </div>
        </div>
      );
  }

  // CAS 4 : ACTIF (À faire maintenant)
  return (
    <div className="group relative p-6 rounded-xl border border-emerald-400 bg-[#0a3f33] shadow-lg shadow-emerald-900/50 cursor-pointer hover:scale-[1.01] transition-transform">
        <div className="absolute top-0 right-0 p-2">
            <span className="flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
        </div>
        
        <div className="flex justify-between items-center">
            <div>
                <p className="text-xs uppercase tracking-wider text-emerald-300 font-bold mb-1">
                    En cours
                </p>
                <h3 className="text-2xl font-serif text-white mb-4">{module.title}</h3>
                
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onComplete(module.id);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#021a15] font-bold rounded-lg transition-colors"
                >
                    Commencer le module
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    </div>
  );
};

export const ModulesPage = () => {
  const { modules, loading, completeModule } = useModules();
  const [activeTab, setActiveTab] = useState<'coaching' | 'wishlist' | 'stories'>('coaching');

  if (loading) return (
    <div className="min-h-screen bg-[#021a15] flex items-center justify-center text-emerald-500">
        Chargement du Temple...
    </div>
  );

  const weeks = Object.values(modules).filter(m => m.type === 'week');
  const forge = Object.values(modules).filter(m => m.type === 'forge');

  return (
    <div className="min-h-screen bg-[#021a15] text-white flex flex-col">
      {/* NOUVEAU : Barre de navigation des onglets */}
      <div className="sticky top-0 z-20 bg-[#021a15]/90 backdrop-blur-md border-b border-emerald-900/50 p-4 shrink-0">
        <div className="max-w-5xl mx-auto flex justify-center">
          <div className="flex bg-[#05221d] p-1.5 rounded-xl border border-emerald-800/30 shadow-lg">
            <button 
              onClick={() => setActiveTab('coaching')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'coaching' ? 'bg-emerald-600 text-white shadow-md scale-105' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-900/30'}`}
            >
              <Sparkles className="w-4 h-4" />
              Coaching
            </button>
            <button 
              onClick={() => setActiveTab('wishlist')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'wishlist' ? 'bg-amber-600 text-white shadow-md scale-105' : 'text-amber-500/70 hover:text-amber-400 hover:bg-amber-900/30'}`}
            >
              <Star className="w-4 h-4" />
              Life Wishlist
            </button>
            <button 
              onClick={() => setActiveTab('stories')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'stories' ? 'bg-emerald-600 text-white shadow-md scale-105' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-900/30'}`}
            >
              <BookOpen className="w-4 h-4" />
              Story Journal
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative">
        {activeTab === 'coaching' && (
          <div className="p-6 md:p-12">
            <div className="max-w-5xl mx-auto space-y-16">
              
              <header className="text-center space-y-4">
                  <h1 className="text-4xl md:text-5xl font-serif text-white tracking-tight">L'Atelier d'Identité</h1>
                  <p className="text-emerald-400/80 max-w-2xl mx-auto text-lg italic">
                      "On ne s'élève pas au niveau de ses objectifs. On tombe au niveau de ses systèmes."
                  </p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                  
                  {/* COLONNE PRINCIPALE : LE TEMPLE */}
                  <div className="lg:col-span-12 space-y-8">
                      <div className="flex items-center gap-3 mb-6">
                          <div className="h-8 w-8 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center border border-amber-600/40">
                              🔨
                          </div>
                          <h2 className="text-xl font-bold tracking-wide text-emerald-100">PHASE 1 : LA CONSTRUCTION DU TEMPLE</h2>
                      </div>
                      
                      <div className="space-y-4">
                          {weeks.map(m => (
                          <ModuleCard key={m.id} module={m} onComplete={completeModule} />
                          ))}
                      </div>

                      {/* LA FORGE (Apparaît en dessous après) */}
                      {forge.length > 0 && (
                          <div className="pt-12 border-t border-white/10 mt-12">
                               <div className="flex items-center gap-3 mb-6">
                                  <div className="h-8 w-8 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center border border-red-600/40">
                                      🔥
                                  </div>
                                  <h2 className="text-xl font-bold tracking-wide text-red-100">PHASE 2 : LA FORGE</h2>
                              </div>
                              <div className="space-y-4">
                                  {forge.map(m => (
                                  <ModuleCard key={m.id} module={m} onComplete={completeModule} />
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>

              </div>
            </div>
          </div>
        )}

        {activeTab === 'wishlist' && <WishlistTab />}
        {activeTab === 'stories' && <StoriesTab />}
      </div>
    </div>
  );
};
