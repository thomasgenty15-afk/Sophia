import { useEffect, useMemo, useState } from 'react';
import { Plus, Repeat, Sparkles, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isSameIsoWeekLocal } from '../../lib/isoWeek';
import type { Action, NorthStar, NorthStarMetricType } from '../../types/dashboard';
import { PlanActionCard } from './PlanActionCard';
import { CreateActionModal } from './CreateActionModal';
import { HabitSettingsModal } from './HabitSettingsModal';
import { NorthStarModal } from './NorthStarModal';

type PersonalActionRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  quest_type: 'main' | 'side' | null;
  rationale: string | null;
  tips: string | null;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night' | 'any_time' | null;
  target_reps: number | null;
  current_reps: number | null;
  scheduled_days: string[] | null;
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'abandoned' | null;
  last_performed_at: string | null;
};

function rowToAction(row: PersonalActionRow): Action {
  return {
    id: row.id,
    dbId: row.id,
    type: 'habitude',
    title: row.title,
    description: row.description,
    isCompleted: row.status === 'completed',
    status: row.status ?? 'active',
    questType: row.quest_type ?? 'side',
    rationale: row.rationale ?? undefined,
    tips: row.tips ?? undefined,
    targetReps: row.target_reps ?? 1,
    currentReps: row.current_reps ?? 0,
    timeOfDay: row.time_of_day ?? 'any_time',
    scheduledDays: row.scheduled_days ?? null,
    lastPerformedAt: row.last_performed_at ?? null,
  };
}

export function PersonalActionsSection(props: { userId: string | null }) {
  const { userId } = props;
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<Action[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [habitSettingsAction, setHabitSettingsAction] = useState<Action | null>(null);

  const [northStar, setNorthStar] = useState<NorthStar | null>(null);
  const [northStarGoalId, setNorthStarGoalId] = useState<string | null>(null);
  const [northStarSubmissionId, setNorthStarSubmissionId] = useState<string | null>(null);
  const [northStarLoading, setNorthStarLoading] = useState(false);
  const [northStarModalOpen, setNorthStarModalOpen] = useState(false);
  const [northStarGenerating, setNorthStarGenerating] = useState(false);
  const [northStarSaving, setNorthStarSaving] = useState(false);
  const [northStarSuggestions, setNorthStarSuggestions] = useState<Array<{ title: string; metric_type: NorthStarMetricType; unit: string }>>([]);
  const [showCyclePrompt, setShowCyclePrompt] = useState(false);

  const activeCount = useMemo(
    () => actions.filter((a) => a.status === 'active' || a.status === 'pending').length,
    [actions],
  );

  const loadActions = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_personal_actions')
        .select('id,user_id,title,description,quest_type,rationale,tips,time_of_day,target_reps,current_reps,scheduled_days,status,last_performed_at')
        .eq('user_id', userId)
        .in('status', ['active', 'pending', 'completed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setActions(((data ?? []) as PersonalActionRow[]).map(rowToAction));
    } catch (e) {
      console.error('[PersonalActionsSection] load failed', e);
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActions();
  }, [userId]);

  const cyclePromptKey = (goalId: string) => `north_star_prompt_dismissed:${goalId}`;

  const loadNorthStar = async () => {
    if (!userId) return;
    setNorthStarLoading(true);
    try {
      // Backward-compatible read: some environments may not yet have user_goals.north_star_id.
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
      // If table is not migrated yet, fail gracefully without blocking suggestion generation.
      if (nsErr && String((nsErr as any)?.code ?? '') !== '42P01') throw nsErr;

      const resolved = (activeNorthStar as NorthStar | null) ?? null;
      setNorthStar(resolved);

      const dismissed = localStorage.getItem(cyclePromptKey(goalRow.id)) === '1';
      setShowCyclePrompt(Boolean(resolved && !dismissed));
    } catch (e) {
      console.error('[PersonalActionsSection] north star load failed', e);
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
      console.error('[PersonalActionsSection] suggest north star failed', e);
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
      // Backward-compatible: ignore missing column until migration is applied.
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

  const patchActionLocal = (actionId: string, patch: Partial<Action>) => {
    setActions((prev) =>
      prev.map((a) =>
        a.id === actionId
          ? { ...a, ...patch, isCompleted: patch.status ? patch.status === 'completed' : a.isCompleted }
          : a
      ),
    );
  };

  const handleCreate = async (actionData: Partial<Action>) => {
    if (!userId) return;
    const title = String(actionData.title ?? '').trim();
    const description = String(actionData.description ?? '').trim();
    if (!title || !description) return;
    const targetReps = Math.max(1, Math.min(7, Number(actionData.targetReps ?? 1)));
    const scheduledDays = actionData.scheduledDays && actionData.scheduledDays.length > 0
      ? actionData.scheduledDays.slice(0, targetReps)
      : null;

    const { error } = await supabase.from('user_personal_actions').insert({
      user_id: userId,
      title,
      description,
      quest_type: actionData.questType ?? 'side',
      rationale: actionData.rationale ?? null,
      tips: actionData.tips ?? null,
      time_of_day: actionData.timeOfDay ?? 'any_time',
      target_reps: targetReps,
      current_reps: 0,
      scheduled_days: scheduledDays,
      status: 'active',
    } as any);
    if (error) throw error;
    await loadActions();
  };

  const handleUpdate = async (originalAction: Action, actionData: Partial<Action>) => {
    const actionId = originalAction.dbId || originalAction.id;
    if (!actionId) return;
    const updates: any = {
      title: String(actionData.title ?? originalAction.title ?? '').trim(),
      description: String(actionData.description ?? originalAction.description ?? '').trim(),
      quest_type: actionData.questType ?? originalAction.questType ?? 'side',
      rationale: actionData.rationale ?? null,
      tips: actionData.tips ?? null,
      time_of_day: actionData.timeOfDay ?? originalAction.timeOfDay ?? 'any_time',
      target_reps: Math.max(1, Math.min(7, Number(actionData.targetReps ?? originalAction.targetReps ?? 1))),
      scheduled_days: ('scheduledDays' in actionData)
        ? (actionData.scheduledDays && actionData.scheduledDays.length > 0 ? actionData.scheduledDays : null)
        : (originalAction.scheduledDays ?? null),
    };
    if (Array.isArray(updates.scheduled_days) && updates.scheduled_days.length > updates.target_reps) {
      updates.scheduled_days = updates.scheduled_days.slice(0, updates.target_reps);
    }

    const { error } = await supabase
      .from('user_personal_actions')
      .update(updates)
      .eq('id', actionId);
    if (error) throw error;
    await loadActions();
  };

  const handleDelete = async (action: Action) => {
    const actionId = action.dbId || action.id;
    if (!actionId) return;
    const { error } = await supabase.from('user_personal_actions').delete().eq('id', actionId);
    if (error) throw error;
    setActions((prev) => prev.filter((a) => a.id !== action.id));
  };

  const handleDeactivate = async (action: Action) => {
    const actionId = action.dbId || action.id;
    if (!actionId) return;
    patchActionLocal(action.id, { status: 'pending' });
    const { error } = await supabase
      .from('user_personal_actions')
      .update({ status: 'pending' })
      .eq('id', actionId);
    if (error) {
      await loadActions();
      throw error;
    }
  };

  const handleUnlock = async (action: Action) => {
    const actionId = action.dbId || action.id;
    if (!actionId) return;
    patchActionLocal(action.id, { status: 'active' });
    const { error } = await supabase
      .from('user_personal_actions')
      .update({ status: 'active' })
      .eq('id', actionId);
    if (error) {
      await loadActions();
      throw error;
    }
  };

  const handleIncrement = async (action: Action) => {
    const actionId = action.dbId || action.id;
    if (!actionId) return;
    const nowIso = new Date().toISOString();
    const target = Math.max(1, Number(action.targetReps ?? 1));
    const last = action.lastPerformedAt ? new Date(action.lastPerformedAt) : null;
    const current = last && !isSameIsoWeekLocal(last, new Date()) ? 0 : Number(action.currentReps ?? 0);
    if (current >= target) return;
    const nextReps = current + 1;
    patchActionLocal(action.id, { currentReps: nextReps, lastPerformedAt: nowIso, status: 'active' });
    const { error } = await supabase
      .from('user_personal_actions')
      .update({
        current_reps: nextReps,
        status: 'active',
        last_performed_at: nowIso,
      })
      .eq('id', actionId);
    if (error) {
      await loadActions();
      throw error;
    }
  };

  const handleMaster = async (action: Action) => {
    const actionId = action.dbId || action.id;
    if (!actionId) return;
    const nowIso = new Date().toISOString();
    patchActionLocal(action.id, { status: 'completed', lastPerformedAt: nowIso });
    const { error } = await supabase
      .from('user_personal_actions')
      .update({ status: 'completed', last_performed_at: nowIso })
      .eq('id', actionId);
    if (error) {
      await loadActions();
      throw error;
    }
  };

  const handleSaveHabitSettings = async (action: Action, payload: { targetReps: number; scheduledDays: string[] | null; activateIfPending: boolean }) => {
    const actionId = action.dbId || action.id;
    if (!actionId) return;
    const safeTarget = Math.max(1, Math.min(7, Number(payload.targetReps ?? 1)));
    const safeDays = payload.scheduledDays && payload.scheduledDays.length > 0
      ? payload.scheduledDays.slice(0, safeTarget)
      : null;
    const updates: any = {
      target_reps: safeTarget,
      scheduled_days: safeDays,
    };
    if (payload.activateIfPending) updates.status = 'active';

    const { error } = await supabase
      .from('user_personal_actions')
      .update(updates)
      .eq('id', actionId);
    if (error) throw error;
    await loadActions();
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 flex items-center gap-2">
          <Repeat className="w-5 h-5 text-emerald-600" />
          Actions personnelles
        </h2>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md shadow-emerald-200 hover:shadow-emerald-300 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-sm text-slate-400">
          Chargement des actions personnelles…
        </div>
      ) : actions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Repeat className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Aucune habitude personnelle</h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto text-sm">
            Crée des habitudes indépendantes de ton plan de transformation (ex: boire de l'eau, méditer, lire...)
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="text-emerald-600 font-bold hover:text-emerald-700 transition-colors text-sm"
          >
            Créer ma première habitude
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="mb-4 text-xs text-slate-500">
            Habitudes indépendantes de ta transformation active ({activeCount} active{activeCount > 1 ? 's' : ''}).
          </div>
          <div className="space-y-6">
            {actions.map((action) => (
              <PlanActionCard
                key={action.id}
                action={action}
                isLocked={false}
                isPending={action.status === 'pending'}
                canActivate={true}
                onHelp={() => {}}
                onOpenFramework={() => {}}
                onUnlock={() => handleUnlock(action)}
                onIncrementHabit={() => handleIncrement(action)}
                onMasterHabit={() => handleMaster(action)}
                onOpenHabitSettings={() => setHabitSettingsAction(action)}
                onEdit={() => setEditingAction(action)}
                onDelete={() => handleDelete(action)}
                onDeactivate={() => handleDeactivate(action)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 bg-blue-50 rounded-2xl border border-blue-100 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm min-[350px]:text-base font-bold text-blue-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600" />
            Étoile polaire
          </h3>
          {northStar && (
            <button
              onClick={() => setNorthStarModalOpen(true)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900"
            >
              Modifier
            </button>
          )}
        </div>
        {northStarLoading ? (
          <p className="text-sm text-blue-400">Chargement de l'étoile polaire…</p>
        ) : !northStar ? (
          <div>
            <p className="text-sm text-blue-700/80 mb-3">
              Définis ton indicateur global de progression pour garder le cap entre les transformations.
            </p>
            <button
              onClick={() => setNorthStarModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm shadow-blue-200"
            >
              <Sparkles className="w-4 h-4" />
              Configurer mon étoile polaire
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {showCyclePrompt && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-amber-900 font-semibold mb-2">
                  Nouvelle transformation détectée. Tu gardes cette étoile polaire ?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDismissCyclePrompt}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs"
                  >
                    Oui, je garde
                  </button>
                  <button
                    onClick={() => setNorthStarModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-900 font-bold text-xs"
                  >
                    Non, je modifie
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-blue-900">{northStar.title}</p>
              <p className="text-xs text-blue-700 mt-1">
                Actuel: {northStar.current_value} {northStar.unit} • Cible: {northStar.target_value} {northStar.unit}
              </p>
              {Array.isArray(northStar.history) && northStar.history.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-2">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Historique</p>
                  <div className="space-y-1">
                    {[...northStar.history]
                      .slice(-5)
                      .reverse()
                      .map((h: any, idx: number) => (
                        <div key={`${h?.date}-${idx}`} className="text-xs text-slate-600 flex items-center justify-between">
                          <span>{String(h?.date ?? '')}</span>
                          <span className="font-semibold">{String(h?.value ?? '')} {northStar.unit}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-slate-100">
                <button
                  onClick={async () => {
                    const v = window.prompt('Nouvelle valeur actuelle :', String(northStar.current_value));
                    if (v == null) return;
                    await updateNorthStarValue(v);
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Mettre à jour la valeur
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateActionModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (actionData) => {
          await handleCreate(actionData);
          setCreateOpen(false);
        }}
        lockToHabit
      />

      <CreateActionModal
        isOpen={!!editingAction}
        onClose={() => setEditingAction(null)}
        mode="edit"
        initialValues={editingAction || undefined}
        onSubmit={async (actionData) => {
          if (!editingAction) return;
          await handleUpdate(editingAction, actionData);
          setEditingAction(null);
        }}
        lockToHabit
      />

      <HabitSettingsModal
        isOpen={!!habitSettingsAction}
        mode="edit"
        action={habitSettingsAction}
        onClose={() => setHabitSettingsAction(null)}
        onSave={async (payload) => {
          if (!habitSettingsAction) return;
          await handleSaveHabitSettings(habitSettingsAction, payload);
        }}
      />

      <NorthStarModal
        isOpen={northStarModalOpen}
        onClose={() => setNorthStarModalOpen(false)}
        onGenerate={handleGenerateNorthStarSuggestions}
        onSubmit={upsertNorthStar}
        existingNorthStar={northStar}
        suggestions={northStarSuggestions}
        isGenerating={northStarGenerating}
        isSaving={northStarSaving}
      />
    </section>
  );
}
