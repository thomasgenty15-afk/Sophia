-- ============================================================================
-- FF-029 — LES PRATIQUES DE LA MÉTHODE MAISON
-- ============================================================================
--
-- FF-001 a donné au COACH un endroit où écrire ses gestes quotidiens. Le B2C n'a
-- rien: personne n'écrit de pratiques pour quelqu'un qui n'a pas de coach, alors
-- que « boire, bouger, manger à des heures régulières » sont précisément les
-- pratiques universelles qu'une méthode maison peut porter pour tout le monde.
--
-- ── POURQUOI CETTE MIGRATION N'AJOUTE NI TABLE NI COLONNE ─────────────────
-- Parce que LE COACH MAISON EST UN COACH (`coaches.coach_kind = 'house'`,
-- migration 20260805090000), et c'est toute l'astuce du produit. R3 de FF-029:
-- « la méthode maison passe par les MÊMES rails que le coach ». Un second chemin
-- « défauts B2C » aurait sa propre sélection, sa propre cadence et ses propres
-- ceintures — c'est-à-dire trois occasions de diverger de celui qui compte, et
-- la divergence se paierait du seul côté qui a un visage: un élève B2C recevant
-- une pratique qu'un élève de coach n'aurait jamais reçue.
--
-- On écrit donc dans `coach_doctrines.daily_practices` de la ligne PUBLIÉE du
-- coach maison. Rien d'autre. `parseDailyPractices`, `practicesFor`,
-- `selectPracticeForEvening`, `decidePracticeMode`, `redactQuantities` et la
-- ceinture `minor_quantity` s'appliquent sans une ligne de code de plus.
--
-- ── AUCUNE PRATIQUE CHIFFRÉE, ET C'EST UNE DÉCISION ───────────────────────
-- Les trois sont `quantified = false`. La doctrine maison le dit déjà d'elle-
-- même (migration 20260805090000): « aucune quantité, aucun macro, aucun
-- objectif de poids ». Une dose — « 8 verres », « 10 000 pas » — est une
-- PRESCRIPTION, et prescrire à quelqu'un qu'on ne connaît pas est exactement la
-- posture d'autorité nutritionnelle que le programme de découverte refuse.
--
-- Conséquence heureuse et voulue: le jeu maison est sûr pour un mineur PAR
-- CONSTRUCTION. `minor_quantity` n'a aucun chiffre à retenir parce qu'il n'y en
-- a aucun à sortir — la ceinture reste armée pour les coachs humains, qui eux
-- écrivent « 4 verres d'eau », et elle n'a simplement rien à mordre ici.
--
-- ── TROIS, PAS SEPT (§9 « le jeu maison qui gonfle ») ─────────────────────
-- Le plafond est à 7 (R2) et on en écrit 3. Le jeu par défaut doit être
-- universellement RAISONNABLE, pas ambitieux: la méditation, la lumière du
-- matin et le reste appartiennent aux coachs, qui eux connaissent leur cohorte.
-- Chaque pratique ajoutée ici est une chose que TOUT LE MONDE recevra, sans que
-- personne ne l'ait choisie.
--
-- ── PRÉ-CLASSÉES À LA MAIN (§7 « la classification se trompe ») ───────────
-- Aucun appel de modèle: le verdict est écrit ici, relu, et versionné avec la
-- doctrine. Côté coach c'est une IA qui propose et le coach qui corrige; côté
-- maison il n'y a pas de coach pour corriger, donc il n'y a pas d'IA pour
-- proposer. `status = 'active'` est donc une affirmation, pas un défaut.
--
-- ── `cadence` — POURQUOI L'HYDRATATION EST `constant` ─────────────────────
-- `constant` occupe deux créneaux de rotation, `rotating` un seul: le socle
-- revient donc deux fois plus souvent. L'eau est la seule des trois qui se
-- rejoue vraiment tous les jours sans devenir absurde — « mange à des heures
-- régulières » répété deux fois plus souvent serait du papier peint en une
-- semaine. Cycle résultant: 4 créneaux, adjacence nulle (`practiceSlots`).
--
-- ── `goal_scope` VIDE ─────────────────────────────────────────────────────
-- Vide = toute la cohorte. Aucune de ces trois n'est une affaire d'objectif:
-- restreindre l'eau à la perte de gras serait inventer une thèse que le
-- programme de découverte n'a pas.
-- ============================================================================

do $$
declare
  v_coach_id uuid;
  v_rows     integer;
begin
  -- RÉSOLU PAR `coach_kind`, JAMAIS PAR UN UUID EN DUR. La migration
  -- 20260805090000 est le seul endroit du dépôt qui connaît l'identifiant du
  -- coach maison, et elle écrit noir sur blanc que « tout le code résout par
  -- coach_kind = 'house' ». Un second UUID recopié ici serait le premier à
  -- diverger dans un environnement neuf.
  select c.id into v_coach_id
    from public.coaches c
   where c.coach_kind = 'house'
     and c.status = 'active'
   limit 1;

  if v_coach_id is null then
    -- PAS UNE ERREUR. Un environnement sans coach maison est un environnement
    -- où l'inscription libre n'existe pas encore; échouer ici bloquerait sa
    -- chaîne de migrations pour une fonctionnalité qui ne le concerne pas.
    raise notice 'FF-029: no house coach on this database, no practice written';
    return;
  end if;

  update public.coach_doctrines d
     set daily_practices = jsonb_build_array(

           -- 1 · HYDRATATION — le socle, deux créneaux sur quatre.
           jsonb_build_object(
             'label',      'Drink water across the day, not all at once.',
             'kind',       'hydration',
             'quantified', false,
             'target',     null,
             'unit',       null,
             'goal_scope', jsonb_build_array(),
             'cadence',    'constant',
             -- `askable`: elle peut devenir une question. Répondre reste
             -- optionnel (R5) et le silence ne déclenche ni relance ni remarque
             -- — c'est `decidePracticeMode` et R7 qui le tiennent, pas ce champ.
             'askable',    true,
             'minor_safe', true,
             'brief',      'Bring up drinking water spread across the day rather than caught up in the evening. Keep it as a habit worth having, never a target to hit, and never name an amount or a container count.',
             'status',     'active',
             'collides_with', null
           ),

           -- 2 · MOUVEMENT — la barre la plus basse qui soit encore vraie.
           jsonb_build_object(
             'label',      'Move a little every day, even when it is only a walk.',
             'kind',       'movement',
             'quantified', false,
             'target',     null,
             'unit',       null,
             'goal_scope', jsonb_build_array(),
             'cadence',    'rotating',
             'askable',    true,
             'minor_safe', true,
             -- « ne dis pas qu'aujourd'hui a été raté »: on ne SAIT pas si la
             -- personne a bougé, et le prompt du soir le redit déjà. Le brief le
             -- répète parce qu'il est la seule chose que le modèle lit à propos
             -- de CETTE pratique.
             'brief',      'Mention moving a little every day as the low bar it is — a walk counts. Do not turn it into training, never name a duration, a distance or a step count, and never imply today''s was missed.',
             'status',     'active',
             'collides_with', null
           ),

           -- 3 · RÉGULARITÉ — l'écho quotidien de la conviction
           -- `regular_meals_beat_perfect_meals` de la doctrine maison. Une
           -- conviction gouverne un PLAT, une pratique gouverne une JOURNÉE:
           -- c'est la séparation que FF-001 existe pour tenir, et les deux
           -- disent ici la même chose à deux étages différents, exprès.
           jsonb_build_object(
             'label',      'Eat at roughly the same times each day.',
             'kind',       'meal_timing',
             'quantified', false,
             'target',     null,
             'unit',       null,
             'goal_scope', jsonb_build_array(),
             'cadence',    'rotating',
             'askable',    true,
             'minor_safe', true,
             'brief',      'Bring up keeping meal times roughly steady from one day to the next — that is what makes eating stop being a decision. Never name a clock time, and never comment on whether today''s meals were on time.',
             'status',     'active',
             'collides_with', null
           )
         ),
         updated_at = now()
   where d.coach_id = v_coach_id
     -- ⚠️ ON N'ÉCRASE JAMAIS UN JEU DÉJÀ ÉCRIT. Le coach maison est éditable par
     -- le même écran que les autres: une migration rejouée sur une base où
     -- quelqu'un a corrigé une pratique lui reprendrait sa correction sans rien
     -- dire. « Poser le défaut » et « imposer le défaut » ne sont pas la même
     -- opération, et seule la première est légitime ici.
     and coalesce(jsonb_array_length(d.daily_practices), 0) = 0;

  get diagnostics v_rows = row_count;
  raise notice 'FF-029: house daily practices written on % doctrine row(s)', v_rows;
end;
$$;
