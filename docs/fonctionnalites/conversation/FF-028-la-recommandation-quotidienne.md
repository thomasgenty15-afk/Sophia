# FF-028 · La recommandation quotidienne

| | |
|---|---|
| **Identifiant** | `FF-028-la-recommandation-quotidienne` |
| **Statut** | 🔴 **Abandonnée le 2026-09-01** — décision humaine : *il n'y a pas de recommandation en plein milieu de plan*. Le [retour de fin de plan](../composition-des-repas/FF-054-le-retour-de-fin-de-plan.md) corrige le plan **suivant**, ce qui est le seul moment où une correction ne demande à personne de comprendre un changement en cours de route. ⚠️ **`keel-daily-recommendation-v1` porte aussi `runWeightDivergenceStep`** : [FF-056](FF-056-la-divergence-constatee.md) doit devenir autonome **avant** le retrait, sinon la divergence cesse en silence. Inventaire des canaux : [FF-062](FF-062-quand-sophia-parle-la-premiere.md) |
| **Date** | 2026-08-08 |
| **Autorité produit** | la direction du domaine ([README](README.md)) T1, T4, T6 · [CONTRACT.md](../../keel/CONTRACT.md) · la doctrine du coach (elle **gate** le moteur) |
| **Dépend de** | [FF-027](FF-027-la-faim-branchee-au-plan.md) (le signal) · [FF-026](FF-026-la-preference-captee.md) (les préférences) · [FF-029](FF-029-les-pratiques-quotidiennes.md) (l'adhérence aux pratiques) · le patron batch du memorizer · les boutons déterministes du tap (`interactive_id`) |
| **Effort estimé** | 3 jours (V1) |

---

## 1. Le problème

Les signaux existent — la faim, les préférences, les pratiques suivies ou non —
et personne ne **propose** rien. C'est à la personne de s'analyser elle-même
(« j'ai faim le matin… je devrais peut-être ajouter un petit-déj ? »), puis de
trouver l'écran, puis de le faire. C'est exactement la charge mentale que le
produit promet d'enlever.

Un vrai coach fait l'inverse : il observe les données et propose un ajustement.
Il ne fait pas remplir des questionnaires. Le produit peut faire pareil — à
condition que ça coûte à la personne **un tap**, pas une conversation.

**Ce que ça coûte de ne pas le faire.** Les signaux qu'on collecte (FF-027,
FF-029) restent des constats. Quelqu'un qui a faim avec deux repas par jour
continue d'avoir faim jusqu'à ce qu'il craque — alors que la proposition
(« on ajoute un vrai petit-déjeuner ? ») était calculable depuis une semaine.

## 2. Job stories

> **Quand** mes données montrent un problème récurrent, **je veux** qu'on me
> propose la solution, **pour que** je n'aie pas à m'auto-coacher.

> **Quand** on me propose un changement, **je veux** dire oui ou non d'un tap,
> **pour que** accepter ne devienne pas un projet.

> **Quand** je dis oui, **je veux** que ce soit fait, **pour que** je n'aie pas
> à vérifier derrière.

## 3. Périmètre

### Dans le périmètre (V1)

- **Une analyse par jour et par personne active**, en batch de fin de journée —
  le patron du memorizer. Elle lit : les signaux de faim (FF-027), les
  préférences (FF-026), l'adhérence aux pratiques (FF-029), le rythme
  alimentaire, et **l'état du plan** (ce qui est influençable).
- **Au plus UNE recommandation**, délivrée dans le fil avec deux boutons
  (accepter / refuser) au payload **déterministe** — le patron exact du tap du
  soir (`interactive_id`).
- **Accepter applique automatiquement**, en V1 : une **directive durable**
  (changement de rythme — ajouter un petit-déjeuner ; une préférence de
  structure — une collation l'après-midi) que **la prochaine composition**
  consomme. Aucune chirurgie du plan en cours.
- **Refuser est respecté** : la même recommandation ne revient pas avant un
  délai de refroidissement long.

### Hors périmètre — engageant

- ❌ **V2 (modifications additives en cours de semaine — une collation sans
  cuisson) et V3 (re-planification des jours restants en respectant les
  cuissons faites)** : chantiers séparés, chacun avec sa fiche le moment venu.
  La cascade plan-courses-cuissons en milieu de semaine est l'endroit exact où
  l'état devient incohérent.
- ❌ **Sous plancher de restriction, le moteur est MUET.** Un moteur de
  recommandation alimentaire pointé sur quelqu'un qui restreint est le risque
  catégorie 1 en une phrase. Pas de recommandation réduite, pas d'exception
  « protectrice » : muet.
- ❌ **Jamais un chiffre.** « Un petit-déjeuner rassasiant » — jamais « 350
  kcal le matin ». La formulation parle aliments et structure.
- ❌ **Jamais « moins ».** Comme FF-027 : aucune recommandation ne réduit la
  nourriture. Les directions possibles sont structurelles (ajouter, déplacer,
  remplacer) — jamais restrictives.
- ❌ **La doctrine gate le moteur.** Un coach qui prescrit le jeûne du matin :
  ses élèves ne reçoivent **jamais** « on ajoute un petit-déjeuner ? ». La
  recommandation propose **dans le cadre** de la méthode, ou se tait.
- ❌ **Pas de seconde demande.** La recommandation consomme le budget partagé
  « une demande par jour » (T4 du [README](README.md)) — s'il est pris, elle attend demain.

## 4. Le circuit

```
   FIN DE JOURNÉE — batch (patron memorizer)
                │
                ▼
   ┌──────────────────────────────────────────────────┐
   │ ANALYSE                                          │
   │  entrées : faim (fenêtre) · préférences ·        │
   │  pratiques · rythme · ÉTAT DU PLAN               │
   │  l'espace d'action est PRÉ-CALCULÉ,              │
   │  déterministe : le modèle choisit DEDANS,        │
   │  il n'invente pas d'action                       │
   └──────────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────────────┐
   │ GATES — dans cet ordre                           │
   │  restriction_flag levé      → MUET               │
   │  doctrine (cadre du coach)  → filtre les actions │
   │  budget demande du jour pris→ demain             │
   │  cooldown de refus actif    → demain             │
   │  rien de significatif       → RIEN (cas nominal) │
   └──────────────────────────────────────────────────┘
                │ une proposition
                ▼
   le fil : « Tu as eu faim 4 soirs cette semaine.
   On ajoute un vrai petit-déjeuner ? »   [Oui] [Non]
                │
      ┌─────────┴──────────┐
      ▼                    ▼
   [Oui] payload         [Non]
   déterministe            │
      │                    ▼
      ▼                cooldown long,
   directive durable   on n'en reparle pas
   écrite, RELUE
   (vérité d'exécution)
      │
      ▼
   la PROCHAINE composition la consomme
   → le plan suivant a un petit-déjeuner
```

**Les deux points qui gouvernent le dessin** : l'espace d'action est
**pré-calculé déterministiquement** (le modèle choisit dedans, il ne peut pas
proposer une action qui n'existe pas) ; et l'acceptation suit la **vérité
d'exécution** du dépôt — le payload du bouton EST l'action, l'écriture est
relue, jamais d'accusé sans ligne.

## 5. Modèle de données

| Donnée | Origine |
|---|---|
| la recommandation proposée | **dérivée** chaque soir ; stockée avec son état (`proposed` / `accepted` / `declined` / `expired`), son action déterministe et **l'empreinte du plan** au moment de la proposition |
| la directive durable (si oui) | écrite par l'acceptation, relue, consommée par le générateur |
| le cooldown de refus | dérivé de l'état `declined` + date |

L'**empreinte du plan** est ce qui rend la proposition périssable : si le plan
a changé entre la proposition et le tap, l'action ne s'applique **pas** — une
recommandation calculée sur un état disparu est un bug, pas une commodité.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Une analyse par jour, en batch — jamais par tour | le coût est borné et le moment est le bon : l'analyse voit la journée entière |
| **R2** | Au plus une recommandation, et « rien » est le cas nominal | un moteur qui propose tous les jours devient du bruit en une semaine |
| **R3** | L'espace d'action est pré-calculé, le modèle choisit dedans | un LLM qui invente une action produit des actions inapplicables — le patron de tout le dépôt |
| **R4** | Muet sous `restriction_flag` | catégorie 1 ; par construction, pas par consigne |
| **R5** | La doctrine filtre les actions **avant** le choix | proposer un petit-déj aux élèves d'un coach jeûne = le produit contredit le coach chez ses propres élèves |
| **R6** | Jamais un chiffre, jamais « moins » | contrat + direction sûre, comme FF-027 |
| **R7** | Le oui applique par vérité d'exécution ; la proposition expire avec le plan | un « c'est fait » sans ligne relue est l'accusé fantôme ; une action sur un plan disparu est pire |
| **R8** | Le non est respecté — cooldown long | re-proposer, c'est solliciter avec des boutons |
| **R9** | Consomme le budget « une demande par jour » | T4 du [README](README.md) — un seul compteur |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Rien de significatif dans les données | **aucun message** — le silence est le cas nominal, pas un échec du moteur |
| Le plan a changé entre proposition et tap | l'action ne s'applique pas ; la personne en est informée d'une phrase |
| Double tap / tap rejoué | idempotent — une seule application |
| Le batch tombe | pas de recommandation ce soir, personne ne le remarque ; le batch se rattrape demain, il ne « rattrape » pas les propositions manquées |
| Le modèle propose hors espace d'action | impossible par construction (R3) — le choix est validé contre l'espace, un choix invalide = pas de proposition |
| Acceptée mais la composition suivante l'ignore | le zéro de la boucle — mesuré en §10, c'est LE red |

## 8. Critères d'acceptation

```gherkin
Étant donné une faim récurrente et un rythme à deux repas
Quand l'analyse du soir tourne
Alors au plus une recommandation part, avec deux boutons

Étant donné un tap sur « Oui »
Quand la prochaine semaine est composée
Alors elle porte le changement accepté
Et la directive écrite a été relue avant d'être confirmée

Étant donné un tap sur « Non »
Quand les soirs suivants arrivent
Alors la même recommandation ne revient pas avant le cooldown

Étant donné un élève d'un coach dont la doctrine prescrit le jeûne du matin
Quand l'analyse trouve une faim matinale
Alors AUCUNE recommandation de petit-déjeuner ne part

Étant donné un élève sous plancher de restriction
Quand l'analyse tourne
Alors elle ne produit rien — muette

Étant donné un plan modifié entre la proposition et le tap « Oui »
Quand le tap arrive
Alors rien ne s'applique, et la personne le sait en une phrase

Étant donné une journée sans signal notable
Quand l'analyse tourne
Alors aucun message ne part

Étant donné une question de précision déjà posée ce jour
Quand l'analyse veut proposer
Alors elle attend demain — le budget est partagé
```

## 9. Rabbit holes

- **Le moteur bavard.** La tentation permanente : baisser le seuil de
  « significatif » pour que le moteur « vive ». En une semaine c'est du bruit,
  en deux c'est ignoré, en trois c'est coupé. « Rien » est le cas nominal.
- **La chirurgie de mi-semaine.** V2/V3 sont hors périmètre **exprès** — la
  cascade recettes-cuissons-courses est l'endroit où un état devient
  incohérent sans erreur visible. Ne pas l'ouvrir « juste pour une collation ».
- **Le coaching de vie qui revient.** « Tu sembles stressé, veux-tu une
  routine de respiration ? » — non. Le moteur ne propose que ce qui change le
  **plan alimentaire** ou applique une **pratique prescrite**. [README](README.md), hors
  périmètre.
- **L'espace d'action qui grossit.** Chaque action ajoutée (déplacer un repas,
  changer une portion…) multiplie les états à valider. V1 = deux familles
  d'action (rythme, structure de collation), fermées, testées une à une.

## 10. Ce qu'on mesure

- Taux d'acceptation (LA mesure : un moteur juste est accepté ; sous ~30 %, il
  propose mal ou trop)
- Boucles complètes : acceptée → visible dans la composition suivante (zéro
  écart toléré)
- Part des soirs **sans** recommandation (attendu : majoritaire)
- La donnée d'origine s'améliore-t-elle (la faim baisse après un petit-déj
  accepté) — c'est la preuve finale que le moteur sert

**Contre-mesure.** Le taux de refus consécutifs et les coupures de
notifications. Un moteur refusé trois fois de suite par la même personne doit
se taire durablement de lui-même — sinon c'est de la sollicitation avec des
boutons, et elle détruit aussi la confiance dans le reste du fil.

## 11. Questions ouvertes

- Les deux familles d'action V1 exactes (rythme des repas ; collation de
  structure) — à valider contre ce que `student_goals` et le générateur savent
  réellement appliquer aujourd'hui.
- Le cooldown de refus : 14 jours ? 30 ? Par recommandation ou global ?
- En B2B, le coach voit-il les recommandations proposées à ses élèves et leurs
  réponses ? (Plaide pour oui — c'est de la matière de synthèse — mais non
  tranché.)
- La surface de livraison exacte : le fil du chat, ou le message du soir
  existant qui la porte comme il porte la pratique ? (Un seul message par soir
  reste la règle.)
