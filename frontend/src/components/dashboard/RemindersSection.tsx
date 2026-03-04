import React, { useEffect, useState } from 'react';
import { Bell, Plus, Clock, Calendar, Trash2, Edit2, Play, Pause, Lock, Crown, Info, ChevronDown } from 'lucide-react';
import { CreateReminderModal, type ReminderFormValues } from './CreateReminderModal';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { shouldValidateOnUpdate, validateEthicalText } from '../../lib/ethicalValidation';

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

export const RemindersSection: React.FC<RemindersSectionProps> = ({ userId, isLocked = false, onUnlockRequest }) => {
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
    } catch (e) {
      console.error('[RemindersSection] load failed', e);
      setReminders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
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
        throw new Error(result.reasonShort || "Contenu bloqué par la vérification éthique.");
      }
    } finally {
      setIsVerifyingEthics(false);
    }
  };

  const handleCreate = async (data: ReminderFormValues) => {
    if (isLocked) return;
    if (!userId) return;
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
      const sortedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((d) => data.days.includes(d));
      const { data: createdReminder, error } = await supabase.from('user_recurring_reminders').insert({
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
    } catch (e: any) {
      alert(String(e?.message ?? "Erreur lors de l'enregistrement."));
      throw e;
    }
  };

  const handleUpdate = async (data: ReminderFormValues) => {
    if (isLocked) return;
    if (!editingReminder) return;
    const message = String(data.message ?? '').trim();
    if (!message || !data.days?.length) return;
    const prevText = {
      message_instruction: editingReminder.message ?? '',
      rationale: editingReminder.rationale ?? '',
    };
    const nextText = {
      message_instruction: message,
      rationale: data.rationale ?? '',
    };
    try {
      if (shouldValidateOnUpdate(prevText, nextText, ['message_instruction', 'rationale'])) {
        await runEthicalValidation({
          operation: 'update',
          textFields: nextText,
          previousTextFields: prevText,
          textFieldKeys: ['message_instruction', 'rationale'],
        });
      }
      const sortedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((d) => data.days.includes(d));
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
    } catch (e: any) {
      alert(String(e?.message ?? "Erreur lors de la mise à jour."));
      throw e;
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
    const map: Record<string, string> = {
      mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim',
    };
    return map[key] || key;
  };

  return (
    <div className="space-y-6">
      {isLocked && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col min-[450px]:flex-row min-[450px]:items-center min-[450px]:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">Fonctionnalité WhatsApp verrouillée</p>
              <p className="text-xs text-amber-700">
                Les rendez-vous WhatsApp sont disponibles avec le plan Alliance ou Architecte.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onUnlockRequest?.()}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold flex items-center justify-center gap-2 shrink-0"
          >
            <Crown className="w-4 h-4" />
            Passer à Alliance / Architecte
          </button>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            Mes Rendez-vous
          </h2>
          <button
            onClick={() => {
              if (isLocked) {
                onUnlockRequest?.();
                return;
              }
              setIsModalOpen(true);
            }}
            disabled={isLocked}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden min-[450px]:inline">Ajouter</span>
          </button>
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
              Configure des rendez-vous pour que Sophia vienne vers toi selon tes besoins.
            </p>
            <p>
              Sois créatif ! Tu peux lui demander de t'envoyer du contenu inspirant, des rappels bienveillants ou simplement une pensée positive.
            </p>
            <p>
              Exemples : « Envoie-moi une citation stoïcienne pour me faire réfléchir », « Rappelle-moi pourquoi je dois me coucher tôt », ou « Envoie-moi un message après le repas du midi pour me rappeler de ne pas fumer ».
            </p>
          </div>
        </motion.div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-500">
          Chargement des rappels...
        </div>
      ) : reminders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 md:p-8 text-center">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <h3 className="text-base md:text-lg font-bold text-slate-900 mb-2">Aucun rendez-vous configuré</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Crée ton premier rendez-vous pour que Sophia vienne vers toi au bon moment.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-amber-600 font-bold hover:text-amber-700 transition-colors text-xs md:text-sm"
          >
            Créer mon premier rendez-vous
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reminders.map((reminder) => (
            <motion.div
              key={reminder.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`bg-white rounded-2xl p-5 border transition-all relative group ${
                reminder.isActive
                  ? 'border-slate-100 shadow-sm hover:shadow-md hover:border-amber-200'
                  : 'border-slate-100 opacity-60 bg-slate-50'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                  reminder.isActive ? 'bg-amber-50 text-amber-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  <Clock className="w-3 h-3" />
                  {reminder.time}
                </div>

                {!isLocked && (
                  <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => toggleActive(reminder)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                      title={reminder.isActive ? 'Desactiver' : 'Activer'}
                    >
                      {reminder.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setEditingReminder(reminder)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => softDeleteReminder(reminder)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                      title="Supprimer (desactive)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <p className={`font-medium text-sm mb-4 line-clamp-2 ${reminder.isActive ? 'text-slate-800' : 'text-slate-500'}`}>
                "{reminder.message}"
              </p>

              {reminder.rationale ? (
                <p className={`text-xs mb-4 line-clamp-2 ${reminder.isActive ? 'text-slate-500' : 'text-slate-400'}`}>
                  Pourquoi: {reminder.rationale}
                </p>
              ) : null}

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="w-3 h-3" />
                <div className="flex gap-1">
                  {reminder.days.length === 7 ? (
                    <span className="font-bold text-amber-600">Tous les jours</span>
                  ) : (
                    reminder.days.map((d) => (
                      <span key={d} className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
                        {getDayLabel(d)}
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
        initialValues={editingReminder ? {
          message: editingReminder.message,
          rationale: editingReminder.rationale,
          time: editingReminder.time,
          days: editingReminder.days,
        } : null}
      />
    </div>
  );
};

