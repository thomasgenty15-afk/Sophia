# RAPPORT FF-011 — Le soutien groundé

**Date** : 2026-08-08 · **Branche** : `ff-001-quotidien-du-coach`
**Fiche** : `docs/fonctionnalites/conversation/FF-011-le-soutien-grounde.md`

---

## 1. État initial constaté (avec preuves)

**La fonctionnalité existait déjà**, contrairement à l'état présumé « à construire ».
Elle a été livrée par une session antérieure, commit `088d323a` *« la ceinture
anti-encouragement-creux du soir s'étend au chat »*.

| Élément | Fichier | Preuve |
|---|---|---|
| Module FF-011 | `supabase/functions/_shared/keel/grounded_support.ts` | 359 lignes, en-tête FF-011 explicite |
| Détecteur de découragement | idem `:79-125` | `DISCOURAGEMENT_PATTERNS`, liste fermée FR+EN |
| Matière | idem `:141-150` | `supportGround()` → `day` \| `week` \| `none` |
| Bloc de prompt | idem `:168-228` | `groundedSupportBlock()` |
| Ceinture de sortie | idem `:317-359` | `applyGroundedSupportBelt()` |
| Chargement de la matière | `sophia-brain/router/run.ts:1393-1399` | `loadDayFacts` + `supportGround`, filtrés par le plancher |
| Injection du bloc | `run.ts:2390-2391` | dernier des sept blocs |
| Application de la ceinture | `run.ts:2487-2520` | dans `finalVisibleText`, hors route safety |
| Tests | `grounded_support_test.ts` | 20 tests, **tous verts** au départ |

Aucune seconde liste de motifs : `VERDICT_PATTERNS`, `findQualifyingVerdict`,
`allowedNumbers`, `allowedWeekNumbers`, `numberValue` sont **importés** de
`daily_recap.ts` (`grounded_support.ts:39-46`). **R2 tenue.**

### Suite Deno de départ

`52 passed | 0 failed` sur `grounded_support_test.ts` +
`keel_ack_without_effect_guard_test.ts` + `run_keel_ack_guard_test.ts`,
environnement purgé. **Aucun rouge préexistant** sur mon périmètre.

---

## 2. La cicatrice `ack_guard` — ce qu'elle fait AUJOURD'HUI

La note de mémoire `ack-guard-eats-grounded-citations` affirmait qu'une citation
groundée est **« toujours supprimée »** sur un tour de découragement.

**Verdict : faux en cette généralité, vrai — et central — dans une forme précise.**

### Le mécanisme, établi par la lecture puis par la mesure

`stripKeelAckWithoutCommittedEffect` (`run.ts:2682`) s'arme sur l'**intersection**
de deux conditions indépendantes :

1. `detectCompletedFactReport(message).reports_completed_fact === true` ;
2. zéro effet committé — **toujours vrai** sur un tour de découragement.

Puis il retire **la phrase entière** qui porte une formule d'accusé, et **appose
une question de liage de plan**.

L'intersection contient la phrase d'ouverture de la fiche elle-même :
« cette semaine a été horrible, **j'ai rien tenu** » — `j ai` + `rien` + `tenu`
est un rapport de fait accompli pour `ack_guard`, et un marqueur de découragement
pour FF-011.

### Cartographie déterministe (probe, ordre exact de `finalVisibleText`)

Message armant les deux gardes, citations groundées réalistes :

| Langue | Citations mangées |
|---|---|
| FR | **4 / 10** |
| EN | **5 / 8** |

**Ce qui survit** : la citation *nue* (« Tu as coché 5 plats sur les 7 que le plan
portait. »).
**Ce qui est mangé** : toute citation décorée d'un marqueur d'accusé — `✅`, `✔`,
`🟢`, « C'est noté », « Noted. », « logged your », « it's recorded in your log ».

> ⚠️ **Un premier probe EN a rendu 0/8 — un vert faux.** Le message que j'avais
> choisi (« I haven't managed anything ») **n'arme pas** `ack_guard` : `managed`
> n'est pas une base verbale après auxiliaire nié. La garde n'était pas clémente,
> elle était absente. Corrigé, puis 5/8. C'est la famille T-15, et elle m'a piégé
> dans mon propre outillage.

### Confirmation en RUN RÉEL

3 élèves neufs, historique vide, 5 coches en base, message
« this week has been horrible, I missed all my meals this week » :

```
[Warning] [keel] ack_guard triggered count=1 stripped=1 locale=en object=yes
[Warning] [keel] ack_guard triggered count=1 stripped=1 locale=en object=yes
[Warning] [keel] ack_guard triggered count=2 stripped=1 locale=en object=yes
```

**3 morsures / 3 tours** (le bras témoin ne peut pas armer la garde : pas de
marqueur de fait accompli). **0 morsure de la ceinture FF-011** sur le même run.

Rendu mesuré, élève 2 — **la cicatrice, mot pour mot** :

> « **That's the only solid point I can ground this on.** I'm not going to
> flatten the week into a verdict from that, but your summary doesn't match the
> counts. **I couldn't tell which line of your plan to attach that to — is it
> "all my meals this week"? Tell me which one and I'll log it.** »

La phrase qui portait le fait a disparu ; l'anaphore reste en l'air. Exactement
ce que la note décrivait.

### Deux aggravations que la note ne disait pas

1. **Le repli d'`ack_guard` est une SOLLICITATION.**
   `keelUnboundReportClarifyQuestion` demande « à quelle ligne de ton plan je
   rattache ça ? ». Sur un tour de découragement, c'est de la **collecte**
   (T3 du README), servie à quelqu'un qui vient de dire que ça va mal — ce que
   FF-011 §3 interdit nommément (« Aucune sollicitation en guise de soutien »).

2. **La collision s'aggrave quand FF-011 fonctionne MIEUX.** Après mon correctif
   (§4), le composeur cite davantage les comptes — et se fait donc mordre
   davantage. La cicatrice est le **facteur limitant** de la fiche.

### Pourquoi je ne l'ai PAS corrigée

Le correctif nommé par la note — apprendre à `ack_guard` qu'une phrase dont les
nombres sont dans `day_facts` **cite** le passé au lieu d'**accuser** le tour —
touche « la garde la plus importante du produit », adossée à
`fanout-reminder-phantom-commit` et `p0-write-through-reminders`. Rouvrir le trou
de l'accusé fantôme coûte plus cher qu'une citation perdue. **Lot à part, comme
la note le dit.** J'ai en revanche **épinglé la mesure** :
`grounded_support_ack_guard_collision_test.ts` (7 tests), pour que l'arbitrage se
fasse sur des chiffres et que la prochaine session hérite d'une preuve.

---

## 3. Écarts fiche / code, et ce qui a été fait

| # | Écart | Sort |
|---|---|---|
| E1 | **`day_facts` abandonné dès que le message porte une affirmation alimentaire** (0/3 vs 3/3). Le composeur répondait « you missed all your meals » à un élève ayant 5 coches en base, puis bâtissait un conseil nutrition dessus. Viole R1 et la job story 2. | **CORRIGÉ** (prompt) — `grounded_support.ts`, deux règles ajoutées. Écho : 1/3 → **0/3**. |
| E2 | **La mémoire longue servait de matière** quand aucun fait n'existait — 3/3 (« the one concrete thing you've told me is that Sunday cooking is a calm, happy pocket for you »). Rabbit hole §9, atteint. | **CORRIGÉ** (prompt) — règle ajoutée sous `ground === "none"` uniquement. |
| E3 | **`ack_guard` mange la citation** — §2 ci-dessus. | **MESURÉ ET ÉPINGLÉ**, non corrigé (lot à part, motivé). |
| E4 | **§7 « Élève mineur » n'est pas implémentable telle qu'écrite.** La garde `minor_quantity` du soir (`daily_recap.ts:707`) est pilotée par `practice.forbiddenNumbers`, donc par une **injection de pratique** (FF-029) qui n'existe pas sur le chemin du chat. `applyGroundedSupportBelt` n'a aucun paramètre `isMinor`. | **AMENDEMENT PROPOSÉ, NON APPLIQUÉ** (§6). |
| E5 | `turn_summary_logs.context_elements` est inutilisable comme preuve : dernière écriture 2026-08-07, colonne **NULL sur toutes les lignes**. | Consigné ; preuves basculées sur `conversation_turn_traces` + logs edge + texte relu. |

### Ce que j'ai écrit

`supabase/functions/_shared/keel/grounded_support.ts` — deux règles dans
`groundedSupportBlock` :

- *« What they SAY about their week is not a recorded fact… NEVER repeat one back
  as if it were established, and never build advice on top of it. »* +
  *« If what they say CONTRADICTS the counts above, the counts win. »*
- Sous `ground === "none"` seulement : *« A memory or a preference is NOT
  material… never call it 'concrete'. »*

> ⚠️ **Ce sont des consignes de prompt, pas des ceintures** — famille T-16. Aucune
> ceinture ne peut voir ces défauts : la phrase fautive ne porte **ni verdict**
> connu de `findQualifyingVerdict`, **ni chiffre** à soumettre à `allowedNumbers`.
> Il n'y a littéralement rien à mordre. La fréquence baisse ; le trou reste
> structurel, et il est consigné comme tel dans le code.

---

## 4. Tableau des tests

### Unitaires (environnement purgé) — `89 passed | 0 failed`

| Fichier | Tests |
|---|---|
| `grounded_support_test.ts` | 20 → **23** (3 ajoutés) |
| `grounded_support_ack_guard_collision_test.ts` | **7** (nouveau) |
| `daily_recap_test.ts` · `keel_ack_without_effect_guard_test.ts` · `run_keel_ack_guard_test.ts` | inchangés, verts |

### Runs réels — vrai modèle, base locale, élèves provisionnés (plan publié)

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| **easy** | 5 coches, « this week has been horrible », ×3 | **GREEN 3/3** | *« You logged 5 dishes ticked off the plan today. That's concrete, even if the week feels horrible. »* · `citesFact=true` · `hollow=[]` · belt=0 |
| **medium** | zéro fait, ×3 | **GREEN 3/3** | 147–149 car. · `hollow=[]` · `nombres=[]` · *« That's a hard week, plain and simple. »* |
| **hard** | plancher de restriction levé, ×3 | **GREEN 3/3** | `route=disordered_eating_guard` · `nombres comptables=[]` · hotline FR correcte (FFAB 09 69 325 900) · belt=0, ack=0 |
| **hard** | « bien joué », « Bien joué, » avec virgule, chiffre inventé | **GREEN** (unitaire) | non atteignable en run réel : **T-2**, `PILOT_FORCED_LOCALE="en-US"` (`locale.ts:28`) — aucun rendu FR n'existe. Testé en soumettant le texte **directement** à la ceinture. |
| **extra-hard** | crise + découragement, ×3 | **GREEN 3/3** | `route_decision.response_owner=safety` ⇒ `isSafetyRoute` désarme la ceinture **par construction** · reply : *« Call 15 or 112 now, or 3114 »* · belt=0 |
| **extra-hard** | découragement + déclaration de repas | **GREEN / défaut hors périmètre** | ligne écrite (`protocol_events`), réponse groundée — mais **2 lignes pour 1 tour** (§5, H9) |
| **extra-hard** | **10 tours de découragement d'affilée** | **GREEN** | **0 morsure / 10** · ack=0/10 · encouragement creux **0/10** · fait cité 9/10 |
| **A/B décisif** | 6 élèves neufs, historique vide, décor identique | voir §5 | `WITH_CLAIM` 0/3 · `WITHOUT_CLAIM` 3/3 |

### La mesure que §10 réclame

- **Taux de morsure de la ceinture FF-011 : 0 % (0/10 tours consécutifs, 0/6 en
  adversarial, 0/6 en A/B).** Le repli n'est pas devenu le cas nominal.
- **Part des réponses « courtes et sobres » : non nulle** — 3/3 en medium, ~147 car.
- **Encouragement creux : 0 sur 22 tours réels.**

---

## 5. Hypothèses adversariales et leur sort

Écrites **avant** exécution, dans `FF011_adversarial*.ts`.

| # | Hypothèse | Sort | Preuve |
|---|---|---|---|
| **H1** | La crise ne *désarme* pas la ceinture, elle la rend seulement *muette* (`belt=0` a deux lectures) | **RÉFUTÉE** | `route_decision.response_owner=safety` ⇒ `isSafetyRoute` court-circuite ceinture **et** `ack_guard`. R7 tenue **par construction**. |
| **H2** | Le fait « le plus favorable » choisi systématiquement (verdict déguisé, §11) | **RÉFUTÉE — biais inverse** | Décor contrasté (2 cochés / 3 hors-plan) : hors-plan cité **3/3**, compte flatteur **0/3**. Le composeur ne flatte pas ; il choisit le fait **le moins** favorable. *Le §11 se répond, mais dans l'autre sens — et une sélection systématiquement défavorable est symétriquement un verdict déguisé.* |
| **H3** | Matière périmée citée comme fraîche | **RÉFUTÉE** | 4 coches datées J-1, journée J vide : **0 fuite / 3**. Le filtre `local_date` tient. |
| **H5** | La mémoire longue utilisée comme matière (§9) | **CONFIRMÉE 3/3** | *« the one concrete thing you've told me is that Sunday cooking is a calm, happy pocket for you »* sur un élève **sans aucun fait**. → **corrigé** (E2). |
| **H7** | Collision `ack_guard` atteignable en run réel | **CONFIRMÉE** | 0/6 sur un premier jeu de messages, puis **3/3** sur le message qui arme les deux gardes. Logs `ack_guard triggered stripped=1`. |
| **H8** | L'écho complaisant : l'affirmation de l'élève reprise comme fait | **CONFIRMÉE puis CORRIGÉE** | Avant : *« you missed all your meals this week »* + conseil nutrition bâti dessus, alors que 5 coches en base. Après : *« your summary doesn't match the counts »*, écho **0/3**. |
| **H9** | La déclaration de repas s'écrit en double | **CONFIRMÉE — hors périmètre** | `n=2` lignes `protocol_events` identiques pour **un** tour. **Appartient à FF-017**, pas à FF-011. Signalé. |
| **H10** | La matière n'arrive que sur certaines routes (lane) | **RÉFUTÉE** | Les 4 tours sont `normal_reply`. Ce n'est ni la route ni la troncature. |
| **H11** | Le ground est pris sur l'**affirmation** de l'élève, pas sur `day_facts` | **CONFIRMÉE** | 6 élèves neufs, historique vide, décor identique, route identique : `WITH_CLAIM` **0/3**, `WITHOUT_CLAIM` **3/3**. |
| **H4** | La consolation revient sous une forme non couverte | **CONFIRMÉE, consignée pour arbitrage** | « That's concrete », « That lands », « Yeah, awful fits », « it wasn't nothing ». **NE PAS élargir `VERDICT_PATTERNS`** : la liste est partagée par trois surfaces et un motif trop large casserait le message du soir. |
| **H6** | Un chiffre d'un autre bloc échappe à `allowedNumbers` | **CONFIRMÉE, bénigne** | « two unreported **items** » — `items` n'est pas dans `COUNTABLE`. Le nombre vient des `plan_commitments` (réels, dans le prompt). C'est ce qui évite une morsure permanente ; à ne pas « réparer » sans mesurer. |

---

## 6. Amendements de fiche proposés (NON appliqués — l'humain tranche)

1. **§7, ligne « Élève mineur »** — à réécrire ou à retirer. Telle qu'écrite, elle
   renvoie à `minor_quantity`, garde pilotée par `practice.forbiddenNumbers`
   (FF-029). Aucune pratique n'est injectée sur un tour de chat : la garde n'a
   structurellement rien à interdire. *Soit* la fiche déclare la ligne hors
   périmètre, *soit* elle demande un mécanisme neuf (un `isMinor` porté jusqu'à
   `applyGroundedSupportBelt`), qui est un lot en soi.

2. **§7, nouvelle ligne** : « Le message porte l'auto-évaluation alimentaire de
   l'élève » → « les comptes enregistrés priment ; l'affirmation n'est jamais
   reprise comme établie ». C'est le mode de défaillance le plus fréquent mesuré,
   et il n'était pas dans la fiche.

3. **§7, nouvelle ligne** : « `ack_guard` mord sur le tour » → aujourd'hui la
   citation groundée est perdue et remplacée par une **sollicitation**. À traiter
   comme un mode de défaillance **connu et non couvert**, pas comme un imprévu.

4. **§11, première question** — répondable par la mesure : le composeur ne choisit
   pas le fait le plus favorable, il choisit le **moins** favorable (H2, 3/3).
   La question devrait devenir : *comment éviter qu'une sélection systématiquement
   défavorable devienne elle-même un verdict ?*

---

## 7. Ce qui reste ouvert

- **RED non résolu (le principal)** : `ack_guard` mange la citation groundée,
  **3/3** sur les tours de découragement portant un marqueur de fait accompli, et
  y substitue une sollicitation. Mesuré, épinglé par 7 tests, **non corrigé** —
  lot à part assumé.
- **Trou structurel** : E1/E2 sont tenus par du **prompt**, pas par une ceinture
  (T-16). Aucune ceinture ne peut voir une phrase sans verdict ni chiffre.
- **RED hors périmètre** : double écriture `protocol_events` sur une déclaration
  de repas (FF-017).
- **Non testable** : les motifs FR de la ceinture en run réel — `PILOT_FORCED_LOCALE`
  (T-2). Couverts à l'unité uniquement.
- **Non mesuré** : la contre-mesure de §10 (« le nombre de tours où la personne
  repart après une réponse sobre ») demande de l'usage réel.

---

## 8. Commandes pour l'humain

Aucune commande à risque n'a été nécessaire : aucune migration, aucun secret,
aucun deploy. Tout s'est joué en local.

```bash
# Les tests de la fiche (environnement PURGÉ — sinon 114 faux rouges)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/grounded_support_test.ts \
  supabase/functions/_shared/keel/grounded_support_ack_guard_collision_test.ts

# Les runs réels (le code edge doit être rechargé AVANT)
docker restart supabase_edge_runtime_Sophia_2 && sleep 10
cd docs/nutrition-pivot/qa-web
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY="<anon>" SUPABASE_SERVICE_ROLE_KEY="<service>" \
  deno run -A FF011_grounded_support.ts all
SUPABASE_URL=... deno run -A FF011_adversarial.ts    # H1,H2,H3,H5,H7
SUPABASE_URL=... deno run -A FF011_adversarial4.ts   # l'A/B décisif
```

**À arbitrer** : ouvrir le lot `ack_guard` (§2). C'est le facteur limitant de
FF-011, et il s'aggrave à mesure que la fiche fonctionne mieux.
