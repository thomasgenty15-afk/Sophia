import React, { useEffect, useState } from 'react';
import { Bell, Plus, Clock, Calendar, Trash2, Edit2, Play, Pause } from 'lucide-react';
import { CreateReminderModal, type ReminderFormValues } from './CreateReminderModal';
import { motion } from 'framer-motion';
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

export const RemindersSection: React.FC<RemindersSectionProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);

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

  const handleCreate = async (data: ReminderFormValues) => {
    if (!userId) return;
    const message = String(data.message ?? '').trim();
    if (!message || !data.days?.length) return;
    const sortedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((d) => data.days.includes(d));
    const { error } = await supabase.from('user_recurring_reminders').insert({
      user_id: userId,
      message_instruction: message,
      rationale: data.rationale ?? null,
      local_time_hhmm: data.time,
      scheduled_days: sortedDays,
      status: 'active',
      updated_at: new Date().toISOString(),
    } as any);
    if (error) throw error;
    setIsModalOpen(false);
    await loadReminders();
  };

  const handleUpdate = async (data: ReminderFormValues) => {
    if (!editingReminder) return;
    const message = String(data.message ?? '').trim();
    if (!message || !data.days?.length) return;
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
    setEditingReminder(null);
    await loadReminders();
  };

  const toggleActive = async (reminder: Reminder) => {
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
    await loadReminders();
  };

  const softDeleteReminder = async (reminder: Reminder) => {
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Bell className="w-6 h-6 text-amber-500" /> Mes Rappels
        </h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden min-[450px]:inline">Ajouter</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-500">
          Chargement des rappels...
        </div>
      ) : reminders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Aucun rappel configure</h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Configure des rappels recurrents pour que Sophia t'envoie un message au bon moment.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-amber-600 font-bold hover:text-amber-700 transition-colors"
          >
            Creer mon premier rappel
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

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
      />

      <CreateReminderModal
        isOpen={!!editingReminder}
        onClose={() => setEditingReminder(null)}
        onSubmit={handleUpdate}
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

