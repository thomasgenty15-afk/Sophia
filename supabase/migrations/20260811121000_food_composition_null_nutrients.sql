-- LES NUTRIMENTS MANQUANTS — pourquoi le verdict protéique ne se prononçait
-- JAMAIS.
--
-- ── LE DÉFAUT MESURÉ (run réel, 2026-08-11) ────────────────────────────────
-- `meal_verdict.ts` rendait `protein: "not_computable"` sur TOUS les plans
-- testés, alors que la protéine est la grandeur du rang 2 — celle qu'aucune
-- doctrine n'a le droit d'éteindre. La grandeur à la preuve la plus forte du
-- corpus était donc la seule à ne rien dire.
--
-- La cause est en une ligne de `verdictFor`:
--
--     proteinTotal = n.proteinG === null ? null : proteinTotal + n.proteinG
--
-- UN SEUL ingrédient à protéine inconnue rend tout le plan incalculable. Et
-- `lemon` avait `protein_g = null`. Un citron dans une vinaigrette suffisait
-- donc à faire taire le plancher protéique de la semaine entière.
--
-- ── POURQUOI ON NE TOUCHE PAS À LA RÈGLE ───────────────────────────────────
-- « L'inconnu se propage, il ne devient pas zéro » est juste, et c'est ce qui
-- empêche un plan à moitié résolu de passer pour un plan léger. On ne
-- l'affaiblit pas: **on retire les inconnues.**
--
-- Et ce ne sont pas de vraies inconnues. Ce sont des trous d'extraction: la
-- protéine d'un citron, le gras d'une carotte et les fibres d'un filet de
-- cabillaud sont connus, proches de zéro, et documentés partout. Les laisser
-- à `null` faisait dire au moteur « je ne sais pas » là où il aurait dû dire
-- « c'est négligeable » — deux affirmations très différentes.
--
-- ── CE QUE ÇA RÉPARE EN PLUS ───────────────────────────────────────────────
-- Le gras nul sur dix-huit fruits et légumes faussait aussi la densité
-- énergétique, donc le plafond de densité de `fat_loss`.
--
-- ── RÉ-APPLICABLE ──────────────────────────────────────────────────────────
-- Chaque `update` est gardé par `where ... is null`: un second passage ne
-- réécrit rien.

begin;

-- ── PROTÉINES ──────────────────────────────────────────────────────────────
update public.food_composition_refs set protein_g = 0.1 where slug = 'coffee'        and protein_g is null;
update public.food_composition_refs set protein_g = 0.4 where slug = 'lemon'         and protein_g is null;
update public.food_composition_refs set protein_g = 0   where slug = 'olive_oil'     and protein_g is null;
update public.food_composition_refs set protein_g = 0.5 where slug = 'pineapple'     and protein_g is null;
update public.food_composition_refs set protein_g = 0   where slug = 'sunflower_oil' and protein_g is null;

-- ── GRAS — fruits et légumes, tous entre 0,1 et 0,5 g/100 g ───────────────
update public.food_composition_refs set fat_g = 0.3 where slug = 'banana'       and fat_g is null;
update public.food_composition_refs set fat_g = 0.3 where slug = 'bell_pepper'  and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'carrot'       and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'celery'       and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'clementine'   and fat_g is null;
update public.food_composition_refs set fat_g = 0.1 where slug = 'cucumber'     and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'fennel'       and fat_g is null;
update public.food_composition_refs set fat_g = 0.5 where slug = 'garlic'       and fat_g is null;
update public.food_composition_refs set fat_g = 0.3 where slug = 'lemon'        and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'lime'         and fat_g is null;
update public.food_composition_refs set fat_g = 0.4 where slug = 'mango'        and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'orange'       and fat_g is null;
update public.food_composition_refs set fat_g = 0.1 where slug = 'peach'        and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'pineapple'    and fat_g is null;
update public.food_composition_refs set fat_g = 0.1 where slug = 'radish'       and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'red_cabbage'  and fat_g is null;
update public.food_composition_refs set fat_g = 0.4 where slug = 'strawberries' and fat_g is null;
update public.food_composition_refs set fat_g = 0.2 where slug = 'swiss_chard'  and fat_g is null;

-- ── FIBRES — zéro pour tout ce qui vient de l'animal, valeur connue sinon ──
update public.food_composition_refs set fiber_g = 0   where slug in
  ('anchovy','cod','salmon','smoked_salmon','greek_yogurt','single_cream','coffee')
  and fiber_g is null;
update public.food_composition_refs set fiber_g = 2.8 where slug = 'lemon'   and fiber_g is null;
update public.food_composition_refs set fiber_g = 3.3 where slug = 'mustard' and fiber_g is null;
update public.food_composition_refs set fiber_g = 1.2 where slug = 'tofu'    and fiber_g is null;

-- ── GLUCIDES ───────────────────────────────────────────────────────────────
update public.food_composition_refs set carbs_g = 0 where slug = 'anchovy' and carbs_g is null;

-- ===========================================================================
-- LA PREUVE — plus aucune inconnue, et l'énergie n'a pas bougé
-- ===========================================================================

do $$
declare
  n_prot int;
  n_fat int;
  n_fib int;
  n_carb int;
begin
  select count(*) into n_prot from public.food_composition_refs where protein_g is null;
  select count(*) into n_fat  from public.food_composition_refs where fat_g     is null;
  select count(*) into n_fib  from public.food_composition_refs where fiber_g   is null;
  select count(*) into n_carb from public.food_composition_refs where carbs_g   is null;

  -- LA PROTÉINE EST LA SEULE DONT L'ABSENCE FAIT TAIRE UNE GRANDEUR DE RANG 2.
  -- Les autres sont réparées par confort de précision; celle-ci est réparée
  -- parce qu'un seul trou suffisait à désarmer le plancher protéique.
  if n_prot > 0 then
    raise exception 'il reste % aliments sans protéine — le plancher protéique restera muet', n_prot;
  end if;
  if n_fat > 0 or n_fib > 0 or n_carb > 0 then
    raise exception 'nuls restants — gras: %, fibres: %, glucides: %', n_fat, n_fib, n_carb;
  end if;

  -- Aucune énergie n'a été touchée: cette migration ne corrige que des
  -- absences, elle ne révise aucune valeur existante.
  if exists (select 1 from public.food_composition_refs where energy_kcal is null) then
    raise exception 'une énergie est devenue nulle — la migration a débordé';
  end if;
end;
$$;

commit;
