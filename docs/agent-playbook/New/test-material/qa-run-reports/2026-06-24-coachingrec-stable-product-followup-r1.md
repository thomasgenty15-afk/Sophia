# QA Run Report - Coaching Recommendation Stable Product Follow-up R1

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `coachingrec-stable-product-followup-20260624-r1`
- Persona: persona locale dediee `qa-normal-coachingrec-stable-product-followup-20260624-r1-1782329970067@example.com`
- Objectif: verifier apres correction prompt que `coaching_recommendation` conserve la recommandation stable quand le user demande ou/comment preparer une feature deja recommandee.
- Trajectoire: action hors plan -> explication novice -> guidance produit hors plan -> switch vers action du Plan -> switch attaque vers defense -> question "ou exactement" sur carte de defense du Plan -> correction explicite du user.
- Surfaces visees: global dispatcher, active flow ownership, dispatcher local `coaching_recommendation`, visible agents `no_plan_coaching` et `action_plan_coaching`, state locale, absence d'outil/side effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide pour le runtime local observe. Aucun reboot Supabase n'a ete fait, conformement aux guidelines.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai un dossier mutuelle à ouvrir, mais dès que je vois la page je me tends et je referme. Dans Sophia, tu me conseillerais quoi pour réussir à commencer ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique texte magique : une phrase courte pour couper le réflexe de fermeture quand la page te tend, par exemple « juste 2 minutes, pas tout le dossier ».

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: minimal/tiny via turn frame
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Je débute, donc carte d'attaque libre et texte magique, ça veut dire quoi exactement ?

**Sophia**
> Oui. Simplement :
> - **Carte d’attaque libre** = une aide que tu prépares pour **démarrer plus facilement** une action hors plan, ici dans **Ressources**.
> - **Texte magique** = une **phrase courte** qui te recadre quand tu bloques, par exemple pour arrêter la tension ou l’excuse mentale.
>
> Dans ton cas, ça colle bien parce que tu bloques surtout au moment d’ouvrir le dossier, pas sur le fond de la demande.
>
> Exemple de texte magique : « J’ouvre juste la page, pas tout le dossier. »

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: minimal/tiny via turn frame
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Ok, si je veux la préparer moi-même sans que tu crées rien, je vais où ?

**Sophia**
> Va dans Dashboard > Ressources, puis choisis ou crée une carte d’attaque libre. Pour ton dossier mutuelle, je partirais sur un texte magique : une phrase courte qui te recadre au moment d’ouvrir la page, pour couper la tension et lancer le premier geste.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: minimal/tiny via turn frame
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> En fait ce dossier mutuelle est déjà dans mon Plan. Du coup pour cette même carte, ça se prépare toujours dans Ressources ?

**Sophia**
> Oui : pour ce dossier mutuelle, tu prépares la carte depuis **Dashboard > Plan**, en ouvrant l’action **« préparer le dossier mutuelle »**. Ensuite, **Ressources** sert surtout à la retrouver plus tard.
>
> Je partirais sur une **carte d’attaque, technique texte magique** : comme ton blocage vient surtout de la tension à l’ouverture de la page, une phrase courte peut recadrer le premier geste et casser l’évitement.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: plan_action, active skill `coaching_recommendation`
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia donne la bonne destination (`Dashboard > Plan`) mais commence par "Oui" a une question "toujours dans Ressources ?", ce qui rend la correction semantiquement confuse.
- Source amont probable: visible agent ne traite pas assez strictement la polarite de la question produit.
- Owner runtime: `action_plan_coaching` visible agent.
- Meilleure correction selon les guidelines: renforcer la consigne visible pour repondre explicitement "Non, si c'est dans le Plan..." quand le user oppose Plan/Ressources.
- Pourquoi ce n'est pas un patch local: le fix porte sur la comprehension de contrainte/polarite produit dans le visible agent, pas sur une phrase exacte.

### Tour 5

**Verdict du tour:** green

**User**
> Et si le souci c'est plutôt qu'après avoir ouvert l'action je pars sur YouTube au bout de deux minutes, là c'est encore la carte d'attaque ?

**Sophia**
> Non, là on passe plutôt sur une carte de défense. La carte d’attaque sert à te faire entrer dans l’action; si tu ouvres le dossier puis tu pars sur YouTube au bout de deux minutes, le problème c’est le moment de dérapage pendant l’action.
>
> Donc ici : carte de défense, pour bloquer le piège YouTube au moment critique et prévoir un geste très simple de retour.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: plan_action, active skill `coaching_recommendation`
- executed_tools: []
- durable_effect: none

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, et cette carte de défense liée au dossier mutuelle dans le Plan, je la prépare où exactement ?

**Sophia**
> Oui, c’est bien depuis l’action du Plan. Tu veux te débloquer sur quoi exactement : le démarrage, le moment où tu décroches, ou le piège précis ?

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: plan_action, active skill `coaching_recommendation`
- executed_tools: []
- durable_effect: none
- diagnostic utile: apres T6, `last_visible_task_kind=change_confirm_coaching_type`, `current_recommendation=null`, `pending_type_change.candidate_coaching_type=unclear`, alors que `recommendation_decision.primary_feature=defense_card` et `platform_destination.surface_hint=Dashboard > Plan`

**Analyse si yellow/red**
- Symptome: le user demande une destination produit precise, mais Sophia redemande le besoin coaching.
- Source amont probable: le dispatcher local ne respecte pas l'invariant stable recommendation product follow-up en conditions reelles.
- Owner runtime: dispatcher local/reducer `coaching_recommendation`.
- Meilleure correction selon les guidelines: passer d'une simple consigne prompt a une contrainte structurelle/reducer-level: lorsqu'une `recommendation_decision.primary_feature` existe et que le local dispatcher sort `change_confirm_coaching_type` sans vrai changement de cible, préserver la recommandation et rerouter vers l'agent specialise du `coaching_type` courant.
- Pourquoi ce n'est pas un patch local: la correction doit proteger la transition d'etat et la famille de follow-ups produit, pas seulement le wording "où exactement".

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Je ne te demande pas de clarifier le piège, juste où cliquer pour préparer cette carte de défense dans Sophia.

**Sophia**
> Oui, on est bien sur ton action du Plan. Tu veux te débloquer par rapport à quoi exactement : l’ouverture du dossier, le démarrage, ou le moment où tu décroches ?

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: plan_action, active skill `coaching_recommendation`
- executed_tools: []
- durable_effect: none
- diagnostic utile: l'etat reste `last_visible_task_kind=change_confirm_coaching_type`, `current_recommendation=null`, `pending_type_change.candidate_coaching_type=unclear`

**Analyse si yellow/red**
- Symptome: meme apres correction explicite du user, Sophia ignore la contrainte "je ne te demande pas de clarifier" et repose une question de clarification.
- Source amont probable: l'etat local erroné installe une boucle `change_confirm_coaching_type`; le visible agent reçoit le mauvais step context et ne peut pas repondre a la guidance produit attendue.
- Owner runtime: dispatcher local/reducer `coaching_recommendation`.
- Meilleure correction selon les guidelines: ajouter un garde structurel non semantique sur la coherence de sortie du dispatcher local: `change_confirm_coaching_type` est invalide si une recommandation stable existe, que le `coaching_type` courant est clair, et que la sortie conserve une `recommendation_decision.primary_feature`.
- Pourquoi ce n'est pas un patch local: le fix cible l'incoherence de JSON local (`change_confirm` + recommandation stable) et empeche toute boucle de clarification produit dans ce flow.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- T1-T3 valident le chemin hors plan: carte d'attaque libre, technique nommee, explication novice, guidance Ressources.
- T4 bascule bien vers une action du Plan et donne globalement la bonne destination.
- T5 choisit correctement la carte de defense pour un decrochage pendant l'action.

**Problemes**
- Tour 4: reponse commence par "Oui" alors que la bonne reponse a "toujours dans Ressources ?" est "Non, si c'est dans le Plan...". Famille: BF-INTAKE-03. Impact: confusion faible mais visible. Severite: yellow.
- Tour 6: la question de destination produit n'est pas satisfaite; Sophia relance le coaching. Famille: BF-STATE-01. Impact: le user n'obtient pas l'information demandee. Severite: red.
- Tour 7: Sophia ignore une correction explicite et boucle sur la clarification. Familles: BF-STATE-01, BF-INTAKE-03. Impact: experience frustrante et perte de confiance. Severite: red.

**Fix propose**
- Source amont: dispatcher local/reducer `coaching_recommendation`, coherence de `visible_task` et preservation de recommandation stable.
- Correction recommandee: remplacer ou completer la consigne prompt par une validation structurelle du dispatcher output: si `previous_state.recommendation_decision.primary_feature` existe et que le dispatcher produit `change_confirm_coaching_type` tout en conservant une recommandation stable, normaliser vers l'agent specialise courant avec `answer_followup`, ou retry le dispatcher avec une erreur de contrat.
- Tests d'invariant attendus: defense_card Plan + "où exactement"; correction explicite "je ne demande pas de clarifier"; attack_card Plan + "où cliquer"; free_attack_card hors plan + "où"; anti-faux-positif "en fait ce n'est pas dans mon Plan" doit rester un target switch.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le global routing est bon: `response_owner=coaching_recommendation` sur tous les tours.
- L'active flow ownership est conserve: pas de saut vers `product_help`, `safety` ou normal reply.

**Skills / Operations / Tools**
- `selected_skill_id=coaching_recommendation` sur tous les tours.
- Aucun tool ou direct effect execute.
- Le choix de feature est correct jusqu'a T5: `attack_card` hors plan, puis `attack_card` du Plan, puis `defense_card` du Plan.
- La transition locale est incorrecte a T6/T7: `last_visible_task_kind=change_confirm_coaching_type` alors que `coaching_type=plan_action` et `recommendation_decision.primary_feature=defense_card`.

**Memory / Effets durables**
- Aucun scheduled checkin cree.
- Aucun effet durable observe.
- Cleanup run-scoped a faire apres rapport.

**Problemes**
- Tour 6: invariant stable recommendation product follow-up non respecte en runtime. Famille: BF-STATE-01. Impact systeme: `current_recommendation` est effacee et `pending_type_change` est creee alors que la destination produit stable existe.
- Tour 7: la boucle de clarification persiste malgre correction user. Familles: BF-STATE-01 et BF-INTAKE-03. Impact systeme: le mauvais step context continue d'alimenter le visible agent.

**Fix propose**
- Source amont: normalisation/validation de la sortie du dispatcher local, pas visible agent seul.
- Correction recommandee: contrat structurel "stable recommendation product follow-up" applique apres normalisation du JSON local: interdire `change_confirm_coaching_type` quand il y a `previous_state.recommendation_decision.primary_feature`, `coaching_type` clair, et pas de target switch explicite. En cas de violation: retry dispatcher avec message de contrat ou transformer vers `answer_followup` + agent specialise courant depuis les donnees structurees existantes.
- Tests d'invariant attendus: test reducer sur sortie contradictoire `change_confirm_coaching_type` + recommendation stable; run reel T6/T7; anti-faux-positif sur vrai changement de scope.

## Verdict Global

- Verdict: red
- Raison principale: la correction prompt ne suffit pas; le runtime continue a transformer une question de destination produit in-scope en clarification de coaching type.
- Follow-up prioritaire: ajouter une validation structurelle/reducer-level de l'invariant stable recommendation product follow-up dans `coaching_recommendation`.
