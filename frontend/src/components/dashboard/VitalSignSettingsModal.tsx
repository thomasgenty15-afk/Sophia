import { useEffect, useState, type ChangeEvent } from 'react';
import { X, Loader2, Save, Settings } from 'lucide-react';

type VitalSignSettingsPayload = {
  label: string;
  unit: string;
  startValue: string;
  targetValue: string;
  currentValue: string;
};

interface VitalSignSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: VitalSignSettingsPayload) => Promise<void>;
  initialValues: VitalSignSettingsPayload;
}

export const VitalSignSettingsModal = ({
  isOpen,
  onClose,
  onSave,
  initialValues,
}: VitalSignSettingsModalProps) => {
  const [form, setForm] = useState<VitalSignSettingsPayload>(initialValues);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(initialValues);
    setError(null);
  }, [isOpen, initialValues]);

  if (!isOpen) return null;

  const canSave =
    form.label.trim().length > 0 &&
    form.unit.trim().length > 0 &&
    form.startValue.trim().length > 0 &&
    form.targetValue.trim().length > 0 &&
    form.currentValue.trim().length > 0;

  const handleChange =
    (key: keyof VitalSignSettingsPayload) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const handleSubmit = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        label: form.label.trim(),
        unit: form.unit.trim(),
        startValue: form.startValue.trim(),
        targetValue: form.targetValue.trim(),
        currentValue: form.currentValue.trim(),
      });
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? 'Erreur de vérification.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-500 font-bold uppercase text-[10px] tracking-wider mb-1">
              <Settings className="w-3.5 h-3.5" />
              Parametres
            </div>
            <h3 className="text-lg font-bold text-slate-900">Modifier le Signe vital</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nom du signe vital</label>
            <input
              value={form.label}
              onChange={handleChange('label')}
              placeholder="Ex: Poids, Énergie, etc."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Unité</label>
            <input
              value={form.unit}
              onChange={handleChange('unit')}
              placeholder="Ex: kg, min, /10..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Départ</label>
              <input
                value={form.startValue}
                onChange={handleChange('startValue')}
                placeholder="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Cible</label>
              <input
                value={form.targetValue}
                onChange={handleChange('targetValue')}
                placeholder="10"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Actuel</label>
              <input
                value={form.currentValue}
                onChange={handleChange('currentValue')}
                placeholder="5"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors text-sm font-bold"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave || isSaving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Vérification...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};
