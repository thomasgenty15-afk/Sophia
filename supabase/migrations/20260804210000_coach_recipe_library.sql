-- ============================================================================
-- LA BIBLIOTHÈQUE DE RECETTES DU COACH — globale, comme la doctrine
--
-- CE QUI CLOCHAIT, ET C'EST LE PIVOT LUI-MÊME
-- -------------------------------------------
-- KEEL est 1:N: le coach écrit UN programme et UNE doctrine, et c'est l'élève
-- qui compose sa semaine (PLAN-NUIT, amendement 2). Or `meal_plan_entries`
-- plaçait une recette sur un JOUR et un CRÉNEAU pour UN élève nommé — c'est-à-
-- dire la planification 1:1 que le modèle ne porte pas. Un coach de quarante
-- élèves ne compose pas quarante semaines.
--
-- Pire: la policy de lecture de l'élève EXIGEAIT ce placement —
--
--     status = 'active' AND EXISTS (
--       select 1 from meal_plan_entries e
--        where e.meal_idea_id = meal_ideas.id and e.student_id = auth.uid())
--
-- — donc une recette écrite par le coach n'était visible par PERSONNE tant
-- qu'elle n'était pas épinglée sur la semaine de quelqu'un. La bibliothèque
-- était structurellement invisible, et l'écran élève affichait « votre coach n'a
-- pas encore proposé d'idées » y compris pour un coach qui en avait écrit vingt.
--
-- CE QUE FAIT CETTE MIGRATION
-- ---------------------------
--  1. la recette porte une PHOTO (`image_path`);
--  2. l'élève lit les recettes actives de SON coach, sans placement;
--  3. `meal_ideas.student_id` disparaît — une recette n'appartient plus à un
--     élève;
--  4. `meal_plan_entries` disparaît.
--
-- POURQUOI SUPPRIMER PLUTÔT QUE LAISSER DORMIR. Deux modèles vivants
-- garantissent que quelqu'un recodera un jour sur le mauvais, et la table morte
-- resterait citée par la policy ci-dessus. L'audit d'appelants a été fait
-- commentaires RETIRÉS (les en-têtes citent les modules par leur nom, un grep
-- naïf rend de faux vivants): aucune vue, aucune fonction SQL, aucune FK
-- entrante, et une seule policy — celle qu'on réécrit ici.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LA PHOTO
--
-- Un CHEMIN de stockage, pas une URL: le bucket est privé et la lecture passe
-- par une URL signée émise à la demande. Stocker une URL signée en base la
-- ferait expirer dans la colonne, et stocker une URL publique supposerait un
-- bucket public — que ce dépôt n'a pas (arbitrage W1: aucune policy sur
-- `storage.objects`, tout accès fichier passe par une fonction en service_role).
-- ----------------------------------------------------------------------------

alter table public.meal_ideas
  add column if not exists image_path text;

comment on column public.meal_ideas.image_path is
  'Chemin dans le bucket privé `recipe-images`, ou NULL. JAMAIS une URL: le '
  'bucket est privé et la lecture se fait par URL signée à la demande.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.meal_ideas'::regclass
       and conname = 'meal_ideas_image_path_check'
  ) then
    -- Le chemin est toujours préfixé par le coach: c'est ce qui rend une fuite
    -- d'identifiant inexploitable pour lire le dossier d'un autre.
    alter table public.meal_ideas
      add constraint meal_ideas_image_path_check
      check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. LE BUCKET
--
-- Privé, comme les quatre autres. Aucune policy sur `storage.objects` n'est
-- ajoutée: l'upload et la signature passent par `coach-recipe-image-v1`, qui
-- tient le service role et vérifie que le coach est bien le propriétaire.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. QUI EST LE COACH DE CET ÉLÈVE
--
-- Miroir exact de `coached_student_ids()`, dans l'autre sens. Une seule
-- définition de « lien actif » pour les deux directions: même jointure, mêmes
-- deux filtres `status='active'`. Deux définitions divergentes donneraient un
-- coach qui voit un élève sans que l'élève ne voie ses recettes.
-- ----------------------------------------------------------------------------

create or replace function public.my_coach_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  where cc.student_user_id = (select auth.uid())
    and c.status = 'active'
    and cc.status = 'active';
$$;

comment on function public.my_coach_ids() is
  'Les coachs ACTIFS de l''élève courant. Miroir de coached_student_ids() dans '
  'l''autre sens — même définition du lien actif, pour que les deux surfaces ne '
  'puissent pas diverger.';

revoke all on function public.my_coach_ids() from public;
grant execute on function public.my_coach_ids() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. LA LECTURE DE L'ÉLÈVE — la bibliothèque, plus le placement
-- ----------------------------------------------------------------------------

drop policy if exists meal_ideas_student_read on public.meal_ideas;

create policy meal_ideas_student_read on public.meal_ideas
  for select to authenticated
  using (
    status = 'active'
    and coach_id = any ((select public.my_coach_ids())::uuid[])
  );

comment on policy meal_ideas_student_read on public.meal_ideas is
  'L''élève lit les recettes ACTIVES de son coach. Plus aucun placement requis: '
  'en 1:N le coach publie une bibliothèque, il ne compose pas la semaine de '
  'chacun. `archived` reste invisible — c''est le seul geste de retrait.';

-- ----------------------------------------------------------------------------
-- 5. CE QUI PART
--
-- L'ordre compte: la policy ci-dessus ne cite plus `meal_plan_entries`, donc la
-- table peut tomber sans laisser de dépendance pendante.
-- ----------------------------------------------------------------------------

drop table if exists public.meal_plan_entries;

drop index if exists public.meal_ideas_student_idx;
alter table public.meal_ideas drop column if exists student_id;

-- ----------------------------------------------------------------------------
-- 6. CONTRÔLE FINAL — on rejoue les gestes, on n'inspecte pas du texte.
--
-- La leçon de `20260804140000`: une épreuve d'absence textuelle laisse passer
-- une panne réelle.
-- ----------------------------------------------------------------------------

do $$
declare
  leftovers int;
begin
  -- (a) plus aucune dépendance à la table supprimée, nulle part.
  select count(*) into leftovers
    from pg_policy
   where pg_get_expr(polqual, polrelid) like '%meal_plan_entries%'
      or coalesce(pg_get_expr(polwithcheck, polrelid), '') like '%meal_plan_entries%';
  if leftovers > 0 then
    raise exception
      'coach_recipe_library: % policy(ies) citent encore meal_plan_entries', leftovers;
  end if;

  select count(*) into leftovers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc like '%meal_plan_entries%';
  if leftovers > 0 then
    raise exception
      'coach_recipe_library: % fonction(s) SQL citent encore meal_plan_entries',
      leftovers;
  end if;

  select count(*) into leftovers
    from pg_views where schemaname = 'public'
     and definition like '%meal_plan_entries%';
  if leftovers > 0 then
    raise exception
      'coach_recipe_library: % vue(s) citent encore meal_plan_entries', leftovers;
  end if;

  -- (b) la table est bien partie, et la colonne 1:1 aussi.
  if to_regclass('public.meal_plan_entries') is not null then
    raise exception 'coach_recipe_library: meal_plan_entries existe encore';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'meal_ideas'
       and column_name = 'student_id'
  ) then
    raise exception 'coach_recipe_library: meal_ideas.student_id existe encore';
  end if;

  -- (c) le bucket est privé. Un bucket public rendrait la photo de recette
  --     d'un coach lisible par le web entier, sans lien avec ses élèves.
  if exists (select 1 from storage.buckets where id = 'recipe-images' and public) then
    raise exception 'coach_recipe_library: le bucket recipe-images est PUBLIC';
  end if;

  raise notice
    'coach_recipe_library: 1:1 retiré, aucune dépendance résiduelle, bucket privé';
end $$;
