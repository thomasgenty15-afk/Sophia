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
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { MODULES_REGISTRY } from '../config/modules-registry';

const IdentityArchitect = () => {
  const navigate = useNavigate();
  const { weekId } = useParams();
  const { user, loading: authLoading } = useAuth();
  
  // Normalisation de l'ID du module pour correspondre au registre (ex: "1" -> "week_1")
  // Le paramètre URL est souvent juste le numéro (1, 2, 3...) mais le registre utilise 'week_X'
  const weekNumber = weekId || "1";
  const moduleId = `week_${weekNumber}`;
  
  // On récupère la semaine spécifique depuis le contenu statique
  const currentWeek = WEEKS_CONTENT[weekNumber] || WEEKS_CONTENT["1"];
  
  // États
  const [activeQuestion, setActiveQuestion] = useState<string>(currentWeek?.subQuestions[0]?.id || "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // State pour suivre les valeurs initiales (pour détecter les changements)
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>({});

  // Charger les réponses existantes depuis Supabase (Mode Granulaire)
  useEffect(() => {
    const loadAnswers = async () => {
        if (authLoading) return;
        if (!user) {
            setIsLoading(false);
            navigate('/auth');
            return;
        }
        if (!currentWeek) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);

        try {
            // 1. On récupère les IDs des sous-questions de la semaine
            const subModuleIds = currentWeek.subQuestions.map(q => {
                // Conversion w1_q1 -> a1_c1_m1 pour la requête
                if (q.id.startsWith('w') && q.id.includes('_q')) {
                    const w = q.id.split('_')[0].substring(1);
                    const qIdx = q.id.split('_')[1].substring(1);
                    return `a${w}_c${qIdx}_m1`;
                }
                return q.id;
            });
            
            // 2. On fetch les entrées correspondant à ces IDs
            const { data, error } = await supabase
                .from('user_module_state_entries')
                .select('module_id, content, updated_at')
                .eq('user_id', user.id)
                .in('module_id', subModuleIds);
            
            if (error) throw error;

            const newAnswers: Record<string, string> = {};
            let maxDate: Date | null = null;

            // 3. On reconstruit l'objet answers
            data?.forEach(entry => {
                // On garde l'ID DB tel quel car weeksContent utilise maintenant les IDs aX_cY_m1
                const uiId = entry.module_id;

                // Le contenu est stocké sous forme { answer: "..." } ou directement la string ?
                // On va standardiser sur { answer: "..." } pour être propre, mais gérons le legacy string au cas où.
                const val = entry.content?.answer || entry.content; // Compatibilité
                if (typeof val === 'string') {
                    newAnswers[uiId] = val;
                } else if (val && typeof val === 'object' && val.content) {
                     newAnswers[uiId] = val.content;
                }
                
                if (entry.updated_at) {
                    const d = new Date(entry.updated_at);
                    if (!maxDate || d > maxDate) maxDate = d;
                }
            });

            // 4. Fallback LocalStorage (Migration) si aucune donnée DB trouvée
            if (Object.keys(newAnswers).length === 0) {
                 const local = localStorage.getItem(`architect_answers_week_${weekNumber}`);
                 if (local) {
                     const localParsed = JSON.parse(local);
                     setAnswers(localParsed);
                     setInitialAnswers(localParsed); // Set initial state from local storage
                     // On ne set pas lastSavedAt car ce n'est pas en base
                 } else {
                     setAnswers({});
                     setInitialAnswers({});
                 }
            } else {
                setAnswers(newAnswers);
                setInitialAnswers(newAnswers); // Set initial state from DB
                setLastSavedAt(maxDate);
            }

        } catch (err) {
            console.error("Erreur chargement réponses:", err);
        } finally {
            setIsLoading(false);
        }
    };

    loadAnswers();
  }, [authLoading, user, weekNumber, currentWeek, navigate]); // Dependances stables


  
  // Chat
  const [messages, setMessages] = useState([
    { id: 1, sender: 'ai', text: `Salut Architecte. Bienvenue dans le module "${currentWeek?.title}". Par où veux-tu commencer ?` }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  
  // NOUVEAU : State pour le mode Zen (Question active en plein écran)
  const [zenModeQuestionId, setZenModeQuestionId] = useState<string | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});
  const [showMobileChat, setShowMobileChat] = useState(false); // State pour le chat mobile
  const [showArchives, setShowArchives] = useState<string | null>(null); // ID de la question dont on veut voir l'historique
  const [archivesData, setArchivesData] = useState<any[]>([]); // Données d'archives chargées
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);

  // --- CHARGEMENT DES ARCHIVES ---
  const handleOpenArchives = async (questionId: string) => {
      setShowArchives(questionId);
      setIsLoadingArchives(true);
      try {
          const { data, error } = await supabase
              .from('user_module_archives')
              .select('*')
              .eq('user_id', user?.id)
              .eq('module_id', questionId)
              .order('archived_at', { ascending: false });
          
          if (error) throw error;
          setArchivesData(data || []);
      } catch (err) {
          console.error("Erreur chargement archives:", err);
      } finally {
          setIsLoadingArchives(false);
      }
  };

  // Check if any answers exist for the current week
  const hasStartedWork = Object.keys(answers).length > 0;

  // Si l'ID n'est pas bon
  if (!currentWeek) return <div>Module introuvable</div>;

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    
    try {
        // Sauvegarde GRANULAIRE (Chaque réponse est un module Forge Niveau 1)
        // UPDATE : On ne sauvegarde QUE ce qui a changé par rapport à initialAnswers
        
        const changedEntries = Object.entries(answers).filter(([key, value]) => {
            return value !== initialAnswers[key];
        });

        if (changedEntries.length === 0) {
            // Rien n'a changé, on ne fait rien (ou juste un petit feedback visuel)
            console.log("Aucun changement à sauvegarder.");
            setIsSaving(false);
            return;
        }

        const updates = changedEntries.map(async ([questionId, answerText]) => {
            // CORRECTION: Assurer que l'ID est au format Forge aX_cY_m1
            // Si l'ID venant du front est déjà bon (w1_q1 -> a1_c1_m1), tant mieux.
            // Sinon on doit le mapper si possible, ou alors le trigger SQL ne marchera pas.
            // Pour l'instant, IdentityArchitect utilise les IDs définis dans weeksContent (ex: 'w1_q1').
            
            // On tente une conversion simple si l'ID ne commence pas par 'a'
            let finalModuleId = questionId;
            if (questionId.startsWith('w') && questionId.includes('_q')) {
                // w1_q1 => a1_c1_m1 (Niveau 1 par défaut pour l'Architecte)
                const w = questionId.split('_')[0].substring(1); // 1
                const q = questionId.split('_')[1].substring(1); // 1
                finalModuleId = `a${w}_c${q}_m1`;
            }

            const { data: existing } = await supabase
                .from('user_module_state_entries')
                .select('id, completed_at')
                .eq('user_id', user.id)
                .eq('module_id', finalModuleId)
                .maybeSingle();
            
            const payload = {
                answer: answerText,
            };
            
            // Logique de complétion
            const isCompleted = answerText.trim().length > 0;
            const now = new Date().toISOString();
            
            const updateData = {
                content: payload,
                updated_at: now,
                status: isCompleted ? 'completed' : 'available',
                completed_at: isCompleted ? (existing?.completed_at || now) : null
            };

            if (existing) {
                return supabase
                    .from('user_module_state_entries')
                    .update(updateData)
                    .eq('id', existing.id);
            } else {
                return supabase
                    .from('user_module_state_entries')
                    .insert({
                        user_id: user.id,
                        module_id: finalModuleId,
                        ...updateData
                    });
            }
        });

        await Promise.all(updates);
        
        // Mise à jour de l'état initial pour refléter la nouvelle version "clean"
        // On ne met à jour QUE les clés qui ont changé pour éviter des race conditions bizarres
        const newInitials = { ...initialAnswers };
        changedEntries.forEach(([k, v]) => {
            newInitials[k] = v;
        });
        setInitialAnswers(newInitials);

        setLastSavedAt(new Date());

    } catch (err) {
        console.error("Erreur sauvegarde:", err);
        alert("Erreur lors de la sauvegarde.");
    } finally {
        setIsSaving(false);
    }
  };

  // Auto-save debounced (toutes les 5s si changement)
  useEffect(() => {
    const timeout = setTimeout(() => {
        if (hasStartedWork && !isLoading) {
            // On sauvegarde silencieusement
            // handleSave(); // Attention aux appels trop fréquents, on garde le bouton manuel pour l'instant
            // Ou on implémente un vrai debounce plus tard.
            // Pour l'instant on laisse manuel + bouton "Sauvegarde auto" visuel (qui est statique pour le moment)
        }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [answers, hasStartedWork, isLoading]);


  const handleSendMessage = async () => {
    const userText = inputMessage.trim();
    if (!userText || isChatLoading) return;
    if (!currentWeek) return;

    const trunc = (s: string, max = 12000) => {
      const txt = (s ?? "").toString();
      if (txt.length <= max) return txt;
      return txt.slice(0, max) + "…";
    };
    const oneLine = (s: string) => (s ?? "").toString().replace(/\s+/g, " ").trim();

    const userMsg = { id: Date.now(), sender: 'user' as const, text: userText };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputMessage("");
    setIsChatLoading(true);
    setChatError(null);

    try {
      const historyForBrain = nextMessages.slice(-10).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const activeQ =
        currentWeek.subQuestions.find((q) => q.id === activeQuestion) ??
        currentWeek.subQuestions[0];

      const activeQuestionIndex = Math.max(
        1,
        currentWeek.subQuestions.findIndex((q) => q.id === activeQ?.id) + 1
      );

      const activeAnswer = answers[activeQ?.id] || "";

      const allQuestionsFull = currentWeek.subQuestions
        .map((q, idx) => {
          const answer = answers[q.id] || "";
          const answerBlock = answer.trim().length > 0
            ? trunc(answer, 2500)
            : "(vide)";
          return [
            `### Q${idx + 1} / ${currentWeek.subQuestions.length}`,
            `ID: ${q.id}`,
            `Titre: ${q.question}`,
            ``,
            `PROMPT (intégral):`,
            q.placeholder,
            ``,
            `AIDE (intégrale):`,
            q.helperText,
            ``,
            `RÉPONSE UTILISATEUR (si présente):`,
            answerBlock,
          ].join("\n");
        })
        .join("\n\n---\n\n");

      const contextOverrideRaw = [
        `Type: Module Semaine (Architecte)`,
        `Week: ${weekNumber}`,
        `ModuleId: ${moduleId}`,
        `Titre: ${currentWeek.title}`,
        `Zen mode: ${zenModeQuestionId ? 'on' : 'off'}`,
        ``,
        `=== QUESTION ACTIVE (RÉFÉRENCE ABSOLUE) ===`,
        `ActiveQuestionIndex: ${activeQuestionIndex} / ${currentWeek.subQuestions.length}`,
        `ActiveQuestionId: ${activeQ?.id || 'N/A'}`,
        `ActiveQuestionTitle: ${activeQ?.question || 'N/A'}`,
        ``,
        `ACTIVE_PROMPT (intégral):`,
        activeQ?.placeholder || '',
        ``,
        `ACTIVE_AIDE (intégrale):`,
        activeQ?.helperText || '',
        ``,
        `ACTIVE_RÉPONSE (si présente):`,
        activeAnswer.trim().length ? trunc(activeAnswer, 3000) : '(vide)',
        ``,
        `=== TOUTES LES QUESTIONS CLÉS DE LA SEMAINE (INTÉGRAL) ===`,
        allQuestionsFull || "(aucune question trouvée)",
      ].join("\n");

      const contextOverride = trunc(contextOverrideRaw, 20000);

      const { data, error } = await supabase.functions.invoke('sophia-brain', {
        body: {
          message: userText,
          history: historyForBrain,
          forceMode: 'architect',
          contextOverride,
          channel: 'web',
          messageMetadata: {
            source: 'module_conversation',
            ui: 'IdentityArchitect',
            moduleKind: 'week',
            moduleId,
            weekNumber,
            activeQuestion,
            zenMode: !!zenModeQuestionId,
            activeQuestionText: activeQ?.question,
            activeQuestionIndex,
          },
        }
      });

      if (error) throw error;

      const assistantText = (data?.content ?? "").toString().trim() || "Je n'ai pas réussi à répondre. Réessaie ?";
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: assistantText }]);
    } catch (e: any) {
      console.error("[IdentityArchitect] Chat error:", e);
      setChatError(e?.message || "Erreur lors de l'appel à Sophia.");
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "Désolée, je bug un instant. Réessaie dans quelques secondes." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // --- RENDER MODE ZEN (MODALE PLEIN ÉCRAN) ---
  if (zenModeQuestionId) {
    const q = currentWeek.subQuestions.find(sq => sq.id === zenModeQuestionId);
    // Si la question n'existe pas, on retourne null (ce qui sort du render Zen)
    if (!q) return null;

    return (
      <div className="fixed inset-0 bg-emerald-950 z-50 flex flex-col md:flex-row animate-fade-in">
        
        {/* --- MODALE ARCHIVES (INTÉGRÉE AU MODE ZEN) --- */}
        {showArchives && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={(e) => {
                    e.stopPropagation(); // Empêcher le clic de traverser
                    setShowArchives(null);
                }} />
                <div className="relative bg-emerald-950 w-full max-w-2xl rounded-2xl border border-emerald-800 shadow-2xl flex flex-col max-h-[80vh]">
                    <div className="p-4 border-b border-emerald-900 flex justify-between items-center bg-emerald-900/30 rounded-t-2xl">
                        <div className="flex items-center gap-2 text-emerald-100">
                            <History className="w-5 h-5 text-emerald-400" />
                            <h3 className="font-bold font-serif text-lg">Historique des versions</h3>
                        </div>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            setShowArchives(null);
                        }} className="p-2 hover:bg-emerald-900 rounded-full text-emerald-400 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        {isLoadingArchives ? (
                            <div className="text-center py-12 text-emerald-500 animate-pulse">Chargement...</div>
                        ) : archivesData.length === 0 ? (
                            <div className="text-center py-12 text-emerald-600 opacity-50 flex flex-col items-center gap-2">
                                <History className="w-12 h-12" />
                                <p>Aucune archive disponible pour cette question.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {archivesData.map((archive, i) => (
                                    <div key={archive.id} className="relative pl-6 border-l-2 border-emerald-800/50 pb-6 last:pb-0">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-950 border-2 border-emerald-600" />
                                        <div className="bg-emerald-900/20 rounded-xl p-4 border border-emerald-800/30">
                                            <div className="flex justify-between items-center mb-3">
                                                <span className="text-xs font-mono text-emerald-500 bg-emerald-900/50 px-2 py-1 rounded border border-emerald-800/50">
                                                    v{archivesData.length - i}.0
                                                </span>
                                                <span className="text-xs text-emerald-400 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(archive.archived_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-emerald-100 text-sm md:text-base font-serif leading-relaxed whitespace-pre-line">
                                                "{archive.content?.answer || archive.content}"
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* GAUCHE : WORKSPACE (70%) */}
        <div className="flex-[70%] flex flex-col h-full relative bg-emerald-950 border-r border-emerald-900">
          {/* Header Zen */}
          <div className="p-4 md:p-6 flex flex-col min-[382px]:flex-row justify-between items-center border-b border-emerald-900/50 bg-emerald-950/50 backdrop-blur-sm gap-3 min-[382px]:gap-0">
            <div className="flex items-center gap-2 md:gap-3 text-emerald-400 w-full min-[382px]:w-auto justify-center min-[382px]:justify-start">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
              <span className="text-xs md:text-sm font-bold uppercase tracking-widest">Mode Immersion</span>
            </div>
            <div className="flex items-center gap-3 w-full min-[382px]:w-auto justify-center min-[382px]:justify-end">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleOpenArchives(q.id);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-emerald-900/30 hover:bg-emerald-800 rounded-lg text-emerald-400 text-xs md:text-sm font-bold transition-colors border border-emerald-800/30"
                >
                    <History className="w-3 h-3 md:w-4 md:h-4" />
                    <span className="hidden xs:inline">Archives</span>
                </button>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleSave();
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-emerald-950 text-xs md:text-sm font-bold transition-colors shadow-lg shadow-amber-900/20"
                >
                    {isSaving ? (
                        <>
                            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-emerald-950"></span>
                            <span className="inline">...</span>
                        </>
                    ) : (
                        <>
                            <Save className="w-3 h-3 md:w-4 md:h-4" />
                            <span className="inline">Enregistrer</span>
                        </>
                    )}
                </button>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setZenModeQuestionId(null);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-emerald-900/50 hover:bg-emerald-800 rounded-lg text-emerald-200 text-xs md:text-sm font-bold transition-colors border border-emerald-800/50"
                    title="Fermer"
                >
                    <CheckCircle2 className="hidden md:block w-3 h-3 md:w-4 md:h-4" />
                    <X className="block md:hidden w-4 h-4" />
                    <span className="hidden md:inline">Fermer</span>
                </button>
            </div>
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
                              <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                                  msg.sender === 'user' 
                                  ? 'bg-emerald-600 text-white rounded-br-none' 
                                  : 'bg-emerald-800 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                              }`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                      {isChatLoading && (
                        <div className="flex justify-start">
                          <div className="max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed bg-emerald-800 text-emerald-50 border border-emerald-700/50 rounded-bl-none">
                            ...
                          </div>
                        </div>
                      )}
                      {chatError && (
                        <div className="text-xs text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg p-2">
                          {chatError}
                        </div>
                      )}
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
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line shadow-sm ${
                    msg.sender === 'user' 
                      ? 'bg-emerald-600 text-white rounded-br-none' 
                      : 'bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start animate-fade-in-up">
                  <div className="max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none">
                    ...
                  </div>
                </div>
              )}
              {chatError && (
                <div className="text-xs text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg p-2">
                  {chatError}
                </div>
              )}
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
      
      {/* --- MODALE ARCHIVES (SI MODE NORMAL) --- */}
      {showArchives && !zenModeQuestionId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowArchives(null)} />
            <div className="relative bg-emerald-950 w-full max-w-2xl rounded-2xl border border-emerald-800 shadow-2xl flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-emerald-900 flex justify-between items-center bg-emerald-900/30 rounded-t-2xl">
                    <div className="flex items-center gap-2 text-emerald-100">
                        <History className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-bold font-serif text-lg">Historique des versions</h3>
                    </div>
                    <button onClick={() => setShowArchives(null)} className="p-2 hover:bg-emerald-900 rounded-full text-emerald-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {isLoadingArchives ? (
                        <div className="text-center py-12 text-emerald-500 animate-pulse">Chargement...</div>
                    ) : archivesData.length === 0 ? (
                        <div className="text-center py-12 text-emerald-600 opacity-50 flex flex-col items-center gap-2">
                            <History className="w-12 h-12" />
                            <p>Aucune archive disponible pour cette question.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {archivesData.map((archive, i) => (
                                <div key={archive.id} className="relative pl-6 border-l-2 border-emerald-800/50 pb-6 last:pb-0">
                                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-950 border-2 border-emerald-600" />
                                    <div className="bg-emerald-900/20 rounded-xl p-4 border border-emerald-800/30">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-mono text-emerald-500 bg-emerald-900/50 px-2 py-1 rounded border border-emerald-800/50">
                                                v{archivesData.length - i}.0
                                            </span>
                                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(archive.archived_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-emerald-100 text-sm md:text-base font-serif leading-relaxed whitespace-pre-line">
                                            "{archive.content?.answer || archive.content}"
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

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
             <span className="hidden sm:inline text-xs font-bold text-emerald-600 uppercase tracking-widest">
                {lastSavedAt ? `Sauvegardé à ${lastSavedAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'Non sauvegardé'}
             </span>
             <CheckCircle2 className={`w-3 h-3 md:w-4 md:h-4 ${lastSavedAt ? 'text-emerald-500' : 'text-emerald-800'}`} />
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
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                                    msg.sender === 'user' 
                                    ? 'bg-emerald-600 text-white rounded-br-none' 
                                    : 'bg-emerald-800 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isChatLoading && (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed bg-emerald-800 text-emerald-50 border border-emerald-700/50 rounded-bl-none">
                              ...
                            </div>
                          </div>
                        )}
                        {chatError && (
                          <div className="text-xs text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg p-2">
                            {chatError}
                          </div>
                        )}
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
                               {q.placeholder.replace(/\*\*/g, '')}
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
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line shadow-sm ${
                  msg.sender === 'user' 
                    ? 'bg-emerald-600 text-white rounded-br-none' 
                    : 'bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start animate-fade-in-up">
                <div className="max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none">
                  ...
                </div>
              </div>
            )}
            {chatError && (
              <div className="text-xs text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg p-2">
                {chatError}
              </div>
            )}
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
