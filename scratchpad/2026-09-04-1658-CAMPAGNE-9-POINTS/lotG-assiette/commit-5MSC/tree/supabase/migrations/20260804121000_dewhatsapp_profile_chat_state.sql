-- DE-WHATSAPP — P0 : l'état conversationnel de l'élève cesse de s'appeler WhatsApp.
--
-- Deux colonnes seulement, parce que deux seulement sont LUES par une décision :
--
--   `chat_last_inbound_at`  — « une conversation est-elle en cours ? »
--        C'est le seul usage de `whatsapp_last_inbound_at` qui survit. Les
--        autres (fenêtre 24h, éligibilité template) meurent avec Meta.
--
--   `proactive_muted_at`    — l'ancien STOP, re-fondé en réglage produit.
--        `whatsapp_opted_out_at` était une OBLIGATION Meta : ne plus jamais
--        écrire à ce numéro. Ici, c'est un choix de l'élève qui ne coupe QUE
--        les relances : s'il écrit, on lui répond (voir `delivery_policy.ts`,
--        garde 2 avant garde 4). Deux sémantiques différentes ⇒ deux colonnes,
--        et pas un renommage qui aurait transporté l'ancienne en silence.
--
-- LE BACKFILL EST DÉLIBÉRÉMENT ASYMÉTRIQUE, et c'est le point de ce fichier :
--   * `chat_last_inbound_at` reprend l'historique WhatsApp : un élève qui a
--     écrit hier sur WhatsApp est un élève avec qui une conversation est en
--     cours, quel que soit le tuyau.
--   * `proactive_muted_at` reprend aussi l'opt-out — dans ce sens-là seulement.
--     Quelqu'un qui a dit STOP a dit stop. Le lire à l'envers (« il n'avait
--     jamais opt-in Meta, donc il est muet ») ferait taire la totalité de la
--     base d'élèves KEEL, qui n'a jamais eu d'opt-in Meta du tout. C'est le
--     défaut qu'un `not whatsapp_opted_in` aurait produit sans bruit.

alter table public.profiles
  add column if not exists chat_last_inbound_at timestamptz;

alter table public.profiles
  add column if not exists proactive_muted_at timestamptz;

comment on column public.profiles.chat_last_inbound_at is
  'Dernier message ENTRANT de l''élève, tous canaux. Sert à une seule question: '
  'une conversation est-elle active ? (delivery_policy.ts)';

comment on column public.profiles.proactive_muted_at is
  'L''élève a coupé les relances proactives. Ne coupe JAMAIS la réponse à un '
  'message qu''il envoie.';

update public.profiles
   set chat_last_inbound_at = whatsapp_last_inbound_at
 where chat_last_inbound_at is null
   and whatsapp_last_inbound_at is not null;

update public.profiles
   set proactive_muted_at = whatsapp_opted_out_at
 where proactive_muted_at is null
   and whatsapp_opted_out_at is not null;

create index if not exists profiles_chat_last_inbound_idx
  on public.profiles (chat_last_inbound_at desc)
  where chat_last_inbound_at is not null;

-- FAIL LOUD (R7).
do $$
declare
  leaked int;
begin
  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name = 'chat_last_inbound_at';
  if not found then raise exception 'dewhatsapp: chat_last_inbound_at absente'; end if;

  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name = 'proactive_muted_at';
  if not found then raise exception 'dewhatsapp: proactive_muted_at absente'; end if;

  -- Le backfill n'a laissé aucun opt-out derrière lui.
  select count(*) into leaked
    from public.profiles
   where whatsapp_opted_out_at is not null
     and proactive_muted_at is null;
  if leaked > 0 then
    raise exception 'dewhatsapp: % opt-out WhatsApp non repris en mute', leaked;
  end if;

  -- Et surtout: il n'a MUTÉ PERSONNE qui n'avait rien demandé.
  select count(*) into leaked
    from public.profiles
   where proactive_muted_at is not null
     and whatsapp_opted_out_at is null;
  if leaked > 0 then
    raise exception 'dewhatsapp: % élèves mutés sans avoir dit stop', leaked;
  end if;

  raise notice 'dewhatsapp: état conversationnel neutre en place';
end $$;
