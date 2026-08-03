-- PIVOT NUTRITION — Débranchement des 5 jobs cron B2C encore actifs.
--
-- Autorité: docs/nutrition-pivot/PLAN-NUIT.md §6.2 et ANNEXE C.6
-- ("DÉBRANCHER CETTE NUIT (5)"). Suite directe de
-- `20260727150000_keel_disable_legacy_surfaces.sql`, dont cette migration
-- reprend le style et la doctrine: **on débranche, on ne supprime pas**.
-- Aucune table, aucune fonction, aucune edge function n'est touchée ici — les
-- 5 fonctions restent déployées et appelables à la main. Seul l'appel
-- AUTOMATIQUE s'arrête.
--
-- Les 5 jobs, et pourquoi chacun part (ordre d'urgence décroissante):
--
--   1. `trigger-retention-emails`  (0 9 * * *)
--      ⚠️ LE PLUS URGENT: envoie de VRAIS emails de rétention B2C, tous les
--      jours à 09:00, à des utilisateurs d'un produit qui n'existe plus.
--      Chaque jour où il tourne est un email de trop envoyé au nom d'une
--      promesse abandonnée.
--
--   2. `process-whatsapp-optin-recovery`  (0 10 * * *)
--      Séquence winback B2C (relance d'opt-in WhatsApp sur l'onboarding web
--      supprimé par le pivot). Envoie de vrais messages WhatsApp — donc du
--      coût Meta réel (§1.7) sur une audience hors périmètre.
--
--   3. `reseed-recurring-reminders`  (0 18 * * 0)
--      Chaque dimanche, une génération LLM PAR RAPPEL sur toute la flotte
--      (`classify-recurring-reminder`). Coût LLM récurrent brûlé sur du
--      legacy. Rien dans les 3 boucles élève (§1.3) n'en dépend.
--
--   4. `trigger-watcher-batch`  (0 */4 * * *)
--      Ancré sur les cartes et les transformations, deux concepts supprimés
--      volontairement par le pivot (§1.3).
--
--   5. `keel-arm-cards`  (20 * * * *)
--      Armement des cartes. Les cartes sont hors périmètre v1 (ANNEXE C.3);
--      `keel-cards-v1` est débranchée avec son cron.
--
-- CE QUI N'EST **PAS** DÉBRANCHÉ ICI, et pourquoi (garde-fou anti-zèle):
--   - `process-checkins` et `schedule-whatsapp-v2-checkins` sont ADAPTER, pas
--     débrancher (ANNEXE C.6): ils portent la boucle REMARQUER (§1.3). Les
--     couper cette nuit tuerait le proactif que P1.6 doit justement reprendre.
--   - `trigger-synthesizer-batch` et `recompute-time-based-access-tiers`:
--     ADAPTER également.
--   - les 15 jobs GARDER (moteur, mémoire, keel-*, purges) ne sont pas touchés.
--
-- Réversibilité: re-planifier depuis
-- `20260615133000_recreate_active_pg_cron_jobs.sql` (corps `cron.schedule`
-- inchangés — cette migration ne modifie aucune commande, elle les déprogramme).
--
-- ⚠️ PORTÉE RÉELLE — À LIRE AVANT DE CROIRE QUE C'EST FAIT:
-- une migration ne s'applique qu'à la base où elle est poussée. Cette nuit
-- elle n'a tourné qu'en LOCAL (`supabase db reset`). **Tant que
-- `supabase db push` n'a pas été exécuté par un humain sur le distant, les 5
-- jobs continuent de tourner en production**, y compris l'envoi d'emails de
-- 09:00. Le chemin d'urgence (unschedule direct en SQL, sans push) est écrit
-- dans docs/nutrition-pivot/STATUS-MORNING.md.

do $$
declare
  job record;
  disabled_count int := 0;
begin
  for job in
    select jobid, jobname
    from cron.job
    where jobname in (
      'trigger-retention-emails',
      'process-whatsapp-optin-recovery',
      'reseed-recurring-reminders',
      'trigger-watcher-batch',
      'keel-arm-cards'
    )
  loop
    perform cron.unschedule(job.jobid);
    disabled_count := disabled_count + 1;
    raise notice 'pivot: unscheduled cron job %', job.jobname;
  end loop;

  -- Trace explicite du cas "rien à faire": sur une base où ces jobs n'ont
  -- jamais été planifiés, le silence serait indistinguable d'un succès.
  -- (R7 en esprit: un mapping qui ne trouve rien le dit.)
  raise notice 'pivot: % B2C cron job(s) unscheduled', disabled_count;
end $$;
