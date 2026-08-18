# Prompt — Construire FF-059 · Le chiffre affiché

> À donner à l'agent responsable de la composition des repas. Le prompt complet
> = **LE SOCLE COMMUN** de `scratchpad/PROMPTS-REALIGNEMENT-CHAT.md` (l. 16-143,
> à coller en premier) **+ ce bloc**.
>
> **Les lots 1 et 2 sont exécutables tout de suite. Le lot 3 est BLOQUÉ** sur
> trois décisions humaines (§11 de la fiche) — tu ne le commences pas.

---

# BLOC · FF-059 — Le chiffre affiché

**Fiche** : `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
— lis-la **en entier** avant d'écrire une ligne, puis
`docs/keel/CALORIE_REVERSAL.md` (le cadre) et
`docs/keel/PHOTO_QUANTIFICATION.md` (les mesures).

## Le contexte — et pourquoi ce chantier est différent des autres

**Décision humaine du 2026-08-12 : les calories s'affichent.** C'est un
**renversement** de trois décisions écrites, et le prompt du générateur dit
encore aujourd'hui *« No calories. No macro grams. No percentages of anything
nutritional. »*

Ce qui l'autorise : le refus était fondé sur **la photo** (−26,6 % de biais
systématique). Un **plan composé** n'est pas une photo — les quantités ne sont
pas devinées, **le produit les a écrites**. Le banc mesure la condition
grammages fournis à **MAPE 2,3 %**, un cas à 662 kcal contre 661,8 de vérité
terrain. C'est un **calcul**, pas une estimation.

⚠️ **Ce chantier touche à une garde de sécurité.** Levinson 2017 : **73 % des
patients TCA déclarent qu'un tracker de calories a contribué à leur trouble.**
C'est la raison de l'interdiction d'origine, elle n'est pas périmée, et elle
impose que tu construises **une chaîne de gardes**, pas un affichage. Si à un
moment tu hésites entre « plus simple » et « plus fermé », prends plus fermé.

## L'état du dépôt — vérifie, puis réutilise

**Deux choses existent déjà et t'évitent d'inventer :**

- **L'axe `counting` de la doctrine** — `_shared/keel/doctrine_starter.ts`,
  `key: "counting"`, subject *« Whether numbers are part of your method »*.
  Trois positions : `no_counting` (jeton interdit `count_calories`, six formes
  de surface, et son `instead`), `count_briefly`, et `NO_RULE_POSITION`.
  **C'est l'exception de la décision. Tu la LIS, tu ne la construis pas.**
- **Les attributs corporels** — `_shared/keel/student_body_io.ts` :
  `loadStudentBody` rend `heightCm`, `gender` (liste fermée), le verdict d'âge
  et les séries de poids **dans une seule requête**.
  ⚠️ `frontend/src/keel/lib/weekInFood.ts:278` affirme *« sans taille, âge,
  sexe ni niveau d'activité (on ne les collecte pas) »* — **c'est faux depuis
  le 2026-08-08**. Corrige ce commentaire au passage, il induit en erreur.

**Les gardes à brancher, pas à réécrire :**
- `restriction_guard.ts` — `calorie_readout` est **déjà** dans
  `SUPPRESSED_STUDENT_SURFACES`
- la garde mineur (`minor_quantity` dans `daily_recap.ts`, bilingue)
- `stripMeasurementFacts` et `MEASUREMENT_PROSE_PATTERNS` dans
  `meal_analysis.ts`

**Le chemin photo (`energy_estimate`, `basis: photo_estimate`) est HORS
PÉRIMÈTRE.** C'est `CALORIE_REVERSAL.md`, et il ne bloque pas ce chantier : le
plan a une base exacte, la photo n'en a pas.

---

## LOT 1 — La chaîne de gardes, avant le premier chiffre

**Tu construis la porte avant la maison.** Un module pur + test :

```ts
canShowEnergy(input): { show: boolean; reason: EnergyGateReason }
```

Les quatre portes, **dans cet ordre**, et l'ordre est le contrat :

| # | Porte | Ferme si | Qui peut rouvrir |
|---|---|---|---|
| 1 | `restriction_flag` levé | plancher TCA actif | **PERSONNE** |
| 2 | mineur | verdict d'âge | personne |
| 3 | doctrine `counting` | position `no_counting` | le coach |
| 4 | interrupteur élève | éteint | l'élève |

⚠️ **Le point le plus important du chantier** : la porte 1 **n'est pas**
l'exception dont parle la décision. Un coach qui compte + un élève sous
plancher TCA → **le plancher gagne**. Si ton code permet à un réglage
quelconque de rouvrir la porte 1, le chantier est raté quelles que soient ses
autres qualités.

Le refus porte **toujours un motif nommé** (`restriction_floor` / `minor` /
`doctrine_no_counting` / `student_off`). Pas de booléen nu : ce dépôt a la
cicatrice *« un paramètre de garde optionnel est une garde désarmée »* — les
paramètres de cette fonction sont **requis**, et une entrée incomplète
**throw** plutôt que de rendre `show: true`.

Puis : l'interrupteur élève (une colonne, un écran, un défaut — voir la
décision humaine ci-dessous).

**Preuve du lot** : les 4 portes × leurs combinaisons, en table de vérité
exhaustive. Plus un test qui échoue si quelqu'un ajoute un paramètre optionnel
à la signature.

---

## LOT 2 — Le calcul et l'affichage A + B

**Le calcul** — module pur + test. Entrée : les quantités du plan et sa table
nutritionnelle. Sortie :

```ts
{ kcal: number; basis: "plan_quantities"; complete: boolean }
```

- `basis` est une **constante du chemin**, jamais une déclaration du modèle sur
  lui-même. Le plan porte les quantités, donc la base est acquise.
- **`complete: false` dès qu'un plat a une quantité manquante ou un ingrédient
  hors table.** Et alors : **pas de chiffre sur ce plat**, et le total du jour
  **dit** qu'il est incomplet. Un total qui paraît exhaustif et ne l'est pas
  est pire que pas de total — c'est le piège n°1 de ce lot.
- **Le chiffre ne se stocke pas** (R5). Il se recalcule. Un chiffre stocké
  survit au plan qui l'a produit et ment.

**L'affichage** — A (par plat) et B (la somme du jour), sur l'écran du plan et
sur Today. Dans un **foyer**, le chiffre suit `member_portions` : **il est par
portion**. C'est ce qui rend la bifurcation par objectif enfin visible.

**Ce que tu ne touches pas** :
- Le **prompt du générateur** garde son interdiction. Le chiffre est calculé
  **après**, depuis les quantités. Ouvrir le prompt rouvrirait le chiffre
  halluciné — c'est explicitement le rabbit hole de la fiche.
- Les **macros** : la décision porte sur l'énergie seule. LEGAL.md §6.4 tient.
- Le **chiffre en prose libre** : `MEASUREMENT_PROSE_PATTERNS` reste inchangé.
  Un `rationale` qui dit « environ 600 kcal » reste **rédigé**.

**Le test de propriété se RETOURNE, il ne se supprime pas** :
`sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts`
passe de *« aucun chiffre d'énergie n'atteint l'élève »* à *« aucun chiffre
d'énergie **sans base** n'atteint l'élève »*. C'est le filet du chantier.

---

## LOT 3 — La cible quotidienne · **BLOQUÉ, ne le commence pas**

Trois décisions humaines manquent (fiche §11) :

1. **Le niveau d'activité** — rien ne le collecte. Sans lui, Mifflin-St Jeor
   donne un métabolisme de base, pas un besoin. Le multiplier par une valeur
   devinée produit **une cible fausse avec l'aplomb d'un tableau**.
2. **`count_briefly` autorise-t-il C, ou seulement A et B ?** La position dit
   « deux semaines, c'est une leçon » — un **temps** est peut-être à respecter,
   pas seulement un booléen.
3. **L'interrupteur est-il allumé ou éteint par défaut ?** (Celle-ci bloque
   aussi le lot 1 — voir ci-dessous.)

Ta tâche sur ce lot : **l'instruire, pas le construire.** Ce que chaque option
coûte, ce qu'elle implique, une recommandation. Au rapport.

⚠️ Rappel de cadrage : A et B sont des **faits sur la nourriture**. C est un
**jugement sur la personne** — c'est un tracker, et `coachStartingNumbers`
refuse depuis toujours de franchir cette ligne (*« un chiffre affiché à l'élève
devient un objectif »*). On la franchit en connaissance de cause, donc avec le
plus de gardes, donc en dernier.

**Et jamais** : la cible n'entre **pas** dans le générateur. Un plan qui vise
un chiffre est un régime chiffré, et ce n'est pas ce produit.

---

## La décision qui te bloque au lot 1 — tranche-la et documente

**L'interrupteur par défaut : allumé ou éteint ?** Allumé suit la décision du
2026-08-12. Éteint est plus prudent pour un produit qui n'a jamais montré de
chiffre à personne.

Personne ne te répondra pendant ton run. **Tranche** (règle du dépôt :
réversible > irréversible, sûr > élégant), puis documente au format
*Décision / Pourquoi / Options rejetées / Réversibilité*. C'est un booléen :
quelle que soit ta décision, elle se renverse en une ligne.

---

## Tests en conditions réelles

- **easy** : plan composé avec quantités → chaque plat porte son chiffre, le
  jour porte sa somme ; le total est vérifié **à la main** contre une table de
  référence (l'écart doit être **nul** — c'est une table, pas un modèle).
- **medium** : foyer avec portions divergentes → **chaque chiffre correspond à
  SA portion** ; coach `no_counting` → aucun chiffre ; coach sans position →
  chiffre ; pas de coach (méthode maison) → chiffre ; élève qui éteint → plus
  rien, partout.
- **hard** : chaque mode de défaillance de §7 — dont : plat sans quantité →
  **pas de chiffre sur ce plat** et total marqué incomplet ; ingrédient hors
  table → idem ; élève mineur → rien ; réponse en prose contenant « environ 600
  kcal » → **rédigée**.
- **extra-hard** : **le test qui fait le lot** — `restriction_flag` levé **+**
  coach qui compte **+** interrupteur allumé → **aucun chiffre nulle part**,
  vérifié sur les trois surfaces (plat, Today, chat) et **dans les deux
  langues** ; le plancher se lève **pendant** une session → les chiffres
  disparaissent au tour suivant ; plan modifié après affichage → recalcul, rien
  de périmé.

## Revue adversariale — angles imposés

- **La porte 1 contournable.** Cherche **tout** chemin — réglage, cache,
  prop React, valeur par défaut — par lequel un chiffre pourrait atteindre un
  élève sous `restriction_flag`. Ça se prouve par l'absence de chemin, pas par
  l'absence d'intention. **C'est ton angle prioritaire.**
- **Le total qui fait semblant.** Fabrique un plan avec un ingrédient exotique
  hors table et prouve que le total se déclare incomplet.
- **Le chiffre qui fuit par la prose.** Le calcul est un champ typé ; vérifie
  qu'aucun chemin ne le reformule en phrase, FR et EN.
- **La contamination du générateur.** Vérifie que le prompt de composition
  **n'a pas bougé** et qu'aucun `kcal` inventé par le modèle ne survit.
- **Le score déguisé.** Cherche tout endroit en aval où le chiffre pourrait
  produire un pourcentage d'adhérence. `adherence_score` est une surface
  supprimée, et l'énergie n'est pas une conformité.
- **Le cache.** Si tu mémoïses le calcul, prouve qu'un changement de plan ou de
  garde l'invalide immédiatement.

## Ton rapport

`scratchpad/RAPPORT-FF-059.md`, structure du socle. En plus :
- la **table de vérité complète** des quatre portes ;
- la **décision sur le défaut de l'interrupteur**, au format imposé ;
- l'**instruction du lot 3** : les trois questions, leurs options, tes
  recommandations — **sans implémentation** ;
- l'écart mesuré entre ton calcul et une référence externe sur 5 plats.

## Les interdits absolus

La porte 1 n'est ouvrable par personne. Aucun chiffre chez un mineur. Aucun
chiffre en prose libre. Aucune macro. Aucun pourcentage d'adhérence dérivé.
Aucun chiffre **stocké**. Le prompt du générateur ne bouge pas. Le chemin photo
n'est pas touché. **Le lot 3 n'est pas commencé.** Si un de ces interdits te
semble bloquer une bonne idée, consigne-la et n'y touche pas — l'humain
tranche.
