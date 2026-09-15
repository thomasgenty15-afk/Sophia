-- LA POSTURE DU COACH SUR L'ACTIVITÉ — l'endroit qui manquait.
--
-- ── LE PROBLÈME DE MODÈLE QUE ÇA RÉSOUT ────────────────────────────────────
-- Le modèle KEEL dit que Sophia n'a pas d'opinion propre quand un coach
-- existe: elle sert SA méthode. Or `coach_doctrines` porte les convictions,
-- les interdits, le vocabulaire, les arbitrages, les aliments, la voix et les
-- gestes quotidiens — et RIEN sur l'entraînement.
--
-- Sophia qui recommanderait de l'activité sans que le coach l'ait dit
-- inventerait donc du contenu qu'il n'a jamais enseigné, sur le terrain même
-- où beaucoup de coachs ont une méthode forte. D'où deux versions (arbitrage
-- du propriétaire, 2026-08-10):
--
--   · sans coach  -> le plancher de santé publique (_shared/keel/activity_floor.ts)
--   · avec coach  -> sa posture, déclarée ici, qui REMPLACE le plancher
--
-- ── ⛔ CE QUE CETTE COLONNE NE PEUT PAS PORTER, ET C'EST STRUCTUREL ────────
-- Aucun volume, aucune série, aucune charge, aucun pourcentage, aucune
-- fréquence chiffrée. `ActivityStance` (_shared/keel/activity_stance.ts) est
-- une liste fermée d'ACCENTS, et ce qui n'existe pas dans le type ne peut pas
-- être prescrit — même discipline que `deficit_style` sans jeton
-- « aggressive ».
--
-- **Même un coach ne fait donc pas programmer Sophia.** Sa méthode détaillée
-- va dans ses CONVICTIONS, où elle est déjà possible: citable dans le chat,
-- dans sa voix, tracée à sa doctrine. Le programme du coach est citable dans
-- la conversation, jamais exécuté comme prescription dans la section du plan.
--
-- ── POURQUOI UNE COLONNE SUR LA DOCTRINE, ET PAS UNE TABLE ────────────────
-- Précédent explicite des gestes quotidiens (`daily_practices`): la méthode
-- d'un coach doit vivre SUR l'objet doctrine, versionné, publié et
-- rollbackable d'un bloc. Une table à part forkerait le cycle de vie — deux
-- configurations coach, pas de version dans `generated_from`, pas de
-- publication atomique.
--
-- ⚠️ Et comme les gestes quotidiens, `activity_stance` N'ENTRE PAS dans le
-- bloc de doctrine compilé pour la conversation: le hash de cache reste
-- INCHANGÉ pour tous les coachs existants, donc aucune refragmentation. Le
-- bloc chat sert la CONVICTION (via belief_key), la section d'activité sert le
-- JETON.
--
-- ── LES PORTES QUE CETTE COLONNE NE PEUT PAS OUVRIR ───────────────────────
-- La hiérarchie du produit est **plancher TCA > coach > Sophia**. Une posture
-- ne lève NI le silence sous `restriction_flag` (l'exercice compulsif est un
-- comportement compensatoire documenté des TCA), NI le silence sur une
-- maladie déclarée (frontière clinique), NI la règle du mineur. Ces gardes
-- vivent dans `activity_floor.ts` et sont testées dans ce sens.
--
-- ── RÉ-APPLICABLE ──────────────────────────────────────────────────────────
-- `db reset` est interdit sur ce dépôt.

begin;

alter table public.coach_doctrines
  add column if not exists activity_stance jsonb not null default '{}'::jsonb;

comment on column public.coach_doctrines.activity_stance is
  'La posture du coach sur l''activité physique. Forme: '
  '{ mode: off|house|coach, emphases: [daily_movement|strength|cardio|'
  'recovery|mobility] (2 max), belief_key: text|null }. '
  'Liste fermée d''ACCENTS: aucun volume, aucune série, aucune charge — un '
  'coach ne fait pas programmer Sophia, sa méthode détaillée vit dans ses '
  'convictions, citables dans le chat. '
  'mode=off est le plus important: un coach qui programme lui-même doit '
  'pouvoir faire taire le produit sur son terrain. '
  'N''ENTRE PAS dans le bloc de doctrine compilé (même statut que '
  'daily_practices) — le hash de cache du chat reste inchangé. '
  'Ne lève AUCUNE garde: plancher TCA > coach > Sophia.';

-- LA FORME EST GARDÉE EN BASE, pas seulement en TypeScript. Une posture
-- illisible côté code se replie sur le silence — mais une ligne acceptée en
-- base et inerte au générateur ferait croire au coach que sa méthode passe.
alter table public.coach_doctrines
  drop constraint if exists coach_doctrines_activity_stance_shape_check;

alter table public.coach_doctrines
  add constraint coach_doctrines_activity_stance_shape_check
  check (
    jsonb_typeof(activity_stance) = 'object'
    and (
      not (activity_stance ? 'mode')
      or activity_stance ->> 'mode' in ('off', 'house', 'coach')
    )
    and (
      not (activity_stance ? 'emphases')
      or (
        jsonb_typeof(activity_stance -> 'emphases') = 'array'
        and jsonb_array_length(activity_stance -> 'emphases') <= 2
      )
    )
  );

-- ===========================================================================
-- LA PREUVE — les deux sens, dans la transaction
-- ===========================================================================

do $$
declare
  probe uuid := gen_random_uuid();
  probe_coach uuid;
  probe_doctrine uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  -- `coach_doctrines.coach_id` référence `coaches.id`, pas `auth.users.id`.
  insert into public.coaches (user_id, display_name)
  values (probe, 'probe')
  returning id into probe_coach;

  -- Le cas nominal: un coach qui met le renforcement en avant.
  insert into public.coach_doctrines (coach_id, version, content_locale, activity_stance)
  values (probe_coach, 1, 'fr-FR',
          '{"mode":"coach","emphases":["strength","recovery"],"belief_key":"b1"}'::jsonb)
  returning id into probe_doctrine;

  -- Un mode inconnu est refusé.
  begin
    update public.coach_doctrines
       set activity_stance = '{"mode":"programme"}'::jsonb
     where id = probe_doctrine;
    raise exception 'la ceinture est DÉSARMÉE: un mode inconnu a été accepté';
  exception when check_violation then null;
  end;

  -- Plus de deux accents est refusé: une section de trois lignes qui met cinq
  -- choses en avant n'en met aucune.
  begin
    update public.coach_doctrines
       set activity_stance =
         '{"mode":"coach","emphases":["strength","cardio","mobility"]}'::jsonb
     where id = probe_doctrine;
    raise exception 'la ceinture est DÉSARMÉE: trois accents ont été acceptés';
  exception when check_violation then null;
  end;

  -- DÉSARMEMENT: le défaut `{}` passe, et c'est le cas de TOUS les coachs
  -- existants — aucune ligne réécrite, aucun comportement changé.
  update public.coach_doctrines set activity_stance = '{}'::jsonb
   where id = probe_doctrine;
  if not exists (
    select 1 from public.coach_doctrines
    where id = probe_doctrine and activity_stance = '{}'::jsonb
  ) then
    raise exception 'le défaut vide devrait passer';
  end if;

  -- `off` est une posture valide et complète: c'est le coach qui programme
  -- lui-même et fait taire le produit.
  update public.coach_doctrines set activity_stance = '{"mode":"off"}'::jsonb
   where id = probe_doctrine;

  delete from public.coach_doctrines where id = probe_doctrine;
  delete from public.coaches where id = probe_coach;
  delete from auth.users where id = probe;
end;
$$;

commit;
