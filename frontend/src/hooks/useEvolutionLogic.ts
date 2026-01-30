import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SystemModule } from './useEvolutionData';
import { newRequestId, requestHeaders } from '../lib/requestId';

export const useEvolutionLogic = (user: any, coreIdentity: any, setCoreIdentity: (data: any) => void) => {
  const [selectedModule, setSelectedModule] = useState<SystemModule | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // AI State
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- 1. SELECTION MODULE ---
  const handleSelectModule = (module: SystemModule) => {
    if (module.status === 'locked') return; // Bloqué
    setSelectedModule(module);
    setEditContent(module.content || '');
    setIsEditing(false);
    setShowAiPrompt(false);
  };

  const handleCloseModule = () => {
    setSelectedModule(null);
    setIsEditing(false);
  };

  // --- 2. SAUVEGARDE (UPDATE) ---
  const handleSaveUpdate = async () => {
    if (!user || !selectedModule || !coreIdentity) return;
    setIsSaving(true);

    try {
        // 1. Déterminer où sauvegarder dans le JSON
        // On utilise la structure coreIdentity.modules.week_X.q_Y
        const weekId = selectedModule.id.split('_')[0].replace('w', ''); // w1 -> 1
        const qId = selectedModule.rowId; // 0, 1...

        // Clone profond pour éviter la mutation directe
        const newIdentity = JSON.parse(JSON.stringify(coreIdentity));
        
        // Init structure if missing
        if (!newIdentity.modules) newIdentity.modules = {};
        if (!newIdentity.modules[`week_${weekId}`]) newIdentity.modules[`week_${weekId}`] = {};
        
        // Update content
        newIdentity.modules[`week_${weekId}`][`q_${qId}`] = editContent;
        
        // Update DB
        const { error } = await supabase
            .from('core_identity')
            .update({ modules: newIdentity.modules, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);

        if (error) throw error;

        // Update Local State
        setCoreIdentity(newIdentity);
        
        // Update Module View (Optimistic)
        setSelectedModule({ ...selectedModule, content: editContent, lastUpdate: "À l'instant" });
        setIsEditing(false);

    } catch (err) {
        console.error("Erreur sauvegarde module:", err);
        alert("Erreur lors de la sauvegarde.");
    } finally {
        setIsSaving(false);
    }
  };

  // --- 3. APPEL IA (SOPHIA) ---
  const handleAskSophia = async () => {
    if (!aiPrompt.trim() || !selectedModule) return;
    setIsAiLoading(true);

    try {
        const clientRequestId = newRequestId();
        // On utilise l'Edge Function existante 'sophia-brain' ou 'update-core-identity'
        // Ici on veut juste une suggestion, pas une écriture directe
        
        const { data, error } = await supabase.functions.invoke('sophia-brain', {
            body: {
                mode: 'refine_module',
                context: {
                    moduleTitle: selectedModule.originalWeekTitle,
                    question: selectedModule.originalQuestion,
                    currentContent: editContent,
                    userPrompt: aiPrompt
                }
            },
            headers: requestHeaders(clientRequestId)
        });

        if (error) throw error;

        if (data?.suggestion) {
            setEditContent(data.suggestion);
            setShowAiPrompt(false);
            setAiPrompt('');
        }

    } catch (err) {
        console.error("Erreur IA:", err);
        alert("Sophia ne répond pas pour le moment.");
    } finally {
        setIsAiLoading(false);
    }
  };

  return {
    selectedModule,
    isEditing,
    setIsEditing,
    editContent,
    setEditContent,
    isSaving,
    handleSelectModule,
    handleCloseModule,
    handleSaveUpdate,
    // AI
    showAiPrompt,
    setShowAiPrompt,
    aiPrompt,
    setAiPrompt,
    isAiLoading,
    handleAskSophia
  };
};

