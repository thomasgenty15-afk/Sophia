-- ============================================================================
-- D2 / D7 — LA PRISE DE MAIN
--
-- Décidé le 2026-08-12 (docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
-- lot L3). C'est la bascule du modèle révisé, et elle tient en trois phrases:
--
--   · LE PLAN DU MAÎTRE **EST** LE PLAN DU FOYER. Lui, plus toutes les bouches
--     sans compte, plus tout compte secondaire qui n'a pas pris la main.
--   · UN SECONDAIRE NE FAIT RIEN PAR DÉFAUT, et il est composé dans le plan du
--     maître comme une bouche ordinaire. C'est la posture NORMALE, pas un cas
--     dégradé: « la composition n'attend jamais personne » (D7).
--   · S'IL VEUT LA MAIN, il génère son propre plan (`generate-meal-v1`), et le
--     générateur du foyer doit alors l'EXCLURE de sa composition: il mange son
--     plan à lui.
--
-- CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE N'AJOUTE PAS
--   Elle ajoute UNE colonne au roster serveur: `own_plans`, les plans
--   PERSONNELS, VIVANTS et VALIDÉS que cette bouche porte DANS CE FOYER. Rien
--   d'autre. Aucune table, aucune écriture, aucun état: « a pris la main » se
--   DÉDUIT de lignes qui existent déjà (`student_generated_meals`), et un état
--   stocké serait un état qu'il faudrait tenir à jour — c'est-à-dire un
--   écrivain de plus à ne jamais oublier.
--
-- ⚠️ LA MOITIÉ QUI N'EST PAS ICI, ET C'EST DÉLIBÉRÉ
--   « Recouvre la fenêtre » n'est PAS calculé en base, parce que la base ne
--   connaît pas la fenêtre que le foyer s'apprête à composer — elle est résolue
--   côté serveur, dans le fuseau du maître, à partir de ce que le client
--   demande (`resolveRequestedWindow`). Passer la fenêtre en argument de cette
--   fonction ferait exactement le défaut que ce dépôt a déjà payé: « un
--   paramètre de garde optionnel est une garde désarmée » — le chat, qui lit le
--   même roster sans fenêtre, l'aurait laissé à `null` pour toujours.
--
--   La forme retenue est donc CELLE DE D14, à l'identique: la base rend le FAIT
--   par bouche (ici les plans, là l'union des absences), et un module PUR
--   applique la fenêtre (`_shared/keel/household_hand.ts`, comme
--   `household_presence.ts`). Chaque moitié vit à un seul endroit, et la moitié
--   qui décide est testable sans base — ce qui est la condition pour la muter.
--
-- LE PÉRIMÈTRE DE LA REQUÊTE, LIGNE PAR LIGNE, ET POURQUOI CHAQUE CLAUSE
--   `plan_kind = 'personal'`   le plan COMMUN n'est pas une prise de main: il
--                              est le plan que cette fonction sert à composer.
--   `validated_at is not null` D7 mot pour mot: « qui n'a pas de plan VALIDÉ au
--                              moment où le maître compose est automatiquement
--                              pris dans le plan du foyer ». Un brouillon qu'on
--                              n'a pas relu ne retire personne de la table.
--   `retired_at is null`       un plan remplacé n'est plus mangé par personne.
--   `household_id = hm.household_id`
--                              prendre la main est un geste fait DANS CE FOYER.
--                              Un plan écrit avant d'y entrer — ou orphelin
--                              parce que la résolution de foyer de
--                              `generate-meal-v1` a échoué, ce qu'elle trace —
--                              ne retire personne de la table. La direction de
--                              cette clause est la SÛRE: sans elle on exclut
--                              trop, et exclure quelqu'un à tort le laisse sans
--                              rien à manger.
--
-- POURQUOI LE ROSTER ET PAS UNE FONCTION À LUI
--   `keel_household_roster_for` est déjà LE résolveur du foyer: il résout
--   l'objectif effectif (D1) et l'absence effective (D14), et ses deux seuls
--   lecteurs — `generate-household-meal-v1` et `household_turn_context` —
--   passent par lui. Une seconde fonction ferait un second avis sur « qui est
--   dans ce foyer, et dans quel état », et la divergence serait silencieuse.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LE ROSTER SERVEUR GAGNE UNE COLONNE
-- ---------------------------------------------------------------------------
--
-- ⚠️ LE TYPE DE RETOUR CHANGE, donc `create or replace` ne suffit pas: il faut
-- DROPPER. L'ordre est une contrainte du moteur — `keel_household_roster()`
-- appelle `_for`, donc elle part la première (même geste qu'en 20260812130000).
--
-- ⚠️ DROPPER UNE FONCTION EFFACE SES PRIVILÈGES. La section 3 les repose, et ce
-- n'est pas de l'hygiène: `_for` prend l'identité en ARGUMENT, donc l'ouvrir à
-- `authenticated` serait le droit de lire le foyer de n'importe qui.
drop function if exists public.keel_household_roster();
drop function if exists public.keel_household_roster_for(uuid);

create or replace function public.keel_household_roster_for(p_user uuid)
returns table (
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text,
  away_days jsonb,
  own_plans jsonb
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
    -- que le maître a marqué ensuite.
    public.keel_away_tagged(sg.practical_constraints -> 'away_days', 'self')
      || public.keel_away_tagged(hm.away_days, 'household') as away_days,
    -- D2/D7. LES PLANS QUI POURRAIENT RETIRER CETTE BOUCHE DE LA TABLE.
    --
    -- « Pourraient », pas « retirent »: la fenêtre décide, et elle est
    -- appliquée par `household_hand.ts`. Ce qui est rendu ici est la liste des
    -- CANDIDATS, déjà filtrée sur tout ce que la base peut voir seule.
    --
    -- Une bouche SANS COMPTE rend `[]` sans branche conditionnelle:
    -- `p.user_id = hm.user_id` n'est jamais vrai quand `hm.user_id` est nul.
    -- C'est le cas nominal d'un enfant (D3: les bouches sans compte n'ont pas
    -- de plan individuel), et il ne mérite pas un `case`.
    coalesce(op.plans, '[]'::jsonb) as own_plans
  from public.household_members hm
  left join public.student_goals sg on sg.user_id = hm.user_id
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'starts_on', p.starts_on,
               'duration_days', p.duration_days,
               -- RENDUE POUR LA TRACE, pas pour la décision — la décision est
               -- la clause `is not null` juste en dessous. Sans elle, « depuis
               -- quand cette personne a-t-elle la main ? » n'a pas de réponse
               -- trois jours plus tard, et L4 en a besoin pour détecter une
               -- validation POSTÉRIEURE à une fusion (D8).
               'validated_at', p.validated_at
             )
             order by p.starts_on
           ) as plans
      from public.student_generated_meals p
     where p.user_id = hm.user_id
       and p.household_id = hm.household_id
       and p.plan_kind = 'personal'
       and p.validated_at is not null
       and p.retired_at is null
  ) op on true
  -- LA GARDE, portée par l'ARGUMENT. Un `p_user` nul rend zéro ligne:
  -- `keel_household_of(null)` est nul, et `= null` n'est jamais vrai.
  where hm.household_id = public.keel_household_of(p_user)
  order by (hm.role = 'owner') desc, hm.joined_at;
$function$;

-- ---------------------------------------------------------------------------
-- 2. LE ROSTER DU NAVIGATEUR NE BOUGE PAS D'UN CHAMP
-- ---------------------------------------------------------------------------
--
-- ⚠️ `select *` AURAIT PROPAGÉ LA COLONNE AU NAVIGATEUR, et ce n'est pas ce
-- qu'on veut — mais PAS pour la raison qu'on croit. Soyons exacts:
--
--   CE N'EST PAS UN SECRET QU'ON PROTÈGE. La policy
--   `student_generated_meals_household_read` laisse DÉJÀ tout membre du foyer
--   lire, en clair et par PostgREST, chaque ligne portant son `household_id` —
--   donc les plans personnels de ses co-membres, plats compris. Prétendre ici
--   fermer une porte déjà ouverte serait un commentaire faux, et un commentaire
--   faux est pire qu'aucun.
--
--   CE QU'ON NE VEUT PAS, C'EST BOUGER LA FORME DU NAVIGATEUR pour un besoin
--   SERVEUR. `frontend/src/keel/api/household.ts` lit cette fonction; élargir
--   sa sortie en passant, sans qu'un seul écran l'ait demandé, est le genre
--   d'élargissement qu'on ne relit plus. Ce que l'écran montrera d'une prise de
--   main est une décision de L8 (D9), pas un effet de bord de L3.
--
-- Les colonnes sont donc énumérées. Ce sont EXACTEMENT les sept d'avant.
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
  select r.member_id, r.user_id, r.first_name, r.age_state, r.role, r.goal,
         r.away_days
    from public.keel_household_roster_for((select auth.uid())) r;
$function$;

comment on function public.keel_household_roster_for(uuid) is
  'Le roster du foyer de p_user, pour les appelants SERVEUR (service_role), où '
  'auth.uid() est NULL. Le prénom et l''âge viennent de la LIGNE MEMBRE. '
  'L''OBJECTIF vient de `student_goals` dès que la bouche a un compte (D1, '
  '2026-08-11). L''ABSENCE est l''UNION des deux sources (D14, 2026-08-12), '
  'chaque entrée portant sa `source`. `own_plans` (D2/D7, 2026-08-12) rend les '
  'plans PERSONNELS, VIVANTS, VALIDÉS et RATTACHÉS À CE FOYER que la bouche '
  'porte — c''est-à-dire les CANDIDATS à une prise de main, pas la prise de '
  'main elle-même: c''est le RECOUVREMENT DE LA FENÊTRE qui décide, et il est '
  'appliqué dans _shared/keel/household_hand.ts, qui est le seul endroit où '
  'cette règle-là est écrite. La base ne connaît pas la fenêtre que le foyer '
  'compose; la lui passer en argument optionnel ferait une garde désarmée le '
  'jour où un appelant l''omet.';

comment on function public.keel_household_roster() is
  'Le roster du foyer de l''appelant. Délègue à keel_household_roster_for; '
  'aucune règle n''est écrite ici, exprès — le navigateur et le serveur '
  'doivent lire le même foyer, absences comprises. '
  'NE REND PAS `own_plans`: c''est un besoin de COMPOSITION (serveur), et ce '
  'que l''écran montre d''une prise de main est une décision de L8, pas un '
  'effet de bord. Les colonnes sont énumérées plutôt que `select *` pour '
  'qu''une colonne ajoutée au roster serveur ne parte pas au navigateur par '
  'accident. (Ce n''est PAS un secret: la policy '
  'student_generated_meals_household_read laisse déjà un membre lire les plans '
  'de son foyer.)';

-- ---------------------------------------------------------------------------
-- 3. LES PRIVILÈGES — REPOSÉS, PARCE QUE LE DROP LES A EFFACÉS
-- ---------------------------------------------------------------------------
--
-- Deux cicatrices du dépôt, rejouées ici: `revoke from public` NE RETIRE PAS
-- `anon`, et toute fonction NEUVE est exécutable par tout le monde par défaut.
revoke all on function public.keel_household_roster() from public, anon;
revoke all on function public.keel_household_roster_for(uuid) from public, anon, authenticated;

grant execute on function public.keel_household_roster() to authenticated;
-- Serveur uniquement: c'est tout l'objet de la version à argument.
grant execute on function public.keel_household_roster_for(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. CONTRÔLE FINAL — ON REJOUE LES GESTES
-- ---------------------------------------------------------------------------
--
-- Inspecter le catalogue prouverait que la colonne existe, pas qu'elle se
-- remplit. On monte un foyer, on écrit un plan personnel, on le valide, on
-- relit le roster, et on annule tout.
--
-- LE CAS QUI PASSE EST VÉRIFIÉ EN PREMIER, et c'est le plus important de tout
-- le lot: une bouche SANS plan validé rend `[]`. Une garde qui exclut tout le
-- monde est indiscernable d'une garde qui marche — sauf par ce cas-là.
--
-- LA FENÊTRE DE TEST EST EN 2099: la contrainte d'exclusion refuse deux plans
-- personnels vivants qui se chevauchent, et cette base est PARTAGÉE. On ne veut
-- pas se heurter au plan réel d'un compte réel, ni le déplacer.
do $$
declare
  v_user uuid;
  v_house uuid;
  v_other_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_plan uuid;
  v_plans jsonb;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'household_hand: aucun utilisateur, contrôle sauté';
    return;
  end if;
  if public.keel_household_of(v_user) is not null then
    raise notice 'household_hand: % déjà dans un foyer, contrôle sauté', v_user;
    return;
  end if;

  insert into public.households (name, created_by)
  values ('__qa_hand__', v_user) returning id into v_house;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, v_user, 'owner', 'Owner', '1990-01-01')
  returning member_id into v_owner;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, null, 'member', 'Lea', current_date - interval '8 years')
  returning member_id into v_kid;

  -- 1. LE CAS QUI PASSE. Personne n'a de plan: `[]`, jamais `null`. Un `null`
  --    ici ferait tomber le parseur sur son repli — qui rend le même résultat
  --    aujourd'hui, et masquerait donc le jour où la colonne cesse d'être
  --    remplie.
  select r.own_plans into v_plans
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  if v_plans is null or v_plans <> '[]'::jsonb then
    raise exception
      'roster own_plans: une bouche sans plan rend %, pas [] — le repli du '
      'parseur masquerait une colonne qui cesse d''être lue',
      coalesce(v_plans::text, 'NULL');
  end if;

  -- 2. UNE BOUCHE SANS COMPTE N'A JAMAIS DE PLAN (D3). Pas de branche dans la
  --    requête: la jointure sur un `user_id` nul ne rend rien.
  select r.own_plans into v_plans
  from public.keel_household_roster_for(v_user) r where r.member_id = v_kid;
  if v_plans <> '[]'::jsonb then
    raise exception
      'roster own_plans: une bouche SANS COMPTE rend % — une bouche sans '
      'compte n''a pas de plan individuel (D3), et lui en prêter un la '
      'retirerait de la table du foyer', v_plans::text;
  end if;

  -- 3. UN PLAN NON VALIDÉ NE COMPTE PAS (D7). C'est la clause la plus facile à
  --    perdre, et la perdre ferait attendre la composition — l'inverse exact de
  --    « la composition n'attend jamais personne ».
  insert into public.student_generated_meals
    (user_id, starts_on, duration_days, scope, mode, content_locale,
     household_id, plan_kind)
  values (v_user, date '2099-01-05', 7, 'several_days', 'to_shop', 'en',
          v_house, 'personal')
  returning id into v_plan;

  select r.own_plans into v_plans
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  if v_plans <> '[]'::jsonb then
    raise exception
      'roster own_plans: un plan NON VALIDÉ remonte (%) — un brouillon qu''on '
      'n''a pas relu retirerait quelqu''un du dîner de toute la maison (D7)',
      v_plans::text;
  end if;

  -- 4. VALIDÉ, IL REMONTE — avec sa fenêtre, sinon le recouvrement ne peut pas
  --    se calculer côté serveur.
  update public.student_generated_meals
     set validated_at = now() where id = v_plan;

  select r.own_plans into v_plans
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  if jsonb_array_length(v_plans) <> 1
     or (v_plans -> 0 ->> 'id')::uuid <> v_plan
     or v_plans -> 0 ->> 'starts_on' <> '2099-01-05'
     or (v_plans -> 0 ->> 'duration_days')::int <> 7
     or v_plans -> 0 ->> 'validated_at' is null then
    raise exception
      'roster own_plans: un plan validé rend % — sans id ni fenêtre, la prise '
      'de main ne peut ni se calculer ni se relire', v_plans::text;
  end if;

  -- 5. RETIRÉ, IL DISPARAÎT. Un plan remplacé n'est mangé par personne.
  update public.student_generated_meals
     set retired_at = now() where id = v_plan;
  select r.own_plans into v_plans
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  if v_plans <> '[]'::jsonb then
    raise exception
      'roster own_plans: un plan RETIRÉ remonte encore (%) — il retirerait de '
      'la table quelqu''un dont le plan a été remplacé', v_plans::text;
  end if;

  -- 6. LE PLAN COMMUN N'EST PAS UNE PRISE DE MAIN. Sans cette clause, le plan
  --    du foyer de la semaine dernière ferait sortir le maître de son propre
  --    plan.
  update public.student_generated_meals
     set retired_at = null, plan_kind = 'household' where id = v_plan;
  select r.own_plans into v_plans
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  if v_plans <> '[]'::jsonb then
    raise exception
      'roster own_plans: un plan COMMUN remonte comme personnel (%) — le plan '
      'du foyer retirerait des bouches du plan du foyer', v_plans::text;
  end if;

  -- 7. UN PLAN D'UN AUTRE FOYER NE COMPTE PAS. Prendre la main est un geste
  --    fait DANS CE FOYER: un plan écrit avant d'y entrer, ou orphelin parce
  --    que la résolution de foyer de `generate-meal-v1` a échoué, ne retire
  --    personne de cette table. Sans cette clause, l'exclusion s'élargit — et
  --    exclure à tort laisse quelqu'un sans rien à manger.
  insert into public.households (name, created_by)
  values ('__qa_hand_other__', v_user) returning id into v_other_house;

  insert into public.student_generated_meals
    (user_id, starts_on, duration_days, scope, mode, content_locale,
     household_id, plan_kind, validated_at)
  values (v_user, date '2099-02-02', 7, 'several_days', 'to_shop', 'en',
          v_other_house, 'personal', now());

  select r.own_plans into v_plans
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  if v_plans <> '[]'::jsonb then
    raise exception
      'roster own_plans: un plan rattaché à un AUTRE foyer remonte (%) — il '
      'retirerait de la table quelqu''un qui n''a rien décidé ici',
      v_plans::text;
  end if;

  raise notice
    'household_hand: cas vide, bouche sans compte, non validé, validé, retiré, '
    'plan commun et plan d''un autre foyer — les sept gestes vérifiés';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
