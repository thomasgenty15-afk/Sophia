import { useEffect, useMemo, useState } from 'react';
import { Plus, Repeat } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isSameIsoWeekLocal } from '../../lib/isoWeek';
import type { Action } from '../../types/dashboard';
import { PlanActionCard } from './PlanActionCard';
import { CreateActionModal } from './CreateActionModal';
import { HabitSettingsModal } from './HabitSettingsModal';

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
    </section>
  );
}


