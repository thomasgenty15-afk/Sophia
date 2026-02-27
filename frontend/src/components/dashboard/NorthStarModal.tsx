import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { NorthStar, NorthStarMetricType } from '../../types/dashboard';

type NorthStarSuggestion = {
  title: string;
  metric_type: NorthStarMetricType;
  unit: string;
};

type FormState = {
  title: string;
  metric_type: NorthStarMetricType;
  unit: string;
  start_value: string;
  target_value: string;
  current_value: string;
};

const emptyForm: FormState = {
  title: '',
  metric_type: 'number',
  unit: '',
  start_value: '',
  target_value: '',
  current_value: '',
};

export function NorthStarModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => Promise<void>;
  onSubmit: (payload: {
    title: string;
    metric_type: NorthStarMetricType;
    unit: string;
    start_value: number;
    target_value: number;
    current_value: number;
  }) => Promise<void>;
  existingNorthStar?: NorthStar | null;
  suggestions: NorthStarSuggestion[];
  isGenerating: boolean;
  isSaving: boolean;
}) {
  const { isOpen, onClose, onGenerate, onSubmit, existingNorthStar, suggestions, isGenerating, isSaving } = props;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (existingNorthStar) {
      setForm({
        title: existingNorthStar.title,
        metric_type: existingNorthStar.metric_type,
        unit: existingNorthStar.unit || '',
        start_value: String(existingNorthStar.start_value),
        target_value: String(existingNorthStar.target_value),
        current_value: String(existingNorthStar.current_value),
      });
    } else {
      setForm(emptyForm);
    }
    setError(null);
  }, [isOpen, existingNorthStar]);

  if (!isOpen) return null;

  const applySuggestion = (s: NorthStarSuggestion) => {
    setForm((prev) => ({
      ...prev,
      title: s.title,
      metric_type: s.metric_type,
      unit: s.unit,
    }));
  };

  const submit = async () => {
    setError(null);
    const title = form.title.trim();
    const startValue = Number(form.start_value);
    const targetValue = Number(form.target_value);
    const currentValue = Number(form.current_value);

    if (!title) {
      setError('Le titre est obligatoire.');
      return;
    }
    if (!Number.isFinite(startValue) || !Number.isFinite(targetValue) || !Number.isFinite(currentValue)) {
      setError('Les valeurs doivent être numériques.');
      return;
    }
    if (form.metric_type === 'scale_10') {
      const vals = [startValue, targetValue, currentValue];
      const withinRange = vals.every((v) => v >= 0 && v <= 10);
      if (!withinRange) {
        setError('Pour une échelle /10, les valeurs doivent être entre 0 et 10.');
        return;
      }
    }

    try {
      await onSubmit({
        title,
        metric_type: form.metric_type,
        unit: form.unit.trim(),
        start_value: startValue,
        target_value: targetValue,
        current_value: currentValue,
      });
    } catch (e: any) {
      setError(String(e?.message ?? "Contenu bloqué par la vérification éthique."));
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">
            {existingNorthStar ? "Modifier l'étoile polaire" : "Créer mon étoile polaire"}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-violet-900">Suggestion IA (à la demande)</p>
                <p className="text-xs text-violet-700">Clique seulement si tu veux des idées de Sophia.</p>
              </div>
              <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="shrink-0 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-60 flex items-center gap-2"
              >
                <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                Générer avec Sophia
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-3 grid gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.title}-${i}`}
                    onClick={() => applySuggestion(s)}
                    className="text-left bg-white border border-violet-100 hover:border-violet-300 rounded-lg p-3 transition-colors"
                  >
                    <p className="text-sm font-bold text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500">
                      Type: {s.metric_type} {s.unit ? `• Unité: ${s.unit}` : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Titre</label>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Ex: Poids corporel"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Type de métrique</label>
                <select
                  value={form.metric_type}
                  onChange={(e) => setForm((p) => ({ ...p, metric_type: e.target.value as NorthStarMetricType }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                >
                  <option value="number">Nombre (Ex: poids, km)</option>
                  <option value="scale_10">Échelle sur 10 (Ex: énergie, moral)</option>
                  <option value="counter">Compteur (Ex: crises, jours)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Unité</label>
                <input
                  value={form.unit}
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="kg, /10, crises..."
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Valeur de départ</label>
                <input
                  value={form.start_value}
                  onChange={(e) => setForm((p) => ({ ...p, start_value: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Valeur cible</label>
                <input
                  value={form.target_value}
                  onChange={(e) => setForm((p) => ({ ...p, target_value: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Valeur actuelle</label>
                <input
                  value={form.current_value}
                  onChange={(e) => setForm((p) => ({ ...p, current_value: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-60"
            >
              {isSaving ? 'Vérification...' : existingNorthStar ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
