### Objectif de ce document
Ce fichier sert de **mémo rapide** pour retrouver :
- **Les fonctionnalités “conversationnelles”** (empathie, félicitations, démarrage doux, fatigue après 23h…)
- **Les agents** (qui fait quoi / quand ils répondent)
- **Les triggers** (cron / WhatsApp / DB-webhooks)
- **Les tables & attributs** utilisés côté Supabase (et les RPC RAG)

Repo: `supabase/functions/*` (Edge Functions) + `supabase/functions/sophia-brain/*` (le “cerveau”).

---

### 0) Catalogue des Edge Functions (endpoints `/functions/v1/...`)

> Objectif: avoir **la liste des endpoints** en un seul endroit.  
> Convention: le nom du dossier = le nom de l’endpoint Supabase (`/functions/v1/<dossier>`).

- **`sophia-brain`** (`/functions/v1/sophia-brain`)
  - **Type**: Public (app/web)
  - **Auth**: `Authorization` (Supabase user)
  - **Rôle**: point d’entrée principal chat → `router.ts` (dispatcher + agents)
  - **Tables**: `chat_messages`, `user_chat_states` (+ lecture dashboard: `user_plans`, `user_actions`, `user_vital_signs`, `user_core_identity`)

- **`sophia-brain-internal`** (`/functions/v1/sophia-brain-internal`)
  - **Type**: Interne (ops, systèmes)
  - **Auth**: `X-Internal-Secret` (via `ensureInternalRequest`)
  - **Rôle**: appeler `processMessage` en **service role** pour un `user_id` donné (utile pour intégrations/ops)
  - **Tables**: `chat_messages`, `user_chat_states` (via router)

- **`whatsapp-webhook`** (`/functions/v1/whatsapp-webhook`)
  - **Type**: Webhook entrant (Meta)
  - **Auth**: signature `x-hub-signature-256` (HMAC)
  - **Rôle**: reçoit messages WhatsApp, log, opt-in, puis appelle `processMessage` et répond via Graph API
  - **Tables**: `profiles`, `chat_messages`

- **`whatsapp-send`** (`/functions/v1/whatsapp-send`)
  - **Type**: Interne (envoi sortant)
  - **Auth**: `X-Internal-Secret`
  - **Rôle**: envoie un message WhatsApp (text si fenêtre 24h, sinon template), throttle proactif, log outbound
  - **Tables**: `profiles`, `chat_messages`

- **`whatsapp-optin`** (`/functions/v1/whatsapp-optin`)
  - **Type**: Public (app/web)
  - **Auth**: `Authorization` (Supabase user)
  - **Rôle**: envoie un template d’opt-in WhatsApp (idempotent 24h), log + update profile
  - **Tables**: `profiles`, `chat_messages`

- **`trigger-checkup`** (`/functions/v1/trigger-checkup`)
  - **Type**: Automation/cron
  - **Auth**: service role (dans la function)
  - **Rôle**: insère une invitation “bilan” (matin/soir) dans `chat_messages` pour users avec plan actif
  - **Tables**: `user_plans`, `chat_messages`

- **`trigger-daily-bilan`** (`/functions/v1/trigger-daily-bilan`)
  - **Type**: Automation/cron (WhatsApp)
  - **Auth**: `X-Internal-Secret`
  - **Rôle**: envoie le “bilan quotidien WhatsApp” (template opt-in ou texte) via `whatsapp-send`
  - **Tables**: `profiles`, `user_plans`, `chat_messages` (via whatsapp-send)

- **`trigger-memory-echo`** (`/functions/v1/trigger-memory-echo`)
  - **Type**: Automation/cron
  - **Auth**: `X-Internal-Secret`
  - **Rôle**: renvoie un “écho” d’un élément ancien (plan complété / anciens messages) via WhatsApp ou fallback in-app
  - **Tables**: `chat_messages`, `user_plans`, `profiles`

- **`detect-future-events`** (`/functions/v1/detect-future-events`)
  - **Type**: Automation/cron
  - **Auth**: `X-Internal-Secret`
  - **Rôle**: détecte des événements futurs dans les conversations récentes et planifie des checkins
  - **Tables**: `chat_messages` (lecture), `scheduled_checkins` (écriture)

- **`process-checkins`** (`/functions/v1/process-checkins`)
  - **Type**: Automation/cron
  - **Auth**: `X-Internal-Secret`
  - **Rôle**: envoie les checkins dus (`scheduled_checkins`) via WhatsApp, sinon log in-app, puis marque “sent”
  - **Tables**: `scheduled_checkins`, `chat_messages`

- **`break-down-action`** (`/functions/v1/break-down-action`)
  - **Type**: Interne (appelé par `investigator`)
  - **Auth**: service role (dans la function)
  - **Rôle**: génère une micro-étape (Gemini) pour débloquer une action
  - **Tables**: lecture éventuelle `user_answers` (si submissionId)

- **`generate-plan`** (`/functions/v1/generate-plan`)
  - **Type**: Public (app/web)
  - **Auth**: (historique: bypass debug dans le code actuel)
  - **Rôle**: génère ou “refine” un plan (JSON complet) via Gemini
  - **Tables**: (principalement stateless côté function; la persistance se fait côté app/DB)

- **`summarize-context`** (`/functions/v1/summarize-context`)
  - **Type**: Public (app/web)
  - **Auth**: service role (dans la function)
  - **Rôle**: résume un axe (questionnaire) en 3–4 phrases “miroir” avant plan d’action
  - **Tables**: aucune (stateless)

- **`sort-priorities`** (`/functions/v1/sort-priorities`)
  - **Type**: Public (app/web)
  - **Auth**: service role (dans la function)
  - **Rôle**: ordonne les axes (foundation/lever/optimization) via Gemini
  - **Tables**: aucune (stateless)

- **`generate-feedback`** (`/functions/v1/generate-feedback`)
  - **Type**: Public (app/web)
  - **Auth**: service role (dans la function)
  - **Rôle**: feedback post “Table Ronde” hebdo (JSON: feedback/insight/tip)
  - **Tables**: aucune (stateless)

- **`complete-module`** (`/functions/v1/complete-module`)
  - **Type**: Public (app/web)
  - **Auth**: `Authorization` (Supabase user)
  - **Rôle**: marque un module complété, unlock la suite; peut aussi créer une micro-mémoire (Forge)
  - **Tables**: `user_week_states` / `user_module_state_entries`, `memories` (+ tables d’unlock)

- **`create-module-memory`** (`/functions/v1/create-module-memory`)
  - **Type**: DB webhook trigger (payload `record`)
  - **Auth**: service role (dans la function)
  - **Rôle**: crée/refresh une mémoire vectorielle à partir d’une réponse de module (Forge)
  - **Tables**: `memories`

- **`create-round-table-summary`** (`/functions/v1/create-round-table-summary`)
  - **Type**: DB webhook trigger (payload `record`)
  - **Auth**: service role (dans la function)
  - **Rôle**: résumé hebdo très court → `memories` (source_type `weekly_review`)
  - **Tables**: `memories`

- **`update-core-identity`** (`/functions/v1/update-core-identity`)
  - **Type**: DB webhook trigger (payload `record` + `table`)
  - **Auth**: service role (dans la function)
  - **Rôle**: calcule/maj “identité profonde” semaine N + archive version précédente
  - **Tables**: `user_module_state_entries`, `user_week_states`, `user_core_identity`, `user_core_identity_archive`

- **`archive-plan`** (`/functions/v1/archive-plan`)
  - **Type**: DB webhook trigger (payload `record`/`old_record`)
  - **Auth**: service role (dans la function)
  - **Rôle**: à la complétion d’un plan, génère un “récit de cycle” RAG-ready et le stocke dans `memories`
  - **Tables**: `user_plans`, `user_actions`, `user_vital_sign_entries`, `user_framework_entries`, `user_goals`, `user_answers`, `memories`

- **`apply-prompt-override-suggestion`** (`/functions/v1/apply-prompt-override-suggestion`)
  - **Type**: Admin
  - **Auth**: `Authorization` + gate `internal_admins`
  - **Rôle**: applique une suggestion de prompt override (append/replace)
  - **Tables**: `prompt_override_suggestions`, `prompt_overrides`, `internal_admins`

- **`eval-judge`**, **`run-evals`**, **`simulate-user`**
  - **Type**: tooling / évaluation (dev)
  - **Rôle**: fonctions de test/éval/simulation (non critiques produit)

---

### 1) Fonctionnalités conversationnelles (celles dont on a parlé)

- **(1) Empathie si l’utilisateur loupe plusieurs jours d’affilée une action**
  - **Où**: `supabase/functions/sophia-brain/agents/investigator.ts`
  - **Principe**: calcul d’un streak de “missed” consécutifs sur la même action (basé sur `user_action_entries`).
  - **Règle actuelle**: déclencheur à partir de **5 jours “missed” d’affilée** → proposition de “micro-étape (2 minutes)” (flow “breakdown”).
  - **Tables**: `user_action_entries` (+ peut créer dans `user_actions` / `user_plans` via micro-étape).
  - **Endpoint lié**: `supabase/functions/break-down-action` (génère une micro-étape).

- **(2) Féliciter l’utilisateur s’il a réussi 3 jours d’affilée (dans l’Enquêteur)**
  - **Où**: `supabase/functions/sophia-brain/agents/investigator.ts`
  - **Principe**: après validation d’une action (status `completed`), calcul d’un streak de `completed` consécutifs.
  - **Règle**: si **≥ 3 jours d’affilée**, l’Enquêteur félicite **avant** de poser la question suivante.
  - **Tables**: `user_action_entries` (source du streak).

- **(3) “Démarrage de bilan” personnalisé, pas froid (basé sur la veille)**
  - **Où**: `supabase/functions/sophia-brain/agents/investigator.ts`
  - **Principe**: au tout début du checkup, l’Enquêteur charge un mini résumé de la veille :
    - nb d’actions validées/ratées
    - dernier “win” repéré
    - blocage dominant (ex: fatigue / temps / oubli) basé sur les notes
  - **Effet**: intro courte + transition vers la 1ère question du bilan.
  - **Tables**: `user_action_entries`

- **(4) Après 23h + signes de fatigue → couper intelligemment + bonne nuit**
  - **Où**:
    - `supabase/functions/sophia-brain/agents/companion.ts`
    - `supabase/functions/sophia-brain/agents/architect.ts`
  - **Principe**:
    - Le `router` injecte déjà un repère temporel “heure Paris” dans le **contexte** (pour `companion/architect/firefighter`).
    - Les prompts `companion`/`architect` contiennent maintenant une **règle prioritaire**:
      - si **≥ 23h** ET signaux de fatigue (“KO”, “crevé”, “sommeil”, “on fait court”…),
      - alors: réponse courte, proposition de couper, micro-gestes simples, et **exception autorisée** pour dire “bonne nuit”.
  - **Tables**: aucune écriture spécifique (c’est du comportement prompt).

---

### 2) Sophia Brain (agents + routing)

#### 2.1 Endpoint principal
- **Edge Function**: `supabase/functions/sophia-brain/index.ts`
  - **Rôle**: point d’entrée chat web/app.
  - **Auth**: requiert `Authorization` (Supabase user).
  - **Appelle**: `processMessage()` dans `supabase/functions/sophia-brain/router.ts`.

#### 2.2 Router / Dispatcher (chef d’orchestre)
- **Fichier**: `supabase/functions/sophia-brain/router.ts`
  - **Rôle**: choisit quel agent répond (**dispatcher**), gère:
    - l’état conversationnel (`user_chat_states`)
    - le “watcher” (pipeline mémoire toutes les ~15 interactions)
    - l’injection de contexte (Dashboard + Identité + Repères temporels) pour `companion/architect/firefighter`
  - **Table(s)**:
    - `user_chat_states` (lecture/écriture)
    - `chat_messages` (log user/assistant)
    - `user_plans`, `user_actions`, `user_vital_signs`, `user_core_identity` (lecture pour contexte)
  - **Règle importante**: si un checkup est en cours (`investigation_state` non null), on reste sur `investigator` sauf “stop explicite”.

#### 2.3 État (attributs) du chat
- **Fichier**: `supabase/functions/sophia-brain/state-manager.ts`
- **Table**: `user_chat_states`
- **Champs importants** (utilisés directement par le router/agents) :
  - **`current_mode`**: dernier mode/agent utilisé (`companion`, `architect`, etc.)
  - **`risk_level`**: 0–10 (sert à router vers `sentry`/`firefighter`)
  - **`investigation_state`**: JSON (state machine de l’Enquêteur: items restants, index courant, temp_memory, etc.)
  - **`short_term_context`**: “fil rouge” mis à jour par le `watcher`
  - **`unprocessed_msg_count`** / **`last_processed_at`**: contrôle du batch watcher

---

### 3) Les agents (qui fait quoi)

> Tous les agents ont un mécanisme de “prompt override” possible via la table `prompt_overrides` (voir §6).

- **`investigator`** — Bilan / tracking quotidien
  - **Fichier**: `supabase/functions/sophia-brain/agents/investigator.ts`
  - **Déclenchement**:
    - intents “bilan/checkup”
    - ou checkup déjà en cours (`investigation_state`)
  - **Actions principales**:
    - demander item par item (actions, vitaux, frameworks)
    - écrire dans les logs (tool `log_action_execution`)
    - empathie + déblocage si ratés répétés (streak missed ≥ 5 → micro-étape)
    - féliciter si streak completed ≥ 3
    - intro douce basée sur la veille (au démarrage)
  - **Tables**:
    - lecture/écriture: `user_action_entries`, `user_vital_sign_entries`, `user_framework_entries`
    - lecture/écriture agrégats: `user_actions`, `user_vital_signs`, `user_framework_tracking`
    - lecture/écriture state via router: `user_chat_states`

- **`companion`** — discussion “partenaire de vie”
  - **Fichier**: `supabase/functions/sophia-brain/agents/companion.ts`
  - **Déclenchement**: mode par défaut (hors bilan/urgent/tech)
  - **Spécificités**:
    - peut “tracker” des actions quand l’utilisateur dit “j’ai fait / j’ai raté” (`track_progress`)
    - si un checkup est en cours, doit ramener vers l’Enquêteur
    - règle “après 23h + fatigue” → coupe + bonne nuit intelligente
  - **Tables**: `user_actions`, `user_action_entries`, `user_vital_signs`, `user_vital_sign_entries`, `chat_messages`

- **`architect`** — création/modif du plan, deep work, outils
  - **Fichier**: `supabase/functions/sophia-brain/agents/architect.ts`
  - **Déclenchement**: demandes de création/modif d’action/framework + exercices de fond
  - **Spécificités**:
    - outils: `create_simple_action`, `create_framework`, `update_action_structure`, `track_progress`
    - règle “après 23h + fatigue” → “minimum utile” + coupe / reprise demain
  - **Tables**: `user_plans`, `user_actions`, `user_action_entries`, `user_framework_tracking`, `chat_messages`

- **`firefighter`** — urgence émotionnelle
  - **Fichier**: `supabase/functions/sophia-brain/agents/firefighter.ts`
  - **Déclenchement**: stress/angoisse/craving détecté par dispatcher (risk élevé mais pas “danger vital”)
  - **Sortie**: JSON { response, resolved } → si résolu, le router repasse en `companion`

- **`sentry`** — danger vital
  - **Fichier**: `supabase/functions/sophia-brain/agents/sentry.ts`
  - **Déclenchement**: suicide / automutilation / danger immédiat
  - **Sortie**: message fixe (pas d’IA)

- **`assistant`** — support technique
  - **Fichier**: `supabase/functions/sophia-brain/agents/assistant.ts`
  - **Déclenchement**: problèmes techniques de l’app

- **`watcher`** — mémoire & contexte long/short terme (batch)
  - **Fichier**: `supabase/functions/sophia-brain/agents/watcher.ts`
  - **Déclenchement**: toutes les ~15 interactions (piloté par `router.ts`)
  - **Actions**:
    - extrait des “insights” (pépites) → `memories`
    - archive narrativement le bloc → `memories`
    - met à jour `user_chat_states.short_term_context`

---

### 4) WhatsApp (pipeline complet)

- **Envoi générique**: `supabase/functions/whatsapp-send/index.ts`
  - **Auth**: `ensureInternalRequest` via header `X-Internal-Secret`
  - **Rôle**:
    - envoie via Meta Graph API (text si fenêtre 24h, sinon template)
    - throttle proactif (max 2 messages proactifs / 10h)
    - loggue l’outbound dans `chat_messages.metadata` (channel=whatsapp, is_proactive, purpose…)
    - update `profiles.whatsapp_last_outbound_at`
  - **Tables**: `profiles`, `chat_messages`

- **Réception webhook**: `supabase/functions/whatsapp-webhook/index.ts`
  - **Rôle**:
    - handshake + vérification signature `x-hub-signature-256`
    - parse inbound (text / interactive)
    - retrouve le user par `profiles.phone_number`
    - idempotency via `chat_messages.metadata.wa_message_id`
    - update `profiles` (opt-in, timestamps)
    - route certains boutons (opt-in, daily bilan) sans appeler le brain
    - sinon: appelle `processMessage` (router) et répond sur WhatsApp
  - **Tables**: `profiles`, `chat_messages`

- **Opt-in depuis l’app**: `supabase/functions/whatsapp-optin/index.ts`
  - **Auth**: user supabase
  - **Rôle**: envoie un template opt-in (idempotent 24h), log outbound, update `profiles.whatsapp_optin_sent_at`
  - **Tables**: `profiles`, `chat_messages`

---

### 5) Triggers / Cron / Automations (Edge Functions)

#### 5.1 “Bilan” (in-app) automatique
- **`supabase/functions/trigger-checkup/index.ts`**  / Pour les tests normalement 
  - **Appel typique**: cron (pg_cron / scheduler)
  - **Rôle**: insère un message “matin/soir” dans `chat_messages` pour tous les users avec plan actif.
  - **Tables**: `user_plans` (lecture), `chat_messages` (écriture)

#### 5.2 “Bilan quotidien WhatsApp”
- **`supabase/functions/trigger-daily-bilan/index.ts`**
  - **Auth**: internal (`ensureInternalRequest`)
  - **Rôle**:
    - cible `profiles` opt-in + phone ok
    - filtre sur users avec plan actif
    - si `profiles.whatsapp_bilan_opted_in` false → envoie template “opt-in bilan”
    - sinon envoie texte “2 questions”
    - envoie via `whatsapp-send`
  - **Tables**: `profiles`, `user_plans`, `chat_messages` (via whatsapp-send)

#### 5.3 “Memory echo” (réactivation d’un souvenir ancien)
- **`supabase/functions/trigger-memory-echo/index.ts`**
  - **Auth**: internal
  - **Rôle**:
    - cible users actifs récemment
    - cooldown en vérifiant `chat_messages.metadata.source='memory_echo'`
    - stratégie 1: plan complété il y a 1–6 mois
    - stratégie 2: messages users anciens (30–180 jours)
    - génère un message via Gemini, envoie WhatsApp (ou fallback chat_messages)
  - **Tables**: `chat_messages`, `user_plans`, `profiles`

#### 5.4 Détection d’événements futurs → checkins planifiés
- **`supabase/functions/detect-future-events/index.ts`**
  - **Auth**: internal
  - **Rôle**:
    - analyse l’historique des 48h, détecte “événements futurs”
    - planifie des checkins en écrivant dans `scheduled_checkins` (upsert idempotent)
  - **Tables**: `chat_messages` (lecture), `scheduled_checkins` (écriture)

#### 5.5 Envoi des checkins planifiés
- **`supabase/functions/process-checkins/index.ts`**
  - **Auth**: internal
  - **Rôle**:
    - récupère les checkins dus (`scheduled_checkins` pending + scheduled_for <= now)
    - tente WhatsApp via `whatsapp-send`, sinon fallback `chat_messages`
    - marque `scheduled_checkins` comme sent
  - **Tables**: `scheduled_checkins`, `chat_messages`

---

### 6) Mémoire, identité, archivage (DB-trigger style payload)

Ces fonctions attendent typiquement un payload de type `payload.record` / `payload.old_record` / `payload.type` (format webhook DB).

- **Micro-souvenir module**: `supabase/functions/create-module-memory/index.ts`
  - **Rôle**: résume une réponse d’un module (Forge) → vecteur → store dans `memories` (type `insight`)
  - **Tables**: `memories`
  - **Note**: archive l’insight précédent (type devient `history`) pour le même `source_id`

- **Identité profonde**: `supabase/functions/update-core-identity/index.ts`
  - **Rôle**:
    - reconstruit un transcript semaine N (`user_module_state_entries` aN_*)
    - génère/maj `user_core_identity`
    - archive l’ancienne version dans `user_core_identity_archive`
  - **Tables**: `user_module_state_entries`, `user_week_states`, `user_core_identity`, `user_core_identity_archive`

- **Résumé Table Ronde**: `supabase/functions/create-round-table-summary/index.ts`
  - **Rôle**: crée une mémoire “weekly_review” dans `memories` à partir d’un bilan hebdo.
  - **Tables**: `memories`

- **Archivage de plan**: `supabase/functions/archive-plan/index.ts`
  - **Rôle**:
    - déclenche quand `user_plans.status` passe à `completed/archived`
    - compile questionnaire + vitaux + actions + frameworks
    - génère un récit “RAG-ready” et l’enregistre dans `memories` (type `insight`, source_type `plan`)
  - **Tables**: `user_plans`, `user_actions`, `user_vital_sign_entries`, `user_framework_entries`, `user_goals`, `user_answers`, `memories`

---

### 7) Prompt overrides (admin)

- **Runtime**: `_shared/prompt-overrides.ts`
  - **Table**: `prompt_overrides` (`prompt_key`, `enabled`, `addendum`, `updated_at`, `updated_by`…)
  - **Effet**: permet d’ajouter un addendum de prompt dynamiquement (ex: `sophia.investigator`, `sophia.companion`, etc.)

- **Apply suggestion**: `supabase/functions/apply-prompt-override-suggestion/index.ts`
  - **Tables**: `prompt_override_suggestions`, `prompt_overrides`, `internal_admins`
  - **Rôle**: endpoint admin pour approuver/appliquer une suggestion (append/replace).

---

### 8) RAG: RPC utilisés

- **`match_memories`**: retrieval de souvenirs (table `memories`) via embedding.
- **`match_action_entries`**: retrieval d’entrées d’action similaires (par action).
- **`match_all_action_entries`**: retrieval global sur historique actions.

Ces RPC sont utilisés principalement dans `companion.ts` (retrieveContext) et `investigator.ts` (insights item).

---

### 9) Tables importantes (mémo)

- **`chat_messages`**: log conversation + metadata (WhatsApp, sources, idempotency).
- **`user_chat_states`**: état conversationnel (mode, risk, investigation_state, short_term_context…).
- **`profiles`**: téléphone, opt-in WhatsApp, timestamps inbound/outbound, flags (phone_invalid).
- **`user_plans`**: plan actif + contenu JSON + status + deep_why + inputs_*.
- **`user_actions`** / **`user_action_entries`**: agrégat + historique (base des streaks).
- **`user_vital_signs`** / **`user_vital_sign_entries`**: vitaux (KPI) + historique.
- **`user_framework_tracking`** / **`user_framework_entries`**: frameworks (exercices) + historique.
- **`memories`**: mémoire vectorielle (insights + history + chat_history) utilisée par RAG.
- **`user_core_identity`** / **`user_core_identity_archive`**: identité profonde synthétisée.
- **`scheduled_checkins`**: checkins futurs détectés (detect-future-events → process-checkins).
- **`prompt_overrides`** / **`prompt_override_suggestions`** / **`internal_admins`**: gouvernance des prompts.


