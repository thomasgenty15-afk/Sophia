# Go-to-market — les 30 prochains jours

> Écrit le 2026-08-18. Suite opérationnelle de [PREMIERS-1000.md](PREMIERS-1000.md).

## Le but du mois, et ce n'est pas 1000 utilisateurs

> **10 foyers réels qui utilisent le produit, et la réponse à UNE question :
> le plan survit-il à la semaine 2 ?**

Viser 1000 en un mois, depuis un produit **qui n'est pas déployé**, seul, serait un plan
d'affichage. Le palier P0 de l'étude ne coûte rien et répond à la seule question qui peut
tuer le projet. Les 1000 sont un objectif de trimestre, et ils dépendent entièrement de ce
mois-ci.

**Le signal qui compte, un seul :** un foyer génère un **deuxième plan sans qu'on le lui
demande**. Pas une inscription, pas un compliment en visio — un deuxième plan.

---

## J0 → J3 — les trois jours que tu te donnes

Deux choses seulement, et elles ne sont pas négociables sur ce segment.

### ① ~~Le verrou de régime alimentaire~~ — ✅ CÂBLÉ le 2026-08-18

La voie individuelle n'appliquait pas le régime, et la racine était une **position** :
`declaredRegime` était lu ~300 lignes SOUS `buildMealPrompt`. À l'endroit où on lisait le
régime, le prompt était déjà construit — on déclarait donc à un végane qu'il manquerait de
B12, dans un plan qui lui servait du poulet.

**En place :** la consigne (`dietaryRegimePromptLine`, placée **au-dessus de la doctrine du
coach** — un coach qui construit sur le poulet n'a pas écrit sa méthode pour un végane) et la
vérification déterministe de sortie (`excludedSurfaceFormsFor` × `findForbiddenMatches`, sur
titre + `why` + **ingrédients**, en FR et EN). La ceinture mesure **l'expansion**, jamais le
jeton — s'armer sur « vegan » ferait rejeter les bonnes réponses. Sortie **comptée, pas
refusée** : refuser viderait la semaine entière pour un lardon dans un seul plat.

**Prouvé par mutation :** désarmer la consigne rougit ; redescendre la lecture sous
`buildMealPrompt` rougit aussi — c'est ce second test qui tient le lot.

> ⚠️ **RESTE À FAIRE, et c'est la seule preuve qui manque :** dix générations réelles pour un
> foyer avec un allergène **et** un régime déclarés, **sorties lues**. Redémarrer
> `functions serve` d'abord — le runtime ne recharge pas un `_shared` modifié, et
> `meal_generation.ts` en est un. Sans ce redémarrage, le run teste l'ancien code.

### ② L'évaluation de la qualité des plans — une journée

**Rien dans le dépôt n'évalue si un plan est bon.** Les verdicts mesurent la conformité
(enveloppes, couverture, verrous), jamais la qualité.

20 plans générés, relus à la main contre une grille écrite : faisable en vrai ? appétissant ?
varié sur 7 jours ? la logistique tient-elle (durée de vie au frigo, temps de session) ? Un
verdict par plan, écrit.

**Pourquoi c'est un prérequis et pas du luxe :** sans cette base, aucun retour de foyer ne
sera interprétable. Un foyer qui abandonne — tu ne saura pas si c'est le produit ou un
mauvais plan ce jour-là. Tu aurais dix témoignages et zéro conclusion.

### ③ Si le temps le permet — prouver les deux lots non joués

Les lots A (aperçu depuis l'inscription) et C (`member_id` sur un plat dédié) sont **livrés en
code et jamais joués en run réel** — le runtime edge était éteint. Un run réel chacun.

---

## Semaine 1 — mettre en ligne, et prouver qu'un inconnu peut entrer

**Aucune acquisition cette semaine.** Le produit n'est pas en ligne : 193 migrations, rien en
production.

### Les portes humaines

`docs/keel/DEPLOY.md` est **une séquence, pas une checklist** — l'ordre est la moitié du
contenu. Les commandes marquées 🔒 ne se délèguent pas : `db push`, `functions deploy`,
`secrets set`. Elles se copient-collent, par toi.

⚠️ **Le piège déjà payé une fois :** l'allowlist CORS de production pointée sur des origines
de développement. Variable posée = repli désarmé = **toutes les fonctions edge en 403**. À
vérifier avant de croire qu'un déploiement a marché.

### Le français, sur la page qui convertit

Mesuré le 2026-08-14 : `/start` rend l'en-tête et le pied de page en **français** et **tout
le corps en anglais** — et tout visiteur au navigateur français y atterrit sans rien cliquer.
Sur une cible de familles françaises, c'est la page de conversion qui est cassée. Les clés
existent, le namespace est en attente de traduction.

### La porte de sortie de la semaine

> **Un inconnu, sur son téléphone, crée un compte et obtient un plan.**

Pas toi sur ton Mac. Quelqu'un d'autre, sur son matériel, sans que tu touches le clavier.
Tant que ce n'est pas vrai, on ne parle à personne.

---

## Semaine 2 — 10 foyers, recrutés à la main, dans ton réseau

### ⛔ Pourquoi PAS les associations cette semaine

AFDIAG compte **~5 000 familles adhérentes**. AFPRAL a dix antennes. Ce sont des canaux
**rares et à un coup** — et le segment se parle à lui-même, ce qui est précisément pourquoi
il est bon. Y arriver avec un produit non éprouvé, c'est brûler l'actif d'acquisition le plus
précieux de tout le plan.

**Règle du mois : on n'approche aucune communauté avant qu'un inconnu ait réussi à s'en
servir.**

### Qui, et par quelle question — mis à jour le 2026-08-18

**La tête de pont « contrainte médicale » est abandonnée** (motif : acquisition, voir
PREMIERS-1000 §2.3). On qualifie sur **la divergence**, pas sur l'allergie.

**La question, à poser telle quelle :**

> *« Chez vous, est-ce que tout le monde mange la même chose ? »*

**Puis la seule qui décide — et c'est la révision du 2026-08-18 au soir :**

> *« Combien de raisons différentes font que non ? »*

**Le qualifieur est un COMPTE, pas une catégorie.** Une contrainte seule se simule (Jow met
un filtre, Mealime met un profil) ; deux ou trois en même temps, réconciliées dans une seule
cuisson, personne ne le fait. À 0 ou 1 contrainte on n'est pas meilleur que le gratuit ; à 2
c'est notre terrain ; à 3 et plus le foyer souffre déjà et le sait.

Et **ce qui compte comme contrainte est large** — six types en base, dont l'allergie n'est
qu'un cas : allergie, intolérance, régime, religieux ou éthique, condition médicale ; plus ce
qui dimensionne (objectif, activité, âge), ce qui décale (rythme, absences) et ce qui refuse
(le goût). Les deux divergences les plus universelles ne sont pas médicales : **le rythme**
et **l'âge**.

> **📋 À NOTER POUR CHAQUE FOYER APPROCHÉ, même ceux qui refusent : le compte de
> contraintes.** Sur 10 foyers abordés au hasard, combien en ont ≥ 2 ? C'est le seul chiffre
> qui dimensionne le marché réel (PREMIERS-1000 §2.5), et aucune source publique ne le donne.
> Il ne coûte rien à collecter et il vaut mieux que n'importe quelle estimation.

Une allergie qui se présente reste ta meilleure cohorte — tu la traites comme telle, tu ne la
chasses plus.

**Deux sources, cinq foyers chacune — et c'est un test comparatif, pas un remplissage :**

| Source | Comment | Ce que ça teste |
|---|---|---|
| **Sortie d'école** (maternelle d'abord) | via l'**association de parents** ou le **groupe WhatsApp de classe**, jamais le portail à froid — tu arrives invité, la confiance existe, et une recommandation s'y propage | l'acquisition directe, et si la valeur se voit sans intermédiaire |
| **Un seul coach** qui te prête 5 clients | son client **est** le persona : un objectif à lui, une table à tenir. Son problème est que ce client échoue à la maison — donc ton produit garde ses clients | le canal qui scale (1 coach = 30 foyers, 1 conversation) et la rétention par un tiers qui relance |

À J+30, tu compares les **deuxièmes plans par cohorte**. C'est le produit qui répond, pas une
opinion.

⚠️ **Garde-fou coach, non négociable** — règle fondatrice de `CLAUDE.md` : *le coach ne
produit RIEN de personnel pour un élève.* Le pitch est **« ta méthode, appliquée à leur
foyer »**, jamais « tu leur fais leur plan ». Le coach publie sa doctrine une fois, chaque
foyer compose avec, et le produit garantit qu'elle est respectée — ce que Member Kitchens,
qui occupe ce créneau, ne peut pas promettre (*méthode affichée, pas tenue, aucun verrou
déterministe*).

Tu les installes **toi-même, en face-à-face ou en visio**, et tu regardes leur écran pendant
qu'ils passent l'entonnoir. C'est le seul moment du mois où tu verras ce qui bloque
réellement.

### Ce que tu ne fais pas

- ❌ **Tu ne factures pas.** À dix foyers, la question du prix pollue l'apprentissage.
- ❌ **Tu ne demandes pas « est-ce que tu aimes ? ».** Quelqu'un recruté par toi répond oui.
- ❌ **Tu ne comptes pas les inscriptions.** Un compte qui ne génère pas de deuxième plan est
  un échec déguisé en traction.

---

## Semaine 3 — regarder, réparer, instrumenter

**Le tableau de bord du mois, quatre lignes, relevées chaque jour :**

| | Où le lire |
|---|---|
| Combien ont généré un **deuxième plan** sans qu'on le demande | `student_generated_meals`, par compte |
| Combien ont **coché** au moins un repas | `meal_tick` |
| Ce que dit le **questionnaire de fin de plan** | `plan_feedback` — livré et prouvé en réel le 15/08 |
| Combien ont **acheté sur la vague** annoncée | l'état de vague |

Un entretien de 20 minutes par foyer, en fin de semaine, avec **une seule question ouverte** :
*« Raconte-moi le moment où tu as arrêté de suivre le plan. »* Pas « qu'est-ce que tu
aimerais ». Le passé se raconte, le futur s'invente.

**Tu corriges ce que trois foyers sur cinq signalent. Rien d'autre.** Un défaut vu une fois
est une anecdote.

---

## Semaine 4 — un seul canal, préparé, et la décision

### Le canal — un, choisi

Trois options, **classées par facilité d'accès** — l'ordre a changé le 2026-08-18 : le
qualifieur n'étant plus médical, les canaux médicaux ne sont plus les premiers.

**a. Une association de parents d'élèves, à l'échelle d'un groupe scolaire.** Le canal le
plus large et le moins gardé : la divergence y est la norme (deux enfants d'âges différents
suffisent), et on y arrive invité plutôt qu'à froid. C'est aussi là qu'on mesure le **compte
de contraintes** sur une population non filtrée.

**b. Trois coachs ou diététiciens.** Le meilleur fit structurel : leur client **échoue à la
maison**, ce qui est littéralement notre promesse. Le produit a déjà la machinerie — un
diététicien *est* un coach au sens du code (doctrine publiée, signature, interdits
appliqués). Et le payeur peut se déplacer hors du foyer, seule réponse sérieuse au problème
de prix. ⚠️ EatLove occupe ce canal avec 30 pathologies ; ce qui lui manque est le foyer.

**c. Une association de patients** (AFDIAG, antenne AFPRAL). Puissante mais **à un coup**, et
sur une population étroite. On n'y va qu'avec un produit éprouvé, et pas en premier.

**Mon conseil : (a) puis (b).** (a) donne le volume et le chiffre qui manque au
dimensionnement ; (b) donne le canal qui se répète — un coach = 30 foyers, une conversation.

### L'artefact d'approche

Un **plan réel, anonymisé, montré**. Pas une démo cliquable, pas un pitch : sept jours, les
sessions de cuisine, les vagues de courses, l'allergène absent, et les parts qui diffèrent.
C'est le seul document qui prouve quelque chose que les concurrents ne peuvent pas produire.

### La question du prix — posée, pas facturée

À J+30, à chaque foyer : *« Ce sera 11,99 € par mois, plus 1,99 € si tu veux
l'accompagnement. Tu continues ? »*

Et il faut savoir contre quoi tu te compares, parce que ce n'est **pas** le gratuit :
Mealime met la nutrition derrière un paywall à **2,99–5,99 $**, Samsung Food+ vend « profil
santé + objectifs + plan hebdo » à **6,99 $**, Jow est à **9,99 €**. Tu es au prix de
l'abonnement complet du marché, pas au-dessus — mais **2 à 4× au-dessus de sa couche santé**.

C'est tenable uniquement si l'écart se voit **avant** l'essai. Et depuis que le qualifieur
n'est plus médical, ce qui le rend visible n'est plus la contrainte, c'est **la
réconciliation** : *trois personnes, trois besoins, une seule cuisson*. D'où l'artefact
d'approche ci-dessus — un plan réel où les assiettes diffèrent se comprend sans explication.

⚠️ **Une intention déclarée n'est pas un paiement.** Note les réponses, ne les compte pas.

---

## La décision de J+30

| Ce qu'on observe | Ce qu'on en fait |
|---|---|
| ≥ 6 foyers sur 10 ont fait un **deuxième plan** | **On continue** : P1, on fait payer, on ouvre le canal |
| 3 à 5 | **On répare d'abord.** Le produit intéresse et ne tient pas — les entretiens disent où |
| ≤ 2 | **On s'arrête et on rouvre la question.** Soit le segment, soit la proposition. Pas « plus de marketing » |

---

## Les cinq règles du mois

1. **Rien ne part vers une communauté avant qu'un inconnu ait réussi seul.** Le canal
   associatif est à un coup.
2. **Le deuxième plan est la seule métrique.** Tout le reste est décoratif à cette échelle.
3. **On ne facture pas, on demande.** Et on n'inscrit pas une intention au crédit.
4. **On corrige ce que 3 foyers sur 5 signalent.** Pas ce qui nous démange.
5. **Avant tout foyer avec une contrainte médicale : le verrou prouvé sur dix sorties.**
   Le code est en place depuis le 2026-08-18 ; la preuve en run réel ne l'est pas. Un
   allergène coûte le foyer, la communauté, et la réputation — et sur ce canal, c'est
   terminal.
6. **On note le compte de contraintes de chaque foyer approché, même ceux qui refusent.**
   C'est le seul chiffre qui dimensionne le marché réel, il ne coûte rien à collecter, et
   aucune source publique ne le donne.
