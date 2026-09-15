# QA Run Report — Execution Breakdown Real R1

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `qa-execution-breakdown-20260602-r1`
- Persona: user QA temporaire local `qa-qa-skill-all-skills-execution-breakdown-20260602-r1@example.com`, Auth verifie `200`, user id `bb8acb9c-9486-4432-b4fe-716b0f3ab567`.
- Objectif: tester `execution_breakdown` en run IA reel, sur une action trop grosse a rendre executable maintenant.
- Trajectoire: clarification initiale, choix explicite du decoupage, demande de micro-etape, puis continuation apres un "oui".
- Surfaces visees: dispatcher, `orientation_clarification`, `execution_breakdown`, active flow state, EffectLedger/final response guard, memory plan, effets durables.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Les 4 tours sont HTTP 200 avec trace courte et snapshots DB. Artefacts: `tmp/qa-execution-breakdown-20260602-r1/`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je dois préparer mon dossier d'inscription ce soir, mais je bloque complètement parce que c'est trop gros et je ne sais pas par quoi commencer.

**Sophia**
> Est-ce que tu veux que je t'aide à découper ce dossier en petites étapes ou est-ce que tu veux modifier ton planning ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: targeted action, key `preparer dossier inscription`
- executed_tools: `[]`
- durable_effect: aucun
- clarification candidates: `execution_breakdown`, `adjust_plan_item`
- effect_ledger: `asked=1`, no chat mutation

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — Mauvais owner selectionne.

**User**
> Je veux le découper, pas changer mon planning. Le dossier me paraît juste trop flou et trop grand.

**Sophia**
> Je comprends, l'effet montagne c'est le meilleur moyen de rester figé. On va rendre ça concret tout de suite.
>
> Pour y voir clair, c'est quoi les trois premières pièces ou infos que tu dois réunir pour ce dossier ? 📄

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `orientation_clarification_resolved`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: targeted action, key `dossier_inscription`
- executed_tools: `[]`
- durable_effect: aucun
- skill_signals: empty
- agenda owner: `normal_reply`

**Analyse si yellow/red**
- Symptome: la reponse est utile, mais la resolution de clarification ne transfere pas vers `execution_breakdown`.
- Source amont probable: route policy / active flow handoff apres `orientation_clarification`.
- Owner runtime: dispatcher / router active flow / conversation skill runtime.
- Meilleure correction selon les guidelines: quand le user selectionne explicitement le candidat `execution_breakdown`, creer ou reprendre l'etat actif du skill au lieu de tomber en `normal_reply`.
- Pourquoi ce n'est pas un patch local: le probleme est dans le contrat de handoff owner apres clarification, pas dans une phrase de reponse.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — Mauvais owner selectionne.

**User**
> Il me faut ma pièce d'identité, le justificatif de domicile et le formulaire en ligne. Je veux juste une première micro-étape faisable maintenant.

**Sophia**
> Ok, micro-étape maintenant (2-5 minutes) 📄: ouvre le formulaire en ligne et mets-toi sur la page “dossier / documents”. Ensuite, note juste la liste exacte des champs/titres des documents demandés (sans chercher à tout remplir).
>
> Tu fais ça là, maintenant ? A) oui B) non 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `orientation_clarification_resolved`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: targeted action, key `dossier_inscription`
- executed_tools: `[]`
- durable_effect: aucun, `scheduled_checkins=[]`
- agenda owner: `normal_reply`

**Analyse si yellow/red**
- Symptome: Sophia donne une bonne micro-etape, mais sans owner `execution_breakdown` ni etat actif. Elle pose une question de confirmation visible sans pending systeme.
- Source amont probable: resolution de clarification et active flow state non materialises.
- Owner runtime: dispatcher / router active flow / `execution_breakdown`.
- Meilleure correction selon les guidelines: representer la suite comme etat conversationnel `execution_breakdown`, avec continuation attendue, ou eviter une pseudo-confirmation A/B si aucun pending n'existe.
- Pourquoi ce n'est pas un patch local: le tour suivant depend du state runtime, pas du wording de la question.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-LEDGER-01` — Claim sans commit.

**User**
> Oui, je peux ouvrir la page maintenant, mais après je risque de repartir dans tous les sens.

**Sophia**
> Je ne l'ai pas noté. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `orientation_clarification_resolved`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: targeted action, key `dossier_inscription`
- skill_signals.lifecycle.execution_breakdown: `detected=true`, `confidence_band=high`
- effect_ledger: `blocked=1`, reason `uncommitted_progress_track_claim`
- durable_effect: aucun, `scheduled_checkins=[]`
- DB state: `__clarification_state_v1.owner=dispatcher`, `current_mode=companion`, no active `execution_breakdown` state observed

**Analyse si yellow/red**
- Symptome: le "oui" a ete traite comme une promesse de notation/progression inexistante, puis la reponse visible se reduit a "Je ne l'ai pas noté." Elle ne poursuit pas le decoupage.
- Source amont probable: final response guard / EffectLedger apres un pseudo-pending non represente, aggrave par l'absence d'active flow `execution_breakdown`.
- Owner runtime: EffectLedger / final response pipeline / active flow state.
- Meilleure correction selon les guidelines: ne pas generer de claim de notation quand aucun commit n'existe; router la continuation vers `execution_breakdown` et produire la prochaine micro-consigne sans effet durable.
- Pourquoi ce n'est pas un patch local: la garde systeme bloque un claim et modifie la reponse finale; corriger seulement la phrase ne reparerait pas le state ni le ledger.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- T1 clarifie proprement une ambiguite plausible entre decouper l'action et modifier le planning.
- T2 et T3 donnent des reponses humainement utiles pour rendre l'action plus petite.

**Problemes**
- Tour 2: le flow devient invisible systemiquement; la conversation semble correcte mais n'est pas tenue par `execution_breakdown`. Famille: `BF-ROUTE-01`. Impact: la suite n'a pas de memoire de mode fiable. Severite: yellow.
- Tour 3: Sophia pose "A) oui B) non" sans pending systeme; cela invite une confirmation que le runtime ne sait pas traiter. Famille: `BF-ROUTE-01`. Impact: continuation fragile. Severite: yellow.
- Tour 4: reponse incoherente et frustrante, "Je ne l'ai pas noté.", alors que le user confirme et ajoute un risque de dispersion. Famille: `BF-LEDGER-01`. Impact: rupture conversationnelle. Severite: red.

**Fix propose**
- Source amont: handoff post-clarification vers conversation skill + final response guard.
- Correction recommandee: la resolution du candidat `execution_breakdown` doit installer/reprendre l'owner actif; une question de continuation doit etre representee comme state conversationnel ou rendue sans pseudo-confirmation.
- Tests d'invariant attendus: clarification `execution_breakdown` vs `adjust_plan_item` -> selection decoupage -> owner `execution_breakdown`; "oui" apres micro-etape poursuit le decoupage; aucun claim "noté" sans commit; aucun executor ni side effect durable.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 route correctement vers `orientation_clarification`.
- T2/T3 restent en `normal_reply` avec `reason_code=orientation_clarification_resolved` au lieu de transferer vers `execution_breakdown`.
- T4 detecte `skill_signals.lifecycle.execution_breakdown` en high confidence, mais le `response_owner` reste `normal_reply`.

**Skills / Operations / Tools**
- `executed_tools=[]` sur les 4 tours.
- `tool_execution=none` sur les 4 tours.
- Aucun executor direct appele.
- Aucun pending confirmation systeme n'est cree alors qu'une question "A) oui B) non" est posee au T3.

**Memory / Effets durables**
- Pas de `scheduled_checkins`.
- `chat_messages` contient les 8 messages du run avant cleanup.
- `user_chat_states.temp_memory.__clarification_state_v1` reste `owner=dispatcher`, `skill_id=orientation_clarification`, `candidates=[execution_breakdown, adjust_plan_item]`.
- `__momentum_state_v2` capte un consent event au T4, mais ce n'est pas un state `execution_breakdown`.

**Problemes**
- Tours 2-3: mauvais owner apres clarification resolue. Famille: `BF-ROUTE-01`. Impact systeme: le skill cible n'est pas proprietaire de la suite. Severite: yellow.
- Tour 4: guard `uncommitted_progress_track_claim` bloque un claim et produit une reponse finale incoherente. Famille: `BF-LEDGER-01`. Impact systeme: la garde ledger evite un faux commit mais degrade la reponse au lieu de poursuivre sans claim. Severite: red.

**Fix propose**
- Source amont: route policy post-clarification, active flow state, final response guard.
- Correction recommandee: transformer `orientation_clarification_resolved` en route vers le candidat choisi quand c'est un conversation skill; quand le ledger bloque un claim, regénérer une reponse sans claim durable, pas une phrase de statut hors contexte.
- Tests d'invariant attendus: integration locale `/test-send-message force_full_ai=true` sur 4 tours; test contractuel du bridge clarification -> `execution_breakdown`; test final response guard "oui" sans commit ne dit pas "noté".

## Verdict Global

- Verdict: red
- Raison principale: `execution_breakdown` est detecte mais ne devient pas owner apres clarification; la continuation "oui" finit en reponse incoherente par garde ledger.
- Follow-up prioritaire: corriger le handoff post-clarification vers conversation skills, puis revalider le tour "oui" sans side effect.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-02-execution-breakdown-real-r1-bugs.md`
