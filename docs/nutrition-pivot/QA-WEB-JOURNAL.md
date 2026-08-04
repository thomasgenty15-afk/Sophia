# JOURNAL QA — la version web de KEEL

> Append-only, horodaté (UTC). Une entrée par test : **geste joué**, **preuve**,
> **verdict** (VERT / AMBER / RED / NON TESTÉ). Les preuves brutes sont dans
> `docs/nutrition-pivot/qa-web/`.
>
> Convention : chaque entrée porte son lot (`L0`…`L10`) et, quand c'est un
> défaut, sa sévérité (`P0` perte/corruption/sécurité/safety/rien reçu ;
> `P1` cassé avec contournement ; `P2` friction).

---

## L0 — SOCLE

### 2026-08-04 19:20Z — État de départ

**Geste** : `git status`, `git branch`, `docker ps`, `npx supabase status`.

**Constat** : la branche de travail est **`main`**, pas `dewhatsapp` comme
l'annonce le prompt. `main` contient `dewhatsapp` en entier (`git rev-list
--count main..dewhatsapp` → **0**) et **191 commits de plus**, dont le chantier
`meal-precision` (`f3f3270e` … `6a784741`). La QA se joue donc sur `main`, qui
est le sur-ensemble ; travailler sur `dewhatsapp` aurait testé une version
périmée du produit.

WIP non commité (entrées de plan : âge, corps) → commit snapshot `cc6353c5`.

**Verdict** : VERT (socle prêt).

---

### 2026-08-04 19:28Z — 🔴 L'environnement QA prescrit par le prompt rend la suite ROUGE

**Geste** : la suite « qui doit rester verte de bout en bout » du §3, jouée deux
fois — une fois **avec** les `export` du §3, une fois **sans**.

```
avec    SUPABASE_URL/ANON/SERVICE_ROLE/INTERNAL_FUNCTION_SECRET exportés
        → FAILED | 2732 passed | 116 failed | 18 ignored
sans    (env vierge)
        → ok     | 2828 passed |   0 failed | 38 ignored
```

**Preuve** : `qa-web/L0-deno-suite-sans-env.txt`.

**Ce que ça veut dire** — les 116 rouges se répartissent en deux familles, et
elles ne se traitent pas pareil :

| Famille | Volume | Nature |
|---|---|---|
| Fuites de ressources (`one_shot_reminder*`, `router/run_test`, `_shared/cors_test`, `http_test`, `internal-auth_test`, `gemini_openai_responses_test`) | 114 | **Artefact d'environnement.** Ces tests unitaires (legacy B2C) prennent un chemin réseau réel dès que `SUPABASE_URL` existe : `fetchCancelHandle was created during the test, but not cleaned up`. Sans env, ils sont verts. Ce ne sont **pas** des régressions du pivot. |
| `_shared/chat/proactive_int_test.ts` | 2 | **Vrai défaut**, voir l'entrée suivante. Ces tests ne s'exécutent QUE si l'env est exporté — ils sont `ignored` sinon. C'est pour ça qu'ils n'avaient jamais été vus rouges. |

**Conséquence de méthode, à retenir pour tout le reste de cette QA** : la commande
« suite verte » du §3 doit se jouer **sans** les `export`, et les suites
d'intégration **avec**. Les mélanger produit 114 faux rouges qui noient les
2 vrais.

**Verdict** : AMBER (P2 — friction de méthode, documentée ; aucun code produit en
cause pour les 114).

---

### 2026-08-04 19:35Z — 🔴 RED→VERT · P1 · L'horloge d'un cron gouvernait sa décision, pas ses effets

**Le rouge, d'abord** (isolé, reproductible) :

```
deno test --allow-all supabase/functions/_shared/chat/proactive_int_test.ts
→ P2 DoD: la réponse LIBRE est classée contre la question posée ... FAILED
    AssertionError: la question est armée
→ P2 DoD: le 3e tour entrant DÉSARME la question ... FAILED
    AssertionError: armée après 2 tours
FAILED | 7 passed | 2 failed
```

**Diagnostic** — `keel-daily-pulse-v1` accepte une horloge simulée
(`{"now": …}`) et s'en sert pour **décider** (fenêtre 20 h–22 h locales), mais ne
la passait pas à `deliverChatMessage`. La ligne était donc estampillée à
l'horloge **réelle**. Deux conséquences, dont une seule est visible en test :

1. la question arrivait « dans le futur » par rapport à l'horloge de résolution,
   et `resolveArmedQuestion` refuse une question future (`if (askedAt > now)
   return false`) → **question jamais armée** ;
2. plus grave sur le fond : `deliverChatMessage` calcule la **date locale** à
   partir de ce même `now`, et c'est cette date qui porte le **plafond quotidien**
   d'envois non sollicités. Le job autorisait donc l'envoi sur une date locale et
   le comptait sur une autre.

En production les deux horloges coïncident, donc ce n'est pas une panne visible
chez un élève — c'est pour ça que ça a survécu. Mais **le rejeu est le seul
moyen d'éprouver ce job**, et le rejeu était faux.

**Correctif** : `now` passé à `deliverChatMessage` dans
[keel-daily-pulse-v1](supabase/functions/keel-daily-pulse-v1/index.ts:218) et,
par la même lecture, dans
[keel-weekly-flow-v1](supabase/functions/keel-weekly-flow-v1/index.ts:255) qui
avait exactement le même trou. Les 6 autres appelants de `deliverChatMessage`
(`chat-inbound-v1`, `meal-photo-upload-v1` ×3, `meal-document-v1`,
`stripe-webhook`) n'ont pas d'horloge injectée : rien à passer.

**Le vert après** :

```
ok | 9 passed | 0 failed (6s)
```

**Verdict** : VERT après correctif. Défaut **P1**.

---

## L1 — ONBOARDING COACH

### 2026-08-04 19:35Z — Compte coach, idempotence, contre-factuels

**Geste** : `qa-web/L1_coach_onboarding.ts` — la vraie fonction `coach-signup-v1`
par HTTP, avec un vrai JWT.

**Preuve** (`qa-web/L1-run.txt`) :

```
[1]  coach créé            → profils: {"keel_role":"coach","locale":"en-US","country":"GB"}
[1b] rappel idempotent     → 200, même coach_id, 1 seule ligne `coaches`
[1c] pays « United Kingdom »→ 400 "country must be an ISO 3166-1 alpha-2 code"
     et `profiles.country` reste NULL — le refus n'écrit rien
[1d] élève → coach         → 409 "already_a_student"
[2]  doctrine save         → 200 v1 ; publish → 200 ; publish v99 → 404 unknown_version
[3]  plan-template-v1 list → 200, templates: []
[4]  invitation            → 200, ligne `coach_invitations` pending avec expiry
[4b] seconde invitation    → 200 "already_sent", TOUJOURS 1 ligne (index partiel
     `one_pending_per_email`)
```

Le formulaire `/auth?role=coach` capture bien le **pays** par un sélecteur, avec
la bonne justification affichée (« never guessed from your language »).

**Verdict** : VERT.

---

### 2026-08-04 19:36Z — P2 · `send_state: "sent"` alors que rien n'était parti

**Geste** : invitation jouée avec `EMAIL_DELIVERY_ENABLED=0` (la valeur réelle de
`supabase/.env`). Réponse : `"send_state":"sent"`.

**Ce qui se passait** : `sendResendEmail` rend `{ok:true, skipped:true}` quand la
livraison est désactivée — c'est-à-dire dans **toute** session de QA locale — et
l'appelant écrivait `sendState = "sent"` sans regarder. La seule trace honnête
était enfouie dans `communication_logs.metadata.skipped`.

Ça compte parce que le lot L1 demande précisément de prouver que « l'invitation
part » : un état d'envoi qui ne distingue pas *parti* de *supprimé* rend cette
preuve impossible.

⚠️ **Note sur Inbucket** : le prompt de mission suggère de vérifier l'email
d'invitation dans Inbucket. Ce n'est pas possible **par construction** —
l'invitation passe par **Resend**, pas par le SMTP de Supabase. Inbucket ne
capte que les mails d'**auth** (confirmation, magic link), qui eux sont bien
vérifiables (voir L2).

**Correctif** : [coach-invite-student-v1](supabase/functions/coach-invite-student-v1/index.ts:337)
rend `skipped_delivery_disabled` et journalise `status: "skipped"`.

**Verdict** : VERT après correctif. Défaut **P2**.

---

### 2026-08-04 19:42Z — 🔴 P0 · La doctrine est INJECTÉE sur 1 lane et VERROUILLÉE sur 6

C'est le défaut le plus lourd trouvé jusqu'ici, et il touche la promesse
centrale du produit : « Every message is checked against your red lines before
it goes out ».

**Le geste** : `qa-web/L1c_doctrine_real_path.ts` — le **vrai** chemin du coach,
pas une doctrine écrite à la main en base : `questions` → `compile` (le modèle
structure les réponses d'interview) → `save` → `publish`, puis des tours d'élève
réels. Le coach interdit explicitement le comptage de calories et le jeûne.

**Le rouge** (`qa-web/L1c-doctrine-real-path.txt`, première passe) :

```
ÉLÈVE  : Can I do intermittent fasting?
SOPHIA : No. This coach doesn’t use intermittent fasting because it fights
         the structure: protein at every meal, vegetables as the volume, and
         breakfast never skipped.          ← doctrine respectée ✅

ÉLÈVE  : Should I start counting my calories?
SOPHIA : What’s the situation you want to get unstuck from, exactly — and
         what’s blocking you right now?    ← 🔴 pas un mot du coach
```

**Pourquoi**, lu dans `llm_raw_response_events` du même élève :

```
dispatcher-v2-llm  → skill_signals.coaching_recommendation.detected = true
coaching_recommendation.local_dispatcher
coaching_recommendation.visible.change_confirm_coaching_type
  → {"message":"What's the situation you want to get unstuck from, exactly…"}
```

Le tour a été **possédé par la lane B2C `coaching_recommendation`**. Or :

| | appels |
|---|---|
| `withKeelDoctrineBlock` (INJECTE la doctrine dans le prompt) | **1** — le contexte du composeur |
| `applyKeelOutputLocks` (VÉRIFIE la sortie contre la doctrine) | **6** — dont les lanes de skill |

Ces lanes sont donc **verrouillées sur une doctrine qu'elles n'ont jamais lue**.
Le verrou ne rattrape que les formes de surface qu'il connaît ; il ne peut pas
faire dire à une lane muette ce que le coach pense. Et sur une **ligne rouge**,
c'est exactement le cas où l'on ne veut pas d'une lane bavarde à la place du
coach.

Ces trois lanes sont B2C de part en part : prompts en **français**, potions,
leviers, surfaces produit qui n'existent pas dans KEEL.

**Correctif** : [routers.ts](supabase/functions/sophia-brain/routers/routers.ts:634)
— `product_help`, `coaching_recommendation` et `plan_realignment` sont **fermées
à l'entrée** pour `keel_student === true`. Le tour retombe sur `plan_question`
(gaté KEEL) ou sur le composeur, qui porte la doctrine **et** le verrou. Les
branches de **continuation** restent intactes : un flow déjà ouvert doit pouvoir
se refermer.

**Les tests qui échouaient avant le correctif** :
`routers_keel_b2c_lanes_test.ts` — 3 lanes × 3 directions (fermée en KEEL,
ouverte hors KEEL, ouverte si le gate est absent) + continuation + priorité de
`plan_question`. La direction « ouverte hors KEEL » est là pour que le correctif
ne puisse pas être une suppression de fonctionnalité déguisée en garde.

Un test existant (`routers_plan_question_test.ts`) affirmait l'invariant inverse
(« product_help garde la priorité même pour un élève KEEL »). Il n'a pas été
supprimé : il est **renversé, avec la raison écrite au-dessus**, et sa moitié
hors-KEEL est conservée telle quelle.

**Le vert après** :

```
ÉLÈVE  : Should I start counting my calories?
SOPHIA : No. This coach does not use calorie counting. He builds meals around
         a protein anchor, with vegetables as the volume and breakfast never
         skipped.
```

**Verdict** : VERT après correctif. Défaut **P0**.

---

### 2026-08-04 19:40Z — AMBER · Une doctrine sauvegardée hors-forme se publie en silence

**Geste** : `save` + `publish` d'une doctrine dont `beliefs` est un tableau de
**chaînes** au lieu d'objets `{claim}`. Les deux appels rendent **200**.

**Preuve** — la sonde `qa-web/probe_doctrine.ts` sur l'élève de ce coach :

```
reason: empty_doctrine | isEmpty: true
issues: ["beliefs[0]: empty claim, dropped", … 11 entrées …]
BLOC INJECTÉ: == NO COACH METHOD AVAILABLE THIS TURN ==
```

Et le tour d'élève, en conséquence : *« Your coach's method isn't available to
me this turn. »* — un coach ayant cliqué « publier » avec succès a des élèves à
qui l'agent répond que sa méthode est introuvable.

**Portée réelle** : l'écran coach passe par `compile`, qui produit la bonne
forme ; le chemin cassé n'est atteignable qu'en appelant l'API directement. Ce
n'est donc **pas** un P0. Mais `compile` renvoie déjà un tableau `issues` que
`save` **ignore** : la même information existe et n'est pas opposée à l'écriture.

**Non corrigé** (dépasse la règle des 30 min : refuser à `save` demande de
décider quoi faire d'une doctrine partiellement valide, ce qui est un arbitrage
produit). **Documenté**, à trancher : `save` devrait au minimum rendre
`issues` et refuser un `publish` dont le bloc compilé est vide.

**Verdict** : AMBER. Défaut **P2**.
