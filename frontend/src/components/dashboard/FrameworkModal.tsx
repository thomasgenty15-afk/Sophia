import { useState } from 'react';
import { FileText, X, Sparkles, Loader2, Check, Plus, Trash2 } from 'lucide-react';
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
  const [tempInputs, setTempInputs] = useState<Record<string, any>>({});
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
                {details.sections?.map((section: any) => {
                    const inputType = (section.inputType || 'text').trim().toLowerCase();
                    
                    return (
                        <div key={section.id}>
                            <label className="block text-xs min-[330px]:text-sm font-bold text-slate-900 mb-2">
                                {section.label}
                            </label>
                            
                            {inputType === 'textarea' ? (
                                <textarea
                                    value={content[section.id] || ''}
                                    onChange={(e) => setContent({...content, [section.id]: e.target.value})}
                                    placeholder={section.placeholder}
                                    className="w-full p-3 min-[720px]:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[120px] text-slate-700 text-xs min-[330px]:text-sm min-[720px]:text-base resize-y"
                                />
                            ) : inputType === 'scale' ? (
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
                            ) : inputType === 'list' ? (
                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        {(content[section.id] || []).map((item: string, idx: number) => (
                                            <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 min-[330px]:p-3 rounded-xl border border-slate-200 group">
                                                <span className="flex-1 text-slate-700 text-xs min-[330px]:text-sm">{item}</span>
                                                <button 
                                                    onClick={() => {
                                                        const newList = [...(content[section.id] || [])];
                                                        newList.splice(idx, 1);
                                                        setContent({...content, [section.id]: newList});
                                                    }}
                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={tempInputs[section.id] || ''}
                                            onChange={(e) => setTempInputs({...tempInputs, [section.id]: e.target.value})}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const val = tempInputs[section.id]?.trim();
                                                    if (val) {
                                                        setContent({...content, [section.id]: [...(content[section.id] || []), val]});
                                                        setTempInputs({...tempInputs, [section.id]: ''});
                                                    }
                                                }
                                            }}
                                            placeholder={section.placeholder || "Ajouter un élément..."}
                                            className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-xs min-[330px]:text-sm"
                                        />
                                        <button
                                            onClick={() => {
                                                const val = tempInputs[section.id]?.trim();
                                                if (val) {
                                                    setContent({...content, [section.id]: [...(content[section.id] || []), val]});
                                                    setTempInputs({...tempInputs, [section.id]: ''});
                                                }
                                            }}
                                            className="p-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ) : inputType === 'categorized_list' ? (
                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        {(content[section.id] || []).map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 min-[330px]:p-3 rounded-xl border border-slate-200 group">
                                                <div className="flex-1 flex flex-col min-[330px]:flex-row min-[330px]:items-center gap-1 min-[330px]:gap-3">
                                                    <span className="font-medium text-slate-800 text-xs min-[330px]:text-sm">{item.text}</span>
                                                    {item.category && (
                                                        <span className="text-[10px] min-[330px]:text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded-full w-fit font-bold">
                                                            {item.category}
                                                        </span>
                                                    )}
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const newList = [...(content[section.id] || [])];
                                                        newList.splice(idx, 1);
                                                        setContent({...content, [section.id]: newList});
                                                    }}
                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                                        <div className="flex flex-col min-[330px]:flex-row gap-2">
                                            <input
                                                type="text"
                                                value={tempInputs[`${section.id}_text`] || ''}
                                                onChange={(e) => setTempInputs({...tempInputs, [`${section.id}_text`]: e.target.value})}
                                                placeholder={section.placeholder?.split('|')[0] || "Tâche..."}
                                                className="flex-[2] p-2 rounded-lg border border-slate-200 outline-none text-xs min-[330px]:text-sm focus:border-violet-500 bg-white"
                                            />
                                            <input
                                                type="text"
                                                value={tempInputs[`${section.id}_cat`] || ''}
                                                onChange={(e) => setTempInputs({...tempInputs, [`${section.id}_cat`]: e.target.value})}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const text = tempInputs[`${section.id}_text`]?.trim();
                                                        const cat = tempInputs[`${section.id}_cat`]?.trim();
                                                        if (text) {
                                                            setContent({...content, [section.id]: [...(content[section.id] || []), { text, category: cat }]});
                                                            setTempInputs({...tempInputs, [`${section.id}_text`]: '', [`${section.id}_cat`]: ''});
                                                        }
                                                    }
                                                }}
                                                placeholder={section.placeholder?.split('|')[1] || "Catégorie..."}
                                                className="flex-1 p-2 rounded-lg border border-slate-200 outline-none text-xs min-[330px]:text-sm focus:border-violet-500 bg-white"
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                const text = tempInputs[`${section.id}_text`]?.trim();
                                                const cat = tempInputs[`${section.id}_cat`]?.trim();
                                                if (text) {
                                                    setContent({...content, [section.id]: [...(content[section.id] || []), { text, category: cat }]});
                                                    setTempInputs({...tempInputs, [`${section.id}_text`]: '', [`${section.id}_cat`]: ''});
                                                }
                                            }}
                                            className="w-full py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-xs min-[330px]:text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" /> Ajouter à la liste
                                        </button>
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
                    );
                })}
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

