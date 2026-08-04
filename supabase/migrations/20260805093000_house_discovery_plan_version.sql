-- ============================================================================
-- LE PROGRAMME PUBLIÉ DE L'INSCRIT LIBRE — sans quoi sa photo est refusée
--
-- LE DÉFAUT, TROUVÉ PAR L'ÉPREUVE DE RÉEL (2026-08-05) ET PAR RIEN D'AUTRE
-- ------------------------------------------------------------------------
-- Parcours joué au navigateur, sans jamais passer par une invitation:
-- inscription libre → keel_role posé → pays écrit → semaine GÉNÉRÉE depuis la
-- doctrine maison (`ok: true`, avec les clés de conviction en traçabilité).
-- Tout vert. Puis:
--
--     meal-photo-upload-v1  →  409 « No published plan: there is nothing to log
--                              this photo against yet. »
--
-- La photo est LE geste central du produit. Elle était morte pour tout inscrit
-- libre, et l'écran du jour affichait « Your coach is putting it together » —
-- une phrase qui ne pouvait jamais devenir vraie.
--
-- POURQUOI ÇA A ÉCHAPPÉ À L'ANALYSE DE §3
-- ---------------------------------------
-- La mission liste trois dépendances dures, dont « le programme publié ». J'ai
-- lu `plan_versions` comme une conséquence de la boucle normale (générer +
-- adopter une semaine) et je me suis trompé: `student_week_plans` est la semaine
-- que l'élève adopte, `plan_versions` est le PROTOCOLE que le coach publie POUR
-- lui, et il ne s'écrit que par `plan-publish-v1` — sous le JWT d'un coach.
--
-- Or le coach maison ne peut PAS se connecter, délibérément (mot de passe nul,
-- email en `.invalid`, `banned_until` 2999). Personne ne pouvait donc publier le
-- programme d'un inscrit libre. La dépendance n'était pas satisfaite par le
-- coach maison: elle était satisfaite pour la DOCTRINE et pas pour le PROTOCOLE,
-- et seule l'épreuve de réel pouvait montrer la différence.
--
-- CE QU'ON ÉCRIT, ET OÙ
-- ---------------------
-- Le provisionnement va dans `keel_attach_student_to_coach()`, avec le reste:
-- c'est le même principe que tout ce chantier — l'inscrit libre est un élève
-- ORDINAIRE, donc il a un protocole publié comme les autres, et aucune surface
-- en aval n'a besoin de savoir qu'il vient de la maison.
--
-- L'alternative était de relâcher `meal-photo-upload-v1` pour les élèves du
-- coach maison. C'est exactement la propagation d'exceptions que §3 refuse: il
-- aurait fallu la répéter dans le chemin photo, la pulse du soir, l'adhérence et
-- la synthèse.
--
-- ── UN ENGAGEMENT, ET UN SEUL, PARCE QUE LA BASE L'EXIGE MORALEMENT ──────
-- `plan-publish-v1` refuse de publier un protocole sans engagement (« a
-- published plan needs at least one commitment »). Cette migration écrit hors de
-- cette fonction, donc rien ne l'y forcerait techniquement — mais publier une
-- ligne que le chemin normal aurait refusée, c'est fabriquer un état que le
-- reste du système croit impossible.
--
-- L'engagement est donc réel, et c'est le geste du programme: PHOTOGRAPHIER un
-- repas. `polarity='capture'`, `evidence_kind='photo'`, et surtout
-- `counts_toward_adherence = false` — le programme de découverte ne note
-- personne, et sa propre doctrine le dit (`join.grade` / « nothing here scores
-- you »). Un engagement qui compterait vers un pourcentage d'adhérence
-- contredirait la seule promesse que cette page fait à l'élève.
--
-- ── ET AU PASSAGE AU VRAI COACH, ON LE RETIRE ────────────────────────────
-- `plan-publish-v1` supersède déjà le protocole publié avant d'en publier un
-- nouveau, donc rien ne casse quand le vrai coach publie. Mais ENTRE la bascule
-- et cette publication, l'élève garderait un protocole publié signé d'un coach
-- qu'il n'a plus — et le nouveau coach le VERRAIT (`plan_versions_select_coach`
-- ne filtre que sur l'appartenance). On le supersède donc au moment de la
-- bascule. L'élève se retrouve alors sans protocole publié, et le refus de la
-- photo redevient VRAI: « your coach hasn't published your plan » — ce qui est
-- exactement la situation.
-- ============================================================================

create or replace function public.keel_provision_house_plan_version(
  p_user_id uuid,
  p_coach_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan_id uuid;
  v_timezone text;
  v_kind text;
  v_version integer;
begin
  select c.coach_kind into v_kind from public.coaches c where c.id = p_coach_id;
  if v_kind is distinct from 'house' then
    -- CONDITION DE DÉSARMEMENT: cette fonction ne provisionne QUE pour la
    -- maison. Un vrai coach publie son protocole lui-même, par
    -- `plan-publish-v1`, et lui en fabriquer un serait écrire sa méthode à sa
    -- place — la faute que tout ce produit existe pour ne pas commettre.
    return null;
  end if;

  -- Déjà un protocole publié ? On ne touche à rien. C'est ce qui rend le
  -- rattachement rejouable, et ça protège aussi le cas où un vrai coach a
  -- publié: on ne lui volerait pas sa place.
  select pv.id into v_plan_id
    from public.plan_versions pv
   where pv.student_id = p_user_id
     and pv.status = 'published';
  if v_plan_id is not null then
    return v_plan_id;
  end if;

  -- LE FUSEAU. `meal-photo-upload-v1` le lit sur CETTE ligne pour résoudre le
  -- jour local de la photo — c'est même la raison qu'il donne pour exiger un
  -- protocole publié (« no timezone to resolve the day in »). Le prendre sur le
  -- profil, et se rabattre sur UTC plutôt que sur une valeur inventée: un fuseau
  -- faux daterait les repas d'un jour à côté.
  select coalesce(nullif(btrim(p.timezone), ''), 'UTC') into v_timezone
    from public.profiles p where p.id = p_user_id;
  v_timezone := coalesce(v_timezone, 'UTC');

  -- LA VERSION SE SUIT, elle ne se réinvente pas à 1.
  --
  -- Trouvé en relecture à froid, sur un chemin bien atteignable: un inscrit libre
  -- passe à un vrai coach (son protocole de découverte devient `superseded`),
  -- quitte ce coach, puis revient sur la porte libre. Un `version = 1` en dur
  -- écrirait une SECONDE ligne version 1 pour le même élève — rien ne l'interdit
  -- (l'index unique ne porte que sur « un seul publié »), et l'historique de ses
  -- protocoles devient inordonnable.
  select coalesce(max(pv.version), 0) + 1 into v_version
    from public.plan_versions pv where pv.student_id = p_user_id;

  insert into public.plan_versions (
    coach_id, student_id, version, status, title, content_locale, timezone,
    anchor_week_start, duration_weeks, published_at, published_by,
    notes_for_student
  )
  values (
    p_coach_id, p_user_id, v_version, 'published',
    'KEEL discovery program', 'en-US', v_timezone,
    (date_trunc('week', (now() at time zone v_timezone))::date), 12,
    now(),
    -- `published_by` = le compte du coach maison. Il ne s'est pas connecté pour
    -- le faire — il ne peut pas — mais l'attribution reste juste: c'est bien son
    -- programme, et laisser NULL rendrait la ligne anonyme dans l'audit.
    (select c.user_id from public.coaches c where c.id = p_coach_id),
    'The KEEL discovery program. General principles, not a plan written for you: '
    || 'a real coach on KEEL is what that would be.'
  )
  returning id into v_plan_id;

  insert into public.plan_commitments (
    plan_version_id, user_id, coach_id,
    title, content_locale,
    polarity, activity_class, anchor_kind,
    measure, target_op, evidence_kind, evidence_required,
    evaluation_grain, counts_toward_adherence
  )
  values (
    v_plan_id, p_user_id, p_coach_id,
    -- Le libellé que l'élève lit. C'est le geste du programme, pas une cible.
    'Photograph a meal', 'en-US',
    -- « capture »: on demande de CONSTATER, pas d'atteindre une cible. C'est le
    -- seul type d'engagement qu'un programme qui ne connaît pas la personne peut
    -- honnêtement porter.
    'capture', 'nutrition', 'free',
    'presence', 'any', 'photo', false,
    'day',
    -- FAUX, et c'est la ligne la plus importante de cette fonction. Le programme
    -- de découverte ne note personne; un engagement comptant vers un pourcentage
    -- d'adhérence contredirait la seule promesse faite à l'élève.
    false
  );

  return v_plan_id;
end;
$function$;

comment on function public.keel_provision_house_plan_version(uuid, uuid) is
  'Publie le protocole du programme de découverte pour un inscrit libre. Sans '
  'lui, meal-photo-upload-v1 rend 409 « No published plan » et la photo — le '
  'geste central du produit — est morte pour tout élève du coach maison, parce '
  'que seul plan-publish-v1 écrit plan_versions et qu''il exige le JWT d''un '
  'coach que la maison n''a pas. Ne fait RIEN pour un coach humain: celui-là '
  'publie sa méthode lui-même.';

revoke all on function public.keel_provision_house_plan_version(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.keel_provision_house_plan_version(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Le moteur de rattachement, complété aux deux bouts:
--   · à l'entrée maison  -> provisionner le protocole de découverte
--   · à la bascule       -> le superséder, pour que le vrai coach n'hérite pas
--                           d'un protocole publié signé d'un coach parti
-- ---------------------------------------------------------------------------

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
  -- `locale` part de la MÊME condition, délibérément: on n'écrit la langue du
  -- produit que sur quelqu'un qui DEVIENT élève ici.
  update public.profiles
     set keel_role = 'student',
         locale = 'en-US',
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
  'LE moteur de rattachement élève→coach: lien coach_clients, keel_role, '
  'locale du produit, pays, et — pour le coach maison — le protocole publié sans '
  'lequel la photo de repas est refusée. Les deux portes (invitation, '
  'inscription libre) l''appellent: c''est ce qui rend impossible qu''une porte '
  'oublie le pays, donc qu''un élève reçoive la hotline d''un autre pays. Clôt '
  'le lien au coach maison ET supersède son protocole quand un VRAI coach prend '
  'la suite; refuse tout autre changement de coach (already_coached).';
