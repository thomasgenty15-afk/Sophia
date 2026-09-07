-- ===========================================================================
-- LOT A.6 — LE DÉSARMEMENT, AU NIVEAU BASE
--
-- Le chantier de réduction du chat a coupé les ÉMETTEURS côté code: le message
-- du soir, la bande, le pouls, la procédure accident, le sort d'une part non
-- mangée, le formulaire du dimanche, la question de clarification, la
-- correction du chiffre d'énergie. Cette migration ferme les deux portes que le
-- code ne peut pas fermer seul.
--
-- ⛔ ELLE NE DÉPOSE AUCUNE TABLE, ET NE SUPPRIME AUCUNE FONCTION.
-- Le désarmement précède la suppression: on prouve d'abord, sur au moins huit
-- jours, qu'aucune ligne ne s'écrit plus. Une fonction supprimée casserait de
-- surcroît `20260903172000` en rejeu.
--
-- ── LA RÈGLE QUI SORT DE CE FICHIER, ET QU'IL FAUT LIRE AVANT D'EN ÉCRIRE
-- ── UN AUTRE ──────────────────────────────────────────────────────────────
--
--   ON NE RÉDIGE JAMAIS UN `cron.unschedule` AVEC UN HORODATAGE ANTÉRIEUR À
--   UNE GARDE QUI NOMME LE JOB.
--
-- C'est la seule façon de casser une garde de cron dans ce dépôt. Cinq
-- migrations lèvent une exception si un job nommé a disparu, dont
-- `20260803200000` qui exige EXACTEMENT cinq jobs, `keel-daily-pulse` compris.
-- Elles ne sont pas touchées et ne peuvent pas l'être: ce sont des assertions
-- de POINT DANS L'HISTOIRE, pas des invariants sur l'état final. Au rejeu,
-- `:180000` planifie → `:200000` compte ses cinq et passe → ce fichier-ci
-- désarme. Le précédent est déjà dans le dépôt: `20260808100000` retire
-- `keel-week-rollover-v1`, qui est l'un des cinq, et la garde reste verte.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LE SORT D'UNE PART NON MANGÉE — L'ÉCRITURE DEVIENT IMPOSSIBLE
-- ---------------------------------------------------------------------------
--
-- `share_step.ts` (l'émetteur) et `share_outcome_tap.ts` (l'écrivain) sont
-- débranchés côté code. Ce `revoke` est ce qui rend la preuve NON
-- CONTOURNABLE: après lui, aucun chemin — ni edge, ni navigateur, ni psql
-- applicatif — ne peut écrire une ligne dans `meal_share_outcomes`. « Plus
-- personne n'appelle » est une affirmation à vérifier; « personne ne PEUT
-- appeler » est un fait.
--
-- ⚠️ LA TABLE, ELLE, RESTE, ET SES LECTEURS AUSSI. `MyShareCard.tsx` et
-- `DishListByDay.tsx` rendent encore « boîte de mardi, encore au frigo » sur
-- /app/plan, et `tracking_window_io.ts` porte déjà le repli `{known: false}`.
-- Les lignes existantes sont des faits déclarés par de vraies personnes: un
-- retrait de canal n'autorise pas un effacement de données.
revoke execute on function public.keel_household_declare_share_outcome_for(
  uuid, uuid, integer, uuid, text, date, date
) from service_role;

revoke execute on function public.keel_household_declare_share_outcome(
  uuid, integer, uuid, text, date, date
) from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. DEUX CRONS QUI TAPENT DANS LE VIDE
-- ---------------------------------------------------------------------------
--
-- ⚠️ L'IDIOME EST OBLIGATOIRE. `cron.unschedule('nom')` LÈVE quand le job
-- n'existe pas; la forme `perform … from cron.job where …` est un no-op. Sur
-- une base où l'un des deux a déjà disparu, la première forme ferait échouer
-- toute la migration.
do $$
begin
  -- `keel-daily-recommendation` (:05) — FF-028 est abandonnée et
  -- `keel-daily-recommendation-v1` N'EXISTE PAS dans `supabase/functions/`. Ce
  -- job POSTe donc sur un 404 toutes les heures depuis l'abandon.
  -- `20260902100000` la nomme déjà « morte » en commentaire; ici on la
  -- déprogramme.
  perform cron.unschedule(jobid) from cron.job
   where jobname = 'keel-daily-recommendation';

  -- `keel-daily-pulse` (:10) — la fonction `keel-daily-pulse-v1` est SUPPRIMÉE
  -- (2026-09-08). Le message du soir ne servait aucun des trois piliers du chat
  -- (bilan de fin de plan, réponses aux questions, notification de ce qui a été
  -- retenu), et son récap mémoire faisait doublon avec `notifyMemoryWrite`, qui
  -- l'annonce AU MOMENT DU GESTE.
  --
  -- Son balayage des clarifications périmées est ré-hébergé dans
  -- `keel-proactive-v1` (:30) — c'est un `update` global sur la table, il
  -- n'itère aucun profil, donc l'audience du job hôte ne le borne pas.
  perform cron.unschedule(jobid) from cron.job
   where jobname = 'keel-daily-pulse';
end $$;

-- ---------------------------------------------------------------------------
-- 3. LE CONTRÔLE — FAIL-LOUD, ET DANS LES DEUX SENS
-- ---------------------------------------------------------------------------
--
-- ⚠️ LES DEUX MOITIÉS SONT NÉCESSAIRES. N'affirmer que « les deux jobs ont
-- disparu » passerait au vert sur une base où AUCUN cron n'est planifié — la
-- pire des raisons de réussir, et exactement le motif écrit dans
-- `20260803200000`. On affirme donc aussi que les survivants sont toujours là.
do $$
declare
  v_gone   integer;
  v_alive  text;
begin
  select count(*) into v_gone from cron.job
   where jobname in ('keel-daily-recommendation', 'keel-daily-pulse');
  if v_gone <> 0 then
    raise exception 'A.6: % job(s) désarmé(s) encore planifié(s)', v_gone;
  end if;

  -- ⚠️ ON AFFIRME LA PRÉSENCE, PAS L'ACTIVITÉ, ET C'EST DÉLIBÉRÉ.
  --
  -- La première rédaction exigeait `and active`. Elle a fait ÉCHOUER cette
  -- migration sur la base locale, où `keel-weekly-flow` est présent mais
  -- `active = false` — quelqu'un l'y a mis en pause, et ce n'est le sujet
  -- d'aucune migration. Un `unschedule` mal ciblé rend un job ABSENT; il ne le
  -- rend jamais inactif. Affirmer l'activité ferait donc échouer ce fichier
  -- pour une raison qu'il ne peut pas causer — une garde qui bloque tout en
  -- ressemblant à une garde qui marche.
  select string_agg(j, ', ') into v_alive
    from unnest(array[
      'keel-proactive', 'keel-weekly-flow', 'keel-weight-divergence'
    ]) as j
   where not exists (select 1 from cron.job where jobname = j);
  if v_alive is not null then
    raise exception
      'A.6: cron(s) survivant(s) DISPARU(S): %. Le désarmement ne doit RIEN '
      'emporter d''autre.', v_alive;
  end if;

  raise notice
    'A.6: keel-daily-recommendation et keel-daily-pulse déprogrammés; '
    'keel-proactive, keel-weekly-flow et keel-weight-divergence toujours là';
end $$;

-- ---------------------------------------------------------------------------
-- 4. LA PREUVE QUI SE LANCE À LA MAIN, ENSUITE
-- ---------------------------------------------------------------------------
--
-- Trois lectures, à jouer au moins HUIT jours après le déploiement (le pouls et
-- la bande sont quotidiens, le dimanche est hebdomadaire: sept jours ne
-- mesurent pas une semaine complète). `T` = l'horodatage du déploiement.
--
-- ① LES SIX FAMILLES D'UN COUP — sur `outbound_messages`, PAS `chat_messages`:
--   cette table porte aussi les messages REFUSÉS par la politique de livraison,
--   qu'une requête sur les bulles raterait, et `ledgerMetadata` y range la
--   liste des charges de boutons.
--
--     select b.payload, count(*) as n, max(m.created_at) as dernier
--       from public.outbound_messages m,
--            lateral jsonb_array_elements_text(
--              coalesce(m.metadata->'buttons', '[]'::jsonb)) as b(payload)
--      where m.created_at >= timestamptz 'T'
--        and b.payload ~ '^KEEL_(STRIP|FIX|SHARE|PULSE|MEMCLAR|KCAL)_'
--      group by 1 order by 2 desc;
--
--   Attendu: ZÉRO LIGNE.
--
-- ② LES TABLES, UNE PAR ÉCRIVAIN COUPÉ. ⚠️ Relire la colonne de date dans la
--   migration de chacune avant de lancer: `meal_share_outcomes` n'a PAS de
--   `created_at`, c'est `answered_at` — le 42703 est déjà documenté dans
--   `account-export-v1`.
--
--     student_daily_checkins (created_at) · meal_share_outcomes (answered_at)
--     memory_clarifications (created_at)  · cooking_session_states (updated_at)
--     grocery_wave_states (updated_at)
--     protocol_events where key like 'ACCIDENT_OFF_PLAN%'
--
--   Attendu: ZÉRO PARTOUT.
--
-- ③ LE DIMANCHE — le discriminant existe déjà, `weekly_flow_io.ts` écrit
--   `source = 'sunday_flow'` pour le formulaire et `'plan_card'` pour la carte
--   des mesures de /app/plan:
--
--     select biofeedback->>'source' as source, count(*)
--       from public.weekly_reviews where updated_at >= timestamptz 'T'
--      group by 1;
--
--   Attendu: `plan_card` SEULEMENT.
--
-- ⚠️ DEUX FAUX POSITIFS LÉGITIMES, ET IL FAUT LES ATTENDRE:
--   · `keel_weekly_flow_ack` — les formulaires du dimanche déjà en vol restent
--     tapables. `judgeTapFreshness` ne s'applique qu'à `kind = "button"`, jamais
--     aux formulaires; celui-ci est ancré et idempotent par semaine.
--   · `keel_unusable_button_ack` — il doit au contraire MONTER. C'est la garde
--     terminale du dispatch qui travaille: une charge désarmée tapée dans
--     l'historique de quelqu'un rend « Celui-là n'est plus d'actualité »
--     plutôt que de repartir au dispatcher, où un modèle répondrait à une
--     chaîne de protocole.
