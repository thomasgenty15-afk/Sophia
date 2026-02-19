import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  initialValues 
}) => {
  const [message, setMessage] = useState('');
  const [rationale, setRationale] = useState('');
  const [time, setTime] = useState('09:00');
  const [selectedDays, setSelectedDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);

  useEffect(() => {
    if (isOpen) {
      if (initialValues) {
        setMessage(initialValues.message || '');
        setRationale(initialValues.rationale || '');
        setTime(initialValues.time || '09:00');
        setSelectedDays(initialValues.days || ['mon', 'tue', 'wed', 'thu', 'fri']);
      } else {
        resetForm();
      }
    }
  }, [isOpen, initialValues]);

  const resetForm = () => {
    setMessage('');
    setRationale('');
    setTime('09:00');
    setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
  };

  const toggleDay = (key: string) => {
    setSelectedDays(prev => 
      prev.includes(key) 
        ? prev.filter(d => d !== key)
        : [...prev, key]
    );
  };

  const handleSubmit = async () => {
    if (!message.trim() || selectedDays.length === 0) return;
    await onSubmit({
      message,
      rationale: rationale.trim() || null,
      time,
      days: selectedDays
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
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <Bell className="w-5 h-5" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900">
                   {initialValues ? "Modifier le rappel" : "Nouveau rappel"}
                 </h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-300 hover:text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              
              {/* Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Que doit te rappeler Sophia ?
                </label>
                <textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ex: C'est l'heure de faire le point sur ta journée. Comment te sens-tu ?"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-medium text-slate-900 placeholder:text-slate-400 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Sophia t'enverra ce message (ou une variation) sur WhatsApp à l'heure prévue.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pourquoi ce rappel est important ?
                </label>
                <textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Ex: Le matin je perds vite le focus, ce rappel m'aide a rester aligne sur mon intention."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-medium text-slate-900 placeholder:text-slate-400 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Contexte utilise par Sophia pour personnaliser le ton et le contenu des messages.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> Heure d'envoi
                  </label>
                  <input 
                    type="time" 
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-bold text-slate-900 text-center"
                  />
                </div>

                {/* Days Summary */}
                <div className="flex flex-col justify-center">
                   <div className="text-xs font-bold text-slate-500 mb-1">Fréquence</div>
                   <div className="text-sm font-medium text-slate-900">
                     {selectedDays.length === 7 ? "Tous les jours" : 
                      selectedDays.length === 0 ? "Aucun jour" :
                      `${selectedDays.length} jour${selectedDays.length > 1 ? 's' : ''} / semaine`}
                   </div>
                </div>
              </div>

              {/* Day Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Jours actifs
                </label>
                <div className="flex justify-between gap-1">
                  {DAYS.map((d) => {
                    const active = selectedDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        onClick={() => toggleDay(d.key)}
                        className={clsx(
                          "flex-1 py-2 rounded-lg border text-xs font-bold transition-all flex flex-col items-center gap-1",
                          active
                            ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        <span>{d.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 pt-2 border-t border-slate-50 bg-slate-50/50 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !message.trim() || selectedDays.length === 0}
                className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-amber-200 hover:shadow-amber-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? 'Enregistrement...' : initialValues ? 'Modifier' : <><Plus className="w-4 h-4" /> Créer le rappel</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

