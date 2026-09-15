# Cibles par personne, consignes cohérentes, validation du foyer — 2026-09-13

> ⛔ **Ce rapport sépare trois choses et ne les additionne jamais** : ce qui est
> prouvé par un test ou un tir nommé, ce qui est partiellement prouvé, et ce qui
> n'est pas testé. `⚠️` et `❌` ne se lisent pas `✅`.

Plan appliqué : « Plan pour Opus — cibles par personne, consignes cohérentes et
validation du foyer ». Revue de départ :
[`REVUE-RESULTAT-REPARATIONS-FOYER-2026-09-13.md`](REVUE-RESULTAT-REPARATIONS-FOYER-2026-09-13.md).

---

## 0. L'état du poste avant le chantier

Le commit de départ ne décrit pas l'arbre testé : 319 fichiers étaient déjà
modifiés par d'autres sessions, soit +23 086 / −7 737 lignes par rapport à
`a14c6be1`. Tout est archivé avant la première modification :

| Fichier | Contenu |
|---|---|
| `scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/head-AVANT.txt` | `a14c6be1807e5454a57929b28f87eb4cff872a1b` |
| `…/etat-depot-AVANT.txt` | les 319 fichiers, avec leur état |
| `…/empreintes-AVANT.txt` | sha256 de 664 fichiers `.ts` du périmètre |
| `…/diff-arbre-AVANT.stat.txt` | le diffstat complet de l'arbre |
| `…/diff-keel-AVANT.patch` | le diff du périmètre (842 ko) |

---

## 1. Lot 1 — les objectifs portent leur propriétaire, et une seule consigne de sortie

### 1.1 Les deux défauts, reproduits sur la requête réellement envoyée

Source : `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-h4n4-2026-09-11T12-30-45-131Z.prompts.txt`
Extrait lisible : `scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/AVANT-h4n4-message-utilisateur-reparation.txt`

Les tests de reproduction ont d'abord ÉCHOUÉ sur le code d'alors
(`plan_repair_attribution_test.ts`) :

```
① A — trois cibles le même jour: chaque ligne NOMME son propriétaire ... FAILED
② B — un complément ne réintroduit AUCUN ordre de plan complet ... FAILED
FAILED | 1 passed | 5 failed
```

### 1.2 Ce que la revue avait nommé, et ce qu'elle n'avait pas vu

| # | Défaut | Nommé par la revue ? |
|---|---|---|
| A | neuf cibles journalières anonymes + les cibles de créneau (`fri/dinner` : 947 kcal contre 639, 1338, 861) | oui |
| B | `Return the full plan JSON…` depuis `dedicatedDishInstruction` | oui |
| C | **la même phrase dans `repairInstruction`** (chemin densité `c4DensityAsk`) | **non** |
| D | `Keep every dish, day and slot` dans `preferenceSplitRetryInstruction` et `swapRetryInstruction` | non |
| E | `leave every other dish exactly as it is` + un SECOND schéma de sortie dans `unfedRetryInstruction` | non |
| F | **la troncature jetait 41 lignes sur 65** — « … and 41 more of the same kind. » | non |

### 1.3 Ce qui a été livré

- **Adresse structurée** sur chaque instruction : `member_id`, `date`, `day`,
  `slot`, `scope`, `dish`, `preparation`, `session_index`, `units=U…`, et la
  mesure avec son unité, sa valeur servie, sa cible ou ses bornes, sa tolérance.
  Deux personnes du même prénom restent deux personnes : la clé est
  l'identifiant, jamais le prénom.
- **Regroupement par cause et par journée** : la phrase du geste est dite une
  fois, sans chiffre ; chaque contrat descend sur la ligne de son propriétaire.
- **Les cinq consignes contradictoires retirées** (B à E). L'interdiction
  LOCALE de toucher une préparation gelée est conservée.
- **Les contrats des consommateurs sains d'un lot partagé voyagent**, avec
  leurs propres chiffres, jamais recopiés ni moyennés. La phrase de protection
  est posée sur la ligne de chaque portion, jamais en interdiction globale.
- **La troncature ne ment plus** : `REPAIR_MAX_LINES = 24` (lignes) devient
  `REPAIR_MAX_BLOCKS = 40` (blocs) + `REPAIR_DEFECT_HARD_CHARS = 30 000`.
  ⚠️ **Un plafond a été relevé, et voici la mesure** : la forme réelle `h4n4`
  (4 bouches, 3 jours, 55 défauts) rend 31 blocs — à 24, l'appel était refusé
  sur le cas NOMINAL d'un foyer de quatre. Un dépassement ne tronque plus : il
  rend `contextIncomplete` et **arrête l'appel sans consommer le budget**.
- **Un objectif sans propriétaire arrête l'appel** (`plan_repair_context_ownerless:N`),
  au lieu de partir anonyme.

### 1.4 Le message, avant et après

**Avant** (requête réellement envoyée au fournisseur) :

```text
THESE DISHES DO NOT WORK AS WRITTEN:
- 2026-09-12: across that day the plates carry 2702 kcal and they must carry 1826 kcal, within 5%.
- 2026-09-12: across that day the plates carry 2702 kcal and they must carry 3824 kcal, within 5%.
- 2026-09-12: across that day the plates carry 2702 kcal and they must carry 2459 kcal, within 5%.
⛔ Do not touch any other dish, any preparation, or anyone else's plate.
Return the full plan JSON with only these dishes added.
… and 41 more of the same kind.
```

**Après** :

```text
- cause=day_energy_off | date=2026-09-12 | people=4
  ACROSS THIS DAY, THE PLATES DO NOT CARRY WHAT THEY OWE. Each line below is
  ONE person's contract for the whole day.
  · member_id=m_a | date=2026-09-12 | scope=day | units=U1,U2,U3,U4 | measure=energy(kcal) | energy_served_kcal=2702 | target_kcal=1826 | tolerance_pct=5
  · member_id=m_b | … target_kcal=3824 …
  · member_id=m_c | … target_kcal=2459 …
  · member_id=m_d | … target_kcal=2110 …
  ⛔ These figures are PER PERSON. Do not average them, and do not widen any
     tolerance.
```

et, pour une casserole partagée dont un seul consommateur est en défaut :

```text
WHAT EACH PORTION OUT OF prep_commun OWES — one line per person, per meal.
· U3 … member_id=m_a | energy_served_kcal=888 | target_kcal=1005 | mass_served_g=505 | min_g=210 | max_g=690 — one of the portions asked for above.
· U3 … member_id=m_b | energy_served_kcal=929 | target_kcal=1142 | … — ALREADY RIGHT: recomposing this pot must leave THIS portion inside the figures on this line.
```

### 1.5 Vérifications

| Commande | Résultat |
|---|---|
| `deno test --allow-all supabase/functions/_shared/keel/` | **7 099 passés · 0 échoué · 2 ignorés** (7 055 avant) |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | passe |
| `npx vitest run src/keel/components/plan/planValidation.int.test.ts` | 20 passés |
| `npx tsc -b --force tsconfig.app.json` | exit 0 |

**Vérifications adversariales** (mutation du code de production, restauration par `cp`) :
réinjecter « Return the full plan JSON » → 5 rouges ; ne plus écrire le bloc des
consommateurs → 8 rouges ; recopier les chiffres du premier consommateur sur
tous → 3 rouges ; écrire `ALREADY RIGHT` partout → 2 rouges ; côté écran, un
rendu qui nomme tout le foyer sous chaque écart → 1 rouge, et **seul le nouveau
test le voit**.

---

## 2. Le fait qui change la lecture de tous les chiffres publiés

`supabase/functions/_shared/keel/household_portions.ts:3011` :

```ts
export function weighedPortionMembers(members) {
  return members.filter((m) => m.goal === "fat_loss" || m.goal === "muscle_gain");
}
```

**Seule une bouche portant un objectif de perte ou de prise reçoit une portion
pesée.** Les autres partagent un bac commun dont le gramme décrit le récipient,
pas une personne — c'est une protection voulue.

Lecture du plan écrit au tir N=4 `perte-l3d04`, chaque plat porte deux contenants :

```
box …aee24cd39341   member_ids=[Paul]              total=  341 g   ← prescription
box …_dinner_0_tub  member_ids=[Iris, Lea, Nils]   total= 1123 g   ← bac de GROUPE
```

Le banc pose un corps aux bouches secondaires, jamais un objectif. L'instrument
a donc comparé un bac de trois personnes à la cible individuelle de chacune, et
rendu **+344 % à l'identique sur 21 cases**.

**Conséquences, écrites franchement :**

1. **« 7/28 » n'est pas une mesure du moteur.** Sept cases ont été jugées sur la
   bonne base ; les vingt-et-une autres sur une base que le produit ne fabrique
   délibérément pas. Le rapport du 2026-09-13 matin a publié ce nombre sans le
   dire.
2. **« 24/24 conformes » à N=4 est inatteignable par construction** dès qu'une
   bouche est en maintien. Ce n'est pas un défaut à réparer.
3. **L'instrument se contredit** : il écrit « ❌ +344 % » et « contrôle
   incomplet » sur la même case.
4. Le levier existe : `keel_household_set_member_goal(uuid, text)` accepte une
   bouche **sans compte**. Le banc ne l'appelle jamais.

---

## 3. Lot 2 — les preuves déterministes

### 3.1 Les quatre cas qui ne dépendent d'aucune fixture de foyer

Dix-huit tests ajoutés, tous retrouvables par `grep "§ 2.3"`. Chacun a été
validé par **mutation du code de production** : casser la garde, montrer que le
test rougit, restaurer par `cp`, remontrer le vert. Les quatre fichiers de
production ont été vérifiés identiques à l'octet après restauration.

| Mutation appliquée au code de production | Ce qui rougit | Ce qui reste vert |
|---|---|---|
| la branche 422 teste `not_deliverable` au lieu de `validation_unavailable` | § 2.3 ① (2 tests) | les 12 tests C5 |
| le corps 422 technique renvoie le dossier de validation au lieu de `null` | § 2.3 ① (1) | 11 tests C5 |
| la sécurité ne mord que si l'ampleur est comparable | **§ 2.3 ② bis, seul** | 44 tests, dont l'ancien ⑨ bis |
| on adopte dès que la SOMME des écarts baisse | **§ 2.3 ②, seul** | 77 tests |
| le plafond devient `maxCalls × nombre de bouches` | § 2.3 ③ · ③ bis · ③ ter | 77 tests, dont ⑦ bis, ⑧, ⑧ bis |
| un patch rejeté rend le plan **amputé de ses casseroles** | § 2.3 ③ (2) | **toute la famille ⑩ existante** |
| le SECOND retour à la meilleure version oublie son texte source | § 2.3 ② (câblage) | **l'ancien C4 ⑨ reste vert** |
| le plafond est recopié en dur au lieu d'être lu | § 2.3 ③ (câblage) | 16 tests |
| le repère d'écriture est placé avant le refus d'admission | § 2.3 ④ (câblage) | l'ancien test d'admission |

Les quatre lignes qui justifient ce lot sont celles où la mutation **passe sous
tous les tests existants** : une régression d'un consommateur jugée à la somme,
une sécurité qui mord trop tard, un patch rejeté qui ampute le plan, et un
second retour qui perd son texte source.

Ce que chaque cas prouve maintenant :

| Cas du plan | État | Preuve |
|---|---|---|
| Validation indisponible | ⚠️ **partiel** | La décision est juste (`candidateStateOf(null)` → `keep_previous`) et le handler lit exactement cet état sans atteindre d'écriture — les DEUX chemins 422. **Mais aucune exception réelle n'a jamais été levée** : voir § 6. |
| Régression d'un autre consommateur | ✅ | A s'améliore et B tombe → rejet ENTIER ; B passe de conforme à dangereuse → la sécurité mord AVANT l'ampleur ; et le cas qui PASSE (A réparé, B intact → adopté). Les deux sites de retour ramènent le plan entier **et son texte source**. |
| Patch mal formé puis valide | ✅ | Rejet entier sur les quatre motifs nommés ; la seconde réponse s'applique sur la meilleure version ; **39 défauts sur 4 bouches rendent UNE instruction et le plafond reste DEUX** ; un foyer de quatre et une personne seule ont le même plafond ; un appel jeté compte. |
| Autorisation | ✅ | `owner` est le seul rôle qui admet, à la lettre près ; le refus d'un secondaire précède le prompt, l'appel fournisseur, le quota de fusion **et les deux écritures**. |

⚠️ Deux limites nommées par l'agent et conservées telles quelles : le compteur
d'appels et la position du refus sont prouvés **par la source**, pas par un run
HTTP. Un vrai run reste du ressort du banc.

### 3.2 L'instrument avait tort, et c'est ce qui explique le « 7/28 »

**Le moteur compte l'assiette servie (le bac ÷ le nombre de mangeurs).
L'instrument comptait le bac entier.**

Mesuré par la fonction de production `boxNutrition`, tir `perte-l3d04`, case
`fri/dinner` :

```
noms=1  [Paul]             341 g    862,52 kcal
noms=3  [Iris+Lea+Nils]   1123 g   2840,75 kcal      ÷ 3 = 946,92
```

La consigne archivée du moteur, même case : « the dinner dish carries **947 kcal
in one serving** ». **2 840,75 ÷ 3 = 946,92.** Les deux nombres étaient exacts,
sur deux bases différentes.

La convention de production n'a qu'un lieu : `final_plan_audit.ts::cellNutritionTable`
fait `share = box.kcal / eaters` et garde `sharedWith` — « une case à
`sharedWith > 1` porte une estimation, pas une pesée nominative ».
`scripts/2026-09-11-mesure-grille.ts::croiser` indexait la sortie brute **sans
diviser**. Corrigé à l'endroit unique où l'on passe du récipient à la personne.
Contre-épreuve : la densité ne bouge pas (kcal/g est invariant par division).
Effet sur `l3d04` : **0/7 → 10/28** en calorique.

Deux autres défauts de l'instrument, corrigés dans la foulée :

- il lisait la **première** porte finale du tir, pas la dernière. Un tir qui
  répare en passe plusieurs : l'en-tête de chaque bouche affichait `ok=false ·
  refus=4` — l'état d'AVANT la réparation — pendant que la section « porte
  finale » affichait `ok=true`. Deux lectures contradictoires du même tir dans
  le même rapport.
- il affirmait **en dur, sur tous les tirs** : « le gate a reçu `energy: null`
  et `boxContract: null` — son `ok=true` ne certifie ni les calories, ni les
  protéines, ni la présence d'une portion par case. » **C'est faux.** Dans
  `final_plan_gate.ts`, le paramètre `energy` ne pilote qu'UNE cause,
  `mouth_energy_short` (l'enveloppe d'une bouche entière) ; les calories par
  case et par journée, la protéine et la portion absente viennent de
  `nutrition`, que la lane passe bel et bien — c'est ce qui produit
  `cell_energy_off`, `day_energy_off` et `protein_floor_short` dans les tirs
  archivés. La ligne lit désormais ce que la porte a **dit de ce tir-là**, et
  rend « information INDISPONIBLE » quand le journal ne le dit pas. Le plan
  l'exigeait en toutes lettres : « ne pas recopier des avertissements
  historiques de l'instrument comme preuves d'une garde absente ».

### 3.3 Les trois foyers de référence

Horloge figée à `2026-09-13T19:00:00+02:00` ⇒ fenêtre `2026-09-14 → 2026-09-15`
(le jour même tombe sur `shopping_cutoff`) ⇒ **6 cases par bouche**. Chaque
bouche porte un objectif de perte ou de prise, sans quoi elle ne recevrait pas
de portion pesée (§ 2).

| Référence | Calorique | Complète | Contrôles incomplets | Réparations | Livraison |
|---|---:|---:|---:|---:|---|
| **N=1** apport fixe + repas léger | **6/6** | **6/6** | 0 | 0 / 2 | conforme |
| **N=2** partagé + dédié + allergie | **12/12** | **12/12** | 0 | 0 / 2 | conforme |
| **N=4** lot commun + dédié + allergie | **24/24** | **24/24** | 0 | 0 / 2 | conforme |
| **variante** présences par créneau | **22/22** | **22/22** | 0 | 0 / 2 | conforme |

Le dénominateur de la variante est 22 = 6 + 6 + 6 + 4, la somme des cases
**réellement demandées**, pas 4 × 6.

⚠️ **Ces références sont construites, pas générées.** Elles sont composées
contre les contrats que `slot_nutrition_contract.ts` calcule, et leur densité
servie est mesurée avec `dishEnergy` + `weighedReadyGrams`. C'est un test
déterministe de non-régression valide — la revue l'a tranché — et **il ne dit
rien de la compétence générative du modèle**.

### 3.4 Les cas de défaut, sur ces références

| Cas | Verdict | Mesure |
|---|---|---|
| Portion manquante `tue/dinner` + réparation | **adoptée**, 200 | 13 défauts → 1 au tour 1 ; **24/24 et 24/24** ; 2 réparations sur 2 ; la case revient à la bonne personne, date et créneau — **unité créée ET adoptée** |
| Même défaut, patch générique | **refusé**, 422 | le patch recopie la projection, qui porte l'identité cassée ⇒ `candidate_safety_regression` ×2 |
| Session dangereuse puis réparée | **adoptée**, 200 | `output_lock_localized:1`, `safety 1 → 0` ; **24/24 et 24/24** ; 12 plats et 2 casseroles intacts, zéro trace de l'aliment |
| Session dangereuse persistante | **refusé**, 422 `output_lock:1` | aucune écriture en base |
| Lot partagé retouché seul | **refusé**, 422 | `candidate_no_improvement`, 8 → 10 défauts |

❌ **Non démontrés** : l'adoption d'un patch qui **crée une préparation dédiée**
(le banc n'a aucune opération qui forke une casserole) et le cas **complément**,
pas exercé du tout.

### 3.5 Deux défauts de production, reproduits

**① Une bouche qui déclare son rythme vidait la grille de tout le monde —
CORRIGÉ.** Maître silencieux, une seule bouche déclare `lunch, dinner` :
l'union nue valait `{lunch, dinner}` et le calendrier envoyé au modèle ne
portait plus que **4 cases sur 6** — les deux petits-déjeuners du foyer
disparaissaient **pour les quatre bouches**. La prémisse écrite dans le code
(« une bouche à `null` n'ajoute rien : elle mange aux moments de la maison,
ce qui est exactement ce que l'union contient déjà ») est fausse quand la maison
elle-même n'a rien déclaré.

La règle est maintenant `householdGridSlots` (`meal_generation.ts`), **pure et
testée** : base = ce que le maître a déclaré, sinon les moments de la maison ;
union = base ∪ ce que chaque bouche ajoute. Elle vivait en ligne dans les
18 000 lignes du handler, donc sa seule preuve était un tir au banc — le
prochain remaniement l'aurait défaite sans qu'un test rougisse. 7 tests
(`eating_rhythm_test.ts`), dont **le cas qui passe** : un maître qui déclare
`lunch, dinner` garde exactement sa grille de deux moments. Contre-épreuve :
remettre l'union nue → 4 tests rouges ; restauré par `cp`, identique à l'octet,
17 verts.

**② Une bouche d'âge inconnu ne peut pas être nourrie — NON CORRIGÉ.** Sans
date de naissance, `dayTargetFor` s'abstient, aucun contenant n'est écrit
(`tubs_authored: 0`), `mouth_unfed` rend `not_named`, et **le plan entier est
refusé pour les quatre bouches**. La même variante en `maintenance` passe en 200
et rend 22/22 : le blocage tient à l'absence de **cible**, pas à l'absence de
portion pesée. Le chemin d'écriture des bacs n'est pas cadré par ce plan.

⚠️ **Observation mesurée, non corrigée** : sur ce chemin, chaque mangeur reçoit
un contenant à **un seul nom**, y compris la bouche en `maintenance` (22 boîtes,
toutes nominatives). La protection écrite dans `weighedPortionMembers` n'est pas
ce que cette lane livre. À vérifier avant de s'appuyer dessus.

### 3.6 Les contre-exemples rejoués

`relire-consigne-reparation.ts` ouvre le corps JSON **réellement transmis**.

| Forme | Lignes adressées | Avec `member_id` | Consignes contradictoires | Troncature | Objectifs orphelins |
|---|---:|---:|---:|---|---:|
| `h4n4` | 13 | 4 (+ 9 avec `dish=`) | **0 / 5** | aucune | 0 |
| `h2n2` | 4 | 2 | **0 / 5** | aucune | 0 |

## 4. Lot 3 — la mesure avec le vrai fournisseur

### 4.1 Comment ces appels ont été passés

Le banc a gagné un drapeau `--premier-jet-reel` : jusqu'ici, `--reparation-reelle`
ne payait que les tours **> 0**, donc le premier jet restait toujours en
conserve et aucun chiffre ne disait ce que le modèle sait composer. Les deux
drapeaux se cumulent et le plafond du transport est leur somme.

⚠️ **Par le banc, pas par Kong.** `campagne-lot-F.ts` sort par le `functions
serve` de l'humain, et le runtime edge sert des modules `_shared` en cache : un
appel payant y mesurerait peut-être le code d'avant le chantier. Le banc importe
le handler directement — code courant, et pas de coupure Kong à 150 s. C'est
important ici : **le premier appel a duré 116,6 s**, le deuxième 137,5 s, le
troisième 131,5 s. Par la voie normale, deux des trois auraient frôlé la coupure.

Budget dépensé : **3 générations initiales réelles sur 3 autorisées**, 0 appel
de réparation réel sur 6.

### 4.2 Les trois premiers jets réels

| | Durée fournisseur | Statut | Calorique | Complète | Réparations | Livraison |
|---|---:|---|---:|---:|---:|---|
| **N=1** | 116,6 s | 200 | **6/6** | **6/6** | **0** (aucun défaut) | conforme |
| **N=2** | 137,5 s | 200 | 12/12 | 12/12 | 2 / 2 | `deliverable_with_gaps` |
| **N=4** | 131,5 s | **422** | — | — | 0 | `plan_not_deliverable` |

**N=1 — le scénario ① est atteint.** Premier jet réel, aucun défaut
(`plan_repair_pass: defects 0, reason no_defects`), porte finale
`ok=true · refus=0 · bloquants=0`, six cases sur six sur les deux colonnes. Ce
résultat n'avait jamais été obtenu.

**N=2 — le premier jet n'est PAS valide, et le 12/12 ne doit pas se lire comme
une réussite.** Les cinq critères de la colonne « complète » (plat, portion,
calories, masse, densité) passent, mais la **protéine est comptée à part** et
elle a mordu : **6 défauts `protein_floor_short`** sur les deux bouches,
livraison `deliverable_with_gaps`. Les deux appels de réparation ont été
consommés **pour rien** — le banc servait sa réponse en conserve, rejetée deux
fois pour `base_version_missing` — et la meilleure version, c'est-à-dire le
premier jet réel lui-même, a été conservée.

**N=4 — refusé, et ce n'est pas le modèle.** Voir § 4.3.

### 4.3 Le refus de N=4, jusqu'au premier stade de divergence

```
regime_forbidden_component · mon/breakfast
term: « yaourt de soja nature »
detail: boîte « box_mon_breakfast_1_… » contre le régime « vegan » : dairy_yogurt
```

La ligne d'ingrédient telle que le modèle l'a écrite :

```json
{"term": "yaourt de soja nature", "amount": 100, "unit": "g",
 "ref": "soy_yogurt", "group": "dairy_yogurt"}
```

- `ref: "soy_yogurt"` est **juste** : en base, `food_composition_refs.slug =
  'soy_yogurt'` porte `food_group_ref = 'tofu_tempeh'`.
- `group: "dairy_yogurt"` est **faux**, et c'est le modèle qui l'a écrit.
- Même plat : `{"ref": "soy_milk", "group": "whole_grain"}` — incohérent aussi.

**Le défaut du moteur** : `foodGroupWriteCounts` ne valide le groupe déclaré que
contre le **vocabulaire fermé** — `dairy_yogurt` est un slug parfaitement
valide — et **rien ne le confronte jamais au `ref` posé sur la même ligne**,
alors que le référentiel connaît la réponse. La garde de régime croit ensuite ce
groupe et refuse **le plan entier des quatre bouches**.

⛔ La conclusion « le modèle ne sait pas composer pour quatre » serait fausse :
il a écrit une ligne végane correcte, avec la bonne référence, et le moteur l'a
rejetée sur une étiquette qu'il aurait dû corriger lui-même.

Le correctif : **le `ref` prime sur le `group` déclaré quand le `ref` se
résout**, avec un compteur de conflits — un champ déclaré par le modèle sans
compteur est un lot désarmé. Une ligne sans `ref`, ou dont le `ref` ne se
résout pas, garde son groupe déclaré : c'est la seule information disponible, et
la retirer désarmerait la garde au lieu de la corriger.

Les trois premiers jets réels sont figés comme plans rejouables dans
`scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/references/premier-jet-reel-n{1,2,4}.json`,
ce qui permet de rejouer N=4 **sans repayer** une fois le correctif en place.

### 4.4 N=4 rejoué à travers le moteur corrigé — zéro dépense

Même sortie du modèle, moteur réparé :

| | avant | après |
|---|---|---|
| statut | **422** `plan_not_deliverable` | **200** |
| `regime_forbidden_component` | 1 (bloquant) | **0** |
| `food_groups` | pas de compteur de conflit | `declared 54 · valid 54 · **conflicting 6**` |
| conformité calorique | — | **24/24** |
| conformité complète | — | **22/24** |
| livraison | refusée | `deliverable_with_gaps` |

Les écarts qui restent appartiennent au modèle : `cook_day_unplaced` 5,
`cell_bounds_off` 2, `protein_floor_short` 2. Aucun n'est bloquant.

### 4.5 La réparation réelle utile à plusieurs — **NON VALIDÉE**

Quatre appels de réparation réellement facturés, sur deux parcours hybrides à
N=4 (premier jet réel figé, patch réel). **Aucun n'a produit un patch
utilisable.**

| Appel | Durée | Ce que le modèle a rendu | Ce que le moteur en a fait |
|---|---:|---|---|
| ①.1 | 52,4 s | `units` contenait la chaîne nue `"uses"` | rejet ENTIER (`unit_not_an_object`) — plan inchangé |
| ①.2 | 91,2 s | 12 unités bien formées, mais **8 recettes sans quantité** | patch appliqué, candidate **rejetée** (`cell_without_portion: 16`), meilleure version restaurée |
| ②.1 | 53,2 s | trois chaînes nues dans `units` | rejet ENTIER (`unit_not_an_object` ×3) |
| ②.2 | — | **l'appel a échoué** : repli fournisseur `gpt-5.6-luna → gpt-5.6-sol` | non mesuré, voir ci-dessous |

**⛔ Le plan exige de ne pas déclarer le lot fermé parce que les appels ont eu
lieu. Il ne l'est pas.** Le protocole s'est comporté exactement comme prévu —
atomicité tenue, régression refusée, meilleure version sûre livrée en 200 — mais
la preuve demandée, « un patch réel appliqué, adopté après mesure, corrigeant le
défaut prévu sans perdre de portion ni dégrader les autres », n'est pas faite.
**Deux appels restent non dépensés.**

Ce que ces échecs ont appris, et qui n'était pas une limite du modèle :

- **L'appel ①.2 est notre faute.** Le schéma de patch écrivait
  `"ingredients":[…]` et rien d'autre. Sa seule règle sur une ligne était
  « tout ingrédient qui porte un poids porte son `ref` » — elle dit quoi faire
  *si* il y a un poids, jamais qu'il en faut un. Le modèle n'a pas désobéi : on
  ne lui avait rien demandé. La forme complète d'un ingrédient est maintenant
  écrite dans le schéma, **avec les mots exacts du brief initial** — c'est la
  cicatrice `promise-and-schema-key-must-be-adjacent` de ce dépôt, où un
  « comme plus haut » ne traverse pas la frontière système↔utilisateur.
- **L'appel ②.2 n'a rien mesuré, et le banc y était pour quelque chose.** Le
  transport route sur le NOM du modèle. Quand la chaîne de repli du fournisseur
  a basculé sur `gpt-5.6-sol`, le banc a pris ce repli pour un appel de
  *remplissage* et lui a servi la conserve `{"items":[]}` — rejetée pour
  `base_version_missing`. Un appel facturé perdu, et une trace qui accusait le
  modèle à tort. Corrigé : les modèles de repli sont déclarés et routés comme de
  la composition, avec un avertissement bruyant.
- **Ce qui reste au modèle**, et se répète : deux fois sur quatre, il a écrit une
  **chaîne nue à l'intérieur du tableau `units`**. Ce n'est pas une recette
  fausse, c'est du JSON mal formé. Le moteur le refuse entièrement, ce qui est
  la bonne réponse.

⚠️ **Durée.** Le second parcours est passé de 146 s à 352 s, l'appel en échec
ayant consommé l'essentiel. La campagne payante s'arrête ici plutôt que de
relancer dans le vide.

## 5. Tableau d'état, exigence par exigence

> ⛔ `⚠️` et `❌` ne se lisent pas `✅`.

### Lot 1

| Exigence du plan | État | Preuve |
|---|---|---|
| § 1.1 reproduire les deux défauts sur les messages finaux | ✅ | `plan_repair_attribution_test.ts`, sortie d'échec au § 1.1 |
| § 1.2 identifiant, date, créneau, unités, mesure sur chaque consigne | ✅ | tests ① A, A bis, A ter, ④ bis, ④ ter |
| § 1.2 prénoms identiques restent deux personnes | ✅ | test ① A ter |
| § 1.2 défaut sans propriétaire ⇒ contexte incomplet, pas d'appel | ✅ | test ⑤ ter + câblage ⑪ bis |
| § 1.2 une session n'est attribuée à personne | ✅ | test ③ |
| § 1.3 contrats de TOUS les consommateurs d'un lot partagé | ✅ | section ⑫ (11 tests), extrait au § 1.4 |
| § 1.3 quantités mesurées de chacun, jamais recopiées | ✅ | mutation « chiffres du premier recopiés » ⇒ 3 rouges |
| § 1.3 aucune interdiction globale | ✅ | tests ② B bis, ⑥ bis, ⑫ |
| § 1.4 constats structurés au lieu des mini-prompts | ✅ | `c4DensityAsk` par plat, `c4DedicatedAsk` garde `DedicatedRepair` |
| § 1.4 un seul endroit décide du schéma | ✅ | test ⑥ |
| § 1.4 retirer les interdictions globales, garder la locale | ✅ | 5 consignes retirées, `FROZEN` conservé |
| § 1.5 personne ne disparaît par troncature | ✅ | tests ⑤, ⑤ bis ; `contextIncomplete` arrête avant le budget |
| § 1.6 un producteur incompatible fait échouer un test de message final | ✅ | test ⑨ bis |
| § 1.6 rejeu de `h2n2` / `h4n4` | ✅ | 0/5 consignes contradictoires, 0 objectif orphelin |

### Lot 2

| Exigence du plan | État | Preuve |
|---|---|---|
| § 2.1 deux corpus explicitement distincts | ✅ | § 3.3 le dit : les références sont **construites**, pas générées |
| § 2.2 N=1 / N=2 / N=4 conformes SANS réparation | ✅ | 6/6 · 12/12 · 24/24 sur les deux colonnes, 0 réparation |
| § 2.2 variante présences par créneau | ✅ | 22/22 · 22/22, dénominateur 6+6+6+4 |
| § 2.2 variante bouche protégée / mineure | ❌ | **échoue** : sans date de naissance, aucun contenant n'est écrit et le plan des quatre est refusé. Reproduit, non corrigé (§ 3.5 ②) |
| § 2.3 validation indisponible | ⚠️ | décision et câblage prouvés ; **aucune exception réelle n'a jamais été levée** — voir § 6 |
| § 2.3 isolation d'un lot jusqu'à adoption | ❌ | le banc ne sait pas forker une casserole ; seul le refus d'une retouche non améliorante est démontré |
| § 2.3 portion manquante créée ET adoptée | ✅ | `lot2-d3` : 13 défauts → 1, 24/24 et 24/24, 200 |
| § 2.3 complément sans double comptage | ❌ | **non exercé** |
| § 2.3 régression d'un autre consommateur | ✅ | § 2.3 ②, ② bis, ② ter + les deux sites de retour |
| § 2.3 écart résiduel visible pour la bonne personne | ✅ | 4 tests de rendu ; la limite des homonymes est NOMMÉE par un test |
| § 2.3 session dangereuse puis réparée, et persistante refusée | ✅ | `lot2-d5` 200 · `lot2-d6` 422 sans écriture |
| § 2.3 patch mal formé puis valide, plafond commun au foyer | ✅ | § 2.3 ③ · ③ bis · ③ ter |
| § 2.3 autorisation, refus avant appel et écriture | ✅ | § 2.3 ④ |
| § 2.4 rejeu des contre-exemples | ✅ | § 3.6 |

### Lot 3

| Exigence du plan | État | Preuve |
|---|---|---|
| § 3.1 un premier jet réel par référence | ✅ | 3 appels, 3 sur 3 du budget |
| § 3.1 mesurer la durée du premier avant de dimensionner | ✅ | 116,6 s mesurés avant les suivants |
| § 3.1 localiser le premier stade de divergence d'un échec | ✅ | § 4.3 : la ligne, le `ref`, le groupe déclaré, le lieu du code |
| § 3.2 réparation réelle utile à plusieurs | ❌ | **NON VALIDÉE** — 4 appels, aucun patch utilisable (§ 4.5) |
| § 3.2 aucune reprise du transport présentée comme une réussite | ✅ | le repli est nommé, l'appel ②.2 est déclaré non mesuré |
| § 3.3 tests ciblés, `deno check`, gate du dépôt | ✅ | § 7 |
| § 3.3 demandes gelées puis mesurées une par une | ✅ | `lot3-reel-n1`, `-n2`, `-n4-rejoue` |
| § 3.4 les trois états sous un même parcours | ✅ | 200 conforme (N=1), 422 refusé (N=4 avant correctif), candidate rejetée et meilleure version livrée (§ 4.5) |

### Ce que le chantier a réparé en plus du plan

| Défaut trouvé | Trouvé par | État |
|---|---|---|
| `repairInstruction` portait aussi l'ordre de plan complet | lecture du code | ✅ corrigé |
| l'instrument comparait un bac de groupe à une cible individuelle | rejeu de `l3d04` | ✅ corrigé (`0/7 → 10/28`) |
| l'instrument lisait la PREMIÈRE porte, pas la dernière | rejeu de `lot2-d3` | ✅ corrigé |
| l'instrument affirmait en dur que la porte ne vérifie pas les calories | lecture de `final_plan_gate.ts` | ✅ corrigé, dérivé du tir |
| une bouche qui déclare son rythme vidait la grille de tous | tir `lot2v1` | ✅ corrigé et **extrait en fonction pure testée** |
| le `group` déclaré par le modèle n'était jamais confronté à son `ref` | **appel réel payé** | ✅ corrigé, avec compteur de conflits |
| le schéma de patch ne demandait pas les quantités | **appel réel payé** | ✅ corrigé |
| le banc servait la conserve de remplissage à un repli fournisseur | **appel réel payé** | ✅ corrigé |
| `NON-BRANCHE.md` décrivait la garde tombée comme un fail-open | lecture | ✅ note corrigée |

---

## 6. Ce que ce rapport NE prouve pas

**6.1 — La réparation réelle utile à plusieurs n'est pas démontrée.** Quatre
appels facturés, aucun patch utilisable. Le protocole protège correctement, et
c'est tout ce qui est établi. Deux appels restent au budget.

**6.2 — « Validation indisponible » n'est pas éprouvé de bout en bout.** Ce qui
est prouvé : la décision (`candidateStateOf(null)` → `keep_previous`) et le fait
que le handler lit exactement cet état sans atteindre d'écriture, sur les deux
chemins 422. Ce qui ne l'est pas : **qu'une exception réelle de `finalPlanGate`
produise `gateDelivery === null`**. Le `catch` est lu par la source, jamais
exécuté — aucune des quatre fonctions du chemin ne porte de `throw`, et le plan
interdit d'ajouter un interrupteur de test en production.

**6.3 — Trois cas ne sont pas exercés.** L'isolation d'un lot jusqu'à l'adoption
d'une préparation dédiée (le banc ne sait pas forker une casserole), le
complément sans double comptage (pas exercé du tout), et la bouche protégée ou
mineure (**elle échoue** : sans date de naissance, le plan entier du foyer est
refusé — reproduit, documenté, non corrigé).

**6.4 — Les références déterministes ne mesurent pas le modèle.** Elles sont
composées contre les contrats que le moteur calcule. Leur 6/6, 12/12 et 24/24
prouve que le code sait servir un plan valide, pas que le modèle sait en écrire
un. Les seuls chiffres qui parlent du modèle sont ceux du § 4.2.

**6.5 — Un seul tir par taille.** Trois générations réelles, une par foyer. Un
tir n'est pas un taux. N=1 à 6/6 ne dit pas que le modèle réussit toujours à une
personne, et N=4 refusé ne disait pas qu'il échoue toujours à quatre — la preuve
en est qu'il passe après correction du moteur.

**6.6 — La protection des bouches en maintien n'est pas ce que la lane livre.**
`weighedPortionMembers` réserve la portion pesée aux objectifs de perte et de
prise ; sur le chemin mesuré, chaque mangeur reçoit pourtant un contenant à un
seul nom, la bouche en maintien comprise. Observé, non corrigé, à vérifier avant
de s'appuyer dessus.

**6.7 — La durée est proche de la coupure.** 116, 137 et 131 secondes par
génération. Le banc appelle le handler directement ; par la voie normale, Kong
coupe à 150 s. Deux des trois appels seraient passés à moins de vingt secondes
de l'échec. Ce n'est pas mesuré ici, c'est déduit d'une constante connue.

---

## 7. Vérifications finales

| Commande | Résultat |
|---|---|
| `deno test --allow-all supabase/functions/_shared/keel/` | **7 137 passés · 0 échoué · 2 ignorés** (7 055 au départ) |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | passe |
| `deno test --allow-all scripts/2026-09-11-mesure-grille_test.ts` | 42 passés |
| `npx vitest run src/keel/components/plan/planValidation.int.test.ts` | 20 passés |
| `npx tsc -b --force tsconfig.app.json` | exit 0 |

Coût réel de la campagne : **3 générations initiales** (sur 3 autorisées) et
**4 appels de réparation** (sur 6). Deux non dépensés.
