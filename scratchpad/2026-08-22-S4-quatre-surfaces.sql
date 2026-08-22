-- ════════════════════════════════════════════════════════════════════════════
-- S4 — L'OBJECTIF SUR UN MINEUR : LES QUATRE SURFACES, EXÉCUTÉES
-- ════════════════════════════════════════════════════════════════════════════
--
-- Le même fichier sert la `mesure AVANT` et la `mesure APRÈS`. Il n'affirme
-- rien: il APPELLE les quatre portes d'écriture du produit et écrit ce
-- qu'elles répondent, à côté de ce qu'on attend d'elles APRÈS la garde.
--
-- ⛔ TOUT EST EN TRANSACTION `rollback`. Aucune ligne n'est écrite, aucune
--    bouche existante n'est modifiée durablement. Les deux mineurs réels qui
--    portent déjà un objectif (`Lea`, `Tom`, foyer 4123e479-…) ne sont ni lus
--    ni touchés par ce fichier.
--
-- ⚠️ LE PLAFOND DE BOUCHES EST À 8 (`keel_household_max_mouths`) ET LE FOYER
--    EN PORTE DÉJÀ 4. Le harnais ne s'autorise donc que QUATRE ajouts, et
--    réutilise les bouches déjà sondées pour tout le reste. Un 5ᵉ ajout
--    rendrait `household_full` — un refus qui RESSEMBLE au refus qu'on mesure,
--    et c'est exactement le piège d'une garde verte sur le mauvais motif.
--
-- ⚠️ POURQUOI LA SONDE `D` PASSE PAR UN `update` DIRECT:
--    la 4ᵉ surface (`set_member_target`) ne peut être exercée que sur une
--    bouche mineure QUI PORTE DÉJÀ UNE DIRECTION — sinon c'est
--    `target_needs_direction` qui répond, et on croirait avoir mesuré une
--    garde d'âge qu'on n'a pas posée. APRÈS la garde, les portes `B` et `C`
--    refusent, et plus AUCUNE RPC ne peut fabriquer cet état: il ne reste que
--    l'`update` direct, qui reproduit exactement l'état des 2 lignes déjà en
--    base. Sans lui, la 4ᵉ garde serait « verte sur son propre cas » et
--    désarmée sur le seul cas réel.
--
-- Lancement:
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < scratchpad/2026-08-22-S4-quatre-surfaces.sql
-- ════════════════════════════════════════════════════════════════════════════

\pset pager off
\set ON_ERROR_STOP on

begin;

-- Le maître du foyer-fixture `V0-C`. Compte de banc, pas une personne — et de
-- toute façon la transaction est annulée.
select set_config(
  'request.jwt.claims',
  '{"sub":"53fb05ba-333a-4bf5-9e19-502103581ef7","role":"authenticated"}',
  true
) as jeton_du_maitre;

create temp table s4_out(
  ord     integer,
  cas     text,
  attendu text,
  observe text,
  ok      boolean
) on commit drop;

do $s4$
declare
  v_res    jsonb;
  v_res2   jsonb;
  v_a      uuid;
  v_b      uuid;
  v_c      uuid;
  v_malo   uuid;
  v_anouk  uuid;
begin
  select hm.member_id into v_malo
  from public.household_members hm
  where hm.household_id = 'b1959752-92c8-4038-8c17-992a77d68d21'
    and hm.first_name = 'Malo';    -- adulte 1992-07-09, sans compte
  select hm.member_id into v_anouk
  from public.household_members hm
  where hm.household_id = 'b1959752-92c8-4038-8c17-992a77d68d21'
    and hm.first_name = 'Anouk';   -- MINEURE 2011-05-20, sans compte

  -- ══════════════════════════════════════════════════════════════════════
  -- A — LA DATE DE MINEUR ET L'OBJECTIF DANS LE MÊME APPEL
  --     C'est ce que `SetupPage.tsx:1592` envoie réellement: un seul appel.
  -- ══════════════════════════════════════════════════════════════════════
  v_res := public.keel_household_add_member('SondeA-S4', date '2011-05-20', 'fat_loss');
  v_a := (v_res->>'member_id')::uuid;
  insert into s4_out values (
    1, 'A',
    'ok=false reason=goal_not_for_minor',
    'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
    (v_res->>'ok') = 'false' and (v_res->>'reason') = 'goal_not_for_minor'
  );

  -- ══════════════════════════════════════════════════════════════════════
  -- B — LE DÉTOUR TEMPOREL: l'objectif d'abord, la date de mineur ensuite
  -- ══════════════════════════════════════════════════════════════════════
  v_res := public.keel_household_add_member('SondeB-S4', null, 'fat_loss');
  v_b := (v_res->>'member_id')::uuid;
  if v_b is null then
    insert into s4_out values (2, 'B', 'ok=false reason=goal_not_for_minor',
      'AMORCE REFUSÉE: ' || v_res::text, false);
  else
    v_res := public.keel_household_set_member_birth_date(v_b, date '2011-05-20');
    insert into s4_out values (
      2, 'B',
      'ok=false reason=goal_not_for_minor',
      'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
      (v_res->>'ok') = 'false' and (v_res->>'reason') = 'goal_not_for_minor'
    );
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- C — L'OBJECTIF SUR UNE BOUCHE DÉJÀ DATÉE MINEURE
  -- ══════════════════════════════════════════════════════════════════════
  v_res := public.keel_household_add_member('SondeC-S4', date '2011-05-20', null);
  v_c := (v_res->>'member_id')::uuid;
  if v_c is null then
    insert into s4_out values (3, 'C', 'ok=false reason=goal_not_for_minor',
      'AMORCE REFUSÉE: ' || v_res::text, false);
    insert into s4_out values (5, 'E', 'les DEUX refusés', 'AMORCE REFUSÉE', false);
  else
    v_res := public.keel_household_set_member_goal(v_c, 'fat_loss');
    insert into s4_out values (
      3, 'C',
      'ok=false reason=goal_not_for_minor',
      'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
      (v_res->>'ok') = 'false' and (v_res->>'reason') = 'goal_not_for_minor'
    );

    -- ════════════════════════════════════════════════════════════════════
    -- E — C PUIS D DANS LE MÊME TOUR, sur la MÊME enfant
    --     (trouvé par la vérification de `V0-C`: `ok` + `ok`)
    -- ════════════════════════════════════════════════════════════════════
    v_res2 := public.keel_household_set_member_target(v_c, 40, 0.5);
    insert into s4_out values (
      5, 'E',
      'les DEUX refusés',
      'C:' || coalesce(v_res->>'reason','OK-ACCEPTÉ') || ' + D:' || coalesce(v_res2->>'reason','OK-ACCEPTÉ'),
      (v_res->>'ok') = 'false' and (v_res2->>'ok') = 'false'
    );
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- D — LA CIBLE CHIFFRÉE SUR UNE ENFANT QUI PORTE DÉJÀ UNE DIRECTION
  --     (l'état des 2 lignes réelles, reproduit sans les toucher)
  --     Réutilise la bouche de `B` — elle porte déjà `fat_loss`.
  -- ══════════════════════════════════════════════════════════════════════
  if v_b is null then
    insert into s4_out values (4, 'D', 'ok=false reason=target_not_for_minor',
      'AMORCE REFUSÉE', false);
  else
    -- ⚠️ `update` DIRECT, EXPRÈS: voir l'en-tête.
    update public.household_members set birth_date = date '2011-05-20'
     where member_id = v_b;
    v_res := public.keel_household_set_member_target(v_b, 45, 0.2);
    insert into s4_out values (
      4, 'D',
      'ok=false reason=target_not_for_minor',
      'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
      (v_res->>'ok') = 'false' and (v_res->>'reason') = 'target_not_for_minor'
    );
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- ⛔ LES CAS QUI PASSENT. Une garde sans cas qui passe bloque tout et
  --    RESSEMBLE à une garde qui marche.
  -- ══════════════════════════════════════════════════════════════════════

  -- P1 — l'objectif sur un MAJEUR. C'est le 5ᵉ cas de la fiche.
  v_res := public.keel_household_set_member_goal(v_malo, 'fat_loss');
  insert into s4_out values (
    6, 'P1', 'ok=true',
    'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
    (v_res->>'ok') = 'true'
  );

  -- P2 — la 4ᵉ porte a aussi besoin de son cas qui passe.
  v_res := public.keel_household_set_member_target(v_malo, 78, 0.4);
  insert into s4_out values (
    7, 'P2', 'ok=true',
    'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
    (v_res->>'ok') = 'true'
  );

  -- P3 — l'ajout d'un MAJEUR avec objectif, dans le même appel: le miroir
  -- exact de `A`. Sans lui, `A` pourrait refuser pour n'importe quel motif.
  v_res := public.keel_household_add_member('SondeP3-S4', date '1990-01-01', 'fat_loss');
  insert into s4_out values (
    8, 'P3', 'ok=true',
    'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
    (v_res->>'ok') = 'true'
  );

  -- P4 — `maintenance` sur une MINEURE reste ACCEPTÉ, et c'est une décision:
  -- l'énergie d'un mineur EST une maintenance calculée sur son âge
  -- (`childEnvelopeFromBody`). Refuser ici refuserait une écriture sans
  -- effet — et une garde qui refuse l'inoffensif finit par être retirée.
  v_res := public.keel_household_set_member_goal(v_anouk, 'maintenance');
  insert into s4_out values (
    9, 'P4', 'ok=true',
    'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
    (v_res->>'ok') = 'true'
  );

  -- P5 — LE REMÈDE EST OUVERT. Retirer l'objectif d'une mineure, puis lui
  -- poser sa vraie date: c'est le chemin que le refus `B` désigne. S'il était
  -- fermé, la garde rendrait la date d'un enfant INSAISISSABLE.
  v_res := public.keel_household_set_member_goal(v_b, null);
  v_res2 := public.keel_household_set_member_birth_date(v_b, date '2011-05-20');
  insert into s4_out values (
    10, 'P5', 'les DEUX ok=true',
    'retrait:' || (v_res->>'ok') || ' + date:' || (v_res2->>'ok'),
    (v_res->>'ok') = 'true' and (v_res2->>'ok') = 'true'
  );

  -- P6 — poser une date d'ADULTE sur une bouche qui porte un objectif reste
  -- ouvert: la porte `B` ne ferme qu'UN sens.
  v_res := public.keel_household_set_member_birth_date(v_malo, date '1992-07-09');
  insert into s4_out values (
    11, 'P6', 'ok=true',
    'ok=' || (v_res->>'ok') || ' reason=' || coalesce(v_res->>'reason','-'),
    (v_res->>'ok') = 'true'
  );
end;
$s4$;

select ord, cas, attendu, observe, case when ok then 'OK' else 'KO' end as verdict
from s4_out order by ord;

select '── LES CINQ DE LA FICHE (A B C D P1) ──' as bloc,
       count(*) filter (where ok) || '/5' as score
from s4_out where cas in ('A','B','C','D','P1');

select '── TOUTES LES SONDES ──' as bloc,
       count(*) filter (where ok) || '/' || count(*) as score
from s4_out;

-- ⛔ RIEN N'EST ÉCRIT.
rollback;
