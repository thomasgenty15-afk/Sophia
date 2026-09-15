-- ===========================================================================
-- LA CONTRAINTE `household_member_habits_extras_check` MORD-ELLE, ET
-- LAISSE-T-ELLE PASSER LE CAS NOMINAL ?
--
-- ⛔ LES DEUX MOITIÉS, ET LA SECONDE EST CELLE QU'ON OUBLIE. Une contrainte qui
-- refuse TOUT ressemble exactement à une contrainte qui marche: elle rougit sur
-- le cas fautif. Ce fichier tient donc un cas qui PASSE, et il échoue si le
-- refus s'élargit.
--
-- ⚠️ CE TEST NE TOURNE PAS DANS `agent-gate.sh` — aucun test SQL n'y tourne. Il
-- se lance à la main, comme ses voisins (docs/keel/TESTING.md):
--
--   docker cp supabase/tests/keel/habit_extras_check_test.sql \
--     supabase_db_Sophia_2:/tmp/t.sql \
--     && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/t.sql
--
-- Il n'écrit RIEN: tout se passe dans une transaction annulée à la fin.
-- ===========================================================================

begin;

do $$
declare
  h uuid;
  m uuid;
  refuses int := 0;
  passe    int := 0;
  cas      text;
  formes   text[] := array[
    -- ── CE QUI DOIT ÊTRE REFUSÉ ────────────────────────────────────────────
    '[{"slot":"lunch","extras":["caviar"]}]',                       -- jeton hors des cinq
    '[{"slot":"lunch","extras":"bread"}]',                          -- `extras` n''est pas un tableau
    '[{"slot":"lunch","extras":["bread","bread","bread","bread","bread","bread"]}]', -- au-delà du plafond
    '[{"slot":"lunch","extras":["bread"]},{"slot":"dinner","extras":["foie"]}]'      -- une bonne, une mauvaise
  ];
begin
  insert into public.households (name) values ('habit-extras-check-test') returning id into h;
  insert into public.household_members (household_id, first_name, role)
    values (h, 'probe', 'member') returning member_id into m;

  foreach cas in array formes loop
    begin
      insert into public.household_member_habits (member_id, household_id, slots)
        values (m, h, cas::jsonb);
      raise exception 'NON REFUSÉ, et il aurait dû l''être: %', cas;
    exception when check_violation then
      refuses := refuses + 1;
      delete from public.household_member_habits where member_id = m;
    end;
  end loop;

  -- ── CE QUI DOIT PASSER, ET C'EST LA MOITIÉ QUI COMPTE ────────────────────
  -- ⛔ LES TROIS FORMES SONT DES RÉPONSES DIFFÉRENTES, pas trois variantes:
  --   · `extras` absent  = « ce moment n''a pas été renseigné » (repli)
  --   · `extras: []`     = « renseigné, rien à côté du plat »
  --   · `extras: [...]`  = ce qui est pris à côté
  -- Une contrainte qui en refuserait une seule ferait disparaître une réponse
  -- SANS erreur nulle part — le défaut que ce lot ferme.
  foreach cas in array array[
    '[{"slot":"lunch","kind":"own_usual","usual":"une salade"}]',
    '[{"slot":"lunch","extras":[]}]',
    '[{"slot":"lunch","extras":["bread","cheese","yoghurt","fruit","dessert"]}]',
    '[{"slot":"lunch","extras":["bread"]},{"slot":"dinner","kind":"own_usual","usual":"soupe"}]',
    '[]'
  ] loop
    insert into public.household_member_habits (member_id, household_id, slots)
      values (m, h, cas::jsonb);
    passe := passe + 1;
    delete from public.household_member_habits where member_id = m;
  end loop;

  if refuses <> 4 or passe <> 5 then
    raise exception 'attendu 4 refus et 5 passages, obtenu % et %', refuses, passe;
  end if;
  raise notice 'household_member_habits_extras_check: 4 refus, 5 passages — ok';
end $$;

rollback;
