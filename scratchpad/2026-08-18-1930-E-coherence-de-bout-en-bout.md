# E — la cohérence de bout en bout

**2026-08-18 · à partir de 19h30** · branche `ff-001-quotidien-du-coach`.
**Aucun push, aucun merge, aucune commande à risque.**

> Écrit **au fil de l'eau** et commité à chaque section (l'infrastructure coupe
> toutes les ~10 min). Ce qui n'a pas pu être vérifié est marqué **NON VÉRIFIÉ**,
> jamais deviné.

## Comment lire

- ✅ vu à l'écran ou mesuré, preuve à côté — 🟥 **rouge** : pas tenu, ou pas prouvé
- ⚠️ tenu, avec une réserve qu'un humain doit connaître
- Chaque défaut porte son `fichier:ligne`.

## Le harnais

- Serveur de dev **dédié** : `frontend-e`, port **5198** (aucune autre lane
  dessus ; origine distincte ⇒ pas de session partagée).
- Persona : **`laneb-owner-…@test.dev`**, maître du foyer **Bramble**
  `80e9af4c`, mot de passe de fixture `1234567` **vérifié avant de viser**.
  Session ouverte par l'API depuis la page (aucun mot de passe tapé dans un
  formulaire, aucun jeton affiché).
- ⚠️ **Comptes QA partagés touchés** : voir la section « Ce que j'ai écrit dans
  la base » en fin de rapport. Rien n'est fait avancer sans être écrit ici.

---

# PARTIE A — les deux questions de l'utilisateur

## A1. « Où est le questionnaire de préférences (habitudes, allergies, dégoûts, shaker) qui devait être en pop-up à l'étape 3 de l'inscription ? »

**Réponse courte : il existe, il est complet, et il n'est PAS dans l'inscription.
Il n'est monté que sur `/app/household`.**

Vu à l'écran (port 5198, maître de Bramble, 1280 px). Le pop-up s'ouvre par
« Fill in my details » sur la carte du maître et porte bien **six blocs** :

| # | Bloc, tel qu'il s'affiche |
|---|---|
| 1 | WHO THEY ARE — prénom + date de naissance |
| 2 | WHICH WAY THE SCALE SHOULD GO — direction (3 choix) |
| 3 | THEIR BODY — taille, poids, sexe + HOW ACTIVE THEY ARE |
| 4 | WHAT THEY ALREADY EAT — *(dépliable)* |
| 5 | ANYTHING THEY ARE ALLERGIC TO? — *(dépliable)* |
| 6 | WHAT THEY WILL NOT EAT, AND HOW THEY EAT — *(dépliable)* |

Les blocs 4-5-6 sont exactement le « questionnaire de préférences » attendu.

**Pourquoi il est absent de l'inscription** : `MouthFormDialog` n'a **qu'un seul
site de montage dans tout le dépôt**, `frontend/src/keel/pages/HouseholdPage.tsx`
(commit `92cef98b`). `frontend/src/keel/pages/SetupPage.tsx` n'en porte **zéro**
occurrence. Le tunnel n'a donc jamais reçu ce pop-up — ce n'est pas une
régression, c'est un montage qui n'a pas été fait.

🟥 **Conséquence pour un nouvel inscrit** : à l'inscription il ne voit ni ses
habitudes, ni ses allergies, ni ses dégoûts, ni son shaker. Il ne les rencontre
qu'en allant de lui-même sur `/app/household` **après** l'inscription. Rien à
l'écran ne l'y envoie.

## A2. « Pourquoi le poids visé et le rythme par semaine ne s'affichent pas quand je choisis perdre / prendre ? »

**Réponse courte : sur `/app/household` ils s'affichent — mais le curseur est
retenu derrière le corps, et le corps est DESSOUS. Dans le tunnel d'inscription,
ils n'existent pas du tout.**

### Sur `/app/household`, mesuré clic par clic

Au clic sur « Losing fat », le pop-up rend **immédiatement** :

```
WEIGHT THEY ARE AIMING FOR (KG)          ← le champ EXISTE (#mouth-target-weight)
With the pace below, this gives a date to arrive on.
Fill in height, weight and sex below and the pace slider appears.   ← à la place du curseur
```

Puis, taille `178`, poids `85`, sexe `male` saisis (toujours sans avoir touché
au cran d'activité) :

```
HOW FAST
0.45 kg a week
The top of this slider is set by their body — it is the fastest pace the plan can actually cook.
<input type=range min=0.05 max=0.45 step=0.05 value=0.45>
```

✅ Le champ de poids visé et le curseur **s'affichent bien**.
⚠️ **Mais le pop-up du maître s'ouvre avec un corps VIDE** (le compte Bramble n'a
ni taille, ni poids, ni sexe). Un maître qui choisit « perdre » voit donc, en
l'état, un champ de poids visé **et pas de curseur**, avec une phrase qui lui
demande de remplir un bloc situé **plus bas dans la fenêtre**. C'est très
exactement le symptôme décrit. Ce n'est pas muet — la phrase est là — mais
l'ordre des blocs met la cause **après** l'effet.

**C'est une décision qui appartient à l'utilisateur** : soit on remonte le bloc
« corps » avant le bloc « direction », soit on garde l'ordre actuel et on rend la
phrase plus impérative. Rien n'a été changé.

### Dans le tunnel d'inscription : rien

_(mesure en cours — section A2bis)_

---

_(la suite du parcours est ajoutée au fil de l'eau)_
