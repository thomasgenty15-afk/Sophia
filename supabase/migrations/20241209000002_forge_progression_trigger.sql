-- Trigger pour gérer la progression INTERNE de la Forge (Niveaux 1 à 5)
-- Logique : Quand on update/insert une réponse pour un niveau (mX), on programme le niveau suivant (mX+1) dans 4 jours.

CREATE OR REPLACE FUNCTION public.handle_forge_level_progression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_id int;
  card_id int;
  level_id int;
  next_module_id text;
BEGIN
  -- Parsing de l'ID du module : format a{X}_c{Y}_m{Z}
  -- Exemple : a1_c1_m1
  
  -- Extraction via Regex
  week_id := substring(NEW.module_id from 'a(\d+)_')::int;
  card_id := substring(NEW.module_id from '_c(\d+)_')::int;
  level_id := substring(NEW.module_id from '_m(\d+)')::int;

  -- Si le parsing a fonctionné et qu'on n'est pas au dernier niveau (5)
  IF week_id IS NOT NULL AND card_id IS NOT NULL AND level_id IS NOT NULL AND level_id < 5 THEN
      
      next_module_id := 'a' || week_id || '_c' || card_id || '_m' || (level_id + 1);

      -- On insère le verrouillage pour le niveau suivant
      -- Le niveau suivant sera 'available' (visible) mais avec une date dans le futur (4 jours)
      INSERT INTO public.user_module_state_entries (
          user_id,
          module_id,
          status,
          available_at
      )
      VALUES (
          NEW.user_id,
          next_module_id,
          'available', -- Il est "disponible" dans le sens "planifié", le front gérera le cadenas
          now() + interval '4 days'
      )
      ON CONFLICT (user_id, module_id) 
      DO UPDATE SET
        -- Si on met à jour une réponse existante, est-ce qu'on repousse le délai ?
        -- Pour l'instant NON, on garde la date d'ouverture initiale pour ne pas pénaliser l'utilisateur qui édite.
        updated_at = now()
      WHERE user_module_state_entries.status != 'completed'; -- On ne touche pas si c'est déjà fini

  END IF;

  RETURN NEW;
END;
$$;

-- Création du trigger sur la table des RÉPONSES (entries)
DROP TRIGGER IF EXISTS on_forge_level_progression ON public.user_module_state_entries;

CREATE TRIGGER on_forge_level_progression
  AFTER INSERT OR UPDATE ON public.user_module_state_entries
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_forge_level_progression();
