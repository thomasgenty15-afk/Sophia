# LOTS ③ ⑤ — les jours de tradition · l'appétit
## et ce qui n'a PAS été construit : ④ ⑥ ⑦

**2026-08-20** · branche `ff-001-quotidien-du-coach` · foyer `5600347f` (iku + Christèle)
Cadre : `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`
Lots ① ② : `scratchpad/2026-08-20-1500-LOTS12-*.md`
Rien n'est commité. Les clés i18n sont **sur le disque uniquement**.

---

## 0. CE QUI EST LIVRÉ, ET CE QUI NE L'EST PAS

| lot | état |
|---|---|
| ③ traditions | **backend complet, mesuré en run réel.** ⛔ Pas d'écran (§6) |
| ⑤ appétit | **complet, écran compris, mesuré en run réel** |
| ④ répertoire | **décidé** (mixte : 3 saisis + 20 à cocher, reste appris) — **non construit** |
| ⑥ boucle de retour | **non construit** |
| ⑦ boucle de poids | **non construit** (fermé par ⑥, qui n'existe pas) |

Les cinq lots étaient « ordonnés et fermés par des portes ». Deux portes ont
été franchies. Je n'ai pas commencé ④ ⑥ ⑦ plutôt que de les commencer mal :
④ est le plus gros chantier des cinq et n'a de sens qu'après un écran
d'inscription à redessiner ; ⑥ demande d'étendre `hunger_signal.ts` avec ses
trois gardes ; ⑦ ne démarre pas avant ⑥, c'est le cadre qui le dit.

---

## 1. LOT ③ — LES JOURS DE TRADITION

### 1.1 Ce qui existait déjà, et que je n'ai pas reconstruit

⛔ **« Samedi soir on commande » N'EST PAS DANS CE LOT, et ce n'est pas un
oubli.** `household_presence.ts` porte l'état `eating_out` depuis le 2026-08-18,
claveté **exactement pareil** — un jour de SEMAINE (`AwayDay.day` vaut
`mon`…`sun`, jamais une date) et des moments. « Samedi soir on commande »
s'écrit déjà `{day: "sat", slots: ["dinner"], kind: "eating_out"}`, et
`eatingOutBlock` dit déjà au modèle de ne rien composer là, avec ses trois
gardes : ne pas compenser ailleurs, ne pas déplacer, ne pas mentionner.

La règle du cadre — « ne construis rien à côté » — s'applique à son propre
exemple. Ce lot ne porte donc **que la forme positive** : « dimanche rôti »,
« vendredi poisson », qui, elle, n'existait nulle part.

⚠️ **Limite nommée, non réparée** : `away_days` est PAR BOUCHE. Un foyer qui
commande le samedi doit le marquer sur chaque bouche. C'est un raccourci
d'écran qui manque, pas un support — et il appartient à la présence.

### 1.2 Le support

`households` portait `id, name, created_by, reference_member_id, free_until` et
rien d'autre. `household_envy_submissions` existe mais est clavetée
`(household_id, week_start)` : une envie DE LA SEMAINE. Y écrire un fait
permanent obligerait à le recopier chaque lundi, c'est-à-dire à le perdre le
premier lundi où personne ne passe.

`household_traditions` (`20260820160000`) : `(household_id, weekday, slot)`
unique, `label` 1–60 caractères, plafond de **trois** par foyer tenu par un
trigger — un CHECK ne peut pas compter les lignes voisines. Trois RPC : poser,
retirer, lire (navigateur et serveur séparés, `auth.uid()` étant NULL sous la
clé de service).

### 1.3 ⛔ LE PIÈGE DOCUMENTÉ DU DÉPÔT A MORDU, ET IL EST MESURÉ

La migration `20260820160000` affirmait, dans son propre commentaire de table :
« Aucun grant à `authenticated`, comme `household_member_bodies` ». **C'était
faux à l'instant où la ligne a été écrite** :

```
has_table_privilege('anon',          'household_traditions', 'SELECT')   = t
has_table_privilege('authenticated', 'household_traditions', 'SELECT')   = t
has_table_privilege('authenticated', 'household_traditions', 'TRUNCATE') = t
```

C'est la cicatrice « privilèges par défaut Supabase » : `authenticated` a TOUT
sur toute table neuve. Ne rien écrire n'ouvre pas moins — **ça ouvre**. Et
`TRUNCATE` échappe à RLS : la table était **vidable par n'importe quel compte**.

`20260820161000` ferme : `revoke all ... from public, anon, authenticated`
**plus** RLS armée sans policy. Les deux, pas l'une :

- le `revoke` ferme la porte d'aujourd'hui, et il est le SEUL à fermer TRUNCATE ;
- RLS ferme celle de demain, le jour où quelqu'un rétablira un grant « pour
  débloquer un écran » — c'est comme ça que ces portes se rouvrent.

Une seconde migration plutôt qu'une correction de la première : la corriger sur
le disque laisserait le registre et le fichier d'accord sur un numéro et en
désaccord sur ce qu'il fait.

### 1.4 ⛔ CE QU'UN VERROU POSITIF PEUT — ET LE VERDICT MESURÉ FAUX

Le cadre demandait un verrouillage **déterministe, après le modèle**, sur le
patron d'`applyHouseRuleLock`. Les deux verrous ne peuvent pas la même chose,
et il a fallu l'écrire :

- un verrou **négatif** peut RETIRER : un plat qui sert du nutella part ;
- un verrou **positif** ne peut pas AJOUTER : on ne fabrique pas un rôti
  déterministe — il faudrait inventer des ingrédients, des quantités, une
  méthode, c'est-à-dire composer.

Le module OBSERVE donc, et il COMPTE. **Puis la première mesure l'a démenti :**

```
« vendredi poisson » posé sur le foyer 5600347f
run réel  ->  vendredi dîner : « Cabillaud, pommes de terre et haricots verts »
verdict   ->  missed          ... et `tradition_missed: 1` dans les `issues`
```

**Le modèle avait honoré la tradition.** Le vérificateur cherche le mot
« poisson » ; un cabillaud ne le porte pas. Le corpus confirme qu'il n'y a pas
de pont : `cabillaud` → alias → `cod` → groupe `white_fish`, mais **« poisson »
n'a aucun alias**, parce que c'est un mot de CATÉGORIE, pas un aliment.

On annonçait à un foyer que son vendredi était cassé pendant que son poisson
cuisait. **Un compteur faux est un compteur ; un compteur faux qu'on affiche est
un mensonge.**

Deux corrections, actées et testées :

1. `missed` → **`composed_without_label`**. Le nouveau nom dit ce qui est
   OBSERVÉ (« les mots du foyer ne sont pas dans cette case »), pas ce qui est
   INFÉRÉ (« la tradition a été cassée »). Un test interdit le retour de
   `missed` dans le vocabulaire, et rejoue le cabillaud.
2. `tradition_missed` **retiré des `issues`**. Il ne reste qu'un verdict
   affichable : `not_composed` — la case est vide ou elle ne l'est pas, aucun
   matcher n'intervient.

⚠️ **Et le matcher n'est pas écrit ici** : `findForbiddenMatches`, avec la
négation LAISSÉE ACTIVE — l'inverse du réglage des règles de maison. Là-bas on
cherche si un aliment est *mentionné* (« sans nutella » compte) ; ici s'il est
*servi* : « un gratin sans poisson » n'honore pas « vendredi poisson ». Un test
tient les deux, plus « laitue » ≠ « lait ».

### 1.5 Les photos

**AVANT** (aucune tradition) — vendredi dîner :
`Poulet rôti, courgette, poivron et sauce au yaourt`
`traditions: {declared: 0, honoured: 0, composed_without_label: 0, not_composed: 0, out_of_window: 0}`

**APRÈS** (« vendredi poisson », posé par la vraie RPC avec le jeton du maître) :

| run | vendredi dîner | verdict |
|---|---|---|
| 1 | **Cabillaud**, pommes de terre et haricots verts | `composed_without_label` (faux négatif, §1.4) |
| 2 | **Poisson blanc**, tomates et courgettes | `honoured` |

**2 runs sur 2, le modèle a honoré la tradition.** 1 sur 2, le vérificateur
littéral l'a vu. C'est le taux qui manquait pour décider, et il dit : le bloc de
prompt suffit sur ce foyer, la case n'a pas besoin d'être RÉSERVÉE, et c'est le
VÉRIFICATEUR qui est en retard, pas le modèle.

**CONTRE-ÉPREUVE** (tradition retirée) : `declared: 0`, et le bloc de prompt est
**vide au caractère près** — tenu par un test de propriété
(`traditionBlock([], …) === {block: "", cells: 0}`), plus le même vide pour une
tradition hors fenêtre. C'est la seule forme d'« identique à l'octet » qui ait
un sens ici : le PLAN varie d'un run à l'autre parce que le modèle est
stochastique ; le PROMPT, lui, se compare vraiment.

---

## 2. LOT ⑤ — L'APPÉTIT

### 2.1 La table, et sa justification écrite dans le code

```
small   0,90      « la formule me surestime »
average 1,00      le neutre VRAI — et ce que rend l'absence de réponse
large   1,10      « la formule me sous-estime »
```

±10 % est **l'incertitude inter-individuelle réelle** autour d'une équation de
prédiction (Mifflin-St Jeor), pas un curseur de confort. Les libellés d'écran le
disent — « moins / à peu près comme / plus que les gens de la même carrure » —
parce que demander « as-tu bon appétit » obtiendrait une réponse à une autre
question.

⛔ **Écrit TRANSITOIRE dans le code, et un test tient la phrase.** Le lot ⑦ le
remplace : une stabilité est une MESURE, ces trois crans sont une DÉCLARATION.
Le test échoue si les mots « TRANSITOIRE » ou « lot ⑦ » disparaissent du bloc.

### 2.2 Les trois gardes, chacune testée

- **Bornée et symétrique** : `1 − 0,10` et `1 + 0,10`, vérifié par calcul, pas
  par lecture — l'asymétrie serait une opinion sur le sens dans lequel les gens
  se trompent.
- **Le plancher TCA reste dessous** : mesuré, pas raisonné. On prend une bouche
  sous flag et on compare `envelopeFor(..., "small", ...)` à
  `envelopeFor(..., "large", ...)` : **les deux enveloppes sont identiques**, et
  `per_portion` ne porte structurellement aucune énergie où un ±10 % pourrait se
  poser.
- **Il corrige l'ESTIMATION, jamais les grammes** : appliqué dans
  `estimatedMaintenanceKcal`, en amont. Posé sur les grammes, il se composerait
  avec l'ancrage absolu (`cible / livré`) et ferait **deux couches qui
  dimensionnent** — le double comptage que ce chantier a déjà mesuré et retiré.

⛔ **Et une garde de plus, non demandée : chez un ENFANT, l'appétit ne peut que
MONTER.** Même décision que `childActivityFactor`, même raison : le cran est
coché par le compte MAÎTRE, pas par l'enfant. Retirer 10 % du besoin d'un corps
en croissance sur une case cochée par quelqu'un d'autre est la direction d'erreur
qu'on refuse — et cette fois sans même l'excuse d'une équation, puisque ±10 % est
l'incertitude de la formule ADULTE.

### 2.3 La photo

Fiches écrites par la vraie porte (iku `large`, Christèle `small`) :

| | avant les lots | ②+① seuls | + appétit ⑤ |
|---|---|---|---|
| iku · cible/jour | 3 925 kcal | 3 395 | **3 733** (×1,10) |
| Christèle · cible/jour | 2 205 kcal | 1 875 | **1 687** (×0,90) |

`box_sizing.appetite` : `{declared: 2, not_answered: 0, not_asked: 0}`.

**CONTRE-ÉPREUVE** : run avec fiches vides → `{declared: 0, not_answered: 0,
not_asked: 2}` et les cibles d'avant, à l'identique. Le neutre est un neutre
vrai, tenu aussi par un test de propriété
(`estimatedMaintenanceKcal(appetite: null) === estimatedMaintenanceKcal(appetite: "average")`).

⚠️ **La RPC n'a rien écrasé.** L'appel qui pose l'appétit ne passe pas
`p_activity_axes_asked` ; vérifié en base après coup : `seated` / `5_plus`
intacts. C'est le drapeau explicite qui tient, pas un `coalesce` de bonne foi.

### 2.4 Où vit la colonne, et pourquoi PAS le patron de `goal`

Le cadre suggérait le patron de `goal` (`household_members` / `student_goals`,
arbitré par le roster). **Ce n'est pas ce qui est fait**, et la raison est
écrite dans la migration.

Ce patron existe parce qu'un OBJECTIF est une opinion dont il n'y a qu'un
porteur légitime : la base REFUSE `keel_household_set_member_goal` sur une
bouche qui a un compte. L'appétit n'a pas cette propriété — c'est un champ de la
FICHE, posé par le maître, exactement comme la taille, le poids, le cran
d'activité et les deux axes livrés ce matin. Le suivre coûterait une seconde
porte d'écriture pour un champ que le MÊME formulaire écrit, une seconde branche
dans le roster, et un appétit qui vivrait ailleurs que le cran d'activité posé
juste à côté de lui dans le même bloc.

⚠️ **Ce que ça coûte, nommé** : un élève avec compte ne règle pas son appétit
depuis son propre écran. C'est la même asymétrie que le corps et l'activité,
déjà assumée deux fois — elle n'est pas neuve, mais elle s'étend.

---

## 3. LOT ④ — LA DÉCISION EST PRISE, LE LOT N'EST PAS CONSTRUIT

Question posée avant d'écrire une ligne, comme le cadre l'exigeait.
**Réponse : mixte** — 3 plats saisis à l'inscription, puis 20 courants à cocher,
le reste appris par ⑥.

Ce qui reste à instruire avant de construire, et qui n'est pas tranché :

1. **`household_member_habits` étend-elle vraiment ?** Elle porte, PAR MOMENT,
   `household_dish` ou `own_usual` en toutes lettres, et elle atteint déjà le
   prompt. Un répertoire est une liste de PLATS, pas un état par moment : ce
   n'est pas la même clé. Il faut décider si c'est une colonne de plus sur cette
   table, ou une table dont `household_member_habits` devient un lecteur.
2. **La liste des 20 plats courants n'existe pas** et n'est pas dérivable du
   corpus : `food_composition_refs` porte des ALIMENTS, pas des plats.
3. **Le pont de promotion** (`food_preference_promotion.ts`) impose qu'un fait
   appris passe par une confirmation humaine. Un répertoire appris par ⑥ devra
   donc traverser un écran — qui n'existe pas non plus.

---

## 4. LOTS ⑥ ET ⑦ — NON CONSTRUITS

⑥ demande d'étendre `hunger_signal.ts` avec ses trois gardes héritées (fenêtre
glissante sans compteur stocké, aucun nombre dans le prompt, consigne de
silence) plus une garde propre : **borner l'effet cumulé d'un « c'était trop »
répété**, parce qu'une spirale douce vers le bas est le mode d'échec d'un
produit alimentaire, et que le plancher TCA seul ne l'empêche pas.

⑦ est fermé par ⑥ — « ne corriger que si le plan a été SUIVI » — et porte une
limite qu'il faut redire ici : `student_body_measures` est claveté sur
`user_id`. **Une bouche sans compte n'a aucune série de pesées.** C'est le cas
de Christèle, et c'est le cas nominal d'un foyer. ⑦ ne couvrira donc jamais tout
le monde, et ⑤ — pourtant écrit transitoire — restera la seule correction pour
les bouches sans compte tant que le foyer n'aura pas de moyen d'en peser une.

---

## 5. LES GATES

- `deno test --allow-all supabase/functions/_shared/keel/` : **3 926 passés,
  0 échec** (3 887 au lancement ; +39 tests neufs, dont les 18 des lots ①②).
- `npx tsc -b --force tsconfig.app.json` : vert.
- `npx vitest run` : **1 745 passés, 4 échecs** — exactement les 4 rouges
  antérieurs et étrangers annoncés. Aucun rouge neuf.
- Lignée : aucun doublon, disque == registre (**221 == 221**).
- Rien commité, rien stagé.

⚠️ **`coverage-guard` — j'ai acquitté MON trigger, pas les autres.**
`household_traditions_cap` est désormais dans la liste connue avec la raison de
son existence. Le garde-fou reste rouge sur des entrées qui ne sont pas de moi
(`household_member_bodies_touch`, `student_daily_recommendations_set_updated_at`,
trois fonctions edge) : ce sont les rouges étrangers, et le cadre dit de ne pas
les réparer.

---

## 6. ⛔ CE QUE JE LAISSE OUVERT

1. **③ n'a pas d'écran.** Les trois RPC existent, sont gardées, et j'ai posé la
   tradition avec le jeton du maître par la vraie porte — mais aucun écran ne la
   propose. Le cadre demandait « début de l'étape 3, sur la fiche FOYER » : c'est
   une carte de plus sur `SetupPage`, avec une liste, un ajout et un retrait.
   **Tant qu'elle n'existe pas, ③ est un support armé que personne ne peut
   remplir**, ce qui est le symétrique du mode d'échec n°1 de ce dépôt.

2. **Le vérificateur de tradition ne sait pas qu'un cabillaud est un poisson**
   (§1.4). Le rendre sémantique demande un pont mot-de-catégorie → groupe
   d'aliments (« poisson » → `white_fish` + `fatty_fish`). Le corpus porte la
   moitié du pont et pas l'autre. **Le bâcler referait un matcher maison**, et ce
   dépôt en a mesuré 12 faux positifs sur 12.

3. **La compliance de ③ est mesurée sur DEUX runs et un seul foyer.** 2/2 est un
   chiffre encourageant, pas une preuve. Si elle s'effondre sur d'autres
   foyers, la décision « la case doit être RÉSERVÉE » redevient ouverte — et le
   compteur `composed_without_label` est exactement ce qui permettra de la
   prendre.

4. **La forme du plan varie énormément d'un run à l'autre** (déjà noté ce matin,
   et revu ici) : sur les runs de cette soirée, le modèle a attribué zéro part de
   boîte à Christèle plusieurs fois de suite. Toute mesure de grammage faite sur
   un run unique est à refaire.

5. **⑤ est branché sur la lane FOYER seulement.** `generate-meal-v1` et
   `meal-energy-v1` passent `null` **en le disant** — donc ×1,00, le nombre
   d'avant. L'entonnoir (`saveMouthBody`) passe aussi les drapeaux à `false` :
   une fiche remplie uniquement par l'entonnoir reste `not_asked`, et le
   compteur le dit.

6. **Le plafond de trois traditions est une règle produit, pas une borne
   technique.** Il est en base (trigger) et réappliqué à la lecture. Si un foyer
   réel en veut cinq, c'est une conversation produit — pas un nombre à monter.

7. **`MEAL_MAX_GRAMS_PER_KG` reste la valeur opérante sur ce foyer** (rapport de
   ce matin, §7). Ni ③ ni ⑤ ne le touchent. Tant que le modèle compose à
   ~0,6 kcal/g, les cibles bougent et les grammes servis restent au plafond.
