# L8-A — la cible dimensionne les grammages. Le renversement, écrit.

**2026-08-18 15:45 · branche `ff-001-quotidien-du-coach` · aucun push, aucun merge**
**Commit unique** `269797e7` — 13 chemins, `agent-gate: pass`, sans contournement.

**Contrat tenu** [`2026-08-18-1215-L4B-verification-garde-tca.md`](2026-08-18-1215-L4B-verification-garde-tca.md) §7-§8 (C1→C9, version du **vérificateur**)
**Conception** [`2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md`](2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md) §3 et §2.2 ⓑ
**Bâti sur** [L7-A](2026-08-18-1312-L7A-prompt-unifie.md) · [L7-B](2026-08-18-1344-L7B-verification-prompt-unifie.md) · [LOT 4A](2026-08-17-2113-LOT4A-grammes-et-boites.md)

---

## 0. En cinq lignes

> **Le renversement est écrit à trois endroits, barré et non supprimé.**
> **La porte ② se ferme désormais PAR BOUCHE** — avant ce lot, une cible
> dimensionnait les grammages d'un enfant de douze ans parce que son parent est
> adulte (clause C8, réécrite par L4-B).
> **Aucune ligne de prompt, aucun bump** : la population qui voit une consigne
> différente est **vide, à l'octet**. Le redimensionnement est déterministe.
> **16 mutations sur 16 mordent**, chacune sur le test qu'elle doit faire rougir.

| Épreuve | Résultat |
|---|---|
| `deno test _shared/keel/` | **3361 passés, 0 rouge** (3323 avant le lot, **+38**) |
| `deno check` — les 3 générateurs + `meal-energy-v1` | exit 0 |
| `cd frontend && npx tsc -b --force` | **exit 0** |
| `npx vitest run` | **2 rouges, 1 fichier, étranger** (`coverage-guard`) — §8 |
| Mutations | **16/16 mordent**, harnais commité, SHA256 revérifié |
| `agent-gate` (`AGENT_GATE_STAGED_ONLY=1`) | **pass** |
| Migration | **aucune** |
| Bump de prompt | **aucun** — et c'est une décision, §3 |
| Run modèle | **AUCUN** — c'est le travail du vérificateur (§9) |

---

## 1. LE RENVERSEMENT — écrit, daté, et **barré plutôt que supprimé**

`energy_target.ts` disait, en toutes lettres :

> « Elle n'entre pas dans le générateur. Un plan qui vise un chiffre est un
> régime chiffré, et ce n'est pas ce produit. »

**Trois endroits portaient cette règle. Les trois sont réécrits, et aucun ne la
fait disparaître.**

| Où | Ce qui y est écrit |
|---|---|
| `_shared/keel/energy_target.ts`, en-tête | La phrase est **barrée** (`~~…~~`) à sa place exacte, suivie d'un encadré : autorité (*décision produit de l'utilisateur, 2026-08-18*), date, lot qui l'exécute, ce que ça change, ce que ça **n'ouvre pas**, et une ligne finale : « si tu lis ceci dans six mois en te disant *quelqu'un a oublié de refermer la vanne* : non ». |
| `docs/keel/CALORIE_REVERSAL.md` §7 (neuf) | Le renversement en entier : le raisonnement **corrigé** (ce n'est pas « une seule cuisson » — `COOKING_SHAPES` a trois valeurs ; c'est que le gramme est le bon niveau de précision), le tableau de ce qui reste vrai, ce qui est **renforcé**, et pourquoi C9 est neuve. |
| `_shared/keel/household_portions.ts`, section L8 | L'encadré d'ouverture de la section, avec la même autorité et le même avertissement. C'est le fichier qu'on ouvre quand on veut « réparer ». |

⚠️ **La phrase est laissée barrée, pas effacée.** Elle a porté une vraie
protection pendant douze jours ; un lecteur qui ne la trouve plus croit qu'elle
n'a jamais existé, et la réécrit.

⚠️ **Et ce module ne bouge pas d'un octet de COMPORTEMENT.** `maintenanceRange`
ne connaît toujours aucun objectif, ne soustrait rien, rend une fourchette : les
trois gardes de source de `energy_target_test.ts` sont **inchangées et vertes**.
Le renversement porte sur ce que le GÉNÉRATEUR a le droit de faire.

---

## 2. LES NEUF CLAUSES, UNE PAR UNE

| | Clause | Comment elle est tenue |
|---|---|---|
| **C1** | une seule porte vers le dimensionnement | `mouthTargetFactor` est le **seul** endroit du dépôt qui appelle `canSizeFromTarget`, et il n'y entre que par la sortie de `energySafetyGates`. Les trois générateurs ont **interdiction de source** d'assembler la chaîne eux-mêmes (R6 retourné, §4). |
| **C2** | l'état se lit AVANT le calcul | La porte tourne **avant** `executedPaceFor` et avant toute multiplication : un refus rend `{factor: 1, reason}` sans qu'aucun écart quotidien n'ait été calculé. Test de source : le corps de `mouthTargetFactor` contient `canSizeFromTarget(` **avant** `noSizing("age_unknown")`. |
| **C3** | inscription **manuelle** dans l'allowlist | **Fait à la main, et le banc était rouge d'abord** — capture réelle : `AssertionError: appelant non relu de energySafetyGates( — inscris-le dans ALLOWED`. `energy_gate_mouth_test.ts` porte désormais `["keel/household_portions.ts"]` sur deux symboles, avec **le paragraphe de relecture** qui dit quelles deux fonctions y appellent et ce qu'on y a vérifié. |
| **C4** | ne lit NI ④ NI ⑤ | `canSizeFromTarget` est inchangé (lecture seule). ⚠️ **J'ai ajouté la moitié qui manquait** : la garde de L4-B tient la **porte** ; rien ne tenait l'**appelant**. `target_grams_test.ts` lit le corps de `mouthTargetFactor` et refuse `studentSwitch`, `targetSwitch`, `energy_*_enabled`, `canShowTarget`, `canShowEnergy` — **après avoir vérifié sa propre prémisse** (le fragment doit contenir `canSizeFromTarget(` et `noSizing("age_unknown")`, sans quoi un extracteur cassé rendrait `""` et les six `assert` passeraient en ne regardant rien). |
| **C5** | aucun kcal par bouche sur les 5 sorties | **Ce qui entre est un facteur SANS UNITÉ, ce qui sort est un GRAMME d'aliment.** Aucun kcal n'atteint le prompt (aucune ligne ajoutée), la ligne de base (`box_sizing` ne porte que des comptes et un **histogramme de motifs sans `member_id`**), l'écran, ni le log. Le conseil ② est le seul kcal produit, et il ne sort **que pour la bouche qui le demande**, après les cinq portes, **sans persistance** — §5. |
| **C6** | R6 se **retourne**, ne se supprime pas | Fait, §4. L'invariant passe de « la cible n'atteint jamais un générateur » à « elle ne l'atteint QUE par la porte, et seulement comme des grammes » — avec un **cas qui passe** asserté, sans quoi le test resterait vert sur un lot mort. |
| **C7** | la cible n'a pas d'objectif | `maintenanceRange` inchangé, ses trois gardes de source vertes. L'objectif entre par `scaleDirectionOf(goal)` → une **direction**, dans `weight_pace.ts`, qui est un autre module et une autre grandeur. |
| **C8** | ⛔ **la ceinture est PAR BOUCHE** | **C'est le cœur du lot.** `mouthTargetFactor` prend `ageState` **requis et positionnel**, issu de `keel_household_member_age(member_id)` via `PortionMember.ageState`. Le pont `mouthAgeVerdict` a une **propriété d'aller-retour** testée (`ageStateFromVerdict(mouthAgeVerdict(s)) === s`), et un test nommé **⛔ L'ENFANT DE DOUZE ANS N'EST PAS DIMENSIONNÉ PARCE QUE SON PARENT EST ADULTE** monte le foyer complet : le parent est dimensionné, l'enfant rend `{1, "minor"}`. Mutation **M2** (revenir au verdict du maître) : **MORD**. |
| **C9** | tout état qui déclenche un chiffre entre par la porte | §5. **C9.a** : `mouthAgeState` requis, `minor` ⇒ `mouth_minor`, `unknown` ⇒ `mouth_age_unknown`. **C9.b** : `presenceState` est typé **`string`, pas `PresenceState`** — le compilateur donnerait une garantie que PostgREST ne donne pas ; hors liste fermée ⇒ `unknown_state`, **jamais un repli**. **C9.c** : la règle générale est écrite dans `CALORIE_REVERSAL.md` §7. |

---

## 3. ① LE DIMENSIONNEMENT — et pourquoi il ne touche pas au prompt

### 3.1 La décision, et les trois raisons mesurées

L'autre sortie était de **demander les grammages au modèle** en lui donnant la
cible dans le prompt. **Écartée**, et pas par prudence :

1. **La lane foyer expire à quatre minutes** (mesuré par 3C, reconfirmé par
   L7-B : un run à 151 s). Ce lot n'ajoute **pas une ligne** et ne bumpe **aucune
   version** — la population qui voit une consigne différente est **vide**.
2. **Un facteur dit dans le prompt est un nombre que le modèle recopie.** Mesuré
   au LOT E : il a écrit `box_prep_chicken_shared` dans une note **lue à voix
   haute à table**. « Zoé : 0,85 de la part de Marc » lu à table est un verdict
   comparatif sur deux corps.
3. Un grammage déclaré par le modèle ne peut être que **compté**, jamais garanti
   (L7-B : 100 % sur un run, 0 % sur un autre au LOT 3C). Un grammage calculé
   ici est exact et rejouable.

### 3.2 La chaîne, dans l'ordre

```
ageState (par bouche) ─┐
restrictionFlag ───────┼─► energySafetyGates ─► canSizeFromTarget ─┐
coachCounting ─────────┘                                           │
                                          age unknown ? ───────────┤
                          direction / rythme réglé / corps ────────┤
                                                                   ▼
                       executedPaceFor  ──►  facteur = (E ± Δ) / E
                                                                   ▼
                            sizeBoxesFromTarget(préparations, facteurs)
```

* **`executedPaceFor`, jamais le cran choisi** — §6.
* **Le dénominateur est l'ENTRETIEN**, pas la cible : le modèle écrit sur des
  enveloppes de maintenance (le tronc est le MIN, les add-ons rendent le reste).
* **Les bornes de plausibilité ne sont pas la borne opérante**, et le nombre a
  été **corrigé après mesure** : `0,75` refusait un corps de 30 kg/195 cm dont le
  facteur vaut 0,718 alors que sa journée reste au-dessus du plancher. Le minimum
  **structurel** se calcule — `max(1 − 500/E, plancher/E)`, minimal à
  `E = 500 + plancher`, soit **0,7059** avec le plancher le plus bas du dépôt.
  `BOX_FACTOR_MIN = 0,70` passe dessous, et un balayage de centaines de corps le
  prouve. *Une ceinture qui mord sur du juste se fait désarmer dans la semaine.*

### 3.3 Ce que `sizeBoxesFromTarget` refuse de faire

| Cas | Traitement | Pourquoi |
|---|---|---|
| **Aucune cible** | Rien ne bouge, **aucune `issue`** | C'est la population entière au 18/08. Le plafond du récipient **ne tourne pas** (garde `anySized`) : sans elle, ce lot « réparerait » au passage les plans sur-remplis, c'est-à-dire changerait le produit pour qui n'a pas de cible. Mutation **M4** : **MORD**. |
| **Boîte partagée, facteurs divergents** | Laissée telle quelle, `shared_mixed`, `issue` nommée | On ne peut pas la couper : `dishes[].uses[].box_id` pointerait sur une boîte au contenu changé, et l'écran citerait une boîte que personne n'a pesée. |
| **La somme dépasse la casserole** | Rabotage **proportionnel sur toute la préparation** | ⛔ `scaling-factor-applies-only-to-the-mobile-part` : **la casserole est la part FIXE**. Le rapport entre les parts est ce que la cible achète ; raboter une seule boîte retirerait sa part à quelqu'un pour l'arithmétique d'un autre. Testé sur les deux propriétés (somme ≤ plafond **et** rapport préservé). |
| **Production non reconstructible** | Redimensionne, compte `unverifiable` | Patron des trois cas de `gramsRaw`. |
| **Une boîte à zéro** | Plancher à 1 g | Une boîte à zéro est une consigne qui dit « rien », et l'écran l'imprimerait. ⚠️ **Fixture refaite** : la première version ne l'exerçait pas (§7). |

---

## 4. LA PROPRIÉTÉ R6, RETOURNÉE — et le cas qui passe

`no_calorie_to_student_property_test.ts` (clause C6). L'invariant passe de :

> aucune cible n'atteint un générateur

à :

> ① la cible n'atteint un générateur **que par la porte**, qui n'a qu'un seul
> appelant relu ; ② aucun générateur ne touche à la **fourchette affichée**
> (`maintenanceRange`) ni aux **interrupteurs** (`canShowTarget`) ; ③ la cible
> elle-même ne connaît toujours aucun objectif.

Concrètement, la liste d'interdits des trois générateurs **gagne deux entrées** :
`canSizeFromTarget` et `energySafetyGates`. *Un générateur qui assemblerait la
chaîne lui-même choisirait de quel âge et de quel plancher il se sert.*

⛔ **Et un CAS QUI PASSE est asserté** : `household_portions.ts` **doit**
contenir `canSizeFromTarget(` et `energySafetyGates(`. Sans ce bloc, les deux
premiers restent verts sur un lot entièrement débranché — la forme la plus chère
du défaut, mesurée deux fois cette semaine. Mutation **M15** (le module
court-circuite la porte) : **MORD, sur R6 ET sur le banc du lot**.

---

## 5. ② LE CONSEIL DU MIDI — une consigne, jamais un solde

`eatingOutAdvice(...)`, pur, dans `household_portions.ts`.

### 5.1 Les cinq portes, et la sixième

| Porte | Ce qu'elle rend |
|---|---|
| ①②③④⑤ du **LECTEUR** (`canShowTarget`) | le motif survit tel quel — `restriction_floor`, `minor`, `doctrine_no_counting`, **`student_off`**, **`target_off`** |
| la bouche **est-elle** le lecteur | `other_mouth` sinon |
| **C9.a** l'âge de **cette** bouche | `mouth_minor` / `mouth_age_unknown` |
| **C9.b** le vocabulaire de présence | `unknown_state`, **jamais un repli** |

⚠️ **Contrairement au dimensionnement, ce conseil SE LIT** : il traverse donc les
**cinq** portes, interrupteurs compris. Éteindre l'affichage doit le faire taire.

⛔ **Il ne sort que pour la bouche qui le demande.** Une bouche sans compte n'a
aucun interrupteur : lui adresser un chiffre serait un tracker qu'elle ne peut
pas éteindre. **C'est exactement le manque que le levier d'invitation du §2.2 ⓒ
existe pour nommer** — « invite-la, elle pourra les déclarer elle-même ».

### 5.2 « Une consigne, jamais un solde » — tenu par l'ENTRÉE, pas par l'opérateur

Le nombre est une **part de la journée déclarée** : `(entretien ± écart exécuté)
× poids du moment / somme des poids des moments de CETTE personne`, arrondi aux
**50** (même arbitrage que `maintenanceRange` : « 700 » est un ordre de grandeur,
« 683 » est une mesure, et une mesure invite à viser le chiffre exact).

⛔ **Aucune de ses entrées ne porte un consommé, et c'est ce qui rend « il te
reste 680 kcal » impossible à construire** — pas une discipline, une signature.
Un test de source refuse `consumed`, `eaten`, `remaining`, `left`, `balance` dans
le corps de la fonction.

⚠️ **Les douze phrases sont vérifiées dans les DEUX langues** (`left`,
`remaining`, `reste`, `restant`, `budget`, `over`, `under`). Et la préposition
française vit **dans le libellé** : `Au ${label}` rendait « Au ta collation du
matin » — une faute invisible à qui teste en anglais.

### 5.3 🔴 Ce qui n'existe pas encore, et pourquoi je ne l'ai pas fait

**Le conseil n'a pas de lecteur.** Il n'est **ni persisté ni rendu**, et les deux
sont des décisions :

* **Persister un kcal par bouche dans `generated_from` violerait C5.** La ligne
  serait relue plus tard par un lecteur qui n'est peut-être pas la bouche
  concernée ; `canEmitMouthEnergy` est une décision de **lecture**, pas
  d'écriture. La sortie propre est un calcul **au moment de la lecture**, dans
  `meal-energy-v1` — c'est-à-dire à côté de `canShowTarget`, qui y tourne déjà.
* **Le rendu est le front**, où L5-B et une lane « L0 » travaillent en ce moment.

**Le geste, pour qui le prendra** : appeler `eatingOutAdvice` dans
`meal-energy-v1`, dans le bloc `if (targetGate?.show === true)` qui existe déjà,
avec `reader: targetGate`, `mouthIsReader: true` (le lecteur est toujours sa
propre bouche sur ce chemin) et les cases lues par `readViewerMealsOut` — qui est
**déjà livré** par ce lot pour ③. C'est une vingtaine de lignes, et **rien de
neuf à décider**.

---

## 6. LE +10 % DE PRISE — refermé par la SECONDE sortie

`weight_pace.ts` annonçait l'écart à refermer, avec deux sorties : élargir la
bande de prise, **ou** dire la date sur le rythme exécuté.

**J'ai pris la seconde, et j'écarte la première en le disant.**
`MAX_SURPLUS_FRACTION` est **dérivé** de `ENERGY_BANDS.muscle_gain` (Helms 2023) :
l'élargir pour faire tenir une promesse d'interface ferait exécuter au moteur un
surplus que la littérature ne porte pas.

`executedPaceFor(direction, subject, chosenKgPerWeek)` rend
`{kgPerWeek, dailyDeltaKcal, maintenanceKcal, clampedBy}`, avec quatre bornes
nommées et **chacune a son cas qui gagne, testé** :

| Cas | `clampedBy` |
|---|---|
| prise d'adulte, cran 1 kg | `surplus_band` (= `E × MAX_SURPLUS_FRACTION`) |
| perte d'adulte 80 kg, cran 1 kg | `deficit_cap` (= 500 kcal/j, A1) |
| perte d'adulte 52 kg sédentaire | `energy_floor` (son plancher, < 500) |
| mineur, **dans les deux sens** | `minor_fraction` (10 % de SON besoin) |
| cran modeste (0,1 kg) | `chosen` — **le cas qui passe** |

⚠️ **L'invariant `exécuté ≤ choisi` est balayé** sur 3 corps × 2 × 2 × 5 crans.
⚠️ **`isMinor` passe devant `direction`**, comme dans `paceCeilingFor` : mutation
**M12** (ordre inversé) **MORD** — sinon un enfant en prise reçoit la bande de
l'adulte.

**Ce qui reste ouvert, et c'est écrit dans le module** : l'ÉCRAN appelle encore
`weeksToTarget` sur le cran **choisi**. La date affichée sur une prise au-delà de
+10 % reste donc optimiste. **Le moteur, lui, ne l'est plus** : les grammages sont
dimensionnés sur l'exécuté.

---

## 7. LES MUTATIONS — 16 sur 16, et **deux fixtures durcies**

Harnais **commité** : `scratchpad/mutate_l8a.py`. Il **nomme le test qui rougit**
(réserve de L7-B : une mutation qui casserait un test étranger du même fichier
compterait « MORD » à tort). Restauration en `finally`, **SHA256 revérifié**.

| # | Ce qu'on casse | Verdict | Test qui rougit |
|---|---|---|---|
| M1 | `age_unknown` retiré | MORD | *chaque porte de sécurité ferme le DIMENSIONNEMENT* |
| **M2** | **la porte ② lit le verdict du MAÎTRE** | **MORD** | **⛔ L'ENFANT DE DOUZE ANS…** |
| M3 | le facteur lit le cran CHOISI, pas l'exécuté | MORD | *LES BORNES… NE MORDENT SUR AUCUN CORPS RÉEL* |
| **M4** | **le plafond du récipient tourne sans cible** | **MORD** | **⛔ AUCUNE CIBLE ⇒ AUCUN GRAMME NE BOUGE** |
| M5 | une boîte partagée divergente est redimensionnée | MORD | *une boîte PARTAGÉE… n'est pas coupée en deux* |
| M6 | le plafond du récipient retiré | MORD | *(compilation)* |
| M7 | `unchanged` déduit sans `shared_mixed` | MORD | *PROPRIÉTÉ: sized + unchanged + shared_mixed === boxes* |
| **M8** | **C9.a retirée (mineur)** | **MORD** | **⛔ C9.a — UN MINEUR… AUCUN CHIFFRE** |
| **M9** | **C9.b retirée (vocabulaire)** | **MORD** | **⛔ C9.b — UN VOCABULAIRE INCONNU… AUCUN REPLI** |
| M10 | `other_mouth` retiré | MORD | *la bouche d'un AUTRE ne reçoit jamais de chiffre* |
| M11 | la bande de prise devient infinie | MORD | *LE CAS QUI PASSE* + 2 autres |
| M12 | un mineur reçoit les bornes de l'adulte | MORD | *(compilation)* |
| M13 | le sujet du jour est toujours `the_day` | MORD | *⛔ ③ — un repas pris DEHORS change le SUJET* |
| M14 | `unknown` rend un verdict d'adulte | MORD | *le pont d'âge fait un ALLER-RETOUR exact* |
| **M15** | **le module court-circuite `canSizeFromTarget`** | **MORD** | **R6 retourné** + *LE DIMENSIONNEMENT NE LIT NI ④ NI ⑤* |
| M16 | le plancher de 1 g retiré | MORD | *⛔ UNE BOÎTE NE DESCEND JAMAIS À ZÉRO* |

### ⚠️ Deux fixtures ont dû être durcies — et c'était un vrai défaut à chaque fois

**M16 SURVIVAIT.** Ma première mise en scène appliquait un facteur à une boîte de
1 g : `Math.round(1 × 0,8)` vaut **1**, donc le plancher n'était **jamais
exercé**. C'est la « ceinture armée sur un coffre vide », troisième fois sur ce
chantier. Refaite sur le **seul chemin qui peut rendre zéro** — le rabotage par
le plafond du récipient, où `shrink` peut être arbitrairement petit. Et le test
dit maintenant **pourquoi** l'autre `Math.max` n'a pas de cas
(`grams ≥ 1` × `factor ≥ 0,70` ⇒ `round ≥ 1`), plutôt que de laisser croire
qu'il en a un.

**Une borne était FAUSSE, et le balayage l'a trouvée.** `BOX_FACTOR_MIN = 0,75`
refusait un corps de 30 kg/195 cm (facteur 0,718) dont la journée reste pourtant
au-dessus du plancher. Corrigé à **0,70**, avec le minimum structurel calculé
dans le commentaire ET asserté dans le test.

---

## 8. CE QUI RESTE ROUGE, ET DE QUI

| Rouge | À qui | Note |
|---|---|---|
| vitest : `src/edge/coverage-guard.int.test.ts` ×2 | **étranger** — objets de base attendus vs découverts (`household_member_bodies_touch`, `student_daily_recommendations_set_updated_at`), posés par les migrations du jour | **`planRefusals` est passé au vert** : L5 a convergé |
| 🔴 le conseil ② n'a **ni écrivain ni lecteur** | ce lot le **nomme**, §5.3 | Persister un kcal par bouche violerait C5 ; le geste propre est de le calculer à la LECTURE, dans `meal-energy-v1`, et il tient en ~20 lignes |
| 🔴 le rendu de ③ n'existe pas | **front** (L5-B / L0 en vol) | Le serveur rend `subject` et `meals_out` ; **aucune régression** — un plan sans `eating_out` rend `the_day`, exactement l'écran d'hier |
| 🟠 la date d'arrivée d'une PRISE reste optimiste à l'écran | front | Le moteur ne l'est plus (§6). `weeksToTarget` doit lire `executedPaceFor` |
| 🟠 les notes de portion peuvent devenir périmées | **ce lot, décidé et non corrigé** | §10 n°1 |
| ⚪ `paceByMember` est **vide en base** | attendu | Aucun écran n'écrit encore le curseur (port livré le matin même). **Tous les facteurs valent 1**, le plan est byte-identique. Requête ① du §9 |

---

## 9. LES REQUÊTES SQL — prêtes à jouer

### ① La population, et le chiffre qui décide de tout le reste

```sql
select count(*) filter (where target_pace_kg_per_week is not null) as with_pace,
       count(*)                                                    as mouths
  from public.household_members;
-- attendu au 2026-08-18: 0 | 65   (aucun écran n'écrit encore le curseur)

select count(*) filter (where target_pace_kg_per_week is not null) as with_pace,
       count(*)                                                    as accounts
  from public.student_goals;
-- attendu au 2026-08-18: 0 | 73
```

⛔ **Tant que `with_pace = 0`, un run réel mesure le plan D'HIER.** Le vérificateur
doit **fabriquer la population** avant de conclure quoi que ce soit — sinon un lot
désarmé ressemble trait pour trait à un lot qui marche.

```sql
-- Fixture: une bouche sans compte, direction + cible + rythme (les trois vont
-- ensemble; le CHECK `household_members_target_needs_direction_check` l'exige).
update public.household_members
   set goal = 'fat_loss', target_weight_kg = 68, target_pace_kg_per_week = 0.5
 where member_id = '<uuid>';
-- ⚠️ ET SON CORPS DOIT EXISTER: sans `household_member_bodies`, le motif rendu
-- est `no_body` et aucun gramme ne bouge.
select * from public.keel_household_member_bodies('<household_uuid>');
```

### ② Le tableau de bord du dimensionnement, par plan

```sql
select left(id::text, 8)                                       as plan,
       starts_on,
       generated_from->>'prompt_version'                       as version,
       generated_from #> '{household,box_sizing}'              as box_sizing,
       generated_from #> '{household,boxes}'                   as boxes
  from public.student_generated_meals
 where plan_kind = 'household' and retired_at is null
 order by created_at desc
 limit 20;
-- box_sizing = { boxes, sized, unchanged, shared_mixed, capped_by_pot,
--                unverifiable, mouths: {<motif>: n, …} }
```

### ③ Le taux de dimensionnement, et l'histogramme des motifs

```sql
select generated_from->>'prompt_version'                                     as version,
       count(*)                                                              as plans,
       sum((generated_from #>> '{household,box_sizing,boxes}')::int)         as boxes,
       sum((generated_from #>> '{household,box_sizing,sized}')::int)         as sized,
       sum((generated_from #>> '{household,box_sizing,shared_mixed}')::int)  as shared_mixed,
       sum((generated_from #>> '{household,box_sizing,capped_by_pot}')::int) as capped,
       round(100.0 * sum((generated_from #>> '{household,box_sizing,sized}')::int)
             / nullif(sum((generated_from #>> '{household,box_sizing,boxes}')::int), 0), 1)
                                                                             as pct_sized
  from public.student_generated_meals
 where plan_kind = 'household'
   and generated_from #> '{household,box_sizing}' is not null
 group by 1
 order by 1 desc;
```

```sql
-- Pourquoi les bouches ne sont PAS dimensionnées. ⚠️ Un foyer où trois bouches
-- sortent `no_pace` et une `minor` ne se répare pas du tout comme un foyer où
-- quatre sortent `no_body`.
select k as reason, sum(v::int) as mouths
  from public.student_generated_meals m,
       jsonb_each_text(m.generated_from #> '{household,box_sizing,mouths}') as e(k, v)
 where m.plan_kind = 'household' and m.retired_at is null
 group by 1
 order by mouths desc;
```

### ④ ⛔ LA CONTRE-PREUVE — le compteur peut mentir, le `jsonb` non

**À jouer systématiquement à côté de ③.** Elle lit les grammes ÉCRITS et leur
divergence par préparation : c'est la question de P4 (« est-ce que trois cibles
différentes donnent trois grammages différents ? »).

```sql
select left(m.id::text, 8)                                             as plan,
       prep->>'title'                                                  as preparation,
       count(*)                                                        as boxes,
       min((box->>'grams')::int)                                       as min_g,
       max((box->>'grams')::int)                                       as max_g,
       max((box->>'grams')::int) - min((box->>'grams')::int)           as spread_g
  from public.student_generated_meals m,
       jsonb_array_elements(m.preparations) prep,
       jsonb_array_elements(coalesce(prep->'boxes', '[]')) box
 where m.retired_at is null and m.plan_kind = 'household'
 group by 1, 2
 order by spread_g desc;
```

### ⑤ Les `issues` de ce lot

```sql
select case
         when i like '%targets differ%'      then 'shared_mixed'
         when i like '%scaled back to fit%'  then 'capped_by_pot'
         else 'other'
       end                      as family,
       count(*)                 as n
  from public.student_generated_meals m,
       jsonb_array_elements_text(coalesce(m.generated_from->'issues', '[]')) i
 where m.retired_at is null
 group by 1
 order by n desc;
```

### ⑥ ③ — le sujet du chiffre, sur le fil (aucune écriture)

```
POST /functions/v1/meal-energy-v1   { "plan_ids": ["<uuid>"] }
→ plans[].days[] = { day, kcal, basis, complete,
                     dishes_counted, dishes_total,
                     meals_out, subject }      ← subject ∈ {the_day, what_the_plan_made}
```

---

## 10. LES DÉCISIONS PRISES SEUL

| Décision | Option écartée, et pourquoi |
|---|---|
| **Le redimensionnement est DÉTERMINISTE, après le parseur** | Demander les grammages au modèle : trois raisons mesurées, §3.1 — la lane expire à 4 min, le modèle recopie les nombres dans des notes lues à table, et un champ déclaré ne peut être que compté. |
| ⚠️ **Le facteur est appliqué APRÈS la relance d'ancre protéique** | Le faire avant : `meal` est **remplacé** par le plan de la seconde réponse quand la relance est acceptée. C'est la cicatrice du `current` périmé, qui a coûté dix-huit parts orphelines le 17/08. |
| 🟠 **Une note de portion périmée est COMPTÉE, pas réécrite ni nullée** | ⚠️ **Le seul vrai coût de ce lot, et je le nomme.** Le modèle écrit « 150 g de poulet » dans `portion_note` pendant que la boîte devient 128 g. Réécrire de la prose de modèle est interdit ici (« du texte amputé dont personne ne répond ») ; la nuller laisserait la bouche **sans aucune consigne**, ce qui est pire. **La BOÎTE est la vérité structurée** (`Box Zoé — 128 g`, rendue par `DishCard` et par la ligne de part), la note est de la prose. ⚠️ **La population concernée est VIDE au 18/08** — le curseur n'a aucun écrivain. Le correctif propre le jour où elle ne l'est plus : dire la cible au modèle, avec un bump. **Décrit, non fait.** |
| **La porte ② se ferme par un PONT d'âge, pas par un paramètre de plus dans `energy_gate.ts`** | Ajouter un `ageState` à `EnergySafetyInput` : `energy_gate.ts` est en **lecture seule** pour ce lot, et une seconde définition de « mineur » à côté de `weekPlanAgeGate` est la divergence que ce module interdit en tête. Le pont est nommé, exporté, et tenu par une propriété d'**aller-retour**. |
| **`presenceState` est typé `string`** | `PresenceState` : le compilateur donnerait une garantie que **PostgREST ne donne pas** (le vocabulaire est ouvert côté personne), et la garde C9.b naîtrait désarmée. |
| **`KNOWN_PRESENCE_STATES` est une SECONDE copie** | Importer `PRESENCE_STATES` : `household_presence` → `meal_generation` → `household_portions` est un **cycle d'exécution**. La copie est tenue par un test d'égalité stricte, qu'un test peut faire sans créer de cycle. |
| **`coachCounting` vient de la doctrine du MAÎTRE** | Une position par membre : le foyer suit **une** méthode, c'est déjà la règle du verrou de doctrine. Doctrine illisible ⇒ `no_counting`, fail-closed. |
| **Le conseil ② n'est ni persisté ni rendu** | Le persister : un kcal par bouche dans `generated_from` est une sortie de C5 relue par un lecteur qui n'est peut-être pas la bouche. §5.3. |
| **On ne raccourcit PAS la bande de prise** | Élargir `MAX_SURPLUS_FRACTION` : il est **dérivé** de Helms 2023, et l'élargir pour tenir une promesse d'interface ferait exécuter un surplus que la littérature ne porte pas. §6. |
| ⚠️ **Réparer `meal-energy-v1`, hors périmètre** | Passer `activityLevel: null` pour recompiler : ce serait un **écrivain sans lecteur** (L0 a livré les deux écritures). `deno check` de cette fonction était **rouge à HEAD**, et `agent-gate` ne le voit pas — il ne vérifie que trois points d'entrée de `sophia-brain`. |

---

## 11. ANTI-COLLISION

- Index vérifié **vide avant** et **vide après**. `git commit -F <msg> -- <chemins>` ;
  aucun `git add -A`, aucun `git stash`, aucune commande à risque, aucune migration.
- **Un hunk étranger emporté, dit plutôt que caché** : le bloc de commentaire du
  lot **L0** sur le cran d'activité, déjà sur le disque dans `energy_target.ts`.
  Copie : `scratchpad/2026-08-18-1520-L8A-hunk-etranger-L0-activity.patch`.
  Les quatre autres fichiers de production que je touche étaient **propres** avant
  moi (vérifié par `git diff HEAD -U0`, hunk par hunk).
- **Aucun redémarrage du runtime edge, aucun run modèle.** Ce lot modifie des
  `_shared` : le runtime en sert des périmés, et le run appartient au vérificateur.

---

## 12. CE QUE LE VÉRIFICATEUR (L8-B) DEVRAIT REGARDER EN PREMIER

1. **Fabriquer la population** (§9 ①). Sans `target_pace_kg_per_week`, **tous les
   facteurs valent 1** et le run mesure le plan d'hier. Il faut aussi un CORPS
   sur la fiche, sinon le motif est `no_body`.
2. **Redémarrer le runtime edge AVANT** (`docker restart
   supabase_edge_runtime_Sophia_2`, après avoir sondé `docker logs` qu'aucune
   lane ne génère), puis `./scripts/local_extend_kong_functions_timeout.sh`.
3. **Un run `intent: "draft"` suffit pour `box_sizing`** — il est rendu sur
   l'aperçu par la même expression que sur la ligne écrite. ⚠️ Mais un aperçu ne
   porte **aucune version de prompt** : pour prouver qu'on ne mesure pas v15, il
   faut une ligne écrite (leçon de L7-B §2).
4. **La contre-preuve ④ AVANT de conclure** : le `spread_g` par préparation est
   la question de P4. Zéro écart avec des cibles posées ⇒ soit le modèle a écrit
   la même part pour tout le monde (un **résultat**), soit les facteurs n'ont pas
   été appliqués — l'histogramme des motifs tranche.
5. **Rejouer au moins 5 mutations**, dont **M2** (la porte ② au verdict du
   maître), **M4** (le plafond du récipient sans cible), **M9** (le vocabulaire
   de présence) et **M15** (le court-circuit de la porte).
6. **Vérifier qu'aucun kcal n'est apparu** dans le texte composé ni dans
   `generated_from` : `box_sizing.mouths` ne doit porter **aucun `member_id`**.
7. **Le front** : rien n'est rendu (`subject`, `meals_out`, le conseil ②). Il n'y
   a **aucune régression** à chercher — c'est un lot qui reste, pas un défaut.
