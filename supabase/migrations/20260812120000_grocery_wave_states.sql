-- ============================================================================
-- FF-058 — L'ÉTAT D'UNE VAGUE DE COURSES. La seule donnée neuve de la fiche.
--
-- Autorité produit: docs/fonctionnalites/suivi-quotidien/FF-058-la-bande-du-soir.md
-- §5 (« l'état d'une vague de courses — à porter ») et R16.
--
-- ── LE TROU QU'ELLE BOUCHE ──────────────────────────────────────────────────
-- `grocery_waves.ts` calcule depuis longtemps QUAND acheter (`buyOn`) et quelle
-- cuisson la vague sert (`servesCookOn`). Personne n'a jamais su si la vague
-- AVAIT ÉTÉ FAITE: les coches de `ShoppingListPanel.tsx` sont un
-- `React.useState` — elles meurent au rechargement et n'atteignent jamais la
-- base. Vérifié le 2026-08-12 avant d'écrire cette migration.
--
-- ── CE QU'ON ÉCRIT, ET SURTOUT CE QU'ON N'ÉCRIT PAS (R16) ───────────────────
-- L'ÉTAT DE LA VAGUE: (personne, plan, jour d'achat) → faite ou non, et quand.
-- JAMAIS un état par article. Personne en aval ne lit une liste à moitié cochée,
-- et la collecter violerait la règle mère T1 (« on ne collecte une donnée que si
-- quelque chose en aval la consomme »). Cocher article par article reste le
-- geste de l'écran, dans le magasin, et il reste éphémère — c'est voulu.
--
-- ── C'EST UN ÉTAT, PAS UN JOURNAL ──────────────────────────────────────────
-- Contrairement aux coches de repas (`protocol_events`, append-only), la
-- dernière réponse GAGNE: quelqu'un qui tape « Pas encore » puis se ravise à
-- 22 h a fait ses courses, point. D'où une clé primaire sur le triplet et un
-- `on conflict do update`, plutôt qu'une ligne de plus par tap.
--
-- ── LA FORME, POUR CELUI QUI LIRA CETTE TABLE ENSUITE (FF-057) ─────────────
-- FF-057 (la procédure accident) consomme un `Pas encore` comme l'une de ses
-- quatre entrées. Ce qu'elle trouvera ici:
--
--   user_id            le compte qui a RÉPONDU. C'est le maître du foyer: la
--                      vague de courses est un fait de FOYER (R14), et la ligne
--                      ne part qu'à lui. Personne d'autre ne peut l'écrire.
--   generated_meal_id  le plan qui possède la vague (`student_generated_meals`).
--                      C'est lui, jamais un préfixe, qui rattache l'état au bon
--                      plan quand un plan COURANT et un plan SUIVANT coexistent.
--   buy_on             le jour d'achat calculé par `planGroceryWaves`. Deux
--                      vagues le même jour se fondent en UNE ligne: la réponse
--                      porte « les courses du jour », pas chaque vague.
--   done               `true` = faite, `false` = pas encore. Jamais NULL: une
--                      absence de ligne est déjà « on ne sait pas », et deux
--                      façons de dire « inconnu » se mettent toujours à diverger.
--   answered_at        l'instant du tap.
--   answered_local_date le jour LOCAL de la personne au moment du tap. Il peut
--                      différer de `buy_on` (un tap à 23 h 50 le lendemain), et
--                      c'est `buy_on` qui identifie la vague, jamais celui-ci.
--
-- ⚠️ IL N'Y A AUCUNE COLONNE D'ARTICLE, ET C'EST LA RÈGLE. Ajouter
-- `items_done jsonb` ici serait une autre fonctionnalité, sans consommateur.
--
-- ── LES DROITS: NI FERMÉE PAR ACCIDENT, NI OUVERTE À `anon` ─────────────────
-- Les privilèges par défaut de ce projet accordent tout à `authenticated` sur
-- toute table neuve, et `revoke ... from public` laisse `anon` intact. On révoque
-- donc explicitement aux DEUX rôles, puis on rend le seul droit utile: LIRE SA
-- PROPRE LIGNE. L'écriture appartient au chemin déterministe du chat
-- (service_role) — c'est lui qui a vu le bouton partir.
-- ============================================================================

create table if not exists public.grocery_wave_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  generated_meal_id uuid not null
    references public.student_generated_meals(id) on delete cascade,
  buy_on date not null,
  done boolean not null,
  answered_at timestamptz not null default now(),
  answered_local_date date not null,
  primary key (user_id, generated_meal_id, buy_on)
);

comment on table public.grocery_wave_states is
  'FF-058 — l''état d''UNE VAGUE de courses (personne, plan, jour d''achat): faite '
  'ou non, et quand. Un ÉTAT, pas un journal: la dernière réponse gagne. '
  'JAMAIS un état par article (R16) — personne en aval ne lit une liste à '
  'moitié cochée, et la collecter violerait T1. Écrite par le tap de la bande '
  'du soir; la ligne ne part qu''au compte maître (R14).';
comment on column public.grocery_wave_states.buy_on is
  'Le jour d''achat calculé par `planGroceryWaves`. Deux vagues le même jour '
  'donnent UNE ligne: la réponse porte « les courses du jour ».';
comment on column public.grocery_wave_states.done is
  'true = faite, false = pas encore. Jamais NULL: l''absence de ligne EST '
  'l''inconnu, et deux façons de dire « inconnu » finissent par diverger.';
comment on column public.grocery_wave_states.answered_local_date is
  'Le jour LOCAL de la personne au moment du tap. Peut différer de buy_on; '
  'c''est buy_on qui identifie la vague.';

-- Le lecteur naturel de FF-057: « les vagues non faites de ce plan ».
create index if not exists grocery_wave_states_pending_idx
  on public.grocery_wave_states (generated_meal_id, buy_on)
  where done = false;

alter table public.grocery_wave_states enable row level security;

-- Les privilèges par défaut donnent TOUT à `authenticated`, et `from public`
-- laisserait `anon` debout. On nomme les deux rôles.
revoke all on public.grocery_wave_states from public;
revoke all on public.grocery_wave_states from anon;
revoke all on public.grocery_wave_states from authenticated;

-- L'élève LIT son propre état (l'écran de courses pourra l'afficher). Il ne
-- l'écrit pas: l'écriture vient du tap, par le chemin déterministe du chat, qui
-- est le seul à avoir vu le bouton partir.
grant select on public.grocery_wave_states to authenticated;

drop policy if exists grocery_wave_states_owner_read on public.grocery_wave_states;
create policy grocery_wave_states_owner_read
  on public.grocery_wave_states
  for select
  to authenticated
  using (user_id = (select auth.uid()));
