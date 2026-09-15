# Rendre la bêta prête — consignes pour Opus

**2026-09-15.** Point de départ : `AUDIT-AVANT-30-TIRS-2026-09-14.md` (défauts R1 à R5, bilan B1–B7) et `PASSATION-RESTE-BETA-AUTONOME-2026-09-14.md` (critères et décision finale). Ce plan ne remplace ni l'un ni l'autre : il ordonne ce qui reste, lot par lot, avec pour chaque lot la preuve qui le ferme.

« Bêta prête » a un seul sens ici : le verdict **« bêta autonome ouvrable dans le périmètre validé »** de la passation, § 3.3. Pas « le gate passe », pas « la campagne a tourné », pas « les défauts connus sont documentés ».

## Mandat et limites

- Aucun appel fournisseur payant avant le lot 5, et au lot 5 seulement sur enveloppe écrite par le propriétaire. Aucun déploiement, secret, migration appliquée ou SQL destructif par l'agent : `AGENTS.md`.
- Aucune baisse de seuil, de tolérance ou de politique de garde pour obtenir du vert. Un passage `count` → `refuse` ou l'inverse est une décision du propriétaire (voir § Décisions), jamais un geste de lot.
- Un compteur, un HTTP 200, un test qui lit le texte d'un fichier source ou une suite verte ne ferment rien : les 7 330 tests Deno sont verts **avec** R1 à R4 présents. La preuve d'un lot est nommée dans son acceptation.
- Arbre partagé : relever `git status` avant, ne toucher que les fichiers du lot, ne jamais `git stash` ni `git checkout` un fichier qu'un autre agent modifie.
- Avant tout run réel local : `./scripts/local_serve_functions.sh` (le runtime sert des `_shared` périmés sinon). Si 401 `Invalid JWT` : `./scripts/check-local-jwt-alg.sh`, puis `docs/keel/JWT-HS256.md`, rien d'autre.
- Rien de ce qui est gardé exprès ne bouge : lane de la semaine, chaîne de prescription 1:1, monde pro derrière `VITE_B2C_ONLY`.

## Décisions du propriétaire — à prendre une fois, avant le lot 5

Elles ne bloquent pas les lots 1 à 4. Sans elles, le lot 5 ne démarre pas.

| # | Décision | Recommandation |
|---|---|---|
| D1 | **Contrat de délai.** Le contrat initial (p95 ≤ 100 s, issue ≤ 120 s) n'est pas tenu : médiane 119 s, p95 248 s sur 25 tirs. Accepter ou non l'amendement du verdict : acceptation ≤ 145 s ou lecture d'état, disponibilité p95 180 s, échéance totale 380 s, au-delà un état `expired`/`failed` lisible. | Accepter, avec une clause : la disponibilité se mesure à l'**écriture** du plan, jamais à la réponse HTTP, et le lot 1 doit d'abord rendre l'échéance réelle. |
| D2 | **Enveloppe.** Deux pilotes (N=2, N=4) puis 30 tirs. Ordre de grandeur mesuré sur l'ancienne campagne : 50 échanges recensés pour 25 demandes (24 générations, 17 réparations, 9 auxiliaires). Compter 60 à 70 appels modèle pour pilotes + campagne, environ 1 h 15 de runs séquentiels. | Autoriser l'enveloppe par écrit, avec un plafond d'arrêt. |
| D3 | **`livrable_avec_ecarts` compte-t-il comme « utilisable » ?** Dans la politique livrée, `protein_floor_short`, `cell_energy_off`, `cell_bounds_off`, `mouth_energy_short` sont en `count` : le plan sort, étiqueté avec ses écarts. Les seuils 24/30 et 27/30 de la passation parlent de plans « utilisables ». | **Non** pour les seuils de campagne : un plan avec plancher protéique manqué chez un profil prise de muscle n'est pas utilisable. Il reste livrable à l'utilisateur, avec l'écart nommé à l'écran. La politique ne change pas ; le comptage devient honnête. |

## Lot 1 — Une demande a toujours une issue (B5)

Ferme R1, R2 et l'instrument de R5. Aucun appel modèle.

### 1.1 L'échéance est lue, pas seulement écrite

Faits : `keel_household_acquire_generation` balaie un bail plus vieux que `p_stale_after` = 440 s (`PLAN_REQUEST_BUDGET_MS` 380 s + `GENERATION_LOCK_MARGIN_MS` 60 s, `index.ts:1868`). Mais `keel_household_request_status` (`20260914160000_generation_request_status.sql`) rend `in_flight` sur toute ligne de verrou et sur tout brouillon `pending`/`running`, sans lire `started_at` ni `created_at`. Les deux verrous du 546 et du 502 sont dans la base locale, âgés de 17 h et 6 h, et lus comme vivants.

À faire, dans une nouvelle migration `20260915…` :

1. La RPC de statut compare `started_at` (verrou) et `created_at` (brouillon) à la même échéance que la prise, 440 s, passée en paramètre ou lue d'une seule constante SQL commentée. Au-delà : `kind: expired`, avec `started_at` et `age_seconds` dans la réponse.
2. Un brouillon `pending`/`running` au-delà de l'échéance est aussi `expired`. Ne pas le passer `failed` depuis la lecture : la lecture ne modifie rien, c'est la prochaine prise qui balaie.
3. Client : `planDraft.ts` (`awaitDurableRequest`, `waitForDraft`, `recoverLatestDraft`) et `household.ts:1825` traitent `expired` comme terminal. Phrase de refus dédiée dans `planRefusals.ts` et le catalogue i18n (fr + en, test de parité) : la composition n'a pas abouti, recomposer. Jamais `plan_still_composing` sur un état périmé.
4. Le harnais et l'écran reçoivent le même mot : `expired` n'est pas traduit en `failed` en chemin.

Acceptation : un test contre la base locale, exécuté avec l'identité des deux comptes propriétaires des verrous morts (`lotf.camp8.s5@keeltest.dev`, `lotf.camp2.b10@keeltest.dev`), montre `expired` et non `in_flight`. Un second test insère un verrou à `now() − 500 s` sur un foyer de test et vérifie : statut `expired`, puis prise réussie par une nouvelle demande, puis le bail précédent disparu. Vitest : `awaitDurableRequest` sur `expired` rend l'erreur dédiée, pas l'attente. Aucune ligne réelle modifiée hors foyer de test.

### 1.2 Le second tap après un succès ouvre le plan

Faits : `keel_adopt_meal_draft` rend `meal_id` quand le brouillon est déjà `adopted` (migration `143000`, l. 42–46). Mais `adoptDraft` (`draft_adopt.ts:556`) appelle `adoptability` (`draft_store.ts:227`) avant la RPC, et celle-ci rend 409 `draft_already_adopted`. Le client crée un `request_id` neuf à chaque invocation et cherche par lui.

À faire :

1. `adoptability` distingue « adopté avec `adopted_meal_id` » de « adopté sans identifiant ». Le premier cas rend un succès `already_written` porteur du `meal_id`, même forme de réponse qu'une adoption fraîche, `wall_ms` et journal inclus. Le second reste 409.
2. Client : sur `already_written`, charger le plan par `meal_id` et l'afficher actif. Sur réponse perdue pendant l'adoption, récupérer par le `draft_id`, identité stable, via la lecture qui sait déjà rendre `written` (`planDraft.ts:372–382`) ; ne pas repartir d'un `request_id` sans résultat.
3. Le test existant qui attend le 409 (`draft_adopt_test.ts:370`) change de sens : il attend `already_written` avec le même `meal_id`, et un compteur d'écritures à zéro.

Acceptation : double tap → deux réponses, un seul `meal_id`, une seule ligne de plan, un seul brouillon `adopted`. Réponse perdue puis rechargement → plan actif à l'écran sans refus visible. Prouvé par un test Deno sur la RPC réelle en base locale et un Vitest du chemin client.

### 1.3 Le harnais rend la reprise auditable

Faits : `campagne-lot-F.ts:1110` lit `request_id` **dans la réponse** ; un 546 ou un 502 n'en ont pas, donc aucun artefact ne peut être relié à sa ligne de verrou ou de brouillon.

À faire : le harnais génère et envoie son propre `request_id`, l'archive avant l'appel, et après chaque tir lit et archive dans l'artefact : l'état du verrou, du brouillon et de la RPC de statut pour ce `request_id`, plus le nombre de lignes `llm_raw_response_events` par `source`/`status` pour ce `request_id`. Le coût d'une demande se compte dans ce registre, pas dans un compteur mémoire. Ce bloc `etat_apres` est obligatoire même sur erreur réseau.

Acceptation : un tir à blanc (mode `--reponse` du transport contrôlé, sans appel payant) produit un artefact avec `request_id`, `etat_apres` et le décompte du registre.

### 1.4 Concurrence, une fois en vrai

Les tests de bail sont statiques. Ajouter un test en base locale : deux prises avec le même `request_id` → un seul bail ; publication avec un `lease_token` périmé → `generation_lease_lost`, zéro ligne écrite. Sans modèle : la publication se teste avec un payload de fixture.

## Lot 2 — Le contrat de la personne suit sa demande (B1, B2, B3)

Ferme R3, la trace du profil maintien, et rend le verdict lisible.

### 2.1 L'allure d'objectif entre dans l'empreinte

Faits : `paceByMember` est lu de `household_members.target_pace_kg_per_week` et `student_goals` (`index.ts:3413–3450`) et passé comme `paceKgPerWeek` aux cibles à onze endroits. `safety_fingerprint.ts` ne connaît pas le mot. L'adoption relit les cibles gelées dans `adoption_context`.

À faire : ajouter `paceKgPerWeek` à `FingerprintMember` et `canonicalMember` (nombre fini ou `null`, `null` et absent donnent la même empreinte) ; le renseigner depuis `paceByMember` dans le constructeur `liveSafety` (`index.ts:8242`), qui est le même objet que celui rangé à la composition (`index.ts:19778`). Une allure modifiée entre aperçu et adoption donne `draft_stale`, motif sécurité, et la personne recompose. Ne pas recalculer une cible à l'adoption : l'adoption sans modèle est un acquis.

Acceptation : `safety_fingerprint_test.ts` (allure changée → empreinte changée ; `null`/absent stables) ; test de câblage du handler ; `draft_adopt_test.ts` : brouillon composé à 0,5 kg/semaine, adoption à 0,8 → `draft_stale`.

### 2.2 Le dîner léger traverse tout le chemin

Chemin : `HouseholdPage.tsx:783` → `setMemberHabits` (`household.ts:727`, `p_rhythm[].size`) → `household_member_habits` → `keel_household_roster_for` → `rawHabits.get(...).light` (`index.ts:2866`) → `lightSlots` dans le prompt et le contrat. Le harnais écrit déjà par la RPC ; l'écran n'a pas été tracé.

À faire : un Vitest qui prend le geste de l'écran et vérifie le `p_rhythm` envoyé (`size: light` sur `dinner`) ; un test Deno de câblage qui vérifie que `lightSlots` arrive dans le contrat de maintien et dans la ligne de prompt ; au lot 4, la case est cochée, rechargée, et le contrat envoyé la porte.

### 2.3 Chaque contrôle incomplet dit pourquoi

Faits : les 22 réponses réussies de l'ancienne campagne portent un contrôle `mouth_energy` incomplet ; six cases par cas N=4 sont `unmeasurable` ; rien ne dit si c'est non applicable ou non exécuté.

À faire : dans la sortie de `final_plan_gate.ts` / `final_plan_audit.ts`, chaque contrôle incomplet porte un motif fermé : `not_applicable:<raison>` (pas de cible autorisée, profil protégé, âge inconnu) ou `not_run`. Un `not_run` sur un contrôle applicable refuse, comme la politique lot 4 le fait déjà pour un contexte absent. Aucun seuil ne change.

Acceptation : sur les fixtures N=1, N=2, N=4 (présences complètes et absence), chaque contrôle incomplet a un motif nommé et le compte de `not_run` est zéro. Sur la fixture sans âge, `mouth_energy` de cette bouche est `not_applicable:no_target`, pas `not_run`.

### 2.4 L'écart est nommé à l'écran

Un plan `livrable_avec_ecarts` dit à la personne quel écart, pour qui, de combien, dans les mots de `planRefusals.ts` et du catalogue. Vérifier que l'écran de plan le rend et qu'aucune phrase ne dit « conforme » sur cet état. Rien d'autre : la politique reste celle du lot 4 tant que D3 n'est pas prise.

## Lot 3 — Ce qui est acheté est ce qui est cuisiné (B4)

Ferme R4.

### 3.1 La ligne orpheline

Faits : sur `n4-ref4` et `n4-away`, `pot_shrink` retire une casserole (`pot_removed: 1`), puis `rebuildShoppingQuantities` (`index.ts:16020`, `shopping_rebuild.ts:528`) garde une ligne `lentils_dry` 260 g que plus aucun ingrédient final ne consomme (`unattributed: 1`). Le compteur existe ; la garde n'existe pas. La recette écrit `lentils_cooked`, les courses `lentils_dry`, et le seul pont entre les deux est `dry_input_ratio` dans `meal_cost.ts`.

À faire :

1. Le rebuild résout l'identité cuite → sèche avec le même `dry_input_ratio` que le coût, une seule fonction partagée. Une ligne rattachée à un ingrédient final par cette résolution est `requantified`, pas `unattributed`.
2. Une ligne dont le seul consommateur était une casserole retirée est `dropped`, et le retrait nomme la casserole.
3. Ce qui reste `unattributed` après ces deux étapes refuse la publication, miroir de `ingredient_not_bought`. Le compteur reste, il devient une garde avec un cas qui passe et un cas qui refuse.

Acceptation : `shopping_rebuild_test.ts` avec `lentils_cooked`/`lentils_dry` ; rejeu des deux bancs N=4 avec `shopping_unattributed: 0` et le retrait des 260 g nommé ; les autres cas B4 inchangés (sna1, N=2, plan 6146 : `unattributed: 0` déjà).

### 3.2 La bouche sans âge, avec une fixture qui l'est vraiment

Le cas `sna1` a encore un âge. Construire, par le chargeur contrôlé du handler et sans `UPDATE` réel, un foyer où le titulaire n'a pas de date de naissance. Rejouer : la bouche est servie d'une part de recette, participe aux casseroles et aux courses, sans cible inventée, et ses contrôles numériques sont `not_applicable:no_target` (lot 2.3).

### 3.3 Une mesure indépendante, pas une égalité par construction

`reconcilier.ts` calcule `reste = prêt − prélevé` puis vérifie `prêt = prélevé + reste`. Remplacer par : masse prête = somme des ingrédients après croissance × facteurs de rendement ; courses = somme des besoins crus après résolution d'identité ; par casserole, l'écart après arrondi est borné par une borne calculée depuis les opérations réellement faites (nombre de lignes arrondies × pas d'arrondi), pas par un pourcentage réutilisé d'ailleurs.

Acceptation : tableau par casserole pour N=1, N=2, N=4 complet, N=4 absence, sans-âge : ingrédients, prêt, prélevé, reste, borne, courses ; zéro déficit ; zéro `needs_unbought` ; zéro `unattributed`.

## Lot 4 — Preuves sur une version figée (B1–B6)

### 4.1 Figer

Commit restreint aux fichiers des lots 1 à 3 sur la branche courante ; pour le reste du diff partagé, manifeste SHA-256 dans le rapport. `scripts/agent-gate.sh` sur ce commit, sans toucher `scripts/.vitest-red-baseline`. Suite Deno du dossier keel et Vitest des fichiers touchés. `deno check` du handler.

### 4.2 Pile locale

Opération humaine : `supabase migration up` pour la migration du lot 1. Puis `./scripts/local_serve_functions.sh`. Vérifier que la version servie est le commit figé (empreinte d'un `_shared` modifié, relue par un appel).

### 4.3 Navigateur, comptes de test `@keeltest.dev` seulement

Chaque cas donne : état final attendu, état final lu en base (verrou, brouillon, plan), zéro double publication, zéro double consommation. Captures et lignes archivées dans `scratchpad/2026-09-15-BETA-PREUVES/`.

| Cas | Ce qu'on prouve |
|---|---|
| Composer → résultat → rechargement | B5 ; le plan retrouvé est celui écrit |
| Prévisualiser → Adopter → actif → rechargement | R2 fermé ; aucun appel modèle à l'adoption |
| Double tap Adopter, deux onglets | un seul plan |
| Réponse perdue après adoption | plan actif au rechargement |
| Verrou périmé (fixture 1.1) | `expired` à l'écran, recomposition possible |
| Allergie ajoutée puis Adopter | `draft_stale`, recomposition |
| Allure d'objectif changée puis Adopter | `draft_stale` (R3) |
| N=4, compte neuf, variante de régime | B1 sur cette version : bonne bouche, bon plat, courses cohérentes |
| Profil maintien, dîner léger coché | B2 : coché après rechargement, présent dans le contrat envoyé |
| Budget invalide, autre foyer, compte secondaire | B6 : refus, rien d'écrit |

Ces cas consomment des appels modèle (une composition par cas qui compose). Les compter dans D2 : environ 8 à 10 appels, hors réparations.

### 4.4 Expliquer le 502

Le pilote b10 tir 2 a rendu 502 à 171 858 ms sans ligne écrite, et a laissé son verrou. Retrouver la ligne de journal du runtime ou de la passerelle sur la fenêtre 16:16–16:19 du 14 ; classer : coupure passerelle, worker tombé, amont modèle. Si les journaux sont perdus, le 502 est réexpliqué au premier pilote du lot 5, qui après le lot 1 ne peut plus laisser de verrou mort. Ne pas ranger le 502 dans « erreur modèle » sans ligne de journal.

## Lot 5 — Pilotes, puis 30 tirs (B7)

Préconditions, toutes : lots 1 à 4 verts ; D1, D2, D3 prises par écrit ; migration appliquée ; runtime relancé ; harnais 1.3 en place ; version figée identique à celle des preuves du lot 4.

1. **Deux pilotes**, N=2 et N=4, profils existants. Arrêt sur défaut essentiel, sur verrou laissé après erreur, ou sur dépassement inexpliqué de 380 s.
2. **Campagne** : six profils × 5, profil maintien inclus, avec les fenêtres offertes ; un test de concurrence (même `request_id`, deux appels). Si le code change entre pilotes et campagne, les pilotes ne comptent pas.
3. **Comptage**, depuis les artefacts et le registre, jamais depuis un résumé : livré ; sans écart essentiel ; contrôles applicables tous lus ; sans rattrapage ; délai de **disponibilité** (horodatage d'écriture − envoi) ; appels modèle par demande, par source ; 409/502/546 avec état lu après. Distinguer `conforme` et `livrable_avec_ecarts` selon D3.

Seuils inchangés (passation § 3.3) : 24/30 sans rattrapage, 27/30 après parcours, 4/5 par profil, zéro violation essentielle, zéro 546 inexpliqué, zéro demande sans issue récupérable, délai selon D1, au moins une réparation réelle utile à N=2 et N=4.

Le premier jet reste une mesure séparée : les correctifs de réparation n'ont jamais prouvé que le modèle écrit les neuf cases dès le premier jet (§ 3 de l'audit). Si le taux sans rattrapage est sous 24/30, le résultat est « bêta bloquée sur le premier jet », pas un motif d'assouplir.

## Définition de terminé

| Garantie | Preuve qui la ferme |
|---|---|
| Chaque personne reçoit un repas compatible avec ses contraintes | Lot 4 : N=4 compte neuf avec variante ; allergie et allure périment l'aperçu |
| Le statut correspond au contrat réellement respecté | Lot 2.3 : zéro `not_run` ; lot 2.4 : l'écart nommé à l'écran ; D3 appliquée au comptage |
| Servi, cuisiné, acheté décrivent la même nourriture | Lot 3 : zéro orphelin, mesure indépendante, cinq cas |
| Une demande a toujours une issue bornée | Lot 1 : les deux verrous réels lus `expired` ; double tap = un plan ; harnais auditable |
| La version finale produit assez de plans corrects, au coût et délai acceptés | Lot 5 sur la version figée, seuils de la passation, D1 et D2 |

Verdict à rendre, un seul des trois de la passation : **bêta bloquée**, **correctifs vérifiés — campagne restante**, **bêta autonome ouvrable dans le périmètre validé**.

## Ce qu'on ne fait pas dans ce chantier

- ~~Pas de file d'exécution durable, pas de `waitUntil`, pas de promesse mémoire présentée comme une file. La demande reste dans le worker ; l'issue devient honnête.~~
  ⟳ **Renversé le 2026-09-15**, sur un fait mesuré : Supabase tue à 150 s toute fonction qui n'a pas répondu (tous les plans), et une composition de foyer prend 244 à 281 s — la première tentée en hébergé est morte sans rien écrire. La demande ne peut donc PAS « rester dans le worker ». Ce qui tient lieu de file est la ligne `student_meal_drafts` (`mode='async'`, `stage`, `attempt`, `relaunch_of`) ; l'ordonnanceur est `pg_cron` (`keel-relaunch-meal-drafts`, une relance au plus) ; `EdgeRuntime.waitUntil` ne sert qu'à finir le travail accepté après le 202, jusqu'au mur mesuré de 400 s (`keel-runtime-probe-v1`). La phrase « pas de promesse mémoire présentée comme une file » reste vraie.
- Pas de changement de modèle, d'effort ou de mode rapide pour gagner du temps.
- Pas de rebranchement de la lane semaine, pas de retour des extras hors plan.
- Pas de nouvelle campagne pour comprendre un défaut déjà enregistré.
- Pas de refonte du prompt de premier jet dans ces lots : c'est un chantier séparé, mesuré par le taux sans rattrapage.

## Opérations humaines, dans l'ordre

1. Prendre D1, D2, D3 par écrit.
2. Après le lot 1 : `supabase migration up` en local, puis `./scripts/local_serve_functions.sh`.
3. Après le lot 4 : autoriser l'enveloppe des pilotes.
4. Après la campagne, si le verdict est « ouvrable » : `supabase db push`, `supabase functions deploy`, puis relire l'allowlist CORS et les clés du runtime en prod (les deux ont déjà été trouvées fausses), puis un parcours réel sur la prod avec un compte de test avant d'ouvrir.

## Ordre de grandeur

Lots 1, 2, 3 : une session d'agent chacun, sans appel payant. Lot 4 : une session plus deux opérations humaines, 8 à 10 appels. Lot 5 : 1 h 15 de runs et une session d'analyse, 60 à 70 appels. Ce sont des estimations ; le seul chiffre engageant est l'enveloppe D2.
