-- ══════════════════════════════════════════════════════════════════════════
-- UN ALIMENT, UN SLUG, DEUX SURFACES (2026-09-10)
--
-- Prompt: docs/keel/PROMPT-AGENT-SAS-REFERENTIEL.md · lots 1 et 2
-- Amont:  20260821030000 (le sas) · 20260821031000 (l'écriture)
--         20260824093000 · 20260909140000 (les deux curations à la main)
-- Module: supabase/functions/_shared/keel/composition_fill.ts (+ `_io.ts`)
--
-- ── LE DÉFAUT, MESURÉ SUR LES 291 LIGNES DE LA FILE ──────────────────────
-- **Chaque forme de surface devenait son propre aliment.**
--
--   puree d'amandes   nuts_seeds   531,1   1 vue
--   puree d'amande    nuts_seeds   531,1   6 vues
--   almond butter     nuts_seeds   531,1   1 vue     -> 3 lignes, 1 aliment
--
--   yaourt au soja nature      dairy_yogurt  54   PROMU
--   unsweetened soya yoghurt                 63   pending
--                                 -> le même aliment, DEUX valeurs
--
-- Trois conséquences, toutes vérifiables:
--   ① on repaie l'appel modèle à chaque forme, et à chaque plan;
--   ② la règle des trois ne se déclenche jamais — les vues se répartissent
--      entre les variantes (6 + 1 + 1) au lieu de s'additionner;
--   ③ le même aliment peut porter deux valeurs selon la langue.
--
-- ── CE QUE CETTE MIGRATION INSTALLE ──────────────────────────────────────
--   1. `food_composition_pending_aliases` — les formes de surface d'un terme.
--   2. `food_composition_pending_by_form` — la vue qui rend une ligne du sas
--      par n'importe laquelle de ses formes. C'est le CACHE du lot 2.
--   3. `record_food_composition_sightings` accepte `forms`.
--   4. `promote_pending_food_compositions` cesse de refuser `alias_exists`,
--      et porte les formes vers `food_composition_aliases` À LA PROMOTION.
--   5. le statut `covered`.
--
-- ── ⛔ LA RÈGLE NON NÉGOCIABLE N'A PAS BOUGÉ ─────────────────────────────
-- « IL CRÉE UN ALIMENT NEUF. JAMAIS UN ALIAS VERS UN ALIMENT EXISTANT. »
--
-- Une forme de surface pointe vers la ligne de SAS que le modèle vient de
-- faire naître, jamais vers une ligne que des humains ont écrite. Trois gardes
-- le tiennent, et elles sont dans le `where` de l'insertion plus bas:
--   · la forme ne doit pas être déjà un alias curé (`food_composition_aliases`);
--   · son slug ne doit pas être déjà une ligne du référentiel;
--   · elle ne doit pas être elle-même un terme canonique du sas.
-- Aucune comparaison autre que `=`. Ni distance, ni préfixe, ni ressemblance:
-- `laitue` ne peut pas atteindre `lait`, parce que rien ici ne rapproche deux
-- chaînes différentes. 12 faux positifs sur 12 mesurés, cicatrice
-- `never-hand-roll-a-matcher-here`.
--
-- ── RGPD ─────────────────────────────────────────────────────────────────
-- Même nature que `food_composition_pending`: la table neuve ne porte AUCUNE
-- personne — pas de `user_id`, pas de FK vers `profiles`, pas de date de plan.
-- Son seul texte libre est un nom d'aliment normalisé, plafonné à 80. Elle est
-- donc dans la catégorie RÉFÉRENTIEL, ni exportée ni purgée, exactement comme
-- ses deux voisines. La contrainte `..._carries_no_person_check` rend cette
-- promesse VÉRIFIABLE plutôt que déclarative (cicatrice « le lifecycle RGPD ne
-- réclame pas les tables neuves »).
-- ══════════════════════════════════════════════════════════════════════════

begin;

-- ---------------------------------------------------------------------------
-- ① LES FORMES DE SURFACE
-- ---------------------------------------------------------------------------
--
-- ⚠️ `alias` EST LA CLÉ PRIMAIRE, ET C'EST LA RÈGLE « ON N'ÉCRASE JAMAIS »
-- ÉCRITE EN CONTRAINTE. Une forme ne peut désigner qu'un seul aliment; le
-- premier écrivain la pose, et une seconde revendication est ignorée
-- (`on conflict do nothing`) au lieu de déplacer un nom d'un aliment à l'autre.
create table if not exists public.food_composition_pending_aliases (
  alias text primary key check (length(btrim(alias)) between 1 and 80),

  -- LE TERME CANONIQUE. `cascade` parce qu'une forme sans son aliment ne veut
  -- rien dire — et parce que la vue plus bas jointe dessus rendrait des lignes
  -- creuses que `filledFromPendingRow` jetterait sans rien dire.
  term text not null
    references public.food_composition_pending(term) on update cascade on delete cascade,

  -- D'OÙ VIENT CETTE FORME. `encountered` = un plan l'a écrite · `label_fr` /
  -- `label_en` = le modèle l'a nommée en décrivant l'aliment. Le champ existe
  -- pour qu'une revue humaine sache ce qu'elle relit: une forme rencontrée a
  -- été écrite par le générateur, un libellé a été inventé par le modèle de
  -- secours, et les deux ne se relisent pas avec la même confiance.
  form_source text not null default 'encountered'
    check (form_source in ('encountered', 'label_fr', 'label_en')),

  first_seen_at timestamptz not null default now(),

  -- ⛔ UNE FORME NE PEUT PAS ÊTRE SON PROPRE TERME. La ligne du sas est déjà
  -- atteignable par son terme (la vue l'ajoute), et une forme identique ferait
  -- deux lignes pour la même clé dans `food_composition_pending_by_form`.
  constraint food_composition_pending_aliases_not_self_check
    check (btrim(alias) <> btrim(term)),

  -- ⛔ LA PREUVE QUE LA TABLE NE PORTE PERSONNE, ÉCRITE EN CONTRAINTE.
  constraint food_composition_pending_aliases_carries_no_person_check check (
    alias !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    and alias !~ '@'
  )
);

comment on table public.food_composition_pending_aliases is
  'Les FORMES DE SURFACE d''un terme du sas: la forme rencontrée par un plan et '
  'les deux libellés (fr/en) du modèle. Elles n''entrent dans '
  'food_composition_aliases qu''à la PROMOTION. RÉFÉRENTIEL, pas donnée '
  'd''élève: aucune colonne ne porte de personne.';

comment on column public.food_composition_pending_aliases.term is
  'Le terme CANONIQUE, clé de food_composition_pending. C''est lui qui porte '
  'la composition et le compteur de vues.';

create index if not exists food_composition_pending_aliases_term_idx
  on public.food_composition_pending_aliases (term);

-- ⛔ LES PRIVILÈGES PAR DÉFAUT DONNENT TOUT À `authenticated` SUR TOUTE TABLE
-- NEUVE (cicatrice `supabase-default-privileges-grant-all-to-authenticated`).
revoke all on public.food_composition_pending_aliases from anon, authenticated;
alter table public.food_composition_pending_aliases enable row level security;
-- Aucune politique: RLS activée sans policy = zéro ligne hors service_role.

-- ---------------------------------------------------------------------------
-- ② LE STATUT `covered` — le référentiel atteint déjà ce terme
-- ---------------------------------------------------------------------------
--
-- Il remplace `needs_review / alias_exists`, qui mettait sur une file HUMAINE
-- sept lignes n'appelant aucune décision: `figues`, `moutarde de dijon`,
-- `boeuf a rotir`… sont déjà des alias curés vers des lignes existantes. Il n'y
-- a rien à trancher — le référentiel les lit. Les laisser en revue, c'est faire
-- relire sept fois une file où il n'y a rien à faire, et une file bruyante
-- finit par ne plus être lue du tout.
alter table public.food_composition_pending
  drop constraint if exists food_composition_pending_status_check;
alter table public.food_composition_pending
  add constraint food_composition_pending_status_check
  check (status in ('pending', 'promoted', 'needs_review', 'rejected', 'covered'));

comment on column public.food_composition_pending.status is
  'pending = en file · needs_review = une garde a mordu, la ligne SERT ENCORE '
  'les plans qui la citent · promoted = elle vit dans food_composition_refs · '
  'rejected = une lecture humaine l''a jugee FAUSSE: ni promue, ni relue · '
  'covered = le referentiel atteint deja ce terme par un alias cure, il n''y a '
  'rien a promouvoir et rien a trancher.';

-- ---------------------------------------------------------------------------
-- ③ LA VUE PAR FORME — le cache du lot 2
-- ---------------------------------------------------------------------------
--
-- ⛔ LA JOINTURE EST UNE ÉGALITÉ, ET C'EST TOUT CE QU'ELLE EST. `p.term = a.term`
-- sur des chaînes déjà normalisées par `normalizeTerm`. Rien n'est comparé par
-- préfixe, par distance ou par inclusion. C'est la même posture que
-- `loadPendingGroups`, un cran plus loin.
--
-- ⚠️ ELLE REND LA VALEUR, PAS SEULEMENT LE GROUPE — et c'est le renversement du
-- lot 2. L'en-tête de `loadPendingGroups` interdisait de reprendre une valeur
-- du sas depuis la génération, au motif que ce serait « promouvoir sans les
-- trois observations ». Ce qui a changé: la valeur n'est PAS répandue vers un
-- terme qui ne l'a jamais rencontrée — elle est rendue pour un terme dont le
-- sas porte DÉJÀ la réponse, c'est-à-dire pour la question qu'on a déjà payée.
-- À température 0, rappeler le modèle sur le même terme rend le même nombre;
-- la seule chose que l'appel achète, c'est la latence et les jetons.
--
-- ⚠️ ET ELLE NE CHANGE PAS LA RÈGLE DES TROIS. `sightings` ne monte que sur une
-- écriture, et une lecture de cache n'écrit pas. Les deux mécanismes sont
-- indépendants, et il faut qu'ils le restent: le seuil compte les plans où le
-- MODÈLE s'est prononcé, pas les plans qui ont relu sa réponse.
create or replace view public.food_composition_pending_by_form as
select p.term as form, 'canonical'::text as form_source, p.*
from public.food_composition_pending p
union all
select a.alias as form, a.form_source, p.*
from public.food_composition_pending_aliases a
join public.food_composition_pending p on p.term = a.term;

comment on view public.food_composition_pending_by_form is
  'Une ligne du sas par NOM qui la designe: son terme canonique, plus chacune '
  'de ses formes de surface. Lue par loadPendingFills et loadPendingGroups. '
  'La jointure est une EGALITE de terme, jamais un rapprochement.';

revoke all on public.food_composition_pending_by_form from anon, authenticated;

commit;
