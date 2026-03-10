import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import { 
  ArrowRight, 
  Target, 
  Zap, 
  BookOpen,
  MessageCircle,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Shield
} from 'lucide-react';

const ProductPlan = () => {
  const navigate = useNavigate();
  const seoDescription = "Découvre le plan d'action IA de Sophia sur WhatsApp : un objectif clarifié, des relances proactives, un suivi continu et des ajustements pour tenir dans la vraie vie.";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-violet-100 selection:text-violet-900">
      <SEO 
        title="Plan d'action IA sur WhatsApp"
        description={seoDescription}
        canonical="https://sophia-coach.ai/le-plan"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Le Plan",
          "url": "https://sophia-coach.ai/le-plan",
          "description": seoDescription,
          "inLanguage": "fr-FR"
        }}
      />
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="w-7 h-7 md:w-8 md:h-8 rounded-lg" />
            <span className="font-bold text-xl tracking-tight text-slate-900 leading-none">Sophia</span>
          </div>
          <div className="flex items-center gap-8">
             <div className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
              <button onClick={() => navigate('/le-plan')} className="text-violet-600 font-bold">Le Plan</button>
              <button onClick={() => navigate('/l-architecte')} className="hover:text-violet-600 transition-colors flex items-center gap-1">
                L'Architecte <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">PRO</span>
              </button>
              <button onClick={() => navigate('/formules')} className="hover:text-violet-600 transition-colors">Offres</button>
              <button onClick={() => navigate('/legal')} className="hover:text-violet-600 transition-colors">Légal</button>
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
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-16 md:mb-24">
          <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-slate-500 hover:text-violet-600 mb-6 md:mb-8 transition-colors font-medium text-xs md:text-sm">
                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Retour à l'accueil
          </button>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-slate-200/60">
            <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-300/20 blur-3xl" />
            <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />

            <div className="relative grid gap-10 px-6 py-10 md:grid-cols-[1.15fr_0.85fr] md:px-10 md:py-14 lg:px-14">
              <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 md:text-xs">
                  <MessageCircle className="h-3 w-3 text-violet-600" />
                  Le plan qui vit sur WhatsApp
                </div>

                <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 md:text-6xl">
                  Transforme un objectif flou
                  <span className="block text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">
                    en exécution réelle.
                  </span>
                </h1>

                <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 md:mx-0 md:text-xl">
                  Sophia crée ton plan, vient vers toi sur WhatsApp pour suivre tes progrès, puis ajuste la trajectoire pour t'aider à tenir dans la vraie vie.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
                  <button 
                    onClick={() => navigate('/global-plan')}
                    className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-base font-bold text-white shadow-xl shadow-violet-200 transition-all hover:bg-violet-700"
                  >
                    Générer mon Plan
                    <ArrowRight className="h-5 w-5" />
                  </button>
                  <a
                    href="#comment-ca-marche"
                    className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-bold text-slate-700 transition-all hover:border-violet-200 hover:bg-violet-50/50"
                  >
                    Voir le système
                  </a>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600 md:justify-start md:text-sm">
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-2">Plan clair en quelques minutes</div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-2">Relances proactives sur WhatsApp</div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-2">Adaptation continue</div>
                </div>
              </div>

              <div className="relative">
                <div className="mx-auto w-[250px] sm:w-[265px] rounded-[2.15rem] border border-slate-200 bg-slate-950 p-3 shadow-2xl shadow-slate-300">
                  <div className="overflow-hidden rounded-[1.8rem] bg-[#ece5dd]">
                    <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold">S</div>
                      <div>
                        <div className="font-bold">Sophia</div>
                        <div className="text-xs opacity-80">En ligne</div>
                      </div>
                    </div>
                    <div className="min-h-[460px] space-y-3 p-4 text-[13px]">
                      <div className="text-center text-[10px] font-bold uppercase text-slate-400">Ce matin</div>
                      <div className="max-w-[88%] rounded-2xl rounded-tl-none bg-white p-3 text-slate-800 shadow-sm">
                        Bonjour 👋
                        <br />
                        <br />
                        Aujourd'hui, garde le cap avec tes 3 actions :
                        <br />
                        1. Éteindre les écrans 45 minutes avant de dormir
                        <br />
                        2. Faire tes 25 minutes de sport
                        <br />
                        3. Prendre ce rendez-vous avec la banquière.
                        <br />
                        C'est comme ça que tu redeviens quelqu'un sur qui tu peux compter ✨ Tu peux le faire.
                      </div>
                      <div className="ml-auto max-w-[78%] rounded-2xl rounded-tr-none bg-[#dcf8c6] p-3 text-slate-800 shadow-sm">
                        Ok, je m'y mets ce matin.
                      </div>
                      <div className="text-center text-[10px] font-bold uppercase text-slate-400">Ce soir</div>
                      <div className="max-w-[78%] rounded-2xl rounded-tl-none bg-white p-3 text-slate-800 shadow-sm">
                        Hello, comme ça s'est passé aujourd'hui ? 🙂  
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div id="comment-ca-marche" className="max-w-6xl mx-auto px-4 md:px-6 mb-16 md:mb-24">
          <div className="mb-8 md:mb-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-700">
              <Sparkles className="h-3 w-3" />
              Comment ça marche
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Un système simple à comprendre,
              <span className="block text-violet-600">difficile à laisser tomber.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="md:col-span-7 rounded-3xl border border-emerald-100 bg-white p-6 shadow-xl shadow-emerald-100/40 md:p-10">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <MessageCircle className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 md:text-3xl">1. Sophia te relance sur WhatsApp</h3>
              <p className="mt-4 text-base leading-relaxed text-slate-600 md:text-lg">
                Le vrai coeur du produit est là: ton plan ne reste pas dans un dashboard. Sophia vient vers toi pour maintenir le lien, vérifier l'avancée et t'éviter de disparaître dans le bruit du quotidien.
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-start gap-3 text-sm text-slate-600 md:text-base">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>Check-ins rapides, là où tu réponds déjà naturellement.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-slate-600 md:text-base">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>Moins de friction, plus de continuité.</span>
                </li>
              </ul>
            </div>

            <div className="md:col-span-5 rounded-3xl border border-violet-100 bg-white p-6 shadow-xl shadow-violet-100/40 md:p-10">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <Target className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">2. Un plan clair dès le départ</h3>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Sophia transforme ton objectif en prochaines actions concrètes, priorisées et réalistes.
              </p>
            </div>

            <div className="md:col-span-5 rounded-3xl border border-amber-100 bg-white p-6 shadow-xl shadow-amber-100/40 md:p-10">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <Zap className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">3. Le plan s'adapte à ta réalité</h3>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Fatigue, imprévus, perte de rythme: au lieu de casser, Sophia ajuste la trajectoire pour garder le cap.
              </p>
            </div>

            <div className="md:col-span-7 rounded-3xl border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-100/40 md:p-10">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <BookOpen className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 md:text-3xl">4. Mémoire et continuité dans le temps</h3>
              <p className="mt-4 text-base leading-relaxed text-slate-600 md:text-lg">
                Sophia se souvient de tes progrès, de tes blocages et de ce qui fonctionne pour toi. Tu ne repars pas de zéro à chaque coup de mou.
              </p>
            </div>
          </div>
        </div>

        {/* WHY IT WORKS */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-16 md:mb-32">
            <div className="bg-slate-900 rounded-3xl p-6 md:p-12 shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3"></div>
                
                <div className="relative z-10">
                    <div className="flex items-center gap-2 md:gap-3 mb-6 md:mb-8">
                        <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-violet-400" />
                        <h2 className="text-xl md:text-3xl font-bold tracking-tight">Pourquoi ça tient mieux qu'une simple todo list</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                        <div>
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-400 mb-3 md:mb-4">
                                <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-base min-[350px]:text-lg font-bold mb-2">Moins de friction</h3>
                            <p className="text-slate-400 text-xs min-[350px]:text-sm leading-relaxed">
                                Tu n'as pas besoin d'ouvrir une app de plus ni de te remotiver seul. Sophia te rejoint là où tu es déjà.
                            </p>
                        </div>

                        <div>
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-800 rounded-xl flex items-center justify-center text-violet-400 mb-3 md:mb-4">
                                <Shield className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-base min-[350px]:text-lg font-bold mb-2">Moins de culpabilisation</h3>
                            <p className="text-slate-400 text-xs min-[350px]:text-sm leading-relaxed">
                                Quand tu dérapes, Sophia n'en fait pas une preuve d'échec. Elle t'aide à repartir sans tout abandonner.
                            </p>
                        </div>

                        <div>
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-800 rounded-xl flex items-center justify-center text-amber-400 mb-3 md:mb-4">
                                <BookOpen className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-base min-[350px]:text-lg font-bold mb-2">Plus de continuité</h3>
                            <p className="text-slate-400 text-xs min-[350px]:text-sm leading-relaxed">
                                Tes progrès, tes routines et tes stratégies utiles restent visibles dans le temps au lieu de se dissoudre après trois jours.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* CTA */}
        <div className="text-center px-4">
            <p className="mx-auto mb-6 max-w-2xl text-slate-600 text-base md:text-lg">
              Commence simple: définis ton objectif, laisse Sophia construire le plan et active une présence proactive autour de ce qui compte pour toi.
            </p>
            <button 
              onClick={() => navigate('/global-plan')}
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
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="w-6 h-6 rounded-md" />
            <span className="font-bold text-slate-900">Sophia</span>
          </div>
          <div className="text-sm text-slate-500">
            © {new Date().getFullYear()} IKIZEN. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ProductPlan;

