import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void; // Correspond à "Plus tard" ou fermeture
  onSubmit: (feedback: FeedbackData) => Promise<void>;
  modules: {
    system: boolean;
    sophia: boolean;
    architect: boolean;
  };
  isSubmitting?: boolean;
}

export interface FeedbackData {
  system?: { rating: number };
  sophia?: { rating: number };
  architect?: { rating: number };
}

const Slider = ({ value, onChange, label, subLabel, minLabel, maxLabel }: { value: number; onChange: (v: number) => void; label: string; subLabel?: string; minLabel: string; maxLabel: string }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start gap-4">
        <div>
           <label className="text-base font-bold text-slate-800 block">{label}</label>
           {subLabel && <p className="text-xs text-slate-400 mt-0.5 font-medium uppercase tracking-wider">{subLabel}</p>}
        </div>
        <span className={clsx(
          "text-2xl font-black w-10 text-right font-serif leading-none",
          value >= 8 ? "text-emerald-500" : value >= 5 ? "text-amber-500" : "text-rose-500"
        )}>{value}</span>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        step="1"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-colors"
      />
      <div className="flex justify-between text-[10px] font-bold text-slate-300 uppercase tracking-widest px-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
};

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit, modules, isSubmitting = false }) => {
  const [feedback, setFeedback] = useState<FeedbackData>({
    system: { rating: 8 },
    sophia: { rating: 8 },
    architect: { rating: 8 },
  });

  const updateFeedback = (section: keyof FeedbackData, field: 'rating', value: any) => {
    setFeedback(prev => ({
      ...prev,
      [section]: {
        ...prev[section]!,
        [field]: value
      }
    }));
  };

  const handleSubmit = async () => {
    const payload: FeedbackData = {};
    if (modules.system && feedback.system) payload.system = feedback.system;
    if (modules.sophia && feedback.sophia) payload.sophia = feedback.sophia;
    if (modules.architect && feedback.architect) payload.architect = feedback.architect;
    
    await onSubmit(payload);
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
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col"
          >
            {/* Header */}
            <div className="p-8 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-emerald-600">
                   <div className="p-1.5 bg-emerald-50 rounded-full"><Check className="w-4 h-4" /></div>
                   <span className="text-xs font-bold uppercase tracking-wider">Objectif Atteint</span>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-300 hover:text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">Comment s'est passée cette étape ?</h2>
            </div>

            {/* Content */}
            <div className="px-8 pb-8 space-y-8 flex-1 overflow-y-auto">
              
              {/* 1. System */}
              {modules.system && (
                <Slider
                  label="Ce plan d'action t'a-t-il été utile ?"
                  subLabel="Le Dashboard & Le Plan"
                  value={feedback.system!.rating}
                  onChange={(v) => updateFeedback('system', 'rating', v)}
                  minLabel="Pas du tout"
                  maxLabel="Énormément"
                />
              )}

              {/* 2. Sophia WhatsApp */}
              {modules.sophia && (
                <div className="pt-6 border-t border-slate-50">
                    <Slider
                    label="Sophia t'aide-t-elle sur WhatsApp ?"
                    subLabel="Le Coaching Quotidien"
                    value={feedback.sophia!.rating}
                    onChange={(v) => updateFeedback('sophia', 'rating', v)}
                    minLabel="Inutile"
                    maxLabel="Indispensable"
                    />
                </div>
              )}

              {/* 3. Architecte */}
              {modules.architect && (
                <div className="pt-6 border-t border-slate-50">
                    <Slider
                    label="Sens-tu un changement profond ?"
                    subLabel="Travail de Fond (Architecte)"
                    value={feedback.architect!.rating}
                    onChange={(v) => updateFeedback('architect', 'rating', v)}
                    minLabel="Bof"
                    maxLabel="Radicalement"
                    />
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-6 pt-0 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-slate-900 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold text-base shadow-lg shadow-slate-200 hover:shadow-emerald-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Envoi...' : 'Valider & Continuer'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
