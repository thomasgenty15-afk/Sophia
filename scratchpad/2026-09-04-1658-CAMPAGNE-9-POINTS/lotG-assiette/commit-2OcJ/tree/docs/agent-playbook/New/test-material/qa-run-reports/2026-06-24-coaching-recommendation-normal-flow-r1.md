# QA Run - Coaching Recommendation Normal Flow R1

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `coachingrec-normal-flow-20260624-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-normal-flow-20260624-r1-1782256250133@example.com`
- Objectif: verifier le fonctionnement normal de `coaching_recommendation`, sans `create_one_shot_reminder`.
- Trajectoire: blocage sur action du plan, clarification novice, comparaison potion/action, guidance produit depuis le flow, puis changement vers action hors plan.
- Surfaces visees: global dispatcher, `coaching_recommendation` local flow, visible agents plan/no-plan, active flow ownership, product guidance interne, absence de tool/direct effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, pas de reboot Supabase.
- Validite QA: valide. Run reel exploitable, 7 tours, traces courtes et state DB lues.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-06` - Mauvais domaine semantique

**User**
> J'ai dans mon plan l'action Préparer le dossier mutuelle. Je bloque avant même de commencer, je vois le dossier et je pars faire autre chose. Tu me conseillerais quoi dans Sophia ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Mot de bascule : choisis un seul mot comme « Go » ou « Départ » pour déclencher le premier geste sans te laisser embarquer par l’évitement. Ici, le blocage est au démarrage, donc il faut un appui simple pour lancer l’action.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia choisit `Mot de bascule` pour un simple blocage de demarrage. Cette technique est plutot adaptee quand le user sait qu'il risque de craquer, abandonner ou basculer contre l'objectif/action fixee.
- Source amont probable: connaissance metier insuffisante dans les visibles agents action sur les techniques de carte d'attaque.
- Owner runtime: visibles agents `action_plan_coaching` et `no_plan_coaching`, bloc commun cartes d'action.
- Meilleure correction selon les guidelines: enrichir le bloc commun des techniques pour reserver `Mot de bascule` aux moments de risque de craquage/bascule, et favoriser d'autres techniques pour une friction de demarrage simple.
- Pourquoi ce n'est pas un patch local: la correction porte sur la definition canonique d'une technique Sophia partagee par les deux visibles agents action, pas sur cette phrase exacte.

### Tour 2

**Verdict du tour:** green

**User**
> Je ne connais pas bien ces mots. Une carte d'attaque et Mot de bascule, ça veut dire quoi concrètement ?

**Sophia**
> Oui. Simplement :
> - **Carte d’attaque** = un petit appui pour **te lancer** dans l’action plus facilement.
> - **Mot de bascule** = une **carte d’attaque** très courte avec **un seul mot déclencheur**, pour passer à l’action sans réfléchir.
>
> Ici, je partirais sur une **carte d’attaque, technique Mot de bascule** : comme tu bloques avant de commencer *Préparer le dossier mutuelle*, un mot unique peut servir de déclencheur immédiat.
>
> Exemples de mot : **Go**, **Départ**, **Brouillon**.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> J'ai aussi une boule au ventre quand je pense au dossier mutuelle. Est-ce qu'une potion Apaisement serait plus logique que la carte d'attaque ?

**Sophia**
> La potion Apaisement sert surtout quand la pression monte de façon globale. Ici, ta boule au ventre est liée à une action précise du plan, et le vrai blocage est avant de démarrer. Donc je partirais sur une carte d’attaque, technique Mot de bascule : choisis un mot unique comme « Départ » ou « Go » pour déclencher le premier geste sans te lancer dans toute la tâche d’un coup.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Ok, si je veux la préparer moi-même dans Sophia sans que tu la crées depuis le chat, je vais où exactement ?

**Sophia**
> Dans le Dashboard > Plan, ouvre l’action « Préparer le dossier mutuelle », puis prépare une carte d’attaque depuis cette action. Si tu veux ensuite la retrouver, elle sera dans Dashboard > Ressources. Pour ce cas, la technique la plus simple est Mot de bascule : un seul mot déclencheur, par exemple « Go » ou « Départ ».

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Et une fois qu'elle est préparée, je la retrouve où pour la relire quand je bloque ?

**Sophia**
> Une fois préparée depuis l’action du plan, tu la retrouves dans Dashboard > Ressources pour la relire quand tu bloques. Si c’est une carte d’attaque liée à "Préparer le dossier mutuelle", elle reste consultable là-bas.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Autre cas : j'ai un mail à Camille qui n'est pas dans mon plan, je bloque pareil dès que j'ouvre le brouillon. Tu m'aiderais comment sans l'ajouter au plan ?

**Sophia**
> Oui : je partirais sur une carte d’attaque, pas sur le plan 🙂
>
> Comme le blocage arrive à l’ouverture du brouillon, le bon appui c’est de préparer le démarrage, pas d’intégrer le mail au plan. Pour un mail à Camille, la version la plus simple est souvent un mot de bascule + une première phrase déjà prête.
>
> Exemple :
> - Mot : “Go”
> - Premier geste : ouvrir le brouillon
> - Première phrase : “Je te fais un retour rapide sur…”
>
> Si tu veux, je peux te proposer une version très concrète pour ce mail.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `coaching_recommendation_exit_to_global`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: active skill cleared after tour
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: reponse visible correcte sur le fond, mais le local flow sort vers le global au lieu de basculer en interne de `plan_action` vers `no_plan_action`.
- Source amont probable: reducer/local flow `coaching_recommendation` classe le nouveau cas comme `topic_change`.
- Owner runtime: `coaching_recommendation` local dispatcher/reducer.
- Meilleure correction selon les guidelines: transformer ce cas en target switch interne structure (`plan_action -> no_plan_action`) quand le message reste un besoin de coaching, et ne produire `exit_to_global_dispatcher` que pour une vraie sortie du domaine.
- Pourquoi ce n'est pas un patch local: le signal existe deja dans les traces; le fix doit porter sur la transition d'etat du flow, pas sur une phrase ou un mot du user.

### Tour 7

**Verdict du tour:** green

**User**
> Et cette carte libre, je la prépare où ? Je veux éviter de passer par le Plan pour ce mail.

**Sophia**
> Va dans Dashboard > Ressources. C’est là que tu peux préparer une carte libre, sans passer par le Plan. Si tu veux, je peux aussi te dire si ça ressemble plutôt à une carte de défense ou d’attaque.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: no active coaching state
- executed_tools: `[]`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les tours 2 a 5 sont fluides: Sophia explique pour novice, compare potion vs carte sans sortir du scope, puis donne la guidance produit attendue.
- Le vocabulaire de carte d'attaque et de technique est mieux explique qu'avant.
- Aucun effet durable ou tool n'est declenche, conforme a la demande de run.

**Problemes**
- Tour 1: mauvaise technique de carte d'attaque (`Mot de bascule`) pour un blocage de demarrage simple. Famille: `BF-INTAKE-06`. Impact: le user recoit une technique Sophia mal calibree. Severite: yellow.
- Tour 6: le passage vers un deuxieme cas hors plan est humainement bien traite, mais il fait sortir le flow. Famille: `BF-STATE-01`. Impact: le user obtient une bonne reponse mais la continuite conversationnelle devient fragile. Severite: yellow.

**Fix propose**
- Source amont: bloc commun des techniques de carte d'attaque + transition d'etat dans le local flow `coaching_recommendation`.
- Correction recommandee: reserver `Mot de bascule` aux cas de risque de craquage/bascule, et distinguer explicitement `topic_change` hors domaine de `coaching_target_switch` intra-domaine. Un passage plan-action -> no-plan-action doit garder `coaching_recommendation` actif, mettre a jour `coaching_type`, et router vers le visible agent cible.
- Tests d'invariant attendus: blocage de demarrage simple ne choisit pas `Mot de bascule`; risque explicite de craquer peut choisir `Mot de bascule`; plan-action -> no-plan-action reste owner; vraie question produit standalone sans active flow peut rester `product_help`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1-T5: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, active flow present. Conforme.
- T6: `selected_skill_id=coaching_recommendation`, mais `response_owner=normal_reply`, `route_reason=coaching_recommendation_exit_to_global`, `skill_status=exit`. Non conforme pour un target switch interne.
- T7: `response_owner=product_help`, `route_reason=product_help_signal`. Acceptable une fois l'etat actif vide; le probleme systeme source reste T6.

**Skills / Operations / Tools**
- Aucun tool execute.
- Aucun direct effect.
- Aucun pending confirmation.
- Le visible agent plan-action produit une decision structuree coherentement: `lever=attack_card`, `variant=mot_de_bascule`, `confidence=high`.

**Memory / Effets durables**
- Donnees QA seed run-scopees: action `Préparer le dossier mutuelle`.
- Aucun effet durable attendu.
- Etat actif present jusqu'au tour 5, vide apres le tour 6.

**Problemes**
- Tour 1: mauvaise granularite de technique visible. Famille: `BF-INTAKE-06`. Impact systeme: la decision visible de variante `mot_de_bascule` ne respecte pas le bon domaine d'usage. Severite: yellow.
- Tour 6: mauvaise transition de flow. Famille: `BF-STATE-01`. Impact systeme: le reducer confond nouveau cas coaching hors plan avec sortie de domaine. Severite: yellow.

**Fix propose**
- Source amont: visibles agents action + local dispatcher/reducer `coaching_recommendation`, sortie `exit_to_global_dispatcher`.
- Correction recommandee: corriger le contrat des techniques de carte d'attaque et renforcer la transition `target_switch` interne qui conserve l'active state pour les trois types coaching (`plan_action`, `no_plan_action`, `emotional`) lorsque le nouveau message reste dans le domaine coaching. Le global dispatcher ne doit reprendre qu'apres une vraie sortie structurée.
- Tests d'invariant attendus: test prompt/contrat sur `Mot de bascule`; test unitaire reducer sur exit actif avec contexte stale; run IA reel paraphrase no-plan; anti-faux-positif avec question produit standalone sans active flow.

## Verdict Global

Verdict global: `yellow`.

Le fonctionnement normal plan-action est nettement meilleur sur l'ownership, mais deux problemes restent: une technique `Mot de bascule` mal calibree au tour 1, et une transition intra-coaching mal classee en sortie vers global quand le user introduit un autre cas hors plan.
