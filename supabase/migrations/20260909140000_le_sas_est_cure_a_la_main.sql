-- ══════════════════════════════════════════════════════════════════════════
-- LE SAS EST CURÉ À LA MAIN, ET IL GAGNE UN REFUS (2026-09-09)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Revue: `scripts/keel_sas_revue_20260909.ts`
-- Patron: `20260824093000_le_sas_curate_les_formes_que_le_produit_ecrit_vraiment.sql`
--
-- ── CE QUI A CHANGÉ SOUS CETTE FILE LE MÊME JOUR ─────────────────────────
-- `meal-energy-v1` RELIT désormais le sas pour les termes du plan qu'il rend
-- (`indexForReading`). Avant, un plan était composé sur l'index augmenté et
-- relu sur l'index nu: `emmental râpé` valait 353 kcal/100 g à la génération
-- et « un ingrédient ne figure pas dans notre table » à l'écran, sur le même
-- plan. 79 plans sur 116 portaient au moins un terme inconnu.
--
-- ⚠️ ET ÇA CHANGE CE QUE COÛTE UNE LIGNE FAUSSE. Avant, elle coûtait une
-- ABSTENTION. Maintenant elle entre dans le chiffre affiché. Mesuré sur la
-- file ce jour-là — 119 lignes `model` sont dans ce cas, portant 1 230 kcal
-- dans les plans vivants.
--
-- ── ⛔ POURQUOI IL FAUT UN REFUS, ET POURQUOI AUCUNE GARDE NE LE REMPLACE ─
--
--     fromage rape | cruciferous_veg | 28 kcal/100 g | vu 4 fois
--
-- Du fromage râpé rangé chez les crucifères. Cette ligne passe TOUT: la bande
-- de son groupe (celui qu'elle s'est choisi), le plafond absolu de 902, et
-- même la cohérence d'Atwater (2×4 + 4×4 + 0,4×9 ≈ 28). Elle est cohérente;
-- elle décrit simplement un AUTRE ALIMENT. C'est une erreur de sens, et
-- aucune règle automatique ne l'attrape — le seuil de trois apparitions compte
-- la répétition du modèle, pas sa justesse, et l'aurait promue.
--
-- `needs_review` ne suffisait pas: une ligne en revue reste lue par
-- `indexForReading`, et c'est VOULU (elle a servi au plan qui la cite). Il
-- manquait un statut qui retire une ligne des DEUX chemins. C'est `rejected`.
--
-- ── ⛔ CE QU'ON NE FAIT PAS: BRANCHER LE CRON ────────────────────────────
-- La décision du `20260824093000` tient, et cette migration en est la preuve
-- par l'exemple: sur les 29 lignes que la promotion automatique déclarait
-- prêtes, **7 sont fausses**. Un cron les aurait fait entrer dans le
-- référentiel, définitivement, pour tout le monde.

-- ---------------------------------------------------------------------------
-- ① LE REFUS — un statut de plus, et un seul
-- ---------------------------------------------------------------------------

alter table public.food_composition_pending
  drop constraint if exists food_composition_pending_status_check;

alter table public.food_composition_pending
  add constraint food_composition_pending_status_check
  check (status in ('pending', 'promoted', 'needs_review', 'rejected'));

comment on column public.food_composition_pending.status is
  'pending = en file · needs_review = une garde a mordu, la ligne SERT ENCORE '
  'les plans qui la citent · promoted = elle vit dans food_composition_refs · '
  'rejected = une lecture humaine l''a jugee FAUSSE: ni promue, ni relue par '
  'indexForReading. Le seul statut qui retire une valeur des chiffres affiches.';

-- ---------------------------------------------------------------------------
-- ② LA PROMOTION ACCEPTE UNE LISTE NOMMÉE
-- ---------------------------------------------------------------------------
--
-- ⛔ CE QUE `p_terms` LÈVE, ET CE QU'IL NE LÈVE PAS. Il lève la RÉPÉTITION, et
-- rien d'autre: les bandes, le plafond, `slug_taken` et `alias_exists` mordent
-- exactement pareil. Le seuil de trois est un proxy de fiabilité — « le modèle
-- a redit la même chose trois fois » — et une lecture humaine est une meilleure
-- preuve que trois répétitions du même tirage à température 0. Elle ne rend pas
-- pour autant les bandes inutiles: une valeur qu'un humain a mal lue reste
-- arrêtée par la bande de son groupe.
--
-- ⚠️ L'ANCIENNE SIGNATURE EST DÉPOSÉE, PAS SURCHARGÉE. Deux fonctions dont
-- l'une a un paramètre par défaut rendent `f(3, true)` AMBIGU, et Postgres
-- refuse l'appel — les tests SQL du lot 18 l'appellent comme ça.

drop function if exists public.promote_pending_food_compositions(integer, boolean);

create or replace function public.promote_pending_food_compositions(
  p_min_sightings integer default 3,
  p_dry_run boolean default false,
  p_terms text[] default null
)
returns table (term text, outcome text, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_slug text;
  v_outcome text;
  v_reason text;
  c_dense_kcal constant numeric := 250;
begin
  for r in
    select p.*, b.refs, b.energy_low, b.energy_high,
           b.protein_low, b.protein_high, b.carbs_low, b.carbs_high,
           b.fat_low, b.fat_high
    from public.food_composition_pending p
    left join public.food_composition_group_bands b
      on b.food_group_ref = p.food_group_ref
    where p.status = 'pending'
      -- ⛔ LA LISTE NOMMÉE LÈVE LE SEUIL, ET ELLE SEULE. Hors liste, la règle
      -- des trois est intacte.
      and (
        (p_terms is null and p.sightings >= greatest(1, p_min_sightings))
        or (p_terms is not null and p.term = any (p_terms))
      )
    order by p.sightings desc, p.term
  loop
    v_slug := replace(btrim(r.term), ' ', '_');
    v_outcome := null;
    v_reason := null;

    if r.fill_source <> 'model' then
      v_outcome := 'skipped'; v_reason := 'group_bounds_never_promoted';
    elsif exists (select 1 from public.food_composition_refs f where f.slug = v_slug) then
      v_outcome := 'needs_review'; v_reason := 'slug_taken';
    elsif exists (select 1 from public.food_composition_aliases a where a.alias = r.term) then
      v_outcome := 'needs_review'; v_reason := 'alias_exists';
    elsif r.food_group_ref is null or r.refs is null or r.refs < 3 then
      v_outcome := 'needs_review'; v_reason := 'no_band';
    elsif r.energy_kcal < r.energy_low or r.energy_kcal > r.energy_high then
      v_outcome := 'needs_review';
      v_reason := format('energy_out_of_band:%s not in [%s,%s]',
                         round(r.energy_kcal, 1), round(r.energy_low, 1), round(r.energy_high, 1));
    elsif r.protein_g is not null and r.protein_low is not null
          and (r.protein_g < r.protein_low or r.protein_g > r.protein_high) then
      v_outcome := 'needs_review'; v_reason := 'protein_out_of_band';
    elsif r.carbs_g is not null and r.carbs_low is not null
          and (r.carbs_g < r.carbs_low or r.carbs_g > r.carbs_high) then
      v_outcome := 'needs_review'; v_reason := 'carbs_out_of_band';
    elsif r.fat_g is not null and r.fat_low is not null
          and (r.fat_g < r.fat_low or r.fat_g > r.fat_high) then
      v_outcome := 'needs_review'; v_reason := 'fat_out_of_band';
    else
      v_outcome := 'promoted'; v_reason := null;
    end if;

    if not p_dry_run then
      if v_outcome = 'promoted' then
        insert into public.food_composition_refs (
          slug, food_group_ref, label, source,
          energy_kcal, protein_g, carbs_g, fat_g, fiber_g,
          yield_class, atwater_discount, energy_dense,
          unit_grams, condiment_grams
        ) values (
          v_slug, r.food_group_ref, left(r.label, 80), 'sas',
          r.energy_kcal, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g,
          r.yield_class, 1.0, r.energy_kcal >= c_dense_kcal,
          null, null
        );
        update public.food_composition_pending
          set status = 'promoted', promoted_at = now(), review_reason = null
          where public.food_composition_pending.term = r.term;
      elsif v_outcome = 'needs_review' then
        update public.food_composition_pending
          set status = 'needs_review', review_reason = v_reason
          where public.food_composition_pending.term = r.term;
      end if;
    end if;

    term := r.term; outcome := v_outcome; reason := v_reason;
    return next;
  end loop;
end;
$$;

revoke all on function public.promote_pending_food_compositions(integer, boolean, text[])
  from anon, authenticated;

comment on function public.promote_pending_food_compositions(integer, boolean, text[]) is
  'LOT 18 — promeut les lignes du sas vues >= p_min_sightings fois ET dont les '
  'valeurs tiennent dans la bande mesuree de leur groupe. p_terms nomme une '
  'liste curee a la main: il leve la REPETITION, jamais les bandes. N''ecrit '
  'JAMAIS dans food_composition_aliases. Hors chemin chaud, jamais par cron.';

-- ---------------------------------------------------------------------------
-- ③ LES TROIS CLASSES DE RENDEMENT FAUSSES, CORRIGÉES CONTRE LE RÉFÉRENTIEL
-- ---------------------------------------------------------------------------
--
-- ⚠️ MESURÉ, PAS CHOISI. Chacun de ces trois groupes est UNANIME dans le
-- referentiel humain, et la ligne du sas est la seule à en sortir:
--
--   dairy_cheese  7 lignes /  7 en `neutral`  — `emmental rape` disait `veg_shrinks`
--   dairy_yogurt 71 lignes / 71 en `neutral`  — `yaourt au soja nature`, `legume_absorbs`
--   tofu_tempeh   4 lignes /  4 en `neutral`  — `tofu soyeux`, `legume_absorbs`
--
-- La classe décide de la conversion cru→cuit. Un fromage râpé qui « rétrécit
-- comme un légume » perd de la masse à la cuisson qu'il n'a jamais perdue.

update public.food_composition_pending
  set yield_class = 'neutral'
  where term in ('emmental rape', 'yaourt au soja nature', 'tofu soyeux')
    and yield_class <> 'neutral';

-- ---------------------------------------------------------------------------
-- ④ LES SEPT REFUS, NOMMÉS UN PAR UN
-- ---------------------------------------------------------------------------
--
-- Nommés plutôt que passés sous silence: une file dont on ne dit pas ce qu'on
-- a écarté est une file qu'on relira sans savoir où elle en est.

update public.food_composition_pending set status = 'rejected', review_reason = r.why
from (values
  ('fromage rape',
   '2026-09-09: groupe cruciferous_veg pour du FROMAGE, 28 kcal/100 g. La ligne '
   'passe toutes les gardes (bande, plafond, Atwater) et decrit un autre aliment.'),
  ('legumes rotis',
   '2026-09-09: ce n''est pas un aliment, c''est un melange — et `legumes` designe '
   'les LEGUMINEUSES, pas des legumes rotis. Deux fautes dans une ligne.'),
  ('poisson roti',
   '2026-09-09: de la prose, pas un nom d''aliment. `state:"cooked"` est le champ '
   'prevu pour dire qu''un poisson est cuit.'),
  ('filets de poisson',
   '2026-09-09: generique — ne designe aucun poisson. 120 kcal vaut pour un gras '
   'comme pour un maigre, c''est-a-dire pour aucun des deux.'),
  ('salsa de tomates',
   '2026-09-09: 59 kcal ici, 29 sur `salsa de tomate` — le meme aliment, deux '
   'valeurs, un facteur DEUX. Deux tirages qui se contredisent ne font pas une '
   'mesure; il faut une ligne curee, pas un arbitrage entre eux.'),
  ('salsa de tomate',
   '2026-09-09: voir `salsa de tomates`. Les deux partent ensemble.'),
  ('curry doux',
   '2026-09-09: deja ecarte le 2026-08-24 — une POUDRE n''est pas une PATE '
   '(`curry_paste`), densite et energie n''ont rien a voir. Le groupe '
   'sauce_dressing tranche pour la pate sans le dire.')
) as r(term, why)
where public.food_composition_pending.term = r.term
  and public.food_composition_pending.status <> 'promoted';

-- ---------------------------------------------------------------------------
-- ⑤ LES DIX-HUIT PROMOTIONS, VÉRIFIÉES UNE PAR UNE
-- ---------------------------------------------------------------------------
--
-- Chacune est un ALIMENT REEL, dans le bon groupe, avec une valeur que le
-- referentiel humain rend plausible. Les gardes de la fonction tournent quand
-- meme — cette liste leve la repetition, pas les bandes.
--
-- ⚠️ `emmental rape` N'A ETE VU QU'UNE FOIS, et c'est le terme par lequel ce
-- chantier a commence: plan `4d78e95c`, compte reel, « Muffins aux oeufs,
-- pommes de terre et epinards ». 353 kcal/100 g pour de l'emmental rape.

select * from public.promote_pending_food_compositions(3, false, array[
  'tofu soyeux',
  'ricotta',
  'pistaches',
  'filets de colin',
  'boeuf a mijoter',
  'pate a pizza',
  'farine de ble',
  'tamari sans gluten',
  'champignons de paris',
  'baked potato',
  'roti de porc',
  'boulettes de dinde',
  'lentilles mijotees',
  'pois chiches cuits egouttes',
  'little gem lettuce',
  'yaourt au soja nature',
  'flocons d''avoine certifies sans gluten',
  'emmental rape'
]);

-- ---------------------------------------------------------------------------
-- ⑥ LES CINQ MISES EN REVUE — ni promues, ni rejetees
-- ---------------------------------------------------------------------------
--
-- Elles restent LUES par `indexForReading` (elles ont servi aux plans qui les
-- citent) mais elles n'entreront pas dans le referentiel sur cette lecture-ci.

update public.food_composition_pending set status = 'needs_review', review_reason = r.why
from (values
  ('comte',
   '2026-09-09: 330 kcal/100 g pour du comte, la ou les tables donnent ~390. '
   'Dans la bande dairy_cheese, donc invisible aux gardes — trop bas quand meme.'),
  ('filet de porc',
   '2026-09-09: 214 kcal pour un filet, la coupe la plus MAIGRE du porc (~140 '
   'cru). La valeur decrit un roti, pas un filet.'),
  ('raviolis frais',
   '2026-09-09: 290 kcal/100 g crus est une valeur de pate SECHE. Des raviolis '
   'frais portent de l''eau et une farce.'),
  ('raviolis frais aux champignons',
   '2026-09-09: voir `raviolis frais`, meme ecart.'),
  ('sauce tomate',
   '2026-09-09: 29 kcal est juste, le groupe ne l''est pas — non_starchy_veg '
   'range une SAUCE parmi les legumes, et c''est sa bande qui servira de garde '
   'a la prochaine ligne du meme genre.')
) as r(term, why)
where public.food_composition_pending.term = r.term
  and public.food_composition_pending.status = 'pending';
