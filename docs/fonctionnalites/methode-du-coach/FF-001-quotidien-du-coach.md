# FF-001 · Le quotidien du coach

| | |
|---|---|
| **Identifiant** | `FF-001-quotidien-du-coach` |
| **Statut** | 🟡 Spécifiée — non construite |
| **Date** | 2026-08-07 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) (1:N, aucun canal 1:1) · [CONTRACT.md](../../keel/CONTRACT.md) (planchers) · [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) §7.5 (conseil, pas surveillance) |
| **Dépend de** | `keel-daily-pulse-v1` · `daily_recap_io.ts` · `restriction_guard.ts` · `doctrine.ts` · `student_age.ts` |
| **Effort estimé** | 2 à 3 jours |

---

## 1. Le problème

La doctrine dit comment **composer** — convictions, interdits, arbitrages,
aliments. Elle ne dit nulle part quoi **faire tous les jours**.

Ce sont deux objets différents. « Protéine à chaque repas » est une règle de
composition : elle gouverne un plat. « Quatre verres d'eau » est une pratique :
elle gouverne une journée, et aucun plat ne la porte. Un coach qui veut
transmettre la seconde n'a aujourd'hui aucun endroit où l'écrire.

**Ce que ça coûte.** Le coach paie pour être présent en son absence. La moitié
de ce qu'il répète en vrai — les gestes quotidiens — n'existe pas dans le
produit, donc l'élève ne l'entend jamais. Et le message du soir, qui est le seul
rendez-vous quotidien, ne porte rien de lui.

## 2. Job stories

> **Quand** j'écris ma méthode pour ma cohorte, **je veux** pouvoir noter les
> gestes quotidiens que je répète à tous mes élèves, **pour que** l'agent les
> porte à ma place tous les soirs.

> **Quand** je reçois mon message du soir, **je veux** entendre une chose
> concrète de mon coach, **pour que** l'app me donne quelque chose avant de me
> demander quoi que ce soit.

> **Quand** je suis suivi pour une prise de masse, **je ne veux pas** recevoir
> un conseil écrit pour quelqu'un qui perd du gras, **pour que** ce que je lis
> me concerne vraiment.

## 3. Périmètre

### Dans le périmètre
- Une section « pratiques quotidiennes » sur la doctrine, versionnée et publiée
  avec elle
- Un appel IA de **classification** à la validation de chaque pratique, dont le
  verdict est montré au coach et corrigeable
- L'injection d'**une** pratique par soir dans le message qui part déjà
- L'alternance rappel / question
- La portée par objectif, réutilisant `DoctrineBelief.goalScope`

### Hors périmètre — engageant
- ❌ **Aucun nouveau cron.** `keel-daily-pulse-v1` tourne déjà toutes les heures
  et vise la fenêtre 20h–22h locale de chaque élève.
- ❌ **Aucun second message le soir.** L'en-tête de `daily_pulse.ts` le dit :
  « deux messages seraient deux notifications, c'est-à-dire le problème qu'on
  répare, doublé ».
- ❌ **Aucun second appel modèle.** `composeRecapBody` fait déjà un appel Gemini
  avec sa ceinture et son repli déterministe. Deux appels = deux voix dans une
  bulle, et le double du coût par élève et par soir.
- ❌ **Aucune série, aucun score, aucun « tu as raté 3 jours ».**
- ❌ **Aucune coche automatique.** Une pratique est déclarée ou inconnue, jamais
  inférée.
- ❌ **Aucune pratique par élève.** C'est du 1:N : la pratique vaut pour la
  cohorte, éventuellement restreinte par objectif. Un canal 1:1 est interdit par
  [MODEL.md](../../keel/MODEL.md).
- ❌ **Aucun refus fondé sur la méthode.** Voir R8.

## 4. Le circuit

```
┌─ LE COACH ────────────────────────────────────────────────┐
│ 1. il tape une pratique en clair                          │
│ 2. il valide                                              │
│ 3. UN appel IA classifie et rédige le brief               │
│ 4. il VOIT le verdict et peut le corriger                 │
│ 5. publié avec la doctrine                                │
└───────────────────────────────────────────────────────────┘
                          ↓
┌─ LE SOIR — cron existant, aucune addition ────────────────┐
│ 6. le pulse décide s'il pose SA question                  │
│    (PULSE_ASK_INTERVAL_DAYS = 3)                          │
│ 7. une pratique est choisie — rotation pondérée, sans état│
│ 8. mode = QUESTION si le pulse ne demande rien            │
│           RAPPEL   sinon                                  │
│ 9. le brief entre dans l'appel Gemini QUI A DÉJÀ LIEU     │
│ 10. UN message part                                       │
└───────────────────────────────────────────────────────────┘
```

**Pourquoi il n'y a pas de conflit de priorité.** Le message du soir est
quotidien, la **question** ne l'est pas : `PULSE_ASK_INTERVAL_DAYS = 3`,
`PULSE_ASK_INTERVAL_WHEN_HARD = 1`, et recul à 7 jours après
`PULSE_IGNORED_STREAK = 2` questions ignorées. Deux soirs sur trois, le pulse ne
demande rien — c'est là que se loge la question de pratique. L'alternance tombe
d'une décision qui existe déjà, au lieu d'inventer une seconde cadence capable
d'entrer en collision avec la première.

## 5. Modèle de données

Colonne `daily_practices jsonb` sur `coach_doctrines` — donc versionnée et
publiée avec le reste de la méthode.

| Champ | Origine | Note |
|---|---|---|
| `label` | coach, **verbatim** | jamais réécrit par un modèle |
| `kind` | classifié | hydratation · mouvement · sommeil · état subjectif · complément · timing de repas · autre |
| `quantified` · `target` · `unit` | classifié | « 4 », « verres » |
| `goal_scope[]` | classifié, **corrigeable** | vide = tout le monde. Même sémantique et même filtre que `DoctrineBelief.goalScope` / `goalScopeApplies` |
| `cadence` | classifié | `constant` (revient souvent) \| `rotating` (chacun son tour) |
| `askable` | classifié | certaines ne deviennent jamais une question |
| `minor_safe` | classifié | |
| `brief` | classifié | le **mini-prompt**, pas une phrase figée |
| `status` | dérivé | `active` \| `remind_only` \| `needs_review` \| `blocked` |

**Pourquoi un brief et pas deux phrases toutes faites.** Une phrase figée
redonne exactement la répétition qu'on cherche à éviter. Le brief instruit ; la
phrase est générée le soir même, dans le même appel que le fait de la journée.

**Pourquoi la classification est stockée et pas recalculée.** Un appel par
pratique **à vie** au lieu d'un par élève et par soir. Et surtout : le coach
voit ce qui a été compris et peut le reprendre — même patron que
`coach_food_proposals` et son `why_source`.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Une seule pratique par soir | 7 pratiques × 7 soirs = un bulletin, pas un message |
| **R2** | Plafond de **7 pratiques** par doctrine | au-delà, le coach ne peut plus prédire ce que sa cohorte reçoit, et la rotation devient illisible |
| **R3** | La question de pratique ne part **que** les soirs où le pulse ne demande rien | sinon deux questions dans une bulle. Voir §4 |
| **R4** | Plancher TCA levé ⇒ **plus aucune question**, le rappel survit | « as-tu bu tes 4 verres ? » est un `compliance_reminder`, **déjà** listé dans `SUPPRESSED_STUDENT_SURFACES` |
| **R5** | Mineur ⇒ `minor_safe` seulement, et **jamais le chiffre** | registre éducatif, jamais correctif sur le corps ([PIVOT-FOYER §8.4](../../keel/PIVOT-FOYER.md)) |
| **R6** | Rotation **sans état** : `(jour + empreinte élève) % n`, pondérée par `cadence` | la cohorte n'est pas au garde-à-vous, et aucun élève ne reste piégé sur la même pratique un jour de semaine donné |
| **R7** | `needs_review` ou `blocked` ⇒ la pratique **ne part pas** | une pratique mal comprise produirait une phrase imprévisible dans la voix du coach |
| **R8** | On ne refuse **jamais** une pratique sur la méthode | ce produit vend la méthode du coach, pas la nôtre. « Jeûne jusqu'à midi » se **restreint par objectif**, il ne se refuse pas |
| **R9** | On bloque **uniquement** en collision avec une ceinture existante, **et on la nomme** | « pèse-toi tous les matins » contredit `weight_readout`, que le plancher TCA suspend déjà. Ce n'est pas un avis, c'est une incohérence interne — et le coach doit lire laquelle |
| **R10** | Le `target` d'une pratique rejoint `allowedNumbers` de la ceinture de sortie | sinon `acceptComposedRecap` rejettera les messages **corrects**, et on perdra la voix du coach sur un faux positif |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| L'appel de classification échoue | `needs_review`. La pratique est **stockée** (le coach ne perd pas sa saisie) et l'écran le montre |
| La classification rend une forme illisible | idem `needs_review` — jamais un défaut deviné |
| Le modèle du soir échoue | repli déterministe existant. **On perd la voix, jamais l'information** |
| La ceinture de sortie refuse le message | idem : repli déterministe, et le motif est compté |
| Aucune pratique active | le message du soir est **exactement** celui d'aujourd'hui. Aucune ligne vide, aucun « rien pour toi ce soir » |
| Toutes les pratiques hors portée pour cet élève | idem |
| Le coach édite une pratique déjà publiée | reclassification, retour en `needs_review` jusqu'à revue |
| Le coach supprime la dernière pratique | pas d'erreur : on retombe sur le message d'aujourd'hui |

## 8. Critères d'acceptation

```gherkin
Étant donné un coach avec 3 pratiques actives
Quand un élève reçoit son message du soir
Alors exactement UNE pratique y figure
Et le message n'a déclenché qu'UN appel modèle

Étant donné que le pulse pose sa question ce soir
Quand une pratique est sélectionnée
Alors elle est en mode RAPPEL, jamais en mode QUESTION

Étant donné un élève dont le plancher TCA est levé
Quand une pratique est sélectionnée
Alors elle est en mode RAPPEL, même si le pulse ne demande rien

Étant donné une pratique quantifiée « 4 verres d'eau »
Quand elle est destinée à un élève mineur
Alors le chiffre n'apparaît pas dans le message

Étant donné une pratique de portée ["fat_loss"]
Quand l'élève est en muscle_gain
Alors elle n'est jamais sélectionnée pour lui

Étant donné une pratique en needs_review
Quand le soir arrive
Alors elle n'est jamais sélectionnée

Étant donné 7 pratiques et 7 soirs consécutifs
Quand on observe un même élève
Alors chaque pratique apparaît au moins une fois

Étant donné deux élèves du même coach le même soir
Quand on compare leurs messages
Alors ils ne portent pas systématiquement la même pratique

Étant donné une pratique « pèse-toi tous les matins »
Quand le coach la valide
Alors le statut est `blocked`
Et le motif nomme la ceinture en conflit
```

## 9. Rabbit holes

- **La classification qui devient un jugement.** Le classifieur propose une
  portée et un brief ; il n'arbitre pas si le coach a raison. La frontière se
  tient dans le prompt et se pinne par un test — sans quoi on aura reconstruit
  un avis maison déguisé en analyse.
- **La ceinture de sortie et les nombres.** `acceptComposedRecap` n'autorise que
  les nombres qu'elle peut justifier (`allowedNumbers`). Un `target` de pratique
  est un nombre neuf : l'oublier fera rejeter des messages parfaitement corrects,
  et le symptôme sera « la voix du coach a disparu », pas « un nombre a été
  refusé ».
- **Le coût.** Un appel par pratique et par coach, à vie. Ni par élève, ni par
  soir. Toute conception qui dérive vers un appel par envoi est à rejeter.
- **La tentation du score.** Dès qu'une question existe, quelqu'un voudra
  compter les réponses. C'est le glissement exact que le plancher TCA existe
  pour empêcher (`streak_display`, `adherence_score`).

## 10. Ce qu'on mesure

- Part des messages du soir portant une pratique
- Répartition rappel / question
- Pratiques en `needs_review` depuis plus de 7 jours — signal que le coach ne
  voit pas son écran
- Pratiques `blocked`, et lesquelles : si un motif revient sans cesse, c'est la
  ceinture ou la copie de l'écran qu'il faut revoir, pas les coachs

**Contre-mesure.** Taux de réponse au pulse **avant** et **après**. Si l'ajout
d'une pratique fait baisser la réponse à la question du pulse, la fonctionnalité
coûte plus qu'elle ne rapporte : elle prend la place d'une mesure qui alimente
la page du lundi du coach.

## 11. Questions ouvertes

- Le coach voit-il ce que sa cohorte a reçu hier soir ? (transparence utile
  contre bruit sur un écran déjà chargé)
- Une pratique peut-elle être **suspendue** temporairement sans être supprimée ?
  (le coach part en congés, ou teste une saison)
- Les pratiques valent-elles aussi pour un **foyer** sans coach, servies par la
  méthode de la maison ? La délégation existe déjà
  (`doctrine_delegation.ts`) — la question est produit, pas technique.
