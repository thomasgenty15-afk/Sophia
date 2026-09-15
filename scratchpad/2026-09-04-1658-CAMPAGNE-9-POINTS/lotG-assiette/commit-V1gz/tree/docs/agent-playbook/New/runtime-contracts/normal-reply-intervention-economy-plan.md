# Normal Reply Intervention Economy Plan

## Objectif

Mettre en place une economie d'intervention conversationnelle pour Sophia.

Principe central :

```txt
normal_reply intelligent est l'owner naturel.
Un flow, un skill specialise ou un tool ne prend la main que s'il bat vraiment normal_reply.
```

Le but n'est pas de rendre Sophia moins capable. Le but est de separer :

- detection d'un signal possible ;
- droit d'intervenir maintenant ;
- choix final d'owner.

Une opportunite implicite ne doit pas devenir automatiquement une proposition
visible. Sophia peut voir une opportunite de carte, potion, status ou skill,
mais choisir de rester en conversation normale si c'est la meilleure experience.

## Probleme Observe

Run source :

```txt
docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-normal-conversation-20t-r1.md
```

Symptomes :

- T2-T5 : Sophia transforme une conversation simple fatigue / grignotage en
  opportunite puis flow `prepare_defense_card`.
- T3 : l'utilisateur dit explicitement "pas tout de suite une carte" et
  "parle simplement", mais le flow opportunity reste owner.
- T9/T19 : `demotivation_repair` repond depuis une logique generique de
  demarrage de tache alors que le contexte est nourriture / grignotage.

Familles :

- `BF-ROUTE-01` / `BF-ROUTE-02` : flow opportunity ou ancien flow capture une
  conversation simple.
- `BF-INTAKE-06` : mauvais domaine semantique dans `demotivation_repair`.
- `BF-INTAKE-04` : nuance faim / stress insuffisante.

## Correction Conceptuelle

Le systeme ne doit pas attendre que l'utilisateur dise explicitement :

```txt
je veux une conversation simple
```

La plupart des utilisateurs ne formulent pas une preference de routing. Ils
parlent simplement comme des humains.

Donc le signal important n'est pas :

```txt
simple_conversation_score = le user a explicitement demande de rester simple
```

mais :

```txt
normal_reply_fit_score = probabilite qu'une reponse normale intelligente soit
la meilleure experience pour ce tour
```

Ce score doit avoir un prior naturellement eleve pour les messages humains
conversationnels.

## Nouveau Signal Minimal

Ajouter au `TurnFrame` :

```ts
normal_reply_fit_score?: number; // 0..1
normal_reply_fit_evidence?: string[];
```

Definition :

```txt
0.90-1.00 : une reponse normale intelligente est presque surement le bon owner.
0.75-0.89 : conversation humaine simple, soutien leger ou micro-aide concrete.
0.50-0.74 : ambigu entre conversation normale et aide structuree.
0.20-0.49 : demande probablement structuree, mais pas completement explicite.
0.00-0.19 : demande explicite d'un flow/tool/status/product ou priorite runtime.
```

Exemples :

```txt
"Je rentre du boulot, je suis videe, j'ai encore grignote."
-> normal_reply_fit_score ~= 0.80-0.88

"Je commande toujours n'importe quoi quand je suis fatiguee."
-> normal_reply_fit_score ~= 0.75-0.85

"Je veux juste discuter, pas un grand plan."
-> normal_reply_fit_score ~= 0.90-0.98

"Je crois que j'aurais besoin d'un truc pour me proteger a 16h."
-> normal_reply_fit_score ~= 0.50-0.65

"Prepare-moi une carte de defense pour 16h."
-> normal_reply_fit_score ~= 0.05-0.20
```

Les exemples servent au prompt du dispatcher IA. Ils ne doivent pas devenir des
regex, `includes()` ou guards metier.

Le runtime ne calcule jamais ce score depuis le texte brut. Il lit uniquement
`normal_reply_fit_score` et l'evidence structuree produites par le dispatcher
IA. Les exemples ci-dessus doivent donc etre compris comme calibration de
jugement pour le modele, pas comme une liste de triggers.

## Scores Numeriques Des Autres Signaux

Faire evoluer progressivement les signaux existants vers des scores numeriques :

```ts
flow_opportunity.score?: number;
tool_skill_intents[].score?: number;
skill_signals.entry[skill].score?: number;
```

Conserver temporairement les bandes existantes pour compatibilite et lisibilite
QA :

```ts
confidence_band?: "low" | "medium" | "high" | "critical";
```

Mapping compat si `score` absent :

```txt
low      -> 0.35
medium   -> 0.60
high     -> 0.82
critical -> 0.95
```

Le router doit preferer `score` quand il existe.

## Politique D'Arbitrage

Creer une couche dediee :

```txt
supabase/functions/sophia-brain/router/intervention_policy.ts
```

Responsabilite :

- ne pas relire semantiquement le message utilisateur ;
- ne pas router par mots-cles ;
- appliquer une politique deterministe sur des signaux deja structures par IA
  ou par le runtime.

Entree :

```ts
{
  turnFrame,
  skillRoute,
  toolSkillRoute,
  activeFlowArbitration,
  flowInterventionContext
}
```

Sortie :

```ts
{
  allowed: boolean;
  rawScore: number;
  adjustedScore: number;
  normalReplyFitScore: number;
  reasonCode: string;
  blockedPaths: RouteDecision["blocked_paths"];
}
```

Regle centrale :

```txt
normal_reply gagne par defaut.
Un signal concurrent doit battre normal_reply, pas seulement exister.
```

Comparaison V1 :

```txt
if safety high/critical:
  safety wins
else if explicit tool/status/product request:
  target flow can win with lower threshold
else if adjusted_signal_score > normal_reply_fit_score + margin:
  target flow/skill wins
else:
  normal_reply wins
```

Marge V1 :

```txt
implicit flow margin: 0.15-0.20
conversation skill margin: 0.08-0.12
explicit request margin: not required, use explicit threshold
```

## Seuils Initiaux

Proposition V1 :

```txt
safety high/critical:
  always wins

pending confirmation claire:
  allowed

explicit tool/status/product:
  allowed if score >= 0.70

emotional_repair / demotivation_repair strong:
  allowed if score >= 0.80
  or if score beats normal_reply_fit_score by margin

implicit product/tool flow opportunity:
  allowed only if adjusted_score >= 0.88
  and adjusted_score > normal_reply_fit_score + 0.15

implicit flow after recent refusal:
  blocked unless explicit request
```

Important :

```txt
un flow implicite doit prouver qu'il merite d'interrompre.
```

Pas :

```txt
si une opportunity existe, proposer le flow.
```

## Flow Recency / Frequence D'Intervention

Ajouter un contexte runtime non semantique :

```ts
flow_intervention_context: {
  last_flow_target: string | null;
  turns_since_last_flow_offer: number | null;
  turns_since_last_flow_entry: number | null;
  turns_since_last_flow_decline: number | null;
  recent_flow_offer_count: number;
}
```

Ce contexte vient du runtime, des traces, de l'etat actif ou d'un ledger leger.
Il ne doit pas etre invente par le LLM.

Evenements a tracer :

- `flow_opportunity_offered`
- `flow_entered`
- `flow_declined`
- `flow_deferred`
- `flow_cancelled`
- `flow_completed`
- `flow_exit_to_global`

Effet recherche :

```txt
Sophia ne repropose pas un flow implicite juste apres l'avoir propose,
apres un refus, ou juste apres un autre flow non-normal.
```

## Adjusted Score

Pour les opportunities implicites :

```ts
adjusted_score =
  raw_score
  - normal_reply_fit_penalty
  - recent_flow_offer_penalty
  - recent_decline_penalty
  - recent_non_normal_flow_penalty
  - repeated_offer_penalty
```

Valeurs V1 :

```txt
normal_reply_fit_score >= 0.75      -> -0.20 to -0.30
same flow offered <= 3 turns        -> -0.20
same flow declined <= 6 turns       -> -0.35
any non-normal flow entered <= 2 turns -> -0.15
recent_flow_offer_count >= 2 in 8 turns -> -0.15
```

Exemple :

```txt
prepare_defense_card raw score: 0.82
normal_reply_fit_score: 0.88        -> -0.25
same flow offered 2 turns ago       -> -0.20
user declined/deferred recently     -> -0.35

adjusted_score = 0.02
normal_reply wins
```

Demande explicite :

```txt
"prepare-moi une carte de defense pour 16h"
```

Dans ce cas :

- `explicitness=explicit` ;
- seuil plus bas ;
- malus de recence attenues ou ignores ;
- le flow passe sauf safety ou conflit runtime plus prioritaire.

## Blocked Paths Auditables

Ne jamais supprimer silencieusement un signal.

Quand une opportunity est bloquee :

```ts
blocked_paths.push({
  path: "flow_opportunity.prepare_defense_card",
  reason_code: "normal_reply_fit_dominates",
  raw_score: 0.82,
  adjusted_score: 0.32,
  normal_reply_fit_score: 0.88
});
```

But QA :

- Sophia a vu l'opportunite ;
- Sophia a choisi de ne pas intervenir ;
- la decision est auditable ;
- le systeme reste intelligent sans etre lourd.

## Emotional Repair Et Demotivation Repair

Ces skills ne doivent pas etre traites comme des tools produit.

Politique :

```txt
decouragement leger + normal_reply_fit fort
-> normal_reply intelligent

decouragement marque, boucle d'echec, auto-attaque, honte forte
-> demotivation_repair ou emotional_repair

demande explicite d'accompagnement emotionnel/motivationnel
-> skill

safety high/critical
-> safety
```

Le role de `normal_reply` :

- soutien leger ;
- micro-aide concrete ;
- conversation simple ;
- petite culpabilite ;
- fatigue ordinaire ;
- reponse courte non moralisante.

Le role des skills :

- intensite plus forte ;
- pattern repetitif ;
- besoin multi-turn ;
- vulnerabilite emotionnelle marquee ;
- sortie de boucle ou reparation specialisee.

Seuils V1 :

```txt
demotivation implicit < 0.80 + normal_reply_fit high
-> normal_reply

demotivation >= 0.80
-> demotivation_repair if it beats normal_reply by margin

emotional >= 0.78
-> emotional_repair if it beats normal_reply by margin

emotional acute / safety-adjacent
-> emotional_repair or safety according to risk
```

## Flow Opportunity Verification

Corriger le comportement collant.

Cas semantiques a reconnaitre par le dispatcher local IA, pas par regex :

- refus ou report de l'opportunity ;
- demande de rester dans une conversation simple ;
- demande d'aide concrete immediate sans outil ;
- changement de sujet ;
- correction vers un autre owner explicite.

Sortie attendue :

- `decline_opportunity` ou `defer_flow` ;
- fermeture ou suspension du flow local ;
- aucun lancement du target flow ;
- event `flow_declined` ou `flow_deferred` ;
- pas de reproposition immediate.

Si le meme message contient a la fois un refus/report de l'opportunity et un
besoin concret immediat :

Alors :

- fermer/suspendre l'opportunity ;
- `exit_to_global_dispatcher` ;
- `same_user_message_should_be_reprocessed=true` si le runtime le supporte ;
- note compacte vers le global ;
- `normal_reply` peut repondre au besoin concret.

## Normal Reply Prompt

Renforcer le contrat de `normal_reply`.

`normal_reply` doit etre intelligent, pas un fallback pauvre.

Il doit savoir :

- soutenir legerement ;
- donner une micro-aide concrete ;
- rester court ;
- ne pas moraliser ;
- ne pas proposer un outil par defaut ;
- ne pas faire un plan complet ;
- ne pas reproposer un flow qui vient d'etre bloque.

Contexte utile a injecter :

- `normal_reply_fit_score` ;
- `blocked_paths` lisibles ;
- eventuelle contrainte : "un flow implicite a ete bloque par politique
  d'intervention, ne le repropose pas dans le visible".

## Demotivation Grounding

Chantier separe mais lie au run 20 tours.

Objectif :

Eviter que `demotivation_repair` reponde depuis un sous-mode generique de
demarrage de tache quand le contexte est nourriture / grignotage.

Ajouter au contexte structure du skill :

```ts
life_domain?: "food_snacking" | "work_task" | "body_energy" | "relationship" | "unclear";
current_focus?: string;
support_mode?: "risk_window_support" | "post_slip_repair" | "energy_stabilization" | "smaller_step";
```

Invariant :

```txt
si life_domain=food_snacking:
  la reponse visible reste ancree dans faim, grignotage, repas, biscuits,
  commande, culpabilite ou fenetre de risque.
```

Pas de regex. C'est une sortie structuree du dispatcher local + prompt visible
stage-specific + tests d'invariant.

## Integration Router

Ordre cible :

```txt
dispatcher IA -> TurnFrame scoré
runSkillRouter
runToolSkillRouter
runActiveFlowArbitrator
runInterventionPolicy
RouteDecision finale
```

`run.ts` orchestre. Il ne doit pas devenir l'owner de cette logique.

La politique doit vivre dans le router ou un module appele par le router.

## Tests Unitaires

Router :

1. `normal_reply_fit_high_blocks_implicit_defense_card`
2. `normal_reply_fit_high_allows_explicit_defense_card`
3. `recent_decline_blocks_same_flow_opportunity`
4. `recent_flow_offer_penalizes_new_implicit_flow`
5. `light_demotivation_stays_normal_reply`
6. `strong_demotivation_routes_skill`
7. `strong_emotional_routes_skill`
8. `safety_critical_overrides_normal_reply_fit`

Flow opportunity :

1. refus ferme ferme le flow ;
2. `pas maintenant` suspend ;
3. `parle-moi simplement` sort vers global ;
4. `oui prepare la carte` lance le target flow ;
5. refus recent alimente `flow_intervention_context`.

Demotivation :

1. contexte nourriture reste nourriture ;
2. recap final grounded sur dernier sujet ;
3. faim/stress non binaire ;
4. pas de reponse action-start quand `life_domain=food_snacking`.

## QA Reelle

Apres implementation :

1. Rerun court T1-T5 du run source.
2. Rerun complet 20 tours.

Critères attendus :

- T2-T5 ne passent plus en `tool_skill` ;
- `blocked_paths` montre l'opportunity carte bloquee ;
- reponse simple concrete des T2/T3 ;
- pas de reproposition de carte apres refus ;
- T9/T19 restent sur grignotage / biscuits ;
- aucun effet durable ;
- latence documentee si elle reste elevee.

## Ordre D'Implementation

1. Ajouter `normal_reply_fit_score` et evidence au contrat `TurnFrame`.
2. Mettre a jour le prompt dispatcher pour produire ce score avec prior haut
   pour conversation humaine ordinaire.
3. Ajouter support numerique compat pour scores de signaux.
4. Creer `intervention_policy.ts`.
5. Brancher la policy dans `routers.ts`.
6. Ajouter `blocked_paths` riches pour opportunities bloquees.
7. Ajouter `flow_intervention_context` minimal.
8. Corriger `flow_opportunity_verification` sur refus/defer/sortie.
9. Ajouter tests router + flow opportunity.
10. Rerun court T1-T5.
11. Corriger grounding `demotivation_repair`.
12. Ajouter tests demotivation.
13. Rerun complet 20 tours.

## Interdits

- Pas de `message.includes(...)` metier.
- Pas de regex metier.
- Pas de liste de phrases utilisee comme triggers de routing.
- Pas de calcul deterministe de `normal_reply_fit_score` depuis le texte brut.
- Pas de detection deterministe du refus/defer d'un flow depuis le texte brut.
- Pas de patch visible phrase par phrase.
- Pas de suppression silencieuse des opportunities.
- Pas de logique d'arbitrage dans `run.ts` si le router peut la posseder.
- Pas de seuils bas pour flow implicite.

## Phrase De Synthese

```txt
Sophia doit detecter beaucoup de choses, mais normal_reply reste l'owner naturel.
Un flow implicite ne part que s'il bat vraiment une conversation normale
intelligente, en tenant compte du moment, de la frequence et des refus recents.
```
