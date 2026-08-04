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
