-- PIVOT NUTRITION — N2 : le CHECK qui tuait la question d'axe.
--
-- `createWhatsAppOutboundRow` accepte `message_type: 'interactive_buttons'`
-- depuis N2 (le commentaire dans `_shared/whatsapp_outbound_tracking.ts` dit
-- même pourquoi : « un chemin d'envoi parallèle échapperait aux retries, aux
-- caps et au comptage de coût »). Le CHECK de la table, lui, est resté à
-- ('text', 'template') — l'union TypeScript a été élargie, la contrainte SQL
-- jamais.
--
-- CE QUE ÇA CASSAIT, mesuré en local le 2026-08-03 :
--   tap « Rough » → la ligne `student_daily_checkins` s'écrit (overall='hard'),
--   puis `sendPulseReply` → `sendWhatsAppButtonsTracked` →
--   `createWhatsAppOutboundRow` → INSERT refusé → exception avalée par le
--   try/catch de `sendPulseReply` (« un échec d'accusé ne doit pas faire
--   échouer le webhook »). L'élève ne reçoit RIEN : ni accusé, ni la question
--   d'axe. La colonne `axis` n'était donc jamais renseignée par personne.
--   Asymétrie cruelle au passage : « All good » part par le chemin texte et
--   répond ; seul celui qui dit que sa journée a été dure est ignoré.
--
-- Le défaut est invisible à la lecture des deux côtés pris séparément, et
-- invisible aux tests : aucun test ne traversait `createWhatsAppOutboundRow`
-- avec ce type. C'est la classe de défaut n°1 du dépôt (garde/valeur testée
-- verte sur un chemin que la production ne prend pas), en miroir : ici c'est
-- la production qui prend un chemin qu'aucun test ne prend.

alter table public.whatsapp_outbound_messages
  drop constraint if exists whatsapp_outbound_messages_message_type_check;

alter table public.whatsapp_outbound_messages
  add constraint whatsapp_outbound_messages_message_type_check
  check (message_type in ('text', 'template', 'interactive_buttons'));

comment on column public.whatsapp_outbound_messages.message_type is
  'text | template | interactive_buttons. `interactive_buttons` est le tap du '
  'soir et sa relance d''axe: même table, donc mêmes retries, même cap, même '
  'comptage de coût qu''un envoi texte.';

-- Fail loud (R7) : la contrainte doit accepter les TROIS valeurs et refuser
-- tout le reste. « La migration est passée » n'est pas une vérification.
do $$
declare ok boolean;
begin
  perform 1 from pg_constraint
   where conrelid = 'public.whatsapp_outbound_messages'::regclass
     and conname = 'whatsapp_outbound_messages_message_type_check';
  if not found then
    raise exception 'pivot: contrainte message_type absente';
  end if;

  ok := pg_get_constraintdef(oid) like '%interactive_buttons%'
    from pg_constraint
   where conrelid = 'public.whatsapp_outbound_messages'::regclass
     and conname = 'whatsapp_outbound_messages_message_type_check';
  if not ok then
    raise exception 'pivot: le CHECK n''admet toujours pas interactive_buttons';
  end if;
  raise notice 'pivot: whatsapp_outbound_messages.message_type admet interactive_buttons';
end $$;
