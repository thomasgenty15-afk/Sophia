-- ============================================================================
-- AGENT 13 — CLOISONNEMENT & RGPD : les deux trous mesurés, et leur garde.
--
-- STATUS: NOT APPLIED TO ANY REMOTE — HUMAN REVIEW REQUIRED.
-- Appliquée et vérifiée sur la base LOCALE uniquement.
--
-- ── TROU 1 : `revoke ... from public` NE RETIRE PAS le droit de `anon` ─────
--
-- Supabase pose des DEFAULT PRIVILEGES qui accordent EXPLICITEMENT à `anon` et
-- `authenticated` tous les droits sur chaque nouvel objet de `public`. Un
-- `revoke all ... from public` retire le droit du pseudo-rôle PUBLIC ; il ne
-- touche pas au grant nominatif de `anon`. Les deux surfaces écrites pendant
-- le pivot ont utilisé cette formule et sont donc restées ouvertes à `anon` :
--
--   * `coach_student_contact` et `coach_student_pulse` (vues Tier B) —
--     mesuré : `has_table_privilege('anon', …, 'select') = true`, alors que
--     `coach_student_directory` / `coach_student_events`, écrites en W1.1 avec
--     un `revoke … from anon` explicite, sont bien fermées.
--
--   * `keel_mark_synthesis_delivered` — mesuré :
--     `has_function_privilege('anon', …, 'execute') = true`.
--     La garde de 20260803230000 a vérifié le rôle `public` et conclu que la
--     fonction était fermée. Elle testait le mauvais rôle.
--
-- CE QUI N'A PAS FUITÉ, ET POURQUOI IL NE FAUT PAS S'EN CONTENTER
-- Aucune de ces trois surfaces ne rend de donnée aujourd'hui : les vues sont
-- SECURITY DEFINER mais l'EXECUTE d'une fonction appelée dans le corps d'une
-- vue est vérifié contre l'APPELANT, pas contre le propriétaire — `anon` n'a
-- pas l'EXECUTE sur `coached_student_ids()`, donc la requête meurt en 42501 au
-- lieu de rendre des lignes. Et la fonction de livraison filtre sur
-- `auth.uid()`, nul pour `anon`.
--
-- Autrement dit : la seule chose entre `anon` et le pouls hebdomadaire de tous
-- les élèves est un grant SANS RAPPORT sur une AUTRE fonction. Une vue Tier B
-- écrite demain sans appel de fonction n'aurait plus ce filet. C'est la classe
-- « une garde optionnelle est une garde désarmée » : on ferme la porte, et on
-- pose la garde structurelle qui refusera la prochaine.
--
-- ── TROU 2 : la purge J+7 laisse l'élève NOMMÉ dans la synthèse du coach ───
--
-- `coach_syntheses` appartient au COACH : elle ne casse pas avec l'élève, et
-- c'est voulu (un rapport hebdomadaire qui se réécrit tout seul n'est plus un
-- rapport). Mais deux de ses colonnes portent l'élève en clair :
--   * `flagged_students[].student_user_id` — son uuid ;
--   * `narrative` — son NOM COMPLET, rendu par `nameOf()` dans « To catch up ».
-- Mesuré après une purge complète : 36 lignes supprimées dans 19 tables, les
-- 3 objets de stockage effacés… et ces deux traces intactes.
--
-- La règle appliquée ici est celle du cahier des charges : la référence
-- agrégée SURVIT, l'identité DISPARAÎT. On ne retire pas la ligne « à
-- rattraper » (le rapport dirait 2 élèves là où le coach en a lu 3) ; on
-- retire QUI c'était.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LES DEUX VUES TIER B — même formule que W1.1, appliquée aux nouvelles.
-- ---------------------------------------------------------------------------
revoke all on public.coach_student_contact from anon;
revoke all on public.coach_student_pulse   from anon;
revoke all on public.coach_student_contact from public;
revoke all on public.coach_student_pulse   from public;
grant select on public.coach_student_contact to authenticated;
grant select on public.coach_student_pulse   to authenticated;

-- ---------------------------------------------------------------------------
-- 2. LA FONCTION DE LIVRAISON — `anon` n'a rien à marquer comme lu.
-- ---------------------------------------------------------------------------
revoke all on function public.keel_mark_synthesis_delivered(uuid, text) from anon;
revoke all on function public.keel_mark_synthesis_delivered(uuid, text) from public;
grant execute on function public.keel_mark_synthesis_delivered(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. L'ANONYMISATION DE LA RÉFÉRENCE SURVIVANTE.
--
-- Appelée par `purge-deleted-accounts` AVANT la suppression de l'utilisateur
-- auth (le nom vient de `profiles`, qui disparaît en cascade juste après).
--
-- Idempotente : rejouée sur une ligne déjà nettoyée, elle ne trouve plus rien
-- et rend 0 — ce qui compte, parce que la purge est reprise après un crash.
--
-- FAIL-LOUD (R7) : après l'écriture, la fonction RELIT et lève si une trace
-- subsiste. Une anonymisation qui rend « ok » sans avoir effacé est pire que
-- pas d'anonymisation du tout : elle clôt le sujet.
-- ---------------------------------------------------------------------------
create or replace function public.keel_anonymise_purged_student(
  p_user_id uuid,
  p_full_name text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_left bigint;
begin
  if p_user_id is null then
    raise exception 'keel_anonymise_purged_student: p_user_id is null'
      using errcode = '22004';
  end if;

  -- (a) L'uuid dans `flagged_students`. On reconstruit le tableau élément par
  -- élément : l'entrée de l'élève garde sa raison et ses chiffres (le rapport
  -- reste vrai), et perd son identité.
  update public.coach_syntheses s
     set flagged_students = (
       select coalesce(jsonb_agg(
         case
           when elem ->> 'student_user_id' = p_user_id::text
             then (elem - 'student_user_id')
                  || jsonb_build_object('student_user_id', null,
                                        'student_purged', true)
           else elem
         end
       ), '[]'::jsonb)
       from jsonb_array_elements(s.flagged_students) as elem
     )
   where s.flagged_students @> jsonb_build_array(
           jsonb_build_object('student_user_id', p_user_id::text));
  get diagnostics v_rows = row_count;

  -- (b) Le NOM dans la prose. Borné aux lignes qui ont signalé CET élève —
  -- un remplacement global sur toute la table irait réécrire la synthèse d'un
  -- homonyme encore actif chez un autre coach.
  --
  -- `\m…\M` = frontières de mot : sans elles, purger « Ana » mutilerait
  -- « Anaïs » dans la même phrase. `regexp_replace` reçoit le nom échappé par
  -- `quote_regex`-like (les métacaractères d'un nom propre sont rares mais un
  -- « J. R. » suffirait à casser la regex).
  if v_name is not null then
    update public.coach_syntheses s
       set narrative = regexp_replace(
             s.narrative,
             '\m' || regexp_replace(v_name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M',
             'A deleted account',
             'g')
     where s.narrative is not null
       and s.flagged_students @> jsonb_build_array(
             jsonb_build_object('student_purged', true))
       and s.narrative like '%' || v_name || '%';
  end if;

  -- (c) Relecture. Si une trace subsiste, la purge doit ÉCHOUER et réessayer
  -- au prochain passage plutôt que rapporter un succès.
  select count(*) into v_left
  from public.coach_syntheses s
  where s.flagged_students::text like '%' || p_user_id::text || '%'
     or (v_name is not null and s.narrative like '%' || v_name || '%'
         and s.flagged_students @> jsonb_build_array(
               jsonb_build_object('student_purged', true)));
  if v_left > 0 then
    raise exception 'keel_anonymise_purged_student: % ligne(s) portent encore l''eleve %',
      v_left, p_user_id using errcode = 'P0001';
  end if;

  return v_rows;
end;
$$;

-- Écrite par la purge seule. Ni le coach ni l'élève ne réécrivent une synthèse.
revoke all on function public.keel_anonymise_purged_student(uuid, text) from public;
revoke all on function public.keel_anonymise_purged_student(uuid, text) from anon;
revoke all on function public.keel_anonymise_purged_student(uuid, text) from authenticated;
grant execute on function public.keel_anonymise_purged_student(uuid, text) to service_role;

comment on function public.keel_anonymise_purged_student(uuid, text) is
  'RGPD J+7: la synthese agregee du coach SURVIT, l''identite de l''eleve purge '
  'en disparait (uuid + nom rendu). Fail-loud si une trace subsiste.';

commit;


-- ============================================================================
-- GARDES STRUCTURELLES — elles refuseront la PROCHAINE surface trop ouverte,
-- pas seulement celles-ci. Une garde qui n'énumère que les coupables connus
-- ne protège que du passé.
-- ============================================================================
do $$
declare
  bad text;
begin
  -- (1) Aucune vue Tier B lisible par `anon`. Le préfixe est le critère: toute
  -- vue `coach_student_*` est par construction une projection de données
  -- d'élève, et n'a donc jamais de raison d'être ouverte à un non-authentifié.
  select string_agg(c.relname, ', ' order by c.relname) into bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and c.relname like 'coach\_student\_%'
    and (has_table_privilege('anon', c.oid, 'select')
         or has_table_privilege('anon', c.oid, 'insert')
         or has_table_privilege('anon', c.oid, 'update')
         or has_table_privilege('anon', c.oid, 'delete'));
  if bad is not null then
    raise exception 'A13 guard: vue(s) Tier B ouverte(s) a anon: %', bad;
  end if;

  -- (2) Aucune fonction SECURITY DEFINER du domaine KEEL/coach exécutable par
  -- `public` ou `anon`. `preview_coach_invitation` est la seule exception, et
  -- elle est documentée comme surface publique dans 20260727200000
  -- (ARBITRATION 2) : elle ne rend que le prénom du coach, sur présentation
  -- d'un jeton d'invitation.
  select string_agg(
           p.proname || '(' ||
           case when has_function_privilege('anon', p.oid, 'execute')
                then 'anon' else 'public' end || ')',
           ', ' order by p.proname)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (p.proname like 'keel\_%' or p.proname like 'coach%'
         or p.proname in ('coached_student_ids', 'revoke_coach_access',
                          'accept_coach_invitation', 'accept_coach_invitation_for_user',
                          'log_coach_student_access', 'purge_auth_user'))
    and p.proname <> 'preview_coach_invitation'
    and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('public', p.oid, 'execute'));
  if bad is not null then
    raise exception 'A13 guard: SECURITY DEFINER KEEL ouverte(s) a public|anon: %', bad;
  end if;

  raise notice 'A13 OK — surfaces Tier B et SECURITY DEFINER fermees a anon';
end $$;

-- Preuve d'exécution de l'anonymisation, sur une donnée jetable.
do $$
declare
  v_coach_user uuid := '0a130000-0000-4000-8000-0000000000a1';
  v_coach      uuid := '0a130000-0000-4000-8000-0000000000a2';
  v_student    uuid := '0a130000-0000-4000-8000-0000000000a3';
  v_syn        uuid;
  n integer;
  left_uuid bigint;
  left_name bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_coach_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'a13.guard.coach@example.invalid', 'x', now(), now(),
    '{}', '{}', '', '', '', '')
  on conflict (id) do nothing;

  insert into public.coaches (id, user_id, display_name, status)
  values (v_coach, v_coach_user, 'Guard Coach', 'active')
  on conflict (id) do nothing;

  insert into public.coach_syntheses (coach_id, kind, period_start, period_end,
    metrics, flagged_students, narrative, content_locale)
  values (v_coach, 'weekly', '2001-01-01', '2001-01-07', '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('student_user_id', v_student::text,
                         'reason_code', 'silent_5d'),
      jsonb_build_object('student_user_id', gen_random_uuid()::text,
                         'reason_code', 'coverage_below_gate')),
    E'To catch up:\n- Jean Guard: no message for 5 days.\n- Jeanne Autre: 3 of 7 days.',
    'en-GB')
  returning id into v_syn;

  n := public.keel_anonymise_purged_student(v_student, 'Jean Guard');
  if n <> 1 then
    raise exception 'A13 guard: anonymisation a touche % ligne(s), attendu 1', n;
  end if;

  select count(*) into left_uuid from public.coach_syntheses
   where id = v_syn and flagged_students::text like '%' || v_student::text || '%';
  if left_uuid <> 0 then
    raise exception 'A13 guard: l''uuid de l''eleve survit dans flagged_students';
  end if;

  select count(*) into left_name from public.coach_syntheses
   where id = v_syn and narrative like '%Jean Guard%';
  if left_name <> 0 then
    raise exception 'A13 guard: le nom de l''eleve survit dans narrative';
  end if;

  -- L'HOMONYME PARTIEL DOIT SURVIVRE : « Jeanne Autre » n'est pas « Jean
  -- Guard », et un remplacement sans frontière de mot l'aurait mutilée.
  if not exists (select 1 from public.coach_syntheses
                 where id = v_syn and narrative like '%Jeanne Autre%') then
    raise exception 'A13 guard: le remplacement a deborde sur un autre eleve';
  end if;

  -- La ligne « à rattraper » de l'élève purgé EXISTE encore, sans identité :
  -- le rapport garde son compte, il perd le nom.
  if not exists (
    select 1 from public.coach_syntheses
    where id = v_syn
      and flagged_students @> jsonb_build_array(
            jsonb_build_object('student_purged', true, 'reason_code', 'silent_5d'))
  ) then
    raise exception 'A13 guard: la ligne agregee a disparu au lieu d''etre anonymisee';
  end if;

  -- Idempotence : un second passage (reprise apres crash) ne casse pas.
  n := public.keel_anonymise_purged_student(v_student, 'Jean Guard');
  if n <> 0 then
    raise exception 'A13 guard: 2e passage a touche % ligne(s), attendu 0', n;
  end if;

  delete from public.coach_syntheses where id = v_syn;
  delete from public.coaches where id = v_coach;
  delete from auth.users where id = v_coach_user;

  raise notice 'A13 OK — anonymisation de la reference survivante verifiee';
end $$;
