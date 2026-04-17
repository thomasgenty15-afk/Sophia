import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MODULES_REGISTRY } from '../config/modules-registry';
import type { ModuleDefinition } from '../config/modules-registry';

export interface UserModuleState {
  id: string;
  module_id: string;
  status: 'available' | 'completed';
  available_at: string;
  completed_at: string | null;
  first_updated_at: string | null;
}

export interface EnrichedModule extends ModuleDefinition {
  state?: UserModuleState; // undefined = locked (pas encore de ligne en DB)
  isLocked: boolean;
  isAvailableNow: boolean; // True si available ET date passée
  timeRemaining?: number; // Ms avant déblocage
}

export const useModules = () => {
  const [modules, setModules] = useState<Record<string, EnrichedModule>>({});
  const [loading, setLoading] = useState(true);

  const fetchModules = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_week_states')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      // On fusionne la DB avec le Registry statique
      const enriched: Record<string, EnrichedModule> = {};
      const now = new Date().getTime();

      // On parcourt tout le registry pour avoir même ceux qui sont bloqués
      Object.values(MODULES_REGISTRY).forEach((def) => {
        const userState = data?.find((s) => s.module_id === def.id);
        
        let isLocked = true;
        let isAvailableNow = false;
        let timeRemaining = 0;

        if (userState) {
          isLocked = false; // Il existe en base, donc il est "révélé"
          const availableAt = new Date(userState.available_at).getTime();
          
          if (userState.status === 'completed') {
             isAvailableNow = false; // Déjà fini
          } else if (availableAt <= now) {
             isAvailableNow = true;
          } else {
             timeRemaining = availableAt - now;
          }
        }

        enriched[def.id] = {
          ...def,
          state: userState,
          isLocked,
          isAvailableNow,
          timeRemaining
        };
      });

      setModules(enriched);
    } catch (err) {
      console.error('Error fetching modules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const completeModule = async (moduleId: string) => {
    // Appel à l'Edge Function
    const { data: { session } } = await supabase.auth.getSession();
    
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-module`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ moduleId })
    });

    // On rafraichit l'état local
    await fetchModules();
  };

  return { modules, loading, completeModule };
};

