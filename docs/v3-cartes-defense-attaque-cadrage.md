# Cartes Defense Et Attaque

## Etat Retenu

Ce document résume le cadrage retenu pour les cartes du labo.

- `Carte de defense` = quoi faire dans l'immediat quand quelque chose surgit
- `Carte d'attaque` = quoi mettre en place en amont pour prendre de l'avance
- `Potion` = gestion d'un etat emotionnel ou physiologique difficile
- `Carte de soutien` = a supprimer, car trop floue et redondante avec les potions

Le routage intelligent entre defense / attaque / potion est mis de cote pour l'instant.
Le produit doit proposer un parcours defense et un parcours attaque distincts.

---

## Carte De Defense

### Definition

La carte de defense sert a reagir dans l'instant, face a un moment ou quelque chose surgit:

- pulsion
- contexte
- situation
- environnement
- declenchement interne

### Taxonomie Retenue

Pour chaque carte de defense:

- `Le moment`
- `Le piege`
- `Mon geste`
- `Plan B`

Cette taxonomie a ete retenue parce qu'elle est:

- simple
- concrete
- memorisable
- plus naturelle pour le cerveau que `environnement / declencheur / defense`

### Intention Produit

Une carte de defense doit raconter une scene claire:

- dans quel moment je me fais embarquer
- ce qui m'attrape
- ce que je fais a la place
- quoi faire si le premier geste ne passe pas

### Notes UX

- Le vocabulaire `environnement / declencheur / defense` ne doit pas etre expose tel quel au user
- Le user ne pense pas naturellement en termes aussi conceptuels
- L'experience doit rester tres immediate et actionnable

### Parcours Retenu

Le parcours de creation d'une carte de defense doit etre le suivant:

1. question d'entree:
   - `Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?`
2. mini questionnaire:
   - 3 questions maximum
3. generation de la carte de defense
4. possibilite de modifier chaque champ de la carte

Le questionnaire doit rester tres court et tres concret.

Exemple de logique de questionnaire:

- `Quand est-ce que ca arrive le plus souvent ?`
- `Qu'est-ce qui t'embarque a ce moment-la ?`
- `Qu'est-ce que tu pourrais faire a la place, de simple et realiste ?`

### Rattachement Plan Ou Hors Plan

Le besoin produit retenu est le suivant:

- une carte de defense pourra etre liee a un plan
- ou rester hors plan dans un espace intemporel du labo

Cette structure n'existe pas encore techniquement dans le produit, mais elle doit etre prise en compte dans la conception future.

Au moment de creer une carte de defense, il faudra a terme verifier si elle est:

- en lien direct avec un plan actif
- en lien avec un second plan actif
- ou sans lien avec un plan, donc a ranger dans l'espace hors plan

L'important ici est de ne pas enfermer l'utilisateur dans le plan si son besoin est plus large, recurrent ou intemporel.

---

## Carte D'Attaque

### Definition

La carte d'attaque sert a prendre de l'avance.

Elle ne sert pas a reagir sur le moment, mais a installer quelque chose en amont pour:

- rendre le bon comportement plus probable
- rendre l'abandon moins facile
- diminuer le besoin de volonte brute

### Positionnement

La carte d'attaque ne doit pas demander au user un haut niveau d'abstraction ou de culture dev perso.

Il ne faut pas lui demander de decrire des mecanismes psychologiques complexes.

A la place:

- on explique le concept dans un depliant
- il peut ajouter une carte d'attaque
- on lui propose un eventail de techniques sous forme de cartes
- chaque technique ouvre sur un mini parcours specifique
- il peut tester plusieurs techniques

### Structure D'Une Carte D'Attaque

Chaque carte d'attaque doit afficher:

- `Pour quoi`
- `Objet genere`
- `Mode d'emploi`

Le `mode d'emploi` doit etre visible sur la carte.

---

## Les 6 Techniques Retenues

### 1. Texte De Recadrage

But:

- aider l'utilisateur a se recaler quand il sent qu'il decroche d'une action importante

Questionnaire:

- Par rapport a quelle action tu veux tenir ?
- Qu'est-ce qui te fait decrocher d'habitude ?
- Tu veux que le texte te remette dans quel etat : determination, calme, discipline, confiance ?

Generation IA:

- un texte court a ecrire ou relire

Mode d'emploi:

- des que tu sens que tu commences a lacher, tu l'ecris ou tu le relis pour te recaler avant d'abandonner

### 2. Mantra De Force

But:

- donner de la force interieure et remettre l'utilisateur dans son axe

Questionnaire:

- Par rapport a quoi tu veux etre plus fort ?
- Pourquoi c'est important pour toi de tenir ?
- Tu veux un ton plutot calme, noble, ou percutant ?

Generation IA:

- un mantra de taille moyenne

Mode d'emploi:

- le matin au reveil, tu le repetes 3 fois
- tu peux ensuite le repeter autant que tu veux dans la journee

### 3. Ancre Visuelle

But:

- associer un engagement a un rappel visuel concret

Questionnaire:

- Quel engagement tu veux garder vivant ?
- Pourquoi c'est important de le tenir ?
- Dans quel environnement tu passes le plus de temps ?

Generation IA:

- une proposition d'ancre concrete
- une phrase courte ou mini-mantra a associer a l'ancre

Mode d'emploi:

- a chaque fois que tu vois l'ancre, tu te recites la phrase et tu te rappelles ton engagement

### 4. Rituel De Depart

But:

- aider a commencer avant que le mental negocie trop

Questionnaire:

- Par rapport a quelle action tu bloques ?
- Qu'est-ce qui bloque le plus souvent ?
- A quel moment de la journee ca arrive ?

Generation IA:

- une micro-sequence de demarrage

Mode d'emploi:

- des qu'il y a une micro-hesitation, tu fais la premiere micro-action sans reflechir
- le but est de lancer le mouvement, pas de tout reussir d'un coup

### 5. Preparer Le Terrain

But:

- faciliter le bon comportement en preparant l'environnement a l'avance

Questionnaire:

- Par rapport a quelle action tu veux te faciliter la vie ?
- Est-ce que tu prepares deja quelque chose en amont ?
- Quel est le moment ou cette action devrait idealement se faire ?

Generation IA:

- une routine simple de preparation du terrain

Mode d'emploi:

- le plus tot possible dans la journee, tu mets le terrain en place pour que l'action soit plus facile a enclencher

### 6. Pre-engagement

But:

- rendre l'engagement plus reel en le partageant ou en le formalisant

Questionnaire:

- Par rapport a quoi tu veux t'engager plus clairement ?
- Avec qui tu pourrais passer ce petit contrat ?
- Quel type d'engagement tu es pret a annoncer vraiment ?

Generation IA:

- un contrat tres court, imprimable ou montrable

Mode d'emploi:

- tu vas voir la personne
- tu lui expliques que tu as besoin d'aide pour tenir ce cap
- tu lui montres ou lui donnes le contrat signe

---

## Frontieres Entre Les Outils

### Defense

- quand ca surgit
- quoi faire tout de suite

### Attaque

- avant que ca surgisse
- quoi installer en amont

### Potion

- quand l'etat emotionnel ou physiologique prend trop de place

### Soutien

- retire du perimetre

---

## Notes Importantes

- Le parcours d'attaque doit rester tres concret et produire un objet tangible a la fin
- L'utilisateur doit pouvoir tester plusieurs techniques d'attaque en parallele
- Le langage expose au user doit rester simple, direct et non conceptuel
