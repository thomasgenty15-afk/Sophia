-- ============================================================================
-- LE BUDGET DE DEMANDE — UN compteur, pas trois (T4 du domaine conversation)
--
-- `meal_precision_questions` portait DÉJÀ le bon geste: une ligne par demande
-- réellement partie, sa journée LOCALE, sa clé d'idempotence. Ce qui manquait
-- n'était pas la table, c'était son PÉRIMÈTRE: elle ne connaissait qu'un seul
-- genre de demande (la question de précision) alors que la règle transverse
-- dit « une seule demande par jour, TOUTES SURFACES CONFONDUES ».
--
-- Trois fiches veulent y entrer: la question d'approfondissement (FF-017),
-- l'invitation à la photo (FF-025), et la recommandation quotidienne (FF-028).
-- Trois tables séparées = trois demandes par jour = un interrogatoire obtenu
-- en respectant trois fois la règle. On élargit donc CELLE-CI plutôt que d'en
-- créer une deuxième.
--
-- ── POURQUOI LA TABLE N'EST PAS RENOMMÉE ────────────────────────────────────
-- Un renommage demande trois épreuves d'absence (code, `prosrc`, vues) et
-- traverse `account-export-v1`, le lifecycle RGPD et six scripts de QA. Le nom
-- physique reste donc `meal_precision_questions`; le nom LOGIQUE est le budget
-- de demande, il vit dans `_shared/keel/daily_ask_budget.ts`, et le commentaire
-- de table ci-dessous est la seule autorité sur ce que la table contient.
-- Le renommage est un chantier à part, listé au rapport FF-025.
--
-- ── CE QUE LA MIGRATION FAIT, ET RIEN DE PLUS ───────────────────────────────
--   (a) `ask_kind`  — le genre de demande. Liste FERMÉE, défaut rétro-compatible
--       pour les 57 lignes déjà écrites, qui étaient toutes des questions de
--       précision;
--   (b) `axis` devient NULLABLE — une invitation à la photo n'a pas d'axe de
--       précision, et lui en inventer un ferait entrer une valeur fausse dans
--       une colonne que `meal_precision_flow` relit;
--   (c) le CHECK d'axe devient CONDITIONNEL: une question de précision DOIT
--       porter un axe de la liste fermée, les autres genres DOIVENT n'en porter
--       aucun. Un CHECK simplement relâché aurait laissé une question de
--       précision sans axe passer en silence.
--   (d) `source` accepte `'chat'` — le canal par lequel l'invitation part n'est
--       ni le texte d'un repas déclaré ni une photo analysée, c'est le tour de
--       conversation lui-même.
-- ============================================================================

-- (a) le genre de demande ---------------------------------------------------
alter table public.meal_precision_questions
  add column if not exists ask_kind text not null
    default 'meal_precision_question';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.meal_precision_questions'::regclass
       and conname = 'meal_precision_questions_ask_kind_check'
  ) then
    -- LISTE FERMÉE, alignée sur `DAILY_ASK_KINDS` côté code. Un genre ajouté
    -- ici sans l'être là-bas (ou l'inverse) casse un test qui rejoue le CHECK.
    alter table public.meal_precision_questions
      add constraint meal_precision_questions_ask_kind_check
      check (ask_kind in (
        'meal_precision_question',   -- FF-017 §3 (et le chemin photo FF-018)
        'photo_invitation',          -- FF-025
        'daily_recommendation'       -- FF-028
      ));
  end if;
end $$;

-- (b) + (c) l'axe, nullable mais pas libre ----------------------------------
alter table public.meal_precision_questions
  alter column axis drop not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.meal_precision_questions'::regclass
       and conname = 'meal_precision_questions_axis_check'
  ) then
    alter table public.meal_precision_questions
      drop constraint meal_precision_questions_axis_check;
  end if;

  -- ⚠️ `axis is not null and axis in (...)` — le `is not null` N'EST PAS
  -- décoratif, et le contrôle final l'a trouvé. Écrit sans lui, l'expression
  -- rendait NULL sur une question de précision sans axe, et un CHECK qui rend
  -- NULL **passe**: le relâchement du NOT NULL avait donc silencieusement
  -- désarmé la règle qu'il devait conserver. Une garde relâchée pour un cas
  -- s'était retirée pour tous.
  alter table public.meal_precision_questions
    add constraint meal_precision_questions_axis_check
    check (
      case
        when ask_kind = 'meal_precision_question'
          -- R1: `portion` n'y est pas et ne doit jamais y entrer — ce serait la
          -- question de quantité que le contrat interdit, arrivée par la porte
          -- des données.
          then axis is not null
            and axis in ('composition', 'accompaniment', 'preparation', 'slot')
        else axis is null
      end
    );
end $$;

-- (d) le canal --------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.meal_precision_questions'::regclass
       and conname = 'meal_precision_questions_source_check'
  ) then
    alter table public.meal_precision_questions
      drop constraint meal_precision_questions_source_check;
  end if;
  alter table public.meal_precision_questions
    add constraint meal_precision_questions_source_check
    check (source in ('text', 'photo', 'chat'));
end $$;

-- LA LIGNE D'ÉDUCATION « UNE FOIS PAR PERSONNE » se lit ICI, et pas dans
-- `user_chat_states.temp_memory` comme le proposait FF-025 §11. Deux raisons,
-- et la première suffit: `temp_memory` a DEUX écrivains concurrents en
-- lecture-modification-écriture complète (le tour texte et le chemin photo), le
-- dernier gagne, et un « déjà dit » qu'on peut perdre est un « déjà dit » qui
-- sera redit. La seconde: le souvenir doit survivre un MOIS, et `temp_memory`
-- est une mémoire de tour.
-- L'index sert cette lecture — « cette personne a-t-elle déjà été invitée, un
-- jour, quel qu'il soit ». Il ne porte pas `local_date` exprès.
create index if not exists meal_precision_questions_kind_idx
  on public.meal_precision_questions (user_id, ask_kind);

comment on table public.meal_precision_questions is
  'LE BUDGET DE DEMANDE (T4): une ligne par demande RÉELLEMENT partie vers un '
  'élève, toutes surfaces confondues. Le nom physique est historique — la table '
  'ne contient plus seulement des questions de précision (`ask_kind`). Sert '
  'trois usages: le plafond du jour (count(*) par user_id + local_date, max 1), '
  'le « déjà dit une fois par personne » (exists par user_id + ask_kind), et la '
  'trace d''audit du texte posé. Accès unique: '
  '_shared/keel/daily_ask_budget.ts.';

comment on column public.meal_precision_questions.ask_kind is
  'Le genre de demande. Liste fermée, alignée sur DAILY_ASK_KINDS. Toutes les '
  'demandes partagent le MÊME plafond: trois compteurs séparés = trois '
  'demandes par jour = un interrogatoire.';

-- ----------------------------------------------------------------------------
-- CONTRÔLE FINAL — on rejoue le geste, on n'inspecte pas du texte.
-- ----------------------------------------------------------------------------
do $$
declare
  probe_user uuid;
begin
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'daily_ask_budget: aucun utilisateur, contrôles de geste sautés';
    return;
  end if;

  -- (1) une invitation SANS axe doit passer.
  insert into public.meal_precision_questions
    (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
  values
    (probe_user, date '1999-01-01', 'chat', null, 'photo_invitation',
     'probe', 'probe:daily_ask_budget:1');

  -- (2) une invitation AVEC un axe doit être refusée.
  begin
    insert into public.meal_precision_questions
      (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
    values
      (probe_user, date '1999-01-01', 'chat', 'composition', 'photo_invitation',
       'probe', 'probe:daily_ask_budget:2');
    raise exception
      'daily_ask_budget: un axe sur une invitation a été accepté — le CHECK '
      'conditionnel ne mord pas';
  exception when check_violation then
    null;
  end;

  -- (3) une question de précision SANS axe doit être refusée: le relâchement
  --     ne doit pas avoir désarmé la règle d'origine.
  begin
    insert into public.meal_precision_questions
      (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
    values
      (probe_user, date '1999-01-01', 'text', null, 'meal_precision_question',
       'probe', 'probe:daily_ask_budget:3');
    raise exception
      'daily_ask_budget: une question de précision sans axe a été acceptée — '
      'le CHECK conditionnel a désarmé la règle qu''il devait garder';
  exception when check_violation then
    null;
  end;

  -- (4) un genre inconnu doit être refusé.
  begin
    insert into public.meal_precision_questions
      (user_id, local_date, source, axis, ask_kind, question, asked_for_message_id)
    values
      (probe_user, date '1999-01-01', 'chat', null, 'nudge_du_matin',
       'probe', 'probe:daily_ask_budget:4');
    raise exception 'daily_ask_budget: un ask_kind hors liste a été accepté';
  exception when check_violation then
    null;
  end;

  delete from public.meal_precision_questions
   where asked_for_message_id like 'probe:daily_ask_budget:%';

  -- (5) `anon` n'a toujours rien sur cette table (les default privileges de
  --     Supabase accordent à anon directement, et un ALTER TABLE ne les
  --     rétablit pas — mais on le REJOUE plutôt que de le supposer).
  if has_table_privilege('anon', 'public.meal_precision_questions', 'SELECT') then
    raise exception 'daily_ask_budget: anon a retrouvé un SELECT';
  end if;
  if has_table_privilege('authenticated', 'public.meal_precision_questions', 'INSERT') then
    raise exception 'daily_ask_budget: authenticated a retrouvé un INSERT';
  end if;
end $$;
