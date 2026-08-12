# RAPPORT · FF-057 — La procédure accident

**Date** : 2026-08-12 (nuit) · **Branche** : `ff-001-quotidien-du-coach` · aucun push
**Fiche** : `docs/fonctionnalites/composition-des-repas/FF-057-la-procedure-accident.md`
**Commits** : `81357602` (les modules) · `ee30f8b2` (les trois défauts trouvés en run)

---

## 1. État initial constaté — avec preuves

| Constat | Preuve |
|---|---|
| **La fonctionnalité n'existait pas.** Aucun code, seulement des renvois « c'est FF-057 ». | `deterministic_buttons.ts:470-471` (« ce que devient un `✗` → FF-057, pas ici »), `:561` ; `evening_strip_io.ts:561` ; `migration 20260812120000:27-28` |
| **Aucune table ne portait l'exécution d'une session.** Ni sur `preparations`, ni sur `cooking_sessions`, ni ailleurs. | `\d student_generated_meals` — `cooking_sessions jsonb` sans champ d'état ; `select count(*) from information_schema.columns where table_name='cooking_session_states'` → 0 avant ce lot |
| **La décoche existe et elle est bonne**, append-only, `MEAL_UNTICK_REASON = 'food_not_eaten'`. | `_shared/keel/meal_tick.ts:50-94` |
| **Le `✗` d'un plat jamais coché INSÈRE la ligne** (décision FF-058). Mon entrée n°1 existe donc toujours. | `evening_strip_io.ts:16-24` |
| **Aucun écrivain `off_plan` utilisable depuis un TAP.** Les deux chemins de tap codent `as_planned` en dur ; le seul chemin `off_plan` part d'un `TurnFrame`. | `evening_strip_io.ts:422` · `frontend/src/keel/api/mealTicks.ts:110` · `sophia-brain/router/run.ts:1782` (`mealDeclarationFloorEffect`) |
| **`grocery_waves.ts` calcule `buyOn`, `servesCookOn`, `PERISHABLE_AISLES`, `MAX_FRIDGE_DAYS = 3`** — et il est la SEULE définition de la règle. | `_shared/keel/grocery_waves.ts:19-31, 173-230` |
| **`grocery_wave_states` est prête** : clé `(user_id, generated_meal_id, buy_on)`, `done` jamais NULL, `answered_local_date` = la date d'achat réelle. | `migration 20260812120000` · relu en base |
| **Le chat in-app a retrouvé son historique** — la correction du socle est confirmée. | `chat-inbound-v1/index.ts:374` (« CE FICHIER PASSAIT `history: []` »), `:51` importe `loadRecentChatHistory` |
| **`restriction_flag` n'a toujours aucun producteur.** | `keel-daily-pulse-v1`, pavé « LE PLANCHER TCA DURABLE » |
| **Le budget T4 compte 5 familles**, dont `weight_divergence_question` (FF-056). | `daily_ask_budget.ts:50-79`, `DAILY_ASK_BUDGET = 1` |

---

## 2. Écarts fiche / code, et ce qui a été fait

Aucun écart *fiche contre code* : rien n'existait. Ce qui suit est ce qui a été
construit, section par section.

| Fiche | Construit | Où |
|---|---|---|
| ① le formulaire, 3 boutons fermés | `buildAccidentForm` — 3 boutons, jamais 4, `restrictionFlag` et `hasPlan` **requis** | `_shared/keel/accident.ts` |
| ① les 3 écritures | décoche (chemin de l'écran, `applyStripTicks`) · `writeOffPlanTapFact` (aucun `food_group_ref` **possible**) · invitation photo par le gate **pur** de FF-025 | `accident_io.ts`, `_shared/chat/accident_tap.ts` |
| ② le marqueur de session | table `cooking_session_states`, clé `(user_id, generated_meal_id, cook_on)` | `migration 20260812140000` |
| ② la cascade | `cascadeSkippedSession` — pure, 4 conditions, **rien n'est écrit** | `accident.ts` |
| ③ le décalage temporel | `planSessionShift` (3 motifs nommés + `no_session`), `shiftPlanDates`, `applyPlanShift` (écrit → relit → vérifie l'empreinte) | `accident.ts`, `accident_io.ts` |
| ④ l'espace de réalignement | `buildRealignmentSpace` — liste **fermée**, `nothing_to_change` toujours dernier | `accident.ts` |
| R11 / R8 | `acceptAccidentText` — 2 familles interdites, FR + EN, `allowQuestionMark` **requis** | `accident.ts` |
| le filtre de lecture | `loadSkippedDishIndexes` branché dans `loadEveningStripContext` : la bande cesse de nommer un plat jamais cuisiné | `accident_io.ts`, `evening_strip_io.ts` |

### Amendements de fiche PROPOSÉS (non appliqués — l'humain tranche)

1. **§3 B, action n°2 « signaler un reste disponible » : NON CONSTRUITE, et c'est
   une décision.** Aucune table ne porte un reste, aucun générateur ne le lit,
   aucun écran ne l'affiche. L'écrire violerait la règle mère T1 (« on ne
   collecte une donnée que si quelque chose en aval la consomme ») **dans la
   fiche qui la cite**. Le §8 ne la teste d'ailleurs pas. Elle rentre en trois
   lignes le jour où un lecteur existe (`REALIGNMENT_ACTIONS`).
2. **§3 ①, l'entrée « conversation » n'ouvre pas le formulaire, et ne le doit
   probablement pas.** Voir §5 H-C et §7 n°1 : la personne qui écrit « j'ai
   commandé une pizza » vient de RÉPONDRE au formulaire. Le lui afficher serait
   redemander une information donnée — exactement ce que la revue adversariale
   du bloc interdit. Ce qui manque sur ce chemin est la **décoche du plat prévu**,
   pas le formulaire. La fiche gagnerait à le dire.
3. **§7, ligne « Vague 1 faite, vague 2 non, décalage de 3 jours ».** Ce
   déclencheur-là est **structurellement inatteignable** par la porte des
   courses : la vague qui nourrit une session EST celle dont le `Pas encore`
   déclenche le décalage, donc rien n'est au frigo. Le « frigo plein » du §9 est
   réel et atteignable, mais par la **session sautée** (courses faites, cuisson
   tombée). Détail et preuve au §4.
4. **§6 R14 donne trois motifs ; il en faut un quatrième, `no_session`** — « cette
   date ne porte aucune cuisson ». Sans lui, un tap sur une date sans session
   tombe dans un refus générique qui ne dit rien.

---

## 3. Tableau des tests

### Unitaires (purs) — environnement PURGÉ

`supabase/functions/_shared/keel/accident_test.ts` : **50 verts / 0 rouge**
Régression FF-058 : `evening_strip_test.ts` + `daily_pulse_test.ts` : **61 verts**

| Niveau | Test | Règle | Verdict |
|---|---|---|---|
| easy | les **quatre** vocabulaires déterministes ne se croisent pas | §5 | 🟢 |
| easy | 14 charges malformées ⇒ `none`, jamais une supposition | §5 | 🟢 |
| easy | chaque identifiant se relit exactement comme écrit | §5 | 🟢 |
| medium | la cascade invalide **exactement** les repas de la session | R2 | 🟢 |
| medium | les repas d'une **autre** session ne sont pas touchés | R2 | 🟢 |
| hard | un repas de la session **déjà coché SURVIT** | §7 | 🟢 |
| hard | un repas mangé **avant** la cuisson n'est pas invalidé | R2 | 🟢 |
| hard | un plat en lot présent deux jours : seul celui de la session tombe | R1 | 🟢 |
| medium | le plus petit décalage viable est +1 quand c'est possible | §11 | 🟢 |
| hard | `already_cooked` · `outside_plan_window` · `no_session` | R14 | 🟢 |
| hard | `perishables_at_risk` depuis la **date d'achat réelle** | R14 / §9 | 🟢 |
| **hard** | **MUTATION** — le verdict change quand `MAX_FRIDGE_DAYS` bouge (3 ⇒ ok, 2 ⇒ refus) | — | 🟢 |
| **hard** | **le frais d'une cuisson QUI NE BOUGE PAS ne refuse rien** (défaut mesuré) | R14 | 🟢 |
| hard | …et le **même décor** refuse quand l'aliment attend la cuisson qui bouge | R14 | 🟢 |
| hard | la normalisation des termes suit celle des vagues, accents compris | — | 🟢 |
| extra-hard | **R13** — le glissement ne change QUE les jours : titres, `uses`, ingrédients, `startsOn`, ordre inchangés | R13 | 🟢 |
| extra-hard | le payload écrit ne porte QUE `dishes`/`preparations`/`cooking_sessions`, et tout le reste de la ligne survit | R13 | 🟢 |
| hard | l'empreinte **change** après un glissement (double tap périmé) | R7 | 🟢 |
| medium | l'empreinte **ignore** les titres : renommer un plat ne périme rien | R7 | 🟢 |
| hard | **R11** — la ceinture mord sur **16** tournures prospectives, FR + EN | R11 / T9 | 🟢 |
| hard | R11 — la négation ne blanchit pas | R11 | 🟢 |
| **hard** | **LE CAS QUI PASSE** — le texte RÉEL (proposition, formulaire, 4 refus, 4 accusés) ne mord pas, FR + EN | R11 | 🟢 |
| hard | **MUTATION** — `allowQuestionMark` change réellement le verdict | — | 🟢 |
| hard | R8 — le verrou de vocabulaire mord sur 9 formes, FR + EN ; et il ne mord pas sur le texte légitime | R8 | 🟢 |
| hard | R9 — sous plancher : aucun formulaire ; **et le cas qui passe**, plancher désarmé | R9 | 🟢 |
| hard | §7 — sans plan courant, le formulaire se referme | §7 | 🟢 |
| extra-hard | §10 — l'entête n'énonce **aucune obligation** (7 formes, 2 langues) | §10 | 🟢 |
| medium | R3 — l'espace d'action est une liste fermée ; un glissement refusé n'y entre jamais | R3 | 🟢 |
| medium | R4 — « ne rien faire » est toujours la dernière sortie, et parfois la seule | R4 | 🟢 |
| hard | §8 — « décaler » **sort de l'espace** quand la fenêtre frigo est dépassée (muté 3 ⇒ 2) | §8 | 🟢 |
| medium | R15 — 4 motifs × 2 langues = 8 textes **distincts**, jamais un silence | R15 | 🟢 |

### Conditions réelles — `FF057_accident.ts`, **70 verts / 0 rouge, 3 runs sur 3**

Vraie base locale, vrais élèves provisionnés (plan publié + engagements), vrais
taps par `chat-inbound-v1`, lignes relues en base. Aucun cron appelé.

| Niveau | Scénario | Verdict | Preuve (ligne DB / texte relu) |
|---|---|---|---|
| easy ×3 EN + ×1 FR | le `✗` ouvre le formulaire à 3 boutons | 🟢 | `"Sheet-pan dinner did not happen as planned."` + 3 `KEEL_FIX_*` |
| easy | « J'ai commandé » ⇒ la **décoche** est écrite | 🟢 | `meal_tick:<id>:0\|2026-08-12\|food_not_eaten\|as_planned` |
| easy | …et le **fait hors plan** est écrit | 🟢 | `accident_off_plan:<id>:0\|2026-08-12\|off_plan\|quick_tap` |
| easy | …**aucun aliment inventé** | 🟢 | `food_group_ref=null substance_ref=null note=null` |
| easy | …l'invitation photo part, budget libre | 🟢 | `meal_precision_questions` : 1 ligne `photo_invitation` · `"If you have a photo of it…"` |
| medium | « Pas eu le temps » ⇒ décoche **seule** | 🟢 | `meal_tick:…\|food_not_eaten` présent, `accident_off_plan:…` **absent** |
| medium | « mangé autre chose » ⇒ `off_plan`, **aucun** `food_group_ref` | 🟢 | `accident_off_plan:<id>:1\|off_plan\|fgr=null` |
| medium | « mangé autre chose » ⇒ **rien de plus** | 🟢 | 0 bouton, `"Noted."` |
| medium | double tap ⇒ **une** ligne hors plan (arbitré par Postgres) | 🟢 | `lignes=1` |
| courses EN+FR | `Pas encore` ⇒ décalage **calculé**, 2 boutons | 🟢 | `"Les courses ne sont pas faites. On décale la cuisson à lundi."` / `"…Moving the cooking to Monday."` |
| courses EN+FR | **aucune question ouverte** dans le texte | 🟢 | 0 `?`, 0 `when`/`quand`/`what time`/`quel jour` |
| courses | l'état de vague est écrit par FF-058, intact | 🟢 | `[{"buy_on":"2026-08-13","done":false}]` |
| courses EN+FR | `Oui` ⇒ la cuisson glisse | 🟢 | `session=sun prep=sun → session=mon prep=mon` |
| courses EN+FR | …et les repas qu'elle nourrit glissent du **même delta** | 🟢 | `sun,mon → mon,tue` |
| courses EN+FR | **V3 fermé** : titres, ingrédients, `uses`, méthode inchangés | 🟢 | `Cooked meal one \| Cooked meal two` · `méthode prep: Roast.` |
| hard EN+FR | double tap sur la même bulle ⇒ le plan ne glisse pas deux fois | 🟢 | `mon,tue` inchangé · `"That one is out of date now — nothing was saved."` |
| courses | `Non, je gère` ⇒ **rien** ne change | 🟢 | payload identique octet pour octet |
| courses | `Non, je gère` ⇒ **aucun état écrit** (pas de relance) | 🟢 | `cooking_session_states=[]` |
| courses | courses faites + cuisson tombée ⇒ `perishables_at_risk`, **motif dit** | 🟢 | `"…would leave fresh food you already bought too long in the fridge…"` · achat réel `2026-08-13`, cuisson `2026-08-16 → 2026-08-17` |
| courses | …et le plan **n'a pas bougé** | 🟢 | `session=sun` (attendu `sun`) |
| courses | **LE CAS QUI PASSE** — rien au frigo ⇒ le glissement **est** proposé | 🟢 | 2 boutons `Yes \| No, I'll handle it` |
| courses | `outside_plan_window`, motif dit | 🟢 | `"…would push a meal past the end of this plan…"` |
| courses | `already_cooked`, motif dit | 🟢 | `"Part of that session is already cooked…"` · preuve : coche vivante sur `meal_tick:<id>:0` |
| extra-hard | deux accidents le même jour ⇒ **une seule** invitation photo | 🟢 | ledger = 1 ; 2e réponse = `"Noted."` |
| extra-hard | …mais les **deux** faits hors plan sont écrits | 🟢 | `accident_off_plan:<id>:0 ; accident_off_plan:<id>:1` |
| extra-hard | le marqueur de session est écrit, daté, `false` | 🟢 | `[{"cook_on":"2026-08-12","happened":false}]` |
| extra-hard | session sur 4 jours : le repas **déjà coché survit** | 🟢 | `meal_tick:<id>:0\|null` toujours vivante |
| extra-hard | la cascade **n'écrit rien** : aucune décoche fabriquée | 🟢 | 0 ligne `food_not_eaten` sur les 3 autres |
| extra-hard | la réponse **nomme** ce qui tombe | 🟢 | `"3 meals were drawing on that session — they are no longer in the plan."` |
| extra-hard | deux sessions ⇒ deux états indépendants | 🟢 | `[{2026-08-12,false},{2026-08-14,true}]` |
| extra-hard | `✗` **et** `Pas encore` le même soir ⇒ **une** chose par échange | 🟢 | `✗` → 3 boutons `KEEL_FIX_*` ; `Pas encore` → 2 boutons `KEEL_FIX_SHIFT_*` |
| extra-hard | …et **aucune** invitation photo avec la proposition de décalage | 🟢 | ledger `photo_invitation` = 0 |
| extra-hard | **accident + FF-056** le même jour ⇒ budget T4 **partagé**, pas doublé | 🟢 | ledger = `["weight_divergence_question"]` seul |
| extra-hard | …mais le fait hors plan est écrit quand même | 🟢 | `accident_off_plan:<id>:2\|off_plan` |
| hard | charge forgée sur le plan d'autrui ⇒ **rien** chez l'attaquant | 🟢 | `(aucune ligne)` |
| hard | …ni chez la victime, **et son titre ne fuit pas** | 🟢 | `(aucune ligne)` · réponse sans `SECRET` |
| hard | formulaire sans plan courant ⇒ se referme sans rien écrire | 🟢 | 0 ligne · `"That one is out of date now…"` |
| hard | charge forgée sur la session d'autrui ⇒ aucun état, des deux côtés | 🟢 | `victime=[] attaquant=[]` |
| adversarial | **aucune** question ouverte dans les 33 réponses du run | 🟢 | 0 occurrence, FR + EN |
| adversarial | **aucun** jugement de vocabulaire (`cheat`, `écart`, `craquage`, `rattrapage`…) | 🟢 | 0 occurrence |
| adversarial | **rien** ne lie le signalement à une obligation (contre-mesure §10) | 🟢 | 0 occurrence |

---

## 4. Hypothèses adversariales et leur sort

Chacune est **écrite avant** d'être testée, dans l'en-tête de
`docs/nutrition-pivot/qa-web/FF057_adversarial.ts`. **14 verts / 0 rouge, 3 runs
sur 3** après correction.

| # | Hypothèse | Sort | Preuve |
|---|---|---|---|
| **H1** | Une charge forgée citant le plat de **demain** ferait-elle écrire un fait `off_plan` daté de demain ? | **🔴 CONFIRMÉE — défaut réel, corrigé** | Mesuré : `accident_off_plan:46fe…:1\|2026-08-13\|off_plan`. C'est **la cicatrice H1 de FF-058 rouverte sur un SECOND écrivain** : `writeMealTick` portait `isReportable`, `writeOffPlanTapFact` non. Une preuve fabriquée, append-only, dans la table que le coach lit. Correctif : `today` devient un paramètre **requis** et on réutilise **la** garde du dépôt. Re-testé : `(aucune ligne future)` |
| **H7** | La cascade fait-elle vraiment disparaître les plats de la bande — le plan cesse-t-il de mentir ? | **🔴 CONFIRMÉE — défaut réel, corrigé** | Mesuré : `avant=Eaten already \| Independent \| Never cooked → après=` **identique**. `loadEveningStripContext` sélectionnait une ligne **sans `dishes` ni `cooking_sessions`** : le plan parsé n'avait aucune session, la cascade n'invalidait rien. **Le filtre était vert et ne filtrait rien.** Correctif : les deux colonnes au `select`. Re-testé : `→ Eaten already \| Independent` |
| **H-perishables** | (trouvée par le run nominal, pas par une hypothèse) `perishables_at_risk` refuse-t-il trop large ? | **🔴 CONFIRMÉE — défaut réel, corrigé** | La règle mordait dès qu'une vague faite portait du frais et que la nouvelle date tombait après l'achat — donc elle aurait refusé de décaler la cuisson de **jeudi** à cause du poulet acheté pour celle de **lundi**, qui ne bouge pas. Un motif faux sur un glissement sûr, et une garde qui mord à tort est une garde qu'on débranche. Correctif : la règle mesure l'attente de **chaque aliment** contre la cuisson qu'il attend **dans le plan décalé**. Deux tests l'encadrent dans les deux sens |
| **H2** | Le verrou optimiste tient-il si le plan change entre la proposition et le tap ? | 🟢 réfutée | Plan muté derrière le dos (`dishes` + 1) → `jours après tap=sun,mon,fri` (inchangés) · `"That one is out of date now — nothing was saved."` |
| **H3** | Deux taps **simultanés** sur « Oui » font-ils glisser de deux jours ? | 🟢 réfutée | `Promise.all` de deux taps → `sun,mon → mon,tue` (attendu `mon,tue`) |
| **H4** | Le glissement touche-t-il `starts_on` / `duration_days` / `ends_on` ? Il traverserait la contrainte d'exclusion. | 🟢 réfutée | `starts_on=2026-08-12 duration=7 ends_on=2026-08-18`, inchangés |
| **H5** | La question de session est-elle vraiment posée **une fois par session**, jamais par plat ? | 🟢 réfutée | 1er plat → 2 boutons `KEEL_FIX_SESSION_*` ; après réponse, 2e plat de la MÊME session → `"Nothing to change for the rest of the plan."`, **0 bouton** |
| **H6** | Une session déclarée **faite** peut-elle encore faire tomber des repas ? | 🟢 réfutée | `[{"cook_on":"2026-08-12","happened":true}]`, aucun repas retiré |
| **H8** | Un plat déjà coché reste-t-il annoncé après une session sautée ? | 🟢 réfutée (c'est la règle) | `Eaten already` toujours dans la bande, `Never cooked` parti |
| **H9** | Un `Pas encore` sur une vague qui ne sert **aucune** cuisson propose-t-il quand même quelque chose ? | 🟢 réfutée | `"Noted."`, 0 bouton — rien n'est menacé, on ne fabrique pas d'incident |
| **H10** | Un refus peut-il fuir le **titre** d'un plat d'un autre élève ? | 🟢 réfutée | `"That one is out of date now — nothing was saved."`, sans `CONFIDENTIAL` |
| **H-C** | L'entrée **conversation** ouvre-t-elle la procédure ? | **🟠 NON — et c'est une décision, voir §5** | Le fait `off_plan` et l'invitation photo partent déjà (FF-009 + FF-025). Le formulaire n'est pas ouvert |

---

## 5. Décisions prises seul

> **Décision** — le marqueur de session vit dans une **table à part**
> (`cooking_session_states`), pas dans le payload du plan.
> **Pourquoi** — la fiche §11 dit « le plus simple gagne » ; le plus simple n'est pas le plus court à écrire, c'est celui qui ne fabrique pas de course. Une clé dans `cooking_sessions` (jsonb) forcerait une lecture-modification-écriture **complète** de la ligne du plan pour changer un booléen — la course exacte que `user_chat_states.temp_memory` fait déjà payer à ce dépôt. Et le second écrivain existe **dans la même fiche** : le glissement réécrit ce même jsonb. Un drapeau posé dedans se perdrait dessous, en silence. La table est le jumeau exact de `grocery_wave_states` : même clé, même « l'absence de ligne EST l'inconnu », même « dernière réponse gagne ».
> **Options rejetées** — (a) clé dans le jsonb du plan : course en RMW, et le glissement l'écrase ; (b) réutiliser `protocol_events` : une session n'est pas un fait de consommation, et le vocabulaire fermé de `source` la refuserait ; (c) une ligne append-only par réponse : contredit « c'est un état » et forcerait un `distinct on` chez chaque lecteur.
> **Réversibilité** — élevée. Table neuve, deux lecteurs (`accident_io.ts`, le filtre de la bande) ; `drop table` la retire sans toucher une ligne existante.

> **Décision** — la clé est une **date calendaire**, jamais un jeton de jour.
> **Pourquoi** — le glissement DÉPLACE les sessions. Un jeton (`sun`) cesse alors de désigner la même chose ; la date, elle, reste vraie. « La cuisson du 10 août n'a pas eu lieu » survit au glissement, et la NOUVELLE date n'a simplement aucune ligne — c'est-à-dire « on ne sait pas », ce qui est exactement le bon état. Aucune ligne à réparer après un décalage.
> **Options rejetées** — jeton de jour : il faudrait réécrire le marqueur à chaque glissement, donc un second écrivain sur un état, donc la panne silencieuse habituelle.
> **Réversibilité** — coûteuse une fois des lignes écrites (migration de données). C'est la décision la moins réversible du lot, et c'est pour ça qu'elle est argumentée.

> **Décision** — **aucune table de proposition** pour le glissement ; l'empreinte voyage dans la charge du bouton.
> **Pourquoi** — la fiche impose « le canal de FF-028 (proposition → tap → écriture relue → empreinte) ». J'ai repris la **discipline**, pas la table : `student_daily_recommendations` porte `unique (user_id, local_date)` (une proposition par jour), un `action_id` en CHECK fermé sur deux actions de rythme, et `wasRecommendationSentToday` **gate le message du soir** — y écrire des lignes FF-057 ferait taire la bande du soir le lendemain. L'empreinte fait à elle seule les deux gardes qu'une ligne aurait portées : R7 (plan changé ⇒ périmé) et le double tap (le premier glissement change les dates, donc l'empreinte).
> **Options rejetées** — (a) écrire dans `student_daily_recommendations` : casse l'unicité qui EST l'arbitre de FF-028 et éteint la bande du soir ; (b) une table de propositions à moi : un état de plus à expirer, donc un écrivain de plus à perdre, pour une proposition qui vit le temps d'un échange.
> **Réversibilité** — élevée : la charge est un littéral, et un tap périmé échoue proprement.

> **Décision** — l'action « signaler un reste disponible » **n'est pas construite**.
> **Pourquoi** — aucun consommateur en aval : ni table, ni générateur, ni écran. L'écrire violerait T1 dans la fiche qui cite T1, et le §8 ne la teste pas. « Ne rien faire est une décision valide. »
> **Options rejetées** — l'écrire dans `temp_memory` : deux écrivains concurrents, le dernier gagne, et un reste perdu est pire qu'un reste jamais noté.
> **Réversibilité** — triviale : une entrée dans `REALIGNMENT_ACTIONS` + son écrivain, le jour où un lecteur existe.

> **Décision** — l'entrée **conversation** n'ouvre **pas** le formulaire.
> **Pourquoi** — trois raisons qui vont dans le même sens. (1) Sur « j'ai commandé une pizza », FF-009 écrit déjà le fait `off_plan` et FF-025 envoie déjà l'invitation photo : le formulaire demanderait à la personne de re-choisir ce qu'elle vient de dire, ce qui est littéralement « redemander une info donnée » — l'angle adversarial du bloc. (2) Ce qui manque réellement sur ce chemin est la **décoche du plat prévu**, et savoir QUEL plat a été remplacé est une déduction (territoire de `planned_dish_match`) : la fiche interdit d'inventer. (3) Émettre des boutons depuis la lane du cerveau n'existe pas : `run.ts` ajoute des **phrases** (`keelTurn.meal_photo_invitation`), les boutons sortent du chemin déterministe. Ce serait une modification structurelle de 5 600 lignes partagées, à 4 h du matin, pour un écran que la personne n'a pas besoin de voir.
> **Options rejetées** — le construire quand même : risque élevé sur un fichier partagé, bénéfice produit négatif.
> **Réversibilité** — sans objet, rien n'a été écrit. La couture est nommée au §7 n°1.

> **Décision** — un quatrième motif de refus, `no_session`.
> **Pourquoi** — la fiche en donne trois, mais un tap sur une date qui ne porte aucune cuisson doit dire quelque chose (R15 : un refus n'est jamais un silence). Le fondre dans un des trois autres mentirait sur la cause.
> **Réversibilité** — triviale, une entrée de `SHIFT_REFUSALS`.

---

## 6. Les quatre points demandés par le bloc

### a) Le choix du marqueur de session — voir §5, décision n°1 et n°2.

### b) La règle exacte de la cascade, et le test qui la borne

Un plat est invalidé **si et seulement si** les quatre conditions tiennent :

1. il **consomme** une préparation de cette session (`uses[].preparation_id`) — le
   lien **écrit** par le générateur, jamais la proximité des dates ;
2. il a une date dans la fenêtre ;
3. sa date est **>=** la date de la session (un plat mangé avant la cuisson ne
   pouvait pas en dépendre ; l'invalider serait réécrire un repas passé) ;
4. il n'a **aucune coche vivante** (`disqualified_reason is null`) — on croit le
   **fait**, pas la déclaration de session.

**Ce qui la borne** : la condition n°1. On ne déduit jamais une dépendance de la
proximité des dates. Tests : « exactement les repas de la session » (0,1,2 sur
5 plats), « les repas d'une autre session ne sont pas touchés », « un plat en lot
présent deux jours : seul celui de la session tombe », « un repas mangé avant la
cuisson n'est pas invalidé », et en run réel : session de 4 repas, 1 coché →
`invalidated=[1,2,3]`, `survived_ticked=[0]`, et **zéro ligne écrite**.

### c) La règle du plus petit décalage viable, et la répartition des motifs

**La règle** : on essaie +1, +2, … jusqu'au bout de la fenêtre et on prend le
**premier** delta qui passe les motifs. À viabilité égale, un delta **sans
collision** (deux plats du même créneau le même jour) est préféré — mais une
collision ne **refuse** jamais : le plan affiché doit dire la vérité, et « deux
dîners mercredi » reste vrai quand c'est ce qui se passe. Deux motifs coupent la
boucle immédiatement parce qu'un delta plus grand ne les répare jamais :
`outside_plan_window` (ça ne fait qu'empirer) et `perishables_at_risk` (le
périssable vieillit encore).

**La répartition sur les cas de test :**

| Motif | Unitaire | Run réel | Déclencheur |
|---|---|---|---|
| `already_cooked` | ✓ | ✓ | une coche vivante sur un plat de la session prouve que la casserole a tourné |
| `outside_plan_window` | ✓ | ✓ | session `sat`, plat `sun`, `ends_on` dimanche |
| `perishables_at_risk` | ✓ ×4 (dont 1 mutation + les deux sens) | ✓ | courses faites + cuisson tombée |
| `no_session` | ✓ | ✓ (H9 : aucune proposition) | date sans cuisson |

⚠️ **Le déclencheur de `perishables_at_risk` n'est PAS le `Pas encore` de
courses, et c'est structurel** : par cette porte, la vague qui nourrit la session
**est** celle qu'on vient de déclarer non faite — donc rien n'est au frigo, donc
rien ne peut pourrir. Le « frigo plein » du §9 n'existe que quand les courses
**ont** été faites et que la **cuisson** est tombée. C'est pourquoi l'action n°5
est branchée sur la **session sautée** : c'est le seul chemin où la garde est
atteignable. La ligne §7 de la fiche (« Vague 1 faite, vague 2 non ») décrit donc
un état inatteignable — amendement proposé au §2 n°3.

### d) Ce que j'ai vu de V3, et que je n'ai PAS construit

Le glissement passe à un cheveu de V3, et deux choses l'en séparent, toutes deux
vérifiées plutôt que supposées :

- **`shiftPlanDates` ne touche que trois clés** : `dishes[].day`,
  `preparations[].cook_on`, `cooking_sessions[].day`. Un test compare l'objet
  entier avant/après et pinne que les titres, ingrédients, `uses`, méthodes,
  minutes, `run_through`, `starts_on`, `duration_days` et **l'ordre des plats**
  sont identiques — l'ordre parce que les clés de coche sont positionnelles ;
- **aucun appel réseau hors Supabase** dans `accident.ts` / `accident_io.ts` /
  `accident_tap.ts`. Aucun chemin ne peut rappeler le modèle.

**Ce que je vois de V3, et que je n'écris pas** : la recomposition des jours
restants demanderait de repasser dans `generate-meal-v1` avec trois contraintes
que rien ne sait exprimer aujourd'hui — ce qui est **déjà cuit** (aucune table ne
le porte au niveau de la préparation, seulement au niveau de la session), ce qui
est **déjà acheté** (`grocery_wave_states` est par vague, pas par article, et
c'est voulu), et la **fenêtre frigo** de chaque lot en cours. Les trois manquent,
et les inventer serait exactement la cascade qui casse un état sans lever
d'erreur. Le déclencheur, lui, existe maintenant : `cooking_session_states`
+ la cascade disent quels repas n'existent pas. V3 a son entrée ; il lui faut sa
fiche et son modèle d'état.

---

## 7. Ce qui reste ouvert

1. **🟠 L'entrée « conversation » (§8) n'ouvre pas la procédure.** Décision
   argumentée au §5. La couture, si l'humain tranche l'inverse :
   `sophia-brain/router/run.ts:5664` (`armPhotoInvitation`) a déjà `committedFacts`
   sous la main ; il manque un canal pour émettre des **boutons** depuis la lane
   du cerveau, qui n'existe pas aujourd'hui. Ce que je recommande plutôt : capter
   la **décoche** du plat prévu quand `planned_dish_match` identifie sans
   ambiguïté le plat remplacé — et ne rien faire quand il hésite.
2. **🟠 `cooking_session_states` n'est PAS dans l'export RGPD**, et
   `grocery_wave_states` (FF-058) ne l'est toujours pas non plus.
   `account-export-v1/index.ts` est **pris par une autre session** (`git status`
   le montre modifié) : je ne l'ai pas édité. Modification exacte au §8.
3. **L'entrée « décoche sur l'écran Today » n'ouvre pas le formulaire.** L'écran
   écrit dans `protocol_events` par PostgREST, sans passer par le chat : il n'y a
   aucun endroit où poser des boutons. La fiche R5 dit que la fonctionnalité
   survit au retrait d'une entrée — c'est le cas, deux des quatre sont livrées
   (bande du soir, courses). À traiter par l'écran, pas par le chat.
4. **La collision de créneau ne refuse pas.** Un glissement peut poser deux plats
   du même créneau le même jour quand aucun delta sans collision n'est viable.
   C'est une **préférence** dans la recherche du delta, pas un refus — la fiche
   n'en parle pas, et inventer un quatrième motif aurait dépassé le périmètre.
   Consigné.
5. **Le texte d'une session sautée dont une préparation est déjà cuite porte deux
   phrases qui se lisent en tension** : « 3 meals … are no longer in the plan » +
   « Part of that session is already cooked, so the plan stays as it is ». Les
   deux sont vraies (on a mangé un des quatre) mais la copie gagnerait à les
   lier. Nit de rédaction, pas de logique.
6. **`restrictionFlag` reste `false` en dur** (`accident_tap.ts`,
   `RESTRICTION_FLAG_HAS_NO_PRODUCER`). La garde R9 est **armée et testée**
   unitairement, dans les trois constructeurs, avec son cas qui passe. Son
   producteur n'existe toujours pas (retiré en L3 le 2026-08-08). Un seul
   littéral à changer.
7. **Un cycle d'import assumé** entre `evening_strip_io.ts` et `accident_io.ts`
   (le premier a besoin du filtre de cascade, le second de
   `GROCERY_WAVE_STATE_TABLE`). Les deux usages sont dans des corps de fonction :
   **vérifié à l'exécution**, pas supposé (`scratchpad/cycle_probe.ts`, les deux
   constantes lues et les deux fonctions chargées). L'alternative était de
   recopier un nom de table, ce que ce dépôt paie plus cher.
8. **Deux rouges préexistants** dans
   `supabase/functions/_shared/chat/recent_history_test.ts` (« la borne garde les
   N DERNIERS », « une horloge illisible ne fait pas disparaître l'historique ») :
   `11 passed | 2 failed`. Connus, listés par le bloc de nuit, **non touchés**.

---

## 8. Commandes pour l'humain

**a) Ajouter les deux tables neuves à l'export RGPD** (fichier pris par une autre
session — modification exacte). Dans
`supabase/functions/account-export-v1/index.ts`, à côté de la ligne 593
(`fetchKeelRows(admin, "protocol_events", …)`), ajouter dans le même tableau :

```ts
fetchKeelRows(
  admin,
  "cooking_session_states",
  // FF-057 — l'état d'une session de cuisine. Aucune donnée sensible: un
  // booléen, une date de cuisson et l'identifiant du plan.
  ["generated_meal_id", "cook_on", "happened", "answered_at", "answered_local_date"],
  "user_id",
  user.id,
  keelUnavailable,
),
fetchKeelRows(
  admin,
  "grocery_wave_states",
  // FF-058 — résidu signalé la nuit précédente, toujours absent.
  ["generated_meal_id", "buy_on", "done", "answered_at", "answered_local_date"],
  "user_id",
  user.id,
  keelUnavailable,
),
```

**b) Rejouer les runs** (ce que j'ai lancé) :

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
ANON=$(grep -m1 '^SUPABASE_ANON_KEY=' supabase/.env | cut -d= -f2-)
SVC=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' supabase/.env | cut -d= -f2-)
ISEC=$(grep -m1 '^INTERNAL_FUNCTION_SECRET=' supabase/.env | cut -d= -f2-)

# Le runtime sert des `_shared` périmés sinon — et le restart casse le DNS de Kong.
docker restart supabase_edge_runtime_Sophia_2 && sleep 8
./scripts/local_extend_kong_functions_timeout.sh

SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SVC" INTERNAL_FUNCTION_SECRET="$ISEC" \
  deno run -A docs/nutrition-pivot/qa-web/FF057_accident.ts     # attendu 70/0

SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SVC" INTERNAL_FUNCTION_SECRET="$ISEC" \
  deno run -A docs/nutrition-pivot/qa-web/FF057_adversarial.ts  # attendu 14/0
```

**c) Tests unitaires** :

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/accident_test.ts \
  supabase/functions/_shared/keel/evening_strip_test.ts \
  supabase/functions/_shared/keel/daily_pulse_test.ts
# attendu: 111 passed | 0 failed
```

**d) La migration est déjà appliquée en local** et enregistrée dans
`supabase_migrations.schema_migrations` (`20260812140000`). Lignée sans doublon
vérifiée avant ET après. Pour la prod, **à lancer par vous** :

```bash
supabase db push
```

**e) Déploiement des fonctions modifiées** — `chat-inbound-v1` embarque
`_shared/chat/deterministic_buttons.ts`, `_shared/chat/accident_tap.ts` et
`_shared/keel/accident*.ts` ; `keel-daily-pulse-v1` embarque
`_shared/keel/evening_strip_io.ts` (le filtre de cascade) :

```bash
supabase functions deploy chat-inbound-v1
supabase functions deploy keel-daily-pulse-v1
```

**f) Vérifier les droits de la table neuve après `db push`** :

```bash
supabase db remote query "
select has_table_privilege('authenticated','public.cooking_session_states','SELECT') auth_select,
       has_table_privilege('authenticated','public.cooking_session_states','INSERT') auth_insert,
       has_table_privilege('anon','public.cooking_session_states','SELECT') anon_select;"
# attendu : t | f | f   (relu en local: t|f|f|f|f|f|t avec service_role INSERT = t, RLS = t)
```
