import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Sword, Shield, Zap, Repeat } from 'lucide-react';
import { clsx } from 'clsx';
import type { Action } from '../../types/dashboard';

interface CreateActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (actionData: Partial<Action>) => Promise<void>;
  isSubmitting?: boolean;
  initialValues?: Partial<Action>;
  mode?: 'create' | 'edit';
  lockToHabit?: boolean;
}

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Jeu' },
  { key: 'fri', label: 'Ven' },
  { key: 'sat', label: 'Sam' },
  { key: 'sun', label: 'Dim' },
];

const TIME_OPTIONS: Array<{ value: Action['timeOfDay']; label: string }> = [
  { value: 'any_time', label: 'N’importe quand' },
  { value: 'morning', label: 'Matin' },
  { value: 'afternoon', label: 'Après-midi' },
  { value: 'evening', label: 'Soir' },
  { value: 'night', label: 'Nuit' },
];

export const CreateActionModal: React.FC<CreateActionModalProps> = ({ isOpen, onClose, onSubmit, isSubmitting = false, initialValues, mode = 'create', lockToHabit = false }) => {
  const [type, setType] = useState<'mission' | 'habit'>('mission');
  const [questType, setQuestType] = useState<'main' | 'side'>('side');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetReps, setTargetReps] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState<Action['timeOfDay']>('any_time');
  const [scheduledDays, setScheduledDays] = useState<string[]>([]);
  const [rationale, setRationale] = useState('');
  const [tips, setTips] = useState('');

  // Reset or initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
        if (initialValues) {
            const t = String(initialValues.type || '').toLowerCase().trim();
            const nextType = (t === 'habitude' || t === 'habit') ? 'habit' : 'mission';
            setType(lockToHabit ? 'habit' : nextType);
            setQuestType(initialValues.questType || 'side');
            setTitle(initialValues.title || '');
            setDescription(initialValues.description || '');
            setTargetReps(initialValues.targetReps || 1);
            setTimeOfDay(initialValues.timeOfDay || 'any_time');
            setScheduledDays((initialValues.scheduledDays || []).filter(Boolean));
            setRationale(initialValues.rationale || '');
            setTips(initialValues.tips || '');
        } else {
            resetForm();
        }
    }
  }, [isOpen, initialValues, lockToHabit]);

  const resetForm = () => {
    setType(lockToHabit ? 'habit' : 'mission');
    setQuestType('side');
    setTitle('');
    setDescription('');
    setTargetReps(1);
    setTimeOfDay('any_time');
    setScheduledDays([]);
    setRationale('');
    setTips('');
  };

  useEffect(() => {
    if (lockToHabit && type !== 'habit') setType('habit');
  }, [lockToHabit, type]);

  const toggleDay = (key: string) => {
    const prev = scheduledDays;
    let next: string[];

    if (prev.includes(key)) {
      next = prev.filter((d) => d !== key);
    } else {
      next = [...prev, key];
    }

    const sortedNext = DAYS.map((d) => d.key).filter((d) => next.includes(d));
    
    setScheduledDays(sortedNext);
    
    // Auto-update targetReps to match selected days count
    if (sortedNext.length > 0) {
      setTargetReps(sortedNext.length);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;

    const newAction: Partial<Action> = {
      type: type === 'habit' ? 'habitude' : 'mission',
      title,
      description,
      questType,
      targetReps: type === 'habit' ? targetReps : undefined,
      timeOfDay: type === 'habit' ? (timeOfDay || 'any_time') : undefined,
      scheduledDays: type === 'habit' ? (scheduledDays.length > 0 ? scheduledDays : null) : undefined,
      rationale: rationale || undefined,
      tips: tips || undefined,
      status: 'pending', // Default status
      isCompleted: false,
      currentReps: 0,
    };

    await onSubmit(newAction);
    resetForm();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Plus className="w-5 h-5" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900">{mode === 'edit' ? "Modifier l'action" : "Créer une action"}</h2>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-300 hover:text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              
              {/* Type Selection */}
              {!lockToHabit && (
              <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => setType('mission')}
                    className={clsx(
                        "p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-2",
                        type === 'mission' ? "border-amber-500 bg-amber-50/50" : "border-slate-100 hover:border-slate-200"
                    )}
                >
                    <div className={clsx("p-1.5 rounded-lg w-fit", type === 'mission' ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400")}>
                        <Zap className="w-4 h-4" />
                    </div>
                    <div>
                        <div className={clsx("font-bold text-sm", type === 'mission' ? "text-amber-900" : "text-slate-600")}>Mission</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">Action unique à valider</div>
                    </div>
                </button>

                <button
                    onClick={() => setType('habit')}
                    className={clsx(
                        "p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-2",
                        type === 'habit' ? "border-emerald-600 bg-emerald-50/50" : "border-slate-100 hover:border-slate-200"
                    )}
                >
                    <div className={clsx("p-1.5 rounded-lg w-fit", type === 'habit' ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400")}>
                        <Repeat className="w-4 h-4" />
                    </div>
                    <div>
                        <div className={clsx("font-bold text-sm", type === 'habit' ? "text-emerald-900" : "text-slate-600")}>Habitude</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">À répéter plusieurs fois</div>
                    </div>
                </button>
              </div>
              )}

              {/* Quest Type */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Importance</label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setQuestType('main')}
                        className={clsx(
                            "flex-1 py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                            questType === 'main' ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        )}
                    >
                        <Sword className="w-3 h-3" />
                        Quête Principale
                    </button>
                    <button
                        onClick={() => setQuestType('side')}
                        className={clsx(
                            "flex-1 py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                            questType === 'side' ? "bg-white text-slate-600 border-slate-300 shadow-sm" : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                        )}
                    >
                        <Shield className="w-3 h-3" />
                        Quête Secondaire
                    </button>
                </div>
              </div>

              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Titre de l'action</label>
                    <input 
                        type="text" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Lire 10 pages..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-medium text-slate-900 placeholder:text-slate-400"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Description</label>
                    <textarea 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Détails de l'action..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-medium text-slate-900 placeholder:text-slate-400 resize-none"
                    />
                </div>
              </div>

              {/* Habit Specifics */}
              {type === 'habit' && (
                <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
                    <label className="block text-xs font-bold text-emerald-800 mb-2">Objectif Hebdomadaire</label>
                    <div className="flex items-center gap-4">
                        <input 
                            type="range" 
                            min="1" 
                            max="7" 
                            value={targetReps} 
                            onChange={(e) => setTargetReps(parseInt(e.target.value))}
                            className="flex-1 h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                        <div className="w-12 h-12 bg-white rounded-xl border border-emerald-200 flex items-center justify-center text-xl font-bold text-emerald-600 shadow-sm">
                            {targetReps}
                        </div>
                    </div>
                    <p className="text-[10px] text-emerald-600/70 mt-2 font-medium">
                        Cette action devra être réalisée {targetReps} fois par semaine.
                    </p>

                    <div className="mt-4">
                      <label className="block text-xs font-bold text-emerald-800 mb-2">Moment conseillé</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {TIME_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setTimeOfDay(opt.value || 'any_time')}
                            className={clsx(
                              "px-3 py-2 rounded-lg border text-xs font-bold transition-all",
                              timeOfDay === opt.value
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-bold text-emerald-800 mb-2">Jours (optionnel)</label>
                      <div className="grid grid-cols-7 gap-1.5">
                        {DAYS.map((d) => {
                          const active = scheduledDays.includes(d.key);
                          return (
                            <button
                              key={d.key}
                              onClick={() => toggleDay(d.key)}
                              className={clsx(
                                "py-1.5 rounded-md border text-[10px] font-bold transition-colors",
                                active
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              )}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                </div>
              )}

              {/* Optional Details */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                 <button 
                    onClick={() => setRationale(r => r ? r : ' ')} // Just to expand if empty, logic can be better
                    className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                 >
                    <Plus className="w-3 h-3" /> Ajouter une justification (Pourquoi ?)
                 </button>
                 {rationale !== '' && (
                    <textarea 
                        value={rationale}
                        onChange={(e) => setRationale(e.target.value)}
                        placeholder="Pourquoi cette action est importante..."
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-sm text-slate-900 placeholder:text-slate-400 resize-none"
                    />
                 )}

                 <button 
                    onClick={() => setTips(t => t ? t : ' ')}
                    className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                 >
                    <Plus className="w-3 h-3" /> Ajouter des conseils
                 </button>
                 {tips !== '' && (
                    <textarea 
                        value={tips}
                        onChange={(e) => setTips(e.target.value)}
                        placeholder="Astuces pour réussir..."
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-sm text-slate-900 placeholder:text-slate-400 resize-none"
                    />
                 )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 pt-2 border-t border-slate-50 bg-slate-50/50 flex justify-end gap-3 sticky bottom-0">
              <button
                onClick={handleClose}
                className="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim() || !description.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? 'Enregistrement...' : mode === 'edit' ? 'Enregistrer' : <><Plus className="w-4 h-4" /> Créer l'action</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
