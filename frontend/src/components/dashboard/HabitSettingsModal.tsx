import { useEffect, useMemo, useState } from 'react';
import { X, Settings, CalendarDays, Minus, Plus } from 'lucide-react';
import type { Action } from '../../types/dashboard';

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Jeu' },
  { key: 'fri', label: 'Ven' },
  { key: 'sat', label: 'Sam' },
  { key: 'sun', label: 'Dim' },
];

export function HabitSettingsModal(props: {
  isOpen: boolean;
  mode: 'activate' | 'edit';
  action: Action | null;
  onClose: () => void;
  onSave: (payload: { targetReps: number; scheduledDays: string[] | null; activateIfPending: boolean }) => Promise<void> | void;
}) {
  const { isOpen, mode, action, onClose, onSave } = props;
  const isHabit = String(action?.type ?? '').toLowerCase().trim() === 'habitude' || String(action?.type ?? '').toLowerCase().trim() === 'habit';
  const initialTarget = action?.targetReps ?? 1;
  const initialDays = (action?.scheduledDays ?? null) || [];

  const [targetReps, setTargetReps] = useState<number>(initialTarget);
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(initialDays.length > 0);
  const [selectedDays, setSelectedDays] = useState<string[]>(initialDays);
  const [saving, setSaving] = useState(false);

  const title = mode === 'activate' ? 'Activer l’habitude' : 'Réglages de l’habitude';

  const daySet = useMemo(() => new Set(selectedDays), [selectedDays]);
  const tooManyDays = scheduleEnabled && selectedDays.length > targetReps;

  // Sync internal state when opening or switching action.
  useEffect(() => {
    if (!action) return;
    const t = action.targetReps ?? 1;
    const days = (action.scheduledDays ?? null) || [];
    setTargetReps(t);
    setSelectedDays(days);
    setScheduleEnabled(days.length > 0);
  }, [action?.id, isOpen]);

  if (!isOpen || !action) return null;
  if (!isHabit) return null;

  const toggleDay = (k: string) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return DAYS.map(d => d.key).filter(x => next.has(x)); // stable ordering
    });
  };

  const dec = () => setTargetReps(v => Math.max(1, v - 1));
  const inc = () => setTargetReps(v => Math.min(6, v + 1));

  const handleSave = async () => {
    if (tooManyDays) return;
    setSaving(true);
    try {
      const scheduledDays = scheduleEnabled ? selectedDays : null;
      const activateIfPending = mode === 'activate' || action.status === 'pending';
      await onSave({ targetReps, scheduledDays, activateIfPending });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center">
              {mode === 'activate' ? <Settings className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">{title}</p>
              <p className="text-sm font-bold text-slate-900 truncate">{action.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Fréquence</p>
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={dec}
                className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
                disabled={targetReps <= 1 || saving}
                title="Diminuer"
              >
                <Minus className="w-4 h-4 text-slate-600" />
              </button>
              <div className="flex-1 text-center">
                <div className="text-2xl font-black text-emerald-700">{targetReps}</div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">fois / semaine</div>
              </div>
              <button
                onClick={inc}
                className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
                  disabled={targetReps >= 7 || saving}
                title="Augmenter"
              >
                <Plus className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Jours</p>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setScheduleEnabled(false)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  !scheduleEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                disabled={saving}
              >
                Au feeling
              </button>
              <button
                onClick={() => setScheduleEnabled(true)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  scheduleEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                disabled={saving}
              >
                Choisir des jours
              </button>
            </div>

            {scheduleEnabled && (
              <>
                <div className="grid grid-cols-7 gap-2">
                  {DAYS.map(d => {
                    const active = daySet.has(d.key);
                    return (
                      <button
                        key={d.key}
                        onClick={() => toggleDay(d.key)}
                        className={`py-2 rounded-lg text-[11px] font-bold border transition-colors ${
                          active ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                        disabled={saving}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Sélectionnés</span>
                  <span className={`font-bold ${tooManyDays ? 'text-rose-600' : 'text-slate-700'}`}>
                    {selectedDays.length} / {targetReps}
                  </span>
                </div>

                {tooManyDays && (
                  <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">
                    Tu as sélectionné plus de jours que ta fréquence. Retire un jour, ou augmente la fréquence.
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
              disabled={saving}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:bg-emerald-300"
              disabled={saving || tooManyDays}
            >
              {saving ? 'Enregistrement…' : mode === 'activate' ? 'Activer' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


