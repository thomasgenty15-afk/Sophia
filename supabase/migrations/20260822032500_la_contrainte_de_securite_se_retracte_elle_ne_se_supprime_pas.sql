-- S6 — LES GRANTS PAR DÉFAUT · 6/8 · `student_safety_constraints`
--
-- ⛔ CETTE TABLE EST LA SEULE DES HUIT OÙ LE DÉFAUT N'EST PAS `anon`. Mesuré
--    le 2026-08-22 à 03:14:43 : `anon` n'a AUCUN droit ici — quelqu'un a fait
--    le geste, une fois. Le résidu est ailleurs :
--
--        authenticated | s | i | u | D | TRUNCATE | REFERENCES | TRIGGER
--                        t   t   t   t      t           t          t
--
--    …alors que les policies de la table sont, et seulement :
--        `student_safety_constraints_owner_read`    SELECT
--        `student_safety_constraints_select_coach`  SELECT
--        `student_safety_constraints_owner_insert`  INSERT
--        `student_safety_constraints_owner_retract` UPDATE
--
--    Il n'y a AUCUNE policy `DELETE`. Le `DELETE` accordé est un résidu du
--    `alter default privileges`, et il contredit le modèle de la table.
--
-- LE MODÈLE, ET IL EST ÉCRIT DANS LA BASE ELLE-MÊME. Le trigger
-- `student_safety_constraints_retraction_only` refuse toute réécriture d'une
-- déclaration : *« a declaration is superseded, never rewritten »*. `S1b` l'a
-- mesuré le 2026-08-22 en essayant de migrer une ligne `fruits_de_mer` — LA
-- BASE A REFUSÉ LA MIGRATION. Le seul chemin est `insert` + `retract`.
--
-- ⛔ ET LE `DELETE` EST EXACTEMENT L'ÉCHAPPATOIRE QUE CE TRIGGER FERME. Une
--    allergie qu'on supprime au lieu de la superséder ne laisse aucune trace,
--    et une allergie sans trace est une allergie qu'on ne peut pas prouver
--    avoir connue. Le trigger tient l'`update` ; le `grant` laissait la porte
--    du `delete` ouverte à côté. Aujourd'hui la RLS la referme en silence
--    (0 ligne, aucune erreur) — le jour où une policy `DELETE` apparaît pour
--    une raison légitime, le droit sera déjà là et personne ne le reverra.
--
-- ⚠️ `TRUNCATE` EST PIRE ENCORE, ET IL ÉCHAPPE À LA RLS : `authenticated`
--    pouvait vider la table entière des 68 contraintes de sécurité de tous les
--    élèves. Aucune policy ne peut l'en empêcher — seul le privilège le peut.
--
-- CE QUI RESTE : `select`, `insert`, `update`. Mot pour mot ce dont les quatre
-- policies se servent.

revoke all privileges on table public.student_safety_constraints from anon, authenticated;

grant select, insert, update on table public.student_safety_constraints to authenticated;

do $verif$
begin
  -- `anon` : rien, et on le VÉRIFIE au lieu de le supposer.
  if has_table_privilege('anon', 'public.student_safety_constraints', 'SELECT')
     or has_table_privilege('anon', 'public.student_safety_constraints', 'INSERT')
     or has_table_privilege('anon', 'public.student_safety_constraints', 'UPDATE')
     or has_table_privilege('anon', 'public.student_safety_constraints', 'DELETE')
     or has_table_privilege('anon', 'public.student_safety_constraints', 'TRUNCATE')
  then
    raise exception 'S6/student_safety_constraints : anon a repris un droit';
  end if;

  -- La rétraction est le modèle : plus de `delete`, plus de `truncate`.
  if has_table_privilege('authenticated', 'public.student_safety_constraints', 'DELETE')
     or has_table_privilege('authenticated', 'public.student_safety_constraints', 'TRUNCATE')
  then
    raise exception 'S6/student_safety_constraints : la suppression est encore accordée';
  end if;

  -- ⛔ ET LA MOITIÉ QU'ON OUBLIE : une garde a besoin d'un cas qui PASSE.
  -- `declare_safety_constraint` insère, et la rétraction met à jour. Les
  -- emporter transformerait ce lot en panne de déclaration d'allergie.
  if not (has_table_privilege('authenticated', 'public.student_safety_constraints', 'SELECT')
          and has_table_privilege('authenticated', 'public.student_safety_constraints', 'INSERT')
          and has_table_privilege('authenticated', 'public.student_safety_constraints', 'UPDATE'))
  then
    raise exception 'S6/student_safety_constraints : la déclaration ou la rétraction a été emportée';
  end if;
end
$verif$;
