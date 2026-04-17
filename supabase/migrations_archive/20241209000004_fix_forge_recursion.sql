-- Correction du trigger Forge pour éviter la création en chaîne (m1 -> m2 -> m3...)
-- On ne débloque le niveau suivant QUE si le niveau actuel contient une vraie réponse.

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
  has_content boolean;
BEGIN
  -- Vérification : Est-ce que cette entrée contient une vraie réponse ?
  -- On vérifie si content n'est pas null et n'est pas un objet vide '{}'
  has_content := (NEW.content IS NOT NULL AND NEW.content != '{}'::jsonb);

  -- Si c'est juste un placeholder vide (créé par le système), ON ARRÊTE TOUT ICI.
  -- Cela empêche la boucle m1 crée m2, qui est vide, donc m2 crée m3...
  IF NOT has_content THEN
      RETURN NEW;
  END IF;

  -- Parsing de l'ID du module : format a{X}_c{Y}_m{Z}
  week_id := substring(NEW.module_id from 'a(\d+)_')::int;
  card_id := substring(NEW.module_id from '_c(\d+)_')::int;
  level_id := substring(NEW.module_id from '_m(\d+)')::int;

  -- Si le parsing a fonctionné et qu'on n'est pas au dernier niveau (5)
  IF week_id IS NOT NULL AND card_id IS NOT NULL AND level_id IS NOT NULL AND level_id < 5 THEN
      
      next_module_id := 'a' || week_id || '_c' || card_id || '_m' || (level_id + 1);

      -- On insère le verrouillage pour le niveau suivant
      INSERT INTO public.user_module_state_entries (
          user_id,
          module_id,
          status,
          available_at
      )
      VALUES (
          NEW.user_id,
          next_module_id,
          'available',
          now() + interval '4 days'
      )
      ON CONFLICT (user_id, module_id) 
      DO NOTHING; -- On ne fait rien si le niveau suivant existe déjà

  END IF;

  RETURN NEW;
END;
$$;

-- Nettoyage des données "fantômes" créées par le bug de récursion
-- On supprime les entrées m2, m3, m4, m5 qui sont VIDES (content = '{}')
DELETE FROM public.user_module_state_entries
WHERE module_id ~ '_m[2-5]$' -- Finissant par m2, m3, m4 ou m5
AND (content IS NULL OR content = '{}'::jsonb);

