-- ════════════════════════════════════════════════════════════════════════════
-- LE BROUILLON RELU EST CELUI QUI S'ÉCRIT
--
-- Autorité: docs/keel/MODEL.md (l'élève compose, personne ne compose pour lui)
-- et `_shared/keel/final_plan_gate.ts` (la passe qui juge le payload EXACT).
--
-- ── LE DÉFAUT QUE ÇA FERME, ET IL A ÉTÉ MESURÉ ─────────────────────────────
-- L'aperçu (`draft`) n'était persisté NULLE PART. Adopter re-postait la MÊME
-- requête avec `adopting_draft: true`, ce qui déclenchait un SECOND appel
-- modèle complet — avec les cinq relances de qualité désarmées, puisque le
-- chemin d'adoption est celui qui ne doit pas faire attendre.
--
-- Conséquence, en run réel: l'aperçu montrait **6 boîtes**, la ligne écrite en
-- base en portait **0**, et l'HTTP rendait **200**. Personne n'a menti: ce sont
-- simplement DEUX plans. La personne a relu le premier et a reçu le second.
--
-- Cette table porte l'aperçu. Adopter cesse d'être « recomposer » pour devenir
-- « écrire ce qui a déjà été relu ».
--
-- ── POURQUOI UNE SEULE LIGNE EST À LA FOIS L'APERÇU ET LE JOB ──────────────
-- Deux tables (une file de travail + un cache d'aperçu) auraient DEUX vérités
-- sur le même geste, et le produit a déjà la cicatrice de l'écriture double
-- (`stale-current-erases-the-previous-write`): la seconde écriture périmée
-- efface la première. Ici, l'objet est un seul: « la composition que cette
-- personne a demandée ». Elle est `pending`, puis `running`, puis `done` —
-- et ce que `done` porte EST l'aperçu (`response`) plus, mot pour mot, ce qui
-- partira dans `write_student_meal_plan` (`write_payload`). L'adoption ne
-- recompose rien: elle relit `write_payload`, le repasse par `finalPlanGate`,
-- et l'écrit.
--
-- `request_body` est gardé pour la même raison qu'un journal: sans lui, une
-- ligne `failed` ne dit pas ce qui a été demandé, et le `mode` (`sync`/`async`)
-- ne se déduit d'aucune autre colonne.
--
-- ── POURQUOI L'INDEX UNIQUE, ET PAS UN CONTRÔLE DANS LE CODE ───────────────
-- Le plafond de concurrence est « une composition en vol par personne ». Un
-- contrôle en TypeScript le lit puis l'écrit: deux taps à 80 ms d'écart (le
-- bouton qui ne répond pas assez vite, le mobile qui rejoue la requête) passent
-- tous les deux la lecture et lancent DEUX appels modèle facturés, dont un
-- dont plus personne n'attend la réponse. L'index partiel arbitre dans la même
-- instruction que l'insertion: le second `insert` rend `23505`, et
-- `openDraft` en fait un « c'est la même demande » (réutilisation) ou un
-- « une autre est en vol » (conflit) selon la clé d'idempotence. C'est le même
-- arbitrage que `memory_clarifications_one_open_per_user` (20260904090000).
--
-- ── ⚠️ DONNÉE PERSONNELLE, ET L'EXPORT RGPD NE LA RÉCLAME PAS ENCORE ───────
-- `request_body` porte la phrase que la personne a tapée, `response` et
-- `write_payload` portent son plan: cette table est due à l'export
-- (`account-export-v1`), et la règle du dépôt est de la réclamer DÈS SA
-- MIGRATION, pas six mois plus tard (cicatrice
-- `gdpr-lifecycle-does-not-claim-new-tables`).
--
-- ⛔ ELLE N'Y A PAS ÉTÉ AJOUTÉE ICI, ET C'EST DÉLIBÉRÉ: l'énumération de
-- `account-export-v1/index.ts` est DÉJÀ DÉSALIGNÉE d'un cran (45 promesses
-- dans le `Promise.all`, 44 noms dans la déstructuration — `memory_clarifications`
-- a été ajouté le 2026-09-04 sans son nom). Chaque clé du bundle après
-- `divergences_constatees` porte donc les lignes de la table SUIVANTE, et
-- `storage` reçoit `household_members`. Le fichier porte `// @ts-nocheck` en
-- tête: ni `tsc` ni `deno check` ne le voient. Ajouter une 46e entrée dans
-- cette liste rangerait CETTE table sous la clé d'une autre. Le raccord se
-- fait avec le correctif d'alignement, dans son lot, avec un run réel.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────
-- Elle ne branche AUCUNE lane. Les deux générateurs sont modifiés par un lot
-- séparé; ici il n'y a que le magasin, sa balayeuse et sa preuve.
-- ════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. LA TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.student_meal_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Le foyer AU MOMENT DE LA COMPOSITION. Nul en solo. Il n'est pas relu pour
  -- décider quoi que ce soit à l'adoption — c'est `safety_fingerprint` qui
  -- répond à « le foyer a-t-il bougé depuis ? ».
  household_id uuid,

  -- La NATURE du plan et la LANE qui l'a composé sont deux choses: un plan
  -- `personal` peut sortir de la lane foyer (le maître compose pour lui seul),
  -- et `write_student_meal_plan` refuse `plan_kind_required` sur la première
  -- pendant que la seconde ne l'intéresse pas.
  plan_kind text check (plan_kind in ('personal', 'household')),
  lane text check (lane in ('meal', 'household_meal')),

  -- ⚠️ LISTE FERMÉE, ET `adopted` EST UN ÉTAT TERMINAL DISTINCT DE `done`:
  -- sans lui, « la personne a relu et n'a pas adopté » et « la personne a
  -- adopté » se ressemblent, et la balayeuse ne saurait pas laquelle des deux
  -- elle peut effacer au bout de 24 h.
  status text not null
    check (status in ('pending', 'running', 'done', 'failed', 'adopted')),

  -- Le motif de l'échec, pour la personne ET pour le compteur. `error` porte le
  -- détail technique, `error_code` le vocabulaire.
  error_code text,
  error text,

  request_id text not null,

  -- L'empreinte de la DEMANDE (voir `draft_store.ts`): elle ignore `launch`,
  -- `adopting_draft` et `replaces`, qui décrivent le geste et non le plan.
  idempotency_key text not null,

  -- `sync` = la requête attend la réponse; `async` = elle rend l'identifiant et
  -- la personne suit la ligne. Aucune autre colonne ne le dit.
  mode text not null check (mode in ('sync', 'async')),

  request_body jsonb not null,

  -- La fenêtre, recopiée hors du payload pour être lisible sans le désérialiser
  -- (l'écran de suivi la montre, la balayeuse ne la lit jamais).
  starts_on date,
  duration_days smallint,
  lead_days smallint,

  -- ⚠️ LE PAYLOAD EXACT, tel qu'il part en `p_payload` de
  -- `write_student_meal_plan`. Pas une forme intermédiaire, pas la forme
  -- mémoire `GeneratedMeal`: c'est ce que l'adoption écrira, mot pour mot.
  write_payload jsonb,

  -- Ce que la lane a rendu à l'écran. C'est l'APERÇU RELU, et c'est lui qui
  -- doit correspondre à `write_payload` — le défaut de tête de fichier est
  -- exactement l'écart entre les deux.
  response jsonb,

  -- Ce dont `finalPlanGate` a besoin à l'adoption, quand plus aucun appel
  -- modèle n'a lieu et que rien n'est rechargé: jours de la fenêtre, congélateur,
  -- bouches, contrat de boîtes, interdits, règles de maison, garde-manger.
  -- ⚠️ SANS CETTE COLONNE, l'adoption appellerait la garde avec un contexte
  -- reconstruit — donc une garde qui juge autre chose que ce qui a été composé.
  adoption_context jsonb,

  -- L'empreinte de CE QUI PROTÈGE (roster, allergies, régimes, interdits de
  -- maison, contraintes dures). Une empreinte de CONTENU, pas un horodatage:
  -- les tables du roster n'ont pas d'`updated_at` exploitable.
  safety_fingerprint text,

  -- `<version de prompt>|draft_store.vN`. Un brouillon composé par un prompt
  -- d'avant un correctif ne doit pas s'écrire après lui sans qu'on puisse le
  -- NOMMER.
  source_version text not null,

  started_at timestamptz,
  finished_at timestamptz,
  wall_ms integer,

  -- ⛔ `on delete cascade`, ET PAS `on delete set null` — ARBITRAGE, pas goût.
  -- Le lot demandait `set null`. Il est INCOMPATIBLE avec le CHECK d'en bas
  -- (« un `adopted` nomme la ligne écrite »), et la collision tombe sur le
  -- pire chemin possible: la suppression de compte. `delete from auth.users`
  -- fait cascader `student_generated_meals`, ce qui déclenche AUSSITÔT (les
  -- actions RI s'exécutent en profondeur d'abord) le `set null` sur le
  -- brouillon adopté — donc une ligne `adopted` avec `adopted_meal_id` nul,
  -- donc `check_violation`, donc une PURGE RGPD QUI ÉCHOUE.
  -- `cascade` ne coûte rien: rien ne supprime jamais un plan hors de la purge
  -- (les plans se RETIRENT, `retired_at`; le seul `delete from
  -- public.student_generated_meals` du dépôt est un nettoyage de sonde, dans
  -- 20260903170000). Le compte parti, le brouillon part aussi — c'est ce que
  -- la cascade `user_id` fait déjà.
  adopted_meal_id uuid references public.student_generated_meals(id) on delete cascade,
  adopted_at timestamptz,

  -- 24 h. Au-delà, l'aperçu décrit une semaine que la personne n'a plus, et
  -- l'écrire serait pire que de le refuser.
  expires_at timestamptz not null default (now() + interval '24 hours'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ⚠️ UN `done` SANS PAYLOAD EST LE DÉFAUT DE TÊTE DE FICHIER SOUS UNE AUTRE
  -- FORME: une ligne qui se dit prête et dont l'adoption n'aurait rien à
  -- écrire — donc un second appel modèle, donc deux plans.
  constraint student_meal_drafts_done_has_plan check (
    status not in ('done', 'adopted')
    or (write_payload is not null and response is not null)),

  -- Une adoption qui ne nomme pas la ligne écrite est une adoption qu'on ne
  -- peut pas rejouer, ni contredire.
  constraint student_meal_drafts_adopted_has_meal check (
    status <> 'adopted'
    or (adopted_meal_id is not null and adopted_at is not null))
);

comment on table public.student_meal_drafts is
  'L''aperçu de composition, persisté. UNE ligne est à la fois le job '
  '(pending/running) et le brouillon relu (done). Adopter écrit '
  '`write_payload` tel quel: aucun second appel modèle. Écrite par le runtime '
  'seul; la personne la LIT (elle la sonde depuis son écran).';

comment on column public.student_meal_drafts.write_payload is
  'Le `p_payload` EXACT de `write_student_meal_plan`. Toute divergence entre '
  'cette colonne et `response` est le défaut « aperçu 6 boîtes, base 0 boîte ».';

comment on column public.student_meal_drafts.safety_fingerprint is
  'Empreinte de CONTENU des entrées de sécurité (roster, allergies+sévérité, '
  'régimes, interdits de maison, contraintes dures). Recalculée à l''adoption: '
  'si elle diffère, l''adoption REFUSE (`draft_stale`) — le payload a été '
  'composé contre un autre foyer.';

comment on column public.student_meal_drafts.adoption_context is
  'Le `GateContext` de `final_plan_gate.ts`, gelé à la composition. '
  'L''adoption ne recharge rien: une garde qui recomposerait son contexte ne '
  'jugerait pas le plan qui a été relu.';

-- ---------------------------------------------------------------------------
-- 2. LES INDEX — dont celui qui EST le plafond de concurrence
-- ---------------------------------------------------------------------------

-- ⛔ UNE COMPOSITION EN VOL PAR PERSONNE, ARBITRÉE PAR LA BASE. Voir l'en-tête:
-- un contrôle en code lit puis écrit, et deux taps rapprochés le traversent
-- tous les deux.
create unique index if not exists student_meal_drafts_one_inflight_per_user
  on public.student_meal_drafts (user_id)
  where status in ('pending', 'running');

create index if not exists student_meal_drafts_user_created_idx
  on public.student_meal_drafts (user_id, created_at desc);

-- La balayeuse ne parcourt que ce qu'elle peut effacer.
create index if not exists student_meal_drafts_expiry_idx
  on public.student_meal_drafts (expires_at)
  where status in ('done', 'failed');

-- ---------------------------------------------------------------------------
-- 3. `updated_at` — LA FONCTION EXISTANTE, jamais une nouvelle
--
-- `public.tg_set_updated_at()` (socle, 20260522143735) est déjà le trigger de
-- `student_generated_meals`. Deux fonctions qui font la même chose divergent au
-- premier correctif appliqué à une seule des deux.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    raise exception 'student_meal_drafts: public.tg_set_updated_at() introuvable';
  end if;
end $$;

drop trigger if exists student_meal_drafts_set_updated_at on public.student_meal_drafts;
create trigger student_meal_drafts_set_updated_at
  before update on public.student_meal_drafts
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS — la personne SONDE sa ligne, personne ne l'écrit
--
-- ⚠️ LA POLICY N'EST PAS UN SUBSTITUT AU `.eq('user_id', …)` DE L'APPELANT: le
-- runtime lit en `service_role`, que RLS ne contraint pas. `draft_store.ts`
-- filtre sur `user_id` à CHAQUE lecture, y compris quand il charge par
-- identifiant reçu du client — cicatrice `rls-is-not-a-substitute-for-eq-user-id`,
-- où la ligne d'un élève avait été rendue à un coach.
-- ---------------------------------------------------------------------------
alter table public.student_meal_drafts enable row level security;

drop policy if exists student_meal_drafts_owner_select on public.student_meal_drafts;
create policy student_meal_drafts_owner_select
  on public.student_meal_drafts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. LES GRANTS — deux cicatrices honorées nommément
--
--   · « revoke from public » ne retire PAS `anon`, qui tient ses privilèges de
--     son propre grant (cicatrice `revoke-from-public-leaves-anon`);
--   · Supabase accorde TOUT à `authenticated` sur toute table neuve, TRUNCATE
--     compris — et TRUNCATE échappe à RLS (cicatrice
--     `supabase-default-privileges-grant-all-to-authenticated`).
--
-- ⚠️ ET L'ÉCRITURE COMPTE DOUBLE ICI: `write_payload` est ce que l'adoption
-- écrira en base sans le recomposer. Laisser `authenticated` le modifier
-- reviendrait à laisser n'importe qui écrire le plan de son choix par le port
-- `service_role`, garde finale comprise (elle juge le payload STOCKÉ).
-- ---------------------------------------------------------------------------
revoke all on table public.student_meal_drafts from anon;
revoke all on table public.student_meal_drafts from public;
revoke insert, update, delete, truncate, references, trigger
  on table public.student_meal_drafts from authenticated;
grant select on table public.student_meal_drafts to authenticated;

-- ---------------------------------------------------------------------------
-- 6. LA BALAYEUSE
--
-- TROIS gestes, et chacun ferme un silence différent:
--   (a) une composition qui n'a jamais fini reste `running` POUR TOUJOURS, et
--       l'index unique lui garde la place: la personne ne peut plus rien
--       composer, sans qu'aucun écran ne sache pourquoi. 7 minutes — le
--       timeout modèle mesuré sur le prompt foyer est de 4 minutes
--       (cicatrice `generation-model-times-out-on-household-prompt`), et une
--       marge en dessous couperait une composition VIVANTE.
--   (b) un aperçu périmé n'est plus un aperçu; le garder ferait grossir une
--       table de payloads pour rien.
--   (c) une ligne adoptée a fait son travail; on la garde 30 jours pour
--       pouvoir répondre « ce plan-là vient de CE brouillon », pas plus.
-- ---------------------------------------------------------------------------
create or replace function public.keel_sweep_meal_drafts()
returns table(timed_out integer, expired_purged integer, adopted_purged integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timed_out integer := 0;
  v_expired integer := 0;
  v_adopted integer := 0;
begin
  -- (a) LES COMPOSITIONS QUI N'ONT JAMAIS FINI.
  update public.student_meal_drafts
     set status = 'failed',
         error_code = 'timed_out',
         error = coalesce(error, 'balayeuse: aucune fin apres 7 minutes'),
         finished_at = coalesce(finished_at, now())
   where status in ('pending', 'running')
     and coalesce(started_at, created_at) < now() - interval '7 minutes';
  get diagnostics v_timed_out = row_count;

  -- (b) LES APERÇUS PÉRIMÉS.
  delete from public.student_meal_drafts
   where status in ('done', 'failed')
     and expires_at < now();
  get diagnostics v_expired = row_count;

  -- (c) LES ADOPTÉS DE PLUS DE TRENTE JOURS.
  delete from public.student_meal_drafts
   where status = 'adopted'
     and coalesce(adopted_at, created_at) < now() - interval '30 days';
  get diagnostics v_adopted = row_count;

  return query select v_timed_out, v_expired, v_adopted;
end;
$$;

comment on function public.keel_sweep_meal_drafts() is
  'Balayeuse horaire des brouillons de composition: 7 min sans fin => failed '
  '(timed_out), et c''est ce qui LIBÈRE l''index unique; purge des aperçus '
  'périmés et des adoptés de plus de 30 jours.';

revoke all on function public.keel_sweep_meal_drafts() from public;
revoke all on function public.keel_sweep_meal_drafts() from anon;
revoke all on function public.keel_sweep_meal_drafts() from authenticated;

-- ---------------------------------------------------------------------------
-- 7. LE CRON — du SQL pur, aucune fonction edge
--
-- Même patron que `keel-seat-entitlement-sweep` (20260727235000 §10 (b)): le
-- TEMPS est la seule entrée qui ne déclenche aucun trigger, et ce balayage n'a
-- besoin d'aucun secret, d'aucune URL et d'aucun `x-internal-secret` — donc
-- rien à voir avec la cicatrice `keel-crons-invoke-vs-internal-secret`.
--
-- `cron.unschedule` d'abord: `cron.schedule` sur un nom déjà pris REMPLACE
-- silencieusement, et le voisinage a choisi de le rendre explicite.
-- ---------------------------------------------------------------------------
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare job record;
begin
  for job in select jobid from cron.job where jobname = 'keel-sweep-meal-drafts'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

do $$
begin
  perform cron.schedule(
    'keel-sweep-meal-drafts',
    '11 * * * *',
    $cmd$ select public.keel_sweep_meal_drafts(); $cmd$
  );
end $$;

-- ---------------------------------------------------------------------------
-- 8. LA PREUVE — dans la transaction, et dans les DEUX SENS
--
-- Une contrainte qu'on n'a pas vue refuser est une contrainte dont on ne sait
-- rien; et une garde qui bloque TOUT ressemble à une garde qui marche
-- (cicatrice `guards-need-a-passing-case`). Chaque bloc fait donc passer le cas
-- nominal PUIS échouer le cas interdit.
-- ---------------------------------------------------------------------------
do $$
declare
  probe uuid := gen_random_uuid();
  first_row uuid;
  meal_row uuid;
  v_status text;
  v_code text;
  ok boolean;
  swept record;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'draft-probe-' || probe::text || '@keel.invalid');

  -- (a) LE CAS NOMINAL PASSE.
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, starts_on, duration_days, lead_days, source_version)
  values (probe, 'household', 'household_meal', 'running', 'req-1',
          'aaaabbbbccccdddd', 'sync', '{"days":3}'::jsonb,
          current_date, 3::smallint, 0::smallint, 'v31|draft_store.v1')
  returning id into first_row;

  -- (b) UNE SEULE COMPOSITION EN VOL PAR PERSONNE, et c'est l'INDEX qui refuse.
  begin
    insert into public.student_meal_drafts
      (user_id, status, request_id, idempotency_key, mode, request_body, source_version)
    values (probe, 'running', 'req-2', 'eeeeffff00001111', 'async',
            '{"days":1}'::jsonb, 'v31|draft_store.v1');
    raise exception 'drafts: deux compositions en vol ont ete acceptees';
  exception when unique_violation then null;
  end;

  -- (b bis) `pending` ET `running` PARTAGENT LE MÊME PLAFOND: la seconde
  -- moitié de l'index. Sans elle, un `pending` posé à côté d'un `running`
  -- lancerait le second appel modèle que tout ce fichier existe pour éviter.
  begin
    insert into public.student_meal_drafts
      (user_id, status, request_id, idempotency_key, mode, request_body, source_version)
    values (probe, 'pending', 'req-3', 'eeeeffff00002222', 'async',
            '{"days":1}'::jsonb, 'v31|draft_store.v1');
    raise exception 'drafts: un pending a ete accepte a cote d''un running';
  exception when unique_violation then null;
  end;

  -- (c) UN `done` SANS PAYLOAD EST REFUSÉ.
  begin
    update public.student_meal_drafts
       set status = 'done', response = '{"dishes":[]}'::jsonb
     where id = first_row;
    raise exception 'drafts: un done sans write_payload a ete accepte';
  exception when check_violation then null;
  end;

  -- (c bis) UN `done` SANS APERÇU EST REFUSÉ AUSSI — les deux colonnes sont la
  -- même promesse vue des deux bouts.
  begin
    update public.student_meal_drafts
       set status = 'done', write_payload = '{"dishes":[]}'::jsonb, response = null
     where id = first_row;
    raise exception 'drafts: un done sans response a ete accepte';
  exception when check_violation then null;
  end;

  -- (c ter) LE CAS QUI DOIT PASSER.
  update public.student_meal_drafts
     set status = 'done',
         write_payload = '{"plan_kind":"household","dishes":[{"title":"probe"}]}'::jsonb,
         response = '{"dishes":[{"title":"probe"}]}'::jsonb,
         adoption_context = '{"lane":"household","windowDays":["mon","tue","wed"]}'::jsonb,
         safety_fingerprint = 'deadbeef',
         finished_at = now(),
         wall_ms = 1234
   where id = first_row;

  -- (d) UN `adopted` SANS LA LIGNE ÉCRITE EST REFUSÉ.
  begin
    update public.student_meal_drafts
       set status = 'adopted', adopted_at = now()
     where id = first_row;
    raise exception 'drafts: un adopted sans adopted_meal_id a ete accepte';
  exception when check_violation then null;
  end;

  -- (d bis) NI SANS SA DATE.
  -- ⚠️ `starts_on` ET `duration_days` SONT EXIGÉS (mesuré: `not null` sur
  -- `starts_on`), et la fenêtre est posée loin devant pour ne croiser aucune
  -- ligne vivante — l'exclusion `student_generated_meals_live_windows_dont_overlap`
  -- refuserait deux plans qui se chevauchent.
  insert into public.student_generated_meals
    (user_id, mode, content_locale, starts_on, duration_days)
  values (probe, 'to_shop', 'fr-FR', current_date + 400, 1::smallint)
  returning id into meal_row;

  begin
    update public.student_meal_drafts
       set status = 'adopted', adopted_meal_id = meal_row, adopted_at = null
     where id = first_row;
    raise exception 'drafts: un adopted sans adopted_at a ete accepte';
  exception when check_violation then null;
  end;

  -- (d ter) L'ADOPTION COMPLÈTE PASSE, et elle LIBÈRE la place: un `done` ou un
  -- `adopted` ne compte plus dans l'index partiel.
  update public.student_meal_drafts
     set status = 'adopted', adopted_meal_id = meal_row, adopted_at = now()
   where id = first_row;

  insert into public.student_meal_drafts
    (user_id, status, request_id, idempotency_key, mode, request_body, source_version)
  values (probe, 'running', 'req-4', 'eeeeffff00003333', 'async',
          '{"days":1}'::jsonb, 'v31|draft_store.v1');

  -- (e) LA BALAYEUSE FAIT TOMBER UN `running` TROP VIEUX, et le NOMME.
  update public.student_meal_drafts
     set started_at = now() - interval '10 minutes',
         created_at = now() - interval '10 minutes'
   where user_id = probe and status = 'running';

  select * into swept from public.keel_sweep_meal_drafts();
  if swept.timed_out < 1 then
    raise exception 'drafts: la balayeuse n''a pas fait tomber la composition bloquee';
  end if;

  select status, error_code into v_status, v_code
    from public.student_meal_drafts
   where user_id = probe and request_id = 'req-4';
  if v_status is distinct from 'failed' or v_code is distinct from 'timed_out' then
    raise exception 'drafts: apres balayage, statut=% code=%', v_status, v_code;
  end if;

  -- (e bis) ET ELLE NE TOUCHE PAS À CE QUI TOURNE ENCORE — une balayeuse qui
  -- tue tout ressemble à une balayeuse qui marche.
  insert into public.student_meal_drafts
    (user_id, status, request_id, idempotency_key, mode, request_body, source_version,
     started_at)
  values (probe, 'running', 'req-5', 'eeeeffff00004444', 'sync',
          '{"days":1}'::jsonb, 'v31|draft_store.v1', now());
  perform public.keel_sweep_meal_drafts();
  select status into v_status
    from public.student_meal_drafts where user_id = probe and request_id = 'req-5';
  if v_status is distinct from 'running' then
    raise exception 'drafts: la balayeuse a tue une composition vivante (%)', v_status;
  end if;

  -- (e ter) UN APERÇU PÉRIMÉ EST EFFACÉ.
  update public.student_meal_drafts
     set expires_at = now() - interval '1 minute'
   where user_id = probe and request_id = 'req-4';
  perform public.keel_sweep_meal_drafts();
  if exists (select 1 from public.student_meal_drafts
              where user_id = probe and request_id = 'req-4') then
    raise exception 'drafts: un aperçu perime a survecu au balayage';
  end if;

  -- (e quater) ⛔ LA COLLISION ÉVITÉE, JOUÉE POUR DE VRAI. Avec
  -- `on delete set null`, effacer le plan mettrait `adopted_meal_id` à nul sur
  -- une ligne `adopted` — `check_violation`, sur le chemin de la purge RGPD.
  -- Avec la cascade, le brouillon part avec le plan, sans exception.
  delete from public.student_generated_meals where id = meal_row;
  if exists (select 1 from public.student_meal_drafts where id = first_row) then
    raise exception 'drafts: le brouillon adopte a survecu a la suppression du plan';
  end if;

  -- (f) LES PRIVILÈGES. Les deux cicatrices, vérifiées et pas supposées.
  select has_table_privilege('anon', 'public.student_meal_drafts', 'SELECT') into ok;
  if ok then raise exception 'drafts: anon peut lire les brouillons'; end if;
  select has_table_privilege('anon', 'public.student_meal_drafts', 'INSERT') into ok;
  if ok then raise exception 'drafts: anon peut ecrire un brouillon'; end if;

  select has_table_privilege('authenticated', 'public.student_meal_drafts', 'TRUNCATE') into ok;
  if ok then raise exception 'drafts: authenticated peut TRUNCATE (echappe a RLS)'; end if;
  select has_table_privilege('authenticated', 'public.student_meal_drafts', 'INSERT') into ok;
  if ok then raise exception 'drafts: authenticated peut inserer un brouillon'; end if;
  select has_table_privilege('authenticated', 'public.student_meal_drafts', 'UPDATE') into ok;
  if ok then raise exception 'drafts: authenticated peut modifier write_payload'; end if;
  select has_table_privilege('authenticated', 'public.student_meal_drafts', 'DELETE') into ok;
  if ok then raise exception 'drafts: authenticated peut supprimer un brouillon'; end if;

  -- LE CAS QUI DOIT PASSER: sans lui, tout ce qui precede serait vrai d'une
  -- table a laquelle personne n'a acces, ce qui n'est pas une garde.
  select has_table_privilege('authenticated', 'public.student_meal_drafts', 'SELECT') into ok;
  if not ok then raise exception 'drafts: authenticated ne peut pas sonder son brouillon'; end if;

  -- ET LA BALAYEUSE N'EST PAS EXÉCUTABLE PAR LE PORT DE LA PERSONNE.
  select has_function_privilege('authenticated', 'public.keel_sweep_meal_drafts()', 'EXECUTE') into ok;
  if ok then raise exception 'drafts: authenticated peut lancer la balayeuse'; end if;
  select has_function_privilege('anon', 'public.keel_sweep_meal_drafts()', 'EXECUTE') into ok;
  if ok then raise exception 'drafts: anon peut lancer la balayeuse'; end if;

  -- (g) LA PURGE RGPD PASSE PAR LA CASCADE, et on le VÉRIFIE.
  delete from auth.users where id = probe;
  select exists(select 1 from public.student_meal_drafts where user_id = probe) into ok;
  if ok then raise exception 'drafts: un brouillon a survecu a la suppression du compte'; end if;

  raise notice 'student_meal_drafts: 18 controles passes, dans les deux sens';
end $$;
