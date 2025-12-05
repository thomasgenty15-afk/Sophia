import React, { useEffect, useState } from 'react';
import { X, Calendar, Plus, ChevronDown, ChevronUp, Loader2, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface FrameworkHistoryModalProps {
  frameworkTitle: string;
  onClose: () => void;
}

interface FrameworkEntry {
  id: string;
  created_at: string;
  content: Record<string, any>;
  schema_snapshot?: any;
}

const FrameworkHistoryModal: React.FC<FrameworkHistoryModalProps> = ({ frameworkTitle, onClose }) => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<FrameworkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [frameworkTitle]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('user_framework_entries')
        .select('*')
        .eq('framework_title', frameworkTitle)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error fetching framework history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNew = () => {
    // Try to find a schema snapshot from previous entries
    const entryWithSchema = entries.find(e => e.schema_snapshot);
    
    if (entryWithSchema && entryWithSchema.schema_snapshot) {
      navigate('/framework-execution', {
        state: {
          action: {
            id: 'new_from_grimoire', // Temporary ID
            title: frameworkTitle,
            frameworkDetails: entryWithSchema.schema_snapshot
          }
        }
      });
    } else {
      // Fallback or error if no schema found
      // For now, we alert, but in a real app we might have a library of schemas
      alert("Impossible de lancer un nouveau framework : aucun modèle trouvé dans l'historique.");
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateStr));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-fade-in-up border border-slate-200">
        
        {/* HEADER */}
        <div className="bg-slate-50 p-4 md:p-6 border-b border-slate-100 flex justify-between items-start flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-violet-100 text-violet-700">
                <History className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Historique & Archives</span>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">{frameworkTitle}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-slate-500 mb-2">Aucune entrée trouvée pour cet outil.</p>
              <p className="text-xs text-slate-400">Lance une nouvelle session pour commencer à écrire ton histoire.</p>
            </div>
          ) : (
            entries.map(entry => (
              <div key={entry.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                <div 
                  onClick={() => toggleExpand(entry.id)}
                  className="p-4 flex items-center justify-between cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-slate-700 text-sm">{formatDate(entry.created_at)}</span>
                  </div>
                  {expandedId === entry.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
                
                {expandedId === entry.id && (
                  <div className="p-4 border-t border-slate-100 bg-white">
                    {entry.schema_snapshot && entry.schema_snapshot.sections ? (
                        <div className="space-y-6">
                             {entry.schema_snapshot.intro && (
                                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-indigo-800/80 italic text-sm mb-4 flex gap-3">
                                    <span className="text-2xl">💡</span>
                                    <div>{entry.schema_snapshot.intro}</div>
                                </div>
                             )}
                             {entry.schema_snapshot.sections.map((section: any) => {
                                 const val = entry.content[section.id];
                                 return (
                                     <div key={section.id} className="border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                                         <h5 className="text-sm font-bold text-slate-900 mb-2 block">{section.label}</h5>
                                         <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700 text-sm whitespace-pre-wrap shadow-sm">
                                             {val ? String(val) : <span className="text-slate-400 italic">Non répondu</span>}
                                         </div>
                                     </div>
                                 );
                             })}
                        </div>
                    ) : (
                        <div className="space-y-4">
                          {Object.entries(entry.content).map(([key, value]) => (
                            <div key={key}>
                               <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{key}</h5>
                               <p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                                 {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                               </p>
                            </div>
                          ))}
                        </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 bg-white border-t border-slate-100 flex-shrink-0">
          <button 
            onClick={handleStartNew}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-5 h-5" />
            Nouvelle Session
          </button>
        </div>

      </div>
    </div>
  );
};

export default FrameworkHistoryModal;

