-- ===========================================================================
-- FF-059 — L'INTERRUPTEUR DE L'ÉLÈVE, PORTE ④ DE LA CHAÎNE DE GARDES.
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
--
-- CE QU'IL EST, ET CE QU'IL N'EST PAS
-- -----------------------------------
-- C'est la QUATRIÈME porte, et la seule que l'élève tient. Il n'a aucun pouvoir
-- sur les trois autres:
--
--   ① plancher TCA (`restriction_flag`) . calculé côté serveur à chaque lecture,
--                                          depuis `weekly_reviews` / les textes.
--                                          Cette colonne ne l'atteint pas.
--   ② mineur ............................ dérivé de `profiles.birth_date`.
--   ③ doctrine `counting` du coach ...... jeton `count_calories` de la doctrine
--                                          publiée.
--
-- Mettre `true` ici n'ouvre donc RIEN par soi-même: c'est une permission de plus
-- à obtenir, jamais une dérogation. C'est très exactement pour ça que la porte
-- ④ est la dernière de la chaîne et pas la première.
--
-- LE DÉFAUT EST `false`, ET C'EST UNE DÉCISION
-- --------------------------------------------
-- La décision produit du 2026-08-12 dit « les calories s'affichent ». Elle ne
-- dit pas « à tout le monde, rétroactivement, le jour du déploiement ». Trois
-- raisons de partir éteint, et la première suffit:
--
--   1. LE PLANCHER TCA EST UN DÉTECTEUR EN RETARD. `evaluateRestrictionGuard`
--      a besoin de bilans hebdomadaires, de journées d'énergie et de textes. Un
--      élève qui commence à se restreindre AUJOURD'HUI a un historique vide et
--      un `restriction_flag` à `false`. Défaut allumé = un chiffre sous ses yeux
--      avant que la porte ① puisse savoir quoi que ce soit. Levinson 2017 (73 %)
--      rend cette asymétrie décisive.
--   2. Ce produit n'a JAMAIS montré de chiffre à personne. Allumer par défaut
--      applique un renversement à une cohorte entière qui ne l'a pas demandé.
--   3. §10 de la fiche veut MESURER l'usage de l'interrupteur. Éteint par
--      défaut, la métrique mesure la DEMANDE; allumé, elle mesure la gêne. La
--      demande est le signal utile pour une première version, et c'est celui
--      dont il est le moins coûteux de se tromper.
--
-- RÉVERSIBILITÉ — une ligne, dans les deux sens:
--   alter table public.profiles
--     alter column energy_display_enabled set default true;
--   update public.profiles set energy_display_enabled = true
--    where keel_role = 'student';           -- si l'on veut aussi le rétroactif
--
-- NOT NULL, PAS DE TROISIÈME ÉTAT
-- -------------------------------
-- Un `null` « il n'a jamais répondu » obligerait à choisir quand même une
-- valeur effective à la lecture — donc à écrire le défaut à DEUX endroits, dont
-- un en TypeScript. Ce dépôt a la cicatrice des constantes en double. Et la
-- variante honnête du tri-état — demander à l'élève « veux-tu voir tes
-- calories ? » — est elle-même une invitation à compter, posée à tout le monde,
-- y compris à ceux que la porte ① aurait fini par protéger.
-- ===========================================================================

begin;

alter table public.profiles
  add column if not exists energy_display_enabled boolean not null default false;

comment on column public.profiles.energy_display_enabled is
  'FF-059 porte ④ — l''élève accepte de voir le chiffre d''énergie de ses plats. '
  'Défaut false: le produit n''a jamais montré de chiffre, et le plancher TCA '
  'est un détecteur EN RETARD (il lui faut un historique). N''ouvre rien à lui '
  'seul: les portes ① plancher, ② mineur et ③ doctrine du coach se calculent '
  'ailleurs et gagnent contre lui. Aucun chiffre n''est stocké nulle part — '
  'voir _shared/keel/plan_energy.ts, qui recalcule à chaque lecture.';

commit;
