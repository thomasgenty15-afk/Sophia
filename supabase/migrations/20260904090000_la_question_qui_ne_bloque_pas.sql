-- ════════════════════════════════════════════════════════════════════════════
-- LA QUESTION QUI NE BLOQUE PAS — la clarification d'une note ambiguë
--
-- Autorité: docs/keel/NOMENCLATURE-MEMOIRE.md §2.2 (les trois destinations),
-- §2.3 (sans recouvrement), §8.1 (le sujet d'une phrase).
--
-- ── LE DÉFAUT QUE ÇA FERME, ET IL EST SILENCIEUX ───────────────────────────
-- Le classifieur de note reçoit le roster avec l'âge et le sexe, et résout
-- « mon fils » ou « ma femme » quand UNE SEULE personne correspond. Quand deux
-- correspondent — deux filles, « elle » sans antécédent — sa consigne lui dit
-- de ne RIEN ranger, et c'est la bonne décision: retirer un aliment à toute la
-- table parce qu'un enfant ne l'aime pas coûte la semaine.
--
-- Mais l'entrée est alors jetée **sans trace**. La liste des motifs de rejet
-- (`degree | setting | meal_story | other`) n'a aucune valeur pour « je n'ai
-- pas su de qui on parle », donc l'ambiguïté est soit invisible, soit rangée
-- avec les remerciements. Rien ne peut relancer, et le commentaire du socle
-- suppose pourtant une relance qui n'existe pas: « être redemandé leur coûte
-- une phrase ».
--
-- Cette table porte la question posée, et RIEN d'autre ne la porte.
--
-- ── POURQUOI UNE TABLE, ET PAS LA MÉTADONNÉE DE LA BULLE ───────────────────
-- ⛔ `chat_messages` EST MODIFIABLE PAR LA PERSONNE (`rls_chat_messages_update_own`
-- + les privilèges par défaut de Supabase). Une entrée en attente stockée dans
-- `metadata` serait donc FORGEABLE: un tap la ferait entrer dans la mémoire par
-- le port `service_role`, avec le producteur `draft_note`, sans que le
-- classifieur ait jamais rien proposé. La ligne, elle, n'est écrite que par le
-- runtime.
--
-- Deux autres raisons, mesurables: `reply_to` est fail-open sur les vieux
-- clients (sans lui, plus aucun moyen de retrouver l'entrée — la question
-- serait morte en silence), et une métadonnée ne porte ni statut, ni unicité,
-- ni expiration, donc aucun compteur du SILENCE.
--
-- Le patron est celui de `student_weight_divergence_episodes`
-- (`20260811120000`): un épisode vivant à la fois, chargé par PROPRIÉTAIRE et
-- jamais par l'identifiant entrant, `service_role` seul en écriture.
-- ════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. LE SIXIÈME GENRE DU BUDGET DE SOLLICITATIONS
--
-- ⚠️ QUATRIÈME REDÉFINITION DE CE CHECK (20260808123000 → 20260808190100 →
-- 20260811120000 → ici). Le drop-and-re-add est la forme qui a marché les trois
-- fois; une liste fermée n'accepte pas un `add constraint if not exists`.
--
-- ⚠️ ET CE GENRE-CI NE CONSOMME PAS LE BUDGET PARTAGÉ. Il répond à un geste que
-- la personne vient de faire — sa note, tapée quelques secondes plus tôt sur
-- l'écran qui l'attend — exactement comme `photo_invitation`. Le budget d'une
-- par jour borne ce que le produit prend l'INITIATIVE d'envoyer; il ne borne
-- pas une réponse. Le plafond propre du genre vit dans `daily_ask_budget.ts`.
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
    'weight_divergence_question',
    'memory_clarification'
  ));

comment on column public.meal_precision_questions.ask_kind is
  'Le genre de sollicitation. Liste fermée, miroir de `DAILY_ASK_KINDS` '
  '(_shared/keel/daily_ask_budget.ts): meal_precision_question, '
  'photo_invitation, daily_recommendation, practice_question, '
  'weight_divergence_question, memory_clarification. T4 borne les DEMANDES: '
  'photo_invitation et memory_clarification répondent à un geste et sont hors '
  'du budget partagé, avec leur propre plafond par jour LOCAL.';

-- ---------------------------------------------------------------------------
-- 2. LA QUESTION EN ATTENTE
--
-- `pending` porte l'entrée telle que la relecture l'a rendue, plus ce qu'il
-- faut pour l'écrire au tap: la note d'origine (elle devient la `quote`), le
-- jour (`at`) et l'ancre de semaine. ⚠️ ELLE PORTE DONC LES MOTS DE LA
-- PERSONNE — donnée personnelle, réclamée par l'export RGPD dès cette
-- migration (`account-export-v1`), et pas six mois plus tard.
--
-- `options` ne porte JAMAIS du texte libre: des `member_id` du roster, ou des
-- termes copiés du plan. C'est ce qui rend le tap vérifiable — le handler
-- compare l'index reçu aux options STOCKÉES, jamais à ce que la bulle affichait.
-- ---------------------------------------------------------------------------
create table if not exists public.memory_clarifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Laquelle des DEUX SOURCES a produit la note (nomenclature §2.1). Le chat
  -- n'y est pas, et n'y sera pas: il n'écrit rien.
  source text not null
    check (source in ('draft_note', 'plan_feedback')),

  -- Ce qu'on n'a pas su résoudre: la personne, ou l'aliment.
  about text not null
    check (about in ('who', 'what')),

  pending jsonb not null
    check (jsonb_typeof(pending) = 'object'),

  -- ⚠️ ENTRE 1 ET 4. Zéro option est une question sans réponse possible; au-delà
  -- de quatre ce n'est plus une clarification, c'est un formulaire — et le
  -- produit a déjà écrit qu'au-delà de quatre gestes on a perdu la personne.
  options jsonb not null
    check (jsonb_typeof(options) = 'array'
           and jsonb_array_length(options) between 1 and 4),

  -- `expired` couvre DEUX silences qu'on ne distingue pas et qu'on n'a pas à
  -- distinguer: la personne n'a pas répondu, ou une note plus récente a pris
  -- la place. Dans les deux cas rien n'est écrit.
  status text not null
    check (status in ('open', 'answered', 'declined', 'expired', 'undelivered')),

  -- L'option choisie, gardée pour l'audit: sans elle, « answered » ne dit pas
  -- CE QUI a été écrit, et la ligne de mémoire ne dit pas d'où vient son sujet.
  answer jsonb,
  chat_message_id uuid,
  content_locale text,

  -- Le jour LOCAL de la personne, jamais `current_date`: c'est l'unité du
  -- plafond, et le serveur n'est pas dans son fuseau.
  asked_local_date date not null,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  answered_at timestamptz,
  closed_at timestamptz,

  constraint memory_clarifications_closed_matches_status check (
    (status = 'open' and closed_at is null)
    or (status <> 'open' and closed_at is not null)),

  constraint memory_clarifications_answered_has_answer check (
    status <> 'answered' or (answer is not null and answered_at is not null))
);

-- ⚠️ UNE SEULE QUESTION OUVERTE PAR PERSONNE, et c'est l'index qui l'arbitre,
-- pas le code. Deux notes ambiguës dans la même minute (le bilan puis une
-- régénération) se disputeraient la place; la plus récente gagne, et l'ancienne
-- est close `expired` — le chat ne montre de toute façon les boutons que sur la
-- dernière bulle armée.
create unique index if not exists memory_clarifications_one_open_per_user
  on public.memory_clarifications (user_id)
  where status = 'open';

create index if not exists memory_clarifications_open_expires_idx
  on public.memory_clarifications (expires_at)
  where status = 'open';

comment on table public.memory_clarifications is
  'Une question posée dans le chat parce qu''une note ne disait pas de QUI ou '
  'de QUOI elle parlait. Écrite par le runtime seul; la personne la lit. Un '
  'tap l''écrit dans la mémoire, le silence n''écrit rien.';

-- ---------------------------------------------------------------------------
-- 3. RLS — la personne lit sa question, personne ne l'écrit
--
-- ⚠️ LA POLICY N'EST PAS UN SUBSTITUT AU `.eq('user_id', …)` DE L'APPELANT. Le
-- runtime lit en service_role: RLS ne le contraint pas. `memory_clarification_io.ts`
-- filtre explicitement sur `user_id` à chaque lecture, et le handler du tap
-- charge la ligne par PROPRIÉTAIRE, jamais par l'identifiant reçu du client —
-- cicatrice `rls-is-not-a-substitute-for-eq-user-id`.
-- ---------------------------------------------------------------------------
alter table public.memory_clarifications enable row level security;

drop policy if exists memory_clarifications_owner_select
  on public.memory_clarifications;
create policy memory_clarifications_owner_select
  on public.memory_clarifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. LES GRANTS — deux cicatrices honorées nommément
--
--   · « revoke from public » ne retire PAS `anon`, qui tient ses privilèges de
--     son propre grant (cicatrice `revoke-from-public-leaves-anon`);
--   · Supabase accorde TOUT à `authenticated` sur toute table neuve, TRUNCATE
--     compris — et TRUNCATE échappe à RLS (cicatrice
--     `supabase-default-privileges-grant-all-to-authenticated`).
--
-- ⚠️ ET ICI L'ÉCRITURE COMPTE DOUBLE: `pending` est ce que le tap écrira dans
-- la mémoire. Laisser `authenticated` la modifier reviendrait à laisser
-- n'importe qui composer sa propre ligne de préférence et la faire entrer par
-- le port `service_role`.
-- ---------------------------------------------------------------------------
revoke all on table public.memory_clarifications from anon;
revoke all on table public.memory_clarifications from public;
revoke insert, update, delete, truncate, references, trigger
  on table public.memory_clarifications from authenticated;
grant select on table public.memory_clarifications to authenticated;

-- ---------------------------------------------------------------------------
-- 5. LA PREUVE — dans la transaction, et dans les DEUX SENS
--
-- Une contrainte qu'on n'a pas vue refuser est une contrainte dont on ne sait
-- rien. Chaque bloc fait passer le cas nominal PUIS échouer le cas interdit:
-- une garde qui bloque tout ressemble à une garde qui marche (cicatrice
-- `guards-need-a-passing-case`).
-- ---------------------------------------------------------------------------
do $$
declare
  probe uuid := gen_random_uuid();
  first_row uuid;
  ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'memclar-probe-' || probe::text || '@keel.invalid');

  -- (a) LE CAS NOMINAL PASSE.
  insert into public.memory_clarifications
    (user_id, source, about, pending, options, status, asked_local_date, expires_at)
  values (probe, 'draft_note', 'who',
          '{"gate":"preferences","kind":"food.exclude","text":"poisson"}'::jsonb,
          '["11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222"]'::jsonb,
          'open', current_date, now() + interval '48 hours')
  returning id into first_row;

  -- (b) UNE SEULE QUESTION OUVERTE.
  begin
    insert into public.memory_clarifications
      (user_id, source, about, pending, options, status, asked_local_date, expires_at)
    values (probe, 'plan_feedback', 'what', '{"text":"la viande"}'::jsonb,
            '["poulet","boeuf"]'::jsonb, 'open', current_date,
            now() + interval '48 hours');
    raise exception 'memclar: deux questions ouvertes ont ete acceptees';
  exception when unique_violation then null;
  end;

  -- (c) UNE CLÔTURE EXIGE SA DATE.
  begin
    update public.memory_clarifications set status = 'declined' where id = first_row;
    raise exception 'memclar: une ligne close sans closed_at a ete acceptee';
  exception when check_violation then null;
  end;

  -- (d) UNE RÉPONSE EXIGE CE QUI A ÉTÉ RÉPONDU.
  begin
    update public.memory_clarifications
       set status = 'answered', closed_at = now()
     where id = first_row;
    raise exception 'memclar: une reponse sans answer a ete acceptee';
  exception when check_violation then null;
  end;

  -- (e) UNE RÉPONSE COMPLÈTE PASSE, et libère la place.
  update public.memory_clarifications
     set status = 'answered', closed_at = now(), answered_at = now(),
         answer = '{"index":0,"option":"11111111-1111-4111-8111-111111111111"}'::jsonb
   where id = first_row;
  insert into public.memory_clarifications
    (user_id, source, about, pending, options, status, asked_local_date, expires_at)
  values (probe, 'plan_feedback', 'what', '{"text":"la viande"}'::jsonb,
          '["poulet","boeuf"]'::jsonb, 'open', current_date,
          now() + interval '48 hours');

  -- (f) ZÉRO OPTION EST REFUSÉ — une question sans réponse possible.
  begin
    update public.memory_clarifications set options = '[]'::jsonb
     where user_id = probe and status = 'open';
    raise exception 'memclar: une question sans option a ete acceptee';
  exception when check_violation then null;
  end;

  -- (g) CINQ OPTIONS SONT REFUSÉES — au-delà de quatre c'est un formulaire.
  begin
    update public.memory_clarifications
       set options = '["a","b","c","d","e"]'::jsonb
     where user_id = probe and status = 'open';
    raise exception 'memclar: cinq options ont ete acceptees';
  exception when check_violation then null;
  end;

  -- (h) QUATRE OPTIONS PASSENT — la borne haute est atteignable.
  update public.memory_clarifications
     set options = '["a","b","c","d"]'::jsonb
   where user_id = probe and status = 'open';

  -- (i) UN `about` HORS LISTE EST REFUSÉ.
  begin
    update public.memory_clarifications set about = 'when'
     where user_id = probe and status = 'open';
    raise exception 'memclar: un about hors liste a ete accepte';
  exception when check_violation then null;
  end;

  -- (j) UNE SOURCE HORS LISTE EST REFUSÉE — le chat n'écrit pas.
  begin
    update public.memory_clarifications set source = 'conversation'
     where user_id = probe and status = 'open';
    raise exception 'memclar: la source conversation a ete acceptee';
  exception when check_violation then null;
  end;

  -- (k) LE SIXIÈME GENRE DU BUDGET EST ACCEPTÉ, et un genre inventé refusé.
  insert into public.meal_precision_questions
    (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
  values (probe, current_date, 'chat', null, 'memory_clarification',
          'probe', 'memclar-probe-' || probe::text);
  begin
    insert into public.meal_precision_questions
      (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
    values (probe, current_date, 'chat', null, 'memory_clarification_nudge',
            'probe', 'memclar-probe2-' || probe::text);
    raise exception 'memclar: un ask_kind hors liste a ete accepte';
  exception when check_violation then null;
  end;

  -- (l) LES PRIVILÈGES. Les deux cicatrices, vérifiées et pas supposées.
  select has_table_privilege('anon', 'public.memory_clarifications', 'SELECT') into ok;
  if ok then raise exception 'memclar: anon peut lire les questions'; end if;
  select has_table_privilege('anon', 'public.memory_clarifications', 'INSERT') into ok;
  if ok then raise exception 'memclar: anon peut ecrire des questions'; end if;

  select has_table_privilege('authenticated', 'public.memory_clarifications', 'TRUNCATE') into ok;
  if ok then raise exception 'memclar: authenticated peut TRUNCATE (echappe a RLS)'; end if;
  select has_table_privilege('authenticated', 'public.memory_clarifications', 'INSERT') into ok;
  if ok then raise exception 'memclar: authenticated peut inserer une question'; end if;
  select has_table_privilege('authenticated', 'public.memory_clarifications', 'UPDATE') into ok;
  if ok then raise exception 'memclar: authenticated peut modifier `pending`'; end if;
  select has_table_privilege('authenticated', 'public.memory_clarifications', 'DELETE') into ok;
  if ok then raise exception 'memclar: authenticated peut supprimer une question'; end if;

  -- LE CAS QUI DOIT PASSER: sans lui, tout ce qui precede serait vrai d'une
  -- table a laquelle personne n'a acces, ce qui n'est pas une garde.
  select has_table_privilege('authenticated', 'public.memory_clarifications', 'SELECT') into ok;
  if not ok then raise exception 'memclar: authenticated ne peut pas lire ses questions'; end if;

  -- (m) LA PURGE RGPD PASSE PAR LA CASCADE, et on le VÉRIFIE.
  delete from auth.users where id = probe;
  select exists(select 1 from public.memory_clarifications where user_id = probe) into ok;
  if ok then raise exception 'memclar: une question a survecu a la suppression du compte'; end if;

  raise notice 'memory_clarifications: 13 controles passes, dans les deux sens';
end $$;
