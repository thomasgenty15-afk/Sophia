import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Check, Trash2, Star, Target, Heart, Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { validateEthicalText } from '../../lib/ethicalValidation';
import { useAuth } from '../../context/AuthContext';

type WishlistCategory = 'experience' | 'achievement' | 'growth' | 'contribution';

type WishlistRow = {
  id: string;
  title: string;
  description: string;
  category: WishlistCategory;
  status: 'active' | 'completed';
  completed_at: string | null;
};

interface WishlistItem {
  id: string;
  title: string;
  description: string;
  isDone: boolean;
  category: WishlistCategory;
}

const CATEGORY_OPTIONS: Array<{
  id: WishlistCategory;
  label: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'experience',
    label: 'Experience',
    icon: <Star className="w-5 h-5 text-amber-400" />,
    desc: 'Voyages, aventures, moments de vie',
  },
  {
    id: 'achievement',
    label: 'Accomplissement',
    icon: <Target className="w-5 h-5 text-red-400" />,
    desc: 'Objectifs professionnels, financiers, sportifs',
  },
  {
    id: 'growth',
    label: 'Croissance',
    icon: <Sparkles className="w-5 h-5 text-emerald-400" />,
    desc: 'Apprentissages, competences, sante',
  },
  {
    id: 'contribution',
    label: 'Contribution',
    icon: <Heart className="w-5 h-5 text-rose-400" />,
    desc: 'Impact sur les autres, dons, heritage',
  },
];

const CATEGORY_LABELS: Record<WishlistCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.id, option.label]),
) as Record<WishlistCategory, string>;

function rowToItem(row: WishlistRow): WishlistItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    isDone: row.status === 'completed',
    category: row.category,
  };
}

export const WishlistTab: React.FC = () => {
  const { user } = useAuth();
  const [showExplanation, setShowExplanation] = useState(false);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<WishlistCategory>('experience');
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const completedCount = useMemo(() => items.filter((item) => item.isDone).length, [items]);

  const loadItems = async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatusMsg(null);
    try {
      const { data, error } = await supabase
        .from('user_architect_wishes')
        .select('id,title,description,category,status,completed_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems(((data ?? []) as WishlistRow[]).map(rowToItem));
    } catch (error) {
      console.error('[WishlistTab] load failed', error);
      setItems([]);
      setStatusMsg("Impossible de charger tes voeux pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [user?.id]);

  const resetAddForm = () => {
    setNewItemTitle('');
    setNewItemDescription('');
    setNewItemCategory('experience');
    setIsAdding(false);
  };

  const handleAdd = async () => {
    if (!user?.id) return;
    const title = newItemTitle.trim();
    const description = newItemDescription.trim();
    if (!title) return;

    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      await validateEthicalText({
        entityType: 'wish',
        operation: 'create',
        textFields: { title, description },
        textFieldKeys: ['title', 'description'],
        context: { scope: 'architect_wishlist' },
      });

      const { data, error } = await supabase
        .from('user_architect_wishes')
        .insert({
          user_id: user.id,
          title,
          description,
          category: newItemCategory,
          status: 'active',
          completed_at: null,
        } as any)
        .select('id,title,description,category,status,completed_at')
        .single();
      if (error) throw error;

      setItems((prev) => [rowToItem(data as WishlistRow), ...prev]);
      resetAddForm();
    } catch (error: any) {
      console.error('[WishlistTab] create failed', error);
      setStatusMsg(String(error?.message || "Impossible d'ajouter ce voeu."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const patchItemLocal = (id: string, patch: Partial<WishlistItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const toggleDone = async (item: WishlistItem) => {
    const nextDone = !item.isDone;
    const nextStatus = nextDone ? 'completed' : 'active';
    const nextCompletedAt = nextDone ? new Date().toISOString() : null;

    setBusyItemId(item.id);
    setStatusMsg(null);
    patchItemLocal(item.id, { isDone: nextDone });

    try {
      const { error } = await supabase
        .from('user_architect_wishes')
        .update({
          status: nextStatus,
          completed_at: nextCompletedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      if (error) throw error;
    } catch (error: any) {
      console.error('[WishlistTab] toggle failed', error);
      patchItemLocal(item.id, { isDone: item.isDone });
      setStatusMsg(String(error?.message || "Impossible de mettre a jour ce voeu."));
    } finally {
      setBusyItemId(null);
    }
  };

  const deleteItem = (id: string) => {
    setItemToDelete(id);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    setBusyItemId(itemToDelete);
    setStatusMsg(null);
    try {
      const { error } = await supabase
        .from('user_architect_wishes')
        .delete()
        .eq('id', itemToDelete);
      if (error) throw error;
      setItems((prev) => prev.filter((item) => item.id !== itemToDelete));
      setItemToDelete(null);
    } catch (error: any) {
      console.error('[WishlistTab] delete failed', error);
      setStatusMsg(String(error?.message || "Impossible de supprimer ce voeu."));
    } finally {
      setBusyItemId(null);
    }
  };

  const getCategoryIcon = (category: WishlistCategory) => {
    switch (category) {
      case 'experience':
        return <Star className="w-4 h-4 text-amber-400" />;
      case 'achievement':
        return <Target className="w-4 h-4 text-red-400" />;
      case 'growth':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 'contribution':
        return <Heart className="w-4 h-4 text-rose-400" />;
      default:
        return <Star className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-emerald-100 mb-4">Voeux</h1>
          <p className="text-sm md:text-base text-emerald-400 max-w-2xl mx-auto italic mb-6">
            "Ne demande pas que les choses soient plus faciles, demande a etre meilleur. Ne souhaite pas moins de problemes, souhaite plus de competences."
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
                Cet espace est ton sanctuaire d&apos;ambitions. Contrairement a une simple "to-do list", tes voeux representent les experiences profondes, les accomplissements majeurs et les contributions que tu souhaites realiser dans ta vie.
              </p>
              <p>
                Ajoute ici tout ce qui te fait vibrer : un voyage initiatique, la maitrise d&apos;une langue, la creation d&apos;une oeuvre, ou un impact specifique sur le monde. Coche-les au fur et a mesure que tu les realises pour visualiser ton evolution.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-500">
            {loading ? 'Chargement...' : `${items.length} voeux • ${completedCount} accomplis`}
          </div>
          <button
            onClick={() => setIsAdding(true)}
            disabled={!user || isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/60 disabled:text-emerald-200/50 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-900/50"
          >
            <Plus className="w-5 h-5" />
            Ajouter un voeu
          </button>
        </div>

        {statusMsg && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {statusMsg}
          </div>
        )}

        {isAdding && (
          <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-2xl p-4 md:p-6 mb-8 animate-fade-in">
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="Ton prochain voeu..."
              className="w-full bg-transparent border-b border-emerald-700/80 text-lg md:text-2xl text-white placeholder-emerald-600/70 pb-2 focus:outline-none focus:border-emerald-500 mb-4"
              autoFocus
            />

            <textarea
              value={newItemDescription}
              onChange={(e) => setNewItemDescription(e.target.value)}
              placeholder="Pourquoi ce voeu est important pour toi ?"
              className="w-full bg-transparent border-b border-emerald-700/70 text-sm text-emerald-100 placeholder-emerald-600/70 pb-2 focus:outline-none focus:border-emerald-500 mb-6 resize-none"
              rows={2}
            />

            <div className="mb-6">
              <label className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-3 block">Categorie</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setNewItemCategory(cat.id)}
                    className={`flex items-start gap-3 p-3 md:p-4 rounded-xl text-left transition-all border ${
                      newItemCategory === cat.id
                        ? 'bg-emerald-900/60 border-emerald-500 shadow-md'
                        : 'bg-emerald-950/30 border-emerald-800/40 hover:border-emerald-700/60 hover:bg-emerald-900/40'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${newItemCategory === cat.id ? 'bg-emerald-950/50' : 'bg-emerald-900/50'}`}>
                      {cat.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-base md:text-sm font-bold mb-1 break-words ${newItemCategory === cat.id ? 'text-white' : 'text-emerald-100'}`}>
                        {cat.label}
                      </div>
                      <div className="text-[11px] md:text-xs text-emerald-400/70 leading-snug break-words">
                        {cat.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button
                onClick={resetAddForm}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2 text-emerald-400 hover:text-emerald-300 disabled:text-emerald-700 font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleAdd}
                disabled={isSubmitting || !newItemTitle.trim()}
                className="w-full sm:w-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/60 disabled:text-emerald-200/50 text-white rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Ajouter
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12 animate-pulse">
            <Target className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6 opacity-50" />
            <p className="text-sm md:text-base font-serif text-emerald-500/70">Chargement de tes vœux...</p>
          </div>
        ) : items.length === 0 && !isAdding ? (
          <div className="min-h-[360px] rounded-3xl border border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center text-center px-6 py-12">
            <Target className="w-12 h-12 md:w-16 md:h-16 text-emerald-700/50 mb-4 md:mb-6" />
            <h3 className="text-xl md:text-2xl font-serif font-bold text-emerald-100 mb-2 md:mb-3">Aucun vœu pour le moment</h3>
            <p className="text-sm md:text-base text-emerald-400 max-w-sm mx-auto mb-6 md:mb-8">
              Commence par ajouter ce qui t'appelle vraiment.
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base transition-colors shadow-lg shadow-emerald-900/50"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
              Ajouter un vœu
            </button>
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {items.map((item) => {
              const isBusy = busyItemId === item.id;
              return (
                <div
                  key={item.id}
                  className={`group relative bg-emerald-900/20 border rounded-2xl p-6 transition-all duration-300 ${
                    item.isDone
                      ? 'border-emerald-800/30 opacity-60'
                      : 'border-emerald-700/50 hover:border-emerald-500/50 hover:bg-emerald-900/40 hover:-translate-y-1 shadow-lg'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getCategoryIcon(item.category)}
                        <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </div>
                      <h3 className={`text-xl font-serif font-bold mb-2 ${item.isDone ? 'text-emerald-600 line-through' : 'text-white'}`}>
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-emerald-400/80 text-sm leading-relaxed">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => toggleDone(item)}
                        disabled={isBusy}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                          item.isDone
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-950 border-2 border-emerald-700 text-transparent hover:border-emerald-500'
                        } disabled:opacity-60`}
                      >
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Check className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        disabled={isBusy}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-emerald-600/50 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {itemToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setItemToDelete(null)} />
          <div className="relative bg-emerald-950 border border-emerald-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
            <h3 className="text-xl font-serif font-bold text-white mb-2">Supprimer ce voeu ?</h3>
            <p className="text-emerald-200/70 text-sm mb-6">
              Cette action est irreversible. Es-tu sur de vouloir supprimer ce voeu de ta liste ?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setItemToDelete(null)}
                disabled={busyItemId === itemToDelete}
                className="px-4 py-2 rounded-xl text-sm font-bold text-emerald-400 hover:text-white hover:bg-emerald-900/50 transition-colors disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={busyItemId === itemToDelete}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
              >
                {busyItemId === itemToDelete && <Loader2 className="w-4 h-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
