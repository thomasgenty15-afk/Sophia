# FF-026 · La préférence captée

| | |
|---|---|
| **Identifiant** | `FF-026-la-preference-captee` |
| **Statut** | 🟠 En cours — le pont mémoire → générateurs existe ; la capture et la boucle ne sont pas éprouvées de bout en bout |
| **Date** | 2026-08-08 |
| **Autorité produit** | la direction du domaine ([README](README.md)) T1, T6 |
| **Code** | le memorizer (`trigger-memorizer-daily`) · le pont `food_preferences` vers les générateurs (5 clés de domaine, « Keep » obligatoire) · `generate-meal-v1` / `generate-household-meal-v1` (les consommateurs) |
| **Effort estimé** | 2 jours (l'épreuve de bout en bout + la rétractation) |

---

## 1. Le problème

Quelqu'un écrit « t'as mis du riz, mais j'aime pas ça, je remplace par quoi ? ».
La question reçoit une réponse (FF-016). Mais l'information qu'elle contient —
**cette personne n'aime pas le riz** — vaut plus que la réponse : si elle
n'atterrit nulle part, le plan de la semaine suivante ressert du riz, la
personne re-demande, re-remplace… et comprend que parler ne sert à rien.

Le canal existe : le memorizer passe chaque nuit sur les conversations, et un
pont **unique et volontairement étroit** relie la mémoire aux générateurs — les
`food_preferences` (5 clés de domaine, mention « Keep » obligatoire). Ce qui
n'est pas éprouvé, c'est la **boucle complète en conditions réelles** : la
phrase du chat → l'item de mémoire → le prompt du générateur → un plan sans
riz.

**Ce que ça coûte.** C'est la boucle T6 du [README](README.md) — « ce qui est donné doit se
voir dans le plan suivant ». Cassée ici, elle casse la promesse entière : le
produit qui écoute. Et connu du dépôt : la préférence captée un jour J est
**invisible le jour même** (le memorizer passe la nuit), et le texte gardé peut
se retrouver **détaché de son souvenir** (`food-preference-memory-lifecycle`).

## 2. Job stories

> **Quand** je dis en passant que je n'aime pas un aliment, **je veux** que la
> semaine suivante n'en propose plus, **pour que** je n'aie pas à le répéter.

> **Quand** je n'ai pas aimé un plat du plan, **je veux** pouvoir juste le
> dire, **pour que** le plan apprenne sans que je remplisse quoi que ce soit.

> **Quand** je change d'avis (« en fait j'aime bien le riz »), **je veux** que
> ça compte aussi, **pour que** mon plan ne reste pas figé sur un vieux moi.

## 3. Périmètre

### Dans le périmètre

- La **capture** en conversation : « j'aime pas X », « j'ai pas aimé ce plat »,
  « finalement je préfère Y » → mémoire durable, par le memorizer.
- La **consommation** : les générateurs reçoivent les préférences par le pont
  existant, et le plan suivant les respecte.
- La **rétractation** : « en fait j'aime bien » retire ou remplace la
  préférence — honorée, pas empilée.
- L'épreuve de bout en bout en conditions réelles, dans les deux langues.

### Hors périmètre — engageant

- ❌ **Une allergie n'est PAS une préférence.** « Je suis allergique aux
  noix » passe par le chemin des contraintes de sécurité
  (`declare_safety_constraint`, contraintes dures, verrou allergène) — jamais
  par la mémoire souple. Les deux chemins existent ; les confondre mettrait une
  ceinture de sécurité dans un canal best-effort.
- ❌ **Pas de second pont.** Le pont `food_preferences` est **le seul** lien
  mémoire → générateurs, exprès. Toute nouvelle donnée qui veut atteindre le
  plan passe par lui ou n'y passe pas.
- ❌ **Pas de modification de la semaine en cours.** La préférence se voit à la
  **prochaine** composition. ⚠️ Sans exception depuis le 2026-09-01 : le milieu
  de semaine n'appartient **à personne** — FF-028 est abandonnée, et rien ne
  vient lever ce no-go.
- ❌ **Pas une restriction du foyer.** « J'aime pas » (préférence personnelle)
  et « pas de Nutella dans ce foyer » (pouvoir domestique, attribué) sont deux
  objets ; la seconde vit dans les tables du foyer.
- ❌ **Le chat ne confirme pas par un formulaire.** La capture est silencieuse
  ou d'une phrase — jamais « veux-tu que j'enregistre cette préférence ? ».

## 4. Le circuit

```
   « t'as mis du riz, mais j'aime pas ça »
                │
        ┌───────┴────────┐
        ▼                ▼
   la RÉPONSE       la CAPTURE
   (FF-016 :        (memorizer, la nuit)
   « remplace            │
   par… »)               ▼
                 item de mémoire durable
                 domaine food_preferences
                         │
                         ▼
                 LE PONT (unique, 5 clés,
                 « Keep » obligatoire)
                         │
                         ▼
              generate-meal-v1 /
              generate-household-meal-v1
                         │
                         ▼
              le plan suivant : PAS de riz
                         │
                         ▼
          « en fait j'aime bien le riz »
                         │
                         ▼
              rétractation → l'item est
              retiré/remplacé, PAS empilé
```

**Le point qui gouverne le dessin** : la boucle se juge **au plan produit**,
pas à l'item de mémoire. Un item écrit que le générateur ignore est un zéro.

## 5. Modèle de données

Aucune table neuve. La préférence vit dans les items de mémoire (domaine
`food_preferences`), le générateur la lit par le pont existant.

| Étape | Où | Piège connu |
|---|---|---|
| capture | memorizer, la nuit | **invisible le jour même** — une génération à 14 h ne voit pas la phrase de 10 h |
| stockage | item de mémoire durable | le texte gardé peut se détacher de son souvenir source (`food-preference-memory-lifecycle`) |
| rattachement | `superseded` sur rétractation | le memorizer rattache parfois n'importe quoi — la supersession demande une vérification de plausibilité |
| consommation | prompt des générateurs | `ov` et pas `cs` ; « Keep » obligatoire |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Allergie ≠ préférence : deux chemins, jamais croisés | une allergie dans un canal best-effort est une ceinture dans du sable |
| **R2** | Un seul pont vers les générateurs | deux ponts divergent ; celui-ci est étroit exprès |
| **R3** | La rétractation est honorée | le dépôt a déjà mesuré une rétractation non honorée ; un plan figé sur un vieux moi est un plan qu'on quitte |
| **R4** | La supersession est vérifiée en plausibilité | le memorizer rattache parfois n'importe quoi |
| **R5** | La boucle se prouve **au plan produit**, en run réel | un item en base ne prouve rien ; seul un plan sans riz prouve |
| **R6** | Capture silencieuse ou d'une phrase — jamais un formulaire | la personne a posé une question, pas rempli une fiche |
| **R7** | « J'ai pas aimé **ce plat** » est scopé au plat, pas à ses ingrédients | détester un curry ne veut pas dire détester le poulet — sur-généraliser pollue le profil |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Génération le jour même de la capture | la préférence n'y est pas encore — limite connue, documentée. La fenêtre se mesure ; si elle coûte trop, un write-through immédiat devient un chantier |
| Préférences contradictoires (« j'aime pas le riz » puis « j'adore le risotto ») | les deux existent ; le générateur arbitre et **dit** ce qu'il a arbitré — jamais de résolution silencieuse |
| Le memorizer sur-généralise un plat en ingrédients | R7 — le test le pinne |
| Rétractation d'une préférence jamais captée | rien à retirer, pas d'erreur visible |
| L'item existe mais le générateur l'ignore | c'est le zéro de R5 — la mesure §10 le rend visible |

## 8. Critères d'acceptation

```gherkin
Étant donné « t'as mis du riz mais j'aime pas ça » dit en conversation
Quand le memorizer est passé et qu'une nouvelle semaine est composée
Alors le plan ne contient pas de riz

Étant donné « I don't like mushrooms » en anglais
Quand la boucle se déroule
Alors le résultat est le même — les deux langues

Étant donné « en fait j'aime bien le riz » après la capture
Quand la semaine suivante est composée
Alors le riz peut réapparaître
Et l'ancienne préférence n'existe plus comme active

Étant donné « je suis allergique aux noix »
Quand le tour se termine
Alors c'est une contrainte de sécurité qui est déclarée
Et AUCUNE préférence n'est écrite

Étant donné « j'ai pas aimé le curry d'hier »
Quand la préférence est captée
Alors elle vise le plat, pas le poulet ni le lait de coco

Étant donné une préférence captée aujourd'hui à 10 h
Quand une génération part à 14 h le même jour
Alors le comportement est le documenté : la préférence n'y est pas —
     et c'est dit dans la fiche, pas découvert en prod
```

## 9. Rabbit holes

- **Le formulaire déguisé.** « J'ai noté que tu n'aimais pas le riz, c'est
  bien ça ? » à chaque capture transforme une conversation en interrogatoire de
  confirmation. La capture est un plancher silencieux ; l'erreur se corrige par
  la rétractation, pas par la confirmation préalable.
- **La généralisation plat → ingrédients.** Le raccourci le plus tentant du
  memorizer et le plus polluant. R7 est là contre lui.
- **Le write-through immédiat.** Résoudre la fenêtre du jour même en écrivant
  la préférence en direct depuis le tour — tentant, mais ça crée un **second
  écrivain** de la mémoire avec une qualité non éprouvée. À n'ouvrir que si la
  fenêtre mesurée coûte réellement.
- **La préférence du foyer.** « Les enfants n'aiment pas les épinards » dit par
  la mère : préférence de QUI ? Le membre, le foyer, le cuisinier ? Non tranché
  — ne pas trancher en silence dans le code.

## 10. Ce qu'on mesure

- Boucles complètes réussies : phrase → plan suivant conforme (échantillon en
  run réel, les deux langues)
- Rétractations honorées : toutes
- Re-déclarations de la même préférence (proxy : la personne répète parce que
  le plan n'a pas suivi) — **doit tendre vers zéro**

**Contre-mesure.** La sur-capture : des préférences fantômes qui appauvrissent
les plans (tout devient « sans » quelque chose). Le nombre de préférences
actives par personne se surveille ; au-delà d'un seuil, c'est le capteur qui
hallucine, pas la personne qui est difficile.

## 11. Questions ouvertes

- La fenêtre « invisible le jour même » : acceptable, ou write-through ? À
  trancher **après** mesure de la fréquence réelle (combien de générations
  partent le jour d'une capture ?).
- La préférence exprimée pour un tiers du foyer (« mon fils déteste ça ») —
  voir le rabbit hole ; demande un arbitrage produit.
