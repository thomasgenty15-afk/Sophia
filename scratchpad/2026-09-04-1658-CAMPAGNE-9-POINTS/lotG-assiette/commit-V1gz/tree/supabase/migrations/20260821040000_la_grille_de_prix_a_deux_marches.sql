-- ============================================================================
-- LOT 30 · LA GRILLE DE PRIX DU RÉFÉRENTIEL — France et États-Unis
--
-- Prompt: scratchpad/2026-08-21-1200-PROMPT-GRILLE-DE-PRIX.md
--
-- CE QUE CETTE MIGRATION INSTALLE, ET DANS QUEL ORDRE
-- ---------------------------------------------------
--   1. six colonnes de prix sur `food_composition_refs` — deux prix, deux
--      dates, deux sources — et la contrainte qui REFUSE un prix sans sa date
--      ni sa source.
--   2. `food_price_pending` — le SAS. Une ligne par slug, les deux marchés,
--      la confiance, la base de pesée. Rien n'entre dans le référentiel sans
--      passer par là.
--   3. `food_price_group_bands` — la bande de plausibilité par groupe et par
--      marché, CALCULÉE puis GELÉE, et la fonction qui la recalcule.
--   4. `food_price_out_of_band` — la lecture des lignes hors bande.
--   5. `food_price_fx_smell` — la mesure qui dit si quelqu'un a converti une
--      colonne depuis l'autre.
--   6. `promote_pending_food_prices()` — la promotion, hors chemin chaud.
--
-- ⛔ POURQUOI DEUX COLONNES ET PAS UNE À CONVERTIR
-- ------------------------------------------------
-- Le prix est la seule valeur de ce référentiel qui dépende du LECTEUR. 100 g
-- de lentilles crues font 340 kcal à Lille comme à Denver; ils ne coûtent pas
-- la même chose, et pas d'un facteur de change: les écarts sont structurels
-- (subventions, circuits, saisonnalité inversée, conditionnements).
--
-- Une colonne unique aurait à être redécoupée plus tard sur 923 lignes, et
-- personne ne saurait laquelle des deux valeurs y avait été écrite.
--
-- ⚠️ ET L'INTERDIT SE MESURE, IL NE SE PROMET PAS. `food_price_fx_smell` sort
-- la dispersion du rapport usd/eur par groupe. Un taux de change appliqué à
-- une colonne rend ce rapport CONSTANT — écart-type nul, min = max. C'est la
-- seule façon d'attraper une conversion après coup: le nombre converti, lui,
-- reste parfaitement plausible.
--
-- ⛔ LA BASE DE PESÉE — LE PIÈGE CRU/CUIT, ET LE FAIT QU'IL SOIT DÉJÀ LÀ
-- ---------------------------------------------------------------------
-- `food_composition_refs` est censée porter ses valeurs pour 100 g CRUS.
-- Vérifié le 2026-08-21: **129 de ses 923 lignes portent un libellé CIQUAL
-- d'état CUIT** (« braised », « boiled/cooked in water », « grilled/pan-fried »,
-- « roasted/baked », « sautéed »). Ce n'est pas ce lot qui l'introduit; c'est
-- ce lot qui doit décider quoi facturer dessus.
--
-- Le runtime tranche à notre place: `nutrientsOf()` reçoit toujours des
-- `gramsRaw`, et `gramsRawOf()` divise par `YIELD_FACTORS[yield_class]` quand
-- l'état déclaré est « cooked ». Donc:
--
--   · `as_purchased` — le prix est celui de 100 g du produit tel qu'on
--     l'achète (riz SEC en paquet, viande crue à l'étal, conserve égouttée,
--     pain, yaourt). C'est le cas nominal.
--   · `cooked_label_yield_absorbed` — la ligne est cuite MAIS sa `yield_class`
--     n'est pas neutre: le runtime reconvertit déjà la quantité en grammes
--     crus avant de multiplier. Le prix reste donc celui de l'ingrédient CRU,
--     et surtout PAS divisé une seconde fois.
--   · `cooked_label_dry_input` — la ligne est cuite ET sa `yield_class` vaut
--     1,0: le runtime ne reconvertit RIEN. Il faut donc facturer l'entrée
--     sèche qu'il a fallu acheter, et `dry_input_ratio` porte combien de
--     grammes d'achat font 100 g de cette ligne. C'est ici, et seulement ici,
--     que vit le facteur 2,6 du riz.
--   · `diluted` — café, thé, bouillon reconstitué. Même arithmétique, autre
--     cause: on paie une poudre, on pèse une boisson.
--   · `edible_portion` — la ligne DIT qu'elle est la partie comestible seule
--     (« pulp », « meat only », « peeled »), et le marché ne vend que l'entier.
--     Une moule se paie avec sa coquille, une orange avec son écorce. C'est le
--     même piège que le riz, une deuxième fois: la masse facturée n'est pas la
--     masse pesée. Il n'est appliqué que là où le LIBELLÉ l'affirme — jamais
--     sur une inférence de notre part.
--
-- ⚠️ Cette division-là est une opération DÉCLARÉE, à l'intérieur d'un même
-- marché, avec son facteur écrit dans une colonne relisible. Elle n'a rien à
-- voir avec la conversion entre les deux colonnes, qui reste interdite.
--
-- RGPD — LA RÉCLAMATION, DANS LE MÊME FICHIER
-- -------------------------------------------
-- ⚠️ Cicatrice connue: « le lifecycle RGPD ne réclame pas les tables neuves »
-- (neuf tables hors export). `food_price_pending` est réclamée ici, et de la
-- MÊME nature que `food_composition_pending` (lot 18): **elle ne porte aucune
-- personne, par construction.**
--
--   · aucune colonne `user_id`, `household_id`, `coach_id`, `member_id`;
--   · aucune clé étrangère vers `profiles`, `households` ou un plan;
--   · aucun budget, aucun panier, aucune dépense — un prix de marché n'est
--     l'achat de personne;
--   · le seul texte libre est un nom de source publique et une note de revue.
--
-- Elle est donc **ni exportée ni purgée**, exactement comme `food_composition_refs`
-- et `food_composition_aliases`: c'est un RÉFÉRENTIEL. L'exporter rendrait à
-- chaque élève le catalogue de prix du produit — qui n'est pas sa donnée — et
-- une purge le viderait pour tout le monde au premier départ.
-- `food_price_pending_carries_no_person_check` rend la promesse VÉRIFIABLE.
--
-- ⚠️ Les six colonnes ajoutées à `food_composition_refs` voyagent avec une
-- table qui n'est, pour la même raison, ni exportée ni purgée. Rien à ajouter
-- au lifecycle: il n'y a rien à réclamer.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) LES DEUX PRIX SUR LE RÉFÉRENTIEL — et leur date, et leur source
-- ---------------------------------------------------------------------------

alter table public.food_composition_refs
  add column if not exists price_eur_per_100g_fr numeric,
  add column if not exists price_usd_per_100g_us numeric,
  add column if not exists price_fr_observed_on date,
  add column if not exists price_us_observed_on date,
  add column if not exists price_fr_source text,
  add column if not exists price_us_source text;

-- ⛔ UN PRIX SANS DATE NI SOURCE EST REFUSÉ — le piège ④ rendu structurel.
-- « Une grille de 2026 ment en 2028. » Un prix nu ne dit pas quand le
-- rafraîchir, et il est indiscernable d'un prix relevé hier. La contrainte
-- est bilatérale: on ne peut pas non plus poser une date sans prix.
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_price_fr_is_dated_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_price_fr_is_dated_check check (
    (price_eur_per_100g_fr is null
       and price_fr_observed_on is null and price_fr_source is null)
    or (price_eur_per_100g_fr > 0
       and price_fr_observed_on is not null
       and length(btrim(price_fr_source)) between 1 and 120)
  );

alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_price_us_is_dated_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_price_us_is_dated_check check (
    (price_usd_per_100g_us is null
       and price_us_observed_on is null and price_us_source is null)
    or (price_usd_per_100g_us > 0
       and price_us_observed_on is not null
       and length(btrim(price_us_source)) between 1 and 120)
  );

comment on column public.food_composition_refs.price_eur_per_100g_fr is
  'LOT 30 — coût moyen de détail de 100 g de cet aliment EN FRANCE, en euros, '
  'sur la même base de pesée que les valeurs de composition (100 g crus / tels '
  'qu''achetés). N''est JAMAIS dérivée de price_usd_per_100g_us.';
comment on column public.food_composition_refs.price_usd_per_100g_us is
  'LOT 30 — idem AUX ÉTATS-UNIS, en dollars. N''est JAMAIS dérivée de '
  'price_eur_per_100g_fr: les deux colonnes se remplissent depuis des sources '
  'séparées, parce que les écarts de prix entre les deux marchés sont '
  'structurels et pas de change.';
comment on column public.food_composition_refs.price_fr_observed_on is
  'LOT 30 — date du NIVEAU de prix relevé. Sans elle, personne ne sait quand '
  'rafraîchir la grille, et une valeur de 2026 se lit encore en 2028.';
comment on column public.food_composition_refs.price_us_observed_on is
  'LOT 30 — idem pour le marché américain.';

-- ---------------------------------------------------------------------------
-- 2) LE SAS
-- ---------------------------------------------------------------------------
--
-- ⛔ ON N'ÉCRIT PAS DIRECTEMENT DANS `food_composition_refs`. Même patron que
-- le lot 18: la grille est proposée ici, revue, et seulement ensuite promue.
-- Un prix faux écrit d'emblée dans le référentiel est indiscernable d'un prix
-- relevé, et ne sera jamais retrouvé.

create table if not exists public.food_price_pending (
  slug text primary key
    references public.food_composition_refs(slug) on delete cascade,

  -- LES DEUX PRIX, POUR 100 G. `null` = pas de base sérieuse pour cette ligne
  -- sur ce marché. Un `null` se COMPTE (voir food_price_coverage); un chiffre
  -- inventé, non.
  price_eur_per_100g_fr numeric check (price_eur_per_100g_fr > 0),
  price_usd_per_100g_us numeric check (price_usd_per_100g_us > 0),

  price_fr_source text,
  price_us_source text,

  -- LE NIVEAU DE CONFIANCE, ET IL EST OBLIGATOIRE DÈS QU'IL Y A UN PRIX.
  --
  --   `verified`          — série nationale publiée, niveau RELU le jour du lot.
  --   `published_series`  — l'aliment a une série nationale publiée (BLS
  --                         Average Price Data · INSEE prix moyens de vente de
  --                         détail · FranceAgriMer RNM) et la valeur est le
  --                         niveau de cette série, SANS relecture ligne à ligne.
  --   `retail_average`    — aucune série pour cet aliment précis, mais c'est un
  --                         produit de grande distribution: moyenne de rayon.
  --   `estimate`          — spécialité, transformé, régional. Barres d'erreur
  --                         larges. La revue tranche.
  price_fr_confidence text check (price_fr_confidence in
    ('verified', 'published_series', 'retail_average', 'estimate')),
  price_us_confidence text check (price_us_confidence in
    ('verified', 'published_series', 'retail_average', 'estimate')),

  observed_on date not null,

  -- LA BASE DE PESÉE. Voir l'en-tête: c'est ce qui empêche un riz de coûter
  -- 2,6 fois trop cher sans que rien ne le dise.
  price_basis text not null check (price_basis in (
    'as_purchased',
    'cooked_label_yield_absorbed',
    'cooked_label_dry_input',
    'diluted',
    'edible_portion'
  )),

  -- GRAMMES DE PRODUIT ACHETÉ PAR 100 G DE `gramsRaw`, quand la base l'exige.
  --
  -- ⚠️ CONTRE `gramsRaw`, ET PAS CONTRE LES GRAMMES DE L'ASSIETTE. C'est la
  -- seule référence qui ne mente pas, parce que c'est celle que le runtime
  -- multiplie: `nutrientsOf()` ne voit jamais autre chose. Sur une ligne à
  -- `yield_class` neutre les deux coïncident (38 g de riz sec pour 100 g de riz
  -- cuit, et le runtime ne divise rien). Sur une ligne à `yield_class` non
  -- neutre, le runtime divise DÉJÀ — et le ratio absorbe ce facteur, sinon le
  -- prix serait faux d'exactement lui. 13 lignes de la grille sont dans ce cas;
  -- chacune porte dans sa note les deux nombres et leur produit.
  --
  -- Le facteur est écrit, pas appliqué en silence: c'est ce qui rend la ligne
  -- relisible sans refaire le calcul.
  dry_input_ratio numeric check (dry_input_ratio > 0),

  note text,

  status text not null default 'pending'
    check (status in ('pending', 'promoted', 'needs_review')),
  review_reason text,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),

  -- ⛔ UN PRIX SANS CONFIANCE NI SOURCE N'EXISTE PAS. Le prompt du lot demande
  -- un niveau de confiance EXPLICITE pour tout ce que les sources publiques ne
  -- couvrent pas. Un champ optionnel est un champ jamais rempli — le dépôt a
  -- déjà payé « paramètre de garde optionnel = garde désarmée ».
  constraint food_price_pending_fr_is_qualified_check check (
    (price_eur_per_100g_fr is null
       and price_fr_confidence is null and price_fr_source is null)
    or (price_eur_per_100g_fr is not null
       and price_fr_confidence is not null
       and length(btrim(price_fr_source)) between 1 and 120)
  ),
  constraint food_price_pending_us_is_qualified_check check (
    (price_usd_per_100g_us is null
       and price_us_confidence is null and price_us_source is null)
    or (price_usd_per_100g_us is not null
       and price_us_confidence is not null
       and length(btrim(price_us_source)) between 1 and 120)
  ),

  -- ⛔ LE FACTEUR EST EXIGÉ EXACTEMENT LÀ OÙ IL CHANGE LE PRIX, ET INTERDIT
  -- AILLEURS. Une base `as_purchased` qui porterait un ratio aurait divisé
  -- quelque chose sans le dire; une base `dry_input` sans ratio aurait divisé
  -- sans qu'on sache par combien.
  constraint food_price_pending_ratio_matches_basis_check check (
    case
      when price_basis in ('cooked_label_dry_input', 'diluted', 'edible_portion')
        then dry_input_ratio is not null
      else dry_input_ratio is null
    end
  ),

  -- ⛔ LA PREUVE QUE LA TABLE NE PORTE PERSONNE, ÉCRITE EN CONTRAINTE.
  -- Même geste qu'au lot 18: bête exprès, elle rend le cas le plus probable
  -- (un identifiant qui fuit dans une note de revue) impossible au lieu
  -- d'invisible.
  constraint food_price_pending_carries_no_person_check check (
    coalesce(note, '') !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    and coalesce(note, '') !~ '@'
    and coalesce(review_reason, '') !~ '@'
  )
);

comment on table public.food_price_pending is
  'LOT 30 · Le SAS de la grille de prix, deux marchés. RÉFÉRENTIEL et pas '
  'donnée d''élève: aucune colonne ne porte de personne (contrainte '
  'food_price_pending_carries_no_person_check), aucun panier, aucune dépense. '
  'Ni exportée ni purgée par le lifecycle RGPD, pour la même raison que '
  'food_composition_refs et food_composition_pending.';

comment on column public.food_price_pending.price_basis is
  'Sur quelle masse le prix est posé. as_purchased = tel qu''on l''achète. '
  'cooked_label_yield_absorbed = libellé cuit mais yield_class non neutre, le '
  'runtime reconvertit déjà en grammes crus. cooked_label_dry_input = libellé '
  'cuit ET yield_class neutre, il faut facturer l''entrée sèche. diluted = '
  'café, thé, bouillon reconstitué. edible_portion = le libellé dit '
  '« pulp », « meat only » ou « peeled » et le marché ne vend que l''entier.';

comment on column public.food_price_pending.dry_input_ratio is
  'Grammes de produit ACHETÉ par 100 g de `gramsRaw` — la quantité que le '
  'runtime multiplie, PAS les grammes de l''assiette. Sur une yield_class '
  'neutre les deux coïncident; sinon le ratio absorbe le facteur que le '
  'runtime applique déjà. Obligatoire pour cooked_label_dry_input, diluted et '
  'edible_portion, interdit ailleurs.';

create index if not exists food_price_pending_promotable_idx
  on public.food_price_pending (status)
  where status = 'pending';

-- ⛔ Privilèges par défaut: `authenticated` reçoit TOUT sur toute table neuve
-- (cicatrice `supabase-default-privileges-grant-all-to-authenticated`).
revoke all on public.food_price_pending from anon, authenticated;
alter table public.food_price_pending enable row level security;
-- Aucune politique: RLS activée sans policy = zéro ligne pour tout rôle non
-- service_role, même si un `grant` revenait par une autre porte.

-- ---------------------------------------------------------------------------
-- 3) LES BANDES DE PLAUSIBILITÉ — calculées, puis GELÉES
-- ---------------------------------------------------------------------------
--
-- ⛔ UNE TABLE ET PAS UNE VUE, ET C'EST LA DIFFÉRENCE AVEC LE LOT 18.
-- Là-bas la bande servait à juger des lignes qui ARRIVAIENT dans un référentiel
-- déjà établi; une vue calculée sur ce référentiel était donc une garde. Ici,
-- la bande doit juger la grille SUIVANTE — et une vue recalculée à chaque
-- lecture s'élargirait au rythme de ce qu'elle est censée refuser. Elle est
-- donc figée, datée, et porte le nombre de lignes sur lequel elle a été
-- mesurée.
--
-- ⚠️ ET LA BANDE EST LOGARITHMIQUE, PAS p05/p95.
-- « L'écart de prix couvre quatre ordres de grandeur »: les lentilles à 3 €/kg
-- et le safran à 30 000 €/kg vivent dans le même référentiel. Un p05/p95 sur
-- une telle dispersion signale mécaniquement 10 % de chaque groupe — c'est-à-dire
-- qu'il désigne des lignes JUSTES et rate ce qu'on cherche. Ce qu'on cherche est
-- une erreur de FACTEUR: virgule déplacée, prix du cuit collé sur du cru, prix
-- au kilo écrit pour 100 g. La bande est donc posée sur les logarithmes —
-- moyenne géométrique divisée/multipliée par exp(2,5·sigma) — et le
-- multiplicateur est borné à 2 au minimum (sinon un groupe homogène refuserait
-- toute nouveauté) et à 8 au maximum.
--
-- ⚠️ LE PLAFOND PORTE SUR LE MULTIPLICATEUR, DONC LA LARGEUR TOTALE VAUT SON
-- CARRÉ. C'est le piège de ce réglage, et il a été mesuré: à exp(3·sigma)
-- plafonné à 40, la largeur atteignait ×1 600 sur `sauce_dressing` et
-- `coffee_tea` — une bande qui n'aurait plus rien refusé, c'est-à-dire une
-- garde désarmée qui ressemble à une garde. Le réglage retenu a été choisi en
-- comptant les signalements sur la grille elle-même: 17 à 3·sigma/×40 (1,0 %),
-- 35 à 2,5·sigma/×8 (2,0 %), 76 à 2·sigma/×6 (4,3 %). Les 18 lignes que le
-- resserrement ajoute ont été RELUES une par une — foie gras, cèpes,
-- chanterelles, viande des Grisons, sel, bouillon reconstitué: que des extrêmes
-- réels, aucun bruit. C'est ce qui rend le seuil défendable plutôt que choisi.
--
-- p05/p95 restent stockés à côté, pour la LECTURE, pas pour la décision.

create table if not exists public.food_price_group_bands (
  food_group_ref text not null references public.food_groups(slug),
  market text not null check (market in ('fr', 'us')),
  priced_rows integer not null check (priced_rows >= 0),
  p05 numeric,
  median numeric,
  p95 numeric,
  geo_mean numeric,
  band_low numeric,
  band_high numeric,
  computed_on date not null,
  primary key (food_group_ref, market)
);

comment on table public.food_price_group_bands is
  'LOT 30 — la bande de plausibilité de chaque groupe, par marché, mesurée '
  'sur la grille et GELÉE. C''est elle qui permet de vérifier la grille '
  'suivante sans relire celle-ci. band_low/band_high sont logarithmiques '
  '(moyenne géométrique ÷/× exp(2,5·sigma), multiplicateur borné à ×2 et ×8); '
  'p05/p95 sont là pour la lecture seule.';

revoke all on public.food_price_group_bands from anon, authenticated;
alter table public.food_price_group_bands enable row level security;

create or replace function public.refresh_food_price_group_bands(
  p_computed_on date default current_date
)
returns integer
language sql
security definer
set search_path = public
as $$
  with priced as (
    select r.food_group_ref, 'fr'::text as market, p.price_eur_per_100g_fr as price
      from public.food_price_pending p
      join public.food_composition_refs r on r.slug = p.slug
     where p.price_eur_per_100g_fr is not null
    union all
    select r.food_group_ref, 'us'::text, p.price_usd_per_100g_us
      from public.food_price_pending p
      join public.food_composition_refs r on r.slug = p.slug
     where p.price_usd_per_100g_us is not null
  ),
  stats as (
    select
      food_group_ref,
      market,
      count(*)::int as priced_rows,
      percentile_cont(0.05) within group (order by price)::numeric as p05,
      percentile_cont(0.50) within group (order by price)::numeric as median,
      percentile_cont(0.95) within group (order by price)::numeric as p95,
      avg(ln(price)) as mu,
      -- ⚠️ `stddev_samp` rend NULL sur une seule ligne — et un groupe à une
      -- ligne EXISTE ici (`olive_oil`, `water`). `coalesce(...,0)` le ramène à
      -- une dispersion nulle, que le plancher ×3 ci-dessous rattrape. Sans ce
      -- coalesce la bande serait NULL, c'est-à-dire une garde muette.
      coalesce(stddev_samp(ln(price)), 0) as sigma
    from priced
    group by food_group_ref, market
  ),
  banded as (
    select
      food_group_ref, market, priced_rows, p05, median, p95,
      exp(mu) as geo_mean,
      exp(mu) / least(greatest(exp(2.5 * sigma), 2), 8) as band_low,
      exp(mu) * least(greatest(exp(2.5 * sigma), 2), 8) as band_high
    from stats
  ),
  upserted as (
    insert into public.food_price_group_bands as b (
      food_group_ref, market, priced_rows, p05, median, p95,
      geo_mean, band_low, band_high, computed_on
    )
    select
      food_group_ref, market, priced_rows,
      round(p05, 4), round(median, 4), round(p95, 4),
      round(geo_mean::numeric, 4), round(band_low::numeric, 4), round(band_high::numeric, 4),
      p_computed_on
    from banded
    on conflict (food_group_ref, market) do update set
      priced_rows = excluded.priced_rows,
      p05 = excluded.p05, median = excluded.median, p95 = excluded.p95,
      geo_mean = excluded.geo_mean,
      band_low = excluded.band_low, band_high = excluded.band_high,
      computed_on = excluded.computed_on
    returning 1
  )
  select count(*)::int from upserted;
$$;

revoke all on function public.refresh_food_price_group_bands(date)
  from anon, authenticated;

comment on function public.refresh_food_price_group_bands(date) is
  'LOT 30 — recalcule et GÈLE les bandes depuis food_price_pending. À lancer '
  'à la main quand une grille est acceptée, JAMAIS depuis un chemin chaud: une '
  'bande qui se recalcule à chaque écriture s''élargit au rythme de ce qu''elle '
  'est censée refuser.';

-- ---------------------------------------------------------------------------
-- 4) LA LECTURE DES LIGNES HORS BANDE
-- ---------------------------------------------------------------------------
--
-- Sans elle, la bande n'est qu'une table. « Hors bande, on n'écrit pas — on
-- signale »: voici où le signal se lit.
create or replace view public.food_price_out_of_band as
select
  p.slug,
  r.food_group_ref,
  r.label,
  m.market,
  m.price,
  b.band_low,
  b.band_high,
  b.geo_mean,
  round((m.price / nullif(b.geo_mean, 0))::numeric, 2) as ratio_to_geo_mean,
  case when m.price < b.band_low then 'below' else 'above' end as side
from public.food_price_pending p
join public.food_composition_refs r on r.slug = p.slug
cross join lateral (
  values ('fr', p.price_eur_per_100g_fr), ('us', p.price_usd_per_100g_us)
) as m(market, price)
join public.food_price_group_bands b
  on b.food_group_ref = r.food_group_ref and b.market = m.market
where m.price is not null
  and (m.price < b.band_low or m.price > b.band_high);

comment on view public.food_price_out_of_band is
  'LOT 30 — les lignes dont le prix sort de la bande gelée de leur groupe. '
  'Une erreur de facteur (virgule, cru coté cuit, prix au kilo écrit pour '
  '100 g) atterrit ici; un prix simplement cher, non.';

revoke all on public.food_price_out_of_band from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) LA MESURE QUI ATTRAPE UNE CONVERSION ENTRE LES DEUX COLONNES
-- ---------------------------------------------------------------------------
--
-- ⛔ « Ne convertis JAMAIS l'une depuis l'autre. » Un interdit qu'on ne sait
-- pas mesurer est un interdit qu'on croit tenir. Un taux de change appliqué à
-- une colonne rend le rapport usd/eur CONSTANT à l'intérieur du groupe: sigma
-- s'effondre, min et max se rejoignent. Un vrai couple de marchés donne un
-- rapport dispersé — le poulet, le bœuf et les fruits rouges n'ont pas le même
-- écart France/États-Unis, et c'est précisément le fait que ce lot existe pour
-- respecter.
create or replace view public.food_price_fx_smell as
select
  r.food_group_ref,
  count(*)::int as pairs,
  round(min(p.price_usd_per_100g_us / p.price_eur_per_100g_fr), 3) as ratio_min,
  round(max(p.price_usd_per_100g_us / p.price_eur_per_100g_fr), 3) as ratio_max,
  round(avg(p.price_usd_per_100g_us / p.price_eur_per_100g_fr), 3) as ratio_mean,
  round(coalesce(stddev_samp(p.price_usd_per_100g_us / p.price_eur_per_100g_fr), 0), 4)
    as ratio_stddev,
  -- Le verdict, et il est volontairement sévère: sur trois paires ou plus, un
  -- écart-type quasi nul ne s'obtient pas par hasard.
  (count(*) >= 3
     and coalesce(stddev_samp(p.price_usd_per_100g_us / p.price_eur_per_100g_fr), 0) < 0.01)
    as looks_converted
from public.food_price_pending p
join public.food_composition_refs r on r.slug = p.slug
where p.price_eur_per_100g_fr is not null
  and p.price_usd_per_100g_us is not null
group by r.food_group_ref;

comment on view public.food_price_fx_smell is
  'LOT 30 — `looks_converted` à vrai sur un groupe = quelqu''un a dérivé une '
  'colonne de prix depuis l''autre par un taux de change. C''est la seule façon '
  'd''attraper le geste après coup: le nombre converti reste plausible.';

revoke all on public.food_price_fx_smell from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) LA PROMOTION — hors chemin chaud, et elle refuse plus qu'elle n'admet
-- ---------------------------------------------------------------------------
--
-- ⛔ AUCUNE LANE DE GÉNÉRATION NE L'APPELLE, et c'est le point: une génération
-- qui écrit le référentiel qu'elle vient de lire rend le plan suivant
-- dépendant du tirage du précédent. Elle se lance à la main.
create or replace function public.promote_pending_food_prices(
  p_dry_run boolean default false,
  p_min_confidence text default 'estimate'
)
returns table (slug text, market text, outcome text, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_rank_min int;
  v_fr_ok boolean;
  v_us_ok boolean;
  v_fr_reason text;
  v_us_reason text;
begin
  -- L'ordre des confiances, du plus sûr au plus fragile. `p_min_confidence`
  -- permet de ne promouvoir d'abord que ce qui est adossé à une série publiée,
  -- et de laisser les estimations en revue.
  v_rank_min := case p_min_confidence
    when 'verified' then 4 when 'published_series' then 3
    when 'retail_average' then 2 else 1 end;

  for r in
    select p.*, fr.band_low as fr_low, fr.band_high as fr_high,
           us.band_low as us_low, us.band_high as us_high,
           ref.food_group_ref
    from public.food_price_pending p
    join public.food_composition_refs ref on ref.slug = p.slug
    left join public.food_price_group_bands fr
      on fr.food_group_ref = ref.food_group_ref and fr.market = 'fr'
    left join public.food_price_group_bands us
      on us.food_group_ref = ref.food_group_ref and us.market = 'us'
    where p.status = 'pending'
    order by p.slug
  loop
    v_fr_ok := false; v_us_ok := false; v_fr_reason := null; v_us_reason := null;

    -- ── FRANCE ──────────────────────────────────────────────────────────
    if r.price_eur_per_100g_fr is null then
      v_fr_reason := 'no_price';
    elsif (case r.price_fr_confidence
             when 'verified' then 4 when 'published_series' then 3
             when 'retail_average' then 2 else 1 end) < v_rank_min then
      v_fr_reason := 'below_min_confidence';
    elsif r.fr_low is null then
      -- ⛔ PAS DE BANDE = PAS DE PROMOTION. Écrire un prix qu'aucune bande ne
      -- peut contredire, c'est écrire un prix que personne ne pourra relire.
      v_fr_reason := 'no_band';
    elsif r.price_eur_per_100g_fr < r.fr_low or r.price_eur_per_100g_fr > r.fr_high then
      v_fr_reason := format('fr_out_of_band:%s not in [%s,%s]',
        round(r.price_eur_per_100g_fr, 4), round(r.fr_low, 4), round(r.fr_high, 4));
    else
      v_fr_ok := true;
    end if;

    -- ── ÉTATS-UNIS ──────────────────────────────────────────────────────
    if r.price_usd_per_100g_us is null then
      v_us_reason := 'no_price';
    elsif (case r.price_us_confidence
             when 'verified' then 4 when 'published_series' then 3
             when 'retail_average' then 2 else 1 end) < v_rank_min then
      v_us_reason := 'below_min_confidence';
    elsif r.us_low is null then
      v_us_reason := 'no_band';
    elsif r.price_usd_per_100g_us < r.us_low or r.price_usd_per_100g_us > r.us_high then
      v_us_reason := format('us_out_of_band:%s not in [%s,%s]',
        round(r.price_usd_per_100g_us, 4), round(r.us_low, 4), round(r.us_high, 4));
    else
      v_us_ok := true;
    end if;

    if not p_dry_run then
      -- ⚠️ LES DEUX MARCHÉS SE PROMEUVENT SÉPARÉMENT. Un prix français hors
      -- bande ne doit pas retenir un prix américain juste: ce sont deux
      -- grilles, pas une grille à deux colonnes.
      if v_fr_ok then
        update public.food_composition_refs f
           set price_eur_per_100g_fr = r.price_eur_per_100g_fr,
               price_fr_observed_on = r.observed_on,
               price_fr_source = left(r.price_fr_source || ' · ' || r.price_fr_confidence, 120)
         where f.slug = r.slug;
      end if;
      if v_us_ok then
        update public.food_composition_refs f
           set price_usd_per_100g_us = r.price_usd_per_100g_us,
               price_us_observed_on = r.observed_on,
               price_us_source = left(r.price_us_source || ' · ' || r.price_us_confidence, 120)
         where f.slug = r.slug;
      end if;

      if v_fr_ok or v_us_ok then
        update public.food_price_pending q
           set status = 'promoted', promoted_at = now(),
               review_reason = nullif(concat_ws(' | ',
                 case when not v_fr_ok then 'fr:' || v_fr_reason end,
                 case when not v_us_ok then 'us:' || v_us_reason end), '')
         where q.slug = r.slug;
      else
        update public.food_price_pending q
           set status = 'needs_review',
               review_reason = concat_ws(' | ', 'fr:' || v_fr_reason, 'us:' || v_us_reason)
         where q.slug = r.slug;
      end if;
    end if;

    slug := r.slug;
    market := 'fr'; outcome := case when v_fr_ok then 'promoted' else 'skipped' end;
    reason := v_fr_reason; return next;
    market := 'us'; outcome := case when v_us_ok then 'promoted' else 'skipped' end;
    reason := v_us_reason; return next;
  end loop;
end;
$$;

revoke all on function public.promote_pending_food_prices(boolean, text)
  from anon, authenticated;

comment on function public.promote_pending_food_prices(boolean, text) is
  'LOT 30 — promeut la grille du sas vers food_composition_refs, marché par '
  'marché, en refusant ce qui sort de la bande gelée du groupe ou n''atteint '
  'pas le niveau de confiance demandé. Hors chemin chaud: à lancer à la main.';

-- ---------------------------------------------------------------------------
-- 7) LE COMPTE — sans lecture, les colonnes ne sont que des colonnes
-- ---------------------------------------------------------------------------
create or replace view public.food_price_coverage as
select
  r.food_group_ref,
  count(*)::int as refs,
  count(p.price_eur_per_100g_fr)::int as priced_fr,
  count(p.price_usd_per_100g_us)::int as priced_us,
  (count(*) - count(p.price_eur_per_100g_fr))::int as null_fr,
  (count(*) - count(p.price_usd_per_100g_us))::int as null_us,
  count(*) filter (where p.price_fr_confidence in ('verified', 'published_series'))::int
    as fr_on_published_series,
  count(*) filter (where p.price_us_confidence in ('verified', 'published_series'))::int
    as us_on_published_series,
  count(*) filter (where p.price_basis <> 'as_purchased')::int as rebased_rows
from public.food_composition_refs r
left join public.food_price_pending p on p.slug = r.slug
group by r.food_group_ref;

comment on view public.food_price_coverage is
  'LOT 30 — combien de lignes cotées, combien laissées à null, combien adossées '
  'à une série publiée, combien re-basées par le piège cru/cuit. Par groupe et '
  'par marché.';

revoke all on public.food_price_coverage from anon, authenticated;

commit;
