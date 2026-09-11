# Un moteur de plans, de une à plusieurs personnes

Statut : **plan d'implémentation à exécuter**, pas compte rendu de travaux terminés.
Demande du propriétaire : une personne seule est un foyer d'une personne ; supprimer la voie de génération solo ; terminer le chantier calories, densité et grammages. Le diagnostic et la correction des erreurs 546 sont reportés.

> ## ⟳ 2026-09-10 · CE QUI A ÉTÉ TRANCHÉ ET VÉRIFIÉ AVANT D'ÉCRIRE UNE LIGNE
>
> **① Une correction du diagnostic.** Il a été dit, dans la discussion qui a
> précédé ce plan, que « la lane foyer ne sait lire le corps des gens que dans
> `household_member_bodies` ». **C'est faux**, et le § 2 le dit déjà :
> `_shared/keel/household_bodies.ts:155` appelle `loadStudentBody(...)` pour
> chaque membre ayant un compte. Ce qui est vrai est plus étroit : le générateur
> porte **deux** lectures — `bodies` (`loadHouseholdMemberBodies`, qui lit bien
> le personnel) et `lineBodies` (`keel_household_bodies_for`, la fiche de
> bouche) — et c'est **`lineBodies` qui sert les grammages**
> (`index.ts:2709, 3404-3415`). C'est l'objet du lot 3.
>
> **② Le paywall n'est pas neutre, et le propriétaire a tranché.**
> `generate-meal-v1:820` écrit en toutes lettres : « **UN APPELANT SANS FOYER
> PASSE**, et ce n'est pas un oubli (arbitrage D13) ». Aujourd'hui un compte sans
> foyer ne passe **aucune** porte de facturation. Lui donner un foyer l'allume,
> et elle ne peut pas être neutre : `households.free_until` a pour défaut
> `CURRENT_DATE + keel_household_trial_days()` (7 jours), et
> `keel_household_is_covered` traite `free_until IS NULL` comme **couvert pour
> toujours**.
> Mesuré le 2026-09-10 : **1 437 comptes sans foyer, dont 17** ont déjà généré
> un plan.
> ⛔ **DÉCISION DU PROPRIÉTAIRE, 2026-09-10 : essai standard de 7 jours pour
> tout le monde.** Elle **renverse le § 1.4** ci-dessous (« ni nouvel essai »),
> en connaissance de la conséquence : un paywall apparaît pour ces 17 comptes.
> Ce n'est pas un oubli d'implémentation.
>
> **③ Un seul exécutant.** Deux agents ont travaillé sur ce plan dans le même
> arbre le 2026-09-10 ; le propriétaire en a arrêté un. Les artefacts du lot 0
> (inventaire de parité, contre-exemples, empreintes de départ) vivent dans
> `scratchpad/2026-09-10-MOTEUR-UNIQUE/`.

## 0. Avancement — mis à jour à chaque lot

> ⚠️ **Lire les états au pied de la lettre.** « implémenté et testé » veut dire
> qu'un test le prouve et qu'il est vert ; « implémenté non testé » veut dire
> que le code existe et que rien ne le garde. Les deux ne se valent pas.
> **Aucune validation edge n'a été faite** : les 546 sont hors chantier (§ 10),
> et rien de ce qui suit n'a tourné sur un vrai appel modèle.

| Lot | État | Ce qui le prouve |
|---|---|---|
| **1** — un compte seul est un foyer d'une personne | **implémenté et testé** | 8 migrations `…190000–197000` ; SQL : `personal_household_test` (11), `…_lifecycle_test` (23), `…_departure_test` (15), `lot8_identite_test` (39) — **88 cas, 0 échec** |
| **2** — un contexte de génération, réservé au maître | **implémenté et testé** | `generation_context.ts` + `generation_context_test.ts` (9) + `generation_context_wiring_test.ts` (11) + `lot8_autorisation_test` (32 SQL + 9 TS) |
| **3** — résoudre les faits d'une personne une fois | **implémenté et testé** | `resolved_mouth.ts` + `resolved_mouth_test.ts` (12) ; `pace_unavailable_test.ts` (7) |
| **4** — budgets et couloirs par bouche, jour, moment | **implémenté et testé** | filtre `min > floor` retiré, intersection, redistribution — `redistribution_test.ts` (11), CE-1 retourné |
| **5** — mesurer puis appliquer les quantités finales | **implémenté et testé** | `preparationReadyKcal` + relevé de dérive + **remesure après le regrammage**, écrite sur la ligne (`generated_from.portion_sizing.final`) |
| **6** — la boucle de réparation globale | **implémenté et testé** | **la pesée est remontée au-dessus des rattrapages** ; la réserve du budget est conditionnelle aux défauts MESURÉS ; `finalPlanGate` branché sur la génération. CE-3 fermé. |
| **7** — bascule d'interface et suppression du legacy | **implémenté et testé** | front basculé ; parité `mode`/`meal_slot`/`pantry` livrée ; **`generate-meal-v1` SUPPRIMÉ** (5 755 lignes) après un audit d'appelants |
| **8** — banc et familles de tests | **partiel** | banc réparé et re-mesuré hors ligne ; familles Identité et Autorisation livrées ; les 7 autres familles non écrites |
| Rattrapage des 1 437 comptes sans foyer | **application humaine requise** | rodé à blanc **et à vide dans une transaction annulée** : 200 créés, 0 échec |

### Ce que le lot 1 a livré

| Migration | Ce qu'elle fait |
|---|---|
| `…190000` | `households.origin` + `keel_ensure_personal_household` : idempotent, verrou d'avis, refus d'un `p_user` d'autrui, refus d'un compte supprimé |
| `…191000` | `keel_backfill_personal_households(limite, à_blanc)`, `service_role` seul |
| `…192000` | une invitation **traverse** un foyer réellement personnel au lieu de buter sur `already_in_household` |
| `…193000` | une dissolution **re-provisionne** et **repose l'échéance** — ferme la ferme à essais |
| `…194000` | déclencheur sur `profiles` : un profil neuf reçoit son foyer, sans jamais pouvoir faire échouer une inscription |
| `…195000` | « créer un foyer » devient « **nommer le sien** » : le refus `already_in_household` serait devenu vrai de tout le monde |
| `…196000` | un **départ** rend son foyer **et l'échéance d'avant** (`household_members.personal_free_until`) |
| `…197000` | `keel_household_release_merge_quota` — une fusion ratée ne coûte plus sa semaine (lot 2) |

⛔ **Ce que le lot 1 ferme, et qui n'était pas dans le plan :** sans `…193000`
et `…196000`, la boucle « rejoindre → partir » ou « créer → dissoudre » rendait
**sept jours d'essai neufs à chaque tour**. La décision du propriétaire (essai
standard pour tout le monde) ouvre cette porte ; les deux migrations la
referment en **reposant l'échéance d'avant**, jamais une neuve.

### Ce que le lot 2 a livré

- **Une seule admission** (`resolveGenerationAdmission`, pure) : les quatre
  situations de la table du § lot 2 passent par une porte ou un refus nommé.
  Le droit vient du **rôle en base**, jamais du nombre de bouches ni d'un
  paramètre client.
- **`not_owner` sur la lane solo aussi.** `generate-meal-v1` n'avait **aucune**
  garde de rôle : un membre secondaire refusé 403 par la lane foyer obtenait
  200 par cette porte, et le plan écrit portait quand même le `household_id`.
- **`replaces` vérifié avant le modèle**, sur le compte et sur un plan vivant.
  La base refusait déjà — une génération complète plus tard.
- **`draft_id` et `merge_member_id` : vérifiés, non modifiés.** Le premier est
  clé sur `user_id` (`loadDraftForAdoption`), le second sur le roster lu, et il
  refuse avant l'appel modèle. Aucun des deux n'avait de trou.
- **Le contrat est écrit sur la ligne** (`generated_from.generation_context`) :
  « un seul moteur » devient vérifiable en SQL, pas seulement affirmé.
- **Une fusion ratée rend son unité** — décision d'août renversée, avec le
  retour arrière exact que son propre commentaire nommait.

⛔ **Ce que le lot 2 ne porte PAS, et pourquoi** — à lire avant d'ajouter un
champ au contexte :
- **le calendrier** : `todayDate` se dérive du fuseau du foyer, lu plus bas ;
  le remonter ferait deux vérités sur « quel jour on est » ;
- **le quota de fusion** : il se réclame juste avant l'appel modèle, exprès
  (`household_merge_quota_test` épingle qu'aucune sortie ne s'intercale) ;
- **les opérations autorisées** : rien ne les consulterait — un champ que
  personne ne lit est une garde désarmée qui ressemble à une garde.
- **la remise de quota sur un 546** : un worker tué n'exécute plus rien. Nommé,
  pas corrigeable côté edge.

### Ce que les lots 3 et 4 ont livré

- **La concurrence `bodies` / `lineBodies` est supprimée.** Le moteur lisait le
  corps que le maître avait TAPÉ pendant que les pesées datées ne servaient que
  le brief : une personne pesée mardi était dimensionnée sur le chiffre de son
  inscription. `resolveMouth` rend un objet par `member_id` avec la **provenance
  de chaque champ** (`personal` / `member_sheet` / `absent` / `read_failed`), et
  le décompte part sur la ligne (`generated_from.mouth_facts`).
- ⛔ **Une lecture échouée n'est pas une absence.** Se replier sur la fiche
  quand la lecture personnelle est tombée servirait un chiffre périmé sous les
  traits d'un chiffre à jour. Le résolveur refuse et le NOMME.
- ⛔ **Une contradiction d'âge ne fait jamais passer un mineur pour majeur** : le
  plus jeune gagne, le conflit est tracé.
- **`pace_unavailable_missing_body`** : sur une fiche sans taille, la personne
  recevait une cible (raccourci au poids) et un écart nul — « perdre 0,5 kg par
  semaine » au-dessus d'une journée à l'entretien. Le refus de deviner est
  conservé ; il porte maintenant son motif, et l'écran cesse d'annoncer le rythme.
- **Le filtre `min > floor` est retiré.** Il jetait la ligne entière d'un moment
  dont la borne basse ne dépassait pas le plancher du bloc — **et son plafond
  avec**, que rien d'autre ne porte. Un goûter de 250 kcal a un couloir
  [100, 135] ; le 135 disparaissait. L'objection d'origine (« un brief qui
  répète cesse d'être lu ») est traitée au RENDU : `up to 135` au lieu de
  `100 to 135`.
- **Les couloirs s'intersectent vraiment** sur toutes les occurrences :
  `max(Dmin)`, `min(Dmax)`, et `empty_intersection` quand les bandes sont
  disjointes — avant, on gardait le couloir du jour le plus exigeant, plafond
  compris, et le conflit disparaissait.
- **`redistributeDayBudget`** : pure, somme conservée, saturation aux capacités,
  apports fixes et cases gelées immobiles, un moment léger ne remonte jamais
  au-dessus de son budget, et un refus nommé plutôt qu'une cible baissée en silence.

### Ce que le lot 6 a livré

⛔ **LE PLUS GROS TROU DE LA NUIT : la garde finale n'avait jamais tourné.**
`finalPlanGate` — 22 causes, ~900 lignes, sa propre suite de tests — n'avait
qu'**un** appelant : `draft_adopt.ts`. Or `adoptDraft` n'a **aucun appelant
vivant**, et même atteint il aurait rendu `context_unavailable` : aucun
générateur n'écrit `adoption_context`. La garde était morte **deux fois**. Elle
est maintenant appelée sur `writePayload`, après toutes les transformations et
avant l'écriture. `asGatePlan` a déménagé dans `final_plan_gate.ts` — il était
privé dans le fichier mort, ce qui rendait la garde inatteignable.

⚠️ **Elle ne refuse rien aujourd'hui**, et c'est l'ordre écrit dans son en-tête :
sous `FINAL_GATE_POLICY_LOT_1` toutes les causes valent `count`. Ce branchement
produit le **dénominateur** que personne n'avait. Passer au lot 2 est un
changement de constante, en un seul endroit — et le refus existe déjà, nommé.

- `plan_repair_loop.ts` : décision **pure** — l'ordre de l'instruction
  (sécurité → repas manquant → grammage → protéines → préférences), le refus
  d'appeler (`no_defects` / `attempts_exhausted` / `no_time_left` /
  `nothing_repairable`), le repli qui ne reprend pas le timeout du premier, et
  le verdict de candidate.
- ⛔ **La régression de sécurité se compare PAR IDENTITÉ, jamais par compte.**
  Retirer l'arachide de Léa et mettre du gluten chez Marc rend deux pour deux :
  un comparateur de comptes l'accepterait comme un progrès.
- ⛔ **Un défaut protéique seul déclenche une tentative**, et un contrôle
  déterministe n'en consomme aucune.

### Ce que le branchement de la boucle a changé

**Le défaut.** Cinq des sept rattrapages s'exécutaient **avant toute pesée**.
Quand `protein_anchor_retry` demandait un des deux appels modèle, personne
n'avait pesé un seul plat : le budget gardait des slots à l'aveugle, par
`PLAN_REPAIR_RESERVED_AFTER` — des nombres accordés à la main sur **l'ordre
d'exécution du fichier**, pas sur l'importance du défaut.

**Ce qui a été déplacé**, un bloc à la fois, avec un `deno check` après chacun :

| Bloc | D'où | Pourquoi |
|---|---|---|
| `fillPlanComposition` (le sas) | 9397 | il complète l'index **en vol** ; peser avant lui sous-estime les défauts de grammage |
| `shadowSizing` (la pesée, 574 lignes) | 9082 | c'est elle qui dit quels plats ne tiennent pas dans leur assiette |
| `unallocatedTerms`, `bitesOf` | 8153, 8190 | le détecteur de **sécurité** |
| `mouthCells`, `deliveredViewOf` | 8438, 8449 | le détecteur de **livraison** |

**La réserve n'est plus une devinette** : `planRepairReservedAfter(label, pending)`
compte les natures **strictement plus prioritaires réellement en défaut**, et une
nature servie **sort** de l'ensemble.

| Situation | Avant (à l'aveugle) | Après (mesuré) |
|---|---|---|
| protéine **seule** | **(aucun)** ❌ | `protein_anchor_retry` ✅ |
| grammage seul | densité + dédié | inchangé |
| sécurité + grammage | exclusion + densité | inchangé |
| protéine + grammage | densité + dédié | **protéine + densité** |
| sécurité + livraison + grammage | exclusion + **densité** | exclusion + **livraison** ✅ |

La dernière ligne suit l'axe du chantier : « présence des repas » passe **au-dessus**
du grammage — une bouche sans aucun repas ne peut pas attendre le plan suivant.

⚠️ **La lane individuelle n'a pas bougé.** Elle ne passe aucun ensemble mesuré et
retombe sur la table, à l'identique. Un test le garantit.

⛔ **Une règle sans mesure avait été tentée d'abord, et retirée** : elle réservait
la dernière tentative à la sécurité sans rien peser, et **perdait `density_repair`**
— la réparation qui fait passer un foyer de 6 assiettes dans les bornes à 12 sur 15.
La leçon est écrite dans `plan_repair_loop.ts` : aucune règle qui ne mesure pas ne
peut arbitrer ces slots.

### Ce que le lot 7 a livré — la suppression

`supabase/functions/generate-meal-v1/index.ts` : **5 755 lignes**, supprimé.

**L'audit d'abord.** `grep` naïf : 115 fichiers. Commentaires retirés : **53**.
Parmi eux, **zéro appelant runtime** — ni `config.toml`, ni `cron.job`, ni
`functions.invoke`. Les 7 occurrences restantes dans `onboarding.ts` étaient des
chaînes `consumer:` de **documentation**. Tout le reste : des tests qui lisaient
son source, et des scripts de banc.

**Sept fichiers de test supprimés avec elle**, chacun après vérification que la
règle qu'il protégeait a un porteur côté foyer. **34 cas** retirés dans 15 autres
fichiers — tous nommaient la lane supprimée dans leur titre.

⛔ **Aucune assertion métier n'a été retirée pour faire taire un rouge.** Les
tests à deux lanes gardent leur entrée FOYER ; les boucles restent sur un seul
élément, exprès — la propriété est « sur CHAQUE lane », pas « sur celle-ci ».
Détail complet : `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.

**Trois défauts trouvés en la retirant :**

| Défaut | Cause |
|---|---|
| Deux déclencheurs non déclarés à la garde de couverture | `on_profile_created_ensure_personal_household` (mon lot 1) et `protocol_events_meal_context_guard` |
| `plan_not_replaceable` sans phrase à l'écran | jeton neuf du lot 2, jamais traduit |
| `not_authenticated` et `no_household` **invisibles au scan de refus** | ⛔ mon refactor les fait voyager par `error: admission.refusal` — une EXPRESSION. C'est la cicatrice « la garde des refus ne lit que les littéraux » : un motif orphelin en silence, un mur muet à l'écran. |

Trois jetons (`mode_required`, `pantry_required`, `day_already_spent`) n'étaient
rendus que par la lane supprimée : leurs clés sont **retirées**, pas gardées
« au cas où » — une entrée qui ne peut plus arriver fait croire à une couverture
qu'on n'a pas.

### Ce que le lot 5 a livré — la remesure

**Le défaut.** La lane MESURE les plats, puis REGRAMME les casseroles (croissance
et rétrécissement d'identité), puis écrit la ligne. Entre les deux, deux choses
déplacent la densité réelle d'un pot :

- un ingrédient **plafonné** par `scaleIngredients` casse la proportionnalité —
  le pot ne change plus seulement de taille, il change de composition ;
- une casserole **retirée** emporte ce que des plats y puisaient.

Dans les deux cas, le verdict inscrit sur la ligne décrivait **un plan qui
n'existe plus** — et c'est ce verdict-là que le banc relit.

**La correction.** Le plan est **remesuré après toutes les mutations**, et les
deux mesures coexistent sur la ligne, nommées :

| Champ | Ce qu'il dit |
|---|---|
| `portion_sizing.…` (l'existant) | la mesure d'**avant** — celle qui a décidé des grammes |
| `portion_sizing.final` | ce que le plan **écrit** pèse vraiment |

⚠️ **Aucun gramme n'est retouché ici**, et c'est la moitié qui compte : les
grammes servis étaient déjà les bons (`regramMeal` les a réécrits sur l'index
réparé). Ce qui était faux, c'est ce qu'on en **disait**. Recalculer les
assiettes à cet endroit les ferait bouger *après* les ceintures qui viennent de
les valider.

⛔ **L'abstention est nommée, jamais un zéro.** `shadowSizing` ne mesure qu'à
partir de **deux** bouches ; à une, `measured: false` et le motif partent sur la
ligne. Un `0` ressemblerait à « tout va bien » sur un plan que personne n'a pesé
— et depuis la suppression de la lane individuelle, une bouche est le cas
**majoritaire**. Le dénominateur (`judged`) voyage avec la part (`in_bounds`) :
un taux sur trois assiettes n'a pas le sens d'un taux sur quinze.

### ⛔ Ce qui RESTE OUVERT, et qu'il ne faut pas croire fait

| Point | État exact |
|---|---|
| Lot 6 — la boucle | Le module de DÉCISION est livré et testé ; **le brancher a été tenté le 2026-09-11 et annulé**. Voir ci-dessous. |
| Lot 6 — la garde finale | Branchée et journalisée, mais **`energy` et `boxContract` valent `null`** : leurs sources vivent dans des blocs que ce point du fichier ne voit pas. Les compteurs de la garde disent lesquelles de ses causes n'ont donc pas été évaluées. |
| Lot 7 — l'adaptateur de compatibilité | **Aucun n'a été écrit**, et aucun n'était nécessaire : l'audit n'a trouvé zéro appelant runtime. Le plan l'autorisait « pour une transition avec anciens clients » ; il n'y a pas d'ancien client. |
| Validation edge | **Aucune.** Rien de ce chantier n'a tourné sur un vrai appel modèle (§ 10). |
| D2 — RLS des plans de foyer | Un plan `plan_kind='household'` composé par une personne SEULE devient lisible par le premier membre qui la rejoint : `student_generated_meals_household_read` ne compare aucune date. Le lot 7 dit « ne pas les convertir en plans collectifs accessibles à de futurs membres ». **Arbitrage à trancher par le propriétaire.** |
| D3 — foyer orphelin | `keel_household_purge_user` détache au lieu de supprimer : un foyer `personal_auto` sans compte survit à chaque suppression. Résidu, pas une fuite. |

## 1. Décisions qui gouvernent ce chantier

1. Un seul pipeline de composition, mesure, dimensionnement, réparation et validation, pour N = 1 comme N > 1. Ne pas finir l'ancien pipeline solo pour le supprimer ensuite.
2. Un compte sans rattachement reçoit un foyer personnel avec un membre titulaire. Un compte déjà membre d'un foyer conserve ce rattachement. Ne pas créer de double appartenance.
3. **Seul le compte maître peut déclencher une génération.** Une personne seule est le compte maître de son foyer d'une personne. Dans un foyer à plusieurs personnes, un membre secondaire ne génère aucun plan, même pour lui seul. Aucun mode de génération personnelle distinct n'est ajouté.
4. Conserver les droits commerciaux, essais, quotas, relations coach, plans historiques et restrictions de confidentialité. Créer un foyer technique n'accorde ni nouvel essai ni abonnement collectif.
5. Les mesures personnelles ne sont pas recopiées dans `household_member_bodies`. Un résolveur partagé fournit les données utilisées par l'écran, la cible, le couloir et les grammages.
6. Supprimer la déduction automatique de pain, fromage et dessert hors plan. Ces aliments restent permis comme ingrédients explicitement prévus dans une recette. Conserver les apports fixes déclarés et réellement programmés.
7. Appétit adulte : confort de portion, énergie inchangée. Repas léger : poids calorique réduit dans la répartition et densité minimale abaissable, plafond individuel conservé. Gardes et équations pédiatriques existantes conservées.
8. Au maximum deux tentatives de recomposition après la composition initiale. Chaque tentative traite ensemble les défauts identifiés. Après épuisement, livrer la dernière version utilisable, avec ses écarts ; ne jamais assimiler livraison et conformité. Une version avec violation de sécurité ou références indispensables invalides n'est pas utilisable.
9. Conserver Fast pour la génération ; appliquer Fast aussi aux appels auxiliaires OpenAI effectués pour un plan. Réparations : `gpt-5.6-luna`, effort `high`, Fast. Ne pas changer les paramètres des conversations ordinaires.
10. Aucun travail sur les limites CPU, la politique des workers ou les redémarrages destinés à contourner les 546. Aucun grand banc payant dans ce chantier.

Ce plan remplace, pour ce périmètre, les exclusions de l'ancien chantier qui interdisaient le reroutage et la suppression du legacy. Un commentaire historique ou un test de l'ancienne architecture n'annule pas la décision ci-dessus. Remplacer le contrat concerné et son test, sans supprimer la propriété de sécurité qu'il protégeait.

## 2. Points de départ vérifiés et fichiers à utiliser

| Sujet | Point de départ |
|---|---|
| Routage | `frontend/src/keel/api/planRouting.ts` : propriétaire avec au moins deux personnes vers foyer ; tous les autres vers personnel. |
| Appelants | `SetupPage.tsx`, `StudentWeekPlanPage.tsx`, `api/mealGeneration.ts`, `api/household.ts`, `api/planDraft.ts`. Chercher aussi les appels indirects et les anciennes versions clientes. |
| Admission foyer | `supabase/functions/generate-household-meal-v1/index.ts` : `no_household`, puis refus de tout non-propriétaire. |
| Deux lectures corporelles | `_shared/keel/household_bodies.ts` lit déjà `loadStudentBody` pour les comptes. Le bloc `lineBodies` du générateur lit séparément `keel_household_bodies_for` et sert les grammages. L'affirmation « le foyer ne sait jamais lire les mesures personnelles » est trop générale. |
| Identité | `household_members_one_per_user`, RPC de création, d'invitation/réclamation, départ et dissolution ; définitions successives dans les migrations. Lire la dernière définition applicable, pas seulement la migration de création. |
| Dimensionnement | `_shared/keel/portion_sizing.ts`, `mouth_anchor.ts`, `slot_fixed_kcal.ts`, `household_fixed_intakes.ts`. |
| Cible écran | `_shared/keel/meal_energy_shared.ts`, `meal_envelope.ts`, `weight_pace.ts`. Partager une fonction ne suffit pas si ses entrées diffèrent. |
| Réparations et transport | `_shared/keel/plan_budget.ts`, `generation_model.ts`, `_shared/gemini.ts`. |
| Validation finale | `_shared/keel/final_plan_gate.ts`, `draft_adopt.ts`, `food_exclusion_belt.ts`, `household_restriction_lock.ts`. Réutiliser et compléter les contrôles existants. |
| Banc à corriger | `scratchpad/2026-09-10-CAMPAGNE-ELARGIE/{20-mesure.py,21-energie-foyer.ts,21-mesure-avec-sas.py,30-rapport.py}`. |

Avant modification : relever les fichiers déjà modifiés, les empreintes des fichiers du chantier et les tests rouges effectivement reproduits. L'arbre est partagé et contient beaucoup de travail en cours. Aucun reset, aucune restauration globale. Un écart avec HEAD prouve une modification non commitée, pas son auteur ni son antériorité au chantier.

## 3. Lots d'implémentation, dans cet ordre

### Lot 0 — Fixer le contrat et les contre-exemples avant le reroutage

Écrire les tests de comportement qui échouent actuellement : compte sans foyer provisionné puis autorisé comme maître, propriétaire seul autorisé, membre secondaire refusé pour toute génération, 250 kcal dont le couloir disparaît, variation d'apport fixe selon le jour, deux exclusions successives dans un même plat, mesure finale absente, réservation qui interdit toute réparation protéique.

Construire un inventaire de parité solo → moteur commun. Pour chaque fonctionnalité, indiquer son entrée, son lecteur et son test : `from_pantry`/`to_shop`, repas isolé/créneaux/fenêtre, quantités et répétitions demandées, équipement, temps, budget, régime, allergies, doctrine du coach, note libre, envies, repas dehors, habitudes, apports fixes, brouillon, édition de cases, adoption, remplacement, prochain plan, courses et conservation. Un champ ne peut disparaître au motif que l'actuel endpoint foyer ne le lit pas.

**Fin du lot :** contrat de requête commun défini, tests de parité identifiés et état de départ reproductible. L'inventaire tient dans un tableau ; ne pas rédiger une seconde dissertation d'architecture.

### Lot 1 — Provisionner un foyer personnel sans casser les invitations ni la facturation

Créer ou extraire une primitive transactionnelle idempotente `ensure_personal_household` :

- Exposée au client uniquement pour `auth.uid()` ; variante administrative réservée au serveur pour le rattrapage. Aucun `user_id` client arbitraire.
- Verrouillage par compte avant résolution/création ; contrainte d'unicité existante maintenue. Deux appels concurrents rendent les mêmes identifiants.
- Rattachement existant : rendre ce foyer et ce membre sans changer rôle, référence ou données.
- Absence réelle : créer foyer et membre propriétaire atomiquement, identité depuis les sources existantes, âge inconnu conservé. Ne pas créer de consentement, objectif, mesure ou référence adulte fictive.
- Marquer l'origine automatique, par un champ explicite ou une métadonnée persistante, afin de distinguer ce foyer d'un foyer collectif constitué. Ce marqueur ne décide pas des droits commerciaux.
- Brancher la création de compte après disponibilité du profil. Ajouter le même ensure au premier accès authentifié utile et à l'entrée du générateur pour réparer les anciens comptes et les courses d'initialisation.
- Préparer un rattrapage paginé, relançable, via la même primitive. Produire le décompte avant/après : déjà rattachés, créés, anomalies, échecs. Ne pas reprendre les nombres 1 437/1 513 sans lecture datée du bon environnement.

Adapter dans ce même lot le cycle de vie :

- Une inscription par invitation peut avoir déjà reçu un foyer personnel. Après validation de l'adresse et du jeton, permettre la transition atomique si ce foyer est réellement personnel : propriétaire seul, aucun autre membre, aucune invitation collective active. Garder l'identité de la bouche invitée dans le foyer cible.
- Détacher le rattachement personnel précédent dans la transaction, conserver son historique privé, puis attacher au foyer cible. Aucun transfert automatique des plans privés, essais ou moyens de paiement au nouveau foyer. Une erreur annule toute la transition.
- Après rattachement comme membre secondaire, la personne conserve la consultation autorisée de son historique, mais ne peut plus déclencher de génération. Si elle quitte ensuite le foyer et devient maître de son foyer personnel, elle retrouve ce droit sous réserve de ses droits commerciaux existants.
- Un propriétaire ayant d'autres membres ne peut pas abandonner son foyer par cette voie. Conserver le parcours explicite de transfert/départ existant.
- Au départ d'un foyer, la personne récupère un rattachement personnel idempotent. Une dissolution à une personne conserve ou rétablit ce rattachement ; elle ne crée pas une boucle dissolution/recréation visible.
- Une suppression de compte ne doit pas déclencher une recréation. Intégrer l'état de suppression aux lecteurs/ensure et aux tests de cycle de vie.
- Auditer les defaults `free_until` et les triggers de création : aucune remise à zéro d'essai lors du backfill, d'une invitation, d'un départ ou d'une dissolution. Reprendre l'échéance existante du compte ; sans droit existant, aucun nouveau droit.

**Fin du lot :** répétition et concurrence sans doublon ; inscription/invitation/départ fonctionnels ; historique privé préservé ; droits et échéances inchangés. Tests Postgres/RLS nécessaires, pas seulement des mocks TypeScript.

### Lot 2 — Un contexte de génération, réservé au compte maître

Conserver `generate-household-meal-v1` comme endpoint canonique pour limiter le changement. Extraire un pipeline commun dans `_shared/keel` si nécessaire ; aucun appel HTTP d'un générateur vers l'autre.

La requête ne propose aucun sélecteur de périmètre personnel/collectif. Le serveur produit un `GenerationContext` comprenant : acteur authentifié, foyer résolu, membre maître, membres servis, propriétaire du plan, périmètre d'écriture, calendrier, droits, quotas et opérations autorisées. Le droit de générer dépend du rôle de maître en base, jamais du nombre de personnes servies ni d'un paramètre client.

| Situation | Résolution serveur |
|---|---|
| Personne seule sans foyer | Ensure du foyer personnel ; rôle maître vérifié ; génération pour une personne. |
| Maître d'un foyer d'une personne | Même endpoint et même pipeline que pour plusieurs personnes. |
| Maître d'un foyer de plusieurs personnes | Génération pour les membres concernés selon les présences et les règles de couverture existantes. |
| Membre secondaire, quelle que soit la demande | Refus `not_owner` avant quota et appel modèle, y compris s'il demande un plan pour lui seul. |

Conserver le garde `not_owner` et l'appliquer à toutes les entrées qui composent, recomposent, éditent un brouillon, adoptent ou remplacent un plan. Vérifier également `replaces`, `draft_id`, `merge_member_id` et le propriétaire du plan en base. Une liste de membres reçue du client ne donne aucun droit supplémentaire. Un ancien client ne peut pas contourner ce contrôle par l'ancien endpoint solo ou par un brouillon historique.

Conserver la résolution du calendrier et du contexte du foyer : pour une personne seule, le maître est cette personne. Les droits et quotas du maître sont vérifiés sans lui imposer de nouveaux droits commerciaux du seul fait du rattachement technique. Les objectifs, données corporelles et protections restent résolus pour chaque mangeur ; le rôle de maître n'autorise pas à substituer ses propres données à celles des autres.

Le moteur reçoit ensuite le même contrat pour N = 1 et N > 1. Les différences légitimes portent sur l'ensemble des mangeurs, les règles du partage et l'affichage, pas sur une seconde équation ou un second applicateur de grammages.

**Fin du lot :** les quatre situations de la table passent par un seul pipeline ou un refus explicite ; aucun membre ne remplace le plan d'autrui ; quota débité une seule fois selon l'opération, avec libération correcte après échec.

### Lot 3 — Résoudre les faits d'une personne une fois, sans dupliquer les pesées

Introduire un objet résolu interne par `member_id`, avec provenance de chaque valeur et distinction `présent / absent / lecture échouée`. Le partager entre l'écran et toutes les étapes de génération.

| Donnée | Autorité |
|---|---|
| Compte lié : poids, taille, sexe, activité | Lecteurs personnels existants (`loadStudentBody`, profil et série datée). Conserver leur règle de sélection des mesures, avec date de calcul explicite. |
| Compte lié : donnée réellement absente | Repli sur une fiche membre existante uniquement pour le champ absent et déclaré. Tracer ce repli. Une lecture échouée n'est pas une absence. |
| Personne sans compte | Fiche membre et date de naissance de `household_members`, avec les gardes existantes. |
| Objectif et rythme de poids | Compte lié : `student_goals` ; sans compte : autorité du roster existante. |
| Appétit, moments légers, habitudes | Sources des champs de fiche/habitudes existants ; absence = neutre, jamais déduite du poids. |
| Sécurité et position du coach | Résolution existante par personne et périmètre, conservant les refus de lecture et les protections TCA/mineur/âge inconnu. |

Pour l'âge d'un compte lié, utiliser la date personnelle canonique ; une contradiction avec la fiche membre ne doit jamais faire passer un mineur pour majeur. Tracer le conflit et appliquer la protection la plus restrictive jusqu'à résolution. Ne pas inventer de date depuis une bande d'âge.

Adapter les écritures de la fiche personnelle pour qu'elles alimentent ces autorités. La saisie d'un poids personnel utilise le parcours existant de mesure ; l'appétit peut rester dans la fiche membre. Supprimer la concurrence entre `bodies` et `lineBodies` pour les calculs. Ne pas exposer le nouvel objet interne aux autres membres ni au prompt.

Centraliser la cible du jour et sa bande avec des entrées identiques. Supprimer toute reconstruction indépendante de l'écran. Si l'entretien n'est estimable que par le raccourci au poids et que l'écart est refusé par la politique actuelle, conserver le refus mais produire un motif explicite `pace_unavailable_missing_body`. Ne pas afficher un rythme comme exécuté quand l'écart vaut zéro pour cette raison. Ce lot n'autorise pas à inventer un déficit sur données manquantes.

**Fin du lot :** une nouvelle pesée modifie la cible et les grammages attendus sans copie vers une seconde table ; mêmes entrées donnent le même centre et la même bande à l'écran et au moteur ; absence, erreur et repli sont testés séparément.

### Lot 4 — Budgets, grammes et couloirs complets pour chaque occurrence

Calculer par `(member_id, date_locale, slot)` :

1. Cible journalière autorisée et ensemble complet des créneaux déclarés/déduits selon les règles existantes.
2. Répartition `slotPlanTargets` avec poids renormalisés, vrais créneaux légers et apports fixes du **jour concerné**. Aucun retrait pain/fromage/dessert hors plan.
3. Distinguer les créneaux du plan, les repas dehors, les apports fixes et les créneaux non couverts. Une génération partielle ne reçoit pas toute l'énergie quotidienne. Ne pas déduire les créneaux attendus des plats que le modèle a produits.
4. Pour l'énergie à composer E > 0, appliquer le contrat ci-dessous avec les tables d'âge existantes. Pour E = 0, aucun dimensionnement par division et aucune portion minimum artificielle ; tracer un éventuel excédent d'apport fixe.

```text
rho = 1,0 kcal/g ; 0,6 pour un créneau léger
bmin = min(E / 1,35, minimum_table)
bmax = min(E / rho, maximum_table)
A = 0,90 / 1,00 / 1,10 pour petit / moyen-ou-inconnu / grand appétit adulte
A = 1 pour les mineurs
Gmax = min(A * bmax, maximum_table)
Gmin = min(A * bmin, Gmax)
Gpref = clamp(A * (bmin + bmax) / 2, Gmin, Gmax)
Dmin = 100 * E / Gmax
Dmax = 100 * E / Gmin
Dpref = 100 * E / Gpref
```

Ces tables et coefficients sont des conventions produit, pas une mesure de capacité gastrique. Les valeurs restent non arrondies dans les calculs. L'arrondi final doit produire des grammes représentables dans les bornes ; un intervalle sans valeur représentable est explicitement incompatible.

Intersecter le couloir avec le plafond de demande de 250 kcal/100 g. Ne pas tronquer un minimum impossible en 250 pour fabriquer un couloir valide. Projeter la préférence dans l'intersection valide.

> ### ⟳ 2026-09-11 · A15 EST RATIFIÉ — `Dpref = Dmin × 1,10`, ET LA MESURE EST LA RAISON
>
> ⛔ **CE PARAGRAPHE RENVERSE CE QUE CE PLAN DISAIT.** Il exigeait
> `Dpref = 100 × E / Gpref` et interdisait que « la formule `Dmin × 1,10`
> remplace silencieusement `Dpref` ». **Décision du propriétaire, 2026-09-11 :
> la formule du plan est écartée, et A15 devient la règle.**
>
> **La mesure qui tranche** (`CHANTIER-DENSITE-PORTIONS-ET-FAST.md` § A15) :
> sur un déjeuner de 1 120 kcal, `Gpref` vaut 475 g, donc la visée
> **236 kcal/100 g**. Or les plats réels mesurés par ce dépôt vivent entre
> **113 et 156** ; un gratin fait 180, des lasagnes 150. On demanderait
> exactement ce que `MAX_ASKABLE_DENSITY_PER_100G` existe pour empêcher — et
> ce qui a déjà été mesuré : **389 demandés au dîner, 126,7 rendus**, consigne
> ignorée sur toute la ligne.
>
> ⚠️ **CE QUI NE CHANGE PAS.** `Dmin` et `Dmax` restent `100 × E / Gmax` et
> `100 × E / Gmin`, non arrondis dans les calculs. La visée reste **projetée
> DANS** l'intersection valide : `Dpref = clamp(Dmin × 1,10, Dmin, Dmax)`. Ce
> qui est écarté est la seule dérivation de `Dpref` depuis `Gpref`.
>
> ⚠️ **ET ÇA NE VAUT QUE POUR LA VISÉE.** Une consigne intenable n'apprend pas
> au modèle à mieux viser — elle lui apprend que ces nombres-là sont
> décoratifs, et c'est ce qui a été mesuré. Les deux BORNES, elles, continuent
> de mordre.
>
> Le code (`portion_sizing.ts`, `densityCorridorFor`) applique déjà A15 ; c'est
> ce plan qui était en retard sur la mesure, pas l'inverse.

Pour une recette partagée/réutilisée, prendre `max(Dmin)` et `min(Dmax)` sur **toutes ses occurrences et tous ses mangeurs**. Grouper par recette effective, pas par seul nom de créneau. Des déjeuners différents peuvent avoir des couloirs différents. Si une recette n'est pas encore identifiée avant composition, transmettre les contraintes des cases ; vérifier le regroupement que le modèle propose avant de l'accepter.

Toujours transmettre les deux bornes, même si Dmin = 100 ou 60. Retirer le filtre `min > floor` de `requiredDensityFor`. Supprimer les seuils génériques contradictoires lorsque le couloir est connu. Sous protection d'affichage, transmettre la contrainte du plat anonymement ; ne pas perdre Dmax en la fondant dans un simple plancher.

Si le couloir est vide : tenter une redistribution de la même journée/personne sur les seuls créneaux déjà acceptés et modifiables, avec les poids existants, saturation aux capacités et somme conservée. Les apports fixes, repas dehors, cases consommées/gelées restent fixes ; un créneau léger ne dépasse pas son budget initial. Encapsuler la faisabilité dans une fonction pure utilisant les mêmes bornes ; ne pas ajouter une seconde arithmétique dans le handler. Si aucune allocation compatible n'existe, conserver le conflit et demander une recette séparée ou un complément ciblé. Aucun nouveau créneau automatique et aucune baisse silencieuse de la cible journalière.

**Fin du lot :** couloirs calculés et transmis pour toutes les cases calculables ; intersection vide détectée ; budgets conservés ; 250 kcal garde bien sa borne supérieure ; N = 1 bénéficie du même contrat que N > 1.

### Lot 5 — Mesurer puis appliquer les quantités finales dans le moteur unique

Conserver dans le prompt la référence CIQUAL, le poids cuit prêt à servir, les préparations et l'explication de calcul. `density_check` est une déclaration contrôlée, jamais la mesure de référence.

Mesurer avec les fonctions de production : ingrédients résolus, état cru/cuit explicite, rendements, eau absorbée une seule fois, tirages réels des préparations. Distinguer composition issue du référentiel, composition complétée par modèle et estimation par bornes de groupe. Un complément de référentiel par modèle n'est pas une donnée CIQUAL vérifiée.

Appliquer `facteur = E / kcal_part_standard`, puis les grammes cuits correspondants, avec les applicateurs partagés existants. Vérifier les bornes **pour chaque personne**, puis agréger les portions des contenants partagés. Un contenant de quatre personnes peut dépasser 700 g ; ce sont ses portions individuelles qui se contrôlent. Les portions théoriques internes restent disponibles même si l'UI n'affiche pas des boîtes nominatives pour chacun.

Les plafonds d'ingrédients, compléments, corrections protéiques, arrondis, mutualisations et modifications de préparations sont suivis d'une nouvelle mesure. Ne pas réappliquer `portion_scaling` après ce calcul. Le résultat mesuré doit être le payload réellement enregistré, y compris courses, usages et quantités des boîtes.

Protéines : réutiliser les objectifs et poids de référence existants ; contrôler par personne et journée/couverture, apports fixes inclus une seule fois. Correction déterministe compatible avec calories, grammes et identité du plat ; sinon inclure le manque dans la prochaine recomposition. Ne pas déclarer un plan conforme parce que seules ses calories passent.

**Fin du lot :** cas à faible/forte densité, grande/petite énergie, N = 1 et N > 1 vérifiés sur les quantités finales ; aucune valeur cible recopiée à la place de l'énergie mesurée ; dépassement restant explicitement non conforme.

### Lot 6 — Deux réparations globales et une validation finale effective

Remplacer la succession de réservations statiques par une boucle commune :

```text
composer une première version
résoudre, mesurer, dimensionner et collecter tous les défauts
tant qu'il reste une tentative (maximum 2) et du temps :
    construire une seule instruction avec les défauts réparables présents
    recomposer ; mesurer et contrôler la candidate
    conserver la dernière candidate utilisable ; rejeter une régression de sécurité
finaliser les quantités ; recontrôler le payload exact ; persister ce payload
```

Priorité dans l'instruction : sécurité, présence des repas, compatibilité calories/grammes/densité, protéines, préférences. Un contrôle déterministe ne consomme pas de tentative. Un défaut protéique seul peut déclencher une tentative lorsque le budget est disponible. Supprimer les branches d'ancienne relance ou les faire retourner des défauts ; elles n'appellent plus le modèle indépendamment.

Budget : compter les transmissions de recomposition au fournisseur, échecs et replis inclus, pas seulement les appels logiques. Un repli après échec de la composition initiale consomme lui aussi un des deux essais supplémentaires. Aucun retry caché multiplié par une chaîne de modèles. Les appels auxiliaires de résolution alimentaire sont identifiés séparément, bornés, mutualisés par terme/état dans la requête et soumis à la même échéance ; ils ne peuvent réécrire une recette sous couvert d'un appel auxiliaire.

Conserver une échéance absolue par requête et la réserve de finalisation. Recalculer le temps restant avant chaque tentative fournisseur et chaque attente ; `timeout = 0` signifie ne pas appeler, jamais reprendre le timeout par défaut. Le timeout du premier modèle ne doit pas être réutilisé intégralement par son repli. Ce travail corrige le budget logiciel ; il ne prétend pas résoudre les 546.

Fast : vérifier les paramètres réellement envoyés aux deux API et tracer le palier effectivement obtenu. Effort initial N = 1 : `medium`, N > 1 : `high`, comme demandé précédemment ; réparations : `high`. Ces paramètres ne créent pas deux pipelines. Un appel de secours alimentaire déclenché par la génération reçoit Fast avec son modèle actuel ; hors génération, son comportement reste celui de son appelant.

Sécurité finale :

- Énumérer toutes les violations applicables par personne, règle, plat et préparation. Le premier match par plat ne suffit pas pour comparer deux versions.
- Rejeter une nouvelle violation même si une ancienne disparaît ou si le nombre reste identique. Tester aussi l'ajout d'une seconde violation derrière une première inchangée.
- Contrôler ingrédients et préparations transitivement, attribution aux mangeurs et règles collectives. `applyHouseRuleLock` seul ne remplace pas les allergies individuelles.
- Brancher/compléter `finalPlanGate` sur la génération comme sur l'adoption, avec sévérités explicites. Une politique par défaut `count` ne suffit pas pour une violation bloquante.
- Contrôler le snapshot exact après toutes les transformations. Aucun contrôle suivi d'une mutation non revérifiée ; aucun snapshot de plats associé aux préparations d'une autre version.
- Une référence indispensable manquante ne se « répare » pas en retirant silencieusement un apport. Recalculer et rendre l'incomplétude visible si une suppression structurelle est réellement permise.

**Fin du lot :** au plus deux essais supplémentaires fournisseur, aucun rattrapage protéique interdit structurellement, aucune sortie dangereuse ou référence indispensable invalide acceptée, écarts nutritionnels résiduels distingués du refus de sécurité.

### Lot 7 — Basculer l'UI et retirer l'ancien générateur

Retirer le choix de moteur de `chooseGenerator` : tous les appels autorisés du compte maître visent l'endpoint canonique. Adapter les constructeurs de requêtes, brouillons, édition, adoption, préparation du prochain plan et remplacements. Supprimer les branches qui choisissent un moteur selon le nombre de membres. Un membre secondaire ne voit aucun bouton de génération ou de recomposition ; le serveur refuse également ses appels directs. Ne pas introduire de choix « pour moi / pour le foyer ».

Une personne seule continue de voir « mon plan » et ses réglages personnels. Ne pas imposer un nom de foyer, une invitation, une facturation collective ou un onboarding supplémentaire. Ajouter quelqu'un agrandit le foyer existant. Conserver le parcours explicite d'invitation pour rejoindre un autre foyer.

Retirer les cases d'extras pain/fromage/dessert des écrans concernés, leurs résumés et effets énergétiques ; les anciennes valeurs stockées sont ignorées et ne réapparaissent pas à l'édition. Conserver les autres usages légitimes de ces aliments et les apports fixes. Clarifier le sens de l'appétit et de « léger » dans les traductions existantes.

Conserver la lecture des anciens plans personnels sans recomposition forcée. Ne pas les convertir en plans collectifs accessibles à de futurs membres. Vérifier le passage d'un plan historique à un nouveau plan du moteur unique et les droits après invitation/départ.

Supprimer `generate-meal-v1` et les helpers réellement exclusifs devenus inutilisés après la preuve de parité. Conserver les types/parseurs partagés et les lecteurs historiques encore utilisés. Adapter les tests et les inventaires d'endpoints ; ne pas retirer leurs assertions métier pour faire disparaître les rouges.

Pour une transition avec anciens clients, seul un adaptateur temporaire sans calcul ni prompt propre est permis : authentification, traduction du contrat historique, appel du même handler partagé avec le contrôle de rôle maître. L'ancien droit de génération personnelle d'un membre secondaire n'est pas conservé. Pas de redirection HTTP aveugle ni seconde génération. Il a un test d'équivalence pour le maître, un test de refus du secondaire, un suivi d'usage et une condition explicite de retrait. Tant qu'il subsiste, annoncer « ancien endpoint de compatibilité », pas « endpoint supprimé ».

**Fin du lot :** nouveaux clients sans appel à la lane solo ; parité des gestes et historique ; aucun second moteur ; état précis du retrait de l'éventuel adaptateur.

### Lot 8 — Corriger le banc et prouver la chaîne sans nouvelle grande campagne

Le banc réutilise le contexte et les fonctions de production. Archiver avec chaque fixture : requête, mangeurs autorisés et présences attendues, faits résolus/provenances, objectifs et apports fixes par date, index alimentaire effectif, code/version et payload final. Restaurer l'index exact du run ; ajouter globalement le sas actuel ne prouve pas ce que le run historique avait utilisé.

- Valeur absente = `unknown` ou erreur du banc ; jamais zéro, succès, ni `not_applicable` inventé.
- Couverture attendue issue de la demande et des présences. Ne pas utiliser le nombre maximal de repas effectivement générés pour décider qu'une journée est complète.
- Plans partiels évalués contre leur budget couvert. Un repas attendu manquant est un défaut de livraison, pas une journée « non applicable ».
- Toute personne dimensionnable possède une mesure interne, même en service collectif sans boîte nominative.
- Compter chaque violation de grammes et lister ses occurrences. Une médiane de taux ne démontre pas que toutes les portions passent.
- Sécurité : résultat explicite du contrôle final, y compris zéro quand le contrôle a réellement tourné. Aucun « zéro exclusion » dérivé d'un champ absent.
- Distinguer générations demandées, transmissions fournisseur, tentatives HTTP applicatives et erreurs de plateforme. Éviter les agrégations de logs de plusieurs requêtes sur la seule proximité horaire.
- Exposer séparément conformité calorique, protéique, de masse, de densité, couverture et sécurité. `conformant` exige toutes les propriétés applicables.

Critères : centre/bande écran-moteur identiques à l'arrondi d'affichage près (≤ 1 kcal) ; conservation des budgets avant arrondi ; repas à ±10 % et journée à ±5 % de la cible couverte ; tous les grammages calculables dans les bornes ; protéines au plancher applicable ; toutes les références nécessaires valides et aucune violation de sécurité. Les gardes existantes restent prioritaires sur ces tolérances. Une sortie livrée avec écart ne passe pas ces critères.

Tests minimaux obligatoires :

| Famille | Cas |
|---|---|
| Identité/SQL | nouveau compte, ancien sans foyer, deux ensure simultanés, backfill répété, membre existant, invitation depuis foyer personnel, départ, suppression de compte, conservation essais et droits. |
| Autorisation | maître seul et maître de plusieurs personnes autorisés ; secondaire toujours refusé, même pour un seul mangeur ; appels directs et ancien endpoint, brouillon/édition/adoption/remplacement, identifiants falsifiés, RLS historique après rattachement, perte du droit à l'entrée comme secondaire et retour du droit après départ comme maître. |
| Parité N = 1 | toutes les fonctionnalités du lot 0, dont garde-manger, repas isolé, fenêtre partielle, coach, adoption et édition de cases. |
| Corps/énergie | pesée récente, série vide avec fiche, champ absent, lecture échouée, date contradictoire, mineur, âge inconnu, protections TCA, conditions annulant l'écart, absence de taille nommée. |
| Allocation | 1 à 6 créneaux selon contrat d'entrée ; repas léger, appétits, apport fixe intermittent, E = 0, apport fixe excédentaire, repas dehors, cases gelées, redistribution faisable/impossible. |
| Densité | 250 kcal → couloir conservé ; léger 588 kcal avec plafond 700 g → minimum 84 ; Dmin = plancher générique ; couloir trop haut/bas, vide, sans arrondi représentable ; recette partagée et répétée avec Dmax différent selon jour. |
| Mesure/service | riz cru/cuit, eau, préparation tirée plusieurs fois, recette très dense/peu dense, complément, arrondi, contenants partagés, modification finale réévaluée ; N = 1, 2, 4 et limite supportée. |
| Réparations | aucun défaut = zéro appel ; protéines seules = réparation possible ; défauts multiples regroupés ; deux échecs ; régression de sécurité ; repli fournisseur ; temps restant nul ; résultat final persistant réellement contrôlé. |
| Banc | champ sécurité absent, ingrédient inconnu, source alimentaire estimée, repas attendu absent, boîte collective, dépassement isolé masqué par médiane, index du run absent, HTTP 546 classé non testé. |

Exécuter les tests ciblés, les suites partagées concernées, les tests frontend et le build. Les tests SQL doivent utiliser des fixtures dédiées ; leur préparation et leurs commandes respectent AGENTS.md. Aucun usage d'un compte réel comme fixture.

Les tests d'intégration emploient des réponses fournisseur enregistrées/contrôlées et passent par les vrais handlers, applicateurs et adaptateurs de stockage. Un test qui ne fait que chercher une chaîne de caractères ne prouve ni l'autorisation ni la conformité du résultat.

Les générations réelles et la fiabilité edge restent **non validées** tant qu'un banc en environnement effectif n'a pas abouti. Réutiliser les archives exploitables pour l'analyse hors ligne ; ne pas dépenser une nouvelle campagne pour retrouver les défauts déterministes ci-dessus. Le taux empirique de réussite après réparation (objectif antérieur ≥ 90 %) n'est pas démontrable avec des mocks : conserver ce critère pour la campagne ultérieure, sans inventer son résultat.

## 4. Livraison, ordre de mise en service et règles de compte rendu

Ordre de livraison : primitive et migrations compatibles → résolveur de contexte/données → moteur et contrôles corrigés → tests et droits validés → bascule des clients → retrait de l'ancien endpoint après compatibilité. Ne pas router les utilisateurs vers un schéma pas encore installé. Préparer le retour à la version précédente sans suppression des nouveaux rattachements ni altération de l'historique.

AGENTS.md exige que l'humain tape lui-même `supabase db push` et `supabase functions deploy`, et interdit à l'agent le SQL direct destructif. Écrire et vérifier les migrations/scripts est dans le périmètre ; leur application respecte cette frontière. Préparer d'abord les fichiers et contrôles, puis fournir les commandes exactes adaptées à l'environnement identifié. Ne jamais contourner cette règle par psql, Management API ou wrapper. Un besoin d'application humaine n'empêche pas de terminer les modifications et les tests indépendants.

Mettre à jour `docs/SOCLE.md` **après implémentation**, pour décrire l'état effectif : contexte autorisé → faits résolus → cible → budgets par date/créneau → bornes → couloir → composition → mesure → grammages → au plus deux réparations → contrôle du payload → persistance. Mettre à jour les documents qui imposaient deux lanes et les commentaires faux, sans transformer chaque fonction en historique de chantier.

Le compte rendu final tient dans un tableau : lot, fichiers modifiés, propriété prouvée, commande/résultat du test, reste à faire. Employer ces états : `implémenté et testé`, `implémenté non testé`, `non implémenté`, `application humaine requise`, `validation edge différée (546)`.

Interdictions de compte rendu :

- Pas de « c'est fait » si une étape requise manque ; pas de retrait de périmètre décidé unilatéralement.
- Pas de « le modèle est responsable » quand mesure, application ou contrôle sont absents.
- Pas de valeur inconnue présentée comme zéro ; pas de moyenne qui efface un dépassement individuel.
- Pas de tests assouplis ou de seuils abaissés pour obtenir du vert.
- Pas de promesse « sans faille ». Livrer les propriétés testées, leurs contre-exemples et les limites restantes.

L'objectif de cette livraison est **un moteur unique correctement branché et vérifié hors panne de plateforme**. La validation réelle sous contrainte edge est explicitement reportée ; elle n'est ni réussie ni un motif pour laisser les lots applicatifs inachevés.
