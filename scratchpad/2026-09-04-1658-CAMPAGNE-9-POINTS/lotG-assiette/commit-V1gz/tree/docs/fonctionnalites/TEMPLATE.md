# FF-XXX · <Nom parlant, pas un nom de composant>

| | |
|---|---|
| **Identifiant** | `FF-XXX-nom-en-kebab-case` |
| **Statut** | 🔵 Idée \| 🟡 Spécifiée \| 🟠 En cours \| 🟢 Livrée \| ⚪ Gelée \| 🔴 Abandonnée |
| **Date** | AAAA-MM-JJ (dernière révision) |
| **Autorité produit** | les docs qui font foi et qu'on n'a pas le droit de contredire |
| **Dépend de** | ce qui doit déjà exister et fonctionner |
| **Effort estimé** | en jours, pas en points |

---

## 1. Le problème

<!--
CE QUE VIT L'UTILISATEUR, pas la solution. Si ce paragraphe contient le nom de
la fonctionnalité, il est faux : on décrit ce qui coince aujourd'hui.

Terminer par CE QUE ÇA COÛTE de ne rien faire. Une fonctionnalité dont on ne
sait pas dire le coût de l'inaction est une fonctionnalité qu'on peut reporter
indéfiniment — et qu'on devrait.
-->

## 2. Job stories

<!--
« Quand <situation>, je veux <motivation>, pour que <résultat>. »

DES JOB STORIES, PAS DES USER STORIES. « En tant qu'utilisateur je veux un
bouton » décrit une solution et un persona inventé; « quand je rentre du
travail à 20h et que je n'ai rien prévu, je veux… » décrit une situation
réelle, et laisse la solution ouverte.

Deux ou trois. Au-delà, la fonctionnalité en recouvre plusieurs.
-->

## 3. Périmètre

### Dans le périmètre
<!-- Ce qu'on construit. -->

### Hors périmètre — engageant
<!--
❌ Ce qu'on s'INTERDIT, et pourquoi. Cette liste a la même force que celle du
dessus: un no-go se lève par une décision écrite, jamais par une envie en cours
de route.
-->

## 4. Le circuit

<!--
Le parcours de bout en bout, acteur par acteur. Un schéma ASCII vaut mieux
qu'un paragraphe: il rend visible l'endroit où deux chemins se rejoignent, qui
est toujours l'endroit où ça casse.
-->

## 5. Modèle de données

<!--
Ce qui est STOCKÉ, et d'où ça vient (saisi ? dérivé ? classifié ?). Pour chaque
champ dérivé, dire par quoi — un champ dont personne ne sait qui l'écrit est un
champ qui divergera.

Néant si la fonctionnalité ne persiste rien. Le dire.
-->

## 6. Règles et garanties

<!--
Les invariants, numérotés `R1`, `R2`… avec le POURQUOI de chacun. C'est la
section la plus utile de la fiche: elle est ce qu'on relit six mois plus tard
avant de « simplifier » quelque chose.

Une règle sans raison est une règle qu'on retirera.
-->

| # | Règle | Pourquoi |
|---|---|---|
| R1 | | |

## 7. Modes de défaillance

<!--
Ce qui casse, et le comportement ATTENDU quand ça casse. Pas « on gère
l'erreur »: dire ce que l'utilisateur voit.

Traiter en priorité les échecs SILENCIEUX — ceux qui ne lèvent rien et
dégradent en douce. Ce sont ceux qui coûtent le plus cher dans ce dépôt.
-->

| Situation | Comportement attendu |
|---|---|

## 8. Critères d'acceptation

<!--
En Given/When/Then, pour qu'ils soient directement transposables en tests.
Chacun doit être vérifiable sans ouvrir le code.
-->

```gherkin
Étant donné …
Quand …
Alors …
```

## 9. Rabbit holes

<!--
Les endroits où l'on peut se perdre, repérés AVANT d'y tomber. Le piège
technique connu, la frontière difficile à tenir, le coût qui explose.

Néant est une réponse valide — mais rare, et suspecte.
-->

## 10. Ce qu'on mesure

<!--
Comment on saura que ça marche. Et surtout: la CONTRE-MESURE, le chiffre qui
dirait que la fonctionnalité coûte plus qu'elle ne rapporte. Une fonctionnalité
sans contre-mesure ne peut jamais être jugée mauvaise.
-->

## 11. Questions ouvertes

<!--
Ce qui n'est pas tranché. Les laisser ici est honnête; les trancher en silence
dans le code ne l'est pas.

Néant quand tout est arbitré.
-->
