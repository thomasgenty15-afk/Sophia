-- DE-WHATSAPP — P8 : la mémoire du réglage de relances pendant une suppression.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 CE QUE LE BALAYAGE A TROUVÉ
--
-- `account-deletion-v1` lisait `wasOptedIn = Boolean(profile.whatsapp_opted_in)`
-- et s'en servait pour DEUX choses :
--   1. mémoriser l'état à restaurer si l'élève annule (`pre_deletion_…`) ;
--   2. décider d'envoyer **la confirmation de suppression**.
--
-- `whatsapp_opted_in` vaut `false` par défaut et plus personne ne la met à
-- `true`. Donc `wasOptedIn` est toujours faux, et **la confirmation de
-- suppression n'était plus jamais envoyée** : l'élève supprimait son compte et
-- ne recevait rien — ni la date de purge, ni le fait qu'il peut annuler avant.
--
-- C'est la troisième fois que cette colonne fait taire quelque chose (les trois
-- crons proactifs, le trigger de reprogrammation, et maintenant l'accusé de
-- suppression). Le commentaire posé sur elle en `20260804131000` disait déjà
-- « NE PAS lire pour décider d'un envoi » — voici le dernier lecteur retiré.
--
-- ── CE QUE LA COLONNE DEVIENT ────────────────────────────────────────────────
-- On garde la MÉMOIRE (annuler une suppression doit rendre l'élève à l'état
-- exact où il était), mais elle porte le réglage produit : était-il muet ?
-- Un booléen suffit — `proactive_muted_at` est une date, mais ce qu'on restaure
-- est un état binaire, et re-poser la date d'origine ferait croire à un réglage
-- pris au moment de la restauration.

alter table public.profiles
  rename column pre_deletion_whatsapp_opted_in to pre_deletion_proactive_muted;

comment on column public.profiles.pre_deletion_proactive_muted is
  'L''eleve avait-il coupe ses relances AVANT de demander la suppression ? '
  'Sert uniquement a le rendre a son etat exact s''il annule. NULL hors '
  'fenetre de suppression.';

-- Les valeurs héritées décrivaient un opt-in Meta, pas un mute : leur
-- sémantique est INVERSE et sans rapport. On les efface plutôt que de les
-- réinterpréter — une donnée retournée à l'envers est pire qu'une donnée
-- absente, et aucune suppression n'est en cours sur cette base.
update public.profiles
   set pre_deletion_proactive_muted = null
 where pre_deletion_proactive_muted is not null;

-- FAIL LOUD (R7).
do $$
begin
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name='pre_deletion_proactive_muted';
  if not found then
    raise exception 'dewhatsapp: pre_deletion_proactive_muted absente';
  end if;
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name='pre_deletion_whatsapp_opted_in';
  if found then
    raise exception 'dewhatsapp: pre_deletion_whatsapp_opted_in survit';
  end if;
  raise notice 'dewhatsapp: memoire de mute renommee et purgee';
end $$;
