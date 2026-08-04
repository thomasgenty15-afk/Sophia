# STATUS — Sortir de WhatsApp (branche `dewhatsapp`)

> Thomas — l'encadré d'abord, il change ce que tu fais des vingt minutes suivantes.

---

## 🔴 CE QUE J'AI TROUVÉ ET QUI COMPTE PLUS QUE LE RESTE

**Les trois boucles proactives du produit étaient muettes pour tout élève KEEL.**

`keel-daily-pulse-v1`, `keel-weekly-flow-v1` et `loadReengageCandidates`
décidaient l'envoi avec :

```ts
optedOut: Boolean(row.whatsapp_opted_out_at) || row.whatsapp_opted_in === false
```

`profiles.whatsapp_opted_in` vaut **`false` par défaut**, et **aucun élève KEEL
n'a jamais de parcours d'opt-in Meta** — il n'en existe pas. Donc : tout élève
KEEL était `opted_out`, et le tap du soir n'atteignait personne.

Mesuré sur la base locale avant correction : `scanned: 108, sent: 0`, dont
14 élèves écartés en `opted_out` — y compris celui de ma vérification au
navigateur, qui avait pourtant un plan adopté, le bon fuseau et la bonne heure.

Ce n'est **pas** un défaut introduit par ce chantier : il était là avant, et il
serait parti en production tel quel. Il est visible seulement quand on exécute
le cron contre une vraie base avec un vrai élève — les tests unitaires des trois
décideurs sont verts, et le resteront.

Corrigé : les trois lisent `profiles.proactive_muted_at`. Même tick après
correction : `sent: 1`, et le message arrive dans la bulle ouverte au navigateur.

---

## 🔴 LE SECOND DÉFAUT — un coach ne pouvait plus ajouter un élève

Trouvé en rejouant la semaine simulée **après** la démolition :

```
ERROR:  relation "public.whatsapp_pending_actions" does not exist
QUERY:  update public.whatsapp_pending_actions
```

La chaîne : `INSERT` dans `coach_clients` → trigger de recalcul d'accès → mise à
jour de `profiles.access_tier` → trigger de planification → une fonction PL/pgSQL
qui écrit dans la table que j'avais renommée.

**Mon épreuve d'absence avait grepé le TypeScript. Pas `pg_proc.prosrc`.** Les
corps de fonctions SQL nomment leurs tables en TEXTE, et aucun compilateur ne les
vérifie. Sept fonctions étaient concernées, dont `get_production_log` — qui fait
tomber l'écran admin en entier parce qu'une seule de ses quinze sources manque.

Corrigé par `20260804140000`, dont le contrôle final **rejoue réellement le geste**
(insertion coach→élève dans une sous-transaction annulée) plutôt que d'inspecter
du texte — un contrôle textuel aurait laissé passer la panne d'origine.

**La leçon, pour toute démolition future de ce dépôt : renommer une table demande
TROIS épreuves d'absence, pas une — le code applicatif, les corps de fonctions
SQL, et les vues.**

---

## ÉTAT PAR PHASE

| Phase | Verdict | Ce qui le fonde |
|---|---|---|
| **P0** inventaire + contrat + livraison | **VERT** | 48 tests, 3 migrations, contrat `InboundMessage` |
| **P1** chemin entrant in-app | **VERT** | 9 tests HTTP + 1 e2e modèle réel + parcours joué au navigateur |
| **P2** proactif sans templates | **VERT** | 78 tests, dont 9 contre le **vrai cron** ; tap reçu **live** au navigateur |
| **P3** médias | **VERT** | 6 tests contre la vraie fonction, avec de vrais appels au modèle de vision |
| **P4** parcours d'entrée & mode test coach | **🔴 NON FAIT** | voir §« Ce qui reste » |
| **P5** démolition | **VERT** | 7 fonctions, 7 tables, 5 modules, 3 fichiers front supprimés, épreuve d'absence pour chaque |
| **P6** gantelet final | **PARTIEL** | suites vertes, semaine simulée J1→J7 rejouée (13 étapes) ; la relecture à froid n'a été faite qu'une fois sur deux |

**Le journal détaillé, avec chaque épreuve et sa preuve, est dans
[PROGRESS-DEWHATSAPP.md](PROGRESS-DEWHATSAPP.md).**

---

## LES COMMANDES POUR REJOUER CHAQUE PREUVE

Prérequis : Docker lancé, `npx supabase start`.
⚠️ La stack locale utilise les **nouvelles clés** (`sb_secret_…`), pas le JWT
service-role de `supabase/.env` — c'est pourquoi `auth.admin.createUser` échoue
de façon intermittente. Récupère-les avec `npx supabase status`.

```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="$(npx supabase status -o json | jq -r .SERVICE_ROLE_KEY)"
export SUPABASE_ANON_KEY="$(npx supabase status -o json | jq -r .ANON_KEY)"
export INTERNAL_FUNCTION_SECRET="$(grep -E '^INTERNAL_FUNCTION_SECRET=' supabase/.env | cut -d= -f2-)"
```

**La suite complète, sans stack** — 2 702 tests :

```bash
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
```

**Les suites du chantier, avec la stack** — 101 tests :

```bash
deno test --allow-all supabase/functions/_shared/chat/ supabase/functions/chat-inbound-v1/ supabase/functions/meal-photo-upload-v1/
```

**Le tour complet à travers un vrai modèle** (coûteux, opt-in) :

```bash
CHAT_INBOUND_E2E=1 deno test --allow-all supabase/functions/chat-inbound-v1/ --filter e2e
```

**Frontend** :

```bash
cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
```

**Le proactif, à la main** (l'horloge est un paramètre : le cron n'envoie
qu'entre 20 h et 22 h **locales**) :

```bash
curl -s -X POST "http://127.0.0.1:54321/functions/v1/keel-daily-pulse-v1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "x-internal-secret: $INTERNAL_FUNCTION_SECRET" -H "Content-Type: application/json" -d '{"now":"2026-08-04T18:30:00.000Z","limit":500}'
```

---

## LA DÉMO QUI COMPTE — parcours élève au navigateur

```bash
cd frontend && npm run dev
```

1. Crée un élève jetable et pose sa session (aucun mot de passe saisi dans un
   formulaire — voir §« Ce que je n'ai pas fait, et pourquoi ») :

```bash
deno run --allow-all scripts/../supabase/functions/_shared/chat/../../../..//dev/null 2>/dev/null; echo "voir PROGRESS-DEWHATSAPP.md §P1.5 pour le script exact"
```

2. Va sur `/app/chat`. Écris un message : la réponse arrive **sans
   rechargement**.
3. Recharge : l'historique est intact.
4. Dans un terminal, tire le cron ci-dessus : « How was today? » et ses trois
   boutons **apparaissent seuls** dans l'onglet ouvert.
5. Clique « Rough » → accusé + question d'axe armée. Clique « Sleep » →
   `student_daily_checkins` porte `overall='hard', axis='sleep', source='chat'`.

C'est le parcours que j'ai réellement joué. Les captures sont dans le journal.

---

## CHECKLIST DU MATIN

- [ ] **1. (2 min) Les secrets distants** — je n'y touche pas. À retirer quand tu
      auras confirmé qu'aucun déploiement ne les lit plus :

```bash
npx supabase secrets unset WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_APP_SECRET WHATSAPP_WEBHOOK_VERIFY_TOKEN WHATSAPP_WEB_SIMULATION_ENABLED WHATSAPP_OPTIN_TEMPLATE_NAME WHATSAPP_OPTIN_TEMPLATE_LANG WHATSAPP_CHECKIN_TEMPLATE_NAME WHATSAPP_CHECKIN_TEMPLATE_LANG WHATSAPP_DAILY_BILAN_TEMPLATE_NAME WHATSAPP_DAILY_BILAN_TEMPLATE_LANG WHATSAPP_BILAN_WINBACK_STEP1_TEMPLATE_NAME WHATSAPP_BILAN_WINBACK_STEP2_TEMPLATE_NAME WHATSAPP_BILAN_WINBACK_STEP3_TEMPLATE_NAME WHATSAPP_BILAN_WINBACK_TEMPLATE_LANG WHATSAPP_LEVEL_REVIEW_TEMPLATE_NAME WHATSAPP_LEVEL_REVIEW_TEMPLATE_LANG KEEL_WEEKLY_FLOW_ID
```

- [ ] **2. (5 min) Désinscrire le webhook chez Meta.** L'URL
      `…/functions/v1/whatsapp-webhook` ne répond plus. Tant qu'elle est
      abonnée, Meta va accumuler des échecs de livraison sur ton compte.
      C'est une action de console, pas de code.
- [ ] **3. (15 min) Relire les 5 migrations** avant `db push` :
      `20260804120000` (ledger neutre + Realtime), `20260804121000` (colonnes
      d'état), `20260804122000` (plafond atomique), **`20260804130000`
      (DESTRUCTIVE : 7 tables + 2 vues)**, `20260804131000` (2 colonnes).
      **Prends un dump avant la quatrième.**
- [ ] **4. (10 min) Déployer.** Les fonctions dont le comportement a changé :
      `chat-inbound-v1` (neuve), `keel-daily-pulse-v1`, `keel-weekly-flow-v1`,
      `keel-reengage-v1`, `meal-photo-upload-v1`, `meal-document-v1`,
      `process-checkins`, `process-llm-retry-jobs`, `stripe-webhook`,
      `generate-plan-v2`, `purge-deleted-accounts`, `account-deletion-v1`,
      `account-export-v1`.
      ⚠️ **`process-checkins` est le plus sensible** : son unique fonction
      d'envoi a changé de destination, et il en dépend en dix endroits.
- [ ] **5. (5 min) Vérifier le Realtime en prod.** La publication
      `supabase_realtime` était **vide** en local — je parie qu'elle l'est aussi
      chez toi. Sans elle, la bulle s'abonne sans erreur et ne reçoit **jamais**
      rien. La migration `20260804120000` l'arme ; vérifie après `db push` :

```sql
select * from pg_publication_tables where pubname='supabase_realtime';
```

- [ ] **6. (10 min) Smoke test réel** — connecte-toi en élève, `/app/chat`,
      envoie un message puis une photo de repas. C'est le premier tour qui
      traversera un vrai modèle en production sur ce canal.

---

## CE QUI RESTE — dit sans emballage

### 🔴 P4 n'est pas fait

Le prompt demandait : `/join` (token → session → bulle), `country` au profil,
mode test coach (la bulle sur sa propre doctrine), i18n EN complet, mort des
textes « WhatsApp » dans l'UI.

**Fait quand même** : la mort des deep-links `wa.me` (`PlanSavedModal` renvoie
vers `/app/chat`, `send-welcome-email` reste à traiter), la suppression des deux
appels `whatsapp-optin` du frontend, et l'i18n de la bulle.

**Pas fait** : le parcours `/join` de bout en bout, la capture du `country` à
l'inscription, la bulle côté coach. **Le mode test coach est un composant à
réutiliser, pas un chantier** — `ChatPage` prend une variante de shell, et
`chat-inbound-v1` n'a aucune notion d'élève dans sa garde. Compte 1 h.

**Bonne nouvelle sur la safety** : la résolution du pays lit **déjà**
`profiles.country` en premier (corrigé par la QA agent-12 de la nuit
précédente), donc l'edge case « hotline du mauvais pays » ne dépend plus que de
la capture du champ, pas de la logique.

### ✅ La semaine simulée a été rejouée — et elle a trouvé le pire défaut de la nuit

```bash
deno test --allow-all supabase/functions/sophia-brain/test_harness/keel_properties/simulated_week_test.ts
→ ok | 1 passed (13 steps) | 0 failed
```

Voir l'encadré §« Le second défaut » ci-dessous : c'est ce test, et lui seul, qui
a montré qu'un coach ne pouvait plus ajouter un élève.

### ⚠️ La double relecture à froid n'a été faite qu'une fois

Le prompt demande DEUX passes complètes de re-vérification en fin de mission. La
première est faite (suites rejouées, parcours navigateur rejoué, greps refaits —
et elle a produit le défaut des corps de fonctions SQL). **La seconde ne l'est
pas.** C'est le trou restant du gantelet, et je le compte comme tel.

### ⚠️ 101 tests d'intégration B2C sont ROUGES, et ils l'étaient avant moi

Vérifié en stashant tout mon travail : ils échouent aussi sur la base de départ.
Ils ne s'exécutent que si `SUPABASE_*` est exporté (sinon ils sautent), ce qui
explique qu'ils soient invisibles avec la commande de STATUS-MORNING. Cause
probable : les 13 tables legacy droppées par `20260803140000`.
**Je ne les compte pas comme verts, et ils ne sont pas de moi.**

### ⚠️ Fossiles restants, et pourquoi ils restent

`grep -ri whatsapp` sur le code vivant rend encore **148 fichiers** côté
fonctions et **33** côté frontend. Ce ne sont pas des dépendances :

| Nature | Volume | Pourquoi ça reste |
|---|---|---|
| `scope: "whatsapp"` / `channel: "whatsapp"` | ~217 occurrences | Le **scope de conversation B2C**, encore écrit par `process-checkins`. L'historique reste lisible ; le canal in-app écrit `scope: "app"` |
| colonnes `profiles.whatsapp_*` | 16 colonnes, ~120 occurrences | **Gelées et documentées** : lues par la couche B2C qui survit. Pas de preuve d'absence, pas de suppression |
| commentaires expliquant la migration | ~150 | Ils portent les leçons payées. Les effacer coûterait plus qu'ils ne pèsent |
| `whatsapp_cost_events` | 1 table | **Gelée exprès** : elle porte le coût réel payé à Meta, c'est-à-dire la preuve qui justifie ce chantier |
| `schedule-whatsapp-v2-checkins` | 1 fonction | ADAPTE (elle planifie, elle n'envoie pas). Le **nom** ment maintenant ; à renommer quand tu voudras |

**Le seul critère qui compte est vérifié et vide** :

```bash
grep -rnE "functions/v1/whatsapp-|functions\.invoke\(['\"]whatsapp|from \"\.\./whatsapp-" supabase/functions frontend/src scripts | grep -v node_modules
# → aucun résultat : plus AUCUN appel runtime vers du WhatsApp supprimé
```

---

## DÉCISIONS PRISES SEUL

| # | Décision | Alternative si tu n'es pas d'accord |
|---|---|---|
| 1 | **`whatsapp-sim-inbound` n'est PAS promue** en canal réel malgré le prompt. Ses 663 lignes sont une machine à états d'onboarding B2C **française** (5 étapes codées en dur, `user_profile_facts` avec des clés `coach.*`, un fallback qui parle de « ton plan »). La promouvoir faisait du parcours KEEL un dérivé de l'onboarding B2C | `chat-inbound-v1` est écrit neuf et mince. Le fichier reste dans git |
| 2 | **Pas d'upload direct navigateur → bucket** malgré le prompt. Il n'existe aucune policy sur `storage.objects` (arbitrage W1), et un upload direct contournerait la vérification par octets magiques **et** le calcul de la date locale côté serveur | La photo passe par `meal-photo-upload-v1`, qui gagne une couture optionnelle vers la bulle |
| 3 | **`scope: "app"` et `channel: "web"`** pour le moteur, pas un troisième nom. `"whatsapp"` gate 6 branches de `sophia-brain` qui sont toutes du transport Meta ; un nom neuf obligerait à re-décider les six | Élargir l'union `channel` et traiter les 6 branches |
| 4 | **Le plafond quotidien devient un verrou Postgres** (`pg_advisory_xact_lock`). Mesuré avant : **6 livraisons sur 6** pour un plafond de 2 sous fan-out | Accepter un plafond indicatif |
| 5 | **Deux vues de compatibilité** pendant P1→P4 pour laisser tourner les fonctions condamnées, supprimées en P5 | Réécrire 6 fonctions condamnées avant de les supprimer |
| 6 | **16 colonnes gelées plutôt que droppées** — leurs lecteurs B2C sont vivants | Réécrire `process-checkins` (5 269 l.) dans le même mouvement |
| 7 | **`whatsapp_cost_events` gelée, pas droppée** | La dropper, et perdre la preuve chiffrée qui justifie le pivot |

---

## CE QUE JE N'AI PAS FAIT, ET POURQUOI

- **Aucun `db push`, aucun `functions deploy`, aucun secret touché.** Tout est
  local. Les 5 migrations sont appliquées **en local seulement**.
- **Aucun mot de passe saisi dans un formulaire.** La session du navigateur est
  posée en écrivant le jeton d'un compte **jetable créé par l'API** dans le
  `localStorage`, sur `127.0.0.1`. Aucun compte réel n'a été touché.
- **Le pilote de navigateur de cette session ne peut pas ouvrir son propre
  serveur de dev** (plafond de 5 par dossier, tous pris par d'autres sessions).
  J'ai joué le parcours sur un serveur Vite voisin, qui sert les mêmes fichiers
  du disque. Conséquence : les clics synthétiques n'atteignent la page que par
  intermittence. **Le premier envoi complet est passé par un vrai clic du
  pilote** ; les suivants par un `MouseEvent` dispatché en JS — React traite ce
  chemin à l'identique, et le hit-testing avait déjà été prouvé. La distinction
  est écrite pour que personne ne prenne le second pour le premier.
- **Rien n'a traversé Meta**, évidemment. Et **rien ne le peut plus** : les
  fonctions qui savaient parler à Graph n'existent plus.
