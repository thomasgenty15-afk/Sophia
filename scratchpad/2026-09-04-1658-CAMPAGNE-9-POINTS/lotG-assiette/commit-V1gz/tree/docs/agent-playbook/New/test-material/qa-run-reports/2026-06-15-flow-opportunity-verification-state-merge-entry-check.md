# QA Run - flow_opportunity_verification state merge entry check

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `flow-opportunity-verification-state-merge-r2-20260615`, variantes propres `r3` et `r4`
- Persona: `qa-skill`
- Connexions dediees: `flow-opportunity-verification_flow-opportunity-verification-state-merge-r2-20260615`, `r3`, `r4`
- Objectif: verifier en conditions reelles que le flow `flow_opportunity_verification` s'active puis conserve son state server-owned sur une demande ambigue, une correction et une confirmation.
- Trajectoire: opportunite candidate vers `update_coach_preferences`, puis variante vers `status_recap` si l'entree preference est capturee par un autre owner.
- Surfaces visees: global routing, opportunity arbitration, local dispatcher `flow_opportunity_verification`, active state/temp memory, handoff vers skill cible, absence d'effet durable non confirme.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe, aucun renderer direct, aucune correction de code pendant le run.
- Validite QA: valide techniquement, mais non concluant pour l'objectif cible. Les reponses observees sont defensables cote produit (`status_recap` ou `normal_reply`), mais le scenario n'a pas isole une vraie opportunite implicite; le merge server-owned de `flow_opportunity_verification` n'a donc pas pu etre observe en conditions reelles.

## 2. Tours De Conversation

### Tour 1 - r2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je remarque que je reponds mieux quand Sophia va droit au but. Je ne veux pas changer un reglage tout de suite, mais ca vaut peut-etre le coup de verifier si ce ton est bien regle.

**Sophia**
> Actuellement, mon ton est regle sur « Bienveillant ferme » et la longueur de mes messages sur « Courte ». Ce sont les parametres par defaut, ce qui semble deja correspondre a ton envie d'aller droit au but.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `status_recap_local_answer_coach_preferences_status`
- safety: none observed
- direct_effects: []
- operation: `answer_coach_preferences_status`
- pending_confirmation: none
- memory_plan: none observed
- executed_tools: []
- durable_effect: none
- flow_state_after: `flow_opportunity_state=null`, `active_skill_state=null`

**Analyse**
- Comportement produit: acceptable. Le user demande de verifier un reglage; `status_recap` lit l'etat actuel sans effet durable.
- Limite QA: ce tour ne teste pas `flow_opportunity_verification`, car il n'y a pas d'hesitation implicite a arbitrer entre deux flows.

### Tour 2 - r2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Justement, je ne veux pas un recap des reglages. Avant d'ouvrir quoi que ce soit, verifie seulement si une mise a jour vers un ton plus direct serait pertinente.

**Sophia**
> Oui-et en meme temps, je te suis : a ce stade, le plus utile n'est pas de "reconfigurer", mais de verifier si ca sert ton moment. [...]
> Qu'est-ce qui te gene le plus actuellement : le manque de concision, ou le fait que tu as parfois besoin qu'on aille plus vite vers une piste concrete ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- blocked_paths: `flow_opportunity.update_coach_preferences` blocked twice by `normal_reply_fit_dominates` (`raw_score=0.65`, `normal_reply_fit_score=0.85`)
- local_flow_exit_handoff: `status_recap` -> global, `handoff_reason=topic_change`, note_information present
- direct_effects: []
- executed_tools: []
- durable_effect: none
- flow_state_after: `flow_opportunity_state=null`, `active_skill_state=null`

**Analyse**
- Comportement produit: acceptable. Le user demande une evaluation de pertinence avant d'ouvrir quoi que ce soit; `normal_reply` peut legitimement conseiller sans creer de flow.
- Limite QA: meme si `flow_opportunity.update_coach_preferences` apparait dans `blocked_paths`, ce n'est pas une preuve de mauvais routing; c'est surtout une preuve que le scenario n'a pas force une opportunite implicite suffisamment distincte d'un conseil normal.

### Tour 3 - r2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je me rends compte que je travaille mieux quand Sophia est tres directe. Je ne demande aucun changement maintenant, mais ca merite peut-etre de verifier ce reglage avant de decider.

**Sophia**
> Oui, c'est pertinent de verifier. [...]
> Je peux te proposer un mini-etalon (sans rien ouvrir ni reconfigurer tout de suite) : quand je te reponds, est-ce que tu te sens plutot "aide tout de suite" (bonne clarte) ou "fais ralentir" (trop de contexte avant le point) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- blocked_paths: []
- direct_effects: []
- executed_tools: []
- durable_effect: none
- flow_state_after: `flow_opportunity_state=null`, `active_skill_state=null`

**Analyse**
- Comportement produit: acceptable. Sophia propose une mini-clarification utile, sans effet durable.
- Limite QA: le tour reste hors scope du flow cible.

### Tour 1 - r3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> J'accroche davantage quand Sophia est vraiment directe. Je ne veux pas modifier mes preferences maintenant, mais ca vaut peut-etre le coup de verifier ce reglage avant de decider.

**Sophia**
> Je vois que pour l'instant, tu utilises les reglages par defaut. Mon ton est configure sur 'Bienveillant ferme' et mon focus est mis sur 'Discipline / action', avec des messages courts.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `status_recap_local_answer_coach_preferences_status`
- direct_effects: []
- executed_tools: []
- durable_effect: none
- flow_state_after: `flow_opportunity_state=null`, `active_skill_state=null`

**Analyse**
- Comportement produit: acceptable. `status_recap` donne l'etat courant des preferences sans mutation.
- Limite QA: le message reste interpretable comme demande de verification factuelle d'un reglage.

### Tour 1 - r4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je suis un peu perdu : j'ai l'impression qu'il y avait deja quelque chose de prevu pour m'aider a reprendre mon dossier ce soir, mais je ne sais plus ce que Sophia avait repere.

**Sophia**
> Je viens de regarder dans ton espace et, pour le moment, je n'ai aucune trace d'un rappel, d'une action de plan ou d'une carte d'attaque concernant ton dossier pour ce soir. Rien n'est programme de mon cote.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- selected_action: `answer_status`
- route_reason: `status_recap_local_answer_status`
- direct_effects: []
- executed_tools: []
- durable_effect: none
- flow_state_after: `flow_opportunity_state=null`, `active_skill_state=null`

**Analyse**
- Comportement produit: acceptable. Le user veut savoir ce qui existe deja; `status_recap` est le bon owner.
- Limite QA: cette variante confirme que le scenario teste plutot `status_recap` que `flow_opportunity_verification`.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Les reponses visibles restent comprehensibles et non dangereuses.
- Aucun effet durable n'est promis ou applique.
- Sophia respecte globalement la contrainte "ne pas changer maintenant".

**Problemes**
- Aucun probleme UX majeur observe dans ces tours. Les reponses sont coherentes avec les demandes telles qu'elles ont ete formulees.
- Limite de test: les formulations choisies testent surtout `status_recap` ou `normal_reply`, pas une opportunite implicite devant etre verifiee.

**Fix propose**
- Source amont: design du scenario QA.
- Correction recommandee: construire un nouveau run ou l'ambiguite d'opportunite est reelle, par exemple un user mentionne un besoin qui pourrait ouvrir un flow mais sans demander explicitement un status ou un conseil.
- Tests d'invariant attendus: entree implicite candidate, pre-acceptation qui ne confirme pas, refus explicite, confirmation claire, changement de sujet.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `flow_opportunity_verification` n'a ete selectionne dans aucune des variantes reelles du run.
- Cette non-selection n'est pas suffisante pour conclure a un bug de routing: les messages etaient compatibles avec `status_recap` ou `normal_reply`.
- Le tour r2.2 montre seulement que `flow_opportunity.update_coach_preferences` a ete envisage puis bloque par `normal_reply_fit_dominates`; vu la formulation, ce blocage est defensable.

**Skills / Operations / Tools**
- Skills observes: `status_recap`, `normal_reply`.
- Skill cible du test mais non observe: `flow_opportunity_verification`.
- Aucun `state_mutation_audit` du reducer local n'a pu etre observe, car aucun state `__flow_opportunity_verification_state_v1` n'a ete cree.

**Side effects**
- Aucun tool execute.
- Aucun effet durable cree, modifie ou confirme.
- Les connexions temporaires r2/r3/r4 ont ete nettoyees par le runner QA cible.

**Memory / active state**
- `flow_opportunity_state` est reste `null` apres tous les tours.
- `active_skill_state` est reste `null`.
- Le run ne valide pas la compatibilite active users ni le merge server-owned en conditions reelles, seulement l'absence d'effet durable pendant l'echec d'entree.

**Fix propose**
- Source amont: scenario QA.
- Correction recommandee: relancer avec une situation ou le user ne demande pas explicitement de lire un reglage ni de recevoir un conseil, mais laisse entendre qu'un flow pourrait aider. Le run doit commencer par une vraie opportunite candidate avant de tester le merge server-owned.
- Tests requis: rerun reel avec activation observee du flow, puis conservation d'etat, ambiguite, refus et confirmation.

## Verdict Global

Yellow / inconclusive. Le run est techniquement valide et les reponses Sophia sont globalement correctes cote produit, mais il ne prouve pas les nouvelles protections server-owned: le flow local n'a jamais ete active. Le probleme principal du run est le scenario QA, pas un bug demontre du routing.

Commandes principales lancees:

```sh
/usr/bin/env PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources node tmp/qa_flow_opportunity_turn.mjs --run-id flow-opportunity-verification-state-merge-r2-20260615 --base-connection flow-opportunity-verification --turn 1 --message "Je remarque que je réponds mieux quand Sophia va droit au but. Je ne veux pas changer un réglage tout de suite, mais ça vaut peut-être le coup de vérifier si ce ton est bien réglé."
/usr/bin/env PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources node tmp/qa_flow_opportunity_turn.mjs --run-id flow-opportunity-verification-state-merge-r2-20260615 --base-connection flow-opportunity-verification --turn 2 --message "Justement, je ne veux pas un récap des réglages. Avant d'ouvrir quoi que ce soit, vérifie seulement si une mise à jour vers un ton plus direct serait pertinente."
/usr/bin/env PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources node tmp/qa_flow_opportunity_turn.mjs --run-id flow-opportunity-verification-state-merge-r2-20260615 --base-connection flow-opportunity-verification --turn 3 --message "Je me rends compte que je travaille mieux quand Sophia est très directe. Je ne demande aucun changement maintenant, mais ça mérite peut-être de vérifier ce réglage avant de décider."
/usr/bin/env PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources node tmp/qa_flow_opportunity_turn.mjs --run-id flow-opportunity-verification-state-merge-r3-20260615 --base-connection flow-opportunity-verification --turn 1 --message "J'accroche davantage quand Sophia est vraiment directe. Je ne veux pas modifier mes préférences maintenant, mais ça vaut peut-être le coup de vérifier ce réglage avant de décider."
/usr/bin/env PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources node tmp/qa_flow_opportunity_turn.mjs --run-id flow-opportunity-verification-state-merge-r4-20260615 --base-connection flow-opportunity-verification --turn 1 --message "Je suis un peu perdu : j'ai l'impression qu'il y avait déjà quelque chose de prévu pour m'aider à reprendre mon dossier ce soir, mais je ne sais plus ce que Sophia avait repéré."
/usr/bin/env PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources node tmp/qa_flow_opportunity_turn.mjs --cleanup-connections flow-opportunity-verification_flow-opportunity-verification-state-merge-r2-20260615,flow-opportunity-verification_flow-opportunity-verification-state-merge-r3-20260615,flow-opportunity-verification_flow-opportunity-verification-state-merge-r4-20260615
```
