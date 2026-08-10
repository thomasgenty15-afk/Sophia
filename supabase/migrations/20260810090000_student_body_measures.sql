-- ============================================================================
-- FF-031 · UNE MESURE DU CORPS EST DATÉE À L'INSTANT, PAS À LA SEMAINE
--
-- Fiche: docs/fonctionnalites/suivi-quotidien/FF-031-mesures-corporelles-datees.md
--
-- CE QUE CETTE TABLE REMPLACE
-- ---------------------------
-- Le poids et le tour de taille vivaient dans `weekly_reviews.biofeedback`,
-- c'est-à-dire sur une LIGNE DE SEMAINE — unique sur (user_id,
-- week_start_date) where plan_version_id is null. Les trois gestes qui les
-- écrivent (le point du dimanche, la carte des mesures de /app/plan, la phrase
-- en conversation) écrivaient donc tous la même case, et le commentaire de
-- `writeDeclaredBodyMeasure` l'assumait: « la dernière déclaration gagne ».
--
-- Un élève qui se pèse lundi (98,5), mercredi (98,1) et vendredi (97,9) n'avait
-- qu'un chiffre gardé: 97,9 — présenté sous le lundi de sa semaine.
--
-- POURQUOI CE N'EST PAS QU'UN CONFORT
-- -----------------------------------
-- `restriction_guard` — le plancher TCA — déclenche `rapid_weight_loss`
-- au-dessus de 1,2 %/semaine sur 14 jours, soit ≈ 1,9 kg pour quelqu'un de
-- 80 kg. La variation d'eau d'un jour à l'autre est DU MÊME ORDRE. Comparer
-- une pesée du vendredi soir à une pesée du lundi matin fabrique ou efface une
-- alerte, et les autres pesées n'existaient plus pour en juger après coup.
--
-- Le champ que le garde lit s'appelle `weight_7d_avg_kg` depuis le premier
-- jour. Rien n'a jamais pu le calculer. Cette table le rend calculable —
-- `_shared/keel/body_measure_series.ts`, module pur, testé contre les fixtures
-- du garde lui-même.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
-- ----------------------------------
-- Elle ne retire RIEN. `weekly_reviews.biofeedback` garde `weight_kg`,
-- `waist_cm`, `source`, `measured_at` et les six axes de vivabilité, et les
-- trois écrivains continuent de l'alimenter (FF-031 R7 — double écriture
-- transitoire, dont la condition de retrait est écrite dans la fiche). Ce dépôt
-- a déjà payé la bascule sèche: un écrivain déplacé, un lecteur oublié, une
-- carte définitivement vide et une ceinture armée sur un coffre vide.
--
-- Les six axes (energy, hunger, sleep, digestion, mood, training) ne sont PAS
-- des mesures corporelles et n'entrent pas ici: ils alimentent `focus_axis` et
-- restent sur `weekly_reviews`.
-- ============================================================================

create table if not exists public.student_body_measures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- L'INSTANT DU GESTE, en heure LOCALE de l'élève résolue par le runtime.
  -- Jamais `now()`: un fait dont la date dépend du serveur qui l'a écrit est la
  -- famille de bugs nocturnes que ce dépôt a déjà payée. Distinct de
  -- `created_at`, qui est l'instant d'ÉCRITURE.
  measured_at timestamptz not null,

  -- LE JOUR DE L'ÉLÈVE, dans SON fuseau. Redondant avec `measured_at`, et c'est
  -- voulu: la dérivation groupe sur CETTE colonne. Reconvertir un timestamptz
  -- en jour à la lecture referait, mal, une conversion de fuseau que l'écrivain
  -- avait déjà faite juste — et ferait changer de jour, donc parfois de
  -- semaine, la mesure de la moitié de la planète.
  local_date date not null,

  -- Liste fermée, celle de `BodyMeasureKind` (body_measure_floor.ts). Pas de
  -- masse grasse, pas de tour de hanches: une grandeur qu'aucun écrivain ne
  -- produit et qu'aucun lecteur ne lit est une colonne qui divergera.
  kind text not null check (kind in ('weight', 'waist')),

  -- EN SI (R4 du CONTRACT): kg pour le poids, cm pour le tour de taille. La
  -- conversion depuis les livres et les pouces est faite en amont, par le
  -- plancher ou par l'écran; le stockage n'a qu'une unité.
  value_si numeric not null,

  -- D'OÙ VIENT LE GESTE. Liste fermée, et elle est LUE: laisser une mesure dite
  -- en conversation se faire passer pour un formulaire rendrait l'historique
  -- inexploitable le jour où on voudra comparer les deux gestes.
  source text not null check (source in ('sunday_flow', 'plan_card', 'chat')),

  -- La langue de la prose stockée, comme partout ailleurs (R2): une prose sans
  -- locale ment sur elle-même dès qu'on la relit.
  content_locale text,

  -- Les mots de l'élève, pour le chemin conversationnel. Ils existent pour
  -- qu'une mesure soit AUDITABLE: une valeur qu'on ne peut pas relire est une
  -- valeur qu'on ne peut pas débugger, et celle-ci arme une ceinture.
  student_note text,

  created_at timestamptz not null default now(),

  -- ── LES BORNES DE PLAUSIBILITÉ — CELLES DU FORMULAIRE, PAS D'AUTRES ───────
  -- 25-400 kg et 30-250 cm: `weekly_flow.ts`, `weeklyCheckIn.ts` et
  -- `bodyMeasures.ts` portent déjà ces quatre nombres et un test vérifie qu'ils
  -- coïncident. Un écran qui accepte ce que la base refuse fait saisir dans le
  -- vide, et l'erreur remontée serait une violation de contrainte que personne
  -- ne sait lire.
  --
  -- Les bornes PLUS ÉTROITES qui existent ailleurs (25-350 / 40-200 dans
  -- `student_body_io` et `BODY_MEASURE_BOUNDS`) sont des filtres de LECTURE et
  -- de RECONNAISSANCE. Les confondre avec le stockage ferait échouer la reprise
  -- ci-dessous sur des lignes déjà écrites et acceptées par le produit.
  --
  -- Volontairement larges: il ne s'agit pas de juger un corps mais d'attraper
  -- une faute de frappe et une unité mal lue. `restriction_guard` jette au-delà
  -- de 20-500 kg; ces bornes-ci sont strictement à l'intérieur, donc aucune
  -- ligne acceptée ici ne peut faire jeter la ceinture en aval.
  constraint student_body_measures_value_in_range check (
    (kind = 'weight' and value_si >= 25 and value_si <= 400)
    or (kind = 'waist' and value_si >= 30 and value_si <= 250)
  )
);

-- ── AUCUNE CONTRAINTE D'UNICITÉ, ET C'EST UNE DÉCISION ─────────────────────
-- La table est APPEND-ONLY, comme `protocol_events`: une correction n'efface
-- pas ce qu'elle corrige, elle s'ajoute après. C'est la DÉRIVATION qui tranche
-- (« la dernière mesure du jour gagne »), pas la base.
--
-- Deux bénéfices directs. Une écriture concurrente ne lève jamais 23505, donc
-- aucun écrivain n'a besoin de la boucle SELECT-puis-UPDATE-ou-INSERT que
-- l'index partiel de `weekly_reviews` impose à tous les siens. Et une valeur
-- démentie reste lisible: un poids qui a armé une ceinture puis a été corrigé
-- est exactement ce qu'on veut pouvoir relire.
comment on table public.student_body_measures is
  'FF-031: une mesure corporelle par LIGNE, datée à l''instant du geste. '
  'Remplace la case unique weekly_reviews.biofeedback.weight_kg comme source '
  'de vérité. APPEND-ONLY: une correction s''ajoute, la dérivation tranche '
  '(_shared/keel/body_measure_series.ts). Le plancher TCA lit la série '
  'hebdomadaire DÉRIVÉE d''ici, jamais ces lignes directement.';

comment on column public.student_body_measures.local_date is
  'Le jour de l''élève dans SON fuseau. La dérivation groupe sur cette colonne '
  'et jamais sur measured_at reconverti: une conversion refaite à la lecture '
  'ferait changer de jour, donc parfois de semaine, la mesure de la moitié de '
  'la planète.';

comment on column public.student_body_measures.value_si is
  'kg pour weight, cm pour waist (CONTRACT R4). Bornes du formulaire au CHECK: '
  '25-400 kg, 30-250 cm — strictement à l''intérieur des 20-500 kg au-delà '
  'desquels restriction_guard jette.';

-- La seule lecture qui existe: les mesures d'un élève, d'une grandeur, sur une
-- fenêtre récente. `measured_at desc` en second pour que « la dernière du
-- jour » sorte en tête sans tri côté client.
create index if not exists student_body_measures_user_kind_date_idx
  on public.student_body_measures (user_id, kind, local_date desc, measured_at desc);

-- ---------------------------------------------------------------------------
-- RLS — le propriétaire lit et écrit; le coach LIT, comme sur weekly_reviews
-- ---------------------------------------------------------------------------
-- Le coach a déjà `weekly_reviews_select_coach` sur exactement la même donnée
-- (le poids vit dans le `biofeedback` qu'il lit). Ne pas la lui donner ici
-- retirerait en silence, à la bascule des lecteurs, une information qu'il a
-- aujourd'hui — et ce retrait-là serait une décision produit, pas un effet de
-- bord de migration. La politique est donc reprise mot pour mot.
alter table public.student_body_measures enable row level security;

drop policy if exists student_body_measures_owner_all on public.student_body_measures;
create policy student_body_measures_owner_all on public.student_body_measures
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists student_body_measures_select_coach on public.student_body_measures;
create policy student_body_measures_select_coach on public.student_body_measures
  for select to authenticated
  using (user_id = any ((select public.coached_student_ids())::uuid[]));

-- ---------------------------------------------------------------------------
-- LES GRANTS — `anon` n'a rien, et c'est un GESTE, pas un réflexe
--
-- « revoke from public » ne retire PAS les privilèges par défaut d'`anon`, qui
-- les tient de son propre grant (cicatrice `revoke-from-public-leaves-anon`).
-- Et Supabase accorde TOUT à `authenticated` sur toute table neuve, y compris
-- TRUNCATE, qui échappe à RLS. Les deux sont retirés nommément.
-- ---------------------------------------------------------------------------
revoke all on table public.student_body_measures from anon;
revoke truncate on table public.student_body_measures from authenticated;

-- ============================================================================
-- LA REPRISE DE L'EXISTANT
--
-- Chaque `biofeedback.weight_kg` / `waist_cm` déjà écrit devient une mesure
-- datée. Sans elle, la bascule des lecteurs ferait disparaître l'historique de
-- tout le monde — et avec lui la profondeur de série dont le plancher TCA a
-- besoin pour comparer deux semaines distantes de quatorze jours.
--
-- LA DATE EST RECONSTRUITE, ET L'ORDRE DES REPLIS EST LE POINT DÉLICAT
--   1. `biofeedback.measured_at` quand il est lisible — seul le chemin
--      conversationnel l'a jamais posé, et c'est la vraie date;
--   2. sinon `weekly_reviews.created_at` s'il tombe dans la semaine — c'est
--      l'instant où le formulaire a atterri, donc à quelques heures près celui
--      de la pesée;
--   3. sinon le lundi de la semaine à 12:00 UTC. Approximatif, et sans
--      conséquence pour le seul lecteur qui compte: la mesure retombe dans SA
--      semaine, qui est la maille que le plancher compare.
--
-- Midi et pas minuit au repli 3: minuit UTC bascule de jour pour tout élève à
-- l'ouest de Greenwich, et rangerait la mesure dans la semaine précédente pour
-- la moitié de la planète.
--
-- UNE VALEUR HORS BORNES EST SAUTÉE ET COMPTÉE, jamais tronquée ni écrite. Elle
-- vient presque toujours d'une unité mal lue; tous les lecteurs la filtrent
-- déjà aujourd'hui, elle n'a donc jamais rien alimenté. L'écrire ici casserait
-- la ceinture en aval au lieu de la nourrir.
--
-- IDEMPOTENTE: `where not exists` sur (user_id, kind, measured_at). Relancer la
-- migration ne duplique pas l'historique — et sur une base partagée où une
-- autre session peut rejouer un fichier, ce n'est pas une précaution
-- théorique.
-- ============================================================================
-- Un cast qui ne fait pas tomber la migration. `biofeedback.measured_at` est du
-- jsonb libre: personne n'a jamais contraint ce qu'on y écrit, et un `::timestamptz`
-- nu sur une chaîne fantaisiste ferait échouer la reprise ENTIÈRE pour une
-- ligne. Créée puis retirée dans le même fichier: elle ne survit pas à sa reprise.
create or replace function public.ff031_try_timestamptz(txt text)
returns timestamptz language plpgsql immutable as $fn$
begin
  return txt::timestamptz;
exception when others then
  return null;
end;
$fn$;

do $$
declare
  v_inserted bigint := 0;
  v_skipped bigint := 0;
begin
  drop table if exists ff031_candidate;
  create temporary table ff031_candidate on commit drop as
  select
    wr.user_id,
    k.kind,
    (wr.biofeedback ->> k.json_key)::numeric as value_si,
    coalesce(
      -- 1. l'instant vrai, quand la conversation l'a posé
      case
        when jsonb_typeof(wr.biofeedback -> 'measured_at') = 'string'
          then public.ff031_try_timestamptz(wr.biofeedback ->> 'measured_at')
      end,
      -- 2. l'instant où le formulaire a atterri, s'il tombe dans la semaine
      case
        when wr.created_at >= (wr.week_start_date::timestamp at time zone 'UTC')
         and wr.created_at < ((wr.week_start_date + 7)::timestamp at time zone 'UTC')
          then wr.created_at
      end,
      -- 3. le lundi à MIDI UTC — et midi, pas minuit: minuit UTC bascule de
      --    jour pour tout élève à l'ouest de Greenwich et rangerait la mesure
      --    dans la semaine précédente pour la moitié de la planète.
      ((wr.week_start_date::timestamp + interval '12 hours') at time zone 'UTC')
    ) as measured_at,
    case wr.biofeedback ->> 'source'
      when 'chat' then 'chat'
      when 'in_app_measures_card' then 'plan_card'
      -- `in_app_weekly_form`, `whatsapp_flow`, et l'absence de clé: avant la
      -- carte des mesures, le point du dimanche était le seul écrivain.
      else 'sunday_flow'
    end as source,
    wr.content_locale,
    (k.kind = 'weight' and (wr.biofeedback ->> k.json_key)::numeric between 25 and 400)
      or (k.kind = 'waist' and (wr.biofeedback ->> k.json_key)::numeric between 30 and 250)
      as in_range
  from public.weekly_reviews wr
  cross join (values
    ('weight', 'weight_kg'),
    ('waist', 'waist_cm')
  ) as k(kind, json_key)
  where wr.plan_version_id is null
    -- `= 'number'` et pas « non nul »: une valeur écrite en CHAÎNE ("78.4")
    -- serait castée sans broncher et entrerait avec une précision qu'on n'a
    -- pas vérifiée. Les écrivains écrivent des nombres; ce qui n'en est pas un
    -- n'est pas une mesure qu'on sait reprendre.
    and jsonb_typeof(wr.biofeedback -> k.json_key) = 'number';

  select count(*) into v_skipped from ff031_candidate where not in_range;

  insert into public.student_body_measures
    (user_id, measured_at, local_date, kind, value_si, source, content_locale)
  select
    c.user_id,
    c.measured_at,
    -- Le jour LOCAL n'est pas reconstituable a posteriori: le fuseau de l'élève
    -- au moment de la pesée n'a jamais été stocké. La date UTC de l'instant est
    -- la seule lecture honnête, et elle est bonne à un jour près — sans effet
    -- sur la semaine, sauf pesée à cheval sur minuit.
    (c.measured_at at time zone 'UTC')::date,
    c.kind,
    c.value_si,
    c.source,
    c.content_locale
  from ff031_candidate c
  where c.in_range
    and not exists (
      select 1 from public.student_body_measures m
      where m.user_id = c.user_id
        and m.kind = c.kind
        and m.measured_at = c.measured_at
    );
  get diagnostics v_inserted = row_count;

  raise notice 'FF-031 reprise: % mesures ecrites, % sautees (hors bornes)',
    v_inserted, v_skipped;
end;
$$;

drop function if exists public.ff031_try_timestamptz(text);
