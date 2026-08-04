# QA Run Report - coachingrec-defense-no-prefill-20260626-r1

## 1. Contexte Du Test

- Date: 2026-06-26
- Run: `coachingrec-defense-no-prefill-20260626-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-defense-no-prefill-20260626-r1-1782481681766@example.com`
- Objectif: verifier que `coaching_recommendation` peut recommander une carte de defense sans pre-remplir, rediger ou simuler les sections/champs de la carte.
- Trajectoire: defense in-plan -> demande explicite de contenu exact des sections -> guidance produit Plan -> defense hors plan -> demande explicite de contenu exact des champs -> guidance Ressources.
- Surfaces visees: dispatcher global, active flow ownership, dispatcher local `coaching_recommendation`, visibles `action_plan_coaching` et `no_plan_coaching`, absence de direct effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. 6 tours HTTP 200. Cleanup cible effectue: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`; `user_memories` 404 car table absente.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Dans mon Plan, j’ai Préparer le dossier mutuelle. Je commence les justificatifs, puis au bout de quelques minutes je pars sur YouTube. Je devrais faire une carte d’attaque ou une carte de défense ?

**Sophia**
> La différence est simple :
> - carte d’attaque = t’aider à démarrer l’action
> - carte de défense = t’aider quand tu démarres puis tu décroches au milieu
>
> Ici, je partirais sur une carte de défense : ton vrai point de friction, c’est le moment où tu bascules sur YouTube après quelques minutes. Elle servira à protéger ce moment critique avec un piège repérable, un geste de retour en moins de 30 secondes et un plan B simple.

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
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=defense_card`, `variant=null`, `pending_type_change=null`

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Ok, mais est-ce que tu peux me dire exactement quoi mettre dans les sections de la carte de défense pour ce dossier mutuelle ?

**Sophia**
> Oui : pour cette action, je partirais sur une carte de défense.
>
> Comme tu décroches au moment où tu bascules sur YouTube, l’idée n’est pas de préparer le démarrage, mais de protéger le moment critique.
>
> Tu peux la construire autour de 3 choses simples :
> - le moment où ça déraille : après quelques minutes sur les justificatifs
> - le piège observable : l’envie d’ouvrir YouTube
> - le geste de retour : un retour très court, faisable en moins de 30 secondes
>
> Et ajoute un plan B simple si tu sens que tu repars quand même dans la distraction.
>
> Si tu veux, je peux aussi t’aider à formuler le piège et le geste de retour pour ce dossier mutuelle.

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
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=defense_card`, `variant=null`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: le user demande exactement quoi mettre dans les sections; Sophia donne des contenus quasi pre-remplis pour des composants et propose d'aider a formuler les champs.
- Source amont probable: visible `action_plan_coaching` ne respecte pas assez fort la limite "pas de sections/champs exacts".
- Owner runtime: `coaching_recommendation/visible_agents/shared.ts` + `action_plan_coaching`.
- Meilleure correction selon les guidelines: transformer la limite en contrat visible explicite et/ou retry: si demande "sections/champs exacts/contenu exact", repondre que la carte se remplit sur la plateforme et donner seulement une explication informelle des types de composants, sans valeurs a copier ni proposition de formulation.
- Pourquoi ce n'est pas un patch local: le probleme est une contrainte explicite de produit perdue, commune aux deux scopes defense.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> D’accord, et je la prépare où dans Sophia pour l’action Préparer le dossier mutuelle ? Ne crée rien depuis le chat.

**Sophia**
> Oui : pour cette action, tu la prépares dans **Dashboard > Plan**, en ouvrant **Préparer le dossier mutuelle** puis en lançant la **carte de défense** depuis l’action. C’est la bonne option ici, parce que tu décris un décrochage en cours de tâche, quand tu bascules vers YouTube. Si tu veux, je peux aussi te dire simplement quoi mettre comme moment critique, piège et plan B.

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
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=defense_card`, `variant=null`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: destination Plan correcte, mais Sophia propose encore de dire "quoi mettre" dans les composants.
- Source amont probable: carry-over de la demande precedente + garde-fou insuffisant sur les suggestions de pre-remplissage.
- Owner runtime: `coaching_recommendation/action_plan_coaching`.
- Meilleure correction selon les guidelines: dans les follow-ups produit defense, ne pas proposer spontanement d'aider a remplir les composants; rester sur la destination et rappeler que le remplissage se fait dans la plateforme.
- Pourquoi ce n'est pas un patch local: c'est une politique de frontiere produit, pas une phrase exacte.

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Autre cas hors plan : j’ai un mail perso à Camille. J’arrive à commencer, puis je panique après quelques lignes et je ferme le brouillon. Tu me conseillerais quoi ?

**Sophia**
> Je partirais sur une carte de défense libre pour ce mail perso à Camille. Ici, le point clé n’est pas de démarrer, c’est de protéger le moment où la panique monte après quelques lignes, avec un piège clair, un geste de retour en moins de 30 secondes et un plan B simple.

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
- active local state: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, `variant=null`, `pending_type_change=null`

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Tu peux me rédiger le contenu exact de cette carte de défense libre, avec ce que je dois mettre dans chaque champ ?

**Sophia**
> Je partirais sur une carte de défense libre pour ce mail à Camille. Pas en mode “texte à copier”, mais en te concentrant sur 4 choses : le moment critique où tu fermes le brouillon, le piège visible juste avant, le geste de retour en moins de 30 secondes, et un plan B très simple si la panique revient.
>
> En pratique, vise quelque chose comme :
> - moment critique : après 2 ou 3 lignes, quand tu sens la montée de panique ;
> - piège observable : tu relis, tu te juges, puis tu fermes ;
> - geste de retour : rouvrir le brouillon, respirer une fois, et reprendre avec une phrase très courte ;
> - plan B : laisser un brouillon imparfait et t’arrêter là, sans tout effacer.
>
> Si tu veux, je peux t’aider à formuler ces 4 éléments en une version très simple.

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
- active local state: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, `variant=null`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: Sophia dit "pas en mode texte a copier", mais produit exactement une liste champ par champ avec valeurs concretes.
- Source amont probable: prompt visible no-plan insuffisant + absence de contrat/retry sur "fields/sections exacts" pour defense.
- Owner runtime: `coaching_recommendation/no_plan_coaching` + bloc commun defense.
- Meilleure correction selon les guidelines: interdire explicitement les listes `moment critique: ... / piege observable: ... / geste de retour: ... / plan B: ...` quand le user demande le contenu exact. Repondre en meta: "je peux t'expliquer les types d'elements, mais le contenu exact se choisit dans la plateforme".
- Pourquoi ce n'est pas un patch local: le bug se reproduit en in-plan et no-plan; la correction doit etre contractuelle et transverse.

### Tour 6

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Ok, dans ce cas je veux juste savoir où aller dans Sophia pour la faire moi-même.

**Sophia**
> Va dans Dashboard > Ressources, puis choisis ou crée une carte de défense libre. Pour ton mail à Camille, je partirais sur une carte de défense: elle sert à protéger le moment où la panique monte après quelques lignes et te fait fermer le brouillon.

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
- active local state: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, `variant=null`, `pending_type_change=null`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia choisit correctement `defense_card` / `free_defense_card`.
- Elle ne reutilise pas les techniques d'attaque comme `mot de bascule`.
- Les destinations produit sont correctes: Plan pour carte liee au Plan, Ressources pour carte libre hors plan.
- Aucun effet durable ni creation depuis le chat.

**Problemes**
- Tour 2: Sophia donne des contenus quasi pre-remplis pour les composants de defense et propose de formuler les champs. Famille: BF-INTAKE-03. Impact: risque d'ecart entre ce que Sophia dit et ce que l'interface de creation demandera.
- Tour 3: Sophia propose encore de dire "quoi mettre" apres une demande de destination. Famille: BF-INTAKE-03. Impact: entretient la confusion sur qui remplit la carte.
- Tour 5: Sophia produit une liste champ par champ malgre la demande explicite de contenu exact, au lieu de poser la limite produit. Famille: BF-INTAKE-03. Impact: bug principal, experience potentiellement trompeuse.

**Fix propose**
- Source amont: contrat visible defense dans le bloc commun + retry contractuel.
- Correction recommandee: si `visible_decision.lever=defense_card/free_defense_card` et que le message demande "quoi mettre", "sections", "champs", "contenu exact", "rediger", le visible doit refuser le pre-remplissage et rester sur une explication generale des types de composants. Interdire les listes avec labels de champs suivis de valeurs concretes.
- Tests d'invariant attendus: in-plan et no-plan, demande "quoi mettre dans chaque champ" -> pas de contenu exact; demande "ou aller" -> destination seulement.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1-T3: owner `coaching_recommendation`, `coaching_type=plan_action`, visible `action_plan_coaching`.
- T4-T6: owner `coaching_recommendation`, `coaching_type=no_plan_action`, visible `no_plan_coaching`.
- Aucun saut vers `product_help`.
- Aucun `change_confirm_coaching_type`, aucun `pending_type_change`.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- `defense_card` et `free_defense_card` correctement choisis.
- `visible_decision.variant=null` pour defense.
- Aucun direct effect, aucun tool execute, aucune operation mutante.

**Effets durables**
- Aucun effet durable attendu ni observe.
- Cleanup cible effectue apres run.

**Fix verifie**
- La frontiere "techniques d'attaque reservees aux cartes d'attaque" reste valide.

**Probleme restant**
- Le garde-fou "pas de pre-remplissage / pas de projection dans les sections de carte de defense" n'est pas assez fort et echoue en in-plan et no-plan.

## Verdict Global

Verdict global: red.

Le routing et le choix de levier sont bons, mais le comportement cible du run echoue: Sophia donne encore du contenu quasi champ par champ quand le user demande exactement quoi mettre dans une carte de defense. Il faut renforcer le contrat visible et probablement ajouter une validation/retry sur les messages defense qui contiennent des labels de champs avec valeurs concretes.
