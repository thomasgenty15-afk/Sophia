-- DE-WHATSAPP — P8 : le pendant neutre du dernier SORTANT.
--
-- `20260804121000` avait créé `chat_last_inbound_at` parce qu'une seule
-- question en dépendait (« une conversation est-elle active ? »). Le balayage
-- final en a trouvé une seconde, tout aussi vivante : la FRAÎCHEUR du salut.
--
-- `process-checkins` compare `whatsapp_last_inbound_at` et
-- `whatsapp_last_outbound_at` pour décider si Sophia dit « bonjour » ou
-- reprend une conversation en cours. Les deux colonnes n'ont plus AUCUN writer
-- depuis que l'entrant écrit `chat_last_inbound_at` et que `whatsapp-send` est
-- supprimée : figées dans le passé, elles font passer chaque élève pour
-- éternellement absent.
--
-- C'est le même défaut que les quatre gardes d'opt-in, mais dans l'autre sens :
-- au lieu de faire taire le produit, une valeur figée le fait se répéter.

alter table public.profiles
  add column if not exists chat_last_outbound_at timestamptz;

comment on column public.profiles.chat_last_outbound_at is
  'Dernier message SORTANT vers l''eleve, tous canaux. Sert a la fraicheur du '
  'salut (dire bonjour vs reprendre). Ecrit par deliverChatMessage.';

update public.profiles
   set chat_last_outbound_at = whatsapp_last_outbound_at
 where chat_last_outbound_at is null
   and whatsapp_last_outbound_at is not null;

comment on column public.profiles.whatsapp_last_outbound_at is
  'GELÉE (de-whatsapp). Remplacée par chat_last_outbound_at. Plus aucun writer.';

do $$
declare leaked int;
begin
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name='chat_last_outbound_at';
  if not found then raise exception 'dewhatsapp: chat_last_outbound_at absente'; end if;

  select count(*) into leaked from public.profiles
   where whatsapp_last_outbound_at is not null and chat_last_outbound_at is null;
  if leaked > 0 then
    raise exception 'dewhatsapp: % sortants non repris', leaked;
  end if;
  raise notice 'dewhatsapp: chat_last_outbound_at en place';
end $$;
