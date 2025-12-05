import { useState } from 'react';
import { X, Save, Loader2, Activity, Scale, Clock, Hash } from 'lucide-react';

interface VitalSignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
  vitalSign: {
    label: string;
    currentValue: string;
    targetValue: string;
    unit: string;
  };
}

export const VitalSignModal = ({ isOpen, onClose, onSave, vitalSign }: VitalSignModalProps) => {
  const [value, setValue] = useState(vitalSign.currentValue || '');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!value) return;
    setIsSaving(true);
    try {
        await onSave(value);
        onClose();
    } catch (error) {
        console.error(error);
    } finally {
        setIsSaving(false);
    }
  };

  // Détection du type d'input
  const getInputType = () => {
    // 0. SI LE TYPE EST EXPLICITE (Vient du backend/IA)
    if ((vitalSign as any).type) {
        const explicitType = (vitalSign as any).type;
        if (['time', 'duration', 'number', 'range', 'text'].includes(explicitType)) {
            return explicitType;
        }
    }

    // Fallback : Détection par mots-clés (si ancien plan ou IA a oublié)
    const unit = vitalSign.unit?.toLowerCase() || '';
    const label = vitalSign.label?.toLowerCase() || '';

    // 1. HEURE (Clock Time) : ex: "heure de coucher", "22h30"
    // On cherche explicitement les mots clés temporels d'horaire (pas de durée)
    if ((unit.includes('h') || unit.includes('heure')) && (label.includes('couch') || label.includes('lev') || label.includes('heure') || label.includes('moment'))) {
        return 'time'; 
    }

    // 2. DURÉE (Duration) : ex: "40 min", "temps de sport"
    if (unit.includes('min') || unit.includes('sec') || label.includes('durée') || label.includes('temps')) {
        return 'duration';
    }

    // 3. QUANTITATIF (Number) : ex: "kg", "cm", "%", "cigarettes"
    if (unit.includes('kg') || unit.includes('lbs') || unit.includes('cm') || unit.includes('%') || !isNaN(Number(vitalSign.targetValue))) {
        return 'number';
    }

    // 4. SCORE (Range) : ex: "/10", "humeur"
    if (label.includes('humeur') || label.includes('énergie') || label.includes('stress') || label.includes('/10') || unit.includes('/10')) {
        return 'range';
    }
    
    return 'text';
  };

  const inputType = getInputType();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-fade-in-up relative">
        
        {/* Header */}
        <div className="bg-blue-50 p-4 sm:p-6 border-b border-blue-100 flex justify-between items-start">
            <div>
                <div className="flex items-center gap-2 text-blue-600 font-bold uppercase text-[10px] sm:text-xs tracking-wider mb-2">
                    <Activity className="w-3 h-3 sm:w-4 sm:h-4" />
                    Mise à jour du Signe Vital
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-blue-900 leading-tight pr-4">{vitalSign.label}</h2>
            </div>
            <button onClick={onClose} className="hidden min-[264px]:block text-blue-400 hover:text-blue-700 transition-colors p-1">
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 flex flex-col gap-6 sm:gap-8 items-center justify-center">
            
            {/* Icon Visual based on input type */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                {inputType === 'number' ? <Scale className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" /> :
                 inputType === 'time' ? <Clock className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" /> :
                 inputType === 'duration' ? <Clock className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" /> :
                 inputType === 'range' ? <Activity className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" /> :
                 <Hash className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" />}
            </div>

            <div className="w-full">
                <label className="block text-center text-xs sm:text-sm text-slate-500 mb-4 uppercase tracking-wide font-bold">
                    Nouvelle valeur ({vitalSign.unit})
                </label>

                {inputType === 'range' ? (
                    <div className="px-2 sm:px-4">
                        <input 
                            type="range" 
                            min="1" 
                            max="10" 
                            value={value || 5} 
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="mt-4 text-center">
                            <span className="text-4xl sm:text-5xl font-bold text-blue-600">{value || 5}</span>
                            <span className="text-slate-400 text-lg sm:text-xl font-medium">/10</span>
                        </div>
                    </div>
                ) : inputType === 'time' ? (
                    <div className="flex justify-center">
                        <input
                            type="time"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full max-w-[200px] text-center text-4xl sm:text-5xl font-bold text-slate-800 border-b-2 border-blue-200 focus:border-blue-600 outline-none bg-transparent p-2"
                            autoFocus
                        />
                    </div>
                ) : inputType === 'duration' ? (
                    <div className="flex justify-center items-center gap-3">
                        <input
                            type="number"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="0"
                            className="w-32 sm:w-40 text-center text-4xl sm:text-5xl font-bold text-slate-800 border-b-2 border-blue-200 focus:border-blue-600 outline-none bg-transparent placeholder-slate-200 p-2 [&::-webkit-inner-spin-button]:appearance-none"
                            autoFocus
                        />
                        <span className="text-xl sm:text-2xl font-bold text-slate-400 mt-2">min</span>
                    </div>
                ) : inputType === 'number' ? (
                    <div className="flex justify-center relative">
                        <input
                            type="number"
                            step="0.1"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="0.0"
                            className="w-40 sm:w-48 text-center text-4xl sm:text-5xl font-bold text-slate-800 border-b-2 border-blue-200 focus:border-blue-600 outline-none bg-transparent placeholder-slate-200 p-2 [&::-webkit-inner-spin-button]:appearance-none"
                            autoFocus
                        />
                    </div>
                ) : (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Valeur..."
                        className="w-full p-4 text-center text-xl sm:text-2xl font-bold text-slate-800 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none"
                        autoFocus
                    />
                )}
            </div>

            {vitalSign.targetValue && (
                <p className="text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full text-center">
                    Objectif : {vitalSign.targetValue} {vitalSign.unit}
                </p>
            )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button 
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-3 sm:py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors text-sm sm:text-base"
            >
                Annuler
            </button>
            <button 
                onClick={handleSave}
                disabled={isSaving || !value}
                className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-sm sm:text-base"
            >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer
            </button>
        </div>

      </div>
    </div>
  );
};
