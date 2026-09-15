-- KEEL — LE RÉGIME ALIMENTAIRE, PAR BOUCHE, ET LU PAR LE FOYER.
--
-- ── LES DEUX DÉFAUTS, ET ILS SE FERMENT ENSEMBLE ───────────────────────────
-- ① `generate-household-meal-v1` ne connaissait AUCUN régime — zéro occurrence
--    du mot dans tout le fichier. `dietary_regime.ts` (le moteur qui étend un
--    régime en groupes exclus et écrit sa consigne) n'était importé que par la
--    lane INDIVIDUELLE. Un maître végane qui compose pour son foyer recevait
--    donc de la viande: la question lui était posée, sa réponse écrite, et
--    RIEN ne la lisait sur le chemin majoritaire du produit.
-- ② Une bouche SANS COMPTE n'avait nulle part où porter un régime. Les trois
--    jetons vivent sur `student_safety_constraints`, clée sur `user_id`: un
--    enfant végétarien était INDÉCLARABLE.
--
-- Poser la question à une bouche dont personne ne lira la réponse serait pire
-- que ne pas la poser. Cette migration ferme ②; le moteur du foyer ferme ①.
--
-- ── R1 · UNE COLONNE, COMME `goal`, `birth_date` ET `eating_rhythm` ────────
-- Le patron par-bouche existe et il est éprouvé (`20260813190000`). Une table à
-- part pour une valeur SCALAIRE d'une liste FERMÉE serait une migration là où
-- une colonne suffit. Retour arrière: `drop column`.
--
-- ── R2 · UNE BOUCHE AVEC COMPTE: SON « ABOUT YOU » FAIT AUTORITÉ ───────────
-- Exactement la règle de `goal` (D1) et de `eating_rhythm`, résolue UNE SEULE
-- FOIS, ici, dans `keel_household_roster_for`. Deux vérités sur la même
-- personne divergent, et la divergence coûte un plat de viande servi à
-- quelqu'un qui a dit qu'il n'en mangeait pas.
--
-- ⚠️ LE COMPTE PORTE SA RÉPONSE À DEUX ENDROITS, ET IL FAUT LES DEUX. Une
-- ligne `student_safety_constraints` active (`kind='diet'`) porte les trois
-- régimes; « je mange de tout » n'a AUCUNE ligne à poser et vit dans
-- `student_goals.practical_constraints.diet_asked`. Ne lire que la table
-- rendrait `null` pour un omnivore déclaré — c'est-à-dire « on n'a jamais
-- demandé », ce qui est faux, et ce qui fait rédemander éternellement.
-- C'est mot pour mot la règle de `readDietAnswer` (`frontend/src/keel/api/
-- onboarding.ts`), recopiée ici parce que c'est ICI qu'elle est tranchée.
--
-- ── R3 · UN RÉGIME N'EST PAS UNE PRÉFÉRENCE ───────────────────────────────
-- C'est une ligne qu'on ne franchit pas. Il ne passe donc JAMAIS par la garde
-- du texte libre: liste FERMÉE de quatre jetons, vérifiée par un CHECK en base
-- ET par la porte d'écriture. Le parseur du moteur (`parseDietaryRegime`)
-- ignore en silence un jeton qu'il ne connaît pas — parfait pour lire, mais une
-- écriture qui accepte n'importe quoi laisse une ligne dont personne ne voit
-- qu'elle ne dit rien.
--
-- ⚠️ `omnivore` EST UNE RÉPONSE, PAS UNE ABSENCE, et c'est pour ça qu'il est
-- dans le CHECK. `null` veut dire « personne n'a demandé »; `omnivore` veut
-- dire « on a demandé, elle mange de tout ». Sur une question de sécurité
-- alimentaire ces deux-là ne sont pas la même chose — même piège que l'accusé
-- d'allergie, et il coûte la même chose.
--
-- ── POURQUOI LE ROSTER CHANGE DE SIGNATURE (encore) ───────────────────────
-- `RETURNS TABLE` fait partie du type de retour: Postgres refuse un
-- `create or replace` qui l'élargit. Les deux fonctions sont donc DROPPÉES et
-- recréées dans la même transaction, droits reposés derrière — `anon`
-- NOMMÉMENT, parce qu'un `revoke from public` le laisse armé (cicatrice
-- mesurée du dépôt) et qu'une recréation repart des privilèges par défaut, où
-- `authenticated` a TOUT.
--
-- IDEMPOTENTE, REJOUABLE.

-- ---------------------------------------------------------------------------
-- 1. La colonne
-- ---------------------------------------------------------------------------

alter table public.household_members
  add column if not exists diet text;

-- Le CHECK est posé à part et de façon rejouable: `add constraint if not
-- exists` n'existe pas en Postgres, et un `alter table ... add constraint` nu
-- ferait échouer la seconde exécution du fichier.
do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'household_members_diet_check'
       and conrelid = 'public.household_members'::regclass
  ) then
    alter table public.household_members
      add constraint household_members_diet_check
      check (diet is null or diet in (
        'omnivore', 'vegetarian', 'vegan', 'pescatarian'
      ));
  end if;
end
$do$;

comment on column public.household_members.diet is
  'Le régime de CETTE bouche, dans la liste fermée des quatre réponses de '
  'l''écran: `omnivore` · `vegetarian` · `vegan` · `pescatarian`. Les trois '
  'derniers sont ceux de `DIETARY_REGIMES` (`dietary_regime.ts`), le moteur qui '
  'les étend en groupes exclus; `omnivore` est une RÉPONSE (« je mange de '
  'tout »), pas une absence. `null` = personne n''a demandé — et la différence '
  'entre les deux est tout: elle vaut un plan de viande servi à un végétarien. '
  'N''est lu que pour une bouche SANS compte: dès qu''elle en a un, son régime '
  'vit dans son « about you » (`student_safety_constraints.diet_ref`, ou '
  '`practical_constraints.diet_asked` pour l''omnivore), et c''est '
  '`keel_household_roster_for` qui tranche.';

-- ---------------------------------------------------------------------------
-- 2. La porte d'écriture
-- ---------------------------------------------------------------------------
--
-- Mêmes refus que `keel_household_set_member_rhythm`, et dans le même ordre:
-- `not_your_line` avant `has_account`, parce qu'un secondaire qui vise la ligne
-- d'un enfant doit s'entendre dire qu'il n'est pas chez lui — pas qu'il
-- faudrait passer par un « about you » que l'enfant n'a pas.
--
-- ⚠️ PAS DE `no_household`, ET C'EST DÉLIBÉRÉ. Un appelant sans foyer ne trouve
-- pas la bouche (`= null` n'est jamais vrai) et s'entend dire `not_a_member`.
-- C'est le patron de `keel_household_set_member_habits`; un motif de plus
-- serait un motif de plus à traduire, pour une population qui ne peut pas
-- atteindre cet écran.
--
-- ⚠️ `has_account` N'EST PAS DANS LA LISTE DE LA SPEC, ET IL EST OBLIGATOIRE.
-- R2 fait que le roster NE LIT PAS la colonne d'une bouche qui a un compte.
-- Une porte qui accepterait cette écriture rangerait la réponse dans une
-- colonne que personne ne relit — un NO-OP SILENCIEUX, c'est-à-dire le mode
-- d'échec que ce dépôt documente le plus souvent. Le refus est la seule façon
-- de dire à l'écran « ce champ ne vit pas ici »; c'est exactement ce que
-- `keel_household_set_member_goal` fait depuis D1, et l'écran le lit pour
-- masquer le contrôle plutôt que d'afficher une promesse qui échoue.

create or replace function public.keel_household_set_member_diet(
  p_member uuid,
  p_diet text
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

  -- R3. LE VOCABULAIRE EST FERMÉ, ET IL EST VÉRIFIÉ ICI AUSSI. Le CHECK de la
  -- colonne refuserait déjà, mais il refuserait en LEVANT: l'écran recevrait
  -- une erreur Postgres brute au lieu d'un motif que la copie sait rendre.
  if p_diet is not null and p_diet not in (
    'omnivore', 'vegetarian', 'vegan', 'pescatarian'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_diet');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;
  -- R2/D1. La bouche a un compte: son régime vit dans SON « about you ».
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;

  update public.household_members
     set diet = p_diet
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_diet(uuid, text) is
  'Pose le régime d''une bouche SANS COMPTE, dans la liste fermée des quatre '
  'réponses (`omnivore` compris — c''est une réponse, pas une absence). `null` '
  'efface, et remet la bouche à « personne n''a demandé ». Refuse '
  '`not_authenticated`, `bad_diet` sur un jeton hors des quatre, '
  '`not_a_member`, `not_your_line`, et `has_account` — le régime d''un compte '
  'vit dans son « about you », et le roster ne lirait pas cette colonne.';

revoke all on function public.keel_household_set_member_diet(uuid, text)
  from public, anon;
grant execute on function public.keel_household_set_member_diet(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le résolveur — DROPPÉ et recréé, signature élargie
-- ---------------------------------------------------------------------------

drop function if exists public.keel_household_roster();
drop function if exists public.keel_household_roster_for(uuid);

create function public.keel_household_roster_for(p_user uuid)
returns table(
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text,
  away_days jsonb,
  own_plans jsonb,
  eating_rhythm jsonb,
  diet text
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
    coalesce(op.plans, '[]'::jsonb) as own_plans,
    -- ── LE RYTHME, TRANCHÉ ICI ET NULLE PART AILLEURS ──────────────────────
    -- EXACTEMENT la règle de `goal` deux colonnes plus haut, et c'est
    -- volontaire: une bouche avec compte porte ses moments dans son « about
    -- you », une bouche sans compte les porte sur sa ligne. `null` traverse —
    -- il veut dire « personne ne l'a dit », et c'est l'appelant qui décide que
    -- ça signifie « aux moments de la maison ».
    case
      when hm.user_id is null then hm.eating_rhythm
      else sg.practical_constraints -> 'eating_rhythm'
    end as eating_rhythm,
    -- ── R2 · LE RÉGIME, TRANCHÉ ICI ET NULLE PART AILLEURS ─────────────────
    -- La MÊME règle que `goal` et que le rythme, avec une seule différence, et
    -- elle est dans la source: le régime d'un COMPTE ne vit pas sur une
    -- colonne de `student_goals`, il vit sur DEUX supports qui disent la même
    -- chose par deux moyens.
    --
    --   · une ligne `student_safety_constraints` ACTIVE de `kind='diet'` porte
    --     `vegetarian` / `vegan` / `pescatarian`. Le filtre `status='active'`
    --     est celui de `loadSafetyConstraints`, et il est ici pour la même
    --     raison qu'il y est: une contrainte RÉTRACTÉE reste en base pour
    --     l'audit et doit cesser de mordre partout à la fois.
    --   · `practical_constraints.diet_asked` porte l'omnivore, parce qu'« aucune
    --     restriction » n'a AUCUNE ligne à poser. Sans lui, un omnivore déclaré
    --     serait rendu `null`, c'est-à-dire « on n'a jamais demandé ».
    --
    -- `order by` + `limit 1` plutôt qu'un agrégat: la lane individuelle prend
    -- la PREMIÈRE ligne de régime qu'elle trouve (`readDietAnswer`,
    -- `generate-meal-v1`), donc ce qu'il faut ici est une valeur, stable. La
    -- plus récente gagne — c'est la seule réponse qui se défend quand deux
    -- lignes coexistent, et l'ordre est total (`id` départage).
    case
      when hm.user_id is null then hm.diet
      else coalesce(
        (
          select sc.diet_ref
            from public.student_safety_constraints sc
           where sc.user_id = hm.user_id
             and sc.kind = 'diet'
             and sc.status = 'active'
             and sc.diet_ref in ('vegetarian', 'vegan', 'pescatarian')
           order by sc.created_at desc, sc.id desc
           limit 1
        ),
        case
          when sg.practical_constraints -> 'diet_asked' = 'true'::jsonb
            then 'omnivore'
        end
      )
    end as diet
  from public.household_members hm
  left join public.student_goals sg on sg.user_id = hm.user_id
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'starts_on', p.starts_on,
               'duration_days', p.duration_days,
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

create function public.keel_household_roster()
returns table(
  member_id uuid,
  user_id uuid,
  first_name text,
  age_state text,
  role text,
  goal text,
  away_days jsonb,
  eating_rhythm jsonb,
  diet text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select r.member_id, r.user_id, r.first_name, r.age_state, r.role, r.goal,
         r.away_days, r.eating_rhythm, r.diet
    from public.keel_household_roster_for((select auth.uid())) r;
$function$;

comment on function public.keel_household_roster_for(uuid) is
  'LE résolveur du foyer: une ligne par bouche, avec l''objectif, les absences, '
  'le rythme et le RÉGIME déjà tranchés entre le compte et la ligne. Aucun '
  'appelant ne refait cette résolution — deux lectures divergeraient, et sur le '
  'régime la divergence est un plat de viande servi à quelqu''un qui a dit '
  'qu''il n''en mangeait pas.';

-- ⚠️ LES DROITS SONT REPOSÉS, ET `anon` NOMMÉMENT. Une fonction recréée repart
-- des privilèges par défaut; `revoke from public` seul laisse `anon` armé
-- (cicatrice mesurée du dépôt).
revoke all on function public.keel_household_roster() from public, anon;
revoke all on function public.keel_household_roster_for(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_roster() to authenticated;
grant execute on function public.keel_household_roster_for(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Le contrôle — les gestes rejoués, puis annulés
-- ---------------------------------------------------------------------------
--
-- ⚠️ IL SE DONNE UNE IDENTITÉ. Sans `request.jwt.claims`, `auth.uid()` est nul
-- et TOUS les appels rendraient `not_authenticated`: le bloc serait vert en ne
-- prouvant rien. C'est la leçon de la migration des habitudes.
--
-- ⚠️ ET IL PROUVE UN CAS QUI PASSE. « Une garde qu'on n'a vue que refuser n'est
-- pas vérifiée »: le bloc écrit un régime pour de bon, le relit par le roster,
-- et REND LA MAIN par `rollback` — rien n'est laissé derrière.

do $do$
declare
  v_owner uuid;
  v_household uuid;
  v_mouth uuid;
  v_res jsonb;
  v_read text;
begin
  select hm.household_id, hm.user_id into v_household, v_owner
    from public.household_members hm
   where hm.role = 'owner' and hm.user_id is not null
     and exists (
       select 1 from public.household_members o
        where o.household_id = hm.household_id and o.user_id is null
     )
   limit 1;
  if v_household is null then
    raise notice 'keel_household_set_member_diet: aucun foyer avec une bouche sans compte — contrôle SAUTÉ';
    return;
  end if;
  select hm.member_id into v_mouth
    from public.household_members hm
   where hm.household_id = v_household and hm.user_id is null
   limit 1;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );

  v_res := public.keel_household_set_member_diet(v_mouth, 'chocolatarian');
  if v_res ->> 'reason' is distinct from 'bad_diet' then
    raise exception 'attendu bad_diet, reçu %', v_res;
  end if;

  v_res := public.keel_household_set_member_diet(
    '00000000-0000-0000-0000-000000000000'::uuid, 'vegan');
  if v_res ->> 'reason' is distinct from 'not_a_member' then
    raise exception 'attendu not_a_member, reçu %', v_res;
  end if;

  -- LE CAS QUI PASSE.
  v_res := public.keel_household_set_member_diet(v_mouth, 'vegetarian');
  if v_res ->> 'ok' is distinct from 'true' then
    raise exception 'attendu ok, reçu %', v_res;
  end if;
  select r.diet into v_read
    from public.keel_household_roster_for(v_owner) r
   where r.member_id = v_mouth;
  if v_read is distinct from 'vegetarian' then
    raise exception 'le roster ne rend pas le régime posé, reçu %', v_read;
  end if;

  -- LE MAÎTRE A UN COMPTE: sa ligne refuse, et c'est R2.
  v_res := public.keel_household_set_member_diet(
    (select hm.member_id from public.household_members hm
      where hm.household_id = v_household and hm.user_id = v_owner limit 1),
    'vegan');
  if v_res ->> 'reason' is distinct from 'has_account' then
    raise exception 'attendu has_account, reçu %', v_res;
  end if;

  raise notice 'keel_household_set_member_diet: contrôle VERT (bad_diet, not_a_member, ok+relecture, has_account)';
  -- On annule tout ce que le contrôle a écrit.
  raise exception using errcode = 'triggered_action_exception',
    message = 'ROLLBACK_DU_CONTROLE';
exception
  when triggered_action_exception then
    if sqlerrm <> 'ROLLBACK_DU_CONTROLE' then raise; end if;
end
$do$;
