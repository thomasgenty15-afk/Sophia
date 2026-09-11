# Lot H — la PORTÉE manque à la déclaration de sécurité

## Le défaut, mesuré par une session voisine le 2026-09-04

« On mange végétarien le lundi soir » ⇒ `student_safety_constraints` du
titulaire, `kind: diet`, `severity: strict` ⇒ **tout le foyer mange végétarien à
tous les repas**, invisible à l'écran.

## La chaîne, en trois maillons, chacun juste séparément

1. `SAFETY_DECLARATION_PROMPT_BLOCK` : « a diet is NOT a preference… goes here ».
   **Aucune notion de portée.**
2. `member_id: null` = « la personne qui écrit » ⇒ le titulaire.
3. `DEFAULT_SEVERITY.diet = "strict"`, et une contrainte dure d'une bouche
   gouverne tout le foyer (`safety_constraints.ts`, doctrine assumée).

⛔ **On ne touche NI 2 NI 3.** Le `null` est juste (« je suis végétarienne » n'a
pas de sujet). Le défaut de sévérité est juste et son commentaire le dit : trop
bas produirait une contrainte **inerte**, la pire des trois issues. Et la
gouvernance par le foyer est la doctrine, pas un bug.

**Le trou est en 1, et il est à la SOURCE.**

## Le correctif, sur la ligne de la clé

Le bloc a déjà le bon patron : il sépare goût et sécurité **sur la ligne de
`kind`**, avec un exemple travaillé (« no peanuts, they make me ill » contre
« I don't like peanuts »), et un test le tient. On ajoute le second
discriminant — la PORTÉE — au même endroit et de la même façon :

> une ligne de sécurité vaut à **CHAQUE** repas, pour de bon. Si la note
> l'attache à un jour, à un moment ou à une fréquence, ce n'est pas une ligne de
> sécurité quels que soient les mots. **Un régime d'un soir par semaine n'est
> pas un régime, c'est un rythme.**

## ⚠️ Ce que ce correctif NE fait PAS, et il faut le dire

**Une consigne de prompt régresse en réel** — c'est la loi que
`household_restriction_lock.ts` a tirée d'un run : le prompt interdisait de
commenter les règles de maison, et le modèle a écrit « SANS NUTELLA ».

Donc :
- il faut un **compteur** (`safety.declared` par `kind`) pour voir la
  régression, et une **mesure réelle** sur une note de rythme ;
- et la sortie DURE — refuser, ou **demander** — reste ouverte.

⛔ **Refuser par un matcher sur le texte est la mauvaise sortie** : un faux
positif JETTERAIT une vraie ligne de sécurité (« je suis allergique aux
arachides depuis lundi »). C'est fail-open sur la sécurité, la seule direction
qu'on n'a pas le droit de prendre.

**La sortie juste est la CLARIFICATION** : le canal existe
(`MEMORY_CLARIFICATION_ABOUTS`), et la question est courte — « tu manges
végétarien le lundi soir : est-ce que ça vaut pour tous tes repas ? ». Mais
c'est le lot de la session qui tient la chaîne de mémoire, pas le mien.
