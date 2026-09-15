# QA Run - Rose - Ajustement De Niveau Après Garde Pré-Validation

## 1. Contexte Du Test

- Date: 2026-05-17
- Run: `level-validation-r14`
- Persona: Rose
- Objectif: vérifier que le flow d'ajustement de niveau produit un brouillon, bloque l'exécution sur une demande de confirmation avant validation, puis applique seulement après validation explicite.
- Trajectoire: demande d'allègement du niveau sécurité -> brouillon -> question de confirmation avant validation -> validation explicite -> exécution -> résumé post-application.
- Surfaces visées: `test-send-message`, routing `adjust_plan_item`, `level_intake`, draft review, confirmation, executor, matérialisation DB.
- Cadre IA réel: Supabase local, `test-send-message`, `force_full_ai=true`, aucun renderer déterministe, aucun executor appelé directement.
- Validité QA: valide.
- Cleanup: effectué. Les 4 items Rose ont été restaurés, `0` message et `0` `user_chat_state` restants sur le scope QA.

Artifacts:

- Raw: `tests/real-personas/rose/runs/operations/2026-05-17-adjust-plan-level-level-validation-r14.raw.json`
- Summary: `tests/real-personas/rose/runs/operations/2026-05-17-adjust-plan-level-level-validation-r14.summary.json`
- Snapshot: `tests/real-personas/rose/runs/operations/2026-05-17-adjust-plan-level-level-validation-r14.snapshot.json`
- Durable: `tests/real-personas/rose/runs/operations/2026-05-17-adjust-plan-level-level-validation-r14.durable.json`
- Cleanup: `tests/real-personas/rose/runs/operations/2026-05-17-adjust-plan-level-level-validation-r14.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Le niveau sécurité du couple est trop lourd pour moi cette semaine. Je veux alléger seulement ce niveau, pas tout le plan : Partager un point positif passe à 2 jours / semaine, avec une phrase neutre et sans créneau fixe ; Convenir d'un signal de pause devient une mission de 5 minutes pour choisir ensemble un mot ou un geste simple. La cartographie des déclencheurs et Faire le point restent inchangés.

**Sophia**
> C'est noté, je vais alléger ton niveau actuel pour cette semaine. Je vais passer 'Partager un point positif' à 2 jours avec une consigne simplifiée, et réduire la mission du signal de pause à 5 minutes. Je ne touche pas au reste. Est-ce que je peux te préparer le brouillon de ces changements ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- safety: `none`
- memory_plan: `light`
- executed_tools: none
- durable_effect: none

### Tour 2

**User**
> Oui, montre-moi le brouillon pour que je le relise avant application.

**Sophia**
> Je te propose d'alléger ton niveau actuel pour qu'il soit plus digeste et moins lourd à porter. Rien n'est encore appliqué, j'attends ta validation sur ce brouillon. Voici ce que je prévois de modifier : l'habitude 'Partager un point positif' passerait de 3 à 2 jours par semaine avec une approche plus neutre et sans créneau fixe, tandis que la mission 'Convenir d'un signal de pause' serait simplifiée en un échange de 5 minutes pour choisir ensemble un mot ou un geste simple. L'action 'Cartographier les déclencheurs' restera inchangée pour préserver l'essentiel de ta démarche. Est-ce que cela te convient ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- safety: `none`
- executed_tools: none
- durable_effect: none

### Tour 3

**User**
> Avant validation, confirme que Faire le point reste aussi inchangé, et que l'objectif global du couple ne bouge pas.

**Sophia**
> Je te propose d'alléger ton niveau actuel « Désamorcer et recréer de la sécurité » pour réduire la pression tout en gardant l'essentiel. Voici ce que je prévois de modifier :
>
> - L'habitude **Partager un point positif** passera à 2 jours par semaine (au lieu de 3), avec une consigne simplifiée pour utiliser une phrase neutre, sans créneau horaire imposé.
> - La mission **Convenir d'un signal de pause** sera transformée en une action rapide de 5 minutes pour simplement choisir ensemble un mot ou un geste.
>
> Rien n'est encore appliqué. Tes autres actions comme « Cartographier les déclencheurs » ou « Faire le point » restent inchangées, tout comme l'objectif global de votre couple. Est-ce que cela te convient ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- safety: `none`
- tool_execution: `blocked`
- executed_tools: none
- durable_effect: none
- validation_guard: OK, la demande `Avant validation, confirme...` n'a pas exécuté.

### Tour 4

**User**
> Oui, applique ce brouillon maintenant.

**Sophia**
> C'est fait, j'ai ajusté ton niveau pour le rendre plus respirable.
>
> J'ai réduit la fréquence de l'habitude **Partager un point positif** à 2 jours par semaine et j'ai simplifié la mission **Convenir d'un signal de pause** pour qu'elle ne vous prenne que 5 minutes. Ces changements permettent de diminuer la charge mentale et la fatigue décisionnelle tout en protégeant le cœur de votre progression.
>
> Le reste de votre plan et vos priorités ne bougent pas. Je suis assez confiant sur le fait que cet allègement va vous redonner de l'élan sans vous mettre la pression.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- safety: `none`
- tool_execution: `success`
- executed_tools: `adjust_plan_item`
- durable_effect: yes, après validation explicite.

### Tour 5

**User**
> Merci. Résume-moi ce qui a été modifié et ce qui est resté inchangé.

**Sophia**
> Avec plaisir 😊 Voilà le résumé :
>
> Modifié (ce qui change cette semaine)
> - “Partager un point positif” : passer de 3 à 2 jours/semaine, avec une consigne plus neutre et sans créneau fixe.
> - “Convenir d’un signal de pause” : la mission passe à environ 5 minutes, pour choisir ensemble un mot ou un geste simple.
>
> Resté inchangé
> - “Faire le point” : reste tel quel.
> - L’objectif global du couple : ne bouge pas.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- safety: `none`
- executed_tools: none
- durable_effect: none
- note: résumé correct sur les changements, mais il oublie de reciter `Cartographier les déclencheurs` dans les inchangés.

### Tour 6

**User**
> Ok, on s'arrête là.

**Sophia**
> Ok, j'arrête là. Je ne crée rien d'autre.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- safety: `none`
- executed_tools: none

## 3. Analyse De Fluidité Humaine

**Verdict: green**

**Ce qui marche**
- Sophia comprend que la demande cible le niveau actuel, pas une action isolée ni le plan global.
- Elle annonce clairement qu'aucun changement n'est appliqué avant validation.
- Le tour 3 répond à la demande de confirmation sans déclencher l'exécution.
- Le tour 4 applique seulement après un "Oui, applique ce brouillon maintenant."

**Problèmes**
- Tour 1: "2 jours" au lieu de "2 jours / semaine" est un peu moins précis, mais le tour 2 corrige.
- Tour 5: le résumé post-application ne recite pas `Cartographier les déclencheurs` dans les éléments inchangés. Impact faible car le tour 3 l'avait confirmé et la DB montre que l'item est inchangé. Sévérité: yellow léger.

**Fix proposé**
- Optionnel: dans les résumés post-exécution, inclure tous les preserved_items, pas seulement un sous-ensemble.

## 4. Analyse Système

**Verdict: green**

**Routage**
- Le run route vers `tool_skill` / `adjust_plan_item` dès le tour 1.
- La demande de détail "Avant validation..." reste en `tool_execution=blocked`, donc la garde pré-validation fonctionne.
- L'exécution ne se produit qu'au tour 4 après validation explicite.

**Skills / Operations / Tools**
- Le brouillon est généré au tour 2.
- La demande de confirmation supplémentaire au tour 3 ne consomme pas le pending.
- `adjust_plan_item` est exécuté au tour 4 uniquement après "Oui, applique ce brouillon maintenant."

**Memory / Effets durables**
- Avant cleanup, effet durable observé:
  - `Partager un point positif`: `target_reps=2`, `cadence_label=2 jours / semaine`, `time_of_day=anytime`, description `une phrase neutre et sans créneau fixe`.
  - `Convenir d'un signal de pause`: description `Mission de 5 minutes pour choisir ensemble un mot ou un geste simple`.
  - `Cartographier les déclencheurs`: inchangé.
  - `Faire le point sur le signal de pause`: inchangé.
- Cleanup effectué:
  - `Partager un point positif` restauré à `target_reps=3`, `cadence_label=3 jours / semaine`, `time_of_day=evening`.
  - `Convenir d'un signal de pause` restauré à sa description initiale.
  - `0` message et `0` `user_chat_state` restants sur le scope r14.

**Problèmes**
- Aucun problème bloquant observé sur le flow principal.
- Warning mineur: le résumé post-application n'inclut pas explicitement tous les items préservés.

**Fix proposé**
- Ajouter un rendu post-exécution plus exhaustif des `preserved_items` si on veut un UX totalement carré.

## Verdict Global

**green**

Le flow principal fonctionne sur ce run: routing vers ajustement de niveau, brouillon avant application, non-exécution sur demande "avant validation", exécution seulement après validation explicite, matérialisation DB correcte, puis cleanup complet.
