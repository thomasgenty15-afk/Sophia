-- Ajout des colonnes pour stocker le contexte de "Refonte" (Recraft) d'un plan
alter table public.user_plans 
add column if not exists recraft_reason text, -- Pourquoi l'utilisateur a voulu changer (inputs.why du recraft)
add column if not exists recraft_challenges text; -- Nouveaux blocages (inputs.blockers du recraft)

