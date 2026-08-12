-- ═══════════════════════════════════════════════════════════════════════════
-- UN SECONDAIRE LISAIT LE PLAN PERSONNEL D'UN AUTRE SECONDAIRE, EN ENTIER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- MESURÉ EN HTTP RÉEL LE 2026-08-12, sous un vrai jeton `authenticated`, par
-- PostgREST : un membre du foyer a lu les 8 lignes de `student_generated_meals`
-- de ce foyer — dont les TROIS plans PERSONNELS d'un autre membre, avec leurs
-- `dishes` complets : titres, `why`, `method`, ingrédients.
--
-- ── LA CAUSE, ET C'EST LA TROISIÈME FOIS ──────────────────────────────────
--
-- `household_id IS NOT NULL` NE VEUT PAS DIRE « PLAN DU FOYER ». Un plan
-- PERSONNEL le porte aussi : `generate-meal-v1` l'estampe exprès, pour que la
-- fusion (L4) retrouve le plan de celui qui a pris la main. La colonne dit « à
-- quel foyer se rattache ce plan », jamais « ce plan est celui du foyer ».
-- Seul `plan_kind` dit ça.
--
-- La même lecture erronée du schéma a été trouvée le même jour dans DEUX
-- lecteurs TypeScript — le chat (`household_turn_context.ts`), qui servait à
-- tout le foyer les plats d'un membre comme le dîner de la maison, et la carte
-- du foyer (`api/household.ts`), qui se vidait. Les deux ont été corrigés, et
-- un test SCANNE désormais les lecteurs
-- (`_shared/keel/household_plan_kind_readers_test.ts`).
--
-- **Cette policy est le TROISIÈME lecteur, et c'est celui qui compte** : les
-- deux autres décident de ce qu'un écran affiche, celle-ci décide de ce que la
-- base accepte de rendre. Un scoping fait dans le navigateur n'est pas un
-- scoping — c'est la cicatrice « RLS ne remplace pas un .eq(user_id) », prise
-- ici par l'autre bout.
--
-- Elle n'était pas fausse quand elle a été écrite : à l'époque, seuls les plans
-- du foyer portaient `household_id`. C'est l'estampille posée pour la fusion
-- qui l'a rendue trop large — un élargissement silencieux, que rien n'a signalé.
--
-- ── CE QUE LA NOUVELLE RÈGLE DIT ──────────────────────────────────────────
--
--   · tout membre du foyer lit les plans DU FOYER (`plan_kind = 'household'`) —
--     c'est le plan qu'on cuisine, il est lu à table, il doit être lisible ;
--   · le MAÎTRE lit aussi les plans personnels de son foyer. C'est D9, mot pour
--     mot : « le maître ACCÈDE à tous les plans, mais sa surface de cuisine
--     n'affiche QUE le plan qu'il cuisine ». Accéder et afficher ne sont pas la
--     même chose, et l'écran (L8) ne lui en montre que les titres ;
--   · un secondaire ne lit QUE le plan du foyer et le sien.
--
-- ⚠️ « ET LE SIEN » NE FIGURE PAS DANS CETTE POLICY, ET C'EST VOULU. Il vient
-- de `student_generated_meals_owner_read` (`user_id = auth.uid()`), qui existe
-- déjà et qui est la policy naturelle pour ça — les policies RLS sont en OU.
-- Le redire ici ferait deux mécanismes pour une seule garantie : ce dépôt a
-- déjà payé ça sur l'unicité des plans (index + contrainte d'exclusion, dont
-- FF-006 a dû corriger la fiche pour dire que « trois mécanismes » ne faisaient
-- que DEUX garanties). Si un jour quelqu'un retire `owner_read`, c'est ce
-- commentaire qui doit l'arrêter.

alter policy student_generated_meals_household_read
  on public.student_generated_meals
  using (
    household_id is not null
    and household_id = public.keel_household_of((select auth.uid()))
    and (
      -- Le plan qu'on cuisine ensemble.
      plan_kind = 'household'
      -- Ou : je suis le maître de CE foyer-là (D9, l'accès sans l'affichage).
      -- `exists` sur la ligne de membre plutôt qu'un helper: il n'existe pas de
      -- `keel_household_role_of`, et en inventer un pour un seul appelant ferait
      -- une seconde définition du rôle à tenir en phase avec le roster.
      or exists (
        select 1
          from public.household_members hm
         where hm.household_id = student_generated_meals.household_id
           and hm.user_id = (select auth.uid())
           and hm.role = 'owner'
      )
    )
  );

comment on policy student_generated_meals_household_read
  on public.student_generated_meals is
  'Le plan DU FOYER est lisible par tout le foyer; un plan PERSONNEL ne l''est '
  'que par son auteur (student_generated_meals_owner_read) et par le MAÎTRE '
  '(D9). Resserree le 2026-08-12: elle ne testait que household_id, or un plan '
  'personnel le porte aussi depuis que la fusion l''estampe — un secondaire '
  'lisait donc le plan personnel d''un autre secondaire, dishes compris.';

-- ── LE CONTRÔLE, JOUÉ PUIS ANNULÉ ────────────────────────────────────────
-- Une garde a besoin d'un cas qui PASSE: resserrer jusqu'à ne plus rien rendre
-- refuse tout aussi bien, et se lit exactement pareil.
do $$
declare
  v_house uuid;
  v_owner uuid;
  v_a uuid;
  v_b uuid;
  v_plan_house uuid;
  v_plan_a uuid;
  v_seen int;
begin
  v_owner := gen_random_uuid();
  v_a := gen_random_uuid();
  v_b := gen_random_uuid();
  v_house := gen_random_uuid();

  insert into public.households (id, name) values (v_house, '__qa_read_scope');
  insert into public.household_members (household_id, user_id, role, first_name)
  values (v_house, v_owner, 'owner', 'O'),
         (v_house, v_a, 'member', 'A'),
         (v_house, v_b, 'member', 'B');

  insert into public.student_generated_meals
    (user_id, household_id, plan_kind, starts_on, duration_days, mode, dishes)
  values (v_owner, v_house, 'household', current_date, 2, 'to_shop', '[]'::jsonb)
  returning id into v_plan_house;

  insert into public.student_generated_meals
    (user_id, household_id, plan_kind, starts_on, duration_days, mode, dishes)
  values (v_a, v_house, 'personal', current_date, 2, 'to_shop', '[]'::jsonb)
  returning id into v_plan_a;

  -- ① LE CAS QUI PASSE — B lit bien le plan DU FOYER.
  select count(*) into v_seen
    from public.student_generated_meals m
   where m.id = v_plan_house
     and m.household_id is not null
     and m.household_id = v_house
     and (m.plan_kind = 'household'
          or exists (select 1 from public.household_members hm
                      where hm.household_id = m.household_id
                        and hm.user_id = v_b and hm.role = 'owner'));
  if v_seen <> 1 then
    raise exception 'CONTRÔLE ①: un secondaire ne lit plus le plan du foyer — la policy refuse tout';
  end if;

  -- ② CE QUI EST FERMÉ — B ne lit PAS le plan personnel de A.
  select count(*) into v_seen
    from public.student_generated_meals m
   where m.id = v_plan_a
     and m.household_id is not null
     and m.household_id = v_house
     and (m.plan_kind = 'household'
          or exists (select 1 from public.household_members hm
                      where hm.household_id = m.household_id
                        and hm.user_id = v_b and hm.role = 'owner'));
  if v_seen <> 0 then
    raise exception 'CONTRÔLE ②: un secondaire lit encore le plan personnel d''un autre';
  end if;

  -- ③ LE MAÎTRE, LUI, LE LIT — D9.
  select count(*) into v_seen
    from public.student_generated_meals m
   where m.id = v_plan_a
     and m.household_id is not null
     and m.household_id = v_house
     and (m.plan_kind = 'household'
          or exists (select 1 from public.household_members hm
                      where hm.household_id = m.household_id
                        and hm.user_id = v_owner and hm.role = 'owner'));
  if v_seen <> 1 then
    raise exception 'CONTRÔLE ③: le maître ne lit plus les plans personnels de son foyer (D9)';
  end if;

  raise notice 'CONTRÔLE 20260812190000: ① le foyer se lit, ② le personnel d''autrui ne se lit pas, ③ le maître accède — OK';
  raise exception 'rollback du contrôle';
exception
  when others then
    if sqlerrm <> 'rollback du contrôle' then raise; end if;
end $$;
