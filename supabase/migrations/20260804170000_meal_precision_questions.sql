-- ============================================================================
-- LE PLAFOND DES QUESTIONS DE PRÉCISION — structurel, pas conversationnel
--
-- Le produit pose UNE question quand un repas déclaré est trop imprécis pour
-- servir au coach. Sans plafond, un élève qui déclare cinq repas en reçoit
-- cinq, puis cesse de déclarer ses repas — ce qui coûte plus cher que
-- l'imprécision qu'on voulait corriger. La règle est donc « deux questions
-- maximum par jour et par élève, toutes sources confondues ».
--
-- POURQUOI UNE TABLE, ET PAS UN COMPTEUR EN MÉMOIRE DE TOUR
-- ---------------------------------------------------------
-- Une mémoire de tour repart de zéro à chaque message: elle ne plafonne rien.
-- Une colonne `questions_asked_today` sur le profil demanderait une remise à
-- zéro à minuit — c'est-à-dire un cron, un fuseau, et la famille de bugs
-- nocturnes que ce dépôt a déjà payée. Une LIGNE PAR QUESTION portant sa
-- `local_date` n'a rien à remettre à zéro: le compte du jour est un `count(*)`,
-- et il est vérifiable en SQL par n'importe qui, ce que le prompt exige.
--
-- ELLE EST AUSSI LA TRACE. « Cet élève a-t-il été questionné, sur quoi, et
-- est-ce que ça a servi ? » est la question qu'on se posera dans un mois pour
-- savoir si la règle de mise est trop large. Un compteur ne répond pas; ces
-- lignes-là, oui.
--
-- LES DEUX SOURCES PARTAGENT LA TABLE, et c'est tout l'intérêt: photo et texte
-- ont chacun leur chemin d'exécution, et deux compteurs séparés donneraient
-- quatre questions par jour à un élève qui envoie des photos ET écrit.
-- ============================================================================

create table if not exists public.meal_precision_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- La journée LOCALE de l'élève, résolue par l'appelant dans son fuseau.
  -- Jamais `current_date`: le serveur n'est pas dans le fuseau de l'élève, et
  -- un plafond calculé sur la date du serveur s'ouvre ou se ferme au mauvais
  -- moment pour tout le monde sauf UTC.
  local_date date not null,

  asked_at timestamptz not null default now(),

  -- 'text' | 'photo'. Le canal par lequel la question est partie.
  source text not null,

  -- L'axe demandé. Même liste fermée que `MEAL_PRECISION_AXES` côté code.
  axis text not null,

  -- La ligne que cette question cherche à préciser. `on delete set null`:
  -- une purge RGPD du fait ne doit pas effacer la trace du plafond, sinon un
  -- élève retrouverait ses deux questions en supprimant un repas.
  protocol_event_id uuid references public.protocol_events(id) on delete set null,

  -- Le texte EXACT posé. C'est ce qui rend l'audit possible: « est-ce qu'une
  -- question de quantité est déjà sortie ? » se répond par un SELECT, pas par
  -- une relecture de prompt.
  question text not null,

  -- LE MESSAGE QUI A DÉCLENCHÉ LA QUESTION — la clé d'idempotence.
  -- Un tour rejoué (Kong rend un 502 sans corps, l'élève renvoie, le client
  -- retente) ne doit pas consommer deux places du plafond pour une seule
  -- question réellement posée.
  asked_for_message_id text not null
);

comment on table public.meal_precision_questions is
  'Une ligne par question de précision RÉELLEMENT posée à un élève. Sert deux '
  'usages: le plafond du jour (count(*) par user_id + local_date, max 2, photo '
  'et texte confondus) et la trace d''audit du texte posé.';

-- Le plafond se lit par cet index, et rien d'autre.
create index if not exists meal_precision_questions_day_idx
  on public.meal_precision_questions (user_id, local_date);

-- L'IDEMPOTENCE, dans le schéma plutôt que dans un « ai-je déjà vu ce
-- message ? » côté client, qui court contre lui-même quand deux tours du même
-- message arrivent en parallèle (`subscription-confirmation-messages`).
create unique index if not exists meal_precision_questions_message_idx
  on public.meal_precision_questions (user_id, asked_for_message_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.meal_precision_questions'::regclass
       and conname = 'meal_precision_questions_source_check'
  ) then
    alter table public.meal_precision_questions
      add constraint meal_precision_questions_source_check
      check (source in ('text', 'photo'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.meal_precision_questions'::regclass
       and conname = 'meal_precision_questions_axis_check'
  ) then
    -- R1: liste fermée, alignée sur `MEAL_PRECISION_AXES`. `portion` n'y est
    -- pas et ne doit jamais y entrer — ce serait la question de quantité que le
    -- contrat interdit, arrivée par la porte des données.
    alter table public.meal_precision_questions
      add constraint meal_precision_questions_axis_check
      check (axis in ('composition', 'accompaniment', 'preparation', 'slot'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- RLS — table de RUNTIME, lue et écrite par le service role uniquement.
--
-- Aucune policy `authenticated`: ni l'élève ni le coach n'ont à lire ce
-- compteur depuis le client. RLS activée SANS policy = tout est refusé aux
-- rôles porteurs, ce qui est exactement l'intention. Le service role passe
-- outre RLS par conception.
-- ----------------------------------------------------------------------------

alter table public.meal_precision_questions enable row level security;

-- `revoke ... from public` NE SUFFIT PAS: les default privileges de Supabase
-- accordent à `anon` et `authenticated` directement, pas via `public`. Le seul
-- contrôle qui prouve quelque chose est `has_table_privilege('anon', ...)`, et
-- il est plus bas.
revoke all on public.meal_precision_questions from anon, authenticated;

-- ----------------------------------------------------------------------------
-- CONTRÔLE FINAL — on rejoue le geste, on n'inspecte pas du texte.
-- ----------------------------------------------------------------------------

do $$
declare
  probe_user uuid;
  violated boolean := false;
begin
  -- (a) `anon` ne doit rien pouvoir faire de cette table.
  if has_table_privilege('anon', 'public.meal_precision_questions', 'SELECT')
  then
    raise exception
      'meal_precision_questions: anon conserve un SELECT — le revoke n''a pas '
      'mordu (les default privileges Supabase accordent à anon directement)';
  end if;
  if has_table_privilege('authenticated', 'public.meal_precision_questions', 'INSERT')
  then
    raise exception
      'meal_precision_questions: authenticated conserve un INSERT — un client '
      'pourrait saturer son propre plafond et se rendre muet';
  end if;

  -- (b) l'idempotence mord vraiment, sur un vrai INSERT annulé ensuite.
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'meal_precision_questions: aucun utilisateur en base, contrôle d''idempotence sauté';
    return;
  end if;

  begin
    insert into public.meal_precision_questions
      (user_id, local_date, source, axis, question, asked_for_message_id)
    values
      (probe_user, current_date, 'text', 'accompaniment', 'probe?', 'probe-msg'),
      (probe_user, current_date, 'text', 'accompaniment', 'probe?', 'probe-msg');
    raise exception
      'meal_precision_questions: meal_precision_questions_message_idx N''A PAS '
      'empêché un doublon — un rejeu consommerait deux places du plafond';
  exception
    when unique_violation then
      violated := true;
  end;

  if not violated then
    raise exception 'meal_precision_questions: contrôle d''idempotence non concluant';
  end if;

  raise notice 'meal_precision_questions: RLS et idempotence vérifiées par de vrais gestes';
end $$;
