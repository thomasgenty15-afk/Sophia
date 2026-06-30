# QA Run Report - Coaching Recommendation Attack Contract R1

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `coachingrec-attack-contract-20260624-r1`
- Persona: persona locale dediee `qa-normal-coachingrec-attack-contract-20260624-r1-1782321404129@example.com`
- Objectif: verifier que `coaching_recommendation` recommande une carte d'attaque avec une technique nommee par le visible agent, sans renderer deterministe aval.
- Trajectoire: action hors plan -> explication novice -> guidance produit hors plan -> switch action du Plan -> comparaison attaque/defense -> guidance carte de defense du Plan.
- Surfaces visees: global dispatcher, active flow ownership, skill `coaching_recommendation`, visible agents `no_plan_coaching` et `action_plan_coaching`, state locale, absence d'outil/side effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Les messages ont ete choisis tour par tour apres lecture de Sophia et des traces courtes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je bloque sur mon dossier mutuelle : dès que j'ouvre la page, je panique un peu et je referme. Dans Sophia, tu me conseillerais plutôt quoi pour réussir à démarrer ?

**Sophia**
> Je partirais sur une carte d'attaque libre, technique texte magique : une phrase très courte pour recadrer le moment où tu ouvres la page, afin de couper la panique et de lancer le premier geste. Si tu veux, je peux t'aider à formuler cette phrase.

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
> Attends, je connais pas ces mots. Une carte d'attaque libre et texte magique, ça veut dire quoi concrètement ?

**Sophia**
> Concrètement :
> - une carte d’attaque libre, c’est une petite aide que tu prépares pour te lancer plus facilement dans une action hors plan ;
> - texte magique, c’est une phrase courte qui te recadre quand ta tête te dit “je referme”.
>
> Ici, je partirais sur une carte d’attaque libre, technique texte magique : comme ton blocage est surtout dans le moment où tu ouvres la page et où la panique te fait fermer, une phrase simple peut te remettre dans le geste.

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
> Ok, si je veux la préparer moi-même sans que tu crées rien depuis le chat, je vais où dans Sophia ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique texte magique : vu que le blocage arrive dès l’ouverture de la page, une phrase courte de recadrage peut t’aider à passer le premier geste. Pour la préparer toi-même, va dans Dashboard > Ressources, puis ouvre ou crée une carte d’attaque libre.

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

**Verdict du tour:** green

**User**
> En fait je viens de vérifier : le dossier mutuelle est déjà dans mon Plan. Dans ce cas ça change quoi pour la carte d'attaque ?

**Sophia**
> Ça ne change pas le fond : pour démarrer un dossier qui te panique un peu, une carte d’attaque reste le bon levier. La différence, c’est qu’ici tu la prépares depuis l’action du Plan, pas depuis Ressources. Je partirais sur une carte d’attaque, technique texte magique : une phrase courte pour recadrer la page mutuelle et couper le scénario de panique au moment d’ouvrir.

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

### Tour 5

**Verdict du tour:** green

**User**
> Mais si le vrai problème c'est qu'après avoir ouvert la page je pars sur YouTube au bout de deux minutes, c'est encore une carte d'attaque ou plutôt autre chose ?

**Sophia**
> Entre les deux, la différence est simple :
> - carte d’attaque = t’aider à démarrer quand tu bloques avant le premier geste ;
> - carte de défense = te protéger quand tu pars en distraction ou que tu risques de décrocher pendant l’action.
>
> Ici, comme tu ouvres bien la page puis tu bascules sur YouTube au bout de deux minutes, je partirais sur une carte de défense, parce que le piège arrive au moment critique et il faut un plan très court pour tenir le cap.

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

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, et cette carte de défense liée au dossier mutuelle dans le Plan, je la prépare où exactement ?

**Sophia**
> Plutôt une carte de défense, depuis l’action du dossier mutuelle dans ton Plan. C’est quoi le moment précis où tu décroches ?

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

**Analyse si yellow/red**
- Symptome: la reponse reste dans le bon owner mais ne repond pas assez exactement a "où exactement"; elle relance une clarification alors que la destination produit existait dans `recommendation_decision.platform_destination`.
- Source amont probable: reducer/local dispatcher `coaching_recommendation` a produit `last_visible_task_kind=change_confirm_coaching_type`, `current_recommendation=null` et `pending_type_change.candidate_coaching_type=unclear` sur une question de destination produit dans le scope actif.
- Owner runtime: local dispatcher/reducer `coaching_recommendation`.
- Meilleure correction selon les guidelines: ajouter un invariant de continuation produit dans le dispatcher local: si le flow actif a une recommandation stable et que le dernier message demande ou/comment preparer ce meme levier, rester sur l'agent de coaching specialise du scope courant avec `recommendation_decision.platform_destination`, sans passer par `change_confirm_coaching_type`.
- Pourquoi ce n'est pas un patch local: le fix cible la transition d'etat et l'ownership local, pas une phrase ou une regex; il protege toute la famille des questions "où/comment" sur une feature deja recommandee.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- La recommandation initiale est claire, actionnable, et nomme bien la technique `texte magique`.
- Sophia explique correctement les termes a un user novice au tour 2.
- Les transitions hors plan -> action du Plan, puis attaque -> defense, sont naturelles et comprehensibles.
- Aucune creation ni promesse d'execution n'est faite alors que le user dit explicitement de ne rien creer depuis le chat.

**Problemes**
- Tour 6: Sophia donne une reponse partielle a la localisation mais ajoute une clarification inutile. Famille: BF-STATE-01. Impact: le user demande "où exactement" et reçoit surtout une relance de coaching. Severite: yellow.

**Fix propose**
- Source amont: local dispatcher/reducer `coaching_recommendation`, selection du visible task sur follow-up produit.
- Correction recommandee: conserver la recommandation stable et router les questions de destination vers l'agent specialise courant (`action_plan_coaching` ici), avec la destination canonique injectee.
- Tests d'invariant attendus: question "où préparer cette carte de defense ?" apres recommandation defense_card du Plan; paraphrase "je clique où ?"; anti-faux-positif "en fait ce n'est pas dans mon Plan" doit permettre target switch au lieu de forcer la guidance Plan.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Les 6 tours restent sur `response_owner=coaching_recommendation`.
- Le tour 1 entre via `coaching_recommendation_signal`; les tours 2-6 continuent via `active_coaching_recommendation`.
- Aucun saut vers `product_help`, `safety` ou un tool skill n'a ete observe.

**Skills / Operations / Tools**
- `selected_skill_id=coaching_recommendation` sur tous les tours.
- Aucun tool ou direct effect execute.
- Le contrat attack-card est respecte aux tours 1-4: `last_visible_decision.lever=free_attack_card|attack_card` et `variant=texte_magique`, avec technique nommee dans le message visible.
- Le switch de levier vers `defense_card` au tour 5 est coherent avec le nouveau besoin: risque de decrochage pendant l'action.

**Memory / Effets durables**
- Aucun scheduled checkin cree.
- Aucun effet durable observe.
- L'etat actif `coaching_recommendation` est conserve.

**Problemes**
- Tour 6: mauvaise transition locale vers `change_confirm_coaching_type` malgre une question produit dans le scope actif. Famille: BF-STATE-01. Impact systeme: `current_recommendation=null`, `pending_type_change=unclear`, et la destination produit stable n'est pas utilisee proprement. Severite: yellow.

**Fix propose**
- Source amont: selection du `visible_task` par le dispatcher local quand le dernier message est une question de destination sur une feature deja recommandee.
- Correction recommandee: invariant "stable recommendation product follow-up": conserver `current_recommendation` et `recommendation_decision.platform_destination`, puis appeler l'agent specialise du scope courant plutot que `change_confirm_coaching_type`.
- Tests d'invariant attendus: run local avec defense_card Plan puis question "où exactement"; variante attack_card Plan; variante free_attack_card hors plan; anti-faux-positif avec vrai changement de scope.

## Verdict Global

- Verdict: yellow
- Raison principale: le contrat visible attack-card est valide, mais une question de destination produit sur une carte de defense active degrade l'etat local en clarification de type.
- Follow-up prioritaire: corriger l'invariant de continuation produit dans `coaching_recommendation` pour les follow-ups "où/comment préparer" sur une recommandation stable.
