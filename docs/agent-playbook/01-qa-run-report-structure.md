# QA Run Report Structure

> **Cadre obligatoire de validite QA**
>
> Un rapport de run conversationnel n'a de valeur que si le run a ete mene via le chemin IA reel de Sophia.
>
> Interdits :
>
> - renderer deterministe utilise comme resultat QA ;
> - fallback direct `processMessage` utilise pour sauver le verdict ;
> - runner staging/remote ou redeploiement utilise par defaut pour un run local ;
> - messages utilisateur issus d'une liste fixe pre-scripted ;
> - transcript reconstruit ou complete apres coup ;
> - rapport base seulement sur un `trace_id`, un resume ou une sortie partielle ;
> - execution qui ne respecte pas `force_full_ai=true` quand le prompt de run l'exige.
>
> L'agent QA missionne doit parler avec Sophia tour par tour. Chaque message utilisateur doit etre choisi apres lecture de la reponse precedente et des traces courtes du tour. Si ce cadre n'est pas respecte, le rapport doit s'arreter avec un verdict `red` et expliquer pourquoi le run n'a pas de valeur QA.
>
> Sauf consigne explicite contraire, les runs de cette playbook sont locaux : Supabase local, connexion locale de persona, chemin IA reel local. Staging/remote/deploiement ne doivent etre utilises que si le test ou le demandeur le precise.
>
> En cas d'interruption, timeout, erreur HTTP, reponse vide ou incident runtime, ne pas remplacer le run par un fallback. Reprendre simplement au point d'arret quand c'est possible, retenter le tour, corriger le probleme technique si necessaire, puis continuer jusqu'a obtenir un run exploitable. Les tentatives doivent etre mentionnees dans le rapport avec la cause observee et la resolution. Si le probleme persiste apres plusieurs tentatives raisonnables, arreter avec un verdict `red` et documenter le blocage.

## Objectif

Tous les rapports de runs conversationnels doivent etre simples, lisibles et exploitables.

Le rapport ne doit pas etre une archive brute de logs. Il doit permettre de comprendre rapidement :

- ce qui a ete teste ;
- ce que Sophia a vraiment dit ;
- si l'experience est humainement fluide ;
- si le systeme a route et execute correctement ;
- quoi corriger ensuite.

## Structure Attendue

Chaque rapport de run doit utiliser ces quatre sections principales, puis un verdict global tres court.

### 1. Contexte Du Test

But : donner en quelques lignes le cadre du run.

Contenu attendu :

- date, run id, persona, connexion dediee si applicable ;
- objectif du run ;
- trajectoire testee ;
- surfaces systeme visees : skills, tools, operations, safety, memory, routing ;
- contraintes importantes : IA reelle, Supabase local, `force_full_ai`, pas de fallback deterministe ;
- verdict technique de validite du run : valide ou invalide.

Format recommande :

```md
## 1. Contexte Du Test

- Date:
- Run:
- Persona:
- Objectif:
- Trajectoire:
- Surfaces visees:
- Cadre IA reel:
- Validite QA:
```

Rester court. Cette section doit orienter la lecture, pas refaire le prompt complet.

### 2. Tours De Conversation

But : rendre visible la conversation complete, tour par tour.

Chaque tour doit inclure :

- le message utilisateur exact ;
- la reponse Sophia exacte ou suffisamment complete pour juger la qualite ;
- les traces courtes utiles ;
- les effets observes si un tool ou une operation a ete appele.

Format recommande :

```md
## 2. Tours De Conversation

### Tour 1

**User**
> ...

**Sophia**
> ...

**Trace courte**
- http_status:
- response_owner:
- selected_handler:
- route_reason:
- safety:
- direct_effects:
- operation:
- pending_confirmation:
- memory_plan:
- executed_tools:
- durable_effect:
```

Regles :

- ne pas remplacer cette section par un resume ;
- ne pas mettre seulement un `trace_id` ;
- ne pas noyer avec le JSON complet si une trace courte suffit ;
- inclure les tours rates, vides, aborted ou en erreur ;
- si une reponse est vide, le dire explicitement.

### 3. Analyse De Fluidite Humaine

But : juger l'experience utilisateur comme conversation, pas comme systeme.

Cette section doit avoir un verdict couleur :

- `green` : conversation naturelle, claire, non repetitive, transitions propres ;
- `yellow` : utilisable mais friction visible ;
- `red` : experience confuse, mecanique, incoherente, dangereuse ou inutilisable.

Contenu attendu :

- verdict couleur ;
- points qui marchent ;
- problemes observes, relies aux tours concernes ;
- severite et impact utilisateur ;
- proposition de fix concrete.

Format recommande :

```md
## 3. Analyse De Fluidite Humaine

**Verdict: green|yellow|red**

**Ce qui marche**
- ...

**Problemes**
- Tour X: probleme. Impact: ... Severite: green|yellow|red.

**Fix propose**
- ...
```

Questions a couvrir quand pertinent :

- Sophia repond-elle au vrai besoin humain du moment ?
- Les handoffs entre soutien emotionnel, action concrete et produit sont-ils naturels ?
- Est-ce que Sophia repete une structure ou une phrase ?
- Est-ce que le user doit parler comme un test pour obtenir le bon comportement ?
- Est-ce que la sortie d'un mode sensible est naturelle ?

### 4. Analyse Systeme

But : juger le workflow technique : dispatcher, routers, skills, tools, tool skills, safety, memory, effets durables.

Cette section doit aussi avoir un verdict couleur :

- `green` : routage et side effects alignes avec l'intention utilisateur ;
- `yellow` : comportement global correct mais warning systeme ;
- `red` : mauvais owner, mauvais router, side effect incorrect, confirmation mal traitee, safety ratee, effet durable faux ou run techniquement invalide.

Contenu attendu :

- verdict couleur ;
- analyse du dispatcher et du `response_owner` ;
- analyse du router selectionne ;
- analyse des skills ou operations activees ;
- analyse des tools et side effects ;
- analyse memory/retrieval si pertinent ;
- comparaison entre intention utilisateur et effet durable observe ;
- proposition de fix concrete.

Format recommande :

```md
## 4. Analyse Systeme

**Verdict: green|yellow|red**

**Routage**
- ...

**Skills / Operations / Tools**
- ...

**Memory / Effets durables**
- ...

**Problemes**
- Tour X: probleme. Impact systeme: ... Severite: green|yellow|red.

**Fix propose**
- ...
```

Questions a couvrir quand pertinent :

- Le dispatcher a-t-il choisi le bon `response_owner` ?
- Le router selectionne correspond-il a l'intention utilisateur ?
- Une confirmation Oui/Non pending a-t-elle ete priorisee correctement ?
- Un side effect a-t-il ete bloque pendant safety/emotion aigu ?
- Un tool s'est-il declenche uniquement quand l'intention etait claire ?
- Un tool skill a-t-il collecte les slots avant execution ?
- L'effet durable observe correspond-il exactement a la demande utilisateur ?
- Le `memory_plan` et le retrieval sont-ils proportionnes au besoin du tour ?

### Verdict Global

But : permettre de scanner rapidement la conclusion du run sans recomposer les deux analyses.

Ce bloc doit rester court.

Format obligatoire :

```md
## Verdict Global

- Verdict: green|yellow|red
- Raison principale:
- Follow-up prioritaire:
```

Regle :

- si la fluidite humaine est `red`, le verdict global est `red` ;
- si l'analyse systeme est `red`, le verdict global est `red` ;
- si l'une des deux analyses est `yellow` et aucune n'est `red`, le verdict global est `yellow` ;
- `green` signifie que les deux analyses sont `green` ou que les warnings sont mineurs et explicitement non bloquants.

## Regles De Style

- Ecrire court, mais pas vague.
- Preferer les tours et constats precis aux grandes conclusions.
- Chaque probleme important doit avoir un tour reference et un fix propose.
- Ne pas cacher un echec derriere un verdict global optimiste.
- Ne pas transformer le rapport en dump JSON.
- Les couleurs doivent etre coherentes avec la severite : un side effect faux ou une safety ratee est `red`, meme si la conversation semble polie.
