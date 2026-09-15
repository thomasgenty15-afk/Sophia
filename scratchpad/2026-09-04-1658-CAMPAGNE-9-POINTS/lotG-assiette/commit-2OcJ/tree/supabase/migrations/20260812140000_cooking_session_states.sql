-- ============================================================================
-- FF-057 — L'ÉTAT D'UNE SESSION DE CUISINE. La seule donnée neuve de la fiche.
--
-- Autorité produit: docs/fonctionnalites/composition-des-repas/FF-057-la-procedure-accident.md
-- §5 (« la session sautée — un marqueur sur la session de cuisine du plan ») et
-- §11 (le choix payload vs table, laissé ouvert « au plus simple »).
--
-- ── LE TROU QU'ELLE BOUCHE ──────────────────────────────────────────────────
-- `student_generated_meals.cooking_sessions` dit QUAND on cuisine et QUOI. Rien
-- n'a jamais su si la session AVAIT EU LIEU — vérifié le 2026-08-12 avant
-- d'écrire cette migration: aucune colonne d'exécution sur `preparations`, aucune
-- sur `cooking_sessions`, et `protocol_events.disqualified_reason` est un fait
-- PAR PLAT (FF-057 R1: plat sauté ≠ session sautée).
--
-- La conséquence de ce trou est le mode d'échec structurel de la catégorie: une
-- session sautée fait disparaître trois ou quatre repas du réel, et le plan
-- continue de les afficher. On ouvre l'app mardi, on nous annonce un plat qui n'a
-- jamais été cuisiné.
--
-- ── POURQUOI UNE TABLE, ET PAS LE PAYLOAD DU PLAN (§11) ────────────────────
-- Le plus simple n'est pas le plus court à écrire, c'est celui qui ne fabrique
-- pas de course:
--
--   * une clé dans `cooking_sessions` (jsonb) forcerait une
--     lecture-modification-écriture COMPLÈTE de la ligne du plan pour changer un
--     booléen. C'est exactement la course que `user_chat_states.temp_memory` fait
--     déjà payer à ce dépôt: deux écrivains, le dernier gagne, sans qu'on l'ait
--     voulu;
--   * et le second écrivain existe DÉJÀ dans cette même fiche: le glissement de
--     dates réécrit `dishes`, `preparations` et `cooking_sessions` de la ligne.
--     Un drapeau posé dans le même jsonb se perdrait sous le glissement, en
--     silence;
--   * la table donne un point d'accrochage RLS et un `on delete cascade`
--     gratuits.
--
-- Elle est le JUMEAU EXACT de `grocery_wave_states` (FF-058, migration
-- 20260812120000): même clé (personne, plan, date), même « l'absence de ligne EST
-- l'inconnu », même « la dernière réponse gagne ». Qui sait lire l'une sait lire
-- l'autre, et c'est délibéré.
--
-- ── LA CLÉ EST UNE DATE CALENDAIRE, PAS UN JETON DE JOUR ───────────────────
-- Un jeton (`sun`) cesse de désigner la même chose dès que le glissement déplace
-- la session. La date, elle, reste vraie: « la cuisson du 10 août n'a pas eu
-- lieu » est un fait qui SURVIT au glissement — et la nouvelle date n'a
-- simplement aucune ligne, c'est-à-dire « on ne sait pas ». Le marqueur ne se
-- déplace donc jamais, et il n'y a aucune ligne à réparer après un décalage.
--
-- ── CE QU'ON N'ÉCRIT PAS, ET C'EST LA RÈGLE ────────────────────────────────
-- AUCUN état par PRÉPARATION. « J'ai fait le poulet mais pas le riz » est une
-- granularité que personne en aval ne lit, et la collecter violerait la règle
-- mère T1 (« on ne collecte une donnée que si quelque chose en aval la
-- consomme »). Quels repas tombent se DÉRIVE de ce booléen, à la lecture, par
-- `cascadeSkippedSession` — même doctrine que `grocery_waves.ts` (« les vagues se
-- calculent à la lecture, elles ne se stockent pas »). Un second état à invalider
-- est un état dont l'écrivain finit par disparaître.
--
-- ── LES DROITS: NI FERMÉE PAR ACCIDENT, NI OUVERTE À `anon` ────────────────
-- Les privilèges par défaut de ce projet accordent tout à `authenticated` sur
-- toute table neuve, et `revoke ... from public` laisse `anon` intact. On révoque
-- donc explicitement aux DEUX rôles, puis on rend le seul droit utile: LIRE SA
-- PROPRE LIGNE. L'écriture appartient au chemin déterministe du chat
-- (service_role) — c'est lui qui a vu le bouton partir.
-- ============================================================================

create table if not exists public.cooking_session_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  generated_meal_id uuid not null
    references public.student_generated_meals(id) on delete cascade,
  cook_on date not null,
  happened boolean not null,
  answered_at timestamptz not null default now(),
  answered_local_date date not null,
  primary key (user_id, generated_meal_id, cook_on)
);

comment on table public.cooking_session_states is
  'FF-057 — l''état d''UNE SESSION DE CUISINE (personne, plan, date de cuisson): '
  'elle a eu lieu ou non, et quand on l''a dit. Un ÉTAT, pas un journal: la '
  'dernière réponse gagne. JAMAIS un état par préparation — personne en aval ne '
  'lit « le poulet oui, le riz non », et la collecter violerait T1. Quels repas '
  'tombent se DÉRIVE de ce booléen à la lecture (cascadeSkippedSession), jamais '
  'en base. Accès unique: _shared/keel/accident_io.ts.';
comment on column public.cooking_session_states.cook_on is
  'La DATE CALENDAIRE de la session, jamais son jeton de jour. Un jeton cesse de '
  'désigner la même chose dès que le glissement de FF-057 déplace la session; la '
  'date reste vraie, et la nouvelle date n''a simplement aucune ligne (= inconnu).';
comment on column public.cooking_session_states.happened is
  'true = la cuisson a eu lieu, false = elle n''a pas eu lieu. Jamais NULL: '
  'l''absence de ligne EST l''inconnu, et deux façons de dire « inconnu » '
  'finissent par diverger.';
comment on column public.cooking_session_states.answered_local_date is
  'Le jour LOCAL de la personne au moment du tap. Peut différer de cook_on (on '
  'constate le lendemain matin); c''est cook_on qui identifie la session.';

-- Le lecteur naturel: « les sessions déclarées non faites de ce plan ». C'est
-- lui qui alimente la cascade et le filtre d'affichage.
create index if not exists cooking_session_states_skipped_idx
  on public.cooking_session_states (generated_meal_id, cook_on)
  where happened = false;

alter table public.cooking_session_states enable row level security;

revoke all on public.cooking_session_states from public;
revoke all on public.cooking_session_states from anon;
revoke all on public.cooking_session_states from authenticated;

-- L'élève LIT son propre état (l'écran du plan pourra griser ce qui est tombé).
-- Il ne l'écrit pas: l'écriture vient du tap, par le chemin déterministe du chat.
grant select on public.cooking_session_states to authenticated;

drop policy if exists cooking_session_states_owner_read
  on public.cooking_session_states;
create policy cooking_session_states_owner_read
  on public.cooking_session_states
  for select
  to authenticated
  using (user_id = (select auth.uid()));
