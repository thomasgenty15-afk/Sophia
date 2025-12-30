# WhatsApp Cloud API (Meta) — Connexion step-by-step (Sophia)

Objectif: brancher Sophia sur **WhatsApp Cloud API (Meta)** pour:
- **Inbound**: recevoir un message WhatsApp → retrouver l’utilisateur par son numéro → faire répondre Sophia → envoyer la réponse sur WhatsApp.
- **Outbound**: envoyer des check-ins proactifs sur WhatsApp au numéro communiqué dans le formulaire (`profiles.phone_number`).

Ce guide est aligné avec le repo actuel:
- Front chat web: `frontend/src/hooks/useChat.ts` → Edge Function `sophia-brain` → table `public.chat_messages`.
- Numéro user: `public.profiles.phone_number` (migration `supabase/migrations/20251213180000_add_phone_number.sql`).
- Pattern “internal secret” déjà existant: `supabase/functions/_shared/internal-auth.ts` (`INTERNAL_FUNCTION_SECRET`).
- Table de log existante: `public.chat_messages` (colonne `metadata jsonb` pour stocker channel + ids WhatsApp).

---

## 0) Choix de design (à décider une fois, dès le début)

- **Canal unique vs multi-canal**:
  - **Recommandé**: continuer à utiliser `chat_messages` comme **source of truth** et stocker le canal dans `chat_messages.metadata.channel = "whatsapp" | "web"`.
- **Fenêtre WhatsApp 24h**:
  - En dehors de la fenêtre 24h depuis le dernier message utilisateur, WhatsApp impose l’usage d’un **template message**.
  - Donc “check-in proactif” = parfois **template**, parfois **message libre** (si fenêtre ouverte).
- **Opt-in / consentement**:
  - Le simple fait de saisir le numéro dans l’onboarding ne suffit pas légalement/produit. En pratique WhatsApp demande que l’utilisateur ait “initié” ou qu’on passe par template + opt-in clair.
  - Minimum viable: **l’utilisateur envoie 1er message** (“START”) au numéro Business de Sophia, ou bien on lui envoie un **template opt-in**.

### Décision (selon ton retour)
- **Opt-in**: on envoie un **template** du style: *“Hello {first name}, c’est Sophia, prêt pour devenir la meilleure version de toi-même ?”* avec 2 boutons:
  - **Oui** (id stable recommandé: `OPTIN_YES`)
  - **Mauvais numéro** (id stable recommandé: `OPTIN_WRONG_NUMBER`)
- **Anti-spam proactif**: **max 2 messages proactifs** tant qu’il n’y a pas eu de conversation “récente” (seuil: **10 dernières heures**).

---

## 1) Pré-requis Meta (Business + App)

### 1.1 Créer et configurer
- Créer une **Meta App** (type “Business”) dans Meta for Developers.
- Ajouter le produit **WhatsApp** à l’app.
- Associer / créer un **WhatsApp Business Account (WABA)**.
- Ajouter un **numéro de téléphone WhatsApp** (Cloud API) et récupérer:
  - **WABA_ID**
  - **PHONE_NUMBER_ID** (important: c’est l’ID Graph du numéro, pas le numéro en +33…)

### 1.2 Token “prod-grade”
En dev tu peux tester avec un token temporaire, mais en prod il faut:
- Créer un **System User** dans Business Manager
- Lui donner les permissions WhatsApp / accès au WABA
- Générer un **access token long-lived** (ou renouvelable)

À stocker en secret côté Edge Runtime (Supabase):
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- (optionnel) `WHATSAPP_WABA_ID`
- `WHATSAPP_APP_SECRET` (pour vérifier la signature webhook)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (string arbitraire, sert à la vérification GET)

> Où: `supabase/.env` (local) et secrets Supabase (prod).

---

## 2) Webhook Meta: endpoints à exposer

Meta exige un webhook HTTPS avec:

### 2.1 Vérification GET (une seule fois lors du setup)
Meta appelle votre endpoint avec:
- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

Votre serveur doit répondre **200** avec le body = `hub.challenge` si `verify_token` matche.

### 2.2 Réception POST (events)
Meta envoie les events “messages” en POST JSON.
Exigences:
- Répondre vite (idéalement < 5–10s).
- Vérifier `X-Hub-Signature-256`:
  - `sha256=<hmac>` avec HMAC-SHA256(payload, `WHATSAPP_APP_SECRET`)

---

## 3) Routing: retrouver l’utilisateur à partir du numéro

Dans le payload inbound, on récupère typiquement:
- `from`: numéro utilisateur au format string type `"33612345678"` (souvent sans `+`)
- `wa_id`: identifiant WhatsApp du user (souvent identique à `from`)
- `messages[0].id`: id unique du message côté WhatsApp

### 3.1 Normaliser les numéros (indispensable)
Décider une règle unique:
- Stocker **E.164** dans `profiles.phone_number`.
  - **E.164 = format international standard**: `+` + code pays + numéro sans espaces.
  - Exemple France: `+33612345678` (pas de `06...`, pas d’espaces, pas de tirets).
- À l’inbound, normaliser `from`:
  - si commence par `+` → ok
  - sinon préfixer `+`

### 3.2 Lookup DB
Requête (service role):
- `select id from profiles where phone_number = <normalized>` → `user_id`

Cas limites:
- Aucun user trouvé → démarrer un flow de **liaison**:
  - Si l’utilisateur envoie un **email**: tenter de trouver `profiles.email`, mais **ne jamais relier le numéro uniquement sur l’email** (faille).
    - Si email introuvable: flow en 2 étapes:
      - 1) “Tu es sûr ?” (renvoyer l’email exact ou répondre OUI)
      - 2) si re-email ou confirmation: rediriger vers support (`sophia@sophia-coach.ai`)
    - Si email trouvé:
      - Envoyer un **email de validation** (au titulaire du compte) avec un lien `wa.me` pré-rempli (`LINK:<token>`).
      - Sur WhatsApp, préciser: **garder le texte pré-rempli tel quel** et l’envoyer (sinon impossible d’appliquer la modification).
      - Si le compte est déjà lié à un autre numéro: ne pas écraser; même flow de validation par token (email + lien).
- Plusieurs users (ne devrait pas arriver car `unique`) → log + refuser.

---

## 4) Traitement IA: comment appeler Sophia

Aujourd’hui, `sophia-brain` exige un **JWT user** (header `Authorization`) car c’est appelé depuis le frontend.

Pour WhatsApp inbound, on a 2 options propres:

### Option A (recommandée): une Edge Function interne “bridge”
Créer une fonction interne (ex: `sophia-brain-internal`) protégée par `X-Internal-Secret`.
- Elle reçoit `{ user_id, message, channel: "whatsapp", wa: {...} }`
- Elle utilise `SUPABASE_SERVICE_ROLE_KEY`
- Elle appelle `processMessage(...)` (la fonction pure déjà dans `supabase/functions/sophia-brain/router.ts`)
- Elle retourne `{ content, mode }`

Puis le webhook WhatsApp fait:
1) lookup user_id
2) appelle `sophia-brain-internal` (en “local call” HTTP) **OU** importe directement la logique si vous préférez.

### Option B: élargir `sophia-brain`
Modifier `sophia-brain/index.ts` pour accepter:
- soit JWT user (mode actuel)
- soit `X-Internal-Secret` + `user_id`

Option A évite de mélanger “public endpoint” et “internal endpoint”.

---

## 5) Logging: conserver une trace fidèle dans `chat_messages`

Vous avez déjà `chat_messages.metadata jsonb`. Recommandation:

### 5.1 Inbound user message
Insérer:
- `role='user'`
- `content=<texte whatsapp>`
- `metadata`:
  - `channel: "whatsapp"`
  - `wa_message_id`
  - `wa_from`
  - `wa_profile_name` (si disponible)
  - `raw_event_id` / `raw_payload_hash` (optionnel)

### 5.2 Outbound assistant message
Insérer:
- `role='assistant'`
- `content=<réponse Sophia>`
- `agent_used=<mode>`
- `metadata.channel="whatsapp"`
- `metadata.wa_outbound_message_id` (retourné par Graph API)

---

## 6) Envoi sortant via Cloud API (Graph)

Endpoint principal:
- `POST https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages`

Payload (message texte simple):

```json
{
  "messaging_product": "whatsapp",
  "to": "33612345678",
  "type": "text",
  "text": { "body": "Hello!" }
}
```

Headers:
- `Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>`
- `Content-Type: application/json`

Réponse contient typiquement:
- `messages[0].id` (id du message envoyé)

### 6.1 Fenêtre 24h (template vs free-form)
À implémenter avant la prod:
- Garder un “dernier inbound” par user (`last_whatsapp_inbound_at`), par exemple:
  - soit dans `profiles` (nouvelle colonne)
  - soit dans une table dédiée `whatsapp_conversations(user_id, last_inbound_at, last_outbound_at, last_template_at, ...)`
- Si `now - last_inbound_at > 24h` → envoyer un **template** (type `"template"` dans payload).

### 6.2 Throttle “proactif” (ta règle 2 / 10h)
Définition “proactif” (dans ton wording):
- C’est une **invitation** envoyée sans qu’il y ait eu de message utilisateur dans les **10 dernières heures**.

Implémentation recommandée:
- Stocker `profiles.whatsapp_last_inbound_at` (et idéalement `profiles.whatsapp_last_outbound_at`).
- Quand on s’apprête à envoyer un outbound:
  - Si `last_inbound_at` est `null` ou `now - last_inbound_at > 10h` → `is_proactive=true`
    - Compter les messages sortants proactifs (ex: via `chat_messages.metadata.is_proactive=true`) sur les 10 dernières heures.
    - Si `>= 2` → **on n’envoie pas**.
  - Sinon (`now - last_inbound_at <= 10h`) → `is_proactive=false` (conversation active) et on ne bride pas.

---

## 7) Step-by-step d’implémentation dans ce repo

### Étape 1 — Secrets
Ajouter (local: `supabase/.env`, prod: secrets Supabase):
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

### Étape 2 — Créer l’Edge Function `whatsapp-webhook`
Responsabilités:
- `GET` → vérification (`hub.challenge`)
- `POST` → verify signature + parser event + extraire message texte
- Normaliser `from` → lookup `profiles.phone_number`
- Log inbound dans `chat_messages` (metadata.channel="whatsapp")
- Appeler Sophia (via Option A “internal bridge”)
- Envoyer la réponse via Graph API
- Log outbound dans `chat_messages`

### Étape 3 — Créer l’Edge Function `sophia-brain-internal` (bridge)
Responsabilités:
- `ensureInternalRequest(req)` (x-internal-secret)
- Service role supabase client
- `processMessage(adminClient, userId, message, history, meta)`
- Retour `{ content, mode }`

### Étape 4 — Configurer Meta Webhooks
Dans l’écran WhatsApp → Webhooks:
- Callback URL: `https://<project>.functions.supabase.co/whatsapp-webhook`
- Verify token: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Subscriptions: `messages` (et éventuellement `message_template_status_update`).

### Étape 5 — Tester en local
Points importants:
- Meta ne peut pas appeler `localhost` directement. Pour un vrai test webhook, il faut une URL publique (ngrok) ou tester en staging.
- En “dev test”, commence par tester uniquement l’**envoi sortant** (Edge Function `whatsapp-send-test`) avec ton token.

### Étape 6 — Relier les check-ins proactifs à WhatsApp
Aujourd’hui `process-checkins` et `trigger-checkup` insèrent juste dans `chat_messages`.
À faire:
- Remplacer / compléter par un envoi WhatsApp:
  - construire le message
  - envoyer via Graph API au `profiles.phone_number`
  - logger dans `chat_messages` avec `metadata.channel="whatsapp"` + id outbound

### Étape 7 — Gérer la fenêtre 24h proprement
Avant prod, ajouter:
- stockage `last_whatsapp_inbound_at`
- fallback templates hors fenêtre 24h
- anti-spam (max 1 proactif/jour si vous gardez cette règle)

---

## 8) Checklist “prod”

- Webhook: signature `X-Hub-Signature-256` vérifiée.
- Phone normalization: tous les numéros en E.164.
- Déduplication: ignorer un message si `wa_message_id` déjà traité (idempotence).
- Timeout: si l’IA est lente, répondre d’abord “Je regarde ça…” puis envoyer la réponse ensuite (option “async” via job/queue).
- Observabilité: log `request_id`, `wa_message_id`, `user_id`.
- Sécurité: ne jamais exposer `WHATSAPP_ACCESS_TOKEN` côté frontend.

---

## 9) Questions (pour verrouiller l’implémentation)

1) Template opt-in: tu veux plutôt **Quick Reply buttons** (“Oui” / “Mauvais numéro”) ou des réponses texte ?
2) Tu valides qu’on **force E.164** à l’inscription (sinon impossible de router proprement) ?
3) Pour “Mauvais numéro”: on marque `profiles.phone_invalid=true` et on bloque tout envoi futur, OK ?

---

## 9bis) Mini state-machine WhatsApp (post opt-in)

Objectif: rendre le premier contact **vivant** et éviter les boucles / incompréhensions.

On stocke un état léger dans `profiles.whatsapp_state` (avec timestamp `profiles.whatsapp_state_updated_at`) pour intercepter certaines réponses **avant** d’appeler l’IA.

États utilisés:
- `awaiting_plan_finalization`: l’utilisateur a opt-in mais n’a pas de plan actif → on attend “C’est bon”.
- `awaiting_plan_motivation`: l’utilisateur a un plan actif → on attend une note 0–10.
- `awaiting_personal_fact`: on attend “1 chose que tu aimerais que je sache sur toi”.

Règle: dès que l’état est consommé, on le met à `null` et on repasse au flux normal (IA).

---

## 10) Inventaire recommandé des templates (à créer dès maintenant)

Pourquoi: WhatsApp impose un **template** hors fenêtre 24h. Donc pour chaque flux proactif, on crée:
- **1 template fallback** (validé par Meta)
- **1 message texte personnalisé** (utilisé quand la conversation est ouverte)

### A) Opt-in inscription (Marketing)
- **Nom**: `sophia_optin_v1` (ou `sophia_optin_v2` si tu itères)
- **Langue**: `fr` (ou `en_US` si tu as créé le template en “English” dans Meta)
- **Body**: `Hello {{1}}, c’est Sophia. Prêt pour devenir la meilleure version de toi-même ?`
- **Quick replies**: `Oui` / `Mauvais numéro`
- **Backend**: `whatsapp-optin` + webhook texte-match

### B) Bilan du soir (Utility recommandé)
- **Nom**: `sophia_bilan_v1` (ou `sophia_bilan_v2`)
- **Langue**: `fr` (ou `en_US`)
- **Body**: `Hey {{1}} 🙂 Prêt pour ton bilan du soir ? Une minute pas plus promis !`
- **Quick replies**: `Carrément!` / `Pas tout de suite`
- **Backend**: `trigger-daily-bilan` (template si pas encore opt-in), puis texte personnalisé si opt-in

### C) Scheduled check-in (Utility)
- **Nom**: `sophia_checkin_v1` (ou `sophia_checkin_v2`)
- **Langue**: `fr` (ou `en_US`)
- **Body**: `Hey {{1}} 🙂 Petit check-in rapide ?`
- **Quick replies**: `Oui` / `Plus tard`
- **Backend**: `process-checkins` envoie texte personnalisé si fenêtre ouverte, sinon template fallback (purpose=`scheduled_checkin`)

### D) Memory echo (Utility ou Marketing selon wording)
- **Nom**: `sophia_memory_echo_v1` (ou `sophia_memory_echo_v2`)
- **Langue**: `fr` (ou `en_US`)
- **Body**: `Hey {{1}} 🙂 Je repensais à un truc d’il y a quelque temps… ça te dit qu’on en parle ?`
- **Quick replies**: `Oui` / `Plus tard`
- **Backend**: `trigger-memory-echo` envoie texte personnalisé si fenêtre ouverte, sinon template fallback (purpose=`memory_echo`)



