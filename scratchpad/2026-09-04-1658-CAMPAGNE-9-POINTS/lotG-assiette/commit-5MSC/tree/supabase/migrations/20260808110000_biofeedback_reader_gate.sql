-- R4 — LES SIX AXES DU DIMANCHE NE SE COLLECTENT QUE LÀ OÙ QUELQU'UN LES LIT.
--
-- ── LA RÈGLE MÈRE, APPLIQUÉE À LA LETTRE ────────────────────────────────────
-- « On ne collecte une donnée que si quelque chose en aval la consomme — le
-- plan, une ceinture de sécurité, ou le coach. » (`docs/fonctionnalites/
-- conversation/README.md`, direction arrêtée le 2026-08-08.)
--
-- Les six axes notés 1-5 du point hebdomadaire (énergie, faim, sommeil,
-- digestion, humeur, entraînement) n'ont qu'UN consommateur: la synthèse de
-- cohorte que lit le coach. Le plan ne les lit pas, aucune ceinture ne les lit.
-- En B2C — pas de coach humain — personne ne les lit. Les demander quand même,
-- c'est faire remplir six champs par semaine pour une donnée qui ne change rien:
-- « une question dont la réponse ne change rien est de la charge mentale
-- déguisée en attention ».
--
-- Le POIDS et le TOUR DE TAILLE, eux, restent demandés à tout le monde: ils ont
-- des consommateurs indépendants du coach (`/app/progress`, la ceinture
-- restrictive, FF-008). Le point hebdo B2C se réduit donc à ces deux mesures.
--
-- ── POURQUOI LE COACH « MAISON » NE COMPTE PAS ──────────────────────────────
-- `coach_kind = 'house'` est l'identité sous laquelle l'inscription libre
-- rattache un élève sans coach réel (`20260805090000_house_coach_identity.sql`).
-- La méthode maison n'a pas de synthèse hebdomadaire — il n'y a personne pour
-- ouvrir la page du lundi. Un élève rattaché à la maison est donc en B2C au sens
-- de cette règle, malgré la ligne `coach_clients` qui existe. Tester la
-- PRÉSENCE d'un lien aurait armé la collecte pour tout le monde.
--
-- ── POURQUOI UNE FONCTION ET PAS UNE LECTURE DIRECTE ────────────────────────
-- L'élève peut lire sa propre ligne `coach_clients` (policy
-- `coach_clients_student_select`) mais PAS la ligne `coaches` de son coach:
-- `coaches_self_select` ne rend que la sienne, et un élève n'en a pas. Le
-- `coach_kind` lui est donc structurellement invisible, et c'est bien: la seule
-- chose qu'il a besoin de savoir est « est-ce que quelqu'un lit ça ? », pas qui
-- est son coach ni de quel genre. La fonction rend ce booléen et rien d'autre —
-- elle ne fuit ni identifiant ni nom.
--
-- Miroir de `my_coach_ids()` (`20260804210000_coach_recipe_library.sql`): même
-- définition du lien actif, deux `status = 'active'`. Une définition divergente
-- donnerait un écran qui demande les axes à un élève que la synthèse ne compte
-- pas — ou l'inverse, une synthèse vide en attendant une donnée qu'on ne demande
-- plus.

create or replace function public.my_biofeedback_has_reader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_clients cc
    join public.coaches c on c.id = cc.coach_id
    where cc.student_user_id = (select auth.uid())
      and cc.status = 'active'
      and c.status = 'active'
      -- `<> 'house'` et non `= 'human'`: si la liste fermée s'ouvre un jour à un
      -- troisième genre, un genre inconnu doit compter comme un lecteur (il a une
      -- page à lui) plutôt que d'éteindre la collecte en silence. La colonne est
      -- `not null default 'human'`, donc ce test ne peut pas rendre NULL.
      and c.coach_kind <> 'house'
  );
$$;

comment on function public.my_biofeedback_has_reader() is
  'Quelqu''un lit-il les six axes du point hebdo de l''élève courant ? Vrai '
  'seulement s''il a un lien ACTIF vers un coach HUMAIN actif — le coach '
  '« maison » n''a pas de synthèse, donc personne ne les lit. L''écran ne '
  'demande les axes que quand c''est vrai (règle mère: on ne collecte que ce '
  'qu''un aval consomme). Le poids et le tour de taille, eux, se demandent '
  'toujours: ils ont des lecteurs qui ne dépendent pas du coach.';

-- ⚠️ `from public` NE SUFFIT PAS, ET C'EST MESURÉ ICI.
-- Les privilèges par défaut de Supabase accordent `execute` à `anon` et
-- `authenticated` DIRECTEMENT, pas via `public`: après le seul
-- `revoke ... from public`, `has_function_privilege('anon', ..., 'execute')`
-- rendait encore `t`. Vérifié sur la base locale le 2026-08-08 — et
-- `my_coach_ids()`, dont ce fichier est le miroir, porte encore la fuite.
--
-- Sans conséquence exploitable (`auth.uid()` est NULL sous `anon`, donc la
-- fonction rend `false`), mais on ne laisse pas une surface ouverte au motif
-- qu'elle rend faux: c'est la même classe que `revoke from public laisse anon`.
revoke all on function public.my_biofeedback_has_reader() from public;
revoke all on function public.my_biofeedback_has_reader() from anon;
grant execute on function public.my_biofeedback_has_reader() to authenticated;
