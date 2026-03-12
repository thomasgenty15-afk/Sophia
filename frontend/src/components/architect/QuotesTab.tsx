import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Plus,
  Quote,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  buildQuotePayload,
  mapQuoteRowToItem,
  normalizeQuoteTags,
  QUOTE_LIMITS,
  sortQuotesByRecency,
  validateQuoteForm,
  type ArchitectQuoteRow,
  type QuoteItem,
} from './quotesUtils';

const QUOTE_SELECT_COLUMNS = 'id, quote_text, author, source_context, tags, created_at, updated_at';

async function fetchQuotesForUser(userId: string): Promise<QuoteItem[]> {
  const { data, error } = await supabase
    .from('user_architect_quotes')
    .select(QUOTE_SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  return sortQuotesByRecency(
    ((data ?? []) as ArchitectQuoteRow[]).map(mapQuoteRowToItem),
  );
}

export const QuotesTab: React.FC = () => {
  const { user } = useAuth();
  const [showExplanation, setShowExplanation] = useState(false);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formText, setFormText] = useState('');
  const [formAuthor, setFormAuthor] = useState('');
  const [formContext, setFormContext] = useState('');
  const [formTags, setFormTags] = useState('');

  const filteredQuotes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return quotes;

    return quotes.filter((quote) =>
      quote.text.toLowerCase().includes(normalizedQuery) ||
      quote.author.toLowerCase().includes(normalizedQuery) ||
      quote.context.toLowerCase().includes(normalizedQuery) ||
      quote.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
    );
  }, [quotes, searchQuery]);

  const normalizedDraftTags = useMemo(() => normalizeQuoteTags(formTags), [formTags]);

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormText('');
    setFormAuthor('');
    setFormContext('');
    setFormTags('');
    setActionError(null);
  };

  const loadQuotes = async (userId: string) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      setQuotes(await fetchQuotesForUser(userId));
    } catch (error) {
      console.error('[QuotesTab] load failed:', error);
      setQuotes([]);
      setLoadError("Impossible de charger les citations pour le moment.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setQuotes([]);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;

    const run = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const nextQuotes = await fetchQuotesForUser(user.id);
        if (isActive) setQuotes(nextQuotes);
      } catch (error) {
        console.error('[QuotesTab] load failed:', error);
        if (isActive) {
          setQuotes([]);
          setLoadError("Impossible de charger les citations pour le moment.");
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void run();

    return () => {
      isActive = false;
    };
  }, [user?.id]);

  const upsertQuoteLocally = (nextQuote: QuoteItem) => {
    setQuotes((current) => {
      const withoutCurrent = current.filter((quote) => quote.id !== nextQuote.id);
      return sortQuotesByRecency([nextQuote, ...withoutCurrent]);
    });
  };

  const handleSave = async () => {
    if (!user?.id || isSubmitting) return;

    const validationError = validateQuoteForm({
      text: formText,
      author: formAuthor,
      context: formContext,
      tagsInput: formTags,
    });

    if (validationError) {
      setActionError(validationError);
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const payload = buildQuotePayload({
        text: formText,
        author: formAuthor,
        context: formContext,
        tagsInput: formTags,
      });

      if (editingId) {
        const { data, error } = await supabase
          .from('user_architect_quotes')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id)
          .select(QUOTE_SELECT_COLUMNS)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Quote not found after update');

        upsertQuoteLocally(mapQuoteRowToItem(data as ArchitectQuoteRow));
      } else {
        const { data, error } = await supabase
          .from('user_architect_quotes')
          .insert({
            user_id: user.id,
            ...payload,
          })
          .select(QUOTE_SELECT_COLUMNS)
          .single();

        if (error) throw error;

        upsertQuoteLocally(mapQuoteRowToItem(data as ArchitectQuoteRow));
      }

      resetForm();
    } catch (error) {
      console.error('[QuotesTab] save failed:', error);
      setActionError("Impossible d'enregistrer la citation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const editQuote = (quote: QuoteItem) => {
    setActionError(null);
    setFormText(quote.text);
    setFormAuthor(quote.author);
    setFormContext(quote.context);
    setFormTags(quote.tags.join(', '));
    setEditingId(quote.id);
    setIsAdding(true);
  };

  const confirmDelete = async () => {
    if (!user?.id || !quoteToDelete || deletingId) return;

    setDeletingId(quoteToDelete);
    setActionError(null);

    try {
      const { error } = await supabase
        .from('user_architect_quotes')
        .delete()
        .eq('id', quoteToDelete)
        .eq('user_id', user.id);

      if (error) throw error;

      setQuotes((current) => current.filter((quote) => quote.id !== quoteToDelete));
      setQuoteToDelete(null);
    } catch (error) {
      console.error('[QuotesTab] delete failed:', error);
      setActionError("Impossible de supprimer la citation.");
    } finally {
      setDeletingId(null);
    }
  };

  const openCreateForm = () => {
    resetForm();
    setIsAdding(true);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-emerald-100 mb-4">Citations</h1>
          <p className="text-sm md:text-base text-emerald-400 max-w-2xl mx-auto italic mb-6">
            "Nous sommes ce que nous lisons, ce que nous écoutons, et les mots que nous choisissons de garder près de notre cœur."
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
              <p className="mb-3">
                Collectionne ici les phrases qui ont eu un impact sur ta façon de penser. Une bonne citation est un raccourci mental vers un état d&apos;esprit puissant.
              </p>
              <p>
                N&apos;oublie pas de noter le contexte dans lequel tu l&apos;as découverte (un livre, une conversation, un film) et d&apos;utiliser des tags pour pouvoir les retrouver facilement quand tu as besoin d&apos;inspiration sur un sujet précis.
              </p>
            </div>
          )}
        </div>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>{loadError}</span>
            {user?.id && (
              <button
                onClick={() => void loadQuotes(user.id)}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border border-red-400/30 text-red-200 hover:bg-red-500/10 transition-colors"
              >
                Réessayer
              </button>
            )}
          </div>
        )}

        {actionError && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {actionError}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
            <input
              type="text"
              placeholder="Rechercher une citation..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full bg-emerald-950/50 border border-emerald-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-emerald-700 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={openCreateForm}
            disabled={!user?.id || isLoading}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/60 disabled:text-emerald-300/60 text-white px-6 py-2.5 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-900/50"
          >
            <Plus className="w-5 h-5" />
            Nouvelle citation
          </button>
        </div>

        {isAdding && (
          <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-2xl p-4 md:p-8 mb-8 animate-fade-in relative">
            <button
              onClick={resetForm}
              className="absolute top-4 right-4 text-emerald-500 hover:text-emerald-300"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg md:text-xl font-serif font-bold text-white mb-6 pr-10">
              {editingId ? 'Modifier la citation' : 'Nouvelle citation'}
            </h2>

            <div className="space-y-4">
              <div>
                <textarea
                  value={formText}
                  onChange={(event) => setFormText(event.target.value)}
                  placeholder="La citation..."
                  className="w-full bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4 text-lg md:text-xl font-serif text-emerald-50 placeholder-emerald-600/70 focus:outline-none focus:border-emerald-500 min-h-[120px] resize-y leading-relaxed italic"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-500/80">
                  <span>Maximum {QUOTE_LIMITS.text} caractères.</span>
                  <span>{formText.length}/{QUOTE_LIMITS.text}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={formAuthor}
                  onChange={(event) => setFormAuthor(event.target.value)}
                  placeholder="Auteur..."
                  className="w-full bg-transparent border-b border-emerald-700/80 text-sm md:text-base text-emerald-100 placeholder-emerald-600/80 pb-2 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  value={formContext}
                  onChange={(event) => setFormContext(event.target.value)}
                  placeholder="Contexte / Source..."
                  className="w-full bg-transparent border-b border-emerald-700/80 text-sm md:text-base text-emerald-100 placeholder-emerald-600/80 pb-2 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <input
                  type="text"
                  value={formTags}
                  onChange={(event) => setFormTags(event.target.value)}
                  placeholder="Tags séparés par des virgules..."
                  className="w-full bg-transparent border-b border-emerald-700/80 text-sm text-emerald-300 placeholder-emerald-600/80 pb-2 focus:outline-none focus:border-emerald-500"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-emerald-500/80">
                  <span>Maximum {QUOTE_LIMITS.tags} tags, {QUOTE_LIMITS.tagLength} caractères par tag.</span>
                  <span>{normalizedDraftTags.length}/{QUOTE_LIMITS.tags} tags</span>
                </div>
              </div>

              {normalizedDraftTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {normalizedDraftTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-emerald-950/50 border border-emerald-800/50 rounded text-[10px] text-emerald-400 uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <button
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-4 py-2 text-emerald-400 hover:text-emerald-300 disabled:text-emerald-700 font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSubmitting || !user?.id}
                  className="w-full sm:w-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/60 disabled:text-emerald-300/60 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12 animate-pulse">
            <Quote className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6 opacity-50" />
            <p className="text-sm md:text-base font-serif text-emerald-500/70">Chargement des citations...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredQuotes.map((quote) => (
              <div
                key={quote.id}
                className="group relative bg-emerald-900/10 border-l-4 border-emerald-600 rounded-r-2xl p-6 md:p-8 hover:bg-emerald-900/20 transition-all duration-300"
              >
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button
                    onClick={() => editQuote(quote)}
                    className="p-2 text-emerald-600/50 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                    title="Modifier"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setQuoteToDelete(quote.id)}
                    className="p-2 text-emerald-600/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <Quote className="w-6 h-6 text-emerald-800/50 mb-3" />

                <p className="text-base md:text-xl font-serif text-white leading-relaxed mb-4 italic pr-12 md:pr-0">
                  "{quote.text}"
                </p>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="text-base font-bold text-emerald-400">— {quote.author || 'Anonyme'}</div>
                    {quote.context && (
                      <div className="text-xs text-emerald-600 mt-1">{quote.context}</div>
                    )}
                  </div>

                  {quote.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {quote.tags.map((tag) => (
                        <span
                          key={`${quote.id}-${tag}`}
                          className="px-2 py-1 bg-emerald-950/50 border border-emerald-800/50 rounded text-[10px] text-emerald-500 uppercase tracking-wider"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && filteredQuotes.length === 0 && !isAdding && (
          <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12">
            <Quote className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6" />
            {searchQuery ? (
              <>
                <h3 className="text-xl md:text-2xl font-serif font-bold text-emerald-100 mb-2 md:mb-3">Aucun résultat</h3>
                <p className="text-sm md:text-base text-emerald-400 max-w-sm mx-auto">
                  Aucune citation ne correspond à ta recherche.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl md:text-2xl font-serif font-bold text-emerald-100 mb-2 md:mb-3">Aucune citation pour le moment</h3>
                <p className="text-sm md:text-base text-emerald-400 max-w-sm mx-auto mb-6 md:mb-8">
                  Collectionne ici les phrases qui ont eu un impact sur ta façon de penser.
                </p>
                <button
                  onClick={openCreateForm}
                  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base transition-colors shadow-lg shadow-emerald-900/50"
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5" />
                  Nouvelle citation
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {quoteToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setQuoteToDelete(null)} />
          <div className="relative bg-emerald-950 border border-emerald-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
            <h3 className="text-xl font-serif font-bold text-white mb-2">Supprimer cette citation ?</h3>
            <p className="text-emerald-200/70 text-sm mb-6">
              Cette action est irréversible. Es-tu sûr de vouloir supprimer cette citation ?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setQuoteToDelete(null)}
                disabled={Boolean(deletingId)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-emerald-400 hover:text-white hover:bg-emerald-900/50 disabled:text-emerald-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={Boolean(deletingId)}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 disabled:opacity-60 transition-colors"
              >
                {deletingId ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
