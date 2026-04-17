-- 1. NETTOYAGE (DROP TABLES IF EXIST)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.user_plans;
DROP TABLE IF EXISTS public.user_goals;
DROP TABLE IF EXISTS public.user_answers;
DROP TABLE IF EXISTS public.profiles;

-- 2. TABLE PROFILES (Infos publiques de base)
CREATE TABLE public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  full_name text,
  avatar_url text,
  -- Flag simple pour savoir si l'utilisateur a fini son premier onboarding complet (utile pour la redirection)
  onboarding_completed BOOLEAN DEFAULT FALSE
);

-- 3. TABLE USER_ANSWERS (Réponses aux questionnaires)
CREATE TABLE public.user_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Type de questionnaire ('onboarding', 'weekly_check', etc.)
    questionnaire_type TEXT DEFAULT 'onboarding',
    
    -- Le contenu JSON des réponses (ex: { "SLP_1": true, "details": {...} })
    content JSONB NOT NULL
);

-- 4. TABLE USER_GOALS (File d'attente des Axes Prioritaires)
CREATE TABLE public.user_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- L'axe choisi (ex: 'SLP_1')
    axis_id TEXT NOT NULL,
    axis_title TEXT NOT NULL,
    theme_id TEXT NOT NULL, -- 'Sommeil', 'Productivité'...
    
    -- Ordre de priorité défini par l'utilisateur (1, 2, 3...)
    priority_order INTEGER NOT NULL,
    
    -- État de cet axe
    status TEXT DEFAULT 'pending', -- 'pending' (en attente), 'active' (plan généré en cours), 'completed' (terminé)
    
    -- Lien optionnel vers les réponses sources
    source_answers_id UUID REFERENCES public.user_answers(id)
);

-- 5. TABLE USER_PLANS (Le Plan d'Action généré par l'IA)
CREATE TABLE public.user_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Lien vers l'objectif spécifique traité par ce plan
    goal_id UUID REFERENCES public.user_goals(id) ON DELETE CASCADE,
    
    -- Données Qualitatives (Ce que l'utilisateur a dit avant la génération)
    inputs_why TEXT,
    inputs_blockers TEXT,
    inputs_context TEXT,
    
    -- Le contenu du Plan (JSON généré par Gemini : phases, actions, identité...)
    content JSONB NOT NULL,
    
    -- Statut du plan
    status TEXT DEFAULT 'active', -- 'active', 'completed', 'archived'
    
    -- Métriques d'avancement
    current_phase INTEGER DEFAULT 1,
    progress_percentage INTEGER DEFAULT 0
);

-- 6. SÉCURITÉ (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

-- Politiques : Chaque utilisateur ne voit et ne modifie que ses propres données
CREATE POLICY "Users own profiles" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users own answers" ON public.user_answers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own goals" ON public.user_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own plans" ON public.user_plans FOR ALL USING (auth.uid() = user_id);

-- 7. TRIGGER NOUVEL UTILISATEUR (Création auto du profil)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

