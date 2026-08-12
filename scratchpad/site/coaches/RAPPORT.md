# RAPPORT — `/coaches`, le praticien qui vend une formation

> Agent 4 · branche `ff-001-quotidien-du-coach` · namespace i18n **`coaches`**
> Livrables : `frontend/src/keel/pages/CoachesPage.tsx` (**489 lignes**, ESLint propre),
> `keys.en.ts` / `keys.fr.ts` (**107 clés, jeux identiques**), 4 SVG, cette note,
> et `maquette-de-jugement.html` (la page vue en vrai avant qu'elle ait une route ;
> comme `design/hero.html`, elle ne va pas au dépôt).

---

## 1. La recherche, en 5 lignes

1. **Le déclencheur est un seuil de charge, pas le temps** : on s'équipe vers 15-30 élèves,
   quand ils commencent à décrocher. Le temps gagné ne signe pas seul — il signe converti en
   revenu (« la promo suivante plus grande, sans recruter »).
2. **L'objection de fond de la catégorie** : *« ce qu'on paie 3 000 $, c'est ton temps, ta voix
   et ton jugement »*. Le sous-texte : un clone générique. La réponse qui porte est que la
   doctrine est **écrite**, pas devinée.
3. **La peur n°1 est la contradiction publique**, et ce qui rassure n'est pas une promesse,
   c'est **une réponse bloquée qu'on montre**. C'est ce que fait la figure du bloc sombre.
4. **Le trou du marché** : Trainerize/TrueCoach/Practice Better facturent par palier de clients,
   Coachvox (83 $/mois) vend *la voix*, Delphi (79-299 $) vend *la source citée*. **Personne ne
   vend la relecture avant envoi.** 7 €/élève sans forfait se lit « tu ne paies que ce qui sert ».
5. **Clichés à fuir** (tous évités) : « all-in-one », « clone yourself / AI version of you »,
   « scale without burnout », « 24/7 », « autopilot », badge « trusted by 50 000 », et
   « human in the loop » sans montrer le mécanisme.

## 2. Le message, en 12 phrases

1. Ta formation se termine ; ton coaching, non.
2. Les modules sont enregistrés, la cohorte est pleine, la méthode est bonne.
3. Puis c'est mardi soir, un élève a une question qui n'est dans aucun module, et personne qui
   pense comme toi n'est là.
4. Tu écris ta méthode une fois, dans un entretien guidé : convictions, lignes rouges, ce que tu
   dis à la place, vocabulaire.
5. Elle est ensuite écrite dans les quatre choses que Sophia compose pour un élève — son chat,
   la semaine qu'il compose, les repas qu'elle lui propose, les repas de son foyer.
6. Ça, c'est une consigne, et une consigne est suivie *presque* toujours.
7. Alors il y a une seconde chose, qui n'est pas une consigne : ce qu'elle écrit dans le chat est
   relu contre tes lignes rouges avant d'être envoyé, par du code, sans modèle dans la boucle.
8. Ce qui part à la place n'est pas de nous : chaque ligne rouge porte ta phrase, signée de ton nom.
9. Ton élève ne reçoit jamais un refus, jamais un « demande à ton coach ».
10. Le lundi, tu lis une page rendue par un gabarit à partir de ce qui s'est passé, et là où il
    n'y a pas de chiffre, elle écrit « no number to show » au lieu de combler le trou.
11. 7 € par élève et par mois, pas de forfait, pas de palier ; tu arrêtes de payer le mois où tu
    éteins un siège.
12. Ce que vaut un élève qui reste, c'est ton chiffre — nous n'avons pas de chiffre de rétention
    à te vendre, et nous n'allons pas en inventer un.

## 3. Les décisions

| # | Décision | Pourquoi |
|---|---|---|
| D1 | **Le bloc sombre est dépensé sur la relecture, formulée en deux temps** (consigne / mécanisme) | B8b. C'est le seul argument que personne ne vend dans ce voisinage, et l'aveu (« ça, c'est une consigne ») est ce qui rend la garantie croyable. Sur-vendu, il devenait invérifiable |
| D2 | **La figure du bloc sombre montre un message RETENU**, pas une réponse réussie | La recherche est nette : ce qui rassure un coach, c'est de voir le refus, pas la performance. La substitution est signée « — Marc », comme `signAsCoach` |
| D3 | **Deux citations produit rétablies** : « **built** themselves a week » (B13) et « How was today? / All good · So-so · Rough » | L'ancienne page paraphrasait les deux en prétendant citer. La seconde n'était dans aucun brief : `daily_pulse.ts:84-88` dit « All good / So-so / Rough », la page disait « Good / Mixed / Hard » |
| D4 | **Le problème et la journée sont une seule section** | Les trois questions d'élève sont suivies immédiatement de la figure qui y répond. Une section « douleur » sans figure aurait été le seul mur de texte de la page |
| D5 | **Pas de « pas de score d'adhérence »** malgré la tentation | B15 : la ligne est vraie en pratique et vivante en code. La page dit ce qu'elle FAIT (« no number to show »), pas ce que le produit promet |
| D6 | **Pas de redirection d'un visiteur connecté, pas de `ServerUnreachable`** | `LandingPage` les portait parce qu'elle était `/`. `/coaches` n'est plus l'adresse d'arrivée d'un compte ; l'audit §2 réserve `ServerUnreachable` à `/` et `/pro` |
| D7 | **Un seul CTA**, `/auth?role=coach`, trois fois. La porte `/start` disparaît | Elle vendait une seconde offre à un autre acheteur, au-dessus de la ligne de flottaison |
| D8 | **La section prix n'a pas de figure SVG** : son objet est la `PriceCard` | Le test « titres + figures » passe quand même : un prix en Young Serif à 4xl est l'objet le plus lisible de la section |
| D9 | **En FR, les chaînes que la page prétend citer restent en anglais** | Le fichier legacy traduit les maquettes (« Ça a donné quoi, aujourd'hui ? »). Ici la légende annonce « mot pour mot » : traduire ferait de la légende un mensonge, exactement comme « wrote » pour « built ». Les EXEMPLES (bulles, substitution, note) sont en français ; la frontière est visible à l'œil, et c'est l'effet recherché. Édition locale si le propriétaire préfère la règle legacy — clés listées dans l'en-tête de `keys.fr.ts` |
| D10 | **Composition française de la charte appliquée** (’ et U+00A0, jamais U+202F) | CHARTE §3. Le fichier FR legacy n'a aucune insécable et 137 apostrophes droites : c'est lui qui est en retard, pas l'inverse |

## 4. Les claims, et leur ancre

Chaque claim porte son ancre en commentaire JSX dans la page.

| Claim rendu à l'écran | Ancre |
|---|---|
| La méthode est écrite dans 4 choses (chat, semaine, repas, repas du foyer) | **B10** |
| On la révise quand on veut, on revient en arrière sans perdre l'historique | **B28** |
| Essai 14 jours, 3 élèves, puis ça s'arrête tout seul | **B5** |
| Les élèves entrent par invitation e-mail (pas de lien à copier) | **B32** |
| Aucune boîte de réception côté coach | **S1** (MODEL.md) |
| Un tap le soir, trois boutons, un message par jour | **B22** |
| La relance part aussi sur « mitigé », pas seulement « dur » | **B23** |
| La méthode entre dans le chat, chaque semaine, chaque repas — c'est une consigne ; la relecture du chat contre les lignes rouges est déterministe, sans modèle | **B8b** (corrige B7 + B8) |
| Chaque ligne rouge porte son `instead`, dans les mots du coach, signé de son nom | **B9** |
| Le lundi : cron hebdo, texte rendu par gabarit, jamais narré par un modèle | **B11** |
| Les trois phrases de la synthèse, verbatim | **B12** |
| « built themselves a week », et pas « wrote » | **B13** |
| Seuils 48 h / 120 h, mesurés sur le dernier message entrant | **B14** |
| « no number to show » là où il n'y a pas de chiffre | **B14** + `CoachWeeklyPage.tsx:272` |
| Note 1:1 : un champ, un élève, 1 500 caractères, incluse à l'export RGPD | **B26** |
| « jamais citée » = une consigne, pas une vérification — dit comme tel | **B26** (réserve) |
| La base refuse une ligne de semaine qui ne cite aucune conviction | **B27** |
| 7 €/élève/mois, pas de forfait, pas de palier | **B1** |
| On arrête de payer le mois où on éteint un siège | **B4** |
| Il faut au moins un élève rattaché pour s'abonner | **B6** |
| On ne facture jamais l'élève | **S12** |
| « nous n'avons pas de chiffre de rétention à te vendre » | **B31** |
| Question du soir et trois boutons, mot pour mot | `daily_pulse.ts:114` et `:84-88` |
| « What you have noticed about them » | `CoachNoteCard.tsx:111` |

**Claims de l'ancienne page volontairement supprimés** : « chaque message sortant est vérifié »
(B8, faux pour « chaque »), « la doctrine entre à chaque message » (B7), « positif dès le premier
élève » sans réserve (B6), le bloc calories (S11/C15 — la page ne parle pas de chiffres), et les
quatre bornes de la note réduites à deux (les deux vérifiables).

## 5. Les silences reportés

Les douze silences de l'audit §9 sont **recopiés dans l'en-tête de la page**, adaptés à sa
nouvelle adresse — et chacun est tenu dans la copie :

- **S1** aucun canal 1:1 : la note du hero dit l'absence à l'affirmative, `note.limit` referme
  la tension (« c'est une note, personne n'y répond »).
- **S2** élèves / cohorte / ta méthode / ta voix. Aucun « ton client », aucun « suivi personnalisé ».
- **S3** l'espace élève est en PULL : « la semaine qu'ils composent », jamais « on les y ramène ».
- **S4** aucun « rien à ouvrir / rien à installer », sous aucune forme.
- **S5** aucun « rien n'arrive la nuit » — la page dit l'inverse et c'est vrai : « la question de 21 h ».
- **S6** silence total sur le suivi de poids.
- **S8** aucun chiffre sans source : les seuls chiffres de la page sont 7 €, 14 jours, 3 élèves,
  1 500 caractères, 48 h/120 h, et la cohorte de 34 étiquetée « exemple ».
- **S9** aucune bande de risque, aucune tuile « on track », ni en copie ni dans la figure du lundi.
- **S10** les maquettes citent mot pour mot — et deux paraphrases de l'ancienne page sont réparées.
- **S11** aucun comptage calorique, aucune macro : la page ne parle pas de chiffres nutritionnels.
- **S12** aucun SKU élève : « nous ne facturons jamais ton élève », écrit à l'affirmative.
- **S7** est le seul RENVERSÉ, en connaissance de cause (teinte de marque `fig-700`) : le
  commentaire qui l'interdisait est réécrit dans l'en-tête, pour que le prochain lecteur ne
  « répare » pas la couleur en la retirant.

## 6. Trois choses pour l'orchestrateur

1. **Un défaut mesuré qui concerne les SIX pages, pas seulement la mienne.** À 320 px, la page
   défilait **en largeur** : `.fig-scroll` est bien un conteneur de défilement, mais l'élément de
   grille est le `<figure>` qui l'enveloppe, et son `min-width: auto` fait grandir la piste
   jusqu'au plancher de 380 px du SVG. Mesuré : 420 px de contenu pour 320 px d'écran. Le
   correctif est `min-w-0` sur le `<figure>` (appliqué chez moi, vérifié : 320/320, et chaque
   figure défile toute seule). **À vérifier sur les cinq autres pages** — c'est le piège
   « `flex-1` ne rétrécit pas un input », déplacé d'un cran.
2. **Le bouton n'est pas encore à la charte.** `ui/Button.tsx` rend `variant="primary"` en
   `bg-gray-900` : un noir froid sur du papier chaud. Je n'ai pas passé de `className` par-dessus
   — deux utilitaires `bg-*` de même spécificité, le gagnant dépend de l'ordre de génération, donc
   c'est instable. Le correctif est **une ligne dans la primitive** (`bg-fig-700 text-paper
   hover:bg-fig-800`), et les six pages suivent sans une édition.
3. **Intégration i18n** : `coaches` doit entrer dans `PUBLIC_NAMESPACES` (`catalog.ts:34`), et
   **surtout pas** dans `PUBLIC_NAMESPACES_PENDING_TRANSLATION` : le FR est livré. Les deux
   fichiers ont le même jeu de 107 clés et zéro trou d'interpolation. `landing` peut alors
   disparaître comme namespace de page (audit D3).
