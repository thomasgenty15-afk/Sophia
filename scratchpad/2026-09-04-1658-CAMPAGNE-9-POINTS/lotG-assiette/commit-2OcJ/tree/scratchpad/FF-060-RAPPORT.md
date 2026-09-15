# FF-060 — Le parcours d'entrée · rapport

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-12 · **Commits**
`8002fa1c`, `3d957179`, `e65d398f`

> **En une phrase.** L'entonnoir existe, il est branché, et il se termine par
> un plan — prouvé par deux vrais runs modèle. Les deux défauts que le chantier
> nommait (D1, D2) sont refermés, et **quatre autres**, mesurés au navigateur
> pendant la construction, l'ont été aussi.

---

## 1. Lot par lot

| Lot | État | Preuve |
|---|---|---|
| **1** — module pur `onboarding.ts` | ✅ livré | 45 tests · `tsc -b` 0 · **deux mutations jouées** (§1.1) |
| **2** — l'écran `/app/setup` et sa reprise | ✅ livré | parcours navigateur complet · reprise après rechargement · 320 px mesuré |
| **3** — étape 2b, les bouches et l'accès | ✅ livré | foyer de 4 créé **par l'écran** · lien d'invitation rendu · R6 prouvée par le plan |
| **3B** — D2, l'objectif semé à la réclamation | ✅ livré | migration `20260812250000` · 5 assertions SQL neuves, 98 PASS |
| **4** — le bouton qui compose | ✅ livré | 2 runs réels · refus nommé remonté et affiché dans ses mots |
| **5** — couture et fiche | ✅ livré | `resolveHomePath` prouvé **en vrai** (§5) · fiche FF-060 · deux README |

### 1.1 Lot 1 — les deux mutations, jouées et consignées

Le chantier demande de **muter la garde pour la prouver**. Fait, deux fois :

**D1.** Dans `personMisses`, remplacer
`missing.push(carriesGoal ? "adult_without_birth_date" : birthDateId)` par
`missing.push(birthDateId)` — c'est-à-dire désarmer D1 en gardant le refus
générique :

```
× D1 … > rend le motif NOMMÉ, pas le motif générique de date
× D1 … > s'applique au maître, par la même fonction
Tests  2 failed | 41 passed (43)
```

Exactement les deux tests D1, et eux seuls. **Un test qui n'aurait asserté que
`ok: false` serait resté VERT** — la date manque de toute façon. C'est pour ça
que le motif nommé **remplace** le générique au lieu de s'y ajouter.

**Le consommateur.** Renommer un consommateur (`#goalApplies` → `#goalAppliesX`) :

```
× le catalogue des questions > résout chaque consommateur sur le disque
+ "member_birth_date: « goalAppliesX » introuvable dans …/household.ts"
```

La règle mère du dépôt a un gardien : une question dont le lecteur disparaît
fait rougir la suite **le jour de la suppression**.

---

## 2. Le tableau des refus (lot 4)

`grep -c 'error: "'` → **17** dans `generate-meal-v1`, **26** dans
`generate-household-meal-v1`. Chacun est **fermé par une question**, **fermé
par une constante ou par le routage**, ou **rendu comme une phrase** — vérifié :
les 27 jetons distincts sont tous dans `EDGE_REFUSAL_KEYS`, table déjà testée
contre les sources par `planRefusals.int.test.ts`.

| Refus | Traitement |
|---|---|
| `goal_required` (les DEUX fonctions) | **fermé par la question `own_goal`** — le seul qui compte, et celui qui tombait après toute la saisie |
| `mode_required` | fermé par la constante `mode: "to_shop"` |
| `pantry_required` | fermé par la même constante (n'existe que sur `from_pantry`) |
| `window_required`, `bad_window` | fermé par la constante `window: {kind:"until_sunday"}` |
| `window_beyond_this_week` | fermé par construction : `until_sunday` ne dépasse jamais dimanche |
| `unknown_intent`, `replaces_required` | fermé par `intent: "prepare_next"` + `replaces: null` |
| `unknown_operation`, `merge_member_required`, `unmerge_member_required` | fermé par l'absence d'`operation` (défaut = `compose`) |
| `no_household`, `empty_household` | fermé par l'étape 1 **et** le routage (≥ 2 bouches) |
| `not_owner` | fermé par `isOwner` dans le routage — voir le défaut #4 §3 |
| `all_members_have_own_plan` | impossible au premier plan : personne n'a validé de plan |
| `window_fully_away` | l'entonnoir ne collecte pas les absences (`away_days` est `better`) |
| `plan_overlaps_existing` | fermé par le parcours (`hasPlan`), **et rendu comme phrase** — vérifié en vrai, §4 |
| `no_coach` | fermé **en amont** par `/start` (`keel_free_signup_available`) : on ne crée pas de comptes qui ne peuvent pas marcher. Phrase si ça arrive quand même |
| `household_frozen` (402) | hors périmètre (un compte neuf n'a pas d'essai expiré) → phrase |
| `Unauthorized`, `local_day_unresolved`, `safety_constraints_unreadable` | phrases : session périmée, fuseau illisible, fail-closed de sécurité |
| `empty_meal`, `meal_unparseable`, `model_returned_tool_call`, `plan_not_written`, `house_rule_violated` | après le modèle. Aucune question ne les ferme → phrases qui disent que le plan précédent est intact |

**Une correction au chantier.** `coach_has_no_doctrine` n'est **pas** un refus
des générateurs de repas : il appartient à `generate-week-plan-v1`. Le jumeau
côté repas est `no_coach`. Traité comme la fiche le demande — aligné sur la
décision de `/start`, pas un troisième comportement.

---

## 3. Les défauts trouvés **pendant** la construction

Aucun n'était dans le chantier. Les quatre sont mesurés au navigateur, pas
déduits.

**#1 — Un brouillon fusionné depuis la fermeture React.**
`onChange({ ...draft, ...patch })` part de l'état du **dernier rendu**. React
groupe les mises à jour d'un même tick : deux réponses cochées coup sur coup
partent du même état de départ et **la seconde efface la première**. Mesuré :
trois moments de repas cochés d'affilée n'en laissaient qu'un, sans rien
signaler. → mises à jour fonctionnelles partout.

**#2 — « Aucune allergie » n'était écrit nulle part.** Une table vide ne
distingue pas « rien à déclarer » de « on n'a jamais demandé ». Au
rechargement, `canGenerate` réclamait `member_allergies` et la ligne n'offrait
**aucun champ** pour y répondre : parcours mort, sans message, sur la seule
question dont la mauvaise réponse est dangereuse. → l'accusé
(`practical_constraints.allergy_check`) est une **réponse**, pas un drapeau ; et
une ligne sans réponse affiche désormais le sélecteur.

**#3 — L'ordre des écritures.** Cet accusé se fusionne dans la ligne
`student_goals` **du maître**, qui n'existe qu'une fois sa direction posée.
Ajouter des bouches avant créait bien les lignes puis échouait sur l'accusé —
trois bouches en base dont la question de sécurité restait « jamais posée ». →
l'étape 2b est gatée derrière « ma direction », avec la copie qui existait déjà
(`household.me.unlock`) et qui est juste.

**#4 — Un secondaire n'est pas un maître.** Quelqu'un qui a réclamé son profil
reçoit `not_owner` aux quatre gestes, et `generate-household-meal-v1` lui rend
403. Router sur le seul nombre de bouches l'aurait envoyé droit dans un refus
que rien ne peut fermer. → `FunnelFacts.isOwner` ; son entonnoir est celui
d'**une** personne, et son plan est **personnel** (D2 du modèle foyer).

---

## 4. Les épreuves de réel

Pile locale, vrais appels modèle, JWT vérifié (`check-local-jwt-alg.sh` vert),
Kong étendu avant les runs longs.

| Épreuve | Résultat |
|---|---|
| **Solo, bout en bout** | plan `personal` écrit : **15 plats, 5 jours**, `mode=to_shop` |
| **Foyer, bout en bout** | plan `household` écrit : **15 plats, 5 jours, 4 portions nommées** — `["Nora","Alex","Theo","Mia"]` |
| **R6 — l'invitation ne bloque pas** | la portion d'**Alex** est dans le plan alors que son invitation était **émise et non consommée** |
| **Le refus, dans ses mots** | second appui → le vrai `plan_overlaps_existing` remonte et l'écran affiche *« Those days sit inside a plan you already have… »*, pas « non-2xx status code » |
| **La reprise** | rechargement complet à mi-parcours → retombe à l'étape 3, rien à ressaisir |
| **`resolveHomePath`** | un compte neuf se connecte et atterrit **sur `/app/setup`**, pas sur `/app/today` |
| **D2, chemin réel** | avant : roster `muscle_gain`, 0 ligne `student_goals`. Après réclamation : roster **toujours** `muscle_gain`, et la ligne du titulaire porte `muscle_gain` / `en-GB` |
| **320 px** | `docW == clientW == 320`, **zéro débordement horizontal** mesuré |
| **1280 px** | capture prise, bouton de fin correctement grisé tant que `canGenerate` refuse |

**Un run échoué, consigné.** Le premier appui sur « Build my first plan » côté
foyer a rendu un non-2xx après 139 s (isolate terminé — la pile locale est
partagée et un autre lane y faisait tourner ses crons). Le **même payload**,
rejoué immédiatement, a rendu 200 et écrit le plan. Ce n'est pas un défaut
produit ; c'est l'environnement. L'écran, lui, s'est comporté comme prévu : le
jeton étant illisible, il a affiché le message brut plutôt qu'une phrase
générique inventée.

---

## 5. Le chronomètre (lot 3)

**Foyer de 4 bouches, créé par l'écran** — 1 maître (Nora, `health`), 1 conjoint
adulte à objectif divergent (Alex, `muscle_gain`), 2 enfants dont une allergique
(Mia, arachide) :

- **saisie** : de l'étape 1 au dernier « Add », **moins d'une minute** ;
- **⚠️ et ce chiffre n'est pas un chiffre humain.** Le parcours a été piloté par
  script : pas de lecture, pas d'hésitation, pas de frappe. Il **borne par le
  bas**, il ne mesure pas l'utilisateur. Le seul enseignement honnête est que
  **rien dans le produit** n'ajoute de latence à la saisie — le réseau local
  répond en dizaines de millisecondes ;
- **génération** : 36 s (mesuré, `X-Kong-Upstream-Latency: 36717`) sur l'appel
  qui a abouti ; 128 s sur le run solo. **C'est elle qui domine**, d'un facteur
  100, et la cible « sous 3 minutes » est donc décidée par le modèle, pas par
  le nombre de champs.

**Un vrai chronomètre humain reste à faire**, et c'est le trou honnête de ce
lot : il demande un humain devant l'écran.

---

## 6. Les décisions (§6 du chantier)

**1. La route : `/app/setup`.** Aucune collision (`grep 'path=' App.tsx`
vérifié). Garde `KeelHouseholdRoute` — la même que `/app/plan`, et pour la même
population : quelqu'un qui a réclamé son profil n'est l'élève de personne
(`keel_role` reste NULL, exprès), et c'est justement quelqu'un qui doit régler
sa direction. *Rejeté* : `KeelStudentRoute`, qui aurait rendu l'écran
inatteignable à cette population.

**2. Le nom par défaut du foyer : `Home`.** *Rejeté* : un dérivé du prénom — à
l'étape 1 le prénom n'a pas encore été demandé et `profiles.full_name` peut être
vide ; un défaut qui dépend d'un champ facultatif est un défaut qui casse.
*Rejeté* : demander le nom — aucun consommateur au moment où on le demanderait.

**3. La forme de l'étape 1 : trois cartes**, pas un sélecteur de nombre. Les
trois réponses ne sont pas trois valeurs d'un même axe : ce sont trois produits
(un plan, un pot pour deux, une maison). Une carte peut porter la phrase qui le
dit ; un `<select>` non. *Rejeté* : le sélecteur, qui aurait aussi rendu « 7 »
saisissable sans que rien ne change à l'écran.

**4. La question annexe au solo (« tu vis avec d'autres ? ») : RETIRÉE.** Je ne
peux nommer aucun consommateur dans le dépôt — aucun écran, aucun message, rien
ne lirait la réponse. C'est la règle mère appliquée à moi-même.

**5. Lot 3B : option ① appliquée**, migration comprise. Voir §1 et §4.

**Deux décisions de plus, que le chantier ne prévoyait pas** :

**6. `own_first_name` n'est pas demandé en solo.** Vérifié : `generate-meal-v1`
ne nomme le mangeur **nulle part**. Le demander serait exactement ce que la
règle mère interdit. Il redevient « faux si absent » dès qu'il y a un foyer —
`household_turn_context.ts` filtre en silence toute portion dont le prénom est
vide, et la personne disparaît du plan sans un mot.

**7. `own_height_cm` et `own_gender` sont `wrong`**, bien que §3.1 ne les compte
pas dans les « trois par personne ». Ce qui départage est le **second membre**
de la règle : « moins bon → après le plan, **au moment où on peut montrer le
plat que ça change** ». Une taille ne change aucun plat en particulier ; elle
change toutes les quantités, invisiblement. Il n'existe donc **aucun moment
postérieur** pour la demander, et « après » signifierait jamais.

---

## 7. Ce que je n'ai pas pu vérifier, et ce qui reste ouvert

1. **Le chronomètre humain.** §5. Le chiffre rapporté est une borne basse
   machine, pas une mesure d'utilisateur.
2. **L'élève d'un coach (`/join`)** suit le même entonnoir — la seule différence
   est le propriétaire de doctrine, que l'entonnoir ne touche pas. **Rien
   branché à faire, mais rien joué de bout en bout sur ce chemin.**
3. **Le corps des autres bouches** (taille, poids, sexe) reste non collecté :
   quatre champs de plus par bouche est le mur que cet écran existe pour éviter.
   Le moteur sert alors une part standard. **Où ces champs se demandent ensuite
   n'a pas de réponse** — noté en question ouverte dans la fiche.
4. **`household_rls_test.sql` est rouge à l'assertion 27, AVANT mon travail.**
   Vérifié contre `git show HEAD:` : 93 PASS puis `FAIL 27` au baseline, 98 PASS
   puis le même `FAIL 27` avec mes cinq assertions. La suite s'arrête là
   (`ON_ERROR_STOP=1`), donc **~35 assertions en aval ne s'exécutent plus pour
   personne**. Cause : la fixture insère dans `student_generated_meals` sans
   `plan_kind`, que la policy de `20260812190000` exige désormais d'un
   non-maître. Correctif d'une ligne, **pas ma lane** — consigné, pas réparé.
5. **Trois tests frontend rouges, préexistants**, d'autres lanes : `coverage-guard`
   (les fonctions `household-merge-notices-v1` et `keel-daily-recommendation-v1`,
   et le trigger `household_member_bodies_touch` de `20260812220000`, non
   déclarés) et `planRefusals` (sept clés `household.error.*` orphelines du même
   lot). Vérifiés présents à HEAD.
6. **La ligne d'index FF-060 du README racine a atterri dans le commit de la
   migration** (`3d957179`) plutôt que dans celui de l'écran. Sans conséquence :
   le hunk ne contient **que** mes lignes (3 insertions), les lignes FF-051→059
   d'autres sessions sont restées non commitées dans l'arbre de travail — je les
   ai délibérément laissées, leurs fiches n'étant pas encore suivies par git.

---

## 8. Incident — contamination d'une fixture d'une autre session

**Signalé sans détour, parce que c'est une écriture dans les données de
quelqu'un d'autre.**

Le premier parcours navigateur a été joué sous la **mauvaise identité**. Le
jeton de session Supabase est stocké sous `sb-127-auth-token`, une clé indexée
sur l'**hôte de la base** (`127.0.0.1`) et non sur le port de l'app : la session
d'une autre session QA était déjà là, et mon `/auth` n'avait pas pris.

**Ce qui a été écrit** sur `qa-student-178655216287781a9a8@test.dev`
(`82b17260-…`) : `profiles.birth_date/height_cm/gender`, une ligne
`student_goals` (`fat_loss`), et **une contrainte de sécurité `allergy/medical`
sur l'arachide**.

**Restauré à l'identique**, en comparant aux fixtures sœurs du même lot
(`birth_date = 1990-01-01`, taille et sexe NULL, aucune ligne `student_goals`,
aucune contrainte) :

```
 birth_date | height_cm | gender     goals    constraints
 1990-01-01 |           |              0            0
```

Les comptes que j'ai créés sont préfixés `ff060_` (`ff060_solo`, `ff060_house`,
`ff060_spouse`) et laissés en place : ils portent les preuves des §4 et §5.

---

## 9. Commandes à risque — pour l'humain

**Aucune n'a été exécutée par l'agent.** La migration a été appliquée en local
par `psql` selon le protocole du chantier (jamais `db reset`).

Pour porter FF-060 en distant, dans cet ordre :

```bash
supabase db push
```

```bash
supabase functions deploy generate-meal-v1 generate-household-meal-v1
```

> `db push` porte `20260812250000_household_claim_seeds_goal.sql`.
> Le `functions deploy` n'est **nécessaire que si** d'autres lanes ont modifié
> ces deux fonctions : **je n'ai touché aucune fonction edge**. Aucun secret,
> aucun `config push`, aucun `link` n'est requis par ce chantier.
