import React, { useEffect, useState } from 'react';
import {
  Bell,
  Plus,
  Clock,
  Calendar,
  Trash2,
  Edit2,
  Play,
  Pause,
  Lock,
  Crown,
  ChevronDown,
} from 'lucide-react';
import { motion } from 'framer-motion';

import { CreateReminderModal, type ReminderFormValues } from './CreateReminderModal';
import { shouldValidateOnUpdate, validateEthicalText } from '../../lib/ethicalValidation';
import { supabase } from '../../lib/supabase';

type ReminderRow = {
  id: string;
  user_id: string;
  message_instruction: string;
  rationale: string | null;
  local_time_hhmm: string;
  scheduled_days: string[];
  status: 'active' | 'inactive';
};

type Reminder = {
  id: string;
  message: string;
  rationale: string | null;
  time: string;
  days: string[];
  isActive: boolean;
};

interface RemindersSectionProps {
  userId: string | null;
  isLocked?: boolean;
  onUnlockRequest?: () => void;
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    message: row.message_instruction,
    rationale: row.rationale ?? null,
    time: row.local_time_hhmm,
    days: row.scheduled_days ?? [],
    isActive: row.status === 'active',
  };
}

export const RemindersSection: React.FC<RemindersSectionProps> = ({
  userId,
  isLocked = false,
  onUnlockRequest,
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
        .select('id,user_id,message_instruction,rationale,local_time_hhmm,scheduled_days,status')
        .eq('user_id', userId)
        .in('status', ['active', 'inactive'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReminders(((data ?? []) as ReminderRow[]).map(rowToReminder));
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

      const { data: createdReminder, error } = await supabase
        .from('user_recurring_reminders')
        .insert({
          user_id: userId,
          message_instruction: message,
          rationale: data.rationale ?? null,
          local_time_hhmm: data.time,
          scheduled_days: sortedDays,
          status: 'active',
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
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', editingReminder.id);

      if (error) throw error;

      void supabase.functions.invoke('classify-recurring-reminder', {
        body: { reminder_id: editingReminder.id, full_reset: true },
      });

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
    const { error } = await supabase
      .from('user_recurring_reminders')
      .update({
        status: nextActive ? 'active' : 'inactive',
        deactivated_at: nextActive ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', reminder.id);

    if (error) throw error;

    if (nextActive) {
      void supabase.functions.invoke('classify-recurring-reminder', {
        body: { reminder_id: reminder.id },
      });
    }

    await loadReminders();
  };

  const softDeleteReminder = async (reminder: Reminder) => {
    if (isLocked) return;

    const { error } = await supabase
      .from('user_recurring_reminders')
      .update({
        status: 'inactive',
        deactivated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', reminder.id);

    if (error) throw error;
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
    <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
      {isLocked && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 min-[450px]:flex-row min-[450px]:items-center min-[450px]:justify-between">
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

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 min-[350px]:text-xl">
            <Bell className="h-5 w-5 text-amber-500" />
            Mes initiatives
          </h2>
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
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-amber-200 transition-all hover:bg-amber-600 hover:shadow-amber-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber-500"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden min-[450px]:inline">Ajouter</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowInfo((previous) => !previous)}
          className="mb-2 ml-7 flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          Quelques explications ?
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showInfo ? 'rotate-180' : ''}`}
          />
        </button>

        <motion.div
          initial={false}
          animate={{ height: showInfo ? 'auto' : 0, opacity: showInfo ? 1 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="mb-4 ml-7 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-500">
            <p>
              Configure des initiatives pour que Sophia vienne vers toi au bon moment selon tes besoins.
            </p>
            <p>
              Sois créatif ! Tu peux lui demander de t&apos;envoyer du contenu inspirant, des rappels bienveillants ou simplement une pensée positive.
            </p>
            <p>
              Exemples : « Envoie-moi une citation stoïcienne pour me faire réfléchir », « Rappelle-moi pourquoi je dois me coucher tôt », ou « Envoie-moi un message après le repas du midi pour me rappeler de ne pas fumer ».
            </p>
          </div>
        </motion.div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-500">
          Chargement des rappels...
        </div>
      ) : reminders.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center md:p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500 md:h-16 md:w-16">
            <Bell className="h-6 w-6 md:h-8 md:w-8" />
          </div>
          <h3 className="mb-2 text-base font-bold text-slate-900 md:text-lg">
            Aucune initiative configurée
          </h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-slate-500">
            Crée ta première initiative pour que Sophia vienne vers toi au bon moment.
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="text-xs font-bold text-amber-600 transition-colors hover:text-amber-700 md:text-sm"
          >
            Créer ma première initiative
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {reminders.map((reminder) => (
            <motion.div
              key={reminder.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`group relative rounded-2xl border p-5 transition-all ${
                reminder.isActive
                  ? 'border-slate-100 bg-white shadow-sm hover:border-amber-200 hover:shadow-md'
                  : 'border-slate-100 bg-slate-50 opacity-60'
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold ${
                    reminder.isActive
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  {reminder.time}
                </div>

                {!isLocked && (
                  <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => void toggleActive(reminder)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      title={reminder.isActive ? 'Desactiver' : 'Activer'}
                    >
                      {reminder.isActive
                        ? <Pause className="h-4 w-4" />
                        : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingReminder(reminder)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
                      title="Modifier"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void softDeleteReminder(reminder)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Supprimer (desactive)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <p
                className={`mb-4 line-clamp-2 text-sm font-medium ${
                  reminder.isActive ? 'text-slate-800' : 'text-slate-500'
                }`}
              >
                &quot;{reminder.message}&quot;
              </p>

              {reminder.rationale ? (
                <p
                  className={`mb-4 line-clamp-2 text-xs ${
                    reminder.isActive ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  Pourquoi: {reminder.rationale}
                </p>
              ) : null}

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="h-3 w-3" />
                <div className="flex gap-1">
                  {reminder.days.length === 7 ? (
                    <span className="font-bold text-amber-600">Tous les jours</span>
                  ) : (
                    reminder.days.map((day) => (
                      <span
                        key={day}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase"
                      >
                        {getDayLabel(day)}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <CreateReminderModal
        isOpen={!isLocked && isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        isSubmitting={isVerifyingEthics}
      />

      <CreateReminderModal
        isOpen={!isLocked && !!editingReminder}
        onClose={() => setEditingReminder(null)}
        onSubmit={handleUpdate}
        isSubmitting={isVerifyingEthics}
        initialValues={
          editingReminder
            ? {
              message: editingReminder.message,
              rationale: editingReminder.rationale,
              time: editingReminder.time,
              days: editingReminder.days,
            }
            : null
        }
      />
    </section>
  );
};
