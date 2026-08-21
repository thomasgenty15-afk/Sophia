-- KEEL — ③ LA PORTE DE `household_traditions`, FERMÉE (2026-08-20).
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ CE QUE `20260820160000` A LAISSÉ OUVERT, ET C'EST UNE CICATRICE ÉCRITE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Elle affirme, dans son propre commentaire de table: « Aucun grant à
-- `authenticated`, comme `household_member_bodies` ». **C'était faux à
-- l'instant où la ligne a été écrite**, et c'est mesuré:
--
--     has_table_privilege('anon',          'household_traditions', 'SELECT')    = t
--     has_table_privilege('authenticated', 'household_traditions', 'SELECT')    = t
--     has_table_privilege('authenticated', 'household_traditions', 'TRUNCATE')  = t
--
-- Le dépôt documente exactement ça: **`authenticated` a TOUT sur toute table
-- NEUVE**, par les privilèges par défaut de Supabase. Ne rien écrire ne ferme
-- rien — ça ouvre. Et `TRUNCATE` n'est pas gouverné par RLS: une table de foyer
-- laissée en l'état est une table que n'importe quel compte peut VIDER.
--
-- ⚠️ ET `revoke ... from public` NE SUFFIT PAS: `anon` a son propre grant
-- implicite, séparé de `public`. C'est la seconde cicatrice, et elle vaut ici
-- exactement comme sur les fonctions.
--
-- ⚠️ POURQUOI UNE SECONDE MIGRATION PLUTÔT QU'UNE CORRECTION DE LA PREMIÈRE.
-- La première est DÉJÀ APPLIQUÉE. La corriger sur le disque laisserait le
-- registre et le fichier d'accord sur un numéro et en désaccord sur ce qu'il
-- fait — « migration hors ordre = sautée en silence », par l'autre bout. Une
-- migration de plus est visible, rejouable, et idempotente.

revoke all on table public.household_traditions from public, anon, authenticated;

-- ── RLS ARMÉE, AUCUNE POLICY — LE MÊME RÉGIME QUE LES CORPS ────────────────
--
-- ⚠️ CE N'EST PAS UNE CEINTURE DE PLUS SUR LA MÊME BRETELLE. Le `revoke`
-- ferme la porte d'aujourd'hui; RLS ferme celle de DEMAIN — le jour où
-- quelqu'un rétablira un grant « pour débloquer un écran », ce qui est
-- exactement comme ces portes se rouvrent. Sans policy, `authenticated` ne
-- verrait toujours aucune ligne.
--
-- ⛔ ET LES DEUX SONT NÉCESSAIRES, PAS REDONDANTES: RLS ne gouverne PAS
-- `TRUNCATE`. Seul le `revoke` le ferme.
--
-- Les trois RPC de `20260820160000` sont `security definer`: elles traversent
-- RLS, et restent le seul chemin.
alter table public.household_traditions enable row level security;
alter table public.household_traditions force row level security;

comment on table public.household_traditions is
  'Les jours que le foyer NE DÉPLACE PAS (③, 2026-08-20). Un fait PERMANENT, '
  'claveté sur un jour de SEMAINE et un moment — pas une envie datée '
  '(`household_envy_submissions`, clavetée sur `week_start`, n''est pas le bon '
  'support). ⛔ Ne porte QUE la forme positive (« dimanche rôti »): « samedi on '
  'commande » existe déjà comme `away_days kind=eating_out`, et en faire une '
  'seconde écriture donnerait deux magasins pour un même fait. '
  '⛔ AUCUN privilège à `anon` ni `authenticated`, et RLS armée sans policy '
  '(`20260820161000`): les privilèges par défaut de Supabase les avaient tous '
  'donnés, TRUNCATE compris, et TRUNCATE échappe à RLS. La lecture passe par '
  '`keel_household_traditions()` (navigateur) ou '
  '`keel_household_traditions_for(uuid)` (serveur).';
