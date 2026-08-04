# QA Run - Rose - Ajustement De Niveau Apres Fix Opus

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `level-validation-r9`
- Persona: Rose
- Objectif: relancer le test d'ajustement de niveau apres correction Opus, avec brouillon puis validation si le flow y arrive.
- Trajectoire testee: demande d'allegement du niveau securite -> identification des deux actions -> attente du brouillon -> blocage en clarifications.
- Surfaces visees: `test-send-message`, routing `adjust_plan_item`, level intake, draft validation, confirmation, effets durables.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun executor appele directement.
- Note harness: ajout local dans `test-send-message` pour accepter `x-user-authorization` comme vrai JWT user, car le gateway local rejetait le JWT ES256 avant la fonction. La fonction valide encore le user via `auth.getUser`.
- Validite QA: valide pour juger le flow conversationnel jusqu'au blocage; invalide pour juger la materialisation durable, car aucune execution n'a ete atteinte.
- Cleanup: effectue. Les 4 items Rose ont ete restaures, aucun nouvel item, `0` message et `0` chat state restants sur le scope QA.

Artifacts:

- Raw: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r9.raw.json`
- Summary: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r9.summary.json`
- Snapshot: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r9.snapshot.json`
- Durable: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r9.durable.json`
- Cleanup: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r9.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Je veux alléger le niveau actuel sur la sécurité, pas juste une action. Garde l'objectif global du couple, mais propose-moi un brouillon plus léger : point positif à 2 jours / semaine, phrase neutre, sans créneau imposé ; signal de pause en 5 minutes pour choisir un mot ou un geste simple. La cartographie des déclencheurs reste inchangée.

**Sophia**
> Pour résumer, tu souhaites alléger le niveau actuel en ajustant l'habitude 'Partager un point positif' à 2 jours par semaine avec une consigne neutre et sans créneau imposé, et la mission 'Convenir d'un signal de pause' à 5 minutes avec un mot ou un geste simple, tout en gardant l'objectif global du couple et la 'Cartographie des déclencheurs' inchangée. Est-ce que je peux te préparer un brouillon avec ces modifications ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: non expose dans la synthese courte
- safety: low
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 2

**User**
> Oui, prépare le brouillon avec exactement ces modifications. Je veux le relire avant application : 2 jours / semaine, phrase neutre, sans créneau pour le point positif ; 5 minutes pour choisir un mot ou un geste simple ; cartographie inchangée.

**Sophia**
> Je dois reprendre le brouillon pour m'assurer qu'il intègre bien toutes tes précisions. Pour 'Partager un point positif', je vais ajuster la cadence à 2 jours par semaine, la consigne à 'phrase neutre' et retirer le créneau horaire. Pour 'Convenir d'un signal de pause', je vais fixer la durée à 5 minutes et la consigne à 'choisir un mot ou un geste simple'. La 'Cartographie des déclencheurs' restera inchangée. Y a-t-il d'autres détails ou ajustements à prendre en compte pour ces modifications ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- safety: low
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 3

**User**
> Non, rien d'autre. Ces deux changements suffisent et le reste du niveau doit rester inchangé. Montre-moi le brouillon à valider maintenant.

**Sophia**
> Pour que je puisse te montrer le brouillon, je dois d'abord m'assurer que j'ai bien identifié les actions à ajuster. Tu souhaites bien modifier l'habitude "Partager un point positif" et la mission "Convenir d'un signal de pause", et laisser le reste du niveau tel quel ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- safety: low
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 4

**User**
> Oui, c'est bien ça : modifie seulement 'Partager un point positif' et 'Convenir d'un signal de pause'. Laisse la cartographie et le reste du niveau inchangés. Tu peux afficher le brouillon.

**Sophia**
> Le brouillon doit être repris proprement avant que je puisse te le montrer. Pour cela, j'ai besoin de savoir quel changement précis tu souhaites apporter à la mission 'Convenir d'un signal de pause'.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- safety: low
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 5

**User**
> Pour 'Convenir d'un signal de pause', le changement précis est : choisir un mot ou un geste simple en 5 minutes, sans grande discussion. Pour 'Partager un point positif' : 2 jours / semaine, phrase neutre, sans créneau imposé. Montre le brouillon complet.

**Sophia**
> Je dois reprendre le brouillon pour m'assurer que tout est bien intégré. Pour 'Convenir d'un signal de pause', comment souhaites-tu que j'ajuste la description et la durée de la mission ? Et pour 'Partager un point positif', comment dois-je modifier la fréquence, l'instruction et le créneau horaire ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- safety: low
- memory_plan: light
- executed_tools: none
- durable_effect: none
- issue: boucle de clarification; run arrete ici pour ne pas forcer.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le premier tour comprend correctement que la demande cible le niveau actuel et non une seule action.
- Sophia repete les contraintes principales sans tutoiement incorrect.
- Aucun effet durable n'est applique sans confirmation.

**Problemes**
- Tour 2: Sophia demande "d'autres details" alors que le user a deja donne les champs executables.
- Tour 3: Sophia redemande les deux actions a ajuster alors qu'elles sont citees depuis le tour 1.
- Tour 4: Sophia oublie le changement du signal de pause deja fourni.
- Tour 5: Sophia redemande exactement les champs deja fournis: description/duree pour le signal, frequence/instruction/creneau pour le point positif. Impact: boucle de clarification, aucun brouillon visible.

**Fix propose**
- Dans le slot filler `adjust_plan_item`, ajouter une regle de suffisance forte: si le user fournit titre d'action + champ cible + valeur cible, le slot est rempli et ne doit plus etre redemande.
- Dans la continuation active, merger les slots deja cites dans les tours precedents avant de generer la prochaine question.
- Apres confirmation "rien d'autre", produire le brouillon si les changed_items sont materialisables; ne pas repasser en collecte.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `response_owner=tool_skill` sur tous les tours, donc le routage global reste dans la bonne famille.
- Le selected handler n'est pas expose dans la synthese courte, mais les reponses correspondent au flow `adjust_plan_item`.

**Skills / Operations / Tools**
- Le tool skill ne passe jamais en draft review.
- Aucun `adjust_plan_item` tool n'est execute.
- Le fix de confirmation/execution Opus ne peut pas etre valide, car le flow bloque avant le brouillon.

**Memory / Effets durables**
- Avant cleanup, aucun item n'a ete modifie:
  - `Partager un point positif`: `3 jours / semaine`, `target_reps=3`, `time_of_day=evening`.
  - `Convenir d'un signal de pause`: description initiale.
  - items pending inchanges.
- Apres cleanup: 4 items restaures, aucun nouvel item, `0` message et `0` chat state.

**Problemes**
- Le state/intake ne conserve pas ou ne reconnait pas les slots deja fournis dans le transcript.
- Le flow demande des informations deja presentes au lieu de compiler un brouillon.
- Le test ne peut pas confirmer la materialisation durable, car aucune execution n'est atteinte.

**Fix propose**
- Fix 20/80 restant: stabiliser le merge de slots multi-tour pour `current_level` avant toute question. Les slots suivants doivent etre reconnus comme remplis dans ce run:
  - affected_items: `Partager un point positif`, `Convenir d'un signal de pause`
  - frequency: `2 jours / semaine`
  - instruction: `phrase neutre`
  - time_of_day: aucun creneau / libre
  - mission description/duration: `choisir un mot ou un geste simple en 5 minutes`
  - preserved_items: `Cartographier les déclencheurs`, reste du niveau

## Verdict Global

**red**

Le probleme auth local est contourne proprement pour le harness, mais le flow niveau reste bloque avant brouillon. La correction Opus n'est donc pas suffisante ou pas active sur la collecte des slots: Sophia comprend la demande, mais redemande en boucle les memes champs au lieu de produire le brouillon validable.
