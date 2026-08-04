-- ============================================================================
-- LE COACH MAISON — un vrai coach, pour que l'inscription libre n'ait besoin
-- d'AUCUNE exception.
--
-- LE PROBLÈME
-- -----------
-- Un compte créé sans invitation se heurte à trois dépendances dures, et aucune
-- n'est un oubli : `keel_role` (posé seulement par l'acceptation d'invitation),
-- un lien `coach_clients` actif (`generate-week-plan-v1` → 409 `no_coach`), et
-- une doctrine publiée (→ 409 `coach_has_no_doctrine`). Sans coach, la boucle
-- centrale du produit est fermée.
--
-- DEUX FAÇONS DE L'OUVRIR, ET ELLES NE SE VALENT PAS
-- --------------------------------------------------
-- Rendre le coach OPTIONNEL obligerait à traiter « élève sans coach » dans le
-- chemin photo, le générateur de semaine, la synthèse hebdo, la facturation, les
-- vues de tenancy et la garde d'accès : six endroits, six occasions d'oublier,
-- et chaque nouvelle surface hériterait de la dette.
--
-- FABRIQUER un coach satisfait les trois dépendances avec zéro exception à
-- propager : l'inscrit libre est un élève ORDINAIRE d'un coach ORDINAIRE. Tout
-- le reste du produit ne sait même pas qu'il existe.
--
-- CE QUI DEVIENT ALORS LE VRAI SUJET : LA FACTURATION
-- --------------------------------------------------
-- Le modèle facture le coach PAR ÉLÈVE ACTIF. Un coach maison branché
-- naïvement, c'est une facture qui grossit à chaque curieux. Trois verrous
-- structurels sont posés ici, et chacun ferme un défaut MESURÉ sur la base
-- locale avant d'écrire une ligne :
--
--   1. `keel_coach_is_solvent()` — un coach maison est solvable PAR NATURE.
--      Sans ça : `_trg_coaches_default_trial_end` lui pose un essai de 14 jours,
--      et à J+15 `recompute_profile_access_tier` fait retomber l'`access_tier`
--      de TOUS ses inscrits à 'none'. Paywall silencieux, deux semaines après la
--      mise en service, sur des comptes qui ne peuvent rien payer.
--
--   2. `_trg_coach_clients_enforce_trial_cap` — plafond d'essai levé pour la
--      maison. Sans ça : le 4ᵉ inscrit libre est REFUSÉ à l'écriture
--      (`keel_trial_seat_limit_reached`, `trial_seat_limit = 3`).
--
--   3. `keel_coach_seat_ledger()` — un siège maison n'est JAMAIS un siège
--      facturable. C'est la définition UNIQUE de « siège facturable » dans ce
--      dépôt : la mettre là, et pas dans `stripe-reconcile-seats`, c'est ce qui
--      fait que toute surface future (page de facturation du coach, un futur
--      export comptable) hérite de l'exclusion au lieu de devoir s'en souvenir.
--
-- Note d'architecture qui n'est pas une note : les points 1 et 3 vont dans des
-- directions OPPOSÉES et c'est voulu. Le point 1 donne l'accès, le point 3
-- retire la facturation. C'est la séparation que `recompute_profile_access_tier`
-- documente déjà — « Billing decides what we charge, never what the student is
-- allowed to execute » — et le coach maison est le premier cas où les deux
-- réponses diffèrent vraiment.
--
-- COMMENT ON LE DÉSIGNE
-- ---------------------
-- `coaches.coach_kind`, liste fermée, et un index unique partiel qui garantit
-- qu'il n'y en a QU'UN. Pas un UUID en dur dans le code, pas une variable
-- d'environnement : ni l'un ni l'autre ne survit à un `db reset` local ou à un
-- environnement neuf. Les deux UUID en dur de ce fichier sont le SEUL endroit du
-- dépôt qui les connaît ; tout le code résout par `coach_kind = 'house'`.
--
-- L'index unique n'est pas de la coquetterie : `generate-week-plan-v1:123` prend
-- `.limit(1)` sur les liens actifs, et §3 de la mission décrit exactement ce que
-- coûte un choix silencieux entre deux candidats. Un deuxième coach maison
-- rendrait « le » coach maison ambigu partout ; la base refuse.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La désignation
-- ---------------------------------------------------------------------------

alter table public.coaches
  add column if not exists coach_kind text not null default 'human';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.coaches'::regclass
       and conname = 'coaches_coach_kind_check'
  ) then
    alter table public.coaches
      add constraint coaches_coach_kind_check
      check (coach_kind in ('human', 'house'));
  end if;
end;
$$;

-- UN SEUL coach maison, garanti par la base et pas par la discipline.
create unique index if not exists coaches_one_house_coach
  on public.coaches ((coach_kind))
  where coach_kind = 'house';

comment on column public.coaches.coach_kind is
  'human = un vrai coach qui paie et prescrit. house = LE coach maison de '
  'l''inscription libre: jamais facturé (keel_coach_seat_ledger), solvable par '
  'nature (keel_coach_is_solvent), hors plafond d''essai. Index unique partiel: '
  'il n''y en a qu''un, sinon « le » coach maison serait ambigu.';

-- ---------------------------------------------------------------------------
-- 2. Solvabilité — un coach maison l'est par nature
-- ---------------------------------------------------------------------------

create or replace function public.keel_coach_is_solvent(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.coaches c
    left join public.subscriptions s on s.user_id = c.user_id
    where c.id = p_coach_id
      and c.status = 'active'
      and (
        -- LE COACH MAISON, ET C'EST LA PREMIÈRE CONDITION LUE.
        --
        -- Il n'a pas d'abonnement et n'en aura jamais. Sans cette ligne, il
        -- retombe sur `trial_ends_at`, que `_trg_coaches_default_trial_end`
        -- pose à now() + 14 jours à l'insertion — donc tous ses inscrits
        -- libres perdent leur `access_tier` à J+15, silencieusement, et le
        -- seul symptôme est un paywall sur des comptes gratuits.
        --
        -- CONDITION DE DÉSARMEMENT (P9): cette branche ne s'applique QU'À
        -- coach_kind = 'house'. Un coach humain qui cesse de payer redevient
        -- insolvable exactement comme avant — ce que le test 4 de
        -- billing_seats_test.sql continue de prouver.
        c.coach_kind = 'house'
        or (
          lower(coalesce(s.status, '')) in ('active','trialing')
          and (s.current_period_end is null or now() < s.current_period_end)
        )
        or (c.trial_ends_at is not null and now() < c.trial_ends_at)
      )
  );
$function$;

comment on function public.keel_coach_is_solvent(uuid) is
  'Le coach peut-il porter des sièges ? Abonnement vivant, essai en cours, OU '
  'coach maison (qui n''a pas d''abonnement par construction: sans cette '
  'branche ses inscrits libres perdent access_tier à J+15).';

-- ---------------------------------------------------------------------------
-- 3. Plafond d'essai — la maison n'est pas en essai
-- ---------------------------------------------------------------------------

create or replace function public._trg_coach_clients_enforce_trial_cap()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_limit integer;
  v_live integer;
  v_paying boolean;
  v_kind text;
begin
  if new.status not in ('invited','active') then
    return new;
  end if;
  -- Nothing new is being occupied by this write.
  if tg_op = 'UPDATE' and old.status in ('invited','active') then
    return new;
  end if;

  -- LE COACH MAISON N'EST PAS EN ESSAI, il est gratuit.
  --
  -- Le plafond existe pour empêcher un coach d'exploiter un essai gratuit à
  -- 40 élèves. Appliqué à la maison, il refuse le 4ᵉ INSCRIT LIBRE avec
  -- `keel_trial_seat_limit_reached` — une erreur d'écriture, au moment de
  -- l'inscription, sur le seul chemin que ce lot existe pour ouvrir.
  --
  -- CONDITION DE DÉSARMEMENT: uniquement `coach_kind = 'house'`. Le plafond
  -- reste armé à l'identique pour tout coach humain (tests 17 et 18 de
  -- billing_seats_test.sql).
  select c.coach_kind into v_kind
  from public.coaches c where c.id = new.coach_id;
  if v_kind = 'house' then
    return new;
  end if;

  select exists (
    select 1
    from public.coaches c
    join public.subscriptions s on s.user_id = c.user_id
    where c.id = new.coach_id
      and lower(coalesce(s.status,'')) in ('active','trialing')
      and (s.current_period_end is null or now() < s.current_period_end)
  ) into v_paying;

  if v_paying then
    return new;
  end if;

  select c.trial_seat_limit into v_limit
  from public.coaches c where c.id = new.coach_id;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_live
  from public.coach_clients cc
  where cc.coach_id = new.coach_id
    and cc.status in ('invited','active')
    and cc.id <> new.id;

  if v_live >= v_limit then
    raise exception
      'keel_trial_seat_limit_reached: coach % is on trial and already has % live seats (limit %)',
      new.coach_id, v_live, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Le registre des sièges — un siège maison n'est jamais facturable
-- ---------------------------------------------------------------------------

create or replace function public.keel_coach_seat_ledger(
  p_coach_id uuid,
  p_month date default null
)
returns table (
  -- Le nom des colonnes de sortie fait partie de la SIGNATURE: `create or
  -- replace` refuse de renommer un paramètre OUT. Il doit rester
  -- `coach_client_id`, tel que W10 l'a nommé.
  coach_client_id uuid,
  student_user_id uuid,
  seat_state text,
  link_status text,
  interaction_count integer,
  is_active_seat boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  with bounds as (
    select
      date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date))::timestamptz as m_from,
      (date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date)) + interval '1 month')::timestamptz as m_to
  ),
  coach as (
    select c.coach_kind from public.coaches c where c.id = p_coach_id
  )
  select
    cc.id,
    cc.student_user_id,
    cc.seat_state,
    cc.status,
    coalesce(
      public.keel_student_interaction_count(cc.student_user_id, b.m_from, b.m_to),
      0
    )::integer,
    (
      -- UN SIÈGE MAISON N'EST JAMAIS FACTURABLE, et la règle est ICI.
      --
      -- C'est la définition unique de « siège facturable » du dépôt:
      -- `stripe-reconcile-seats` la lit, la page de facturation du coach la lit
      -- (keel_my_seat_ledger), et toute surface future l'héritera sans avoir à
      -- se souvenir du cas maison. La mettre dans la fonction edge aurait
      -- laissé les écrans compter des sièges que Stripe ne facture pas — un
      -- écart qui ne se voit qu'à la première facture.
      --
      -- Le compte d'interactions reste RENSEIGNÉ (colonne ci-dessus): on veut
      -- savoir que les inscrits libres utilisent le produit. C'est le
      -- caractère FACTURABLE qu'on nie, pas l'activité.
      (select coach.coach_kind from coach) is distinct from 'house'
      and cc.status = 'active'
      and cc.student_user_id is not null
      and coalesce(
            public.keel_student_interaction_count(cc.student_user_id, b.m_from, b.m_to),
            0
          ) >= public.keel_active_student_threshold()
    )
  from public.coach_clients cc
  cross join bounds b
  where cc.coach_id = p_coach_id
    and cc.status in ('invited','active','paused');
$function$;

comment on function public.keel_coach_seat_ledger(uuid, date) is
  'Registre des sièges d''un coach pour un mois. is_active_seat est la '
  'définition UNIQUE de « siège facturable »: toujours faux pour un coach '
  'maison, dont les inscrits libres ne doivent générer aucune ligne de '
  'facturation. L''activité reste comptée, seule la facturabilité est niée.';

-- ---------------------------------------------------------------------------
-- 5. L'identité du coach maison
--
-- Les DEUX seuls UUID en dur du chantier. Ils sont ici parce qu'une migration
-- rejouable a besoin d'une clé stable, et nulle part ailleurs: tout le code
-- résout par `coach_kind = 'house'`.
--
-- ── POURQUOI UN COMPTE AUTH, ET POURQUOI IL EST INUTILISABLE ─────────────
-- `coaches.user_id` est NOT NULL et référence `auth.users`. Il FAUT donc un
-- compte. Mais personne ne doit pouvoir s'y connecter: ce compte lit, par RLS,
-- les données de tous les inscrits libres.
--
--   · `encrypted_password` NULL + aucune ligne `auth.identities`
--     → connexion par mot de passe impossible.
--   · email en `@keel.invalid` — TLD réservé par la RFC 2606, donc NON
--     ROUTABLE: un lien de réinitialisation ne peut arriver dans aucune boîte.
--     C'est le point important, et il est plus solide qu'un mot de passe fort:
--     il n'y a pas de canal de récupération à attaquer.
--   · `banned_until` très loin → GoTrue refuse l'authentification même si un
--     chemin nous avait échappé. Ceinture, pas mécanisme.
--
-- Rien de tout ça ne gêne le produit: aucune fonction n'a besoin de
-- s'authentifier COMME le coach maison, elles le résolvent par son `id`.
--
-- ── `email_confirmed_at` RESTE NULL, ET CE N'EST PAS UN OUBLI ─────────────
-- `auth.users` porte un SECOND trigger:
-- `on_auth_user_email_confirmed_send_onboarding`, qui part AUSSI sur INSERT dès
-- que `email_confirmed_at` est non nul, et qui POSTe sur `send-welcome-email`.
-- Insérer le coach maison avec un email « confirmé » aurait donc envoyé un mail
-- de bienvenue à `discovery@keel.invalid` — un envoi sortant déclenché par une
-- MIGRATION, à chaque environnement neuf, vers un domaine non routable. Le
-- trigger sort immédiatement quand la colonne est NULL: on la laisse NULL.
-- Personne n'a besoin que ce compte soit confirmé, il ne se connecte jamais.
-- ---------------------------------------------------------------------------

do $$
declare
  v_user_id  uuid := '00000000-0000-4000-8000-00000000c0ac';
  v_coach_id uuid := '00000000-0000-4000-8000-00000000d15c';
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, banned_until,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  values (
    v_user_id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'discovery@keel.invalid',
    null, null, timestamptz '2999-01-01',
    now(), now(),
    '{"provider":"none","providers":[]}'::jsonb,
    jsonb_build_object('full_name', 'KEEL Discovery', 'locale', 'en-US')
  )
  on conflict (id) do nothing;

  -- `handle_new_user()` a créé le profil au passage. On corrige ce qui vient de
  -- ses défauts legacy et RIEN d'autre.
  --
  -- `country` reste NULL, DÉLIBÉRÉMENT: sur le chemin d'invitation, le pays du
  -- coach est hérité par l'élève (migration 20260804180000). Le coach maison
  -- n'exerce dans aucun pays; lui en donner un, c'est distribuer une hotline
  -- arbitraire à tous les inscrits libres. Le pays de l'inscrit libre est
  -- DÉCLARÉ par lui, et écrit au même endroit (migration suivante).
  update public.profiles
     set locale = 'en-US',
         full_name = 'KEEL Discovery',
         country = null,
         updated_at = now()
   where id = v_user_id;

  insert into public.coaches (
    id, user_id, display_name, credential_type, status, coach_kind
  )
  values (
    v_coach_id, v_user_id, 'KEEL Discovery', 'none', 'active', 'house'
  )
  on conflict (id) do update
     set coach_kind = 'house',
         display_name = 'KEEL Discovery',
         status = 'active';

  -- ── LA DOCTRINE MAISON ────────────────────────────────────────────────
  --
  -- QUI LA SIGNE: KEEL, la société, sous le nom « KEEL Discovery ». PAS un
  -- coach fictif. Inventer une personne — un nom, un titre, une crédibilité —
  -- pour porter des conseils nutritionnels serait fabriquer une autorité qui
  -- n'existe pas, sur le seul sujet où le produit ne doit jamais être
  -- l'autorité. `credential_type = 'none'` dit la même chose dans la base.
  --
  -- CE QU'ELLE CONTIENT: des principes GÉNÉRAUX de comportement alimentaire,
  -- vérifiables, sans prescription individuelle et sans allégation de santé.
  -- Aucune quantité, aucun macro, aucun objectif de poids, aucune pathologie.
  --
  -- CE QU'ELLE NE CONTIENT PAS, et c'est un choix: `foods` est VIDE des deux
  -- côtés. Recommander ou déconseiller des aliments nommés, sans connaître la
  -- personne, c'est exactement la posture d'autorité nutritionnelle qu'on
  -- refuse. Le verrou aliments n'a donc rien à faire valoir ici — et c'est
  -- honnête plutôt que décoratif.
  --
  -- LES DEUX `forbidden` SONT LE CŒUR DE LA PRUDENCE. Le verrou de sortie
  -- remplace une réponse qui les endosse par le texte `instead`, mot pour mot.
  -- C'est le seul mécanisme du produit qui peut GARANTIR qu'une découverte
  -- gratuite ne promet pas un résultat et ne conseille pas autour d'une
  -- maladie. Et chaque `instead` renvoie vers un vrai coach, ce qui est la
  -- vérité: c'est là qu'est le produit.
  insert into public.coach_doctrines (
    coach_id, version, beliefs, forbidden, vocabulary, arbitrations,
    foods, qa, voice, content_locale, published_at, change_note
  )
  values (
    v_coach_id, 1,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'whole_foods_first',
        'claim', 'Build meals mostly from foods you could recognise as they grow or as they are raised.',
        'rationale', 'It is the one habit that holds when life gets busy, because it is a rule about the shopping list rather than about willpower.'
      ),
      jsonb_build_object(
        'key', 'protein_at_every_meal',
        'claim', 'Put a source of protein in every meal.',
        'rationale', 'It is the part of a meal people most often leave out, and the part that makes the next few hours easier to get through without grazing.'
      ),
      jsonb_build_object(
        'key', 'regular_meals_beat_perfect_meals',
        'claim', 'Eating at roughly the same times each day matters more than any single meal being ideal.',
        'rationale', 'Regularity is what turns eating into something you no longer think about; perfection is what makes people quit in week two.'
      ),
      jsonb_build_object(
        'key', 'one_change_at_a_time',
        'claim', 'Change one thing, and keep it for two weeks before changing anything else.',
        'rationale', 'Several changes at once make it impossible to know which one helped, so nothing is learned and nothing is kept.'
      ),
      jsonb_build_object(
        'key', 'a_missed_day_is_data',
        'claim', 'A day that went badly is information about your week, not a verdict on you.',
        'rationale', 'Treating it as a failure is what turns one hard day into an abandoned month.'
      ),
      jsonb_build_object(
        'key', 'this_is_a_discovery_program',
        'claim', 'This is KEEL''s general discovery program, not a coach who knows you.',
        'rationale', 'Anything that depends on your history, your training or your health belongs to a real coach, and saying so is part of the method rather than a disclaimer.'
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'token', 'promised_result_or_timeline',
        'surfaceForms', jsonb_build_array(
          'you will lose', 'you''ll lose', 'guaranteed', 'in just two weeks',
          'kilos in', 'pounds in', 'expect to lose', 'results in'
        ),
        'reason', 'A discovery program knows nothing about this person, so any promised outcome or timeline is invented.',
        'instead', 'I can''t promise you a result or a timeline — I don''t know your history, and anyone who does promise that is guessing. What this program can do is help you keep a few general habits and see what changes for you. If you want targets that are actually yours, that is what a real coach on KEEL is for.'
      ),
      jsonb_build_object(
        'token', 'advice_around_a_medical_condition',
        'surfaceForms', jsonb_build_array(
          'for your diabetes', 'to lower your cholesterol', 'will cure',
          'instead of your medication', 'treat your', 'for your condition'
        ),
        'reason', 'General principles must never be dressed up as care for a named condition, and this program has no clinician behind it.',
        'instead', 'That part belongs with someone who knows your medical situation — your doctor, or a coach who has your history. I''d rather tell you that than give you something general and let it sound like it was meant for you.'
      )
    ),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'situation', 'The student says they ate badly for three days and wants to start over on Monday.',
        'coachAnswer', 'You don''t need a fresh start, you need your next meal. Monday isn''t a reset button — it''s just four days of nothing. Put a normal lunch together today and the three days behind you stop mattering.',
        'source', 'test_mode'
      ),
      jsonb_build_object(
        'situation', 'The student asks what the program thinks of a diet a friend recommended.',
        'coachAnswer', 'I can''t judge it for you — I don''t know you, and most of those plans work for the same boring reason: they get people eating regular meals made of real food. If that''s what it does, it isn''t a bad thing to borrow.',
        'source', 'test_mode'
      )
    ),
    jsonb_build_object('recommended', '[]'::jsonb, 'discouraged', '[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object(
        'question', 'Is coffee a problem?',
        'answer', 'Not on its own. If it is replacing a meal, the meal is the thing worth looking at.',
        'source', 'coach_edit'
      ),
      jsonb_build_object(
        'question', 'Do I need to weigh my food?',
        'answer', 'Not for this program. It asks about what the meal was made of, not how much it weighed.',
        'source', 'coach_edit'
      ),
      jsonb_build_object(
        'question', 'How is this different from having a coach?',
        'answer', 'A coach has a method of their own and knows your history; this is a general starting point that knows neither. When something depends on you specifically, it will tell you so instead of guessing.',
        'source', 'coach_edit'
      )
    ),
    jsonb_build_object('length', 'short', 'emojis', 'none', 'language', 'English'),
    'en-US',
    now(),
    'KEEL discovery program — general principles, no individual prescription.'
  )
  on conflict (coach_id, version) do update
     set beliefs = excluded.beliefs,
         forbidden = excluded.forbidden,
         arbitrations = excluded.arbitrations,
         qa = excluded.qa,
         voice = excluded.voice,
         foods = excluded.foods,
         published_at = coalesce(public.coach_doctrines.published_at, excluded.published_at),
         updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Le téléphone, GELÉ et documenté — jamais droppé
--
-- Ces colonnes portent l'historique B2C : des numéros vérifiés de comptes réels.
-- Les retirer effacerait des faits, et ce dépôt a déjà cassé l'ajout d'un élève
-- par un coach en renommant une colonne sans les trois épreuves d'absence.
-- Elles restent, avec écrit dessus qu'elles sont mortes.
-- ---------------------------------------------------------------------------

comment on column public.profiles.phone_number is
  'GELÉE (2026-08-05, fin du téléphone). Le produit a quitté WhatsApp: le '
  'numéro était l''identité du compte, il ne l''est plus. Plus aucun chemin '
  'élève ni coach ne l''alimente. Conservée telle quelle car elle porte '
  'l''historique B2C. Ne pas droper sans les trois épreuves d''absence '
  '(code applicatif, pg_proc.prosrc, vues).';

comment on column public.profiles.whatsapp_opted_in is
  'GELÉE À false (2026-08-05). Aucun chemin ne la passe à true depuis le pivot '
  'de-whatsapp. Elle était le second terme de la garde anti-collision de '
  'handle_new_user(), qui ne pouvait donc plus jamais être vrai: ce terme mort '
  'a été retiré de la garde (migration 20260805091000), le terme vivant '
  '(phone_verified_at) y reste armé.';

comment on column public.profiles.phone_verified_at is
  'Historique B2C. VIVANTE en lecture: c''est le seul terme encore utile de la '
  'garde anti-collision de handle_new_user() et de is_verified_phone_in_use(). '
  'Plus aucun chemin ne l''écrit.';
