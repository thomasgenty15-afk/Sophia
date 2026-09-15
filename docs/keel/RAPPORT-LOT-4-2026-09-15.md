# Lot 4 — les preuves sur le chemin réel

**2026-09-15.** Version figée : `64343422`. **5 appels modèle sur les 10 autorisés.**
Trois compositions réelles à travers Kong ; tout le reste — adoptions, refus, péremptions —
ne coûte rien, parce que l'adoption n'appelle jamais le modèle.

**Verdict : les correctifs tiennent sur le chemin réel, et deux défauts de plus ont été
trouvés et fermés. La campagne reste.**

## 1. Deux défauts que seul le chemin réel pouvait montrer

### Le second tap se bloquait lui-même

Le correctif du lot 1 — rendre le plan au lieu d'un refus quand le brouillon est déjà adopté —
passait tous ses tests. Ils appellent la fonction d'adoption **en direct**. Dans le vrai
handler, une porte tombe 5 600 lignes plus tôt : le second tap se heurtait à un refus de
chevauchement de fenêtre, où le plan qui « chevauche » est **celui que ce brouillon vient
d'écrire**. La personne voyait un refus sur son propre plan.

| | premier tap | second tap |
|---|---|---|
| avant | 200, plan `e629297a` | **409** chevauchement |
| après | 200, plan `e629297a` | **200**, le même plan, « rien écrit » |

Zéro appel modèle, zéro verrou laissé, un seul plan porte le brouillon.

C'est la leçon la plus importante de ce lot : **un test de module ne ferme pas un chemin de
handler.** Le correctif était juste, son test était vert, et le produit refusait quand même.

### Le refus mentait sur sa raison

Adopter le brouillon d'un **autre foyer**, ou un brouillon **inexistant**, rendait le même
refus de chevauchement. Rien n'était écrit — la protection tenait — mais la phrase envoyait la
personne changer une fenêtre qui n'y était pour rien. C'est la cicatrice connue du dépôt :
un refus loin du geste se lit comme un bouton mort.

Les deux rendent désormais « brouillon introuvable », 404, zéro écriture. Sans jeton : 401.

## 2. Ce que les trois compositions ont prouvé

| tir | foyer | chemin | durée | appels | réparations | verdict du plan |
|---|---|---|---:|---:|---:|---|
| 7 | 1 personne, maintien | aperçu | 121 s | 1 | 0 | adopté ensuite |
| 9 | 4 personnes, végane + omnivore + mineure | aperçu | **272 s** | 3 | 2 | livrable avec écarts |
| 8 | 2 personnes, végane + omnivore | direct | 125 s | 1 | 0 | **conforme** |

- **Le profil maintien compose.** Il était à 0 sur 5 depuis le début. Et le « + repas léger »
  se relit dans la source du moteur : B2 est tracé de l'écran jusqu'au prompt.
- **272 s dépasse** les 150 s de la passerelle hébergée et les 180 s du p95 proposé. C'est une
  mesure, pas un verdict : un tir ne fait pas un p95.
- **Le chemin direct est intact** après les changements du lot 4, et son plan sort conforme.

### Le contrôle d'énergie par bouche conclut, pour la première fois

Sur les plans écrits aujourd'hui, la liste des contrôles incomplets est **vide** et le contrôle
de sous-nutrition a quitté la liste des non-exécutés. Les deux ensemble veulent dire une seule
chose : le contrôle a couvert **toutes** les bouches et n'en a trouvé **aucune** sous-nourrie.

| | non exécutés | incomplets |
|---|---|---|
| avant (colonne réelle) | titre promettant une recette, **sous-nutrition** | courses × 2, **énergie par bouche × 1** |
| après | titre promettant une recette | *(vide)* |

Et la crainte que ce contrôle transforme tout plan en « livrable avec écarts » ne s'est pas
réalisée : le plan N=2 est **conforme**, sans aucun écart.

### Le reste, prouvé sans dépenser

- **Une allure changée périme l'aperçu.** Posée sur Lea entre la composition et le tap, elle
  rend « aperçu périmé » avec les deux empreintes visibles, zéro écriture ; remise, l'adoption
  passe et écrit exactement un plan.
- **Réconciliation, sept cas dont deux plans frais : 6 réconciliés.** Le seul défaut restant
  est l'achat orphelin d'un plan **historique**, que la cause du lot 3 nomme désormais.
- Le banc distingue trois choses qu'il confondait : un déficit, un arrondi de croissance borné
  par la marche **mesurée** de l'escalier, et un reste de composition sans croissance — qu'on
  nomme sans inventer de seuil pour le refuser.

## 3. Ce qui reste

**La campagne.** Les cinq appels restants de l'enveloppe ne suffisent pas : deux pilotes et
30 tirs demandent 60 à 70 appels, environ 1 h 15 de runs. C'est la décision qui restait
ouverte après le lot 4.

Avant de la prendre, deux chiffres méritent d'être regardés ensemble :

- sur trois tirs, deux passent sous 150 s et un monte à 272 s ;
- le taux sans rattrapage est de 2 sur 3, quand le critère de lancement demande 24 sur 30.

Trois tirs ne décident de rien. Mais si la campagne confirme cette dispersion, le blocage ne
sera ni la garde ni la réconciliation — ce sera **le premier jet du modèle**, qui est un
chantier séparé et non commencé.

**Non fait, et c'est dit :** aucun parcours dans un navigateur (les preuves sont passées par la
fonction edge à travers Kong, ce qui couvre le serveur mais pas le rendu des phrases à
l'écran) ; aucune migration distante ; aucun déploiement. Le 502 du pilote du 14 reste
inexpliqué : les journaux de sa fenêtre ont disparu avec un redémarrage de conteneur.
