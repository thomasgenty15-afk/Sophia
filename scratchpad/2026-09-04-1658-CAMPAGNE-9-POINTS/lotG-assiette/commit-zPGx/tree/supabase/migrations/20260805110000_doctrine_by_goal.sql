-- ============================================================================
-- UNE DOCTRINE ÉCRITE, N DOCTRINES SERVIES — la portée par objectif
-- ============================================================================
-- Autorité: docs/nutrition-pivot/PROMPT-DOCTRINE-BY-GOAL.md.
--
-- LE PROBLÈME
-- -----------
-- Un coach a UNE doctrine publiée (index unique partiel `one_published`), et
-- elle porte cinq choses. Trois sont le coach lui-même — `voice`,
-- `vocabulary`, `forbidden` — et ne varient pas selon l'objectif de l'élève:
-- un coach ne change ni de voix ni de vocabulaire parce que son élève veut
-- prendre du muscle plutôt que perdre du gras. Deux varient fortement:
-- `beliefs` et `arbitrations`. « Ne t'affole pas d'un plateau sur la balance »
-- ne s'adresse qu'à quelqu'un en perte de gras.
--
-- Tout était servi identiquement à tous les élèves d'un coach. Le coach devait
-- donc choisir entre écrire des convictions génériques (et perdre ce qui fait
-- sa valeur) et en écrire de précises (que Sophia servait à des élèves à qui
-- elles ne s'adressaient pas).
--
-- CE QUE CETTE MIGRATION FAIT — ET CE QU'ELLE NE FAIT PAS
-- -------------------------------------------------------
-- Elle CONTRAINT la portée facultative que les entrées de `beliefs` et
-- `arbitrations` portent désormais, et elle donne un endroit aux compilés par
-- objectif. Elle ne crée AUCUNE ligne `coach_doctrines` supplémentaire.
--
-- ⚠️ POURQUOI PAS N LIGNES `coach_doctrines`
-- L'index `coach_doctrines_one_published_idx` existe pour qu'il y ait une
-- réponse DÉTERMINISTE à « quelle doctrine s'applique au prochain message ».
-- Multiplier les lignes publiées rouvrirait exactement cette question. Les
-- variantes sont un PRODUIT DÉRIVÉ de la ligne publiée, et elles vivent dans
-- une table à part dont la clé dit ce qu'elle est: `(doctrine_id, goal)`.
--
-- NON CASSANT PAR CONSTRUCTION
-- ----------------------------
-- `beliefs` et `arbitrations` sont des tableaux jsonb d'objets. Ajouter un
-- champ FACULTATIF par entrée ne touche à aucune ligne existante: une entrée
-- sans `goal_scope` est GLOBALE, ce qui est exactement le comportement
-- d'aujourd'hui. Le CHECK ci-dessous passe donc sur toutes les doctrines déjà
-- écrites, et il est validé (pas `not valid`) précisément pour le prouver à
-- l'application de cette migration plutôt que de l'espérer.

-- ============================================================================
-- 1. LA CONTRAINTE DE PORTÉE — ce sur quoi le compilateur branche est
--    contraignable par la base
-- ============================================================================
-- R5, appliqué à du jsonb: un `goal_scope` ne peut pas être une colonne typée
-- ici (il est PAR ENTRÉE d'un tableau), mais il peut être vérifié. Sans ça,
-- 'fatloss' ou 'cutting' s'écrivent sans bruit et la croyance devient muette
-- pour tout le monde — le coach ne comprend pas pourquoi sa restriction ne
-- fait rien.
--
-- La fonction est IMMUTABLE et ne lit que son argument: elle est utilisable
-- dans un CHECK, et deux évaluations sur la même valeur rendent la même
-- réponse. Le vocabulaire est recopié ici parce qu'un CHECK ne peut pas lire
-- une table; il est aligné sur `student_goals.goal` (même migration que le
-- CHECK de cette colonne) et sur `GOAL_TOKENS` de `_shared/keel/tokens.ts`.
create or replace function public.keel_doctrine_goal_scope_ok(entries jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    -- Une valeur qui n'est pas un tableau n'est pas du ressort de CE check:
    -- le parseur applicatif la traite déjà (liste vide), et faire échouer
    -- l'écriture ici transformerait une tolérance en panne.
    when entries is null or jsonb_typeof(entries) <> 'array' then true
    else not exists (
      select 1
      from jsonb_array_elements(entries) as e
      where jsonb_typeof(e) = 'object'
        and e ? 'goal_scope'
        and (
          -- présent mais pas un tableau
          jsonb_typeof(e->'goal_scope') <> 'array'
          -- ou contenant un jeton hors vocabulaire
          or exists (
            select 1
            from jsonb_array_elements_text(e->'goal_scope') as g
            where g not in (
              'fat_loss', 'recomposition', 'performance', 'health', 'maintenance'
            )
          )
        )
    )
  end;
$$;

comment on function public.keel_doctrine_goal_scope_ok(jsonb) is
  'Lot doctrine-by-goal: chaque entrée de beliefs/arbitrations peut porter un '
  'goal_scope, qui doit être un tableau de goals connus. Absent = global.';

alter table public.coach_doctrines
  drop constraint if exists coach_doctrines_beliefs_goal_scope_check;
alter table public.coach_doctrines
  add constraint coach_doctrines_beliefs_goal_scope_check
  check (public.keel_doctrine_goal_scope_ok(beliefs));

alter table public.coach_doctrines
  drop constraint if exists coach_doctrines_arbitrations_goal_scope_check;
alter table public.coach_doctrines
  add constraint coach_doctrines_arbitrations_goal_scope_check
  check (public.keel_doctrine_goal_scope_ok(arbitrations));

comment on column public.coach_doctrines.beliefs is
  'PIVOT §3.7: [{ "claim", "rationale", "goal_scope": [] }]. goal_scope absent '
  'ou vide = la conviction vaut pour TOUS les élèves du coach.';

comment on column public.coach_doctrines.arbitrations is
  'PIVOT §1.4: [{ "situation", "coach_answer", "source", "goal_scope": [] }]. '
  'C''est le champ le plus souvent ciblé: « qu''est-ce que je réponds quand on '
  'ne perd plus » n''existe que pour la perte de gras.';

-- LES INTERDITS N'EN PRENNENT PAS, ET C'EST ÉCRIT DANS LA BASE.
--
-- Pas de contrainte qui l'empêche — un `goal_scope` écrit sur un interdit est
-- ignoré par le compilateur, pas refusé — mais le commentaire doit dire
-- pourquoi, parce que c'est la question qu'un lecteur se posera en premier:
-- un interdit borné à un objectif signifie que Sophia peut dire à un élève ce
-- qu'elle a interdiction de dire à un autre. C'est une préférence, pas un
-- interdit.
comment on column public.coach_doctrines.forbidden is
  'LES INTERDITS. [{ "token", "surface_forms", "reason", "instead" }]. '
  'GLOBAUX PAR CONSTRUCTION: un interdit qui ne vaudrait que pour certains '
  'élèves est une préférence. Le verrou déterministe §3.3 lit cette liste '
  'entière quelle que soit la variante servie.';


-- ============================================================================
-- 2. LES COMPILÉS PAR OBJECTIF
-- ============================================================================
-- CE QUE CETTE TABLE EST, ET CE QU'ELLE N'EST PAS
--
-- Elle n'est PAS la source du bloc servi au tour: `doctrine_loader.ts`
-- recompile depuis les colonnes jsonb à chaque chargement, parce que le
-- compilateur est pur et que le hash de contenu EST l'invalidation. Une
-- variante périmée ne peut donc pas atteindre un élève, même si cette table
-- était en retard.
--
-- Elle est (a) l'artefact stocké dont `compiled_prompt` / `compiled_prompt_hash`
-- étaient la version à UNE variante — les garder seuls laisserait dans le
-- schéma un hash qui ne décrit plus ce que reçoit le moindre élève —, et (b)
-- la surface sur laquelle la FRAGMENTATION DU CACHE se mesure au lieu de se
-- supposer:
--
--   select count(*) as variantes, count(distinct compiled_prompt_hash) as entrees
--   from public.coach_doctrine_compilations where doctrine_id = $1;
--
-- POURQUOI UNE TABLE ET PAS UNE COLONNE JSONB INDEXÉE PAR OBJECTIF
--   · la clé de variante est CONTRAINTE (`goal in (...)`), ce qu'un objet
--     jsonb ne sait pas faire: une variante 'fatloss' s'y écrirait sans bruit;
--   · le comptage de fragmentation est une requête, pas un dépliage applicatif;
--   · l'aperçu du coach lit UNE ligne au lieu de charger les six.
-- Le seul avantage du jsonb — l'atomicité gratuite d'un UPDATE — est rendu par
-- `keel_replace_doctrine_compilations` ci-dessous, qui remplace le jeu entier
-- en une transaction.
create table if not exists public.coach_doctrine_compilations (
  doctrine_id uuid not null
    references public.coach_doctrines(id) on delete cascade,

  -- 'default' EST UNE VALEUR, pas une absence.
  --
  -- Trois chemins n'ont pas d'objectif d'élève: l'élève qui vient d'arriver et
  -- n'a pas rempli `student_goals`, le coach en mode test qui parle à son
  -- propre agent, et une génération déclenchée par un cron. NULL aurait été le
  -- réflexe, mais NULL ne peut pas entrer dans une clé primaire et forcerait un
  -- index partiel plus un cas particulier dans chaque requête. Un jeton nommé
  -- fait de « la variante de ceux dont on ignore le but » une ligne comme les
  -- autres.
  goal text not null check (goal in (
    'default', 'fat_loss', 'recomposition', 'performance', 'health', 'maintenance'
  )),

  compiled_prompt text not null,
  -- La clé de cache du fournisseur pour CETTE variante. Hash de CONTENU: deux
  -- variantes au texte identique la partagent — c'est un succès de cache, pas
  -- une collision — et deux variantes différentes ne peuvent pas la partager.
  compiled_prompt_hash text not null,

  compiled_at timestamptz not null default now(),

  primary key (doctrine_id, goal)
);

create index if not exists coach_doctrine_compilations_hash_idx
  on public.coach_doctrine_compilations (compiled_prompt_hash);

comment on table public.coach_doctrine_compilations is
  'Lot doctrine-by-goal: le bloc compilé d''une doctrine POUR UN OBJECTIF. '
  'Produit dérivé de la ligne publiée, jamais une seconde doctrine. Le tour '
  'recompile depuis coach_doctrines; cette table est l''artefact stocké et la '
  'surface de mesure de la fragmentation du cache.';


-- ============================================================================
-- 3. LE REMPLACEMENT ATOMIQUE — « une variante périmée qui survit est
--    indétectable »
-- ============================================================================
-- La publication ne recalcule pas « les variantes qui ont changé »: elle
-- remplace le JEU ENTIER. Il n'y a donc aucun calcul de delta à se tromper, et
-- aucune variante qu'on pourrait oublier de recompiler.
--
-- Le delete et les inserts sont dans UNE fonction, donc dans UNE transaction:
-- il n'existe pas d'instant où une doctrine porte trois variantes neuves et
-- trois anciennes. Une fonction edge qui ferait `delete` puis `insert` en deux
-- appels PostgREST, elle, laisserait cette fenêtre grande ouverte.
create or replace function public.keel_replace_doctrine_compilations(
  p_doctrine_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted integer;
begin
  if p_doctrine_id is null then
    raise exception 'doctrine_id required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array';
  end if;

  -- Le remplacement est TOTAL. Une variante retirée du jeu disparaît, elle ne
  -- reste pas là à servir un texte que le coach a cessé d'écrire.
  delete from public.coach_doctrine_compilations
  where doctrine_id = p_doctrine_id;

  insert into public.coach_doctrine_compilations
    (doctrine_id, goal, compiled_prompt, compiled_prompt_hash)
  select
    p_doctrine_id,
    r->>'goal',
    r->>'compiled_prompt',
    r->>'compiled_prompt_hash'
  from jsonb_array_elements(p_rows) as r;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.keel_replace_doctrine_compilations(uuid, jsonb) from public;
revoke all on function public.keel_replace_doctrine_compilations(uuid, jsonb) from anon;
revoke all on function public.keel_replace_doctrine_compilations(uuid, jsonb) from authenticated;

comment on function public.keel_replace_doctrine_compilations(uuid, jsonb) is
  'Remplace TOUT le jeu de variantes compilées d''une doctrine, en une '
  'transaction. Appelée par coach-doctrine-v1 (service_role) à la publication.';


-- ============================================================================
-- 4. RLS ET PRIVILÈGES
-- ============================================================================
-- Le coach LIT ses propres compilés (l'aperçu par objectif de son écran) et
-- n'en écrit jamais: ce sont des dérivés, et une écriture directe produirait un
-- bloc qui ne correspond à aucune doctrine. L'élève n'a AUCUNE policy — il
-- reçoit le bloc dans son prompt, il ne lit jamais la table.
alter table public.coach_doctrine_compilations enable row level security;

drop policy if exists coach_doctrine_compilations_coach_read
  on public.coach_doctrine_compilations;
create policy coach_doctrine_compilations_coach_read
  on public.coach_doctrine_compilations
  for select to authenticated
  using (
    doctrine_id in (
      select d.id
      from public.coach_doctrines d
      join public.coaches c on c.id = d.coach_id
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

-- `revoke ... from public` NE RETIRE RIEN à `anon`: les default privileges de
-- Supabase accordent à `anon` et `authenticated` sur toute table neuve du
-- schéma public, et ce sont des rôles NOMMÉS. On révoque donc nommément, et
-- c'est sur `anon` que la vérification doit porter — jamais sur `public`.
revoke all on public.coach_doctrine_compilations from anon;
