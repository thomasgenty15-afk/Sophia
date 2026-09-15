-- ════════════════════════════════════════════════════════════════════════════
-- LA PORTÉE D'UN RÉGIME SE DEMANDE — troisième `about` des clarifications
--
-- « On mange végétarien le lundi soir » avait été rangé en régime STRICT de la
-- titulaire, qui gouverne tout le foyer: quatre omnivores ont mangé végétarien
-- à tous les repas (campagne du 2026-09-04, §8.1). Le prompt distingue depuis
-- un RYTHME (un jour, un moment, une fréquence ⇒ une note avec son `when`)
-- d'un RÉGIME (toujours ⇒ sécurité). Reste le cas où la phrase ne dit ni l'un
-- ni l'autre — « on mange végétarien », « on essaie de manger vegan » — et où
-- deviner écrit une contrainte de sécurité sur une supposition.
--
-- La sortie est de DEMANDER, par le canal qui existe (`memory_clarifications`,
-- 20260904090000): `about = 'scope'`, deux options par position (`always`,
-- `sometimes`), et RIEN d'écrit tant que la réponse n'est pas là. Miroir de
-- `MEMORY_CLARIFICATION_ABOUTS` dans `_shared/keel/memory_clarification.ts`.
--
-- ⚠️ DROP-AND-RE-ADD, comme les quatre redéfinitions du CHECK `ask_kind`: une
-- liste fermée n'accepte pas un `add constraint if not exists`.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.memory_clarifications
  drop constraint if exists memory_clarifications_about_check;

alter table public.memory_clarifications
  add constraint memory_clarifications_about_check
  check (about in ('who', 'what', 'scope'));

comment on column public.memory_clarifications.about is
  'Ce qu''on n''a pas su résoudre: la personne (who), l''aliment (what), ou '
  'la PORTÉE d''une règle de régime (scope — toujours ⇒ sécurité, parfois ⇒ '
  'note). Miroir de MEMORY_CLARIFICATION_ABOUTS.';
