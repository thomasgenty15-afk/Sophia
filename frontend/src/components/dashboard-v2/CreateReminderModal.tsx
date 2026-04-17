import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Plus, Bell, Clock, Calendar } from 'lucide-react';
import { clsx } from 'clsx';

export type ReminderFormValues = {
  message: string;
  rationale: string | null;
  time: string;
  days: string[];
};

interface CreateReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ReminderFormValues) => Promise<void>;
  isSubmitting?: boolean;
  initialValues?: Partial<ReminderFormValues> | null;
}

const DAYS = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Jeu' },
  { key: 'fri', label: 'Ven' },
  { key: 'sat', label: 'Sam' },
  { key: 'sun', label: 'Dim' },
];

export const CreateReminderModal: React.FC<CreateReminderModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  initialValues,
}) => {
  const [message, setMessage] = useState('');
  const [rationale, setRationale] = useState('');
  const [time, setTime] = useState('09:00');
  const [selectedDays, setSelectedDays] = useState<string[]>([
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
  ]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialValues) {
      setMessage(initialValues.message || '');
      setRationale(initialValues.rationale || '');
      setTime(initialValues.time || '09:00');
      setSelectedDays(initialValues.days || ['mon', 'tue', 'wed', 'thu', 'fri']);
      return;
    }

    resetForm();
  }, [isOpen, initialValues]);

  const resetForm = () => {
    setMessage('');
    setRationale('');
    setTime('09:00');
    setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
  };

  const toggleDay = (key: string) => {
    setSelectedDays((previous) =>
      previous.includes(key)
        ? previous.filter((day) => day !== key)
        : [...previous, key]
    );
  };

  const handleSubmit = async () => {
    if (!message.trim() || selectedDays.length === 0) return;

    await onSubmit({
      message,
      rationale: rationale.trim() || null,
      time,
      days: selectedDays,
    });
    resetForm();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-white p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                  <Bell className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 md:text-xl">
                  {initialValues ? 'Modifier l’initiative' : 'Nouvelle initiative'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-4 md:p-6">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Quelle initiative veux-tu planifier avec Sophia ?
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ex: Envoie-moi un message positif pour bien démarrer la journée."
                  rows={3}
                  className="w-full resize-none rounded-xl border-transparent bg-slate-50 px-4 py-3 text-xs font-medium text-slate-900 transition-all placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200 md:text-sm"
                />
                <p className="mt-1.5 text-[10px] text-slate-400">
                  Sophia t&apos;enverra un message basé sur cette instruction à l&apos;heure prévue.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Pourquoi cette initiative est importante ?
                </label>
                <textarea
                  value={rationale}
                  onChange={(event) => setRationale(event.target.value)}
                  placeholder="Ex: J'ai tendance à stresser le matin, cela m'aidera à rester serein."
                  rows={2}
                  className="w-full resize-none rounded-xl border-transparent bg-slate-50 px-4 py-3 text-xs font-medium text-slate-900 transition-all placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200 md:text-sm"
                />
                <p className="mt-1.5 text-[10px] text-slate-400">
                  Contexte utilisé par Sophia pour personnaliser son approche et son ton.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Clock className="h-3 w-3" />
                    Heure d&apos;envoi
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="w-full rounded-xl border-transparent bg-slate-50 px-4 py-3 text-center text-xs font-bold text-slate-900 transition-all focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200 md:text-sm"
                  />
                </div>

                <div className="flex flex-col justify-center">
                  <div className="mb-1 text-xs font-bold text-slate-500">Fréquence</div>
                  <div className="text-sm font-medium text-slate-900">
                    {selectedDays.length === 7
                      ? 'Tous les jours'
                      : selectedDays.length === 0
                        ? 'Aucun jour'
                        : `${selectedDays.length} jour${selectedDays.length > 1 ? 's' : ''} / semaine`}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Calendar className="h-3 w-3" />
                  Jours actifs
                </label>
                <div className="flex justify-between gap-1">
                  {DAYS.map((day) => {
                    const active = selectedDays.includes(day.key);
                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => toggleDay(day.key)}
                        className={clsx(
                          'flex flex-1 flex-col items-center gap-1 rounded-lg border py-1.5 text-[10px] font-bold transition-all sm:py-2 sm:text-xs',
                          active
                            ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        )}
                      >
                        <span>{day.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-50 bg-slate-50/50 p-4 pt-2 md:p-6">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-5 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting || !message.trim() || selectedDays.length === 0}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200 transition-all hover:bg-amber-600 hover:shadow-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Vérification...'
                  : initialValues
                    ? 'Modifier'
                    : (
                      <>
                        <Plus className="h-4 w-4" />
                        Créer l’initiative
                      </>
                    )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
