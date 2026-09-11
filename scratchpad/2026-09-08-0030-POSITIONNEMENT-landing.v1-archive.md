# POSITIONNEMENT SOPHIA — brief pour la landing page

Établi le 2026-09-08. Tout ce qui est chiffré ici a été vérifié en séance ; les sources sont
nommées. Ce document est la source de vérité de la page. Compagnons :
`2026-09-07-2130-ETUDE-DE-MARCHE-decision.md` (l'étude) et
`2026-09-07-2100-ETUDE-MARCHE-notes-orchestrateur.md` (les relevés bruts).

---

## 1. LE POSITIONNEMENT, EN UNE PHRASE

> **Un rééquilibrage alimentaire qui se compte tout seul — et qui te fait cuisiner une seule fois,
> même quand personne à ta table n'a les mêmes besoins.**

Deux moitiés, dans cet ordre. La première fait entrer, la seconde fait rester.

## 2. À QUI ON PARLE

**Acheteur primaire : la personne qui veut transformer son corps.** Perte de poids ou prise de
masse. Elle a déjà un objectif chiffré, elle a déjà essayé un compteur de calories, et elle a déjà
arrêté.

Pourquoi c'est la bonne porte, et pas le foyer :
- La demande y est **payante et prouvée** — Yazio 141 849 notes FR, Foodvisor 71 404,
  MyFitnessPal 51 597, CROQ'Kilos à **14,99 €/mois** avec des prélèvements réels documentés.
- La bande de prix y est **prouvée entre 11,99 et 14,99 €**. La bande « organisation des repas »
  plafonne à 8-10 € et se fait répondre « à ce prix-là j'achète 5 livres par an ».
- Sur ~2 000 avis de concurrents français lus, **une seule personne** demande spontanément un
  planificateur de foyer. Le foyer ne fait venir personne.

**Segment secondaire, qui arrive par vase communicant :** le reste du foyer. Ne jamais lui parler
en premier.

**Où les trouver :** salles de sport indépendantes, coachs sportifs, communautés de contrainte
(allergie, cœliaque, végétarisme, perte de poids). **Pas** les communautés de cuisine — la douleur
ne s'y raconte pas.

## 3. LE MÉCANISME, EN CLAIR

1. On calcule le besoin du corps (âge, taille, poids, activité, objectif, rythme).
2. On compose 1 à 7 jours de repas qui **atteignent ce besoin**, au gramme.
3. On dit **quand faire les courses** et **comment cuisiner** (sessions de batch).
4. La personne **ne journalise rien** — le compte est déjà fait, puisqu'on a prescrit.
5. **Photo uniquement quand il y a un écart** : un resto, une bière, un imprévu.
6. **Ce qui est mutualisé, c'est la CUISINE — pas l'assiette.** Une session, des préparations
   communes, une seule liste de courses. À partir de là, chacun reçoit ce qui lui convient : le
   même plat quand ça marche, **un plat différent quand ça ne marche pas** (`dishes[].member_id`
   existe, et la ceinture sait séparer une bouche sur sa propre boîte).
   Chaque bouche est un cas complet : son corps (taille, poids, sexe), son activité (sédentarité,
   fréquence de sport), son objectif et son rythme, son régime, ses moments de repas, son déjeuner
   au travail, ses prises fixes, ses jours d'absence.

## 4. LES TROIS ARGUMENTS, DANS L'ORDRE DE LA PAGE

**① « Tu ne notes pas ce que tu manges. Tu manges ce qui est déjà compté. »**
C'est l'argument d'entrée. Il attaque la corvée qui fait abandonner tous les compteurs.

**② « Une photo seulement quand tu sors du plan. »**
C'est la meilleure ligne du produit. Elle se comprend en une seconde, elle nomme la corvée du
concurrent, et elle se démontre en montrant **ce qu'on ne fait pas**.

**③ « Et personne chez toi ne mange autre chose. »**
Le lève-objection. Il ne crée pas la demande, il retire le verrou : *« je peux pas faire de régime,
ma femme cuisine pour les enfants »*.

⚠️ **Ne jamais réduire cette section à « le même plat en portions différentes ».** C'est deux fois
faux : ce n'est pas qu'une question de quantité, et ce n'est même pas toujours le même plat.

La contrainte qu'on lève n'est pas *« servir des portions différentes »*. C'est **« cuisiner une
seule fois pour des gens qui n'ont rien en commun »** — un adulte qui sèche, un ado qui prend de la
masse, une végane, un enfant qui grandit. Ce qu'on mutualise, c'est la session de cuisine, les
préparations et la course. Ce qu'on ne force pas, c'est l'assiette : quand un régime ou un besoin
ne rentre pas dans le plat commun, cette bouche reçoit autre chose, et la cuisine ne double pas
pour autant. **« La portion » est la version appauvrie de l'argument — et elle est vendable par
n'importe qui.**

⚠️ **« Gagner du temps / mieux manger / manger équilibré » ne monte JAMAIS en tête.** C'est la
promesse de Jow, gratuite, servie à 3,5 M de Français. Dit en premier, ça nous range dans la
catégorie où l'on répond « trop cher ».

## 5. LES PREUVES QU'ON PEUT CITER

**Le déclaratif échoue par l'OMISSION, pas par la mesure** (eau doublement marquée, référence) :
- relevé **pesé** sur 7 jours : sous-déclaration de **21-22 %**
- rappels de 24 h : **−10 à −20 %** · questionnaires de fréquence : **−20 à −30 %**
→ Même en pesant, les gens oublient un cinquième. Améliorer la reconnaissance photo ne corrige pas
ça, parce que ce n'est pas là que ça casse.

**La photo, elle, se trompe le plus là où on mange vraiment :**
- aliment simple : 5-15 % · assiette simple : 10-20 %
- **plat mélangé : 20-30 % · plat en sauce ou en couches : 25-40 %**
→ C'est-à-dire : un gratin, une blanquette, un mijoté. La cuisine réelle.

**L'asymétrie qui est notre argument :**

| | base connue | ce qu'il faut capturer | erreur résiduelle |
|---|---|---|---|
| Compteur photo | rien | **100 % des apports** | 20-30 % |
| Sophia | le plan, au gramme | **seulement les écarts** | fonction de la part hors plan |

## 6. ⛔ CE QU'ON NE DIT JAMAIS

| Interdit | Pourquoi | À dire à la place |
|---|---|---|
| « 5 % d'erreur contre 40 % » | Compare notre **prescription** à leur **mesure du réel**. Deux choses différentes. Attaquable, et invérifiable tant qu'on ne mesure pas la part hors plan. | « On sait ce qu'il y a dans l'assiette parce qu'on a dit quoi y mettre. Eux doivent le deviner sur une photo. » |
| « Nos calories sont plus précises » | Même problème, et faux tant que le rattrapage n'est pas livré. | « Tu n'as rien à compter. » |
| « Gagne du temps, mange équilibré » | Promesse de Jow, gratuite. Nous range dans la mauvaise catégorie de prix. | Le garder pour la section bénéfices, jamais en titre. |
| « Perds X kg en Y semaines » | Allégation trompeuse, et risque TCA. | Parler de méthode, jamais de résultat chiffré garanti. |
| « Programme nutritionnel personnalisé » | En France le conseil diététique personnalisé est une profession réglementée. | « Des repas calculés pour ton besoin. » |

## 7. LES OBJECTIONS, ET LEURS RÉPONSES

- **« J'ai déjà MyFitnessPal / Cal AI. »** → Et tu journalises encore ? La moitié des gens arrêtent
  parce que c'est une corvée. Ici il n'y a rien à journaliser.
- **« Je n'ai pas le temps de cuisiner. »** → On dit quand faire les courses et on regroupe la
  cuisson. Si tu ne peux cuisiner aucun jour, ce produit n'est pas pour toi — dis-le franchement.
- **« Ma famille ne mangera jamais ça. »** → Tu ne cuisines qu'une fois. Chacun a son besoin, son
  régime et ses horaires, et le plan les tient tous dans la même cuisine.
- **« Et si je mange dehors ? »** → Tu prends une photo, et seulement dans ce cas.
- **« C'est cher. »** → Comparer à un coach (50-80 €/séance) ou à une box repas
  (Les Commis 4,25-11,25 € **la portion**), jamais à une appli gratuite.

## 8. VOCABULAIRE

**À utiliser :** besoin · le gramme · l'assiette · déjà compté · l'écart · la session de cuisine ·
la course · ton corps · la table.
**À bannir :** régime (préférer *rééquilibrage*) · tracker · logger · optimiser · IA (sauf si
nécessaire) · révolutionnaire · sur-mesure · personnalisé (connotation réglementée).

## 9. STRUCTURE DE PAGE PROPOSÉE

1. **Titre** — « Tu ne notes pas ce que tu manges. Tu manges ce qui est déjà compté. »
   Sous-titre : le besoin de ton corps, calculé ; les repas qui l'atteignent ; les courses et la
   cuisson qui vont avec.
2. **La démonstration** (voir §10) — au-dessus de la ligne de flottaison.
3. **Le contraste** — deux colonnes : *avec un compteur* (photographier chaque repas, oublier un
   cinquième) / *avec Sophia* (rien à faire, une photo seulement si tu sors du plan).
4. **Comment ça marche** — 4 étapes : ton corps → ta semaine → tes courses → ta cuisson.
5. **Le foyer** — une seule section, pas plus : *tu cuisines une fois. Personne ne mange à côté de
   ses besoins.* Montrer les axes qui varient (corps, sport, objectif, régime, horaires), et le fait
   qu'un plat puisse différer — jamais réduire à la quantité.
6. **Les chiffres** — la sous-déclaration (21-22 % en pesant), l'erreur photo (25-40 % sur un plat
   en sauce). Sourcés.
7. **Prix** — voir §12.
8. **FAQ** — les objections du §7.

## 10. LA DÉMONSTRATION

Le produit doit se montrer, pas s'expliquer. Deux candidats, à tester tous les deux :

- **A — l'absence.** Écran partagé : à gauche quelqu'un photographie chaque plat de sa journée ;
  à droite, rien, la personne mange. Fin : « Une seule de ces deux personnes a un chiffre juste. »
- **B — la table.** Quatre personnes qui n'ont rien en commun — un qui sèche, un ado qui prend de
  la masse, une végane, un enfant — et **une seule session de cuisine** derrière. Montrer les
  préparations communes, puis quatre assiettes justes dont une qui n'est pas le même plat.
  Personne d'autre ne peut tourner cette vidéo.

**A** sert l'argument d'entrée, **B** sert le lève-objection. A d'abord.

## 11. LE CANAL

Salles de sport indépendantes. On parle au **gérant** (un interlocuteur, plusieurs coachs), pas aux
coachs un par un. Offre : **5 € par membre qui s'abonne**, versés par virement, suivis par code
promo. Les coachs reçoivent un **compte gratuit pour eux-mêmes** — un coach qui l'utilise sur son
propre corps devient prescripteur.

Économie, sur Stripe (web, pas de commission App Store) :
```
12,99 € − 0,63 € (Stripe) − 5,00 € (salle) = 7,36 €/mois de marge brute
```
Le CAC est payé **avec du revenu, jamais avec du capital** : on n'est jamais à découvert sur un
utilisateur. Rester web-first aussi longtemps que possible ; l'app iOS impose l'achat intégré.

## 12. LE PRIX SUR LA PAGE

**12,99 €/mois par foyer, +1,99 € par profil supplémentaire, 7 jours d'essai.**
Le présenter comme *un prix de personne*, pas de foyer : « 12,99 € pour toi. 1,99 € pour chaque
personne de plus à ta table. » Ancrer contre le coach (50-80 €/séance) et la box repas
(4,25-11,25 € la portion), jamais contre une appli gratuite.

## 13. ⚠️ CONDITIONS DE SINCÉRITÉ — à tenir AVANT de publier la page

La page dit trois choses ; deux ne sont pas encore vraies dans le produit.

1. **« Les repas atteignent ton besoin. »** Mesuré le 2026-09-07 sur un corps réel (187 cm, 72 kg,
   28 ans, prise de masse) : Σ cible **3 080 kcal**, Σ servi **2 697** — **87,6 %**, avec
   `repairs { asked: 2, accepted: 2, still_out: 2 }`. Le rattrapage a tourné et a échoué.
   **Le lot « densité requise + rattrapage sur la recette » doit être tiré et vert avant la page.**
2. **« Tu n'ajoutes que les écarts. »** Faux aujourd'hui : `meal-energy-v1` lit `profiles`,
   `household_members`, `student_safety_constraints`, `student_goals`,
   `student_generated_meals` — **pas `protocol_events`**. Une bière déclarée ne bouge pas le
   chiffre. **À brancher avant la page.**
3. **« Une photo seulement si tu sors du plan. »** Vraie dès que (2) est faite.

## 14. CADRE LÉGAL ET SÉCURITÉ

- **Plancher TCA** : déjà armé dans le produit (courbe de poids non montée, bascules d'énergie
  masquées sous le plancher). La page ne doit **jamais** afficher de déficit agressif, de
  avant/après, ni de promesse de perte chiffrée dans un délai.
- **Profession réglementée** : ne pas se présenter comme un conseil diététique personnalisé ni
  employer un vocabulaire de prescription médicale.
- **Mineurs** : porte d'âge sur tout affichage de calories.
- **Allégations** : toute affirmation comparative chiffrée sur la page doit pouvoir être sourcée
  au clic. Les deux qu'on s'autorise sont celles du §5.
