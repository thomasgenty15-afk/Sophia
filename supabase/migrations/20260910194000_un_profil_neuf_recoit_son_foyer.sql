-- ===========================================================================
-- LOT 1 · UN PROFIL NEUF REÇOIT SON FOYER
--
-- Plan: docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md, lot 1 —
-- « brancher la création de compte APRÈS disponibilité du profil ».
-- Amont: 20260910191000 (le corps sans garde).
--
-- ⛔ POURQUOI SUR `profiles` ET PAS SUR `auth.users`. Le provisionnement lit le
-- prénom et la date de naissance dans `profiles`. Branché sur `auth.users`, il
-- courrait contre `handle_new_user` et poserait « Me » à des comptes qui ont un
-- nom — une course dont le perdant est silencieux. Le dépôt a déjà la famille
-- de cicatrices « le lecteur a tourné avant l'écrivain ».
--
-- ⚠️ ET IL NE PEUT PAS FAIRE ÉCHOUER UNE INSCRIPTION. Un provisionnement qui
-- lève ferait perdre le compte lui-même. L'exception est donc capturée et
-- journalisée: le rattrapage de l'entrée du générateur reprendra le compte au
-- premier plan qu'il demande.
-- ===========================================================================

create or replace function public.on_profile_created_ensure_personal_household()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_res jsonb;
begin
  begin
    v_res := public.keel__ensure_personal_household(new.id);
    if not coalesce((v_res->>'ok')::boolean, false) then
      raise warning 'ensure_personal_household(%): %', new.id, coalesce(v_res->>'reason', 'inconnu');
    end if;
  exception when others then
    -- ⛔ ON N'ANNULE PAS L'INSCRIPTION POUR ÇA.
    raise warning 'ensure_personal_household(%) a levé: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

drop trigger if exists on_profile_created_ensure_personal_household on public.profiles;
create trigger on_profile_created_ensure_personal_household
  after insert on public.profiles
  for each row execute function public.on_profile_created_ensure_personal_household();

comment on function public.on_profile_created_ensure_personal_household() is
  'LOT 1 — pose le foyer personnel dès qu''un profil existe. Idempotent, et il '
  'ne peut pas faire échouer une inscription: l''exception est journalisée, et '
  'l''entrée du générateur rattrape le compte au premier plan demandé.';
