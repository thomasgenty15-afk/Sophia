-- DE-WHATSAPP — P0 : le ledger devient neutre, et le temps réel devient possible.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE FAIT CETTE MIGRATION
--   1. `whatsapp_outbound_messages`  → `outbound_messages`
--   2. `whatsapp_pending_actions`    → `pending_actions`
--   3. `inbound_dedup` : table NEUVE (pas un renommage — voir §3, le défaut)
--   4. `chat_messages` entre dans la publication `supabase_realtime`
--   5. deux vues de compatibilité, datées pour la démolition P5
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI DES VUES DE COMPATIBILITÉ, ET POURQUOI ELLES SONT TEMPORAIRES
--
-- `whatsapp-webhook`, `whatsapp-send`, `whatsapp-sim-*`,
-- `process-whatsapp-outbound-retries` et `process-whatsapp-optin-recovery`
-- meurent en P5. Les réécrire maintenant pour un renommage de table, c'est
-- éditer 6 fonctions condamnées — et perdre la capacité de COMPARER l'ancien
-- chemin au neuf pendant P1-P4. Les deux vues les laissent tourner inchangés.
--
-- Elles sont `security_invoker = true` : la vue ne doit pas devenir une porte
-- dérobée qui contourne la RLS de la table sous-jacente. Sans ce réglage, une
-- vue appartenant à `postgres` rend les lignes AVEC les droits du propriétaire
-- — exactement l'inverse de ce que la politique « select none » de
-- `whatsapp_pending_actions` existe pour dire.
--
-- LEUR SUPPRESSION EST UN LIVRABLE DE P5, PAS UNE OPTION.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §3 — LE DÉFAUT QUE `inbound_dedup` EXISTE POUR NE PAS HÉRITER
--
-- `whatsapp_inbound_dedup.wamid_in` porte un UNIQUE **global**, sans `user_id`.
-- C'était sans conséquence tant que la valeur venait de Meta : un `wamid` est
-- unique par construction, à l'échelle de la planète, et aucun client ne le
-- choisit.
--
-- Le `client_message_id` du chat in-app, lui, EST CHOISI PAR LE CLIENT. Hériter
-- de l'unique global signifierait : si l'élève A envoie `client_message_id`
-- "abc", le message de l'élève B portant "abc" est refusé en 23505 — c'est-à-dire
-- traité comme un doublon et **silencieusement jeté**. Un client boguée qui
-- émettrait des ids séquentiels ("1", "2", "3") suffit ; un client malveillant
-- fait taire qui il veut.
--
-- La clé de déduplication d'un identifiant fourni par le client est
-- OBLIGATOIREMENT `(user_id, client_message_id)`. C'est pour ça que c'est une
-- table neuve et pas un `alter ... rename column` : le renommage aurait
-- transporté l'unique global sans que personne le relise.
--
-- `whatsapp_inbound_dedup` n'est lue QUE par `whatsapp-webhook` : elle reste en
-- place, intacte, et meurt avec lui en P5.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. LE LEDGER DE LIVRAISON ───────────────────────────────────────────────

alter table if exists public.whatsapp_outbound_messages
  rename to outbound_messages;

alter index if exists public.whatsapp_outbound_messages_pkey
  rename to outbound_messages_pkey;

alter table public.outbound_messages
  rename constraint whatsapp_outbound_messages_message_type_check
  to outbound_messages_message_type_check;

alter table public.outbound_messages
  rename constraint whatsapp_outbound_messages_status_check
  to outbound_messages_status_check;

-- `to_e164` était NOT NULL parce qu'un envoi Graph a besoin d'un numéro.
-- Une livraison in-app n'en a pas: la cible est `user_id`, point. La colonne
-- reste (l'historique WhatsApp la remplit) mais cesse d'être obligatoire.
alter table public.outbound_messages
  alter column to_e164 drop not null;

-- Le canal, explicitement porté par la ligne. Sans lui, distinguer
-- « historique WhatsApp » de « livraison in-app » demanderait de deviner
-- depuis `graph_payload`, ce qui est exactement le genre de déduction
-- silencieuse que ce chantier supprime.
alter table public.outbound_messages
  add column if not exists delivery_channel text not null default 'whatsapp';

-- Les lignes existantes sont, par construction, du WhatsApp: le défaut ci-dessus
-- les décrit correctement. Mais le DEFAULT ne doit pas survivre à la migration,
-- sinon toute nouvelle ligne qui oublie le champ se déclare WhatsApp.
alter table public.outbound_messages
  alter column delivery_channel drop default;

alter table public.outbound_messages
  drop constraint if exists outbound_messages_delivery_channel_check;
alter table public.outbound_messages
  add constraint outbound_messages_delivery_channel_check
  check (delivery_channel in ('whatsapp', 'in_app', 'email'));

-- `message_type`: `template` reste ACCEPTÉ pour l'historique, il n'est
-- simplement plus jamais écrit. `interactive_buttons` devient le porteur des
-- questions armées in-app.
comment on table public.outbound_messages is
  'Ledger de livraison multi-canal. `whatsapp` = historique gelé (plus aucun '
  'writer depuis le chantier de-whatsapp). `in_app` = la bulle de chat.';

create index if not exists outbound_messages_user_channel_created_idx
  on public.outbound_messages (user_id, delivery_channel, created_at desc);

-- ── 2. L'ÉTAT DES FLOWS ─────────────────────────────────────────────────────
-- Ce n'est pas du transport, c'est l'état des flows: le nom le disait mal.

alter table if exists public.whatsapp_pending_actions
  rename to pending_actions;

alter index if exists public.whatsapp_pending_actions_pkey
  rename to pending_actions_pkey;
alter index if exists public.whatsapp_pending_actions_lookup_idx
  rename to pending_actions_lookup_idx;
alter index if exists public.whatsapp_pending_actions_deferred_due_idx
  rename to pending_actions_deferred_due_idx;
alter index if exists public.whatsapp_pending_actions_proactive_candidate_idx
  rename to pending_actions_proactive_candidate_idx;

alter table public.pending_actions
  rename constraint whatsapp_pending_actions_kind_check
  to pending_actions_kind_check;
alter table public.pending_actions
  rename constraint whatsapp_pending_actions_status_check
  to pending_actions_status_check;
alter table public.pending_actions
  rename constraint whatsapp_pending_actions_user_id_fkey
  to pending_actions_user_id_fkey;
alter table public.pending_actions
  rename constraint whatsapp_pending_actions_scheduled_checkin_id_fkey
  to pending_actions_scheduled_checkin_id_fkey;

comment on table public.pending_actions is
  'État des flows en attente d''une réponse de l''élève. Agnostique au canal '
  'depuis le chantier de-whatsapp.';

-- ── 3. LA DÉDUPLICATION DE L'ENTRANT IN-APP ─────────────────────────────────

create table if not exists public.inbound_dedup (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Choisi par le client. D'où l'unique COMPOSITE ci-dessous, et non global.
  client_message_id text not null,
  request_id text,
  status text not null default 'received',
  processed_at timestamptz,
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  constraint inbound_dedup_status_check
    check (status in ('received', 'processed', 'failed'))
);

-- LA garantie d'idempotence: deux POST identiques → une seule ligne → un seul
-- tour de moteur. Et la portée par élève: le `client_message_id` d'un élève ne
-- peut PAS faire taire celui d'un autre.
create unique index if not exists inbound_dedup_user_client_message_idx
  on public.inbound_dedup (user_id, client_message_id);

create index if not exists inbound_dedup_user_created_idx
  on public.inbound_dedup (user_id, created_at desc);

alter table public.inbound_dedup enable row level security;

-- Lecture: son propre journal, rien d'autre. Écriture: service_role seulement
-- (aucune policy insert/update ⇒ personne d'autre n'écrit, et surtout pas le
-- client, qui pourrait sinon pré-réserver un id pour bloquer son propre tour).
create policy rls_inbound_dedup_select_own on public.inbound_dedup
  for select using (auth.uid() = user_id);

grant select on public.inbound_dedup to authenticated;
grant select, insert, update, delete on public.inbound_dedup to service_role;
-- `anon` n'a rien à faire ici. Ne PAS écrire `revoke ... from public`: les
-- default privileges Supabase laissent `anon` armé (mémoire projet), il faut
-- le nommer.
revoke all on public.inbound_dedup from anon;

comment on table public.inbound_dedup is
  'Idempotence des entrants in-app. Clé (user_id, client_message_id): un id '
  'fourni par le client ne peut jamais être unique globalement.';

-- ── 4. LE TEMPS RÉEL ────────────────────────────────────────────────────────
--
-- VÉRIFIÉ AVANT D'ÉCRIRE: `select * from pg_publication_tables where
-- pubname='supabase_realtime'` rendait **0 ligne**. Le temps réel n'était donc
-- actif sur AUCUNE table — la bulle aurait « marché » en développement (le
-- client s'abonne sans erreur) et n'aurait jamais rien reçu. C'est le défaut
-- n°1 du dépôt: un abonnement muet est indiscernable d'un flux vide.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- ── 5. LES VUES DE COMPATIBILITÉ (À DÉTRUIRE EN P5) ─────────────────────────

create or replace view public.whatsapp_outbound_messages
  with (security_invoker = true) as
  select * from public.outbound_messages;

create or replace view public.whatsapp_pending_actions
  with (security_invoker = true) as
  select id, user_id, kind, status, scheduled_checkin_id, payload,
         expires_at, created_at, processed_at, not_before
    from public.pending_actions;

comment on view public.whatsapp_outbound_messages is
  'COMPAT DE-WHATSAPP — à supprimer en P5 avec whatsapp-send et les retries.';
comment on view public.whatsapp_pending_actions is
  'COMPAT DE-WHATSAPP — à supprimer en P5 avec whatsapp-webhook.';

grant select, insert, update, delete
  on public.whatsapp_outbound_messages to service_role;
grant select, insert, update, delete
  on public.whatsapp_pending_actions to service_role;

-- ── 6. FAIL LOUD (R7) — « la migration est passée » n'est pas une vérification
do $$
declare
  n int;
  ok bool;
begin
  -- Les tables neuves existent sous leur nom neutre.
  perform 1 from pg_class where relname = 'outbound_messages' and relkind = 'r';
  if not found then raise exception 'dewhatsapp: outbound_messages absente'; end if;
  perform 1 from pg_class where relname = 'pending_actions' and relkind = 'r';
  if not found then raise exception 'dewhatsapp: pending_actions absente'; end if;
  perform 1 from pg_class where relname = 'inbound_dedup' and relkind = 'r';
  if not found then raise exception 'dewhatsapp: inbound_dedup absente'; end if;

  -- Les vues de compat sont des VUES, pas des tables restées en place.
  perform 1 from pg_class where relname = 'whatsapp_outbound_messages' and relkind = 'v';
  if not found then raise exception 'dewhatsapp: la compat outbound n''est pas une vue'; end if;
  perform 1 from pg_class where relname = 'whatsapp_pending_actions' and relkind = 'v';
  if not found then raise exception 'dewhatsapp: la compat pending n''est pas une vue'; end if;

  -- L'unique de dedup est COMPOSITE. C'est la garantie de §3: si quelqu'un la
  -- réduit un jour à `client_message_id` seul, ce test tombe.
  select count(*) into n
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where i.indrelid = 'public.inbound_dedup'::regclass
     and i.indisunique
     and c.relname = 'inbound_dedup_user_client_message_idx'
     and array_length(i.indkey::int[], 1) = 2;
  if n <> 1 then
    raise exception 'dewhatsapp: la dedup entrante n''est pas (user_id, client_message_id)';
  end if;

  -- Le temps réel est réellement armé.
  perform 1 from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename = 'chat_messages';
  if not found then
    raise exception 'dewhatsapp: chat_messages hors publication realtime';
  end if;

  -- `delivery_channel` n'a PAS de default: une ligne qui oublie le canal doit
  -- échouer, pas se déclarer WhatsApp.
  select (column_default is null) into ok
    from information_schema.columns
   where table_schema = 'public' and table_name = 'outbound_messages'
     and column_name = 'delivery_channel';
  if not ok then
    raise exception 'dewhatsapp: delivery_channel a repris un DEFAULT silencieux';
  end if;

  -- anon désarmé sur la table neuve (mémoire projet: revoke from public laisse anon).
  if has_table_privilege('anon', 'public.inbound_dedup', 'SELECT') then
    raise exception 'dewhatsapp: anon peut lire inbound_dedup';
  end if;

  raise notice 'dewhatsapp: ledger neutre en place, realtime armé sur chat_messages';
end $$;
