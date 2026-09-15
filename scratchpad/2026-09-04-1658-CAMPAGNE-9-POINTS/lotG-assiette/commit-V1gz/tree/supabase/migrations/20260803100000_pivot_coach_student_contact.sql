-- PIVOT NUTRITION §1.4 — l'écran Cohorte a besoin d'UNE donnée qu'il n'a pas
-- le droit de lire.
--
-- LE PROBLÈME, EXACTEMENT
-- -----------------------
-- Le pivot demande que la liste d'élèves affiche « actif / glisse / silencieux »
-- (§1.4). Cet état se dérive du DERNIER MESSAGE ENTRANT de l'élève, qui vit
-- dans `chat_messages`. Or `chat_messages` est hermétiquement fermée au coach
-- (doctrine KEEL, `20260727090000` l.706-740 : mémoire, conversations, safety
-- et billing n'ont AUCUNE policy coach). Et c'est une bonne chose : le journal
-- de conversation est le journal intime de l'élève (§1.5 « le coach voit
-- l'adhérence, jamais le journal intime »).
--
-- Ce qu'il faut au coach n'est PAS le journal : c'est un horodatage. « Quand
-- s'est-elle manifestée pour la dernière fois ? » ne révèle rien de ce qui a
-- été dit.
--
-- POURQUOI UNE VUE ET PAS UNE POLICY
-- ----------------------------------
-- PostgREST applique les droits par RÔLE, et coach comme élève sont tous deux
-- `authenticated` : une policy ne peut pas cacher la colonne `content` à l'un
-- et pas à l'autre. Restreindre des COLONNES ne se fait que par une vue à
-- allowlist. C'est déjà le motif en production pour `coach_student_directory`
-- et `coach_student_events` ; on le reprend, on n'en invente pas un autre.
--
-- CE QUE LA VUE EXPOSE, ET RIEN D'AUTRE
-- -------------------------------------
--   student_user_id  — de qui on parle
--   last_inbound_at  — QUAND il a parlé pour la dernière fois
--   inbound_count_7d — combien de fois sur 7 jours (le volume, pas le contenu)
--
-- Aucun `content`, aucun `role` détaillé, aucun id de message. Un coach qui
-- lirait cette vue en entier n'apprendrait pas UN mot de ce que son élève a
-- écrit. C'est le maximum d'information utile pour le minimum d'intrusion.
--
-- `security_invoker = off` (SECURITY DEFINER) : la vue lit `chat_messages` avec
-- les droits du propriétaire, et se restreint elle-même aux élèves du coach
-- appelant via `coached_student_ids()`. Sans ça, la vue rendrait zéro ligne
-- (l'appelant n'a aucun droit sur la table sous-jacente).

create or replace view public.coach_student_contact
with (security_invoker = off) as
  select
    m.user_id as student_user_id,
    max(m.created_at) filter (where m.role = 'user') as last_inbound_at,
    count(*) filter (
      where m.role = 'user' and m.created_at >= now() - interval '7 days'
    ) as inbound_count_7d
  from public.chat_messages m
  where m.user_id = any ((select public.coached_student_ids())::uuid[])
  group by m.user_id;

comment on view public.coach_student_contact is
  'PIVOT §1.4: WHEN a student last spoke, never WHAT they said. Tier B '
  'column-allowlist view (PostgREST grants are per-role, so a policy cannot '
  'hide chat_messages.content from a coach). No content, no message ids.';

-- La vue hérite des droits du propriétaire: on n'accorde que le SELECT, et
-- seulement au rôle authentifié. `anon` n'a rien à faire ici.
revoke all on public.coach_student_contact from public;
grant select on public.coach_student_contact to authenticated;
