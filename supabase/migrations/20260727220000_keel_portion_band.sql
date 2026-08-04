-- ============================================================================
-- KEEL — `protocol_events.portion_band` : la quantité ORDINALE, promue en colonne
--
-- Autorité : docs/keel/PHOTO_QUANTIFICATION.md (§2 « le trou, nommé
-- précisément » et §4 « la recommandation »), docs/keel/CONTRACT.md R5, R6, R1
-- et NON-INPUT #4.
--
-- LE DÉFAUT CORRIGÉ ICI, en trois lignes de chaîne réelle :
--   1. `_shared/keel/meal_analysis.ts` calcule déjà `portion_band` ∈
--      {small, moderate, large, unclear} sur chaque photo ;
--   2. `buildRecognizedPayload` l'écrit dans `protocol_events.recognized` jsonb ;
--   3. le jsonb est un NON-INPUT de l'évaluateur (R5). L'évaluateur ne l'a
--      jamais lu, et un test de propriété l'interdit.
--   ⇒ le modèle voit une assiette manifestement énorme, l'écrit `large`, et la
--     ligne est notée exactement comme pour une portion `small`. On calcule le
--     signal et on le jette. C'est structurel, pas doctrinal.
--
-- CE QUE CETTE MIGRATION N'OUVRE PAS. NON-INPUT #4 est inchangé, mot pour mot :
--   « a photo may evidence presence/composition/portion/serving; it never
--     produces a micronutrient or energy/macro_* fact. »
-- La portion était DÉJÀ autorisée. Ce qui change, c'est qu'on arrête de
-- contredire le contrat par excès de zèle. `quantity` et `unit` restent NULL sur
-- toute ligne écrite par une photo, aujourd'hui et après cette migration : une
-- BANDE N'EST PAS UNE QUANTITÉ, et la colonne ci-dessous est un token (R1), pas
-- un nombre. Mesuré sur 85 appels réels du modèle de production
-- (PHOTO_QUANTIFICATION.md §3) : biais énergétique −26,6 %, agrégation hebdo qui
-- ne divise l'erreur que par 1,04, delta 2,5× pire que le niveau. On ne
-- quantifie pas l'énergie. On câble la quantité ordinale, sur laquelle le même
-- banc donne une classification excellente.
--
-- POURQUOI UNE COLONNE ET PAS UN CHAMP JSONB DE PLUS : R5. « Si l'évaluateur a
-- besoin d'une valeur, c'est une colonne. » Un CHECK atteint une colonne ; il
-- n'atteint pas une clé de jsonb (preuve dans le dépôt : `scheduled_days` est
-- CHECK-protégé pendant que `mission_days` en jsonb porte du français vivant).
--
-- APPLICATION : locale uniquement par un agent (`supabase db reset --local`).
-- Le push distant reste humain.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. La colonne. Token ASCII snake_case (R1), nullable, CHECK fermé.
--
-- NULLABLE et pas `not null default 'unclear'` : la très grande majorité des
-- faits ne sont pas des photos (tap, texte, intégration) et n'ont aucune bande
-- à porter. `unclear` est un verdict de photo — « j'ai regardé et je ne peux pas
-- trancher » — et le confondre avec « aucune photo n'a été prise » fabriquerait
-- une observation là où il n'y a rien. NULL = pas d'observation de portion ;
-- 'unclear' = observation faite, non concluante. Les deux sont lus par des
-- branches distinctes de l'évaluateur (R6).
-- ---------------------------------------------------------------------------
alter table public.protocol_events
  add column if not exists portion_band text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.protocol_events'::regclass
      and conname = 'protocol_events_portion_band_check'
  ) then
    alter table public.protocol_events
      add constraint protocol_events_portion_band_check
      check (portion_band is null or portion_band in (
        'small','moderate','large','unclear'
      ));
  end if;
end
$$;

comment on column public.protocol_events.portion_band is
  'R1 token ordinal de magnitude, écrit par analyze-meal-photo-v1 depuis la '
  'lecture vision. small < moderate < large ; unclear = observé, non '
  'concluant ; NULL = aucune observation de portion (fait non-photo). '
  'CONTRACT NON-INPUT #4 : une photo peut attester presence/composition/'
  'portion/serving, jamais energy/macro_*. Ce n''est PAS une quantité : '
  'quantity et unit restent NULL sur les faits photo.';


-- ---------------------------------------------------------------------------
-- 2. Index partiel — la distribution des bandes est une lecture COACH, par
--    semaine, sur les seules lignes qui en portent une.
--
-- « 11 assiettes vues : 2 small, 5 moderate, 4 large » est la réponse à « il
-- mange beaucoup ou peu ? » sans un seul kcal (PHOTO_QUANTIFICATION.md §5,
-- point 3). Elle se lit par (user_id, local_date) sur un sous-ensemble étroit.
-- ---------------------------------------------------------------------------
create index if not exists protocol_events_portion_band_idx
  on public.protocol_events (user_id, local_date)
  where portion_band is not null;


-- ---------------------------------------------------------------------------
-- 3. Backfill depuis le jsonb où le signal était déjà écrit.
--
-- Ce n'est pas une dérivation ni une inférence : c'est LE MÊME FAIT, produit par
-- la même lecture vision, déplacé de `recognized->>'portion_band'` vers la
-- colonne. Aucune valeur n'est inventée ; le filtre `in (...)` refait le CHECK à
-- la main pour qu'un jsonb historique porteur d'un token hors vocabulaire fasse
-- échouer la ligne SILENCIEUSEMENT (elle reste NULL) plutôt que la migration —
-- un jsonb non contraint peut contenir n'importe quoi, c'est précisément la
-- raison d'être de cette migration.
--
-- Restreint à source='photo' : `portion_band` n'a de sens que là. Un tap ou un
-- texte qui porterait la clé dans son jsonb n'est pas une observation de photo.
-- ---------------------------------------------------------------------------
update public.protocol_events
set portion_band = recognized->>'portion_band'
where source = 'photo'
  and portion_band is null
  and recognized ? 'portion_band'
  and recognized->>'portion_band' in ('small','moderate','large','unclear');
