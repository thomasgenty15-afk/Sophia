-- LA SÉANCE LOGUÉE — un FAIT, jamais une énergie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ IL N'Y A PAS DE COLONNE DE CALORIES ICI, ET CE N'EST PAS UN OUBLI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La prochaine session voudra l'ajouter. Voici pourquoi elle ne doit pas, avec
-- les nombres, pour qu'elle n'ait pas à refaire l'arbitrage de tête:
--
--   · le déficit visé par ce produit est de 400-500 kcal PAR JOUR;
--   · l'erreur d'une dépense d'exercice DÉCLARÉE (déclarative ou estimée par
--     une montre) est de ±30-50 %, soit 150-250 kcal sur une séance annoncée
--     à 500.
--
-- Soustraire cette dépense du jour AUGMENTE donc l'incertitude au lieu de la
-- réduire: on remplace une inconnue par une inconnue PLUS GRANDE, et on lui
-- donne l'aplomb d'un tableau. Le fait (« 3 séances ») est vrai et vérifiable
-- par la personne elle-même; son dérivé énergétique ne l'est pas, et il est
-- indiscernable d'un vrai chiffre pour l'élève comme pour le coach.
--
-- Décision produit du 2026-08-18. Si elle est un jour renversée, ce n'est PAS
-- « une colonne de plus »: il faut passer par les cinq portes de
-- `_shared/keel/energy_gate.ts` et décider ce que la journée affiche à côté.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ ON NE RÈGLE RIEN DEPUIS UNE SÉANCE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ni le plan, ni les repas, ni l'enveloppe du jour. « L'exercice n'est pas
-- fixe »: une semaine à trois séances suivie d'une semaine à zéro produirait
-- deux enveloppes pour la même personne, et l'élève verrait ses portions
-- bouger parce qu'il a couru. Aucun générateur ne lit cette table, et c'est
-- une propriété à maintenir, pas un état transitoire.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE LECTEUR, ET C'EST LA CONDITION D'EXISTENCE DE CETTE TABLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `frontend/src/keel/api/onboarding.ts:36` porte la règle mère du dépôt: on ne
-- collecte une donnée que si quelque chose en aval la CONSOMME. Le lecteur
-- vivant de cette table est le BILAN HEBDOMADAIRE:
--
--   supabase/functions/_shared/keel/week_review_io.ts
--     └─ loadWeekFacts()            lit cette table, filtre .eq('user_id')
--     └─ computeAndStoreWeekReview() gèle le compte dans weekly_reviews.week_facts
--        └─ appelé par supabase/functions/keel-weekly-flow-v1/index.ts:285
--           (le cron du dimanche — le SEUL appelant, et il est vivant)
--
--   supabase/functions/_shared/keel/week_review.ts
--     └─ WeekReviewReading.activity  le compte, gelé
--     └─ renderWeekActivityFact()    « You also logged 3 training sessions… »
--
-- À terme, le vrai lecteur est le RÉ-ANCRAGE SUR L'OBSERVÉ (« étape 8 », déjà
-- nommée dans `meal_envelope.ts`): le facteur d'activité réel se déduit de la
-- trajectoire de poids croisée avec les ingesta sur 3-4 semaines. C'est là
-- qu'une mesure grossière devient rentable — parce qu'elle est recalée par une
-- balance, et non convertie en calories. Hors périmètre de ce lot.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE VOCABULAIRE: AUCUN N'EST INVENTÉ ICI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `kind`      = `ACTIVITY_EMPHASES` (`_shared/keel/activity_stance.ts`), mot
--               pour mot. Ce dépôt porte déjà PRACTICE_KINDS (le sujet d'une
--               pratique du coach), ACTIVITY_LEVELS (un trait durable de la
--               personne) et ACTIVITY_CLASS (la classe d'un engagement); une
--               quatrième liste aurait été la faute. Le miroir TypeScript est
--               `ACTIVITY_SESSION_KINDS` (`_shared/keel/activity_session.ts`),
--               qui porte la condition de retrait de sa duplication.
-- `intensity` = trois crans. JAMAIS un nombre: même arbitrage que les quatre
--               crans de `tokens.ts` — « un nombre demandé à l'utilisateur est
--               un nombre qu'il invente, et l'inventé entre ensuite dans un
--               calcul avec l'autorité d'une mesure ». Un RPE sur 10 serait,
--               en prime, le premier ingrédient d'un calcul de dépense.
-- `source`    = `app` | `chat`, les jetons déjà portés par
--               `student_body_measures.source` et `student_daily_checkins`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RÉ-APPLICABLE. `db reset` est interdit sur ce dépôt: tout ici doit repasser
-- sur une base qui a déjà vécu.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.student_activity_sessions (
  id uuid primary key default gen_random_uuid(),

  -- RGPD: FK vers auth.users, CASCADE. La purge explicite existe malgré tout
  -- dans `purge-deleted-accounts` — même règle que `inbound_dedup`: ne rien
  -- laisser dépendre d'un ON DELETE qu'on n'a pas relu.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- LE JOUR DE L'ÉLÈVE, dans SON fuseau. Le bilan groupe sur CETTE colonne.
  -- Reconvertir `created_at` à la lecture referait, mal, une conversion de
  -- fuseau que l'écrivain avait faite juste — et ferait changer de semaine la
  -- séance du dimanche soir pour la moitié de la planète.
  local_date date not null,

  -- Liste FERMÉE. Une valeur hors liste serait inerte au lecteur: le résumé
  -- l'écarterait sans le dire, et la séance serait comptée nulle part.
  kind text not null check (
    kind in ('daily_movement', 'strength', 'cardio', 'recovery', 'mobility')
  ),

  -- ── LA DURÉE EST NULLABLE, ET C'EST UNE DÉCISION ─────────────────────────
  -- Une séance dite en conversation (« je suis allé à la salle ») n'en porte
  -- pas. La rendre obligatoire forcerait l'écrivain à en INVENTER une, et une
  -- durée inventée entre ensuite dans une somme avec l'autorité d'une mesure.
  -- `WeekActivitySummary.minutesFrom` porte le dénominateur en clair: on sait
  -- toujours sur combien de séances la somme a été faite.
  --
  -- Les bornes sont larges EXPRÈS: il ne s'agit pas de juger un entraînement
  -- mais d'attraper une faute de frappe (« 900 » pour 90) et une unité mal lue
  -- (des secondes prises pour des minutes). 600 min = dix heures, ce qui
  -- couvre une randonnée à la journée. Les mêmes deux nombres vivent dans
  -- `activity_session.ts` (ACTIVITY_SESSION_MIN/MAX_MINUTES): un écran qui
  -- accepterait ce que la base refuse ferait saisir dans le vide.
  duration_min integer check (duration_min >= 1 and duration_min <= 600),

  -- ── L'INTENSITÉ EN CRANS, JAMAIS UN NOMBRE ───────────────────────────────
  -- Nullable pour la même raison que la durée: « pas déclarée » est une
  -- valeur, et elle ne se devine pas. Le compte `undeclared` du résumé la
  -- porte en clair, comme `portions.unclear` le fait déjà pour les assiettes.
  intensity text check (intensity in ('easy', 'moderate', 'hard')),

  -- D'OÙ VIENT LE GESTE. Liste fermée, et elle est LUE: laisser une séance
  -- dite en passant se faire passer pour une saisie d'écran rendrait
  -- l'historique inexploitable le jour où on voudra comparer les deux gestes.
  source text not null check (source in ('app', 'chat')),

  created_at timestamptz not null default now()
);

-- ── AUCUNE CONTRAINTE D'UNICITÉ, ET C'EST UNE DÉCISION ─────────────────────
-- Deux séances le même jour existent (course le matin, mobilité le soir), et
-- deux séances du même `kind` le même jour aussi. Une unicité sur
-- (user_id, local_date, kind) ferait disparaître la seconde en silence, ou
-- lèverait 23505 sur un geste parfaitement légitime.

comment on table public.student_activity_sessions is
  'FF — le log de séance (2026-08-18). Un FAIT compté par le bilan hebdo, '
  'JAMAIS une énergie: aucune colonne de calories, et la décision est '
  'chiffrée dans l''en-tête de 20260818180000. Aucun générateur ne lit cette '
  'table — on ne règle ni le plan ni les repas depuis une séance.';

comment on column public.student_activity_sessions.local_date is
  'Le jour de l''élève dans SON fuseau. Le bilan hebdo groupe dessus.';
comment on column public.student_activity_sessions.kind is
  'LECTEUR: week_review.ts (le compte de séances du bilan). Vocabulaire = '
  'ACTIVITY_EMPHASES (activity_stance.ts), miroir TS = ACTIVITY_SESSION_KINDS '
  '(activity_session.ts). Aucune quatrième liste d''activité dans ce dépôt.';
comment on column public.student_activity_sessions.duration_min is
  'LECTEUR: WeekActivitySummary.minutes, avec son dénominateur minutesFrom. '
  'NULL = non déclarée, jamais devinée. JAMAIS convertie en énergie.';
comment on column public.student_activity_sessions.intensity is
  'LECTEUR: WeekActivitySummary.byIntensity, compté par cran dans le bloc de '
  'contexte du bilan. Trois crans, jamais un nombre — un RPE serait le premier '
  'ingrédient d''un calcul de dépense. NULL = non déclarée.';
comment on column public.student_activity_sessions.source is
  'D''où vient le geste: « app » (écran) ou « chat » (conversation). Lu pour '
  'que les deux gestes restent comparables.';

-- La lecture du bilan: « les séances de cet élève entre deux dates ».
create index if not exists student_activity_sessions_user_date_idx
  on public.student_activity_sessions (user_id, local_date);

-- ===========================================================================
-- PRIVILÈGES — les défauts Supabase donnent TOUT à `authenticated`
-- ===========================================================================
-- Y compris TRUNCATE, qui ÉCHAPPE À RLS: une policy propriétaire-seul ne
-- protège rien contre un TRUNCATE. Le revoke n'est donc pas une ceinture de
-- plus, c'est la seule qui tienne.
--
-- ⚠️ `revoke ... from public` NE SUFFIT PAS: `anon` reste debout, parce que
-- ses privilèges lui ont été donnés nommément par les default privileges du
-- rôle propriétaire, pas hérités de `public`. Les deux rôles sont donc nommés,
-- et le bloc de contrôle en fin de fichier le PROUVE par `has_table_privilege`
-- — « absent », pas « révoqué ».

revoke all on public.student_activity_sessions from public;
revoke all on public.student_activity_sessions from anon, authenticated;

alter table public.student_activity_sessions enable row level security;

-- ── LES POLICIES SONT PROPRIÉTAIRE-SEUL ────────────────────────────────────
-- ⚠️ ET ELLES NE REMPLACENT PAS UN `.eq('user_id', …)` CÔTÉ LECTURE. Ce dépôt
-- a la cicatrice exacte: la ligne d'un élève rendue à un coach parce que le
-- lecteur applicatif s'était reposé sur RLS. Tout lecteur de cette table porte
-- son filtre — `loadWeekFacts` le porte.

drop policy if exists student_activity_sessions_select_own
  on public.student_activity_sessions;
create policy student_activity_sessions_select_own
  on public.student_activity_sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists student_activity_sessions_insert_own
  on public.student_activity_sessions;
create policy student_activity_sessions_insert_own
  on public.student_activity_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

-- SUPPRIMER, oui. MODIFIER, non — et c'est délibéré.
-- Une séance mal saisie se retire et se re-logue; il n'existe aucun écran qui
-- « corrige » une séance. Accorder UPDATE ouvrirait une surface dont personne
-- ne porte la garde, et le dépôt a déjà payé un `update` qui touche 0 ligne et
-- rend 204 en silence.
drop policy if exists student_activity_sessions_delete_own
  on public.student_activity_sessions;
create policy student_activity_sessions_delete_own
  on public.student_activity_sessions for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.student_activity_sessions to authenticated;

-- ===========================================================================
-- LA PREUVE — (a) les privilèges, (b) la contrainte, (c) l'isolation RLS
-- ===========================================================================

-- (a) LES PRIVILÈGES, LUS ET PAS SUPPOSÉS.
do $$
begin
  -- `anon` : ABSENT des quatre verbes, plus TRUNCATE.
  if has_table_privilege('anon', 'public.student_activity_sessions', 'SELECT') then
    raise exception 'anon peut LIRE student_activity_sessions — le revoke n''a pas pris';
  end if;
  if has_table_privilege('anon', 'public.student_activity_sessions', 'INSERT') then
    raise exception 'anon peut ÉCRIRE student_activity_sessions';
  end if;
  if has_table_privilege('anon', 'public.student_activity_sessions', 'UPDATE') then
    raise exception 'anon peut MODIFIER student_activity_sessions';
  end if;
  if has_table_privilege('anon', 'public.student_activity_sessions', 'DELETE') then
    raise exception 'anon peut SUPPRIMER student_activity_sessions';
  end if;
  if has_table_privilege('anon', 'public.student_activity_sessions', 'TRUNCATE') then
    raise exception 'anon peut TRUNCATE student_activity_sessions — RLS n''y peut rien';
  end if;

  -- `authenticated` : ni UPDATE, ni TRUNCATE. TRUNCATE est le piège: il
  -- échappe à RLS, donc une policy propriétaire-seul ne l'arrête pas.
  if has_table_privilege('authenticated', 'public.student_activity_sessions', 'TRUNCATE') then
    raise exception
      'authenticated peut TRUNCATE student_activity_sessions — TRUNCATE échappe '
      'à RLS, la policy propriétaire-seul ne protège rien';
  end if;
  if has_table_privilege('authenticated', 'public.student_activity_sessions', 'UPDATE') then
    raise exception 'authenticated peut MODIFIER une séance — aucune garde ne le couvre';
  end if;

  -- ⚠️ LE CAS PASSANT. Sans lui, sept refus verts ne prouveraient que « tout
  -- est bloqué », c'est-à-dire une table morte qui ressemble à une table sûre.
  if not has_table_privilege('authenticated', 'public.student_activity_sessions', 'SELECT') then
    raise exception 'authenticated ne peut PAS lire ses propres séances — l''écran serait vide';
  end if;
  if not has_table_privilege('authenticated', 'public.student_activity_sessions', 'INSERT') then
    raise exception 'authenticated ne peut PAS loguer une séance — le lot est inerte';
  end if;
  if not has_table_privilege('service_role', 'public.student_activity_sessions', 'SELECT') then
    raise exception 'service_role ne peut PAS lire — le bilan hebdo ne compterait rien';
  end if;

  raise notice
    'student_activity_sessions: anon absent des 5 verbes, authenticated sans '
    'UPDATE ni TRUNCATE, select/insert/delete accordés — vérifiés par '
    'has_table_privilege';
end;
$$;

-- (b) LES CONTRAINTES, REJOUÉES SUR DE VRAIES LIGNES.
do $$
declare
  probe uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  -- Le cas nominal, complet.
  insert into public.student_activity_sessions
    (user_id, local_date, kind, duration_min, intensity, source)
  values (probe, current_date, 'strength', 45, 'moderate', 'app');

  -- Le cas nominal SANS durée ni intensité: une séance dite en conversation.
  insert into public.student_activity_sessions
    (user_id, local_date, kind, source)
  values (probe, current_date, 'cardio', 'chat');

  -- Deux séances le même jour, même `kind`: aucune unicité ne doit mordre.
  insert into public.student_activity_sessions
    (user_id, local_date, kind, duration_min, intensity, source)
  values (probe, current_date, 'cardio', 30, 'easy', 'app');

  -- Un `kind` hors liste.
  begin
    insert into public.student_activity_sessions
      (user_id, local_date, kind, source)
    values (probe, current_date, 'crossfit', 'app');
    raise exception 'la ceinture est DÉSARMÉE: un kind hors liste a été accepté';
  exception when check_violation then null;
  end;

  -- Une intensité hors crans — un nombre, précisément ce qu'on refuse.
  begin
    insert into public.student_activity_sessions
      (user_id, local_date, kind, intensity, source)
    values (probe, current_date, 'strength', '7', 'app');
    raise exception 'la ceinture est DÉSARMÉE: une intensité chiffrée a été acceptée';
  exception when check_violation then null;
  end;

  -- Une durée impossible (secondes prises pour des minutes).
  begin
    insert into public.student_activity_sessions
      (user_id, local_date, kind, duration_min, source)
    values (probe, current_date, 'cardio', 2700, 'app');
    raise exception 'la ceinture est DÉSARMÉE: 2700 minutes ont été acceptées';
  exception when check_violation then null;
  end;

  -- Une source hors liste.
  begin
    insert into public.student_activity_sessions
      (user_id, local_date, kind, source)
    values (probe, current_date, 'cardio', 'watch');
    raise exception 'la ceinture est DÉSARMÉE: une source inconnue a été acceptée';
  exception when check_violation then null;
  end;

  -- LA CASCADE RGPD: le compte part, les séances partent avec lui.
  delete from auth.users where id = probe;
  if exists (select 1 from public.student_activity_sessions where user_id = probe) then
    raise exception
      'une séance a survécu à la suppression du compte — la FK n''est pas en CASCADE';
  end if;

  raise notice
    'student_activity_sessions: 3 insertions nominales, 4 refus de contrainte, '
    'cascade RGPD vérifiée';
end;
$$;

-- (c) L'ISOLATION: LA LIGNE D'UN ÉLÈVE EST INVISIBLE À UN AUTRE.
--
-- ⚠️ REJOUÉE SOUS LE RÔLE `authenticated`, pas inspectée. Une policy se lit
-- dans `pg_policies` sans rien prouver: le propriétaire de la table
-- CONTOURNE RLS, donc un contrôle qui reste en `postgres` verrait les deux
-- lignes et se déclarerait vert. `set local role` est la seule lecture qui
-- vaut, et `reset role` NE REND PAS le rôle d'entrée (il retombe sur
-- `session_user`) — d'où la capture de `current_user` et sa restitution.
do $$
declare
  v_role text := current_user;
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_seen integer;
  v_msg text;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-a-' || v_a::text || '@keel.invalid'),
         (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-b-' || v_b::text || '@keel.invalid');

  insert into public.student_activity_sessions
    (user_id, local_date, kind, duration_min, intensity, source)
  values (v_a, current_date, 'strength', 45, 'hard', 'app');

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- LE CAS PASSANT: le propriétaire VOIT sa ligne. Sans lui, « 0 ligne »
    -- ci-dessous prouverait seulement que la table est illisible pour tous.
    select count(*) into v_seen from public.student_activity_sessions;
    if v_seen <> 1 then
      raise exception 'le propriétaire voit % de ses séances au lieu de 1', v_seen;
    end if;

    -- L'AUTRE COMPTE: zéro ligne, pas une erreur.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select count(*) into v_seen from public.student_activity_sessions;
    if v_seen <> 0 then
      raise exception
        'un autre compte lit % séance(s) qui ne sont pas les siennes', v_seen;
    end if;

    -- ET IL NE PEUT PAS EN ÉCRIRE UNE AU NOM DU PREMIER.
    begin
      insert into public.student_activity_sessions
        (user_id, local_date, kind, source)
      values (v_a, current_date, 'cardio', 'app');
      raise exception '__leak__';
    exception
      when insufficient_privilege then null;
      when others then
        get stacked diagnostics v_msg = message_text;
        if v_msg = '__leak__' then
          raise exception
            'un compte a écrit une séance au nom d''un autre — le WITH CHECK est désarmé';
        end if;
        raise;
    end;

    execute format('set local role %I', v_role);
    perform set_config('request.jwt.claims', '', true);
  exception
    when others then
      execute format('set local role %I', v_role);
      perform set_config('request.jwt.claims', '', true);
      raise;
  end;

  delete from auth.users where id in (v_a, v_b);

  raise notice
    'student_activity_sessions: isolation RLS rejouée sous authenticated — '
    'le propriétaire voit 1 ligne, un autre compte en voit 0 et n''en écrit aucune';
end;
$$;

commit;
