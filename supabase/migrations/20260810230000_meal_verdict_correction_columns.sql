-- ============================================================================
-- FF-040 · CE QUE LA CORRECTION A SERVI, ET CE QU'ELLE N'A PAS PU COMBLER
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-040-la-boucle-de-correction.md
--
-- POURQUOI DEUX COLONNES ET PAS UN CHAMP DANS LE JSONB
-- ----------------------------------------------------
-- `verdict` est la MESURE. Ces deux colonnes sont ce que le produit en a FAIT.
-- Les mêler ferait relire un verdict comme s'il décrivait le plan servi, alors
-- qu'il décrit le plan APRÈS correction — et on ne saurait plus dire, six mois
-- plus tard, si une génération propre l'était d'emblée ou après une relance.
--
-- C'est aussi ce qui rend la mesure du §10 faisable: « quelle part des relances
-- améliore vraiment » ne se lit nulle part ailleurs.
-- ============================================================================

alter table public.meal_composition_verdicts
  add column if not exists tokens_served text[] not null default '{}';

alter table public.meal_composition_verdicts
  add column if not exists coverage_flag text;

-- `drop ... if exists` avant `add`: ce chantier n'a pas de filet de reset, et
-- une contrainte qui ne se pose qu'une fois est une migration cassée.
alter table public.meal_composition_verdicts
  drop constraint if exists meal_composition_verdicts_coverage_flag_check;
alter table public.meal_composition_verdicts
  add constraint meal_composition_verdicts_coverage_flag_check
  check (coverage_flag is null or coverage_flag in ('ok', 'unsatisfiable', 'unverified'));

comment on column public.meal_composition_verdicts.tokens_served is
  'FF-040: les jetons de correction réellement servis au modèle. Vide = le '
  'plan était dans la bande, ou son verdict n''était pas calculable. Un jeton '
  'écarté (préséance adhérence, groupe non prescriptible, axe éteint par la '
  'doctrine) n''y figure PAS — il est journalisé, pas stocké.';

comment on column public.meal_composition_verdicts.coverage_flag is
  'FF-040: ok | unsatisfiable | unverified. `unverified` n''est JAMAIS promu '
  'en `ok`: fail-closed sur la prétention, un vert par défaut affirmerait une '
  'couverture que personne n''a vérifiée. NULL = ligne écrite avant ce lot.';
