-- LE CACHE DE PROMPT ÉTAIT PAYÉ PLEIN TARIF DANS NOS PROPRES CHIFFRES.
--
-- L'API Responses d'OpenAI rend `usage.input_tokens_details.cached_tokens` :
-- la part du prompt servie depuis le cache, facturée une fraction du tarif
-- d'entrée. Le normaliseur de `_shared/gemini.ts` jetait ce champ, donc
-- `computeCostUsd` multipliait TOUS les tokens d'entrée par le plein tarif.
--
-- MESURÉ sur le dispatcher global : 15 104 tokens en cache sur 17 139 envoyés,
-- soit 88 %. `cost_usd` le surestimait donc d'environ 7×, et c'est le chiffre
-- sur lequel on décidait quoi optimiser.
--
-- Colonne ADDITIVE et NULLABLE : les lignes déjà écrites gardent `null`, qui se
-- lit « on ne savait pas », et surtout PAS `0`, qui se lirait « aucun cache ».
-- La distinction compte : tout l'historique d'avant ce commit est dans le
-- premier cas, et le confondre avec le second ferait croire à une régression du
-- taux de cache le jour où quelqu'un tracera la courbe.
alter table public.llm_usage_events
  add column if not exists cached_prompt_tokens integer;

comment on column public.llm_usage_events.cached_prompt_tokens is
  'Part de prompt_tokens servie par le cache du fournisseur (OpenAI: usage.input_tokens_details.cached_tokens). NULL = non renseigné par le fournisseur ou ligne antérieure au câblage; 0 = cache réellement vide.';
