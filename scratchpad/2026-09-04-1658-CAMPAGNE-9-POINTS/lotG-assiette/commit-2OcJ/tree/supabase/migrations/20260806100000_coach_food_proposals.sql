-- ============================================================================
-- LES PROPOSITIONS D'ALIMENTS TIRÉES D'UN DOCUMENT DU COACH
-- ============================================================================
-- Autorité: docs/keel/CONTRACT.md, docs/keel/MODEL.md.
-- Suite de `20260805140000_coach_food_items.sql`, qu'elle ne modifie pas: elle
-- pose le SAS entre « ce qu'un modèle a lu dans le PDF du coach » et « ce que
-- le coach assume ».
--
-- ── POURQUOI UNE TABLE, ET PAS UNE ÉCRITURE DIRECTE DANS coach_food_items ──
-- C'est LA décision de ce lot, et elle est structurelle, pas prudentielle.
--
-- `coach_food_items` porte l'OPINION du coach. Ce qui s'y trouve est compilé en
-- postures de groupe (`_shared/keel/food_items.ts`), publié, puis lu par le
-- générateur de repas et par l'évaluateur. Une ligne écrite là par un modèle
-- qui a mal lu une page devient, sans autre geste, une règle que Sophia
-- applique au nom du coach.
--
-- Ce dépôt a déjà payé exactement ce défaut, ailleurs: la coche automatique du
-- rapprochement plat-prévu écrivait dans `protocol_events` un fait que l'élève
-- ne pouvait ni démentir ni décocher (campagne QA 2026-08-05,
-- `docs/keel/QA-CHAT-2026-08-05-RESULTS.md`). La différence ici n'est pas que
-- le modèle serait meilleur — c'est que le COACH EST PRÉSENT, devant la
-- citation, avant que quoi que ce soit n'existe côté méthode.
--
-- ── LA CITATION EST NOT NULL, ET C'EST LA GARDE ───────────────────────────
-- `quote` porte la phrase du document qui justifie la posture, copiée telle
-- quelle. Elle est obligatoire parce qu'une proposition sans citation n'est pas
-- une lecture, c'est une invention — et une invention est indiscernable d'une
-- lecture une fois affichée à côté des autres. La contrainte fait le tri à
-- l'écriture; l'écran n'a pas à faire confiance au parseur.
--
-- C'est aussi ce qui rend la décision du coach instantanée: il ne lit pas
-- « saumon → encouragé » (qu'il devrait aller vérifier), il lit sa propre
-- phrase.
--
-- ── R2: DE LA PROSE ⇒ content_locale SUR LA LIGNE ─────────────────────────
-- `term` et `quote` sont de la prose humaine, dans la langue du document. Un
-- coach écrit son ebook en français et lit son écran en anglais: sans cette
-- colonne, la citation serait une chaîne dont la langue se devine a posteriori,
-- ce que R2 interdit nommément.
--
-- ── CE QUE CETTE TABLE N'EST PAS ──────────────────────────────────────────
-- Un historique d'imports. Une ligne résolue (`accepted`/`dismissed`) reste
-- pour que le coach voie ce qu'il a déjà tranché et qu'un second dépôt du même
-- document ne le fasse pas recommencer — mais rien en aval ne la lit. Aucun
-- compilateur, aucun générateur, aucun prompt ne touche cette table: le
-- chemin vers l'élève passe UNIQUEMENT par `coach_food_items`, et il commence
-- par un clic du coach.
-- ============================================================================

create table if not exists public.coach_food_proposals (
  id uuid primary key default gen_random_uuid(),

  -- La proposition vit sur le COACH, pas sur le protocole. Elle n'est pas de
  -- la méthode: c'est du matériau en attente de tri. La ligne de méthode naît
  -- sur le protocole le jour où le coach accepte, et c'est ce jour-là qu'elle
  -- se versionne.
  coach_id uuid not null references public.coaches(id) on delete cascade,

  -- L'aliment tel que LE DOCUMENT l'écrit. Le libellé du coach, pas le nôtre:
  -- s'il dit « bonnes graisses », on lui montre « bonnes graisses », et c'est
  -- lui qui décide si ça devient une ligne.
  term text not null check (length(btrim(term)) between 1 and 80),

  -- LA PHRASE DU DOCUMENT. Voir l'en-tête: elle est la garde, pas un ornement.
  -- Plafond à 400 pour qu'elle reste une citation et pas un chapitre recopié —
  -- un pavé serait illisible dans une liste et cesserait de servir à décider.
  quote text not null check (length(btrim(quote)) between 1 and 400),

  -- R2. La langue du document, qui n'est pas forcément celle de l'écran.
  content_locale text not null check (length(btrim(content_locale)) between 2 and 20),

  -- Même vocabulaire que `coach_food_items.stance`. Deux échelles différentes
  -- rendraient l'acceptation ambiguë au moment exact où elle doit être triviale.
  stance text not null check (stance in ('encouraged', 'discouraged', 'excluded')),

  -- Le rattachement au vocabulaire FERMÉ, proposé par le modèle et re-vérifié
  -- contre la table avant écriture (`coach-doctrine-v1`). La FK est le dernier
  -- mot: un slug inventé ne s'écrit pas.
  food_group_ref text not null references public.food_groups(slug),

  -- L'aliment du catalogue quand le terme du document en rejoint un. NULL
  -- sinon, exactement comme `coach_food_items.food_item_ref`: l'acceptation
  -- recopie ce champ tel quel, donc un terme maison reste un terme maison.
  food_item_ref text references public.food_items(slug),

  -- Le nom du fichier déposé. Un coach qui dépose trois documents doit pouvoir
  -- dire d'où sort une proposition qui le surprend.
  source_label text check (source_label is null or length(btrim(source_label)) between 1 and 200),

  -- `pending` est le seul état qui s'affiche comme une décision à prendre.
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  -- Un état résolu SANS date de résolution rendrait « quand ai-je trié ça »
  -- indécidable, et une date sur une ligne en attente serait un mensonge.
  constraint coach_food_proposals_resolved_at_matches_status check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  )
);

create index if not exists coach_food_proposals_coach_pending_idx
  on public.coach_food_proposals (coach_id, created_at)
  where status = 'pending';

-- UN TERME, UNE DÉCISION EN ATTENTE.
-- Le partiel est essentiel: redéposer le même document ne doit pas empiler
-- deux fois « saumon » dans la liste à trancher, MAIS un terme déjà tranché
-- doit pouvoir revenir si le coach change de matériau. Un index total
-- interdirait la seconde chose en croyant n'interdire que la première.
create unique index if not exists coach_food_proposals_one_pending_per_term_idx
  on public.coach_food_proposals (coach_id, lower(btrim(term)))
  where status = 'pending';


-- ============================================================================
-- RLS
-- ============================================================================
alter table public.coach_food_proposals enable row level security;

-- Le coach est propriétaire de SES propositions. Aucune policy élève: rien de
-- cette table n'atteint un élève, à aucun moment, par aucun chemin.
drop policy if exists coach_food_proposals_coach_all on public.coach_food_proposals;
create policy coach_food_proposals_coach_all on public.coach_food_proposals
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
-- schéma public. Vérification: has_table_privilege sur 'anon', jamais 'public'.
revoke all on public.coach_food_proposals from anon;


comment on table public.coach_food_proposals is
  'Sas entre la lecture d''un document du coach et sa méthode. Rien ici n''atteint '
  'un élève: le chemin passe par coach_food_items, et il commence par un clic du coach.';
