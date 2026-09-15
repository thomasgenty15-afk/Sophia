# Clôture du parcours foyer — 2026-09-14

**Une page. Chaque exigence, sa preuve.** Le détail est dans
[`RAPPORT-FERMETURE-DEFAUTS-FOYER-2026-09-14.md`](RAPPORT-FERMETURE-DEFAUTS-FOYER-2026-09-14.md).

> ⛔ **Correctifs vérifiés hors ligne. Zéro appel fournisseur payé.**
> Un rejeu de réponse réelle prouve le traitement **de cette réponse** ; une
> réponse synthétique prouve **un chemin technique** ; ni l'un ni l'autre ne
> prouve qu'un nouveau prompt améliore les futurs premiers jets.

## Lot 1 — la réparation, corrigée à partir des deux réponses payées

| Exigence | État | Preuve |
|---|---|---|
| § 1.1 figer entrées, prompts, réponses, avec empreintes | ✅ | `scratchpad/2026-09-13-ATTRIBUTION/EMPREINTES.txt` · `a-reponses-reelles/` (brut, non modifié) · `b-patches-mains/` **vide** |
| § 1.1 distinguer l'échec d'adresse de l'échec après fusion | ✅ | `journaux/` : `payload_dropped / ambiguous_address` vs `safety_regression` |
| § 1.1 rejeu par le vrai parseur, fusion, finalisation | ✅ | `--rejouer-tour=<n>:<sortie>` — ⚠️ le crochet du banc écrasait la réponse : **corrigé**, sans quoi le rejeu ne rejouait pas le modèle |
| § 1.2 le premier calcul fautif | ✅ | `index.ts:12068` `dejaDemande` — `stuck_dishes: 0`, `fresh_frozen: 0`, et pourtant `residual_stuck == residual_eaters` |
| § 1.2 localiser la disparition des 6 et des 9 repas | ✅ | 3 et 4 bouches-cases **distinctes** (double compte `gate` + `upstream`) ; N=2 `for_member_id` jeté au parseur ; N=4 cases **jamais touchées par le patch** |
| § 1.2 détailler `safety_added` | ✅ | **aucun allergène** : `mouth_unfed` en `severity: refuse` |
| § 1.3 une décision cohérente par unité partagée | ✅ | complément réservé seulement si rien n'est réécrivable **ou** couloirs sans intersection (`mergeCorridors`) |
| § 1.3 ne pas supprimer toutes les créations | ✅ | `--sans-portion=mon/lunch` ⇒ `reserved: 2`, `created: [U3, U4]` |
| Acceptation : rapport antérieur corrigé | ✅ | `RAPPORT-RESTE-A-FERMER…` § 9 + 4 passages amendés |

## Lot 2 — les défauts fonctionnels

| Exigence | État | Preuve |
|---|---|---|
| § 2.1 `applySizing` sert une part de recette | ✅ | `portion_sizing.ts:1824` ; chemin nominal identique **au gramme** |
| § 2.1 titulaire sans date de naissance, par fixture du handler | ✅ | `--sans-naissance=1` **acceptait le rang 1 sans jamais le consulter** — un drapeau qui n'armait rien, d'où le « impossible » précédent. Tir `sna1` : **200**, 6 contenants, `recipe_shares_by {age_unknown: 6}`, `fed 6/6`, `0/0 jugeables · SANS OBJET 10`, aucune cible au modèle (`protein_brief named:0`), aucun chiffre dans les notes ni l'explication |
| § 2.1 contre-cas : recette illisible, recette dangereuse | ✅ | `cell_without_portion` ⇒ **422 sans écriture** ; arachide ⇒ `output_lock:3` dont **`box_item`** — le verrou mord sur la boîte que la part vient d'autorer |
| § 2.2 une seule décision de qui reçoit quel plat | ✅ | `household_cells.ts` ; `dishBearingMembers` en est la projection |
| § 2.2 enseigné · parsé · conservé · **servi** | ✅ | N=2 : jambon 150 g / **37,1 g** de protéines chez l'omnivore, tofu 150 g / **29,6 g** chez la végane, **zéro jambon dans sa boîte** |
| § 2.2 le partage PAR BOÎTE sous `portion_v1` | ❌ | **non fermé, mesuré** : le composant disparaît, ou atterrit dans **toutes** les boîtes. La ceinture le refuse (422) — aucune assiette fausse servie |
| § 2.3 même contrat protéique banc / produit | ✅ | Lea **116 → 93 g/jour** ; recoupé sur le prompt archivé (« at least 23 g … 33 g ») |
| § 2.4 les bornes portent sur le repas ENTIER | ✅ | `raised: 2, grams_raised: 14` → **0** ; 234 g/563,6 kcal → **227 g/547,4 kcal** ; écart **+3,82 % → +0,83 %** |

⛔ **Un chiffre a baissé, et c'est le bon** : Lea passe de `complète 6/6` à **4/6**.
Sa conformité d'avant était **achetée en servant 4 % de trop**.

## Lot 3 — la preuve, sans dépense

| Exigence | État | Preuve |
|---|---|---|
| matrice sur le vrai handler, écritures capturées | ✅ | 13 cas + 2 pour la ligne E, **rejoués après le § 2.2** · `scratchpad/2026-09-14-MATRICE-REJOUEE/journaux/` |
| ligne E : variante de régime, **montée pour de bon** | ✅ | N=2 végane+omnivore : **200 conforme · 12/12 · 12/12** ; œufs et poulet chez Max, **zéro** dans la boîte de Lea ; casserole commune 1 429 → **497 g** ; les trois boîtes de Lea **identiques au gramme** avant/après. N=4 présences variables : **200 · 20/20 · 16/20** |
| panne de validation ⇒ **zéro publication** | ✅ | H1 : **422**, `plans avant 3 · après 3` |
| distincte d'une panne de journalisation | ✅ | H2 : **200**, `plans avant 3 · après 4`, `output_lock_journal_failed` |
| point d'injection sans drapeau de production | ✅ | paramètre **requis** `validate` de `plan_publication.ts` + carte d'import ; aucun fichier de production touché |
| deux validations réelles **préparées, non lancées** | ✅ | § 6 du rapport détaillé : 1 appel chacune, plafond **2**, références déjà figées |

## Ce qui reste ouvert, nommé

1. Le partage **par boîte** d'un plat partagé sous `portion_v1`.
2. L'arrondi par item : 218 g là où le partage décide 216 ⇒ densité 241,1 pour un
   plafond **entier** de 241 (couloir exact 241,27).
3. `goalApplies` n'a **aucun appelant** dans le handler, alors que deux
   commentaires de production affirment le contraire.
4. `output_lock_journal_failed` n'atteint pas `generated_from.issues`.
5. `repairabilityOf` : un seul dissident gèle un composant — écarté comme cause,
   **non tranché** comme règle.
6. **Un plat dédié réclamé et adressé à la mauvaise bouche n'est plus servi à
   personne.** `asked: 12 · attributed: 0` : la consigne promet un plat à Nils et
   Iris, le modèle l'adresse à Lea, le plat tombe — **et rien ne refuse cet
   écart**. Il ne se lit que dans `dish_owners`. Défaut d'adhérence du modèle ou
   de la consigne, pas du parseur.
7. **Deux plats de table nus sur une même case** produisent le même `double` et
   rien ne les retire. L'ordre inverse (dédié écrit **avant** la table) n'est pas
   gardé non plus — non mesuré, les 13 réponses archivées écrivent la table
   d'abord.
8. **Une bouche déclarée impossible à nourrir depuis la casserole commune peut
   n'avoir aucun plat à elle, et le plan sort `conforme`.** `swap.flagrant`
   compte sans refuser.
9. **Un couloir de densité impossible est transmis, et le plan publié.** Nils
   porte 4 099 kcal sur deux repas sous un plafond de 700 g : il faudrait
   312 kcal/100 g, le couloir transmis est le **point unique 250**. Le produit
   sert 312 et écrit `conforme`, sans refus ni note — et une boîte finit à **1 g
   de couscous** dans un plat qui s'appelle « poulet rôti, couscous complet et
   courgette ».
10. **Retirer deux bouches d'une casserole partagée réécrit les grammes des
    restants** de −3,5 % à +2 %. Pas incompatible, pas invariant non plus.
11. **La casserole n'est pas redimensionnée après le rabotage du plafond de
    masse.** Mesuré sur le tir `sna1` : `portion_boundary` rabote
   `shaved: 4 · grams_shaved: 276`, et `pot_attribution` passe de **1** (témoin,
   âge connu) à **0,85** — 1 516 g prélevés pour 1 793 g attribués, soit
   **277 g achetés et cuisinés, non servis**. `pot_shrink` tourne et ne rétrécit
   rien. ⚠️ **Ce n'est pas propre au cas sans cible** : c'est général, invisible
   quand le facteur ramène déjà l'assiette sous le plafond. Le corriger touche
   la liste de courses et l'énergie.

## Le défaut trouvé par la matrice, et fermé

⛔ `meal_generation.ts:8945` **promettait l'inverse de ce qu'il faisait** :

> « UN `for_member_id` REFUSÉ NE REJETTE JAMAIS LE PLAT … **jamais une raison de
> retirer un dîner à quelqu'un.** »

Mesuré : l'attribution tombait, le plat restait — mais la case **portait déjà**
le plat de la table. Le plat dédié devenait un **second plat de table**, chaque
bouche de la case était nourrie deux fois, et la porte refusait
`mouth_unfed / double`. **Six tirs sur treize** passaient de `200 conforme` à
**422 sans écriture**. Un seul `for_member_id` erroné du modèle suffisait.

**Tranché : le plat tombe** quand la case porte déjà un plat de table — il n'est
le dîner de personne, et ce qui disparaît est le doublon. La promesse est
réécrite pour dire ce que le code fait. **Le cas qui passe reste le cas
ordinaire** : sans plat de table sur la case, le plat refusé **devient** ce plat
de table.

| tir | avant | après |
|---|---|---|
| `A4` · `F` · `D` · `B4b` · `I1` | **422**, 16 à 24 × `double` | **200** |
| `A2` (contrôle, déjà 200) | 200 | 200, `refused_dropped: 0` |

⛔ **La preuve n'est pas le 200.** Comptage indépendant, lu **en base** sur trois
des plans réparés : **24 cases bouche×créneau, exactement 1 contenant chacune,
0 doublon**. Sur le cas dangereux, l'arachide injectée est **absente du plan
livré**. Et `mouth_unfed` n'est pas désarmé : une absence réelle est toujours
détectée, réparée, et sous mutation le 422 revient sans écriture.

**Et un compteur mentait.** `box_counts.meals_delivered` rendait `fed 24/24 ·
double 0` pendant que le corps 422 listait **16** cases `double`, sur le **même
run**. Il relisait un souvenir figé ~3 000 lignes avant que les contenants ne
soient autorés — donc « un plat de table sans boîte nourrit tout le monde ». Il
se relit désormais sur l'état qui part, avec un témoin `measured`.

## Vérifications

| Commande | Résultat |
|---|---|
| `deno test --allow-all supabase/functions/_shared/keel/` | **7 249 passés · 0 échoué · 2 ignorés** |
| `deno test --allow-all scripts/2026-09-11-mesure-grille_test.ts` | **50 passés · 0 échoué** |
| `deno check` du handler | passe |
| `scripts/agent-gate.sh` | **pass** — vitest 2 611, 2 rouges **tolérés**, 0 hors liste ; typecheck 67 / 68 |

Les six fixtures figées n'ont pas bougé. **Coût du chantier : zéro appel
fournisseur**, sur une cinquantaine de tirs.
