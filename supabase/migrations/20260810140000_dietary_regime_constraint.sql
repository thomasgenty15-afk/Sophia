-- LE RÉGIME ALIMENTAIRE A ENFIN OÙ S'ÉCRIRE.
--
-- ── LE TROU ────────────────────────────────────────────────────────────────
-- `student_safety_constraints` porte cinq catégories — allergy, intolerance,
-- medical, religious, dislike — et aucune ne dit « je suis végétarien ». Un
-- végétarien n'est pas allergique, pas intolérant, pas malade, et son régime
-- n'est en général pas religieux. Le seul emplacement libre était `dislike`,
-- de sévérité `preference`: un CLASSEMENT, pas un verrou.
--
-- Conséquence, aujourd'hui en production: un végan reçoit un plan avec de la
-- viande dedans, et rien dans le produit ne peut l'en empêcher. Sa seule voie
-- est la prose libre de `student_goals.situation`, qu'un modèle respecte
-- « à peu près » — ce qui, pour un régime, veut dire pas du tout.
--
-- `medical_condition_floor_test.ts:250` acte d'ailleurs « je suis végétarien »
-- comme un message qui ne doit RIEN déclencher. Correct pour le plancher
-- médical; il se trouve que rien d'autre ne le rattrapait non plus.
--
-- ── POURQUOI ICI, ET PAS UNE TABLE À PART ──────────────────────────────────
-- L'exclusion d'un régime a exactement la même MÉCANIQUE D'EXÉCUTION qu'une
-- allergie: elle doit arriver en tête du prompt, elle doit armer la ceinture
-- de sortie, et elle doit être un rejet dur au parseur. Cette chaîne existe,
-- elle est durcie, et elle a déjà payé ses incidents. En construire une
-- seconde à côté aurait produit deux façons de refuser un aliment — donc, au
-- premier changement, deux comportements différents pour la même promesse.
--
-- ── POURQUOI UNE COLONNE, ET PAS UN DÉTOURNEMENT ───────────────────────────
-- Même raison que `condition_ref` (migration 20260806180000): écrire
-- « vegetarian » dans `substance_ref` marcherait et mentirait. `substance_ref`
-- désigne une substance INGÉRÉE et il est lu comme tel par
-- `medicalConstraintTokens` et par le compilateur de protocole. Un régime
-- n'est pas une substance.
--
-- ⚠️ ── ET SURTOUT: `diet_ref` NE DOIT JAMAIS ENTRER DANS LA LISTE D'ÉVITEMENT
-- La règle est écrite au-dessus de `safetyConstraintTokens()` pour
-- `condition_ref`, et elle vaut ici mot pour mot. Le 2026-08-06, des lignes
-- difformes (`allergen_ref='diabetes'`) ont armé la ceinture de sortie sur le
-- mot « diabetes », et un message d'urgence — « take fast-acting glucose now
-- and call emergency services » — a été remplacé par un refus poli, en run
-- réel.
--
-- Le même piège attend ici, en pire: armer la ceinture sur « vegan » ferait
-- rejeter toute réponse décrivant un plat comme végan — donc précisément les
-- bonnes réponses, et seulement pour les végans. Ce qui entre dans la liste
-- d'évitement, c'est l'EXPANSION du régime (viande, poisson, œuf, gélatine,
-- nuoc-mâm…), rendue par `_shared/keel/dietary_regime.ts`. Jamais le jeton.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────
-- Elle n'ouvre AUCUNE policy. La table n'en a toujours aucune en écriture:
-- tout passe par service_role après vérification de propriété, ou par la
-- fonction SECURITY DEFINER de rétractation. Rien ici ne change ce contrat.
--
-- Elle ne couvre PAS halal et casher: ils restent sur `religious` avec leurs
-- substances. La licéité y dépend autant du mode d'abattage et de la
-- séparation des ustensiles que de l'espèce — prétendre les tenir avec une
-- liste d'aliments exclus rendrait une garantie fausse, pire que pas de
-- garantie.
--
-- ── RÉ-APPLICABLE ──────────────────────────────────────────────────────────
-- `db reset` est interdit sur ce dépôt: cette migration doit pouvoir repasser
-- sur une base qui a déjà vécu. D'où les `if not exists` / `drop ... if
-- exists` systématiques, et la sonde finale qui nettoie derrière elle.

begin;

alter table public.student_safety_constraints
  add column if not exists diet_ref text;

comment on column public.student_safety_constraints.diet_ref is
  'Jeton de RÉGIME ALIMENTAIRE (liste fermée de _shared/keel/dietary_regime.ts : '
  'vegetarian, vegan, pescatarian). Non nul uniquement quand kind = ''diet''. '
  'N''ENTRE JAMAIS dans safetyConstraintTokens() : c''est son EXPANSION en '
  'aliments exclus qui arme la ceinture, jamais le nom du régime — même piège '
  'que condition_ref, qui avait bâillonné un message d''urgence en run réel.';

-- LA CATÉGORIE. Le CHECK est inline dans le `create table` d'origine
-- (20260727090000), donc porte le nom auto-généré.
alter table public.student_safety_constraints
  drop constraint if exists student_safety_constraints_kind_check;

alter table public.student_safety_constraints
  add constraint student_safety_constraints_kind_check
  check (kind in (
    'allergy', 'intolerance', 'medical', 'religious', 'dislike', 'diet'
  ));

-- LE CHECK D'IDENTIFIANT accueille la cinquième colonne. Sans ça la ligne
-- reste rejetée et la colonne ne sert à rien — c'est exactement la moitié qui
-- manquait à `condition_ref` avant sa migration.
alter table public.student_safety_constraints
  drop constraint if exists student_safety_constraints_ref_check;

alter table public.student_safety_constraints
  add constraint student_safety_constraints_ref_check
  check (
    allergen_ref is not null
    or substance_ref is not null
    or medication_class is not null
    or condition_ref is not null
    or diet_ref is not null
  );

-- LE RÉGIME EST UNE LISTE FERMÉE, en base et pas seulement en TypeScript. Un
-- jeton libre ici donnerait une ligne que `parseDietaryRegime` rendrait `null`
-- côté code: une contrainte enregistrée, affichée à l'élève comme respectée,
-- et silencieusement inerte au générateur.
alter table public.student_safety_constraints
  drop constraint if exists student_safety_constraints_diet_ref_check;

alter table public.student_safety_constraints
  add constraint student_safety_constraints_diet_ref_check
  check (diet_ref is null or diet_ref in ('vegetarian', 'vegan', 'pescatarian'));

-- UN RÉGIME EST UNE SÉVÉRITÉ `strict`, JAMAIS `preference`. C'est toute la
-- décision de ce chantier rendue non contournable: `preference` est ce qui
-- classe, `strict` est ce qui verrouille. Une ligne de régime en `preference`
-- serait la version cochée du produit d'avant.
--
-- `medical` reste possible: une éviction stricte prescrite (allergie multiple
-- ou intolérance sévère) peut légitimement porter un régime.
alter table public.student_safety_constraints
  drop constraint if exists student_safety_constraints_diet_severity_check;

alter table public.student_safety_constraints
  add constraint student_safety_constraints_diet_severity_check
  check (kind <> 'diet' or severity in ('strict', 'medical'));

-- L'UNICITÉ DE L'ACTIF suit la même extension. Sans elle, deux déclarations
-- successives du même régime produiraient deux lignes actives, et le `23505`
-- sur lequel s'appuie l'insert (« déjà déclaré, on relit au lieu de doubler »)
-- ne se déclencherait jamais.
drop index if exists public.student_safety_constraints_active_unique_idx;

create unique index student_safety_constraints_active_unique_idx
  on public.student_safety_constraints (
    user_id,
    kind,
    coalesce(allergen_ref, ''),
    coalesce(substance_ref, ''),
    coalesce(medication_class, ''),
    coalesce(condition_ref, ''),
    coalesce(diet_ref, '')
  )
  where status = 'active';

-- ===========================================================================
-- LA PREUVE — les deux sens, dans la transaction
-- ===========================================================================

do $$
declare
  probe uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  -- Le cas nominal: un végan, en `strict`.
  insert into public.student_safety_constraints
    (user_id, kind, diet_ref, severity, declared_by, content_locale)
  values (probe, 'diet', 'vegan', 'strict', 'student', 'fr-FR');

  -- Un régime hors vocabulaire est refusé: il serait inerte au générateur.
  begin
    insert into public.student_safety_constraints
      (user_id, kind, diet_ref, severity, declared_by, content_locale)
    values (probe, 'diet', 'fruitarian', 'strict', 'student', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: un régime inconnu a été accepté';
  exception when check_violation then null;
  end;

  -- Un régime en `preference` est refusé: ce serait le produit d'avant.
  begin
    insert into public.student_safety_constraints
      (user_id, kind, diet_ref, severity, declared_by, content_locale)
    values (probe, 'diet', 'vegetarian', 'preference', 'student', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: un régime est passé en preference';
  exception when check_violation then null;
  end;

  -- Une ligne de régime SANS jeton est refusée par le check d'identifiant.
  begin
    insert into public.student_safety_constraints
      (user_id, kind, severity, declared_by, content_locale)
    values (probe, 'diet', 'strict', 'student', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: un régime sans jeton a été accepté';
  exception when check_violation then null;
  end;

  -- DÉSARMEMENT: les cinq catégories d'avant passent toujours, inchangées.
  insert into public.student_safety_constraints
    (user_id, kind, allergen_ref, severity, declared_by, content_locale)
  values (probe, 'allergy', 'peanut', 'medical', 'student', 'fr-FR');
  if not exists (
    select 1 from public.student_safety_constraints
    where user_id = probe and kind = 'allergy' and allergen_ref = 'peanut'
  ) then
    raise exception 'une allergie ordinaire ne passe plus — régression';
  end if;

  delete from auth.users where id = probe;
end;
$$;

commit;
