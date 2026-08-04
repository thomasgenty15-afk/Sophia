-- ===========================================================================
-- PIVOT NUTRITION — C4 : le point hebdomadaire par WhatsApp Flow
-- ===========================================================================
--
-- LE TROU QU'ON FERME D'ABORD, ET IL PRÉCÈDE LE FLOW
-- --------------------------------------------------
-- `weekly_reviews` porte un unique index sur
-- `(user_id, plan_version_id, week_start_date)`. La migration N0 a rendu
-- `plan_version_id` NULLABLE, parce qu'un élève de masterclasse n'a pas de
-- version de plan à référencer.
--
-- Or Postgres tient deux NULL pour DISTINCTS. Cet index ne dédoublonne donc
-- plus rien dans le modèle masterclasse. Vérifié plutôt que supposé : deux
-- insertions de la même (user, semaine) avec `plan_version_id = null` passent
-- toutes les deux, et la table contenait bien trois lignes pour une seule
-- semaine.
--
-- Conséquence si on ne le ferme pas : le Flow peut être renvoyé par l'élève,
-- l'upsert n'aurait aucune cible, et `/app/progress` afficherait deux poids
-- pour un même dimanche sans moyen de les départager.
--
-- L'index partiel ci-dessous donne à l'upsert une cible bien définie, sans
-- toucher au chemin 1:1 où `plan_version_id` est renseigné.
-- ===========================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Dédoublonner l'existant AVANT de poser la contrainte
--
-- On garde la ligne la PLUS RÉCEMMENT MISE À JOUR : c'est celle qui porte le
-- dernier état connu. Les autres sont supprimées, et le compte est affiché —
-- une suppression silencieuse dans une migration est exactement ce que ce
-- dépôt s'interdit.
-- --------------------------------------------------------------------------
do $$
declare
  v_deleted int;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by user_id, week_start_date
        order by updated_at desc nulls last, created_at desc nulls last, id
      ) as rn
    from public.weekly_reviews
    where plan_version_id is null
  )
  delete from public.weekly_reviews w
  using ranked r
  where w.id = r.id and r.rn > 1;

  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    raise notice 'C4 : % doublon(s) (user, semaine) supprime(s), la plus recente gardee', v_deleted;
  else
    raise notice 'C4 : aucun doublon a nettoyer';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 2. L'index partiel : une seule ligne par (élève, semaine) hors chemin 1:1
-- --------------------------------------------------------------------------
create unique index if not exists weekly_reviews_user_week_no_plan_uidx
  on public.weekly_reviews (user_id, week_start_date)
  where plan_version_id is null;

commit;

-- --------------------------------------------------------------------------
-- 3. Le cron d'envoi
--
-- Tous les quarts d'heure : la fenêtre est le dimanche 18h-21h en heure LOCALE
-- de l'élève, et une cohorte à cheval sur plusieurs fuseaux a besoin que le
-- tick repasse assez souvent pour attraper chacun dans sa propre soirée.
-- Décalé de `keel-daily-pulse` (:10) et `keel-reengage` (:25) pour ne pas
-- empiler trois fonctions sur la même minute.
-- --------------------------------------------------------------------------
select cron.schedule(
  'keel-weekly-flow',
  '40 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.functions_base_url', true) || '/keel-weekly-flow-v1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ===========================================================================
-- GARDE
-- ===========================================================================
do $$
declare
  v_idx  int;
  v_cron int;
  v_dupes int;
begin
  select count(*) into v_idx
  from pg_indexes
  where tablename = 'weekly_reviews'
    and indexname = 'weekly_reviews_user_week_no_plan_uidx';

  select count(*) into v_cron from cron.job where jobname = 'keel-weekly-flow';

  -- La contrainte tient-elle vraiment ? On relit les données, pas le catalogue.
  select count(*) into v_dupes from (
    select user_id, week_start_date
    from public.weekly_reviews
    where plan_version_id is null
    group by user_id, week_start_date
    having count(*) > 1
  ) d;

  if v_idx <> 1 then
    raise exception 'C4 guard: index partiel absent';
  end if;
  if v_cron <> 1 then
    raise exception 'C4 guard: cron keel-weekly-flow absent (trouve %)', v_cron;
  end if;
  if v_dupes <> 0 then
    raise exception 'C4 guard: % couple(s) (user, semaine) encore en double', v_dupes;
  end if;

  raise notice 'C4 OK — une ligne par (eleve, semaine), cron pose';
end $$;
