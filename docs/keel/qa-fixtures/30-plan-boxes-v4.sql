-- ═══════════════════════════════════════════════════════════════════════════
-- FIXTURE QA — UN PLAN FOYER AVEC DES CONTENANTS v4 (2026-08-20)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ POURQUOI ELLE EXISTE. Mesuré le 2026-08-20: AUCUN plan de la base locale
-- ne porte `dish.boxes` — ni même `dish.box` (v2). 0 plat sur 180 plans; les 218
-- boîtes existantes sont encore en v1, sous `preparations[].boxes`, et
-- `generated_from.boxes` est NULL partout. Le Boxing est donc invisible sur TOUT
-- écran, et le lot front n'est pas regardable sans une ligne écrite à la main.
-- Elle devient inutile le jour où le moteur écrit `boxes[]` lui-même (lot 2).
--
-- ⛔ ELLE N'ÉCRASE RIEN. Elle INSÈRE une ligne neuve, d'identifiant fixe, copiée
-- du plan vivant du persona. Le seul champ qu'elle touche sur l'existant est
-- `retired_at`, parce que la contrainte d'exclusion
-- `student_generated_meals_live_windows_dont_overlap` interdit deux fenêtres
-- vivantes qui se recouvrent. Le ROLLBACK en bas rend l'état d'avant.
--
-- ⛔ AUCUNE MIGRATION, AUCUN CHANGEMENT DE SCHÉMA. Des données, et rien d'autre.
--
-- ══ ELLE DÉRIVE LES GROUPES, ELLE NE LES ÉCRIT PAS ═════════════════════════
-- Première rédaction: les `member_ids` étaient des UUID collés à la main. Deux
-- défauts, et le second est le vrai:
--   ① elle ne servait qu'à UN foyer, alors que le persona déjà connecté sur le
--      profil du navigateur en est un autre — et « changer de compte » n'est pas
--      un geste à faire pour regarder un écran;
--   ② surtout, elle ne DÉMONTRAIT rien. La règle du produit est que les groupes
--      se DÉRIVENT (`{ chaque bouche à objectif, seule } ∪ { le reste }`); une
--      fixture qui les recopie à la main peut être verte sur une règle fausse.
-- Ici les groupes sortent de `household_members.goal`. Elle marche donc sur
-- n'importe quel foyer, et elle se trompe exactement là où le produit se
-- tromperait.
--
-- ── CE QU'ELLE MET À L'ÉCRAN, ET QU'IL FAUT ALLER VOIR ────────────────────
--   · un contenant par bouche à objectif + un pour le reste, sur CHAQUE repas
--     qui puise dans une casserole;
--   · les plats cuisinés de zéro (les petits-déjeuners) n'ont AUCUN contenant,
--     et l'écran doit se taire — pas de bloc vide;
--   · sur le DERNIER repas mis en boîte, une bouche du groupe commun est
--     absente: le couvercle porte un nom de moins et `· pour n-1`. C'est la
--     présence qui décide, pas le roster;
--   · le dernier composant de chaque contenant a `preparation_id: null` —
--     ajouté frais le jour même, hors du contrôle de fournée.
--
-- ── LES GRAMMES SONT SYNTHÉTIQUES, ET ILS LE DISENT ───────────────────────
-- 150 g par composant dans un contenant à objectif; 130 g × le nombre de
-- bouches dans le bac commun. Ce ne sont PAS des recommandations: ce sont deux
-- ordres de grandeur choisis pour que la distinction se VOIE à l'écran — un
-- petit nombre qui vise une personne, un grand nombre qui décrit un bac.
--
-- ── COMMENT LA POSER ──────────────────────────────────────────────────────
--   docker cp docs/keel/qa-fixtures/30-plan-boxes-v4.sql supabase_db_Sophia_2:/tmp/f.sql \
--     && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--          -v qa_email=qa0805.f1b.s1@keeltest.dev -f /tmp/f.sql
--
-- `-v qa_email=...` est optionnel; sans lui, elle vise `qa1v.foyer@keeltest.dev`.
-- Rejouable autant de fois qu'on veut: elle commence par se retirer elle-même.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\if :{?qa_email}
\else
  \set qa_email 'qa1v.foyer@keeltest.dev'
\endif

begin;

-- ── ① LA FIXTURE SE RETIRE ELLE-MÊME AVANT DE SE REPOSER ──────────────────
-- Sans ça, un second passage buterait sur sa propre fenêtre.
delete from student_generated_meals
where id = '00000000-0b0c-4f04-8000-000000000004';

-- ── ② LE PLAN VIVANT DU PERSONA, MIS DE CÔTÉ ──────────────────────────────
-- ⚠️ CHOISI PAR REQUÊTE, PAS PAR UUID EN DUR: le plan vivant change dès que
-- quelqu'un régénère, et une fixture qui pointe un uuid mort rendrait « 0 ligne »
-- sans lever — c'est-à-dire un vert qui ne prouve rien. Le `raise` plus bas est
-- ce qui transforme ce silence en rouge.
create temporary table _src on commit drop as
select m.*
from student_generated_meals m
join auth.users u on u.id = m.user_id
where u.email = :'qa_email'
  and m.plan_kind = 'household'
  and m.retired_at is null
order by m.starts_on desc, m.created_at desc
limit 1;

do $$
begin
  if (select count(*) from _src) <> 1 then
    raise exception
      'FIXTURE: aucun plan foyer vivant pour ce persona — rien à copier. '
      'Génère-lui un plan avant de rejouer cette fixture.';
  end if;
end $$;

-- ── ③ LES DEUX GROUPES, DÉRIVÉS DE `household_members.goal` ───────────────
-- ⛔ C'EST LA RÈGLE DU PRODUIT, PAS UNE COMMODITÉ DE FIXTURE: un objectif de
-- poids ouvre un contenant à soi; `maintenance` et l'absence d'objectif n'en
-- ouvrent aucun, et leurs porteurs partagent un bac.
create temporary table _mouths on commit drop as
select hm.member_id,
       hm.first_name,
       -- ⛔ `coalesce`, ET IL N'EST PAS COSMÉTIQUE. `NULL in ('fat_loss', …)`
       -- vaut NULL, pas `false` — donc `where not has_goal` écartait AUSSI les
       -- bouches sans objectif, c'est-à-dire précisément celles qui forment le
       -- bac commun. Mesuré le 2026-08-20: le foyer Livia/Sacha/Tino rendait
       -- « 0 bouche sans objectif » et la fixture levait. Sans le garde-fou
       -- juste en dessous, elle aurait écrit un bac commun VIDE en silence.
       (coalesce(hm.goal, '') in ('fat_loss', 'muscle_gain')) as has_goal,
       row_number() over (order by hm.first_name) as rank
from household_members hm
where hm.household_id = (
  select household_id from household_members
  where user_id = (select user_id from _src) limit 1
);

do $$
begin
  if (select count(*) from _mouths where has_goal) = 0 then
    raise exception
      'FIXTURE: ce foyer n''a AUCUNE bouche à objectif — la fixture ne '
      'montrerait qu''un seul groupe, donc rien de ce que le lot ajoute.';
  end if;
  if (select count(*) from _mouths where not has_goal) < 2 then
    raise exception
      'FIXTURE: il faut au moins DEUX bouches sans objectif pour qu''un bac '
      'commun ait un sens, et pour que le retrait de présence se voie.';
  end if;
end $$;

-- ── ④ LES REPAS QUI PUISENT DANS UNE CASSEROLE ────────────────────────────
-- Un plat cuisiné de zéro n'a pas de contenant, et son absence ici EST
-- l'information — l'écran doit se taire dessus.
create temporary table _boxed on commit drop as
select t.ord - 1 as idx,
       row_number() over (order by t.ord) as nth,
       count(*) over () as total
from _src s, jsonb_array_elements(s.dishes) with ordinality t(d, ord)
where jsonb_array_length(coalesce(t.d->'uses', '[]'::jsonb)) > 0;

-- Les composants d'un repas: une ligne par casserole où il prélève, plus un
-- ajout frais du jour.
create temporary table _items on commit drop as
select b.idx,
       u->>'preparation_id' as prep_id,
       coalesce(
         (select p->>'title' from _src s2, jsonb_array_elements(s2.preparations) p
          where p->>'id' = u->>'preparation_id'),
         u->>'preparation_id'
       ) as term
from _boxed b, _src s, jsonb_array_elements(s.dishes) with ordinality t(d, ord), jsonb_array_elements(t.d->'uses') u
where t.ord - 1 = b.idx;

-- ── ⑤ LES CONTENANTS ──────────────────────────────────────────────────────
create temporary table _dishboxes on commit drop as
with common_size as (
  -- ⚠️ SUR LE DERNIER REPAS, UNE BOUCHE DU GROUPE COMMUN N'EST PAS LÀ. C'est
  -- ce qui prouve à l'écran que le couvercle suit la PRÉSENCE et non le roster.
  select b.idx,
         (select count(*) from _mouths where not has_goal)
           - case when b.nth = b.total then 1 else 0 end as n
  from _boxed b
),
own_boxes as (
  select b.idx,
         jsonb_build_object(
           'id', 'box_' || b.idx || '_' || lower(m.first_name),
           'member_ids', jsonb_build_array(m.member_id),
           'items', (
             select jsonb_agg(jsonb_build_object(
               'preparation_id', i.prep_id, 'term', i.term, 'grams', 150))
             from _items i where i.idx = b.idx
           ) || jsonb_build_array(jsonb_build_object(
             'preparation_id', null, 'term', 'sourdough bread', 'grams', 60))
         ) as box,
         m.rank as ord
  from _boxed b, _mouths m
  where m.has_goal
),
common_boxes as (
  select b.idx,
         jsonb_build_object(
           'id', 'box_' || b.idx || '_rest',
           'member_ids', (
             select jsonb_agg(m.member_id order by m.first_name)
             from (select * from _mouths where not has_goal
                   order by first_name limit (select n from common_size where idx = b.idx)) m
           ),
           'items', (
             select jsonb_agg(jsonb_build_object(
               'preparation_id', i.prep_id, 'term', i.term,
               'grams', 130 * (select n from common_size where idx = b.idx)))
             from _items i where i.idx = b.idx
           ) || jsonb_build_array(jsonb_build_object(
             'preparation_id', null, 'term', 'sourdough bread',
             'grams', 55 * (select n from common_size where idx = b.idx)))
         ) as box,
         999 as ord
  from _boxed b
)
select idx, jsonb_agg(box order by ord) as boxes
from (select * from own_boxes union all select * from common_boxes) all_boxes
group by idx;

-- ── ⑥ LA FENÊTRE D'ORIGINE PASSE EN RETRAITE ──────────────────────────────
-- Le seul geste sur une ligne existante, et il est annulé par le ROLLBACK.
update student_generated_meals
set retired_at = now()
where id in (select id from _src);

-- ── ⑦ LA LIGNE NEUVE ──────────────────────────────────────────────────────
insert into student_generated_meals (
  id, user_id, scope, mode, servings, pantry, dishes, shopping_list,
  generated_from, content_locale, preparations, cooking_sessions,
  starts_on, duration_days, member_portions, plan_kind
)
select
  '00000000-0b0c-4f04-8000-000000000004',
  s.user_id, s.scope, s.mode, s.servings, s.pantry,
  (
    select jsonb_agg(
      case when db.boxes is null then d else d || jsonb_build_object('boxes', db.boxes) end
      order by t.ord
    )
    from jsonb_array_elements(s.dishes) with ordinality t(d, ord)
    left join _dishboxes db on db.idx = t.ord - 1
  ),
  s.shopping_list,
  -- ⚠️ LE COMPTEUR EST DÉJÀ LÀ PARCE QU'IL SERA DANS LE MOTEUR. Sans lui, zéro
  -- contenant est indiscernable de « personne n'a d'objectif ».
  s.generated_from || jsonb_build_object(
    'boxes', jsonb_build_object(
      'rendered', (select coalesce(sum(jsonb_array_length(boxes)), 0) from _dishboxes),
      'expected', (select coalesce(sum(jsonb_array_length(boxes)), 0) from _dishboxes),
      'source', 'qa-fixture-v4'
    ),
    -- ⚠️ L'UUID DE LA LIGNE QUE ⑥ A RETIRÉE, GARDÉ SUR LA FIXTURE ELLE-MÊME.
    -- Sans lui, le ROLLBACK ne sait pas QUELLE ligne réveiller — et un persona
    -- porte des dizaines de plans retirés de longue date qu'il ne faut surtout
    -- pas réveiller ensemble (la contrainte d'exclusion sauterait).
    'qa_replaced_plan_id', s.id
  ),
  s.content_locale, s.preparations, s.cooking_sessions,
  s.starts_on, s.duration_days, s.member_portions, s.plan_kind
from _src s;

commit;

-- ── CE QU'ON DOIT LIRE APRÈS ──────────────────────────────────────────────
select
  u.email,
  (select count(*) from jsonb_array_elements(m.dishes) d, jsonb_array_elements(d->'boxes') b)
    as contenants,
  (select count(*) from jsonb_array_elements(m.dishes) d where not (d ? 'boxes'))
    as plats_sans_contenant,
  m.generated_from->'boxes' as compteur,
  (select count(*) from student_generated_meals x
   where x.user_id = m.user_id and x.retired_at is null) as fenetres_vivantes
from student_generated_meals m
join auth.users u on u.id = m.user_id
where m.id = '00000000-0b0c-4f04-8000-000000000004';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — la ligne à réveiller est nommée par la fixture elle-même.
-- ═══════════════════════════════════════════════════════════════════════════
--   begin;
--   create temporary table _r on commit drop as
--     select (generated_from->>'qa_replaced_plan_id')::uuid as id
--     from student_generated_meals
--     where id = '00000000-0b0c-4f04-8000-000000000004';
--   delete from student_generated_meals
--    where id = '00000000-0b0c-4f04-8000-000000000004';
--   update student_generated_meals set retired_at = null
--    where id in (select id from _r);
--   commit;
--
-- ⛔ L'ORDRE EST CELUI-LÀ ET PAS L'AUTRE, ET C'EST MESURÉ (2026-08-20). Écrit
-- « réveiller puis supprimer », il lève:
--     duplicate key value violates unique constraint
--     "student_generated_meals_one_live_start_idx"
-- Il y a DEUX gardes sur cette table, pas une: l'exclusion sur les fenêtres qui
-- se recouvrent, ET cet index unique sur `(user_id, plan_kind, starts_on)` des
-- lignes vivantes. Réveiller la ligne d'origine pendant que la fixture occupe
-- encore le même `starts_on` viole le second. D'où le passage par `_r`: on
-- retient l'uuid, on libère la place, puis on réveille.
