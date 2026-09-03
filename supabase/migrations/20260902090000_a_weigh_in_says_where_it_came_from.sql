-- ============================================================================
-- FF-062 C2 — LE RAPPEL DE PESÉE A SA PROPRE PROVENANCE
--
-- ── POURQUOI UN CINQUIÈME JETON, ET PAS `chat` ─────────────────────────────
--
-- `student_body_measures.source` est un vocabulaire FERMÉ, et il est de
-- l'AUDIT: il dit d'où vient un nombre qui arme une ceinture de sécurité.
-- `restriction_guard.ts` compare deux poids hebdomadaires distants de quatorze
-- jours contre `max_weekly_loss_pct = 1.2`; quand ce drapeau se lève, la
-- première question est « d'où viennent ces deux nombres ».
--
-- `chat` désigne le plancher déterministe de FF-008 — un poids que l'élève a
-- ÉCRIT dans une phrase, que le produit a extrait. Une pesée de C2 est l'autre
-- chose: un nombre saisi dans un champ, en réponse à une question que le
-- produit a posée, à une cadence qu'il a choisie. Les confondre rendrait
-- impossible la seule mesure qui dira si ce canal vaut son coût (§10 de la
-- fiche: « combien de pesées viennent du rappel, et pas d'ailleurs »).
--
-- ⚠️ LA MÊME LEÇON QUE `setup` (20260813090000), ET ELLE EST ÉCRITE LÀ-BAS:
-- « une colonne dont rien ne dépend est une colonne que personne ne vérifie,
-- donc celle où un mensonge survit le plus longtemps ». C'est toujours vrai —
-- aucun chemin ne BRANCHE sur cette colonne, et c'est précisément pour ça
-- qu'elle doit rester exacte.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- Elle ne réécrit aucune ligne. Les pesées déjà en base gardent leur `source`:
-- ce sont des lectures faites à une date, pas des données à normaliser.
-- ============================================================================

alter table public.student_body_measures
  drop constraint if exists student_body_measures_source_check;

alter table public.student_body_measures
  add constraint student_body_measures_source_check
  check (source in ('sunday_flow', 'plan_card', 'chat', 'setup', 'weigh_in'));

comment on column public.student_body_measures.source is
  'D''où vient la mesure. Vocabulaire fermé: sunday_flow (le point du dimanche), '
  'plan_card (la carte de /app/plan), chat (le plancher déterministe de FF-008), '
  'setup (le parcours d''entrée FF-060, la première mesure d''une série), '
  'weigh_in (le rappel de pesée FF-062 C2, tous les 2 ou 5 jours selon l''objectif).';
