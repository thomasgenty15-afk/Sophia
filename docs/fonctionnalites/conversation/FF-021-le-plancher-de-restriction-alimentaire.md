# FF-021 · Le plancher de restriction alimentaire

| | |
|---|---|
| **Identifiant** | `FF-021-le-plancher-de-restriction-alimentaire` |
| **Statut** | 🟢 Livrée |
| **Date** | 2026-08-07 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) · BUILD_PLAN W3.2 |
| **Code** | `_shared/keel/restriction_guard.ts` · `restriction_runtime.ts` · `sophia-brain/skills/disordered_eating_guard/` |
| **Effort estimé** | livrée |

---

## 1. Le problème

La boucle centrale de ce produit — **un plan alimentaire prescrit, un score
d'adhérence dérivé, un rappel quotidien** — est, verbatim, un risque de
catégorie 1 dans le rapport CDT/Stanford sur l'IA et les troubles alimentaires.
Le chatbot « Tessa » de la NEDA a été retiré après avoir donné des conseils de
perte de poids à des personnes en traitement.

Un runtime de plan qui continue à pousser de l'observance vers quelqu'un qui
restreint **n'est pas une expérience dégradée : c'est le dommage lui-même.**

**Ce que ça coûte.** Ce n'est pas un risque produit, c'est un risque de
personne. Et il est structurel : la fonctionnalité la plus utile du produit est
exactement celle qui fait le mal si elle s'adresse à la mauvaise personne.

## 2. Job stories

> **Quand** je commence à restreindre sans m'en rendre compte, **je veux** que
> l'app arrête de me pousser, **pour que** son mécanisme ne devienne pas le
> problème.

> **Quand** ça arrive, **je veux** qu'un humain soit prévenu, **pour que** la
> décision ne reste pas à une machine.

## 3. Périmètre

### Dans le périmètre

- Quatre déclencheurs, à seuils **gelés** et exportés pour que les tests les
  pinnent :
  `rapid_weight_loss` · `energy_deficit_streak` · `compensatory_language` ·
  `overclaimed_adherence_with_hidden_logging`.
- La **suppression de surfaces** quand le plancher est levé :
  `SUPPRESSED_STUDENT_SURFACES` — score d'adhérence, rappel d'observance,
  affichage de série, lecture de poids, lecture de calories, relance de pression
  sur le plan.
- L'escalade **immédiate** vers le coach humain.
- La skill `disordered_eating_guard`, dont chaque décision est prise en amont
  par du déterministe.

### Hors périmètre — engageant

- ❌ **Le plancher ne diagnostique pas.** `restriction_flag` est un signal de
  routage et de suppression : couper la pression, escalader au coach humain,
  passer la main à la skill. *L'IA escalade, le coach décide* — et ici, un
  clinicien décide après lui.
- ❌ **Aucune entrée de suppression n'existe.** Pas d'`override`, pas de
  `confidence`, pas d'`llm_assessment` — **par construction, pas par
  convention**. Les clés inconnues du snapshot sont ignorées. **Un modèle ne
  peut pas abaisser ce plancher parce que le plancher ne lit pas de modèle.**
- ❌ **Aucune I/O, aucun import, aucun réseau, aucune variable d'environnement.**
  L'appelant assemble le snapshot depuis la base et le passe ; il n'y a rien
  ici à qui parler.
- ❌ **La condition d'entrée du flow ne transite pas par le turn frame.** Le
  frame est écrit par le LLM du dispatcher ; le runtime calcule le résultat
  depuis la base et le passe par un canal dédié.

## 4. Le circuit

```
   la base ──► snapshot (assemblé par l'appelant)
                    │
                    ▼
   ┌──────────────────────────────────────────────────────┐
   │ restriction_guard.ts     FONCTION PURE               │
   │  zéro I/O · zéro import · zéro réseau · zéro env     │
   │  aucun paramètre d'override, de confiance ou de LLM  │
   │                                                      │
   │  ① rapid_weight_loss        > 1,2 %/sem sur 14 j     │
   │  ② energy_deficit_streak    ≥ 3 jours                │
   │  ③ compensatory_language                             │
   │  ④ overclaimed_adherence_with_hidden_logging         │
   └──────────────────────────────────────────────────────┘
                    │ restriction_flag
        ┌───────────┼────────────────────┐
        ▼           ▼                    ▼
   SUPPRESSION   ESCALADE           SKILL
   des surfaces  coach humain       disordered_eating_guard
   (adhérence,   immédiate          reducer pur + validateur
   rappels,                         de texte visible
   poids,
   calories…)
```

**Ce qui fait la garde** : elle est **sous** le modèle, jamais à côté. Rien ici
ne peut être convaincu de changer d'avis, parce qu'il n'y a rien ici à
convaincre.

## 5. Modèle de données

Lecture d'un snapshot hebdomadaire (poids en **kg SI**, énergie observée,
adhérence auto-déclarée, volume de journalisation). Écriture : le drapeau et
son escalade.

Bornes de plausibilité intégrées : un poids `0`, négatif, ou manifestement en
livres étiqueté en kilos **fait échouer la garde** plutôt que de produire
silencieusement un pourcentage de perte issu d'un bug d'unité.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Le plancher est **déterministe et pur** | une garde qu'on peut discuter n'est pas une garde |
| **R2** | Aucune entrée de suppression, **par construction** | un paramètre optionnel de garde est une garde désarmée ; ici il n'y a même pas de paramètre |
| **R3** | Les seuils sont des constantes **gelées et exportées** | les tests les pinnent ; un seuil qu'on peut bouger sans casser un test bougera |
| **R4** | Une donnée incohérente **throw** | un snapshot cassé qui rendrait `restriction_flag: false` est **pire que pas de garde** : c'est une garde qui déclare « tout va bien » |
| **R5** | Le plancher **ne diagnostique pas** | il route et il supprime. Un humain décide |
| **R6** | La condition d'entrée ne passe **pas** par le turn frame | le frame est écrit par un LLM |
| **R7** | La suppression couvre **six** surfaces nommées | le score lui-même est de la pression ; supprimer le rappel sans supprimer le score ne supprime rien |
| **R8** | Le tour n'est **jamais** silencieux | même plancher que la crise : un validateur de texte visible, et un message déterministe en repli |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Snapshot incohérent | **throw**. Jamais un « tout va bien » silencieux |
| Poids en livres étiqueté kg | rejeté par les bornes de plausibilité |
| Le modèle « pense » que c'est un faux positif | sans effet — le plancher ne lit pas de modèle |
| Le plancher se lève pendant un tour | la réponse sort sans chiffre, sans relance, sans score |
| Un nouveau chemin affiche un poids | c'est le mode d'échec à surveiller : la ceinture est armée, la surface est neuve |

## 8. Critères d'acceptation

```gherkin
Étant donné une perte supérieure au plafond hebdomadaire sur 14 jours
Quand la garde s'exécute
Alors restriction_flag est levé
Et le coach est escaladé

Étant donné un snapshot avec un poids négatif
Quand la garde s'exécute
Alors elle throw — elle ne rend pas « pas de restriction »

Étant donné le plancher levé
Quand une surface élève est rendue
Alors aucune des six surfaces supprimées n'apparaît

Étant donné le plancher levé
Quand l'élève écrit dans le chat
Alors la réponse ne contient ni score, ni série, ni chiffre de poids

Étant donné un modèle qui affirme que tout va bien
Quand la garde s'exécute
Alors son verdict est inchangé — elle ne lit pas de modèle

Étant donné un tour sous plancher où le modèle échoue
Quand le tour se termine
Alors une réponse visible existe quand même
```

## 9. Rabbit holes

- **La surface neuve qui rouvre la porte.** La ceinture est armée ; chaque écran
  ou chemin ajouté doit **demander** au plancher. Le dépôt a déjà rencontré une
  ceinture armée sur un coffre vide, et un plancher contourné par une branche
  locale.
- **Assouplir un seuil parce qu'il a mordu.** Les seuils sont gelés exprès. Un
  faux positif se traite par le contenu de la réponse, pas par le seuil.
- **Ajouter un `confidence`.** C'est la manière la plus naturelle de désarmer
  cette garde, et c'est précisément ce que sa signature interdit.

## 10. Ce qu'on mesure

- Levées du plancher, par déclencheur
- Surfaces supprimées effectivement absentes : **toutes**, et c'est un test
- Escalades coach reçues et lues

**Contre-mesure.** Le taux de faux positifs, et son coût humain : quelqu'un dont
le produit se ferme sans raison perd son outil. C'est le seul argument valable
contre un seuil — et il se traite avec un clinicien, pas dans un commit.

## 11. Questions ouvertes

- **Fiche écrite après coup.** Les invariants de §6 sont pinnés par
  `restriction_guard_test.ts`.
- Avec [FF-008](FF-008-le-poids-annonce.md), le poids annoncé **dans le chat**
  devient une entrée de cette garde. C'est la raison pour laquelle FF-008 est
  classée sécurité et passe en premier.
