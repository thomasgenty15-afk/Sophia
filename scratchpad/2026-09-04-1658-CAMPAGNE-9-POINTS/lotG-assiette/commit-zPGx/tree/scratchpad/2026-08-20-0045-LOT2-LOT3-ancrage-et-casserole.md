# LOTS 2 & 3 — l'ancrage absolu, et ce que la casserole refuse

**Date** 2026-08-20 00h45 · **Branche** `ff-001-quotidien-du-coach` · rien n'est commité.
Chantier : `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`.

## Livrés

```
mouth_anchor.ts   + test   19 tests    facteur = cible / livré
pot_demand.ts     + test   12 tests    ce que la casserole a refusé
```

Avec le lot 1 : **42 tests**, tous verts. **Douze mutations sur les trois
modules, douze rouges**, restauration verte à chaque fois.

---

# LOT 2 — l'ancrage absolu

## La cible : deux portes, deux portées

C'est la finesse du lot, et elle est mesurée ailleurs dans le dépôt :

- **L'ENTRETIEN** traverse ② (mineur) et ③ (doctrine). Ce n'est pas une cible,
  c'est ce que ce corps dépense. Le refuser à un enfant lui servirait la part
  d'un adulte **au nom de sa protection** — c'est la mesure du 2026-08-19, et
  c'est le contraire d'une protection.
- **L'ÉCART** (déficit / surplus) est fermé par ② et ③ **en entier**. Un coach
  qui ne compte pas garde exactement ce qu'il a demandé : aucun déficit, aucun
  surplus, pour personne de sa cohorte.
- **① (le plancher TCA) ferme les deux**, et il est évalué en premier dans les
  deux passes. C'est ce qui rend le dépassement de ②③ sûr.

⛔ Les portes sont **appelées**, jamais recopiées. `energy_gate.ts` reste en
lecture seule : recopier ses trois `if` ferait les deux points de décision que
le module interdit en toutes lettres.

## ⛔ La garde qui compte le plus : on n'ancre jamais sur une journée incomplète

Si un plat du jour n'a pas rendu son énergie, le **livré est sous-estimé**. Or
`cible / livré` sous-estimé est un facteur **trop grand** : on servirait
davantage à quelqu'un **parce qu'on n'a pas su lire son assiette**.

La direction de l'erreur n'est pas neutre — elle va dans le sens qui nourrit
trop. Journée incomplète ⇒ facteur `1`, motif `day_incomplete`.

⚠️ **Avec la couverture actuelle (~40 %), ce motif sera le plus fréquent.** C'est
voulu, c'est honnête, et c'est le lot 0 qui le fera descendre — pas celui-ci.

## Le rabotage, et pourquoi il ne refuse pas

Le dépôt porte les deux arbitrages opposés, chacun justifié. Ici c'est le
rabotage qui gouverne, pour une raison mesurée : **refuser rend `1`,
c'est-à-dire le 450 g du modèle** — très exactement le produit que ce chantier
existe pour corriger.

`ANCHOR_FACTOR_MIN = 0,60` · `ANCHOR_FACTOR_MAX = 1,60`

⚠️ **Ce sont des CONVENTIONS DÉCLARÉES, pas des bornes dérivées**, et c'est dit
dans le fichier. `BOX_FACTOR_MIN` se calcule (sa dérivation est écrite au-dessus
de lui) ; celle-ci ne le peut pas encore — dériver une borne sur `cible / livré`
demande de savoir comment le modèle plate en pratique, et aucun plan en base ne
porte encore de boîte. **À redériver sur les premiers runs réels.**

## ⛔ CORRECTION DU PLAN — « retire la couche relative » est FAUX EN L'ÉTAT

Le master prompt écrivait : *« Tu retires la couche relative, tu ne l'empiles
pas. Si tu conclus qu'elle doit survivre, écris pourquoi, avec une mesure. »*

**Voici la mesure, et la conclusion s'inverse.**

L'ancrage s'abstient sur toute journée incomplète. À la couverture d'aujourd'hui
(**40,3 % des plats calculables**), la majorité des journées sont incomplètes.
Retirer `bodyShareFactors` maintenant produirait :

```
aujourd'hui                    612 / 344     (rapport des entretiens)
après retrait + abstention     450 / 450     ← le produit d'AVANT le chantier
```

**Ce serait une régression, livrée sous le nom d'un progrès.**

La règle juste n'est ni « retirer » ni « empiler », c'est **remplacer quand ça
tire** :

```
si l'ancrage rend `anchored` ou `clamped`  ->  son facteur REMPLACE le relatif
sinon                                       ->  le relatif reste, seul
JAMAIS le produit des deux
```

Le double comptage que le plan craignait — réel, mesuré sur trois runs — vient
de la **multiplication**, pas de la coexistence. Une bascule exclusive l'évite
entièrement et ne régresse pas.

⚠️ **Le retrait de `bodyShareFactors` reste la cible**, mais son déclencheur est
un chiffre, pas ce lot : quand le taux de motif `anchored` sur des runs réels
dépasse celui des abstentions, la couche relative n'a plus d'appelant utile.

---

# LOT 3 — ce que la casserole a refusé

## Ce qui est livré, et ce qui ne l'est PAS

Le plan disait : *« Mesure d'abord : combien de fois le plafond du récipient
mord ? Si c'est rare, l'aval suffit. »*

**La mesure est impossible aujourd'hui** — 136 plans de foyer en base, **0 avec
une boîte** (l'unité « un contenant par repas » date du 2026-08-19). Donc ce lot
livre **l'instrument**, pas la décision. Implémenter l'amont avant la mesure
serait construire précisément ce que la mesure doit justifier.

## ① `unmetDemand` — combien, et QUI a refusé

Deux plafonds, **jamais confondus**, parce qu'ils se réparent à deux endroits
opposés :

| cause | se répare |
|---|---|
| `factor_clamped` | une borne de plausibilité |
| `pot_ceiling` | une liste de courses |
| `both` | **le cas qui dit que l'aval seul ne suffira jamais** |
| `not_anchored` | le lot 0 (couverture) |

⚠️ **`unmetKcal` reste ≥ 0.** Un manque et un dépassement dans un même total
signé s'annulent : une table où une bouche manque de 500 kcal et l'autre déborde
de 500 paraîtrait parfaite. Le dépassement se lit sur `servedKcal` face à
`wantedKcal`, jamais en soustraction.

## ② `neededPotFactor` — le levier amont, calculé et jamais appliqué

De combien chaque casserole devrait grossir pour que l'ancrage soit servi sans
rabot. `1` = elle suffit. `1,4` = 40 % de courses en plus.

⚠️ **Il lit `raw`, pas `factor`.** La question posée est « de combien la
casserole devrait grossir pour que le rabot ne soit plus nécessaire » ; lire le
facteur déjà raboté répondrait « elle suffit », toujours. Un test le garde, et
la mutation le fait rougir.

⛔ **Ce n'est pas une décision produit.** Faire grossir une casserole change la
liste de courses de quelqu'un. Le nombre existe pour rendre la mesure possible ;
le brancher se décide **après** elle.

**Un résultat rassurant, au passage** : deux bouches aux facteurs opposés sur la
même casserole **se compensent** — 200 g à 1,5 et 200 g à 0,5 font 400 g voulus
pour 400 g tirés. Le cas du chantier (612/344 pour 900 g) **ne commande aucune
course supplémentaire**. Si ce comportement domine sur les runs réels, l'aval
suffira et le lot 3 s'arrêtera là.

---

## Ce qui reste ouvert — et c'est le tout dernier geste du chantier

1. **Aucun des trois modules n'a d'appelant.** Le branchement dans
   `generate-household-meal-v1/index.ts` est le seul geste qui manque. Il n'a pas
   été fait ici pour deux raisons : le fichier porte **1 790 lignes non commitées
   d'une autre session**, et la bascule exclusive décrite ci-dessus doit être
   écrite avec sa mesure sous les yeux, pas à l'aveugle.
2. **Aucun run réel.** Les trois lots sont prouvés sur tests et mutations, pas
   sur une génération. ⚠️ Redémarrer le runtime d'abord — il sert des `_shared`
   périmés, un fichier modifié n'est PAS rechargé.
3. **`for_member_id` n'est toujours pas lu** (hérité du lot 1). Un plat dédié
   sans couvercle tombe en `no_box`. Deux sources de vérité sur qui mange quoi
   est pire qu'une seule : à instruire avec la mesure.
4. ~~`food_composition.ts` en cours d'édition~~ — **RÉSOLU à 00h50.** Le lot 0-C
   a posé son `condimentGrams`. Les trois modules ont été **retypecheckés et
   rejoués avec le typecheck complet : 42 passés, 0 échec.**
