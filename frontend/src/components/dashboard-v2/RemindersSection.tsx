import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Plus,
  Calendar,
  Trash2,
  Edit2,
  Play,
  Pause,
  Lock,
  Crown,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';

import { CreateReminderModal, type ReminderFormValues } from './CreateReminderModal';
import { shouldValidateOnUpdate, validateEthicalText } from '../../lib/ethicalValidation';
import { supabase } from '../../lib/supabase';

type ReminderRow = {
  id: string;
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  message_instruction: string;
  rationale: string | null;
  local_time_hhmm: string;
  scheduled_days: string[];
  status: 'active' | 'inactive' | 'completed' | 'expired' | 'archived';
  scope_kind: 'transformation' | 'out_of_plan';
  initiative_kind: 'base_free' | 'plan_free' | 'potion_follow_up';
  source_kind: 'user_created' | 'potion_generated';
  source_potion_session_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  ended_reason: 'user' | 'plan_completed' | 'plan_stopped' | 'expired' | null;
  initiative_metadata: Record<string, unknown> | null;
};

type Reminder = {
  id: string;
  cycleId: string | null;
  transformationId: string | null;
  message: string;
  rationale: string | null;
  time: string;
  days: string[];
  isActive: boolean;
  status: ReminderRow['status'];
  scopeKind: ReminderRow['scope_kind'];
  kind: ReminderRow['initiative_kind'];
  sourceKind: ReminderRow['source_kind'];
  sourcePotionSessionId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  endedReason: ReminderRow['ended_reason'];
  durationDays: number | null;
};

interface RemindersSectionProps {
  userId: string | null;
  cycleId?: string | null;
  transformationId?: string | null;
  transformationTitle?: string | null;
  scopeKind?: 'transformation' | 'out_of_plan';
  isLocked?: boolean;
  onUnlockRequest?: () => void;
  onMoveToBaseDeVie?: () => void;
}

function rowToReminder(row: ReminderRow): Reminder {
  const metadata = row.initiative_metadata ?? {};
  const metadataDuration = Number(
    (metadata as Record<string, unknown>).scheduled_duration_days ?? null
  );

  return {
    id: row.id,
    cycleId: row.cycle_id,
    transformationId: row.transformation_id,
    message: row.message_instruction,
    rationale: row.rationale ?? null,
    time: row.local_time_hhmm,
    days: row.scheduled_days ?? [],
    isActive: row.status === 'active',
    status: row.status,
    scopeKind: row.scope_kind,
    kind: row.initiative_kind,
    sourceKind: row.source_kind,
    sourcePotionSessionId: row.source_potion_session_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    endedReason: row.ended_reason,
    durationDays: Number.isFinite(metadataDuration) ? metadataDuration : null,
  };
}

function isVisibleActiveReminder(reminder: Reminder) {
  return reminder.status === 'active' || reminder.status === 'inactive';
}

function isLibraryReminder(reminder: Reminder) {
  return reminder.status === 'completed' || reminder.status === 'expired' || reminder.status === 'archived';
}

function reminderKindLabel(reminder: Reminder) {
  if (reminder.kind === 'potion_follow_up') return 'Potion';
  if (reminder.kind === 'plan_free') return 'Plan';
  return 'Base de vie';
}

function reminderStatusLabel(reminder: Reminder) {
  if (reminder.status === 'expired') return 'Expirée';
  if (reminder.status === 'completed') return 'Terminée';
  if (reminder.status === 'archived') return 'Archivée';
  if (reminder.status === 'inactive') return 'En pause';
  return 'Active';
}

export const RemindersSection: React.FC<RemindersSectionProps> = ({
  userId,
  cycleId = null,
  transformationId = null,
  transformationTitle = null,
  scopeKind = 'out_of_plan',
  isLocked = false,
  onUnlockRequest,
  onMoveToBaseDeVie,
}) => {
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [isVerifyingEthics, setIsVerifyingEthics] = useState(false);

  const loadReminders = async () => {
    if (!userId) {
      setReminders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_recurring_reminders')
        .select('id,user_id,cycle_id,transformation_id,message_instruction,rationale,local_time_hhmm,scheduled_days,status,scope_kind,initiative_kind,source_kind,source_potion_session_id,starts_at,ends_at,ended_reason,initiative_metadata')
        .eq('user_id', userId)
        .in('status', ['active', 'inactive', 'completed', 'expired', 'archived'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = ((data ?? []) as ReminderRow[]).map((row) => ({ ...row }));
      const nowIso = new Date().toISOString();
      const expiredIds = rows
        .filter((row) =>
          row.status === 'active' &&
          row.initiative_kind === 'potion_follow_up' &&
          typeof row.ends_at === 'string' &&
          row.ends_at <= nowIso
        )
        .map((row) => row.id);

      if (expiredIds.length > 0) {
        const { error: expireError } = await supabase
          .from('user_recurring_reminders')
          .update({
            status: 'expired',
            ended_reason: 'expired',
            deactivated_at: nowIso,
            updated_at: nowIso,
          } as any)
          .in('id', expiredIds);
        if (expireError) throw expireError;

        const { error: cancelCheckinsError } = await supabase
          .from('scheduled_checkins')
          .update({
            status: 'cancelled',
            processed_at: nowIso,
          } as any)
          .in('recurring_reminder_id', expiredIds)
          .in('status', ['pending', 'retrying', 'awaiting_user']);
        if (cancelCheckinsError) throw cancelCheckinsError;

        rows.forEach((row) => {
          if (expiredIds.includes(row.id)) {
            row.status = 'expired';
            row.ended_reason = 'expired';
          }
        });
      }

      setReminders(rows.map(rowToReminder));
    } catch (error) {
      console.error('[RemindersSection] load failed', error);
      setReminders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReminders();
  }, [userId]);

  const scopedReminders = useMemo(() => {
    if (scopeKind === 'transformation') {
      return reminders.filter((reminder) => reminder.transformationId === transformationId);
    }
    return reminders.filter((reminder) => reminder.scopeKind === 'out_of_plan' || reminder.kind === 'potion_follow_up');
  }, [reminders, scopeKind, transformationId]);

  const freeReminders = useMemo(() => {
    if (scopeKind === 'transformation') {
      return scopedReminders.filter(
        (reminder) => reminder.kind === 'plan_free' && reminder.status !== 'archived'
      );
    }
    return scopedReminders.filter(
      (reminder) => reminder.kind === 'base_free' && isVisibleActiveReminder(reminder)
    );
  }, [scopeKind, scopedReminders]);

  const potionReminders = useMemo(
    () => scopedReminders.filter(
      (reminder) => reminder.kind === 'potion_follow_up' && reminder.status !== 'archived'
    ),
    [scopedReminders]
  );

  const libraryReminders = useMemo(
    () => scopeKind === 'out_of_plan'
      ? reminders.filter((reminder) => isLibraryReminder(reminder))
      : [],
    [reminders, scopeKind]
  );

  const [libraryFilter, setLibraryFilter] = useState<'all' | 'base_free' | 'plan_free' | 'potion_follow_up'>('all');
  const filteredLibraryReminders = useMemo(
    () => libraryReminders.filter((reminder) =>
      libraryFilter === 'all' ? true : reminder.kind === libraryFilter
    ),
    [libraryFilter, libraryReminders]
  );

  const runEthicalValidation = async (params: {
    operation: 'create' | 'update';
    textFields: Record<string, unknown>;
    previousTextFields?: Record<string, unknown>;
    textFieldKeys: string[];
  }) => {
    setIsVerifyingEthics(true);
    try {
      const result = await validateEthicalText({
        entityType: 'rendez_vous',
        operation: params.operation,
        textFields: params.textFields,
        previousTextFields: params.previousTextFields ?? null,
        textFieldKeys: params.textFieldKeys,
        context: { scope: 'reminders' },
      });

      if (result.decision === 'block') {
        throw new Error(result.reasonShort || 'Contenu bloqué par la vérification éthique.');
      }
    } finally {
      setIsVerifyingEthics(false);
    }
  };

  const handleCreate = async (data: ReminderFormValues) => {
    if (isLocked || !userId) return;

    const message = String(data.message ?? '').trim();
    if (!message || !data.days?.length) return;

    try {
      await runEthicalValidation({
        operation: 'create',
        textFields: {
          message_instruction: message,
          rationale: data.rationale ?? null,
        },
        textFieldKeys: ['message_instruction', 'rationale'],
      });

      const sortedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((day) =>
        data.days.includes(day)
      );
      const destination = scopeKind === 'transformation'
        ? data.destination
        : 'base_de_vie';
      const isBaseDeVieDestination = destination === 'base_de_vie';

      const { data: createdReminder, error } = await supabase
        .from('user_recurring_reminders')
        .insert({
          user_id: userId,
          cycle_id: isBaseDeVieDestination ? cycleId : cycleId,
          transformation_id: isBaseDeVieDestination ? null : transformationId,
          scope_kind: isBaseDeVieDestination ? 'out_of_plan' : 'transformation',
          initiative_kind: isBaseDeVieDestination ? 'base_free' : 'plan_free',
          source_kind: 'user_created',
          source_potion_session_id: null,
          message_instruction: message,
          rationale: data.rationale ?? null,
          local_time_hhmm: data.time,
          scheduled_days: sortedDays,
          status: 'active',
          starts_at: new Date().toISOString(),
          ends_at: null,
          ended_reason: null,
          archived_at: null,
          updated_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      if (createdReminder?.id) {
        void supabase.functions.invoke('classify-recurring-reminder', {
          body: { reminder_id: createdReminder.id },
        });
      }

      setIsModalOpen(false);
      await loadReminders();
      if (isBaseDeVieDestination) {
        onMoveToBaseDeVie?.();
      }
    } catch (error: any) {
      alert(String(error?.message ?? 'Erreur lors de l’enregistrement.'));
      throw error;
    }
  };

  const handleUpdate = async (data: ReminderFormValues) => {
    if (isLocked || !editingReminder) return;

    const message = String(data.message ?? '').trim();
    if (!message || !data.days?.length) return;

    const previousText = {
      message_instruction: editingReminder.message ?? '',
      rationale: editingReminder.rationale ?? '',
    };
    const nextText = {
      message_instruction: message,
      rationale: data.rationale ?? '',
    };

    try {
      if (
        shouldValidateOnUpdate(previousText, nextText, [
          'message_instruction',
          'rationale',
        ])
      ) {
        await runEthicalValidation({
          operation: 'update',
          textFields: nextText,
          previousTextFields: previousText,
          textFieldKeys: ['message_instruction', 'rationale'],
        });
      }

      const sortedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((day) =>
        data.days.includes(day)
      );

      const { error } = await supabase
        .from('user_recurring_reminders')
        .update({
          message_instruction: message,
          rationale: data.rationale ?? null,
          local_time_hhmm: data.time,
          scheduled_days: sortedDays,
          ended_reason: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', editingReminder.id);

      if (error) throw error;

      if (editingReminder.kind === 'potion_follow_up' && editingReminder.sourcePotionSessionId) {
        const { error: potionError } = await supabase.functions.invoke('schedule-potion-follow-up-v1', {
          body: {
            session_id: editingReminder.sourcePotionSessionId,
            local_time_hhmm: data.time,
            duration_days: editingReminder.durationDays ?? 7,
          },
        });
        if (potionError) throw potionError;
      } else if (editingReminder.status === 'active') {
        void supabase.functions.invoke('classify-recurring-reminder', {
          body: { reminder_id: editingReminder.id, full_reset: true },
        });
      }

      setEditingReminder(null);
      await loadReminders();
    } catch (error: any) {
      alert(String(error?.message ?? 'Erreur lors de la mise à jour.'));
      throw error;
    }
  };

  const toggleActive = async (reminder: Reminder) => {
    if (isLocked) return;

    const nextActive = !reminder.isActive;
    if (nextActive) {
      if (reminder.kind === 'potion_follow_up' && reminder.sourcePotionSessionId) {
        const { error } = await supabase.functions.invoke('schedule-potion-follow-up-v1', {
          body: {
            session_id: reminder.sourcePotionSessionId,
            local_time_hhmm: reminder.time,
            duration_days: reminder.durationDays ?? 7,
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_recurring_reminders')
          .update({
            status: 'active',
            deactivated_at: null,
            archived_at: null,
            ended_reason: null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', reminder.id);

        if (error) throw error;

        void supabase.functions.invoke('classify-recurring-reminder', {
          body: { reminder_id: reminder.id, full_reset: true },
        });
      }
    } else {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('user_recurring_reminders')
        .update({
          status: 'inactive',
          deactivated_at: nowIso,
          ended_reason: 'user',
          updated_at: nowIso,
        } as any)
        .eq('id', reminder.id);

      if (error) throw error;

      const { error: cancelCheckinsError } = await supabase
        .from('scheduled_checkins')
        .update({
          status: 'cancelled',
          processed_at: nowIso,
        } as any)
        .eq('recurring_reminder_id', reminder.id)
        .in('status', ['pending', 'retrying', 'awaiting_user']);

      if (cancelCheckinsError) throw cancelCheckinsError;
    }

    await loadReminders();
  };

  const softDeleteReminder = async (reminder: Reminder) => {
    if (isLocked) return;

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('user_recurring_reminders')
      .update({
        status: 'archived',
        deactivated_at: nowIso,
        archived_at: nowIso,
        ended_reason: 'user',
        updated_at: nowIso,
      } as any)
      .eq('id', reminder.id);

    if (error) throw error;

    const { error: cancelCheckinsError } = await supabase
      .from('scheduled_checkins')
      .update({
        status: 'cancelled',
        processed_at: nowIso,
      } as any)
      .eq('recurring_reminder_id', reminder.id)
      .in('status', ['pending', 'retrying', 'awaiting_user']);

    if (cancelCheckinsError) throw cancelCheckinsError;

    await loadReminders();
  };

  const getDayLabel = (key: string) => {
    const labels: Record<string, string> = {
      mon: 'Lun',
      tue: 'Mar',
      wed: 'Mer',
      thu: 'Jeu',
      fri: 'Ven',
      sat: 'Sam',
      sun: 'Dim',
    };

    return labels[key] || key;
  };

  return (
    <div className="space-y-5">
      {isLocked && (
        <div className="flex flex-col gap-3 rounded-[30px] border border-stone-200 bg-amber-50 p-5 min-[450px]:flex-row min-[450px]:items-center min-[450px]:justify-between shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                Fonctionnalité WhatsApp verrouillée
              </p>
              <p className="text-xs text-amber-700">
                Les initiatives WhatsApp sont disponibles avec le plan Alliance ou Architecte.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onUnlockRequest?.()}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-400"
          >
            <Crown className="h-4 w-4" />
            Passer à Alliance / Architecte
          </button>
        </div>
      )}

      <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-sm">
        <button
          type="button"
          onClick={() => setShowInfo((value) => !value)}
          className="flex w-full items-center justify-center gap-2 text-center text-xs font-bold uppercase tracking-widest text-amber-700 transition-colors hover:text-amber-900"
        >
          {showInfo ? "Masquer les explications" : "Comment utiliser cet espace"}
          {showInfo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showInfo ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-5 py-5 text-left text-sm leading-7 text-stone-700 animate-fade-in">
            {scopeKind === 'transformation' ? (
              <>
                <p>
                  Configure ici des initiatives qui soutiennent concretement ton plan, au moment ou tu en as le plus besoin.
                </p>
                <p className="mt-4">
                  Une initiative, ce n'est pas seulement un rappel pour ne pas oublier. C'est une
                  presence utile que Sophia peut envoyer pour t'aider a agir, te recentrer, retrouver
                  ton cap ou traverser un moment plus fragile avec plus de force.
                </p>
                <p className="mt-4">
                  Pense action, contexte et timing: Sophia peut te relancer avant un moment sensible,
                  te rappeler un cap precis, renforcer un bon etat d'esprit, ou t'aider a refaire le
                  bon geste quand l'automatisme risque de reprendre la main.
                </p>
              </>
            ) : (
              <>
                <p>
                  Ici, tu retrouves les initiatives qui vivent en dehors du plan: celles que tu veux garder
                  dans ta Base de vie, et la bibliotheque des initiatives deja vecues que tu peux relancer plus tard.
                </p>
                <p className="mt-4">
                  Une initiative peut servir a entretenir un elan, proteger un equilibre ou garder un repere
                  vivant dans le temps. Certaines viennent de toi, d'autres d'une potion que tu as utilisee
                  pendant une transformation.
                </p>
              </>
            )}
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700/90">
                Exemples
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-stone-700 marker:text-amber-500">
                {scopeKind === 'transformation' ? (
                  <>
                    <li>« Envoie-moi un message 10 minutes avant le diner pour me rappeler de manger plus lentement »</li>
                    <li>« Rappelle-moi a 22h30 que mon vrai objectif est de proteger mon sommeil »</li>
                    <li>« Ecris-moi juste apres le repas du midi pour m'aider a ne pas fumer »</li>
                  </>
                ) : (
                  <>
                    <li>« Rappelle-moi le dimanche soir le cadre que je veux garder pour ma semaine »</li>
                    <li>« Envoie-moi un message doux quand je sens que je redeviens trop dure avec moi »</li>
                    <li>« Redonne-moi mon cap quand j'ai l'impression de me disperser »</li>
                  </>
                )}
              </ul>
            </div>
            {scopeKind === 'transformation' ? (
              <p className="mt-5">
                Tu retrouveras aussi ici les initiatives que Sophia peut creer automatiquement apres
                une potion, quand un soutien dans la duree peut aider a prolonger l'effet de ce que
                tu viens de traverser.
              </p>
            ) : null}
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-white/70 px-4 py-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Lightbulb className="h-4 w-4" />
              </div>
              <p className="text-sm leading-6 text-amber-950/80">
                <span className="font-semibold text-amber-900">Bon à savoir :</span> {scopeKind === 'transformation'
                  ? " cet espace sert surtout aux rappels relies a ton plan. Si tu veux des initiatives plus libres, plus intemporelles ou moins liees a une action precise, cree-les plutot dans ta Base de vie."
                  : " depuis la Base de vie, tu peux aussi retrouver les initiatives deja terminees ou expirees et les reactiver quand tu en ressens de nouveau le besoin."}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
        <div className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50">
              <Bell className="h-5 w-5 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-h-10 items-center">
                <h3
                  className="text-xl font-semibold tracking-[0.01em] text-stone-950"
                  style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
                >
                  Initiatives
                </h3>
              </div>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                {scopeKind === 'transformation'
                  ? "Retrouve ici quand et pourquoi Sophia prend des initiatives sur ton plan en cours."
                  : "Retrouve ici les initiatives libres de ta Base de vie, ainsi que la bibliotheque de celles que tu pourras relancer."}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 pb-6 border-t border-stone-100 pt-5 mt-2">
          {/* Section: Initiatives libres */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50">
            <div className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                  <Sparkles className="h-4 w-4 text-amber-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-950">Initiatives libres</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {scopeKind === 'transformation'
                      ? "Ici, tu peux creer les initiatives que tu veux relier directement a ta transformation en cours."
                      : "Ici, tu peux creer des initiatives plus personnelles et plus ouvertes, qui ne sont pas forcement rattachees a une action precise du plan mais qui soutiennent ton elan au quotidien."}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t border-stone-200 px-4 py-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement...
                </div>
              ) : freeReminders.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          onUnlockRequest?.();
                          return;
                        }
                        setIsModalOpen(true);
                      }}
                      disabled={isLocked}
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60"
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter une initiative
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {freeReminders.map((reminder) => (
                      <motion.article
                        key={reminder.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`group relative rounded-2xl border p-4 transition-all flex flex-col h-full ${
                          reminder.isActive
                            ? 'border-stone-200 bg-white shadow-sm hover:border-amber-200 hover:shadow-md'
                            : 'border-stone-200 bg-stone-50/80 opacity-70'
                        }`}
                      >
                        {/* Top row: Status & Actions */}
                        <div className="mb-3 flex items-start justify-between min-h-[28px]">
                          <div className="flex flex-wrap items-center gap-2">
                            {!reminder.isActive && (
                              <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold bg-stone-100 text-stone-600">
                                <Pause className="w-3 h-3" /> En pause
                              </span>
                            )}
                          </div>

                          {!isLocked && (
                            <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => void toggleActive(reminder)}
                                className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                                title={reminder.isActive ? 'Mettre en pause' : 'Activer'}
                              >
                                {reminder.isActive
                                  ? <Pause className="h-4 w-4" />
                                  : <Play className="h-4 w-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingReminder(reminder)}
                                className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-blue-600"
                                title="Modifier"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void softDeleteReminder(reminder)}
                                className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                                title="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Title & Description */}
                        <div className="mb-2 flex items-center gap-2">
                          <div className="rounded-lg p-1.5 bg-amber-50 text-amber-700">
                            <Bell className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-stone-500">
                            {reminderKindLabel(reminder)} • {reminder.time}
                          </p>
                        </div>

                        <h3
                          className={`mb-2 text-sm font-bold leading-5 ${
                            reminder.isActive ? 'text-stone-900' : 'text-stone-500'
                          }`}
                        >
                          &quot;{reminder.message}&quot;
                        </h3>

                        {reminder.rationale && (
                          <div className="mb-4">
                            <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">
                              {reminder.rationale}
                            </p>
                          </div>
                        )}

                        {/* Bottom row: Days */}
                        <div className="mt-auto pt-2">
                          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                            <Calendar className="h-3.5 w-3.5" />
                            <div className="flex gap-1">
                              {reminder.days.length === 7 ? (
                                <span className="text-amber-600">Tous les jours</span>
                              ) : (
                                reminder.days.map((day) => (
                                  <span
                                    key={day}
                                    className="rounded bg-stone-100 px-1.5 py-0.5"
                                  >
                                    {getDayLabel(day)}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-center">
                  <p className="text-sm leading-6 text-stone-600">
                    {scopeKind === 'transformation'
                      ? "Tu n'as pas encore d'initiative libre liee a cette transformation."
                      : "Tu n'as pas encore d'initiative libre dans cette section."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (isLocked) {
                        onUnlockRequest?.();
                        return;
                      }
                      setIsModalOpen(true);
                    }}
                    disabled={isLocked}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Créer ma première initiative
                  </button>
                </div>
              )}
            </div>
          </div>

          {scopeKind === 'transformation' ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 mt-6">
              <div className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
                    <Sparkles className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-950">Les initiatives qui viennent des potions</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Ici, tu retrouves les initiatives que Sophia peut creer automatiquement apres une potion,
                      pour prolonger son effet dans la vraie vie et t'aider a tenir dans la duree.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                {potionReminders.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {potionReminders.map((reminder) => (
                      <motion.article
                        key={reminder.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`group relative rounded-2xl border p-4 transition-all flex flex-col h-full ${
                          reminder.isActive
                            ? 'border-emerald-200 bg-white shadow-sm hover:border-emerald-300 hover:shadow-md'
                            : 'border-stone-200 bg-stone-50/80 opacity-80'
                        }`}
                      >
                        <div className="mb-3 flex items-start justify-between min-h-[28px]">
                          <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                            reminder.status === 'expired'
                              ? 'bg-stone-100 text-stone-600'
                              : reminder.status === 'inactive'
                              ? 'bg-stone-100 text-stone-600'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {reminderStatusLabel(reminder)}
                          </span>
                          {!isLocked ? (
                            <button
                              type="button"
                              onClick={() => void toggleActive(reminder)}
                              className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-emerald-700"
                              title={reminder.isActive ? 'Mettre en pause' : 'Réactiver'}
                            >
                              {reminder.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </div>

                        <div className="mb-2 flex items-center gap-2">
                          <div className="rounded-lg p-1.5 bg-emerald-50 text-emerald-700">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-stone-500">
                            Potion • {reminder.time}
                          </p>
                        </div>

                        <h3 className="mb-2 text-sm font-bold leading-5 text-stone-900">
                          &quot;{reminder.message}&quot;
                        </h3>

                        {reminder.rationale ? (
                          <p className="text-xs leading-relaxed text-stone-500">
                            {reminder.rationale}
                          </p>
                        ) : null}

                        <p className="mt-auto pt-3 text-xs text-stone-500">
                          {reminder.durationDays ? `Serie de ${reminder.durationDays} jours` : 'Suivi temporaire'}
                        </p>
                      </motion.article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-center">
                    <p className="text-sm leading-6 text-stone-600">
                      Tu n'as pas encore d'initiative créée par Sophia dans cette section.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {scopeKind === 'out_of_plan' ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 mt-6">
              <div className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
                    <Sparkles className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-950">Bibliothèque d&apos;initiatives</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Retrouve ici les initiatives terminees, expirees ou archivees, et relance celles dont tu as de nouveau besoin.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  {([
                    ['all', 'Toutes'],
                    ['base_free', 'Base de vie'],
                    ['plan_free', 'Plan'],
                    ['potion_follow_up', 'Potions'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLibraryFilter(value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        libraryFilter === value
                          ? 'bg-emerald-600 text-white'
                          : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {filteredLibraryReminders.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {filteredLibraryReminders.map((reminder) => (
                      <article
                        key={reminder.id}
                        className="rounded-2xl border border-stone-200 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                              {reminderKindLabel(reminder)} • {reminderStatusLabel(reminder)}
                            </p>
                            <h4 className="mt-2 text-sm font-semibold leading-5 text-stone-900">
                              &quot;{reminder.message}&quot;
                            </h4>
                          </div>
                          {!isLocked ? (
                            <button
                              type="button"
                              onClick={() => void toggleActive(reminder)}
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Réactiver
                            </button>
                          ) : null}
                        </div>
                        {reminder.rationale ? (
                          <p className="mt-3 text-sm leading-6 text-stone-600">
                            {reminder.rationale}
                          </p>
                        ) : null}
                        <p className="mt-3 text-xs text-stone-500">
                          {reminder.kind === 'potion_follow_up'
                            ? (reminder.durationDays
                              ? `Suivi potion • ${reminder.durationDays} jours`
                              : 'Suivi potion')
                            : `Horaire de reference • ${reminder.time}`}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-center">
                    <p className="text-sm leading-6 text-stone-600">
                      Aucune initiative dans cette bibliothèque pour ce filtre.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <CreateReminderModal
        isOpen={!isLocked && isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        isSubmitting={isVerifyingEthics}
        scopeMode={scopeKind}
        transformationTitle={transformationTitle}
      />

      <CreateReminderModal
        isOpen={!isLocked && !!editingReminder}
        onClose={() => setEditingReminder(null)}
        onSubmit={handleUpdate}
        isSubmitting={isVerifyingEthics}
        scopeMode={editingReminder?.scopeKind ?? scopeKind}
        transformationTitle={transformationTitle}
        initialValues={
          editingReminder
            ? {
              message: editingReminder.message,
              rationale: editingReminder.rationale,
              time: editingReminder.time,
              days: editingReminder.days,
              destination: editingReminder.scopeKind === 'out_of_plan' ? 'base_de_vie' : 'current_plan',
            }
            : null
        }
      />
    </div>
  );
};
