import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle2, HelpCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const FrameworkExecution = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { action, planId, submissionId } = location.state || {};

  const [responses, setResponses] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Protection si accès direct sans state
  if (!action || !action.frameworkDetails) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Oups, action introuvable</h2>
            <p className="text-slate-500 mb-6">Il semble qu'il manque des informations pour charger cet outil.</p>
            <button onClick={() => navigate(-1)} className="text-blue-600 font-bold hover:underline">Retour</button>
        </div>
    );
  }

  const details = action.frameworkDetails;
  const isOneShot = details.type === 'one_shot';

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
        // 1. Sauvegarder l'entrée dans user_framework_entries
        const { error } = await supabase.from('user_framework_entries').insert({
            user_id: user.id,
            action_id: action.id,
            framework_title: action.title,
            framework_type: details.type || 'unknown',
            content: responses,
            schema_snapshot: details,
            plan_id: planId,
            submission_id: submissionId,
            target_reps: action.targetReps || 1
        });

        if (error) throw error;

        // 2. Si One-Shot, on peut proposer de marquer l'action comme complétée dans le plan ?
        // (À gérer si on veut automatiser la complétion du plan)
        
        // Pour l'instant on retourne juste avec un feedback visuel
        navigate(-1); // Retour au dashboard

    } catch (err) {
        console.error("Erreur sauvegarde framework:", err);
        alert("Erreur lors de la sauvegarde.");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-3 min-[330px]:px-4 py-3 min-[720px]:py-4 flex items-center justify-between">
            <button 
                onClick={() => navigate(-1)}
                className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
            >
                <ArrowLeft className="w-5 h-5 min-[720px]:w-6 min-[720px]:h-6" />
            </button>
            <h1 className="text-sm min-[330px]:text-base min-[720px]:text-lg font-bold text-slate-900 truncate px-2 min-[330px]:px-4 text-center flex-1">
                {action.title}
            </h1>
            <div className="w-8 min-[720px]:w-10"></div> {/* Spacer */}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 min-[330px]:px-4 py-6 min-[720px]:py-8 space-y-6 min-[720px]:space-y-8">
        
        {/* INSTRUCTIONS / INTRO */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 min-[330px]:p-5 min-[720px]:p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 min-[720px]:p-6 opacity-5">
                <HelpCircle className="w-16 h-16 min-[330px]:w-20 min-[330px]:h-20 min-[720px]:w-24 min-[720px]:h-24 text-indigo-900" />
            </div>
            <div className="relative z-10">
                <h2 className="text-xs min-[330px]:text-sm font-bold text-indigo-900 uppercase tracking-wider mb-2 min-[330px]:mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                    Instructions & Inspiration
                </h2>
                <div className="prose prose-indigo prose-sm text-indigo-800 leading-relaxed whitespace-pre-wrap text-xs min-[330px]:text-sm min-[720px]:text-base">
                    {details.intro || action.description}
                </div>
            </div>
        </div>

        {/* FORMULAIRE */}
        <div className="space-y-4 min-[720px]:space-y-6">
            {details.sections && details.sections.map((section: any, index: number) => (
                <div key={section.id || index} className="bg-white rounded-2xl border border-slate-200 p-4 min-[330px]:p-5 shadow-sm">
                    <label className="block text-sm min-[720px]:text-base font-bold text-slate-900 mb-2 min-[330px]:mb-3">
                        {section.label}
                    </label>
                    
                    {section.inputType === 'textarea' ? (
                        <textarea
                            value={responses[section.id] || ''}
                            onChange={(e) => setResponses({...responses, [section.id]: e.target.value})}
                            placeholder={section.placeholder}
                            className="w-full p-3 min-[330px]:p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px] min-[330px]:min-h-[150px] text-slate-700 transition-all resize-y text-sm min-[330px]:text-base"
                        />
                    ) : section.inputType === 'scale' ? (
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 overflow-x-auto">
                            <div className="flex items-center justify-between gap-2 min-w-max">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                    <button
                                        key={num}
                                        onClick={() => setResponses({...responses, [section.id]: num})}
                                        className={`w-8 h-8 min-[330px]:w-10 min-[330px]:h-10 rounded-lg font-bold text-xs min-[330px]:text-sm transition-all flex items-center justify-center ${
                                            responses[section.id] === num 
                                            ? 'bg-indigo-600 text-white shadow-md scale-110' 
                                            : 'hover:bg-white text-slate-400'
                                        }`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <input
                            type="text"
                            value={responses[section.id] || ''}
                            onChange={(e) => setResponses({...responses, [section.id]: e.target.value})}
                            placeholder={section.placeholder}
                            className="w-full p-3 min-[330px]:p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 transition-all text-sm min-[330px]:text-base"
                        />
                    )}
                </div>
            ))}
        </div>

        {/* ACTION BAR */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
            <div className="max-w-3xl mx-auto">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full py-3 min-[330px]:py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed text-sm min-[330px]:text-base"
                >
                    {isSaving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            {isOneShot ? "Enregistrer et Terminer" : "Enregistrer l'entrée du jour"}
                        </>
                    )}
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};

export default FrameworkExecution;

