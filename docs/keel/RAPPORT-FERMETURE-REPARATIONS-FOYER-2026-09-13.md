# Fermeture des réparations de foyer — rapport du 2026-09-13

**Verdict : les trois défauts de `REVUE-FERMETURE-TROIS-LOTS-2026-09-12.md` sont
fermés, chacun avec son cas de test et sa contre-épreuve. Seize parcours sont
passés dans le VRAI handler, dont cinq avec une réparation RÉELLEMENT écrite par
le fournisseur. Deux défauts de plus ont été trouvés en chemin — une prose
livrée qu'aucun verrou ne lisait, et un champ que le contrat de patch oubliait —
tous deux corrigés.**

⛔ **ET LE PLAN N'EST PAS EXÉCUTÉ EN ENTIER.** Le § 3.1 demandait trois fixtures
de premier jet qui n'existent pas ; le scénario « premier jet valide, zéro
réparation » n'est atteint à aucune taille ; cinq cas nommés restent non
mesurés. Le **tableau d'état du § 6** les marque un par un, et le § 7 dit
pourquoi. Un `⚠️` n'y vaut pas un `✅`.

Ce document rend compte du plan
[`PLAN-FERMETURE-REPARATIONS-FOYER-2026-09-13.md`](PLAN-FERMETURE-REPARATIONS-FOYER-2026-09-13.md).
Aucun déploiement, aucun `db push`, aucun secret, aucune suppression.

**Dépense fournisseur : cinq appels de réparation**, sur les six que le plan
§3.3 budgète, et aucun autre — le premier jet est en conserve dans tous les
parcours, y compris les payants. Les onze parcours déterministes coûtent zéro :
le banc y remplace la clé par une sentinelle et refuse toute sortie réseau hors
pile locale (`sorties réseau REFUSÉES : 0` partout, `appels fournisseur RÉELS
(facturés) : 0`).

---

## 0. État avant de commencer

Commit de départ : `a14c6be1`. Le poste portait déjà 259 fichiers modifiés par
d'autres sessions ; aucun n'a été défait. Les scénarios ont été figés avant
d'écrire une ligne : horloge injectée, grille dérivée par les fonctions de
production (`plan_hours.ts`, `meal_plan_window.ts`) **avant** l'appel, corps et
objectifs posés par les RPC du produit.

---

## 1. Lot 1 — le déroulé d'une session est du texte qu'on contrôle

### 1.1 Le défaut, reproduit avant d'être corrigé

Sonde dans `meal_generation_test.ts` : préparation valide de **deux** portions,
plat qui la référence, session qui référence cette préparation, contrainte
`peanut` de sévérité médicale. La même phrase, deux emplacements :

| Emplacement de « Ajouter du beurre de cacahuète au riz. » | Avant le lot |
|---|---|
| `dishes[].method` | plat retiré, `unsafe_candidate` posé, violation localisée |
| `cooking_sessions[].run_through` | **plat ET session conservés, verrou `clean`** |

Mesuré, pas déduit : le test a rougi sur la ligne `assertEquals(meal.dishes, [])`
avec le plat entier en diff.

### 1.2 Ce qui a changé

`supabase/functions/_shared/keel/output_surfaces.ts` (nouveau) RECENSE les
surfaces visibles. Il ne détecte rien : la détection reste
`applyKeelOutputLocks`, appelée par l'appelant sur ces surfaces — jamais un
second matcher.

Trois listes de champs recopiées à la main existaient : dans le parseur, dans
`localizeOutputLockBites`, et dans le handler. Aucune ne portait
`cooking_sessions[].run_through` ; aucune ne portait `dishes[].name`. Il n'y en
a plus qu'une, et **le texte concaténé du verrou global comme la localisation
en descendent** — ils ne peuvent donc plus oublier des champs différents.

Familles recensées : `dish` (nom d'usage, titre, méthode, `why`, termes),
`preparation`, `cooking_session`, `portion_note`, `box_item`, `shopping`.

`UnsafeViolation` gagne `sessionIndex`, `preparationIds` et `memberIds`. Une
session n'est **pas** un repas : elle porte son jour, ses casseroles et les
bouches qui en mangent ; son `slot` reste `null`. Lui inventer un moment pour
qu'un périmètre la résolve aurait été l'attribution arbitraire que le plan
interdit.

### 1.3 Le contrôle final lit ce qui part

Deux relevés dans le handler, tous deux issus du même recensement :

- **dans la boucle** (`c4LockBites`) — il adresse la réparation ;
- **avant livraison** (`c4FinalBites`) — sur l'état final, avec les notes de
  part réellement écrites (`portionsOut`), que le relevé de tour ne pouvait pas
  voir (il tourne avant `reconcilePortions`).

Une erreur de relevé **bloque** : `plan_validation_unavailable`, jamais une
liste vide relue « plan sain ».

### 1.4 Preuves

- `output_surfaces_test.ts` — 10 cas : le déroulé recensé avec ses casseroles ;
  les consommateurs d'une session commune (2 bouches, puis 4 sur deux jours) ;
  le plat dédié qui garde son seul propriétaire ; le nom d'usage dans le texte
  contrôlé ; le libellé de contenant comme surface propre ; le texte global
  égal à la somme des surfaces ; les compteurs avec leur dénominateur ; **et le
  câblage à `MEAL_TRANSLATABLE_FIELDS`** — chaque champ de prose traduit porte
  un témoin, et un champ ajouté là-bas fait rougir ici.
- `meal_generation_test.ts` — 8 cas neufs : déroulé français accentué, témoin
  anglais, méthode de plat (non-régression), nom d'usage, méthode de
  préparation (localisée sur sa casserole), note de part, **la négation
  tolérée sur toutes les surfaces** (« no peanut goes anywhere near this »
  reste `clean`), et la candidate interne qui garde plats, casseroles et
  sessions pour que la réparation puisse viser.
- `output_lock_wiring_test.ts` — 8 épingles : le parseur dérive son texte du
  recensement, il y passe les sessions, le handler recense deux fois, la
  ceinture finale lit sessions et parts, elle précède le refus, le refus
  précède l'écriture, un relevé qui jette bloque, le refus public ne rend
  aucune recette, et aucun de ces trois journaux ne porte de jeton d'allergène.

---

## 2. Lot 2 — un patch cohérent, ciblé, applicable en entier

### 2.1 Un seul schéma de sortie

L'appel de réparation transmettait `built.systemPrompt + household.systemSuffix` :
`MEAL_SYSTEM_PROMPT` avec son `OUTPUT JSON SCHEMA` de **plan complet**, l'ordre
de couvrir tous les jours, et les schémas de foyer — pendant que le message
utilisateur exigeait `{"repair":{…}}`.

`MEAL_SYSTEM_PROMPT` est maintenant la **concaténation de 21 sections nommées**
(`MEAL_PROMPT_SECTIONS`). La chaîne livrée est identique au caractère près —
vérifié en exécution contre une empreinte prise avant le découpage (19 720
caractères, égalité stricte), et `meal_prompt_sections_test.ts` épingle la
structure.

`plan_repair_prompt.ts` (nouveau) en **choisit 13** et **en écarte 8, chacune
avec la raison de son absence écrite** :

| Section écartée | Pourquoi |
|---|---|
| `opening` | elle annonce un objet JSON dont le schéma est celui d'un plan |
| `stretch_starts_today` | une réparation ne choisit pas ses jours |
| `cover_whole_stretch` | ⛔ l'ordre contradictoire : « couvre CHAQUE jour dans cette réponse » |
| `cooking_sessions` | la composition d'une session n'est pas patchable ; seul son déroulé l'est |
| `session_time_ceiling` | un patch ne fixe ni le temps ni le contenu d'une session |
| `student_situation` | elle dit comment composer une semaine autour d'un agenda |
| `two_modes` | un patch n'écrit pas de liste de courses |
| `output_schema` | ⛔ le second schéma de sortie — le défaut entier |

Un test exige que les deux listes recouvrent **exactement** les 21 sections :
une section ajoutée au prompt de composition fait rougir tant que personne n'a
dit à quel camp elle appartient.

Les limites dures voyagent avec le message système, rendues par les **mêmes
fonctions** que la composition (`safetyConstraintsPromptBlock`,
`restrictionBlock`) — jamais réécrites. Le message utilisateur ne rebâtit plus
le brief initial : il porte le périmètre, le plan projeté, les écarts mesurés,
la raison du rejet précédent, et le bloc de langue en queue.

Mesuré au banc : prompt système de réparation **16 340 caractères sans limites
dures, 17 906 avec**, contre 19 720 + suffixe de foyer pour la composition.

### 2.2 La correction d'une session, sans réécrire les repas

Contrat interne **`repair.v2`**. Nouvelle opération bornée :

```json
{"repair": {"base_version": "…",
            "sessions": [{"session_id": "S1", "run_through": "…"}]}}
```

Les adresses sont attribuées par le serveur (`buildRepairSessions`,
`plan_repair_unit.ts`) : `S1` désigne `cooking_sessions[0]` du plan annoncé
dans `base_version`. Le modèle remplace un **texte** : pas le jour, pas les
casseroles, pas les durées, ni création ni suppression.

Le périmètre porte `sessionIds`, la projection rend le déroulé d'aujourd'hui
(« says today: … ») pour les seules sessions en défaut, `applyRepairPatch`
écrit la seule clé `runThrough`, et `fusedSourceText` reporte la correction
dans le **texte source** — sans quoi le plan structuré et `mealSourceText` se
seraient contredits.

Une session seule en défaut **ouvre un périmètre** : la garde d'amont du
handler ne lisait que `unitIds` et `preparationIds`, et rendait « périmètre
vide ».

### 2.3 L'atomicité, sans interdire l'omission

| Cas | Avant | Maintenant |
|---|---|---|
| tableau racine omis / vide | `empty_patch` dans `errors` | `empty: true`, aucune erreur |
| opération explicitement invalide | appliquée si une autre unité valide survivait | **`unreadable`, patch entier rejeté** |
| unité existante rendue mais non parsée | sautée en silence | `unit_not_parsed`, rejet |
| préparation remplacée non parsée | sautée à l'application | `preparation_not_parsed`, rejet |
| préparation sans identifiant | sautée | `preparation_without_id`, rejet |
| doublon de préparation / de session | non contrôlé | `duplicate_preparation` / `duplicate_session` |
| charge écartée par `patchDishPayloads` | journalisée seulement | `payload_dropped`, rejet |
| `base_version` absent alors qu'annoncé | **accepté** | `base_version_missing` (motif distinct de `base_version_stale`) |

`empty` a quitté `errors` pour que « il n'a rien changé » et « il a écrit
quelque chose d'illisible » cessent d'appeler le même refus.

Et une réparation qui ne porte **qu'une casserole** est désormais réellement
lue : les préparations n'étaient recueillies que dans la boucle des unités, si
bien que le geste même qu'on propose pour un lot partagé ne faisait tourner
aucun parseur.

### 2.4 Preuves

`plan_repair_patch_test.ts` (29 cas), `plan_repair_context_test.ts` (23),
`plan_repair_prompt_test.ts` (8), `meal_prompt_sections_test.ts` (5),
`plan_repair_prompt_wiring_test.ts` (8). Deux cas ont **changé de sens** et
sont réécrits en le disant : « une version non citée n'est pas une version
périmée » (l'écho est maintenant exigé) et « une enveloppe vide ou illisible »
(vide et illisible sont deux faits).

`plan_repair_decision_test.ts` portait déjà, sans modification : première
candidate rejetée puis seconde adoptée, deux échecs → `calls_exhausted`,
allergène introduit par la réparation, **une amélioration qui dégrade l'autre
bouche**, exception de validation.

---

## 3. Lot 3 — les parcours contrôlés, dans le vrai handler

Banc `scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts` : il importe le
VRAI handler (`Deno.serve` capturé, aucun port ouvert), provisionne les comptes
par les RPC du produit, et intercepte le fournisseur. Étendu pour ce lot :
`--bouches=N` (jusqu'à 4 bouches aux corps différents), `--allergene-deroule`
(l'allergène dans le seul déroulé, zéro recette, zéro achat),
`--patch-session-seul`, `--deroule-persiste`, `--patch-casse=<tour>`.

### 3.1 Les quatorze tirs déterministes

| Tir | Foyer | Cas | Cases | Statut | Appels | Livraison | Morsures finales |
|---|---:|---|---:|---:|---:|---|---:|
| `l3b01` | 1 | premier jet | 8 | 200 | 2 | `deliverable_with_gaps` | 0 |
| `l3e02` | 2 | premier jet | 14 | 200 | 2 | `deliverable_with_gaps` | 0 |
| `l3e04` | 4 | premier jet | 28 | 200 | 2 | `deliverable_with_gaps` | 0 |
| `l3d01` | 2 | allergène dans le DÉROULÉ seul | 14 | **200** | 1 | `deliverable_with_gaps` | **0** |
| `l3d02` | 2 | la violation PERSISTE deux fois | 14 | **422** | 2 | — | **1** |
| `l3d04` | 4 | allergène dans le DÉROULÉ seul | 28 | **200** | 1 | `deliverable_with_gaps` | **0** |
| `l3d05` | 2 | patch CASSÉ au tour 1, utile au tour 2 | 14 | **200** | 2 | `deliverable_with_gaps` | 0 |
| `l3f01` | 4 | appel par un compte SECONDAIRE | 28 | 200 | 2 | `deliverable_with_gaps` | 0 |
| `rejeu tir3` | 1 | rejeu archive `lot3f` | 6 | 200 | **0** | **`conforme`** | 0 |
| `rejeu tir5` | 1 | rejeu archive `lot3f` | 6 | 200 | **0** | **`conforme`** | 0 |
| `rejeu tir6` | 2 | rejeu archive `lot3f` | 12 | 200 | **0** | **`conforme`** | 0 |
| `rejeu lot3c t2` | 1 | rejeu archive AVEC réparation | 7 | 200 | 2 | `deliverable_with_gaps` | 0 |
| `l4a01` | 4 | patch sur le LOT COMMUN seul | 28 | 200 | 2 | `deliverable_with_gaps` | 0 |
| `l4b01` | 4 | portion absente + compléments | 28 | 422 | 2 | — | 0 |

### 3.2 Ce que chaque tir établit

**`l3d01` / `l3d04` — la surface du lot 1, de bout en bout.** L'allergène est
écrit dans le SEUL déroulé : aucune recette ne le nomme, aucune ligne de
courses ne l'achète. Le verrou le localise (`sites: ["cooking_session:fri/"]`,
sans moment inventé), le périmètre s'ouvre sur `S1` **et sur rien d'autre**
(`scope.sessions: 1`, `units: 0`, `preparations: 0` quand aucun autre défaut ne
l'accompagne), le patch rend `{"repair":{"base_version":…,"sessions":[…]}}`,
la fusion écrit `sessions_rewritten: ["S1"]`, le verdict est `adopt`, et la
ceinture finale ne mord plus. **Les recettes et les quantités sont inchangées**
— le patch ne portait aucune unité.

**`l3d02` — la contre-épreuve, et c'est la plus utile.** Le modèle « répare »
sans retirer l'aliment. Les deux tentatives partent, les deux sont appliquées,
et la livraison est **refusée** : `plan_not_deliverable`, `detail:
["output_lock:1"]`, **0 ligne écrite**, l'ancien plan intact. La sécurité
s'applique bien une fois le budget modèle épuisé.

**`l3d05` — l'atomicité dans le vrai handler.** Le premier patch porte une
opération de session VALIDE **et** une opération `null`. Rejet entier :
`rejections: [{why: "unreadable", at: "unit_not_an_object"}]`, la session
valide n'est **pas** appliquée. Le second patch, propre, est appliqué. Deux
appels au maximum pour tout le foyer.

**`l3f01` — l'autorisation.** Un compte secondaire réclamé au foyer reçoit
**403 `not_owner`**, avant tout appel fournisseur et toute écriture.

**Les trois rejeux — la non-régression.** Ce ne sont PAS des remesures : les
réponses brutes archivées des trois tirs réels `lot3f` du 2026-09-12 sont
réinjectées au transport contrôlé et refinalisées par le moteur d'aujourd'hui,
avec sa nouvelle boucle, son nouveau recensement de surfaces et sa nouvelle
lecture de patch. Les trois rendent **`conforme`**, zéro réparation, zéro
refus, et écrivent leur ligne. La remesure séparée par `analyse-lot-F.ts` sur
les archives donne, elle, **6/6 · 6/6 · 12/12 = 24/24** conformités complètes,
inchangées.

### 3.3 Les surfaces réellement contrôlées avant livraison

Relevé du dernier tour, par tir (`keel.household_meal.output_lock_final`) :

| Tir | plats | casseroles | **sessions** | notes de part | contenants | courses |
|---|---:|---:|---:|---:|---:|---:|
| `l3b01` | 8 | 3 | **2** | 0 | 42 | 23 |
| `l3e04` / `l3d04` / `l3f01` | 7 | 3 | **2** | 0 | 78 | 23 |
| `rejeu tir6` | 6 | 3 | **1** | 0 | 58 | 18 |

La colonne `sessions` valait **zéro partout** avant ce lot : elle n'existait
pas.

### 3.4 Le lot commun retouché, et la portion absente

**④ — un patch qui ne porte QUE la casserole commune (`l4a01`, N=4).** C'est le
chemin que la revue avait nommé comme jamais lu : les préparations n'étaient
recueillies que dans la boucle des unités.

```text
patch servi        : {"repair":{"base_version":…,"preparations":[prep_chicken ×1,6]}}
plan_repair_merge  : units [] · untouched U1…U11 · preparations_replaced ["prep_chicken"]
garde de la candidate : cook_day_unplaced 2 · session_day_mismatch 1
                        cell_without_portion 8   ← huit portions perdues
plan_repair_judged : "safety_regression" · 40 défauts → 37
```

Le patch est **lu, appliqué et refinalisé pour les quatre consommateurs** — et
la candidate est **rejetée**, alors même qu'elle porte MOINS de défauts (37
contre 40). Huit cases personne-date-créneau avaient perdu leur portion : « un
total de défauts plus faible ne permet pas de dégrader une portion auparavant
conforme d'une autre personne » est tenu, et mesuré.

**⑤ — une portion absente à un créneau partagé (`l4b01`, N=4).** Avec une case
rendue irrésoluble :

```text
table des unités : 28 cases attendues · 7 présentes · 8 RÉSERVÉES · 4 compléments
périmètre        : 15 unités dont 8 à CRÉER
patch appliqué   : created U3 U5 U8 U9 U11 U12 U13 U14
```

Les huit adresses manquantes existent, le patch les remplit, et les quatre
entrées de dernier recours sont ouvertes séparément des portions absentes — les
deux familles ne se mélangent pas. Sur ce tir, la candidate du banc est ensuite
rejetée (sa recette-témoin est trop pauvre) ; l'adoption d'unités CRÉÉES est
prouvée ailleurs, au tir `l3a01` (N=1 : `Assiette U7`, `U8`, `U9` créées,
mesurées et écrites).

### 3.5 Le rejeu de l'archive `lot3c` connue avec réparation

`campagne-tir2-lot3c` est la seule archive de la campagne du 2026-09-12 qui
porte **deux** réparations de modèle. Son premier jet réinjecté au transport
contrôlé, refinalisé par le moteur d'aujourd'hui : **200**, deux réparations,
`deliverable_with_gaps`, une ligne écrite. Ses anciennes réponses de réparation
étaient au format PLAN COMPLET : elles ne sont pas des patchs du nouveau
protocole, et ce sont donc des réponses contrôlées — déclarées comme telles —
qui ont servi aux deux tours.

### 3.6 Les mesures par personne-date-créneau

`figer-demande.ts` convertit une sortie du banc en demande figée, et
`analyse-lot-F.ts` la mesure avec le MÊME instrument que les tirs réels. Le
dénominateur vient de la demande, jamais des plats rendus.

| Tir | Foyer | Cases attendues | Conformité CALORIQUE | Conformité COMPLÈTE | Contrôles incomplets |
|---|---:|---:|---:|---:|---:|
| `l3b01` | 1 | 8 | **8/8** | 5/8 | 0 |
| `l3e02` / `l3d01` / `l3d05` | 2 | 14 | **14/14** | 6/14 | 3 |
| `l3e04` / `l3d04` / `l3f01` | 4 | 28 | 7/28 | 4/28 | 9 |
| `h1n1c` (hybride, réparation adoptée) | 1 | 7 | **7/7** | 4/7 | 0 |
| rejeu `lot3f` tir 3 · tir 5 | 1 | 6 | **6/6** | **6/6** | 0 |
| rejeu `lot3f` tir 6 | 2 | 12 | **12/12** | **12/12** | 2 |

⛔ **La conformité CALORIQUE et la conformité COMPLÈTE ne se publient pas l'une
pour l'autre.** La seconde exige en plus les bornes de masse et le couloir de
densité. Les trois rejeux d'archives — des plans que le modèle a composés POUR
la table qu'on leur oppose — sont complets ; les tirs de banc à deux et quatre
bouches ne le sont pas, parce que leur premier jet a été composé pour une seule
personne (voir § 7.1).

### 3.7 L'écran relit le foyer de quatre, texte réparé compris

La fixture `frontend/src/keel/lib/__fixtures__/lot-f-plans.json` gagne un
cinquième plan, `quatuor` : la ligne que le handler a écrite au tir `l3d04`.
`relectureLotF.int.test.ts` (12 cas) vérifie sur elle :

- **quatre bouches nommées**, aucune part orpheline, et chaque contenant ne
  nomme que des bouches de cette table ;
- les lecteurs de production (`readDishes`, `readPreparations`, `readShopping`)
  transportent `amount` / `unit` / `ref` sur toutes les lignes après un
  aller-retour `jsonb` ;
- **le déroulé RÉPARÉ est celui qui est relu** : aucune session ne nomme
  l'aliment interdit, et la phrase écrite par la réparation est bien celle en
  base.

### 3.8 Un défaut du BANC, trouvé et nommé

Le premier essai de réparation de session rendait `base_version_missing` alors
que le banc lisait la bonne version. Cause : le journal du crochet lisait
`patch.repair.units.length` sans garde — un patch de sessions seules n'a pas
d'unités, le crochet **jetait**, l'exception était rattrapée par la chaîne de
repli du fournisseur, et le modèle de secours servait la réponse du
REMPLISSAGE (`{"items":[]}`) à une réparation. Deux tours « rejetés » pour
rien, avec un motif qui accusait le modèle. Corrigé dans le banc ; le motif
`base_version_missing` journalise désormais **la version réellement lue**
(`envelope_base_version`) et le compte des opérations reçues, pour que
« il n'a rien écrit » et « on a mal lu » cessent de rendre la même trace.

---

## 4. Vérifications

| Contrôle | Résultat |
|---|---|
| `deno test supabase/functions/_shared/keel/` | **7 052 réussis · 0 échec · 2 ignorés** |
| `deno check` du handler et des modules touchés | 0 erreur |
| vitest (front) | 2 600 tests · 2 rouges, **2 tolérés, 0 hors liste** |
| typecheck des tests front | 67 erreurs pour 68 tolérées |
| `deno check` des points d'entrée | 4/4 |
| eslint sur les fichiers front modifiés | 0 erreur, 1 avertissement préexistant |
| **`scripts/agent-gate.sh`** | **pass** |

**Échecs préexistants, hors périmètre et non touchés par ce chantier :** cinq
tests de `supabase/functions/sophia-brain/` échouent
(`run_household_safety_test.ts` ×3, `no_calorie_to_student_property_test.ts`,
`restriction_no_pressure_property_test.ts`). Vérifié : ils échouent à
l'identique sur une extraction propre de `HEAD` (`git archive`), et
`supabase/functions/sophia-brain/` n'a aucune modification locale. Trois
scripts de `scripts/` (`keel_anchor_nodelivery_20260822.ts`,
`keel_d3_position_du_bloc_20260822.ts`, `keel_denominateur_verdict_20260904.ts`)
ne typechecent pas non plus, et ne sont pas modifiés.

---

## 5. Les parcours HYBRIDES avec le fournisseur réel

**Cinq appels de réparation réellement facturés, sur les six que le plan
budgète.** Le premier jet reste en conserve dans chacun : chaque parcours est
explicitement **hybride**, pas une génération intégralement réelle.

Le mode payant n'existe que si on le demande (`--reparation-reelle=<n>`, 0 à 2).
Sans lui, le banc remplace la clé par une sentinelle et rien ne sort. Avec lui,
**seuls les tours de réparation** passent — jamais le tour 0 — et le plafond est
tenu **dans le transport**, pas seulement dans le handler : au-delà, le
transport reprend la main et le dit. Chaque appel imprime le mot « FACTURÉ »,
et le compte des appels réels sort dans la fixture, à part des appels
interceptés.

| Parcours | Foyer | Appel réel | Durée fournisseur | Durée totale | Verdict de la candidate | Sortie |
|---|---:|---:|---:|---:|---|---|
| `h1n1` | 1 | 1 | 90,8 s | 94 s | **rejetée** (`cook_day_unplaced`) | 200, 1 ligne |
| `h1n1b` | 1 | 1 | 114,5 s | 118 s | rejetée (même cause, réponse archivée) | 200, 1 ligne |
| `h1n1c` | 1 | 1 | 94,4 s | 98 s | **`adopt`** | 200, 1 ligne |
| `h2n2` | 2 | 1 | 99,7 s | 103 s | rejetée (`mouth_unfed: 2`) | **422**, 0 ligne |
| `h4n4` | 4 | 1 | 43,0 s | 46 s | rejetée (40 → 74 défauts) | 200, 1 ligne |

Aucune durée ne dépasse la coupure de 150 s. Aucune reprise silencieuse : le
plafond a été atteint une fois (`h1n1`, tour 2), le transport l'a **dit** et a
repris la main.

### 5.1 Ce que le modèle sait faire — mesuré, pas supposé

**Le modèle écrit le nouveau contrat de patch.** Réponse brute archivée du
premier parcours (`appels_reels[0].body`) :

```text
clés racine   : ["repair"]                 ← et rien d'autre : aucun plan
repair        : base_version, units, preparations, sessions
base_version  : "821fec21-…#r0"            ← échoé exactement
units         : 7  (U1…U7)
une unité     : unit_id, title, name, ingredients, method, why, same_day,
                uses, components
preparations  : 1  (prep_beef)
```

C'est la question que le rapport précédent laissait ouverte en toutes lettres.
**Elle est fermée : le modèle rend la forme demandée, échoue la version, et ne
rend jamais un plan complet.** Les sections écartées du prompt système font ce
qu'on attendait d'elles.

**Et il emploie l'opération de session de lui-même.** Au parcours N=2, aucune
consigne fabriquée par le banc : le modèle a rendu `sessions` et la fusion a
écrit `sessions_rewritten: ["S1"]`. L'opération du lot 2 existe donc dans les
deux sens — le serveur sait l'appliquer, et le modèle sait l'écrire.

### 5.2 Le défaut que ces appels ont trouvé — et il était dans CE chantier

Au premier parcours, la candidate a été **rejetée** : `cook_day_unplaced: 6`,
`session_day_mismatch: 3`, `cell_without_portion: 6`.

Cause, lue dans la réponse brute : la préparation renvoyée portait `id`,
`title`, `servings_made`, `ingredients`, `method`, `active_minutes`,
`total_minutes`, `components` — **et pas `cook_on`**. Le schéma de patch que ce
chantier a écrit ne le nommait pas. Le modèle avait obéi ; c'est la consigne qui
avait tort. Une casserole sans jour de cuisson n'appartient plus à aucune
session, et la garde jette la candidate entière — correctement, mais pour une
faute qu'on avait nous-mêmes induite.

**Les deux moitiés du correctif**, parce qu'une consigne de prompt régresse et
qu'un verrou se vérifie :

- le schéma **nomme** `cook_on` (pour une casserole NEUVE, que le serveur ne
  peut pas deviner) ;
- le serveur **remet** le jour d'une casserole DÉJÀ AU PLAN
  (`patchPreparationPayloads`), exactement comme il remet le jour, le moment et
  le propriétaire d'une unité. Un patch ne déplace pas une cuisson, par
  construction.

Un compteur sort à chaque tour (`patch_preparation_identity` :
`declared`, `cook_on_restored`, `cook_on_missing`, `created`) — sans quoi « le
modèle l'écrit » et « on le remet pour lui » rendraient la même trace.

**Le même parcours, après le correctif (`h1n1c`) :**

```text
patch_preparation_identity : declared 3 · cook_on_restored 3 · cook_on_missing 0
plan_repair_merge          : units U1…U7 · preparations_replaced ×3
plan_repair_judged         : verdict "adopt" · 6 défauts → 4 · safety_added 0
livraison                  : deliverable_with_gaps · 200 · 1 ligne écrite
mesure par case            : conformité CALORIQUE 7/7 · COMPLÈTE 4/7
```

**Une réparation écrite par le vrai modèle a été adoptée.**

### 5.3 Et ce qu'il ne sait pas encore faire

**À deux et à quatre bouches, sa réparation est rejetée — et c'est la garde qui
travaille.**

- **N=2** : il corrige bien le déroulé dangereux, mais il réécrit aussi les huit
  unités du périmètre et en crée une. Le résultat retire un repas à **deux
  bouches** (`mouth_unfed: 2`, bloquant). La candidate est jetée **en entier** —
  la correction de session comprise, parce qu'un patch est atomique. Refus
  `plan_not_deliverable`, **0 ligne écrite**, ancien plan intact.
- **N=4** : onze unités, quatre créations, **40 défauts avant, 74 après**.
  Rejetée. Le plan livré est le premier jet.

Ce n'est pas un échec de la boucle : dans les deux cas la garde a fait
exactement ce qu'on lui demande — refuser une candidate qui dégrade l'assiette
de quelqu'un. C'est une mesure de la **compétence du modèle quand le périmètre
est large** : à une bouche et sept unités il améliore ; à deux ou quatre, il
casse plus qu'il ne répare. Le rapport le publie tel quel plutôt que de
multiplier les tirs jusqu'à obtenir un succès.

---

## 6. Tableau d'état, exigence par exigence

⛔ **`⚠️` et `❌` ne se lisent pas `✅`.** Ce tableau existe pour que « le lot est
fait » ne recouvre pas trois états différents.

### Lot 1 — contrôler les textes de cuisine

| § | Exigence | État | Preuve |
|---|---|---|---|
| 1.1 | Sonde reproduite : préparation de DEUX portions, plat, session, `peanut` médical | ✅ | `meal_generation_test.ts` — déroulé, méthode de plat, témoin anglais |
| 1.2 | Collecte commune, pure et typée, réutilisée par les deux passages | ✅ | `output_surfaces.ts` ; `output_lock_wiring_test.ts` ① ② ③ |
| 1.2 | Sessions avec `runThrough` et leurs préparations | ✅ | `output_surfaces_test.ts` ① |
| 1.2 | `applyKeelOutputLocks` conservé, aucun second matcher | ✅ | `localizeOutputLockBites` appelle le détecteur de production |
| 1.2 | Inventaire des autres textes livrés (nom, titre, méthode, `why`, termes, contenants, notes, **explications**, courses) | ✅ | `output_surfaces_test.ts` ⑤ (câblé à `MEAL_TRANSLATABLE_FIELDS`) et ⑥ (explication) |
| 1.2 | Contrôle final sur la version fusionnée réellement sérialisée | ✅ | ceinture finale sur `meal` + `portionsOut` + `explanation.lines` |
| 1.2 | Une erreur de collecte rend un état indisponible bloquant | ✅ | `try/catch` → `plan_validation_unavailable` ; câblage ⑥ |
| 1.3 | Identité de surface structurée, préparations liées pour une session | ✅ | `UnsafeViolation.sessionIndex` / `preparationIds` / `memberIds` |
| 1.3 | Pas de `slot` inventé pour une session | ✅ | `output_surfaces_test.ts` ① |
| 1.3 | Préparation partagée → tous ses consommateurs, toutes dates | ✅ | `output_surfaces_test.ts` ② bis |
| 1.3 | Une session dangereuse empêche aperçu ET activation | ✅ | tir `l5b02` : 422, 0 ligne ; câblage ⑤ (le refus précède `completeDraft`) |
| 1.3 | Ne pas consommer une tentative si rien d'adressable ne part | ✅ | garde de périmètre vide ; câblage ⑤ |
| 1.4 | FR accentué / non accentué / EN aux emplacements contrôlés | ✅ | trois cas dans `meal_generation_test.ts` |
| 1.4 | Cas négatif légitime : la négation survit | ✅ | « no peanut goes anywhere near this » reste `clean` |
| 1.4 | Blocage sur déroulé, nom affiché, méthode de préparation, note livrée | ✅ | quatre cas, adresse identifiable à chacun |
| 1.4 | Foyer de 2 puis 4 : tous les consommateurs retrouvés, aucune attribution au maître | ✅ | `output_surfaces_test.ts` ② / ② bis / ② ter |
| 1.4 | Version interne non publiable gardée ; jamais rendue dans une erreur publique | ✅ | `meal_generation_test.ts` (candidate interne) ; câblage ⑦ |
| 1.4 | Violation persistante bloque aussi budget épuisé | ✅ | tir `l5b02` |
| 1.4 | …ou validation échouée | ⚠️ | le chemin existe et est épinglé en source (`plan_validation_unavailable`), **pas forcé au banc** : il faudrait une injection de panne |

### Lot 2 — un patch cohérent, ciblé, applicable

| § | Exigence | État | Preuve |
|---|---|---|---|
| 2.1 | **Les deux** messages corrigés | ✅ | `plan_repair_prompt_wiring_test.ts` ① ② |
| 2.1 | Constructeur dédié, blocs communs explicites, pas de découpe par regex | ✅ | `MEAL_PROMPT_SECTIONS` (21) + `plan_repair_prompt.ts` (13 gardées, 8 écartées avec raison) |
| 2.1 | Un seul schéma dans le système ; périmètre dans l'utilisateur | ✅ | `plan_repair_messages_test.ts`, N=1/2/4 |
| 2.1 | Aucun ordre incompatible réinjecté | ✅ | même fichier, cas « aucun ordre de couvrir toute la période » |
| 2.1 | Contexte des lots partagés préservé | ✅ | projection ③ (ingrédients, états, `ref`, phrase `SHARED`) |
| 2.1 | Motif explicite si le contexte ne tient pas | ✅ | `plan_repair_context_too_large`, avant l'appel |
| 2.2 | Opération `sessions`, version de contrat mise à jour | ✅ | `repair.v2` ; `plan_repair_patch_test.ts` ⑨ |
| 2.2 | Adresses attribuées par le serveur, immuables pendant la tentative | ✅ | `buildRepairSessions` ; `base_version` exigé |
| 2.2 | Ni jour, ni préparations, ni durées, ni création/suppression | ✅ | ⑨ bis |
| 2.2 | Périmètre fait de sessions SEULES accepté | ✅ | ⑨ ; câblage ⑤ ; tirs `l5b01` / `l5b03` |
| 2.2 | Déroulé corrigé dans le plan fusionné, sa source, l'aperçu, les lecteurs | ✅ | ⑨ quinquies ; `relectureLotF.int.test.ts` (plan `quatuor`) |
| 2.2 | Un retour à la meilleure candidate restaure aussi les sessions | ⚠️ | tenu par `structuredClone(c4BestEntry)` + `c4BestSourceText`, **observé au banc** (`l5b02` : la morsure revient au tour suivant), pas épinglé par un test dédié |
| 2.3 | Omission autorisée / opération invalide rejetée / perte structurelle rejetée | ✅ | ⑩, ⑩ bis, ⑩ ter, ⑩ quater, ⑩ quinquies |
| 2.3 | Doublons de préparations et de sessions contrôlés | ✅ | `duplicate_preparation`, `duplicate_session` |
| 2.3 | Préparations lues même sans unité rendue | ✅ | câblage ⑦ ; tir `l4a01` |
| 2.3 | Écho de `base_version` exigé, motifs distincts | ✅ | ② ter / ② quater |
| 2.4 | Refinalisation et contrôles pour TOUS les consommateurs | ✅ | tir `l4a01` (N=4) |
| 2.4 | Un total plus faible n'autorise pas à dégrader une portion conforme | ✅ | `l4a01` : 40 → 37 défauts, **rejetée** (8 portions perdues) ; `plan_repair_decision_test.ts` ⑩ |
| 2.4 | Deux plats dédiés au même créneau restent distingués | ✅ | ⑪ |
| 2.4 | Complément : `complementsShared` préservé, pas deux fois la cible | ⚠️ | le drapeau est posé par le handler et épinglé en source ; **le double comptage n'est pas mesuré** sur un tir |
| 2.4 | Isolation d'un lot : stock déduit une seule fois, courses recalculées | ⚠️ | l'isolation est testée au module (③) ; **le parcours complet d'isolation n'a pas été joué au banc** |

### Lot 3 — prouver le parcours complet

| § | Exigence | État | Preuve |
|---|---|---|---|
| 3.1 | Trois foyers de référence N=1 / N=2 / N=4 | ⚠️ | les ROSTERS existent (1, 2, 4 corps différents) ; **les fixtures de premier jet spécifiées n'existent pas** — voir § 7.1 |
| 3.1 | Grille figée 2 jours × 3 créneaux, 6 / 12 / 24 portions | ❌ | les grilles réelles sont 8 / 14 / 28 cases (fenêtre dérivée de l'horloge, pas choisie) |
| 3.1 | Apport fixe + repas léger sur N=1 ; plat dédié ; contrainte individuelle | ⚠️ | les drapeaux existent (`--apport-fixe`, `--leger=`, `--exclusion=`) et la contrainte médicale est employée ; **ils n'ont pas été combinés dans un foyer de référence figé** |
| 3.1 | Variante membre mineur ou protégé | ❌ | non jouée |
| 3.1 | Variante de présences différentes selon le créneau | ❌ | non jouée |
| 3.1 | Dénominateur = somme des cases demandées, jamais reconstruit des plats | ✅ | `figer-demande.ts` + `analyse-lot-F.ts` refusent une sortie sans demande figée |
| 3.1 | Seul le maître lance | ✅ | tir `l3f01` : 403 `not_owner` |
| 3.2 ① | Premier jet valide N=1/2/4, zéro réparation | ❌ | voir § 7.1 |
| 3.2 ② | Allergène dans une session, N=2 puis N=4 + variante persistante | ✅ | `l5b01`, `l5b03`, `l5b02` |
| 3.2 ③ | Bonne opération + opération mal formée, puis réponse valide | ✅ | `l5b04` |
| 3.2 ④ | Lot commun : amélioration d'un, dégradation d'un autre → rejet | ✅ | `l4a01` |
| 3.2 ④ | Variante isolant une nouvelle préparation → adoption si dépendances valides | ❌ | non jouée au banc |
| 3.2 ⑤ | Portion absente pour un membre, puis complément | ⚠️ | `l4b01` : 8 adresses réservées, 4 compléments, 8 créées ; **l'adoption à N=4 n'est pas obtenue** (la recette-témoin du banc est trop pauvre) |
| 3.2 ⑥ | Budget épuisé + défaut dur → refus, ancien plan intact | ✅ | `l5b02` |
| 3.2 ⑥ | Écart résiduel → politique de livraison, écart visible pour la bonne personne | ⚠️ | `deliverable_with_gaps` + `plan_defects_at_delivery` ; **la visibilité PAR PERSONNE n'est pas vérifiée** |
| 3.2 ⑦ | Lecture API/UI N=2 / N=4, texte corrigé | ✅ | `relectureLotF.int.test.ts`, plan `quatuor` |
| 3.2 ⑦ | Appel par un secondaire refusé avant appel et écriture | ✅ | `l3f01` |
| 3.3 | Rejeu des trois réponses `lot3f` | ✅ | `conforme` ×3, 0 réparation |
| 3.3 | Rejeu du cas `lot3c` connu avec réparation | ✅ | § 3.5 |
| 3.3 | Remesure séparée du rejeu | ✅ | § 3.6, nommée comme telle |
| 3.3 | Trois parcours hybrides N=1 / N=2 / N=4 | ✅ | § 5, cinq appels facturés |
| 3.3 | Mode réel : autorisation explicite, hôtes limités, plafond | ✅ | `--reparation-reelle=<n>`, plafond dans le transport |
| 3.3 | Durée du premier mesurée avant les suivants | ✅ | 94 s, puis les autres |
| 3.4 | Archiver : horloge, demande, premier jet, adresses, messages exacts, réponse brute, rejet/adoption, données écrites | ✅ | `sorties-lot-F/*.json` + `*.prompts.txt` + `appels_reels[].body` |
| 3.4 | Archiver la version/diff du code | ❌ | seul le commit de départ est nommé (§ 0) ; aucun diff figé avec les tirs |
| 3.4 | Publier PAR PERSONNE-DATE-CRÉNEAU : cible et énergie, Gmin/Gmax et grammes, Dmin/Dmax et densité, état des références, présence, protéines | ⚠️ | les **totaux** par tir sont publiés (§ 3.6) ; **le détail case par case ne l'est pas** — il existe dans la sortie de `analyse-lot-F.ts`, il n'est pas recopié ici |
| 3.4 | Compter séparément premier appel, complétion du référentiel, réparations, rejets, durées | ⚠️ | appels réels comptés à part (§ 5) ; **`composition_fill` n'est pas séparé** dans les tableaux |
| 3.4 | Vérifications de code + `agent-gate.sh` | ✅ | § 4 |
| 3.4 | Ne pas modifier les listes de rouges tolérés | ✅ | inchangées (2 vitest, 68 typecheck) |
| 3.4 | Documenter les échecs préexistants | ✅ | § 4 |
| 3.4 | Rapport + `SOCLE.md` + documents de contrat | ✅ | ce fichier, `SOCLE.md`, `mesure.md`, `RESTE-A-FAIRE.md` |

---

## 7. Ce que ce rapport NE prouve pas

### 7.1 Les trois foyers de référence du § 3.1 n'existent pas comme spécifiés

Le plan demandait trois fixtures : N=1 avec **apport fixe explicite et un repas
léger** ; N=2 avec **plat partagé ET plat dédié** plus une contrainte
individuelle ; N=4 avec **lot commun sur plusieurs créneaux, au moins un plat
dédié** et une contrainte individuelle — deux journées pleines, trois créneaux,
**6 / 12 / 24 portions attendues**.

Ce qui existe : les trois ROSTERS (un, deux, quatre corps réellement différents,
posés par les RPC du produit) et une contrainte médicale déclarée. Ce qui
manque : le **premier jet** correspondant. La réponse en conserve du banc est un
plan réel composé pour UNE bouche ; opposée à une table de deux ou quatre elle
ne porte ni plat dédié, ni lot commun pensé pour plusieurs, et ses grilles réelles
sont 8 / 14 / 28 cases — dérivées de l'horloge, pas choisies.

Conséquence directe : **le scénario ① du § 3.2 (« premier jet valide, zéro
réparation ») n'est atteint pour aucune des trois tailles.** Mesuré par
l'instrument : N=1 → 8/8 caloriques et 5/8 complètes ; N=2 → 14/14 et 6/14 ;
N=4 → 7/28 et 4/28. Les plans partent quand même, avec leurs écarts nommés.

⛔ **Et on ne l'a pas fabriqué.** Écrire à la main un plan qui satisfait quatre
contrats serait écrire nous-mêmes la réponse qu'on prétend mesurer. Les trois
rejeux d'archives (§ 3.6) sont la seule chose honnête qu'on ait : des plans
composés POUR la table qu'on leur oppose, et ils sont **complets, 6/6 · 6/6 ·
12/12**.

Restent aussi non jouées : la **variante mineur ou membre protégé** et la
**variante de présences différentes selon le créneau** (§ 3.1).

### 7.2 Cinq cas nommés qui ne sont pas mesurés

- la violation persistante quand **la validation a échoué** (le chemin est
  épinglé en source, pas forcé au banc) ;
- la **variante d'isolement** d'une nouvelle préparation, jouée au module mais
  pas au banc (§ 3.2 ④) ;
- l'**adoption** d'une unité créée à N=4 (§ 3.2 ⑤ — elle est prouvée à N=1) ;
- le **double comptage d'un complément** (`complementsShared` est posé et
  épinglé en source, pas mesuré sur un tir) ;
- l'écart résiduel **visible pour la bonne personne** : la livraison le compte
  par nature, pas par bouche.

### 7.3 Le détail case par case n'est pas recopié dans ce rapport

Le § 3.4 demande de publier, par personne-date-créneau : cible et énergie,
Gmin/Gmax et grammes servis, Dmin/Dmax et densité, état des références,
présence, protéines. Ce rapport publie les **totaux** par tir (§ 3.6). Le détail
existe — `analyse-lot-F.ts` le sort ligne par ligne sur chaque fixture figée de
`scratchpad/2026-09-11-CLOTURE/fixtures/` — il n'est pas recopié ici. De même,
`composition_fill` n'est pas séparé des réparations dans les tableaux, et
**aucun diff de code n'est figé avec les tirs** : seul le commit de départ est
nommé (§ 0).

### 7.4 Ce que le modèle ne sait pas encore faire

À deux et à quatre bouches, sa réparation est **rejetée** : il réécrit tout le
périmètre et retire un repas à quelqu'un. La garde fait son travail ; c'est la
compétence du modèle sur un périmètre large qui manque, et aucune ligne de ce
dépôt ne la répare. Voir § 5.3.

### 7.5 Deux choses qui ne bougeront pas d'ici

- **La couverture française du matcher d'allergène.** `allergen_ref='peanut'` ne
  mord pas sur « beurre de cacahuète » ; elle mord sur « peanut butter ». Les
  tirs de sécurité emploient donc le terme anglais. C'est le lexique de
  `allergen_surface_forms.ts`, nommé depuis le 2026-09-12.
- **Le goût.** Aucun plat n'a été cuisiné.

## 8. Fichiers

**Créés :** `_shared/keel/output_surfaces.ts`, `output_surfaces_test.ts`,
`output_lock_wiring_test.ts`, `plan_repair_prompt.ts`,
`plan_repair_prompt_test.ts`, `plan_repair_prompt_wiring_test.ts`,
`meal_prompt_sections_test.ts`, et ce rapport.

**Modifiés (cœur) :** `meal_generation.ts` (sections nommées, recensement,
`UnsafeViolation`), `plan_repair_unit.ts` (table des sessions),
`plan_repair_context.ts` (`sessionIds`, projection des déroulés,
`cooking_sessions` dans la forme du plan), `plan_repair_patch.ts` (contrat v2,
atomicité, écho de version, sessions), `plan_repair_loop.ts` (`sessionIndex`),
`plan_defect_pass.ts`, `generate-household-meal-v1/index.ts`.

**Créés (suite) :** `plan_repair_messages_test.ts` — les DEUX messages d'une
réparation, composés et comparés à 1, 2 et 4 bouches (14 cas).

**Banc :** `banc-lot-F.ts` — `--bouches=N` (jusqu'à quatre corps différents),
`--allergene-deroule`, `--allergene-session=`, `--patch-session-seul`,
`--deroule-persiste`, `--patch-casse=<tour>`, `--patch-pot=<facteur>`,
`--reparation-reelle=<n>` ; correction du journal du crochet.
`transport-lot-F.ts` — sortie réelle bornée (`realTurns`, `realCap`), réponses
brutes archivées, compte des appels facturés.

**Front :** `__fixtures__/lot-f-plans.json` (plan `quatuor`),
`relectureLotF.int.test.ts` (quatre bouches, contenants nommés, déroulé réparé).

**Preuves :** sorties du banc dans
`scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/` (prompts entiers sous
`*.prompts.txt`, réponses réelles sous `appels_reels[].body`), demandes figées
et mesures dans `scratchpad/2026-09-11-CLOTURE/fixtures/`.
