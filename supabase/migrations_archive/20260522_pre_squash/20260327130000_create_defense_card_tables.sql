-- G.1: Defense Card tables for impulse management system.

CREATE TABLE IF NOT EXISTS public.user_defense_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  transformation_id uuid NOT NULL REFERENCES public.user_transformations(id),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transformation_id)
);

ALTER TABLE public.user_defense_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own defense cards"
  ON public.user_defense_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS defense_cards_user_transformation_idx
  ON public.user_defense_cards (user_id, transformation_id);

CREATE TABLE IF NOT EXISTS public.user_defense_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defense_card_id uuid NOT NULL REFERENCES public.user_defense_cards(id),
  impulse_id text NOT NULL,
  trigger_id text,
  source text NOT NULL CHECK (source IN ('quick_log', 'conversation')),
  logged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_defense_wins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own defense wins"
  ON public.user_defense_wins FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_defense_cards card
      WHERE card.id = defense_card_id
        AND card.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own defense wins"
  ON public.user_defense_wins FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_defense_cards card
      WHERE card.id = defense_card_id
        AND card.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS defense_wins_card_idx
  ON public.user_defense_wins (defense_card_id, logged_at DESC);
