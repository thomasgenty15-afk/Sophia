import { useState } from 'react';
import { FileText, X, Sparkles, Loader2, Check } from 'lucide-react';
import type { Action } from '../../types/dashboard';

export const FrameworkModal = ({ 
  action, 
  onClose, 
  onSave 
}: { 
  action: Action, 
  onClose: () => void, 
  onSave: (action: Action, content: any) => Promise<void> 
}) => {
  const [content, setContent] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  // On parse les détails du framework (envoyés par l'IA)
  const details = (action as any).frameworkDetails || {
    intro: "Remplissez ce formulaire pour valider l'action.",
    sections: [
        { id: "default", label: "Notes", inputType: "textarea", placeholder: "Écrivez ici..." }
    ]
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        await onSave(action, content);
        onClose();
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la sauvegarde.");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in-up">
        
        {/* Header */}
        <div className="bg-violet-50 p-4 min-[720px]:p-6 border-b border-violet-100 flex justify-between items-start">
            <div>
                <div className="flex items-center gap-2 text-violet-600 font-bold uppercase text-[10px] min-[720px]:text-xs tracking-wider mb-2">
                    <FileText className="w-3 h-3 min-[720px]:w-4 min-[720px]:h-4" />
                    {details.type === 'recurring' ? 'Rituel Récurrent' : 'Exercice Unique'}
                </div>
                <h2 className="text-base min-[330px]:text-lg min-[720px]:text-2xl font-bold text-violet-900 leading-tight">{action.title}</h2>
            </div>
            <button onClick={onClose} className="text-violet-400 hover:text-violet-700 transition-colors p-1">
                <X className="w-5 h-5 min-[720px]:w-6 min-[720px]:h-6" />
            </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 min-[720px]:p-6 overflow-y-auto flex-1">
            {/* Intro / Inspiration */}
            {details.intro && (
                <div className="bg-white border border-slate-100 p-3 min-[720px]:p-4 rounded-xl mb-6 min-[720px]:mb-8 text-slate-600 italic leading-relaxed shadow-sm flex gap-3 text-xs min-[330px]:text-sm min-[720px]:text-base">
                    <Sparkles className="w-4 h-4 min-[720px]:w-5 min-[720px]:h-5 text-amber-400 flex-shrink-0 mt-1" />
                    <div>{details.intro}</div>
                </div>
            )}

            {/* Form Fields */}
            <div className="space-y-5 min-[720px]:space-y-6">
                {details.sections?.map((section: any) => (
                    <div key={section.id}>
                        <label className="block text-xs min-[330px]:text-sm font-bold text-slate-900 mb-2">
                            {section.label}
                        </label>
                        
                        {section.inputType === 'textarea' ? (
                            <textarea
                                value={content[section.id] || ''}
                                onChange={(e) => setContent({...content, [section.id]: e.target.value})}
                                placeholder={section.placeholder}
                                className="w-full p-3 min-[720px]:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[120px] text-slate-700 text-xs min-[330px]:text-sm min-[720px]:text-base resize-y"
                            />
                        ) : section.inputType === 'scale' ? (
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between text-[10px] min-[720px]:text-xs text-slate-400 font-bold uppercase">
                                    <span>Pas du tout (1)</span>
                                    <span>Extrêmement (10)</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="10" 
                                    value={content[section.id] || 5} 
                                    onChange={(e) => setContent({...content, [section.id]: e.target.value})}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                                />
                                <div className="text-center font-bold text-violet-600 text-lg">
                                    {content[section.id] || 5}/10
                                </div>
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={content[section.id] || ''}
                                onChange={(e) => setContent({...content, [section.id]: e.target.value})}
                                placeholder={section.placeholder}
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-slate-700 text-xs min-[330px]:text-sm min-[720px]:text-base"
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col-reverse min-[720px]:flex-row min-[720px]:justify-end gap-3">
            <button 
                onClick={onClose}
                className="w-full min-[720px]:w-auto px-4 py-3 min-[720px]:py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors text-xs min-[330px]:text-sm min-[720px]:text-base"
            >
                Annuler
            </button>
            <button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full min-[720px]:w-auto px-6 py-3 min-[720px]:py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg shadow-lg shadow-violet-200 flex items-center justify-center gap-2 disabled:opacity-70 text-xs min-[330px]:text-sm min-[720px]:text-base"
            >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Enregistrer la fiche
            </button>
        </div>

      </div>
    </div>
  );
};

