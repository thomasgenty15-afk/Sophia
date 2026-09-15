# QA Run Report - coachingrec-stable-product-followup-verify-20260625-r2

## 1. Contexte Du Test

- Date: 2026-06-25
- Run: `coachingrec-stable-product-followup-verify-20260625-r2`
- Persona: user QA temporaire `qa-normal-coachingrec-stable-product-followup-verify-20260625-r2-1782383263790@example.com`
- Objectif: verifier le fix stable product follow-up dans `coaching_recommendation`, notamment le cas ou le dispatcher produit un `target_switch=explicit` vers la meme action du Plan.
- Trajectoire: action du Plan `Preparer le dossier mutuelle` -> recommandation coaching -> follow-up produit "ou preparer" -> correction user vers carte de defense -> follow-up produit.
- Surfaces visees: dispatcher global, active flow ownership, dispatcher local `coaching_recommendation`, visible agent `action_plan_coaching`, absence de direct effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. 5 tours HTTP 200. Cleanup cible effectue: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`; `user_memories` 404 car table absente.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-06 - Mauvais domaine semantique

**User**
> Dans mon Plan, j’ai l’action Préparer le dossier mutuelle. À chaque fois que j’ouvre les justificatifs, je pars sur YouTube au bout de deux minutes. Je ne sais pas si je dois faire une carte d’attaque ou une carte de défense.

**Sophia**
> Je partirais sur une carte d’attaque, technique texte magique : ici, le blocage vient surtout du recadrage au moment de commencer, pour couper la bascule vers YouTube dès l’ouverture des justificatifs.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=attack_card`, `variant=texte_magique`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: Sophia choisit attaque/texte magique alors que le user decrit un decrochage vers YouTube apres le demarrage.
- Source amont probable: visible decision / cause analysis de `action_plan_coaching`.
- Owner runtime: `coaching_recommendation`.
- Meilleure correction selon les guidelines: renforcer le contrat semantique des agents action pour distinguer `blocage avant/premier geste` de `decrochage pendant l'action`.
- Pourquoi ce n'est pas un patch local: la correction doit porter sur la grille de choix attack/defense dans le visible agent et son contexte, pas sur une phrase ni une regex.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-06 - Mauvais domaine semantique

**User**
> Ok, je ne connais pas trop. Texte magique, c’est quoi concrètement ? Et pourquoi pas une carte de défense si le piège c’est YouTube ?

**Sophia**
> Le texte magique, c’est une phrase très courte qui te remet dans l’action quand ton cerveau part ailleurs. Ici, je partirais sur une carte d’attaque, technique texte magique : le blocage ressemble surtout à une pensée/impulsion à recadrer au moment d’ouvrir les justificatifs, alors qu’une carte de défense sert plutôt à éviter de décrocher au moment critique pendant l’action.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=attack_card`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: Sophia explique que la carte de defense sert a eviter de decrocher au moment critique pendant l'action, ce qui correspond au cas user, mais maintient attaque.
- Source amont probable: coherence interne du visible agent et decision de levier.
- Owner runtime: `coaching_recommendation/action_plan_coaching`.
- Meilleure correction selon les guidelines: faire appliquer une matrice semantique stable dans le prompt/contexte de l'agent action: decrochage pendant l'action + piege concret -> defense prioritaire; preparation du demarrage -> attack.
- Pourquoi ce n'est pas un patch local: le probleme est une contradiction de raisonnement, pas un rendu de phrase.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Ok, si je garde cette carte liée à Préparer le dossier mutuelle dans mon Plan, je la prépare où exactement dans Sophia ?

**Sophia**
> Oui : depuis le Dashboard > Plan, tu ouvres l’action « Préparer le dossier mutuelle », puis tu prépares une carte d’attaque liée à cette action. Ici, je partirais sur une carte d’attaque, technique texte magique : une phrase courte pour recadrer le moment où tu ouvres les justificatifs et éviter que le cerveau parte tout de suite sur YouTube.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=attack_card`, `pending_type_change=null`

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-06 - Mauvais domaine semantique; BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Je crois que je me suis mal exprimé : je commence bien, mais après deux minutes je décroche et j’ouvre YouTube. Là, tu resterais vraiment sur attaque ou tu passerais sur défense ?

**Sophia**
> Je resterais sur une carte d’attaque, technique texte magique : ici, le vrai souci c’est l’entrée dans la tâche et le décrochage très vite vers YouTube, donc un recadrage court au démarrage colle mieux qu’une défense. La carte de défense serait plutôt pour le moment où tu sens que tu vas vraiment dérailler en cours d’action.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=attack_card`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: le user corrige explicitement le diagnostic vers "je commence bien puis je decroche"; Sophia ignore la correction et reste sur attaque.
- Source amont probable: le visible agent conserve trop fortement la recommandation precedente et ne revise pas la solution quand le dernier message clarifie la cause.
- Owner runtime: `coaching_recommendation/action_plan_coaching`.
- Meilleure correction selon les guidelines: donner priorite au dernier message user dans la revision de levier, et permettre au visible decision de passer de `attack_card` a `defense_card` quand la resistance est un derapage pendant l'action.
- Pourquoi ce n'est pas un patch local: il faut corriger la politique de revision de recommandation dans le flow, pas matcher "YouTube".

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue; BF-INTAKE-06 - Mauvais domaine semantique

**User**
> D’accord. Et si je veux préparer moi-même une carte de défense pour ce moment où je décroche, sans que tu crées quoi que ce soit depuis le chat, je vais où ?

**Sophia**
> Je partirais sur une carte d’attaque, technique texte magique : ouvre l’action « Préparer le dossier mutuelle » dans Dashboard > Plan, puis prépare la carte depuis cette action avec une phrase courte qui recadre ton démarrage et coupe l’appel de YouTube. Si ton vrai problème est surtout de décrocher pendant le travail, là on bascule plutôt vers une carte de défense.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=attack_card`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: le user demande explicitement ou preparer une carte de defense; Sophia repond d'abord carte d'attaque et ne donne pas directement la guidance defense.
- Source amont probable: preservation de recommandation stable trop forte dans le visible decision; contrainte explicite du dernier message insuffisamment priorisee.
- Owner runtime: `coaching_recommendation/action_plan_coaching`.
- Meilleure correction selon les guidelines: quand le user demande une guidance produit pour un levier nomme explicitement dans le scope Plan, l'agent doit repondre sur ce levier ou expliquer brievement pourquoi il ne le conseille pas, sans substituer silencieusement l'ancien levier.
- Pourquoi ce n'est pas un patch local: le fix doit porter sur le contrat de follow-up produit + revision de levier, pas sur un template de reponse.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia reste dans une conversation de coaching, sans sauter vers `product_help`.
- Les reponses sont courtes, comprehensibles et ne promettent aucune creation depuis le chat.
- La destination Plan est correcte pour une carte liee a une action du Plan.

**Problemes**
- Tours 1-2: confusion entre carte d'attaque et carte de defense. Famille: BF-INTAKE-06. Impact: le conseil peut orienter le user vers le mauvais levier.
- Tour 4: la correction explicite du user n'est pas integree. Famille: BF-INTAKE-06/BF-INTAKE-03. Impact: le user doit se battre contre Sophia pour corriger le diagnostic.
- Tour 5: demande explicite "carte de defense" remplacee par "carte d'attaque". Famille: BF-INTAKE-03. Impact: experience frustrante, meme si le routing est bon.

**Fix propose**
- Source amont: prompts/contexte de `action_plan_coaching` et decision visible structuree.
- Correction recommandee: expliciter la matrice de choix: `avant de commencer / premier geste / preparation` -> attack card; `pendant l'action / apres quelques minutes / piege concret / risque de derapage` -> defense card. Le dernier message user doit pouvoir reviser `current_recommendation`.
- Tests d'invariant attendus: action Plan + "je commence bien puis je decroche vers X" -> defense_card; follow-up "ou preparer carte de defense" -> guidance defense depuis `Dashboard > Plan`, pas substitution attack.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours restent owned par `coaching_recommendation`.
- `route_reason` passe correctement de `coaching_recommendation_signal` a `active_coaching_recommendation`.
- Aucun saut vers `product_help`.
- Aucun `change_confirm_coaching_type` visible ni `pending_type_change` observe sur le follow-up produit stable.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- Visible local observe via state: `action_plan_coaching` sur les tours.
- `coaching_type=plan_action` conserve.
- Aucun direct effect, aucun tool execute, aucune operation mutante.

**Effets durables**
- Aucun effet durable attendu ni observe.
- Cleanup cible effectue apres run.

**Fix verifie**
- Le bug vise par le dernier correctif est verifie comme corrige: le follow-up produit sur la meme action du Plan reste dans `coaching_recommendation/action_plan_coaching` et ne cree pas de clarification de type.

**Probleme restant**
- La decision metier attack vs defense est fausse ou rigide. Ce n'est pas un probleme d'ownership; c'est un probleme de semantique/revision dans `action_plan_coaching`.

## Verdict Global

Verdict global: yellow.

Le fix structurel `target_switch=explicit` stale est valide en run reel: pas de perte d'ownership, pas de `product_help`, pas de `change_confirm_coaching_type`. En revanche le run revele un bug distinct et important: Sophia maintient `attack_card/texte_magique` alors que le user decrit puis confirme un decrochage pendant l'action, cas qui devrait favoriser `defense_card`.
