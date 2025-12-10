-- Fonction utilitaire pour mettre à jour le timestamp updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Création des types pour les modes et les rôles
CREATE TYPE chat_agent_mode AS ENUM (
  'dispatcher',   -- Le Chef de Gare (interne)
  'sentry',       -- Le Guetteur (Sécurité)
  'firefighter',  -- Le Pompier (Urgence)
  'investigator', -- L'Enquêteur / Le Comptable (Data)
  'architect',    -- L'Architecte (Deep Work)
  'companion',    -- Le Compagnon (Défaut)
  'philosopher',  -- Le Philosophe
  'assistant'     -- L'Assistant Technique
);

CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');

-- Table pour stocker l'état PERSISTANT de l'utilisateur (La Mémoire Vive du Chef de Gare)
CREATE TABLE public.user_chat_states (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- État courant
    current_mode chat_agent_mode NOT NULL DEFAULT 'companion',
    risk_level INTEGER DEFAULT 0 CHECK (risk_level BETWEEN 0 AND 10), -- 0 = Zen, 10 = Danger Vital
    
    -- Le Contexte "Marionnettiste" (Pour l'Enquêteur)
    -- Stocke : { step_index: 0, answers: {...}, target_data: [...] }
    investigation_state JSONB DEFAULT NULL, 
    
    -- Mémoire court terme partagée (Résumé des 10 derniers messages)
    short_term_context TEXT,
    
    last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des messages
CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    role chat_role NOT NULL,
    content TEXT NOT NULL,
    
    -- Quel agent a généré ce message ?
    agent_used chat_agent_mode,
    
    -- Métadonnées (Tokens, Latence, ou contexte spécifique au moment du message)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour charger l'historique rapidement
CREATE INDEX idx_chat_messages_user_created ON public.chat_messages(user_id, created_at DESC);

-- Trigger pour mettre à jour updated_at
CREATE TRIGGER update_user_chat_states_modtime
    BEFORE UPDATE ON public.user_chat_states
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- RLS (Security)
ALTER TABLE public.user_chat_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat state" 
    ON public.user_chat_states FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat state" 
    ON public.user_chat_states FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat state" 
    ON public.user_chat_states FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own messages" 
    ON public.chat_messages FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages" 
    ON public.chat_messages FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
