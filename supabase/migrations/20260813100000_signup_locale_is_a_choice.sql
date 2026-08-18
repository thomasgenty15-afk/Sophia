-- ===========================================================================
-- LA LANGUE DU COMPTE EST UN CHOIX — ET LE MOTEUR DE RATTACHEMENT CESSE DE
-- L'ÉCRASER.
--
-- ── LE DÉFAUT, EXACTEMENT ──────────────────────────────────────────────────
-- `keel_attach_student_to_coach` écrivait `locale = 'en-US'` en dur sur tout
-- compte qui DEVENAIT élève. Il tourne APRÈS `handle_new_user()`, qui vient
-- d'insérer la locale portée par les métadonnées de `signUp`. L'ordre est donc:
--
--     handle_new_user()            -> profiles.locale = 'fr-FR'  (le choix)
--     keel_attach_student_to_coach -> profiles.locale = 'en-US'  (l'épingle)
--
-- Conséquence: tant que cette ligne existe, corriger les portes côté client ne
-- change RIEN. Les trois chemins élève passent tous par ce moteur —
-- `keel_join_house_coach` (/start), `accept_coach_invitation_for_user` (/join),
-- et le bloc free-signup de `handle_new_user`.
--
-- ── CE QUI CHANGE ──────────────────────────────────────────────────────────
-- Une seule ligne de code disparaît. Le reste du corps est REPRIS TEL QUEL de
-- sa définition vivante — `20260805093000_house_discovery_plan_version.sql:189`
-- (timestamp le plus haut; `20260805091000:40` et `20260804180000:199` sont de
-- l'histoire, les reprendre annulerait la reprise du coach maison).
--
-- ── CE QUI NE CHANGE PAS, ET POURQUOI ──────────────────────────────────────
-- Le repli `'fr-FR'` de `handle_new_user()` reste. Il ne se déclenche que si
-- une porte oublie ses métadonnées, et c'est désormais interdit côté client par
-- un champ REQUIS (`FreeSignupMetadataInput.locale`) plus une ceinture de lint.
-- Recréer une fonction trigger de cent lignes pour changer un repli qui ne
-- s'exécute jamais coûterait plus de risque que ça n'en retire.
--
-- Le PAYS n'est pas touché non plus: il a son propre `update`, sans condition
-- de rôle, et c'est lui — pas la langue — qui décide de la hotline de crise.
-- ===========================================================================

create or replace function public.keel_attach_student_to_coach(
  p_user_id uuid,
  p_coach_id uuid,
  p_invited_email text default null,
  p_country text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_link_id uuid;
  v_link_coach uuid;
  v_target_kind text;
  v_incumbent_kind text;
  v_country text;
begin
  if p_user_id is null or p_coach_id is null then
    raise exception 'keel_attach_student_to_coach: missing user or coach'
      using errcode = '22023';
  end if;

  select c.coach_kind into v_target_kind
    from public.coaches c where c.id = p_coach_id;
  if v_target_kind is null then
    raise exception 'keel_attach_student_to_coach: unknown coach %', p_coach_id
      using errcode = '22023';
  end if;

  -- LE PAYS, VALIDÉ ICI ET PAS TROIS COUCHES PLUS LOIN (R7).
  --
  -- Une valeur non vide et malformée RAISE. Elle ne peut venir que d'un client
  -- contourné — nos deux formulaires n'offrent qu'un sélecteur fermé — et
  -- écrire NULL en silence à sa place, c'est reconstituer exactement l'état
  -- (`country IS NULL`) dont le résolveur de crise déduit un pays depuis la
  -- langue. NULL est acceptable quand rien n'est déclaré; NULL en RÉPARATION
  -- d'une saisie invalide est un mensonge sur ce qu'on sait de la personne.
  v_country := nullif(btrim(coalesce(p_country, '')), '');
  if v_country is not null then
    v_country := upper(v_country);
    if v_country !~ '^[A-Z]{2}$' then
      raise exception 'keel_attach_student_to_coach: malformed country %', p_country
        using errcode = '22023';
    end if;
  end if;

  -- Le lien VIVANT de cet élève, verrouillé: deux onglets qui rejoignent en
  -- même temps se sérialisent ici au lieu de courir sur l'index unique.
  select cc.id, cc.coach_id into v_link_id, v_link_coach
    from public.coach_clients cc
   where cc.student_user_id = p_user_id
     and cc.status in ('invited', 'active')
   limit 1
     for update;

  if v_link_id is not null and v_link_coach <> p_coach_id then
    select c.coach_kind into v_incumbent_kind
      from public.coaches c where c.id = v_link_coach;

    -- ── LE PASSAGE DU COACH MAISON À UN VRAI COACH ──────────────────────
    --
    -- Un testeur ou un curieux finira par être invité par un vrai coach. Sans
    -- ce bloc, il reçoit `already_coached` et se voit dire qu'il « suit déjà le
    -- programme d'un autre coach » — c'est-à-dire nous, avec un programme de
    -- découverte, ce qui est incompréhensible pour lui et bloquant pour le
    -- coach qui l'a invité.
    --
    -- Le lien maison est CLOS, jamais laissé vivant à côté. `.limit(1)` sur les
    -- liens actifs dans `generate-week-plan-v1:123` et dans
    -- `loadPublishedDoctrine` rendrait sinon le choix du coach ARBITRAIRE et
    -- SILENCIEUX: l'élève pourrait recevoir la semaine de son vrai coach et la
    -- doctrine de la maison, ou l'inverse, d'un appel à l'autre.
    --
    -- CONDITION DE DÉSARMEMENT: uniquement maison → humain. Deux coachs humains
    -- restent un refus (`already_coached`): un élève ne change pas de vrai coach
    -- par une invitation, il passe par `revoke_coach_access()`. Et l'inverse —
    -- la maison qui déplacerait un vrai coach — n'est pas atteignable ici, car
    -- la porte libre n'appelle ce moteur que sur un élève sans lien vivant.
    if v_incumbent_kind = 'house' and v_target_kind = 'human' then
      update public.coach_clients
         set status = 'ended',
             ended_at = now(),
             updated_at = now()
       where id = v_link_id;

      -- LE PROTOCOLE DE DÉCOUVERTE SORT AVEC LE LIEN.
      --
      -- Le laisser publié donnerait au nouveau coach la vue d'un protocole
      -- signé d'un coach que l'élève n'a plus (`plan_versions_select_coach` ne
      -- filtre que sur l'appartenance), et ferait classer les photos de l'élève
      -- contre un programme périmé. Superseded et pas supprimé: c'est de
      -- l'historique, et il appartient à l'élève.
      update public.plan_versions
         set status = 'superseded',
             updated_at = now()
       where student_id = p_user_id
         and coach_id = v_link_coach
         and status = 'published';

      v_link_id := null;
    else
      return 'already_coached';
    end if;
  end if;

  begin
    if v_link_id is not null then
      -- Même coach, déjà vivant: ré-acceptation idempotente.
      update public.coach_clients
         set status = 'active',
             consent_granted_at = coalesce(consent_granted_at, now()),
             started_at = coalesce(started_at, now()),
             ended_at = null,
             updated_at = now()
       where id = v_link_id;
    else
      -- Un lien en pause ou terminé avec CE coach est repris plutôt que
      -- dupliqué: l'audit et l'historique de facturation de la période
      -- précédente restent attachés à une seule ligne.
      select cc.id into v_link_id
        from public.coach_clients cc
       where cc.student_user_id = p_user_id
         and cc.coach_id = p_coach_id
         and cc.status in ('paused', 'ended')
       order by cc.updated_at desc
       limit 1
         for update;

      if v_link_id is not null then
        update public.coach_clients
           set status = 'active',
               consent_granted_at = now(),
               -- `started_at` NE BOUGE PAS sur une reprise: c'est le plancher
               -- d'historique que le coach est en droit de lire (voir la
               -- migration 20260805092000). Le remettre à now() effacerait des
               -- semaines qu'il a bel et bien encadrées.
               started_at = coalesce(started_at, now()),
               ended_at = null,
               updated_at = now()
         where id = v_link_id;
      else
        insert into public.coach_clients
          (coach_id, student_user_id, invited_email, status,
           consent_granted_at, started_at, seat_state)
        values
          (p_coach_id, p_user_id, lower(nullif(btrim(coalesce(p_invited_email, '')), '')),
           'active', now(), now(),
           -- Un siège maison est marqué 'free' dès l'écriture. Ce n'est PAS ce
           -- qui l'exclut de la facturation — `keel_coach_seat_ledger` le fait
           -- sur `coach_kind`, donc sans dépendre de cette colonne — mais un
           -- siège gratuit qui s'affiche 'trial' sur un écran est une ligne qui
           -- se lit comme un essai qui va expirer.
           case when v_target_kind = 'house' then 'free' else 'trial' end)
        returning id into v_link_id;
      end if;
    end if;
  exception when unique_violation then
    -- `one_live_coach_per_student` a mordu: un autre coach a gagné la course
    -- entre notre SELECT et cette écriture. Même réponse que le test explicite.
    return 'already_coached';
  end;

  -- Le garde de route de l'app élève lit `profiles.keel_role`. Devenir élève
  -- d'un coach est ce qui fait de quelqu'un un élève, donc le rôle est posé
  -- ici — mais seulement s'il est vide: on ne rétrograde jamais un coach qui
  -- aurait accepté l'invitation d'un pair sur son propre compte.
  --
  -- ⚠️ `locale = 'en-US'` ÉTAIT ICI, ET SON RETRAIT EST TOUT LE CHANGEMENT.
  --
  -- Le commentaire retiré disait: « on n'écrit la langue du PRODUIT que sur
  -- quelqu'un qui DEVIENT élève ici ». C'était vrai d'un produit qui n'avait
  -- qu'une langue. Depuis que la personne choisit la sienne à l'inscription,
  -- cette ligne n'écrivait plus une langue de produit: elle DÉTRUISAIT un
  -- choix — et elle le faisait APRÈS COUP. `handle_new_user()` insère la
  -- locale des métadonnées, puis ce moteur-ci passe derrière et la remplace,
  -- donc réparer les portes côté client n'aurait strictement rien changé.
  --
  -- POURQUOI RETIRER PLUTÔT QUE `coalesce(...)`: `handle_new_user()` possède
  -- déjà cette colonne à la création, et son `on conflict` fait
  -- `coalesce(public.profiles.locale, excluded.locale)` — il n'écrase jamais.
  -- Un `coalesce` ici laisserait un SECOND écrivain, qui se déclencherait à la
  -- transition `keel_role is null` d'un compte EXISTANT: un instant où
  -- personne n'a choisi de langue, donc où personne ne devrait en écrire une.
  --
  -- C'est le dernier reste de l'épingle pilote, restée en SQL après son
  -- retrait de `_shared/keel/locale.ts` (lot L1, 2026-08-08).
  update public.profiles
     set keel_role = 'student',
         updated_at = now()
   where id = p_user_id
     and keel_role is null;

  -- LE PAYS. Séparément et sans condition de rôle: un élève déjà lié qui
  -- ré-accepte doit lui aussi sortir d'ici avec un pays. `country is null` est
  -- la seule garde — une déclaration de l'élève ne se fait jamais écraser.
  if v_country is not null then
    update public.profiles
       set country = v_country,
           updated_at = now()
     where id = p_user_id
       and country is null;
  end if;

  -- LE PROTOCOLE PUBLIÉ. Pour la maison seulement, et idempotent: sans lui la
  -- photo — le geste central du produit — est refusée par 409 à tout inscrit
  -- libre. Trouvé par l'épreuve de réel, pas par un test; voir l'en-tête.
  if v_target_kind = 'house' then
    perform public.keel_provision_house_plan_version(p_user_id, p_coach_id);
  end if;

  return 'attached';
end;
$function$;

comment on function public.keel_attach_student_to_coach(uuid, uuid, text, text) is
  'LE moteur de rattachement élève→coach: lien coach_clients, keel_role, pays, '
  'et — pour le coach maison — le protocole publié sans lequel la photo de repas '
  'est refusée. Les deux portes (invitation, inscription libre) l''appellent: '
  'c''est ce qui rend impossible qu''une porte oublie le pays, donc qu''un élève '
  'reçoive la hotline d''un autre pays. Clôt le lien au coach maison ET '
  'supersède son protocole quand un VRAI coach prend la suite; refuse tout autre '
  'changement de coach (already_coached). N''ÉCRIT PLUS `locale`: la langue est '
  'choisie à l''inscription et posée par handle_new_user(), qui en est le seul '
  'écrivain.';
