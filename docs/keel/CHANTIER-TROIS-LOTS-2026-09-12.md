# Fiabiliser la génération et les réparations — rapport des trois lots

2026-09-12. Chantier ouvert sur la [revue de clôture C6](REVUE-CLOTURE-C6-2026-09-12.md).
Rien n'est commité, rien n'est déployé, les deux migrations en attente n'ont pas été
poussées. Les résultats ci-dessous sont **locaux** et ne disent rien de la production.

---

## 0. Le verdict en six lignes

| | C6 (2026-09-11) | ce chantier (2026-09-12) |
|---|---:|---:|
| plans livrés | 4 / 6 | **6 / 6** |
| plans sans écart mesuré | — | **5 / 6** |
| tirs sans réparation modèle | 1 / 6 | **5 / 6** |
| tirs sous le plafond hébergé (150 s) | 1 / 6 | **5 / 6** |
| réparations de plan sur un tir | jusqu'à 2 | **1 au maximum** |
| cases en conformité complète | non mesuré à ce dénominateur | **43 / 43** |

Les deux refus du C6 n'existent plus, et **aucun n'a été fermé en assouplissant une
garde** : le premier était un faux positif d'identité, le second un vrai oubli du
modèle que le moteur calcule désormais lui-même.

---

## 1. Lot 1 — les courses se produisent depuis les recettes

**Le modèle n'écrit plus `shopping_list`.** La clé est retirée du schéma de sortie du
prompt ; sa **lecture** reste, pour les plans écrits avant ce lot. Chaque ligne est
produite depuis les ingrédients finaux arrondis et les lots réellement cuisinés.

### Ce que ça ferme

Les deux tirs refusés du C6 portaient tous les deux sur un achat :

- **tir 1, « champignons de Paris »** — la ligne ÉTAIT sur la liste, au caractère près.
  Deux lecteurs se contredisaient. Rejoué gratuitement sur l'archive : `model_omitted: 0`,
  zéro refus, **200**. C6 avait raison, et le faux positif est mort avec sa cause.
- **tir 3, « blancs d'œuf »** — vrai oubli. La ligne est **produite**, l'omission reste
  **nommée** (`omitted_terms: ["blancs d'œuf"]`), et le plan sort en **200 sans aucun
  appel de réparation**. Le refus disparaît sans que le signal disparaisse : c'est
  exactement ce que la revue exigeait (§ 5, « ni tout refuser ni masquer le manque »).

### Les arbitrages

- **Les blancs d'œuf ne sont pas des œufs.** `egg_white` existe au référentiel à 33 g
  pièce : les blancs sortent sur leur propre ligne, et la ligne « œufs » redescend au
  nombre d'œufs entiers réellement cuits. Aucune équivalence inventée ; une conversion
  inconnue reste comptée comme non vérifiée.
- **Un cinquième sort : le regroupement.** « citron » et « citrons » recevaient *chacun*
  la totalité du besoin — six citrons au panier pour trois dans la recette.
- **Le rayon vient du groupe du référentiel**, table fermée et exhaustive par le type.
  *Conséquence à connaître* : `PERISHABLE_AISLES` suit maintenant le référentiel et non
  la devinette du modèle. Voir le défaut n° 2 du § 4.
- **La frontière d'arrondi répare complètement ou pas du tout.** Le 631 g pour une borne
  de 630 rentre. Jamais en dessous de 1 g, jamais au-delà de ce que la casserole produit,
  jamais à la hausse sur le frais d'un plat — ce serait servir un aliment absent de la
  recette. Une assiette qu'on ne peut pas ramener entière n'est pas touchée, **et se
  compte**.
- **Le garde-manger ne déduit que ce qu'il sait.** Une présence sans quantité laisse le
  besoin entier avec « stock à vérifier ». Aucun écran ne remplit ce champ aujourd'hui ;
  la déduction est branchée et son compteur dit laquelle des deux situations on est.

---

## 2. Lot 2 — la réparation reçoit le plan, et les deux tentatives servent

### Le plan part avec la consigne

`gemini.ts` n'envoie ni historique ni `previous_response_id` : **ce qui n'est pas dans le
message n'existe pas.** La réparation appelait `householdUserMessage(instruction)`,
c'est-à-dire le brief *initial* plus une phrase. Mesuré sur les archives : **0 titre sur
9 conservé**, 2 identifiants de casserole sur 5.

Le message porte maintenant une **projection compacte** : l'identité de tous les plats
(jour, moment, titre, identifiants de casserole) et les ingrédients chiffrés des seules
cases visées.

> **Arbitrage assumé.** Le JSON du premier jet fait ~29 000 caractères, et cinq des six
> tirs du C6 dépassaient déjà les 150 s : recoller le plan entier doublait l'entrée d'un
> appel qui frôle la coupure, *et* rendre un plan entier fait réécrire un plan entier.

### La fusion remplace l'adoption

`meal = candidate` prenait le plan entier du modèle. On part maintenant du **meilleur
plan** et on ne recopie que les cases autorisées par `repairScopeOf`. « Garde tout le
reste identique » n'est pas une garde, c'est un souhait ; la garde, c'est de ne recopier
que ce qu'on a autorisé.

### Un rejet ne ferme plus la boucle

`c4Stop = true` était posé au premier rejet : les tirs 1 et 3 du C6 ont fait **une seule**
réparation, l'ont vue rejetée, et ont été refusés **sans avoir épuisé leur budget**.
`repairRoundOutcome` réévalue maintenant budget et temps, et quand il s'arrête, il dit
pourquoi.

**Vu sur un vrai tir** (tir 4 de la campagne interrompue) : première candidate
**adoptée**, seconde **rejetée** (`no_improvement`), puis `calls_exhausted`. Le plafond
de deux appels réels n'a jamais été dépassé sur aucun tir.

### Le défaut dit sa vraie nature

`energy_off` et `bounds_off` rendaient le **même** code. Preuve au C6 : le prompt du tir 4
demandait de corriger « sun/breakfast : 0 % contre 728 kcal visées » — zéro pour cent —
alors que le vrai défaut était la densité. Nouvelle cause `cell_bounds_off`, et chaque
défaut transporte sa mesure et sa cible.

### Le contrat de chaque assiette part avant la composition

Énergie visée, bornes de grammes, couloir et densité visée, plancher protéique — écrit
par `slotContractSentence`, avec en toutes lettres que le plancher **est un plancher et
pas un score à battre** (la revue avait mesuré 276–292 g servis pour un plancher de 176).

Coût mesuré : **+1 923 caractères** sur un prompt de 26 269. `silent: 0` sur les six
tirs — aucune case muette.

### « Pas vérifié » n'est plus « vérifié sans écart »

Quand la garde finale jetait, le plan partait **activé** avec `validation: null`. Il est
maintenant refusé sous un motif **technique distinct** (`plan_validation_unavailable`,
avec sa phrase à l'écran dans les deux langues) : l'ancien plan reste, et on n'accuse pas
la composition d'une exception de notre code.

### Ce qui bloque, désormais

Neuf causes, **toutes sécurité ou livraison** : allergène, exclusion médicale, règle de
maison, régime, repas mangé avant d'être cuisiné ou trop tard, bouche non nourrie, case
sans plat, case sans portion. **Aucune cause de qualité** — énergie, densité, protéine,
achat, date de courses — n'est armée. Un test l'épingle nommément, dans les deux sens.

---

## 3. Lot 3 — la campagne, et ce qu'elle a trouvé

### Les six tirs réels, séquentiels, fenêtre de 3 jours

| tir | scénario | statut | durée | appels (init/rép/aux) | courses | validation | écarts |
|---|---|---:|---:|---:|---:|---|---:|
| 1 | PERTE · fenêtre partielle le 1er jour | 200 | 110,2 s | 1/0/0 | 19 | conforme | 0 |
| 2 | GAIN · même fenêtre et même rythme | 200 | 191,2 s ⚠️ | 1/1/1 | 23 | livrable avec écarts | 1 |
| 3 | PERTE · grand appétit | 200 | 109,1 s | 1/0/0 | 22 | conforme | 0 |
| 4 | GAIN · petit appétit | 200 | 137,9 s | 1/0/0 | 21 | conforme | 0 |
| 5 | PERTE · repas léger + apport fixe | 200 | 111,3 s | 1/0/0 | 18 | conforme | 0 |
| 6 | DEUX BOUCHES · préparation partagée · allergie réelle | 200 | 99,3 s | 1/0/0 | 23 | conforme | 0 |

⚠️ = au-dessus du plafond hébergé de 150 000 ms. L'unique écart du tir 2 est
`session_day_mismatch`, non bloquant.

### Ce qui est mesuré

- **Conformité complète : 43 / 43 cases** — plat + portion + calories + masse + densité,
  aucune abstention. Le tir 6 compte ses **deux** bouches (7 + 7).
- **Masse** : toutes les assiettes dans leurs bornes, sur les deux bouches du foyer.
- **Densité** : toutes les assiettes dans leur couloir.
- **Protéines** : plancher couvert atteint partout où un plancher s'applique.
- **Courses** : zéro besoin sans ligne, **zéro ligne sans date d'achat**, sur les six.
- **Appels fournisseur** : 6 générations, **1 réparation de plan au total**, 1 appel
  auxiliaire (`composition_fill`). Jamais de troisième appel.

### La preuve que le contrat transmis est bien celui qui est calculé

**43 lignes de contrat sur 43 retrouvées au caractère dans les prompts archivés**, par une
sonde qui rend la phrase attendue avec la **fonction de production** (`slotContractSentence`)
et la cherche dans le message réellement envoyé. Le lot 0 avait classé « les couloirs
extraits par regex sur le prompt » parmi les cinq fautes de mesure à ne pas refaire ; cette
sonde n'en est pas une.

### Les trois défauts que la campagne a trouvés — et qui étaient à moi

**① Le thon en conserve a refusé un plan.** `food_composition_refs` n'a **aucune colonne de
conservation** : `tuna_fresh` et `tuna_tinned` y portent le même `white_fish`. En dérivant
le rayon du groupe (lot 1), la conserve est partie au rayon `protein`, a été déclarée
périssable, et la garde a refusé avec une phrase fausse — une boîte de thon se garde des
années. Avant ce chantier, c'est le **modèle** qui écrivait `aisle: "pantry"`, et il avait
raison. Correctif : `SHELF_STABLE_SLUGS`, une **énumération** (pas un motif sur le slug —
ce dépôt a mesuré 12 faux positifs sur 12 avec un matcher maison). Ils sont **deux** dans
tout le référentiel. Le vrai correctif est dans `RESTE-A-FAIRE.md`.

Et la cause est passée en `count` **pour une raison qui lui est propre** : `buy_on` n'est
pas écrit par le modèle, il est **calculé par nous**. La garde refusait le plan de
quelqu'un pour une date que nous avions choisie.

**② La liste arrivait trop tard pour tout ce qui la lit.** La datation des vagues,
`describeWrittenWaves`, le geste du congélateur et `shoppingDays` — qui nourrit la **prose
du plan** — tournent ~1 700 lignes avant la reconstruction. Ils lisaient un tableau vide :
`shopping_waves: 0 (none)` sur les quatre premiers tirs. Les dates finissaient bien sur les
lignes, mais l'explication que la personne lit avait perdu son jour de courses. La liste
est maintenant **semée là où celle du modèle arrivait**.

**③ `shopping_model_omitted` avait cessé de mesurer.** Il comptait 24 sur un plan de 24
lignes : il mesurait « on ne l'a pas demandé au modèle », pas « le modèle a oublié ». Il ne
compte plus que si une liste existait.

### Le garde-fou du harnais s'est trompé, puis a été réparé

La relecture des déclarations (rythme, apport fixe) appelait `keel_household_roster_for`
avec le jeton de la personne — cette fonction prend un identifiant d'utilisateur arbitraire
et n'est accordée qu'au service, **ce qui est juste**. Elle recevait un **403** et le lisait
comme « la déclaration est absente ». Elle a arrêté un tir en accusant une écriture
parfaitement arrivée. Elle distingue maintenant « pas mesuré » de « mesuré, et c'est faux » —
la faute exacte qu'elle existait pour empêcher, commise sur elle-même.

Une fois réparée, elle prouve ce que la revue réclamait : le rythme du tir 5 revient du
roster **avec ses tailles** (`lunch: small`), les 200 g de yaourt sont dans la source
canonique, et le journal du moteur confirme `fixed_intakes: intakes: 1, dropped: 0`.

---

## 4. Le mur qui reste, et il n'est pas dans notre code

| | total | appel modèle | **notre moteur** |
|---|---:|---:|---:|
| C6 tir 1 | 197,9 s | 196,8 s | **1,13 s** |
| C6 tir 2 | 92,6 s | 91,8 s | **0,86 s** |
| C6 tir 3 | 218,5 s | 218,2 s | **0,34 s** |
| C6 tir 4 | 256,7 s | 255,7 s | **0,99 s** |
| C6 tir 5 | 301,6 s | 300,5 s | **1,04 s** |
| C6 tir 6 | 186,9 s | 185,8 s | **1,10 s** |

**99,4 à 99,7 % de chaque tir est le fournisseur.** Tout notre calcul tient dans une
seconde.

Le scénario du tir 2 a été mesuré à **92,6 s**, **311,5 s** et **191,2 s** sur trois jours,
sur une demande identique — et une fois **tué à 289,2 s** par la durée de vie de l'isolat
edge (`wall clock duration reached`, génération encore en vol ; rien écrit, rien bloqué).

Aucune optimisation de notre côté ne referme cet écart. C'est une question de latence
fournisseur, et elle est instable sur le même chemin.

---

## 5. Les critères de clôture du chantier, un par un

| critère | verdict |
|---|---|
| six plans sûrs et complets sur six scénarios | ✅ 6/6 |
| tolérances ±10 % par créneau et ±5 % par journée couverte | ✅ 43/43 cases |
| bornes de masse, couloirs de densité, planchers protéiques | ✅ partout où applicable |
| aucun ingrédient nécessaire oublié | ✅ `needs_unbought: 0` sur les six |
| au moins 4 tirs sur 6 sans réparation modèle | ✅ **5/6** |
| aucun troisième appel de réparation | ✅ 1 au maximum |
| aucune régression de sécurité | ✅ voir la réserve ci-dessous |
| tests ciblés et compilation | ✅ voir § 6 |

---

## 6. Vérification

- `deno test --allow-all supabase/functions/_shared/keel/` → **6 904 passés, 0 échec, 2 ignorés**
- `deno check supabase/functions/generate-household-meal-v1/index.ts` → **0**
- instrument de mesure → **42 passés, 0 échec**
- frontend `tsc -b --force` → **0**
- `vitest run` → **2 575 passés**, 2 échecs **pré-existants** d'une session voisine
  (`mouthProfileReaders.int.test.ts` attend un `<ActivitySessionsCard>` retiré ailleurs ;
  `energyBasis.int.test.ts` a un inventaire clos à 16 clés et en trouve 21). Aucun des deux
  ne touche une surface de ce chantier.
- `npm run build` → vert
- relecture UI → **9 tests**, sur une fixture **regénérée depuis la campagne réelle de ce
  jour**, qui garde en plus un plan du 2026-09-11 pour prouver qu'un plan ancien reste
  lisible.

---

## 7. Ce qui n'est PAS prouvé

- **Le goût.** Aucun plat n'a été cuisiné. Ce rapport compare des nombres à des nombres.
- **La ceinture d'exclusion n'a rien eu à mordre.** Sur le tir 6, l'allergie à l'arachide
  est bien transmise (vérifiée dans le prompt, `severity=medical`, en tête du message, sur
  les deux libellés) et **zéro arachide** n'apparaît dans le plan écrit. Mais
  `exclusion_belt` a contrôlé **zéro bouche** : le modèle a obéi, donc la ceinture n'a pas
  été exercée. Son exercice reste au banc contrôlé, pas dans cette campagne.
- **Trois contrôles incomplets sur la seconde bouche du tir 6** : elle n'a **aucun objectif
  déclaré**, donc aucun plancher protéique ne s'applique. Ce n'est pas « zéro gramme
  exigé », c'est « rien à exiger ».
- **La production.** Rien n'est déployé ; les deux migrations (`20260911040000`,
  `20260912090000`) sont appliquées **en local seulement**. Leur `db push` est un geste
  humain.
- **Le point 5 du lot 2 n'est fait qu'à moitié.** La décision de réparation est unique et
  la sécurité a son chemin propre, mais cinq rattrapages d'amont consomment encore le
  budget avant que tous les défauts soient connus. `plan_budget.ts` documente lui-même
  pourquoi : une décision prise au site de la protéine ne peut pas savoir si la densité
  aura besoin d'un créneau. Le vrai correctif est le refactor du générateur.
- **Le verrou médical** rend encore les six plats indisponibles pour une injection sur un
  seul plat. Le périmètre livré désigne bien une seule case, mais ça n'aura d'effet que
  quand le verrou cessera de tout effacer.
- **Une dette de front** : `cell_bounds_off` devrait entrer dans `CALORIE_PROTECTED_CAUSES`
  des deux côtés à la fois. Elle vaut `count`, donc n'atteint jamais le corps 422 — c'est
  ce qui rend l'attente sûre.

---

## 8. Les gestes humains qui restent

```bash
supabase db push
```

Pour les migrations `20260911040000_le_referentiel_dit_ce_qu_il_vaut_et_le_francais_parle_avant_le_slug.sql`
et `20260912090000_l_apport_fixe_du_titulaire_va_dans_sa_source.sql`. Le contrôle distant
n'a jamais tourné : « appliquée en local » ne veut pas dire « le bloc de contrôle est
passé ».
