import React, { useEffect, useMemo, useState } from 'react';
import {
  Lightbulb,
  Plus,
  Search,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Bot,
  MessageSquare,
  Send,
  Info,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { shouldValidateOnUpdate, validateEthicalText } from '../../lib/ethicalValidation';
import { useAuth } from '../../context/AuthContext';

type ReflectionRow = {
  id: string;
  title: string;
  content: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

interface Reflection {
  id: string;
  title: string;
  content: string;
  date: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: number;
  sender: 'user' | 'ai';
  text: string;
}

const DEFAULT_CHAT_TEXT = "Je suis là pour t'aider à structurer ta réflexion. De quoi veux-tu parler aujourd'hui ?";
const CREATE_CHAT_TEXT = "Nouvelle réflexion. Je peux t'aider à clarifier l'idée centrale, trouver un exemple ou challenger ton raisonnement.";
const EDIT_CHAT_TEXT = "Je vois déjà la base de ta réflexion. On peut maintenant l'approfondir, la synthétiser ou tester ses limites.";
const CHAT_SUGGESTIONS = ['Aide-moi à approfondir', 'Trouve un exemple', 'Résume cette idée', "Fais l'avocat du diable"];

function buildChatMessages(text: string): ChatMessage[] {
  return [{ id: 1, sender: 'ai', text }];
}

function formatReflectionDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

function rowToReflection(row: ReflectionRow): Reflection {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    date: formatReflectionDate(row.created_at),
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of raw.split(',')) {
    const cleaned = tag.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(cleaned);
  }
  return tags;
}

function formatReflectionError(error: unknown, fallback: string): string {
  const code = String((error as any)?.code ?? '').trim();
  const message = String((error as any)?.message ?? '').trim();

  if (code === '42P01') {
    return "La base n'est pas encore à jour pour les réflexions.";
  }
  if (code === '42501' || /row-level security/i.test(message)) {
    return "Écriture refusée pour le moment. Vérifie ton accès ou réessaie plus tard.";
  }
  if (code === '23514') {
    return "Cette réflexion ne respecte pas le format attendu.";
  }

  return message || fallback;
}

export const ReflectionsTab: React.FC = () => {
  const { user } = useAuth();
  const [showExplanation, setShowExplanation] = useState(false);
  const [showMobileSophia, setShowMobileSophia] = useState(false);
  const [showMobileSophiaDetails, setShowMobileSophiaDetails] = useState(false);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reflectionToDelete, setReflectionToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingEthics, setIsVerifyingEthics] = useState(false);
  const [busyReflectionId, setBusyReflectionId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(buildChatMessages(DEFAULT_CHAT_TEXT));

  const filteredReflections = useMemo(
    () =>
      reflections.filter((ref) =>
        ref.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ref.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ref.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [reflections, searchQuery],
  );

  const resetForm = () => {
    setIsAdding(false);
    setShowMobileSophia(false);
    setShowMobileSophiaDetails(false);
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormTags('');
    setChatInput('');
    setChatMessages(buildChatMessages(DEFAULT_CHAT_TEXT));
    setStatusMsg(null);
  };

  const loadReflections = async () => {
    if (!user?.id) {
      setReflections([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatusMsg(null);
    try {
      const { data, error } = await supabase
        .from('user_architect_reflections')
        .select('id,title,content,tags,created_at,updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReflections(((data ?? []) as ReflectionRow[]).map(rowToReflection));
    } catch (error) {
      console.error('[ReflectionsTab] load failed', error);
      setReflections([]);
      setStatusMsg(formatReflectionError(error, "Impossible de charger tes réflexions pour le moment."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReflections();
  }, [user?.id]);

  const runEthicalValidation = async (params: {
    operation: 'create' | 'update';
    textFields: Record<string, unknown>;
    previousTextFields?: Record<string, unknown> | null;
    textFieldKeys: string[];
  }) => {
    setIsVerifyingEthics(true);
    try {
      const result = await validateEthicalText({
        entityType: 'reflection',
        operation: params.operation,
        textFields: params.textFields,
        previousTextFields: params.previousTextFields ?? null,
        textFieldKeys: params.textFieldKeys,
        context: { scope: 'architect_reflections' },
      });
      if (result.decision === 'block') {
        throw new Error(result.reasonShort || "Contenu bloqué par la vérification éthique.");
      }
    } finally {
      setIsVerifyingEthics(false);
    }
  };

  const buildSophiaReply = (title: string, content: string, prompt: string) => {
    const normalizedPrompt = prompt.toLowerCase();

    if (normalizedPrompt.includes('approfondir') || normalizedPrompt.includes('développer')) {
      return "Pour approfondir cette idée, demande-toi : d'où vient cette pensée ? Est-ce lié à une expérience récente ou à une observation plus ancienne ?";
    }

    if (normalizedPrompt.includes('résumer') || normalizedPrompt.includes('synthétiser')) {
      return "Si tu devais expliquer cette réflexion à un enfant de 10 ans en une seule phrase, que dirais-tu ?";
    }

    if (!title) {
      return "Commence par donner un titre à ta réflexion, même provisoire. Ça t'aidera à garder le cap sur l'idée principale.";
    }

    if (content.length < 50) {
      return "C'est un bon début. Peux-tu me donner un exemple concret pour illustrer cette pensée ?";
    }

    return "C'est une réflexion intéressante. Comment pourrais-tu appliquer cette idée concrètement dans ton quotidien dès demain ?";
  };

  const openCreate = () => {
    resetForm();
    setChatMessages(buildChatMessages(CREATE_CHAT_TEXT));
    setIsAdding(true);
  };

  const handleSendChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      sender: 'user',
      text: trimmed,
    };

    const aiMessage: ChatMessage = {
      id: Date.now() + 1,
      sender: 'ai',
      text: buildSophiaReply(formTitle, formContent, trimmed),
    };

    setChatMessages((current) => [...current, userMessage, aiMessage]);
    setChatInput('');
  };

  const handleSave = async () => {
    if (!user?.id) return;

    const titleInput = formTitle.trim();
    const content = formContent.trim();
    if (!titleInput && !content) return;

    const title = titleInput || (content ? 'Sans titre' : '');
    const tags = normalizeTags(formTags);
    const nextTextFields = {
      title,
      content,
      tags: tags.join(', '),
    };

    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      if (editingId) {
        const existing = reflections.find((reflection) => reflection.id === editingId);
        if (!existing) {
          throw new Error("Réflexion introuvable.");
        }

        const previousTextFields = {
          title: existing.title,
          content: existing.content,
          tags: existing.tags.join(', '),
        };

        if (shouldValidateOnUpdate(previousTextFields, nextTextFields, ['title', 'content', 'tags'])) {
          await runEthicalValidation({
            operation: 'update',
            textFields: nextTextFields,
            previousTextFields,
            textFieldKeys: ['title', 'content', 'tags'],
          });
        }

        const { data, error } = await supabase
          .from('user_architect_reflections')
          .update({
            title,
            content,
            tags,
          })
          .eq('id', editingId)
          .select('id,title,content,tags,created_at,updated_at')
          .single();
        if (error) throw error;

        const updatedReflection = rowToReflection(data as ReflectionRow);
        setReflections((current) =>
          current.map((reflection) => (reflection.id === editingId ? updatedReflection : reflection)),
        );
      } else {
        await runEthicalValidation({
          operation: 'create',
          textFields: nextTextFields,
          textFieldKeys: ['title', 'content', 'tags'],
        });

        const { data, error } = await supabase
          .from('user_architect_reflections')
          .insert({
            user_id: user.id,
            title,
            content,
            tags,
          } as any)
          .select('id,title,content,tags,created_at,updated_at')
          .single();
        if (error) throw error;

        setReflections((current) => [rowToReflection(data as ReflectionRow), ...current]);
      }

      resetForm();
    } catch (error) {
      console.error('[ReflectionsTab] save failed', error);
      setStatusMsg(formatReflectionError(error, "Impossible d'enregistrer cette réflexion."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const editReflection = (ref: Reflection) => {
    setStatusMsg(null);
    setFormTitle(ref.title);
    setFormContent(ref.content);
    setFormTags(ref.tags.join(', '));
    setEditingId(ref.id);
    setChatInput('');
    setChatMessages(buildChatMessages(EDIT_CHAT_TEXT));
    setShowMobileSophia(false);
    setShowMobileSophiaDetails(false);
    setIsAdding(true);
  };

  const deleteReflection = (id: string) => {
    setReflectionToDelete(id);
  };

  const confirmDelete = async () => {
    if (!reflectionToDelete) return;

    setBusyReflectionId(reflectionToDelete);
    setStatusMsg(null);
    try {
      const { error } = await supabase
        .from('user_architect_reflections')
        .delete()
        .eq('id', reflectionToDelete);
      if (error) throw error;

      setReflections((current) => current.filter((reflection) => reflection.id !== reflectionToDelete));
      setReflectionToDelete(null);
    } catch (error) {
      console.error('[ReflectionsTab] delete failed', error);
      setStatusMsg(formatReflectionError(error, "Impossible de supprimer cette réflexion."));
    } finally {
      setBusyReflectionId(null);
    }
  };

  const isSaveDisabled = isSubmitting || isVerifyingEthics || (!formTitle.trim() && !formContent.trim());

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-emerald-100 mb-4">Réflexions</h1>
          <p className="text-sm md:text-base text-emerald-400 max-w-2xl mx-auto italic mb-6">
            "La pensée non examinée est comme une graine non plantée. Prends le temps de cultiver ton esprit."
          </p>

          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="text-xs font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center justify-center gap-2 mx-auto transition-colors"
          >
            {showExplanation ? 'Masquer les explications' : 'Comment utiliser cet espace'}
            {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showExplanation && (
            <div className="mt-6 p-6 bg-emerald-900/20 border border-emerald-800/50 rounded-2xl text-left text-emerald-100/80 text-sm leading-relaxed max-w-2xl mx-auto animate-fade-in">
              <p className="mb-3">Cet espace est ton laboratoire d'idées. Note ici tes observations sur le monde, tes prises de conscience soudaines, ou des concepts que tu souhaites explorer plus tard.</p>
              <p>Que ce soit une réflexion sur la psychologie humaine, une idée de business, ou une simple observation quotidienne, documenter tes pensées permet de libérer ton esprit et de structurer ta vision du monde.</p>
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
            <input
              type="text"
              placeholder="Rechercher une réflexion..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-emerald-950/50 border border-emerald-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-emerald-700 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={openCreate}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-900/50"
          >
            <Plus className="w-5 h-5" />
            Nouvelle réflexion
          </button>
        </div>

        {!isAdding && statusMsg && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {statusMsg}
          </div>
        )}

        {isAdding && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 lg:p-6">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={resetForm} />

            <div className="relative w-full h-[calc(100dvh-24px)] lg:h-[92vh] lg:max-w-7xl rounded-[28px] border border-emerald-800/60 bg-emerald-950 shadow-2xl overflow-hidden flex flex-col lg:flex-row">
              <div className="w-full min-h-0 flex flex-col lg:w-[64%] lg:border-r border-emerald-900/60">
                <div className="sticky top-0 z-10 bg-emerald-950/95 backdrop-blur-md border-b border-emerald-900/60 px-4 md:px-8 py-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                      {editingId ? 'Modifier la réflexion' : 'Nouvelle réflexion'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={resetForm}
                      className="p-2.5 md:p-3 text-emerald-400 hover:text-white hover:bg-emerald-900/50 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaveDisabled}
                      className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-emerald-950 px-3 md:px-4 py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base transition-colors max-[314px]:px-2.5 max-[314px]:aspect-square"
                    >
                      {isSubmitting || isVerifyingEthics ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span className="max-[314px]:hidden">
                        {isVerifyingEthics ? 'Vérification...' : isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5 md:py-8 space-y-6 md:space-y-8">
                  {statusMsg && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {statusMsg}
                    </div>
                  )}

                  <div className="rounded-3xl border border-emerald-800/40 bg-emerald-900/10 p-5 md:p-6">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                        Sujet
                      </div>
                      <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-400 font-medium">
                        # L'idée principale
                      </div>
                    </div>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Sujet de la réflexion..."
                      className="w-full bg-transparent border-b border-emerald-800/60 pb-3 text-lg md:text-3xl font-serif font-bold text-white placeholder-emerald-600/70 focus:outline-none focus:border-emerald-500"
                      autoFocus
                    />
                  </div>

                  <div className="rounded-3xl border border-emerald-800/40 bg-emerald-900/10 p-5 md:p-6">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                        Développement
                      </div>
                      <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-400 font-medium">
                        # Le fil de tes pensées
                      </div>
                    </div>
                    <textarea
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      placeholder="Développe ta pensée..."
                      className="w-full bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4 text-emerald-50 placeholder-emerald-600/70 focus:outline-none focus:border-emerald-500 min-h-[220px] md:min-h-[250px] resize-y leading-relaxed"
                    />
                  </div>

                  <div className="rounded-3xl border border-emerald-800/40 bg-emerald-900/10 p-5 md:p-6">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                        Tags
                      </div>
                      <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-400 font-medium">
                        # Pour retrouver l'idée
                      </div>
                    </div>
                    <input
                      type="text"
                      value={formTags}
                      onChange={(e) => setFormTags(e.target.value)}
                      placeholder="Tags séparés par des virgules..."
                      className="w-full bg-emerald-950/50 border border-emerald-800 rounded-xl px-4 py-3 text-sm text-white placeholder-emerald-600/80 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="hidden lg:flex w-[36%] min-h-0 flex-col bg-emerald-900/10">
                <div className="border-b border-emerald-900/60 px-4 md:px-6 py-4 md:py-5 shrink-0">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-800/60 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">SOPHIA</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/40 p-4 text-sm text-emerald-200/80 leading-relaxed">
                    <p>Sophia t'aide à creuser tes idées, à trouver des exemples ou à synthétiser ta pensée.</p>
                    <div className="mt-3 pt-3 border-t border-emerald-800/30 flex items-start gap-2 text-emerald-400/80 text-xs font-medium">
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>Pense à <strong>sauvegarder</strong> tes modifications pour que Sophia puisse les prendre en compte dans ses réponses.</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {CHAT_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setChatInput(suggestion)}
                        className="px-3 py-2 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-xs text-emerald-300 hover:text-white hover:border-emerald-600 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4 md:py-5 space-y-4">
                  {chatMessages.map((message) => (
                    <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-line ${
                          message.sender === 'user'
                            ? 'bg-emerald-600 text-white rounded-br-none'
                            : 'bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                        }`}
                      >
                        {message.text}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-emerald-900/60 p-4 md:p-6 shrink-0">
                  <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/50 p-3">
                    <div className="flex items-start gap-3">
                      <MessageSquare className="w-4 h-4 text-emerald-500 mt-3 shrink-0" />
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Demande à Sophia..."
                        className="flex-1 min-h-[72px] bg-transparent text-sm text-white placeholder-emerald-700 resize-none focus:outline-none"
                      />
                      <button
                        onClick={handleSendChat}
                        className="mt-1 p-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {!showMobileSophia && (
                <div className="lg:hidden absolute bottom-4 right-4 z-10">
                  <div
                    onClick={() => setShowMobileSophia(true)}
                    className="bg-emerald-600 text-white p-4 rounded-full shadow-xl shadow-emerald-900/50 animate-bounce-slow border border-emerald-400/20 active:scale-95 transition-transform cursor-pointer flex items-center justify-center"
                    role="button"
                    aria-label="Ouvrir l'assistant Sophia"
                  >
                    <Sparkles className="w-6 h-6 pointer-events-none" />
                  </div>
                </div>
              )}

              {showMobileSophia && (
                <div className="lg:hidden absolute inset-0 z-20 bg-emerald-950 flex flex-col h-full">
                  <div className="flex items-center justify-between px-4 py-4 border-b border-emerald-900/60 bg-emerald-950/95 backdrop-blur-md shrink-0">
                    <div className="flex items-center gap-3">
                      <Bot className="w-5 h-5 text-emerald-300" />
                      <div className="text-sm uppercase tracking-[0.2em] text-emerald-500 font-bold">SOPHIA</div>
                    </div>
                    <button
                      onClick={() => setShowMobileSophia(false)}
                      className="p-1 text-emerald-400 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="border-b border-emerald-900/40 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowMobileSophiaDetails((current) => !current)}
                      className="flex w-full items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest text-emerald-400 hover:text-white transition-colors"
                    >
                      {showMobileSophiaDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      Détails
                    </button>

                    {showMobileSophiaDetails && (
                      <div className="animate-fade-in border-t border-emerald-900/40">
                        <div className="px-4 py-4 text-sm text-emerald-200/80 leading-relaxed">
                          <p>Sophia t'aide à creuser tes idées, à trouver des exemples ou à synthétiser ta pensée.</p>
                          <div className="mt-3 pt-3 border-t border-emerald-800/30 flex items-start gap-2 text-emerald-400/80 text-xs font-medium">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>Pense à <strong>sauvegarder</strong> tes modifications pour que Sophia puisse les prendre en compte dans ses réponses.</p>
                          </div>
                        </div>

                        <div className="px-4 pb-4 flex flex-wrap gap-2">
                          {CHAT_SUGGESTIONS.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => setChatInput(suggestion)}
                              className="px-3 py-2 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-xs text-emerald-300 hover:text-white hover:border-emerald-600 transition-colors"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
                    {chatMessages.map((message) => (
                      <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-line ${
                            message.sender === 'user'
                              ? 'bg-emerald-600 text-white rounded-br-none'
                              : 'bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none'
                          }`}
                        >
                          {message.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-emerald-900/60 px-4 py-3 shrink-0">
                    <div className="flex items-start gap-3">
                      <MessageSquare className="w-4 h-4 text-emerald-500 mt-3 shrink-0" />
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Demande à Sophia..."
                        className="flex-1 min-h-[72px] bg-transparent text-sm text-white placeholder-emerald-700 resize-none focus:outline-none"
                      />
                      <button
                        onClick={handleSendChat}
                        className="mt-1 p-3 text-white transition-colors hover:text-emerald-300"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12 animate-pulse">
            <Lightbulb className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6 opacity-50" />
            <p className="text-sm md:text-base font-serif text-emerald-500/70">Chargement des réflexions...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredReflections.map((ref) => (
              <div
                key={ref.id}
                className="group relative bg-emerald-900/20 border border-emerald-800/50 rounded-2xl p-6 md:p-8 hover:bg-emerald-900/30 hover:border-emerald-600/50 transition-all duration-300 flex flex-col"
              >
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button
                    onClick={() => editReflection(ref)}
                    disabled={busyReflectionId === ref.id}
                    className="p-2 text-emerald-600/50 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Modifier"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteReflection(ref.id)}
                    disabled={busyReflectionId === ref.id}
                    className="p-2 text-emerald-600/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Supprimer"
                  >
                    {busyReflectionId === ref.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>

                <div className="text-xs text-emerald-500 mb-3 font-mono">{ref.date}</div>
                <h3 className="text-xl font-serif font-bold text-white mb-4">{ref.title}</h3>
                <p className="text-emerald-100/80 leading-relaxed mb-6 flex-1 whitespace-pre-line">
                  {ref.content || "Aucun développement pour l'instant."}
                </p>

                {ref.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-emerald-800/30">
                    {ref.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 bg-emerald-950/50 border border-emerald-800/50 rounded text-[10px] text-emerald-400 uppercase tracking-wider">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && filteredReflections.length === 0 && !isAdding && (
          <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12">
            <Lightbulb className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6" />
            {searchQuery ? (
              <>
                <h3 className="text-xl md:text-2xl font-serif font-bold text-emerald-100 mb-2 md:mb-3">Aucun résultat</h3>
                <p className="text-sm md:text-base text-emerald-400 max-w-sm mx-auto">
                  Aucune réflexion ne correspond à ta recherche.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl md:text-2xl font-serif font-bold text-emerald-100 mb-2 md:mb-3">Aucune réflexion pour le moment</h3>
                <p className="text-sm md:text-base text-emerald-400 max-w-sm mx-auto mb-6 md:mb-8">
                  Prends un moment pour poser tes pensées, tes doutes ou tes idées du moment.
                </p>
                <button
                  onClick={() => setIsAdding(true)}
                  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base transition-colors shadow-lg shadow-emerald-900/50"
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5" />
                  Nouvelle réflexion
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {reflectionToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setReflectionToDelete(null)} />
          <div className="relative bg-emerald-950 border border-emerald-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
            <h3 className="text-xl font-serif font-bold text-white mb-2">Supprimer cette réflexion ?</h3>
            <p className="text-emerald-200/70 text-sm mb-6">
              Cette action est irréversible. Es-tu sûr de vouloir supprimer cette réflexion ?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setReflectionToDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-emerald-400 hover:text-white hover:bg-emerald-900/50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={busyReflectionId === reflectionToDelete}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {busyReflectionId === reflectionToDelete && <Loader2 className="w-4 h-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
