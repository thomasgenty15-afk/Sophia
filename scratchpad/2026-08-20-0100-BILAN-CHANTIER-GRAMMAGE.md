# BILAN — chantier grammage, les 7 lots

**2026-08-20 01h00** · branche `ff-001-quotidien-du-coach` · **rien n'est commité**.
Plan : `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`.

## Le chiffre du chantier

Couverture du calcul d'énergie, **après pliage des préparations**, 1 204 plats de
foyer, rejouée sur l'index vivant à chaque étape (jamais sur `grams_raw`) :

```
départ réel               344 / 1204   28,6 %
après 0-B (référentiel)   485 / 1204   40,3 %   +11,7
après 0-C (condiments)    667 / 1204   55,4 %   +15,1
                                                ─────
                                                +26,8 points
```

Vérifié deux fois à chaque palier : par l'agent qui livre, puis par une
contre-mesure indépendante.

## Les 7 lots

| lot | | état |
|---|---|---|
| **D** | l'écran dit que le gramme couvre le repas entier | livré |
| **0-A** | toute quantité est obligatoire, sauf condiments | livré |
| **0-B** | 112 termes inconnus : 79 alias, 12 lignes, 26 écartés | livré |
| **0-C** | classe fermée de 17 condiments, masse conventionnelle | livré |
| **1** | `mouth_energy` — ce que la journée LIVRE | livré |
| **2** | `mouth_anchor` — ce que le corps DEMANDE, et le facteur | livré + **branché** |
| **3** | `pot_demand` — ce que la casserole a REFUSÉ | instrument livré |

**Tests** : `_shared/keel` **3 878 passés, 0 échec**. Front **1 741 passés, 4
rouges antérieurs et étrangers** (fonctions edge et triggers d'autres lanes).
**Vingt mutations tirées sur les modules du chantier, vingt rouges.**

## Les quatre fois où le plan s'est trompé, et la mesure qui l'a corrigé

1. **« Relâche la règle d'abstention, +20 points »** — faux. Mesuré : sur 247
   plats débloqués, **38 laisseraient tomber du riz, des pois chiches, du thon,
   du pain**. `kcal/100 g` ne sépare pas le poivre du riz ; ce qui les sépare est
   la **masse plausible** (0,5 g contre 150 g).
2. **La mesure par `grams_raw`** — biaisée. Ce champ est figé à la génération et
   dit l'état du référentiel de ce jour-là. Le remplissage de `unit_grams`
   chiffré à 261 plats en valait **17**.
3. **« Le pliage fera monter le taux »** — il le fait **descendre**. Le vrai
   point de départ était 28,6 %, pas 37,8 %.
4. **« Retire la couche relative »** — régression. Voir ci-dessous.

## La décision de conception du chantier

`bodyShareFactors` **n'est pas retiré**, il est **remplacé quand l'ancrage tire** :

```
ancrage tiré (anchored | clamped)  ->  son facteur REMPLACE le relatif
sinon                              ->  le relatif reste, seul
JAMAIS le produit des deux
```

Le plan ordonnait le retrait. À 55,4 % de couverture, l'ancrage s'abstient sur la
majorité des journées : retirer maintenant rendrait **450/450** là où le produit
rend **612/344**. Le double comptage que le plan craignait vient de la
**multiplication**, pas de la coexistence — une bascule exclusive l'évite sans
régresser.

⚠️ Le retrait reste la cible. Son déclencheur est un chiffre, pas une opinion :
quand `box_sizing.anchor.anchored` dépasse les abstentions sur des runs réels.

## Deux refus, tenus contre le gain

**`garlic`** (39 plats) — refusé par la règle, pas par le goût. Une gousse pèse
5 g et la ligne le dit ; trois gousses = 16,6 kcal. L'admettre demanderait de lui
écrire une masse plus petite qu'une gousse, c'est-à-dire une convention fausse.

**`pepper` nu** (109 plats, le premier bloqueur restant) — refusé, et c'est le
LOT 0-A qui rend le refus obligatoire. La preuve d'identité est pourtant
écrasante (16/16 des lignes cooccurrent avec du sel, 16/16 sans quantité). Mais
la masse conventionnelle s'applique dès qu'aucune quantité n'est lisible, et
`black_pepper` n'a pas de poids d'unité : « 1 unit pepper » — un **poivron** —
tomberait dans la branche conventionnelle et vaudrait **0,3 g de poivre noir**.
Une perte d'énergie silencieuse sur un plat qui se présenterait comme complet.

⚠️ **Et le risque MONTE à cause du lot 0-A** : depuis qu'une quantité est exigée
sur tout ce qui n'est pas un condiment, un poivron **va** porter un nombre.
Réparé à la source : le prompt écrit désormais « black pepper », jamais
« pepper » nu, avec la raison dedans.

## Ce qui reste ouvert — et il faut le lire avant de conclure

1. **AUCUN RUN RÉEL. C'est la limite qui gouverne tout le reste.** Les sept lots
   sont prouvés sur tests, mutations et archive — jamais sur une génération.
2. **Aucun plan en base ne porte de boîte** (136 plans, 0 boîte) : l'unité « un
   contenant par repas » date du 2026-08-19. Le lot 1 rendrait `no_box` partout
   sur l'archive, et le fork du lot 3 **n'est pas tranchable** aujourd'hui.
3. ⚠️ **Redémarrer le runtime avant tout run** — il sert des `_shared` périmés et
   un fichier MODIFIÉ n'est pas rechargé : `docker restart
   supabase_edge_runtime_Sophia_2`.
4. **`foldPreparationsIntoDishes` ajoute sans dédupliquer.** Trouvé par 0-C :
   10 des 12 plats qui listent `roasted vegetables` en ingrédient portent AUSSI
   un `uses` vers la casserole du même nom. Inoffensif aujourd'hui (le terme ne
   résout pas), **mais il traverse le lot 1** : si ce terme devenait résoluble,
   l'énergie serait comptée deux fois. À instruire avant toute curation qui le
   rendrait résoluble.
5. **Le pluriel en « -es »** (`aubergines` -> `aubergin`) : mesuré par 0-C, puis
   **refusé** — 5 gagnés dont 4 faux. Laissé en l'état, avec la mesure écrite.
6. **`for_member_id` n'est pas lu** par le lot 1 : un plat dédié sans couvercle
   tombe en `no_box`. Deux sources de vérité sur qui mange quoi est pire qu'une.
7. **Les bornes `ANCHOR_FACTOR_MIN/MAX` (0,60–1,60) sont des conventions
   déclarées**, pas des bornes dérivées. À redériver sur les premiers runs.

## La recette, pour le prochain qui reprend

```bash
docker restart supabase_edge_runtime_Sophia_2
```

Régénérer un plan de foyer, puis lire `generated_from.box_sizing` :

```
anchor: { anchored, clamped, day_incomplete, no_delivery, ... }
anchor_applied: <combien de bouches ont reçu un facteur ancré>
```

- `anchored + clamped` élevé ⇒ l'ancrage tire, et le retrait de la couche
  relative devient mesurable.
- `day_incomplete` dominant ⇒ c'est la couverture qui bloque, pas l'ancrage :
  retour au lot 0, longue traîne.
