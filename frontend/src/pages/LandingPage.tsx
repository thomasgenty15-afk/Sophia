import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, 
  Brain, 
  Target, 
  Sparkles, 
  Shield, 
  Zap, 
  BookOpen,
  CheckCircle2,
  Play,
  Activity,
  Lock,
  Fish,
  MessageCircle // Import MessageCircle
} from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-violet-100 selection:text-violet-900">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-violet-200 font-serif">
              S
            </div>
            <span className="font-bold text-lg md:text-xl tracking-tight text-slate-900">Sophia</span>
          </div>
          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
              <button onClick={() => navigate('/le-plan')} className="hover:text-violet-600 transition-colors">Le Plan</button>
              <button onClick={() => navigate('/l-architecte')} className="hover:text-violet-600 transition-colors flex items-center gap-1">
                L'Architecte <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">PRO</span>
              </button>
              <button onClick={() => navigate('/formules')} className="hover:text-violet-600 transition-colors">Offres</button>
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

      {/* HERO SECTION (PROPOSITION DE VALEUR GÉNÉRALE) */}
      <header className="relative pt-32 pb-16 md:pt-52 md:pb-32 overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-violet-50/50 rounded-full blur-3xl -z-10 opacity-60 translate-x-1/3 -translate-y-1/4" />
        
        <div className="max-w-4xl mx-auto px-4 md:px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-6 md:mb-8 animate-fade-in-up">
            <Activity className="w-3 h-3 md:w-3 md:h-3 text-violet-600" />
            Productivité & Psychologie
          </div>
          
          <h1 className="text-3xl min-[350px]:text-4xl sm:text-5xl md:text-7xl font-bold text-slate-900 mb-6 md:mb-8 leading-[1.1] tracking-tight">
            Ne rêve plus ta vie.<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">
              Bâtis-la.
            </span>
          </h1>
          
          <p className="text-base md:text-xl text-slate-600 mb-8 md:mb-12 max-w-2xl mx-auto leading-relaxed">
            Fini le chaos. Sophia transforme tes ambitions en un <strong>système d'actions concrètes</strong> et t'accompagne 24/7 pour ne rien lâcher.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4">
            <button 
              onClick={() => navigate('/global-plan')}
              className="w-full sm:w-auto px-6 py-3 md:px-8 md:py-4 rounded-xl bg-violet-600 text-white font-bold text-base md:text-lg hover:bg-violet-700 transition-all shadow-xl shadow-violet-200 flex items-center justify-center gap-2 group"
            >
              Générer mon Plan (Gratuit)
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="w-full sm:w-auto px-6 py-3 md:px-8 md:py-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-base md:text-lg hover:border-violet-200 hover:bg-violet-50/50 transition-all flex items-center justify-center gap-2">
              <Play className="w-4 h-4 md:w-5 md:h-5 fill-current text-violet-600" />
              Comment ça marche ?
            </button>
          </div>
        </div>
      </header>

      {/* PART 1: LE CORE PRODUCT (ECOSYSTEME BENTO GRID) */}
      <section className="py-32 bg-slate-50 relative overflow-hidden">
        
        {/* --- LIVING BACKGROUND EFFECT --- */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Blob Violet (Sous Clarté) */}
          <div className="absolute top-[20%] left-[20%] w-96 h-96 bg-violet-300/30 rounded-full blur-3xl mix-blend-multiply animate-blob"></div>
          
          {/* Blob Emerald (Sous WhatsApp) */}
          <div className="absolute top-[20%] right-[20%] w-96 h-96 bg-emerald-300/30 rounded-full blur-3xl mix-blend-multiply animate-blob animation-delay-2000"></div>
          
          {/* Blob Amber (Sous Adaptation) */}
          <div className="absolute bottom-[10%] left-[20%] w-96 h-96 bg-amber-200/20 rounded-full blur-3xl mix-blend-multiply animate-blob-restricted animation-delay-4000"></div>

          {/* Blob Indigo (Sous Grimoire) */}
          <div className="absolute bottom-[10%] right-[20%] w-96 h-96 bg-indigo-300/30 rounded-full blur-3xl mix-blend-multiply animate-blob animation-delay-6000"></div>
        </div>

        {/* Inline Styles for Blob Animation (simpler than editing global css) */}
        <style>{`
          @keyframes blob {
            0% { transform: translate(0px, 0px) scale(1); }
            33% { transform: translate(150px, -100px) scale(1.4); }
            66% { transform: translate(-100px, 100px) scale(0.6); }
            100% { transform: translate(0px, 0px) scale(1); }
          }
          .animate-blob {
            animation: blob 20s infinite alternate cubic-bezier(0.4, 0, 0.2, 1);
          }
          .animation-delay-2000 {
            animation-delay: 2s;
          }
          .animation-delay-4000 {
            animation-delay: 4s;
          }
        `}</style>

        <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-12 md:mb-20">
            <h2 className="text-2xl md:text-5xl font-bold text-slate-900 mb-4 md:mb-6 tracking-tight">
              Le Système <span className="text-violet-600">Sophia</span>
            </h2>
            <p className="text-sm md:text-lg text-slate-500 max-w-2xl mx-auto">
              Ne compte plus sur ta volonté. Appuie-toi sur une architecture conçue pour rendre l'échec difficile.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
            
            {/* CARTE 1 : LE PLAN (Grande - Haut Gauche) */}
            <div className="md:col-span-7 bg-white/80 backdrop-blur-xl rounded-3xl p-6 md:p-10 shadow-xl shadow-violet-100/50 border border-white/50 relative group overflow-hidden hover:border-violet-300/50 transition-all duration-500 hover:shadow-2xl hover:shadow-violet-200/50 flex flex-col">
              {/* Subtle Gradient Overlay on Hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-50/0 via-violet-50/0 to-violet-100/0 group-hover:to-violet-100/30 transition-all duration-500"></div>
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center text-violet-600 mb-4 md:mb-6 shadow-sm group-hover:scale-110 transition-transform duration-500 ring-1 ring-violet-100">
                  <Target className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <h3 className="text-lg md:text-2xl font-bold text-slate-900 mb-2 md:mb-4">Clarté Immédiate</h3>
                <p className="text-slate-600 leading-relaxed mb-6 md:mb-8 text-sm md:text-lg">
                  Fini le brouillard. L'IA génère une <span className="text-slate-900">feuille de route tactique</span> adaptée à ton niveau de chaos actuel.
                </p>
                
                {/* Mini UI Mockup */}
                <div className="bg-white/50 rounded-xl p-3 md:p-4 border border-white/60 max-w-md shadow-inner">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"></div>
                    <div className="h-2 w-24 bg-slate-200 rounded-full"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-8 w-full bg-white rounded-lg border border-slate-100 shadow-sm flex items-center px-3">
                      <div className="w-4 h-4 rounded-full border-2 border-violet-200 mr-3"></div>
                      <div className="h-2 w-32 bg-slate-100 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CARTE 2 : WHATSAPP (Moyenne - Haut Droite) */}
            <div className="md:col-span-5 bg-white/80 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-xl shadow-emerald-100/50 border border-white/50 relative group overflow-hidden hover:border-emerald-300/50 transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-200/50 flex flex-col">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 via-emerald-50/0 to-emerald-100/0 group-hover:to-emerald-100/30 transition-all duration-500"></div>
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center text-emerald-600 mb-4 md:mb-6 shadow-sm group-hover:rotate-12 transition-transform duration-500 ring-1 ring-emerald-100">
                  <MessageCircle className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                  <h3 className="text-lg md:text-2xl font-bold text-slate-900 mb-2 md:mb-4">Le Moteur Whatsapp</h3>
                <p className="text-slate-600 leading-relaxed text-sm md:text-lg">
                  Pas besoin d'y penser. Sophia vient aux nouvelles. Deux-trois questions via Whatsapp et c'est terminé.
                </p>
              </div>
            </div>

            {/* CARTE 3 : ADAPTATION (Moyenne - Bas Gauche) */}
            <div className="md:col-span-5 bg-white/80 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-xl shadow-amber-100/50 border border-white/50 relative group overflow-hidden hover:border-amber-300/50 transition-all duration-500 hover:shadow-2xl hover:shadow-amber-200/50 flex flex-col">
               <div className="absolute inset-0 bg-gradient-to-br from-amber-50/0 via-amber-50/0 to-amber-100/0 group-hover:to-amber-100/30 transition-all duration-500"></div>

              <div className="relative z-10 flex flex-col h-full">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center text-amber-600 mb-4 md:mb-6 shadow-sm group-hover:scale-110 transition-transform duration-500 ring-1 ring-amber-100">
                  <Zap className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <h3 className="text-lg md:text-2xl font-bold text-slate-900 mb-2 md:mb-4">Adaptation</h3>
                <p className="text-slate-600 leading-relaxed text-sm md:text-lg">
                  Le plan n'est pas figé. Chaque semaine, l'IA te permet de recalibrer tes objectifs selon tes résultats réels.
                </p>
              </div>
            </div>

            {/* CARTE 4 : GRIMOIRE (Grande - Bas Droite) */}
            <div className="md:col-span-7 bg-white/80 backdrop-blur-xl rounded-3xl p-6 md:p-10 shadow-xl shadow-indigo-100/50 border border-white/50 relative group overflow-hidden hover:border-indigo-300/50 transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-200/50">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 via-indigo-50/0 to-indigo-100/0 group-hover:to-indigo-100/30 transition-all duration-500"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-8">
                <div className="flex-1">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center text-indigo-600 mb-4 md:mb-6 shadow-sm group-hover:-rotate-12 transition-transform duration-500 ring-1 ring-indigo-100">
                    <BookOpen className="w-6 h-6 md:w-7 md:h-7" />
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold text-slate-900 mb-2 md:mb-4">Le Grimoire</h3>
                  <p className="text-slate-600 leading-relaxed text-sm md:text-lg">
                    Rien ne se perd. Tes victoires, tes mantras et tes stratégies s'accumulent ici.
                  </p>
                </div>
                
                {/* Decorative visual for Grimoire (STACK OF CARDS) */}
                <div className="w-full md:w-1/3 h-32 relative flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500 hidden md:flex">
                   {/* Card 3 (Back) */}
                   <div className="absolute w-24 h-32 bg-indigo-200/50 rounded-xl border border-indigo-300/50 transform rotate-12 translate-x-4 backdrop-blur-md"></div>
                   {/* Card 2 (Middle) */}
                   <div className="absolute w-24 h-32 bg-indigo-100/80 rounded-xl border border-indigo-200 transform -rotate-6 -translate-x-2 backdrop-blur-md"></div>
                   {/* Card 1 (Front) */}
                   <div className="absolute w-24 h-32 bg-white rounded-xl border border-indigo-100 shadow-lg transform rotate-0 flex items-center justify-center">
                     <div className="w-12 h-1 bg-indigo-100 rounded-full mb-2"></div>
                     <div className="w-8 h-1 bg-indigo-100 rounded-full"></div>
                   </div>
                </div>
              </div>
            </div>

          </div>
          
          <div className="mt-12 md:mt-20 flex justify-center">
            <button 
              onClick={() => navigate('/le-plan')}
              className="group flex items-center gap-2 text-violet-600 font-bold text-sm md:text-base transition-colors hover:text-violet-700"
            >
                Découvrir tout le système
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* PART 1.5: SOPHIA (L'ALLIÉE) */}
      <section className="py-24 bg-slate-50 border-t border-slate-100 overflow-y-visible overflow-x-hidden">
        <div className="max-w-6xl mx-auto px-3 min-[340px]:px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            
            {/* VISUAL: CHAT SIMULATION */}
            <div className="relative order-2 lg:order-1 flex justify-center w-full overflow-visible">
              {/* Phone Frame Mockup */}
              <div className="relative mx-auto border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] h-[600px] w-[220px] min-[300px]:w-[260px] min-[340px]:w-[300px] shadow-xl transform scale-[0.55] sm:scale-[0.75] md:scale-100 origin-top sm:origin-center lg:origin-top-left mt-4 sm:mt-0 mb-[-200px] sm:mb-0">
                <div className="h-[32px] w-[3px] bg-gray-800 absolute -start-[17px] top-[72px] rounded-s-lg"></div>
                <div className="h-[46px] w-[3px] bg-gray-800 absolute -start-[17px] top-[124px] rounded-s-lg"></div>
                <div className="h-[46px] w-[3px] bg-gray-800 absolute -start-[17px] top-[178px] rounded-s-lg"></div>
                <div className="h-[64px] w-[3px] bg-gray-800 absolute -end-[17px] top-[142px] rounded-e-lg"></div>
                <div className="rounded-[2rem] overflow-hidden w-full h-full bg-white relative">
                  
                  {/* Chat Header */}
                  <div className="bg-[#075E54] p-4 flex items-center gap-3 text-white shadow-sm z-10 relative">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">S</div>
                    <div>
                      <div className="font-bold text-sm">Sophia</div>
                      <div className="text-[10px] opacity-80">En ligne</div>
                    </div>
                  </div>

                  {/* Chat Background */}
                  <div className="absolute inset-0 bg-[#e5ddd5] opacity-50"></div>

                  {/* Messages */}
                  <div className="p-4 space-y-4 relative z-10 text-xs">
                    
                    {/* Day 1: Prod */}
                    <div className="text-center text-[10px] text-slate-400 my-4 font-bold uppercase">Mardi</div>
                    
                    <div className="flex justify-start">
                      <div className="bg-white text-slate-800 p-3 rounded-lg rounded-tl-none shadow-sm max-w-[85%]">
                        <p>Hey Alex 👋 Bilan de la journée ? As-tu validé tes 30min de Deep Work ?</p>
                        <span className="text-[9px] text-slate-400 block text-right mt-1">19:30</span>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <div className="bg-[#dcf8c6] text-slate-800 p-3 rounded-lg rounded-tr-none shadow-sm max-w-[85%]">
                        <p>Oui c'est fait !</p>
                        <span className="text-[9px] text-slate-400 block text-right mt-1">19:42</span>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="bg-white text-slate-800 p-3 rounded-lg rounded-tl-none shadow-sm max-w-[85%]">
                        <p>Boom ! 👊 C'est noté. Tu gardes le rythme.</p>
                        <span className="text-[9px] text-slate-400 block text-right mt-1">19:42</span>
                      </div>
                    </div>

                    {/* Day 2: Down */}
                    <div className="text-center text-[10px] text-slate-400 my-4 font-bold uppercase">Aujourd'hui</div>

                    <div className="flex justify-end">
                      <div className="bg-[#dcf8c6] text-slate-800 p-3 rounded-lg rounded-tr-none shadow-sm max-w-[85%]">
                        <p>J'ai envie de tout lâcher ce soir... Je suis crevé.</p>
                        <span className="text-[9px] text-slate-400 block text-right mt-1">21:15</span>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="bg-white text-slate-800 p-3 rounded-lg rounded-tl-none shadow-sm max-w-[85%]">
                        <p>Je comprends. Respire. C'est juste une vague de fatigue, ça ne remet pas tout en cause.</p>
                        <span className="text-[9px] text-slate-400 block text-right mt-1">21:15</span>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="bg-white text-slate-800 p-3 rounded-lg rounded-tl-none shadow-sm max-w-[85%]">
                        <p>Fais juste le minimum : pas d'écrans ce soir. Le reste attendra demain. On sécurise le sommeil. Ok ?</p>
                        <span className="text-[9px] text-slate-400 block text-right mt-1">21:16</span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
              
              {/* Floating Elements */}
              <div className="absolute top-1/4 -left-12 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 animate-bounce duration-[3000ms] hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center text-violet-600">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Soutien 24/7</div>
                    <div className="text-xs text-slate-500">Toujours dispo</div>
                  </div>
                </div>
              </div>

            </div>

            {/* TEXT CONTENT */}
            <div className="order-1 lg:order-2 w-full min-w-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-bold uppercase tracking-wider mb-6">
                <Sparkles className="w-3 h-3" />
                Ton Alliée IA
              </div>
              
              <h2 className="text-xl sm:text-3xl md:text-5xl font-bold text-slate-900 mb-6 leading-tight break-words hyphens-auto">
                Plus qu'un algorithme.<br/>
                <span className="text-violet-600">Une présence qui te comprend.</span>
              </h2>
              
              <p className="text-sm md:text-lg text-slate-600 mb-8 leading-relaxed break-words">
                Le chemin est solitaire ? Plus maintenant. <strong>Sophia</strong> vit dans ton WhatsApp. Elle est là pour célébrer tes victoires, mais surtout pour te relever quand tu trébuches.
              </p>

              <div className="space-y-6">
                <div className="flex gap-3 min-[340px]:gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-base md:text-lg break-words">Suivi Proactif</h4>
                    <p className="text-slate-500 text-xs md:text-sm break-words">Pas besoin d'y penser. Sophia vient aux nouvelles. Deux-trois questions via Whatsapp et c'est terminé.</p>
                  </div>
                </div>

                <div className="flex gap-3 min-[340px]:gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-base md:text-lg break-words">Soutien Inconditionnel</h4>
                    <p className="text-slate-500 text-xs md:text-sm break-words">Un coup de mou à 23h ? Sophia ne juge jamais. Elle t'écoute, te comprend et te remet en selle.</p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center w-full mt-8">
                <button onClick={() => navigate('/le-plan')} className="group flex items-center gap-2 text-violet-600 font-bold text-sm md:text-base transition-colors hover:text-violet-700">
                    Découvrir Sophia
                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* PART 2: L'UPSELL (L'ARCHITECTE) */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        {/* Background FX */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2"></div>
        
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            
            {/* Text Content */}
            <div className="flex flex-col h-full">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-bold uppercase tracking-wider mb-6 w-fit">
                <Lock className="w-3 h-3" />
                Module Premium
              </div>
              <div className="mb-6 relative">
                 <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tighter">
                    Tu veux aller plus loin&nbsp;?
                 </h2>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight text-emerald-400 -mt-4 font-serif">
                Deviens l'Architecte.
              </h2>
              <p className="text-slate-300 text-lg mb-8 leading-relaxed">
                Changer ses actions ne suffit pas toujours. Pour des résultats explosifs, tu dois changer <strong>Ton Identité.</strong>
              </p>
              
              <div className="space-y-6 mb-10">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700 font-bold text-emerald-400">1</div>
                  <div>
                    <h4 className="font-bold text-white text-lg">Déconstruis tes blocages</h4>
                    <p className="text-slate-400 text-sm">Identifie et brise les croyances limitantes qui te gardent dans ton "petit bocal".</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700 font-bold text-emerald-400">2</div>
                  <div>
                    <h4 className="font-bold text-white text-lg">Définis ta Version 2.0</h4>
                    <p className="text-slate-400 text-sm">Utilise l'IA pour construire, brique par brique, l'identité de la personne qui a déjà réussi.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700 font-bold text-emerald-400">3</div>
                  <div>
                    <h4 className="font-bold text-white text-lg">Gamifie ton développement personnel</h4>
                    <p className="text-slate-400 text-sm">Transforme ta vie en RPG où chaque action te fait gagner de l'expérience et monter de niveau.</p>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex justify-center w-full">
                  <button onClick={() => navigate('/l-architecte')} className="group flex items-center gap-2 text-emerald-400 font-bold text-sm md:text-base transition-colors hover:text-emerald-300">
                    Découvrir l'architecte
                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              </div>
            </div>

            {/* Visual Content (Flip Card) */}
            <div className="relative h-[680px] min-[340px]:h-[600px] min-[380px]:h-[560px] min-[420px]:h-[520px] min-[480px]:h-[480px] min-[540px]:h-[440px] min-[600px]:h-[420px] w-full group perspective-1000">
              <div 
                className="relative w-full h-full transition-all duration-700 group-hover:rotate-y-180"
                style={{ transformStyle: 'preserve-3d' }}
              >
                
                {/* FACE A (RECTO) */}
                <div 
                  className="absolute inset-0"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl transform rotate-6 opacity-20 blur-lg"></div>
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 md:p-8 shadow-2xl relative h-full flex flex-col">
                    <div className="flex flex-col min-[340px]:flex-row items-center justify-between mb-6 md:mb-8 border-b border-slate-700 pb-6 gap-4 min-[340px]:gap-0">
                      <div className="text-center min-[340px]:text-left">
                        <div className="text-[10px] md:text-xs text-slate-400 uppercase tracking-widest mb-1">Mode Actuel</div>
                        <div className="font-bold text-white text-lg md:text-xl">Survivant</div>
                      </div>
                      <ArrowRight className="text-emerald-500 w-5 h-5 md:w-6 md:h-6 animate-pulse mx-2 rotate-90 min-[340px]:rotate-0 transform transition-transform" />
                      <div className="text-center min-[340px]:text-right">
                        <div className="text-[10px] md:text-xs text-emerald-400 uppercase tracking-widest mb-1">Mode Cible</div>
                        <div className="font-bold text-white text-lg md:text-xl">Architecte</div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between p-3 bg-slate-700/50 rounded-lg gap-1">
                        <span className="text-slate-300 text-sm">Vision</span>
                        <span className="text-emerald-400 text-sm font-bold text-right">Limitée → Illimitée</span>
                      </div>
                      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between p-3 bg-slate-700/50 rounded-lg gap-1">
                        <span className="text-slate-300 text-sm">Énergie</span>
                        <span className="text-emerald-400 text-sm font-bold text-right">Réactive → Créatrice</span>
                      </div>
                      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between p-3 bg-slate-700/50 rounded-lg gap-1">
                        <span className="text-slate-300 text-sm">Actions</span>
                        <span className="text-emerald-400 text-sm font-bold text-right">Forcées → Naturelles</span>
                      </div>
                    </div>

                    {/* ENCART CARPE KOI */}
                    <div className="mt-auto pt-6 border-t border-slate-700 flex items-start gap-3 opacity-80">
                       <Fish className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                       <p className="text-[10px] min-[340px]:text-xs text-slate-400 leading-relaxed italic">
                         "Une carpe Koï reste petite dans un bocal, mais devient un dragon dans l'océan. Ton identité est ton bocal, tu es la carpe Koï. Avec Sophia, définis ton océan."
                       </p>
                    </div>
                  </div>
                </div>

                {/* FACE B (VERSO) */}
                <div 
                  className="absolute inset-0 h-full w-full rounded-2xl bg-slate-900 border border-emerald-900/50 shadow-2xl overflow-hidden flex items-center justify-center text-center p-8"
                  style={{ 
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)'
                  }}
                >
                  {/* Background effects */}
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10"></div>
                  <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-emerald-600/20 rounded-full blur-3xl"></div>
                  <div className="absolute -top-20 -left-20 w-60 h-60 bg-violet-600/20 rounded-full blur-3xl"></div>
                  
                  <div className="relative z-10">
                    <Sparkles className="w-12 h-12 text-emerald-400 mx-auto mb-6 animate-pulse" />
                    <h3 className="text-2xl font-serif font-bold text-white leading-relaxed mb-6">
                      "On ne grandit que jusqu’à la taille du monde que l’on s’autorise."
                    </h3>
                    <p className="text-emerald-400 font-serif italic text-lg">- Sophia</p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 text-center relative overflow-hidden bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-8 tracking-tight">
            Commence par la base.<br/>
            <span className="text-violet-600">Génère ton Plan.</span>
          </h2>
          
          <button 
            onClick={() => navigate('/global-plan')}
            className="px-12 py-6 rounded-full bg-slate-900 text-white font-bold text-xl hover:bg-violet-600 hover:scale-105 transition-all shadow-2xl shadow-slate-300 flex items-center justify-center gap-3 mx-auto"
          >
            Générer mon Plan (Gratuit)
            <ArrowRight className="w-6 h-6" />
          </button>
          
          <p className="mt-8 text-slate-500">
            Rejoignez les pionniers qui ont arrêté de forcer.
          </p>
        </div>
      </section>

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
            © 2024 sophia-coach.ai
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;