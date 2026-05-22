alter table public.user_transformations
  add column if not exists base_de_vie_payload jsonb null;
