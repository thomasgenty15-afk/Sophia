-- paul-r8 B01 / eva-r8 B03 / rose-r3 B01 (won't-fix reouvert le 2026-07-07):
-- la cascade legitime de progression (3e rep d'une habitude → transition
-- in_maintenance → deblocage d'un principe) etait rejetee par
-- guard_unlocked_principles_update quand l'ecriture venait du chat: le guard
-- lit auth.role() (claim JWT de la CONNEXION, 'authenticated' pour
-- sophia-brain), qui ne change pas a l'interieur des fonctions SECURITY
-- DEFINER de la cascade. Resultat: entry committee mais compteur/statut/
-- principe jamais mis a jour, echec avale.
--
-- Fix: la SEULE porte legitime d'ecriture des principes,
-- unlock_transformation_principle (deja SECURITY DEFINER + whitelist des
-- principes + verification d'ownership), pose un marqueur de cascade
-- transactionnel (GUC local) le temps de son UPDATE; le guard reconnait ce
-- marqueur. Une modification directe de unlocked_principles (client, SQL
-- applicatif, RPC hors fonction) ne porte jamais le marqueur et reste
-- bloquee — la garde devient discriminante, pas plus faible.

create or replace function public.unlock_transformation_principle(
  p_user_id uuid,
  p_transformation_id uuid,
  p_principle text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_user_id is null or p_transformation_id is null then
    return;
  end if;

  if p_principle not in ('kaizen', 'ikigai', 'hara_hachi_bu', 'wabi_sabi', 'gambaru') then
    return;
  end if;

  -- Marqueur de cascade: portee transaction (is_local=true), arme uniquement
  -- pendant l'UPDATE ci-dessous puis immediatement retire.
  perform set_config('sophia.allow_principle_unlock', '1', true);

  update public.user_transformations
  set unlocked_principles =
        coalesce(unlocked_principles, '{"kaizen": true}'::jsonb) ||
        jsonb_build_object(p_principle, true),
      updated_at = now()
  where id = p_transformation_id
    and exists (
      select 1 from public.user_cycles c
      where c.id = user_transformations.cycle_id
        and c.user_id = p_user_id
    )
    and coalesce((unlocked_principles ->> p_principle)::boolean, false) is distinct from true;

  perform set_config('sophia.allow_principle_unlock', '0', true);
end;
$function$;

create or replace function public.guard_unlocked_principles_update()
returns trigger
language plpgsql
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Cascade legitime: l'ecriture passe par unlock_transformation_principle
  -- (seule fonction a poser ce marqueur, elle-meme whitelistee et ownership-
  -- checked). Tout autre chemin reste bloque.
  if coalesce(current_setting('sophia.allow_principle_unlock', true), '') = '1' then
    return new;
  end if;

  if old.unlocked_principles is distinct from new.unlocked_principles then
    raise exception 'Direct modification of unlocked_principles is not allowed'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
