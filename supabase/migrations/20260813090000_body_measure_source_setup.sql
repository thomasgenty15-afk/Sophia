-- ============================================================================
-- FF-060 — LE POIDS SAISI À L'ENTRÉE A SA PROPRE PROVENANCE
--
-- ── POURQUOI UN QUATRIÈME JETON, ET PAS `plan_card` ────────────────────────
--
-- `student_body_measures.source` est un vocabulaire FERMÉ à trois valeurs, et
-- il est de l'AUDIT: il dit d'où vient un nombre qui arme une ceinture de
-- sécurité. `restriction_guard.ts` compare deux poids hebdomadaires distants de
-- quatorze jours contre `max_weekly_loss_pct = 1.2` pour détecter une perte
-- rapide — quand ce drapeau se lève, la première question est « d'où viennent
-- ces deux nombres ».
--
-- Réutiliser `plan_card` pour le parcours d'entrée ferait répondre « la carte
-- de mesures de /app/plan » à propos d'un nombre saisi dans un tout autre
-- écran, à un tout autre moment (le jour de l'inscription, avant qu'aucun plan
-- n'existe). C'est bon marché à écrire et cher à débusquer: la personne qui
-- relit l'historique six mois plus tard n'a aucun moyen de savoir que
-- l'étiquette ment.
--
-- ⚠️ AUCUN CHEMIN NE BRANCHE SUR CETTE COLONNE aujourd'hui — vérifié le
-- 2026-08-13: `weekly_flow_io.ts` l'ÉCRIT (`measures_card` → `plan_card`,
-- sinon `sunday_flow`) et personne ne la LIT pour décider quoi que ce soit.
-- C'est précisément pour ça qu'elle doit rester vraie: une colonne dont rien ne
-- dépend est une colonne que personne ne vérifie, donc celle où un mensonge
-- survit le plus longtemps.
--
-- Le premier poids de quelqu'un est un point de départ de série. Il doit être
-- dans `student_body_measures` — et pas seulement dans le corps de foyer —
-- sinon la ceinture n'a rien à quoi comparer le second.
-- ============================================================================

alter table public.student_body_measures
  drop constraint if exists student_body_measures_source_check;

alter table public.student_body_measures
  add constraint student_body_measures_source_check
  check (source in ('sunday_flow', 'plan_card', 'chat', 'setup'));

comment on column public.student_body_measures.source is
  'D''où vient la mesure. Vocabulaire fermé: sunday_flow (le point du dimanche), '
  'plan_card (la carte de /app/plan), chat (le plancher déterministe de FF-008), '
  'setup (le parcours d''entrée FF-060, la première mesure d''une série).';
