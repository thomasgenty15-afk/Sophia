import { useEffect, useState } from 'react';
import { Plus, Sparkles, Target, ChevronDown, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import type { NorthStar, NorthStarMetricType } from '../../types/dashboard';
import { shouldValidateOnUpdate, validateEthicalText } from '../../lib/ethicalValidation';
import { NorthStarModal } from './NorthStarModal';

export function NorthStarSection(props: { userId: string | null }) {
  const { userId } = props;

  const [northStar, setNorthStar] = useState<NorthStar | null>(null);
  const [northStarGoalId, setNorthStarGoalId] = useState<string | null>(null);
  const [northStarSubmissionId, setNorthStarSubmissionId] = useState<string | null>(null);
  const [northStarLoading, setNorthStarLoading] = useState(false);
  const [northStarModalOpen, setNorthStarModalOpen] = useState(false);
  const [northStarGenerating, setNorthStarGenerating] = useState(false);
  const [northStarSaving, setNorthStarSaving] = useState(false);
  const [northStarSuggestions, setNorthStarSuggestions] = useState<Array<{ title: string; metric_type: NorthStarMetricType; unit: string }>>([]);
  const [showCyclePrompt, setShowCyclePrompt] = useState(false);
  const [northStarValueModalOpen, setNorthStarValueModalOpen] = useState(false);
  const [northStarValueDraft, setNorthStarValueDraft] = useState('');
  const [northStarValueSaving, setNorthStarValueSaving] = useState(false);
  const [northStarValueError, setNorthStarValueError] = useState<string | null>(null);
  const [isVerifyingEthics, setIsVerifyingEthics] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const cyclePromptKey = (goalId: string) => `north_star_prompt_dismissed:${goalId}`;

  const runEthicalValidation = async (params: {
    entityType: 'action' | 'rendez_vous' | 'north_star' | 'vital_sign';
    operation: 'create' | 'update';
    textFields: Record<string, unknown>;
    previousTextFields?: Record<string, unknown>;
    textFieldKeys: string[];
    context?: Record<string, unknown>;
  }) => {
    setIsVerifyingEthics(true);
    try {
      const result = await validateEthicalText({
        entityType: params.entityType,
        operation: params.operation,
        textFields: params.textFields,
        previousTextFields: params.previousTextFields ?? null,
        textFieldKeys: params.textFieldKeys,
        context: params.context,
      });
      if (result.decision === 'block') {
        throw new Error(result.reasonShort || "Contenu bloqué par la vérification éthique.");
      }
    } finally {
      setIsVerifyingEthics(false);
    }
  };

  const loadNorthStar = async () => {
    if (!userId) return;
    setNorthStarLoading(true);
    try {
      let goalRow: any = null;
      {
        const primary = await supabase
          .from('user_goals')
          .select('id,submission_id,north_star_id,status')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (primary.error && String((primary.error as any)?.code ?? '') === '42703') {
          const fallback = await supabase
            .from('user_goals')
            .select('id,submission_id,status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallback.error) throw fallback.error;
          goalRow = fallback.data;
        } else if (primary.error) {
          throw primary.error;
        } else {
          goalRow = primary.data;
        }
      }

      if (!goalRow) {
        setNorthStar(null);
        setNorthStarGoalId(null);
        setNorthStarSubmissionId(null);
        setShowCyclePrompt(false);
        return;
      }

      setNorthStarGoalId(goalRow.id);
      setNorthStarSubmissionId(goalRow.submission_id);

      const { data: activeNorthStar, error: nsErr } = await supabase
        .from('user_north_stars')
        .select('*')
        .eq('user_id', userId)
        .eq('submission_id', goalRow.submission_id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (nsErr && String((nsErr as any)?.code ?? '') !== '42P01') throw nsErr;

      const resolved = (activeNorthStar as NorthStar | null) ?? null;
      setNorthStar(resolved);

      const dismissed = localStorage.getItem(cyclePromptKey(goalRow.id)) === '1';
      setShowCyclePrompt(Boolean(resolved && !dismissed));
    } catch (e) {
      console.error('[NorthStarSection] load failed', e);
      setNorthStar(null);
      setShowCyclePrompt(false);
    } finally {
      setNorthStarLoading(false);
    }
  };

  useEffect(() => {
    loadNorthStar();
  }, [userId]);

  const handleDismissCyclePrompt = () => {
    if (!northStarGoalId) return;
    localStorage.setItem(cyclePromptKey(northStarGoalId), '1');
    setShowCyclePrompt(false);
  };

  const handleGenerateNorthStarSuggestions = async () => {
    if (!northStarSubmissionId) return;
    setNorthStarGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-north-star', {
        body: { submission_id: northStarSubmissionId, goal_id: northStarGoalId },
      });
      if (error) throw error;
      const suggestions = Array.isArray((data as any)?.suggestions) ? (data as any).suggestions : [];
      setNorthStarSuggestions(suggestions.slice(0, 3));
    } catch (e) {
      console.error('[NorthStarSection] suggest failed', e);
      setNorthStarSuggestions([]);
    } finally {
      setNorthStarGenerating(false);
    }
  };

  const upsertNorthStar = async (payload: {
    title: string;
    metric_type: NorthStarMetricType;
    unit: string;
    start_value: number;
    target_value: number;
    current_value: number;
  }) => {
    if (!userId || !northStarSubmissionId) return;
    setNorthStarSaving(true);
    try {
      const nextText = {
        title: payload.title,
        unit: payload.unit,
      };
      if (northStar) {
        const prevText = {
          title: northStar.title ?? '',
          unit: northStar.unit ?? '',
        };
        const needsValidation = shouldValidateOnUpdate(prevText, nextText, ['title', 'unit']);
        if (needsValidation) {
          await runEthicalValidation({
            entityType: 'north_star',
            operation: 'update',
            textFields: nextText,
            previousTextFields: prevText,
            textFieldKeys: ['title', 'unit'],
            context: { scope: 'personal_actions' },
          });
        }
      } else {
        await runEthicalValidation({
          entityType: 'north_star',
          operation: 'create',
          textFields: nextText,
          textFieldKeys: ['title', 'unit'],
          context: { scope: 'personal_actions' },
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const initialHistory = [{ date: today, value: payload.current_value, note: 'initial' }];

      if (northStar?.id) {
        await supabase
          .from('user_north_stars')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', northStar.id)
          .eq('user_id', userId);
      }

      const { data: inserted, error: insErr } = await supabase
        .from('user_north_stars')
        .insert({
          user_id: userId,
          submission_id: northStarSubmissionId,
          title: payload.title,
          metric_type: payload.metric_type,
          unit: payload.unit,
          start_value: payload.start_value,
          target_value: payload.target_value,
          current_value: payload.current_value,
          history: initialHistory,
          status: 'active',
        })
        .select('*')
        .single();
      if (insErr) throw insErr;

      const { error: goalsErr } = await supabase
        .from('user_goals')
        .update({ north_star_id: inserted.id })
        .eq('user_id', userId)
        .eq('submission_id', northStarSubmissionId);
      if (goalsErr && String((goalsErr as any)?.code ?? '') !== '42703') throw goalsErr;

      setNorthStar(inserted as NorthStar);
      setNorthStarModalOpen(false);
      if (northStarGoalId) {
        localStorage.setItem(cyclePromptKey(northStarGoalId), '1');
      }
      setShowCyclePrompt(false);
    } finally {
      setNorthStarSaving(false);
    }
  };

  const updateNorthStarValue = async (newValueRaw: string) => {
    if (!northStar?.id || !userId) return;
    const parsed = Number(newValueRaw);
    if (!Number.isFinite(parsed)) return;
    const today = new Date().toISOString().slice(0, 10);
    const currentHistory = Array.isArray(northStar.history) ? [...northStar.history] : [];
    const idx = currentHistory.findIndex((h: any) => String(h?.date) === today);
    if (idx >= 0) currentHistory[idx] = { ...currentHistory[idx], value: parsed };
    else currentHistory.push({ date: today, value: parsed });

    const { data, error } = await supabase
      .from('user_north_stars')
      .update({
        current_value: parsed,
        history: currentHistory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', northStar.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    setNorthStar(data as NorthStar);
  };

  const openNorthStarValueModal = () => {
    if (!northStar) return;
    setNorthStarValueDraft(String(northStar.current_value ?? ''));
    setNorthStarValueError(null);
    setNorthStarValueModalOpen(true);
  };

  const submitNorthStarValue = async () => {
    const parsed = Number(northStarValueDraft);
    if (!Number.isFinite(parsed)) {
      setNorthStarValueError('Entre un nombre valide.');
      return;
    }
    setNorthStarValueSaving(true);
    setNorthStarValueError(null);
    try {
      await updateNorthStarValue(String(parsed));
      setNorthStarValueModalOpen(false);
    } catch (e: any) {
      setNorthStarValueError(String(e?.message ?? 'Impossible de mettre à jour la valeur.'));
    } finally {
      setNorthStarValueSaving(false);
    }
  };

  return (
    <section className="mb-10">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-blue-600" />
            Mon étoile polaire
          </h2>
          {northStar && (
            <button
              onClick={() => setNorthStarModalOpen(true)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900"
            >
              Modifier
            </button>
          )}
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-sm text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1 mb-2 transition-colors ml-7"
        >
          Quelques explications ?
          <ChevronDown className={`w-4 h-4 transition-transform ${showInfo ? 'rotate-180' : ''}`} />
        </button>
        <motion.div
          initial={false}
          animate={{ height: showInfo ? 'auto' : 0, opacity: showInfo ? 1 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="text-sm text-slate-500 max-w-3xl leading-relaxed mb-4 ml-7 space-y-3">
            <p>
              L'étoile polaire, c'est l'indicateur qui te permet de mesurer ton avancée sur le long terme. Tu peux mettre à jour sa valeur quand tu le souhaites : toutes les semaines ou tous les jours, ici ou directement sur WhatsApp.
            </p>
            <p>
              C'est un indicateur unique, qui peut évoluer avec le temps, en fonction des événements et de tes priorités. Il est indépendant de ton plan de transformation et de tes actions personnelles.
            </p>
            <p>
              Par exemple, une personne qui cherche à devenir indépendante financièrement peut y inscrire le chiffre d'affaires qu'elle vise.<br />
              Une personne qui sort d'une rupture peut y inscrire le nombre de fois qu'elle pense à son ex dans la journée.<br />
              Une personne qui veut perdre du poids peut y mettre son poids de départ et son poids cible.
            </p>
          </div>
        </motion.div>
      </div>

      <div className="bg-blue-50 rounded-2xl border border-blue-100 p-6 shadow-sm">
        {northStarLoading ? (
          <p className="text-sm text-blue-400">Chargement de l'étoile polaire…</p>
        ) : !northStar ? (
          <div className="text-center py-4">
            <p className="text-sm text-blue-800 font-medium mb-4">
              Tu n'as pas encore configuré ton étoile polaire
            </p>
            <button
              onClick={() => setNorthStarModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm shadow-blue-200 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Configurer mon étoile polaire
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {showCyclePrompt && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="text-amber-900 font-semibold mb-3">
                  Nouvelle transformation détectée. Tu gardes cette étoile polaire ?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDismissCyclePrompt}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                  >
                    Oui, je garde
                  </button>
                  <button
                    onClick={() => setNorthStarModalOpen(true)}
                    className="px-4 py-2 rounded-lg border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-xs transition-colors"
                  >
                    Non, je modifie
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
              <p className="text-base font-bold text-blue-900">{northStar.title}</p>
              <p className="text-sm text-blue-700 mt-1">
                Actuel: <span className="font-bold">{northStar.current_value}</span> {northStar.unit} • Cible: {northStar.target_value} {northStar.unit}
              </p>
              {Array.isArray(northStar.history) && northStar.history.length > 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Historique</p>
                  <div className="space-y-2">
                    {[...northStar.history]
                      .slice(-5)
                      .reverse()
                      .map((h: any, idx: number) => (
                        <div key={`${h?.date}-${idx}`} className="text-sm text-slate-600 flex items-center justify-between">
                          <span>{String(h?.date ?? '')}</span>
                          <span className="font-semibold">{String(h?.value ?? '')} {northStar.unit}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <button
                  onClick={openNorthStarValueModal}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Mettre à jour la valeur
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <NorthStarModal
        isOpen={northStarModalOpen}
        onClose={() => setNorthStarModalOpen(false)}
        onGenerate={handleGenerateNorthStarSuggestions}
        onSubmit={upsertNorthStar}
        existingNorthStar={northStar}
        suggestions={northStarSuggestions}
        isGenerating={northStarGenerating}
        isSaving={northStarSaving || isVerifyingEthics}
      />

      {northStarValueModalOpen && northStar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-slate-900/35"
            aria-label="Fermer"
            onClick={() => {
              if (!northStarValueSaving) setNorthStarValueModalOpen(false);
            }}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-100 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Mettre à jour la valeur</h4>
                <p className="mt-1 text-sm text-slate-500">
                  {northStar.title} {northStar.unit ? `(${northStar.unit})` : ''}
                </p>
              </div>
              <button
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                onClick={() => {
                  if (!northStarValueSaving) setNorthStarValueModalOpen(false);
                }}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="mt-6">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                Nouvelle valeur
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="any"
                  value={northStarValueDraft}
                  onChange={(e) => setNorthStarValueDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !northStarValueSaving) void submitNorthStarValue();
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  placeholder="Ex: 2"
                  disabled={northStarValueSaving}
                />
                {northStar.unit && (
                  <span className="text-sm font-semibold text-slate-500 whitespace-nowrap">
                    {northStar.unit}
                  </span>
                )}
              </div>
              {northStarValueError && (
                <p className="mt-2 text-sm text-rose-600">{northStarValueError}</p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 transition-colors"
                onClick={() => setNorthStarValueModalOpen(false)}
                disabled={northStarValueSaving}
              >
                Annuler
              </button>
              <button
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                onClick={() => void submitNorthStarValue()}
                disabled={northStarValueSaving}
              >
                {northStarValueSaving ? 'Enregistrement…' : isVerifyingEthics ? 'Vérification...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
