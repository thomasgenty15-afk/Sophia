-- ============================================================================
-- FF-001 — LES PRATIQUES QUOTIDIENNES DU COACH
-- ============================================================================
--
-- La doctrine dit comment COMPOSER — convictions, interdits, arbitrages,
-- aliments. Elle ne dit nulle part quoi FAIRE tous les jours.
--
-- Ce sont deux objets différents, et les confondre coûte la moitié de ce qu'un
-- coach répète en vrai. « Protéine à chaque repas » est une règle de
-- composition: elle gouverne UN PLAT, et `beliefs` est son endroit. « Quatre
-- verres d'eau » gouverne UNE JOURNÉE, et aucun plat ne la porte — donc aucune
-- ligne de plan ne peut la citer, et l'élève ne l'entend jamais.
--
-- ── POURQUOI SUR `coach_doctrines` ET PAS DANS UNE TABLE À PART ────────────
-- Parce qu'une pratique est de la MÉTHODE, et que la méthode est versionnée et
-- publiée d'un bloc. Une table à côté aurait sa propre durée de vie: le coach
-- publierait la version 4 de sa doctrine et ses pratiques resteraient celles
-- qu'il avait écrites pour la version 2, sans qu'un `rollback` puisse les
-- ramener. Ici, revenir en arrière ramène TOUT, parce que tout est sur la même
-- ligne.
--
-- ── LE CHAMP QUI SURPREND: `brief` N'EST PAS UNE PHRASE ────────────────────
-- On aurait pu stocker deux phrases toutes faites (« pense à tes 4 verres »,
-- « tu as bu tes 4 verres ? »). C'est refusé, et c'est le cœur de la
-- conception: une phrase figée redonne exactement la répétition qu'on cherche
-- à supprimer — quatre soirs et c'est du papier peint, la même cicatrice que
-- le compliment quotidien documentée en tête de `daily_recap.ts`.
--
-- Le `brief` INSTRUIT le modèle; la phrase est générée le soir même, dans le
-- MÊME appel que le fait de la journée. Un appel par pratique et par coach, à
-- vie — jamais un par élève et par soir.
--
-- ── LA CLASSIFICATION EST STOCKÉE, PAS RECALCULÉE ─────────────────────────
-- Même patron que `coach_food_proposals` et son `why_source`: ce que le modèle
-- a compris est ÉCRIT, donc le coach le voit et peut le reprendre. Recalculer
-- au vol coûterait un appel par envoi et rendrait le verdict invisible.
--
-- ── CE QUE CETTE COLONNE N'AUTORISE PAS ───────────────────────────────────
-- Aucune coche, aucun compteur, aucune série. Une pratique est DÉCLARÉE ou
-- INCONNUE, jamais inférée (`auto-tick-writes-undeniable-false-facts`), et rien
-- ici n'est un dénominateur: `streak_display` et `adherence_score` sont déjà
-- dans `SUPPRESSED_STUDENT_SURFACES`, et compter les réponses à une question de
-- pratique serait exactement le glissement que le plancher TCA existe pour
-- empêcher.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La colonne
-- ---------------------------------------------------------------------------

alter table public.coach_doctrines
  add column if not exists daily_practices jsonb not null default '[]'::jsonb;

-- La FORME, et rien de plus. Le plafond de 7 (FF-001 R2), la validité des
-- jetons et la portée par objectif sont tenus par `parseDailyPractices`, qui
-- COMPTE ce qu'il écarte et le rend au coach à l'écran. Une CHECK qui refuse la
-- 8e pratique ferait échouer un `save` avec une erreur Postgres brute, là où le
-- produit doit dire au coach LAQUELLE de ses pratiques ne partira pas.
--
-- Ce que la base garde, elle, est ce qu'aucun parseur ne peut rattraper: un
-- objet ou un scalaire à la place d'une liste, qui ferait lire « aucune
-- pratique » à un coach qui en a écrit sept.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.coach_doctrines'::regclass
       and conname = 'coach_doctrines_daily_practices_shape_check'
  ) then
    alter table public.coach_doctrines
      add constraint coach_doctrines_daily_practices_shape_check
      check (jsonb_typeof(daily_practices) = 'array');
  end if;
end;
$$;

comment on column public.coach_doctrines.daily_practices is
  'FF-001 — LES GESTES QUOTIDIENS de la methode, versionnes et publies avec '
  'elle. Forme fermee: [{"label","kind","quantified","target","unit",'
  '"goal_scope":[],"cadence","askable","minor_safe","brief","status",'
  '"collides_with"}]. '
  'label = les mots du COACH, verbatim, jamais reecrits par un modele. '
  'brief = LE MINI-PROMPT, PAS UNE PHRASE FIGEE: une phrase toute faite '
  'redonne la repetition qu''on supprime (quatre soirs et c''est du papier '
  'peint, cf. l''en-tete de daily_recap.ts). La phrase est generee le soir '
  'meme, dans le MEME appel modele que le fait de la journee. '
  'goal_scope = meme semantique et meme filtre que beliefs/arbitrations '
  '(goalScopeApplies): vide = toute la cohorte. '
  'cadence = constant (revient souvent) | rotating (chacun son tour). '
  'status = active | remind_only | needs_review | blocked; needs_review et '
  'blocked NE PARTENT PAS (R7). '
  'collides_with nomme la ceinture existante en conflit quand status=blocked '
  '(R9), et vaut NULL partout ailleurs: on ne refuse JAMAIS une pratique sur '
  'la methode du coach (R8), uniquement sur une incoherence interne. '
  'Plafond de 7 par doctrine (R2), tenu par parseDailyPractices qui COMPTE ce '
  'qu''il ecarte au lieu de faire echouer le save.';

-- ---------------------------------------------------------------------------
-- 2. Les privilèges — refermés sur une table qui les avait tous ouverts
-- ---------------------------------------------------------------------------
--
-- ⚠️ CE BLOC N'A RIEN À VOIR AVEC LA COLONNE CI-DESSUS, ET C'EST EXPRÈS.
--
-- Supabase accorde par DÉFAUT les SEPT privilèges à `authenticated` sur toute
-- table de `public` — vérifié sur celle-ci le 2026-08-07:
--
--   authenticated: SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER
--
-- Quatre sont gouvernés par RLS (`coach_doctrines_coach_all`), donc un coach ne
-- touche que ses lignes. TROIS NE LE SONT PAS:
--
--   TRUNCATE   — n'est PAS soumis à RLS. N'importe quel porteur de JWT pouvait
--                vider la table des doctrines de TOUS les coachs, en une
--                instruction, sans qu'aucune policy ne s'y oppose.
--   REFERENCES — permet d'accrocher une clé étrangère sur ces lignes.
--   TRIGGER    — permet de poser un trigger sur la table d'un autre.
--
-- On retire tout, puis on rend EXACTEMENT les quatre que RLS gouverne. Le
-- comportement de l'écran ne bouge pas d'un iota: toute écriture réelle passe
-- par `coach-doctrine-v1` en `service_role`, et `service_role` n'est pas touché
-- ici. Ce qui disparaît est la seule chose que personne n'utilisait et que
-- personne ne pouvait arrêter.
--
-- `from public, anon, authenticated` et pas `from public`: `revoke ... from
-- public` ne retire RIEN à `anon` ni à `authenticated`, qui portent leurs
-- propres grants. La cicatrice est déjà écrite dans ce dépôt
-- (`revoke-from-public-leaves-anon`), et se vérifie par
-- `has_table_privilege('anon', 'public.coach_doctrines', 'TRUNCATE')`.
revoke all on public.coach_doctrines from public, anon, authenticated;

grant select, insert, update, delete on public.coach_doctrines to authenticated;
