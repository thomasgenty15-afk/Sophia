-- ===========================================================================
-- FF-059 LOT 4 — LA DIRECTION OUVRE LE CHIFFRE, ET LE CHOIX EXPLICITE GAGNE.
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
-- Décision humaine du 2026-09-01, en toutes lettres: « dès qu'une personne dit
-- qu'elle veut gagner ou perdre du poids, elle doit être en capacité de voir
-- ces chiffres. Comme ça c'est pas compliqué et ça se fait automatiquement. »
--
-- ── CE QUE ÇA RENVERSE, ET IL FAUT LE NOMMER ───────────────────────────────
-- Les migrations `20260812230000` et `20260812240000` écrivaient, sous le titre
-- « NOT NULL, PAS DE TROISIÈME ÉTAT »:
--
--     « Un `null` "il n'a jamais répondu" obligerait à choisir quand même une
--       valeur effective à la lecture — donc à écrire le défaut à DEUX
--       endroits, dont un en TypeScript. »
--
-- L'argument portait sur la DUPLICATION, pas sur le tri-état. Il tombe ici
-- parce que le défaut ne s'écrit PAS à deux endroits: il s'écrit une fois, dans
-- `energySwitchFrom` (`_shared/keel/energy_gate.ts`), fonction pure dont les
-- deux entrées sont REQUISES et dont le test énumère les six combinaisons. Il
-- n'existe aucune seconde dérivation, et `energy_gate_test.ts` le prouve en
-- lisant la source des appelants.
--
-- La seconde phrase de ce paragraphe reste vraie et n'est PAS renversée:
--
--     « la variante honnête du tri-état — demander à l'élève "veux-tu voir tes
--       calories ?" — est elle-même une invitation à compter, posée à tout le
--       monde. »
--
-- On ne pose la question à personne. On lit une réponse DÉJÀ donnée: la
-- direction de la balance, que l'entonnoir exige de tout adulte
-- (`canGenerate`/`personMisses`, `frontend/src/keel/api/onboarding.ts`).
-- Quelqu'un qui a écrit « je veux perdre du gras » a déjà dit qu'il compte;
-- lui reposer la question sous forme de bouton était le pas de trop.
--
-- ── LES TROIS ÉTATS, ET AUCUN N'EST UN REPLI ───────────────────────────────
--
--   `true`  — CHOIX EXPLICITE. La personne a appuyé sur « Afficher ».
--   `false` — CHOIX EXPLICITE. Elle a appuyé sur « Masquer ». ⚠️ IL GAGNE
--             CONTRE LA DIRECTION, POUR TOUJOURS. R7 de la fiche: « un chiffre
--             qu'on ne peut pas faire taire est un tracker ». Une extinction
--             que le prochain changement d'objectif rallumerait ne serait pas
--             une extinction.
--   `null`  — PERSONNE N'A CHOISI. La direction décide (`fat_loss` et
--             `muscle_gain` ouvrent, `maintenance` et l'absence ferment).
--
-- ── ⛔ CE QUE ÇA N'OUVRE PAS, ET C'EST LA MOITIÉ QUI COMPTE ────────────────
-- Rien d'autre. Les portes ①  plancher TCA, ②  mineur, ②bis âge inconnu et
-- ③  doctrine du coach sont AVANT celle-ci dans `canShowEnergy`, et un `null`
-- dérivé « ouvert » n'en desserre aucune. Un élève sous plancher TCA qui vise
-- une perte de gras lit toujours `restriction_floor`, et c'est le point le plus
-- important de la fiche.
--
-- ── LE BACKFILL: `false` → `null`, ET POURQUOI IL NE DÉTRUIT RIEN ──────────
-- Un `false` d'aujourd'hui ne distingue pas « a éteint » de « n'a jamais
-- choisi », puisque les deux colonnes valaient `false` par défaut. Le traiter
-- comme une extinction figerait à jamais une décision que personne n'a prise.
--
-- MESURÉ SUR LA BASE LOCALE LE 2026-09-01, avant d'écrire cette ligne:
--   · 38 comptes ont au moins un plan vivant;
--   · **0** d'entre eux a `energy_display_enabled = true`.
-- Personne n'a donc jamais pu ALLUMER, donc personne n'a jamais ÉTEINT: il
-- n'existe aujourd'hui aucun `false` qui soit un choix. (Banc quasi entièrement
-- composé de comptes de test — c'est ce qui rend le backfill sûr MAINTENANT, et
-- c'est exactement pour ça qu'il est fait maintenant et pas plus tard.)
--
-- ⚠️ IDEMPOTENT PAR CONSTRUCTION, ET LE GARDE EST LE `NOT NULL` LUI-MÊME. Le
-- backfill ne tourne QUE tant que la colonne est encore `NOT NULL`. Rejouer ce
-- fichier après coup n'écrase donc AUCUNE extinction réelle — une garde qui
-- porte sur l'état du schéma, et pas sur une date ou un drapeau qu'on oublie.
--
-- RÉVERSIBILITÉ — dans l'autre sens, deux lignes par colonne:
--   update public.profiles set energy_display_enabled = false
--    where energy_display_enabled is null;
--   alter table public.profiles
--     alter column energy_display_enabled set default false,
--     alter column energy_display_enabled set not null;
-- ===========================================================================

begin;

-- ⚠️ L'ORDRE DES DEUX GESTES EST OBLIGATOIRE, ET IL A ÉTÉ INVERSÉ UNE FOIS
-- (2026-09-01, refusé par la base): le backfill ne peut PAS précéder le
-- `drop not null` — écrire `null` dans une colonne encore `NOT NULL` lève
-- `23502`. On CONSTATE d'abord l'état du schéma, on relâche la contrainte,
-- ensuite seulement on écrit. Le drapeau lu AVANT est ce qui garde
-- l'idempotence: à la seconde exécution la colonne est déjà nullable, donc le
-- backfill ne tourne pas, donc aucune extinction réelle n'est écrasée.
do $$
declare
  v_display_was_not_null boolean;
  v_target_was_not_null boolean;
  v_display_backfilled bigint := 0;
  v_target_backfilled bigint := 0;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'energy_display_enabled' and is_nullable = 'NO'
  ) into v_display_was_not_null;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'energy_target_enabled' and is_nullable = 'NO'
  ) into v_target_was_not_null;

  -- ── PORTE ④ — LES FAITS SUR LA NOURRITURE ───────────────────────────────
  if v_display_was_not_null then
    execute 'alter table public.profiles '
            'alter column energy_display_enabled drop not null';
    execute 'update public.profiles set energy_display_enabled = null '
            'where energy_display_enabled = false';
    get diagnostics v_display_backfilled = row_count;
  end if;

  -- ── PORTE ⑤ — LA FOURCHETTE, LE JUGEMENT SUR LA PERSONNE ────────────────
  if v_target_was_not_null then
    execute 'alter table public.profiles '
            'alter column energy_target_enabled drop not null';
    execute 'update public.profiles set energy_target_enabled = null '
            'where energy_target_enabled = false';
    get diagnostics v_target_backfilled = row_count;
  end if;

  raise notice
    'FF-059 lot 4: % ligne(s) porte 4 et % ligne(s) porte 5 rendues au tri-etat',
    v_display_backfilled, v_target_backfilled;
end
$$;

-- ⚠️ LE DÉFAUT PART, IL NE DEVIENT PAS `true`. Une colonne sans défaut rend
-- `null` sur toute ligne neuve, et `null` veut dire « personne n'a choisi » —
-- c'est-à-dire « la direction décide ». Poser `default true` ici ouvrirait le
-- chiffre à quelqu'un dont l'objectif est `maintenance`, ce que la décision du
-- 2026-09-01 ne demande pas.
alter table public.profiles
  alter column energy_display_enabled drop default;
alter table public.profiles
  alter column energy_target_enabled drop default;

comment on column public.profiles.energy_display_enabled is
  'FF-059 porte ④ — TRI-ÉTAT depuis le 2026-09-01. true/false = choix '
  'EXPLICITE de la personne, et false gagne pour toujours contre la direction '
  '(R7: un chiffre qu''on ne peut pas faire taire est un tracker). null = '
  'personne n''a choisi, et la DIRECTION de sa balance décide (fat_loss et '
  'muscle_gain ouvrent). La dérivation s''écrit une seule fois, dans '
  'energySwitchFrom (_shared/keel/energy_gate.ts). N''ouvre rien à elle seule: '
  'les portes ① plancher TCA, ② mineur, ②bis âge inconnu et ③ doctrine du '
  'coach sont AVANT elle et gagnent contre elle.';

comment on column public.profiles.energy_target_enabled is
  'FF-059 porte ⑤ — TRI-ÉTAT depuis le 2026-09-01, mêmes règles que la porte '
  '④ (voir son commentaire). Distincte d''elle: celle-ci est un jugement sur '
  'la personne, pas un fait sur la nourriture. Depuis le lot 4 la fourchette '
  'qu''elle ouvre SUIT LA DIRECTION — elle n''est plus une maintenance nue '
  'quand la personne vise une perte ou une prise (voir directedRange dans '
  '_shared/keel/energy_target.ts). N''ouvre rien à elle seule: canShowTarget '
  'exige d''abord toute la chaîne A/B.';

commit;
