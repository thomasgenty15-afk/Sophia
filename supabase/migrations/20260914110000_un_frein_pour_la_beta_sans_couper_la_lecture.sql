-- ══════════════════════════════════════════════════════════════════════════
-- ⟳ 2026-09-14 · BÊTA LOT 2C — UN FREIN, ET IL NE COUPE PAS LA LECTURE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ CE QUI N'EXISTAIT PAS. Le plan de bêta exige : « vérifier le mécanisme
-- permettant de suspendre les nouvelles générations tout en laissant lire les
-- plans encore valides » et « une violation essentielle sur un plan actif
-- déclenche suspension des nouvelles générations concernées ». Il n'y avait
-- aucun frein : la seule façon d'arrêter la composition était de retirer la
-- fonction, ce qui coupe aussi la lecture de tous les plans en cours.
--
-- ── POURQUOI UNE LIGNE EN BASE ET PAS UNE VARIABLE D'ENVIRONNEMENT ────────
-- Une variable demande `supabase secrets set` PUIS un déploiement PUIS une
-- propagation. Un incident de bêta se coupe en secondes, pas en minutes, et le
-- geste doit être réversible par la même personne qui l'a fait. Une ligne se
-- lit par la fonction edge à chaque requête, pour le prix d'un `select`.
--
-- ⛔ ET IL NE TOUCHE RIEN D'AUTRE QUE LA COMPOSITION. Les plans écrits restent
-- lisibles, les courses restent lisibles, les recettes restent lisibles :
-- ce frein vit au point d'admission de `generate-household-meal-v1`, et nulle
-- part ailleurs. « Ne pas mettre à disposition un plan connu incorrect pendant
-- un incident » est l'autre moitié, et elle appartient au produit, pas à ce
-- fichier.

create table if not exists public.keel_generation_pause (
  -- ⚠️ UNE SEULE LIGNE, ET LA CONTRAINTE LE DIT. Un frein qui pourrait exister
  -- en deux exemplaires laisserait la question « lequel gagne ? » à celui qui
  -- lit, c'est-à-dire au pire moment.
  id boolean primary key default true check (id),
  paused boolean not null default false,
  -- CE QU'ON DIT AUX GENS. Pas un code : une phrase, rendue telle quelle dans
  -- le corps du refus. Vide ⇒ l'écran retombe sur sa propre formulation.
  reason text not null default '',
  since timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.keel_generation_pause (id, paused)
values (true, false)
on conflict (id) do nothing;

comment on table public.keel_generation_pause is
  'BÊTA lot 2C (2026-09-14) — le frein des NOUVELLES compositions de foyer. '
  'UNE ligne (contrainte `check (id)`). Lue à l''admission de '
  'generate-household-meal-v1 ; elle ne touche AUCUNE lecture de plan, de '
  'courses ni de recette. Aucun rôle client n''y touche (RLS active, AUCUNE '
  'policy) : un frein qu''un client peut lever n''est pas un frein.';
comment on column public.keel_generation_pause.reason is
  'La phrase rendue à la personne, telle quelle. Jamais un code interne : ce '
  'texte est lu par quelqu''un qui voulait juste composer son plan.';

alter table public.keel_generation_pause enable row level security;

-- Mêmes deux lignes que partout ailleurs, et pour les deux raisons nommées :
-- les privilèges par défaut donnent TOUT à `authenticated` sur une table neuve,
-- et `revoke from public` laisse `anon`.
revoke all on table public.keel_generation_pause from public, anon, authenticated;
grant select, insert, update on table public.keel_generation_pause to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- LA LECTURE — une fonction, pour que le frein ait UN seul lecteur
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.keel_generation_pause_state()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  -- ⛔ `coalesce` SUR LA LIGNE ABSENTE REND « NON SUSPENDU », et c'est la bonne
  -- direction : un frein qu'on ne sait pas lire ne doit pas bloquer un produit
  -- qui marche. L'inverse ferait d'une panne de lecture une panne de service.
  select coalesce(
    (select jsonb_build_object(
       'paused', p.paused,
       'reason', p.reason,
       'since', p.since
     ) from public.keel_generation_pause p where p.id),
    jsonb_build_object('paused', false, 'reason', '', 'since', null)
  );
$function$;

comment on function public.keel_generation_pause_state() is
  'BÊTA lot 2C — l''état du frein. Ligne absente ou illisible ⇒ '
  '{paused:false} : une panne de lecture ne doit pas devenir une panne de '
  'service.';

revoke all on function public.keel_generation_pause_state() from public, anon, authenticated;
grant execute on function public.keel_generation_pause_state() to service_role;
