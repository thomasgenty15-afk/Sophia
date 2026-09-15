# FF-029 · Les pratiques quotidiennes

| | |
|---|---|
| **Identifiant** | `FF-029-les-pratiques-quotidiennes` |
| **Statut** | 🟠 En cours — le côté coach est construit et éprouvé en local ([FF-001](../methode-du-coach/FF-001-quotidien-du-coach.md)), **non déployé** ; les défauts de la méthode maison (B2C) restent à écrire |
| **Date** | 2026-08-08 |
| **Autorité produit** | [FF-001](../methode-du-coach/FF-001-quotidien-du-coach.md) (la fiche mère, côté coach) · la direction du domaine ([README](README.md)) |
| **Code** | `_shared/keel/daily_practices.ts` · `daily_practices_classify.ts` · l'injection dans le message du soir (`daily_recap.ts`, `PracticeInjection`) |
| **Effort estimé** | 1,5 jour (les défauts méthode maison + le fil vers FF-028) |

---

## 1. Le problème

Boire de l'eau, marcher, dormir à des heures fixes — les pratiques quotidiennes
sont la partie de la méthode qui ne passe **pas** par l'assiette. Elles portent
une vraie part du résultat, et elles sont exactement ce qu'une app sait
accompagner : petites, répétées, vérifiables par la personne elle-même.

Le côté coach existe (FF-001) : le coach écrit jusqu'à 7 pratiques, une IA les
classe, et la pratique entre dans l'appel du soir qui a déjà lieu, en
alternance rappel/question. Ce qui manque :

1. **Le B2C n'a rien.** Sans coach, personne n'écrit de pratiques — alors que
   « hydratation, activité, régularité » sont précisément les pratiques
   universelles qu'une **méthode maison** peut porter pour tout le monde.
2. **La réponse n'alimente rien d'autre que le soir même.** L'adhérence aux
   pratiques est une entrée naturelle de l'analyse quotidienne (FF-028) — une
   pratique ignorée trois semaines est un signal, pas un échec moral.

**Ce que ça coûte.** Le B2C perd la moitié non-alimentaire de la valeur, et le
côté coach déjà construit dort en local, non déployé.

## 2. Job stories

> **Quand** ma méthode dit de boire deux litres d'eau, **je veux** que le
> message du soir me le rappelle ou me le demande au bon rythme, **pour que**
> ça devienne un réflexe sans devenir un formulaire.

> **Quand** je n'ai pas de coach, **je veux** quand même des pratiques
> raisonnables (eau, pas, régularité), **pour que** l'app m'accompagne au-delà
> de l'assiette.

> **Quand** j'ignore une pratique pendant des semaines, **je veux** qu'on
> m'en propose une autre plutôt qu'on me la répète, **pour que** le rappel ne
> devienne pas du bruit.

## 3. Périmètre

### Dans le périmètre

- **Le canal existant** (FF-001, construit) : jusqu'à 7 pratiques, classées par
  IA (le coach lit et corrige le verdict), délivrées **dans le message du soir
  qui existe déjà** — jamais un message de plus — en alternance rappel/question.
- **À construire — les pratiques de la méthode maison** : un jeu par défaut
  (hydratation, activité, régularité), porté par le coach `house` exactement
  comme une doctrine maison, pour que le B2C soit servi sans qu'aucun humain
  n'écrive rien.
- **À construire — le fil vers FF-028** : les réponses aux questions de
  pratique deviennent une entrée de l'analyse quotidienne (une pratique
  ignorée durablement → proposer un ajustement, pas répéter le rappel).
- Les ceintures existantes restent : classification qui supprime les surfaces
  interdites (`weight_readout` — une pratique « pèse-toi chaque matin » ne
  sort **jamais** vers l'élève), garde `minor_quantity` (aucun chiffre de
  pratique chez un mineur), cadence `pulse_asked`.

### Hors périmètre — engageant

- ❌ **Jamais un message dédié.** La pratique voyage dans le message du soir.
  Deux messages, c'est le problème qu'on répare, doublé.
- ❌ **Aucun score, aucune série.** Une pratique suivie se constate ; elle ne
  se gamifie pas. `streak_display` est déjà une surface supprimée.
- ❌ **Pas de coaching de vie.** Une pratique est **prescrite par la méthode**
  (coach ou maison) — jamais inventée par le modèle au fil de l'eau. Le moteur
  qui propose d'en changer est FF-028, sous doctrine.
- ❌ **Répondre est optionnel.** Ignorer une question de pratique ne déclenche
  ni relance ni remarque. Le silence est une réponse.
- ❌ **Une pratique qui contredit un plancher ne sort pas.** La classification
  la retient (surfaces supprimées) ; sous plancher de restriction, les
  pratiques chiffrées se taisent.

## 4. Le circuit

```
   LE COACH (FF-001, construit)          LA MÉTHODE MAISON (à construire)
   écrit ≤ 7 pratiques                   jeu par défaut : hydratation,
        │                                activité, régularité — porté par
        ▼                                le coach `house`
   classification IA                              │
   (le coach lit et corrige)                      │
        │                                         │
        └────────────────┬────────────────────────┘
                         ▼
        ┌────────────────────────────────────────┐
        │ CEINTURES                              │
        │  surfaces supprimées (weight_readout…) │
        │  minor_quantity (FR + EN)              │
        │  plancher de restriction               │
        └────────────────────────────────────────┘
                         ▼
        LE MESSAGE DU SOIR — celui qui existe
        alternance rappel / question, cadence tenue
                         │
              réponse (optionnelle)
                         │
                         ▼
        L'ANALYSE QUOTIDIENNE (FF-028)
        pratique ignorée durablement → proposer
        un changement, pas répéter
```

## 5. Modèle de données

Le côté coach est celui de FF-001 (les pratiques, leur classification, la
cadence). Ce qui s'ajoute :

| Donnée | Origine |
|---|---|
| les pratiques maison | **écrites une fois** dans la méthode maison (mêmes tables que le coach — le coach `house` EST un coach) |
| la réponse du soir | le canal existant du message du soir |
| l'adhérence fenêtrée | **dérivée** à la lecture pour FF-028 — jamais un score stocké |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | La pratique voyage dans le message qui existe | un message de plus par jour tue le canal entier |
| **R2** | 7 pratiques maximum, coach comme maison | au-delà c'est un programme, pas un quotidien — l'arbitrage de FF-001 |
| **R3** | La méthode maison passe par les **mêmes rails** que le coach | un second chemin « défauts B2C » divergerait ; le coach `house` est un coach, c'est toute l'astuce du produit |
| **R4** | Les surfaces supprimées et `minor_quantity` tiennent partout, deux langues | une pratique « pèse-toi » sortie à un élève sous plancher est une régression de sécurité, pas un bug d'affichage |
| **R5** | Répondre est optionnel ; le silence est une réponse | sinon la pratique devient la sollicitation qu'on vient de retirer |
| **R6** | L'adhérence est consommée (FF-028), jamais affichée en score | la règle mère : collectée parce que consommée ; affichée en score, elle devient de la pression |
| **R7** | Une pratique ignorée durablement se **remplace**, ne se répète pas | répéter un rappel ignoré trois semaines, c'est du bruit qui apprend à ignorer le reste |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le coach n'a écrit aucune pratique | l'élève reçoit celles de la méthode déléguée si elle en a ; sinon rien — jamais un défaut inventé par le modèle |
| La classification se trompe | le coach lit le verdict et le corrige (FF-001) ; côté maison, les pratiques par défaut sont pré-classées à la main |
| La personne ignore systématiquement | aucun reproche, aucune relance ; le signal part vers FF-028 |
| Élève mineur | aucun chiffre de pratique (garde existante, FR + EN) |
| Plancher de restriction levé | les pratiques chiffrées se taisent ; les autres suivent la classification |
| Le message du soir n'a pas de matière (pas de fait du jour) | la cadence de pratique décide seule — la pratique peut porter le message, c'est déjà le comportement de FF-001 |

## 8. Critères d'acceptation

```gherkin
Étant donné un coach avec des pratiques publiées
Quand le message du soir part
Alors il porte au plus une pratique, en alternance rappel/question
Et jamais dans un message séparé

Étant donné un élève B2C sans coach
Quand la méthode maison est en place
Alors il reçoit les pratiques par défaut par le même canal

Étant donné une pratique « pèse-toi chaque matin » écrite par un coach
Quand la classification tourne
Alors elle est retenue et ne sort jamais vers l'élève

Étant donné un élève mineur
Quand une pratique chiffrée devrait sortir
Alors la garde la retient — en français comme en anglais

Étant donné une pratique ignorée trois semaines
Quand l'analyse quotidienne tourne
Alors elle peut proposer un remplacement
Et le rappel n'est pas simplement répété

Étant donné un élève qui n'a jamais répondu à une question de pratique
Quand les messages suivants partent
Alors aucun reproche ni relance n'apparaît
```

## 9. Rabbit holes

- **Le jeu maison qui gonfle.** « On pourrait ajouter la méditation, la
  lumière du matin… » — le jeu par défaut reste minimal (3, pas 7) : il doit
  être universellement raisonnable, pas ambitieux. L'ambition appartient aux
  coachs.
- **La gamification rampante.** Le premier « 5 jours de suite ! » réintroduit
  la série. `streak_display` est supprimée exprès.
- **La pratique inventée à la volée.** Un modèle serviable proposera « tu
  pourrais aussi… » en pleine conversation. C'est FF-028 qui propose, le soir,
  sous doctrine — jamais le tour de chat.
- **Le déploiement oublié.** FF-001 est construit et **non déployé**. Cette
  fiche n'existe en prod que si FF-001 part — vérifier l'état réel avant tout
  chantier ici.

## 10. Ce qu'on mesure

- Taux de réponse aux questions de pratique (la santé du canal)
- Pratiques remplacées après ignorance durable (la boucle R7 vit)
- En B2C : part des personnes servies par les pratiques maison

**Contre-mesure.** Le taux de réponse au message du soir **global**. Si
l'ajout de la pratique le fait baisser, la pratique cannibalise le canal qui la
porte — et c'est le canal qui prime.

## 11. Questions ouvertes

- Le jeu maison exact (hydratation, activité, régularité ?) et ses seuils —
  une décision de méthode, à écrire comme la doctrine maison a été écrite.
- Les pratiques « par dynamique » (l'idée d'origine : recommandées selon la
  situation de la personne) — V2, et c'est FF-028 qui les proposerait.
- FF-001 non déployé : le déploiement est un préalable, pas une partie de
  cette fiche.
