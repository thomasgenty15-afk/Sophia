-- ══════════════════════════════════════════════════════════════════════════
-- LES MODÈLES QUI TRAVAILLENT ONT UN PRIX
-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-08. `llm_pricing` ne portait aucune ligne pour la famille gpt-5.6,
-- alors que `gpt-5.6-luna` est le modèle de génération de plan depuis des
-- semaines. Conséquence mesurée avant ce lot :
--
--     gpt-5.6-luna   962 appels   16 859 787 tokens   cost_usd = 0.0000
--     gpt-5.6-sol     59 appels      779 755 tokens   cost_usd = 0.0000
--
-- `loadPricing()` (`_shared/llm-usage.ts`) ne trouve pas la clé, écrit
-- `cost_unpriced = true` et laisse `cost_usd` à zéro. Le journal de coûts
-- n'était donc pas « incomplet » : il affirmait ZÉRO, ce qui est faux, et
-- c'est la seule ligne de coût variable du produit. Un compteur qui rend zéro
-- ressemble exactement à un compteur qui marche — c'est pour ça que ça a tenu
-- si longtemps.
--
-- ⚠️ CE LOT NE RÉTROACTE RIEN. Les 1 021 lignes déjà écrites gardent leur
-- `cost_usd = 0` et leur `cost_unpriced = true`: elles disent la vérité sur ce
-- que le produit SAVAIT au moment de l'appel. Les repriser reviendrait à
-- réécrire une mesure après coup avec un prix qu'on n'avait pas. Pour chiffrer
-- l'historique, on multiplie à la lecture — le calcul est en commentaire au
-- bas de ce fichier, et il donne ~26 $ sur toute la vie du dépôt.
--
-- Tarifs publics OpenAI en vigueur depuis le 2026-07-30, par MILLION de
-- tokens, convertis ici au millier :
--
--     luna    0,20 $ / 1,20 $      →  0,0002  / 0,0012
--     terra   2,00 $ / 12,00 $     →  0,002   / 0,012
--     sol     5,00 $ / 30,00 $     →  0,005   / 0,030
--
-- L'entrée en cache est facturée à 10 % du tarif standard, ce que
-- `CACHED_INPUT_PRICE_MULTIPLIER = 0.1` applique déjà côté code — rien à
-- ajouter ici, les deux se rejoignent.
--
-- `terra` n'a AUCUN appel à ce jour. Sa ligne est posée quand même: le coût
-- d'une ligne inutilisée est nul, celui d'un modèle non tarifé est un zéro
-- silencieux dans le grand livre. C'est le défaut qu'on vient de corriger.
--
-- ⛔ `gpt-5.2` (16 appels, 31 720 tokens) RESTE NON TARIFÉ, exprès. Je n'ai pas
-- trouvé de tarif public pour ce modèle, et poser un prix plausible mais
-- inventé serait pire que l'absence: l'absence se voit dans `cost_unpriced`,
-- un faux prix se propage dans l'économie unitaire sans jamais se signaler.

insert into public.llm_pricing
  (provider, model, input_per_1k_tokens_usd, output_per_1k_tokens_usd,
   currency, pricing_version, effective_at, is_active)
values
  ('openai', 'gpt-5.6-luna',  0.0002, 0.0012, 'USD', 'openai_2026_07_30_gpt56', '2026-07-30T00:00:00Z', true),
  ('openai', 'gpt-5.6-terra', 0.002,  0.012,  'USD', 'openai_2026_07_30_gpt56', '2026-07-30T00:00:00Z', true),
  ('openai', 'gpt-5.6-sol',   0.005,  0.030,  'USD', 'openai_2026_07_30_gpt56', '2026-07-30T00:00:00Z', true)
on conflict (provider, model) do update set
  input_per_1k_tokens_usd  = excluded.input_per_1k_tokens_usd,
  output_per_1k_tokens_usd = excluded.output_per_1k_tokens_usd,
  currency                 = excluded.currency,
  pricing_version          = excluded.pricing_version,
  effective_at             = excluded.effective_at,
  is_active                = excluded.is_active,
  updated_at               = now();

-- ── LE CONTRÔLE: PLUS AUCUN MODÈLE EN USAGE NE DOIT ÊTRE SANS PRIX ─────────
-- Sauf ceux qu'on a nommément décidé de laisser de côté. La liste est
-- explicite: si un quatrième modèle apparaît demain sans tarif, ce bloc le
-- fait remonter au lieu de le laisser passer à zéro.
do $$
declare
  orphelins text;
begin
  select string_agg(distinct u.provider || '/' || u.model, ', ')
    into orphelins
  from public.llm_usage_events u
  left join public.llm_pricing p
    on p.provider = u.provider and p.model = u.model and p.is_active
  where p.model is null
    and u.model is not null
    and u.model not in ('gpt-5.2');

  if orphelins is not null then
    raise warning 'llm_pricing: modèles en usage sans tarif actif → %', orphelins;
  else
    raise notice 'llm_pricing: tous les modèles en usage sont tarifés (hors gpt-5.2, écarté sciemment)';
  end if;
end $$;

-- ── CHIFFRAGE DE L'HISTORIQUE, POUR MÉMOIRE ───────────────────────────────
-- Non exécuté par la migration: à passer à la main quand on veut le montant.
-- L'entrée déjà en cache est comptée à 10 %, comme le fait le code.
--
--   select u.model,
--          round(( (sum(u.prompt_tokens) - sum(coalesce(u.cached_prompt_tokens,0)))
--                    / 1000.0 * p.input_per_1k_tokens_usd
--                + sum(coalesce(u.cached_prompt_tokens,0))
--                    / 1000.0 * p.input_per_1k_tokens_usd * 0.1
--                + sum(u.output_tokens) / 1000.0 * p.output_per_1k_tokens_usd
--                )::numeric, 2) as usd_reel
--     from llm_usage_events u
--     join llm_pricing p
--       on p.provider = u.provider and p.model = u.model
--    where u.cost_unpriced
--    group by u.model, p.input_per_1k_tokens_usd, p.output_per_1k_tokens_usd;
--
-- Au 2026-09-08 ce calcul rend ≈ 10,74 $ pour luna et ≈ 15,73 $ pour sol.
-- Le fait qui compte pour l'économie unitaire n'est pas ce total, c'est le
-- COÛT PAR PLAN: un brouillon solo de 3 jours (8 026 tokens en entrée,
-- 9 200 en sortie) revient à ≈ 0,013 $. Soit environ UN CENTIME le plan.
