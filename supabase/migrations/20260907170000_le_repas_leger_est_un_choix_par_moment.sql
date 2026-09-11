-- ═══════════════════════════════════════════════════════════════════════════
-- « CE MOMENT-LÀ PÈSE MOINS QUE D'HABITUDE » — 2026-09-07
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chantier: `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`, lot 2.
-- Patron: `20260901120000_habit_slots_carry_meal_extras.sql`, dont ce fichier
-- reprend la forme ET le raisonnement.
--
-- ⚠️ HORODATAGE — le plan de chantier annonçait `20260907150000`. Il est écrit
-- `20260907170000` EXPRÈS: `20260907160000` (le rendement par aliment) est
-- déjà appliquée, et une migration antérieure au dernier registre est SAUTÉE
-- EN SILENCE par la CLI. La cicatrice existe (`out-of-order-migration-is-
-- silently-skipped`): le correctif dormait sur le disque pendant qu'on
-- cherchait pourquoi il ne faisait rien.
--
-- ⛔ AUCUNE COLONNE NEUVE, ET C'EST LE MÊME POINT QUE LES EXTRAS.
-- `household_member_habits.slots` est déjà clé par (bouche, moment) et déjà
-- bornée. La forme devient:
--
--   [{"slot":"dinner","kind":"household_dish","usual":"",
--     "extras":["bread"],"light":true}]
--
-- ⛔ AUCUNE RPC N'EST TOUCHÉE. `keel_household_set_member_habits` prend déjà
-- `p_slots jsonb` et l'écrit tel quel; c'est la CONTRAINTE qui décide de ce qui
-- entre. Ajouter un argument aurait obligé l'écran à connaître deux chemins
-- pour une seule fiche.
--
-- ── CE QUE `light` VEUT DIRE, ET CE QU'IL NE VEUT PAS DIRE ────────────────
-- Il dit: « à ce moment-là je mange moins que d'habitude ». Le moteur en tire
-- un POIDS de journée plus faible (`LIGHT_SLOT_WEIGHT`, `mouth_anchor.ts`) et
-- **renormalise**: ce que le soir perd, les autres moments le reprennent.
--
-- ⛔ IL NE DIT PAS « je saute ce repas » — ça, c'est ne pas déclarer le moment,
-- et cette porte existe déjà. Il ne dit pas non plus « je mange moins dans la
-- journée »: la cible du jour vient du corps et de l'objectif, jamais d'ici.
--
-- ── TROIS ÉTATS, ET LA CLÉ ABSENTE EST LE PREMIER ────────────────────────
--   · clé ABSENTE ⇒ la question n'a pas été posée à ce moment-là;
--   · `false`     ⇒ posée, réponse non;
--   · `true`      ⇒ ce moment pèse moins.
-- ⚠️ Les deux premiers DOIVENT rester distincts. Un écran qui les confond
-- repose la question à quelqu'un qui a déjà répondu — cicatrice datée
-- (`jsonb-default-hides-answered-vs-unasked`). C'est pourquoi il n'y a ni
-- valeur par défaut, ni rétro-remplissage: cette migration n'écrit AUCUNE
-- donnée.
--
-- ⛔ ET LE PÉRIMÈTRE EST DE TROIS MOMENTS, PAS SIX — pour une raison
-- arithmétique, pas esthétique. Une collation pèse déjà 0,10 de la journée;
-- la marquer légère demanderait au plan de composer ~40 kcal, c'est-à-dire
-- rien, servi comme une décision. La liste doit rester identique à
-- `LIGHT_BEARING_SLOTS` (`meal_extras.ts`) et à `LIGHT_SLOT_WEIGHT`
-- (`mouth_anchor.ts`): un moment marquable sans poids serait une case qui ne
-- fait rien, un poids sans case serait un poids que rien n'atteint. Un test
-- compare les deux listes côté code.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ---------------------------------------------------------------------------
-- LA FORME EST TENUE EN BASE, PAS SEULEMENT PAR LE PARSEUR
-- ---------------------------------------------------------------------------
create or replace function public.keel_habit_light_ok(p_slots jsonb)
returns boolean
language sql
immutable
as $$
  -- ⚠️ UN `slots` QUI N'EST PAS UN TABLEAU REND `true` ICI, ET CE N'EST PAS UN
  -- TROU: `household_member_habits_slots_check` le refuse déjà, et l'ordre
  -- d'évaluation de deux contraintes n'est pas garanti. Rendre un verdict sur
  -- une forme dont une autre contrainte est propriétaire ferait deux erreurs
  -- pour un seul défaut. C'est mot pour mot le raisonnement de
  -- `keel_habit_extras_ok`, et les deux doivent rester d'accord.
  select case
    when jsonb_typeof(p_slots) <> 'array' then true
    else coalesce(
      (
        select bool_and(
          jsonb_typeof(entry -> 'light') = 'boolean'
          and entry ->> 'slot' in ('breakfast', 'lunch', 'dinner')
        )
        from pg_catalog.jsonb_array_elements(p_slots) as entry
        -- ⛔ `jsonb_typeof(entry) = 'object'` D'ABORD. Sur une entrée qui est la
        -- CHAÎNE "light", l'opérateur `?` rend vrai et `-> 'light'` rend NULL:
        -- la ligne passerait en silence. Même piège que pour les extras.
        where jsonb_typeof(entry) = 'object' and entry ? 'light'
      ),
      -- ⚠️ AUCUNE ENTRÉE NE PORTE LA CLÉ ⇒ `true`. C'est le cas de TOUTE la
      -- base d'avant ce lot: `bool_and` sur zéro ligne rend NULL, et une
      -- contrainte qui rend NULL passe — mais par accident. On le dit.
      true
    )
  end;
$$;

comment on function public.keel_habit_light_ok(jsonb) is
  'La clé « light » d''une entrée d''habitude: booléen STRICT, et seulement sur '
  'breakfast/lunch/dinner. Une collation ne se marque pas légère — elle pèse '
  'déjà 0,10 de la journée. Doit rester d''accord avec LIGHT_BEARING_SLOTS '
  '(_shared/keel/meal_extras.ts) et LIGHT_SLOT_WEIGHT (mouth_anchor.ts).';

alter table public.household_member_habits
  drop constraint if exists household_member_habits_light_check;
alter table public.household_member_habits
  add constraint household_member_habits_light_check
  check (public.keel_habit_light_ok(slots));

comment on column public.household_member_habits.slots is
  'Les moments de la bouche. Chaque entrée: slot, kind, usual, et deux clés '
  'FACULTATIVES qui ne parlent qu''au calcul — « extras » (ce qui arrive à '
  'côté du plat, midi et soir) et « light » (ce moment pèse moins que '
  'd''habitude, petit-déjeuner/midi/soir). Pour les deux, la clé ABSENTE et la '
  'réponse vide/négative sont des états DISTINCTS: absente = la question n''a '
  'pas été posée. Aucune valeur par défaut, aucun rétro-remplissage.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOC DE CONTRÔLE — la contrainte refuse-t-elle ce que le commentaire promet ?
--
-- ⛔ LE CAS QUI PASSE EST ÉCRIT EN PREMIER, ET C'EST DÉLIBÉRÉ. Une contrainte
-- cassée qui refuse TOUT ressemble exactement à une contrainte qui marche, et
-- ce dépôt l'a déjà payé (`guards-need-a-passing-case`). Si ⓐ échoue, rien
-- d'autre ne prouve quoi que ce soit.
--
-- À rejouer à la main dans psql, sur une bouche de test:
--
--   -- ⓐ LE CAS NOMINAL — DOIT PASSER
--   update public.household_member_habits
--      set slots = '[{"slot":"dinner","kind":"household_dish","usual":"",
--                     "extras":["bread"],"light":true}]'::jsonb
--    where member_id = '<test>';
--
--   -- ⓑ un booléen écrit en toutes lettres ⇒ REFUSÉ
--   update … set slots = '[{"slot":"dinner","light":"yes"}]'::jsonb …
--
--   -- ⓒ une collation marquée légère ⇒ REFUSÉE
--   update … set slots = '[{"slot":"snack_pm","light":true}]'::jsonb …
--
--   -- ⓓ `false` est une réponse VALIDE, pas une absence ⇒ DOIT PASSER
--   update … set slots = '[{"slot":"lunch","light":false}]'::jsonb …
--
--   -- ⓔ extras ET light sur la même entrée ⇒ DOIT PASSER
--   update … set slots = '[{"slot":"lunch","extras":["bread"],"light":true}]'…
--
--   -- ⓕ aucune clé `light` ⇒ DOIT PASSER (toute la base d'avant ce lot)
--   update … set slots = '[{"slot":"lunch","kind":"own_usual","usual":"x"}]'…
-- ═══════════════════════════════════════════════════════════════════════════
