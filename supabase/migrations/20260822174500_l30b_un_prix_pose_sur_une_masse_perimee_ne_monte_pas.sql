-- ============================================================================
-- L30b — UN PRIX POSÉ SUR UNE MASSE PÉRIMÉE NE MONTE PAS AU RÉFÉRENTIEL.
--
-- Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L30b`.
-- Le prédicat vit AUSSI en TypeScript, dans un module pur et testé:
-- `supabase/functions/_shared/keel/meal_cost.ts` → `priceBasisContradictsYield`.
-- Les deux disent la même chose; le test `meal_cost_test.ts` mute le prédicat
-- pour prouver qu'il refuse vraiment, et nomme les cas qui doivent PASSER.
--
-- ⛔ CE QUE CETTE MIGRATION TOUCHE, ET RIEN D'AUTRE
-- ------------------------------------------------
--   ⓐ `promote_pending_food_prices()` — un refus de plus, en tête de chaque
--      marché, AVANT la bande. Aucune autre ligne de la fonction ne change.
--   ⓑ une vue de lecture, `food_price_basis_drift`, pour que le refus se voie
--      au lieu de se deviner.
--
-- Aucune donnée n'est écrite, aucune ligne n'est supprimée, aucun prix n'est
-- corrigé. Re-dériver une valeur marchande est le travail du lot 30 sur ses
-- sources; ce fichier se contente d'empêcher qu'une valeur devenue fausse
-- entre dans le référentiel que TOUS les plans lisent.
--
-- ⛔ LE FAIT, MESURÉ LE 2026-08-22 À 17:23 CEST
-- ---------------------------------------------
-- Le lot 30 a posé `price_basis` contre la `yield_class` du 2026-08-21. Deux
-- de ses cinq bases sont DÉFINIES par cette classe:
--
--   · `cooked_label_dry_input` — « libellé cuit ET `yield_class` neutre ». Le
--     runtime ne reconvertit rien (`gramsRawOf` ne divise que si le facteur
--     n'est pas 1,0), donc le prix est celui de l'entrée SÈCHE qu'il a fallu
--     acheter. Si la classe devenait non neutre, le runtime diviserait déjà
--     et le rendement serait facturé DEUX FOIS.
--   · `cooked_label_yield_absorbed` — « libellé cuit MAIS `yield_class` non
--     neutre ». Le runtime reconvertit, donc le prix est celui de
--     l'ingrédient CRU et ne doit surtout pas être re-divisé. Si la classe
--     devient NEUTRE, le runtime ne divise plus et le prix se retrouve posé
--     sur une masse qui n'est plus la sienne.
--
-- `L-C` a déplacé 57 `yield_class` le 2026-08-22, toutes vers `neutral`. Le
-- second cas s'est produit, sur exactement TROIS lignes:
--
--     noodles                    ex-`grain_absorbs` (2,6) ⇒ prix ×2,6 TROP HAUT
--     mashed_potatoes            ex-`veg_shrinks`  (0,9) ⇒ prix 10 % TROP BAS
--     potato_puree_milk_butter   ex-`veg_shrinks`  (0,9) ⇒ prix 10 % TROP BAS
--
-- ⚠️ ET LES 46 LIGNES DE PANIFICATION DE `L-C` VONT BIEN. Elles portent
-- `as_purchased`: on achète du pain, pas de la farine, et cette base ne
-- dépend d'aucune classe de rendement. Le lot 30 avait écrit « le prix est
-- réparé, la calorie non »; la calorie l'est depuis `L-C`, et les deux
-- parlent enfin du même état sur ces 46 lignes. Les faire dépendre du
-- rendement les refuserait toutes — c'est pourquoi le prédicat ne porte que
-- sur les deux bases qui se DÉFINISSENT par la classe.
--
-- ⛔ POURQUOI UN REFUS ET PAS UNE CONTRAINTE `CHECK`
-- --------------------------------------------------
-- Un `CHECK` sur `food_price_pending` ne pourrait pas lire `yield_class`, qui
-- vit dans une autre table — et un trigger qui l'imiterait rendrait le sas
-- refusant au moment où un lot de référentiel bouge une classe, c'est-à-dire
-- ferait échouer `L-C` plutôt que le prix. Le refus appartient au moment de
-- la PROMOTION: c'est là que le prix rencontre la masse.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ⓑ LA LECTURE — d'abord, pour que le refus se VOIE
-- ---------------------------------------------------------------------------
--
-- « Une vue sans lecteur n'arme rien »: celle-ci est lue par le pilote du lot
-- (`scripts/keel_l30b_budget_constat_20260822.sh`, section « le prix et la
-- masse parlent-ils du même état »), qui la rejoue à chaque mesure.
create or replace view public.food_price_basis_drift as
select
  p.slug,
  r.label,
  r.food_group_ref,
  p.price_basis,
  r.yield_class,
  p.price_eur_per_100g_fr,
  p.price_usd_per_100g_us,
  p.status,
  case
    when p.price_basis = 'cooked_label_dry_input'
      then 'la classe n''est plus neutre: le runtime divise DÉJÀ, le rendement serait facturé deux fois'
    else 'la classe est devenue neutre: le runtime ne divise plus, le prix reste posé sur l''ancienne masse'
  end as pourquoi
from public.food_price_pending p
join public.food_composition_refs r on r.slug = p.slug
where (p.price_basis = 'cooked_label_dry_input' and r.yield_class <> 'neutral')
   or (p.price_basis = 'cooked_label_yield_absorbed' and r.yield_class = 'neutral');

comment on view public.food_price_basis_drift is
  'L30b — les lignes dont la base de pesée du prix (lot 30) contredit la '
  'yield_class d''aujourd''hui. Leur prix a été posé contre une arithmétique '
  'de runtime qui n''est plus celle en vigueur; promote_pending_food_prices() '
  'les refuse. Le même prédicat vit dans meal_cost.ts '
  '(priceBasisContradictsYield), et il y est muté par son test.';

revoke all on public.food_price_basis_drift from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ⓐ LE REFUS, DANS LA PROMOTION
-- ---------------------------------------------------------------------------
--
-- ⚠️ Le corps est celui du lot 30 (`20260821040000`), à trois ajouts près,
-- tous marqués `L30b`. Il est recopié en entier parce que `create or replace
-- function` n'a pas d'autre forme — et pas parce que quelque chose d'autre a
-- changé.
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
  -- L30b — la base de pesée contredit-elle la classe de rendement du jour ?
  v_basis_stale boolean;
begin
  v_rank_min := case p_min_confidence
    when 'verified' then 4 when 'published_series' then 3
    when 'retail_average' then 2 else 1 end;

  for r in
    select p.*, fr.band_low as fr_low, fr.band_high as fr_high,
           us.band_low as us_low, us.band_high as us_high,
           ref.food_group_ref, ref.yield_class
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

    -- ── L30b · LE PRIX ET LA MASSE DOIVENT PARLER DU MÊME ÉTAT ──────────
    -- ⛔ AVANT LA BANDE, et c'est délibéré: une ligne dont la base est
    -- périmée peut très bien tomber DANS sa bande — c'est même le cas des
    -- trois lignes connues. Une garde placée après la bande ne les verrait
    -- jamais. Le prédicat est le même que `priceBasisContradictsYield`.
    v_basis_stale :=
      (r.price_basis = 'cooked_label_dry_input' and r.yield_class <> 'neutral')
      or (r.price_basis = 'cooked_label_yield_absorbed' and r.yield_class = 'neutral');

    -- ── FRANCE ──────────────────────────────────────────────────────────
    if r.price_eur_per_100g_fr is null then
      v_fr_reason := 'no_price';
    elsif v_basis_stale then
      -- L30b — le motif nomme les deux faits, pour qu'une relecture n'ait pas
      -- à rouvrir deux tables pour comprendre.
      v_fr_reason := format('basis_contradicts_yield:%s vs %s',
        r.price_basis, r.yield_class);
    elsif (case r.price_fr_confidence
             when 'verified' then 4 when 'published_series' then 3
             when 'retail_average' then 2 else 1 end) < v_rank_min then
      v_fr_reason := 'below_min_confidence';
    elsif r.fr_low is null then
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
    elsif v_basis_stale then
      v_us_reason := format('basis_contradicts_yield:%s vs %s',
        r.price_basis, r.yield_class);
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
  'LOT 30 + L30b — promeut la grille du sas vers food_composition_refs, marché '
  'par marché, en refusant ce qui sort de la bande gelée du groupe, ce qui '
  'n''atteint pas le niveau de confiance demandé, et (L30b) ce dont la base de '
  'pesée contredit la yield_class d''aujourd''hui. Hors chemin chaud: à lancer '
  'à la main, p_dry_run = true D''ABORD.';

commit;
