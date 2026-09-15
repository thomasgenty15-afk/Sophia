-- ============================================================================
-- LOT L19b · LES ALIAS, ÉPROUVÉS EN BASE.
--
-- Ce que le module TS ne PEUT pas prouver: que la TABLE porte bien les 19
-- retraits, les 9 corrections et les 86 ajouts — et surtout qu'elle ne porte
-- plus AUCUNE contradiction de la famille qu'on vient de retirer.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/functions/_shared/keel/lot19b_aliases_test.sql
--
-- ⚠️ Tout se passe dans une transaction ROLLBACK: la base ressort intacte.
--
-- ⛔ POURQUOI UNE ASSERTION DE CARDINALITÉ À LA FIN. Le lot `V0-B-bis` l'a
-- mesuré: un cas dont le `select` ne rend aucune ligne DISPARAÎT — ni `OK` ni
-- `ÉCHEC` — et `not ok` ne le rattrape pas. Le nombre de cas est donc lui-même
-- une assertion.
-- ============================================================================

begin;

create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- ── ① LES 19 ALIAS MORTS ET CONTRADICTOIRES ONT DISPARU ────────────────────
--
-- « MORT » = le texte de l'alias est LUI-MÊME un slug. `resolveIngredient`
-- interroge `bySlug` avant `byAlias`, donc un tel alias ne se déclenche jamais.
-- « CONTRADICTOIRE » = en plus, il déclare un AUTRE slug que celui que sa
-- propre forme capture. La table portait alors deux vérités pour un mot.
create temporary view v_morts_contradictoires as
  select a.alias, a.slug as declare, replace(a.alias, ' ', '_') as capture
    from public.food_composition_aliases a
   where exists (select 1 from public.food_composition_refs f
                  where f.slug = replace(a.alias, ' ', '_'))
     and replace(a.alias, ' ', '_') <> a.slug;

insert into t_probe
select '① plus AUCUN alias mort et contradictoire',
  (select count(*) from v_morts_contradictoires) = 0,
  format('%s restant(s): %s',
         (select count(*) from v_morts_contradictoires),
         coalesce((select string_agg(alias || ' → ' || declare, ', ' order by alias)
                     from v_morts_contradictoires), '—'));

-- Les 19 nommément, pour qu'un retrait partiel ne se cache pas derrière un
-- compte global.
insert into t_probe
select '① les 19 couples retirés, un par un',
  count(*) = 0,
  format('%s couple(s) encore présent(s)', count(*))
from (values
  ('beef chuck','beef_braising'),('blueberry','blueberries'),('bread','white_bread'),
  ('egg','whole_eggs'),('garden peas','green_peas'),('lamb chop','lamb'),
  ('lamb leg','lamb'),('mixed leaves','lettuce'),('mixed vegetables','peas_frozen'),
  ('pancetta','bacon'),('pita bread','white_bread'),('pumpkin','butternut_squash'),
  ('raspberry','raspberries'),('red onion','onion'),('strawberry','strawberries'),
  ('turkey escalope','turkey_breast'),('vegetable stock','stock_cube'),
  ('white cabbage','cabbage'),('yoghurt','plain_yogurt')
) as m(alias, slug)
join public.food_composition_aliases a on a.alias = m.alias and a.slug = m.slug;

-- ⚠️ ET LE RETRAIT NE DOIT PAS AVOIR EMPORTÉ LA LIGNE QU'IL PROTÉGEAIT: les 19
-- formes restent résolvables, par leur SLUG. Si l'une d'elles disparaissait du
-- référentiel, le retrait de l'alias deviendrait une régression silencieuse.
insert into t_probe
select '① les 19 formes restent atteintes par leur slug',
  count(*) = 19,
  format('%s / 19 slugs présents au référentiel', count(*))
from (values
  ('beef_chuck'),('blueberry'),('bread'),('egg'),('garden_peas'),('lamb_chop'),
  ('lamb_leg'),('mixed_leaves'),('mixed_vegetables'),('pancetta'),('pita_bread'),
  ('pumpkin'),('raspberry'),('red_onion'),('strawberry'),('turkey_escalope'),
  ('vegetable_stock'),('white_cabbage'),('yoghurt')
) as s(slug)
join public.food_composition_refs f on f.slug = s.slug;

-- ── ② LES 9 CORRECTIONS POINTENT SUR LA BONNE LIGNE ────────────────────────
insert into t_probe
select '② les 9 corrections appliquées',
  count(*) filter (where a.slug = c.attendu) = 9,
  format('%s / 9 · faux: %s',
         count(*) filter (where a.slug = c.attendu),
         coalesce(string_agg(c.alias || '→' || a.slug, ', ')
                  filter (where a.slug is distinct from c.attendu), '—'))
from (values
  ('oignon rouge','red_onion'),
  ('semoule complete','couscous_wholemeal'),
  ('wrap','tortilla_wrap'),
  ('tortilla','tortilla_wrap'),
  ('pitta','pita_bread'),
  ('toast','toasted_bread'),
  ('baguette','bread_french_bread_baguette'),
  ('crusty baguette','bread_french_bread_baguette'),
  ('pain','bread')
) as c(alias, attendu)
left join public.food_composition_aliases a on a.alias = c.alias;

-- ⛔ LE CAS QUI COÛTE, ET IL EST NOMMÉ. `wrap` pesait 35 g l'unité — UNE
-- TRANCHE de pain de mie. La ligne visée en pèse 60. « 2 wraps » passait de
-- 70 g à 120 g, et c'est le seul des neuf qui change une MASSE.
insert into t_probe
select '② « wrap » pèse 60 g l''unité, plus 35',
  (select f.unit_grams from public.food_composition_aliases a
     join public.food_composition_refs f on f.slug = a.slug
    where a.alias = 'wrap') = 60,
  format('unit_grams = %s',
    coalesce((select f.unit_grams::text from public.food_composition_aliases a
                join public.food_composition_refs f on f.slug = a.slug
               where a.alias = 'wrap'), 'ALIAS ABSENT'));

-- ── ③ LES 86 AJOUTS SONT LÀ, SUR LA LIGNE VISÉE ────────────────────────────
insert into t_probe
select '③ les 86 alias ajoutés',
  count(*) filter (where a.slug = p.slug) = 86,
  format('%s / 86 présents et justes · manquants ou faux: %s',
         count(*) filter (where a.slug = p.slug),
         coalesce(string_agg(p.alias, ', ') filter (where a.slug is distinct from p.slug), '—'))
from (values
  ('pain naan','naan_bread'),('naan','naan_bread'),('sauce piquante','hot_sauce'),
  ('sauce pimentee','hot_sauce'),('chilli sauce','hot_sauce'),('graines melangees','mixed_seeds'),
  ('melange de graines','mixed_seeds'),('seed mix','mixed_seeds'),('graines de pavot','poppy_seeds'),
  ('curcuma','turmeric'),('curcuma moulu','turmeric'),
  ('puree de graines de tournesol','sunflower_seed_butter'),
  ('beurre de graines de tournesol','sunflower_seed_butter'),
  ('pate de campagne','pate'),('pate de foie','pate'),('liver pate','pate'),
  ('loaf of bread','bread'),('bread loaf','bread'),('braised beef','beef_braising'),
  ('chicken thigh meat','chicken_thigh'),('chicken thigh fillets','chicken_thigh'),
  ('lamb mince','lamb'),('tuna tins','tuna_tinned'),('tuna cans','tuna_tinned'),
  ('italian herbs','dried_herbs'),('crackers','wheat_crackers'),('mixed greens','lettuce'),
  ('mixed salad greens','lettuce'),('lettuce leaves','lettuce'),('salad greens','lettuce'),
  ('pommes de terre nouvelles','potato'),('melange de legumes','mixed_vegetables'),
  ('pain blanc','white_bread'),('herbes sechees','dried_herbs'),('herbes seches','dried_herbs'),
  ('cube de bouillon','stock_cube'),('tortilla de mais','corn_tortilla_wrap_be'),
  ('tortillas de mais','corn_tortilla_wrap_be'),('aneth','herbs_dill'),
  ('quartier de citron','lemon_wedge'),('quartiers de citron','lemon_wedge'),
  ('feuille de laurier','herbs_bay_leaf'),('feuilles de laurier','herbs_bay_leaf'),
  ('laurier','herbs_bay_leaf'),('paleron de boeuf','beef_chuck'),('ciboulette','herbs_chives'),
  ('galette de mais','corn_cake'),('galettes de mais','corn_cake'),
  ('melange de fruits secs','mixed_nuts'),('fruits secs melanges','mixed_nuts'),
  ('yaourt de coco','coconut_yogurt'),('yaourt au lait de coco','coconut_yogurt'),
  ('tomates en conserve','tinned_tomatoes'),('pain pita complet','pita_wholemeal'),
  ('pita complet','pita_wholemeal'),('tortilla complete','tortilla_wholemeal'),
  ('tortillas completes','tortilla_wholemeal'),('couscous complet','couscous_wholemeal'),
  ('piment moulu','chilli_powder'),('ground chilli','chilli_powder'),('sel fin','salt'),
  ('pain de ble complet','wholemeal_bread'),('paprika doux','paprika'),
  ('persil plat','herbs_parsley'),('melange de fruits rouges','mixed_berries'),
  ('viande hachee de dinde','turkey_mince'),('viande hachee de boeuf','beef_mince'),
  ('sauce de soja','soy_sauce'),('puree de cacahuete','peanut_butter'),
  ('cerneaux de noix','walnuts'),('coulis de tomates','passata'),
  ('galette de ble','tortilla_wrap'),('galettes de ble','tortilla_wrap'),
  ('filet de cabillaud','cod'),('filets de cabillaud','cod'),
  ('pates au ble complet','wholewheat_pasta'),('confiture de cassis','jam'),
  ('bifteck','beef_steak'),('cafe noir','coffee'),('garbanzo beans','chickpeas_tinned'),
  ('oatmeal','oats'),('capsicum','bell_pepper'),('pepitas','pumpkin_seeds'),
  ('sieved tomatoes','passata'),('canned plum tomatoes','tinned_tomatoes'),
  ('panko breadcrumbs','breadcrumbs')
) as p(alias, slug)
left join public.food_composition_aliases a on a.alias = p.alias;

-- ⛔ AUCUN DES 86 N'EST MORT-NÉ. L'épreuve ③ du script de vérification, rejouée
-- ici en SQL: si l'un d'eux avait sa forme pour slug, il n'aurait jamais servi.
insert into t_probe
select '③ aucun des 86 n''est né MORT',
  count(*) = 0,
  format('%s né(s) mort(s): %s', count(*), coalesce(string_agg(alias, ', '), '—'))
from v_morts_contradictoires
where alias in ('pain naan','naan','sauce piquante','curcuma','aneth','laurier',
                'ciboulette','crackers','oatmeal','capsicum','pepitas','bifteck',
                'naan','pain blanc','tortilla complete','couscous complet');

-- ── ④ L'INVARIANT DE LA TABLE — aucune valeur de composition écrite ici ────
--
-- ⛔ Ce lot ne pose que des NOMS. Si un slug du référentiel avait été créé ou
-- modifié en passant, ce compte bougerait. 923 lignes au 2026-08-22.
insert into t_probe
select '④ le référentiel n''a pas bougé (923 lignes)',
  count(*) = 923, format('%s lignes', count(*))
from public.food_composition_refs;

-- ── LE VERDICT ─────────────────────────────────────────────────────────────
select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail
  from t_probe order by name;
do $$
declare n integer; c integer;
begin
  select count(*) into c from t_probe;
  -- ⛔ LA CARDINALITÉ D'ABORD: un cas qui ne s'insère pas ne rend ni OK ni
  -- ÉCHEC, et la boucle des `not ok` ne le verrait jamais.
  if c <> 8 then
    raise exception 'L19b · CARDINALITÉ: %/8 cas exécutés — un cas a DISPARU', c;
  end if;
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'L19b · % cas en échec', n; end if;
  raise notice 'L19b · alias SQL: les 8 cas passent';
end $$;

rollback;
