# RAPPORT — FF-028 · La recommandation quotidienne (V1)

Branche `ff-001-quotidien-du-coach` · commit `b7d6a308` · 2026-08-08

---

## 1. État initial constaté — avec preuves

**FF-028 n'existait pas.** Ce qui existait était sa *réservation* :

| Preuve | Ce qu'elle établit |
|---|---|
| `supabase/functions/_shared/keel/daily_ask_budget.ts:56` — `"daily_recommendation"` dans `DAILY_ASK_KINDS` | le genre de demande était réservé, sans consommateur |
| `supabase/migrations/20260808123000_daily_ask_budget.sql:59` — `'daily_recommendation'` dans le CHECK | idem côté base |
| `grep -rn "daily_recommendation" supabase/ frontend/src/` → **4 occurrences, toutes dans ces deux fichiers + leur test** | aucun moteur, aucune table, aucun bouton, aucun cron |
| `supabase/functions/_shared/keel/hunger_signal_io.ts:195` — `countSatietyAdaptations` | FF-027 avait posé le déclencheur, **sans appelant** |
| `hunger_signal.ts:259` — « un changement de STRUCTURE, qui est le travail de FF-028 » | le contrat était écrit, le travail non fait |

Les deux entrées amont existaient et étaient utilisables :
`loadHungerDays` + `countHungerDays` (FF-027, synchrone) et
`countSatietyAdaptations` (dérivé de `student_week_plans.generated_from`).
**FF-029 n'est pas passée** : l'analyse a donc été conçue sans elle (entrée
optionnelle et absente aujourd'hui) — voir §6.

---

## 2. Ce qui a été construit

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260808170000_daily_recommendation.sql` | table `student_daily_recommendations` + fonction SQL `keel_add_eating_rhythm_slot` (atomique, idempotente) |
| `supabase/migrations/20260808171000_daily_recommendation_cron.sql` | le cron horaire — **volontairement non appliqué en local** (§7) |
| `supabase/functions/_shared/keel/daily_recommendation.ts` | module PUR : espace d'action fermé, filtre doctrine, gates, empreinte, boutons, textes gelés |
| `supabase/functions/_shared/keel/daily_recommendation_io.ts` | lectures/écritures : historique dérivé, transition atomique, écrire→relire |
| `supabase/functions/_shared/keel/daily_recommendation_engine.ts` | le PAS du moteur, pour un élève, à un instant — joignable sans HTTP |
| `supabase/functions/keel-daily-recommendation-v1/` | la coquille : garde interne, pagination, budget de temps, compte-rendu |
| `supabase/functions/_shared/keel/daily_recommendation_test.ts` | 33 épreuves unitaires |
| `supabase/functions/_shared/chat/deterministic_buttons.ts` (+218 l.) | le tap « Oui » / « Non » |
| `supabase/functions/keel-daily-pulse-v1/index.ts` (+29 l.) | le tap du soir se retire quand la recommandation a parlé |

### Les décisions de conception qui méritent d'être relues

**La directive durable n'est pas une table neuve.** C'est
`student_goals.practical_constraints.eating_rhythm`, qui a déjà trois lecteurs
au runtime (`generate-meal-v1`, `generate-household-meal-v1`,
`generate-week-plan-v1`, via `parseEatingRhythm`). Une table « directive » de
plus aurait été une donnée sans consommateur — la règle mère du domaine, violée
dans la fiche qui la cite.

**Le rythme EFFECTIF, pas la colonne.** `parseEatingRhythm` rend `[]` quand rien
n'est déclaré et tous les générateurs retombent sur `DEFAULT_EATING_RHYTHM`
(petit-déj / déjeuner / dîner). L'espace d'action est donc calculé sur
`effectiveRhythm()`. Sans ça, le premier élève sans `student_goals` aurait reçu
« on ajoute un petit-déjeuner ? » alors qu'il en recevait déjà un.

**L'empreinte du plan ne couvre PAS le contenu du plan.** Elle couvre le rythme
effectif (ce que l'action modifie) et la version de doctrine (ce qui a filtré
l'espace). Les plats composés changent plusieurs fois par semaine ; les y mettre
aurait fait de « ta proposition a expiré » le cas nominal — une garde qui mord
toujours est une garde qu'on débranche dans la semaine.

**Le moteur est coupé en deux exprès.** `index.ts` ne décide rien ; tout vit dans
`daily_recommendation_engine.ts`. Motif : une logique de cron qui vit dans son
`index.ts` n'est joignable que par HTTP, donc éprouvable seulement là où la
fonction est servie — et c'est ainsi qu'on finit par la vérifier avec des
doubles. Ici le code de production a été joué en conditions réelles.

---

## 3. Écarts fiche ↔ code, et ce qui a été fait

| # | Écart | Décision |
|---|---|---|
| **E1** | **§4/R3 : « le modèle choisit DEDANS ».** V1 sélectionne **déterministement** (ordre de priorité dans l'espace pré-calculé). | **Code aligné en plus fort que la fiche.** Deux actions et un déclencheur déterministe ne laissent rien à arbitrer ; y mettre un tirage placerait la stochastique mesurée du dépôt (`[0,3,3,0]`) sur le chemin qui OUVRE un effet durable. `selectRecommendation(space, choiceId)` existe, est exporté et testé : il refuse tout choix hors espace, donc un sélecteur-modèle reste ajoutable sans risque. **Amendement §6/R3 proposé, non appliqué** : « l'espace est pré-calculé ; tout sélecteur — modèle ou code — est validé contre lui ». |
| **E2** | **§4 : l'exemple de texte porte un décompte** (« Tu as eu faim 4 soirs cette semaine »). Le code n'écrit **aucun nombre**. | **Code volontairement plus strict.** Mêmes trois raisons que FF-027 (`hunger_signal.ts:26-43`) : le nombre ESCALADE, il FUIT, et il transforme une proposition en constat de surveillance. R6 (« Jamais un chiffre ») est tenue par énumération. **Amendement §4 proposé, non appliqué** : remplacer l'exemple par « Tu m'as dit plus d'une fois que tu avais encore faim… ». |
| **E3** | **§4 : « FIN DE JOURNÉE — batch (patron memorizer) ».** Le memorizer tourne `0 0 * * *` **UTC**. | **Écart assumé** : le balayage est horaire avec une fenêtre en heure LOCALE (patron `keel-daily-pulse-v1`). UTC aurait envoyé « ta journée » à 15 h pour la moitié des fuseaux et rendait « un seul message par soir » intenable. **Amendement §4 proposé** : « batch horaire, fenêtre locale — patron du tap du soir ». |
| **E4** | **§11, question ouverte : cooldown 14 ou 30 j, par recommandation ou global ?** | **Tranché en code, documenté** : `RECOMMENDATION_COOLDOWN_DAYS = 30`, **par action**. Le déclencheur est lent (il faut deux compositions rassasiantes) ; 14 j rouvrirait la porte avant que les données aient pu bouger. Global aurait fait payer à la collation le refus du petit-déjeuner. La contre-mesure globale existe à côté (3 refus ⇒ extinction). |
| **E5** | **§11, question ouverte : surface de livraison.** | **Tranché** : message autonome dans le fil, fenêtre **19h-20h locales**, strictement AVANT celle du tap (20h-22h) ; le tap se retire s'il voit une recommandation du jour. « Un seul message par soir » est donc tenu **sans convention entre deux crons** — testé X4/X4b. |
| **E6** | **§5/§7 : rien ne couvrait la proposition restée SANS RÉPONSE.** | **Défaut trouvé en revue adversariale et corrigé** (§5, A1). Ajout de `RECOMMENDATION_OPEN_FOR_DAYS = 14`, du gate `awaiting_response`, de l'expiration `unanswered` et du cooldown sur l'action ignorée. **Amendement §7 proposé** : ajouter la ligne « proposition restée sans réponse → aucune relance ; elle expire, et son action entre en cooldown ». |
| **E7** | **§10 : « le coach voit-il les recommandations ? »** | **Non implémenté**, la question reste ouverte dans la fiche. La table est service-role only ; aucun écran coach ne la lit. |

---

## 4. Tableau des tests

### 4.1 Unitaires — `daily_recommendation_test.ts`, 33/33 verts

`env -u SUPABASE_* deno test --allow-read --allow-env --no-check` → `ok | 33 passed | 0 failed`.
Les garanties R6 et §9 sont prouvées **par énumération** de l'espace fermé, pas
par échantillonnage. Suite complète `_shared/keel/` + `_shared/chat/` :
**1711 passed / 0 failed / 17 ignored** — aucun rouge, préexistant ou nouveau.

### 4.2 Conditions réelles — vrai modèle, base locale, élève provisionné

Décor par cas : coach + doctrine publiée, élève `keel_role='student'`,
`timezone=Europe/Paris`, **`locale` écrite explicitement**, `coach_clients`
actif avec consentement, `plan_versions` **publié** + `plan_commitments`,
`student_week_plans` adopted, `student_goals` avec rythme, jours de faim et
compositions satiété. Fixtures préfixées `ff028_`, purgées (vérifié : 0 ligne
résiduelle).

| Niveau | ID | Scénario | Verdict | Preuve |
|---|---|---|---|---|
| easy | E1×3 | faim récurrente + 2 adaptations + 2 repas/jour ⇒ 1 proposition, 2 boutons ; tap « Oui » ⇒ directive en base, relue, rythme modifié | **GREEN 3/3** | `db_row {action: add_breakfast, state: proposed, fp: "rhythm=dinner,lunch\|doctrine=1"}` → `{state: accepted, applied_at: true}` ; rythme `lunch,dinner` → `lunch,dinner,breakfast` ; ack `"Done — breakfast is part of your rhythm now…"` ; ledger `[{kind: daily_recommendation, axis: null}]` |
| medium | M1 | tap « Non » ⇒ cooldown, la proposition ne revient pas 3 soirs | GREEN | 1 ligne `declined` ; soirs +1/+2/+3 → `cooldown` ×3 |
| medium | M2 | journée sans signal, 3 soirs | GREEN | `nothing_significant` ×3 ; **0 bulle, 0 ligne, 0 place de budget** |
| medium | M2b | faim récurrente, 0 adaptation | GREEN | `nothing_significant`, 0 bulle |
| medium | M2c | faim récurrente, 1 adaptation | GREEN | `nothing_significant` (le seuil est 2) |
| medium | M3 | élève `fr-FR` | GREEN | proposition livrée (copie EN — T-2) |
| medium | M4 | petit-déj déjà là | GREEN | `add_afternoon_snack` proposé et appliqué (`snack_pm` en base) |
| medium | M5 | rythme complet | GREEN | `no_action_available` |
| medium | M6 | aucune ligne `student_goals` | GREEN | jamais `add_breakfast` ; le « Oui » **n'accuse pas** (rien à écrire), état revenu à `proposed` |
| hard | H1 | doctrine « jeûne du matin » + faim | GREEN | `doctrine_removed {add_breakfast:contra}` ; aucune occurrence de « breakfast » dans le texte livré |
| hard | H1b | doctrine excluant les deux familles (EN) | GREEN | `no_action_available`, 0 bulle |
| hard | H1c | **la même doctrine en français** (T9) | GREEN | `no_action_available`, 0 bulle |
| hard | H2 | `restriction_flag` levé | GREEN | `restriction_flag` ; **0 bulle, 0 ligne, 0 place de budget, et les 3 jours de faim toujours en base** — muet ET sans perte (≠ T-7) |
| hard | H3 | plan modifié entre proposition et tap | GREEN | `state=expired, expiry_reason=plan_changed, applied_at=null` ; rythme identique avant/après ; ack `"Your eating rhythm has changed since I asked…"` |
| hard | H4 | double tap | GREEN | `applied_at` identique, 1 seul `breakfast`, 1 seule ligne |
| hard | H5 | « Oui » puis « Non » | GREEN | reste `accepted`, rien n'est défait |
| extra | X1 | question de précision déjà posée ce jour | GREEN | `daily_ask_budget`, 0 bulle ; **le lendemain : 1 proposition** |
| extra | X2 | le batch tombe un soir | GREEN | 1 proposition le lendemain, **pas deux** |
| extra | X3 | 3 refus consécutifs | GREEN | `decline_streak_muted` ce soir **et 120 jours plus tard** |
| extra | X3b | 2 refus AVANT une acceptation | GREEN | la série repart : 1 proposition |
| extra | X4 | reco à 19h puis tap du soir à 20h | GREEN | `skipped_by_reason {recommendation_sent_today: 1}` ; aucun `keel_daily_pulse` livré |
| extra | X4b | soir SANS reco | GREEN | `keel_daily_pulse` livré — additif, pas substitutif |
| extra | X5 | 2 instances du batch en parallèle | GREEN | 1 ligne, 1 bulle, 1 place de budget |
| extra | X6 | proposition sans réponse, soirs +1 +2 +3 +6 +13 | GREEN | `awaiting_response` ×5, **1 seule bulle** ; puis `expired/unanswered` |
| extra | X6b | l'action ignorée après expiration | GREEN | `cooldown`, toujours 1 seule bulle |

**24/24 GREEN** (`scratchpad/ff028_scenarios_results.json`).

### 4.3 La boucle fermée — composition RÉELLE (`generate-meal-v1`, vrai modèle)

| ID | Scénario | Verdict | Preuve |
|---|---|---|---|
| A12 ×3 | accepter ⇒ la composition suivante porte le moment | **GREEN 3/3** | `status=200`, `slots=["breakfast","lunch","dinner"]` — le zéro de §7 n'est pas atteint |

---

## 5. Hypothèses adversariales et leur sort

Écrites **avant** exécution, en tête de `scratchpad/ff028_adversarial.ts`.

| # | Hypothèse | Sort | Preuve |
|---|---|---|---|
| **A1** | **Le moteur bavard** — la part de soirs silencieux doit être majoritaire | 🔴 **DÉFAUT TROUVÉ, puis corrigé** | Cohorte de 8 profils × 3 soirs = 24 soirs-élève. **Avant** : 3 propositions, part silencieuse **87,5 %** — mais le détail était pire que la moyenne : le même élève recevait la MÊME question les 3 soirs (`per_night: 1,1,1`), données inchangées. Une proposition sans réponse ne bloquait rien. **Après correctif** : 1 proposition, part silencieuse **95,8 %** (`per_night: 1,0,0`). |
| **A2** | **L'accusé fantôme sur le « Oui »** — chemin où l'écriture échoue et où Sophia dit quand même « Done » | GREEN | Rythme déclaré `[]` : empreinte inchangée (calculée sur l'effectif), donc le claim passe, mais la fonction SQL refuse d'écrire. Résultat : ack `"Something went wrong on my side and I couldn't save that…"`, `state` revenu à `proposed`, `applied_at` NULL, rythme inchangé. **Aucun chemin ne dit « c'est fait » sans relecture.** |
| **A3** | **Action inventée / payload d'autrui** | GREEN | UUID inexistant → `"That one's no longer open"`, 0 ligne. Payload d'un autre élève → **exactement la même phrase**, victime intacte (`state=proposed`, rythme inchangé), attaquant intact. Aucun oracle d'énumération. |
| **A4** | **Le coaching de vie qui revient** | GREEN | Sur les 8 profils, tous les textes délivrés appartiennent à l'ensemble fermé des 2 littéraux. La liste est pinnée par test unitaire. |
| **A5** | **Proposition stale par la doctrine** — le coach republie entre proposition et tap | GREEN | v2 publiée ⇒ `state=expired, expiry_reason=plan_changed`, `breakfast` absent du rythme. R5 est vraie **au moment de l'application**, pas seulement à la proposition. |
| **A6** | **Le budget qui fuit** | GREEN | 1 ligne de ledger, `ask_kind=daily_recommendation`, `axis=null`, `countDailyAsks = 1 = DAILY_ASK_BUDGET`. **Un seul compteur, pas trois.** |
| **A7** | **Résurrection d'une proposition morte** | GREEN | tap sur une `expired` ⇒ rien appliqué, rythme inchangé |
| **A8** | **L'élève lit ou écrit la table** | GREEN | JWT élève sur PostgREST : `SELECT` **401**, `PATCH` **401**, `rpc keel_add_eating_rhythm_slot` **404** ; rythme inchangé |
| **A10** | **Le plafond de livraison** | GREEN | plafond non sollicité saturé ⇒ 0 bulle, ligne `expired/undelivered` — **pas** une question ouverte que personne n'a lue |
| **A11** | **Rejeu du même `client_message_id`** (502 Kong) | GREEN | `applied_at` identique, 1 seul `breakfast`, **pas de second accusé** |
| **A9** | **La préférence contradictoire captée APRÈS l'acceptation** (T-11) | ⚠️ **partiellement rouge — hors périmètre FF-028** | 3/3 : après acceptation du petit-déjeuner puis capture de « I never eat anything in the morning », le générateur réel compose `["lunch","dinner"]` — il **arbitre correctement** (la préférence gagne, conformément à la subordination de FF-027) mais **ne le dit nulle part** : `note = null`, aucun titre n'y fait allusion. La fiche demande « le générateur arbitre **et le dit** ». Le correctif appartient à `meal_generation.ts` — **fichier réservé à l'autre agent**, non touché. Consigné §7. |

**Aucune hypothèse non testable** hormis celle-ci, dont la moitié mesurable l'a été.

---

## 6. Ce qui reste ouvert

1. **A9 — le générateur arbitre sans le dire.** Mesuré 3/3. Une acceptation
   silencieusement annulée par une préférence est exactement l'incohérence
   visible que la revue cherchait. Le correctif est dans `meal_generation.ts`
   (réservé) : le prompt devrait dire « si une préférence contredit un moment du
   rythme, ne le compose pas ET dis-le en une ligne ». **Lot à part.**

2. **FF-029 (les pratiques) n'est pas une entrée de l'analyse.** La fiche la
   liste (`§3`, `§4`) ; elle n'est pas encore passée. L'analyse a été conçue
   pour que l'entrée soit **optionnelle et absente** : rien n'a été construit à
   sa place, et son ajout ne demandera qu'un champ de plus dans
   `RecommendationDecisionInput` et une action de plus dans l'espace fermé.

3. **RGPD — la table neuve n'est pas réclamée par l'export.**
   `student_daily_recommendations` est **supprimée** correctement (FK
   `on delete cascade`, vérifié par le schéma), mais elle n'est **pas** dans
   `account-export-v1` ni dans `PIVOT_TABLES` de
   `supabase/functions/keel_gdpr_lifecycle_test.ts`. C'est la cicatrice connue
   `gdpr-lifecycle-does-not-claim-new-tables`, une table de plus. Non ajoutée
   ici parce que l'export traverse trois endroits (SCOPE, `fetchKeelRows`,
   archive) et sort du périmètre.

4. **Le coach ne voit rien.** §11 laisse la question ouverte ; la table est
   service-role only. Rien n'a été tranché.

5. **Le renommage de `meal_precision_questions`** reste le chantier déjà listé
   au rapport FF-025. FF-028 cite `DAILY_ASK_LEDGER_TABLE`, jamais la chaîne.

6. **Coût de lecture.** Le pas du moteur fait ~10 lectures indexées par élève,
   une fois par jour, sur une seule heure locale. C'est délibéré : court-circuiter
   sur le seuil de « significatif » aurait économisé la doctrine sur 95 % des
   élèves **au prix du motif journalisé** (un élève sous plancher se serait
   compté en `nothing_significant`). À revoir si la cohorte dépasse quelques
   milliers d'élèves — pas avant.

7. **Rouges préexistants** : aucun. `_shared/keel/` + `_shared/chat/` :
   1711 passed / 0 failed. `npx tsc -b` (frontend) : **exit 0**.
   Le hook `agent-gate` est passé au commit.
   *Condition préexistante non liée* : `supabase/migrations/` contient un
   **doublon de version `20260808060000`** (deux fichiers), antérieur à ce lot —
   il bloquera un `db reset` lignée (cicatrice
   `duplicate-migration-versions-block-lineage`). Non touché.

8. **Leçon de harnais (pas de produit)** : un décalage de `+N × 24 h` traverse
   une frontière d'heure d'été et fait sortir l'élève de la fenêtre du soir —
   ça a produit un faux rouge (X3) avant d'être corrigé par `eveningIn()`. Le
   cron réel est horaire et résout l'heure locale à chaque tick : aucun impact
   produit.

---

## 7. Commandes pour l'humain

### 7.1 Les migrations — la seconde n'est PAS encore appliquée

`20260808170000_daily_recommendation.sql` **est appliquée en local** et sa
version est enregistrée dans `supabase_migrations.schema_migrations`. Elle a été
amendée après coup pour le motif d'expiration `unanswered` ; l'amendement
équivalent a été rejoué en local :

```sql
-- déjà exécuté en local, ici pour mémoire
alter table public.student_daily_recommendations
  drop constraint if exists student_daily_recommendations_expiry_reason_check;
alter table public.student_daily_recommendations
  add constraint student_daily_recommendations_expiry_reason_check
  check (expiry_reason is null or expiry_reason in ('plan_changed','undelivered','unanswered'));
```

`20260808171000_daily_recommendation_cron.sql` **n'a volontairement pas été
appliquée** : le runtime edge local ne sert que les fonctions listées dans
`SUPABASE_INTERNAL_FUNCTIONS_CONFIG`, figée à la création du conteneur — la
fonction rend 404 tant que Supabase local n'a pas été redémarré, et planifier le
cron ferait taper un 404 par heure dans un environnement **partagé avec une
autre session**.

### 7.2 Pour éprouver la fonction edge en local (optionnel)

```bash
# ⚠️ arrête AUSSI la base, partagée avec l'autre session — se coordonner avant.
npx supabase stop && npx supabase start
```

Puis la migration du cron :

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "supabase/migrations/20260808171000_daily_recommendation_cron.sql"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "insert into supabase_migrations.schema_migrations (version, name) \
   values ('20260808171000','daily_recommendation_cron') on conflict do nothing;"
```

### 7.3 Déploiement (bloqué pour moi — à copier-coller)

```bash
supabase db push
supabase functions deploy keel-daily-recommendation-v1
supabase functions deploy keel-daily-pulse-v1     # la garde « un seul message par soir »
supabase functions deploy chat-inbound-v1         # le tap Oui/Non
```

⚠️ **L'ordre compte.** `keel-daily-pulse-v1` doit partir **avec ou avant** le
cron de la recommandation : sinon, pendant la fenêtre de déploiement, un élève
peut recevoir la proposition à 19 h **et** le tap du soir à 20 h.

### 7.4 Rejouer les épreuves

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/daily_recommendation_test.ts

SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY="$(npx supabase status -o json | jq -r .ANON_KEY)" \
SUPABASE_SERVICE_ROLE_KEY="$(npx supabase status -o json | jq -r .SERVICE_ROLE_KEY)" \
INTERNAL_FUNCTION_SECRET="$(docker exec supabase_edge_runtime_Sophia_2 printenv INTERNAL_FUNCTION_SECRET)" \
  deno run -A scratchpad/ff028_scenarios.ts       # 24 cas
#  … ff028_adversarial.ts (12 hypothèses) · ff028_loop.ts (boucle réelle) · ff028_easy.ts
```

### 7.5 Les amendements de fiche à trancher

Aucun n'a été appliqué. Ils sont listés en §3 : **E1** (R3 — sélecteur
déterministe plus fort que « le modèle choisit »), **E2** (§4 — l'exemple de
texte porte un chiffre que R6 interdit), **E3** (§4 — batch horaire à fenêtre
locale, pas patron memorizer UTC), **E6** (§7 — ajouter le cas « proposition
restée sans réponse »).
