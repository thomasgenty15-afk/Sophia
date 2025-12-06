import { useNavigate } from 'react-router-dom';
import { 
  Check,
  X,
  Zap,
  MessageCircle,
  Brain,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  Shield,
  Target
} from 'lucide-react';

const Formules = () => {
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
          <div className="flex items-center gap-4 md:gap-8">
             <button 
              onClick={() => navigate('/auth')}
              className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors"
            >
              Connexion
            </button>
            <button 
              onClick={() => navigate('/global-plan')}
              className="px-4 py-2 md:px-5 md:py-2.5 rounded-full bg-slate-900 text-white text-xs md:text-sm font-bold hover:bg-violet-600 transition-all shadow-lg hover:shadow-violet-200"
            >
              Essai Gratuit
            </button>
          </div>
        </div>
      </nav>

      {/* HEADER */}
      <div className="pt-32 pb-12 md:pt-40 md:pb-20 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-6">
          <Sparkles className="w-3 h-3" />
          Offre de Lancement
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
          Commence gratuitement.<br/>
          <span className="text-violet-600">Choisis ton évolution ensuite.</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Pendant <strong>1 mois</strong>, tu as accès à tout : Le Plan, Sophia sur WhatsApp et les premiers modules de l'Architecte. Sans engagement.
        </p>
      </div>

      {/* PRICING CARDS */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* OPTION 1: LE SYSTÈME (10€) */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 relative group">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Le Système</h3>
              <p className="text-sm text-slate-500 min-h-[40px]">Pour ceux qui veulent juste la structure et l'outil de pilotage.</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-slate-900">9,90€</span>
              <span className="text-slate-400">/mois</span>
            </div>
            
            <button onClick={() => navigate('/global-plan')} className="w-full py-3 rounded-xl border-2 border-slate-100 text-slate-700 font-bold hover:border-violet-600 hover:text-violet-600 transition-all mb-8">
              Commencer
            </button>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <LayoutDashboard className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">Dashboard d'Actions dynamique</span>
              </div>
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">Génération de Plan IA illimitée</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">Suivi des habitudes & tâches</span>
              </div>
              <div className="flex items-start gap-3 opacity-50">
                <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-400 line-through">Sophia sur WhatsApp</span>
              </div>
              <div className="flex items-start gap-3 opacity-50">
                <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-400 line-through">L'Architecte (Identité)</span>
              </div>
            </div>
          </div>

          {/* OPTION 2: L'ALLIANCE (20€) - HIGHLIGHTED */}
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative transform md:-translate-y-4 z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-violet-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg whitespace-nowrap">
              Le plus populaire
            </div>
            
            <div className="mb-6">
              <h3 className="text-xl font-bold text-white mb-2">L'Alliance</h3>
              <p className="text-sm text-slate-400 min-h-[40px]">Le combo parfait : Le système + Ton coach IA proactif.</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-bold text-white">19,90€</span>
              <span className="text-slate-500">/mois</span>
            </div>
            
            <button onClick={() => navigate('/global-plan')} className="w-full py-4 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 transition-all shadow-lg shadow-violet-900/50 mb-8 flex items-center justify-center gap-2">
              Je veux Sophia
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Check className="w-3 h-3" />
                </div>
                <span className="text-sm text-slate-300">Tout ce qu'il y a dans "Le Système"</span>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 animate-pulse" />
                <span className="text-sm text-emerald-400 font-bold">Sophia sur WhatsApp (24/7)</span>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">Suivi proactif & Relances</span>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">Soutien psychologique & Motivation</span>
              </div>
               <div className="flex items-start gap-3 opacity-50">
                <X className="w-5 h-5 text-slate-600 flex-shrink-0" />
                <span className="text-sm text-slate-600 line-through">L'Architecte (Identité)</span>
              </div>
            </div>
          </div>

          {/* OPTION 3: L'ÉVOLUTION (30€) */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 relative group">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">L'Architecte</h3>
              <p className="text-sm text-slate-500 min-h-[40px]">Pour ceux qui veulent redéfinir leur identité en profondeur.</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-slate-900">29,90€</span>
              <span className="text-slate-400">/mois</span>
            </div>
            
            <button onClick={() => navigate('/global-plan')} className="w-full py-3 rounded-xl border-2 border-slate-100 text-slate-700 font-bold hover:border-emerald-600 hover:text-emerald-600 transition-all mb-8">
              Commencer
            </button>

            <div className="space-y-4">
               <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 flex-shrink-0">
                  <Check className="w-3 h-3" />
                </div>
                <span className="text-sm text-slate-600">Tout ce qu'il y a dans "L'Alliance"</span>
              </div>
              <div className="flex items-start gap-3">
                <Brain className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-900 font-bold">Module "Architecte" Complet</span>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-600">Travail sur l'Identité & Vision</span>
              </div>
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-600">Déconstruction des blocages</span>
              </div>
            </div>
          </div>

        </div>
      </div>

       {/* FAQ / REASSURANCE */}
       <section className="bg-white py-20 border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-12">Questions Fréquentes</h2>
            
            <div className="space-y-8 text-left">
                <div>
                    <h3 className="font-bold text-slate-900 mb-2">Comment fonctionne le mois gratuit ?</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">Tu accèdes à tout (l'offre Architecte à 30€) pendant 30 jours. Aucune carte bancaire n'est débitée avant la fin. Tu peux annuler à tout moment.</p>
                </div>
                <div>
                    <h3 className="font-bold text-slate-900 mb-2">Puis-je changer d'offre après le mois gratuit ?</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">Oui ! À la fin de l'essai, tu choisis ce que tu gardes. Si tu veux juste le Dashboard (10€), ou Sophia (20€), ou tout garder (30€). C'est toi qui décides.</p>
                </div>
                <div>
                    <h3 className="font-bold text-slate-900 mb-2">Pourquoi Sophia est différente de ChatGPT ?</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">ChatGPT est passif. Sophia est proactive. Elle te connaît, elle a accès à ton plan, et c'est elle qui vient te chercher sur WhatsApp quand tu décroches. C'est une relation, pas juste un outil.</p>
                </div>
            </div>
        </div>
       </section>

      {/* FOOTER */}
      <footer className="bg-slate-50 border-t border-slate-200 py-12">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
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

export default Formules;
