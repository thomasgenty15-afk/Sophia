-- DE-WHATSAPP — P5 : les colonnes `profiles.whatsapp_*`, inventoriées puis traitées.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- L'INVENTAIRE, ET CE QU'IL DIT
--
-- 18 colonnes. Mesuré par grep sur le code vivant APRÈS suppression des 7
-- fonctions WhatsApp — c'est-à-dire sur ce qui reste réellement debout :
--
--   whatsapp_deferred_onboarding      0 lecteur  → DROP
--   whatsapp_onboarding_started_at    0 lecteur  → DROP
--
--   whatsapp_opted_in                59 lecteurs → GELÉE
--   whatsapp_last_inbound_at         30          → GELÉE
--   whatsapp_last_outbound_at        19          → GELÉE
--   whatsapp_coaching_paused_until   15          → GELÉE
--   whatsapp_bilan_paused_until      14          → GELÉE
--   whatsapp_opted_out_at            13          → GELÉE
--   whatsapp_bilan_opted_in           8          → GELÉE
--   whatsapp_state                    7          → GELÉE
--   … et 7 autres, entre 1 et 6 lecteurs        → GELÉES
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI ON N'EN DROPPE QUE DEUX, ET POURQUOI C'EST LA BONNE RÉPONSE
--
-- Les seize autres sont lues par la couche B2C qui SURVIT à ce chantier
-- (`process-checkins`, les bilans, les pauses de coaching). Ce chantier change
-- le CANAL, pas le produit B2C : dropper ces colonnes obligerait à réécrire
-- 5 000 lignes de legacy dans le même mouvement, avec autant d'occasions de
-- casser une garde qu'on n'a pas relue. « Verify before delete » coupe ici :
-- pas de preuve d'absence, pas de suppression.
--
-- ── LE PIÈGE QUE CE FICHIER FERME QUAND MÊME ────────────────────────────────
-- Deux de ces colonnes ont déjà fait taire tout le produit : les crons KEEL
-- lisaient `whatsapp_opted_in`, qui vaut `false` par défaut et qu'aucun élève
-- KEEL ne renseigne jamais. Les commentaires ci-dessous existent pour que le
-- prochain lecteur ne refasse pas la déduction. Le mute produit est
-- `proactive_muted_at`, et rien d'autre.

alter table public.profiles drop column if exists whatsapp_deferred_onboarding;
alter table public.profiles drop column if exists whatsapp_onboarding_started_at;

comment on column public.profiles.whatsapp_opted_in is
  'GELÉE (de-whatsapp). Opt-in META, jamais renseigné pour un élève KEEL. '
  'NE PAS lire pour décider d''un envoi: `false` par défaut ⇒ toute la base '
  'devient muette (défaut mesuré le 2026-08-04 sur les 3 crons proactifs). '
  'Le mute produit est profiles.proactive_muted_at.';

comment on column public.profiles.whatsapp_opted_out_at is
  'GELÉE (de-whatsapp). Opt-out META. Repris une fois dans proactive_muted_at '
  'par la migration 20260804121000; c''est cette dernière qui fait foi.';

comment on column public.profiles.whatsapp_last_inbound_at is
  'GELÉE (de-whatsapp). Remplacée par chat_last_inbound_at, qui est la seule '
  'source de « une conversation est-elle active ? ».';

-- FAIL LOUD (R7).
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name in ('whatsapp_deferred_onboarding', 'whatsapp_onboarding_started_at');
  if n <> 0 then
    raise exception 'dewhatsapp: % colonne(s) sans lecteur encore debout', n;
  end if;

  -- Les colonnes NEUVES sont là: un `drop column` mal ciblé les emporterait.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name in ('chat_last_inbound_at', 'proactive_muted_at');
  if n <> 2 then
    raise exception 'dewhatsapp: colonnes d''etat neuves manquantes (%/2)', n;
  end if;

  raise notice 'dewhatsapp: 2 colonnes droppees, 16 gelees et documentees';
end $$;
