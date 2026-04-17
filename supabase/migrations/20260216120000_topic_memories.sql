-- ============================================================================
-- TOPIC MEMORIES — Mémoire thématique vivante avec mots-clés vectorisés
-- ============================================================================
--
-- Concept : Au lieu de stocker des bribes atomiques ("Il aime le jazz"),
-- on maintient des SYNTHÈSES ÉVOLUTIVES par TOPIC ("Cannabis / Arrêt",
-- "Sœur Tania", "Alimentation").
--
-- Chaque topic a des KEYWORDS vectorisés qui pointent vers lui.
-- "cannabis", "weed", "joint", "fumer" → même topic.
-- "Tania", "ma sœur" → même topic.
--
-- Le retrieval se fait par similarité sémantique sur les keywords,
-- ce qui permet de retrouver un topic même avec un mot jamais utilisé.
-- ============================================================================

-- 1. Table principale : synthèses thématiques
create table if not exists public.user_topic_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  -- Identifiant canonique du topic (ex: "cannabis_arret", "soeur_tania")
  slug text not null,

  -- Titre lisible (ex: "Cannabis / Arrêt", "Sœur (Tania)")
  title text not null,

  -- Synthèse vivante — le cœur du système.
  -- Texte dense (1-5 paragraphes) qui évolue à chaque enrichissement.
  synthesis text not null default '',

  -- Embedding de la synthèse complète pour recherche sémantique directe
  synthesis_embedding vector(768),

  -- Statut du topic
  status text not null default 'active', -- 'active' | 'archived' | 'merged'

  -- Compteurs de pertinence
  mention_count integer not null default 1,
  enrichment_count integer not null default 0,

  -- Timestamps de lifecycle
  first_mentioned_at timestamptz not null default now(),
  last_enriched_at timestamptz,
  last_retrieved_at timestamptz,

  -- Metadata flexible (tags, domaine, liens vers d'autres topics, etc.)
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un user ne peut pas avoir deux topics avec le même slug
  unique (user_id, slug)
);

-- Indexes
create index if not exists idx_topic_memories_user_status
  on public.user_topic_memories (user_id, status);
create index if not exists idx_topic_memories_user_slug
  on public.user_topic_memories (user_id, slug);
create index if not exists idx_topic_memories_last_enriched
  on public.user_topic_memories (user_id, last_enriched_at desc nulls last);

-- HNSW index pour recherche sémantique directe sur la synthèse
create index if not exists idx_topic_memories_synthesis_embedding
  on public.user_topic_memories using hnsw (synthesis_embedding vector_cosine_ops);

-- RLS
alter table public.user_topic_memories enable row level security;

do $$ begin
  execute 'create policy rls_topic_memories_select on public.user_topic_memories for select using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_topic_memories_insert on public.user_topic_memories for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_topic_memories_update on public.user_topic_memories for update using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;


-- 2. Table des mots-clés vectorisés pointant vers des topics
create table if not exists public.user_topic_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  topic_id uuid references public.user_topic_memories(id) on delete cascade not null,

  -- Le mot-clé ou expression (ex: "cannabis", "weed", "ma sœur", "tania")
  keyword text not null,

  -- Embedding du mot-clé pour matching sémantique
  keyword_embedding vector(768) not null,

  -- Origine du keyword
  source text not null default 'llm_extracted',
  -- 'llm_extracted' : extrait par le LLM pendant l'analyse
  -- 'user_explicit' : l'utilisateur a nommé explicitement
  -- 'alias_inferred' : alias déduit par le LLM (synonyme, surnom, etc.)

  created_at timestamptz not null default now(),

  -- Un keyword est unique par user (un mot ne peut pointer que vers UN topic)
  unique (user_id, keyword)
);

-- Indexes
create index if not exists idx_topic_keywords_user_topic
  on public.user_topic_keywords (user_id, topic_id);
create index if not exists idx_topic_keywords_keyword
  on public.user_topic_keywords (user_id, keyword);

-- HNSW index pour recherche sémantique sur les keywords
create index if not exists idx_topic_keywords_embedding
  on public.user_topic_keywords using hnsw (keyword_embedding vector_cosine_ops);

-- RLS
alter table public.user_topic_keywords enable row level security;

do $$ begin
  execute 'create policy rls_topic_keywords_select on public.user_topic_keywords for select using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_topic_keywords_insert on public.user_topic_keywords for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_topic_keywords_update on public.user_topic_keywords for update using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_topic_keywords_delete on public.user_topic_keywords for delete using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;


-- 3. Table d'historique d'enrichissement (audit trail pour chaque topic)
create table if not exists public.user_topic_enrichment_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  topic_id uuid references public.user_topic_memories(id) on delete cascade not null,

  -- Résumé de ce qui a été ajouté/modifié
  enrichment_summary text not null,

  -- Synthèse avant enrichissement (pour rollback si besoin)
  previous_synthesis text,

  -- Source de l'enrichissement
  source_type text not null default 'chat', -- 'chat' | 'onboarding' | 'bilan' | 'module'

  created_at timestamptz not null default now()
);

create index if not exists idx_topic_enrichment_log_topic
  on public.user_topic_enrichment_log (topic_id, created_at desc);

-- RLS
alter table public.user_topic_enrichment_log enable row level security;

do $$ begin
  execute 'create policy rls_topic_enrichment_log_select on public.user_topic_enrichment_log for select using (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;

do $$ begin
  execute 'create policy rls_topic_enrichment_log_insert on public.user_topic_enrichment_log for insert with check (auth.uid() = user_id)';
exception when duplicate_object then null; end $$;


-- ============================================================================
-- 4. RPCs pour la recherche sémantique
-- ============================================================================

-- 4a. Recherche par similarité sur les keywords → retourne les synthèses des topics
create or replace function public.match_topic_memories_by_keywords(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision default 0.60,
  match_count integer default 5
)
returns table (
  topic_id uuid,
  slug text,
  title text,
  synthesis text,
  keyword_matched text,
  keyword_similarity double precision,
  mention_count integer,
  last_enriched_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  -- Allow both service_role and authenticated users (auth.uid() check via RLS)
  return query
  select distinct on (tm.id)
    tm.id as topic_id,
    tm.slug,
    tm.title,
    tm.synthesis,
    tk.keyword as keyword_matched,
    1 - (tk.keyword_embedding <=> query_embedding) as keyword_similarity,
    tm.mention_count,
    tm.last_enriched_at,
    tm.metadata
  from public.user_topic_keywords tk
  join public.user_topic_memories tm on tm.id = tk.topic_id
  where tk.user_id = target_user_id
    and tm.user_id = target_user_id
    and tm.status = 'active'
    and 1 - (tk.keyword_embedding <=> query_embedding) > match_threshold
  order by tm.id, 1 - (tk.keyword_embedding <=> query_embedding) desc
  limit match_count;
end;
$$;

-- 4b. Recherche directe sur la synthèse du topic (complémentaire)
create or replace function public.match_topic_memories_by_synthesis(
  target_user_id uuid,
  query_embedding vector(768),
  match_threshold double precision default 0.55,
  match_count integer default 3
)
returns table (
  topic_id uuid,
  slug text,
  title text,
  synthesis text,
  synthesis_similarity double precision,
  mention_count integer,
  last_enriched_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    tm.id as topic_id,
    tm.slug,
    tm.title,
    tm.synthesis,
    1 - (tm.synthesis_embedding <=> query_embedding) as synthesis_similarity,
    tm.mention_count,
    tm.last_enriched_at,
    tm.metadata
  from public.user_topic_memories tm
  where tm.user_id = target_user_id
    and tm.status = 'active'
    and tm.synthesis_embedding is not null
    and 1 - (tm.synthesis_embedding <=> query_embedding) > match_threshold
  order by tm.synthesis_embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Permissions : accessible par service_role et authenticated
grant execute on function public.match_topic_memories_by_keywords(uuid, vector, double precision, integer) to service_role;
grant execute on function public.match_topic_memories_by_keywords(uuid, vector, double precision, integer) to authenticated;

grant execute on function public.match_topic_memories_by_synthesis(uuid, vector, double precision, integer) to service_role;
grant execute on function public.match_topic_memories_by_synthesis(uuid, vector, double precision, integer) to authenticated;

