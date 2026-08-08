# État du chantier chat

Branche : `ff-001-quotidien-du-coach`   (**JAMAIS une autre** — aucun push, aucun merge)
Dernière mise à jour : 2026-08-08 03:20

Master : agent orchestrateur. Ne code pas, ne teste pas — distribue, vérifie, consigne.
Prompts sous-agents : `scratchpad/PROMPTS-REALIGNEMENT-CHAT.md` (socle l.16-143 + un bloc par FF).
Autorité produit : `docs/fonctionnalites/conversation/` (fiches + README règles T1-T9).

⚠️ Un **autre agent** tourne en parallèle sur la même branche / même base locale
(`scratchpad/PROMPT-RETRAIT-COMPORTEMENTS-CHAT.md`). Ses fichiers sont interdits :
`_shared/keel/meal_precision.ts`, `sophia-brain/agents/companion.ts`,
`_shared/keel/daily_pulse.ts`, `frontend/.../WeeklyCheckInDialog.tsx`,
`_shared/keel/week_review*.ts`.
→ Jamais `git add -A`. Jamais `supabase db reset`. Commits scopés aux chemins.

## File

| # | Fiche | Bloc | Statut | Commit | Rapport | Note |
|---|---|---|---|---|---|---|
| 1 | FF-008 · Le poids annoncé | 7 | **TERMINÉ** | `dd9f99b7` | RAPPORT-FF-008.md | existait déjà (`5391586f`) ; 1 correctif (passé daté) ; 41 tests réels ; **RED transverse T-1** |
| 2 | FF-009 · Le repas hors plan | 5 | **TERMINÉ** | `b0058ee8`→`61d5d591` (5) | RAPPORT-FF-009.md | existait, **jamais éprouvée** (0 ligne `plan_relation`) ; 4 défauts réels corrigés ; ~260 tours ; **RED transverse T-3** |
| 3 | FF-023 · La conversation normale | 14 | **TERMINÉ** | `1414face`→`59f0e9ba` (4) | RAPPORT-FF-023.md | **le trou est bouché** ; +1 écart R4 (silence du coach ≠ position) ; 12 hypothèses adverses, 11 GREEN |
| 4 | FF-025 · L'invitation à la photo | 6 | **TERMINÉ** | `b482e823`→`e2f893e0` (6) | RAPPORT-FF-025.md | construite de zéro ; **pose le compteur partagé** ; **trouve la cause racine de T-2** ; ⚠️ **migration à pousser** |
| 5 | FF-017 · Le repas déclaré | 3 | **TERMINÉ** | `cde3b0cd` | RAPPORT-FF-017.md | 6 écarts alignés ; compteur partagé **prouvé unique** (X5 3/3) ; **2 REDs ouverts** (T-7, T-8) |
| 6 | FF-026 · La préférence captée | 8 | **TERMINÉ** | `4273c241`→`f109b980` (4) | RAPPORT-FF-026.md | **la capture mourait au 1er gué** (10/15 phrases de la fiche filtrées) ; **T-9, T-10** ; 1 RED (supersession) |
| 7 | FF-027 · La faim branchée au plan | 9 | **TERMINÉ** | `74a6ee4c` | RAPPORT-FF-027.md | 3 briques construites ; **R2 prouvée par énumération** ; 1 RED trouvé+corrigé ; ⚠️ **migration** |
| 8 | FF-028 · La recommandation quotidienne | 10 | **TERMINÉ** | `b7d6a308` | RAPPORT-FF-028.md | construite de zéro ; **95,8 % de soirs silencieux** ; 0 RED en périmètre ; ⚠️ **migration** |
| 9 | FF-016 · La question d'alimentation | 1 | **TERMINÉ** | `93633584`→`774471dd` (3) | RAPPORT-FF-016.md | recommandés branchés ; **3 défauts réels dont 1 de sécurité** ; budget mesuré ; **T-13** |
| 10 | FF-010 · La lecture du foyer | 2 | **TERMINÉ** | `fccd5a9a`, `1145e867` | RAPPORT-FF-010.md | existait, **vert sur une fixture qui mentait** (`cookOn`≠`cook_on`) ; **T-15, T-16** ; budget pire cas OK |
| 11 | FF-011 · Le soutien groundé | 13 | **TERMINÉ** | `cba9df7c` | RAPPORT-FF-011.md | existait ; **cicatrice `ack_guard` chiffrée et épinglée** ; 0 morsure/10 tours ; **T-17** |
| 12 | FF-029 · Les pratiques quotidiennes | 11 | **TERMINÉ** | `0d598093`, `7751c1d7` | RAPPORT-FF-029.md | jeu maison **sans une ligne de code de plus** ; régression de sécurité fermée ; tranche T-16 |
| 13 | FF-018 · La photo de repas | 4 | **TERMINÉ** | `a9adc22d` | RAPPORT-FF-018.md | **l'énergie en toutes lettres traversait** ; piège nommé **intact** ; **T-17 réfuté** sur le chemin photo ; **T-18** |
| 14 | FF-020 · L'accompagnement de crise | 12 | **TERMINÉ** | `ef8e041e` | RAPPORT-FF-020.md | **T-19 : l'épingle locale inverse les deux chemins de crise** ; T-7 **confirmé 6/6** ; 4 REDs |
| 15 | FF-021 · Le plancher de restriction | 15 | **TERMINÉ** | `b36e5de9` | RAPPORT-FF-021.md | **1 chemin sur 16 demandait correctement** ; 🔴 **F1 coffre vide** ; T-7 tranché ; 3 REDs neufs |
| — | Passe transverse | — | **TERMINÉ** | (scratchpad seul) | RAPPORT-TRANSVERSE.md | doctrine **survit** (5/6 tours tronqués, marge 11 900 car. avant le 1er bloc KEEL) · **12/12** un seul compteur, 4 genres, 4 ordres · **100 % de silence** sur 30 tours · échantillon ④ **confirme FF-021 4/4** · 3 REDs neufs (**T-21, T-22, T-23**) |

Statuts : EN ATTENTE · EN COURS · TERMINÉ · À COMMITER · ÉCHOUÉ · SAUTÉ

## Commandes pour l'humain (à exécuter au réveil)

> ### 🛑 BLOCAGE À TRAITER AVANT LE PREMIER `supabase db push`
>
> **Deux migrations portent la même version `20260808060000`** :
> `20260808060000_household_roster_for_server.sql` et
> `20260808060000_retrait_residus_raisons_de_conservation.sql`.
>
> C'est la cicatrice connue `duplicate-migration-versions-block-lineage` : la lignée ne peut pas
> s'établir, et **les trois migrations de la nuit sont derrière ce doublon**. Vérifié par
> `ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d`.
>
> **Le doublon est ANTÉRIEUR au chantier chat** (aucun agent de la file ne l'a produit) — je ne l'ai
> donc pas réparé : renommer une migration déjà appliquée quelque part est une décision qui
> t'appartient. Renomme l'une des deux (typiquement `…060001_…`) **avant** de pousser.

```bash
# FF-008 — module _shared modifié (plancher de mesure corporelle).
# Aucune migration, aucun secret. À lancer quand tu veux pousser en prod.
supabase functions deploy sophia-brain

# FF-009 — plancher de repas + run.ts (aucune migration à pousser).
#   (déjà couvert par le deploy sophia-brain ci-dessus)

# FF-023 — le chargeur d'historique vit dans chat-inbound-v1 ; le correctif R4
#   (« le silence du coach n'est pas une position ») vit dans sophia-brain.
supabase functions deploy chat-inbound-v1

# FF-025 — ⚠️ PREMIÈRE MIGRATION DE LA NUIT (compteur partagé, appliquée en local seulement).
#   Elle doit partir AVANT le deploy, sinon la lane lit une colonne qui n'existe pas en prod.
supabase db push
supabase functions deploy sophia-brain meal-photo-upload-v1

# FF-017 — plancher de repas + créneaux (aucune migration).
#   (couvert par le deploy sophia-brain ci-dessus)

# FF-026 — échappatoire du pré-filtre memorizer + raccord de réconciliation foyer.
supabase functions deploy generate-household-meal-v1 trigger-memorizer-daily

# FF-027 — migration `20260808140000_student_hunger_reports.sql` + 5 fonctions edge.
#   (le db push ci-dessus la couvre ; commandes exactes en §9 de RAPPORT-FF-027.md)

# FF-028 — migration `student_daily_recommendations` + RPC atomique + cron 19h-20h.
#   ⚠️ L'ORDRE COMPTE : commandes exactes en §7.3 de RAPPORT-FF-028.md.
#   Le cron n'est PAS appliqué en local, exprès (404 sur environnement partagé).
```

## Décisions humaines en attente (aucune n'est bloquante pour la file)

1. **T-2 — désarmer `PILOT_FORCED_LOCALE` ?** Le pilote force-t-il encore `en-US` ? Tant qu'il est
   armé, toute la copie FR runtime est morte au rendu.
2. **Renommer `meal_precision_questions`** en un nom qui dit ce qu'elle porte maintenant. FF-025 le
   recommande « avant que FF-017/FF-028 n'ajoutent leurs appelants » — **j'ai neutralisé l'urgence**
   en leur imposant de passer par le module (`DAILY_ASK_LEDGER_TABLE`), jamais par la chaîne. Le
   renommage redevient donc une opération isolée, à faire quand tu veux, avec les 3 épreuves
   d'absence habituelles (code, `prosrc`, vues).
3. **T-3** — ouvrir le chantier « pas de décomposition de plat composé » (touche FF-017/FF-018).
4. **T-1** — ouvrir le lot « canal plancher→réponse à trois états » dès que `companion.ts` est libéré.
5. Les amendements de fiche proposés (voir plus bas) — 4 à ce stade, aucun appliqué.

## 🔴 LE RÉSULTAT LE PLUS IMPORTANT DE LA NUIT — F1 : sept gardes armées sur un coffre vide

_Trouvé par FF-021 (revue transverse), **corroboré indépendamment par le master** :
368 occurrences de `risk_band` dans `supabase/`, **zéro `insert`/`update`/`upsert`**._

**`weekly_reviews.risk_band` n'a AUCUN écrivain dans tout le dépôt.** FF-021 l'a établi par les
trois épreuves d'absence (code, `prosrc`, vues). **Sept gardes en dépendent** — dont l'écran chiffré
de l'élève (`/app/progress`), `/app/plan` et la vue coach.

C'est une **nouvelle instance de la cicatrice `safety-constraints-armed-belt-empty-vault`**
(« ceinture armée sur coffre vide »). Le PINNED DEFECT de la fiche est d'ailleurs plus subtil
qu'annoncé : `/app/progress` **est** bien gardé (état `restricted` avant toute lecture) — **mais sur
la colonne morte**. La garde existe, elle interroge un oracle qui ne répond jamais.

→ **Décision humaine n°1.** Rien d'autre dans ce document n'a cette portée.

## 🔴 LE VERDICT TRANSVERSE DE FF-021 — 1 chemin sur 16 demandait au plancher

| | Chemins |
|---|---|
| Interrogeaient le plancher **au bon endroit et au bon moment** | **1** (FF-011, drapeau brut filtré au chargement) |
| L'interrogeaient sur une **colonne morte** (F1) | 2 (FF-028, FF-029) |
| **Ne l'interrogeaient pas du tout** | **6** |
| Sans objet | 7 |
| **Après le lot de FF-021** | **3 corrects, 4 encore découverts** |

C'est la mesure la plus utile du chantier : chaque fiche construisait sa fonctionnalité correctement,
et **presque aucune ne demandait à la sécurité**. Le plancher lui-même est irréprochable — « rien de
ce qui ne va pas n'est dans le module : tout est dans sa jointure avec ses consommateurs ».

Deux autres REDs neufs de FF-021, tous 3/3 :
- **F3** — une **seule ligne hebdo cassée aveugle le plancher entier**, en silence, sans escalade.
  R4 est tenue *dans* le module et **renversée chez son appelant**.
- **F2** — le lexique compensatoire rate le **passé** de « ne rien manger » : « je n'ai rien mangé
  aujourd'hui » / « I haven't eaten all day » (5/5, FR+EN) — **y compris la phrase que l'en-tête du
  runtime cite lui-même comme le signal à ne pas manquer**. Doublé par la mort de
  `energy_deficit_streak`.

## REDs qui dépassent une seule fonctionnalité

### T-1 · L'accusé fantôme a quitté l'écriture pour la restitution — **BLOQUÉ**
_Trouvé par FF-008. Concerne toute fonctionnalité à plancher (FF-009, FF-017, FF-025, FF-026, FF-027)._

La lane de réponse ne sait **ni ce que le plancher a écrit, ni ce qu'il a refusé**.
Elle accuse donc réception de mesures inexistantes. Quatre symptômes d'un seul défaut :
- « Got it — 78, not 87 » alors que la base porte 87 ;
- « 78 kg is now your current weight » à un **mineur** dont rien n'a été enregistré (3/3) ;
- jamais de demande du chiffre absolu sur une variation (0/3).

Correctif = un canal plancher→réponse **à trois états** (écrit / refusé / muet), qui se pose
dans `sophia-brain/agents/companion.ts` — **fichier réservé à l'autre agent**. Non touché, exprès.
→ **À reprendre quand le chantier de retrait aura libéré `companion.ts`.** C'est le candidat
n°1 pour un lot dédié après la file.

### T-2 · **CAUSE RACINE TROUVÉE** — `PILOT_FORCED_LOCALE = "en-US"`
_Trouvée par FF-025 après trois fiches à en subir le symptôme._

`supabase/functions/_shared/keel/locale.ts:28` porte `const PILOT_FORCED_LOCALE: string | null = "en-US"`,
et deux gardes (`l.84`, `l.113`) le renvoient avant toute lecture de `profiles.locale`.
**Conséquence** : toute copie française runtime de ce dépôt est **du code mort au rendu**.
Le fichier documente lui-même son propre désarmement (l.18) — c'est un drapeau de pilote délibéré,
pas un bug ; mais plus personne ne se souvenait qu'il était armé.

**Ce que ça impose au reste de la file** (consigne passée à tous les agents suivants) :
- les tests **bilingues d'entrée** (planchers, lexiques, gardes) restent **valides et obligatoires** —
  ils mordent avant le rendu, et c'est là qu'était la cicatrice `guard-tested-in-one-language-only` ;
- toute conclusion sur la **langue de la réponse** est **sans valeur** tant que le drapeau est armé.
  Ne pas déboguer, ne pas compter comme RED de fiche : citer T-2.

→ **Décision humaine** : le pilote force-t-il encore `en-US` ? Si non, retirer la constante et ses
deux gardes (le chemin de désarmement est écrit dans le fichier et couvert par `locale_test.ts:33`).

### T-2bis · Le symptôme, tel qu'il a été rencontré
_Constaté par FF-008 sur tous ses élèves ; **re-prouvé par FF-023**, qui a établi qu'il est visible
**dès le tour 1, sans aucun historique** — donc antérieur et indépendant de la continuité._
Cicatrice connue `reply-language-ignores-voice-language`. Hors périmètre de chaque fiche prise
isolément, mais **fausse la lecture de tout test bilingue** de la file. À trancher globalement.
**Trois fiches l'ont maintenant rencontré — c'est le 2e candidat à un lot dédié.**

### T-3 · Le modèle décompose les plats composés et invente des groupes d'aliments
_Trouvé par FF-009, et **prouvé non spécifique à FF-009** : le symptôme est identique sans aucun
marqueur hors-plan._ Le dispatcher fabrique des `food_group_ref` inexistants (`"pizza_margherita"`),
l'intake refuse tout, **0 ligne écrite** — pendant que la réponse, elle, parle de la pizza.
FF-009 a posé un **filet de plancher** qui couvre son propre chemin ; la cause reste entière.
→ Touche **FF-017 et FF-018**. Décision humaine attendue : ouvrir un chantier
« pas de décomposition de plat composé ». Les agents FF-017/FF-018 en sont prévenus.

### T-5 · Le compteur partagé existe — **plus jamais un deuxième**
_Posé par FF-025 (`b482e823`, « le budget de demande devient UN compteur, avant que trois fiches
n'en créent trois »)._

| | |
|---|---|
| Module — **seul accès autorisé** | `supabase/functions/_shared/keel/daily_ask_budget.ts` |
| Table (nom physique **historique**) | `public.meal_precision_questions` — citer la constante `DAILY_ASK_LEDGER_TABLE`, **jamais la chaîne** |
| Migration | `20260808123000_daily_ask_budget.sql` (appliquée en local) — ⚠️ **à pousser en prod** |
| Plafond | `DAILY_ASK_BUDGET = 1` par élève et par jour, **tous genres confondus** |
| Genres (liste fermée) | `meal_precision_question` (FF-017, porte un axe) · `photo_invitation` (FF-025) · `daily_recommendation` (FF-028) |
| API | `countDailyAsks` (fail-**closed** : lecture ratée ⇒ `count = 1`) · `hasEverAsked` (fail-closed vers le silence) · `recordDailyAsk` (idempotent par le schéma) |

`meal_precision_cap.ts` n'est plus qu'un adaptateur et ne parle plus à Postgres ; ses appelants
sont inchangés. **FF-017 et FF-028 reçoivent cette table dans leur prompt** et ont consigne de
passer **uniquement par le module** — ce qui les isole du renommage proposé ci-dessous.

### T-6 · Le composeur écrit parfois sa propre demande de photo, hors budget (~1/25)
_Trouvé par FF-025, hors de son périmètre d'écriture._ La lane gate correctement, puis le composeur
ajoute sa propre sollicitation sans passer par le compteur. C'est **la même famille que T-1** : la
réponse ignore ce que le déterministe a décidé. Chip de suivi créé par l'agent.

### T-7 · Sous `safety_band`, la déclaration est **perdue** — **CONFIRMÉ 6/6 par FF-020, FR et EN**
**Deux fiches indépendantes l'ont maintenant mesuré.** FF-020 l'a relu en `psql` :
`direct_effects=[]` et **0 ligne `protocol_events`**. Verdict net : *la sécurité prime ✅, le fait est
perdu ❌*.

**⚠️ TRANCHÉ PAR FF-021 — et l'énoncé ci-dessus était FAUX sur un point.**
- **La sollicitation doit être avalée sans condition** → **c'est fait**, corrigé et mesuré 6/6.
- **L'effet durable est un arbitrage produit**, non appliqué : c'est à toi de trancher.
- ❌ **« perdu SANS TRACE » est inexact** : la trace **existe** —
  `conversation_turn_traces.route_decision.blocked_paths` porte
  `"direct_effects.log_protocol_event"` **avec son motif**, sur la branche restriction **et** sur la
  branche safety (3/3). **Ce qui manque n'est pas la trace, c'est un lecteur.**
  _(J'avais consigné « sans trace » d'après FF-017 et FF-020 ; FF-021 est allée vérifier et les a
  contredits tous les deux. C'est la bonne façon de finir la file.)_

_Énoncé initial (FF-017, 3/3) :_
_Trouvé par FF-017._ La fiche veut « déclaration écrite, AUCUNE question ». Le code fait
« ni question **ni écriture** ». C'est une **contradiction fiche ↔ arbitrage `v5-arbitrations`**,
pas un bug isolé : le plancher de sécurité avale l'effet au lieu de n'avaler que la sollicitation.
→ **C'est le mandat exact de FF-021** (position 15, revue transverse des gates) : elle recevra ce
RED en entrée. Amendement proposé par FF-017, **non appliqué**.

### T-8 · La rétractation n'écrit rien hors flow de précision (0/3)
_Trouvé par FF-017._ « en fait je l'ai pas mangé » ne pose aucun `disqualified_reason` quand aucun
flow n'est ouvert — et la réponse affirme « nothing was written from it » **pendant que 3 lignes
comptent**. Formulation de l'agent, qui dit bien le paradoxe : *plus la déclaration est complète,
moins elle est rétractable*. Touche aussi FF-009 (rétractation du hors-plan) et le récap du soir.

### T-9 · Le pré-filtre du memorizer écartait **10 des 15 phrases canoniques** de la fiche — CORRIGÉ
_Trouvé par FF-026._ `smart_pre_filter` (`batch_selector.ts`) jette les messages < 15 mots comme du
bruit. Il écartait donc 10 des 15 phrases de FF-026, **dont les deux que la fiche cite mot pour mot**.
Les 2 qui passaient le faisaient **par accident de vocabulaire** (« hier », « en fait »).
Échappatoire bilingue posée (10 bloquées → 2, et les 2 restantes sont les allergies, exclues **exprès**
car R1 les route vers `declare_safety_constraint`).
→ **Portée plus large que FF-026** : ce pré-filtre garde **toute** capture mémoire. Toute
fonctionnalité qui dépend du memorizer passe par lui. À garder en tête pour FF-010 et FF-029.

### T-10 · Rien côté serveur n'écrit une préférence — il faut un clic « Keep » dans une modale
_Trouvé par FF-026, **absent de la fiche**._ Sans visite de `/app/plan` et clic, l'item est archivé
à J+14. La latence utile n'est donc pas « une nuit » (memorizer nocturne) mais **« une nuit + une
visite d'écran », non bornée**. Et `sophia-brain` **ne lit `practical_constraints` nulle part**.
→ Transmis à **FF-028**, qui consomme les préférences. Décision produit humaine attendue : est-ce
le modèle voulu, ou la capture doit-elle s'écrire sans clic ?

### T-11 · La supersession n'est honorée que 8 fois sur 9
_Trouvé par FF-026 (son RED R3)._ La rétractation **écrit** bien (contrairement à T-8) ; c'est le lien
`superseded` — produit par un LLM — qui manque parfois. **Quand il manque, la préférence démentie
reste dans le plan pour toujours.** Rejoint la cicatrice connue `supersession-needs-a-plausibility-check`.

### T-12 · Le générateur écarte **silencieusement** une proposition acceptée
_Trouvé par FF-028, mesuré 3/3, hors de son périmètre d'écriture._ Un petit-déjeuner **accepté par
l'élève** (tap « Oui », directive écrite et relue) est écarté par le générateur quand une préférence
le contredit — **sans le dire**. La boucle « on te propose → tu acceptes → ça arrive » se rompt à la
dernière marche, et c'est la marche la plus visible pour la personne.
Correctif dans `meal_generation.ts`, **réservé à l'autre agent**. Chip de tâche créée par l'agent.
Rejoint la même famille que T-1/T-6 : **le déterministe décide, la couche du dessus ne le sait pas.**

### T-13 · Le contrat `plan_question` du dispatcher — cause racine partagée
_Isolée par FF-016, **non touchée exprès** : plusieurs agents mesurent dessus cette nuit._
`sophia-brain/.../dispatcher.prompts.ts` : le dispatcher **invente** un `prescribed_food_group`,
écrit `"null"` **en chaîne de caractères**, et **recopie le prescrit dans le demandé**.
C'est ce dernier point qui a produit le défaut de sécurité de FF-016 (ci-dessous).
→ Candidat à un lot dédié, avec T-1 et T-2. Ne pas y toucher tant que la file mesure dessus.

### T-14 · Le budget de contexte, mesuré cumulativement — **il tient**
Trois fiches ont ajouté de la matière au même prompt cette nuit. Mesures successives sur élève riche :
- FF-023 (historique récent) : `full_chars` 26 842 → 32 222 sur 20 tours denses, doctrine appliquée
  au tour saturé ;
- FF-016 (bloc protocole) : 27 500–27 610 → 28 850–29 183, **coût constant 1 199 car.**, plafond
  32 000 jamais atteint, doctrine encore appliquée **3/3** au tour saturé.
⚠️ **`context_tokens` ne mesure PAS ces blocs** (il est calculé sur le chargeur de contexte seul ;
les blocs KEEL arrivent après). La métrique à utiliser est **`full_chars`**, établie par FF-023.
→ **À transmettre à la passe transverse** : son mandat dit « `context_tokens` sur un tour type » —
c'est la mauvaise colonne, elle doit mesurer `full_chars`.

### T-15 · Une fixture QA qui ne parle pas la forme de la production rend les tests verts **et faux**
_Trouvé par FF-010._ `loadHouseholdTurnContext`, son bloc et son gate de visibilité **existaient**,
avec **14 tests verts** — sur une fixture QA qui écrivait `cookOn` là où la production écrit
`cook_on`. Le code n'a donc jamais été exercé sur la forme réelle des données.
C'est la cicatrice `qa-fixture-needs-published-plan` sous une autre face : **la fixture est du code
de test qui doit être vérifié contre la production**, pas un raccourci.
→ Deux fiches de la nuit (FF-009 puis FF-010) ont trouvé du code « livré et testé » que la réalité
n'avait jamais traversé. **À vérifier systématiquement dans la passe transverse.**

### T-5bis · Le compteur partagé porte maintenant **4 genres, un seul module** ✅
`DAILY_ASK_KINDS` (`_shared/keel/daily_ask_budget.ts:50`) : `meal_precision_question` (FF-017,
porte un axe) · `photo_invitation` (FF-025) · `daily_recommendation` (FF-028) ·
`practice_question` (FF-029). Quatre fiches, **un** compteur, `DAILY_ASK_BUDGET = 1`.
FF-029 a explicitement argumenté pourquoi le *rappel* de pratique ne consomme pas le budget alors
que la *question* le consomme. → La passe transverse n'a plus qu'à le confirmer en réel.

### T-16 · Une règle de prompt n'est pas une ceinture — le mineur et les chiffres
**⚠️ MISE À JOUR PAR FF-029 : le cas `minor_quantity` est TRANCHÉ, et dans le bon sens.**
C'est une **vraie ceinture déterministe** (`daily_recap.ts:697-718`, dans `acceptComposedRecap`,
sur le texte exact, `QUANTITY_WORDS` bilingue — « quatre verres » mord), testée FR **et** EN en
soumettant le texte **directement** à la ceinture pour contourner `PILOT_FORCED_LOCALE`.
→ L'amendement proposé par FF-011 (« §7 élève mineur n'est pas implémentable tel qu'écrit ») est
**FAUX** : l'injection existe, dans le message du soir. **Ne pas appliquer cet amendement-là.**
La limite réelle est pinnée par un test : seul le `target` est interdit, **un chiffre *inventé*
passe encore** — c'est ça, le RED qui reste, et il est plus étroit qu'annoncé.
Le reste de la famille (T-1, T-6, T-12, et le O1 de FF-010) demeure entier.
_Trouvé par FF-010 (son RED O1), mesuré 2/3._ Un **mineur** obtient « 56,3 g de sucre » dans sa
réponse. La règle qui l'interdit vit dans le prompt ; il n'existe **aucune ceinture de sortie** qui
la fasse respecter.
Même famille que **T-1 / T-6 / T-12** : *le déterministe décide, la couche qui parle ne le sait pas
et n'est pas contrainte.* Cinq fiches ont maintenant buté sur cette famille — c'est **le motif
structurel de la nuit**, et le candidat n°1 à un lot dédié après le chantier de retrait.

### 🔴 T-19 · L'épingle de locale **inverse les deux chemins de crise** — ils ne peuvent pas être justes ensemble
_Trouvé par FF-020. C'est le constat de sécurité le plus important de la nuit._

| Chemin | Ce qu'il fait | Résultat |
|---|---|---|
| Prose du modèle | subit `PILOT_FORCED_LOCALE = "en-US"` | un élève **FR** en crise reçoit de l'**anglais**, 18/18 |
| **Repli déterministe** | **monolingue FRANÇAIS**, aucune locale en entrée (33/33 gabarits) | un élève **US** dont le modèle tombe lit « Appelle maintenant le 911… le 988 répond 24h/24 » — **bons numéros, langue qu'il ne lit peut-être pas** |

Aggravation mesurée : l'agent a **ancré `conversation_locale='fr-FR'` en base** avant le tour, et le
runtime l'a **réécrit en `en-US`**. Le repli est le **filet de dernier recours** — c'est le chemin qui
sert quand tout le reste est tombé.
Non débogué (hors périmètre, c'est T-2). Amendement AM-5 proposé, avec un avertissement technique :
`localePackKey` **throw** — utiliser `isFrenchLocale`.
→ **Décision humaine, à traiter avec T-2 : les deux chemins ne peuvent pas être corrects tant que
l'épingle est armée.**

### 🔴 T-20 · Pays absent ⇒ **numéros français**, pas le jeu international `ZZ` — 34 élèves concernés
_Trouvé par FF-020 (1 RED sur 11 en medium)._ Le jeu `ZZ` fonctionne pour un pays **inconnu ou sale**
(16 entrées testées, **zéro fuite de voisin** ✅), mais un pays **absent** retombe sur la France.
Voisin de la cicatrice `student-country-null-crisis-misrouting`, mais **le symptôme mesuré diffère**
de ce qu'elle décrivait — à re-lire avant de corriger.
Deux autres REDs de crise consignés : la sortie de faux positif arrive au tour **suivant** le démenti
(6/6 — verrou délibéré et testé contre §8) ; et sur `ZZ`, « appelle le https://findahelpline.com ».

### T-18 · Le flow de précision **photo** écrase un flow **texte** déjà ouvert
_Trouvé par FF-018, **déterministe et mesuré**._ La clé unique de `temp_memory` fait que l'ouverture
du flow de précision côté photo **écrase** un flow texte en cours : la réponse de l'élève **amende
alors la mauvaise ligne**.
C'est la course à deux écrivains de `temp_memory`, mais dans sa forme **utile et reproductible** —
FF-023 avait documenté la course sans parvenir à la reproduire (8 tentatives). **Voilà le scénario
qui la déclenche.** Hors périmètre d'écriture de FF-018.
→ Reprise ciblée de FF-023, avec un cas de test qui existe maintenant.

### T-17 · Double écriture `protocol_events` — **RÉFUTÉ sur le chemin photo**
**⚠️ MISE À JOUR PAR FF-018 : n'existe PAS côté photo.** Correction mesurée 1 ligne → 1 ligne
(départ propre — le « départ non photographié » était un faux RED de sa propre sonde), et **1 seule
ligne sur les trois formes de course**. Le soupçon de FF-011 reste donc à instruire **sur le chemin
texte uniquement**, si tant est qu'il tienne.
_Énoncé initial (FF-011) :_ une déclaration de repas produirait **deux** lignes `protocol_events`.
FF-017 est close ; à traiter comme reprise ciblée, pas comme nouveau lot.
_Trouvé par FF-011, chip de tâche créée._ Une déclaration de repas produit **deux** lignes
`protocol_events`. FF-017 est **déjà terminée** (`cde3b0cd`) : ce défaut est donc soit passé sous son
radar, soit apparu depuis. → À traiter comme une reprise ciblée de FF-017, **pas** comme un nouveau lot.
C'est le seul cas de la nuit où une fiche close est mise en cause par une fiche suivante.

### La cicatrice `ack_guard` — mesurée, précisée, **délibérément non corrigée**
_FF-011 a re-vérifié la note de mémoire `ack-guard-eats-grounded-citations` au lieu de la croire.
Elle **tient, mais pas comme elle était écrite** :_
- la citation groundée **nue traverse intacte** — ce n'est pas « toujours » ;
- la garde mord sur l'**intersection** *« message rapportant un fait accompli »* × *« zéro effet
  committé »*, et emporte alors la **phrase entière**, donc le fait soudé à son ✅ ;
- cette intersection **contient la phrase d'ouverture de la fiche elle-même** (« j'ai rien tenu ») ;
- déterministe **FR 4/10, EN 5/8** ; run réel **3 morsures / 3 tours**.
- **Deux aggravations non documentées** : le repli pose une *question de liage de plan* — soit la
  sollicitation que §3 interdit ; et **la collision s'aggrave quand FF-011 fonctionne mieux**.
→ Non corrigée **exprès** : c'est « la garde la plus importante du produit ». Mais elle est désormais
**épinglée par 7 tests**, pour que l'arbitrage humain se fasse sur des chiffres et non au jugé.

### T-4 · Hygiène de commit : l'index n'est pas vierge au départ
Le 1er commit de FF-009 (`b0058ee8`) a emporté les **17 fiches** qui étaient déjà `staged` avant la
nuit. Sans dommage ici (ce sont les docs d'autorité du chantier, elles ont leur place sur la
branche), mais la leçon est réelle : **un `git add <chemins>` scopé commite quand même tout ce qui
était déjà dans l'index**. → Consigne ajoutée au prompt de tous les agents suivants : vérifier
`git diff --cached --name-only` avant de commiter et dé-stager ce qui n'est pas à soi.

## Amendements de fiche proposés (l'humain tranche — rien n'a été appliqué)

- **FF-008 §5 vs §7 — contradiction** : §5 promet la correction « pardon, 78 pas 87 », §7 interdit
  les deux nombres. Le code a raison de refuser ; rédaction de remplacement proposée dans
  `RAPPORT-FF-008.md`, **non appliquée**.
- **FF-008 §10 inobservable** : la fiche demande de mesurer les refus « par motif », or le plancher
  rend `null` nu — la contre-mesure n'est pas mesurable en l'état.
- **FF-009 §8 — le code a raison** : §8 exige « aucune forme interdite », or `forbidden_matcher`
  autorise **délibérément** la mention *niée* (« there's no cheat meal here ») — carve-out documenté,
  posé après un défaut déjà payé. Amendement de §8 rédigé dans `RAPPORT-FF-009.md`, **non appliqué**.

## Journal

- **03:15** — Démarrage. Branche vérifiée `ff-001-quotidien-du-coach`. 69 entrées sales
  au départ (docs des fiches + travail de l'autre agent) — état de référence noté.
- **03:16** — Conteneurs Supabase locaux tous `Up` (db, kong, edge runtime, auth…). Base saine.
- **03:17** — Dépendance FF-017 vérifiée : `MEAL_PRECISION_DAILY_CAP = 1`
  (`_shared/keel/meal_precision.ts:534`) → l'autre agent a livré son plafond, FF-017 reste en position 5.
- **03:20** — Lancement FF-008 (bloc 7).
- **03:49** — FF-008 **TERMINÉ**, commit `dd9f99b7` (6 fichiers, scopé — les fichiers de l'autre
  agent intacts). L'état présumé du bloc était **faux** : la fonctionnalité existait déjà
  (`5391586f`). L'agent a donc vérifié plutôt que construit, et trouvé un défaut réel : un poids
  au passé daté (« la semaine dernière je pesais 85 kg », FR+EN) s'écrivait dans la **semaine
  courante**, soit une fausse mesure d'aujourd'hui dans la case exacte que lit `restriction_guard`.
  Le test qui fait le lot est **vert** : franchissement de 1,2 %/sem → plancher levé sur le tour,
  prouvé sur le chemin réel. Suite KEEL 1486 passed / 0 failed.
  Deux REDs transverses consignés (T-1 bloqué sur `companion.ts`, T-2 langue).
- **03:52** — Lancement FF-009 (bloc 5).
- **04:45** — FF-009 **TERMINÉ**, 5 commits (`b0058ee8`, `33acc546`, `f055c2fa`, `f862528f`,
  `61d5d591`). Là encore le bloc se trompait : la fonctionnalité était **construite** (`7aa9d683`)
  mais **jamais éprouvée en réel** — `plan_relation` portait **0 ligne** en base. `planned_deviations`
  n'est **pas** un doublon (elle est *à l'avance*, attachée à `plan_version_id`) : pas d'arbitrage.
  4 défauts trouvés en run réel et corrigés : le filet du plancher, la ceinture « pour les enfants »
  (1/3 écrivait un fait alors que §7 dit *rien*), la clause future qui effaçait l'acte passé, et la
  **job story de la fiche cassée en français** (« à un mariage » → NULL quand « at a wedding » → off_plan
  — exactement la cicatrice `guard-tested-in-one-language-only`). ~260 tours réels, suite 3457 verts.
  Fixtures nettoyées (base revenue à ses 307 lignes de départ). Rouge pré-existant prouvé antérieur
  par worktree, consigné, non réparé.
- **04:47** — Lancement FF-023 (bloc 14) — la cause racine du bug de contexte.
- **05:37** — FF-023 **TERMINÉ**, 4 commits (`1414face`, `e7180654`, `e8dbe3b6`, `59f0e9ba`).
  **Le trou est bouché.** `chat-inbound-v1` était le seul appelant de production de `processMessage`
  à passer `history: []`. Avant correctif, mesuré en réel : au tour 2 sur « and so, what do you think
  about it? » (après un tour sur le déménagement d'un frère), la réponse partait sur « About the lunch
  setup… » — une **confabulation**, pas un oubli. C'est la différence qui justifiait la position n°3.
  Livré : `_shared/chat/recent_history.ts`, borné (20 msg / 1 200 car.), frais (12 h + plancher dernier
  tour), excluant le tour courant par son `id`, fail-open bruyant, **tri secondaire sur `id`** (deux
  messages concurrents portent le même `created_at` à la ms — mesuré, pas supposé).
  **Écart R4 trouvé en passant et corrigé** (`_shared/keel/doctrine.ts`) : sur un sujet non traité par
  le coach, l'agent **inventait une position du coach 3/3** — la règle qui l'interdit n'existait que
  dans le bloc de repli, pas sur doctrine chargée. Le silence du coach cesse d'être lu comme une position.
  X3 : 20 tours denses → `full_chars` 26 842 → 32 222, **plafond jamais dépassé, doctrine encore
  appliquée au tour saturé** — la matière ajoutée ne pousse pas la doctrine dehors.
  12 hypothèses adversariales écrites AVANT, 11 testées, toutes GREEN (dont injection amplifiée,
  fuite inter-élève, contamination de scope). A11 (égalité de timestamps) confirmée rouge puis corrigée.
  Rouge Deno restant prouvé pré-existant par `git stash` scopé ; ligne `protocol_events` fantôme au
  tour de poids prouvée pré-existante par un contrôle à zéro historique.
- **05:40** — Lancement FF-025 (bloc 6).
- **06:28** — FF-025 **TERMINÉ**, 6 commits (`b482e823`→`e2f893e0`). **Première fiche vraiment
  inexistante** : 0 fichier, 0 ligne. Construite entière — gate déterministe (7 refus nommés, tous
  paramètres **requis**, conformément à la cicatrice « garde optionnelle = garde désarmée »),
  invitation d'UNE phrase en gabarits **fermés** FR/EN, ligne d'éducation une fois par personne,
  et le rattachement photo→fait existant.
  **Deux défauts trouvés par l'agent dans son propre travail**, ce qui est le signe d'une vraie revue
  adversariale : ① le rattachement ne s'est **jamais** produit — `analyzed_at` manquait dans
  `EVENT_COLUMNS`, donc « l'analyse a-t-elle tourné ? » répondait toujours non (1→2 lignes mesuré,
  corrigé, 3/3 après) ; ② un CHECK qui rend `NULL` **passe**, donc relâcher le `NOT NULL` avait
  désarmé la règle que le CHECK gardait — trouvé au contrôle de la migration, avant le runtime.
  Ordre non évident et payé : le rattachement est **après** l'analyse. Rattachée avant, une photo de
  menu emportait sa disqualification sur le repas déclaré et le faisait disparaître de la vue du coach.
  Tests : easy 2×3 · medium 4×3 · hard 7×3 · extra 5×3 · adversarial 5×3, **tous verts** ; 59 tests
  unitaires neufs ; 3535 verts / 1 rouge pré-existant prouvé antérieur par worktree.
  **T-2 : cause racine nommée** (`PILOT_FORCED_LOCALE`). **T-5** : le compteur partagé est posé.
  **T-6** : le composeur écrit parfois sa propre demande hors budget (~1/25) — famille de T-1.
- **06:30** — Lancement FF-017 (bloc 3), avec la fiche technique du compteur partagé recopiée dans
  son prompt et l'ordre de ne JAMAIS créer le deuxième.
- **07:05** — FF-017 **TERMINÉ**, commit `cde3b0cd`. **Le compteur partagé tient** : X5 3/3, une
  invitation photo ferme la question de précision du même jour — le pari de l'ordonnancement
  FF-025 → FF-017 est payant, il n'y a pas deux compteurs. Le défaut historique de §1 est fermé :
  les séquences `[0,3,3,0]` et `[0,0,0,0]` écrivent bien 3 faits, 3/3, **dans les deux langues**.
  6 écarts alignés, dont un joli lot d'ambiguïtés de lexique que seul un run réel pouvait sortir :
  `the`→thé, `mais`→maïs, `pain`(EN)→pain(FR), `bar`, `mure` — réparés par une **seconde
  normalisation qui garde les accents**. Plus 3 portes de passé (dont `we were eating`, inatteignable
  à cause d'un motif mal écrit) et deux ceintures de veto §7 (négation, tiers-sujet) là où le plancher
  désarmait mais **le dispatcher écrivait quand même**.
  Tests : 84 exécutions réelles avant / 84 après, élève neuf à chaque fois. easy 3/3 · medium 12/12 ·
  hard 24/27 · extra 9/15 · adversarial 23/27 — **les non-verts sont consignés, pas re-runnés**,
  conformément à la règle. 2 REDs ouverts remontés en transverse (T-7, T-8).
- **07:08** — Lancement FF-026 (bloc 8).
- **07:52** — FF-026 **TERMINÉ**, 4 commits (`4273c241`→`f109b980`). Le pont `food_preferences` est
  solide et bien écrit — mais **la capture mourait au premier gué**, très en amont de lui : le
  pré-filtre anti-bruit du memorizer écartait **10 des 15 phrases canoniques de la fiche**, dont les
  deux qu'elle cite mot pour mot. Les 2 qui passaient le faisaient **par accident de vocabulaire**.
  C'est le défaut le plus en amont trouvé cette nuit, et il était invisible à tout test unitaire :
  seule la boucle complète phrase→item→prompt→assiette pouvait le montrer.
  Livré : l'échappatoire bilingue, 2 tests de régression, et le **raccord de réconciliation manquant
  sur `generate-household-meal-v1`** (3ᵉ chemin à découvert, R3 mourait dessus).
  Tests : A 12/12 · B 8/8 (R1 tenue dans les 2 langues) · C 18/18 · E 1/1 · F 4/4 · G 2/2.
  **Point de méthode remarquable** : deux « ROUGES » étaient **les siens** — sa sonde mordait sur un
  `rationale` disant « without leaning on rice », c'est-à-dire sur le modèle **expliquant qu'il avait
  obéi**. L'agent a réparé l'instrument, re-mesuré **à code identique**, et posé explicitement la
  distinction « instrument réparé » ≠ « rouge re-couru jusqu'au vert » dans le rapport ET le commit.
  C'est exactement la discipline que le chantier demande.
  3 REDs/dépendances consignés (T-9, T-10, T-11) ; 4 amendements de fiche proposés, **non appliqués**.
- **07:55** — Lancement FF-027 (bloc 9).
- **08:34** — FF-027 **TERMINÉ**, commit `74a6ee4c`. Le diagnostic de la fiche était **exact au mot
  près** : l'axe `hunger` du tap du soir écrivait une ligne et avait **zéro consommateur en aval**.
  Les 3 briques construites : plancher déterministe FR+EN du spontané, décompte fenêtré **dérivé**
  (7 j, seuil 2 — aucune colonne de compteur nulle part, recalculé à chaque lecture), bloc satiété
  en **littéral gelé**. Table `student_hunger_reports` avec RLS, `anon`+TRUNCATE retirés, purge 60 j,
  export RGPD et cascade **prouvés** (la cicatrice « le lifecycle RGPD ne réclame pas les tables
  neuves » n'a pas été rejouée).
  **R2 est prouvée, pas promise** : énumération exhaustive de l'espace d'entrée → 2 sorties possibles
  (`null` ou LE bloc), + audit statique 4 sites, 0 inversion. Le chemin « moins de nourriture »
  n'existe pas *structurellement*, ce n'est pas une consigne de prompt. Et le bloc **ne porte aucun
  nombre** — ni kcal ni le décompte — donc le plafond de §10 devient structurel.
  `meal_generation.ts` (autre agent) **évité proprement** : le bloc arrive par le suffixe concaténé
  chez l'appelant, patron déjà documenté par `buildHouseholdPromptBlocks().userSuffix`.
  1 RED trouvé **et corrigé** : le bloc ressuscitait un aliment refusé (« such as potatoes, brown
  rice » chez quelqu'un qui n'en mange pas) ; témoin sans signal propre 3/3 donc imputable au bloc ;
  corrigé des deux côtés, re-testé 3/3 puis 27/27.
  Tests : unitaires 60/60 · run réel 27/27 · adversarial 12/12 · suite keel 1596/1596.
  Reste ouvert : une phrase **longue** sur la faim franchit le pré-filtre et peut devenir le trait
  durable que R4 interdit (correctif dans le prompt du memorizer, hors périmètre).
- **08:37** — Lancement FF-028 (bloc 10), avec les **deux** sections de handoff recopiées
  intégralement dans son prompt. Le contraste entre les deux est le point dur de sa conception :
  FF-027 lui donne un signal **synchrone** (2 lectures Postgres), FF-026 un signal à **latence non
  bornée** (une nuit + une visite d'écran). Une recommandation qui suppose « ce que l'élève a dit
  hier » sera fausse pour tout élève qui n'ouvre pas la carte.
- **09:26** — FF-028 **TERMINÉ**, commit `b7d6a308` (10 fichiers, agent-gate **vert**, aucun fichier
  réservé touché). Construite de zéro. **Le chiffre qui compte : 95,8 % de soirs silencieux**
  (24 soirs-élève sur 8 profils) — le silence est bien le cas nominal, ce qui était la contre-mesure
  n°1 de la fiche contre le moteur bavard. C'était 87,5 % avant son correctif A1.
  **Trouvaille de conception** : la directive durable **n'est pas une table neuve** — c'est
  `eating_rhythm`, qui a déjà trois lecteurs runtime. La boucle est donc fermée *par construction*,
  au lieu de créer un 4ᵉ chemin à brancher (exactement l'erreur que FF-027 venait de réparer sur
  `generate-household-meal-v1`).
  **Défaut trouvé en revue adversariale et corrigé** : une proposition **sans réponse** ne bloquait
  rien — la même question repartait chaque soir. Ajout de `awaiting_response`, expiration
  `unanswered`, cooldown sur l'action ignorée. C'est le mode de défaillance que la fiche avait oublié
  (consigné en écart E6).
  Tests : 33/33 unitaires · easy 3/3 · medium 8/8 · hard 7/7 · extra-hard 9/9 · boucle réelle avec
  vrai modèle 3/3 · adversarial 10 GREEN / 0 RED. 1711 verts, `tsc -b` exit 0, **zéro rouge
  préexistant**. 4 écarts de fiche consignés, non appliqués.
  1 défaut mesuré 3/3 **hors périmètre** : le générateur écarte silencieusement le petit-déjeuner
  accepté quand une préférence le contredit (`meal_generation.ts`, réservé) → **T-12**.
  ⚠️ C'est ce rapport qui a fait remonter le **doublon de version de migration `20260808060000`** —
  antérieur au chantier, mais il **bloque le `db push`** de la nuit. Remonté en tête de la file de
  commandes, non réparé (renommer une migration déjà appliquée est une décision humaine).
- **09:29** — Lancement FF-016 (bloc 1).
- **10:28** — FF-016 **TERMINÉ**, 3 commits (`93633584`, `79c6538b`, `774471dd`). Le manque annoncé
  était **exact et total** : `protocolFoodBlock` avait 2 appelants (les générateurs), **zéro dans
  `sophia-brain`**, et `KeelTurnContext` n'avait pas de champ `protocol`. Le chat connaissait les
  interdits, jamais les encouragés. C'est réparé, borné à 2 400 car. et **non prescriptif**.
  Le bloc est injecté en **4ᵉ position** — après verrou clinique, contraintes dures et doctrine,
  avant la note 1:1 — classement **par coût de perte**, et §3.3 range bien la doctrine avant lui.
  **Trois défauts trouvés en run réel, aucun prévu par la fiche, tous corrigés** :
  ① la question §8 **mot pour mot** partait 6/6 dans la lane swap et créait une ligne `dislikes_food`
  chez le coach — c'est-à-dire que le cas nominal de la fiche déclenchait un effet parasite ;
  ② **le défaut de sécurité de la nuit** : un **cœliaque** recevait « Yes… Log it as usual »
  **2/3 en anglais, 0/3 en français** — cicatrice T9 exactement, le dispatcher recopiait le prescrit
  dans le demandé. Réparé en comparant l'identité à la ligne DB et en dégradant vers une escalade
  nommée ; re-mesuré **7/7 sans aucun OUI** ;
  ③ des identifiants internes (`fried_food`, `lean_protein`) sortaient dans la bulle — nom lisible
  posé à la source (même famille que la cicatrice `defense_card`).
  **La parité est prouvée hors test unitaire** (extra-hard) : `commitment_evaluations.status='met'`,
  `swap_applied=true, swapped_from=refined_grain` — l'évaluateur du soir ne note pas `missed`.
  108 réponses relues en base, 3 passes chacune ; +19 unitaires ; `_shared/keel` 1643/1643.
  **T-13** isolée (contrat `plan_question` du dispatcher) et **T-14** posée (le budget tient, mais
  `context_tokens` est la mauvaise colonne — c'est `full_chars`).
- **10:31** — Lancement FF-010 (bloc 2).
- **11:19** — FF-010 **TERMINÉ**, 2 commits (`fccd5a9a`, `1145e867`). Troisième fiche à démentir son
  « état présumé » : `loadHouseholdTurnContext`, le bloc et le gate de visibilité **existaient**
  (`8ed2cab4`, `1d2b0193`) avec **14 tests verts** — mais la fixture QA écrivait `cookOn` là où la
  production écrit `cook_on`. Le code n'avait jamais vu la forme réelle des données (**T-15**).
  Corrigé : le jeton de jour se résout en **date** dans la fenêtre (jour courant en tête, jours passés
  exclus, date sur chaque ligne) — c'est-à-dire que le foyer **cessait de faire cuisiner le mauvais
  jour** ; la liste de courses entre, bornée à 12 avec troncature dite ; un gate déterministe empêche
  la lane de voler « on mange quoi ce soir ? » ; le bloc monte de la 8ᵉ à la **5ᵉ** place de l'ordre
  de survie ; le dernier `if (kind === 'shared')` est remplacé par le verdict du module pur — c'était
  exactement l'angle adversarial « la visibilité re-décidée par un `if` local ».
  **Le pire cas budgétaire du chantier est mesuré et il passe** : foyer de 6 × 7 jours, A/B sur la
  seule appartenance → **24 458 → 27 092 car.** (bloc 2 632), 3/3 identiques, marge 4 908 sous le
  plafond, doctrine appliquée **3/3** au tour saturé.
  Tests : easy 3/3 · medium 12/12 · hard 11/12 · extra-hard 12/12 · 12 hypothèses adversariales dont
  **4 REDs trouvés, 3 fermés** (comparaison en colocation, coche inférée, restriction plaidée).
  RED ouvert **T-16** : un mineur obtient « 56,3 g de sucre » 2/3 — une règle de prompt n'est pas une
  ceinture. Aucune migration, aucun deploy nécessaire.
- **11:22** — Lancement FF-011 (bloc 13).
- **11:50** — FF-011 **TERMINÉ**, commit `cba9df7c`. Encore une fiche **déjà livrée** (`088d323a`) :
  vérification, mesure et correction plutôt que construction.
  **La consigne de re-vérifier la cicatrice plutôt que de la croire a payé** : `ack_guard` mord bien,
  mais **pas comme la note le disait** — la citation nue traverse, et c'est l'intersection
  « fait accompli » × « zéro effet committé » qui emporte la phrase entière. Détail consigné ci-dessus,
  avec ses chiffres et ses deux aggravations non documentées.
  **Deux défauts réels corrigés** : l'agent **croyait l'élève sur parole** — il répondait
  *« you missed all your meals »* à quelqu'un qui avait **5 coches en base**, puis bâtissait un
  conseil dessus (écho 1/3 → **0/3**) ; et un souvenir était utilisé comme matière groundée.
  **Le chiffre demandé : 0 morsure de ceinture sur 10 tours consécutifs** (et 0/6, 0/6 ailleurs),
  0 encouragement creux sur 22 tours réels — la ceinture n'est donc pas devenue le cas nominal,
  c'était le risque nommé par le bloc.
  Honnêteté de méthode, à nouveau : un **vert faux de son propre probe EN** trouvé et corrigé en
  cours de route (instance de T-15).
  89 unitaires verts ; easy/medium/hard/extra 3/3 chacun ; 11 hypothèses adversariales (4 réfutées,
  5 confirmées, 2 consignées). **T-17** ouvert sur FF-017, déjà close.
  Amendement notable : §11 se répond **par la mesure** — le composeur choisit le fait **le moins**
  favorable, pas le plus. La crainte inscrite dans la fiche était l'inverse de la réalité.
- **11:53** — Lancement FF-029 (bloc 11).
- **12:26** — FF-029 **TERMINÉ**, 2 commits (`0d598093`, `7751c1d7`). Le côté coach était bien
  construit et vert (84 tests), non déployé. **Le jeu maison a été livré sans une ligne de code de
  plus** : 3 pratiques pré-classées à la main sur la doctrine du coach `house`, mêmes tables, mêmes
  ceintures — la preuve que le coach `house` **est** un coach et pas un second chemin, ce que la
  fiche exigeait. Aucune n'est chiffrée : le jeu maison est donc **sûr pour un mineur par
  construction**, pas par garde.
  **Régression de sécurité fermée au passage** : sous plancher de restriction, la pratique chiffrée
  **se tait** — §7 disait `practicesFor`, le code ne portait que R4.
  **T-16 tranché** : `minor_quantity` est une **vraie ceinture déterministe**, testée FR et EN en
  soumettant le texte **directement** à la ceinture pour contourner `PILOT_FORCED_LOCALE`. L'agent
  a donc **réfuté l'amendement proposé par FF-011** — deux fiches consécutives sur le même point,
  la seconde avec les preuves. Le RED qui reste est plus étroit : seul le `target` est interdit,
  un chiffre **inventé** passe encore.
  R7 vit : le soir écrit au ledger, l'adhérence se **dérive** (aucun score stocké), la rotation
  saute une pratique décrochée et, tout décroché, **arrête de demander sans arrêter de parler**.
  1674 déterministes verts ; run réel 15/15 (7 soirs × 4 élèves, deux passages) ; adversarial 12/12
  (5 hypothèses écrites avant d'être jouées). **Trois verts se sont révélés faux et ont été
  corrigés** — encore une instance de T-15, trouvée par l'agent lui-même.
  RED ouvert : Sophia **se contredit entre le soir et le chat** (« I don't have any other everyday
  item ») — les pratiques ne sont dans aucun prompt de conversation ; correction bloquée sur
  `companion.ts`, réservé.
- **12:29** — Lancement FF-018 (bloc 4), avec l'avertissement le plus important de son bloc en tête :
  **ne pas « corriger » les filtres d'énergie** — l'écart code/contrat est délibéré.
- **12:56** — FF-018 **TERMINÉ**, commit `a9adc22d`. La chaîne est **solide** : idempotence par
  `client_upload_id` sur **trois étages**, write-through quadruple vérifié, 113 tests verts au départ.
  **Un seul défaut dans le périmètre, et il atteignait l'élève** : une énergie **écrite en toutes
  lettres** (« about four hundred calories », « environ deux cents calories ») traversait le FILTRE 1
  **jusqu'à l'accusé**, et le lexique macro **français** (`32 g de protéines`) n'était pas couvert —
  T9 encore une fois, dans la fiche même dont le bloc disait « ne touche pas aux filtres ».
  ⚠️ **Aucun filtre desserré** : le piège nommé est intact. L'agent a vérifié que
  `CALORIE_REVERSAL.md` §2 qualifie lui-même ces motifs de « cœur de la garde » — donc les **resserrer**
  était conforme, les **relâcher** aurait été le piège. La distinction a été faite correctement.
  **T-17 réfuté sur le chemin photo** (1 ligne → 1 ligne, et 1 seule sur les trois formes de course).
  La photo sombre, seul cas instable du run antérieur, est désormais **stable 3/3**.
  Tests : easy 3/3 · medium 16/16 (filtre de sujet 10/10) · hard 6/6 · extra-hard 16/17 · 12
  hypothèses adversariales (2 confirmées+corrigées, 5 réfutées, 2 arbitrages déjà documentés dans le
  code, 2 latentes). 30 uploads réels.
  **Deux faux résultats de ses propres sondes consignés exprès** — dont `day: "saturday"` là où la
  production écrit `sat` : **T-15 mot pour mot**, quatrième occurrence de la nuit.
  RED ouvert **T-18**, qui donne enfin un scénario reproductible à la course `temp_memory`.
- **12:59** — Lancement FF-020 (bloc 12) — revalidation de sécurité, à conduire sobrement.
- **13:25** — FF-020 **TERMINÉ**, commit `ef8e041e`. La fonctionnalité est bien livrée : reducer pur,
  registre compilé de 23 lignes **identique à la graine de migration** (R7 tenue par un test qui lit
  le `.sql`), 69 tests verts, aucun rouge préexistant. Ressources correctes en réel (FR, US, GB) ;
  pays inconnu ou sale sur 16 entrées ⇒ jeu `ZZ`, **zéro fuite de voisin**.
  **Le constat majeur est T-19** : l'épingle de locale **inverse les deux chemins**. La prose part en
  anglais chez un élève FR (18/18) tandis que le **repli déterministe est monolingue français** —
  donc un élève américain dont le modèle tombe reçoit les bons numéros dans une langue qu'il ne lit
  peut-être pas. Le repli est le filet de dernier recours ; c'est là que ça compte le plus.
  **T-7 confirmé 6/6, FR et EN**, relu en `psql` : 0 ligne `protocol_events`.
  **Corrigé** : le repli portait du texte **sans ressource** sur `high`/`medium` (1/5 → **5/5**,
  55/55 kind×pays), et un `kind` absent rendait un tour **vide** (durcissement R5). L'agent note que
  les 47 tests du reducer **passaient à côté de l'axe pays** — ses 8 tests neufs sont les premiers à
  l'armer. 77 verts, agent-gate vert.
  4 REDs consignés, dont **T-20** (pays absent ⇒ numéros FR, 34 élèves) et la sortie de faux positif
  qui arrive au tour **suivant** le démenti — verrou délibéré, testé contre §8, donc à arbitrer et
  non à « réparer ».
  Deux faux verts de ses propres sondes trouvés **avant** conclusion (mauvaise clé `temp_memory`,
  colonne inexistante avalée en « 0 ligne ») — cinquième occurrence de T-15.
- **13:28** — Lancement FF-021 (bloc 15), **dernière de la file**. Elle reçoit la liste explicite des
  16 chemins neufs de la nuit à auditer, commit par commit, plus T-7/T-19/T-20 en entrée.
- **14:14** — FF-021 **TERMINÉ**, commit `b36e5de9`. **La file est vide.** Le plancher est
  irréprochable — pur, seuils gelés, aucune entrée de suppression *par construction* (le snapshot n'a
  que 4 clés), throw sur donnée cassée, 4 déclencheurs vivants, **les six surfaces supprimées absentes
  de 24 tours réels, FR et EN**. La formule de l'agent résume la nuit : « rien de ce qui ne va pas
  n'est dans le module : tout est dans sa **jointure avec ses consommateurs** ».
  **F1 est le résultat de la nuit** (voir en tête de ce document) : `weekly_reviews.risk_band` n'a
  aucun écrivain, 7 gardes armées dessus. Corroboré par le master.
  **1 chemin sur 16 demandait au plancher correctement** ; 3 après son lot.
  Livré : les deux lanes de demande reçoivent le drapeau **brut** en paramètre **requis** (la
  cicatrice « garde optionnelle = garde désarmée » appliquée à la lettre), refus nommé **avant toute
  I/O**, ordre calqué sur `routers.ts`. `meal_precision.ts` (réservé) évité — le gate est posé dans la
  lane, avec la demande de déplacement écrite dans le code.
  Elle a aussi trouvé que **le latch de fermeture d'épisode relâchait la suppression** : « And what did
  you have with it? » repartait **sous plancher levé**. Corrigé, 6/6.
  Tests : easy 12G/1R · medium 24G/2R · hard 15G/2R · extra 13G/3R, +6G après correctif ; ~110 tours
  réels ; `_shared/keel` **1681/0**. 5 amendements de fiche rédigés, non appliqués.
  **Et elle a contredit T-7 sur un point de fait** (la trace existe, il manque un lecteur) — un agent
  qui vérifie l'énoncé qu'on lui donne plutôt que de le reprendre, c'est ce qu'on voulait.
- **14:17** — Lancement de la **passe transverse**. Son mandat ④ (preuve de gate par chemin) étant
  déjà couvert par FF-021, je le remplace par une vérification par échantillon et je concentre la
  passe sur ①, ② et ③ — avec la correction de métrique de T-14 (`full_chars`, pas `context_tokens`).
- **15:05** — **PASSE TRANSVERSE TERMINÉE**, rapport `scratchpad/RAPPORT-TRANSVERSE.md`.
  Aucun fichier de production touché ; suite `_shared/keel` **1681/0** (le chiffre de FF-021) ;
  **33 comptes de fixture créés, 33 purgés, zéro orphelin**.
  ① **La doctrine survit** — mais la prémisse était fausse sur un point : le bloc satiété de
  FF-027 **n'entre jamais** dans le prompt du chat (0 occurrence de `satiety` dans
  `sophia-brain` ; ses seuls consommateurs sont les 3 générateurs). Ce sont donc **quatre**
  blocs, pas cinq. Mesuré sur l'élève qui les porte tous : doctrine 1 465 · protocole 1 199
  (= le chiffre de FF-016) · foyer 2 632 (= le chiffre de FF-010) · bilan 895 · pouls 1 291 ·
  soutien 1 392 = **8 886 car. de blocs KEEL**. Tour saturé (foyer de 6 + 20 tours d'historique
  + découragement) : **5 tours sur 6 TRONQUÉS**, dépassement jusqu'à **5 178 car.**, et
  doctrine appliquée **3/3**. ⚠️ **`full_chars = 32 222` est la SIGNATURE d'une troncature,
  pas une marge** — l'arithmétique est vérifiée sur les mesures de FF-023 (26 842 et 30 150
  retombent au caractère près). `context_tokens` NULL sur 32/32 tours : T-14 confirmé.
  **Quel bloc tombe le premier : AUCUN bloc KEEL.** Ils sont **préfixés** au contexte ; la
  coupe par la queue mange la fin du **contexte du chargeur** — c'est-à-dire la **mémoire
  longue** (`topicMemories`, `globalMemories`, `eventMemories`) et les add-ons de coaching.
  Marge mesurée avant que FF-011 (1er bloc KEEL menacé) soit entamé : **11 746-12 352 car.**
  → 🔴 **T-22** : le classement de survie écrit dans `withKeelDoctrineBlock` est vrai et
  **inopérant**, parce que la queue appartient à `buildContextString`. Deux ordres de survie
  documentés, aucune autorité sur leur frontière. Même famille que T-1/T-6/T-12/T-16.
  ② **UN compteur, prouvé sur les quatre genres** : 12 élèves neufs, 4 ordres × 3 runs,
  **12/12 GREEN, exactement 1 ligne de ledger** par élève-jour. Chacun des quatre genres est
  capable de prendre la place (`photo_invitation` en A, `daily_recommendation` en B,
  `meal_precision_question` en C, `practice_question` en D) et les trois autres cèdent par un
  refus **nommé** (`daily_ask_budget`, `practiceMode:"remind"`). L'ordre D a été ajouté après
  avoir trouvé un trou dans ma propre couverture (A/B/C ne testaient jamais la pratique en
  tête). Les deux genres du soir sont appelés **sans HTTP** — les crons paginent 200 profils
  et la base est partagée.
  **T-6 non observé sur 61 tours à budget fermé** (30 ordinaires + 25 déclaratifs + 6) :
  ce n'est pas une réfutation, c'est une borne (p ≈ 8 % si le taux était 1/25).
  ③ Le test de propriété **existe et passe 10/10**
  (`sophia-brain/test_harness/keel_properties/no_food_solicitation_property_test.ts`) — mais
  **il ne couvre AUCUN des chemins neufs** : `grep` des quatre genres dans tout
  `test_harness/` → **0 résultat**. Propriété vraie et incomplète. Mesurée directement :
  **30 tours ordinaires → 0 sollicitation, 100 % de silence**, ledger delta 0, 1/30 réponses
  portant un « ? ». Le silence est resté le cas nominal.
  ④ Échantillon : **FF-021 confirmée sur les 4 lignes prises** — #13 FF-011 3/3, #5 FF-025
  **6/6** (dont 3 épisode CLOS), #7 FF-017 **6/6**, #11 FF-016 confirmé **découvert** (le bloc
  protocole parle sous plancher levé). `ledger = 0` sur **12 tours déclaratifs** sous plancher
  levé : son correctif du drapeau brut tient.
  🔴 **T-21 (RED neuf)** : l'énoncé littéral **« ce n'était pas prévu » / « it wasn't on the
  plan » / « hors plan » n'est PAS un marqueur de hors-plan** — 8/8, FR+EN, témoins verts. Le
  repas s'enregistre, sa **relation au plan** est perdue ⇒ il sort du décompte du jour ET
  **FF-025 ne peut plus armer** (`not_off_plan`). L'élève qui dit la chose la plus explicite
  possible ne reçoit jamais l'invitation à la photo. Distinct de T-3 : établi avec des
  composants **reconnus** (ma première sonde utilisait « pizza », que le lexique ne reconnaît
  pas — corrigé avant de conclure).
  🔴 **T-23 (petit)** : `voice.address: "tu"` ressort comme **le mot « tu »** dans un message
  anglais du soir (1/3, `composeRecapBody`, réservé).
  **T-15 trois fois de plus, dans MES sondes** (`plan_version_id` inexistante, `created_at`
  au lieu de `asked_at`, « pizza » pris pour un composant) — les trois trouvés par la base,
  jamais par un test vert ; chaque en-tête de sonde porte son faux départ.
  **Aucune commande pour l'humain** : aucune migration, aucun deploy, aucun secret.
