import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Sparkles, 
  Send, 
  Bot, 
  Save, 
  Lightbulb,
  History,
  CheckCircle2,
  Lock,
  Maximize2,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { WEEKS_CONTENT } from '../data/weeksContent';

const IdentityArchitect = () => {
  const navigate = useNavigate();
  const { weekId } = useParams();
  
  // On récupère la semaine spécifique
  const currentWeek = weekId ? WEEKS_CONTENT[weekId] : WEEKS_CONTENT["1"];
  
  // États
  const [activeQuestion, setActiveQuestion] = useState<string>(currentWeek?.subQuestions[0]?.id || "");
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    // Load answers from localStorage or initial state
    if (weekId) {
       const savedAnswers = localStorage.getItem(`architect_answers_week_${weekId}`);
       return savedAnswers ? JSON.parse(savedAnswers) : {};
    }
    return {};
  });
  
  // Chat
  const [messages, setMessages] = useState([
    { id: 1, sender: 'ai', text: `Salut Architecte. Bienvenue dans le module "${currentWeek?.title}". Par où veux-tu commencer ?` }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // NOUVEAU : State pour le mode Zen (Question active en plein écran)
  const [zenModeQuestionId, setZenModeQuestionId] = useState<string | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});
  const [showMobileChat, setShowMobileChat] = useState(false); // State pour le chat mobile

  // Effect to save answers to localStorage whenever they change
  useEffect(() => {
    if (weekId) {
      localStorage.setItem(`architect_answers_week_${weekId}`, JSON.stringify(answers));
    }
  }, [answers, weekId]);

  // Check if any answers exist for the current week
  const hasStartedWork = Object.keys(answers).length > 0;

  // Si l'ID n'est pas bon
  if (!currentWeek) return <div>Module introuvable</div>;

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 1000);
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    const newMsg = { id: Date.now(), sender: 'user', text: inputMessage };
    setMessages(prev => [...prev, newMsg]);
    setInputMessage("");

    setTimeout(() => {
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        sender: 'ai', 
        text: "C'est une réflexion intéressante. Comment cela s'inscrit-il dans ta vision à long terme ?" 
      }]);
    }, 1000);
  };

  // --- RENDER MODE ZEN (MODALE PLEIN ÉCRAN) ---
  if (zenModeQuestionId) {
    const q = currentWeek.subQuestions.find(sq => sq.id === zenModeQuestionId);
    if (!q) return null;

    return (
      <div className="fixed inset-0 bg-emerald-950 z-50 flex flex-col md:flex-row animate-fade-in">
        
        {/* GAUCHE : WORKSPACE (70%) */}
        <div className="flex-[70%] flex flex-col h-full relative bg-emerald-950 border-r border-emerald-900">
          {/* Header Zen */}
          <div className="p-4 md:p-6 flex justify-between items-center border-b border-emerald-900/50 bg-emerald-950/50 backdrop-blur-sm">
            <div className="flex items-center gap-2 md:gap-3 text-emerald-400">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
              <span className="text-xs md:text-sm font-bold uppercase tracking-widest">Mode Immersion</span>
            </div>
            <button 
              onClick={() => setZenModeQuestionId(null)}
              className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-emerald-900/50 hover:bg-emerald-800 rounded-lg text-emerald-200 text-xs md:text-sm font-bold transition-colors border border-emerald-800/50"
            >
              <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden xs:inline">Terminer &</span> Fermer
            </button>
          </div>

          {/* Corps Zen */}
          <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 flex flex-col overflow-y-auto relative">

            {/* PANEL CHAT MOBILE INTÉGRÉ (OVERLAY) - MODE ZEN */}
            {showMobileChat && (
              <div className="md:hidden absolute inset-0 z-[100] bg-emerald-950 flex flex-col h-full rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-emerald-800 bg-emerald-900/50">
                      <div className="flex items-center gap-2">
                          <Bot className="w-5 h-5 text-emerald-400" />
                          <span className="font-bold text-emerald-100">Sophia</span>
                      </div>
                      <button 
                          onClick={(e) => {
                              e.stopPropagation();
                              setShowMobileChat(false);
                          }}
                          className="text-emerald-400 hover:text-white p-2"
                      >
                          <X className="w-6 h-6" />
                      </button>
                  </div>
                  
                  {/* Zone de messages (Copie du chat desktop pour mobile) */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-emerald-800">
                      <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-800/50 mb-4">
                          <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              <span className="text-xs font-bold text-amber-400 uppercase">Conseil</span>
                          </div>
                          <p className="text-xs text-emerald-200 italic">
                              "{currentWeek.aiNuggets[0]}"
                          </p>
                      </div>

                      {messages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                                  msg.sender === 'user' 
                                  ? 'bg-emerald-600 text-white rounded-br-none' 
                                  : 'bg-emerald-800 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                              }`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                  </div>

                  {/* Input Chat Mobile */}
                  <div className="p-4 border-t border-emerald-900 bg-emerald-950 relative">
                      <input
                          type="text"
                          value={inputMessage}
                          onChange={(e) => setInputMessage(e.target.value)}
                          placeholder="Répondre..."
                          className="w-full bg-emerald-900/50 border border-emerald-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                      <button 
                          onClick={(e) => {
                              e.stopPropagation();
                              handleSendMessage();
                          }}
                          className="absolute right-6 top-1/2 -translate-y-1/2 text-emerald-400"
                      >
                          <Send className="w-4 h-4" />
                      </button>
                  </div>
              </div>
            )}
            
            <div className="mb-4 md:mb-8 text-center">
              <h2 className="text-xl md:text-3xl font-serif font-bold text-white mb-1 md:mb-2">
                {q.question}
              </h2>
              <span className="text-emerald-500 text-xs md:text-sm uppercase tracking-widest font-bold">
                {currentWeek.title} • Question {currentWeek.subQuestions.indexOf(q) + 1}/{currentWeek.subQuestions.length}
              </span>
            </div>

            {/* ENCARTS CONTEXTE ET PISTES DE RÉFLEXION */}
            {(() => {
               const isExpanded = expandedInstructions[q.id] !== false;
               return (
                 <>
                   <div className={`transition-all duration-500 ease-in-out overflow-hidden flex flex-col ${isExpanded ? 'max-h-[60vh] opacity-100 mb-4 md:mb-6' : 'max-h-0 opacity-0 mb-0'}`}>
                     
                     {/* ENCART CONTEXTE (Question précise) - DÉPLACÉ ICI */}
                     <div className="mb-3 md:mb-4 bg-emerald-900/30 border-l-4 border-emerald-500 p-3 md:p-4 rounded-r-xl">
                       <h4 className="text-emerald-400 font-bold text-xs md:text-sm uppercase tracking-wider mb-1 flex items-center gap-2">
                          <Layers className="w-3 h-3 md:w-4 md:h-4" /> Question Clé
                       </h4>
                       <p className="text-emerald-100 text-sm md:text-lg font-serif leading-relaxed">
                         {q.placeholder.replace(/\*\*/g, '')}
                       </p>
                     </div>

                     <div className="bg-amber-900/10 border border-amber-500/30 rounded-xl p-3 md:p-4 mb-4">
                       <div className="flex items-center gap-2 mb-1 md:mb-2 text-amber-400 font-bold text-xs md:text-sm uppercase tracking-wider">
                         <Sparkles className="w-3 h-3 md:w-4 md:h-4" /> Pistes de Réflexion
                       </div>
                       <ul className="space-y-2 text-amber-200/80 text-xs md:text-sm italic">
                         {q.helperText.split('\n\n').map((part, i) => (
                           <li key={i} className="flex items-start gap-2">
                             <span className="text-amber-500/50 mt-1">•</span>
                             <span>{part}</span>
                           </li>
                         ))}
                       </ul>
                     </div>
                   </div>

                   <div className="flex justify-between items-center mb-4 border-b border-emerald-900/30 pb-2">
                     {!isExpanded && (
                       <div className="hidden min-[280px]:flex text-emerald-500 text-xs uppercase tracking-widest font-bold items-center gap-2 animate-fade-in">
                         <Layers className="w-4 h-4" /> Instructions Masquées
                       </div>
                     )}
                     <button 
                       onClick={() => {
                         setExpandedInstructions(prev => ({ ...prev, [q.id]: !isExpanded }));
                       }}
                       className="ml-auto text-emerald-400 hover:text-emerald-200 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors bg-emerald-900/30 px-3 py-1.5 rounded-lg border border-emerald-800/50 hover:bg-emerald-800"
                     >
                       {isExpanded ? (
                         <>Masquer les instructions <ChevronUp className="w-4 h-4" /></>
                       ) : (
                         <>Afficher les instructions <ChevronDown className="w-4 h-4" /></>
                       )}
                     </button>
                   </div>
                 </>
               );
            })()}
            
            <div className="flex-1 relative mt-2 md:mt-4">
              <textarea
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers({...answers, [q.id]: e.target.value})}
                placeholder="Développe ta pensée ici..."
                autoFocus
                className="w-full h-full bg-transparent border-none outline-none text-base md:text-2xl text-emerald-50 placeholder-emerald-800/50 resize-none font-serif leading-relaxed p-2 md:p-4 focus:ring-0"
              />
              <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 text-emerald-700 text-[10px] md:text-xs font-mono">
                {answers[q.id]?.length || 0} caractères
              </div>
            </div>

          </div>
        </div>

        {/* BOUTON FLOTTANT MOBILE CHAT (MODE ZEN) */}
        {!showMobileChat && (
          <div className="md:hidden fixed bottom-6 right-6 z-[999]">
            <div 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMobileChat(true);
              }}
              className="bg-emerald-600 text-white p-4 rounded-full shadow-xl shadow-emerald-900/50 animate-bounce-slow border border-emerald-400/20 active:scale-95 transition-transform pointer-events-auto cursor-pointer flex items-center justify-center"
              role="button"
              aria-label="Ouvrir l'assistant Sophia"
            >
              <Sparkles className="w-6 h-6 pointer-events-none" />
            </div>
          </div>
        )}

        {/* DROITE : SOPHIA (30%) */}
        <div className="flex-[30%] hidden md:flex flex-col bg-emerald-950/50 h-full border-l border-emerald-900 relative backdrop-blur-sm">
          
          {/* PÉPITES */}
          <div className="p-6 bg-gradient-to-b from-emerald-900/20 to-transparent border-b border-emerald-900">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">Pépites Sophia</h3>
            </div>
            <div className="space-y-3">
              {currentWeek.aiNuggets.map((nugget, i) => (
                <div key={i} className="bg-emerald-900/60 border border-emerald-700/50 p-3 rounded-lg text-sm text-emerald-100 shadow-sm italic">
                  "{nugget}"
                </div>
              ))}
            </div>
          </div>

          {/* CHAT */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4 opacity-70">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Sophia</span>
              </div>
              <History className="w-4 h-4 text-emerald-600 cursor-pointer" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-emerald-800">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.sender === 'user' 
                      ? 'bg-emerald-600 text-white rounded-br-none' 
                      : 'bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 relative">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Discuter avec Sophia..."
                className="w-full bg-emerald-950 border border-emerald-800 rounded-xl pl-4 pr-12 py-4 text-sm text-white placeholder-emerald-700 focus:ring-1 focus:ring-emerald-500 outline-none shadow-lg"
              />
              <button 
                onClick={handleSendMessage}
                className="absolute right-2 top-2 bottom-2 w-10 flex items-center justify-center bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-950 text-emerald-50 flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* --- COLONNE GAUCHE : CONTENU DU MODULE (60%) --- */}
      <div className="w-full md:w-[60%] flex flex-col h-screen overflow-y-auto border-r border-emerald-900 relative">
        
        {/* HEADER */}
        <div className="sticky top-0 z-10 bg-emerald-950/90 backdrop-blur-md border-b border-emerald-900 p-4 md:p-6 flex items-center justify-between">
          <button 
            onClick={() => navigate('/dashboard', { state: { mode: 'architecte' } })}
            className="flex items-center gap-2 text-emerald-400 hover:text-emerald-200 transition-colors text-xs md:text-sm font-bold uppercase tracking-wider"
          >
            <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Retour au Plan
          </button>
          <div className="flex items-center gap-2">
             <span className="hidden sm:inline text-xs font-bold text-emerald-600 uppercase tracking-widest">Sauvegarde auto</span>
             <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-emerald-600" />
          </div>
        </div>

        {/* CONTENU : Carousel Vertical "Focus" */}
        <div className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth scrollbar-hide p-0">
          
            {/* En-tête du module (Slide 0 - Intro) */}
            <div className="snap-start w-full h-screen flex flex-col justify-center items-start px-4 md:px-8 lg:px-20 max-w-5xl mx-auto relative">
              <div className="flex flex-col justify-center items-start">
                <span className="inline-block px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-emerald-900/50 border border-emerald-700/50 text-amber-400 text-xs font-bold uppercase tracking-widest mb-3 md:mb-4 w-fit">
                  Semaine {currentWeek.id} • {currentWeek.subtitle}
                </span>
                <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-white mb-3 md:mb-6 leading-tight">
                  {currentWeek.title}
                </h1>
                <p className="text-emerald-300 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed border-l-2 md:border-l-4 border-amber-500 pl-4 md:pl-6 max-w-2xl mb-6 md:mb-12">
                  {currentWeek.description}
                </p>
                
                {/* Bouton Start - Remonté juste sous le texte */}
                <div 
                  className="flex items-center gap-3 text-emerald-500 animate-bounce cursor-pointer pl-4 md:pl-6 hover:text-white transition-colors" 
                  onClick={() => {
                     setActiveQuestion(currentWeek.subQuestions[0].id);
                     document.getElementById(`question-${currentWeek.subQuestions[0].id}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <span className="text-xs md:text-sm font-bold uppercase tracking-widest">
                    {hasStartedWork ? "Continuer le travail" : "Commencer le travail"}
                  </span>
                  <ArrowLeft className="w-3 h-3 md:w-4 md:h-4 -rotate-90" />
                </div>
              </div>
            </div>

          {/* Questions (Slides 1..N) */}
          {currentWeek.subQuestions.map((q, index) => (
            <div 
              key={q.id} 
              id={`question-${q.id}`}
              className="snap-start w-full min-h-full flex flex-col relative px-4 lg:px-20 max-w-5xl mx-auto"
              onClick={() => setActiveQuestion(q.id)}
            >
              {/* PANEL CHAT MOBILE INTÉGRÉ (OVERLAY) */}
              {showMobileChat && activeQuestion === q.id && (
                <div className="md:hidden absolute inset-0 z-[100] bg-emerald-950 flex flex-col h-full">
                    <div className="flex items-center justify-between p-4 border-b border-emerald-800 bg-emerald-900/50">
                        <div className="flex items-center gap-2">
                            <Bot className="w-5 h-5 text-emerald-400" />
                            <span className="font-bold text-emerald-100">Sophia</span>
                        </div>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMobileChat(false);
                            }}
                            className="text-emerald-400 hover:text-white p-2"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    {/* Zone de messages (Copie du chat desktop pour mobile) */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-emerald-800">
                        <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-800/50 mb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="w-3 h-3 text-amber-400" />
                                <span className="text-xs font-bold text-amber-400 uppercase">Conseil</span>
                            </div>
                            <p className="text-xs text-emerald-200 italic">
                                "{currentWeek.aiNuggets[0]}"
                            </p>
                        </div>

                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                                    msg.sender === 'user' 
                                    ? 'bg-emerald-600 text-white rounded-br-none' 
                                    : 'bg-emerald-800 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Input Chat Mobile */}
                    <div className="p-4 border-t border-emerald-900 bg-emerald-950 relative">
                        <input
                            type="text"
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            placeholder="Répondre..."
                            className="w-full bg-emerald-900/50 border border-emerald-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSendMessage();
                            }}
                            className="absolute right-6 top-1/2 -translate-y-1/2 text-emerald-400"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
              )}

              {/* Contenu centré verticalement */}
              <div className="flex-1 flex flex-col justify-center py-8">
                <div className="flex items-center gap-4 opacity-80 mb-4 absolute top-4 left-6 lg:top-0 lg:left-0">
                  <span className="text-4xl md:text-6xl font-serif text-emerald-700 font-bold">0{index + 1}</span>
                  <div className="h-px w-16 md:w-24 bg-emerald-700/50" />
                </div>

                <h2 className="text-xl md:text-3xl lg:text-4xl font-serif font-bold text-white mb-6 md:mb-8 mt-16 md:mt-8">
                  {q.question}
                </h2>

                {/* NOUVEAUX ENCARTS INTÉGRÉS DANS LA VUE NORMALE (COLLAPSIBLE) */}
                {(() => {
                   const isExpanded = expandedInstructions[q.id] !== false;
                   return (
                     <>
                       <div className={`transition-all duration-500 ease-in-out overflow-hidden flex flex-col ${isExpanded ? 'max-h-[60vh] opacity-100 mb-4 md:mb-6' : 'max-h-0 opacity-0 mb-0'}`}>
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                           {/* Contexte */}
                           <div className="bg-emerald-900/20 border-l-2 border-emerald-600 p-3 md:p-4 rounded-r-lg">
                             <h4 className="text-emerald-500 font-bold text-xs min-[350px]:text-sm uppercase tracking-wider mb-1 flex items-center gap-2">
                               <Layers className="w-3 h-3" /> Question Clé
                             </h4>
                             <p className="text-emerald-200 text-xs md:text-sm font-serif leading-relaxed whitespace-pre-line">
                               "{q.placeholder.replace(/\*\*/g, '')}"
                             </p>
                           </div>
                           
                           {/* Pistes */}
                           <div className="bg-amber-900/10 border-l-2 border-amber-600/50 p-3 md:p-4 rounded-r-lg">
                             <h4 className="text-amber-500 font-bold text-xs min-[350px]:text-sm uppercase tracking-wider mb-1 flex items-center gap-2">
                               <Sparkles className="w-3 h-3" /> Conseil
                             </h4>
                             <ul className="space-y-2 text-amber-200/80 text-xs md:text-sm italic mt-2">
                               {q.helperText.split('\n\n').map((part, i) => (
                                 <li key={i} className="flex items-start gap-2">
                                   <span className="text-amber-500/50 mt-1">•</span>
                                   <span>{part}</span>
                                 </li>
                               ))}
                             </ul>
                           </div>
                         </div>
                       </div>

                       <div className="flex justify-between items-center mb-4 border-b border-emerald-900/30 pb-2">
                         {!isExpanded && (
                           <div className="hidden min-[280px]:flex text-emerald-500 text-xs uppercase tracking-widest font-bold items-center gap-2 animate-fade-in">
                             <Layers className="w-4 h-4" /> Consignes Masquées
                           </div>
                         )}
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             setExpandedInstructions(prev => ({ ...prev, [q.id]: !isExpanded }));
                           }}
                           className="ml-auto text-emerald-400 hover:text-emerald-200 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors bg-emerald-900/30 px-3 py-1.5 rounded-lg border border-emerald-800/50 hover:bg-emerald-800"
                         >
                           {isExpanded ? (
                             <>Masquer les instructions <ChevronUp className="w-4 h-4" /></>
                           ) : (
                             <>Afficher les instructions <ChevronDown className="w-4 h-4" /></>
                           )}
                         </button>
                       </div>
                     </>
                   );
                })()}
                
                <div className="relative min-h-[200px] mb-20">
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers({...answers, [q.id]: e.target.value})}
                    placeholder="Développe ta pensée ici..."
                    className="w-full h-full bg-emerald-900/30 border border-emerald-800 rounded-xl p-4 md:p-6 text-sm md:text-base text-white placeholder-emerald-700/50 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all resize-none leading-relaxed font-serif shadow-inner min-h-[200px]"
                  />
                  
                  {/* BOUTON AGRANDIR (Toujours là si besoin) */}
                  <button 
                    className="absolute top-4 right-4 text-emerald-500 hover:text-amber-400 transition-colors p-2 bg-emerald-900/50 rounded-lg border border-emerald-800/50 z-20"
                    title="Passer en Mode Immersion (Plein écran)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZenModeQuestionId(q.id);
                    }}
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* BOUTON NAVIGATION DISCRET BAS DE PAGE (Absolu au conteneur slide) */}
                <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center z-10">
                  {index < currentWeek.subQuestions.length - 1 ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveQuestion(currentWeek.subQuestions[index + 1].id);
                        document.getElementById(`question-${currentWeek.subQuestions[index + 1].id}`)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="flex flex-col items-center gap-2 text-emerald-500 hover:text-emerald-300 transition-all opacity-60 hover:opacity-100 group animate-pulse hover:animate-none cursor-pointer"
                    >
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">Suivant</span>
                      <ChevronDown className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
                    </button>
                  ) : (
                     <div className="text-emerald-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2 opacity-80 bg-emerald-900/30 px-4 py-2 rounded-full mb-8">
                       <CheckCircle2 className="w-4 h-4" /> Terminé
                     </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* BOUTON FLOTTANT MOBILE CHAT (GLOBAL) */}
        {!showMobileChat && !zenModeQuestionId && (
            <div className="md:hidden fixed bottom-24 right-6 z-[999]">
                <div 
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMobileChat(true);
                        // Force le focus sur la slide active au cas où
                        const el = document.getElementById(`question-${activeQuestion}`);
                        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
                    }}
                    className="bg-emerald-600 text-white p-4 rounded-full shadow-xl shadow-emerald-900/50 animate-bounce-slow border border-emerald-400/20 active:scale-95 transition-transform pointer-events-auto cursor-pointer flex items-center justify-center"
                    role="button"
                    aria-label="Ouvrir l'assistant Sophia"
                >
                    <Sparkles className="w-6 h-6 pointer-events-none" />
                </div>
            </div>
        )}

        {/* FOOTER */}
        <div className="sticky bottom-0 bg-emerald-950 border-t border-emerald-900 p-4 md:p-6 flex justify-end z-20">
           <button 
             onClick={handleSave}
             className="bg-amber-500 text-emerald-950 px-6 py-2 md:px-8 md:py-3 rounded-lg font-bold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-900/20 flex items-center gap-2 text-xs md:text-base"
           >
             {isSaving ? 'Enregistrement...' : 'Enregistrer'}
             <Save className="w-3 h-3 md:w-4 md:h-4" />
           </button>
        </div>
      </div>

      {/* --- COLONNE DROITE : SOPHIA (40%) --- */}
      <div className="hidden md:flex md:w-[40%] flex-col bg-emerald-900/10 h-screen border-l border-emerald-900/50 relative">
        
        {/* PÉPITES */}
        <div className="p-6 bg-gradient-to-b from-emerald-900/40 to-transparent">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">Pépites Sophia</h3>
          </div>
          <div className="space-y-3">
            {currentWeek.aiNuggets.map((nugget, i) => (
              <div key={i} className="bg-emerald-900/60 border border-emerald-700/50 p-3 rounded-lg text-sm text-emerald-100 shadow-sm italic">
                "{nugget}"
              </div>
            ))}
          </div>
        </div>

        {/* CHAT */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4 opacity-70">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Sophia (Coach Identitaire)</span>
            </div>
            <History className="w-4 h-4 text-emerald-600 cursor-pointer" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-emerald-800">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.sender === 'user' 
                    ? 'bg-emerald-600 text-white rounded-br-none' 
                    : 'bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 relative">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Discuter avec Sophia..."
              className="w-full bg-emerald-950 border border-emerald-800 rounded-xl pl-4 pr-12 py-4 text-sm text-white placeholder-emerald-700 focus:ring-1 focus:ring-emerald-500 outline-none shadow-lg"
            />
            <button 
              onClick={handleSendMessage}
              className="absolute right-2 top-2 bottom-2 w-10 flex items-center justify-center bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdentityArchitect;
