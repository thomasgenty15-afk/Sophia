-- ============================================================================
-- FF-041 · LA MÉTHODE DE COMPOSITION DU COACH, SUR SA DOCTRINE
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-041-la-methode-du-coach-executable.md
-- Design d'origine: scratchpad/DESIGN-UNITES-DE-COMPOSITION.md §3.1
--
-- UNE COLONNE, PAS UNE TABLE — ET C'EST UN ARBITRAGE
-- --------------------------------------------------
-- La méthode de composition du coach DOIT vivre sur l'objet doctrine:
-- versionné, publié d'un bloc, rollbackable. Un rollback la ramène avec le
-- reste, la version part dans `generated_from`, et la publication reste
-- atomique. C'est exactement le précédent `daily_practices` (FF-001), et c'est
-- ce qui distingue une méthode d'une configuration.
--
-- Une table `coach_composition_policies` à côté aurait forké le cycle de vie de
-- la doctrine: deux cycles de configuration coach, pas de version de politique
-- dans `generated_from`, pas de publication atomique.
--
-- CE QUE CETTE COLONNE N'EST PAS
-- ------------------------------
-- Un formulaire montré au coach. §3.0 du design: il ne voit JAMAIS un axe du
-- moteur. Il répond à un DÉBAT de doctrine, dans son langage; ce jsonb est la
-- forme COMPILÉE de sa réponse, dérivée à la publication comme
-- `compileDoctrineBlock` dérive le bloc chat de ses convictions.
--
-- AUCUN CHECK SUR LE CONTENU, ET C'EST DÉLIBÉRÉ
-- ---------------------------------------------
-- Les règles (« protein jamais off », « une primaire par objectif »,
-- « carb_timing hors performance rejeté ») sont des VALIDATIONS DE PUBLICATION
-- à erreur bruyante, dans `composition_steering.ts`. Une contrainte qui vit
-- dans la base ne peut pas expliquer au coach ce qu'il a écrit de faux: elle
-- rend un code d'erreur PostgREST que l'écran ne sait pas traduire.
--
-- Le seul CHECK est de FORME (un tableau), parce qu'un jsonb qui n'est pas un
-- tableau ferait échouer le parseur au lieu de compter une entrée.
--
-- LE HASH DU BLOC CHAT NE BOUGE PAS
-- ---------------------------------
-- Cette colonne est EXCLUE de `compileDoctrineBlock`, comme `daily_practices`.
-- Le bloc injecté à chaque tour de conversation ne change donc pas d'un octet,
-- pour toute la base: zéro refragmentation de cache. Un test d'empreinte le
-- tient.
-- ============================================================================

alter table public.coach_doctrines
  add column if not exists composition_steering jsonb not null default '[]'::jsonb;

alter table public.coach_doctrines
  drop constraint if exists coach_doctrines_composition_steering_is_array;
alter table public.coach_doctrines
  add constraint coach_doctrines_composition_steering_is_array
  check (jsonb_typeof(composition_steering) = 'array');

comment on column public.coach_doctrines.composition_steering is
  'FF-041: la forme COMPILÉE des positions du coach sur la composition. '
  'JAMAIS un formulaire qui lui est montré — il répond à un débat de doctrine, '
  'et ce jsonb en est dérivé à la publication. Exclue de compileDoctrineBlock: '
  'le hash du bloc chat doit rester inchangé pour toute la base. Les '
  'validations (protein jamais off, une primaire par objectif) vivent dans '
  '_shared/keel/composition_steering.ts, pas dans un CHECK.';
