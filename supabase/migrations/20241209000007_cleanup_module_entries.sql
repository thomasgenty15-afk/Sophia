-- Nettoyage de la table user_module_state_entries
-- 1. Suppression de la colonne first_updated_at (inutile)
-- 2. Mise en place d'un trigger pour marquer automatiquement comme 'completed'

-- 1. Suppression de la colonne inutile
ALTER TABLE public.user_module_state_entries 
DROP COLUMN IF EXISTS first_updated_at;

-- 2. Trigger pour auto-complétion
-- Dès qu'une réponse est insérée, elle est considérée comme complétée.
CREATE OR REPLACE FUNCTION public.auto_complete_module_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.status := 'completed';
    NEW.completed_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_module_entry_insert_completion ON public.user_module_state_entries;

CREATE TRIGGER on_module_entry_insert_completion
BEFORE INSERT OR UPDATE ON public.user_module_state_entries
FOR EACH ROW
EXECUTE FUNCTION public.auto_complete_module_entry();

