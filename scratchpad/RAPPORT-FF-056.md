# RAPPORT · FF-056 — La divergence constatée

Branche `ff-001-quotidien-du-coach`. 4 commits, rien poussé, index vérifié avant
chacun (`git diff --cached --name-only`).

| | |
|---|---|
| Fiche | `docs/fonctionnalites/conversation/FF-056-la-divergence-constatee.md` |
| Commits | `15af7a63` · `c1e4a011` · `d45ce192` · `42003ce2` |
| Tests unitaires neufs | **73** (28 détecteur + 12 déclencheur + 33 sous-flow) |
| Tests en conditions réelles | **23 scénarios, 23 GREEN, 0 RED** |
| Migration | `20260811120000_weight_divergence_episodes.sql` — appliquée en local, enregistrée |
| Suite Deno | 4181 verts / 3 rouges **prouvés pré-existants** (voir §7) |

---

## 1. État initial constaté

**La fonctionnalité n'existait pas.** Zéro fichier, zéro ligne, zéro table.
Preuves : `weight_divergence` absent de tout le dépôt avant `15af7a63` ;
`student_weight_divergence_episodes` absente de `supabase/migrations/` ;
`DAILY_ASK_KINDS` portait quatre genres (`daily_ask_budget.ts:50-67`).

Ce qui existait, vérifié pièce par pièce avant de m'appuyer dessus :

| Pièce | État réel constaté | Preuve |
|---|---|---|
| Série de poids datée | **vivante** — `student_body_measures`, une ligne par pesée, `local_date` + `measured_at` | `body_measure_io.ts:207` (`loadBodyMeasures`), migration `20260810090000` |
| Agrégation hebdo | **vivante et testée** — jour puis semaine, la dernière du jour gagne | `body_measure_series.ts:228,273` |
| Direction de l'objectif | `student_goals.goal` ∈ `fat_loss, muscle_gain, recomposition, performance, health, maintenance` | migration `20260803160000:38` + `20260805121000` |
| Budget T4 | **UN compteur**, `DAILY_ASK_BUDGET = 1`, 4 genres | `daily_ask_budget.ts:43,50,81` |
| Canal de directives FF-028 | **vivant** — espace pré-calculé de **2 actions** (`add_breakfast`, `add_afternoon_snack`), tap, relecture, empreinte de plan | `daily_recommendation.ts:160,219`, `daily_recommendation_io.ts` |
| Patron de sous-flow | `safety_crisis/` + `disordered_eating_guard/` — l'entrée arrive par un canal runtime dédié | `run.ts:6445` (`disordered_eating_guard_runtime`) |
| Batch du soir | `keel-daily-recommendation-v1`, balayage horaire, fenêtre 19h-20h **locale** | `daily_recommendation_engine.ts:62-63` |
| Plancher médical | `medical_condition_floor.ts` **existe** ; le plancher TCA est `restriction_guard`/`restriction_runtime` | — |

**Une découverte qui a changé le lot** : FF-028 épingle `restrictionFlag = false`
en dur (`daily_recommendation_engine.ts:181`) avec un pavé qui explique pourquoi
(`weekly_reviews.risk_band` n'a aucun écrivain — F1). **FF-056 ne pouvait pas se
le permettre** : il parle de poids qui ne descend pas. Le moteur évalue donc le
plancher **réel** à chaque déclenchement (`evaluateRestrictionForStudent`), sur
les mesures datées, et une lecture qui échoue **remonte** plutôt que de rendre
`false`.

---

## 2. Ce qui a été construit — les six étapes

| # | Livrable | Statut |
|---|---|---|
| ① | `_shared/keel/weight_divergence.ts` — détecteur pur + 28 tests | ✅ **livré** |
| ② | `_shared/keel/weight_divergence_engine.ts` greffé dans `keel-daily-recommendation-v1/index.ts` | ✅ **livré** |
| ③ | Migration `20260811120000` — table, RLS, privilèges, cascade RGPD | ✅ **livré** (raccord d'export **bloqué**, §8) |
| ④ | `sophia-brain/skills/weight_divergence/` + câblage `routers.ts` / `run.ts` | ✅ **livré** |
| ⑤ | Actions par catégorie via le canal FF-028 | ✅ **livré**, avec la restriction du §5 ci-dessous |
| ⑥ | Fenêtre d'observation | 🟠 **à moitié** — l'ouverture et les bornes sont livrées, **le recalage de J+3 n'a pas d'appelant** (§9) |

### ① Le détecteur — les seuils choisis, et leur raisonnement

Entrée : `DatedBodyMeasure[]` **dans la forme de production** (pas une série
pré-agrégée — une fixture qui date mal ses mesures **échoue** au lieu de valider
un détecteur imaginaire). Sortie : 8 verdicts nommés. Zéro I/O, zéro horloge.

Il mange des **moyennes hebdomadaires** (`weeklyBodyPoints`), pas des pesées :
le bruit d'un jour à l'autre est de ±1 à 2 kg sur 80 kg, c'est-à-dire **du même
ordre que le signal cherché**.

| Constante | Valeur | Le raisonnement |
|---|---|---|
| `DIVERGENCE_LOOKBACK_DAYS` | **56** | 8 semaines : assez pour qu'un plateau de 5 semaines tienne avec de la marge, pas assez qu'une pesée d'il y a un trimestre serve de référence |
| `DIVERGENCE_MIN_WEEKS_AWAY` | **3** | Le haut de la fourchette « 2 à 3 » de §3. Avec du bruit pur, P(2 points consécutifs contre) = 1/2, P(3) = 1/6 : **on divise le faux positif par trois pour le prix d'une semaine** |
| `DIVERGENCE_MIN_WEEKS_STALLED` | **5** | **Strictement plus que l'éloignement**, et c'est le cœur du calibrage. Un plateau de 3 semaines est NORMAL sous un plan de perte ; le déclencher ferait le rendez-vous mensuel que §3 nomme comme le mode de défaillance |
| `DIVERGENCE_MIN_MOVE_PCT` | **1,2 %** | **Emprunté, pas inventé** : le seuil que `restriction_guard` applique déjà à la perte rapide. Là-bas par semaine, ici au TOTAL sur deux pas — donc deux fois plus lent, ce qui est voulu (on cherche un fait établi, pas une urgence). ≈ 0,96 kg pris en deux semaines sur 80 kg |
| `DIVERGENCE_MIN_STEP_PCT` | **0,1 %** | « Strictement contre », à la précision de la balance près. **C'est ce seuil qui tient le critère §8** : 80,0 / 80,0 / 80,0 / 81,0 franchit l'amplitude totale mais son premier pas est PLAT — ce n'est pas un éloignement, c'est un saut |
| `DIVERGENCE_PROGRESS_OK_PCT` | **0,5 %** | En dessous on ne conclut rien. Il n'y a **pas** de branche « ça avance mal » : elle appellerait une conversation d'encouragement, et ce produit n'en fait pas |
| `DIVERGENCE_FLAT_BAND_PCT` | **0,5 %** | Les 5 points doivent TOUS y tenir. Une série qui sort de la bande puis y revient n'est pas un plateau |
| `DIVERGENCE_STALE_DAYS` | **10** | Un peu plus d'une semaine. **C'est aussi la ceinture du RED majeur §10** : si quelqu'un cesse de se peser, le mécanisme devient muet de lui-même en dix jours |

**Direction** : seuls `fat_loss` (down) et `muscle_gain` (up) portent une
direction. `recomposition` est **délibérément exclu** — une recomposition attend
précisément que le poids ne bouge pas ; y lire une divergence poserait la
question à quelqu'un dont le plan se déroule exactement comme prévu, le mode de
défaillance le plus indéfendable de cette fonctionnalité.

### ② Le déclencheur — les gates, dans l'ordre, chacune avec son motif

Greffé **après** FF-028 dans le balayage existant (pas de second cron). Fenêtre
19h-20h locale, donc hors des heures calmes 21h-8h **par construction**.

`outside_window` → `opted_out` → `minor_student` → `episode_live` →
`no_active_plan` → `restriction_flag` → `safety_band` → `no_completed_plan` →
`too_soon_after_plan_end` → `cooldown` → verdict du détecteur →
`ask_budget_taken`. Chaque refus est compté dans `divergence_skipped_by_reason` ;
les verdicts du détecteur dans `divergence_verdicts` — **séparés de ceux de
FF-028**, parce que deux mécanismes qui se taisent pour des raisons différentes
rendraient chaque chiffre illisible en les fondant.

### ③ L'épisode

Table `student_weight_divergence_episodes`. **La divergence n'est jamais stockée
comme un trait** — elle se dérive à la lecture. Ce qui se garde, c'est l'histoire
de la conversation, et c'est cette ligne qui porte le cooldown.

**Aucune prose de l'élève** : seulement une catégorie d'une liste fermée.
Stocker les mots de quelqu'un qui explique pourquoi il n'a pas perdu de poids
créerait un dossier (R12).

RLS : **le titulaire LIT, personne n'ÉCRIT**. Pas de `owner_all` — rien côté
client ne doit pouvoir fabriquer, faire avancer ou clore un épisode. Les deux
cicatrices de privilèges sont **vérifiées dans la migration**, pas supposées :
`has_table_privilege('anon', …)` sur SELECT et INSERT, `TRUNCATE`/`INSERT`/
`UPDATE`/`DELETE` d'`authenticated`, **plus un cas qui DOIT passer** (le SELECT
du titulaire) sans quoi tout le reste serait vrai d'une table à laquelle personne
n'a accès.

### ④ Le sous-flow

`contract.ts` (listes fermées) · `local_dispatcher.ts` (classement + plancher de
refus déterministe) · `reducer.ts` (**pur**) · `visible_agent.ts` (validateur +
22 replis bilingues) · `skill.ts` (orchestration, zéro I/O).

**Trois choses ne transitent jamais par un modèle** :
1. **l'entrée** — un épisode relu **en base** à chaque tour, jamais `temp_memory`
   (deux écrivains concurrents, le dernier gagne ; un épisode perdu bloquerait
   tous les suivants par l'index unique, en silence et pour toujours) ;
2. **le refus** — plancher déterministe bilingue **avant** l'appel. Le modèle
   n'a même pas le droit de prononcer `declined` : un refus tiré au sort est pire
   qu'un refus ignoré, il apprend que dire non marche parfois ;
3. **la question d'ouverture** — quatre littéraux gelés. R2 et R3 tiennent à
   quatre mots ; un gabarit gelé les rend vérifiables par lecture.

Les deux trappes (`restrictionFlagged`, `crisis`) sont **requises par le type**.
La crise passe devant le plancher TCA, qui passe devant tout.

Route : **continuation seule**, sous les deux ceintures **et sous la détresse**
(`distress === null`). Sans ce dernier test, un épisode ouvert avalerait « je n'en
peux plus » et répondrait par une proposition de petit-déjeuner.

### ⑤ Les actions — et la restriction qui compte

`named_spot` → canal FF-028 (`add_breakfast` / `add_afternoon_snack`), **à
l'endroit nommé uniquement** (voir le RED du run réel, §4).
`plan_mismatch` → contraintes pratiques + fenêtre de plan, jamais une collation.
`activity_drop` → consigné, **aucune prescription d'exercice** (dépendance
FF-055 non touchée, §8).
`medical` → enregistré, zéro interprétation, orientation médecin.
`life_factor` → accusé honnête, **aucune promesse de levier**.
`not_a_divergence` → « rien à changer », et le flow SORT (0 question autorisée :
« mais garde un œil dessus ? » ré-ouvrirait l'anxiété).
`unknown` → fenêtre d'observation. `declined` → une phrase, cooldown doublé.
`other` → reformuler **une** fois, puis clore.

### ⑥ La fenêtre d'observation — et **le choix sur la question ouverte §11**

> **§11 tranché AU PLUS SIMPLE : un MARQUEUR de dates, pas un lien explicite.**

Deux colonnes sur l'épisode (`observation_opened_on`, `observation_ends_on`).
**Aucune colonne n'est ajoutée aux tables de déclaration, aucun plancher n'est
modifié.** Le choix est documenté dans l'en-tête de la migration et dans le
commentaire de colonne. Trois raisons, la première suffit :

1. un lien explicite exigerait qu'un plancher **déterministe** (FF-017, FF-009)
   connaisse l'existence de ce flow — c'est-à-dire qu'une **ceinture dépende
   d'une fonctionnalité de valeur**, l'inversion exacte que T7 interdit ;
2. les déclarations n'appartiennent pas à l'épisode : elles existent pour
   elles-mêmes, et une fenêtre annulée ne doit rien effacer ;
3. l'intervalle de dates reste relisible même si la ligne d'épisode a été purgée.

Coût assumé : une déclaration faite pendant la fenêtre n'est pas distinguable
d'une déclaration ordinaire du même jour. **C'est correct** — le recalage veut
tout ce qui a été mangé en plus sur ces trois jours, pas seulement ce qui a été
dit « à cause de » la fenêtre.

---

## 3. Écarts fiche ↔ code, et ce qui a été fait

| # | Écart | Décision |
|---|---|---|
| E1 | §3 : « **2 à 3** mesures consécutives » — fourchette non tranchée | **Code aligné sur 3**, raison chiffrée dans la constante. Pas d'amendement : la fiche autorise les deux |
| E2 | R9 « ≥ 1 cycle de plan, 2 après refus » **contredit** §3 « mensuel, il devient une convocation » | **Les deux ne peuvent pas être vrais ensemble.** Le code applique le plus long : 1 cycle **ET** 42 jours minimum (84 après refus). **Amendement PROPOSÉ, non appliqué** — §10 |
| E3 | §3 « Majeur, titulaire du compte » vs. une date de naissance **absente** chez tous les élèves d'avant le chantier d'âge | **Code aligné sur la garde d'âge du dépôt** (`weekPlanAgeGate` : seul un mineur **avéré** bloque). Ne pas durcir ici évite une **seconde politique d'âge** dans le produit. **Arbitrage humain ouvert** — §10 |
| E4 | §3 « le flow classe dans les catégories », §4 « le tap est l'effet » | Le reducer n'écrit **jamais** `acted` : la classification produit `in_flow`, seul le tap FF-028 fera `acted`. **Conforme, et rendu impossible autrement** |
| E5 | §4 « le plan absorbe **à l'endroit nommé** » — le détail que le code ne portait pas | **Défaut réel corrigé** (§4). Le classifieur rend maintenant un MOMENT fermé, et la table moment→action est **trouée** exprès |

---

## 4. 🔴 LE DÉFAUT QUE SEUL LE RUN RÉEL POUVAIT TROUVER

> **« Le matin je grignote en me levant » → « Le plan peut ajouter une collation
> l'après-midi pour calmer ça. Je le fais ? »**
> (relu en base, `chat_messages`, run du 2026-08-11)

C'est **mot pour mot** ce que §1 de la fiche décrit : *« proposer une collation
du soir à quelqu'un dont le problème est le matin — c'est se tromper deux fois et
perdre sa confiance ».*

**La cause** : `buildActionSpace` (FF-028) n'inclut que ce qui **change** quelque
chose. L'élève avait déjà un petit-déjeuner dans son rythme effectif, donc
`add_breakfast` n'était pas dans l'espace, et mon reducer prenait « la première
action disponible dans un ordre fixe ».

**Aucun test unitaire ne pouvait l'attraper** : mes fixtures passaient toujours
les deux actions. Il fallait un rythme réel où l'action évidente n'est **pas**
disponible.

**Le correctif** (`42003ce2`) : le classifieur rend un `slot` dans un ensemble
fermé (`morning`, `midday`, `afternoon`, `evening`, `night`, `unspecified`), et
`SLOT_TO_RECOMMENDATION_ACTION` est une table **explicite et trouée** — `midday`,
`evening`, `night` et `unspecified` n'ont **aucune** action. Les trous sont le
sujet : le plan ne sait pas encore absorber une reprise à table le soir, et le
flow le **dit** plutôt que d'agir à côté. Réponse mesurée après correctif :
*« C'est noté pour le plan, et ça orientera la prochaine semaine à construire. »*

**Second correctif du même run** : ma garde de bande de sécurité était
`safetyBand !== "none"`. Mesuré : *« je n'ai pas envie d'en parler »* remonte la
bande au-dessus de `none`. Un refus se transformait donc en **silence permanent
par un chemin autre que le cooldown** — un effet durable posé par accident, et
invisible. Aligné sur `blocksDurableWrite` (la définition unique du dépôt :
`medium`/`high`/`critical`).

---

## 5. Tableau des tests en conditions réelles

Vraie base locale, vraies edge functions, vrai modèle. Sonde :
`scratchpad/ff056_real_run.ts`. Chaque verdict cite sa **ligne relue en base**.

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| easy | perte + 3 mesures qui montent (FR) → la question part | **GREEN** | `outcome=asked` ; `student_weight_divergence_episodes` = `proposed / moving_away / down` ; `meal_precision_questions.ask_kind = weight_divergence_question`, `axis = null` |
| easy | la question est le littéral gelé FR, sujet = LE PLAN | **GREEN** | `chat_messages` : « Si tu manges ce qui est prévu, normalement ça devrait descendre. Qu'est-ce qui se passe ? » |
| easy | réponse `named_spot` (FR) → catégorie écrite, épisode avancé | **GREEN** | épisode `in_flow / named_spot / turn_count=1` ; réponse : « C'est noté pour le plan, et ça orientera la prochaine semaine à construire. » |
| easy | même cas en anglais → littéral gelé EN | **GREEN** | « If you're eating what's planned, it should normally be going down. What's going on? » |
| medium | UNE seule pesée en hausse dans une série stable → RIEN | **GREEN** | `{"outcome":"no_divergence","verdict":"noisy"}` ; 0 ligne d'épisode |
| medium | bruit hydrique sans tendance → RIEN | **GREEN** | `verdict: noisy` |
| medium | objectif `recomposition` → aucune direction | **GREEN** | `verdict: no_directional_goal` |
| medium | prise de masse qui STAGNE → même flow, formulation neutre | **GREEN** | `outcome=asked` ; message « …devrait **monter**… » |
| medium | budget T4 déjà pris → la question ATTEND | **GREEN** | `{"outcome":"skipped","reason":"ask_budget_taken"}` ; **0 épisode** |
| hard | élève MINEUR → muet | **GREEN** | `reason: minor_student` |
| hard | J+1 après la fin du plan (jour de FF-054) → muet | **GREEN** | `reason: too_soon_after_plan_end` |
| hard | refus **FR** → `declined`, sortie immédiate | **GREEN** | épisode `declined` ; « Le plan prend ça en compte et s'arrête ici. » |
| hard | refus FR → cooldown, aucune nouvelle question | **GREEN** | `reason: cooldown` |
| hard | refus **EN** → `declined`, sortie immédiate | **GREEN** | épisode `declined` ; « The plan stands as is. » |
| hard | refus EN → cooldown | **GREEN** | `reason: cooldown` |
| hard | question ignorée → expiration **silencieuse** | **GREEN** | épisode `expired` ; pas suivant `reason: cooldown` |
| hard | l'expiration n'envoie **aucun** message | **GREEN** | `count(chat_messages assistant) = 1` (la seule question d'ouverture) |
| hard | `restriction_flag` levé → muet | **GREEN** | `reason: restriction_flag` (plancher **réel**, sur la série de mesures) |
| extra-hard | **deux instances du job en parallèle** | **GREEN** | 1 épisode, 1 demande ; l'index unique arbitre (`a=skipped b=asked`) |
| extra-hard | question FR, réponse **EN** `medical` → classée, zéro interprétation | **GREEN** | épisode `medical` ; « Le plan médical relève d'un médecin. » |
| extra-hard | `unknown` → fenêtre d'observation bornée à J+3 | **GREEN** | `observation_ends_on = J+3` ; « …pendant quelques jours, puis je recalcule, et ça s'arrête tout seul. La fin est déjà fixée. » |
| adversarial | après l'épisode, 3 tours ordinaires ne rappellent RIEN | **GREEN** | « Avec plaisir 🙂 » / « Pas grand-chose de nouveau… » / « 👍 » — aucune mention |
| adversarial | un autre compte ne voit RIEN de l'épisode d'autrui | **GREEN** | réponse ordinaire sur le plan du soir |

**23 / 23 GREEN.** Fixtures nettoyées, **vérifiées à zéro** :
`student_weight_divergence_episodes = 0`, `ask_kind='weight_divergence_question' = 0`.

### Tests déterministes (73, hors réseau)

| Fichier | Nombre | Ce qu'ils épinglent |
|---|---|---|
| `weight_divergence_test.ts` | 28 | Les 8 seuils, les 8 verdicts, la **symétrie** (la même série rend des verdicts opposés selon l'objectif), les entrées qui mentent |
| `weight_divergence_engine_test.ts` | 12 | Le cooldown (dont « un épisode postérieur n'efface pas le doublement d'un refus »), les 4 littéraux d'ouverture soumis aux 4 listes d'interdits |
| `skills/weight_divergence/weight_divergence_test.ts` | 33 | Les 2 trappes, les 9 catégories énumérées, `other` par défaut sur 12 valeurs illégitimes, le refus bilingue, le **défaut du run réel** épinglé, les **22 replis soumis à leur propre validateur** |

---

## 6. Hypothèses adversariales — écrites AVANT, et leur sort

| # | Hypothèse | Sort |
|---|---|---|
| A1 | Le framing « il ment » existe dans mes prompts internes | **RÉFUTÉE** — le classifieur ne reçoit **que la phrase**, aucune série, aucune coche. Le prompt visible interdit nommément « are you sure », « be honest », la référence aux coches, et le validateur mord sur 10 locutions FR+EN, **négation comprise** (mode absolu du matcher) |
| A2 | Le flow trouve toujours un problème | **RÉFUTÉE** — `not_a_divergence` conclut `nothing_to_change` avec **0 question autorisée** (test) ; 5 des 9 catégories ferment sans rien proposer |
| A3 | La question se re-pose après l'épisode | **RÉFUTÉE en réel** — 3 tours ordinaires après un `named_spot`, aucune mention résiduelle |
| A4 | Un chiffre d'énergie passe en toutes lettres | **RÉFUTÉE** — 6 formulations FR+EN bloquées, dont « environ trois cents calories » (le trou exact de FF-018). Tout chiffre est bloqué en bloc |
| A5 | Fuite au foyer | **RÉFUTÉE en réel** — un second compte ne voit rien ; RLS `select` titulaire seul, aucune policy d'écriture |
| A6 | Sophia devine la cause sur « je ne sais pas » | **RÉFUTÉE en réel** — la réponse ouvre la fenêtre d'observation, ne nomme aucun moment |
| A7 | Un texte lie la question à la pesée (le RED §10) | **RÉFUTÉE** — 5 formulations bloquées, et les 22 replis sont testés à zéro occurrence de « balance / scale / pesée / weigh / poids / weight » |
| A8 | Deux instances du job posent deux questions | **RÉFUTÉE en réel** — index unique partiel, 1 épisode / 1 demande |
| A9 | Un refus est classé par le modèle, donc parfois ignoré | **RÉFUTÉE par construction** — plancher déterministe avant l'appel, **et le modèle n'a pas le droit de rendre `declined`** (replié en `other`) |
| A10 | Le repli déterministe est monolingue (cicatrice T-19) | **RÉFUTÉE** — 22 littéraux, 2 langues, et une locale inconnue retombe sur l'**anglais** |
| **A11** | **Le flow propose une action ailleurs que là où la personne a nommé** | **🔴 CONFIRMÉE en run réel** — corrigée (§4) |
| **A12** | **Ma garde de bande de sécurité est plus stricte que celle du dépôt** | **🔴 CONFIRMÉE en run réel** — corrigée (§4) |
| A13 | Ma propre sonde ment (T-15) | **🔴 CONFIRMÉE** — le pas simule 19h30, donc **dans le futur** ; `turn()` relisait « aucune réponse » sur des tours qui répondaient. Le test A3 était **GREEN parce qu'il n'avait rien lu**. Corrigé et documenté dans la sonde |
| A14 | Le plancher de refus rate une forme courante | **🔴 CONFIRMÉE** — « on parle d'autre chose » passait à travers. Corrigée |
| A15 | L'apostrophe désarme le validateur en français | **🔴 CONFIRMÉE** — « puisque tu t'es pesé » et « t'es sûr » passaient, **en français seulement**. Corrigée (apostrophes → espaces avant le scan) |
| A16 | Un repli échoue son propre validateur | **🔴 CONFIRMÉE** — le repli EN de la proposition portait deux questions. Corrigé, et le test énumère désormais les 22 |
| A17 | Le lexique de refus mord sur une vraie réponse | **RÉFUTÉE** — 11 phrases de contrôle testées, dont « ça va » / « I'm fine », **délibérément exclues** du lexique (sous ce flow, c'est une contestation du constat, pas un refus) |

**Non testable en local, consigné comme tel** : le RED majeur §10 (« la personne
continue-t-elle à se peser après un épisode ? »). On ne peut pas le mesurer sans
utilisateurs réels. Ce qui est **garanti** à la place : aucun texte ne lie la
conversation à la pesée (A7), et `DIVERGENCE_STALE_DAYS` fait taire le mécanisme
de lui-même si la série s'arrête.

---

## 7. Rouges pré-existants (non réparés, comme la règle l'exige)

3 rouges dans la suite Deno, **prouvés antérieurs** : ni les modules testés ni
leurs tests ne sont modifiés par ce lot (`git status --porcelain` rend vide sur
`_shared/chat/` et `day_properties*`).

| Test | Cause tracée |
|---|---|
| `day_properties_test.ts:383` « R6 — un seul bump » | Une **autre session** a bumpé `MEAL_PROMPT_VERSION` en `meal.en.v8_distinct_health_direction` (`meal_generation.ts:589`, fichier réservé) ; le test attend `v7` |
| `recent_history_test.ts:86` et `:113` | `_shared/chat/recent_history.ts` **non modifié** dans l'arbre : rouge au HEAD |

---

## 8. Dépendances bloquées sur les fichiers d'autrui

### 🔴 B1 — L'EXPORT RGPD (`account-export-v1/index.ts`)

La table rejoint le cycle de vie **à moitié** :
- **purge : ✅ garantie** — `on delete cascade`, **prouvée dans la migration**
  (bloc (j) : l'épisode disparaît avec `auth.users`) ;
- **export : ❌ bloqué** — la liste est **en dur** dans
  `supabase/functions/account-export-v1/index.ts`, fichier modifié par une autre
  session. C'est exactement la cicatrice
  *« le lifecycle RGPD ne réclame pas les tables neuves »* (9 tables déjà hors
  export).

La table **est** réclamée dans `keel_gdpr_lifecycle_test.ts` (`PIVOT_TABLES`,
`marker: null` — elle ne contient aucune prose, donc la présence d'une chaîne
dans l'archive n'est pas le contrôle qui compte pour elle).

**Le diff exact à appliquer** (à côté de `student_hunger_reports`, ~l.733) :

```ts
    fetchKeelRows(
      admin,
      "student_weight_divergence_episodes",
      SCOPE.weightDivergenceEpisodes,   // à déclarer dans SCOPE
      "user_id",
      user.id,
      keelUnavailable,
    ),
```

### 🟠 B2 — L'ACTIVITÉ (`activity_floor.ts` / `activity_stance.ts`, FF-055)

FF-055 est en cours d'écriture. **Aucun chemin d'activité parallèle n'a été
construit** : `activity_drop` est *consigné* (catégorie sur l'épisode) et sa
tâche visible interdit nommément toute prescription d'exercice
(`NEVER prescribe, suggest or encourage any exercise, in any form`). Le raccord
vers les pratiques (FF-029) exigerait d'écrire dans les fichiers de FF-055 :
**non fait, consigné**.

### 🟢 B3 — `meal_generation.ts` / `plan_feedback.ts`

**Lus et appelés, jamais écrits.** `planEndsOn` / `ends_on` sont relus depuis la
colonne générée en base plutôt que recalculés.

---

## 9. Ce qui reste ouvert

1. 🟠 **Le recalage de fin de fenêtre d'observation n'a pas d'appelant.**
   L'ouverture, les bornes, la date de fin et le message d'annonce sont livrés et
   mesurés. Ce qui manque est le **balayage à J+3** qui relit les déclarations de
   l'intervalle, recale le plan et envoie la phrase de clôture. L'index
   `weight_divergence_observation_ends_idx` existe pour lui. **C'est un lot
   court et bien cerné** (une fonction dans le même batch du soir), et c'est le
   candidat n°1 pour la suite.
2. 🟠 **Le tap FF-028 ne fait pas passer l'épisode à `acted`.**
   `deterministic_buttons.ts` reçoit le tap et écrit la directive ; il ne sait
   pas qu'un épisode de divergence l'attend. Conséquence mesurable : la part des
   épisodes finissant en `acted` (§10) sera **structurellement zéro** tant que ce
   raccord manque. **Aucun chiffre de §10 sur cette ligne ne doit être lu avant.**
3. **`keel-daily-recommendation-v1` balaie `keel_role = 'student'`.** Dans le
   pivot foyer B2C, un titulaire qui n'est pas « student » ne sera jamais balayé.
   Hérité du cron, non touché — mais à trancher avec le chantier foyer.
4. **La langue de la réponse suit `profiles.locale`, pas la langue du message.**
   Mesuré : question FR → réponse EN de l'élève → réponse **en français**. C'est
   le comportement voulu depuis le lot L1 ; consigné comme observation.
5. **Le seuil de stagnation (5 semaines) n'a jamais vu de données réelles.**
   §9 le dit : « il se calibre sur des séries réelles ». Les constantes sont
   exportées et pinnées pour que le recalibrage soit une décision écrite.

---

## 10. Amendements de fiche PROPOSÉS — aucun appliqué

### AM-1 · R9 se contredit avec §3 (le plus important)

**Aujourd'hui**, R9 : *« Une demande sur le budget T4, cooldown ≥ 1 cycle de plan
(2 après refus) »* — et §3 : *« Cooldown long ; ce flow a le droit d'être rare.
Mensuel, il devient une convocation. »*

Un cycle de plan vaut 7 jours. R9 appliquée seule autorise donc un épisode
toutes les deux semaines — **quatre fois plus fréquent que le « mensuel » que la
même fiche nomme comme le mode de défaillance.**

**Rédaction de remplacement proposée pour R9** :
> Une demande sur le budget T4. Cooldown : **le plus long** d'un cycle de plan
> complet et de **six semaines** — doublé après un refus. Six et pas quatre,
> parce que quatre EST le rythme mensuel que §3 nomme comme la convocation.

### AM-2 · §3 « Majeur, titulaire du compte » n'est pas implémentable tel quel

La quasi-totalité des élèves n'a **pas** de `birth_date`. Une lecture littérale
(« seuls les majeurs avérés ») rend la fonctionnalité morte à la livraison,
silencieusement. Le code applique la garde d'âge **existante** du dépôt
(`weekPlanAgeGate` : seul un mineur avéré bloque) pour ne pas créer une seconde
politique d'âge.

**Rédaction proposée** : *« Jamais un mineur avéré (`weekPlanAgeGate`), jamais
une bouche sans compte. Une date de naissance absente ne bloque pas — c'est la
politique d'âge unique du produit, et la durcir ici seul créerait une seconde
définition du mineur. »*

**Si l'humain préfère durcir**, le changement tient en une ligne
(`weight_divergence_engine.ts`) : remplacer `if (!ageGate.allowed)` par
`if (ageGate.reason !== "adult")`.

### AM-3 · §4 gagnerait à dire « à l'endroit nommé, ou nulle part »

Le circuit dit « le plan absorbe **à l'endroit nommé** ». Le run réel a montré
que cette phrase a un **corollaire non écrit** qui est celui qui protège :
*quand l'endroit nommé n'a aucune action disponible, on ne propose RIEN.*
Proposition d'ajout au §3, ligne `named_spot` : *« …via le canal de directives
de FF-028 — **et si le moment nommé n'a aucune action pré-calculée, le flow le
dit et ne propose rien** »*.

---

## 11. Commandes pour l'humain

```bash
# 1. LA MIGRATION — appliquée en LOCAL seulement. Elle doit partir AVANT le
#    deploy, sinon le batch du soir écrit dans une table qui n'existe pas et le
#    CHECK `ask_kind` refuse le cinquième genre en prod.
supabase db push

# 2. LES FONCTIONS EDGE.
#    sophia-brain              — la skill, la route, le maillon de run.ts
#    keel-daily-recommendation-v1 — le déclencheur du soir (greffé)
supabase functions deploy sophia-brain keel-daily-recommendation-v1

# 3. AUCUN SECRET, AUCUN CRON NOUVEAU. Le balayage horaire de
#    keel-daily-recommendation-v1 est déjà en place: FF-056 s'y greffe.
```

**Contrôle après deploy** — le compte-rendu du job porte les nouveaux compteurs :

```bash
# divergence_verdicts est LA mesure à regarder les premiers jours.
# `irregular_measurements` + `stale_measurements` qui montent = le RED §10.
curl -s -X POST "$SUPABASE_URL/functions/v1/keel-daily-recommendation-v1" \
  -H "x-internal-secret: $INTERNAL_SECRET" \
  -H 'content-type: application/json' \
  -d '{"dry_run": true}' | jq '{divergence_asked, divergence_verdicts, divergence_shapes, divergence_skipped_by_reason}'
```

**Rejeu du run réel** (fixtures nettoyées automatiquement) :

```bash
./scripts/local_extend_kong_functions_timeout.sh
eval "$(supabase status -o env | sed 's/^ANON_KEY/SUPABASE_ANON_KEY/; s/^SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY/')"
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  deno run -A scratchpad/ff056_real_run.ts
```

**Décisions attendues** : AM-1 (le cooldown — c'est la plus importante), AM-2
(la garde d'âge), AM-3 (la rédaction de §3), et le lot ⑥-bis (le recalage de
fin de fenêtre) + le raccord du tap FF-028 → `acted`.
