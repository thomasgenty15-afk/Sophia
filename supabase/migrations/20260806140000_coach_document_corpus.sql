-- ============================================================================
-- LE CORPUS D'UN DOCUMENT DU COACH — la source, son texte, et ses citations
-- ============================================================================
-- Autorité: docs/keel/MODEL.md, docs/keel/CONTRACT.md, et l'en-tête de
-- `_shared/keel/document_corpus.ts`. Suite de `20260806100000_coach_food_
-- proposals.sql`, qu'elle ne modifie pas.
--
-- ── LE TROU QUE ÇA FERME ──────────────────────────────────────────────────
-- `compile_document` lit un PDF de cent vingt pages, en tire une trentaine
-- d'entrées, et JETTE le document. Pas de bucket, pas de table, pas de texte:
-- les seuls `insert` du chemin visent `coach_doctrines` et
-- `coach_food_proposals`. Ce que l'extraction n'a pas retenu n'est pas « absent
-- de ce brouillon », il est perdu — et la seule façon de le retrouver est de
-- redemander le fichier au coach.
--
-- Trois conséquences, aucune théorique:
--   1. le coach ne peut pas voir ce qui a été IGNORÉ, donc il ne peut pas
--      juger l'extraction, donc il la croit ou la rejette en bloc;
--   2. une meilleure extraction, plus tard, exige un geste du coach qu'il ne
--      refera pas;
--   3. mesuré (docs/nutrition-pivot/qa-web/M1-block-budget.txt): le bloc de
--      méthode compilé passe ~10 000 tokens dès le premier ebook et est
--      injecté INTÉGRALEMENT à chaque tour, sur trois chemins. Le jour où il
--      faudra récupérer au lieu de tout injecter, il faudra un corpus à
--      récupérer. Il n'y en a pas.
--
-- ── CE QUE CES TABLES NE SONT PAS ─────────────────────────────────────────
-- De la méthode. Un chunk ne porte aucune clé de conviction, aucun compilateur
-- ne le lit, aucun prompt ne le rend. Le chemin vers l'élève passe UNIQUEMENT
-- par `coach_doctrines` et `coach_food_items`, et il commence par un clic du
-- coach. C'est la même ligne que `coach_food_proposals`: du matériau en
-- attente, pas une règle.
--
-- Un index sémantique non plus. Il n'y a PAS de colonne `embedding` ici, et
-- c'est délibéré: aucun écrivain, aucun lecteur. Ce dépôt a déjà droppé
-- `student_facts` et `recurring_meals` pour cette raison exacte (migration
-- 20260803161000). La colonne s'ajoutera le jour où un chemin l'écrit et un
-- chemin la lit — pgvector est déjà installé pour la mémoire de l'élève.
--
-- ── LE FICHIER VA DANS `plan-documents`, ET PAS DANS UN BUCKET NEUF ───────
-- `plan-documents` est déjà décrit (20260727130000) comme « le dépôt source du
-- coach », il est privé, et surtout il est déjà RÉCLAMÉ par les deux routines
-- RGPD: `account-export-v1` empaquette `<user_id>/` et `purge-deleted-accounts`
-- supprime `<user_id>/`. Un bucket neuf serait un bucket invisible à l'export
-- et survivant à la purge tant que personne n'y pense — c'est-à-dire un défaut
-- RGPD, pas un détail de rangement.
-- CONVENTION DE CHEMIN, porteuse: `<coaches.user_id>/doctrine/<document_id>.pdf`.
-- Le premier segment est l'id auth du PROPRIÉTAIRE, jamais `coaches.id`.
-- ============================================================================


-- ============================================================================
-- 1. LE DOCUMENT
-- ============================================================================
create table if not exists public.coach_documents (
  id uuid primary key default gen_random_uuid(),

  coach_id uuid not null references public.coaches(id) on delete cascade,

  -- Le nom tel que le coach l'a déposé. NULL possible: un appelant peut ne pas
  -- l'envoyer, et inventer « document.pdf » ferait croire à une information.
  filename text check (filename is null or length(btrim(filename)) between 1 and 200),

  byte_size integer not null check (byte_size > 0),
  page_count integer not null check (page_count > 0),

  -- R2 — de la prose ⇒ la langue est sur la ligne. Même raison que
  -- `coach_food_proposals.content_locale`: un coach écrit son ebook en
  -- français et lit son écran en anglais.
  content_locale text not null check (length(btrim(content_locale)) between 2 and 20),

  -- L'EMPREINTE DU FICHIER, et c'est elle qui rend le re-dépôt idempotent.
  -- La fusion documentaire est faite pour qu'un coach dépose plusieurs
  -- documents; redéposer LE MÊME ne doit pas dupliquer son corpus, sinon
  -- chaque re-tentative (un timeout, un clic double) double le stockage et
  -- rend « d'où vient cette citation » ambigu entre deux copies identiques.
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),

  -- NULL = le fichier n'a pas pu être déposé. On garde quand même la ligne et
  -- ses chunks: le texte est ce qui sert, l'original est un confort.
  storage_path text check (storage_path is null or length(btrim(storage_path)) between 1 and 400),

  -- ── LES TROIS ÉTATS, ET POURQUOI ILS SONT NOMMÉS ────────────────────────
  --   extracted        le PDF a une couche texte, on l'a.
  --   no_text_layer    PDF scanné / que des images. Ce n'est PAS une panne:
  --                    c'est un fait sur le document, et le confondre avec
  --                    une panne enverrait le coach chercher un bug.
  --   extraction_failed la lecture a échoué. Là, c'est une panne.
  -- La distinction porte une conséquence directe: on ne tente l'ancrage d'une
  -- citation que sur `extracted`. Sur un document sans couche texte, TOUTE
  -- citation serait « introuvable », et on accuserait le modèle d'inventer
  -- alors qu'il n'y a rien à chercher.
  text_status text not null check (
    text_status in ('extracted', 'no_text_layer', 'extraction_failed')
  ),

  text_chars integer not null default 0 check (text_chars >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),

  created_at timestamptz not null default now(),

  -- Un état qui ment sur son propre contenu est pire qu'un état absent.
  constraint coach_documents_text_status_matches_content check (
    (text_status = 'extracted' and chunk_count > 0 and text_chars > 0)
    or (text_status <> 'extracted' and chunk_count = 0 and text_chars = 0)
  )
);

-- UN DOCUMENT, UNE FOIS, PAR COACH. Voir `content_sha256` ci-dessus.
create unique index if not exists coach_documents_one_per_content_idx
  on public.coach_documents (coach_id, content_sha256);

create index if not exists coach_documents_coach_recent_idx
  on public.coach_documents (coach_id, created_at desc);


-- ============================================================================
-- 2. LE TEXTE, DÉCOUPÉ
-- ============================================================================
create table if not exists public.coach_document_chunks (
  id uuid primary key default gen_random_uuid(),

  document_id uuid not null references public.coach_documents(id) on delete cascade,

  -- DÉNORMALISÉ, et pas par paresse. La policy RLS et l'export RGPD se
  -- posent tous les deux sur le coach; les faire passer par une jointure sur
  -- `coach_documents` mettrait une sous-requête sur un chemin de sécurité, ce
  -- que ce dépôt a déjà décidé d'éviter ailleurs pour la même raison.
  coach_id uuid not null references public.coaches(id) on delete cascade,

  -- Ordre de lecture dans le document, dense et 0-based.
  ordinal integer not null check (ordinal >= 0),

  -- La page d'origine, 1-based. Un chunk ne traverse JAMAIS une page: le
  -- numéro de page est tout ce que la citation apporte au coach, et « c'est
  -- écrit quelque part » ne se vérifie pas.
  page_number integer not null check (page_number >= 1),

  text text not null check (length(btrim(text)) between 1 and 4000),
  char_count integer not null check (char_count > 0),

  constraint coach_document_chunks_unique_ordinal unique (document_id, ordinal)
);

create index if not exists coach_document_chunks_document_order_idx
  on public.coach_document_chunks (document_id, ordinal);


-- ============================================================================
-- 3. LES CITATIONS
-- ============================================================================
-- Ce qui relie « le coach croit ceci » à « c'est écrit page 42 ».
--
-- ── LA CLÉ EST LE TEXTE DE L'ENTRÉE, PAS SON IDENTIFIANT ─────────────────
-- Au moment de l'extraction, l'entrée citée n'existe NULLE PART: le brouillon
-- n'est pas enregistré (« l'IA transcrit, n'écrit jamais »), le coach va le
-- relire, le corriger, en supprimer. Un index de tableau serait faux dès la
-- première suppression; un uuid désignerait une ligne qui n'existera
-- peut-être jamais.
-- Conséquence assumée: si le coach RÉÉCRIT la phrase, la clé change et la
-- citation ne s'affiche plus en face. C'est exact — ce n'est plus la phrase
-- du document.
create table if not exists public.coach_document_citations (
  id uuid primary key default gen_random_uuid(),

  coach_id uuid not null references public.coaches(id) on delete cascade,
  document_id uuid not null references public.coach_documents(id) on delete cascade,

  -- Le chunk où la citation a été RETROUVÉE. NULL = introuvable dans le texte
  -- du document. Deux causes très différentes, et c'est `coach_documents.
  -- text_status` qui les sépare: sur `extracted`, un NULL veut dire que le
  -- modèle a paraphrasé ou inventé; sur `no_text_layer`, il n'y avait rien à
  -- chercher et le NULL n'accuse personne.
  -- `on delete set null`: on ne perd pas la citation parce qu'on a rechargé
  -- le texte du document.
  chunk_id uuid references public.coach_document_chunks(id) on delete set null,

  entry_kind text not null check (
    entry_kind in ('belief', 'forbidden', 'vocabulary', 'arbitration', 'qa', 'food')
  ),
  entry_key text not null check (length(btrim(entry_key)) between 1 and 200),

  -- La phrase du document. Même plafond que `coach_food_proposals.quote`, et
  -- pour la même raison: au-delà, ce n'est plus une citation qui aide à
  -- décider, c'est un chapitre recopié qu'on ne lit pas.
  quote text not null check (length(btrim(quote)) between 1 and 400),

  page_number integer check (page_number is null or page_number >= 1),

  created_at timestamptz not null default now(),

  -- Une citation ancrée connaît sa page. Sans ça, `chunk_id` non nul et page
  -- nulle serait un état affichable (« retrouvée ! ... quelque part »).
  constraint coach_document_citations_located_knows_page check (
    chunk_id is null or page_number is not null
  ),

  -- UNE CITATION PAR ENTRÉE ET PAR DOCUMENT. Deux documents peuvent citer la
  -- même conviction — c'est même un signal utile — mais un document qui la
  -- cite deux fois n'apporte rien qu'une liste en double à l'écran.
  constraint coach_document_citations_one_per_entry
    unique (document_id, entry_kind, entry_key)
);

create index if not exists coach_document_citations_lookup_idx
  on public.coach_document_citations (coach_id, entry_kind, entry_key);


-- ============================================================================
-- RLS — le coach est propriétaire, l'élève n'existe pas ici
-- ============================================================================
-- Aucune policy élève sur aucune des trois tables, et ce n'est pas un oubli:
-- rien de ce corpus n'atteint un élève, à aucun moment, par aucun chemin. Et
-- rien d'un AUTRE coach non plus — la méthode d'un coach qui remonterait chez
-- un autre détruirait exactement ce que le produit vend.
alter table public.coach_documents enable row level security;
alter table public.coach_document_chunks enable row level security;
alter table public.coach_document_citations enable row level security;

drop policy if exists coach_documents_coach_all on public.coach_documents;
create policy coach_documents_coach_all on public.coach_documents
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists coach_document_chunks_coach_all on public.coach_document_chunks;
create policy coach_document_chunks_coach_all on public.coach_document_chunks
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists coach_document_citations_coach_all on public.coach_document_citations;
create policy coach_document_citations_coach_all on public.coach_document_citations
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );


-- ============================================================================
-- PRIVILÈGES — `revoke from public` laisse `anon` debout
-- ============================================================================
-- Les default privileges Supabase accordent à `anon` sur toute table neuve du
-- schéma public. La vérification se fait sur 'anon', jamais sur 'public'.
revoke all on public.coach_documents from anon;
revoke all on public.coach_document_chunks from anon;
revoke all on public.coach_document_citations from anon;


comment on table public.coach_documents is
  'Le document source d''un coach (ebook, manuel, FAQ), gardé pour que ce que '
  'l''extraction a ignoré ne soit pas perdu. Rien ici n''atteint un élève.';
comment on table public.coach_document_chunks is
  'Le texte du document, découpé, ancré à sa page. Corpus de lecture — aucune '
  'clé de conviction, aucun compilateur ne le lit.';
comment on table public.coach_document_citations is
  'Ce qui relie une entrée extraite à la phrase du document qui la justifie. '
  'chunk_id NULL sur un document `extracted` = citation introuvable dans le texte.';
