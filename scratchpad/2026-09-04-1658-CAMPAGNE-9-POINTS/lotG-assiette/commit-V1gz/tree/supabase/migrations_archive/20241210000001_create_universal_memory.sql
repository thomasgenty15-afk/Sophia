-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- 1. Add ai_summary to user_module_state_entries (toujours utile pour l'affichage rapide)
alter table public.user_module_state_entries 
add column ai_summary text;

-- 2. Add ai_summary to user_module_archives
alter table public.user_module_archives
add column ai_summary text;

-- 3. Create UNIVERSAL memories table (Brain)
create table if not exists public.memories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- The content text (summary or snippet)
  content text not null,
  
  -- The vector embedding (768 dimensions for Gemini text-embedding-004)
  embedding vector(768),
  
  -- SOURCE IDENTIFICATION (Agnostic)
  source_id text,    -- Can be 'week_1' (Module), UUID (Plan/Log), or specific ID
  source_type text,  -- 'module', 'daily_log', 'plan', 'weekly_review', 'chat'
  
  -- MEMORY NATURE
  type text not null default 'insight', -- 'insight', 'summary', 'fact', 'history'
  
  -- Metadata for extra filtering (e.g. { "version": "1.0", "date": "2024-..." })
  metadata jsonb default '{}'::jsonb,
  
  created_at timestamptz default now()
);

-- Index for faster vector similarity search (HNSW)
create index on public.memories using hnsw (embedding vector_cosine_ops);

-- Standard Indexes for filtering
create index memories_user_id_idx on public.memories(user_id);
create index memories_source_idx on public.memories(source_id, source_type);
create index memories_type_idx on public.memories(type);

-- RLS
alter table public.memories enable row level security;

create policy "Users can view their own memories"
  on public.memories for select
  using (auth.uid() = user_id);

create policy "Users can insert their own memories"
  on public.memories for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own memories"
  on public.memories for update
  using (auth.uid() = user_id);

create policy "Users can delete their own memories"
  on public.memories for delete
  using (auth.uid() = user_id);

-- 4. Create Match Memories Function (RAG)
create or replace function match_memories (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_source_type text default null,
  filter_type text default null
)
returns table (
  id uuid,
  content text,
  source_id text,
  source_type text,
  type text,
  similarity float,
  metadata jsonb
)
language plpgsql
stable
as $$
begin
  return query
  select
    memories.id,
    memories.content,
    memories.source_id,
    memories.source_type,
    memories.type,
    1 - (memories.embedding <=> query_embedding) as similarity,
    memories.metadata
  from public.memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
  and (filter_source_type is null or memories.source_type = filter_source_type)
  and (filter_type is null or memories.type = filter_type)
  and memories.user_id = auth.uid()
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;

