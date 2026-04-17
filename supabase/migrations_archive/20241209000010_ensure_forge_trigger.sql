-- Ensure the trigger is actually recreated with the updated function
-- Sometimes simply replacing the function isn't enough if the trigger definition itself was dropped or messed up.

DROP TRIGGER IF EXISTS on_forge_level_progression ON public.user_module_state_entries;

CREATE TRIGGER on_forge_level_progression
  AFTER INSERT OR UPDATE ON public.user_module_state_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_forge_level_progression();

