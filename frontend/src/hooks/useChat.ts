import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  created_at: string;
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Ajouter le message utilisateur localement (Optimistic UI)
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMsg]);

      // 2. Appel à la Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('sophia-brain', {
        body: { message: content, history: messages.slice(-10) } // On envoie les 10 derniers
      });

      if (fnError) throw fnError;

      // 3. Ajouter la réponse de Sophia
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        agent: data.mode,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, botMsg]);

    } catch (err: any) {
      console.error('Chat Error:', err);
      setError(err.message || "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  return { messages, sendMessage, isLoading, error };
}

