# FF-016 · La question d'alimentation

| | |
|---|---|
| **Identifiant** | `FF-016-la-question-d-alimentation` (anciennement `FF-016-la-question-de-plan` — même fiche, périmètre élargi le 2026-08-08) |
| **Statut** | 🟠 En cours — la substitution est livrée ; la réponse générale ignore les aliments **recommandés** |
| **Date** | 2026-08-08 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) · [MODEL.md](../../keel/MODEL.md) |
| **Code** | `sophia-brain/skills/plan_question/` (swap) · `sophia-brain/agents/companion.ts` + `run.ts::withKeelDoctrineBlock` (réponse générale) · `_shared/keel/protocol_compiler.ts::protocolFoodBlock` (les aliments, **pas encore branché au chat**) |
| **Effort estimé** | 1 jour (le branchement des recommandés) |

---

## 1. Le problème

C'est la raison n°1 d'ouvrir le chat : une question, devant le frigo, avec une
casserole qui attend. Deux formes :

**« Je peux mettre du riz à la place ? »** — la substitution. Le coach a déjà
répondu en réglant `autonomy` et `swap_policy` sur la ligne. Router ça vers un
modèle qui improvise ou vers une boîte de réception, c'est re-décider en une
semaine ce qui est déjà décidé — et *ça n'apprend pas à l'élève à attendre, ça
lui apprend à ne plus demander*.

**« Qu'est-ce que je devrais manger au petit-déj ? »** — la question générale.
Elle doit sortir dans le cadre de la méthode. Or aujourd'hui le chat connaît ce
que le coach **interdit** (le verrou mord dessus) mais **jamais ce qu'il
recommande** : `protocolFoodBlock` — les sections « reach for these first » /
« steers away » — n'a que deux appelants, les deux générateurs de repas. Zéro
dans `sophia-brain`.

**Ce que ça coûte.** Sophia peut recommander de bonne foi un aliment que la
méthode déconseille, ou ignorer celui qu'elle met en avant. La réponse est
plausible, polie — et elle contredit le plan que la même app a composé la
veille. C'est l'incohérence la plus visible qu'un utilisateur puisse rencontrer.

## 2. Job stories

> **Quand** il me manque l'ingrédient prévu, **je veux** savoir en deux secondes
> si mon remplacement passe, **pour que** je cuisine maintenant.

> **Quand** je demande quoi manger, **je veux** une réponse alignée avec mon
> plan et ma méthode, **pour que** l'app ne se contredise pas elle-même.

> **Quand** ma question sort du cadre prévu, **je veux** qu'elle arrive
> proprement au coach, **pour que** sa décision soit prise une fois.

## 3. Périmètre

### Dans le périmètre

- **Tier 0 déterministe** (livré) : `swap_resolver.ts` résout la substitution
  depuis `autonomy` + `swap_policy`, allergène **avant tout**, parité stricte
  avec l'évaluateur (`plan_question_test.ts` fait tourner les deux sur les
  mêmes entrées).
- **L'escalade** (livrée) : hors politique → brouillon pour le coach, jamais
  appliqué, jamais de promesse de délai (`no_coach_reply_promise_test.ts`).
- **La réponse générale sous doctrine** (livrée) : composeur + verrou
  déterministe sur le texte sortant, sur les trois chemins de sortie.
- **À construire — les aliments recommandés atteignent le chat** : un extrait
  borné de `protocolFoodBlock` entre dans le contexte du tour, pour que « je
  mange quoi ? » réponde d'abord avec ce que la méthode met en avant.

### Hors périmètre — engageant

- ❌ **La lane ne modifie pas le plan.** `effects` vide par construction ; la
  réponse ne prétend jamais que le plan a changé.
- ❌ **Pas de flow collant.** Une réponse fraîche à chaque question, aucun état.
- ❌ **Aucune promesse de réponse du coach.** Il n'existe aucun canal 1:1.
- ❌ **Aucun chiffre calorique.** La réponse parle aliments et satiété, jamais
  kcal.
- ❌ **Rien de décisif ne transite par le turn frame** — engagement, politique
  et contraintes arrivent par le contexte de skill, pas par un frame écrit par
  un LLM.

## 4. Le circuit

```
   « je peux mettre du riz à la place ? »        « je mange quoi au petit-déj ? »
                  │                                          │
                  ▼                                          ▼
     ┌───────────────────────────┐              ┌─────────────────────────────┐
     │ TIER 0 — PUR              │              │ CONTEXTE DU TOUR            │
     │ ① allergène → VETO DUR    │              │  doctrine (interdits) ✅    │
     │ ② groupe identique        │              │  aliments recommandés  🔴   │
     │ ③ strict → veto           │              │  ← LE BRANCHEMENT MANQUANT  │
     │ ④ allowed_groups          │              └─────────────────────────────┘
     │ ⑤ équivalence de classe   │                           │
     │ ⑥ sinon → escalade coach  │                           ▼
     └───────────────────────────┘                     le composeur
                  │                                          │
                  └──────────────────┬───────────────────────┘
                                     ▼
                     VERROU DE SORTIE (déterministe,
                     3 chemins, forbidden_matcher)
```

**L'invariant qui gouverne tout** : la parité avec l'évaluateur. Un « oui » de
Tier 0 que l'évaluateur note `missed` à 23 h 59 est pire que pas de Tier 0 —
l'élève a suivi la réponse et s'est fait sanctionner pour ça.

## 5. Modèle de données

**Néant en écriture** depuis la réponse. La lane rend la ligne à écrire ; le
runtime écrit et relit (vérité d'exécution). L'escalade est un brouillon dans
`contract_change_requests`.

Lectures : la ligne d'engagement du jour, `swap_policy`, `autonomy`,
`student_safety_constraints` — et, à brancher, le protocole compilé
(`loadPublishedProtocol` → extrait borné de `protocolFoodBlock`).

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | La sécurité passe avant la politique, y compris avant l'identité | une ligne du coach qui nomme un groupe contre lequel l'élève est contraint est un bug de données, et il sort en dur |
| **R2** | Parité stricte Tier 0 / évaluateur | un « oui » noté `missed` le soir détruit la confiance |
| **R3** | La réponse générale connaît les **recommandés**, pas seulement les interdits | sinon l'app se contredit elle-même — le générateur suit la méthode, le chat non |
| **R4** | La lane ne change rien et ne le prétend pas | l'accusé fantôme est le défaut le plus cher du dépôt |
| **R5** | Aucune promesse de réponse du coach | il n'existe aucun canal 1:1 (MODEL.md) |
| **R6** | Ce que le coach n'a pas tranché est **annoncé comme tel** | attribuer au coach une position qu'il n'a pas prise détruit ce qu'on vend |
| **R7** | Le bloc recommandés entre **borné** | le prompt tronque par la queue ; un protocole complet pousserait la doctrine dehors |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le canal runtime manque | la skill refuse bruyamment plutôt que de composer depuis un plan qu'elle n'a pas lu |
| Aucun engagement ouvert aujourd'hui | pas de Tier 0 ; la question repart au chemin général |
| Substitution hors politique | escalade en brouillon, l'élève l'apprend, sans promesse de délai |
| Allergène touché | veto dur, immédiat, avant tout |
| Pas de protocole publié | la réponse générale le dit et répond de ses connaissances — jamais au nom du coach |
| La question revient | réponse fraîche, aucun état conservé |

## 8. Critères d'acceptation

```gherkin
Étant donné une ligne avec autonomy='strict'
Quand l'élève demande une substitution autorisée par la policy
Alors la réponse est un refus — l'autonomie prime

Étant donné une substitution acceptée par Tier 0
Quand l'évaluateur note la journée le soir
Alors il ne la note pas `missed`

Étant donné un groupe médicalement contraint
Quand il est proposé en substitution
Alors le refus est dur et précède tout autre contrôle

Étant donné un protocole qui met en avant les œufs au petit-déjeuner
Quand l'élève demande « je mange quoi le matin ? »
Alors la réponse s'appuie d'abord sur ce que la méthode recommande

Étant donné un protocole qui déconseille un aliment
Quand l'élève demande s'il peut en manger
Alors la réponse ne le recommande pas — et ne l'interdit pas comme un allergène

Étant donné un sujet que le coach n'a pas tranché
Quand l'élève pose la question
Alors la réponse le dit, et répond en son nom propre
```

## 9. Rabbit holes

- **La dérive de parité.** Deux implémentations (permission a priori, notation
  a posteriori) tenues par un seul test croisé. Le supprimer est la fin de la
  lane.
- **Recommandé ≠ prescrit.** « Reach for these first » est une préférence de
  méthode, pas une contrainte. La restituer comme un interdit inversé (« tu
  DOIS manger des œufs ») serait de la prescription — le rubric
  `non_prescription` du juge existe pour ça.
- **Le bloc protocole entier dans le prompt.** Il est fait pour un générateur,
  pas pour un tour de chat. Extraire, borner, mesurer le budget avant/après.

## 10. Ce qu'on mesure

- Part des questions de substitution résolues en Tier 0
- Désaccords Tier 0 / évaluateur : zéro, tenu par un test
- Réponses générales **contredisant** le protocole (échantillon jugé) — le
  chiffre qui doit tomber à zéro une fois R3 branché

**Contre-mesure.** Le taux de refus. Une lane qui dit surtout non apprend aussi
à ne plus demander — plus lentement, mais sûrement.

## 11. Questions ouvertes

- La partie substitution transcrit du code livré, pinné par ses tests ; la
  partie « recommandés dans le chat » est **le manque mesuré** (deux appelants
  de `protocolFoodBlock`, zéro dans `sophia-brain`) — c'est le chantier de la
  fiche.
- L'escalade produit un brouillon ; rien ne notifie le coach qu'il en a un.
