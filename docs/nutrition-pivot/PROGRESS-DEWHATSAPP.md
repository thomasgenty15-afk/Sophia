# PROGRESS — Sortir de WhatsApp (branche `dewhatsapp`)

> Journal append-only. Une entrée par épreuve du gantelet, horodatée.
> Verdict binaire par livrable : **VERT (5/5 épreuves)** ou **RED**.

---

## 2026-08-04 — Ouverture

- Branche `dewhatsapp` créée depuis `Nutrition`.
- Commit snapshot `213ac25a` du WIP (78 fichiers non committés du pivot nutrition).
  Le hook `agent-gate` est passé : 3186 tests recensés, typecheck frontend vert,
  `deno check` vert sur les 3 entrypoints, eslint vert.
- Stack locale vérifiée debout : `npx supabase status` → API 54321, Studio 54323.

---

## P0 — INVENTAIRE

### P0.1 — Ordre de grandeur mesuré (grep, 2026-08-04)

Motif : `whatsapp|wa\.me|wamid|graph\.facebook|META_(APP|WA|PHONE)`
Périmètre : `supabase/functions`, `frontend/src`, `scripts`, `supabase/config.toml`,
`env.example` — **hors** `node_modules`, **hors** `supabase/migrations` (fossiles), **hors** `docs/`.

**238 fichiers touchés.** Le prompt annonçait ~124 ; la mesure est plus large parce que
le grep inclut les tests et le harness. Détail par zone :

| Zone | Fichiers | Volume notable |
|---|---|---|
| `supabase/functions/whatsapp-*` (8 fonctions) | 47 | **15 487 lignes** rien que pour `whatsapp-webhook` + `whatsapp-send` |
| `supabase/functions/_shared/` | ~48 | dont 8 modules `whatsapp_*.ts` |
| `supabase/functions/sophia-brain/` | ~55 | très majoritairement `scope: "whatsapp"` et `channel` |
| autres edge functions | ~25 | crons, RGPD, stripe, checkins |
| `frontend/src` | 31 | dont le trio Chat + 3 tests d'intégration |
| `scripts/` | 11 | audit bundles + replay + mega-test |
| config | 2 | `config.toml` (22 lignes), `env.example` |

### P0.2 — Classement : les 8 edge functions `*whatsapp*`

| Fonction | Lignes | Sort | Motif |
|---|---|---|---|
| `whatsapp-webhook` | 15 487 (paquet) | **MEURT** après migration | Contient le moteur de tour ET ~9 000 lignes de legacy B2C (linking par email, onboarding préférences, paywall). Seuls les blocs KEEL migrent. |
| `whatsapp-send` | 1 283 | **MEURT** après migration | Gardes vivantes (cap proactif, paywall/lifecycle, dedup, réservation bilans) → `chat_delivery.ts`. Le reste est Graph/Meta. |
| `whatsapp-optin` | ~200 | **MEURT** | L'opt-in Meta n'existe plus. |
| `whatsapp-sim-inbound` | 663 | **MEURT** (pas promue) | ⚠️ Décision : voir P0.4. |
| `whatsapp-sim-trigger` | ~150 | **MEURT** | Idem. |
| `process-whatsapp-outbound-retries` | ~300 | **MEURT** | La livraison in-app est un INSERT ; pas de retry Graph à faire. |
| `process-whatsapp-optin-recovery` | ~400 | **MEURT** | Winback B2C opt-in, déjà déprogrammé côté cron. |
| `schedule-whatsapp-v2-checkins` | ~450 | **ADAPTE** | La planification survit, la livraison change. |

### P0.3 — Classement : `_shared/`

| Module | Sort | Motif |
|---|---|---|
| `whatsapp_graph.ts` (+ `_media_test`) | MEURT | Appels Graph purs. |
| `whatsapp_templates.ts` (+ test) | MEURT, **concept migre** | Le rendu de template meurt ; le couple (question, boutons) devient `armed_question`. |
| `whatsapp_media.ts` | MIGRE → `chat_media.ts` | Le téléchargement Graph meurt, la lecture depuis Storage le remplace. |
| `whatsapp_winback.ts` (+ test) | MIGRE | Seuil 72h + décision de relance = produit. Le transport meurt. |
| `whatsapp_outbound_tracking.ts` | MIGRE → ledger `outbound_messages` | `computeNextRetryAtIso` meurt avec les retries Graph. |
| `proactive_template_queue.ts` | MIGRE | La file de candidats proactifs reste ; « template » sort du nom. |
| `scheduled_checkins.ts` | MIGRE | Planification agnostique au canal. |
| `account_lifecycle.ts` | ADAPTE | Colonnes `whatsapp_*` du cycle de vie à inventorier (P0.6). |
| `locale.ts` | ADAPTE | Résolution de locale : source Meta → profil. |
| `reengagement_episodes.ts` | ADAPTE | Épisodes agnostiques ; le canal d'envoi change. |
| `keel/internal_send.ts` | MEURT | N'existe que pour poser `x-internal-secret` sur `whatsapp-send`. |
| `keel/daily_pulse_io.ts`, `keel/reengagement_io.ts`, `keel/weekly_flow*.ts`, `keel/slot_reminders.ts` | ADAPTENT | Contenu inchangé, transport in-app. |
| `delivery.ts`, `subscription-notification.ts` | ADAPTENT | Purposes → messages directs. |

### P0.4 — DÉCISION PRISE SEUL : le simulateur n'est PAS promu

Le prompt (§3.1) propose de promouvoir `whatsapp-sim-inbound` en canal réel.
**Je ne le fais pas, et voici pourquoi — vérifié en lisant les 663 lignes :**

`whatsapp-sim-inbound` n'est pas un transport neutre, c'est une **machine à états
d'onboarding B2C** : 5 étapes codées en dur (`onboarding_pref_tone` →
`onboarding_pref_challenge` → `onboarding_pref_questions` →
`onboarding_plan_creation_feedback` → `onboarding_topic_choice`), toutes les questions
en français littéral, l'écriture de `user_profile_facts` avec des clés `coach.*`, et un
`buildTimeoutFallbackReply` qui parle de « ton plan » et d'« actions » — le vocabulaire
du produit B2C d'avant le pivot, pas celui de KEEL.

Le promouvoir, ce serait faire du parcours d'entrée KEEL un dérivé de l'onboarding B2C
français. **Alternative retenue** : `chat-inbound-v1` est écrit neuf et mince (contrat
neutre + ordre des gardes), et `whatsapp-sim-inbound` meurt en P5 avec le reste.
Ce qui est repris du simulateur : rien de son corps, seulement la preuve qu'il apporte —
`processMessage` est appelable directement depuis une edge function avec un JWT
utilisateur, sans passer par Meta.

*Réversible* : si le parcours d'onboarding B2C doit revivre, le fichier est dans
l'historique git.

### P0.5 — Base de données

| Objet | Sort | Migration |
|---|---|---|
| `whatsapp_outbound_messages` | **RENOMMÉE** → `outbound_messages` | à écrire |
| `whatsapp_pending_actions` | **RENOMMÉE** → `pending_actions` | à écrire |
| `whatsapp_inbound_dedup` | **RENOMMÉE** → `inbound_dedup`, `wamid_in` → `client_message_id` | à écrire |
| `whatsapp_cost_events` | **GELÉE** | plus aucun writer ; table conservée pour l'historique |
| `whatsapp_link_requests` | à inventorier | P5 |
| colonnes `profiles.whatsapp_*` | à inventorier | P5 |
| `chat_messages` | **RESTE** le journal | + publication Realtime (manquante, vérifié) |

**Vérifié en base locale** : la publication `supabase_realtime` est **VIDE** (0 table).
Le temps réel ne marche donc aujourd'hui pour aucune table — c'est un prérequis P1.
RLS `chat_messages` : `rls_chat_messages_select_own` = `auth.uid() = user_id` → un élève
connecté peut s'abonner à ses propres messages. Rien à changer côté lecture.

### P0.6 — Config & environnement (à purger en P5)

`supabase/config.toml` : 22 lignes (`WHATSAPP_ACCESS_TOKEN`, `_PHONE_NUMBER_ID`,
`_APP_SECRET`, `_WEBHOOK_VERIFY_TOKEN`, `_WEB_SIMULATION_ENABLED`, 12 noms/langues de
templates) + 6 blocs `[functions.whatsapp-*]`.
`scripts/` : `send_whatsapp_optin.sh`, `setup_whatsapp_outbound_retry_cron.sql`,
`replay_staging_whatsapp_original_message.mjs` → MEURENT.
`mega-test.mjs` + les 4 `export_*_audit_bundle.mjs` → ADAPTENT (`scope` par défaut).

---

## P0 — LIVRABLES

### P0.7 — 🔴 TROUVÉ AVANT DE COMMENCER : la suite ne compilait pas

Premier geste après le snapshot : lancer la suite de référence. Elle **n'a pas
tourné du tout** — pas un test rouge, un **typecheck qui échoue**, donc zéro test
exécuté :

- `_shared/keel/safety_constraints_test.ts` → **8 × TS2345**. Le faux client
  déclarait `then(resolve: unknown, reject: unknown)` ; `PromiseLike<T>.then` est
  générique, donc le faux ne satisfaisait plus `SafetyConstraintsDb`.
- `sophia-brain/skills/_shared/keel_output_locks_test.ts` → **1 × TS2741**. Les
  deux fixtures de doctrine n'ont pas `foods`, devenu requis par
  `Pick<CoachDoctrine, "forbidden" | "foods">` (migration `20260804100000`).

Les deux fichiers sont dans le WIP de la nuit précédente. Conséquence : **`deno
test` sur `_shared/keel/` ET sur `sophia-brain/` rendait « Type checking failed »**
— c'est-à-dire que la totalité des 1 994 tests de ces deux arbres était
inexécutable pendant que STATUS-MORNING annonçait « 2943 tests, 0 rouge ».

Corrigé (signature générique + `foods: NO_FOODS` sur les deux fixtures, aucune
assertion touchée). **Preuve** :

```
deno test --allow-all supabase/functions/_shared/keel/ supabase/functions/sophia-brain/
→ ok | 1994 passed (4 steps) | 0 failed | 18 ignored (14s)
```

### P0.8 — Le contrat entrant neutre (`_shared/chat/inbound_message.ts`)

`InboundMessage` : `client_message_id` (remplace `wamid`), `kind` fermé
(`text|button|media|form`), `button_payload` (remplace `interactive_id`),
`media_ref` (remplace le media Graph), `form_response`, `reply_to`.

Deux garanties portées par le module :
1. **Un corps ambigu est refusé, pas arbitré.** `kind` n'est jamais deviné ; un
   `kind: "text"` porteur d'un `button_payload` est un 400. Sans ça, un bouton
   envoyé en texte se ferait interpréter par un LLM au lieu d'être exécuté.
2. **L'identifiant d'élève vient du JWT, jamais du corps.**

**Épreuve 1 (fonctionnement)** — `deno test _shared/chat/inbound_message_test.ts`
→ **22 passed | 0 failed**.
**Épreuve 2 (adversariale)** — couverte dans le même fichier :
(a) prémisse fausse → `reply_to` vers un message inexistant passe la forme, la
résolution appartient à la couche suivante ; (c) rejeu → même corps ⇒ même
`client_message_id` ; (d) **FR et EN** testés côte à côte ; (f) état vide →
texte vide, media absent, form vide ; (g) défaut silencieux → `kind` manquant
refusé, `content_type` hors liste ⇒ **415**, chemin `..`/URL ⇒ 400, taille
> 10 Mio ⇒ **413**, bornes exactes testées des deux côtés.

### P0.9 — La base : ledger neutre + temps réel

Trois migrations, appliquées et vérifiées en local (chaque `do $$` fail-loud est
passé) :

| Migration | Contenu |
|---|---|
| `20260804120000_dewhatsapp_neutral_ledger.sql` | `whatsapp_outbound_messages`→`outbound_messages`, `whatsapp_pending_actions`→`pending_actions`, `inbound_dedup` **neuve**, `chat_messages` dans `supabase_realtime`, 2 vues de compat |
| `20260804121000_dewhatsapp_profile_chat_state.sql` | `profiles.chat_last_inbound_at` + `profiles.proactive_muted_at`, backfill asymétrique |
| `20260804122000_dewhatsapp_atomic_delivery_claim.sql` | `claim_in_app_outbound()` — le plafond devient un verrou |

🔴 **Défaut hérité, non hérité exprès** : `whatsapp_inbound_dedup.wamid_in` porte
un UNIQUE **global**. Sans conséquence pour un `wamid` Meta (unique par
construction, choisi par personne) ; **fatal** pour un `client_message_id` choisi
par le client — l'élève A prend « abc », le message de l'élève B portant « abc »
est refusé en 23505, c'est-à-dire jeté comme un doublon. `inbound_dedup` est donc
une table **neuve** avec `UNIQUE (user_id, client_message_id)`, et la migration
assert que l'index est bien composite.

🔴 **Le temps réel n'était armé sur AUCUNE table** : `pg_publication_tables` pour
`supabase_realtime` rendait **0 ligne**. La bulle se serait abonnée sans erreur et
n'aurait jamais rien reçu.

**Décision : deux vues de compatibilité** (`whatsapp_outbound_messages`,
`whatsapp_pending_actions`, `security_invoker = true`) pour que les 6 fonctions
condamnées tournent inchangées jusqu'à P5 — et restent comparables au chemin neuf.
Prouvé writable (INSERT/UPDATE/DELETE + RETURNING) contre la base réelle.
**Leur suppression est un livrable de P5, pas une option.**

### P0.10 — La livraison (`_shared/chat/delivery_policy.ts` + `delivery.ts`)

Politique **pure** (aucune I/O) + couche I/O. Les plafonds Meta sont re-décidés
comme règles produit, chacune justifiée dans l'en-tête du module : conversation
active (10 h) ⇒ aucun plafond ; hors conversation ⇒ 2 relances non sollicitées /
jour local ; bilans garantis réservent leurs créneaux ; envois acceptés
(rappels de créneau) ⇒ allocation séparée de 5.

**Épreuve 1** — `deno test _shared/chat/` → **48 passed | 0 failed**, stable sur
**3 exécutions consécutives**.

**Épreuve 3 (réel)** — 8 tests d'intégration contre la base locale.

🔴 **Un vert vide, corrigé** : la première version de
`delivery_int_test.ts` rendait `null` quand la création d'élève échouait et le
test sautait son corps. **8 tests affichés verts, 6 n'avaient rien exécuté.** Cause :
`auth.admin.createUser` rend « invalid JWT: signing method HS256 is invalid » de
façon intermittente sur la stack locale. Corrigé en deux temps — création par
`signUp`, et la fonction **lève** au lieu de rendre `null`.

🔴 **Défaut trouvé par l'épreuve adversariale (b), concurrence** : six livraisons
simultanées à un élève dont le plafond est 2 →

```
[info] concurrence: 6/6 livrés (plafond 2, read-then-write assumé)
```

**Le plafond n'était pas approximatif, il était inexistant sous concurrence** —
c'est-à-dire dans le mode normal d'un fan-out de cron. Corrigé par
`claim_in_app_outbound()` : compte + INSERT dans la même transaction, sous
`pg_advisory_xact_lock` par élève. La réservation vient **avant** l'écriture du
message visible. Le test assert désormais `2/6` exactement, sans tolérance.

🔴 **Défaut trouvé par la correction précédente** : passer `countsAsUnsolicited`
à la réservation atomique comme s'il valait « soumis au plafond » a fait
**refuser le bilan du soir** après deux nudges — précisément le message que la
règle des créneaux réservés existe pour protéger. Un bilan **consomme** un
créneau sans **être opposable** au plafond. D'où `subjectToCap`, champ distinct
et testé.

🔴 **Honnêteté du ledger** : sous six RPC simultanés, Kong rend parfois un 502.
Le premier jet le consignait en `unsolicited_daily_cap`. Un ledger qui ment est
pire qu'un ledger vide. Motif distinct `delivery_claim_failed`, fail-closed.

**DoD P0** : inventaire complet ✅ · contrat typé + testé ✅ · module de livraison
+ tests réels ✅ · zéro comportement changé sur le chemin WhatsApp (vues de
compat) ✅ · suites existantes vertes ✅ (**1 994 tests**, dont 0 exécutable avant).

---

## P1 — LE CHEMIN ENTRANT IN-APP, BOUT EN BOUT

### P1.1 — Ce qui a été construit

| Fichier | Rôle |
|---|---|
| `_shared/chat/inbound_pipeline.ts` | **L'ordre des gardes, écrit comme une liste** |
| `_shared/chat/deterministic_buttons.ts` | Tap du soir + point hebdo, résolus AVANT le dispatcher |
| `chat-inbound-v1/index.ts` | L'entrée : JWT → contrat → dedup → journal → boutons → moteur → livraison |
| `frontend/src/keel/api/chat.ts` | Client : historique paginé, envoi, Realtime, fusion de liste |
| `frontend/src/keel/pages/ChatPage.tsx` | La bulle, `/app/chat`, avec son entrée de nav |

**L'ordre des gardes du webhook n'était écrit nulle part** : il était la conséquence de
1 645 lignes de `continue` dans une boucle. Chaque déplacement d'un bloc changeait le
produit sans que rien ne le dise. Il est maintenant une liste dans un module qui ne fait
que ça.

**Décisions de câblage, et leur raison** :
- `channel: "web"` et **pas** `"in_app"` : la valeur `"whatsapp"` gate 6 branches dans
  `sophia-brain` (fil rouge, indicateur de frappe, coalescence de rafale), toutes du
  transport Meta. Ajouter un 3ᵉ nom obligerait à re-décider ces 6 branches ; `"web"` les
  évite toutes **et dit la vérité** — la bulle est une surface web.
- `scope: "app"` et **pas** `"whatsapp"` : le scope porte `user_chat_states` et
  l'historique lu par le cerveau. Le réutiliser aurait gardé le mot dans chaque ligne
  écrite désormais, pour ne gagner qu'une continuité d'historique dont aucun élève KEEL
  réel n'a besoin. L'historique WhatsApp reste lisible sous son scope.
- `logMessages: false` sur `processMessage` : l'entrant est **déjà** journalisé par la
  garde 3. Sans ça, deux lignes pour un message et un doublon dans la bulle.

### P1.2 — Épreuve 1 (fonctionnement) et 2 (adversariale)

```
deno test --allow-all supabase/functions/chat-inbound-v1/
→ ok | 9 passed | 0 failed | 1 ignored
```

Les 9 tests passent **par HTTP**, pas par import. Importer le handler testerait tout sauf
ce qui casse — la passerelle, le JWT, la RLS, un CHECK, un `handleCorsOptions` sans garde
(défaut réel de ce dépôt : « ok » de 2 octets à toutes les requêtes, `deno check` vert,
tests verts, fonction jamais exécutée, trouvé seulement en curlant).

Couverture des 7 patterns sur l'entrée :
| Pattern | Test |
|---|---|
| (a) prémisse fausse | élève en suppression ⇒ **410** ; profil purgé + JWT valide ⇒ **410**, zéro tour fantôme |
| (b) concurrence | deux POST **simultanés** identiques ⇒ exactement 1 doublon, 1 seul tour |
| (c) rejeu | même `client_message_id` rejoué ⇒ `duplicate: true`, **200** (pas 409 : un rejeu réussi et un rejeu ignoré doivent être indiscernables côté client, sinon il réessaie) |
| (d) langue | jeton hebdo illisible en FR **et** message EN ; contrat testé sur les deux |
| (e) temps | date locale par `localDateFor`, source unique (couvert P0 + P2) |
| (f) état vide | corps vide, texte vide, media absent, form vide — 8 refus **motivés** |
| (g) config↔code | env Supabase absente ⇒ **500 explicite**, jamais un 200 muet |

**Le test qui porte le défaut hérité** : le même `client_message_id` chez DEUX élèves ne
bloque personne. Avec l'UNIQUE global de `wamid_in`, le second aurait reçu un 23505 et son
message aurait été **silencieusement jeté**.

### P1.3 — Épreuve 3 (réel) : le tour complet, puis le navigateur

```
CHAT_INBOUND_E2E=1 deno test --allow-all supabase/functions/chat-inbound-v1/ --filter e2e
→ ok | 1 passed | 0 failed (12s)
```

Un vrai message → vrai modèle → réponse écrite dans la bulle. 2 lignes exactement
(un entrant, une réponse), `scope: app`, `channel: in_app`, `is_proactive: false`,
`chat_last_inbound_at` renseigné.

**Puis au navigateur** (`http://localhost:5174/app/chat`, stack locale, élève jetable) :
deux échanges complets. La réponse arrive **sans rechargement** (Realtime), le rechargement
retrouve l'historique intact, le ledger porte 2 lignes `in_app / sent / reply /
counts_as_unsolicited=false`.

Réponses obtenues, non retouchées :
1. « I've paused the progress figures and the check-in reminders on your side. It isn't a
   penalty… » — **le plancher TCA a mordu** sur « I skipped breakfast ». Le cerveau est
   intact : ce chantier change le transport.
2. « You don't have a published plan line for tomorrow, so there's nothing specific here to
   follow. » — grounded, aucun chiffre, renvoi au coach.

### P1.4 — 🔴 DEUX DÉFAUTS QUE SEUL LE NAVIGATEUR POUVAIT VOIR

**1. Le message tapé s'affichait DEUX fois.** `toChatMessage` ne remontait pas
`metadata.client_message_id`, donc la ligne réelle ne pouvait pas reconnaître son propre
écho optimiste. Invisible à tout test écrit avant, parce que le doublon naît de la
rencontre entre un état React et une livraison Realtime — et que la fusion vivait **dans le
composant**. Elle en est sortie (`mergeMessage`, `mergeHistoryPage`), et **12 tests** la
pinnent maintenant.

**2. Un envoi silencieusement perdu.** `onSubmit` appelait `preventDefault()` **après** le
`return` d'un brouillon vide. Un submit sur brouillon vide partait donc en soumission
**native** — un GET sur la page, donc un rechargement complet. Symptôme observé : le champ
se vide, aucune requête ne part, l'historique se recharge comme si de rien n'était. Un
envoi perdu, indiscernable d'un envoi jamais tenté. `preventDefault()` est passé en
première ligne.

```
npx vitest run src/keel/api/chatMerge.int.test.ts → 12 passed
npx tsc -b --noEmit → 0 erreur ; eslint → 0 erreur
```

### P1.5 — ⚠️ Limite d'outillage, dite plutôt que masquée

Le pilote de navigateur de cette session ne peut pas ouvrir son **propre** serveur de dev
(plafond de 5 par dossier, les 5 appartiennent à d'autres sessions). Le parcours a donc été
joué sur le serveur Vite d'une autre session, qui sert **les mêmes fichiers du disque**.
Conséquence mesurée : les clics synthétiques atteignent la page de façon **intermittente**.

Ce qui a été prouvé par un vrai clic du pilote : le premier envoi complet (focus → frappe →
clic sur Envoyer → tour → réponse). Ce qui a été rejoué par un `MouseEvent` dispatché en
JS : le second envoi — React traite ce chemin exactement comme un clic utilisateur, et le
hit-testing avait déjà été prouvé au premier. **La distinction est écrite ici pour que
personne ne prenne le second pour le premier.**

La session est établie en posant le jeton d'un compte **jetable créé par l'API** dans le
`localStorage` : aucun mot de passe n'est saisi dans un formulaire, aucun compte réel n'est
touché.

**DoD P1** : conversation réelle au navigateur ✅ · 7 patterns sur l'entrée ✅ ·
reload = historique intact ✅ · dedup par id client ✅ (y compris sous concurrence).

---

## P2 — LA COUCHE PROACTIVE SANS TEMPLATES

### P2.1 — `armed_question.ts` : le concept survit, le transport meurt

`template_context.ts` est mort ; son mécanisme est repris dans
`_shared/chat/armed_question.ts`, **avec ses deux règles ratées consignées dans
l'en-tête** pour que personne ne les repaye :
- « fermée dès que Sophia reparle » → elle répond à chaque entrant, donc c'était
  toujours vrai : la question mourait au premier mot de l'élève ;
- « n'importe quelle question dans les 24 h » → trop lâche : une question périmée
  capturait un « oui » qui répondait à autre chose.

Une **simplification** au passage : la question armée n'est plus une ligne
d'outbound dont il faut re-rendre le template pour retrouver le texte — c'est le
message lui-même, avec ses boutons dans ses `metadata`. Le commentaire d'origine
disait que le texte rendu « était calculé puis jeté, et le classifieur devait
décider sans jamais voir ce qui avait été demandé ». **Ce problème n'existe plus.**

Une **correction structurelle** : le classifieur rend le `payload`, jamais le
libellé. `classifyTemplateReplyChoice` rendait le libellé, que chaque appelant
devait remapper — c'est ainsi qu'un « Absolument! » vs « Absolument ! » devenait
silencieusement `unrelated`.

🔴 **Défaut trouvé par le test bilingue** : le pré-filtre « une réserve n'est pas
un accord » s'écrivait `\b(pas|non|not|n't|never|jamais)\b`. Dans `can't`, le `n`
est précédé d'un `a` : **aucune frontière de mot avant `n't`**, donc l'alternative
ne mordait jamais et « sure but I can't » passait pour un accord. C'est le défaut
déjà payé dans ce dépôt (« `not` ne couvre pas `doesn't` »), reproduit et attrapé
par le test EN — le test FR seul serait resté vert. Ajouté au passage : la
négation doit venir **après** la concession (« je ne peux pas mais vas-y » est un
accord).

```
deno test --allow-all supabase/functions/_shared/chat/armed_question_test.ts
→ ok | 21 passed | 0 failed
```

### P2.2 — Les crons KEEL livrent dans la bulle

| Cron | Ce qui disparaît |
|---|---|
| `keel-daily-pulse-v1` | `sendKeelWhatsApp` + `x-internal-secret`, le 409 « fenêtre 24 h » (le cas **nominal** du job), le template de repli et ses payloads voyageant par index |
| `keel-reengage-v1` | le template nommé, le repli `global_reach`, `toneDelivered` qui comptait les tons décidés mais non délivrés |
| `keel-weekly-flow-v1` | le `flow_id` Meta, l'écran d'entrée, le CTA, le template porteur de Flow |

`sendReengageNudge` : **`toneDelivered` vaut désormais invariablement `true`** —
il n'y a plus de template, donc le ton décidé est le ton reçu. C'est une
propriété, pas un hasard.

`decideWeeklyFlow` : la garde `flow_not_configured` est **supprimée, pas rendue
optionnelle**. Elle gardait un identifiant Meta ; le formulaire vit maintenant
dans l'app, donc la condition est structurellement vraie. Le champ d'entrée est
retiré du type — *un paramètre de garde optionnel est une garde désarmée*, et ce
dépôt a déjà payé ça avec `safetyBand`.

`weeklyBiofeedbackPayload` : `source` passe de `"whatsapp_flow"` à
`"in_app_weekly_form"`. Ce champ est **lu** (synthèse, `/app/progress`) : le
laisser mentir sur son origine rendrait l'historique inexploitable.

**Couverture migrée, jamais supprimée** : les tests « the nudge goes as a
TEMPLATE » et « no published Flow → silence » sont devenus les tests du concept
survivant (le corps livré EST celui que la ceinture a vérifié ; le motif
`flow_not_configured` n'existe plus nulle part).

### P2.3 — 🔴🔴 LE DÉFAUT LE PLUS GRAVE DE LA NUIT : toute la base était muette

Constaté en tirant le vrai cron contre la base locale, avec le navigateur ouvert :

```
{"scanned":108,"sent":0,"skipped_by_reason":{"opted_out":14, ...}}
```

L'élève de la vérification au navigateur — plan adopté, bon fuseau, dans la
fenêtre — était écarté en `opted_out`. Cause :

```ts
optedOut: Boolean(row.whatsapp_opted_out_at) || row.whatsapp_opted_in === false
```

**`profiles.whatsapp_opted_in` vaut `false` par défaut, et aucun élève KEEL n'a
jamais donné d'opt-in Meta — il n'existe aucun parcours qui le lui demande.**
Donc : tout élève KEEL était `opted_out`, et le tap du soir n'atteignait
personne. Même condition dans `keel-weekly-flow-v1` et dans
`loadReengageCandidates` : **les trois boucles proactives du produit**.

C'est la classe de défaut n°1 du dépôt sous une forme neuve : une garde
réglementaire Meta, lue à l'envers, faisant taire la base du produit qui la
remplace. La migration `20260804121000` avait anticipé le raisonnement (son
backfill est asymétrique **exprès**, avec le commentaire qui le dit) — mais seule
la colonne avait été corrigée, pas ses lecteurs.

**Corrigé** : les trois lisent `proactive_muted_at`. Après correction, le même
tick rend `"sent":1` et le message arrive.

### P2.4 — Le point hebdomadaire, dans l'app

`WeeklyCheckInDialog` + `weeklyCheckIn.ts` : six axes 1-5, deux mesures
facultatives, ouvert par un bouton dont le **payload porte la semaine et rien
d'autre**. Règle héritée non négociable : le jeton dit QUELLE SEMAINE, jamais QUI.

Le contrat est dupliqué entre les deux runtimes (Vite/TS ↔ Deno, aucun import
possible). `weeklyCheckIn.int.test.ts` **lit le module Deno sur le disque** et
vérifie axes, libellés mot pour mot, échelle et bornes. Un axe que l'écran
propose mais que le parseur ignore est une case que l'élève remplit dans le vide,
et les deux côtés seraient verts séparément.

### P2.5 — Le gantelet P2

**Épreuve 1+2** — `deno test _shared/chat/` → **78 passed | 0 failed**.
9 tests d'intégration tirent le **vrai cron par HTTP**, horloge injectée
(sinon un test qui dépend de l'heure réelle est vert 2 h par jour) :

| DoD | Résultat |
|---|---|
| checkin proactif dans la bulle **sans action de l'élève** | ✅ 1 message, `is_proactive: true`, 3 boutons armés |
| réponse **libre** classée contre la question | ✅ « pretty rough, I barely slept » → `KEEL_PULSE_HARD` |
| le 3ᵉ tour désarme | ✅ armé à 2, mort à 3 |
| un nouveau message armé supplante l'ancien | ✅ |
| réponse **explicite** à une vieille question | ✅ elle seule est réactivée |
| mute respecté | ✅ + ligne `skipped / muted` au ledger |
| cap respecté | ✅ et le tap passe quand même (créneau réservé) |
| deux ticks, un seul message | ✅ |
| **fuseau** (edge case n°9) | ✅ 18h30 UTC : Paris reçoit, Los Angeles non ; 03h30 UTC : l'inverse |

**Épreuve 3 (réel)** — cron tiré pendant que la bulle était ouverte au
navigateur : « How was today? » et ses trois boutons **apparaissent seuls**, sans
rechargement. Puis clic sur « Rough » →
`student_daily_checkins(overall='hard', source='chat')` écrit, accusé « Got it. »
et question d'axe armée de ses trois boutons. Ledger :

```
sent | keel_daily_pulse      | conversation_active | false
sent | keel_daily_pulse_ack  | reply               | false
sent | keel_daily_pulse_axis | reply               | false
```

### P2.6 — ⚠️ Deux dettes héritées, mesurées et non masquées

**1. Trois fichiers de test ne compilaient pas** (`std/testing/asserts.ts`, cassé
avant cette nuit et documenté dans STATUS-MORNING). Corrigés → 13 tests de plus
exécutables.

**2. 101 tests d'intégration B2C sont ROUGES en local, et le pré-existaient.**
Vérifié en stashant tout mon travail : ils échouent aussi sur la base de départ.
Ils ne s'exécutent **que** si `SUPABASE_*` est exporté (sinon ils sautent), ce qui
explique qu'ils soient invisibles avec la commande de STATUS-MORNING. Cause
probable : les 13 tables legacy droppées par `20260803140000`. **Ce ne sont pas
mes régressions, et je ne les compte pas comme vertes.**

Filet de régression utilisé : `deno test _shared/ sophia-brain/ chat-inbound-v1/`
**sans** les variables d'env → **2648 passed, 0 failed**.
Frontend : `npx vitest run src/keel/` → **169 passed | 0 failed**.

---

## P3 — MÉDIAS

### P3.1 — Décision : la photo garde UN SEUL chemin d'upload

Le prompt propose « upload direct du client vers un bucket Storage privé ».
**Je ne le fais pas, et c'est un refus motivé** : migration `20260727130000` et
W1.4 R3 posent qu'il n'existe **aucune policy sur `storage.objects`** — `anon` et
`authenticated` sont structurellement incapables de toucher les buckets, et tout
accès fichier est une edge function en service_role qui a déjà vérifié la
propriété. C'est l'arbitrage, pas une préférence.

`meal-photo-upload-v1` est déjà ce chemin, avec deux gardes qu'un upload direct
contournerait : la vérification du type par **octets magiques** (un client qui
déclare `image/png` sur un payload arbitraire ne doit pas le voir stocké puis
donné à un modèle) et le calcul de la **date locale côté serveur** (une date
fournie par le client laisserait déposer une assiette sur un jour que
l'évaluateur a déjà fermé).

La bulle passe donc **par là**, via un champ optionnel `chat_client_message_id`.

**Pourquoi la couture est dans la fonction d'upload et pas dans
`chat-inbound-v1`** : l'accusé est rendu par `analyze-meal-photo-v1` à partir de
la **liaison** et du **crédit réellement écrits**. Le faire re-rendre par la
bulle demanderait de reconstruire la liaison depuis la ligne — une seconde
implémentation de « qu'est-ce qui a été crédité », précisément la classe de
mensonge que `renderMealPhotoAck` a été refondu pour rendre impossible
(« an argument that is absent cannot be forgotten by a caller; an optional one
can »).

### P3.2 — `whatsapp_media.ts` MEURT, sans successeur

Ce module déposait des octets sur `POST /{phone_id}/media` pour obtenir un
`media_id` — qui **expire à 30 jours** — puis `meal-document-v1` envoyait un
message le référençant. Trois appels réseau et une pièce jointe dupliquée hors de
notre stockage.

L'app a déjà le fichier : il est dans `meal-documents`, `student_meal_documents`
le référence, et `/app/meals` sait le servir derrière une URL signée. **Il n'y a
rien à transporter, seulement à dire que c'est prêt.** `meal-document-v1` livre
donc un message dans la bulle. L'ordre du fichier reste le contrat (PDF et ligne
écrits AVANT l'annonce) — avec une étape en moins qui pouvait le casser, et qui
était la seule partie `NOT_TESTABLE_LOCALLY` de la fonction.

**Épreuve d'absence** avant suppression :
`grep -rn "whatsapp_media" supabase/functions frontend/src scripts` (hors le
fichier lui-même) → **0 résultat**. Supprimé.

### P3.3 — Le gantelet P3

```
deno test --allow-all supabase/functions/meal-photo-upload-v1/
→ ok | 6 passed | 0 failed (28s)
```

Les durées (6 s, 9 s, 5 s) sont celles de **vrais appels au modèle de vision** —
c'est la première fois de ce chantier qu'une image est réellement lue.

| Cas | Vérifié |
|---|---|
| photo dans la bulle | la photo **et** son accusé, jamais l'un sans l'autre ; `media_ref` avec le type **sniffé** ; accusé `is_proactive: false` |
| photo sans légende | trace lisible `[photo]` — une chaîne vide serait une bulle blanche |
| **rejeu** (c) | même `chat_client_message_id` ⇒ `idempotent: true`, **2 messages au total** |
| **non-image** (adversarial exigé) | refusé, **rien** dans la bulle, **et** l'identifiant d'idempotence non consommé |
| absence de couture | `/app/today` reste muet — une photo prise sur l'écran du plan est un fait, pas une conversation |
| **photo sans plan actif** (adversarial exigé) | le 409 reste le contrat d'API, **et** l'élève reçoit une réponse dans la bulle |

🔴 **Défaut de produit trouvé au passage** : sans plan publié, la fonction rend
409. Sur l'écran du jour c'est lisible ; **dans la bulle, l'élève ne lit pas un
code HTTP** — il voit sa photo partir et rien revenir, ce qui est indiscernable
d'une panne. La bulle reçoit maintenant une phrase qui explique pourquoi, sans
lui reprocher quoi que ce soit (ne pas avoir de plan publié est le fait de son
coach). Le test interdit la régression **et** le reproche
(`!/you (?:should|must|need to|failed|forgot)/`).

---

## P5 — LA DÉMOLITION

L'ordre du chantier est respecté : **le code part avant la base.** Dropper
d'abord et retirer le code ensuite, c'est se donner une fenêtre pendant laquelle
la production lève à chaque tour.

### P5.1 — Les appelants, coupés avant les fonctions

| Appelant | Ce qui a changé |
|---|---|
| `_shared/account_lifecycle.ts` | `sendInternalWhatsApp` → `sendLifecycleMessage` : une fonction appelant une fonction pour, au bout du compte, écrire une ligne. L'appel HTTP et le `x-internal-secret` disparaissent avec leur classe de panne (403 silencieux comptés comme des envois réussis) |
| `stripe-webhook` | La fenêtre 24 h meurt, **et avec elle le renoncement à envoyer un avis de MODIFICATION hors fenêtre** (« aucun template approuvé ne porte un palier dynamique »). L'avis part maintenant, avec le bon palier dedans. `whatsapp_opted_in` retiré de la garde |
| `generate-plan-v2` | `postToWhatsappSend` → `deliverPlanMessage`. La distinction « parti / pas parti » survit, c'est elle qui empêche d'enchaîner l'onboarding sur quelqu'un qui n'a rien reçu |
| `process-checkins` | **Un seul point remplacé, dix appelants intacts.** Réécrire dix sites sur 5 269 lignes de legacy, c'est dix occasions de casser une garde qu'on n'a pas relue (fraîcheur, anti-doublon, placement par `time_of_day`). Voir `_shared/chat/send_compat.ts` |
| `process-llm-retry-jobs` | Le renvoi Graph meurt : in-app, écrire le message EST le rendre visible |
| `frontend` (`Auth`, `UserProfile`) | Les deux invocations de `whatsapp-optin` supprimées. Créer son compte EST le consentement |

**`WHATSAPP_TEMPLATE_CATALOG` ne meurt pas** : il devient la source de
**composition locale**. `renderWhatsAppTemplate` rendait déjà corps + boutons
pour que le classifieur voie la question posée ; on rend maintenant la même
chose pour l'élève. Un template devient un message armé.
Le module est renommé `_shared/chat/message_catalog.ts` ; `whatsapp_winback.ts`
devient `_shared/winback_policy.ts`.

⚠️ **Le seul cas qui refuse** : un template inconnu du catalogue rendait
`[TEMPLATE:<nom>]`. Acceptable pour un classifieur, **inacceptable pour un
élève**. La livraison est refusée avec un motif plutôt que d'envoyer un artefact.

### P5.2 — Ce qui est supprimé, avec son épreuve d'absence

**7 edge functions** — `whatsapp-webhook` (15 487 l. avec ses handlers),
`whatsapp-send`, `whatsapp-optin`, `whatsapp-sim-inbound`, `whatsapp-sim-trigger`,
`process-whatsapp-outbound-retries`, `process-whatsapp-optin-recovery`.

**5 modules `_shared/`** — `whatsapp_graph.ts` (+ test), `whatsapp_media.ts`,
`keel/internal_send.ts`, `sophia-brain/whatsapp_readiness/`, et
`whatsapp_outbound_tracking.ts` **réduit** à sa seule fonction pure
(`retry_backoff.ts`) : la table de délais n'a jamais rien eu de WhatsApp, elle
sert aussi aux relances de `scheduled_checkins`.

**3 fichiers frontend** — `pages/ChatPage.tsx`, `components/ChatInterface.tsx`,
`hooks/useChat.ts`. `/chat` **redirige** vers `/app/chat` plutôt que de 404 : un
lien en circulation ne doit pas mourir, et l'écran qu'il visait existe.

**5 scripts**, **22 lignes de `config.toml`**, les entrées de `frontend/env.example`.

Épreuve d'absence pour chaque cible : `grep` des invocations réelles
(`functions.invoke`, `fetch .../functions/v1/...`, `import`) — **0 appelant**
avant chaque suppression.

### P5.3 — La base

`20260804130000_dewhatsapp_drop_dead_tables.sql` :
- **2 vues de compatibilité** supprimées, comme annoncé par `20260804120000`
  (« leur suppression est un livrable de P5, pas une option ») ;
- **7 tables droppées** : `whatsapp_inbound_dedup`, `_link_requests`,
  `_link_tokens`, `_monthly_quotas`, `_optin_recovery`, `_outbound_status_events`,
  `_unlinked_inbound_messages` ;
- **`whatsapp_cost_events` GELÉE** — elle porte le coût réel payé à Meta, et
  c'est **la donnée qui justifie ce chantier**. La dropper effacerait la preuve
  du raisonnement en même temps que la dépendance. `revoke insert, update` rend
  le gel structurel ; la purge RGPD continue d'en retirer les lignes d'un compte
  supprimé — un gel n'est pas une exemption au droit à l'effacement ;
- **1 cron déprogrammé** (`process-whatsapp-outbound-retries`).

`20260804131000_dewhatsapp_profile_columns.sql` : **2 colonnes droppées**
(0 lecteur), **16 gelées et documentées**. Les seize sont lues par la couche B2C
qui survit à ce chantier ; les dropper demanderait de réécrire 5 000 lignes de
legacy dans le même mouvement. **Pas de preuve d'absence, pas de suppression.**
Trois portent désormais un commentaire SQL qui dit le piège — dont
`whatsapp_opted_in` : « NE PAS lire pour décider d'un envoi ».

La purge RGPD est réécrite : `purgeWhatsAppTraces` → `purgeMessagingTraces`, avec
`inbound_dedup` **ajoutée** à la purge (mémoire projet : le lifecycle RGPD oublie
les tables neuves).

### P5.4 — 🔴 Défaut trouvé par la démolition elle-même

Après le drop des vues de compat, le cron du soir est passé à
`sent: 0, failures: [162 × "[object Object]"]`. Deux défauts en un :

1. **`daily_pulse_io.ts` et `weekly_flow_io.ts` lisaient encore
   `whatsapp_outbound_messages`** — la vue que je venais de dropper. Le grep
   d'épreuve d'absence portait sur les *fonctions*, pas sur les *tables* : la
   leçon est que les deux épreuves sont distinctes. 8 fichiers repointés.
2. **`[object Object]`** — une erreur PostgREST n'est pas une `Error`, et ce job
   ne lisait que `.message`. Le dépôt porte déjà cet incident (un 42P10 permanent
   resté invisible dans le point hebdo). Corrigé : `code — message — details — hint`.

Après correction : `sent: 2, failures: []`.

### P5.5 — Le garde de couverture était ROUGE avant d'arriver

`coverage-guard.int.test.ts` doit forcer l'acknowledgement de toute fonction
neuve. Il échouait **déjà** : 8 fonctions de la nuit précédente
(`coach-doctrine-v1`, `coach-synthesis-v1`, `generate-meal-v1`,
`generate-week-plan-v1`, les 3 crons KEEL, `meal-document-v1`) n'y étaient pas,
et 6 triggers de tables droppées y étaient encore. **Un garde en permanence rouge
n'est plus lu.** Remis au vert, avec les 8 + `chat-inbound-v1`.

### P5.6 — La couverture MIGRE, elle n'est pas supprimée

`frontend/src/edge/whatsapp.int.test.ts` (9 cas) → `chat.int.test.ts`. Chaque
règle a une destination écrite dans l'en-tête du nouveau fichier : handshake +
signature → JWT ; STOP → mute ; wrong-number/LINK → morts (l'élève est un porteur
de JWT) ; `wa_message_id` → `(user_id, client_message_id)` ; `require_opted_in` →
mute ; throttle 429 → plafond quotidien **atomique**.

### P5.7 — Preuves

```
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
→ ok | 2702 passed | 0 failed | 35 ignored (29s)

deno test _shared/chat/ chat-inbound-v1/ meal-photo-upload-v1/   (stack + secrets)
→ ok | 101 passed | 0 failed | 1 ignored (1m1s)

cd frontend && npx tsc -b --noEmit      → 0 erreur
cd frontend && npx vitest run           → 17 files passed | 218 passed | 20 skipped
```

**État de la base après démolition** (vérifié, pas supposé) :

```
select relname, relkind from pg_class … where relname like '%whatsapp%'
→ whatsapp_cost_events | TABLE     (gelée, seule survivante)
```

---

## P6 — LE GANTELET FINAL

### P6.1 — 🔴 Le défaut que seule la semaine simulée pouvait montrer

Premier geste de la relecture à froid : rejouer `simulated_week_test.ts`. Résultat
immédiat — **9 des 13 étapes rouges**, et la première assertion échouait sur
`loaded.reason: "no_coach"`.

Cause, en remontant la chaîne :

```
INSERT dans coach_clients
  → trigger on_coach_clients_change_recompute_access
  → met à jour profiles.access_tier
  → trigger trg_refresh_whatsapp_scheduling_on_access_tier_change
  → handle_whatsapp_scheduling_access_tier_change
  → cleanup_whatsapp_scheduling_for_user
  → update public.whatsapp_pending_actions   ← table renommée en P5
```

```
ERROR:  relation "public.whatsapp_pending_actions" does not exist
```

**Un coach ne pouvait plus ajouter un élève.** Le geste le plus fondamental du
produit, cassé par un renommage de table, et invisible à tout ce qui avait été
vérifié : les 2 702 tests passaient, le typecheck passait, la bulle marchait au
navigateur, et `grep` sur le TypeScript était propre.

**Ce que mon épreuve d'absence avait manqué** : `pg_proc.prosrc`. Un corps de
fonction PL/pgSQL nomme ses tables en **texte**, et aucun compilateur ne le
vérifie. Sept fonctions étaient concernées :

| Fonction | Traitement |
|---|---|
| `cleanup_whatsapp_scheduling_for_user` | repointée (corps recopié depuis `pg_get_functiondef`, seul le nom change) |
| `queue_whatsapp_access_ended_notification` | repointée |
| `get_production_log` | 5 blocs `union all` retirés (tables droppées), 2 repointés, le bloc `cost_events` **conservé** — la table est gelée et son historique reste consultable |
| `claim_whatsapp_outbound_retries` | supprimée (le worker de renvoi n'existe plus) |
| `consume_whatsapp_monthly_quota` | supprimée (plus de quota Meta) |
| `release_whatsapp_monthly_quota` | supprimée |
| `backfill_whatsapp_template_cost_events` | supprimée (backfill ponctuel) |

Les corps sont **recopiés**, pas réécrits : réécrire à la main une logique
d'annulation de rappels, c'est réintroduire un bug pour corriger un renommage.

**Le contrôle final de la migration rejoue le geste**, il ne l'inspecte pas :

```sql
insert into public.coach_clients (...) values (...);   -- c'est CET insert qui échouait
raise exception 'dewhatsapp_probe_rollback';           -- sonde annulée
→ NOTICE: dewhatsapp: lier un eleve a un coach fonctionne (sonde annulee)
```

Un contrôle qui se serait contenté de grep `prosrc` aurait été vert **avant**
comme après : la fonction fautive existait, elle nommait juste la mauvaise table.

### P6.2 — Les suites, après correction

```
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
→ ok | 2702 passed (4 steps) | 0 failed | 35 ignored (28s)

deno test _shared/chat/ chat-inbound-v1/ meal-photo-upload-v1/   (stack + secrets)
→ ok | 101 passed | 0 failed | 1 ignored (32s)

deno test sophia-brain/test_harness/keel_properties/simulated_week_test.ts
→ ok | 1 passed (13 steps) | 0 failed (6s)

cd frontend && npx tsc -b --noEmit   → 0 erreur
cd frontend && npx vitest run        → 17 files passed | 218 passed | 20 skipped
```

**La semaine simulée passe en entier** : doctrine chargée, ceinture qui bloque une
violation d'interdit coach, contrainte médicale relue, relance à 72 h non
spammée, heures calmes différées, synthèse générée puis non re-générée, et
isolation stricte entre les deux élèves.

### P6.3 — Le parcours réel, rejoué après démolition

Navigateur, même élève, après suppression des 7 fonctions et 7 tables :
clic sur « Sleep » (question d'axe armée) → `student_daily_checkins` porte
`overall='hard', axis='sleep', source='chat'`. Le chemin
bulle → `chat-inbound-v1` → boutons déterministes → écriture produit tient.

### P6.4 — Le critère de fin du chantier, vérifié

```bash
grep -rnE "functions/v1/whatsapp-|functions\.invoke\(['\"]whatsapp|from \"\.\./whatsapp-" \
  supabase/functions frontend/src scripts | grep -v node_modules
# → aucun résultat
```

**Plus aucun appel runtime vers du WhatsApp supprimé.** Les fossiles restants
(scope de conversation B2C, colonnes gelées, commentaires portant les leçons) sont
inventoriés et justifiés dans STATUS-DEWHATSAPP.md.

### P6.5 — Ce qui reste ouvert, sans emballage

- **P4 n'est pas fait** : `/join` de bout en bout, capture du `country`, bulle
  coach. ~1 h de travail, et le mode test coach est un composant à réutiliser,
  pas un chantier.
- **La seconde passe de relecture à froid n'est pas faite.** La première l'est —
  c'est elle qui a produit P6.1.
- **101 tests d'intégration B2C rouges**, pré-existants, vérifiés par stash.
