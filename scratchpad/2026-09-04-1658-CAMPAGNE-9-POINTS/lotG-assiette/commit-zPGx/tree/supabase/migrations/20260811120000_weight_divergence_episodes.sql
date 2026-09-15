-- ============================================================================
-- FF-056 · L'ÉPISODE DE DIVERGENCE — et le cinquième genre du budget T4
--
-- Fiche: docs/fonctionnalites/conversation/FF-056-la-divergence-constatee.md
--
-- ── CE QUE CETTE TABLE EST, ET CE QU'ELLE N'EST PAS ────────────────────────
-- Elle porte des ÉPISODES, pas un trait. La divergence elle-même n'est PAS
-- stockée (fiche §5): elle se dérive à la lecture, série de mesures × direction
-- de l'objectif, par `_shared/keel/weight_divergence.ts`. Une colonne
-- `is_diverging` sur `profiles` aurait été plus simple et fausse le lendemain —
-- et surtout, elle aurait fait de « cette personne ne suit pas son plan » un
-- ATTRIBUT DE LA PERSONNE, ce que toute la fiche refuse.
--
-- Ce qui est stocké, c'est l'HISTOIRE DE LA CONVERSATION: on a demandé tel
-- jour, sur telle empreinte de plan, la personne a répondu telle catégorie,
-- l'épisode s'est terminé de telle façon. C'est cette ligne qui porte le
-- cooldown (R9: ≥ 1 cycle de plan, 2 après un refus) — c'est-à-dire la garantie
-- que ce mécanisme reste rare.
--
-- ── POURQUOI L'EMPREINTE DU PLAN EST UNE COLONNE ───────────────────────────
-- §7: « le plan change pendant l'épisode ⇒ l'empreinte invalide l'épisode ».
-- Une action confirmée d'un tap ne doit pas s'appliquer à un plan qui n'existe
-- plus. Même mécanique et MÊME FONCTION que FF-028 (`planFingerprint`), pour
-- que les deux canaux périment sur le même critère: deux définitions de
-- « le plan a changé » divergeraient au premier ajustement, et la divergence se
-- paierait du seul côté visible — une proposition appliquée à côté.
--
-- ── LA FENÊTRE D'OBSERVATION VIT ICI AUSSI (fiche §11, question ouverte) ───
-- La question posée par la fiche est: un simple MARQUEUR « fenêtre ouverte »
-- suffit-il aux planchers existants (FF-017, FF-009), ou faut-il un lien
-- explicite de chaque déclaration à l'épisode ?
--
-- TRANCHÉ ICI AU PLUS SIMPLE: un marqueur, porté par deux dates sur l'épisode
-- (`observation_opened_on`, `observation_ends_on`). Aucune colonne n'est
-- ajoutée aux tables de déclaration, aucun plancher n'est modifié. Le recalage
-- de fin de fenêtre relit les déclarations par leur DATE, dans l'intervalle.
-- Trois raisons, la première suffit:
--   1. un lien explicite exigerait qu'un plancher déterministe connaisse
--      l'existence de ce flow — c'est-à-dire qu'une ceinture dépende d'une
--      fonctionnalité de valeur, l'inversion exacte que T7 interdit;
--   2. les déclarations n'appartiennent PAS à l'épisode. Elles existent pour
--      elles-mêmes, et une fenêtre annulée ne doit rien effacer;
--   3. l'intervalle de dates est relisible même si la ligne d'épisode a été
--      purgée — la fenêtre est bornée à trois jours, l'épisode vit plus
--      longtemps qu'elle.
-- Le coût assumé: une déclaration faite pendant la fenêtre n'est pas
-- distinguable d'une déclaration ordinaire du même jour. C'est correct — le
-- recalage veut TOUT ce qui a été mangé en plus sur ces trois jours, pas
-- seulement ce qui a été dit « à cause de » la fenêtre.
--
-- ── CE QUI N'EST PAS DANS CETTE TABLE, ET NE DOIT JAMAIS Y ENTRER ──────────
-- Aucun chiffre d'énergie (R11). Aucune prose libre de la personne: la
-- catégorie retenue est un token d'une liste fermée, et c'est tout ce qu'on
-- garde. Stocker les mots de quelqu'un qui explique pourquoi il n'a pas perdu
-- de poids créerait un dossier — et la fiche dit « ce qui touche le corps est à
-- soi » (R12).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. LE CINQUIÈME GENRE DU BUDGET DE DEMANDE (T4)
--
-- La question d'ouverture EST une demande. Elle prend la place du jour ou elle
-- attend — jamais un second compteur. Quatre fiches partagent déjà celui-ci
-- (`_shared/keel/daily_ask_budget.ts`, `DAILY_ASK_KINDS`), et il a été prouvé
-- unique 12/12 par la passe transverse du 2026-08-08.
--
-- `axis` reste NULL: le CHECK conditionnel `meal_precision_questions_axis_check`
-- exige un axe pour `meal_precision_question` et l'interdit partout ailleurs.
-- Le nouveau genre tombe dans la branche ELSE, ce qui est exactement ce qu'on
-- veut — un axe sur une question de divergence serait une valeur inventée.
-- ---------------------------------------------------------------------------
alter table public.meal_precision_questions
  drop constraint if exists meal_precision_questions_ask_kind_check;

alter table public.meal_precision_questions
  add constraint meal_precision_questions_ask_kind_check
  check (ask_kind in (
    'meal_precision_question',
    'photo_invitation',
    'daily_recommendation',
    'practice_question',
    'weight_divergence_question'
  ));

comment on column public.meal_precision_questions.ask_kind is
  'LE GENRE DE LA DEMANDE. Liste fermee, miroir de DAILY_ASK_KINDS dans '
  '_shared/keel/daily_ask_budget.ts — un genre ajoute d''un cote sans l''autre '
  'est refuse a l''ecriture. meal_precision_question (FF-017, porte un axe) | '
  'photo_invitation (FF-025) | daily_recommendation (FF-028) | '
  'practice_question (FF-029, la QUESTION du soir seulement: le rappel de '
  'pratique ne demande rien et ne consomme rien) | weight_divergence_question '
  '(FF-056, la question d''ouverture d''un episode de divergence). Le budget '
  'est de UNE demande par jour local et par eleve, tous genres confondus (T4).';

-- ---------------------------------------------------------------------------
-- 2. L'ÉPISODE
-- ---------------------------------------------------------------------------
create table if not exists public.student_weight_divergence_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- L'ÉTAT. Liste fermée, celle de la fiche §5. `proposed` = la question est
  -- partie et personne n'a encore répondu; `in_flow` = un échange est en cours;
  -- les quatre autres sont des fins, et deux d'entre elles sont BONNES:
  -- `acted` (une directive durable existe) et `nothing_to_change` (le flow a su
  -- conclure qu'il n'y avait rien à changer — R5, branche essentielle).
  state text not null check (state in (
    'proposed', 'in_flow', 'acted', 'nothing_to_change', 'declined', 'expired'
  )),

  -- LA CATÉGORIE RETENUE. Les neuf de §3, `other` incluse, et NULL tant que la
  -- personne n'a pas répondu. `other` n'est pas un défaut de classement: c'est
  -- la soupape qui empêche le classifieur de forcer les cases, et une personne
  -- mal lue ne répond plus.
  category text check (category is null or category in (
    'named_spot', 'plan_mismatch', 'activity_drop', 'medical',
    'life_factor', 'not_a_divergence', 'unknown', 'declined', 'other'
  )),

  -- LE CONSTAT QUI A OUVERT L'ÉPISODE. Trois colonnes, pas une:
  --   `detector_version` — le calibrage qui a produit le constat. Sans lui, la
  --     mesure de §10 (« la divergence baisse-t-elle après une action ? »)
  --     mélangerait des épisodes ouverts par deux jeux de seuils;
  --   `shape` — éloignement ou stagnation. JAMAIS une cause: ce module n'en
  --     connaît aucune, et la fiche existe pour ne pas en inventer;
  --   `goal_direction` — la direction attendue au moment de l'ouverture. Un
  --     élève qui passe de fat_loss à muscle_gain en cours d'épisode rendrait
  --     le constat illisible sans elle.
  detector_version text not null,
  shape text not null check (shape in ('moving_away', 'stalled')),
  goal_direction text not null check (goal_direction in ('down', 'up')),

  -- L'EMPREINTE DU PLAN au moment de l'ouverture. Même fonction que FF-028.
  plan_fingerprint text not null,

  -- LES DATES. `opened_local_date` est le jour de l'ÉLÈVE, et c'est elle qui
  -- porte le cooldown: un cooldown compté sur la date du serveur s'ouvre au
  -- mauvais moment pour tout le monde sauf UTC.
  opened_local_date date not null,
  opened_at timestamptz not null default now(),
  last_turn_at timestamptz,
  closed_at timestamptz,

  -- LE PLAFOND DE CONVERSATION (R6). Compté ici et pas dans `temp_memory`:
  -- `user_chat_states.temp_memory` a deux écrivains concurrents en
  -- lecture-modification-écriture complète, le dernier gagne, et un compteur de
  -- tours qu'on peut perdre est un flow qui ne se termine jamais.
  turn_count integer not null default 0 check (turn_count >= 0),

  -- LA FENÊTRE D'OBSERVATION — un MARQUEUR, deux dates. Voir l'en-tête.
  observation_opened_on date,
  observation_ends_on date,

  -- Le message d'ouverture, pour que l'audit puisse relire ce qui est parti.
  opening_chat_message_id uuid,
  content_locale text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une fin est datée, un vivant ne l'est pas. Sans cette contrainte, un
  -- épisode `expired` sans `closed_at` rendrait le cooldown incalculable.
  constraint weight_divergence_closed_at_matches_state check (
    (state in ('proposed', 'in_flow') and closed_at is null)
    or (state not in ('proposed', 'in_flow') and closed_at is not null)
  ),

  -- Les deux dates de fenêtre vont ensemble ou pas du tout.
  constraint weight_divergence_observation_dates_paired check (
    (observation_opened_on is null and observation_ends_on is null)
    or (observation_opened_on is not null and observation_ends_on is not null
        and observation_ends_on > observation_opened_on)
  )
);

-- UN SEUL ÉPISODE VIVANT PAR PERSONNE, garanti par le SCHÉMA et pas par une
-- lecture préalable. Deux instances du job du soir peuvent tourner en même
-- temps (c'est déjà le cas de FF-028): sans cet index, elles poseraient deux
-- questions le même soir, chacune ayant lu « aucun épisode ouvert » avant que
-- l'autre n'écrive. L'arbitrage n'a pas besoin d'un verrou applicatif.
create unique index if not exists weight_divergence_one_open_per_user
  on public.student_weight_divergence_episodes (user_id)
  where state in ('proposed', 'in_flow');

-- Le cooldown se lit par (user_id, opened_local_date desc): c'est LA requête.
create index if not exists weight_divergence_user_opened_idx
  on public.student_weight_divergence_episodes (user_id, opened_local_date desc);

-- La fenêtre d'observation se balaie par sa date de fin, tous élèves confondus.
create index if not exists weight_divergence_observation_ends_idx
  on public.student_weight_divergence_episodes (observation_ends_on)
  where observation_ends_on is not null;

comment on table public.student_weight_divergence_episodes is
  'FF-056: un EPISODE de divergence constatee — la conversation, pas le '
  'constat. La divergence elle-meme n''est jamais stockee: elle se derive a la '
  'lecture (serie de mesures x direction de l''objectif). Cette ligne porte le '
  'cooldown, l''empreinte du plan et le marqueur de fenetre d''observation. '
  'Aucun chiffre d''energie, aucune prose de l''eleve: seulement une categorie '
  'd''une liste fermee. Invisible du foyer et du coach en B2C (R12).';

comment on column public.student_weight_divergence_episodes.category is
  'La categorie retenue, parmi les neuf de la fiche §3. NULL tant que la '
  'personne n''a pas repondu. `other` est OBLIGATOIRE dans la liste: un '
  'classifieur qui force les cases produit des actions a cote.';

comment on column public.student_weight_divergence_episodes.plan_fingerprint is
  'L''empreinte du plan a l''ouverture (meme fonction que FF-028). Un tap '
  'confirme sur un plan qui a change depuis n''applique RIEN.';

comment on column public.student_weight_divergence_episodes.observation_opened_on is
  'FF-056 §11 TRANCHE: la fenetre d''observation est un MARQUEUR de dates, pas '
  'un lien de chaque declaration a l''episode. Les planchers FF-017/FF-009 ne '
  'connaissent pas ce flow et ne doivent pas le connaitre; le recalage relit '
  'les declarations par leur DATE dans l''intervalle.';

-- ---------------------------------------------------------------------------
-- 3. RLS — LE TITULAIRE LIT, PERSONNE N'ÉCRIT
--
-- L'écriture est du RUNTIME (service_role, qui contourne RLS). Aucune policy
-- d'écriture pour `authenticated`, et c'est plus fort qu'un owner_all: rien
-- côté client ne doit pouvoir fabriquer, faire avancer ou clore un épisode.
-- Un `for all` aurait laissé un navigateur poser lui-même `state='acted'`.
--
-- ⚠️ LA POLICY N'EST PAS UN SUBSTITUT AU `.eq('user_id', …)` DE L'APPELANT.
-- Le runtime lit en service_role: RLS ne le contraint pas. Chaque lecture de
-- `weight_divergence_io.ts` filtre explicitement sur `user_id` — cicatrice
-- `rls-is-not-a-substitute-for-eq-user-id`, payee par une ligne d'eleve rendue
-- a son coach.
-- ---------------------------------------------------------------------------
alter table public.student_weight_divergence_episodes enable row level security;

drop policy if exists weight_divergence_owner_select
  on public.student_weight_divergence_episodes;
create policy weight_divergence_owner_select
  on public.student_weight_divergence_episodes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. LES GRANTS — deux cicatrices honorées nommément
--
--   · « revoke from public » ne retire PAS `anon`, qui tient ses privilèges de
--     son propre grant (cicatrice `revoke-from-public-leaves-anon`);
--   · Supabase accorde TOUT a `authenticated` sur toute table neuve, TRUNCATE
--     compris — et TRUNCATE echappe a RLS (cicatrice
--     `supabase-default-privileges-grant-all-to-authenticated`).
--
-- On ne laisse donc a `authenticated` que SELECT, gouverne par la policy.
-- ---------------------------------------------------------------------------
revoke all on table public.student_weight_divergence_episodes from anon;
revoke all on table public.student_weight_divergence_episodes from public;
revoke insert, update, delete, truncate, references, trigger
  on table public.student_weight_divergence_episodes from authenticated;
grant select on table public.student_weight_divergence_episodes to authenticated;

-- ---------------------------------------------------------------------------
-- 5. LA PREUVE — dans la transaction, et dans les DEUX SENS
--
-- Une contrainte qu'on n'a pas vue refuser est une contrainte dont on ne sait
-- rien. Chaque bloc ci-dessous fait passer le cas nominal PUIS echouer le cas
-- interdit: une garde qui bloque tout ressemble a une garde qui marche
-- (cicatrice `guards-need-a-passing-case`).
-- ---------------------------------------------------------------------------
do $$
declare
  probe uuid := gen_random_uuid();
  first_episode uuid;
  ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'ff056-probe-' || probe::text || '@keel.invalid');

  -- (a) LE CAS NOMINAL PASSE.
  insert into public.student_weight_divergence_episodes
    (user_id, state, detector_version, shape, goal_direction,
     plan_fingerprint, opened_local_date)
  values (probe, 'proposed', 'ff056.v1', 'moving_away', 'down',
          'fp-1', current_date)
  returning id into first_episode;

  -- (b) UN SEUL ÉPISODE VIVANT.
  begin
    insert into public.student_weight_divergence_episodes
      (user_id, state, detector_version, shape, goal_direction,
       plan_fingerprint, opened_local_date)
    values (probe, 'in_flow', 'ff056.v1', 'stalled', 'up', 'fp-2', current_date);
    raise exception 'FF-056: deux episodes vivants ont ete acceptes';
  exception when unique_violation then null;
  end;

  -- (c) UNE FIN EXIGE SA DATE.
  begin
    update public.student_weight_divergence_episodes
       set state = 'declined'
     where id = first_episode;
    raise exception 'FF-056: un episode clos sans closed_at a ete accepte';
  exception when check_violation then null;
  end;

  -- (d) UNE FIN DATÉE PASSE — et libere la place pour un episode suivant.
  update public.student_weight_divergence_episodes
     set state = 'declined', closed_at = now()
   where id = first_episode;
  insert into public.student_weight_divergence_episodes
    (user_id, state, detector_version, shape, goal_direction,
     plan_fingerprint, opened_local_date)
  values (probe, 'proposed', 'ff056.v1', 'stalled', 'up', 'fp-2', current_date);

  -- (e) UNE CATÉGORIE HORS LISTE EST REFUSÉE.
  begin
    update public.student_weight_divergence_episodes
       set category = 'he_is_lying'
     where user_id = probe and state = 'proposed';
    raise exception 'FF-056: une categorie hors liste a ete acceptee';
  exception when check_violation then null;
  end;

  -- (f) `other` EST DANS LA LISTE — la soupape existe vraiment.
  update public.student_weight_divergence_episodes
     set category = 'other'
   where user_id = probe and state = 'proposed';

  -- (g) UNE FENÊTRE D'OBSERVATION À L'ENVERS EST REFUSÉE.
  begin
    update public.student_weight_divergence_episodes
       set observation_opened_on = current_date,
           observation_ends_on = current_date - 1
     where user_id = probe and state = 'proposed';
    raise exception 'FF-056: une fenetre d''observation inversee a ete acceptee';
  exception when check_violation then null;
  end;

  -- (h) LE CINQUIÈME GENRE DU BUDGET EST ACCEPTÉ, et un genre invente refuse.
  insert into public.meal_precision_questions
    (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
  values (probe, current_date, 'chat', null, 'weight_divergence_question',
          'probe', 'ff056-probe-' || probe::text);
  begin
    insert into public.meal_precision_questions
      (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
    values (probe, current_date, 'chat', null, 'weight_divergence_nudge',
            'probe', 'ff056-probe2-' || probe::text);
    raise exception 'FF-056: un ask_kind hors liste a ete accepte';
  exception when check_violation then null;
  end;

  -- (i) LES PRIVILÈGES. Les deux cicatrices, verifiees et pas supposees.
  select has_table_privilege('anon',
    'public.student_weight_divergence_episodes', 'SELECT') into ok;
  if ok then raise exception 'FF-056: anon peut lire les episodes'; end if;
  select has_table_privilege('anon',
    'public.student_weight_divergence_episodes', 'INSERT') into ok;
  if ok then raise exception 'FF-056: anon peut ecrire des episodes'; end if;

  select has_table_privilege('authenticated',
    'public.student_weight_divergence_episodes', 'TRUNCATE') into ok;
  if ok then raise exception 'FF-056: authenticated peut TRUNCATE (echappe a RLS)'; end if;
  select has_table_privilege('authenticated',
    'public.student_weight_divergence_episodes', 'INSERT') into ok;
  if ok then raise exception 'FF-056: authenticated peut inserer un episode'; end if;
  select has_table_privilege('authenticated',
    'public.student_weight_divergence_episodes', 'UPDATE') into ok;
  if ok then raise exception 'FF-056: authenticated peut modifier un episode'; end if;
  select has_table_privilege('authenticated',
    'public.student_weight_divergence_episodes', 'DELETE') into ok;
  if ok then raise exception 'FF-056: authenticated peut supprimer un episode'; end if;

  -- LE CAS QUI DOIT PASSER: sans lui, tout ce qui precede serait vrai d'une
  -- table a laquelle personne n'a acces, ce qui n'est pas une garde.
  select has_table_privilege('authenticated',
    'public.student_weight_divergence_episodes', 'SELECT') into ok;
  if not ok then raise exception 'FF-056: authenticated ne peut pas lire ses episodes'; end if;

  -- (j) LA PURGE RGPD PASSE PAR LA CASCADE, et on le VERIFIE.
  delete from auth.users where id = probe;
  select exists(
    select 1 from public.student_weight_divergence_episodes where user_id = probe
  ) into ok;
  if ok then raise exception 'FF-056: un episode a survecu a la suppression du compte'; end if;
end $$;
