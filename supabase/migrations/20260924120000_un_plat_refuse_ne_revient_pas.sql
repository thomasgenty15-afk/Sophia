-- ===========================================================================
-- 2026-09-24 — UN PLAT REFUSÉ NE REVIENT PAS.
--
-- Décision du propriétaire (2026-09-24): sur l'aperçu d'un plan, « Remplacer »
-- barre un plat avec sa raison, et le plat entre dans une LISTE DES PLATS
-- REFUSÉS, rangée avec les personnes qui le mangeaient, visible et effaçable
-- dans « Ce que Sophia sait », lue par le générateur à chaque composition.
--
-- ⚠️ CE N'EST PAS UNE PRÉFÉRENCE (`retained_items`). La nomenclature de la
-- mémoire range une préférence comme (personne, ALIMENT ou PRÉPARATION); un
-- titre de plat n'en est pas un (`plan_feedback.ts`, « le titre d'un plat
-- n'est pas une préférence »). C'est une liste à part, sous sa propre clé
-- `practical_constraints.rejected_dishes` — donc exportée et supprimée avec
-- la ligne `student_goals`, comme le reste de la colonne.
--
-- Une entrée:
--   { key, title, name, household, member_ids, reason, at, draft_id }
--   · `key`       le titre normalisé (NFC, espaces repliés, minuscules) — même
--                 règle que `dishTitleKey` côté serveur et côté écran;
--   · `household` vrai = tous les mangeurs du foyer le mangeaient (la table);
--                 alors `member_ids` est vide;
--   · `reason`    les mots de la personne, tels quels (≤ 280 signes).
--
-- ⛔ JAMAIS LIRE-PUIS-ÉCRIRE. Une réécriture de la colonne depuis une copie lue
-- plus tôt a déjà effacé des écritures (`stale-current-erases-the-previous-
-- write`): l'ajout est UN `update … jsonb_set` qui fusionne en SQL.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- LA FUSION — pure, testée par le bloc de preuve en bas de fichier.
-- ---------------------------------------------------------------------------
-- · une entrée par clé; une clé déjà là est MISE À JOUR (titre, raison, date,
--   brouillon) et ses personnes sont RÉUNIES;
-- · « tout le foyer » absorbe les personnes: `household` vrai ⇒ `member_ids`
--   vide;
-- · la plus récente d'abord (`at`), 200 au plus: la plus ancienne sort.
create or replace function public.keel_rejected_dishes_merge(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with old_rows as (
    select t.e, t.ord
      from jsonb_array_elements(
             case when jsonb_typeof(p_old) = 'array' then p_old else '[]'::jsonb end
           ) with ordinality as t(e, ord)
     where jsonb_typeof(t.e) = 'object' and coalesce(t.e ->> 'key', '') <> ''
  ),
  new_rows as (
    -- Deux entrées de la même clé dans un même envoi: la dernière gagne.
    select distinct on (t.e ->> 'key') t.e
      from jsonb_array_elements(
             case when jsonb_typeof(p_new) = 'array' then p_new else '[]'::jsonb end
           ) with ordinality as t(e, ord)
     where jsonb_typeof(t.e) = 'object' and coalesce(t.e ->> 'key', '') <> ''
     order by t.e ->> 'key', t.ord desc
  ),
  joined as (
    select n.e as ne, o.e as oe, o.ord as oord
      from new_rows n
      full join old_rows o on o.e ->> 'key' = n.e ->> 'key'
  ),
  merged as (
    select
      case
        when j.ne is null then j.oe
        else j.ne || jsonb_build_object(
          'household',
          coalesce(j.ne -> 'household' = 'true'::jsonb, false)
            or coalesce(j.oe -> 'household' = 'true'::jsonb, false),
          'member_ids',
          case
            when coalesce(j.ne -> 'household' = 'true'::jsonb, false)
              or coalesce(j.oe -> 'household' = 'true'::jsonb, false)
              then '[]'::jsonb
            else coalesce((
              select jsonb_agg(ids.m order by ids.m)
                from (
                  select distinct x #>> '{}' as m
                    from jsonb_array_elements(
                           case when jsonb_typeof(j.ne -> 'member_ids') = 'array'
                                then j.ne -> 'member_ids' else '[]'::jsonb end
                           || case when jsonb_typeof(j.oe -> 'member_ids') = 'array'
                                   then j.oe -> 'member_ids' else '[]'::jsonb end
                         ) as x
                   where jsonb_typeof(x) = 'string' and x #>> '{}' <> ''
                ) ids
            ), '[]'::jsonb)
          end
        )
      end as entry,
      case when j.ne is null then 1 else 0 end as is_old,
      coalesce(j.oord, 0) as oord
    from joined j
  )
  select coalesce(jsonb_agg(c.entry order by c.at desc nulls last, c.is_old, c.oord), '[]'::jsonb)
    from (
      select m.entry, m.entry ->> 'at' as at, m.is_old, m.oord
        from merged m
       order by m.entry ->> 'at' desc nulls last, m.is_old, m.oord
       limit 200
    ) c;
$$;

comment on function public.keel_rejected_dishes_merge(jsonb, jsonb) is
  '2026-09-24 — fusion pure de practical_constraints.rejected_dishes: une '
  'entree par cle (titre normalise), personnes reunies, household absorbe '
  'les personnes, la plus recente d''abord, 200 au plus.';

revoke all on function public.keel_rejected_dishes_merge(jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- L'AJOUT, PAR LE SERVEUR (`keel-read-note-v1`, en `service_role`).
-- ---------------------------------------------------------------------------
create or replace function public.keel_append_rejected_dishes_for(
  p_user uuid,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
  v_count integer;
begin
  -- ⚠️ `p_user` ET PAS `auth.uid()`: appelé en `service_role`, où
  -- `auth.uid()` est NULL. La contrepartie est le `grant` à `service_role`
  -- SEUL, tout en bas.
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_entries');
  end if;

  update public.student_goals sg
     set practical_constraints = jsonb_set(
           coalesce(sg.practical_constraints, '{}'::jsonb),
           array['rejected_dishes'],
           public.keel_rejected_dishes_merge(sg.practical_constraints -> 'rejected_dishes', p_entries),
           true
         )
   where sg.user_id = p_user
  returning jsonb_array_length(sg.practical_constraints -> 'rejected_dishes') into v_count;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', true, 'written', true, 'count', v_count);
end;
$function$;

comment on function public.keel_append_rejected_dishes_for(uuid, jsonb) is
  '2026-09-24 — ajoute des plats refuses (practical_constraints.rejected_dishes) '
  'en un seul update atomique. service_role seul: appele par keel-read-note-v1.';

revoke all on function public.keel_append_rejected_dishes_for(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_append_rejected_dishes_for(uuid, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- LE RETRAIT, PAR LA PERSONNE (« Retirer » dans « Ce que Sophia sait »).
-- ---------------------------------------------------------------------------
create or replace function public.keel_remove_rejected_dish(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_rows integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if coalesce(p_key, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_key');
  end if;

  update public.student_goals sg
     set practical_constraints = jsonb_set(
           coalesce(sg.practical_constraints, '{}'::jsonb),
           array['rejected_dishes'],
           coalesce((
             select jsonb_agg(t.e order by t.ord)
               from jsonb_array_elements(
                      case when jsonb_typeof(sg.practical_constraints -> 'rejected_dishes') = 'array'
                           then sg.practical_constraints -> 'rejected_dishes' else '[]'::jsonb end
                    ) with ordinality as t(e, ord)
              where t.e ->> 'key' is distinct from p_key
           ), '[]'::jsonb),
           true
         )
   where sg.user_id = v_user;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', true, 'removed', true);
end;
$function$;

comment on function public.keel_remove_rejected_dish(text) is
  '2026-09-24 — retire un plat refuse de practical_constraints.rejected_dishes, '
  'pour la personne connectee seulement (auth.uid()).';

revoke all on function public.keel_remove_rejected_dish(text)
  from public, anon, authenticated, service_role;
grant execute on function public.keel_remove_rejected_dish(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- LE RELANCEUR N'EST PAS POUR LES REPRISES LOCALES — `replace_dishes` non plus.
-- ---------------------------------------------------------------------------
-- Corps de `20260915183000_une_relance_et_une_seule.sql`, une seule ligne
-- changée: `replace_dishes` rejoint `edit_cells`. Une reprise locale morte se
-- dit `plan_expired`; la relancer referait des plats sur un brouillon que la
-- personne a peut-être déjà quitté. Le front (`relaunchable`) dit la même chose.
create or replace function public.keel_claim_meal_drafts_for_relaunch()
returns table(id uuid, user_id uuid, request_id text, request_body jsonb)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.student_meal_drafts d
       set status = 'failed',
           error_code = coalesce(nullif(d.error_code, ''), 'timed_out'),
           error = coalesce(d.error, 'relanceur: aucune fin avant l''echeance du bail'),
           finished_at = coalesce(d.finished_at, now()),
           relaunched_at = now()
     where d.mode = 'async'
       and d.attempt = 1
       and d.relaunched_at is null
       and d.created_at > now() - interval '1 hour'
       and coalesce(d.request_body ->> 'operation', 'compose') not in ('edit_cells', 'replace_dishes')
       and (
         (d.status in ('pending', 'running')
            and coalesce(d.started_at, d.created_at) < now() - public.keel_generation_stale_after())
         or (d.status = 'failed' and d.error_code = 'timed_out')
       )
     returning d.id, d.user_id, d.request_id, d.request_body
  )
  select * from claimed;
$$;

revoke all on function public.keel_claim_meal_drafts_for_relaunch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- LES PREUVES — exécutées à l'application, dans les deux sens.
-- ---------------------------------------------------------------------------
do $$
declare
  m jsonb;
  many jsonb := '[]'::jsonb;
  i integer;
begin
  -- (1) une clé neuve s'ajoute, en tête.
  m := public.keel_rejected_dishes_merge(
    '[{"key":"a","title":"A","household":false,"member_ids":["m1"],"reason":"r1","at":"2026-09-20"}]'::jsonb,
    '[{"key":"b","title":"B","household":false,"member_ids":["m2"],"reason":"r2","at":"2026-09-24"}]'::jsonb
  );
  if jsonb_array_length(m) <> 2 or m -> 0 ->> 'key' <> 'b' then
    raise exception 'rejected_dishes: une cle neuve ne s''ajoute pas en tete (%)', m;
  end if;

  -- (2) la même clé: une entrée, personnes réunies, raison et date neuves.
  m := public.keel_rejected_dishes_merge(
    '[{"key":"a","title":"A","household":false,"member_ids":["m1"],"reason":"r1","at":"2026-09-20"}]'::jsonb,
    '[{"key":"a","title":"A","household":false,"member_ids":["m2"],"reason":"r2","at":"2026-09-24"}]'::jsonb
  );
  if jsonb_array_length(m) <> 1
     or m -> 0 -> 'member_ids' <> '["m1","m2"]'::jsonb
     or m -> 0 ->> 'reason' <> 'r2' then
    raise exception 'rejected_dishes: la meme cle n''est pas fusionnee (%)', m;
  end if;

  -- (3) « tout le foyer » absorbe les personnes.
  m := public.keel_rejected_dishes_merge(
    '[{"key":"a","title":"A","household":false,"member_ids":["m1"],"reason":"r1","at":"2026-09-20"}]'::jsonb,
    '[{"key":"a","title":"A","household":true,"member_ids":[],"reason":"r2","at":"2026-09-24"}]'::jsonb
  );
  if (m -> 0 -> 'household') <> 'true'::jsonb or m -> 0 -> 'member_ids' <> '[]'::jsonb then
    raise exception 'rejected_dishes: household n''absorbe pas les personnes (%)', m;
  end if;

  -- (4) une forme étrangère tombe seule; rien ne s'efface.
  m := public.keel_rejected_dishes_merge(
    '[{"key":"a","title":"A","household":false,"member_ids":["m1"],"reason":"r1","at":"2026-09-20"}, 42]'::jsonb,
    '[{"title":"sans cle"}, "x"]'::jsonb
  );
  if jsonb_array_length(m) <> 1 or m -> 0 ->> 'key' <> 'a' then
    raise exception 'rejected_dishes: une forme etrangere a casse la liste (%)', m;
  end if;

  -- (5) 200 au plus: la plus ancienne sort.
  for i in 1..201 loop
    many := many || jsonb_build_array(jsonb_build_object(
      'key', 'k' || i, 'title', 'T' || i, 'household', true, 'member_ids', '[]'::jsonb,
      'reason', 'r', 'at', to_char(date '2026-01-01' + i, 'YYYY-MM-DD')
    ));
  end loop;
  m := public.keel_rejected_dishes_merge('[]'::jsonb, many);
  if jsonb_array_length(m) <> 200 or m -> 199 ->> 'key' <> 'k2' then
    raise exception 'rejected_dishes: le plafond de 200 ne coupe pas la plus ancienne (%, %)',
      jsonb_array_length(m), m -> 199 ->> 'key';
  end if;

  -- (6) vide ou absent: une liste vide, jamais NULL.
  if public.keel_rejected_dishes_merge(null, null) <> '[]'::jsonb then
    raise exception 'rejected_dishes: la fusion de rien n''est pas une liste vide';
  end if;
end $$;

do $$
declare
  v_user uuid;
  v_edit uuid;
  n integer;
begin
  select u.id into v_user
    from auth.users u
   where not exists (
     select 1 from public.student_meal_drafts d
      where d.user_id = u.id and d.status in ('pending', 'running'))
   order by u.created_at
   limit 1;
  if v_user is null then
    raise notice 'keel_claim_meal_drafts_for_relaunch: aucun utilisateur libre, preuve sautee';
    return;
  end if;

  -- (7) un remplacement de plats mort : jamais relancé.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version, created_at, started_at)
  values (v_user, 'household', 'household_meal', 'failed', 'preuve-remplacer',
          'preuve-remplacer', 'async', '{"operation":"replace_dishes"}'::jsonb, 'preuve|draft_store.v1',
          now() - interval '450 seconds', now() - interval '450 seconds')
  returning id into v_edit;
  update public.student_meal_drafts set error_code = 'timed_out' where id = v_edit;
  select count(*) into n from public.keel_claim_meal_drafts_for_relaunch();
  if n <> 0 then raise exception 'relance: un remplacement de plats (replace_dishes) a ete relance'; end if;
  delete from public.student_meal_drafts where id = v_edit;
end $$;
