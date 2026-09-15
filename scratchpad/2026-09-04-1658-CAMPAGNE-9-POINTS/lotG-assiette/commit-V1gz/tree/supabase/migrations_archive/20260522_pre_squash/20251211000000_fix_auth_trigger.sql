-- Fix missing trigger for user profile creation
-- This trigger is responsible for creating a public.profile record when a new user signs up via Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles for existing users who might have signed up while the trigger was missing
INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', ''), 
  COALESCE(raw_user_meta_data->>'avatar_url', '')
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

