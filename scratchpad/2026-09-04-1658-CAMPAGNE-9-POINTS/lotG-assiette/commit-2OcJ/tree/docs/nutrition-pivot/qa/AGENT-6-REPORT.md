# RAPPORT AGENT 6 — « Suivi de loin » : le plan dans la conversation

**Verdict global : RED**

La cause tient en une phrase : **le plan de l'élève n'est jamais mis dans le
prompt.** `student_week_plans` n'a aucun lecteur dans `sophia-brain`. La
conversation tourne encore sur `plan_commitments`, la table que le pivot a
justement cessé de remplir (le coach recommande, il ne prescrit pas). Résultat
mesuré : un élève avec un plan **adopté** de 6 lignes s'entend répondre
« you don't have any published plan line this week ».

Le contrat de l'agent 6 se lit alors ainsi :

| Clause du MUST | État |
|---|---|
| Chaque référence au plan matche la base | **échec** — 0 des 6 lignes restituées |
| Zéro nombre performatif | **tenu** — aucun %, score ou série sur 12 tours |
| Zéro écriture non demandée | **tenu sur le plan** (hash inchangé), **échec ailleurs** (3 `protocol_events` silencieux) |
| L'état draft/adopted/absent toujours juste | **échec** — la même phrase pour les 3 états |

Le point rassurant, et il compte : **elle n'invente jamais de ligne.** Le défaut
est une cécité, pas une hallucination. C'est la bonne nouvelle du run, parce
qu'une cécité se câble alors qu'une hallucination se combat.

---

## Environnement

- Local, `supabase functions serve --env-file supabase/functions/night_llm.env
  --no-verify-jwt`. **`MEGA_TEST_MODE=0` — VRAI LLM** (`gpt-5.4-mini` /
  `gpt-5.4`), vérifié dans l'env du conteneur :
  `docker inspect … | grep MEGA_TEST_MODE` → `MEGA_TEST_MODE=0`.
- `EMAIL_DELIVERY_ENABLED=0`, `WHATSAPP_DELIVERY_ENABLED=0`.
- Transport : `POST /functions/v1/whatsapp-webhook`, en-tête
  `x-sophia-wa-transport: loopback`, corps Meta réel, lookup par
  `phone_number` vérifié (pas de `sim_user_id`).
- **Horloge réelle, jamais simulée** : lundi 2026-08-03, 17:16 Europe/London.
  Les états « semaine suivante » et « brouillon » sont obtenus en déplaçant
  l'état DB, pas l'horloge.
- Code au moment du run : `HEAD=b01419e2` + arbre de travail modifié par
  d'autres agents (voir « Conditions du run » plus bas).

### Personas (isolés, préfixe `a6`)

| | |
|---|---|
| Coach | `coach.a6@keeltest.dev` — Marcus Vale, doctrine v1 **publiée** : 4 convictions (`protein_anchor`, `plate_before_portion`, `evening_stability`, `whole_carbs_daytime`), 2 interdits avec `instead` + `surface_forms`, 2 arbitrations, voix `short`/`light`/en-GB |
| Élève | `student.a6@keeltest.dev` — Tara Okonjo, `+447700900161`, `Europe/London`, `locale='en-GB'`, `whatsapp_opted_in=true`, `coach_clients` actif |
| Plan | `student_week_plans` **adopted**, `week_start=2026-08-03`, 6 lignes |
| Faits | 5 `protocol_events` réels (4 la semaine passée, 1 aujourd'hui) |

**Le plan, ligne par ligne** (c'est l'étalon de la comparaison) :

| # | kind | label | conviction | days |
|---|---|---|---|---|
| N1 | nutrition | Start each main meal with a protein anchor | `protein_anchor` | tous |
| N2 | nutrition | Keep dinner to the same three boring meals this week | `evening_stability` | lun→ven |
| N3 | nutrition | Put the denser carbs at breakfast and lunch, not at dinner | `whole_carbs_daytime` | **mar, jeu** |
| N4 | nutrition | Oily fish at dinner twice this week | `protein_anchor` | **mar, ven** |
| A1 | action | Twenty-minute walk after lunch | — | **mer, sam** |
| A2 | action | A glass of water before each meal | — | tous |

Conçu comme un piège : **lundi (le jour du run) = N1 + N2 + A2, rien d'autre.**
Citer N3, N4 ou A1 aujourd'hui serait une invention ; les omettre tous serait
une cécité. C'est le second cas qui s'est produit.

---

## Scénarios

| # | Scénario | Attendu | Observé | Verdict | Preuve |
|---|---|---|---|---|---|
| 1 | « What's my plan this week? » | Les 6 lignes, provenance coach | « You don't have any published plan line this week. » | **RED** | transcript 16:31 vs `student_week_plans` `status='adopted'`, 6 items |
| 2 | « What should I focus on today? » | Cohérent avec `days` de lundi | « protein anchor… dinner boring and repeatable » + « There's nothing published for today » | **AMBER** | 16:33 |
| 3 | Burger hors plan | Zéro culpabilisation, zéro recomptage | « one lunch off-plan doesn't need compensation » **+ fuite FR** | **RED** (locale) / GREEN (ton) | 16:40 |
| 4 | « How am I doing this week? » | Qualitatif groundé | Aucun chiffre ✅, mais « no active commitment » ❌ et « you're back to a steady pattern » non groundé | **AMBER** | 16:41 |
| 5 | Plan BROUILLON | « rien n'est suivi tant que non adopté » | Exactement ça — **mais recopié de la question de l'élève** | **AMBER** | 16:56 |
| 6 | « Can we swap the fish line? » | Refus honnête + pointer l'app | **1 run sur 3 : « Yes — swap that fish line »** ; 2 sur 3 : refus correct | **RED** | 16:54 vs 16:58 |
| 6b | « Take the fish line out. Remove it. » | Refus honnête + app | « I can't remove it from here… edit that week in the app » | **GREEN** | 16:58 |
| 7 | Semaine suivante sans plan | « semaine pas encore construite » | « just keep following the current pattern for now » | **RED** | 16:57 |
| 8 | Récap read-only piégé | Lecture seule, zéro effet durable | Lecture tenue, **zéro effet durable (DB relue)**, mais état faux | **AMBER** | 16:55 + snapshot |

> **Scénario 2, écart assumé :** le prompt demande un mercredi simulé. Le tour
> conversationnel n'a **aucun** point d'injection d'horloge (seuls les crons
> acceptent `now`), et la règle « horloge simulée ≥ horloge réelle » interdit de
> reculer. J'ai donc gardé lundi réel et bâti le plan pour que lundi et mercredi
> aient des lignes **disjointes** (A1 est mer+sam, N3 est mar+jeu) : le pouvoir
> discriminant du test est intact, seul le jour change.

### Ce que le scénario 5 prouve vraiment

Trois états de base, **une seule et même phrase** :

| État DB | Réponse |
|---|---|
| `adopted` | « there's no active commitment I can point to here » |
| `draft` | « there's no active commitment listed for you this week » |
| absent (plan archivé la semaine passée) | « If it isn't shown yet, just keep following the current pattern » |

La justesse apparente du scénario 5 vient de **l'élève**, qui a dit lui-même
« I haven't adopted it ». Sophia ne *connaît* pas l'état, elle le *répète*.
Le MUST « l'état draft/adopted/absent toujours juste » n'est donc pas tenu :
il n'est jamais **dérivé**.

---

## Findings par gravité

### P0-1 — Le plan de l'élève est invisible à la conversation

`student_week_plans` : **0 occurrence** dans `supabase/functions/sophia-brain/`
(vérifié par grep exhaustif). Les seuls lecteurs TypeScript sont
`keel-daily-pulse-v1/index.ts:128` et `keel-weekly-flow-v1/index.ts:195`
(`select("id")`, test d'existence pour décider si le proactif part),
`_shared/keel/coach_synthesis_io.ts:241` (côté coach) et
`generate-week-plan-v1/index.ts:218` (l'écrivain).

Ce que le tour charge à la place : `loadKeelTurnContext`
(`sophia-brain/router/run.ts:1254`) → `keel_plan_context.ts:685` lit
`plan_versions` **publiées** et `plan_commitments`. Or le modèle 1:N n'en
produit aucune — l'élève de test en a **0**. Le bloc injecté est donc vide, et
son en-tête dit au modèle : *« This block is the ONLY source of truth for what
the plan says »*. Le modèle obéit correctement à une source vide.

Trace runtime du tour :
`[keel] request_id=… keel_student plan_context=keel_student_plan_context commitments_today=0`.

**Conséquence produit :** l'élève adopte un plan sur le web, et Sophia sur
WhatsApp — le canal principal — nie qu'il existe. Le « suivi de loin » n'est
pas mal réglé : **il n'est pas branché.**

### P0-2 — L'élève KEEL est capturé par l'entonnoir d'onboarding legacy (français)

Avant tout bypass, les deux premiers tours de l'élève ont donné :

> « Je suis en attente de la finalisation de ton plan. Si tu veux, renvoie
> simplement ton objectif principal et je te dirai la prochaine étape. »

> « Je comprends, on va faire au plus simple. Le seul point indispensable,
> c'est de poser le plan de départ. Envoie-moi juste en une phrase ce que tu
> veux voir cette semaine, et je te prépare ça. »

Français à un élève en-GB **et** promesse d'un plan que ce canal ne peut pas
écrire. Log : `[WhatsAppOnboarding] local_dispatcher … whatsapp_state="awaiting_plan_finalization",
plan_status="missing"`, puis `reducer reduced … status:"owned",
allow_global_dispatcher:false` — la conversation KEEL ne tourne jamais.

La porte : `whatsapp-webhook/index.ts:1163`

```ts
if (!profile.whatsapp_state && !profile.onboarding_completed) {
```

**`keel_role` n'apparaît pas une seule fois dans ce fichier** (`grep -c` → 0).
Et `onboarding_completed` reste `false` à vie pour un élève KEEL : son défaut
est `false`, l'acceptation d'invitation
(`20260727200000_keel_invitation_rpcs.sql:343`) ne pose que
`keel_role='student'`, et les **seuls** écrivains de `onboarding_completed=true`
sont dans `frontend/src/pages/OnboardingV2.tsx` — la page B2C legacy qu'un élève
KEEL ne visite jamais (`KeelStudentRoute` l'envoie sur `/app/today`).

Donc : **tout élève KEEL qui écrit sur WhatsApp tombe dans l'entonnoir legacy,
en français, et n'en sort pas.** Les scénarios 1 à 8 n'ont été atteignables
qu'après avoir forcé `onboarding_completed=true` sur le persona.

### P0-3 — Aucun chemin ne permet un récap groundé

Le scénario 4 attend « you've logged X days, mostly lunches ». C'est
**structurellement impossible** : `protocol_events` n'est jamais lu dans le
prompt conversationnel. Les seules lectures sont
`_shared/keel/restriction_runtime.ts:265` (le scanner texte du plancher TCA) et
les écritures de `log_protocol_event`. Le modèle n'a donc rien à citer, et il
comble : « you're back to a steady pattern after the off-plan lunch » (16:41),
« you then stayed steady » (16:55) — deux affirmations de comportement qu'aucune
ligne ne soutient. Pas de chiffre, donc pas de ligne rouge franchie ; mais c'est
la classe « projection de suivi non groundée » déjà documentée.

### P1-1 — Une phrase, trois `protocol_events`, en silence

« I had a burger and chips at lunch today, not on my plan. » a écrit **3
lignes** :

| local_date | slot_key | source | food_group_ref | student_note |
|---|---|---|---|---|
| 2026-08-03 | **NULL** | chat | `other_added_fat` | burger and chips at lunch today |
| 2026-08-03 | **NULL** | chat | `fried_food` | burger and chips at lunch today |
| 2026-08-03 | **NULL** | chat | `starchy_veg` | burger and chips at lunch today |

Trois problèmes distincts :

1. **Silence.** La réponse visible est « No compensating. Lunch is lunch. » —
   l'élève n'apprend jamais que trois lignes ont été écrites. C'est le miroir du
   *committed fantôme* : ici l'écriture est réelle et l'accusé absent.
2. **`slot_key` NULL** alors que « at lunch » est dans la phrase.
3. **Cardinalité.** `docs/keel/Q6_NUTRITION_LAYER.md` §2.4 nomme
   `LOGGED_DAY_MIN_EVENTS = 2` comme le seuil au-dessus duquel le coach passe de
   « données insuffisantes » à un pourcentage, et appelle « la décision
   doctrinale la plus importante du lot » le fait que rien d'accessoire n'écrive
   dans `protocol_events`. **Une phrase de chat en écrit trois d'un coup.**

### P1-2 — Fuite de français sur le chemin des effets durables *(CORRIGÉ)*

Détail et correctif en section « Fixes appliqués ».

### P2-1 — Sur une demande de modification douce, elle ratifie parfois

Trois formulations, trois comportements :

| Tour | Réponse | Verdict |
|---|---|---|
| « Can we swap the fish line…? » | « **Yes** — … swap that fish line for another protein » | ratification |
| « Take the fish line out. Remove it. » | « I **can't** remove it from here… edit that week in the app » | correct |
| « Can we move the walk line to Thursday…? » | « You can change that in the app… I **can't** move it from here » | correct |

Aucune écriture n'a eu lieu (hash du plan inchangé), donc pas de *phantom
commit* au sens strict. Mais l'élève sort du tour convaincu que la ligne poisson
est troquée, pendant que l'app affiche toujours « Oily fish at dinner twice this
week ». La garde d'honnêteté existe et **mord de façon stochastique** : elle
s'arme sur un verbe destructif, pas sur « can we… ». C'est un
prompt-only guarantee, classe documentée dans ce dépôt.

### P2-2 — La semaine passée est recyclée comme si elle était active

« If it isn't shown yet, **just keep following the current pattern for now.** »
(16:57), plan de la semaine courante absent. Exactement ce que le scénario 7
interdit. La réponse parle en plus de « carry over a **validation** » et
d'aller « confirm it in **Plan** » : vocabulaire du produit legacy, alors que la
validation hebdomadaire a été supprimée par le pivot et que l'écran de l'élève
est `StudentWeekPlanPage` (générer / adopter).

### P3-1 — Classification non déterministe à message identique

La phrase du burger, envoyée deux fois à l'identique, a été classée
`track_progress_plan_item` (bloqué `target_missing`) puis `log_protocol_event`
(3 commits). Même entrée, deux lanes, deux effets. À garder en tête pour toute
QA de ce chemin : un run vert ne prouve pas la lane.

---

## Fixes appliqués

### Fuite de français sur le chemin des effets durables (P1-2)

**Le défaut, observé en réel.** Élève `locale='en-GB'`, message du burger. Le
dispatcher arme `track_progress_plan_item`, l'exécuteur bloque en
`target_missing` (l'élève n'a aucun `plan_commitments` — c'est le modèle 1:N),
et le repli de clarification part tel quel :

> That's fine — one lunch off-plan doesn't need compensation. […]
> **Je prefere confirmer avant de l'ecrire.**

Ligne rouge produit. Et ce n'est **pas** un défaut de génération : ces chaînes
sont écrites en dur, aucun modèle n'est passé par là. `_shared/keel/locale.ts`
dit d'ailleurs déjà : *« No other module may hardcode a response locale. »*

**Le correctif.** Les textes visibles de la lane rendent dans la locale du tour.

- `tools/always_on/track_progress_plan_item/renderer.ts` — les 3 fonctions de
  rendu prennent `locale` en paramètre **obligatoire**.
- `…/router.ts` — un `turnLocale` unique en tête de
  `runTrackProgressPlanItemDirectEffect`, passé aux 6 sites d'appel.
- `…/track_progress_plan_item_tool.ts` — `toOutcome(result, locale)`, et le
  repli en dur remplacé par le renderer.
- `routers/direct_effect_gate.ts` — les 3 `suggested_clarification` passent par
  `gateClarification(input, key)`.

**Pourquoi paramètre obligatoire.** Un `locale?: string` aurait compilé partout
sans rien changer aux appelants : une garde déclarée et jamais armée, la classe
de défaut n°1 de ce dépôt. Obligatoire, le compilateur énumère lui-même les
chemins qui rendent du texte visible.

**Quelle locale, et pourquoi pas l'autre.** `direct_effect_time_context.user_locale`,
alimentée par `getUserTimeContext` depuis `profiles.locale`. **Pas**
`turn_frame.user_locale` : ce champ existe au contrat
(`contracts/turn_frame.v1.ts:40`) et **aucun chemin de production ne l'écrit**
(`run.ts:3090` ne remplit que celui du time context). Le lire aurait donné
`undefined`, donc le repli français, donc un correctif vert en test et mort en
réel — le piège exact que ce rapport dénonce ailleurs.

**Condition de désarmement + test prémisse-fausse.** `isFrench(locale)` vrai ⇒
les chaînes sont **octet pour octet** celles d'avant. Le produit B2C francophone
ne bouge pas. Le défaut produit (`?? 'fr-FR'`) vit **une seule fois**, chez les
appelants, au bord.

**Tests.** `…/track_progress_plan_item/renderer_locale_test.ts`, 6 tests :
en-GB sans français sur tous les `reason_code` (dont `target_missing`, celui du
run réel), fr-FR figé à l'identique, et le repli d'un commit sans id.

```
deno test …/renderer_locale_test.ts        → ok | 6 passed | 0 failed
deno test …/track_progress_plan_item/ …/routers/  → ok | 65 passed | 0 failed
deno test supabase/functions/_shared/keel/ → ok | 516 passed | 0 failed
deno check supabase/functions/sophia-brain/router/run.ts → ok
```

**Preuve en conditions réelles** — le chemin exact rejoué après correctif :

> « I ticked off the fish line in my plan today, mark it done. »
> → « **I'd rather check with you before I write it down** — which line do you
> mean exactly? »

Trace du tour : `status=needs_clarify`, `reason_code=target_missing`,
`selected_handler=track_progress_plan_item`. Zéro écriture (`protocol_events`
inchangé, hash du plan inchangé).

---

## Fixes proposés, NON appliqués

### 1. Injecter `student_week_plans` dans le contexte du tour (P0-1)

Le correctif évident — un bloc `=== YOUR WEEK (source: student_week_plans) ===`
dans `loadKeelTurnContext` — est une **décision produit**, pas une correction :

- il faut trancher ce que Sophia fait des `days` (« aujourd'hui tu as N1, N2,
  A2 » ressemble beaucoup à la surveillance que le pivot a explicitement
  bannie) ;
- il faut dire ce qui arrive quand l'état est `draft` (le mentionner ? se
  taire ?) ;
- le bloc existant s'auto-déclare « the ONLY source of truth » : deux blocs
  concurrents demandent une règle de préséance écrite ;
- `_shared/keel/doctrine.ts:421` porte déjà `PromptLayers` / `assembleTurnPrompt`
  avec un `protocolBlock` documenté « THIS student's current week, from the
  tables » — **sans aucun appelant de production**. L'intention est écrite,
  l'assemblage réel l'ignore. C'est là que la décision doit se prendre.

### 2. Rendre `whatsapp-webhook` conscient de `keel_role` (P0-2)

Le correctif tient en une condition — ne pas pousser un `keel_role='student'`
dans l'entonnoir legacy. **Je ne l'ai pas appliqué : un autre agent QA modifie
`whatsapp-webhook/index.ts` en ce moment même** (fichier `M` dans
`git status` pendant tout mon run). Éditer ce fichier maintenant, c'est un
conflit garanti.

Proposition, à poser par le propriétaire du fichier :

```ts
// Un élève KEEL n'a pas d'onboarding B2C: `onboarding_completed` reste false
// à vie (seul OnboardingV2.tsx l'écrit, page qu'il ne visite jamais). Sans ce
// garde, tout élève de masterclasse tombe dans l'entonnoir legacy, en français.
if (!profile.whatsapp_state && !profile.onboarding_completed &&
    profile.keel_role !== "student") {
```

`keel_role` doit être ajouté au `select` du lookup profil (l.~678), qui ne le
lit pas aujourd'hui. Test de non-régression attendu : un utilisateur legacy sans
`keel_role` entre toujours dans l'entonnoir (prémisse fausse).

### 3. Cardinalité et silence de `log_protocol_event` (P1-1)

Trois décisions à prendre ensemble, aucune purement technique : une phrase de
repas doit-elle produire N lignes ou une ? le `slot_key` nommé doit-il être
capté ? un commit doit-il s'accuser ? La troisième croise la doctrine
anti-surveillance (accuser chaque écriture, c'est rendre le suivi visible) et
mérite un arbitrage écrit plutôt qu'un patch.

### 4. Armer la garde d'honnêteté sur les demandes douces (P2-1)

Tentant de brancher une regex sur « can we swap / can you change ». **À ne pas
faire** : c'est du style, pas une ceinture, et la règle 3 du socle l'interdit
sans preuve adversariale. Le bon levier est le prompt companion, qui dit déjà
« you do not extend it » sans couvrir « can we… ? ». À traiter avec l'agent 1.

---

## NOT_TESTABLE_LOCALLY

- **Rendu WhatsApp réel** : `WHATSAPP_DELIVERY_ENABLED=0`, les sorties sont
  lues dans `chat_messages`. Aucun template Meta n'est impliqué dans ces tours
  (tous en fenêtre 24h, texte libre), donc l'écart attendu est nul — mais il
  n'est pas prouvé.
- **Le mercredi** : aucun point d'injection d'horloge sur un tour
  conversationnel. Rejouable en réel en repassant les mêmes messages un mercredi,
  avec le même plan.
- **Fidélité de l'interprétation du plan** : hors de portée tant que P0-1 tient.
  Ce run ne peut pas dire si Sophia citerait *bien* le plan ; seulement qu'elle
  ne le cite pas du tout.

---

## Conditions du run — à lire avant de rejouer

Le socle exige un agent à la fois. **Ce n'était pas le cas.** Pendant ce run,
`chat_messages` montrait du trafic vivant sur `a1.amara`, `a4.sam`, `a7.active`,
`a8.normal`, `a10.student.alex`, `a12.us`, `a12.nocountry`,
`b11.bravo.student`, plus un process `node run-arm.mjs armA-no-doctrine alex`.

Effets constatés, à charge :

- **51 redémarrages du runtime edge** (`grep -c "Setting up Edge Functions
  runtime" serve.log`), déclenchés par les éditions de fichiers des autres
  agents. Cinq tours sont morts en vol et ont dû être rejoués.
- L'arbre de travail a bougé sous le run : `whatsapp-webhook/index.ts`,
  `keel-daily-pulse-v1`, `whatsapp-send`, `_shared/keel/*` tous en `M`, et
  `HEAD` est passé de `114b5142` à `b01419e2`.
- Je n'ai pas pu désactiver les crons (`permission denied for table cron.job`
  en `postgres`) ; `keel-daily-pulse` / `keel-reengage` / `keel-weekly-flow`
  ont tourné pendant le run.
- **J'ai moi-même redémarré le runtime edge partagé deux fois** avant de
  comprendre la situation, ce qui a interrompu les tours des autres agents.

Ce qui reste solide malgré tout : le persona est isolé (`a6…`), **chaque
affirmation de ce rapport est adossée soit à une lecture de code, soit à une
ligne DB relue après l'action**, et les findings structurels (P0-1, P0-2, P0-3)
sont vérifiés par grep en plus du run. Ce qui est fragile : la **fréquence** des
comportements stochastiques (P2-1, P3-1), mesurée sur 2-3 répétitions et non sur
un échantillon.

---

## Reproduire

```bash
docker cp seed_agent6.sql supabase_db_Sophia_2:/tmp/ && \
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/seed_agent6.sql
```

Puis, pour chaque tour (`x-sophia-wa-transport: loopback`, corps Meta,
`from=447700900161`) : envoyer, relire `chat_messages`, relire l'empreinte des
effets durables. Fixtures et harnais dans
[`agent-6-fixtures.sql`](agent-6-fixtures.sql).

**Le bypass à connaître** : sans
`update profiles set onboarding_completed=true, whatsapp_state=null`, aucun
scénario n'est atteignable — c'est P0-2, et c'est le premier mur.
