-- ===========================================================================
-- REPAS GÉNÉRÉS, LISTE DE COURSES, ET DEUX SECTIONS DE PLUS DANS LA MÉTHODE
-- ===========================================================================
--
-- Trois choses arrivent ici, et la première explique les deux autres.
--
-- ── 1. LA MÉTHODE DU COACH GAGNE DEUX SECTIONS ───────────────────────────
-- `foods` : les aliments qu'il conseille et ceux qu'il déconseille.
-- `qa`    : ses questions/réponses, structurées à partir de sa prose.
--
-- Pourquoi `foods` n'est PAS rangé dans `forbidden` alors que les deux
-- interdisent : ils ne portent pas sur la même chose et ne se réparent pas
-- pareil. Un `forbidden` est une PRATIQUE ("six petits repas", "jeûne
-- intermittent") et son remède est un `instead` écrit par le coach. Un aliment
-- déconseillé est un INGRÉDIENT, et son remède est un autre ingrédient, choisi
-- à la volée par le générateur. Les fondre aurait obligé le coach à écrire un
-- `instead` verbatim pour chaque aliment qu'il n'aime pas — c'est-à-dire à
-- ne jamais remplir la section.
--
-- ── 2. LES REPAS GÉNÉRÉS VIVENT DANS LEUR PROPRE TABLE ───────────────────
-- Et surtout PAS dans `meal_ideas`. Cette table porte
-- `meal_ideas_author_kind_check` qui n'accepte que 'coach' et 'keel_library',
-- délibérément : "a model that writes what a student eats is the one thing
-- this product exists not to be" (keel-meal-plan-v1). Ce CHECK n'est pas
-- desserré ici. La bibliothèque du coach reste écrite par le coach.
--
-- Un repas généré est un OBJET DIFFÉRENT : il est produit pour un élève, à un
-- moment, à partir de son contexte et de ce qu'il a dans ses placards, et il
-- n'entre dans la bibliothèque de personne. Deux concepts, deux tables — et le
-- coach ne découvre jamais ses propres recettes mélangées à celles d'un modèle.
--
-- ── 3. CE QUE LA BASE GARANTIT ICI, ET CE QU'ELLE NE GARANTIT PAS ────────
-- Écrit noir sur blanc, parce que ce dépôt a déjà payé un CONTRACT qui
-- promettait une garantie tenue sur un seul chemin.
--
--   GARANTI par contrainte :
--     * le vocabulaire de `scope`, `mode` et `meal_slot` est FERMÉ ;
--     * un repas appartient à un élève et disparaît avec lui (cascade) ;
--     * une liste de courses ne peut pas exister sans son repas.
--
--   NON GARANTI, et c'est un choix explicite :
--     * qu'un plat nomme la conviction qu'il applique. Le plan hebdomadaire
--       l'exige (`student_week_plans_doctrine_traceable_check`) parce qu'une
--       LIGNE DE MÉTHODE sans origine est une méthode inventée. Un PLAT est
--       une application libre : la doctrine borne ce qu'il ne peut pas
--       contenir, elle ne dicte pas la recette. `honours_belief_keys` est donc
--       renseigné quand le modèle sait le dire, et il est informatif.
--     * que le plat soit bon, ni qu'il plaise. Aucun CHECK ne juge une recette.
--
--   TENU AILLEURS, PAS ICI (verrous de sortie, à la génération) :
--     les interdits du coach, les aliments déconseillés, les contraintes
--     médicales de l'élève, et l'absence de cible chiffrée. Un CHECK SQL ne
--     peut pas lire une doctrine ; ces quatre-là vivent dans le générateur et
--     dans `applyKeelOutputLocks`.
-- ===========================================================================

begin;

-- ===========================================================================
-- 1. LA MÉTHODE DU COACH : ALIMENTS + QUESTIONS/RÉPONSES
-- ===========================================================================

alter table public.coach_doctrines
  add column if not exists foods jsonb not null default '{"recommended": [], "discouraged": []}'::jsonb,
  add column if not exists qa    jsonb not null default '[]'::jsonb;

comment on column public.coach_doctrines.foods is
  'Les aliments que le coach conseille et déconseille. Forme: '
  '{"recommended":[{"term":"...","reason":"..."|null}], '
  '"discouraged":[{"term":"...","surface_forms":["..."],"reason":"..."|null}]}. '
  'Les `discouraged` alimentent le verrou de sortie au même titre que les '
  'interdits: un aliment déconseillé SUGGÉRÉ est une contradiction publique du '
  'coach. Les `surface_forms` portent les formulations réelles — sans elles le '
  'verrou ne matche rien dans de la prose.';

comment on column public.coach_doctrines.qa is
  'Les questions/réponses du coach, structurées à partir de sa prose. Forme: '
  '[{"question":"...","answer":"...","source":"interview"|"coach_edit"|null}]. '
  'DISTINCT de `arbitrations`: une arbitration est SITUATIONNELLE (un élève '
  'craque un soir, le coach répond) et sert de few-shot de ton; un Q/R est '
  'FACTUEL (est-ce que je peux boire du café le matin) et sert de contenu de '
  'méthode. Les confondre transforme une réponse de réconfort en règle '
  'appliquée à tous les tours.';

-- La contrainte de forme est volontairement FAIBLE sur `foods`: `parseCoachDoctrine`
-- laisse tomber et COMPTE les entrées malformées (R7) plutôt que de faire
-- échouer la publication d'une méthode entière sur une virgule. Ce que la base
-- exige est seulement que la forme de tête soit lisible par le parseur.
alter table public.coach_doctrines
  drop constraint if exists coach_doctrines_foods_shape_check;
alter table public.coach_doctrines
  add constraint coach_doctrines_foods_shape_check check (
    jsonb_typeof(foods) = 'object'
    and (not foods ? 'recommended' or jsonb_typeof(foods -> 'recommended') = 'array')
    and (not foods ? 'discouraged' or jsonb_typeof(foods -> 'discouraged') = 'array')
  );

alter table public.coach_doctrines
  drop constraint if exists coach_doctrines_qa_shape_check;
alter table public.coach_doctrines
  add constraint coach_doctrines_qa_shape_check check (jsonb_typeof(qa) = 'array');

-- ===========================================================================
-- 2. LES REPAS GÉNÉRÉS
-- ===========================================================================

create table if not exists public.student_generated_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- ── CE QUI A ÉTÉ DEMANDÉ ────────────────────────────────────────────────
  -- R6: chaque valeur est lue par une branche NOMMÉE du générateur. Un
  -- vocabulaire ouvert ici produirait un `scope` que personne ne sait rendre.
  scope text not null default 'single_meal'
    check (scope in ('single_meal', 'day', 'several_days')),

  -- La bascule qui change tout le produit:
  --   'from_pantry' -> on cuisine avec ce qui est DÉJÀ là. Rien à acheter, ou
  --                    le strict minimum manquant.
  --   'to_shop'     -> on compose librement et on rend la liste de courses.
  mode text not null check (mode in ('from_pantry', 'to_shop')),

  meal_slot text check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  servings integer not null default 1 check (servings between 1 and 12),

  -- ── LE CONTEXTE QUALITATIF, EN PROSE LIBRE ──────────────────────────────
  -- « mariage mardi », « je pars en vacances vendredi », « week-end chez mes
  -- parents ». C'est la demande produit d'origine et c'est délibérément NON
  -- structuré: dès qu'on le met en cases, l'élève ne peut plus dire la seule
  -- chose qui comptait cette semaine-là. Le modèle le lit, le code ne branche
  -- jamais dessus.
  context text check (context is null or length(context) <= 2000),

  -- Ce que l'élève a déjà. Forme: [{"term":"...","quantity":"..."|null}].
  pantry jsonb not null default '[]'::jsonb check (jsonb_typeof(pantry) = 'array'),

  -- ── CE QUI EST SORTI ────────────────────────────────────────────────────
  -- Forme d'un plat:
  --   { "title": "...", "slot": "lunch", "day": "tue"|null,
  --     "ingredients": [{"term":"...","quantity":"..."|null}],
  --     "method": "...",                     -- comment le faire, en prose
  --     "why": "...",                        -- pourquoi CE plat pour CET élève
  --     "honours_belief_keys": ["..."] }     -- informatif (voir l'en-tête)
  dishes jsonb not null default '[]'::jsonb check (jsonb_typeof(dishes) = 'array'),

  -- Forme d'une ligne de courses:
  --   { "term": "...", "quantity": "..."|null, "aisle": "produce"|... }
  -- Les quantités sont des PORTIONS, jamais des cibles nutritionnelles: « 400 g
  -- de poulet » est une quantité à acheter, « 30 g de protéines » est une cible
  -- que personne n'a mesurée. Le filtre numérique du générateur fait exactement
  -- cette distinction, et un test prémisse-fausse prouve qu'une liste de
  -- courses le traverse intacte.
  shopping_list jsonb not null default '[]'::jsonb
    check (jsonb_typeof(shopping_list) = 'array'),

  -- Une liste de courses sans repas serait une liste que personne ne peut
  -- expliquer. Dans les deux sens: un repas peut n'avoir aucune course
  -- (mode `from_pantry`), mais des courses sans plat sont un bug de rendu.
  constraint student_generated_meals_list_needs_dishes_check check (
    jsonb_array_length(shopping_list) = 0 or jsonb_array_length(dishes) > 0
  ),

  -- Traçabilité de la génération, même rôle que `student_week_plans`.
  generated_from jsonb not null default '{}'::jsonb,

  content_locale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_generated_meals_user_created_idx
  on public.student_generated_meals (user_id, created_at desc);

comment on table public.student_generated_meals is
  'Repas composés POUR un élève, à partir de sa situation, de son contexte du '
  'moment et de ses placards. JAMAIS dans meal_ideas: cette table-là est la '
  'bibliothèque du COACH et son author_kind n''accepte pas de modèle.';

-- ===========================================================================
-- 3. LES DOCUMENTS ENVOYÉS (PDF)
-- ===========================================================================
-- Le PDF est un ARTEFACT, pas un message. Il a sa propre ligne parce que trois
-- questions se posent sur lui et qu'aucune n'a de réponse dans chat_messages:
-- de quel repas vient-il, où est le fichier, et l'envoi WhatsApp est-il parti.

create table if not exists public.student_meal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid references public.student_generated_meals(id) on delete cascade,

  kind text not null check (kind in ('shopping_list', 'meal_card')),
  storage_path text not null,
  filename text not null,

  -- R6, branches nommées. `skipped` n'est PAS un échec: c'est l'élève qui n'a
  -- pas demandé l'envoi, et le confondre avec `failed` ferait sonner une
  -- alerte sur un comportement normal.
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  delivery_error text,
  whatsapp_message_id text,
  sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_meal_documents_sent_needs_time_check check (
    delivery_status <> 'sent' or sent_at is not null
  )
);

create index if not exists student_meal_documents_user_idx
  on public.student_meal_documents (user_id, created_at desc);

comment on table public.student_meal_documents is
  'Un PDF produit pour un élève (liste de courses ou fiche repas) et le sort de '
  'son envoi WhatsApp. Séparé du message: le fichier survit à l''échec de '
  'l''envoi, et un renvoi ne le régénère pas.';

-- ===========================================================================
-- 4. RLS — l'élève lit et écrit SES lignes, et rien d'autre
-- ===========================================================================
-- Doctrine KEEL inchangée. Le coach n'a AUCUNE policy sur ces deux tables: ce
-- que son élève a dans ses placards et ce qu'il a mangé mardi est de l'intime
-- (§1.5), au même titre que le détail jour par jour du tap du soir.

alter table public.student_generated_meals  enable row level security;
alter table public.student_meal_documents   enable row level security;

drop policy if exists student_generated_meals_owner_all on public.student_generated_meals;
create policy student_generated_meals_owner_all on public.student_generated_meals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Lecture seule pour l'élève: le statut d'envoi est écrit par le service_role
-- (c'est lui qui parle à Meta), et un élève qui pourrait écrire `sent` sur sa
-- propre ligne rendrait le journal de livraison sans valeur.
drop policy if exists student_meal_documents_owner_read on public.student_meal_documents;
create policy student_meal_documents_owner_read on public.student_meal_documents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ===========================================================================
-- 5. LE BUCKET DES PDF — privé
-- ===========================================================================
-- Privé comme `plan-documents` et `gdpr-exports`. Un PDF de courses porte le
-- contexte de vie de l'élève ("mariage mardi") et ses contraintes
-- alimentaires: il ne prend pas d'URL publique. WhatsApp reçoit les OCTETS via
-- l'upload média Graph, jamais un lien vers le bucket.

insert into storage.buckets (id, name, public)
values ('meal-documents', 'meal-documents', false)
on conflict (id) do nothing;

drop policy if exists meal_documents_owner_read on storage.objects;
create policy meal_documents_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ===========================================================================
-- 6. updated_at
-- ===========================================================================

do $$
declare
  target text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    raise exception 'meal generation: public.tg_set_updated_at() introuvable';
  end if;

  foreach target in array array['student_generated_meals', 'student_meal_documents'] loop
    execute format('drop trigger if exists %I on public.%I',
                   target || '_set_updated_at', target);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.tg_set_updated_at()',
      target || '_set_updated_at', target
    );
  end loop;
end $$;

commit;

-- ===========================================================================
-- GARDE — on ne fait pas confiance, on vérifie
-- ===========================================================================
do $$
declare
  v_author_kind_intact int;
  v_cols               int;
  v_tables             int;
  v_bucket             int;
begin
  -- LA vérification qui compte: le CHECK de meal_ideas n'a pas bougé. Cette
  -- migration ajoute un concept à côté, elle n'ouvre pas la bibliothèque du
  -- coach à un modèle.
  select count(*) into v_author_kind_intact
  from pg_constraint
  where conrelid = 'public.meal_ideas'::regclass
    and conname = 'meal_ideas_author_kind_check'
    and pg_get_constraintdef(oid) like '%keel_library%'
    and pg_get_constraintdef(oid) not like '%''ai''%';

  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'coach_doctrines'
    and column_name in ('foods', 'qa');

  select count(*) into v_tables
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('student_generated_meals', 'student_meal_documents');

  select count(*) into v_bucket from storage.buckets where id = 'meal-documents';

  if v_author_kind_intact <> 1 then
    raise exception 'garde: meal_ideas_author_kind_check a changé — la bibliothèque du coach ne doit pas accepter de modèle';
  end if;
  if v_cols <> 2 then
    raise exception 'garde: coach_doctrines.foods/qa absentes (trouvé %)', v_cols;
  end if;
  if v_tables <> 2 then
    raise exception 'garde: tables repas/documents absentes (trouvé %)', v_tables;
  end if;
  if v_bucket <> 1 then
    raise exception 'garde: bucket meal-documents absent';
  end if;

  raise notice 'OK — foods+qa posées, repas générés et documents en place, author_kind de meal_ideas intact';
end $$;
