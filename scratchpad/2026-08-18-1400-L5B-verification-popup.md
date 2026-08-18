# L5-B — VÉRIFICATION DU POP-UP « UNE BOUCHE »

**Date** 2026-08-18 14:00 · Branche `ff-001-quotidien-du-coach`
**Vérifié** : `c933144d` (9 fichiers neufs) + `ca20e196` (rapport L5-A)
**Rendu** : `1edeba34` — 3 fichiers, 113 insertions
**Aucun push, aucun merge, aucune commande à risque.**

---

## 0. Verdict

**Le lot est vert, et il ne l'était pas quand je l'ai reçu.** Trois défauts, et
les trois avaient la même forme : **une garde absente**, jamais du code faux.
Deux d'entre eux ne se voyaient qu'en mutant — les 97 tests restaient verts
pendant que la fenêtre devenait captive et que le cran d'activité disparaissait
avant la base.

| | État |
|---|---|
| Migration `20260818190000` | ⛔ cassée → **corrigée, APPLIQUÉE, inscrite au registre**, privilèges prouvés |
| `tsc -b --force` | **exit 0** |
| vitest | **1329 passés / 2 échecs** — les deux étrangers (`coverage-guard`) |
| `planRefusals.int.test.ts` | **était rouge, il est vert** (§4) |
| Mutations | **9 des 18 de L5-A rejouées → 18/18 mordent** · **6 miennes, 2 ne mordaient pas** |
| Navigateur | 320 px **et** 1280 px, **fr et en**, `scrollWidth` mesuré, **écriture réelle en base** |
| `agent-gate` | **pass** (Deno 3323/0, typecheck, `deno check`, eslint) |

---

## 1. ⛔ PRIORITÉ 1 — LA MIGRATION : la garde avait raison, le `revoke` avait tort

### Ce que j'ai mesuré avant d'écrire une ligne

```
pg_default_acl, schéma public, objets FONCTION :
{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

**`anon` reçoit un GRANT NOMMÉ sur toute fonction neuve.** `revoke … from
public` retire le **pseudo-rôle `PUBLIC`**, il ne voit même pas le **rôle
`anon`** — ce sont deux choses, et l'une ne recouvre pas l'autre. La garde ③ du
fichier disait exactement ça en commentaire, et c'est la ligne d'à côté qui ne
la suivait pas.

**Correctif — une ligne, la forme déjà retenue par `20260818160000` (lot L0)** :

```sql
revoke all on function public.keel_household_set_member_target(uuid, numeric, numeric)
  from public, anon;
```

### La preuve, et elle n'est pas la garde du fichier

```
proacl = {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
                    anon | authenticated | service_role
                       f |       t       |      t
```

`anon` a **disparu de l'ACL par son nom**. Vérifié par `has_function_privilege`,
indépendamment du bloc `do $$` — une garde qu'on croit sur parole n'est pas une
preuve.

### Les deux branches de la garde MORDENT — prouvé en transaction annulée

| | Geste | Résultat |
|---|---|---|
| G1 | `grant execute … to anon` | `ERROR: … est exécutable par anon` |
| G2 | `revoke execute … from authenticated` | `ERROR: … n'est PAS exécutable par authenticated` |

État final après `rollback` : `anon=f`, `authenticated=t`. La garde a donc **un
cas qui passe et deux qui mordent**.

### Appliquée, et le registre est propre

```
20260818200000   ← lot suivant, arrivé après
20260818190000   ← celle-ci
20260818180000
```

`student_goals.target_pace_kg_per_week` existe, `numeric`, nullable, avec ses
**deux CHECK** (`> 0 and <= 1`, et `goal in ('fat_loss','muscle_gain')`).

> ### ⛔ TROUVÉ EN CHEMIN, HORS DE MON PÉRIMÈTRE, ET C'EST LE PLUS GRAVE DE CE RAPPORT
>
> Le même audit sur les fonctions voisines rend :
>
> | Fonction | `anon` peut exécuter ? |
> |---|---|
> | `keel_household_add_restriction` | non |
> | `keel_household_member_bodies` | non |
> | `keel_household_set_member_body` | non |
> | **`keel_household_bodies_for(uuid)`** | ⛔ **OUI** |
>
> `keel_household_bodies_for` est `security definer`, **ne lit ni `auth.uid()`
> ni aucun rôle**, et rend — pour n'importe quel `p_household` — la **taille, le
> poids, le sexe, l'âge et le cran d'activité de chaque bouche du foyer, enfants
> compris**. Sa migration (`20260818100000`, lot **L1**) écrit
> `revoke … from public` **sans** `anon`. C'est la même cicatrice, sur une porte
> de LECTURE, avec la clé anonyme du projet et un UUID pour seul secret.
>
> **Je ne l'ai pas réparée** : le fichier appartient à L1, et un correctif exige
> un numéro de migration que l'orchestration réserve. Le correctif est d'une
> ligne :
>
> ```sql
> revoke all on function public.keel_household_bodies_for(uuid) from public, anon;
> ```
>
> **À poser avant toute mise en ligne.** Une revue de sécurité qui grep
> `revoke … from public` la déclarerait fermée.

---

## 2. PRIORITÉ 2 — ce qui ne vit que sur le disque

### Les deux patches sont **DÉJÀ APPLIQUÉS**

`git apply --check -R` réussit sur les deux : ils décrivent exactement l'état du
disque. **Rien à poser** — la fenêtre est bien montée dans `/app/household`, et
je l'ai ouverte au navigateur (§5).

### ⛔ Le câblage n'est **toujours pas** committable, et il n'y a qu'UN hunk en cause

`HouseholdPage.tsx` porte **5 hunks : 4 de L5, 1 de L0**. Le hunk de L0 est
celui-ci :

```tsx
onSaveBody={(memberId, h, w, g) =>
  run(() => setMemberBody(memberId, h, w, g,
        bodies.get(memberId)?.activityLevel ?? null))}
```

Il ne compile pas contre HEAD, **deux fois** :

- `git show HEAD:frontend/src/keel/api/household.ts` → `setMemberBody` prend
  **4 paramètres**. L'appel en passe 5 → `TS2554`.
- HEAD de `household.ts` ne contient **aucune occurrence** de `activityLevel` →
  `bodies.get(…)?.activityLevel` → `TS2339`.

Les **4 hunks de L5**, eux, compileraient : `setBody` de `MouthWriters` déclare
5 paramètres, et TypeScript accepte qu'on lui passe une fonction qui en prend 4.
**C'est donc le seul hunk de L0 qui bloque le lot entier**, et il est
indissociable de `household.ts`, que L0 tient.

**Conclusion : la décision de L5-A est toujours la bonne, et le déblocage
n'appartient pas à L5.** Dès que L0 commite `household.ts` **et**
`HouseholdPage.tsx`, il n'y a plus rien à faire — le câblage part avec.

### Ce que J'AI laissé sur le disque, en plus

| Fichier | Pourquoi non commité |
|---|---|
| `copy/planRefusals.ts` | porte les hunks de L2/L3/L5 et d'une autre lane |
| `i18n/en.ts` | pack i18n, convention des lanes |
| `i18n/fr.ts` | **non suivi par git** (`??`) — absent de HEAD, cicatrice connue |

---

## 3. Les six blocs de §1 — vérifiés sur la valeur, puis à l'écran

| Point du mandat | Verdict | Preuve |
|---|---|---|
| Trois obligatoires / trois sautables | ✅ | `REQUIRED_MOUTH_FORM_BLOCKS` = identity, direction, body ; les trois autres repliés, un seul ouvert à la fois |
| **La fenêtre se ferme toujours** | ⚠️ **vrai, mais NON GARDÉ** → §4 D1 | mesuré au navigateur : « L'ajouter » `disabled`, « Plus tard » ×2 actifs |
| **Le pop-up s'ouvre aussi pour le maître** | ⛔ **NON, pas sur cette surface** → §6 | `/app/household` : le maître reste sur `MeCard`, formulaire en ligne avec « Enregistrer » |
| **Jamais « adulte ou enfant »** | ✅ | aucun champ `kind` ; l'écran DIT « On ne demande jamais si c'est un adulte ou un enfant : la date de naissance le dit » |
| **Un mineur porte les trois objectifs** | ✅ | `goalsForAge` rend la même liste ; aucun bloc masqué ; plafond du curseur calculé sur SON besoin |
| **Le shaker demande ce qu'il apporte** | ✅ collecte / ⛔ **aucun écrivain** → §7 | trois nombres + « sur l'étiquette du pot » |
| **`food_preferences` sur `member_id`** | ✅ | dégoûts → `keel_household_add_restriction(p_member, …)` ; régime → RPC membre. **Aucun appel à `food_preferences`** |
| `paceWarning` / `PACE_WARNING_LABELS` **non réécrits** | ✅ | `weight_pace.ts` : **zéro diff** dans l'arbre de travail ; seuil toujours `>` strict, `direction !== "up" → null` |

### Le curseur — les quatre états, mesurés à l'écran (§5)

| État | Ce que rend l'écran |
|---|---|
| `folded` | rien tant qu'aucune direction n'est choisie |
| `needs_body` | *« Renseigne taille, poids et sexe ci-dessous et le curseur apparaît. »* — **aucun `#mouth-pace` dans le DOM** |
| `no_margin` | *« Ce corps n'a pas de marge de perte sans passer sous le plancher d'énergie. »* — **aucun `#mouth-pace`**, et une phrase DIFFÉRENTE de la précédente |
| `slider` | `min=0.05 max=0.45 step=0.05` sur 60 kg / 165 cm / F / sédentaire |

**`null` et `0` sont bien deux écrans.** Confondre les deux (mutation M1) rougit
2 tests.

**Le seuil de 0,5 kg/sem avertit sans interdire** : sur 110 kg / 185 cm / H /
`trains_hard` / prise, le curseur monte à **`max=1`** et porte, **en français**,
la phrase du module au mot près :

> Au-delà d'environ 0,5 kg par semaine, le surplus part surtout en gras plutôt
> qu'en muscle.

---

## 4. ⛔ TROIS DÉFAUTS — trouvés en mutant, corrigés, et chacun avec sa garde

### Rejeu des mutations de L5-A : 9 rejouées, **18/18 mordent**

M1 (×2) · M3 (×3) · M4 · **M6b** · M8 (×2) · M9 (×2) · M16 (×5) · **M11** ·
**M12b**. **Les deux durcissements tiennent** : M6b (la garde dupliquée de
`targetPayloadOf`) et M12b (le test vide sur un bloc replié) mordent bien
maintenant. Empreintes `sha256` des trois fichiers **identiques** après le rejeu.

### Mes six mutations — quatre mordaient, deux non

| # | Mutation | Résultat |
|---|---|---|
| N2 | les dégoûts partent sur la porte des allergies | ROUGE |
| N2b | le curseur ne rabat plus le cran sur son maximum | ROUGE ×2 |
| N4 | `shakerIsComplete` accepte une portion de 0 g | ROUGE |
| N5 | `missingRequiredBlocks` n'exige plus la direction | ROUGE ×3 |
| **N1** | **la sortie se désactive tant qu'un bloc obligatoire manque** | **VERTE — 97/97** |
| **N3** | **`activityLevel: null` en dur dans `mouthToPersist`** | **VERTE — 97/97** |

---

### ⛔ D1 — LA FENÊTRE POUVAIT DEVENIR CAPTIVE, EN SILENCE

L'invariant que ce lot nomme comme **le plus important** — *« un pop-up qu'on ne
peut pas fermer fait abandonner l'ajout de la deuxième personne, et le foyer
meurt là »* — était écrit **trois fois en commentaire** et gardé **zéro fois**.

**Pourquoi les deux assertions voisines ne pouvaient pas l'attraper** : elles
lisent `disabled` sur le **markup entier** (`toMatch` / `not.toMatch`), donc
elles ne savent dire que « au moins un bouton est retenu » ou « aucun ne l'est ».
Or le fait est l'**OPPOSITION** des deux boutons **sur le même rendu** : sur un
brouillon vide, celui qui inscrit est retenu **et** celui qui sort ne l'est pas.
Aucune assertion globale ne peut exprimer ça.

**Correctif** : un extracteur `buttonTagOf(markup, label)` qui isole **la balise
ouvrante du bouton portant ce libellé** (et jette si le libellé est ambigu), puis
deux assertions opposées, **dans les deux langues** — parce qu'une fenêtre
captive dans une seule langue est une fenêtre captive.

**Et la garde a son cas qui PASSE** : `busy: true` retient **les deux** boutons.
Sans lui, la garde se lirait « la sortie n'est jamais désactivée » et quelqu'un
la « réparerait » en retirant `props.busy`.

```
N1  la sortie se désactive si un bloc manque      → ROUGE
N1b `props.busy` ne retient plus la sortie         → ROUGE
```

### ⛔ D2 — LE CRAN D'ACTIVITÉ N'AVAIT QUE SA MOITIÉ D'ABSENCE

Un seul test existait : *« le cran non coché part en `null` »*. Il reste vert si
le traducteur écrit `activityLevel: null` **en dur**.

Ce que ça donnerait : le champ que la conception appelle **« le trou n°1 du
produit »** — celui sans lequel `energy_target.ts` *« produit une cible fausse
avec l'aplomb d'un tableau »* — serait **réclamé à la personne** (il retient le
bloc 3, prouvé par M4) puis **jeté avant la base**. Le champ décoratif exact que
ce lot existe pour supprimer.

**Correctif** : la garde parcourt **les QUATRE crans** — une correspondance codée
sur une seule valeur ne dit rien des trois autres.

```
N3  activityLevel: null en dur                    → ROUGE
N3b un seul cran codé en dur ("sedentary")        → ROUGE
```

*(J'ai ajouté au passage la garde qui sépare **dégoûts** et **allergies** dans le
payload : c'est LA décision du bloc 6, et elle n'avait pas d'assertion propre.)*

### ⛔ D3 — HUIT JETONS DE REFUS ARRIVAIENT NUS À L'ÉCRAN

J'ai croisé **les jetons que rendent réellement les 7 RPC de la chaîne**
`persistMouth` (lus dans `pg_proc.prosrc`) avec `HOUSEHOLD_REFUSAL_KEYS` :

```
add_member         orphelins: —
set_member_body    orphelins: bad_activity_level, bad_gender, bad_height,
                              bad_weight, body_incomplete     ⛔
set_member_target  orphelins: —
set_member_habits  orphelins: —
add_allergy        orphelins: —
add_restriction    orphelins: —
set_member_diet    orphelins: —
```

**`keel_household_set_member_body` est la marche 2 de `persistMouth`**, et
`submitIsHeld` vérifie la **PRÉSENCE** de taille/poids/sexe, **jamais leurs
bornes**. Une taille de 999 franchit la fenêtre et revient en `bad_height` — mot
pour mot, en anglais brut, sous un formulaire d'accueil français.

Trois autres (`minor_cannot_be_reference`, `age_unknown_cannot_be_reference`,
`not_your_household`, de `keel_household_set_reference_member`) avaient le même
défaut, **antérieur au pop-up**.

**Les phrases existaient déjà dans les deux packs** — sauf
`bad_activity_level`, jeton neuf du lot L0, que j'ai ajouté. **C'est la TABLE qui
ne les nommait pas.** `planRefusals.int.test.ts` le disait déjà en rouge (« chaque
`household.error.*` écrit dans `en.ts` doit rester atteignable ») et personne
n'avait relié le rouge au symptôme.

> ⚠️ **Ce rouge était compté comme « à une autre lane ».** Il ne l'était pas :
> c'était le seul témoin d'un défaut de l'écran du foyer. **Un rouge attribué
> ailleurs est un rouge que personne ne lit.**

**Correctif sur le disque** (`planRefusals.ts` porte des hunks étrangers) :
8 correspondances + 1 clé × 2 langues. **`planRefusals.int.test.ts` : 21/21.**

---

## 5. Navigateur — port 5197, persona `qa0805.kai@keeltest.dev`

**320 px ET 1280 px, les deux langues.**

| Mesure | fr @1280 | fr @320 | en @1280 | en @320 |
|---|---|---|---|---|
| `document.scrollWidth` | 1280 | **320** | 1280 | **320** |
| éléments dépassant le bord droit | 0 | **0** | **0** | **0** |
| « Plus tard » / « Later » | ×2, actifs | — | ×2, actifs | ×2, actifs |
| « L'ajouter » / « Add them » sur brouillon vide | `disabled` | — | `disabled` | `disabled` |

⚠️ **Les captures du Browser pane portent la bande grise du haut** (cicatrice
`browser-pane-screenshot-only-repaints-at-scroll-0`). **Toutes les valeurs
ci-dessus sont MESURÉES** (`getBoundingClientRect`, `scrollWidth`,
`button.disabled`), pas lues sur une image.

### Les trois cas de L5-A, rejoués à l'écran — **les trois confirmés**

| Cas | Attendu | Mesuré |
|---|---|---|
| 25 kg / 140 / F / sédentaire / perte | phrase, pas de curseur | **`#mouth-pace` absent** + la phrase du plancher d'énergie |
| 60 kg / 165 / F / sédentaire / perte, cible 55 | max 0,45 · « environ 12 semaines » | **`max="0.45"`** · *« Environ 12 semaines à ce rythme. »* |
| 110 kg / 185 / H / `trains_hard` / prise, cran 0,75 | max 1,00 + surplus en français | **`max="1"`, `value="0.75"`** + la phrase `fr` de `PACE_WARNING_LABELS`, au mot près |

Aucun cran d'activité n'est pré-coché (propriété de M13), confirmé dans le DOM.

### ⛔ L'ÉCRITURE RÉELLE — la meilleure preuve que la migration vit

Fiche remplie et **enregistrée** depuis `/app/household`, sous un vrai JWT
`authenticated` :

```
first_name | goal     | birth_date | target_weight_kg | target_pace_kg_per_week
ZoeL5B     | fat_loss | 1990-05-04 |               55 |                     0.3
   height_cm | weight_kg | gender | activity_level
       165.0 |      60.0 | female | sedentary
```

**Les six marches de `persistMouth` ont écrit**, y compris
`keel_household_set_member_target`, la porte que cette migration crée. Et après
le succès, **la fenêtre reste ouverte et le brouillon est vide** — « trois
personnes d'affilée sans quitter le flux », mesuré.

> ⚠️ **La bouche `ZoeL5B` reste dans le foyer de `qa0805.kai@keeltest.dev`.** Je
> ne l'ai pas supprimée. À retirer par l'écran si la fixture doit revenir à deux
> bouches.

---

## 6. PRIORITÉ 4 — les trois trous, évalués

### ① Le shaker n'a **aucun lecteur**… et je trouve pire : **aucun écrivain**

L5-A nomme le trou côté lecture. Mesuré, il est exact :

```
generate-household-meal-v1/index.ts : fixedIntakes: []   lignes 2827, 2979, 3431
_shared/keel/household_meal_generation.ts : ZÉRO occurrence de `fixedIntakes`
```

**Mais l'écriture manque aussi**, et ça n'est pas dans son rapport :

- `MouthPersistPayload` **ne porte aucun champ shaker** ;
- `mouthToPersist` **laisse tomber `draft.shaker`** ;
- `addShakerToOwnIntakes` existe, est testée… et a **zéro appelant**.

Aujourd'hui c'est **inerte** : le bloc n'est rendu que pour `hasAccount: true`,
et aucune surface montée ne passe `true`. **Le jour où l'entonnoir monte la
fenêtre pour le maître, le champ collectera et jettera en silence.**

> **Ça bloque la demande n°4 de l'utilisateur, et c'est un lot à part.**
> Il faut les deux bouts : le lecteur (`household_meal_generation.ts` — **L8**,
> L7 vient de livrer le prompt) **et** l'écrivain (brancher
> `addShakerToOwnIntakes` dans `persistMouth`, ou une table par membre). Livrer
> l'un sans l'autre laisse exactement le champ décoratif que D2 vient de fermer.

### ② Cran d'activité obligatoire (L5) vs facultatif (L0) — **à trancher, et j'ai un avis**

Les deux lectures sont défendables et **ne portent pas sur la même chose** : L0
parle de ce que **la base** exige (`null` = « personne n'a répondu », lecture
juste des lignes d'avant), L5 de ce que **le formulaire d'accueil** demande.

**La contradiction est réelle malgré tout** : la même personne, saisie par
l'entonnoir (L0) ou par la fenêtre (L5), n'a pas les mêmes champs obligatoires.

**Mon avis** : la règle de L5 est la bonne **pour un formulaire d'accueil** — le
champ existe précisément pour supprimer le `null` qu'il produirait. Mais elle ne
doit pas contaminer les écrans de **correction** : reprendre un poids ne doit pas
obliger à re-répondre. **Décision humaine attendue** ; si une seule règle est
voulue, c'est celle de L5 qui bouge.

### ③ Ne pas toucher `SetupPage §people` — **décision juste, et le coût est plus élevé que six lignes**

`SetupPage.tsx` porte **+477 / −16 non commitées** (L0). Y poser la fenêtre
aurait produit deux lots réécrivant le même écran dont un seul visible en
`git diff` — exactement ce que la règle anti-collision n°2 interdit. **C'était
juste.**

L'estimation « six lignes » est celle du **montage**. Elle laisse dehors :

- l'entonnoir doit passer `hasAccount: true` pour le maître → **le bloc shaker
  s'allume, et il n'a pas d'écrivain (①)** ;
- l'arbitrage ② devient visible sur le même écran, pas seulement entre deux
  lots ;
- l'entonnoir n'a pas de `member_id` avant la création du foyer : les marches
  4-6 (habitudes, allergies, régime) doivent attendre.

**À faire par le lot qui referme `SetupPage` après L0, et ① doit être tranché
avant.**

---

## 7. Ce qui reste rouge, et à qui

| Rouge | À qui | Antériorité |
|---|---|---|
| `coverage-guard.int.test.ts` — triggers | **autres lanes** : `household_member_bodies_touch` vient de `20260812220000`, `student_daily_recommendations_set_updated_at` d'une lane voisine. **Ma migration contient `0` `create trigger`** (compté) | rouge dès le relevé de L5-A à 12 h 05 |
| `coverage-guard.int.test.ts` — edge functions | **autre lane** : je n'ajoute aucune fonction edge | idem |

**Aucun rouge dans mon périmètre.** `planRefusals.int.test.ts`, que L5-A comptait
comme étranger, est **vert** (§4 D3).

---

## 8. Ce qui n'est PAS prouvé

1. **Le maître ne voit toujours pas le pop-up.** La conception dit « **maître
   compris** — sans quoi celui qui tient la maison serait le seul dont on ne sait
   rien ». `/app/household` le laisse sur `MeCard` (trois champs en ligne). Le
   composant sait le servir (`MouthSubject`), **aucune surface ne l'appelle**.
   C'est un **écart de conception assumé par L5-A**, pas un bug — et il ne se
   referme qu'avec ③.
2. **Aucun run modèle.** Rien de ce lot n'atteint le générateur : la cible et le
   rythme sont écrits, **personne ne les lit encore** (c'est L8).
3. **`bad_activity_level` n'a pas de cas mesuré à l'écran** — il faudrait forger
   un appel PostgREST hors du formulaire. La correspondance est prouvée par le
   test du catalogue, pas par un aller-retour HTTP.
4. **Le bloc `tastes` et le bloc `habits` n'ont pas été remplis au navigateur** —
   seuls les trois obligatoires l'ont été. Leur contenu est prouvé sur le rendu
   (42 cas), pas sur un aller-retour réel.

---

## 9. Procédure

- Mutations appliquées **sur les fichiers réels**, restaurées après chacune,
  empreintes `sha256` comparées : **les trois fichiers sont identiques** à leur
  état d'avant, après les deux campagnes.
- `git add` **par chemins explicites**. **Jamais `git add -A`, jamais
  `git stash`.** Les trois fichiers commités ne portent **que** mes hunks
  (vérifié `git diff -U0` en-tête par en-tête).
- **Aucune commande à risque** : ni `db push`, ni `db reset`, ni
  `functions deploy`, ni `secrets`, ni `link`. La migration a été appliquée par
  `psql` **en transaction unique**, comme le fichier le prévoit, puis inscrite au
  registre.
- Runtime edge **non redémarré**. `launch.json` **non modifié** (serveur existant
  `frontend-a4c`, port 5197).
