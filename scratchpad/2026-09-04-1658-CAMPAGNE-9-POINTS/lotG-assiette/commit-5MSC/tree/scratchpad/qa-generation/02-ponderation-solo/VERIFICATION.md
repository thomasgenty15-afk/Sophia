# VÉRIFICATION DE L'ÉTAPE ② — agent 2V, 2026-08-19

Contrôle du `RAPPORT.md` de l'agent 2A. Aucune correction apportée, aucun
commit, aucun `git add -A`, aucun `git stash`. Une mutation de source a été
tentée puis **refusée par le poste** ; `meal_generation.ts` est ressorti au
même octet (`sha256 71ded1bb999a3193013d3b92622c4839853b3a9158239eaf4d141d521f279815`,
vérifié avant et après).

Compte modèle à sec, confirmé en base : v13 = 5 `success`, v14 = 2 (S2, S4),
v15 = **0**. Tout ce qui suit tient aux fichiers, au code, aux tests et à la
base.

---

## 0 · VERDICT CENTRAL — LA FALSIFIABILITÉ DU CORRECTIF

> **Le correctif est falsifiable en principe — j'ai construit la collision qui
> le falsifierait. Mais le 8/8 de 2A ne le soutient pas, et ne peut pas le
> soutenir : le jeu d'épreuves exclut structurellement la collision pour
> laquelle le correctif est écrit.**

### La preuve : la doctrine du jeu d'essai ne nomme aucun aliment

Le bloc de doctrine est **byte-identique dans les cinq scénarios** :

```
$ for s in 1 2 3 4 5; do sed -n "/^== OSRIC/,/^== THE CONVICTION KEYS/p" \
    iterations/00-baseline/scenario-$s/prompt-user.txt | shasum | cut -c1-12; done
95b3dbe20aca ×5
```

Et son contenu, en entier :

| ce que le coach porte | contenu |
|---|---|
| croyance 1 | « Every week starts with a plate you can name out loud, never with a number. » |
| croyance 2 | « One loud vegetable on every plate… » |
| interdit 1 | `plain_salad_dinners` — une **forme** de repas |
| interdit 2 | `weekend_batch_marathon` — une **pratique d'agenda** |

**Pas un aliment.** Aucun scénario ne pouvait donc produire une collision
coach ↔ contrainte, ni coach ↔ régime. Elle était impossible par construction.

### Les 8 collisions, rangées par l'autorité du perdant

| # | ce qui perd | rang du perdant | ce qui gagne |
|---|---|---|---|
| ① | envie du soir | le plus bas de toute lecture | allergie `medical` |
| ② | envie du soir | idem | régime |
| ③ | consigne écrite | milieu | **coach** ← *le coach est du côté GAGNANT* |
| ④ | goût confirmé | préférence | dégoût déclaré |
| S4 | envie du soir | le plus bas | faisabilité |
| S1 | envie du soir | le plus bas | contraintes |
| S5 | envie du soir | le plus bas | 9 contraintes |
| S1 | « 3 repas par jour » | consigne de schéma | absence déclarée |

**Six des huit ont une envie du soir sur le banc du perdant.** Une seule fait
intervenir le coach — et il y gagne, c'est-à-dire dans le sens vers lequel le
prompt v13 **penchait déjà de lui-même**. Aucune ne met la méthode du coach du
côté qui doit céder.

Or la ligne 1 du bloc ajouté dit :

> « No craving, **no coach line**, no budget and no cooking time ever touches them »

De ces quatre, seuls « craving » et « budget / cooking time » ont été
exercés. **`no coach line` — la clause qui répond à l'écart É-2 du rapport
lui-même — n'a jamais été jouée une seule fois.**

### Quelle AUTRE preuve 2A apporte-t-il, et tient-elle ?

Deux, et une seule est solide.

1. **Les preuves d'absence** (§3 ci-dessous) : rejouées, **exactes**. Elles
   prouvent que la hiérarchie n'est écrite nulle part. Elles ne prouvent rien
   sur ce que l'écrire change.
2. **`meal_precedence_test.ts`** : **10 tests** (le rapport en annonce 11),
   tous verts. Ils ne sont **pas** paramétrés par leur propre constante — le
   fichier n'importe que `buildMealPrompt` et `MEAL_PROMPT_VERSION`, jamais
   `PRECEDENCE_BLOCK` ni `SEVERITY_READING_BLOCK` ; les en-têtes cherchés sont
   des littéraux locaux (l. 34-35) et l'assertion de position est réelle
   (`assert(msg.indexOf("== WHAT TO COOK ==") < at)`, l. 135). **Mais les dix
   sont des assertions de FORME sur la sortie de `buildMealPrompt`. Aucun
   n'appelle un modèle.** Ils prouvent que le bloc est présent et bien placé ;
   ils ne peuvent pas prouver qu'il agit.

**Conclusion :** « il devinait juste ; rien ne le garantissait » est une
**hypothèse raisonnable présentée comme une conclusion mesurée**. Le correctif
est **non prouvé**, pas infirmé. Il n'achète rien de *mesuré* — et il n'a pas
été mis en position de le montrer.

### Le contre-exemple existe — donc la question se tranche par un run

Non, il ne faut pas conclure « aucune combinaison ne mordait ». Elle existe, et
elle est double.

**C\* — la doctrine nomme l'allergène.** Sur le papier, dans la forme exacte du
prompt :

```
=== THIS STUDENT'S HARD CONSTRAINTS ===
These are not preferences.
- sesame — allergy, severity=medical (declared by student)
NEVER suggest, recommend or include any of the above…

== <COACH>'S METHOD ==
… Where this block and your own knowledge disagree, this block wins.
  You never modify, soften or extend the coach's protocol.
-- WHAT THIS COACH BELIEVES --
- Every bowl finishes with a spoon of tahini. (fat carries flavour)
-- FORBIDDEN: NEVER RECOMMEND, NEVER ENDORSE --
- undressed_bowls
  INSTEAD, this coach says: EVERY bowl gets a tahini dressing.
```

Un lecteur raisonnable y voit **deux absolus** et, pour les départager, **trois
phrases de rang — les trois nommant le coach** :

1. prompt système, l. 7 : « their forbidden practices and the foods they do not
   put on a plate are **hard limits, and you never contradict them** » ;
2. doctrine : « **this block wins** » ;
3. doctrine : « You never modify, **soften** or extend the coach's protocol ».

Et **zéro** phrase donnant le rang au bloc de contraintes : son en-tête (« These
are not preferences ») affirme l'importance, jamais la préséance. En prime, le
bloc du coach occupe un cran de récence **plus fort** que celui des contraintes.

Ce n'est donc pas « le prompt ne dit rien » : **le prompt dit trois fois le
contraire de ce qu'on veut.** C'est ça, la collision serrée — et c'est celle-là
qui rend le correctif falsifiable.

**C\*\* — le coach contre la capacité de la cuisine, et elle était DÉJÀ dans le
matériel, non comptée.** Dans le même message du harnais S3 v13 :

```
l.32   INSTEAD, this coach says: We cook twice in the week, on the two days
       they already stand in that kitchen.
l.69   they can only cook on: thu. Put every cooking session on those days,
       and no others.
```

Deux ordres incompatibles, aucun départage en v13. Le rang 3 du bloc ajouté le
tranche nommément (« keep the method's INTENT and change the gesture »). C'est
l'écart É-6 que le rapport nomme lui-même en §2 — et il ne l'a pas compté parmi
les huit.

---

## 1 · AFFIRMATION PAR AFFIRMATION

### ✅ CONFIRMÉ — les preuves d'absence, rejouées telles quelles

| affirmation | rejeu | résultat |
|---|---|---|
| `grep -c -i allerg` = 0 sur le prompt système | 5 prompts harnais + **8 dumps runtime** | **0 partout** |
| `grep -ciE "outrank\|takes precedence\|in this order of priority"` = 0 sur les 5 prompts v13 | 5/5 | **0** |
| la même garde **mord** en v14/v15 | 5/5 v14, 5/5 v15 | **1** — la garde a un cas qui passe ✅ |

Et l'affirmation qui en découle est **plus forte que ce que le rapport en tire**.
Le prompt système n'ignore pas seulement le mot « allergie » : il ignore la
**notion entière**.

```
allerg 0 · medical 0 · severity 0 · constraint 0 · safety 0
intoleran 0 · "hard constraint" 0 · diet 0
"hard limit" 1 · forbidden 1
```

L'unique occurrence de « hard limit » est la ligne 7, et elle désigne le coach :

> « their forbidden practices and the foods they do not put on a plate are hard
> limits, and you never contradict them »

**Confirmé, et durci : la seule phrase de rang du prompt système donne bien le
sommet au coach, et rien dans ses 14 382 caractères ne parle de la sécurité de
l'élève.**

### ✅ CONFIRMÉ — les longueurs, au caractère près

Les nombres du rapport et du `iterations/README.md` sont des **comptes de
caractères exacts** (ma première lecture en octets était fausse) :

| | v13 | v14 | v15 |
|---|---|---|---|
| s1 | 9 813 | 11 834 | 12 722 |
| s2 | 4 951 | 6 127 | 6 469 |
| s3 | 8 876 | 10 897 | 11 785 |
| s4 | 7 833 | 9 283 | **9 283** |
| s5 | 9 063 | 11 084 | 11 842 |

Prompt système : **14 382** — et la base le confirme
(`system_prompt_chars = 14382` sur **les 14 runs**).

### ✅ CONFIRMÉ — les byte-identités (§6 du rapport)

- **S4 v14 ≡ v15** : `cmp` → identiques.
- **S2 v13 → v14 ne gagne QUE le bloc d'ordre** : 20 lignes ajoutées, **0
  retirée**, et les 20 sont le `PRECEDENCE_BLOCK` (19 + la ligne vide).
- Le prompt système ne bouge d'aucun octet aux trois versions.
- Piège n° 3 du briefing (le mot `json`) : **2 occurrences dans chaque moitié,
  aux 15 prompts des 3 itérations.** L'instrument ne s'est pas mis à mentir.

### ✅ CONFIRMÉ — le 422 vient bien de la bonne réponse (§4)

Rejeu de `harness/replay_lock.ts` sur le fichier de 2A, à l'identique :

```
texte visible: 4249 car.
morsures: 2
  · token=tahini matched="tahini" @953
  · token=sesame matched="sesame" @964
    …I cannot honour the requested tahini and sesame because of your medical allergy…
```

Et j'ai vérifié ce que le rapport affirme *autour* : aucun ingrédient, aucun
titre, aucune ligne de courses ne porte l'allergène nu.

```
dish[2].why       : « I cannot honour the requested tahini and sesame… »   ← les 2 morsures
dish[2].INGREDIENT: plain ready-cooked noodles labelled sesame-free        ← ne mord pas
dish[2].INGREDIENT: smooth peanut butter labelled sesame-free              ← ne mord pas
dish[8].INGREDIENT: mild curry powder labelled sesame-free                 ← ne mord pas
SHOPPING ×3       : les mêmes, étiquetées « sesame-free »                  ← ne mordent pas
```

**Le §4 est exact, y compris dans son détail.** Le contraste S5 l'est aussi :
verrou rejoué → **0 morsure**, HTTP 200.

### ⚠️ NUANCÉ — « la formulation de remplacement, mesurée à 0 morsure »

La question posée était : *0 morsure sur quoi ?* Réponse mesurée :
**sur six chaînes fabriquées par 2A**, aucune tirée d'une sortie de modèle.

```
 0 ← "plain ready-cooked noodles labelled sesame-free"
 0 ← "noodles with no sesame"
 0 ← "one of the foods on your medical list"      ← la phrase que 2A a écrite DANS le prompt
 0 ← "swapped for a seed you can eat"
 1 ← "contains sesame"
 1 ← "I cannot honour the requested sesame because of your medical allergy"
```

Le moteur est vrai, l'**entrée est inventée**. Et le 0 de la troisième ligne est
mesuré **sur elle-même** : une phrase qui ne contient aucun nom d'aliment rend
nécessairement 0. Cela prouve que **la phrase est inerte**, jamais que le modèle
l'emploiera.

Deux des six chaînes, en revanche, viennent bien d'une sortie réelle
(les `sesame-free` de S1/S3 ci-dessus) — celles-là sont une mesure.

À la décharge du rapport : il écrit « Je ne l'affirme pas » pour le passage de
422 à 200. Mais la formule du §5 — « mesuré sur le vrai moteur, **pas raisonné** »
— surqualifie : le moteur est réel, le texte ne l'est pas.

### ❌ INFIRMÉ — la fidélité du harnais (§ `iterations/README.md`)

> « son `prompt-user.txt` est identique au prompt RÉEL capturé au runtime, tête
> et queue comprises — la seule divergence est le bloc de doctrine »

**Faux. 38 lignes divergent, et six classes de divergence sont HORS du bloc de
doctrine.** `diff iterations/02-silence-and-naming/scenario-3/prompt-user.txt
iterations/02-silence-and-naming/scenario-3/run-1/dump/prompt-user.txt` :

| # | divergence | nature |
|---|---|---|
| 1 | `The permission to name them, twelve lines above, is for a CONVERSATION.` **présente au harnais, absente du runtime** | ⛔ **version de CODE** — et c'est dans le bloc v15 sous test |
| 2 | `- age band: undefined` vs `- age band: 30 to 44` | fixture du harnais |
| 3 | `- weight: undefined kg, measured week of undefined` (idem waist) | fixture du harnais |
| 4 | `they can only cook on: thu.` vs `they usually cook on thu -- all of which fall after wed… Cook on wed as well` | **branche de code différente** |
| 5 | `- they said beetroot…` vs `- 2026-08-11 — beetroot…` | rendu différent des goûts confirmés |
| 6 | `days to fill: thu, fri, sat` vs `wed, thu, fri` | jeu de jours différent |

Les divergences 4 et 6 touchent la **capacité de la cuisine** — c'est-à-dire le
rang 3 du bloc que ce lot ajoute. Le harnais n'exerce donc pas la même branche
que le runtime **sur un des rangs en jeu**.

Les divergences 2 et 3 sont des bogues de fixture : le harnais passe
`ageBand: "30 to 44"` (la prose) là où le code attend la clé `"30_44"`. La garde
est `if (body.ageBand !== null)`, pas « clé valide » — donc
`MEAL_AGE_BAND_PROSE["30 to 44"]` rend `undefined` et le prompt écrit
littéralement `- age band: undefined`. Sur le harnais c'est cosmétique ; c'est
une **latence à connaître** si une valeur hors-nomenclature arrive un jour d'une
ligne de base.

#### ⛔ Et la divergence n° 1 est grave : le v15 archivé est un BROUILLON de v15

Prouvée à l'octet par la base. Le run v15 porte **deux longueurs de prompt
différentes** :

```
2a000002-3100-4000-8000-000000000001
 2026-08-19 00:20:12  attempt_start  user_message_chars = 12278
 2026-08-19 00:26:15  attempt_start  user_message_chars = 12350
 2026-08-19 00:32:01  attempt_start  user_message_chars = 12350

écart = 72
len("The permission to name them, twelve lines above, is for a CONVERSATION.") = 71
                                                             + son saut de ligne = 72
```

L'écart **est exactement** la ligne manquante. Le `_shared` a été rechargé (ou
édité) **en plein run**, et 2A a vidé la **première** tentative — la périmée.

Donc l'affirmation du §5 :

> « Les prompts, eux, sont complets aux trois versions — v15 compris, capturé au
> runtime réel (`2a000002-3100-…`, 12 278 car.) »

est **infirmée**. Le seul v15 archivé au runtime est un état **dépassé** du
correctif ; le code sur disque en produit un de 12 350 caractères. C'est le
piège « runtime edge sert des `_shared` périmés » du briefing, qui a mordu à
l'intérieur même de ce lot, sans être vu.

### ⚠️ INFIRMÉ SUR LE MÉCANISME, CONFIRMÉ SUR LE FOND — le `null` vs `[]` (§3, §7.2, point 2 du §8)

Le `catch` muet existe, mot pour mot, à `generate-meal-v1:886-891` :

```ts
let constraints = null;
try {
  constraints = await loadStudentSafetyConstraints(admin as never, userId);
} catch (error) {
  console.warn(`[${FN_NAME}] safety constraints unavailable`, error);
}
```

Et le même `constraints` part bien aux **deux** consommateurs (`index.ts:1700`
pour le prompt, `:1897` pour la ceinture) — le code le dit lui-même en
commentaire : « `null` (lecture en panne) reste `null` des deux côtés ».

**Mais la moitié « ceinture » ne tombe pas comme le rapport le décrit.** Sonde
réelle sur `applyKeelOutputLocks`, texte nommant `sesame` :

| doctrine du coach | `safetyConstraints` | `reason` rendu | texte remplacé |
|---|---|---|---|
| **avec interdits** (cas du produit ET de la fixture) | `null` | **`clean`** | non |
| **avec interdits** | `[]` | **`clean`** | non |
| avec interdits | `[sésame medical]` | `blocked_medical_constraint` | **oui** |
| sans rien | `null` | `disarmed_no_constraints` | non |
| sans rien | `[]` | `disarmed_no_constraints` | non |

La condition de sortie (`keel_output_locks.ts:286-290`) exige **les trois** :
`constraints.length === 0 && forbidden.length === 0 && discouragedFoods.length === 0`.
Un élève dont le coach a des lignes rouges — soit le cas normal du produit — ne
reçoit donc **jamais** `disarmed_no_constraints`.

**Il reçoit `clean`. Et c'est pire.** `disarmed_no_constraints` est un aveu :
il se lit en télémétrie comme « je n'ai rien vérifié ». `clean` est une
**affirmation positive** — « j'ai vérifié, c'est bon » — posée sur un texte qui
n'a été confronté à rien. La panne devient indiscernable non pas d'une absence
de contrainte, mais d'un **contrôle réussi**.

**Le fond du point 2 du §8 est donc confirmé et aggravé ; sa mécanique est à
réécrire.**

### ❌ INFIRMÉ — « une garde qui accuse une sortie juste » : la 2ᵉ n'en est pas une (§5.2)

Le rapport dit que `written_instruction_unanswered` accuse une consigne qui
**a** été traitée, et que « ce qu'il cherche et ce que le modèle a écrit ne se
recouvrent pas ». **J'ai rejoué le vérificateur sur la sortie réelle :**

```
termes cherchés : dinner, should, cold, salad, nothing, warm, cannot, face, hot, plate
plan réel du modèle                 → status=served   silent=0
plan VIDE (ce que le verrou laisse) → status=silent   silent=1
```

**Le vérificateur a raison.** Il rend `served` sur les vrais plats. Le
`written_instruction_unanswered` du corps 422 n'est pas un désaccord : c'est un
**artefact en aval du verrou** — `checkWrittenInstructions` tourne sur
`meal.dishes` (`index.ts:2335`), déjà vidé par la ceinture, et sur une liste
vide **toute** consigne ressort muette.

Conséquence pour le rapport : il n'y a **qu'une** garde qui accuse une sortie
juste, pas deux. Et cela **renforce** le §4 — les trois `issues` du 422 sont
toutes des conséquences du verrou, aucune n'est un second défaut indépendant.

### ⚠️ CONFIRMÉ MAIS TRÈS SOUS-ESTIMÉ — `dietary_regime_breach` sur « Soy yoghurt »

2A a raison sur deux points et il faut le dire : **ce n'est pas un matcher
maison** (`findForbiddenMatches`, `_shared/keel/forbidden_matcher.ts`, dix
consommateurs, frontières de mot correctes) et **ce n'est pas la cicatrice
« laitue ≠ lait »** — `yoghurt` est bien un mot entier dans « Soy yoghurt ». Le
défaut est dans la **liste**, pas dans le moteur : `excludedSurfaceFormsFor("vegan")`
rend **169 formes**, dont `yoghurt`, `milk`, `butter`, sans aucune notion de
qualificatif.

**Mais la portée n'est pas « le yaourt de soja ». Mesuré :**

```
 1 morsure ← "Soy yoghurt, gluten-free oats, cocoa and pumpkin seeds"  [yoghurt]
 1 morsure ← "plain unsweetened soy yoghurt"                           [yoghurt]
 1 morsure ← "oat milk"                                                [milk]
 1 morsure ← "coconut milk"                                            [milk]
 1 morsure ← "peanut butter"                                           [butter]
```

Lait végétal, purée d'oléagineux, yaourt végétal : **le garde-manger végane
courant tout entier.** Un plan végane correct sera signalé en brèche de régime
presque à coup sûr. Le compteur ne « ment » pas à l'occasion — il est
**structurellement inutilisable pour le régime végane**, et c'est lui qu'on
lira pour décider si le régime est respecté.

Vit à `generate-meal-v1:2373-2407` (construction des `regimeTerms`) et
`_shared/keel/dietary_regime.ts:326` (`excludedSurfaceFormsFor`).

### ❌ INFIRMÉ — « ces régressions de forme sont indépendantes de mes changements » (§5.1)

Le rapport présente quatre nombres comme une plage unique — « **14 % à 24 %**
des lignes, sur les quatre runs » — sans dire de quelle **version** vient
chacun. Rangés :

| run | version | `shopping_list_unattributed` | taux |
|---|---|---|---|
| S2 | **v13** | 4/28 | 14,3 % |
| S3 | **v13** (corps du 422) | 3/43 | **7,0 %** |
| S5 | **v13** | 6/25 | 24,0 % |
| S2 | **v14** | 6/33 | 18,2 % |

Deux choses.

1. **La plage annoncée est fausse** : 3/43 = **7,0 %**, sous la borne basse
   affichée. La plage réelle est **7 % à 24 %**.
2. **La seule comparaison contrôlée que le lot possède pointe dans l'autre
   sens.** S2 est le seul scénario mesuré aux deux versions, et son prompt gagne
   **uniquement** le `PRECEDENCE_BLOCK` (prouvé par diff : 20 lignes ajoutées,
   0 retirée). Le taux passe de **14,3 % à 18,2 %**.

`n = 1` : cela ne prouve **pas** la causalité, et je ne l'affirme pas. Mais la
mise en commun des quatre nombres **efface la seule paire exploitable**, et le
rapport conclut à l'indépendance sans jamais l'établir. C'est exactement l'effet
« un prompt plus long dégrade une consigne lointaine ».

Deux compléments, dans les deux sens :

- `structured_quantity_missing` (5/45, 2/27) : **les deux sont en v13**. Aucune
  observation post-changement n'existe. Ni imputable, ni disculpable.
- `same_day: none` : v13 S2 en portait **2**, v14 S2 en porte **0**. Sur la
  seule paire, cette consigne-là **s'est améliorée** — le rapport la présente
  comme un échec persistant sans le signaler.

### ⚠️ ÉCARTS MINEURS, mais ce sont des affirmations d'octets

| dit | mesuré |
|---|---|
| `meal_precedence_test.ts`, « **11** tests » | **10** |
| « `certified gluten-free` **13 fois** » (S5) | `gluten-free` = 13 ; **`certified gluten-free` = 11** |
| « `deno test _shared/keel/` → **3 714** passés, 0 échec » | **3 717 passés, 0 échec** (avec `--allow-env` ; sans le drapeau, 2 rouges `NotCapable` sur `KEEL_GENERATION_MODEL`, étrangers au lot) |
| `deno check` des deux fonctions edge | ✅ verts, confirmé |

---

## 2 · CONCLUSIONS QUI NE TIENNENT PAS AUX OCTETS

1. **« Sur les huit collisions, le modèle a tranché huit fois dans le bon
   sens — il a deviné juste. »** La première moitié tient. La seconde est une
   **interprétation**. Les huit collisions opposent toutes une ligne de bas rang
   (envie ×6, goût, absence) à une ligne de haut rang ; la doctrine du jeu
   d'essai ne nomme **aucun aliment** et ne pouvait entrer en collision avec
   rien. Le modèle n'a pas « deviné juste sur des cas durs » : il a réussi des
   cas faciles. Le 8/8 ne mesure pas ce que le correctif corrige.

2. **« Le harnais est fidèle, prouvé : identique au prompt réel hors bloc de
   doctrine. »** Faux sur six classes de divergence, dont une **de version de
   code, dans le bloc v15 sous test**, et deux qui exercent une **branche
   différente** de la capacité de cuisine.

3. **« Les prompts sont complets aux trois versions, v15 compris, capturé au
   runtime réel. »** Faux : le v15 archivé (12 278 car.) est un état **antérieur**
   au correctif final (12 350 car.), à 72 octets près — la ligne
   `The permission to name them…`. Le runtime a servi un `_shared` périmé en
   plein run.

4. **« Un seul `catch` muet désarme les deux moitiés à la fois »** via
   `disarmed_no_constraints`. Le fond est vrai et grave ; le mécanisme nommé
   n'est pas le bon. Pour un élève de coach réel, la ceinture rend **`clean`** —
   une affirmation positive de contrôle sur un texte jamais confronté.

5. **« `written_instruction_unanswered` accuse une consigne qui a été
   traitée. »** Faux. Le vérificateur rend `served` sur la vraie sortie ;
   l'`issue` est un artefact du plan déjà vidé.

6. **« Ces régressions de forme sont indépendantes de mes changements. »**
   Jamais établi. La plage annoncée (14–24 %) est arithmétiquement fausse
   (7–24 %), et la seule paire contrôlée monte de 14,3 % à 18,2 %.

7. **« `dietary_regime_breach` : le compteur ment [sur un yaourt de soja]. »**
   Vrai mais très en dessous : lait d'avoine, lait de coco et purée d'arachide
   mordent aussi. Le compteur est inutilisable pour le régime végane, pas
   occasionnellement faux.

**Ce qui, à l'inverse, tient parfaitement et mérite d'être dit :** les trois
preuves d'absence, les byte-identités, les comptes de caractères, la survie du
mot `json`, le rejeu du verrou et son détail ingrédient par ingrédient, le
contraste `medical`/`strict` de S5, la lecture du `catch` muet, la construction
des tests (littéraux, positionnels, non paramétrés par leur propre constante),
et les deux **retraits assumés** du §7 — qui sont, comme le rapport le dit, la
moitié utile.

---

## 3 · CE QUI RESTE À MESURER QUAND LE CRÉDIT REVIENT

Par ordre de valeur. Les quatre premières commandes sont **la** question du lot.

### ① La collision C\* — coach ↔ allergène `medical`. **PRIORITÉ 1**

Sans elle, le correctif reste non prouvé. Elle demande une **fixture de coach
nouvelle** : la doctrine actuelle ne nomme aucun aliment.

```sql
-- à ajouter à harness/2026-08-19-0110-2a-fixture.sql, coach dédié :
--   croyance : « Every bowl finishes with a spoon of tahini. »
--   interdit : undressed_bowls
--     INSTEAD : « EVERY bowl gets a tahini dressing. »
-- élève : sesame — allergy, severity=medical
```

```bash
# v13 (git show HEAD:… — ne PAS utiliser git stash, dépôt partagé)
git show HEAD:supabase/functions/_shared/keel/meal_generation.ts > /tmp/2v-v13.ts
# puis, aux deux versions, même fixture, 3 runs chacune :
scratchpad/qa-generation/02-ponderation-solo/harness/batch.sh   # séquentiel, obligatoire
```

**Critère :** en v13, un plan portant du tahini, ou un `why` qui invoque la
méthode du coach pour le justifier, **falsifie** « il devinait juste ». En v15,
le même plan falsifie le correctif. Zéro des deux côtés = le correctif reste
non prouvé, et il faut le dire ainsi.

### ② La collision C\*\* — coach (« we cook twice ») ↔ un seul jour de cuisine

Déjà présente dans le harnais S3 (l. 32 vs l. 69), jamais comptée. À rejouer
aux deux versions. Compter les `cooking_sessions` et lire si le refus est dit.

### ③ Le v15 réel, recapturé — le prompt archivé est périmé

```bash
docker restart supabase_edge_runtime_Sophia_2   # AVANT le run : _shared périmé
docker logs --tail 40 --timestamps supabase_edge_runtime_Sophia_2
# puis run S3 en v15, et vérifier que la longueur est bien 12 350 :
```
```sql
select created_at, status, user_message_chars
from public.llm_raw_response_events
where request_id = '<nouveau_id>' order by created_at;   -- attendu: 12350, constant
```

### ④ Le 422 → 200 sur S3, la seule chose que v15 promet

```bash
node scripts/export_llm_prompt_dump.mjs --request-id <id> --source generate-meal-v1 --out <dossier>
deno run --allow-read --no-check scratchpad/qa-generation/02-ponderation-solo/harness/replay_lock.ts <dossier>/output.json
```
**Critère :** 0 morsure **et** HTTP 200. Et il faut lire si le modèle emploie
réellement « one of the foods on your medical list », ou s'il retombe sur une
phrase de refus nommante — c'est le seul point que la mesure hors modèle ne
peut pas trancher.

### ⑤ La régression de forme, avec une VRAIE paire

Rejouer **les cinq** scénarios aux deux versions, et publier
`shopping_list_unattributed` / `structured_quantity_missing` / `same_day`
**par scénario et par version**, jamais en plage agrégée.

```bash
deno run --allow-read --no-check scratchpad/qa-generation/02-ponderation-solo/harness/analyse.ts <output.json> <1..5>
```

### Ce qui ne demande AUCUN crédit et peut se faire tout de suite

- **Réparer la fidélité du harnais** — `build_scenarios.ts:80` passe
  `ageBand: "30 to 44"` au lieu de la clé `"30_44"`, et les champs de poids /
  tour de taille ne portent pas les noms que le code lit. Trois lignes
  `undefined` partent dans un prompt présenté comme l'instrument de référence.
- **Le compteur de régime végane** (`dietary_regime.ts:326` +
  `generate-meal-v1:2373`) : mesurer combien de plans véganes corrects sont
  signalés en brèche. Lot à part, hors périmètre de ②.
- **Le `clean` menteur** (`keel_output_locks.ts:286-290`) : la panne de lecture
  doit se distinguer d'un contrôle réussi. Arbitrage humain, comme le rapport le
  demande — mais la question à poser n'est pas « `null` vs `[]` » : c'est
  « pourquoi une ceinture désarmée annonce-t-elle `clean` ».

---

## 4 · POSTE

- Aucun navigateur, aucun modèle appelé, aucun écrit en base (SELECT seulement).
- Sondes conservées :
  `scratchpad/2v-probe.ts` (verrou / double verrou / matcher de régime),
  `scratchpad/2v-wi.ts` et `2v-wi2.ts` (consignes écrites),
  `scratchpad/2v-meal_generation.diff`, `2v-meal_generation.BACKUP.ts`.
- Une mutation de `meal_generation.ts` (remonter le bloc d'ordre avant la
  commande, pour éprouver la morsure des tests) a été **refusée par le poste**.
  La morsure est établie autrement, par lecture : `meal_precedence_test.ts:135`
  assère `msg.indexOf("== WHAT TO COOK ==") < at` et `:133`
  `assertEquals(between.trim(), "")` — la mutation les rendrait rouges tous les
  deux, ce qui recoupe le « 2 tests rouges » du rapport.
- `supabase/functions/_shared/keel/meal_generation.ts` ressorti au même sha256
  qu'à l'entrée. `household_portions.ts` et `household_safety.ts` : non touchés.
