import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { detectBrowserTimezone } from '../lib/localization';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

export function useChat(opts?: {
  scope?: string;
  channel?: 'web' | 'whatsapp';
  whatsappSim?: boolean;
  forceOnboardingFlow?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggeringSim, setIsTriggeringSim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = opts?.scope ?? "web";
  const channel = opts?.channel ?? "web";
  const whatsappSim = opts?.whatsappSim === true;
  const forceOnboardingFlow = opts?.forceOnboardingFlow === true;

  const loadHistory = useCallback(async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('scope', scope)
        .order('created_at', { ascending: false }) // On prend les plus RÉCENTS d'abord
        .limit(50); // Les 50 derniers

      if (error) {
        console.error("Error loading chat history:", error);
        return [];
      } else if (data) {
        // On inverse le tableau pour remettre dans l'ordre chronologique (Vieux -> Récents)
        const history: Message[] = data.reverse().map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          agent: m.agent_used, 
          created_at: m.created_at,
          metadata: m.metadata ?? null,
        }));
        setMessages(history);
        return history;
      }
      return [];
  }, [scope]);

  const waitForAssistantDelivery = useCallback(async (previousAssistantCount: number) => {
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const history = await loadHistory();
      const assistantCount = history.filter((message) => message.role === 'assistant').length;
      if (assistantCount > previousAssistantCount) return;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, [loadHistory]);

  // Charger l'historique au montage
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const sendMessage = useCallback(async (content: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const clientRequestId = newRequestId();

      // 1. Ajouter le message utilisateur localement (Optimistic UI)
      // Note : L'insertion réelle en DB est faite par la fonction sophia-brain via 'logMessage'
      // MAIS pour l'UX immédiate, on l'affiche tout de suite.
      const tempId = crypto.randomUUID();
      const userMsg: Message = {
        id: tempId,
        role: 'user',
        content,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMsg]);

      if (whatsappSim && channel === "whatsapp") {
        const previousAssistantCount = messages.filter((message) => message.role === 'assistant').length;
        const { error: fnError } = await supabase.functions.invoke('whatsapp-sim-inbound', {
          body: { text: content },
          headers: requestHeaders(clientRequestId)
        });
        if (fnError) throw fnError;
        await waitForAssistantDelivery(previousAssistantCount);
        return;
      }

      // 2. Appel à la Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('sophia-brain', {
        body: {
          message: content,
          history: messages.slice(-10),
          channel,
          scope,
          client_now_iso: new Date().toISOString(),
          client_timezone: detectBrowserTimezone(),
          client_request_id: clientRequestId,
          force_onboarding_flow: forceOnboardingFlow,
        },
        headers: requestHeaders(clientRequestId)
      });

      if (fnError) throw fnError;

      // 3. Ajouter la réponse de Sophia
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        agent: data.mode,
        created_at: new Date().toISOString(),
        metadata: data.metadata ?? null,
      };
      setMessages(prev => [...prev, botMsg]);
      
    } catch (err: unknown) {
      console.error('Chat Error:', err);
      setError(getErrorMessage(err, "Une erreur est survenue"));
    } finally {
      setIsLoading(false);
    }
  }, [messages, scope, channel, whatsappSim, forceOnboardingFlow, waitForAssistantDelivery]);

  const sendWhatsAppSimButton = useCallback(async (title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle || isLoading) return;
    try {
      setIsLoading(true);
      setError(null);
      const clientRequestId = newRequestId();
      const tempId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: tempId,
        role: 'user',
        content: cleanTitle,
        created_at: new Date().toISOString(),
        metadata: { simulated_whatsapp: true },
      }]);
      const previousAssistantCount = messages.filter((message) => message.role === 'assistant').length;
      const { error: fnError } = await supabase.functions.invoke('whatsapp-sim-inbound', {
        body: {
          text: cleanTitle,
          interactive_id: cleanTitle,
          interactive_title: cleanTitle,
        },
        headers: requestHeaders(clientRequestId),
      });
      if (fnError) throw fnError;
      await waitForAssistantDelivery(previousAssistantCount);
    } catch (err: unknown) {
      console.error('WhatsApp Sim Button Error:', err);
      setError(getErrorMessage(err, "Impossible d'envoyer la réponse WhatsApp simulée"));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, waitForAssistantDelivery]);

  const triggerWhatsAppSimEvent = useCallback(async (event: string) => {
    try {
      setIsTriggeringSim(true);
      setError(null);
      const clientRequestId = newRequestId();
      const { error: fnError } = await supabase.functions.invoke('whatsapp-sim-trigger', {
        body: { event },
        headers: requestHeaders(clientRequestId),
      });
      if (fnError) throw fnError;
      await loadHistory();
    } catch (err: unknown) {
      console.error('WhatsApp Sim Trigger Error:', err);
      setError(getErrorMessage(err, "Impossible de lancer l'événement WhatsApp simulé"));
    } finally {
      setIsTriggeringSim(false);
    }
  }, [loadHistory]);

  const deleteMessage = useCallback(async (id: string) => {
    try {
        // 1. Suppression optimiste
        setMessages(prev => prev.filter(m => m.id !== id));

        // 2. Suppression DB
        const { error } = await supabase
            .from('chat_messages')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Error deleting message:", error);
            // On pourrait remettre le message si erreur, mais bon, c'est du test.
        }
    } catch (e) {
        console.error("Delete Exception:", e);
    }
  }, []);

  return {
    messages,
    sendMessage,
    sendWhatsAppSimButton,
    deleteMessage,
    triggerWhatsAppSimEvent,
    refreshMessages: loadHistory,
    isLoading,
    isTriggeringSim,
    error,
  };
}
