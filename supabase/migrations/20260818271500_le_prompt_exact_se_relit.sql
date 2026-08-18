-- ===========================================================================
-- ON ARCHIVAIT LA RÉPONSE DU MODÈLE, JAMAIS LA QUESTION.
--
-- ── LE DÉFAUT, MESURÉ LE 2026-08-18 ────────────────────────────────────────
-- `public.llm_raw_response_events` porte 22 colonnes. Aucune ne contient le
-- texte envoyé au modèle. Elle en porte seulement la LONGUEUR, cachée dans
-- `metadata`:
--
--   metadata->>'system_prompt_chars'   -- ex. 8214
--   metadata->>'prompt_chars'          -- ex. 31907
--
-- Conséquence: toute enquête sur « qu'est-ce que le coach a réellement
-- injecté » se fait par RECONSTITUTION — on relit le code, on rejoue les
-- assembleurs, et on prouve la présence d'un bloc par un ÉCART de compteur.
-- Un bloc présent mais vidé, un bloc dupliqué, un bloc placé après la
-- consigne qui l'annule: tous rendent le même nombre.
--
-- ── CE QUE CETTE MIGRATION AJOUTE ──────────────────────────────────────────
-- Six colonnes sur la table EXISTANTE (pas de table neuve: un seul régime de
-- sécurité à tenir, aucune jointure à inventer).
--
--   system_prompt            text     -- le 1er paramètre de generateWithGemini
--   system_prompt_chars      integer  -- longueur AVANT bornage
--   system_prompt_truncated  boolean  -- le texte a-t-il été coupé
--   user_message             text     -- le 2e paramètre
--   user_message_chars       integer
--   user_message_truncated   boolean
--
-- La paire longueur+booléen est obligatoire: sans elle on ne distingue pas
-- « bloc absent » de « bloc coupé au plafond ». Le plafond est celui qui
-- existe déjà, `SOPHIA_LLM_RAW_TRACE_MAX_CHARS` (120 000 par défaut).
--
-- L'écriture reste conditionnée au drapeau existant
-- `SOPHIA_LLM_RAW_TRACE_ENABLED`. Éteint = colonnes NULL, comme aujourd'hui.
--
-- ── ⚠️ POURQUOI CETTE MIGRATION TOUCHE AUSSI LES PRIVILÈGES ────────────────
-- Ces deux colonnes ne portent pas du texte anodin: le prompt de génération
-- contient la TAILLE, le POIDS, le SEXE, l'ÂGE et les ALLERGIES de l'élève et,
-- pour la lane foyer, de chaque bouche du foyer — enfants compris. Avant d'y
-- déposer ça, l'état réel des octrois sur la table a été LU, pas supposé:
--
--   grantee       | privilege_type
--   --------------+----------------
--   anon          | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
--   has_table_privilege('anon','public.llm_raw_response_events','select') -> t
--
-- `anon` avait TOUT. La migration d'origine (`20260612170000`) n'accorde
-- pourtant que `select` à `authenticated` et `all` à `service_role`: le reste
-- vient des privilèges par DÉFAUT de Supabase, qui concèdent tout à `anon` et
-- `authenticated` sur toute table neuve du schéma `public`. Le fichier a l'air
-- fermé; la base est ouverte.
--
-- La RLS limitait la lecture (aucune policy ne couvre `anon`), mais:
--   • `TRUNCATE` **ne passe pas** par la RLS — `anon` pouvait vider la table;
--   • `revoke ... from public` NE RETIRE PAS `anon`, qui est un rôle NOMMÉ
--     (cicatrice déjà écrite ici: `20260818200000`). D'où `from public, anon`.
--
-- On ramène donc la table à ce que son fichier d'origine déclarait, ni plus ni
-- moins: `authenticated` garde `select` (c'est par là que passe un
-- `internal_admins`, seul lecteur autorisé par la policy), `service_role`
-- garde tout, `public` et `anon` n'ont rien.
--
-- AUCUN RÔLE NE GAGNE UN ACCÈS. Deux en perdent.
--
-- RÉVERSIBILITÉ — les colonnes se droppent, les octrois se rendent; il
-- faudrait une très bonne raison de rendre quoi que ce soit à `anon`.
-- ===========================================================================

begin;

alter table public.llm_raw_response_events
  add column if not exists system_prompt text,
  add column if not exists system_prompt_chars integer,
  add column if not exists system_prompt_truncated boolean not null default false,
  add column if not exists user_message text,
  add column if not exists user_message_chars integer,
  add column if not exists user_message_truncated boolean not null default false;

comment on column public.llm_raw_response_events.system_prompt is
  'Texte exact du 1er paramètre de generateWithGemini(), borné par SOPHIA_LLM_RAW_TRACE_MAX_CHARS. Écrit une seule fois par appel, sur le premier événement (attempt_start en pratique). NULL quand la trace est éteinte.';
comment on column public.llm_raw_response_events.system_prompt_chars is
  'Longueur du system prompt AVANT bornage. Comparer à metadata->>''system_prompt_chars'', qui est compté indépendamment.';
comment on column public.llm_raw_response_events.system_prompt_truncated is
  'true quand system_prompt a été coupé au plafond. Sans ce booléen, un bloc coupé se lit comme un bloc absent.';
comment on column public.llm_raw_response_events.user_message is
  'Texte exact du 2e paramètre de generateWithGemini(), même bornage et même unicité que system_prompt.';
comment on column public.llm_raw_response_events.user_message_chars is
  'Longueur du user message AVANT bornage. Comparer à metadata->>''prompt_chars''.';
comment on column public.llm_raw_response_events.user_message_truncated is
  'true quand user_message a été coupé au plafond.';

-- Retrouver « la ligne qui porte le prompt » d'une requête sans scanner.
create index if not exists llm_raw_response_events_prompt_idx
  on public.llm_raw_response_events (request_id, created_at)
  where system_prompt is not null;

-- ---------------------------------------------------------------------------
-- LES OCTROIS — on ferme `public` ET `anon`, nommément.
-- ---------------------------------------------------------------------------
revoke all on table public.llm_raw_response_events from public;
revoke all on table public.llm_raw_response_events from anon;
revoke all on table public.llm_raw_response_events from authenticated;

grant select on table public.llm_raw_response_events to authenticated;
grant all on table public.llm_raw_response_events to service_role;

-- ---------------------------------------------------------------------------
-- CONTRÔLE — on lit les privilèges, on n'inspecte pas le texte des commandes.
--
-- Le cas PASSANT est vérifié aussi: une garde qui fermerait `authenticated`
-- ou `service_role` couperait le seul lecteur admin et le seul écrivain, tout
-- en ayant l'air d'une garde qui marche.
-- ---------------------------------------------------------------------------
do $$
declare
  t constant text := 'public.llm_raw_response_events';
  priv text;
begin
  foreach priv in array array['select','insert','update','delete','truncate'] loop
    if has_table_privilege('anon', t, priv) then
      raise exception 'anon garde le privilège % sur %', priv, t;
    end if;
    if has_table_privilege('public', t, priv) then
      raise exception 'public garde le privilège % sur %', priv, t;
    end if;
  end loop;

  if not has_table_privilege('authenticated', t, 'select') then
    raise exception '% : authenticated a perdu select (lecteur internal_admins coupé)', t;
  end if;
  foreach priv in array array['insert','update','delete','truncate'] loop
    if has_table_privilege('authenticated', t, priv) then
      raise exception 'authenticated garde le privilège % sur %', priv, t;
    end if;
  end loop;

  foreach priv in array array['select','insert'] loop
    if not has_table_privilege('service_role', t, priv) then
      raise exception '% : service_role a perdu % (écrivain de la trace coupé)', t, priv;
    end if;
  end loop;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.llm_raw_response_events'::regclass
  ) then
    raise exception '% : RLS désactivée', t;
  end if;
end
$$;

commit;
