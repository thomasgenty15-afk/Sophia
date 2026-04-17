-- Add user timezone to profiles (IANA TZ database name, e.g. "Europe/Paris")
alter table public.profiles
add column if not exists timezone text;


