-- ============================================================================
-- D14 — QUI EST LÀ, ET QUAND
--
-- Décidé le 2026-08-12 (docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
-- lot L2). Autorité produit: docs/fonctionnalites/composition-des-repas/
-- FF-002-dire-son-absence.md, dont le §9 nomme ce trou depuis le 2026-08-07.
--
-- LE PROBLÈME QU'ON FERME
--   `generate-household-meal-v1` lisait `practical_constraints.away_days` sur
--   la ligne `student_goals` du PROPRIÉTAIRE SEUL, et l'appelait « les absences
--   du foyer ». Deux conséquences, toutes les deux fausses:
--
--     1. Une bouche SANS COMPTE n'a aucune ligne `student_goals`. L'absence
--        d'un enfant parti en camp n'existait donc NULLE PART, et le foyer
--        cuisinait pour lui toute la semaine.
--     2. L'absence du maître SUPPRIMAIT le repas de tout le monde. Or FF-002
--        §9 dit l'inverse: « si le père n'est pas là samedi, la session de
--        cuisson du foyer ne disparaît pas — seules ses portions changent ».
--
-- LA FORME, ET POURQUOI ELLE EST CELLE-CI (arbitrage A)
--   Une COLONNE jsonb sur `household_members`, dans la MÊME forme que
--   `practical_constraints.away_days`: `[{"day":"thu","slots":["lunch"]}]`,
--   `slots` absent = journée entière (FF-002 §5). Donc le MÊME parseur
--   (`parseAwayDays`), la même tolérance — un jeton de jour inconnu est écarté,
--   jamais deviné, et les autres entrées sont gardées.
--
--   Pas une table, parce qu'une colonne se RETIRE et qu'une table se MIGRE. Le
--   jour où la présence devient plus riche (des dates exactes plutôt que des
--   jours récurrents), on la promeut à ce moment-là — et le coût du retour
--   arrière d'ici là est un `drop column`.
--
-- L'UNION, ET POURQUOI ELLE N'EST PAS D1 (arbitrage B)
--   Pour une bouche AVEC un compte, l'absence effective est l'UNION de ce
--   qu'elle a déclaré elle-même (`student_goals`) et de ce que le maître a
--   marqué (`household_members`). Ni l'une ni l'autre ne gagne.
--
--   C'est un ÉCART ASSUMÉ avec D1, où l'« about you » du titulaire fait
--   autorité sur l'objectif. La raison tient en une phrase: un objectif est une
--   OPINION, dont il ne peut y avoir qu'un porteur légitime; une absence est un
--   FAIT, que deux personnes peuvent connaître. Le maître qui sait que sa fille
--   part en camp doit pouvoir le marquer même si elle a oublié de le dire, et
--   ce que la fille déclare doit compter, sinon son compte ne lui sert à rien.
--
--   Le risque de l'union — ne pas cuisiner pour quelqu'un de présent — est
--   borné par le fait que les DEUX sources sont des déclarations EXPLICITES:
--   personne ne se déclare absent par accident.
--
-- LA RELECTURE (arbitrage C)
--   L'union est calculée ICI, dans le roster, et NULLE PART AILLEURS: deux
--   lecteurs qui la referaient divergeraient au premier ajustement. Et chaque
--   entrée rendue porte sa SOURCE (`self` | `household`), pour que le plan
--   puisse archiver, par membre, quels créneaux ont été comptés absents et par
--   qui. Sans ça, une absence fautive est silencieuse et personne ne saura
--   jamais pourquoi il manque une assiette.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LA COLONNE
-- ---------------------------------------------------------------------------

alter table public.household_members
  add column if not exists away_days jsonb not null default '[]'::jsonb;

-- LA FORME EST TENUE EN BASE, PAS SEULEMENT PAR LE PARSEUR.
--
-- `jsonb_typeof = 'array'`: le parseur rend `[]` pour tout ce qui n'est pas un
-- tableau, donc un objet rangé ici se lirait « aucune absence » — c'est-à-dire
-- que le maître aurait marqué quelqu'un absent et que rien ne se serait passé,
-- sans une erreur nulle part. Le refus doit arriver à l'écriture.
--
-- LE PLAFOND EST 42 = 7 JOURS × 6 MOMENTS, et il est délibérément LARGE. La
-- forme nominale porte une entrée par jour (donc 7 au plus, c'est ce qu'écrit
-- la grille), mais un écrivain qui émettrait une entrée par créneau resterait
-- lisible par le parseur — qui fusionne par jour. Un plafond à 7 refuserait
-- alors une écriture parfaitement valable. Ce qu'on borne ici est l'abus, pas
-- la forme.
alter table public.household_members
  drop constraint if exists household_members_away_days_check;
alter table public.household_members
  add constraint household_members_away_days_check
  check (
    jsonb_typeof(away_days) = 'array'
    and jsonb_array_length(away_days) <= 42
  );

comment on column public.household_members.away_days is
  'Les moments où cette bouche NE MANGE PAS ICI, marqués par le maître du '
  'foyer (D14, 2026-08-12). Forme IDENTIQUE à '
  'student_goals.practical_constraints.away_days — [{"day":"thu","slots":'
  '["lunch"]}], slots absent = journée entière (FF-002 §5) — parce que c''est '
  'le MÊME parseur qui lit les deux (parseAwayDays), avec la même tolérance: '
  'un jeton de jour inconnu tombe, les autres entrées restent. '
  'CE N''EST PAS L''AUTORITÉ UNIQUE. Pour une bouche qui a un compte, '
  'l''absence effective est l''UNION de cette colonne et de sa propre '
  'déclaration — écart assumé avec D1 (l''objectif, lui, a un seul porteur '
  'légitime): un objectif est une opinion, une absence est un fait, et deux '
  'personnes peuvent connaître le même fait. La résolution vit dans '
  'keel_household_roster_for, jamais chez un lecteur. '
  'CE QUE ÇA NE FAIT PAS: une absence ne supprime JAMAIS la session de '
  'cuisson du foyer (FF-002 §9), elle change les parts. Le repas ne disparaît '
  'que si PERSONNE n''est là sur ce créneau.';

-- ---------------------------------------------------------------------------
-- 2. LE TAG DE SOURCE
-- ---------------------------------------------------------------------------
--
-- POURQUOI UNE FONCTION ET PAS DEUX COLONNES DE ROSTER.
--
-- Rendre `away_self` et `away_household` séparément laisserait à CHAQUE
-- lecteur le soin de les unir — c'est-à-dire laisserait un lecteur choisir
-- autre chose que l'union. Une seule colonne, qui est déjà l'union, ferme la
-- question: la CONCATÉNATION des deux tableaux EST l'union, parce que
-- `parseAwayDays` fusionne par jour, fait gagner la journée entière sur les
-- créneaux, et déduplique. Le parseur est l'opérateur d'union; on ne le
-- réécrit pas en SQL.
--
-- Chaque entrée reçoit `"source"`, que le parseur IGNORE (il ne lit que `day`
-- et `slots`) et que la trace du plan LIT. Un client qui aurait rangé un
-- `"source"` de son cru dans la colonne ne peut pas mentir: `||` fait gagner
-- l'opérande de DROITE, donc le tag posé ici écrase le sien.
create or replace function public.keel_away_tagged(p_entries jsonb, p_source text)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select coalesce(
    (
      select jsonb_agg(
        case
          when jsonb_typeof(e) = 'object'
          then e || jsonb_build_object('source', p_source)
          -- Une entrée qui n'est pas un objet passe TELLE QUELLE. Le parseur
          -- l'écartera; la réparer ici serait deviner, ce que FF-002 §7
          -- interdit explicitement.
          else e
        end
      )
      from jsonb_array_elements(
        case when jsonb_typeof(p_entries) = 'array' then p_entries else '[]'::jsonb end
      ) as e
    ),
    '[]'::jsonb
  );
$function$;

comment on function public.keel_away_tagged(jsonb, text) is
  'Étiquette chaque entrée d''absence avec sa SOURCE (self | household). Rend '
  '[] pour tout ce qui n''est pas un tableau. Le tag posé ici écrase celui '
  'qu''un client aurait rangé dans la colonne (`||` fait gagner la droite), '
  'donc une source ne se falsifie pas depuis le navigateur.';

-- ---------------------------------------------------------------------------
-- 3. LE ROSTER — LE SEUL ENDROIT OÙ L'UNION EST CALCULÉE
-- ---------------------------------------------------------------------------
--
-- ⚠️ LE TYPE DE RETOUR CHANGE, donc `create or replace` ne suffit pas: il faut
-- DROPPER. Et l'ordre est une contrainte du moteur, pas un goût —
-- `keel_household_roster()` appelle `_for`, donc elle part la première.
--
-- ⚠️ DROPPER UNE FONCTION EFFACE SES PRIVILÈGES. La section 5 les repose, et
-- ce n'est pas de l'hygiène: `_for` est réservée à `service_role` (elle prend
-- l'identité en ARGUMENT, donc l'ouvrir à `authenticated` serait le droit de
-- lire le foyer de n'importe qui).
drop function if exists public.keel_household_roster();
drop function if exists public.keel_household_roster_for(uuid);

-- ⚠️ `language sql` crée une DÉPENDANCE sur les colonnes citées: cette
-- fonction dépend désormais aussi de `public.household_members.away_days` et de
-- `public.student_goals.practical_constraints`. Toute migration future qui
-- voudra les modifier devra dropper cette fonction d'abord.
create or replace function public.keel_household_roster_for(p_user uuid)
returns table (
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text,
  away_days jsonb
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    hm.member_id,
    hm.user_id,
    hm.first_name,
    public.keel_household_member_age(hm.member_id) as age_state,
    hm.role,
    -- D1. La jointure ne peut pas dupliquer une bouche: `student_goals.user_id`
    -- porte une contrainte UNIQUE (`student_goals_user_id_key`).
    case
      when hm.user_id is null then hm.goal
      else sg.goal
    end as goal,
    -- D14. L'UNION, DANS CET ORDRE: ce que la personne a déclaré d'abord, ce
    -- que le maître a marqué ensuite. L'ordre n'a aucun effet sur le résultat
    -- (`parseAwayDays` fusionne et fait gagner la journée entière quel que soit
    -- le rang), et il rend la trace lisible dans le sens où on la raconte.
    --
    -- Une bouche SANS COMPTE n'a pas de ligne `student_goals`: la moitié
    -- `self` est alors `[]`, sans branche conditionnelle. C'est exactement le
    -- cas nominal d'un enfant, et il ne mérite pas un `case`.
    public.keel_away_tagged(sg.practical_constraints -> 'away_days', 'self')
      || public.keel_away_tagged(hm.away_days, 'household') as away_days
  from public.household_members hm
  left join public.student_goals sg on sg.user_id = hm.user_id
  -- LA GARDE, portée par l'ARGUMENT. Un `p_user` nul rend zéro ligne:
  -- `keel_household_of(null)` est nul, et `= null` n'est jamais vrai.
  where hm.household_id = public.keel_household_of(p_user)
  order by (hm.role = 'owner') desc, hm.joined_at;
$function$;

create or replace function public.keel_household_roster()
returns table (
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text,
  away_days jsonb
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.keel_household_roster_for((select auth.uid()));
$function$;

comment on function public.keel_household_roster_for(uuid) is
  'Le roster du foyer de p_user, pour les appelants SERVEUR (service_role), où '
  'auth.uid() est NULL. Le prénom et l''âge viennent de la LIGNE MEMBRE. '
  'L''OBJECTIF vient de `student_goals` dès que la bouche a un compte (D1, '
  '2026-08-11). L''ABSENCE, elle, est l''UNION des deux sources (D14, '
  '2026-08-12): chaque entrée porte `source` (self | household), et c''est ICI '
  'que l''union est calculée — un second lecteur qui la referait divergerait. '
  'Le tableau rendu se lit tel quel par `parseAwayDays`, qui ignore `source`.';

comment on function public.keel_household_roster() is
  'Le roster du foyer de l''appelant. Délègue à keel_household_roster_for; '
  'aucune règle n''est écrite ici, exprès — le navigateur et le serveur '
  'doivent lire le même foyer, absences comprises.';

-- ---------------------------------------------------------------------------
-- 4. L'ÉCRITURE — LE MAÎTRE MARQUE QUI N'EST PAS LÀ
-- ---------------------------------------------------------------------------
--
-- Le patron est `keel_household_set_member_goal`: contrôle de propriété
-- d'abord, refus NOMMÉS, `jsonb_build_object('ok', …)`.
--
-- ⚠️ UNE DIFFÉRENCE, ET C'EST TOUT L'ARBITRAGE B: contrairement à l'objectif,
-- marquer une absence est PERMIS même quand la bouche a un compte. Il n'y a
-- donc PAS de refus `has_account` ici, et son absence est le sujet de cette
-- migration — ne pas le recopier « par symétrie ».
create or replace function public.keel_household_set_member_away(
  p_member uuid,
  p_away jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- LA FORME EST REFUSÉE ICI, LE CONTENU NE L'EST PAS. Un tableau dont une
  -- entrée nomme un jour inconnu est ACCEPTÉ: `parseAwayDays` l'écartera à la
  -- lecture et gardera les autres (FF-002 §7). Refuser ici ferait tomber une
  -- déclaration entière pour une faute de frappe, ce qui est exactement la
  -- posture que la fiche interdit.
  if p_away is null or jsonb_typeof(p_away) <> 'array'
     or jsonb_array_length(p_away) > 42 then
    return jsonb_build_object('ok', false, 'reason', 'bad_away');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- MÊME ORDRE QUE POUR L'OBJECTIF: un membre non-maître qui vise la ligne de
  -- quelqu'un d'autre s'entend dire qu'il n'est pas chez lui. Il garde le droit
  -- de marquer SA PROPRE ligne — ce qui, pour lui, fait doublon avec son « about
  -- you », et c'est sans conséquence: l'union de deux fois la même absence est
  -- cette absence.
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  update public.household_members
     set away_days = p_away
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_away(uuid, jsonb) is
  'Marque les moments où une bouche n''est pas là (D14, 2026-08-12). Le maître '
  'peut viser N''IMPORTE QUELLE bouche de son foyer, Y COMPRIS une qui a un '
  'compte — c''est l''écart assumé avec keel_household_set_member_goal, qui '
  'refuse `has_account`: une absence est un FAIT que deux personnes peuvent '
  'connaître, pas une opinion. La déclaration de la personne elle-même n''est '
  'PAS écrasée: le roster en fait l''UNION. La forme est refusée '
  '(`bad_away`), le contenu ne l''est pas — un jour inconnu est écarté à la '
  'lecture, jamais à l''écriture.';

-- ---------------------------------------------------------------------------
-- 5. LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- Deux cicatrices du dépôt, rejouées ici: `revoke from public` NE RETIRE PAS
-- `anon`, et toute fonction NEUVE est exécutable par tout le monde par défaut.
--
-- ⚠️ LA COLONNE, ELLE, N'A BESOIN D'AUCUN GRANT. `household_members` porte un
-- `revoke all` suivi d'un `grant select` au niveau TABLE (migration
-- 20260808000000): une colonne neuve hérite du grant de table, donc
-- `authenticated` la LIT (l'écran doit montrer ce qui est marqué) et ne peut
-- pas l'écrire — il n'y a aucun `grant update`. La seule porte d'écriture est
-- la RPC ci-dessus, et c'est elle qui décide que seul le maître marque
-- quelqu'un d'autre. Vérifié en section 6.

revoke all on function public.keel_away_tagged(jsonb, text) from public, anon;
revoke all on function public.keel_household_roster() from public, anon;
revoke all on function public.keel_household_roster_for(uuid) from public, anon, authenticated;
revoke all on function public.keel_household_set_member_away(uuid, jsonb) from public, anon;

grant execute on function public.keel_household_roster() to authenticated;
-- Serveur uniquement: c'est tout l'objet de la version à argument.
grant execute on function public.keel_household_roster_for(uuid) to service_role;
grant execute on function public.keel_household_set_member_away(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. CONTRÔLE FINAL — ON REJOUE LES GESTES
-- ---------------------------------------------------------------------------
--
-- Inspecter le catalogue prouverait que la colonne existe, pas que l'union
-- fonctionne. On monte un foyer, on marque une absence sur une bouche SANS
-- COMPTE, on en déclare une autre sur le maître via SON « about you », on relit
-- le roster, et on annule tout.
--
-- LE CAS QUI PASSE EST AUSSI VÉRIFIÉ (une garde sans cas passant est
-- indiscernable d'une garde cassée): une bouche sans aucune absence rend `[]`,
-- pas `null`.

do $$
declare
  v_user uuid;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_had_goal boolean;
  v_away jsonb;
  v_sources text[];
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'household_presence: aucun utilisateur, contrôle sauté';
    return;
  end if;
  if public.keel_household_of(v_user) is not null then
    raise notice 'household_presence: % déjà dans un foyer, contrôle sauté', v_user;
    return;
  end if;

  insert into public.households (name, created_by)
  values ('__qa_presence__', v_user) returning id into v_house;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, v_user, 'owner', 'Owner', '1990-01-01')
  returning member_id into v_owner;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, null, 'member', 'Lea', current_date - interval '8 years')
  returning member_id into v_kid;

  -- 1. LE CAS QUI PASSE. Personne n'a rien marqué: le roster rend un tableau
  --    VIDE, jamais `null`. Un `null` ici ferait tomber `parseAwayDays` sur son
  --    repli, ce qui donne le même résultat aujourd'hui — et masquerait le jour
  --    où la colonne cesse d'être renseignée.
  select r.away_days into v_away
  from public.keel_household_roster_for(v_user) r where r.member_id = v_kid;
  if v_away is null or v_away <> '[]'::jsonb then
    raise exception
      'roster away_days: une bouche sans absence rend %, pas [] — le repli du '
      'parseur masquerait une colonne qui cesse d''être lue', coalesce(v_away::text, 'NULL');
  end if;

  -- 2. LA BOUCHE SANS COMPTE, MARQUÉE PAR LE MAÎTRE. C'est le geste que toute
  --    cette migration existe pour permettre: avant elle, l'absence d'un enfant
  --    n'avait AUCUN endroit où s'écrire.
  update public.household_members
     set away_days = '[{"day":"sat","slots":["lunch"]}]'::jsonb
   where member_id = v_kid;

  select r.away_days into v_away
  from public.keel_household_roster_for(v_user) r where r.member_id = v_kid;
  if jsonb_array_length(v_away) <> 1
     or v_away -> 0 ->> 'source' <> 'household'
     or v_away -> 0 ->> 'day' <> 'sat' then
    raise exception
      'roster away_days: la marque du maître rend % — sans `source` la trace du '
      'plan ne peut pas dire d''où vient une assiette manquante', v_away::text;
  end if;

  -- 3. L'UNION (arbitrage B). Le maître marque `thu`, et son « about you »
  --    déclare `sun`. Les DEUX doivent sortir, avec leur source: si l'une
  --    écrasait l'autre, soit le maître ne pourrait pas corriger un oubli, soit
  --    la déclaration de la personne ne servirait à rien.
  select exists(select 1 from public.student_goals where user_id = v_user)
  into v_had_goal;
  if v_had_goal then
    update public.student_goals
       set practical_constraints =
             coalesce(practical_constraints, '{}'::jsonb)
             || '{"away_days": [{"day":"sun"}]}'::jsonb
     where user_id = v_user;
  else
    insert into public.student_goals (user_id, goal, content_locale, practical_constraints)
    values (v_user, 'health', 'en-GB', '{"away_days": [{"day":"sun"}]}'::jsonb);
  end if;

  update public.household_members
     set away_days = '[{"day":"thu"}]'::jsonb
   where member_id = v_owner;

  select r.away_days into v_away
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  select array_agg(e ->> 'source' order by e ->> 'source') into v_sources
  from jsonb_array_elements(v_away) as e;

  if jsonb_array_length(v_away) <> 2
     or v_sources <> array['household', 'self'] then
    raise exception
      'roster away_days: l''union rend % (sources %) au lieu des DEUX sources — '
      'l''arbitrage B est cassé, et une des deux personnes déclare dans le vide',
      v_away::text, coalesce(v_sources::text, 'NULL');
  end if;

  -- 4. LA SOURCE NE SE FALSIFIE PAS. Un client qui range son propre `source`
  --    dans la colonne se le fait écraser par le tag du roster.
  update public.household_members
     set away_days = '[{"day":"thu","source":"self"}]'::jsonb
   where member_id = v_kid;
  select r.away_days into v_away
  from public.keel_household_roster_for(v_user) r where r.member_id = v_kid;
  if v_away -> 0 ->> 'source' <> 'household' then
    raise exception
      'roster away_days: une source rangée par le client survit (%) — la trace '
      'du plan pourrait alors attribuer une absence à la mauvaise personne',
      v_away::text;
  end if;

  raise notice
    'household_presence: colonne, tag de source, union des deux déclarations '
    'et cas vide — les quatre gestes vérifiés';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
