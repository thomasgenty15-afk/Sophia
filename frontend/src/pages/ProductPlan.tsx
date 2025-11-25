import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, 
  Target, 
  Zap, 
  BookOpen,
  MessageCircle,
  CheckCircle2,
  Layout,
  ArrowLeft,
  Sparkles,
  Brain,
  Shield
} from 'lucide-react';

const ProductPlan = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-violet-100 selection:text-violet-900">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-7 h-7 md:w-8 md:h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-violet-200 font-serif">
              S
            </div>
            <span className="font-bold text-lg md:text-xl tracking-tight text-slate-900">Sophia</span>
          </div>
          <div className="flex items-center gap-8">
             <div className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
              <button onClick={() => navigate('/le-plan')} className="text-violet-600 font-bold">Le Plan</button>
              <button onClick={() => navigate('/l-architecte')} className="hover:text-violet-600 transition-colors flex items-center gap-1">
                L'Architecte <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">PRO</span>
              </button>
            </div>
            <button 
              onClick={() => navigate('/auth')}
              className="px-4 py-2 md:px-5 md:py-2.5 rounded-full bg-slate-900 text-white text-xs md:text-sm font-bold hover:bg-violet-600 transition-all shadow-lg hover:shadow-violet-200"
            >
              Accès Membre
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-24 md:pt-32 pb-12 md:pb-20">
        
        {/* HERO */}
        <div className="max-w-4xl mx-auto px-4 md:px-6 text-center mb-16 md:mb-24">
            <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-slate-500 hover:text-violet-600 mb-6 md:mb-8 transition-colors font-medium text-xs md:text-sm">
                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Retour à l'accueil
            </button>
            <h1 className="text-3xl min-[350px]:text-4xl sm:text-5xl md:text-7xl font-bold text-slate-900 mb-6 md:mb-8 leading-[1.1] tracking-tight">
                Le Système <span className="text-violet-600">Sophia</span>
            </h1>
            <p className="text-base min-[350px]:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Une architecture complète pour transformer le chaos en clarté. 
                Découvre les 4 piliers de ton futur plan d'action.
            </p>
        </div>

        {/* FEATURES GRID */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-16 md:mb-24">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                
                {/* FEATURE 1: CLARTÉ */}
                <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-violet-200 transition-all group">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                        <Target className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-3 md:mb-4">1. Clarté Immédiate</h3>
                    <p className="text-slate-600 leading-relaxed text-base md:text-lg">
                        Fini le brouillard. L'IA analyse ta situation et génère une <span className="font-bold text-violet-700">feuille de route tactique</span> adaptée à ton niveau de chaos actuel.
                    </p>
                    <ul className="mt-4 md:mt-6 space-y-2 md:space-y-3">
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                            <span>Découpage des gros objectifs en étapes simples.</span>
                        </li>
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                            <span>Priorisation automatique par l'IA.</span>
                        </li>
                    </ul>
                </div>

                {/* FEATURE 2: MOTEUR WHATSAPP & CHECK-IN */}
                <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl shadow-emerald-100/50 border border-slate-100 hover:border-emerald-200 transition-all group">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                        <MessageCircle className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-3 md:mb-4">2. Le Moteur WhatsApp</h3>
                    <p className="text-slate-600 leading-relaxed text-base md:text-lg">
                        Ton plan vit là où tu es. Sophia effectue tes <span className="font-bold text-violet-700">check-ins quotidiens</span> directement sur WhatsApp pour valider tes progrès.
                    </p>
                     <ul className="mt-4 md:mt-6 space-y-2 md:space-y-3">
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>Zéro friction : valide tes actions par un message.</span>
                        </li>
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>Analyse de ton état mental et physique.</span>
                        </li>
                    </ul>
                </div>

                {/* FEATURE 3 */}
                <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl shadow-amber-100/50 border border-slate-100 hover:border-amber-200 transition-all group">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                        <Zap className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-3 md:mb-4">3. Adaptation Continue</h3>
                    <p className="text-slate-600 leading-relaxed text-base md:text-lg">
                        l'IA permet à l'utilisateur de recalibrer ses objectifs et d'avancer à son rythme. Un système <span className="font-bold text-violet-700">à ton image</span>, tout simplement.
                    </p>
                     <ul className="mt-4 md:mt-6 space-y-2 md:space-y-3">
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <span>Ajustement automatique de la difficulté.</span>
                        </li>
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <span>Prise en compte des imprévus.</span>
                        </li>
                    </ul>
                </div>

                {/* FEATURE 4 */}
                <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl shadow-indigo-100/50 border border-slate-100 hover:border-indigo-200 transition-all group">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                        <BookOpen className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-3 md:mb-4">4. Le Grimoire</h3>
                    <p className="text-slate-600 leading-relaxed text-base md:text-lg">
                        Rien ne se perd. Les victoires, tes mantras et tes stratégies s'accumulent ici. C'est <span className="font-bold text-violet-700">l'historique de ton succès.</span>
                    </p>
                     <ul className="mt-4 md:mt-6 space-y-2 md:space-y-3">
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                            <span>Centralisation de tes connaissances.</span>
                        </li>
                        <li className="flex items-start gap-3 text-slate-500 text-sm md:text-base">
                            <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                            <span>Visualisation de ta progression long terme.</span>
                        </li>
                    </ul>
                </div>

            </div>
        </div>

        {/* DEEP TECH SECTION */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-16 md:mb-32">
            <div className="bg-slate-900 rounded-3xl p-6 md:p-12 shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3"></div>
                
                <div className="relative z-10">
                    <div className="flex items-center gap-2 md:gap-3 mb-6 md:mb-8">
                        <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-violet-400" />
                        <h2 className="text-xl md:text-3xl font-bold tracking-tight">Au-delà de la simple productivité</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                        <div>
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-400 mb-3 md:mb-4">
                                <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-base min-[350px]:text-lg font-bold mb-2">Hypnoses Fondamentales</h3>
                            <p className="text-slate-400 text-xs min-[350px]:text-sm leading-relaxed">
                                Accède à des sessions génériques puissantes couvrant les grands axes de transformation humaine : Confiance, Gestion du stress, Sommeil profond.
                            </p>
                        </div>

                        <div>
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-800 rounded-xl flex items-center justify-center text-violet-400 mb-3 md:mb-4">
                                <Brain className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-base min-[350px]:text-lg font-bold mb-2">Hypnose Sur-Mesure</h3>
                            <p className="text-slate-400 text-xs min-[350px]:text-sm leading-relaxed">
                                Sophia génère des sessions d'auto-hypnose ciblées pour tes blocages spécifiques. Tu ne luttes plus contre ton subconscient, tu le reprogrammes.
                            </p>
                        </div>

                        <div>
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-800 rounded-xl flex items-center justify-center text-amber-400 mb-3 md:mb-4">
                                <Shield className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-base min-[350px]:text-lg font-bold mb-2">Présence Gardienne 24/7</h3>
                            <p className="text-slate-400 text-xs min-[350px]:text-sm leading-relaxed">
                                Un coup de mou à 23h ? Une crise d'angoisse le dimanche ? Sophia est là pour te soutenir émotionnellement et te remettre en selle, sans jugement.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* CTA */}
        <div className="text-center px-4">
            <button 
              onClick={() => navigate('/onboarding')}
              className="px-8 py-4 md:px-12 md:py-6 rounded-full bg-slate-900 text-white font-bold text-lg md:text-xl hover:bg-violet-600 hover:scale-105 transition-all shadow-2xl shadow-slate-300 flex items-center justify-center gap-2 md:gap-3 mx-auto w-full md:w-auto"
            >
              Générer mon Plan (Gratuit)
              <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
            </button>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-100 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center text-white text-xs font-bold font-serif">
              S
            </div>
            <span className="font-bold text-slate-900">Sophia</span>
          </div>
          <div className="text-sm text-slate-500">
            © 2024 MySophia Inc.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ProductPlan;

