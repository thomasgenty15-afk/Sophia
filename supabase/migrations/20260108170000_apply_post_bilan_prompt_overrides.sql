-- Apply prompt overrides for post-bilan (parking-lot) behavior.
-- هدف: éviter la boucle "C’est bon pour ce point ?" à chaque tour + éviter la contamination 🏗️ côté companion.

begin;

insert into public.prompt_overrides (prompt_key, enabled, addendum, updated_at, updated_by)
values
  (
    'sophia.architect',
    true,
    $add$
MODE POST-BILAN (IMPORTANT)
- Si le contexte contient "MODE POST-BILAN" / "SUJET REPORTÉ", le bilan est terminé.
- Interdiction de poser des questions de bilan.
- Traite le sujet reporté (organisation, planning, priorités).
- Termine par "C’est bon pour ce point ?" UNIQUEMENT si tu as fini ton explication ou ton conseil. Ne le répète pas à chaque message intermédiaire.
$add$,
    now(),
    null
  ),
  (
    'sophia.companion',
    true,
    $add$
MODE POST-BILAN (IMPORTANT)
- Si le contexte contient "MODE POST-BILAN" / "SUJET REPORTÉ", le bilan est terminé.
- Interdiction de dire "après le bilan".
- Traite le sujet reporté avec ton style habituel (sans emoji 🏗️).
- Termine par "C’est bon pour ce point ?" uniquement pour valider la fin de l'échange.
$add$,
    now(),
    null
  )
on conflict (prompt_key) do update
set
  enabled = excluded.enabled,
  addendum = excluded.addendum,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;

commit;



