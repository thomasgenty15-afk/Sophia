-- ══════════════════════════════════════════════════════════════════════════
-- ⟳ 2026-09-24 — UN NOM RETROUVÉ SE RETIENT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Quand le modèle de génération écrit un aliment que la base ne sait pas lire
-- (« courgette · ref zucchini », « aubergine » hors du catalogue servi), un
-- petit appel le rattache à la ligne du référentiel qui est LE MÊME aliment,
-- ou dit que la base ne l'a pas (`composition_identify.ts`).
--
-- Cette table retient la décision, par nom normalisé, pour que le plan
-- suivant la relise au lieu de repayer l'appel :
--   · `slug` renseigné → ce nom désigne cet aliment du référentiel ;
--   · `slug` nul       → la base n'a pas cet aliment (le sas le crée).
--
-- ⛔ AUCUNE LIGNE N'APPARTIENT À UN COMPTE : c'est un référentiel partagé,
-- comme `food_composition_pending`. Pas de `user_id`, rien à exporter.
--
-- ⚠️ `status` :
--   · `active`   — relue par les plans suivants ;
--   · `conflict` — deux plans ont reçu deux réponses différentes pour ce nom :
--                  plus relue, l'appel tranche à chaque plan, et la ligne
--                  attend une lecture humaine ;
--   · `rejected` — une lecture humaine l'a jugée fausse : plus relue, et
--                  aucune écriture ne la réactive.

create table if not exists public.food_composition_identified_names (
  form text primary key check (length(btrim(form)) between 1 and 80),
  slug text null references public.food_composition_refs(slug) on delete cascade,
  sightings integer not null default 1 check (sightings >= 1),
  status text not null default 'active'
    check (status in ('active', 'conflict', 'rejected')),
  conflicting_slug text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.food_composition_identified_names is
  'Nom d''ingredient normalise -> aliment du referentiel (slug), ou absent de '
  'la base (slug nul). Ecrite par record_food_composition_identifications, lue '
  'par generate-household-meal-v1 avant l''appel d''identification.';

alter table public.food_composition_identified_names enable row level security;

-- ⛔ `authenticated` reçoit TOUT sur une table neuve par les privilèges par
-- défaut du projet, et `revoke ... from public` laisse `anon`. Les deux sont
-- retirés nommément ; seul `service_role` (la fonction edge) lit et écrit.
revoke all on table public.food_composition_identified_names from public, anon, authenticated;
grant select, insert, update, delete on table public.food_composition_identified_names to service_role;

create or replace function public.record_food_composition_identifications(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_form text;
  v_slug text;
  v_written integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_form := btrim(coalesce(v_row->>'form', ''));
    v_slug := nullif(btrim(coalesce(v_row->>'slug', '')), '');
    if length(v_form) < 1 or length(v_form) > 80 then
      continue;
    end if;
    -- Un slug qui n'existe pas n'est pas écrit : ni retenu, ni transformé en
    -- « absent ».
    if v_slug is not null
      and not exists (select 1 from public.food_composition_refs r where r.slug = v_slug)
    then
      continue;
    end if;
    insert into public.food_composition_identified_names as t (form, slug)
    values (v_form, v_slug)
    on conflict (form) do update set
      -- ⛔ UNE VUE DE PLUS SEULEMENT QUAND LA RÉPONSE EST LA MÊME.
      sightings = case
        when t.slug is not distinct from excluded.slug then t.sightings + 1
        else t.sightings
      end,
      -- ⛔ UNE RÉPONSE DIFFÉRENTE MET LE NOM EN CONFLIT, elle ne remplace pas
      -- la première : déplacer un nom d'un aliment vers un autre sur la foi
      -- d'un tirage est exactement `laitue -> lait`.
      status = case
        when t.status = 'rejected' then 'rejected'
        when t.slug is distinct from excluded.slug then 'conflict'
        else t.status
      end,
      conflicting_slug = case
        when t.slug is distinct from excluded.slug then excluded.slug
        else t.conflicting_slug
      end,
      updated_at = now();
    v_written := v_written + 1;
  end loop;
  return v_written;
end;
$$;

revoke all on function public.record_food_composition_identifications(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_food_composition_identifications(jsonb)
  to service_role;

comment on function public.record_food_composition_identifications(jsonb) is
  'Une decision d''identification par nom et par plan. Meme reponse: sightings '
  '+1. Reponse differente: status conflict, la premiere reste. rejected ne se '
  'reactive jamais. Un slug inconnu du referentiel est ignore.';
