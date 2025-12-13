import { useState, useCallback, useEffect } from 'react';
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

  // Charger l'historique au montage
  useEffect(() => {
    async function loadHistory() {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false }) // On prend les plus RÉCENTS d'abord
        .limit(50); // Les 50 derniers

      if (error) {
        console.error("Error loading chat history:", error);
      } else if (data) {
        // On inverse le tableau pour remettre dans l'ordre chronologique (Vieux -> Récents)
        const history: Message[] = data.reverse().map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          agent: m.agent_used, 
          created_at: m.created_at
        }));
        setMessages(history);
      }
    }
    loadHistory();
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    try {
      setIsLoading(true);
      setError(null);

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

      // 2. Appel à la Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('sophia-brain', {
        body: { message: content, history: messages.slice(-10) } 
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
      
      // Petit hack : On recharge les messages récents après un court délai pour avoir les vrais ID DB
      // (Optionnel, mais plus propre pour la suppression future)
      setTimeout(async () => {
         const { data } = await supabase
            .from('chat_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(2);
         // On pourrait synchroniser ici, mais restons simple pour l'instant.
      }, 1000);

    } catch (err: any) {
      console.error('Chat Error:', err);
      setError(err.message || "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

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

  return { messages, sendMessage, deleteMessage, isLoading, error };
}
