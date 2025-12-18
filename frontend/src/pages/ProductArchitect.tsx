import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  Shield,
  Crown,
  Sword,
  Hammer,
  Lock,
  Gem
} from 'lucide-react';

const ProductArchitect = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-emerald-50 font-sans selection:bg-emerald-900 selection:text-emerald-50">

      {/* NAVBAR (Dark Mode Variant) */}
      <nav className="fixed top-0 w-full bg-slate-950/90 backdrop-blur-md z-50 border-b border-emerald-900/30">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-900/20 font-serif">
              S
            </div>
            <span className="font-bold text-xl tracking-tight text-emerald-50">Sophia</span>
          </div>
          <div className="flex items-center gap-8">
            <div className="hidden md:flex gap-6 text-sm font-medium text-emerald-200/60">
              <button onClick={() => navigate('/le-plan')} className="hover:text-emerald-400 transition-colors">Le Plan</button>
              <button onClick={() => navigate('/l-architecte')} className="text-emerald-400 font-bold flex items-center gap-1">
                L'Architecte <span className="bg-emerald-900 text-emerald-400 border border-emerald-700/50 text-[10px] px-1.5 py-0.5 rounded-full font-bold">PRO</span>
              </button>
              <button onClick={() => navigate('/formules')} className="hover:text-emerald-400 transition-colors">Offres</button>
              <button onClick={() => navigate('/legal')} className="hover:text-emerald-400 transition-colors">Légal</button>
            </div>
            <button
              onClick={() => navigate('/auth')}
              className="px-5 py-2.5 rounded-full bg-emerald-600 text-slate-950 text-sm font-bold hover:bg-emerald-500 transition-all shadow-lg hover:shadow-emerald-900/50"
            >
              Accès Membre
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-emerald-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />

        {/* HERO */}
        <div className="max-w-4xl mx-auto px-6 text-center mb-24">
          <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-emerald-500/60 hover:text-emerald-400 mb-8 transition-colors font-medium text-sm">
            <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
          </button>

          <div className="flex justify-center w-full">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-8">
              <Crown className="w-4 h-4" />
              Niveau Supérieur
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold font-serif text-white mb-8 leading-[1.1] tracking-tight">
            Deviens l'<span className="text-emerald-500">Architecte</span><br />
            de ta Réalité.
          </h1>
          <p className="text-lg md:text-xl text-emerald-200/70 max-w-2xl mx-auto leading-relaxed">
            Changer ses actions ne suffit pas toujours. Pour des résultats explosifs et durables, tu dois reconfigurer ton identité.
          </p>
        </div>

        {/* CORE CONCEPTS - GLOBAL PRESENTATION */}
        <div className="max-w-6xl mx-auto px-6 mb-32">
          <div className="flex items-center justify-center gap-3 mb-12">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Hammer className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Les 3 Piliers du Programme</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* CONCEPT 1 */}
            <div className="bg-slate-900/50 p-8 rounded-2xl border border-emerald-900/30 hover:border-emerald-500/50 transition-all group">
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
                <Hammer className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-emerald-100 mb-3">1. Déconstruction</h3>
              <p className="text-emerald-200/60 leading-relaxed text-sm">
                Identifie et brise les croyances limitantes qui te gardent dans ton "petit bocal". Analyse tes peurs (Imposteur, Regard, Echec) et désamorce-les.
              </p>
            </div>

            {/* CONCEPT 2 */}
            <div className="bg-slate-900/50 p-8 rounded-2xl border border-emerald-900/30 hover:border-emerald-500/50 transition-all group">
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-emerald-100 mb-3">2. L'Arsenal</h3>
              <p className="text-emerald-200/60 leading-relaxed text-sm">
                Construis tes Armures (Défense mentale) et tes Armes (Attaque stratégique). Un système complet de principes pour rester inébranlable.
              </p>
            </div>

            {/* CONCEPT 3 */}
            <div className="bg-slate-900/50 p-8 rounded-2xl border border-emerald-900/30 hover:border-emerald-500/50 transition-all group">
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
                <Gem className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-emerald-100 mb-3">3. Identité 2.0</h3>
              <p className="text-emerald-200/60 leading-relaxed text-sm">
                Ne "fais" pas juste les choses. "Deviens" la personne qui les fait naturellement. Une transformation de l'intérieur vers l'extérieur.
              </p>
            </div>

          </div>
        </div>

        {/* VISUAL SPLIT - PHASE 1 */}
        <div className="max-w-5xl mx-auto px-6 mb-32">
          <div className="flex items-center justify-center gap-3 mb-12">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Hammer className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 1 : Construction du Temple</h2>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900 rounded-3xl border border-emerald-900/50 overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
            <div className="grid md:grid-cols-2 items-center">
              <div className="h-full min-h-[400px] bg-slate-950/50 relative flex items-center justify-center border-r border-emerald-900/30 order-2 md:order-1">
                {/* Abstract Representation of Foundation */}
                <div className="relative w-64 h-64">
                  <div className="absolute inset-0 border-2 border-emerald-500/30 rotate-0 animate-pulse"></div>
                  <div className="absolute inset-4 border border-emerald-500/20 rotate-45"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Shield className="w-16 h-16 text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                  </div>
                </div>
              </div>
              <div className="p-12 order-1 md:order-2">
                <div className="inline-flex items-center gap-2 mb-6 text-emerald-500 font-mono text-xs font-bold uppercase tracking-widest">
                  <Lock className="w-3 h-3" />
                  Fondations Solides
                </div>
                <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6 text-white">
                  Le Grand Oeuvre
                </h2>
                <p className="text-emerald-200/70 mb-8 leading-relaxed">
                  Les 12 premières semaines sont dédiées à nettoyer le terrain et poser les premières pierres. Tu ne construis pas sur du sable.
                </p>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3 text-emerald-100">
                    <Sword className="w-5 h-5 text-emerald-500" />
                    <span>Audit complet des croyances</span>
                  </li>
                  <li className="flex items-center gap-3 text-emerald-100">
                    <Sword className="w-5 h-5 text-emerald-500" />
                    <span>Régulation du système nerveux</span>
                  </li>
                  <li className="flex items-center gap-3 text-emerald-100">
                    <Sword className="w-5 h-5 text-emerald-500" />
                    <span>Définition de la Mission de Vie</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* VISUAL SPLIT - PHASE 2 */}
        <div className="max-w-5xl mx-auto px-6 mb-32">
          <div className="flex items-center justify-center gap-3 mb-12">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Gem className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 2 : Amélioration du Temple</h2>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900 rounded-3xl border border-emerald-900/50 overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
            <div className="grid md:grid-cols-2 items-center">
              <div className="p-12">
                <div className="inline-flex items-center gap-2 mb-6 text-emerald-500 font-mono text-xs font-bold uppercase tracking-widest">
                  <Lock className="w-3 h-3" />
                  Contenu Exclusif
                </div>
                <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6 text-white">
                  La Forge & La Table Ronde
                </h2>
                <p className="text-emerald-200/70 mb-8 leading-relaxed">
                  Accède à un espace de travail mental unique. Chaque semaine, un nouveau module pour forger une facette de ton caractère, et un rituel hebdomadaire pour aligner tes actions.
                </p>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3 text-emerald-100">
                    <Sword className="w-5 h-5 text-emerald-500" />
                    <span>Gamification du développement personnel</span>
                  </li>
                  <li className="flex items-center gap-3 text-emerald-100">
                    <Sword className="w-5 h-5 text-emerald-500" />
                    <span>Rituel hebdomadaire "Table Ronde"</span>
                  </li>
                  <li className="flex items-center gap-3 text-emerald-100">
                    <Sword className="w-5 h-5 text-emerald-500" />
                    <span>Exercices de mise en pratique</span>
                  </li>
                </ul>
              </div>
              <div className="h-full min-h-[400px] bg-slate-950/50 relative flex items-center justify-center border-l border-emerald-900/30">
                {/* Abstract Representation of the Forge */}
                <div className="relative w-64 h-64">
                  <div className="absolute inset-0 border border-emerald-500/30 rotate-45 animate-pulse"></div>
                  <div className="absolute inset-4 border border-emerald-500/20 -rotate-12"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Crown className="w-16 h-16 text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-8">Prêt à changer de dimension ?</h2>
          <button
            onClick={() => navigate('/global-plan')}
            className="px-12 py-6 rounded-full bg-emerald-600 text-white font-bold text-xl hover:bg-emerald-500 hover:scale-105 transition-all shadow-2xl shadow-emerald-900/50 flex items-center justify-center gap-3 mx-auto"
          >
            Générer mon Plan (Gratuit)
            <ArrowRight className="w-6 h-6" />
          </button>
          <p className="mt-6 text-emerald-500/60 text-sm">Inclus dans l'offre Premium.</p>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-950 border-t border-emerald-900/30 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-emerald-600 rounded-md flex items-center justify-center text-slate-950 text-xs font-bold font-serif">
              S
            </div>
            <span className="font-bold text-emerald-50">Sophia</span>
          </div>
          <div className="text-sm text-emerald-500/40">
            © 2024 MySophia Inc.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ProductArchitect;

