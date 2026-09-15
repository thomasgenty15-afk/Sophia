-- ============================================================================
-- LA NOTE DU COACH SUR UN ÉLÈVE — le mode 1:1, nommé comme tel
-- ============================================================================
-- Arbitrage produit du 2026-08-05, pris EN CONNAISSANCE DE CAUSE contre la
-- règle de `docs/keel/MODEL.md`. Il faut l'écrire ici, parce que la prochaine
-- lecture de ce fichier se fera par quelqu'un qui vient de lire MODEL.md et
-- qui, sans cette note, supprimera la table comme « hors modèle ».
--
--   MODEL.md dit: « Le coach ne produit RIEN de personnel pour un élève », et
--   son interdit n°4 vise mot pour mot cet écran (« tout écran coach qui
--   demande un geste par élève »). La raison est le passage à l'échelle: un
--   coach à 200 élèves ne peut pas écrire 200 fois.
--
--   Ce que cette table ajoute est le cas 1:1 ASSUMÉ — le coach qui a dix
--   élèves et qui les connaît. Elle est OPTIONNELLE au sens fort: vide, elle
--   n'existe pas dans le prompt (pas de bloc, pas d'en-tête, pas de « rien à
--   signaler »), et rien dans le produit ne la réclame. C'est la seule forme
--   sous laquelle elle ne rétablit pas la corvée par élève.
--
-- ── POURQUOI UNE TABLE ET PAS UNE COLONNE SUR `coach_clients` ─────────────
-- La ligne de lien est la maison naturelle de « ce coach, à propos de cet
-- élève », et c'est exactement pour ça qu'il ne faut pas y toucher: elle porte
-- `status`, `consent_granted_at` et `seat_state`, et elle n'a DÉLIBÉRÉMENT
-- aucune policy d'écriture (20260727120000, « a client-side PATCH on a
-- billing-bearing row is not a consent mechanism »). Une policy UPDATE de RLS
-- ne restreint pas les colonnes: ouvrir l'écriture pour un champ de note
-- ouvrirait aussi le consentement et le siège facturé. Une table à part coûte
-- une jointure et ferme la question.
--
-- ── CE QUE LA NOTE N'EST PAS ─────────────────────────────────────────────
-- Elle n'est PAS une conviction de doctrine. `student_week_plans` porte le
-- CHECK `..._doctrine_traceable_check`: toute ligne nutrition doit tracer à
-- une `source_belief_key`. La note n'ouvre aucune clé — le bloc de prompt le
-- dit, et `parseWeekPlan` rejette de toute façon une clé hors liste. Une note
-- qui pourrait produire une ligne de plan serait une ligne intraçable, donc
-- une écriture refusée en base.
--
-- Elle n'est PAS une contrainte de sécurité non plus. Les allergies vivent
-- dans `student_safety_constraints` (identifiants structurés, jamais de
-- prose), elles sont déclarées par l'ÉLÈVE, elles arment le verrou de sortie,
-- et elles passent AVANT la doctrine dans le prompt parce que le budget
-- tronque par la queue. La note se range derrière les deux.
--
-- ── RGPD ─────────────────────────────────────────────────────────────────
-- C'est une donnée personnelle concernant une personne identifiée, écrite par
-- un tiers: elle entre dans le droit d'accès de l'élève. `account-export-v1`
-- la réclame des DEUX côtés (l'élève la reçoit, le coach reçoit les siennes),
-- et l'écran coach le dit au coach avant qu'il n'écrive. La purge est portée
-- par les deux cascades ci-dessous, pas par une liste de tables à tenir à jour
-- — c'est la seule forme qui survit à l'oubli.
-- ============================================================================

create table if not exists public.student_coach_notes (
  id uuid primary key default gen_random_uuid(),
  -- `coaches.id`, PAS l'auth user id — même piège que partout ailleurs côté
  -- KEEL, et il a déjà coûté un export à zéro ligne.
  coach_id uuid not null references public.coaches(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- UNE note par paire. Le coach édite un texte, il n'empile pas un journal:
  -- sans cette unicité, l'upsert de l'écran écrirait une ligne de plus à
  -- chaque sauvegarde et le prompt se remplirait de versions périmées.
  constraint student_coach_notes_pair_unique unique (coach_id, student_user_id),

  -- ⚠️ LA SEULE AUTORITÉ SUR LE PLAFOND. Le compteur de l'UI et la constante
  -- `COACH_NOTE_MAX_CHARS` côté Deno sont des copies de confort; si l'une
  -- dérive, c'est CE check qui refuse, et l'écran affiche l'erreur au lieu de
  -- prétendre avoir sauvegardé. Fail-closed, pas fail-silent.
  --
  -- 1500 caractères ≈ 250 mots: assez pour des observations réelles, assez peu
  -- pour être injecté à CHAQUE tour de conversation et à chaque génération
  -- sans peser sur le budget de prompt.
  constraint student_coach_notes_length_check check (char_length(note) <= 1500)
);

create index if not exists student_coach_notes_student_idx
  on public.student_coach_notes (student_user_id);

comment on table public.student_coach_notes is
  'Mode 1:1 assumé (2026-08-05): observations libres du coach sur UN élève, '
  'injectées après la doctrine dans les prompts. N''ouvre aucune clé de '
  'conviction et ne peut donc produire aucune ligne de plan. Voir l''en-tête '
  'de la migration 20260805180000 avant de la supprimer comme hors-modèle.';


-- ============================================================================
-- RLS
-- ============================================================================
alter table public.student_coach_notes enable row level security;

-- Le coach écrit et relit SES notes, et seulement sur les élèves que
-- `coached_student_ids()` lui rend — c'est la même porte que toutes les
-- lectures Tier A de 20260727120000, donc un lien terminé ou un consentement
-- révoqué ferme aussi celle-ci.
--
-- `for all` couvre select/insert/update/delete: un coach qui efface sa note
-- doit pouvoir le faire, et une note vide ne vaut pas mieux qu'une ligne
-- absente.
drop policy if exists student_coach_notes_coach_all on public.student_coach_notes;
create policy student_coach_notes_coach_all on public.student_coach_notes
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
    and student_user_id = any ((select public.coached_student_ids())::uuid[])
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
    and student_user_id = any ((select public.coached_student_ids())::uuid[])
  );

-- AUCUNE POLICY ÉLÈVE, et c'est une décision, pas un oubli.
--
-- L'élève n'a pas d'écran qui montre cette note (arbitrage du 2026-08-05).
-- Il l'obtient par `account-export-v1`, qui tourne en service_role et ne passe
-- donc pas par RLS. Lui donner un SELECT ici ferait apparaître la note dans le
-- client au premier `select *` d'un écran voisin — un chemin de fuite qu'on ne
-- verrait qu'en production. Le droit d'accès est honoré par l'export, qui est
-- l'endroit où il se demande.


-- ============================================================================
-- PRIVILÈGES — `revoke from public` laisse `anon` debout
-- ============================================================================
-- Les default privileges Supabase accordent à `anon` sur toute table neuve du
-- schéma public. La vérification qui compte est has_table_privilege('anon',…),
-- jamais 'public'.
revoke all on public.student_coach_notes from anon;


-- ============================================================================
-- `updated_at` — le trigger, parce que l'upsert de l'écran ne le portera pas
-- ============================================================================
create or replace function public.touch_student_coach_notes_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_coach_notes_touch_updated_at on public.student_coach_notes;
create trigger student_coach_notes_touch_updated_at
  before update on public.student_coach_notes
  for each row execute function public.touch_student_coach_notes_updated_at();
