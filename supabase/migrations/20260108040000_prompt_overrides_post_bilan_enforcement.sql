-- Prompt overrides: stabilize checkup routing and enforce post-bilan behavior.
-- Admin-only table: public.prompt_overrides (created in 20251216093000_conversation_eval_system.sql)

-- 1) Dispatcher: stronger checkup stability + post-bilan rules
insert into public.prompt_overrides (prompt_key, enabled, addendum, updated_at)
values (
  'sophia.dispatcher',
  true,
  $$
STABILITÉ CHECKUP (RENFORCÉE)
- Si `investigation_state` est actif (bilan en cours), tu renvoies `investigator` dans 100% des cas.
- SEULE EXCEPTION: l’utilisateur demande explicitement d’arrêter le bilan / changer de sujet (ex: "stop le bilan", "arrête le check", "on arrête", "on change de sujet").
- "plus tard", "pas maintenant", "on en reparlera" NE sont PAS des stops.

POST-BILAN (PARKING LOT)
- Si `investigation_state.status = post_checkup`, le bilan est terminé.
- Tu ne dois JAMAIS proposer de "continuer/reprendre le bilan".
- Tu dois router vers l’agent adapté au sujet reporté (companion par défaut, architect si organisation/planning/priorités, firefighter si détresse).
$$,
  now()
)
on conflict (prompt_key) do update
set enabled = excluded.enabled,
    addendum = excluded.addendum,
    updated_at = excluded.updated_at;

-- 2) Investigator: no premature "bilan terminé" + recall deferred topic explicitly
insert into public.prompt_overrides (prompt_key, enabled, addendum, updated_at)
values (
  'sophia.investigator',
  true,
  $$
RÈGLES BILAN (CRITIQUES)
- Ne dis JAMAIS "bilan terminé" (ou équivalent) tant que tu n’as pas traité TOUS les points listés pour ce bilan (vital + actions + frameworks).
- Si l’utilisateur mentionne un sujet à reprendre "après/plus tard" pendant le bilan (ex: organisation, stress), confirme brièvement ET continue le bilan.
- À la fin du bilan, propose explicitement le(s) sujet(s) reporté(s) avant toute question générique.
  Exemple: "Tu m’avais parlé de ton organisation générale. On commence par ça ?"
$$,
  now()
)
on conflict (prompt_key) do update
set enabled = excluded.enabled,
    addendum = excluded.addendum,
    updated_at = excluded.updated_at;

-- 3) Companion: post-bilan must not restart bilan
insert into public.prompt_overrides (prompt_key, enabled, addendum, updated_at)
values (
  'sophia.companion',
  true,
  $$
MODE POST-BILAN (IMPORTANT)
- Si le contexte contient "MODE POST-BILAN" / "SUJET REPORTÉ", alors le bilan est déjà terminé.
- Interdiction de dire "après le bilan" ou "on continue/reprend le bilan".
- Traite le sujet reporté uniquement, et termine par: "C’est bon pour ce point ?"
$$,
  now()
)
on conflict (prompt_key) do update
set enabled = excluded.enabled,
    addendum = excluded.addendum,
    updated_at = excluded.updated_at;

-- 4) Architect: post-bilan must not resume checkup questions
insert into public.prompt_overrides (prompt_key, enabled, addendum, updated_at)
values (
  'sophia.architect',
  true,
  $$
MODE POST-BILAN (IMPORTANT)
- Si le contexte contient "MODE POST-BILAN" / "SUJET REPORTÉ", alors le bilan est déjà terminé.
- Interdiction de poser des questions de bilan (habitudes/vitals/actions du checkup).
- Traite le sujet reporté (organisation, planning, priorités, etc.) et termine par: "C’est bon pour ce point ?"
$$,
  now()
)
on conflict (prompt_key) do update
set enabled = excluded.enabled,
    addendum = excluded.addendum,
    updated_at = excluded.updated_at;



