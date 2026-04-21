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
  const [expanded, setExpanded] = useState(true);
  const [isFreeSectionOpen, setIsFreeSectionOpen] = useState(true);

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
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700/90">
                Exemples
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-stone-700 marker:text-amber-500">
                <li>« Envoie-moi un message 10 minutes avant le diner pour me rappeler de manger plus lentement »</li>
                <li>« Rappelle-moi a 22h30 que mon vrai objectif est de proteger mon sommeil »</li>
                <li>« Ecris-moi juste apres le repas du midi pour m'aider a ne pas fumer »</li>
              </ul>
            </div>
            <p className="mt-5">
              Tu retrouveras aussi ici les initiatives que Sophia peut creer automatiquement apres
              une potion, quand un soutien dans la duree peut aider a prolonger l'effet de ce que
              tu viens de traverser.
            </p>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-white/70 px-4 py-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Lightbulb className="h-4 w-4" />
              </div>
              <p className="text-sm leading-6 text-amber-950/80">
                <span className="font-semibold text-amber-900">Bon à savoir :</span> cet espace
                sert surtout aux rappels relies a ton plan. Si tu veux des initiatives plus libres,
                plus intemporelles ou moins liees a une action precise, cree-les plutot dans ta
                Base de vie.
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
                Retrouve ici quand et pourquoi Sophia prend des initiatives.
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
                    Ici, tu peux creer des initiatives plus personnelles et plus ouvertes, qui ne
                    sont pas forcement rattachees a une action precise du plan mais qui soutiennent
                    ton elan au quotidien.
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
              ) : reminders.length > 0 ? (
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
                    {reminders.map((reminder) => (
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
                            INITIATIVE • {reminder.time}
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
                    Tu n'as pas encore d'initiative dans cette section.
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

          {/* Section: Initiatives créées par Sophia */}
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
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-center">
                <p className="text-sm leading-6 text-stone-600">
                  Tu n'as pas encore d'initiative créée par Sophia dans cette section.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

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
    </div>
  );
};
