# QA Run Report — Product Help Render Fix R1

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `product-help-render-fix-20260603-r1`
- Persona:
  `qa-normal-product-help-render-fix-20260603-r1-1780506238149@example.com`
- Objectif: vérifier les corrections des deux défauts `product_help`: répétition
  sur follow-up comparatif et réponse catalogue sur “où si elle existe”.
- Trajectoire: comparaison produit -> follow-up de choix -> demande de création
  de deux cartes -> clarification -> résolution vers défense -> interruption
  product_help localisation.
- Surfaces visees: `product_help`, `orientation_clarification`,
  `prepare_defense_card`, active flow interruption, effects guard.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, aucun fallback déterministe.
- Validite QA: valide avec incidents techniques documentés. Deux appels ont
  retourné `502` Edge Runtime et ne sont pas comptés comme tours
  conversationnels valides; les relances ont produit les tours exploitables.

## 2. Tours De Conversation

### Incident Technique A

**Verdict du tour:** red technique, non compté comme verdict produit

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incohérent ou suite
malsaine

**User**

> Explique-moi la différence entre une carte d'attaque et une carte de défense.

**Sophia**

> Réponse vide, HTTP `502`.

**Trace courte**

- http_status: `502`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- Symptome: Edge Runtime renvoie “An invalid response was received from the
  upstream server”.
- Source amont probable: incident runtime local.
- Owner runtime: infrastructure QA locale.
- Meilleure correction selon les guidelines: ne pas utiliser ce tour pour juger
  le produit; relancer le même message.
- Pourquoi ce n'est pas un patch local: aucun signal métier exploitable n'a été
  produit.

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Explique-moi la différence entre une carte d'attaque et une carte de défense.

**Sophia**

> Une carte d’attaque et une carte de défense, c’est deux façons différentes
> d’agir sur toi (et sur ton quotidien). L’idée: soit tu avances vers ce que tu
> veux, soit tu protèges ce qui te fait dévier 😄
>
> Carte d’attaque
>
> - Objectif: créer du mouvement.
> - Logique: “Je fais quelque chose qui me met en action vers mon objectif.”
> - Exemple: une phrase d’action, un rituel, une décision concrète (“Aujourd’hui
>   je lance X pendant 20 minutes”, “Je fais la demande / l’envoi / le premier
>   pas.”)
>
> Carte de défense
>
> - Objectif: réduire la casse.
> - Logique: “Je limite les chances que je déraille (stress, procrastination,
>   retours en arrière, pensées parasites).”
> - Exemple: un mécanisme anti-blocage (“Si je me sens bloqué, je fais la
>   version mini pendant 5 minutes”, “Quand ça monte, je respire/je ramène mon
>   attention et je reviens à l’étape suivante.”)
>
> Version ultra simple
>
> - Attaque = énergie vers l’avant.
> - Défense = bouclier quand ça tangue.
>
> Si tu me dis ton contexte (objectif ou situation où tu galères), je peux te
> proposer une attaque et une défense qui matchent. 😊

**Lecture humaine** Sophia compare bien les deux cartes et ne bascule pas en
création. La formulation est plus libre que le catalogue strict, mais
l’expérience est compréhensible et non mutante.

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- n/a

### Incident Technique B

**Verdict du tour:** red technique, non compté comme verdict produit

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incohérent ou suite
malsaine

**User**

> Ok, dit autrement : attaque vs défense, je choisis quoi quand je veux juste me
> mettre à l'action ?

**Sophia**

> Réponse vide, HTTP `502`.

**Trace courte**

- http_status: `502`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- Symptome: nouvel incident Edge Runtime sur le follow-up.
- Source amont probable: incident runtime local.
- Owner runtime: infrastructure QA locale.
- Meilleure correction selon les guidelines: relancer le même message, sans
  reconstruire de transcript.
- Pourquoi ce n'est pas un patch local: aucun chemin produit n'a répondu.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Ok, dit autrement : attaque vs défense, je choisis quoi quand je veux juste me
> mettre à l'action ?

**Sophia**

> Bonne question 😄 Quand ton but c’est juste de passer à l’action, en général
> tu choisis plutôt la carte d’attaque.
>
> Règle simple :
>
> - Attaque = tu as besoin d’élan (tu bouges vers “ce que tu veux”). Exemple:
>   “Aujourd’hui je fais 10 minutes de X.”
> - Défense = tu as besoin d’éviter le dérapage (tu freines ce qui te détourne).
>   Exemple: “Je coupe les distractions / je verrouille mon moment de travail.”
>
> Test ultra-rapide : si tu te dis “il me faut du carburant”, attaque. Si tu te
> dis “je vais encore partir en vrille”, défense.
>
> Tu veux que je te propose 2–3 exemples d’attaque/défense pour ton cas du
> moment ? 🙂

**Lecture humaine** Le défaut du run précédent est corrigé: Sophia ne répète pas
le tour 1. Elle répond à la demande de choix et oriente clairement vers la carte
d’attaque pour démarrer.

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- n/a

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Maintenant ce n'est plus une explication : j'aimerais créer une carte de
> défense et une carte d'attaque.

**Sophia**

> Par laquelle veux-tu commencer : la carte d'attaque ou la carte de défense ?
> 🙂

**Lecture humaine** Le système ne confond pas comparaison produit et création.
Il passe par `orientation_clarification`, garde les deux cartes candidates et
n’exécute rien.

**Trace courte**

- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: clarification dispatcher présente, non mutante
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- n/a

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> La défense d'abord.

**Sophia**

> Ok, pour quelle action ou quel contexte veux-tu créer une carte de défense ?
> 🙂

**Lecture humaine** La clarification se résout vers `prepare_defense_card`, mais
le flow ne crée rien. Il collecte le contexte manquant.

**Trace courte**

- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_defense_card` intake seulement
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun; `tool_execution=blocked`

**Analyse si yellow/red**

- n/a

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Stop pour la création, je veux juste savoir où je retrouverai une carte
> d'attaque si elle existe.

**Sophia**

> Si une carte d'attaque a ete generee, tu la retrouves ici:
>
> - Dashboard > Ressources > Cartes d'attaque du plan: quand une carte d'attaque
>   du plan a ete generee.
>
> Je ne peux pas confirmer qu'elle existe sans source recente ou projection; si
> elle existe, c'est l'endroit a verifier. Limite: seul le mot peut etre
> remplace sur une carte Mot de bascule depuis Ressources; pour changer le
> contexte, la technique ou le contenu, il faut preparer une nouvelle carte
> apres confirmation. 🙂

**Lecture humaine** Le défaut du tour 5 précédent est corrigé: Sophia répond
directement à la localisation conditionnelle, rappelle qu’elle ne peut pas
confirmer l’existence sans source, et ne rend plus la fiche catalogue complète.

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_inline_resume_active_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- n/a

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**

- Le follow-up comparatif reçoit une réponse de choix, pas une répétition.
- La demande de création des deux cartes reste une clarification non mutante.
- La résolution vers défense ne crée pas de carte et collecte les slots
  manquants.
- L’interruption “Stop pour la création” est respectée.
- La localisation conditionnelle est courte, directe, et reconnaît l’absence de
  preuve d’existence.

**Problemes**

- Deux incidents `502` Edge Runtime ont eu lieu, puis les relances ont réussi.
  Famille: `BF-TEST-01`. Impact: bruit QA local, pas défaut produit observé.
- Les emojis sont toujours présents; ce run ne testait pas une préférence
  `zero emoji`.

**Fix propose**

- Source amont: infrastructure QA locale pour les `502`.
- Correction recommandee: surveiller si les `502` se répètent sur les prochains
  runs; pas de patch produit à faire depuis ce run.
- Tests d'invariant attendus: conserver les tests product_help ciblés et rerun
  réel sur les mêmes familles après tout changement de renderer/intake.

## 4. Verdict Global

green produit — les deux bugs `R3-B02` et `R3-B03` sont corrigés et vérifiés en
run réel. Le run contient deux incidents techniques `502`, documentés et
relancés conformément aux guidelines.
