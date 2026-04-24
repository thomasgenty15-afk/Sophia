import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Info,
  Loader2,
  Plus,
  Save,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { shouldValidateOnUpdate, validateEthicalText } from '../../lib/ethicalValidation';
import {
  clearStoryDraftCache,
  isArchitectDraftExpired,
  loadStoryDraftCache,
  persistStoryDraftCache,
} from '../../lib/architectDraftCache';
import { newRequestId, requestHeaders } from '../../lib/requestId';
import { supabase } from '../../lib/supabase';

const sanitizeBrokenGlyphs = (s: string) =>
  s.replace(/[\uFFFD\uFFFE\uFFFF]/g, '').replace(/\uD83D[\uDC00-\uDFFF]|\uD83C[\uDC00-\uDFFF]/g, '').trim();

interface Story {
  id: string;
  title: string;
  duration: string;
  bulletPoints: string[];
  speechMap: string;
  topicTags: string[];
}

type StoryRow = {
  id: string;
  title: string;
  duration_label: string | null;
  bullet_points: string[] | null;
  speech_map: string | null;
  topic_tags: string[] | null;
  created_at: string;
  updated_at: string;
};

interface StoryChatMessage {
  id: number;
  sender: 'user' | 'ai';
  text: string;
}

const STORY_SELECT = 'id,title,duration_label,bullet_points,speech_map,topic_tags,created_at,updated_at';
const MAX_BULLET_POINTS = 24;
const MAX_TOPIC_TAGS = 16;

const ExplanationDropdown = ({ explanation, example }: { explanation: string; example: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-500/80 hover:text-emerald-400 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
        {isOpen ? 'Masquer les explications' : 'Comment remplir cette section ?'}
        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {isOpen && (
        <div className="mt-3 p-4 bg-emerald-950/40 border border-emerald-800/40 rounded-xl text-sm text-emerald-200/80 leading-relaxed animate-fade-in">
          <p className="mb-3">{explanation}</p>
          <div className="bg-emerald-900/30 p-3 rounded-lg border-l-2 border-emerald-600">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2 block">
              Exemple (L&apos;histoire du projet raté) :
            </span>
            {example}
          </div>
        </div>
      )}
    </div>
  );
};

const createEmptyStory = (): Story => ({
  id: Date.now().toString(),
  title: '',
  duration: '',
  bulletPoints: ['', '', ''],
  speechMap: '',
  topicTags: [],
});

const normalizeTextList = (values: string[], maxItems?: number): string[] => {
  const nextValues = values
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  return typeof maxItems === 'number' ? nextValues.slice(0, maxItems) : nextValues;
};

const normalizeTopicTags = (values: string[]): string[] => {
  const nextValues: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const cleaned = rawValue.trim().replace(/\s+/g, ' ');
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    nextValues.push(cleaned);
    if (nextValues.length >= MAX_TOPIC_TAGS) break;
  }

  return nextValues;
};

const normalizeStoryForSave = (story: Story): Story => ({
  ...story,
  title: story.title.trim(),
  duration: story.duration.trim(),
  bulletPoints: normalizeTextList(story.bulletPoints, MAX_BULLET_POINTS),
  speechMap: story.speechMap.trim(),
  topicTags: normalizeTopicTags(story.topicTags),
});

const rowToStory = (row: StoryRow): Story => ({
  id: row.id,
  title: row.title,
  duration: row.duration_label ?? '',
  bulletPoints: normalizeTextList(row.bullet_points ?? [], MAX_BULLET_POINTS),
  speechMap: String(row.speech_map ?? '').trim(),
  topicTags: normalizeTopicTags(row.topic_tags ?? []),
});

const toValidationTextFields = (story: Story) => ({
  title: story.title,
  duration: story.duration,
  bullet_points: story.bulletPoints.join('\n'),
  speech_map: story.speechMap,
  topic_tags: story.topicTags.join(', '),
});

const mergeStoryAtTop = (stories: Story[], nextStory: Story): Story[] => [
  nextStory,
  ...stories.filter((story) => story.id !== nextStory.id),
];

function TypingDot() {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-2 h-2 rounded-full bg-emerald-200/90 animate-pulse"
        aria-hidden="true"
      />
      <span className="sr-only">Sophia est en train d'écrire...</span>
    </span>
  );
}

export const StoriesTab: React.FC = () => {
  const { user } = useAuth();
  const [showExplanation, setShowExplanation] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showMobileSophia, setShowMobileSophia] = useState(false);
  const [showMobileSophiaDetails, setShowMobileSophiaDetails] = useState(false);
  const [showDesktopSophiaDetails, setShowDesktopSophiaDetails] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [busyStoryId, setBusyStoryId] = useState<string | null>(null);
  const [storyToDelete, setStoryToDelete] = useState<string | null>(null);
  const [draftStory, setDraftStory] = useState<Story>(createEmptyStory());
  const [draftTagInput, setDraftTagInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  // Temporary scope ID for the current editing session.
  // For new stories: a temp UUID until saved; for existing: the story's real ID.
  const chatScopeRef = useRef<string>(crypto.randomUUID());
  const [filRouge, setFilRouge] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<StoryChatMessage[]>([
    {
      id: 1,
      sender: 'ai',
      text: "Je peux t'aider à transformer un épisode vécu en histoire utile pour parler, convaincre ou inspirer. On part de ton réel, pas d'une histoire inventée. Commence par me donner le contexte ou l'émotion clé.",
    },
  ]);

  const isDraftScope = (scope: string) => scope.startsWith('story:draft:');

  const hasMeaningfulDraft = () =>
    Boolean(
      draftStory.title.trim() ||
      draftStory.duration.trim() ||
      draftStory.bulletPoints.some((bullet) => bullet.trim()) ||
      draftStory.speechMap.trim() ||
      draftStory.topicTags.length > 0 ||
      chatMessages.length > 1
    );

  const persistCurrentDraft = () => {
    if (!user?.id) return;
    const scope = chatScopeRef.current;
    if (!isDraftScope(scope) || !hasMeaningfulDraft()) return;
    persistStoryDraftCache(user.id, {
      scope,
      title: draftStory.title,
      duration: draftStory.duration,
      bulletPoints: draftStory.bulletPoints,
      speechMap: draftStory.speechMap,
      topicTags: draftStory.topicTags,
      filRouge,
    });
  };

  const clearCurrentDraft = () => {
    if (!user?.id) return;
    clearStoryDraftCache(user.id);
  };

  const deleteDraftScopeData = async (scope: string) => {
    if (!user?.id || !isDraftScope(scope)) return;
    try {
      await supabase
        .from('conversation_scope_memories')
        .delete()
        .eq('user_id', user.id)
        .eq('scope', scope);
      await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', user.id)
        .eq('scope', scope);
    } catch (error) {
      console.warn('[StoriesTab] draft cleanup failed', error);
    }
  };

  const loadChatHistory = async (scope: string, fallbackText: string) => {
    if (!user?.id) {
      return [{ id: 1, sender: 'ai' as const, text: fallbackText }];
    }

    const { data } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .eq('scope', scope)
      .order('created_at', { ascending: true })
      .limit(40);

    if (data && data.length > 0) {
      return data.map((row, i) => ({
        id: Date.now() + i,
        sender: row.role === 'user' ? 'user' as const : 'ai' as const,
        text: row.content as string,
      }));
    }

    return [{ id: 1, sender: 'ai' as const, text: fallbackText }];
  };

  const closeDraftComposer = () => {
    if (hasMeaningfulDraft()) {
      persistCurrentDraft();
    } else {
      const scope = chatScopeRef.current;
      clearCurrentDraft();
      if (isDraftScope(scope)) {
        void deleteDraftScopeData(scope);
      }
    }

    setIsModalOpen(false);
    setShowMobileSophia(false);
    setShowMobileSophiaDetails(false);
    setDraftTagInput('');
    setChatInput('');
  };

  useEffect(() => {
    let cancelled = false;

    const loadStories = async () => {
      if (!user?.id) {
        if (!cancelled) {
          setStories([]);
          setLoading(false);
          setStatusMsg(null);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setStatusMsg(null);
      }

      try {
        const { data, error } = await supabase
          .from('user_architect_stories')
          .select(STORY_SELECT)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false });

        if (error) throw error;
        if (!cancelled) {
          setStories(((data ?? []) as StoryRow[]).map(rowToStory));
        }
      } catch (error) {
        console.error('[StoriesTab] load failed', error);
        if (!cancelled) {
          setStories([]);
          setStatusMsg("Impossible de charger tes histoires pour le moment.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadStories();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!isModalOpen || !user?.id || !isDraftScope(chatScopeRef.current)) return;
    if (!hasMeaningfulDraft()) return;
    persistCurrentDraft();
  }, [user?.id, isModalOpen, draftStory, filRouge, chatMessages]);

  const filteredStories = useMemo(
    () =>
      stories.filter(
        (story) =>
          story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          story.topicTags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [searchQuery, stories]
  );

  const openCreateModal = async () => {
    setFilRouge(null);
    setDraftStory(createEmptyStory());
    setDraftTagInput('');
    setChatInput('');
    setStatusMsg(null);

    const cachedDraft = user?.id ? loadStoryDraftCache(user.id) : null;
    if (cachedDraft && isArchitectDraftExpired(cachedDraft.updatedAt)) {
      clearCurrentDraft();
      void deleteDraftScopeData(cachedDraft.scope);
    }

    if (cachedDraft && !isArchitectDraftExpired(cachedDraft.updatedAt)) {
      chatScopeRef.current = cachedDraft.scope;
      setFilRouge(cachedDraft.filRouge);
      setDraftStory({
        id: cachedDraft.scope,
        title: cachedDraft.title,
        duration: cachedDraft.duration,
        bulletPoints: cachedDraft.bulletPoints.length > 0 ? cachedDraft.bulletPoints : [''],
        speechMap: cachedDraft.speechMap,
        topicTags: cachedDraft.topicTags,
      });
      setStatusMsg("Brouillon non enregistré repris.");
      setChatMessages(await loadChatHistory(
        cachedDraft.scope,
        "Nouvelle histoire. Je vais t'aider à structurer un épisode de ton vécu pour qu'il soit clair, mémorable et réutilisable dans tes conversations.",
      ));
      setIsModalOpen(true);
      return;
    }

    const tempId = crypto.randomUUID();
    chatScopeRef.current = `story:draft:${tempId}`;
    setChatMessages([
      {
        id: 1,
        sender: 'ai',
        text: "Nouvelle histoire. Je vais t'aider à structurer un épisode de ton vécu pour qu'il soit clair, mémorable et réutilisable dans tes conversations.",
      },
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = async (story: Story) => {
    const scope = `story:${story.id}`;
    chatScopeRef.current = scope;
    setFilRouge(null);
    setDraftStory({
      ...story,
      bulletPoints: story.bulletPoints.length > 0 ? story.bulletPoints : [''],
    });
    setDraftTagInput('');
    setChatInput('');
    setStatusMsg(null);
    // Load existing chat history for this story
    const welcomeMsg: StoryChatMessage = {
      id: 1,
      sender: 'ai',
      text: "Je vois déjà la base de ton histoire. On peut maintenant affiner ce vécu pour qu'il soit plus clair, plus vivant et plus utile en communication.",
    };
    setChatMessages(await loadChatHistory(scope, welcomeMsg.text));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    closeDraftComposer();
  };

  const updateDraftStory = (updates: Partial<Story>) => {
    setDraftStory((current) => ({ ...current, ...updates }));
  };

  const addBulletPoint = () => {
    if (draftStory.bulletPoints.length >= MAX_BULLET_POINTS) {
      setStatusMsg(`Une histoire peut contenir jusqu'à ${MAX_BULLET_POINTS} bullet points.`);
      return;
    }
    setStatusMsg(null);
    updateDraftStory({ bulletPoints: [...draftStory.bulletPoints, ''] });
  };

  const updateBulletPoint = (index: number, value: string) => {
    const nextBullets = [...draftStory.bulletPoints];
    nextBullets[index] = value;
    updateDraftStory({ bulletPoints: nextBullets });
  };

  const removeBulletPoint = (index: number) => {
    const nextBullets = draftStory.bulletPoints.filter((_, bulletIndex) => bulletIndex !== index);
    updateDraftStory({ bulletPoints: nextBullets.length > 0 ? nextBullets : [''] });
  };

  const addTag = () => {
    const value = draftTagInput.trim();
    if (!value) return;

    if (draftStory.topicTags.length >= MAX_TOPIC_TAGS) {
      setStatusMsg(`Une histoire peut contenir jusqu'à ${MAX_TOPIC_TAGS} tags.`);
      return;
    }

    const nextTags = normalizeTopicTags([...draftStory.topicTags, value]);
    if (nextTags.length === draftStory.topicTags.length) {
      setDraftTagInput('');
      return;
    }

    setStatusMsg(null);
    updateDraftStory({ topicTags: nextTags });
    setDraftTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    updateDraftStory({
      topicTags: draftStory.topicTags.filter((tag) => tag !== tagToRemove),
    });
  };

  const runEthicalValidation = async (params: {
    operation: 'create' | 'update';
    textFields: Record<string, unknown>;
    previousTextFields?: Record<string, unknown> | null;
    textFieldKeys: string[];
  }) => {
    const result = await validateEthicalText({
      entityType: 'story',
      operation: params.operation,
      textFields: params.textFields,
      previousTextFields: params.previousTextFields ?? null,
      textFieldKeys: params.textFieldKeys,
      context: { scope: 'architect_story' },
    });

    if (result.decision === 'block') {
      throw new Error(result.reasonShort || "Contenu bloque par la verification ethique.");
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    const normalizedDraft = normalizeStoryForSave(draftStory);
    const hasMeaningfulContent =
      normalizedDraft.title.length > 0 ||
      normalizedDraft.duration.length > 0 ||
      normalizedDraft.bulletPoints.length > 0 ||
      normalizedDraft.speechMap.length > 0 ||
      normalizedDraft.topicTags.length > 0;

    if (!hasMeaningfulContent) {
      setStatusMsg("Ajoute au moins un début d'histoire avant de sauvegarder.");
      return;
    }

    const storyToPersist: Story = {
      ...normalizedDraft,
      title: normalizedDraft.title || 'Nouvelle histoire',
    };
    const existingStory = stories.find((story) => story.id === storyToPersist.id) ?? null;
    const nextTextFields = toValidationTextFields(storyToPersist);
    const previousTextFields = existingStory ? toValidationTextFields(existingStory) : null;
    const textFieldKeys = Object.keys(nextTextFields);
    const shouldRunValidation =
      !existingStory || shouldValidateOnUpdate(previousTextFields, nextTextFields, textFieldKeys);

    if (existingStory && !shouldRunValidation) {
      closeModal();
      return;
    }

    setIsSubmitting(true);
    setStatusMsg(null);

    try {
      if (shouldRunValidation) {
        await runEthicalValidation({
          operation: existingStory ? 'update' : 'create',
          textFields: nextTextFields,
          previousTextFields,
          textFieldKeys,
        });
      }

      const payload = {
        user_id: user.id,
        title: storyToPersist.title,
        duration_label: storyToPersist.duration || null,
        bullet_points: storyToPersist.bulletPoints,
        speech_map: storyToPersist.speechMap,
        topic_tags: storyToPersist.topicTags,
      };

      let savedRow: StoryRow | null = null;

      if (existingStory) {
        const { data, error } = await supabase
          .from('user_architect_stories')
          .update(payload)
          .eq('id', existingStory.id)
          .select(STORY_SELECT)
          .single();
        if (error) throw error;
        savedRow = data as StoryRow;
      } else {
        const { data, error } = await supabase
          .from('user_architect_stories')
          .insert(payload)
          .select(STORY_SELECT)
          .single();
        if (error) throw error;
        savedRow = data as StoryRow;
      }

      const savedStory = rowToStory(savedRow);
      setStories((current) => mergeStoryAtTop(current, savedStory));

      // Migrate chat history from draft scope to real story scope
      const oldScope = chatScopeRef.current;
      const newScope = `story:${savedStory.id}`;
      if (oldScope !== newScope && oldScope.startsWith('story:draft:') && user?.id) {
        await supabase
          .from('chat_messages')
          .update({ scope: newScope })
          .eq('user_id', user.id)
          .eq('scope', oldScope);
        await supabase
          .from('conversation_scope_memories')
          .update({ scope: newScope })
          .eq('user_id', user.id)
          .eq('scope', oldScope);
        chatScopeRef.current = newScope;
      }

      clearCurrentDraft();
      closeModal();
    } catch (error: any) {
      console.error('[StoriesTab] save failed', error);
      setStatusMsg(String(error?.message || "Impossible d'enregistrer cette histoire."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStory = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    setStatusMsg(null);
    setStoryToDelete(id);
  };

  const confirmDelete = async () => {
    if (!storyToDelete) return;

    setBusyStoryId(storyToDelete);
    setStatusMsg(null);
    try {
      const { error } = await supabase
        .from('user_architect_stories')
        .delete()
        .eq('id', storyToDelete);
      if (error) throw error;

      setStories((current) => current.filter((story) => story.id !== storyToDelete));
      setStoryToDelete(null);
    } catch (error: any) {
      console.error('[StoriesTab] delete failed', error);
      setStatusMsg(String(error?.message || "Impossible de supprimer cette histoire."));
    } finally {
      setBusyStoryId(null);
    }
  };

  const handleSendChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading || !user?.id) return;

    const userMessage: StoryChatMessage = { id: Date.now(), sender: 'user', text: trimmed };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setIsChatLoading(true);
    persistStoryDraftCache(user.id, {
      scope: chatScopeRef.current,
      title: draftStory.title,
      duration: draftStory.duration,
      bulletPoints: draftStory.bulletPoints,
      speechMap: draftStory.speechMap,
      topicTags: draftStory.topicTags,
      filRouge,
    });

    try {
      const contextLines: string[] = [
        '=== CONTEXTE HISTOIRE (UI) ===',
        "Cette fiche d'histoire à remplir comporte exactement 5 parties visibles.",
        "1. Nom : le titre évocateur de l'histoire.",
        "2. Durée : la durée estimée pour raconter l'histoire.",
        "3. Bullet points : les faits bruts, la chronologie concrète de ce qu'il s'est passé.",
        "4. Speech map : la version racontable, avec structure, rythme, accroche, bascule et leçon.",
        "5. Tags : quelques mots-clés pour retrouver l'histoire plus tard.",
        "Si l'utilisateur demande un premier jet, un brouillon, ou de remplir la structure, réponds directement dans ce format :",
        "Nom : ...",
        "Durée : ...",
        "Bullet points :",
        "- ...",
        "- ...",
        "- ...",
        "Speech map : ...",
        "Tags : tag1, tag2, tag3",
        "Ne demande pas ce qu'il y a à remplir : la structure est déjà définie par l'interface.",
        `Nom actuel : ${draftStory.title || '(pas encore nommée)'}`,
        `Durée actuelle : ${draftStory.duration || '(non définie)'}`,
        `Bullet points actuels : ${draftStory.bulletPoints.filter(Boolean).join(' | ') || '(vide)'}`,
        `Speech map actuelle : ${draftStory.speechMap ? draftStory.speechMap.slice(0, 500) : '(vide)'}`,
        `Tags actuels : ${draftStory.topicTags.join(', ') || '(aucun)'}`,
        "L'utilisateur est en train de construire ou affiner une histoire personnelle pour la communication.",
        "Aide-le à clarifier le contexte, la rupture, la bascule et la transformation de son récit.",
        "Quand c'est utile, formule une réponse directement exploitable et copiable dans les champs visibles.",
      ];
      if (filRouge) contextLines.push(`Fil rouge (synthèse en cours) : ${filRouge}`);

      const requestId = newRequestId();
      const { data, error } = await supabase.functions.invoke('sophia-brain', {
        body: {
          message: trimmed,
          scope: chatScopeRef.current,
          contextOverride: contextLines.join('\n'),
          requestId,
        },
        headers: requestHeaders(requestId),
      });

      if (error) throw error;

      let rawText: string = String(data?.content ?? data?.reply ?? data?.message ?? '').trim();
      const filRougeMatch = rawText.match(/<!--fil_rouge:([\s\S]*?)-->/);
      if (filRougeMatch) {
        setFilRouge(filRougeMatch[1].trim());
        rawText = rawText.replace(/<!--fil_rouge:[\s\S]*?-->/, '').trim();
      }
      const assistantText = sanitizeBrokenGlyphs(rawText) || "Je n'ai pas réussi à formuler une réponse. Réessaie ?";

      setChatMessages((current) => [
        ...current,
        { id: Date.now(), sender: 'ai', text: assistantText },
      ]);
    } catch (err) {
      console.error('[StoriesTab] chat error', err);
      setChatMessages((current) => [
        ...current,
        { id: Date.now(), sender: 'ai', text: "Une erreur s'est produite. Réessaie dans un instant." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
      <div className="p-6 md:p-12 pb-6 md:pb-8 shrink-0">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-emerald-100 mb-4">Histoires</h1>
          <p className="text-sm md:text-base text-emerald-400 max-w-2xl mx-auto italic mb-6">
            &quot;Ici, tu ne crées pas de fiction. Tu transformes ton vécu en histoires transmissibles, utiles et incarnées.&quot;
          </p>

          <div className="flex flex-col gap-4 mb-8">
            <div>
              <button
                type="button"
                onClick={() => setShowWhy(!showWhy)}
                className="text-xs font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center justify-center gap-2 mx-auto transition-colors"
              >
                {showWhy ? 'Masquer' : 'À quoi ça sert ?'}
                {showWhy ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showWhy && (
                <div className="mt-4 p-6 bg-emerald-900/20 border border-emerald-800/50 rounded-2xl text-left text-emerald-100/80 text-sm leading-relaxed max-w-2xl mx-auto animate-fade-in">
                  <p className="mb-6">
                    C&apos;est une manière de mieux comprendre ce que tu as vécu, puis d&apos;en parler plus clairement.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/35 p-4">
                      <div className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">
                        Pour toi d&apos;abord
                      </div>
                    <p className="text-sm text-emerald-50/85 leading-relaxed">
                      Mettre ton vécu en histoire t&apos;aide à prendre du recul, à comprendre ce qui s&apos;est vraiment joué, à retenir les leçons et surtout à être capable de mieux en parler.
                    </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/35 p-4">
                      <div className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">
                        Et ensuite pour les autres
                      </div>
                    <p className="text-sm text-emerald-50/85 leading-relaxed">
                      Quand tu arrives à mieux en parler, les autres comprennent plus vite qui tu es, ce que tu as traversé et ce que tu veux transmettre. Tes histoires créent alors naturellement de l&apos;attention, de la confiance, de la connexion et de la mémorisation.
                    </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowExplanation(!showExplanation)}
                className="text-xs font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center justify-center gap-2 mx-auto transition-colors"
              >
                {showExplanation ? 'Masquer les explications' : 'Comment utiliser cet espace'}
                {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showExplanation && (
                <div className="mt-4 p-6 bg-emerald-900/20 border border-emerald-800/50 rounded-2xl text-left text-emerald-100/80 text-sm leading-relaxed max-w-2xl mx-auto animate-fade-in">
              <p className="mb-3">
                Cet espace est réservé à des histoires ancrées dans ton vécu réel. Le but n&apos;est pas
                d&apos;inventer des récits, mais de capturer des épisodes que tu as vraiment traversés pour pouvoir
                les raconter avec justesse.
              </p>
              <p className="mb-3">
                Note ici les situations, les tournants, les erreurs, les prises de conscience et les moments
                marquants que tu peux réutiliser dans une conversation, un rendez-vous, une prise de parole, un
                contenu, un podcast, une vente ou un moment important de ta vie.
              </p>
              <p>
                Sophia t&apos;aide ensuite à clarifier l&apos;angle, l&apos;émotion, la leçon et le contexte d&apos;usage pour
                transformer ce vécu en histoire claire, solide et vraiment exploitable.
              </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 md:px-12 pb-6">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div className="flex-1 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
              <input
                type="text"
                placeholder="Rechercher par titre ou tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-emerald-950/40 border border-emerald-800/60 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-emerald-600/80 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-3">
              <div className="px-4 py-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-sm text-emerald-300">
                {loading ? '...' : `${stories.length} histoires`}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void openCreateModal()}
            className="w-full lg:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-900/50"
          >
            <Plus className="w-5 h-5" />
            Nouvelle histoire
          </button>
        </div>
      </div>

      {statusMsg && !isModalOpen && (
        <div className="px-6 md:px-12 pb-4">
          <div className="max-w-6xl mx-auto rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {statusMsg}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 md:px-12 pb-10">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12 animate-pulse">
              <BookOpen className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6 opacity-50" />
              <p className="text-sm md:text-base font-serif text-emerald-500/70">Chargement de tes histoires...</p>
            </div>
          ) : filteredStories.length === 0 ? (
            <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12">
              <BookOpen className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6" />
              {searchQuery ? (
                <>
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-emerald-100 mb-2 md:mb-3">Aucun résultat</h3>
                  <p className="text-sm md:text-base text-emerald-400 max-w-sm mx-auto">
                    Aucune histoire ne correspond à ta recherche.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-emerald-100 mb-2 md:mb-3">Aucune histoire pour le moment</h3>
                  <p className="text-sm md:text-base text-emerald-400 max-w-sm mx-auto mb-6 md:mb-8">
                    Commence par documenter une expérience forte que tu aimerais pouvoir raconter dans le bon contexte.
                  </p>
                  <button
                    type="button"
                    onClick={() => void openCreateModal()}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base transition-colors shadow-lg shadow-emerald-900/50"
                  >
                    <Plus className="w-4 h-4 md:w-5 md:h-5" />
                    Créer une histoire
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredStories.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => openEditModal(story)}
                  className="w-full flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 md:p-6 rounded-2xl border border-emerald-800/40 bg-emerald-950/30 hover:bg-emerald-900/40 hover:border-emerald-600/50 transition-all text-left group shadow-sm relative"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="text-xl font-serif font-bold text-white truncate group-hover:text-emerald-300 transition-colors pr-8">
                        {story.title || 'Nouvelle histoire'}
                      </h3>
                      <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/50">
                        <Clock className="w-3.5 h-3.5" /> {story.duration || '--'}
                      </span>
                    </div>

                    <p className="text-sm text-emerald-200/60 truncate mb-4 max-w-3xl">
                      {story.speechMap?.replace(/\n/g, ' • ') || story.bulletPoints.find((bullet) => bullet.trim()) || "Aucune structure définie. Clique pour éditer."}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {story.topicTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-1 rounded-md bg-emerald-900/40 border border-emerald-700/50 text-[10px] uppercase tracking-widest text-emerald-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-end gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <div
                      onClick={(event) => handleDeleteStory(event, story.id)}
                      className="p-2 text-emerald-600/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors z-10"
                      title="Supprimer l'histoire"
                    >
                      {busyStoryId === story.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                    </div>
                    <div className="text-emerald-700 group-hover:text-emerald-400 transition-colors md:pl-2 flex items-center justify-center">
                      <ChevronRight className="w-6 h-6" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 lg:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDraftComposer} />

          <div className="relative w-full h-[calc(100dvh-24px)] lg:h-[92vh] lg:max-w-7xl rounded-[28px] border border-emerald-800/60 bg-emerald-950 shadow-2xl overflow-hidden flex flex-col lg:flex-row">
            <div className="w-full min-h-0 flex flex-col lg:w-[64%] lg:border-r border-emerald-900/60">
              <div className="sticky top-0 z-10 bg-emerald-950/95 backdrop-blur-md border-b border-emerald-900/60 px-4 md:px-8 py-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                    Création d&apos;histoire
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={closeDraftComposer}
                    className="p-2.5 md:p-3 text-emerald-400 hover:text-white hover:bg-emerald-900/50 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSubmitting}
                    className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-70 disabled:cursor-not-allowed text-emerald-950 px-3 md:px-4 py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base transition-colors max-[314px]:px-2.5 max-[314px]:aspect-square"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span className="max-[314px]:hidden">Sauvegarder</span>
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
                      Nom
                    </div>
                    <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-400 font-medium">
                      # Évocateur
                    </div>
                  </div>
                  <input
                    type="text"
                    value={draftStory.title}
                    onChange={(e) => updateDraftStory({ title: e.target.value })}
                    placeholder="Nom de l'histoire..."
                    className="w-full bg-transparent border-b border-emerald-800/60 pb-3 text-lg md:text-3xl font-serif font-bold text-white placeholder-emerald-600/70 focus:outline-none focus:border-emerald-500"
                  />

                  <div className="mt-5 flex items-center gap-3 max-w-xs">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <input
                      type="text"
                      value={draftStory.duration}
                      onChange={(e) => updateDraftStory({ duration: e.target.value })}
                      placeholder="Durée"
                      className="w-full bg-emerald-950/50 border border-emerald-800 rounded-xl px-4 py-3 text-sm text-white placeholder-emerald-600/80 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-800/40 bg-emerald-900/10 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                      <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                        Bullet points
                      </div>
                      <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-400 font-medium">
                        # Les faits bruts
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addBulletPoint}
                      className="shrink-0 flex items-center justify-center gap-2 text-sm text-emerald-400 hover:text-white transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter
                    </button>
                  </div>

                  <ExplanationDropdown
                    explanation="Les bullet points sont la mémoire brute de ton histoire. C'est la chronologie factuelle (le 'Quoi'). Si tu relis cette fiche dans 5 ans, ces points doivent te permettre de te rappeler exactement ce qu'il s'est passé, sans fioriture. Note les événements clés, les chiffres, les lieux et les personnes impliquées."
                    example={
                      <ul className="space-y-1 text-emerald-100/90">
                        <li>• Lancement du programme X en novembre 2023 après 3 mois de préparation.</li>
                        <li>• À 20h00, ouverture des portes : le serveur crash instantanément à cause du trafic.</li>
                        <li>• Impossible de réparer avant le lendemain matin.</li>
                        <li>• Décision de faire un live Instagram sans filtre pour montrer les coulisses du crash.</li>
                        <li>• Résultat : 30% de ventes en plus le lendemain par rapport à l&apos;objectif initial.</li>
                      </ul>
                    }
                  />

                  <div className="space-y-3">
                    {draftStory.bulletPoints.map((bullet, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="mt-3 h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                        <input
                          type="text"
                          value={bullet}
                          onChange={(e) => updateBulletPoint(index, e.target.value)}
                          placeholder={`Point clé ${index + 1}`}
                          className="flex-1 bg-transparent border-b border-emerald-800/50 py-2 text-emerald-50 placeholder-emerald-600/70 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => removeBulletPoint(index)}
                          className="mt-1 p-2 text-emerald-600 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-800/40 bg-emerald-900/10 p-5 md:p-6">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                      Speech map
                    </div>
                    <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-400 font-medium">
                      # La partition de l&apos;orateur
                    </div>
                  </div>

                  <ExplanationDropdown
                    explanation="C'est ici que tu transformes les faits en une histoire captivante. C'est la mise en scène (le 'Comment'). Note l'accroche pour capter l'attention, les émotions à transmettre à des moments précis, tes meilleures 'punchlines', et surtout la phrase clé qui fera le pont avec le message que tu veux faire passer à ton audience."
                    example={
                      <ul className="space-y-1 text-emerald-100/90">
                        <li>
                          • <strong className="text-emerald-400">Accroche (Tension) :</strong> &quot;Vous connaissez ce silence de mort dans un bureau quand tout le monde réalise qu&apos;on vient de perdre 3 mois de travail en une seconde ?&quot;
                        </li>
                        <li>
                          • <strong className="text-emerald-400">Rythme (Vulnérabilité) :</strong> Ne pas minimiser la panique. Décrire la boule au ventre. Montrer que j&apos;étais prêt à tout abandonner.
                        </li>
                        <li>
                          • <strong className="text-emerald-400">Punchline (Bascule) :</strong> &quot;J&apos;ai allumé mon téléphone, j&apos;ai cliqué sur &apos;Live&apos;, et j&apos;ai dit : &apos;On a tout foiré.&apos;&quot;
                        </li>
                        <li>
                          • <strong className="text-emerald-400">Message (Leçon) :</strong> Révéler le chiffre (+30% de ventes). Conclure sur : &quot;Les gens n&apos;achètent pas la perfection, ils achètent l&apos;authenticité.&quot;
                        </li>
                      </ul>
                    }
                  />

                  <textarea
                    value={draftStory.speechMap}
                    onChange={(e) => updateDraftStory({ speechMap: e.target.value })}
                    placeholder="Structure, rythme, leçon, conclusion..."
                    className="w-full min-h-[220px] md:min-h-[260px] bg-transparent border border-emerald-800/50 rounded-2xl p-4 text-emerald-50 placeholder-emerald-600/70 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                  />
                </div>

                <div className="rounded-3xl border border-emerald-800/40 bg-emerald-900/10 p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Tag className="w-5 h-5 text-emerald-500" />
                    <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                      Tags
                    </div>
                    <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/30 text-[10px] text-amber-400 font-medium">
                      # Retrouver la bonne histoire au bon moment
                    </div>
                  </div>

                  <ExplanationDropdown
                    explanation="Les tags te permettent de retrouver cette histoire instantanément quand tu en as besoin. Demande-toi : Dans quel contexte cette histoire serait-elle utile pour illustrer mon propos ?"
                    example={
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="px-2 py-1 rounded bg-emerald-950/50 border border-emerald-800/50 text-[10px] uppercase tracking-widest text-emerald-300">#Authenticité</span>
                        <span className="px-2 py-1 rounded bg-emerald-950/50 border border-emerald-800/50 text-[10px] uppercase tracking-widest text-emerald-300">#Vente</span>
                        <span className="px-2 py-1 rounded bg-emerald-950/50 border border-emerald-800/50 text-[10px] uppercase tracking-widest text-emerald-300">#Résilience</span>
                        <span className="px-2 py-1 rounded bg-emerald-950/50 border border-emerald-800/50 text-[10px] uppercase tracking-widest text-emerald-300">#Imprévu</span>
                      </div>
                    }
                  />

                  <div className="flex flex-col md:flex-row gap-3 mb-4">
                    <input
                      type="text"
                      value={draftTagInput}
                      onChange={(e) => setDraftTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="Ajouter un tag..."
                      className="flex-1 bg-emerald-950/50 border border-emerald-800 rounded-xl px-4 py-3 text-sm text-white placeholder-emerald-600/80 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-5 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold transition-colors"
                    >
                      Ajouter
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {draftStory.topicTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="px-3 py-2 rounded-full bg-emerald-950 border border-emerald-800/60 text-xs uppercase tracking-widest text-emerald-300 flex items-center gap-2"
                      >
                        {tag}
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex w-[36%] min-h-0 flex-col bg-emerald-900/10">
              <div className="border-b border-emerald-900/60 px-4 md:px-6 py-4 md:py-5 shrink-0">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-800/60 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <div className="text-sm md:text-base uppercase tracking-[0.2em] text-emerald-500 font-bold">
                        SOPHIA
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDesktopSophiaDetails((current) => !current)}
                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-400 hover:text-white transition-colors"
                  >
                    {showDesktopSophiaDetails ? 'Réduire' : 'Détails'}
                    {showDesktopSophiaDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {showDesktopSophiaDetails && (
                  <>
                    <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/40 p-4 text-sm text-emerald-200/80 leading-relaxed">
                      <p>Sophia part du contexte de cette fiche : titre, bullet points, speech map, tags et intention de communication.</p>
                      <div className="mt-3 pt-3 border-t border-emerald-800/30 flex items-start gap-2 text-emerald-400/80 text-xs font-medium">
                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>
                          Pense à <strong>sauvegarder</strong> tes modifications pour que Sophia puisse les prendre en compte dans ses réponses.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {['Trouve une accroche', 'Clarifie la leçon', 'Rends-la plus mémorable', "Où l'utiliser ?"].map((suggestion) => (
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
                  </>
                )}
                {!showDesktopSophiaDetails && (
                  <div className="text-xs text-emerald-500/80">
                    Espace d'aide masqué.
                  </div>
                )}
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
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none">
                      <TypingDot />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-emerald-900/60 p-4 md:p-6 shrink-0">
                <div className="relative">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSendChat();
                      }
                    }}
                    placeholder="Discuter avec Sophia..."
                    className="w-full bg-emerald-950 border border-emerald-800 rounded-xl pl-4 pr-14 py-4 text-sm text-white placeholder-emerald-700 focus:ring-1 focus:ring-emerald-500 outline-none shadow-lg"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendChat()}
                    disabled={isChatLoading}
                    className="absolute right-2 top-2 bottom-2 w-10 flex items-center justify-center bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
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
                    type="button"
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
                        <p>Sophia part du contexte de cette fiche : titre, bullet points, speech map, tags et intention de communication.</p>
                        <div className="mt-3 pt-3 border-t border-emerald-800/30 flex items-start gap-2 text-emerald-400/80 text-xs font-medium">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>
                            Pense à <strong>sauvegarder</strong> tes modifications pour que Sophia puisse les prendre en compte dans ses réponses.
                          </p>
                        </div>
                      </div>

                      <div className="px-4 pb-4 flex flex-wrap gap-2">
                          {['Trouve une accroche', 'Clarifie la leçon', 'Rends-la plus mémorable', "Où l'utiliser ?"].map((suggestion) => (
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
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed bg-emerald-800/50 text-emerald-50 border border-emerald-700/50 rounded-bl-none">
                        <TypingDot />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-emerald-900 bg-emerald-950 shrink-0">
                  <div className="relative">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSendChat();
                        }
                      }}
                      placeholder="Répondre..."
                      className="w-full bg-emerald-900/50 border border-emerald-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-emerald-600/80 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendChat()}
                      disabled={isChatLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 p-2 disabled:opacity-50"
                    >
                      {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {storyToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setStoryToDelete(null)} />
          <div className="relative bg-emerald-950 border border-emerald-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
            <h3 className="text-xl font-serif font-bold text-white mb-2">Supprimer l&apos;histoire ?</h3>
            <p className="text-emerald-200/70 text-sm mb-6">
              Cette action est irréversible. Es-tu sûr de vouloir supprimer cette histoire ?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setStoryToDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-emerald-400 hover:text-white hover:bg-emerald-900/50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyStoryId === storyToDelete}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {busyStoryId === storyToDelete && <Loader2 className="w-4 h-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
