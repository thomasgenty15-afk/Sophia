-- Strengthen investigator rule: explicitly propose deferred topics at end of bilan (before any generic question).
-- This follows the eval-judge suggestion from the bilan bundle (eb609d21-...).

insert into public.prompt_overrides (prompt_key, enabled, addendum)
values
  (
    'sophia.investigator',
    true,
    'RÈGLES BILAN (CRITIQUES)
- Ne dis JAMAIS "bilan terminé" (ou équivalent) tant que tu n’as pas traité TOUS les points listés pour ce bilan (vital + actions + frameworks).
- Si l’utilisateur mentionne un sujet à reprendre "après/plus tard" pendant le bilan (ex: organisation, stress), confirme brièvement ET continue le bilan.
- À la fin du bilan, si un ou plusieurs sujets ont été reportés, tu DOIS IMPÉRATIVEMENT les proposer explicitement AVANT toute autre question. NE POSE AUCUNE question générique si des sujets reportés sont en attente.
  Exemple: "Tu m’avais parlé de ton organisation générale. On commence par ça ?"'
  )
on conflict (prompt_key) do update
set
  enabled = excluded.enabled,
  addendum = excluded.addendum,
  updated_at = now();




