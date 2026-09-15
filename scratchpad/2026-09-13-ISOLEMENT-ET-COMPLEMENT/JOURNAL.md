# § 2.1 ISOLEMENT · § 2.2 COMPLÉMENT — journal du 2026-09-13

Zéro appel fournisseur facturé. Les onze tirs de banc sont en conserve
(`--reponse=`), la clé est remplacée par la sentinelle
`sk-lotf-transport-controle-aucune-depense`, et chaque sortie porte
`appels fournisseur RÉELS (facturés) : 0`.

## La fixture, déclarée comme telle

`batir-ref4-partage.ts` fabrique un plan NU à quatre bouches où **un seul lot**
(`prep_tofu_table`, six parts) nourrit **quatre personnes sur deux repas** :
la table y puise au déjeuner et au dîner des deux jours, et Lea — la bouche
végane à plat DÉDIÉ — y puise pour ses deux déjeuners.

Elle est mesurée par les lecteurs de production (`dishEnergy`,
`weighedReadyGrams`, `proteinOfUnit`, `foldPreparationsIntoDishes`) contre les
contrats que `slot_nutrition_contract.ts` calcule pour LE compte qui la reçoit,
puis **validée par le moteur** avant toute injection :

| compte | plan écrit | porte finale | grille | réparations |
|---|---|---|---|---:|
| `iso3` (lot commun, dîner séparé) | `409ebbf9` | ok=true · refus 0 · conforme | **24/24 · 24/24** | 0 / 2 |
| `iso9` (dîner commun aux quatre) | `f28c0ab2` | ok=true · refus 0 · conforme | **24/24 · 24/24** | 0 / 2 |

Les références servies aux tirs de défaut sont **byte-identiques** aux
références validées, identifiants de bouche mis à part (`diff` après masquage
des UUID). Empreintes dans `EMPREINTES-REFERENCES.txt`.

⛔ Une référence par compte, et ce n'est pas un confort : un plat dédié porte
`for_member_id`, donc un identifiant de CE foyer.

## § 2.1 — l'isolement, jusqu'à l'adoption

Défaut injecté : **90 g de graines de courge dans le seul déjeuner de Lea**
(`--ligne=mon/lunch#1=pumpkin_seeds:90,tue/lunch#1=pumpkin_seeds:90`). Son
assiette devient trop dense : 220 g servis pour un plancher de 225.

Réponse du banc : `--patch-isoler --patch-isoler-ligne=tofu:1500,pumpkin_seeds:30`
— une casserole NEUVE `prep_tofu_table_iso` (2 parts, `cook_on=mon`), les deux
unités de Lea repointées dessus, et l'ancien lot réécrit à 4 parts avec ses
ingrédients au prorata (part par prélèvement inchangée).

Résultat (`iso11`, plan `f8e7856c`) : verdict **adopt**, 6 défauts → 0, porte
finale ok=true · refus 0 · conforme, **24/24 · 24/24**, 1 réparation sur 2.

## § 2.2 — le complément, et les deux murs

Défaut injecté : **40 g d'huile d'olive dans le dîner commun**
(`--ligne=mon/dinner#0=olive_oil:40,tue/dinner#0=olive_oil:40`). Seule Lea
tombe sous son plancher de masse ; les trois autres restent dans leurs bornes.

Réponse du banc : `--patch-complement=courgette:150`.

Résultat (`iso10`, plan `d1b0036e`) : verdict **adopt**, 6 défauts → 4,
`complement {solved: 2, clamped_min: 2, moved_kcal: 4}`. Lea garde 216 g du plat
commun et reçoit 9 g de complément ; Paul, Nils et Iris gardent **exactement**
leurs 343 / 573 / 382 g.

⛔ **Deux murs mesurés avant d'y arriver**, et ils sont dans le produit :

1. **Le porteur de plat.** Une bouche BLOQUÉE qui n'est pas dans
   `dishBearerIds` reçoit une consigne qui lui promet un plat à son nom, et
   `parseGeneratedMeal` jette ensuite son `for_member_id`. Le complément
   devient un quatrième plat de table, tout le monde mange en trop, la
   candidate est refusée (`iso6` : 6 défauts → 36, `safety_regression`).
2. **Le plat partagé introuvable.** Le complément cherche le plat de la table
   que son porteur mange encore — `(p.dish.memberId ?? null) === null`. Une
   bouche qui a SON plat à ce moment-là n'en a pas : `no_shared_dish`, le
   complément est retiré (`iso7`/`iso8`).

Les deux conditions ne se rencontrent que pour une bouche **porteuse de plat
ailleurs** et **mangeant la table à ce moment-là** — d'où le dîner commun aux
quatre dans la référence `iso9`/`iso10`.

## Les trois défauts de production fermés

| défaut | mesuré sur | correctif |
|---|---|---|
| une unité **créée** remplaçait le plat qu'elle devait compléter dans le texte source (`dishes_replaced: 2, dishes_added: 0`) alors que le plan structuré l'AJOUTAIT | `iso7` | `fusedSourceText` : `dishIndex === null ⇒ toujours pousser` |
| un lot **neuf** n'entrait dans aucune session (`preparation_without_session`, que rien ne répare) | raisonné puis épinglé | `applyRepairPatch` rattache le lot neuf à la session de son `cook_on`, et refuse `new_preparation_unscheduled` sinon ; un lot retiré sort des sessions |
| la consigne exigeait un `cook_on` « couvert par une session » sans jamais dire quels jours | lecture | `planProjection` nomme les jours sous la casserole partagée |

## Ce que le banc a gagné

- `--ligne=<jour>/<slot>#<rang>=<ref>:<g>` — un écart sur UNE case, achat compris ;
- `--patch-isoler` + `--patch-isoler-ligne=<ref>:<g>` — le fork d'une casserole partagée ;
- `--patch-complement=<ref>:<g>` — le petit plat en plus ;
- `RE_UNITE` corrigée : elle ne voyait **aucun plat dédié** (`mon/lunch (uuid) "titre"`).

## Reliquats nommés

- `portion_boundary` **relève** la part commune rabotée par le complément
  (`raised: 2, grams_raised: 14`) : l'assiette écrite fait 225 + 9 g et porte
  563,6 kcal pour une cible de 542,85 (+3,8 %). Le partage avait décidé 216 + 9.
- `analyse-lot-F.ts` n'indexe **qu'un contenant** par personne-date-créneau :
  sur une case complétée il lit le complément seul (2 kcal) et déclare la case
  non conforme. Le plan écrit, lui, porte bien les deux boîtes.
- `scratchpad/2026-09-11-CLOTURE/fixtures/lot2-ref4-contrats.json` a été réécrit
  par `preparer-ref4.sh iso1` (il décrit maintenant `iso1`). Copie dans
  `lot-iso1-contrats.json`. Le fichier n'est pas suivi par git.
