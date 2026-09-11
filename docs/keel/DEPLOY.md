# KEEL — DEPLOY

> **Ce document est une séquence, pas une checklist.** L'ordre est la moitié du contenu :
> une migration appliquée avant que le secret Vault existe programme des crons qui ne font rien,
> et un `functions deploy` global avant la révocation des ACL expose une URL publique écrivable.
>
> **Autorité** : [CONTRACT.md](CONTRACT.md) · [EXECUTION_LOG.md](EXECUTION_LOG.md) ·
> [MEGA_REVIEW.md](MEGA_REVIEW.md). Incidents et diagnostics : [RUNBOOK.md](RUNBOOK.md).
> Disclaimers, consentement, DPA : [LEGAL.md](LEGAL.md).
>
> **🔒 GATE HUMAIN** marque une commande qu'**aucun agent ne peut lancer** : le hook
> `.claude/hooks/block-risky-commands.sh` les intercepte (voir [AGENTS.md](../../AGENTS.md)).
> Ces commandes se copient-collent, elles ne se délèguent pas.

---

## 0. Pré-vol — à faire AVANT de toucher au distant

Tout ce bloc tourne en local et n'a aucun effet distant. Si une seule ligne est rouge, on ne
déploie pas : les défauts qu'elle attrape coûtent tous plus cher en production qu'ici.

```bash
npm run ci:keel                              # token-lint + wiring-check
node scripts/ci/deploy-manifest-check.mjs    # manifeste + config.toml + contrats de cron
npx tsc --noEmit -p frontend/tsconfig.app.json
npm --prefix frontend run test -- --run      # vitest
deno test -A --no-check=remote supabase/functions
```

Attendu au 27/07 : `deno test` 2447/0 · vitest 60/0 · tsc 0 · token-lint OK · wiring-check OK.
`deploy-manifest-check` imprime ses **PENDING** (dettes visibles, pas silencieuses) : lis-les,
ce sont des gates de ce document.

Puis, en local, la chaîne réelle — pas la présence des lignes en base, **la réponse HTTP** :

```bash
./scripts/local_reset.sh
./scripts/local_sync_internal_secret.sh

# supabase/.env, JAMAIS le .env de la racine (RUNBOOK I-6)
ANON=$(grep '^SUPABASE_ANON_KEY=' supabase/.env | cut -d= -f2-)
INTERNAL_SECRET=$(grep '^INTERNAL_FUNCTION_SECRET=' supabase/.env | cut -d= -f2-)

# provision / balayage, avec le corps EXACT que le cron enverra
for body in '{"mode":"provision"}' '{"mode":"sweep"}'; do
  curl -s -o /dev/null -w "$body -> %{http_code}\n" \
    -X POST "http://127.0.0.1:54321/functions/v1/provision-day-v1" \
    -H "content-type: application/json" -H "apikey: $ANON" \
    -H "authorization: Bearer $ANON" -H "x-internal-secret: $INTERNAL_SECRET" -d "$body"
done
# évaluation, corps EXACT du cron keel-evaluate-adherence
curl -s -o /dev/null -w "evaluate -> %{http_code}\n" \
  -X POST "http://127.0.0.1:54321/functions/v1/evaluate-adherence-v1" \
  -H "content-type: application/json" -H "apikey: $ANON" \
  -H "authorization: Bearer $ANON" -H "x-internal-secret: $INTERNAL_SECRET" -d '{"mode":"due"}'
```

Mesuré le 27/07 : `provision -> 200` · `sweep -> 200` · **`evaluate -> 400`**.

> ⚠️ **Au 27/07 la troisième ligne rend `400 user_id is required`** (mesuré, pas déduit).
> Le cron `keel-evaluate-adherence` existe, tourne à `45 * * * *`, et `cron.job_run_details`
> affiche `succeeded` — parce que pg_net rend un *request id*, jamais un statut HTTP.
> Voir **RUNBOOK § I-1**. **Ne pas déployer avant que cette ligne rende 200** : sans elle, chaque
> élève conforme est noté `missed` à 23:55 et le produit ment dans le sens le plus grave.

---

## 1. Ordre de déploiement (vue d'ensemble)

```
1. Projet + auth + buckets        (console Supabase)
2. Secrets Edge Functions         🔒 GATE HUMAIN
3. Secret Vault INTERNAL_FUNCTION_SECRET  🔒 GATE HUMAIN  ← AVANT les migrations
4. Migrations                     🔒 GATE HUMAIN
5. app_config (3 lignes)          🔒 GATE HUMAIN         ← les crons sont inertes sans ça
6. llm_pricing                    🔒 GATE HUMAIN         ← sinon coût = 0 partout
7. Edge Functions                 🔒 GATE HUMAIN
8. Vérification post-migration : ACL, crons, RLS
9. Vercel (frontend)
10. Meta / WhatsApp (templates + webhook)
11. Fumée de bout en bout, avec un vrai coach et un vrai élève
```

**Pourquoi 3 avant 4** : les migrations de crons lisent le secret Vault **à l'exécution du job**,
pas à la migration — mais la ligne `where internal_secret <> ''` fait que le job **ne poste rien**
tant que le secret est absent. Le job est alors « actif », `succeeded`, et totalement inerte.
C'est le mode d'échec le plus coûteux du dépôt parce qu'il ne produit **aucun signal**.

---

## 2. Projet, auth, buckets

Console Supabase, projet neuf. Note le `<PROJECT_REF>`.

- **Auth → URL Configuration** : `Site URL` = l'URL Vercel de production.
  `Redirect URLs` : ajouter l'URL Vercel **et** les URLs de preview si tu les utilises.
  Sans ça, le lien d'invitation `/join?token=…` renvoie l'élève sur `localhost`.
- **Auth → Providers → Email** : `Confirm email` **ON** en production (il est à `false` en local).
- **Auth → Rate limits** : le défaut suffit pour un pilote.
- **Buckets** : rien à faire à la main. `20260727130000_keel_storage.sql` crée
  `plan-documents` et `meal-photos`, **tous deux `public=false`**. Vérifié après migration :

```sql
select id, public from storage.buckets where id in ('plan-documents','meal-photos');
-- attendu: 2 lignes, public = false. Un `true` ici = les photos de repas d'un élève
-- sont lisibles par URL devinable. C'est un arrêt de déploiement.
```

Il n'existe **aucune policy `storage.objects`** — arbitrage W1.4 R3 assumé : tout accès fichier
passe par une edge function en `service_role`, avec `createSignedUrl` (TTL 15 min).

---

## 3. Secrets Edge Functions 🔒 GATE HUMAIN

> ⚠️ Un `supabase secrets set --env-file` a déjà **écrasé tous les secrets staging** par des
> valeurs de dev dans ce dépôt (AGENTS.md). Pose les secrets **un par un**, ou relis le fichier
> ligne à ligne avant de l'envoyer.

**Noms uniquement — aucune valeur n'a sa place dans ce fichier, ni dans git.**

### Obligatoires (le produit ne fonctionne pas sans)

| Secret | À quoi ça sert | Symptôme si absent |
|---|---|---|
| `INTERNAL_FUNCTION_SECRET` | authentifie cron/trigger → edge function | tous les crons 403 |
| `GEMINI_API_KEY` | import de plan, chat, vision photo | import 500, photo muette |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | injectés par la plateforme | — |
| `APP_BASE_URL` | liens dans les e-mails (invitation, restauration) | liens vers `localhost` |
| `RESEND_API_KEY` + `SENDER_EMAIL` | e-mail d'invitation coach → élève | l'élève ne reçoit rien |
| `CORS_ALLOWED_ORIGINS` | origine Vercel de prod | appels front bloqués |

### WhatsApp (obligatoires si le tracking WhatsApp est allumé — c'est la thèse du produit)

`WHATSAPP_ACCESS_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` · `WHATSAPP_APP_SECRET` ·
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` · `WHATSAPP_DELIVERY_ENABLED`

Templates (voir § 10 pour ce qu'il faut faire approuver) :
`WHATSAPP_KEEL_REMINDER_TEMPLATE_NAME` / `_LANG` — **pose-les explicitement**. Sans eux,
`keel_slot_reminder` et `keel_sunday_digest` retombent sur `WHATSAPP_CHECKIN_TEMPLATE_NAME`,
puis sur `sophia_checkin_v1`, puis — si ce nom n'est pas approuvé côté Meta — sur
`global_reach_template` (« J'ai une info pour toi 😊 », en français). C'est **exactement**
l'incident du 12/07 : un mapping manquant plus un secret non posé ont envoyé trois fois la
relance générique à la place du bilan.

### À NE PAS poser (et pourquoi)

- `WHATSAPP_WEB_SIMULATION_ENABLED` — le simulateur web. Absent = les deux fonctions `sim` sont
  inertes, ce qui est l'état voulu (elles ne sont pas déployées, § 7).
- `MEGA_TEST_MODE` — **jamais en production**. `stripe-webhook` **saute la vérification de
  signature** quand il est actif (`stripe-webhook/index.ts:267`).
- `SOPHIA_LLM_RAW_TRACE_ENABLED` — stocke les réponses LLM brutes, donc du texte élève, dans
  `llm_raw_response_events`. Debug contrôlé uniquement, jamais par défaut (RGPD, LEGAL § 4).
- `SOPHIA_TESTER_MAGIC_RESET_ENABLED`.

### Optionnels, avec un défaut sain

`KEEL_VISION_MODEL` (défaut `gemini-3.1-pro-preview`) · `GEMINI_FALLBACK_MODEL` ·
`STRIPE_*` (legacy B2C, voir § 7).

---

## 4. Secret Vault 🔒 GATE HUMAIN — **avant** les migrations

Les jobs pg_cron lisent `vault.decrypted_secrets` pour signer leurs appels internes. La **même**
valeur que le secret Edge Function `INTERNAL_FUNCTION_SECRET`, sinon les crons partent en 403.

Modèle : `scripts/seed_vault_internal_secret.sql.template`. Copie-le hors git, remplace le
placeholder, exécute-le dans le SQL Editor du projet.

```sql
-- vérification (ne JAMAIS imprimer decrypted_secret)
select name, created_at from vault.secrets where name = 'INTERNAL_FUNCTION_SECRET';
-- attendu: 1 ligne
```

---

## 5. Migrations 🔒 GATE HUMAIN

```bash
# 🔒 GATE HUMAIN — interdit aux agents
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push --linked
```

44 fichiers dans `supabase/migrations/`, appliqués dans l'ordre lexicographique des timestamps.
Les 14 migrations KEEL (`2026072709…` → `2026072722…`) supposent le socle Sophia squashé
(`20260522143735_squashed_schema.sql`) : **ne pousse jamais un sous-ensemble**.

Points de rupture connus, dans l'ordre où ils tombent :

| Migration | Ce qu'elle fait qui peut casser |
|---|---|
| `20260727090000_keel_p0_commitments` | 16 tables + les CHECK de vocabulaire. Échoue si une extension manque (`pgcrypto`, `pg_net`, `pg_cron`) |
| `20260727120000_keel_tenancy` | 8 policies Tier A + 2 vues Tier B. **Après application, va au § 8** |
| `20260727140000` / `160000` / `175000` / `210000` | programment 5 crons. **Silencieusement inertes** tant que § 4 et § 6 ne sont pas faits |
| `20260727175000_keel_provisioning` | contient un `do $$ … raise exception` qui **échoue bruyamment** si `keel-provision-day` n'est pas à `0 * * * *` et `keel-sweep-day` à `55 * * * *`. C'est voulu |
| `20260727210000_keel_review_blockers` | révoque les 3 ACL de la MEGA REVIEW (B2, B3) et programme `keel-evaluate-adherence` |

**`db push` n'exécute pas `supabase/seed.sql`.** Le seed n'est joué que par `db reset` en local.
Tout ce que le seed contient — `app_config`, `llm_pricing` — est à faire à la main : § 6.

---

## 6. Configuration runtime 🔒 GATE HUMAIN — la seule étape sans message d'erreur

### 6.1 `app_config` — 3 lignes, sans lesquelles **aucun cron ne poste rien**

Modèle : `scripts/seed_app_config_env.sql.template`.

```sql
insert into public.app_config (key, value) values
  ('supabase_project_ref',    '<PROJECT_REF>'),
  ('edge_functions_base_url', 'https://<PROJECT_REF>.supabase.co'),
  ('edge_functions_anon_key', '<ANON_KEY>')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Un trigger du socle refuse un `edge_functions_base_url` qui ne correspond pas à
`supabase_project_ref` : c'est la ceinture anti-appel-croisé entre projets. Elle mord à
l'écriture, pas au déploiement — donc écris ces trois lignes **dans la même transaction**.

`disable_write_gate` : **ne le pose pas** en production (il n'existe que pour le local).

### 6.2 `llm_pricing` — sinon le coût est **zéro partout**, en silence

`seed.sql` liste 10 modèles ; il n'est **pas** joué par `db push`. Sur un projet neuf la table
est vide → chaque appel s'écrit avec `cost_usd = 0` et `cost_unpriced = true`, et le tableau de
coût par élève affiche 0 $ pour toujours. Aucune erreur nulle part : `logLlmUsageEvent` est un
`try { … } catch {}` intégral (`_shared/llm-usage.ts:207`) — la télémétrie ne casse jamais un
tour, donc elle ne prévient jamais non plus.

Insère au minimum les modèles réellement appelés, **dont celui de la vision** :

```sql
insert into public.llm_pricing
  (provider, model, input_per_1k_tokens_usd, output_per_1k_tokens_usd, currency, pricing_version, is_active)
values
  ('gemini','gemini-3.1-pro-preview',  0.002,   0.012,  'USD','v1',true),  -- vision photo
  ('gemini','gemini-3-pro-preview',    0.002,   0.012,  'USD','v1',true),
  ('gemini','gemini-3-flash-preview',  0.0005,  0.003,  'USD','v1',true),
  ('gemini','gemini-2.5-flash',        0.0003,  0.0025, 'USD','v1',true),
  ('gemini','text-embedding-004',      0.000025,0,      'USD','v1',true)
on conflict (provider, model) do update set
  input_per_1k_tokens_usd = excluded.input_per_1k_tokens_usd,
  output_per_1k_tokens_usd = excluded.output_per_1k_tokens_usd,
  is_active = excluded.is_active, updated_at = now();
```

> Les prix ci-dessus sont ceux du `seed.sql` du dépôt (dont un mesuré : ~$0,011/photo sur
> 3 appels réels, EXECUTION_LOG D6). **Revérifie-les chez le fournisseur avant le pilote** — un
> prix périmé ne produit pas une erreur, il produit un chiffre faux.

Vérification immédiate (§ 12 pour le suivi continu) :

```sql
select provider, model, count(*), sum(cost_usd)
from public.llm_usage_events
where created_at > now() - interval '1 hour' and cost_unpriced
group by 1,2;
-- attendu après le premier trafic: 0 ligne. Toute ligne ici = un modèle non tarifé.
```

---

## 7. Edge Functions 🔒 GATE HUMAIN

### La règle qui coûte le plus cher

```bash
# ❌ JAMAIS
npx supabase functions deploy --no-verify-jwt
```

`--no-verify-jwt` est **global** : il désarme la vérification de la gateway sur **toutes** les
fonctions, y compris `sophia-brain` que le navigateur appelle avec le JWT de l'utilisateur. Les
exemples de `scripts/deploy-changed-functions.mjs --help` le montrent — ils datent d'avant
`config.toml`. Chaque fonction qui a besoin du réglage le porte déjà dans
`supabase/config.toml`, et le CLI le lit au déploiement.

> ⚠️ Un `supabase/functions/<nom>/config.toml` **n'est PAS lu par le CLI** (vérifié 27/07).
> `supabase/config.toml` à la racine du dossier `supabase/` est le seul endroit qui compte.

### Commande

```bash
# 🔒 GATE HUMAIN
npx supabase functions deploy <nom> --project-ref <PROJECT_REF>   # une par une, ou :
npm run functions:deploy:bootstrap                                 # premier déploiement global
npm run functions:deploy:changed                                   # ensuite, par diff de hash
```

`deploy-changed-functions.mjs` compare un hash de source à un manifeste
(`supabase/.temp/functions-deploy-manifests`). Après un premier déploiement fait à la main,
lance `npm run functions:deploy:mark-current` pour aligner le manifeste, sinon la première passe
« changed » redéploie tout.

### Liste EXACTE — ce qui part

Lue et vérifiée sur le disque (`index.ts` présent). `deploy-manifest-check.mjs` échoue si cette
liste diverge du disque : c'est sa raison d'être — une fonction nouvelle est **déclarée**, jamais
déployée par défaut.

Pour la resynchroniser après une vague :

```bash
for d in supabase/functions/*/; do n=$(basename "$d"); [ -f "$d/index.ts" ] && echo "$n"; done | sort
node scripts/ci/deploy-manifest-check.mjs   # dit exactement ce qui manque
```

```keel-deploy
account-deletion-v1
account-export-v1
account-restore-v1
activate-plan-item-v2
advance-phase-v2
analyze-attack-technique-adjustment-v1
analyze-meal-photo-v1
classify-plan-type-v1
classify-recurring-reminder
coach-invite-student-v1
coach-signup-v1
cycle-draft
draft-defense-card-v1
draft-transformation-from-text-v1
ethical-text-validator
evaluate-adherence-v1
generate-attack-card-v1
generate-attack-technique-v1
generate-defense-card-v3
generate-plan-v2
generate-questionnaire-v2
get-coaching-intervention-scorecard
get-coaching-intervention-trace
get-memory-scorecard
get-memory-trace
get-momentum-scorecard
get-momentum-trace
household-merge-notices-v1
intake-to-transformations-v2
keel-cards-v1
keel-lifecycle-email-v1
keel-tracking-v1
keel-week-rollover-v1
meal-photo-upload-v1
notify-profile-change
plan-import-v1
plan-publish-v1
plan-template-v1
process-checkins
process-llm-retry-jobs
process-whatsapp-optin-recovery
process-whatsapp-outbound-retries
promote-candidate-memory-items
provision-day-v1
purge-deleted-accounts
schedule-whatsapp-v2-checkins
send-welcome-email
sophia-brain
stripe-create-checkout-session
stripe-create-portal-session
stripe-reconcile-seats
stripe-sync-subscription
stripe-webhook
trigger-memorizer-daily
trigger-synthesizer-batch
trigger-topic-compaction
trigger-watcher-batch
update-defense-card-v3
whatsapp-optin
whatsapp-send
whatsapp-webhook
```

**Les 12 fonctions du cœur KEEL**, dans l'ordre du parcours : `coach-signup-v1` →
`plan-import-v1` → `plan-template-v1` → `plan-publish-v1` → `coach-invite-student-v1` →
`provision-day-v1` → `evaluate-adherence-v1` → `keel-week-rollover-v1` →
`meal-photo-upload-v1` → `analyze-meal-photo-v1` → `sophia-brain` → `whatsapp-webhook`.
Si tu ne déploies qu'une chose, c'est ces douze-là — mais le reste de la liste est encore
appelé par le frontend de transition, et **une fonction absente = un 404 devant un utilisateur**
(défaut réel de W2, `DashboardV2` appelait deux fonctions supprimées à chaque montage, avalées
par un `.catch(console.error)`).

### Ce qui NE part PAS, et pourquoi

```keel-do-not-deploy
whatsapp-sim-inbound      simulateur WhatsApp local; exécute processMessage pour un utilisateur authentifié arbitraire
whatsapp-sim-trigger      idem
test-send-message         harnais QA; pilote le brain directement
review-plan-v1            999 lignes, appelle Gemini, ZÉRO appelant (MEGA_REVIEW §3) — surface de coût LLM pure
trigger-memory-v2-alerts  zéro appelant
```

### Fonctions qui s'authentifient elles-mêmes

Elles doivent porter `verify_jwt = false` dans `supabase/config.toml` : la gateway rejetterait
l'appelant **avant** que la fonction tourne. L'auth n'est pas affaiblie, elle est déplacée
(`auth.getUser()` puis contrôle de tenancy, ou `x-internal-secret`, ou signature du fournisseur).
C'est le piège `coach-invite-student-v1` (401 en navigateur, EXECUTION_LOG D3).

```keel-auth-in-function
account-deletion-v1
account-export-v1
account-restore-v1
analyze-meal-photo-v1
coach-invite-student-v1
coach-signup-v1
cycle-draft
evaluate-adherence-v1
keel-lifecycle-email-v1
keel-week-rollover-v1
meal-photo-upload-v1
plan-import-v1
plan-publish-v1
plan-template-v1
process-checkins
process-llm-retry-jobs
process-whatsapp-optin-recovery
process-whatsapp-outbound-retries
promote-candidate-memory-items
provision-day-v1
purge-deleted-accounts
send-welcome-email
trigger-watcher-batch
whatsapp-send
whatsapp-webhook
stripe-webhook
```

> `stripe-webhook` a été ajouté à `config.toml` le 27/07 après que ce check l'a signalé : Stripe
> ne présente aucun JWT et la fonction vérifie elle-même la signature
> (`stripe-webhook/index.ts:267`). Sans `verify_jwt = false`, Kong aurait rejeté **chaque**
> webhook en 401 et aucun abonnement ne se serait synchronisé — même famille que
> `coach-invite-student-v1`, trouvée avant la production cette fois.

### Contrats de cron non tenus — dettes datées, visibles à chaque run CI

`deploy-manifest-check` compare le **corps JSON** que chaque cron KEEL envoie aux clés que la
fonction cible lit réellement. Une clé qu'elle ne lit pas = un job qui tourne, prend un 4xx, et
que `cron.job_run_details` déclare `succeeded`. Les lignes ci-dessous sont les mismatchs connus :
elles sortent en **PENDING** (build vert, message imprimé à chaque exécution) plutôt qu'en rouge,
convention du dépôt (cf. l'exemption `day_targets.ts` de `wiring-check.mjs`). Elles se retirent
le jour où c'est corrigé, et le check redevient rouge si quelqu'un les efface sans corriger.

```keel-cron-contract-pending
# (vide — aucun contrat de cron non tenu à ce jour)
# 28/07 W7.5: `keel-evaluate-adherence:mode` retiré. `evaluate-adherence-v1` lit désormais
# `mode` (evaluate-adherence-v1/fleet.ts::parseMode) et exécute une passe de flotte; la
# migration 20260728090000 replanifie le job avec `{"mode":"fleet"}`. Preuve: `select command
# from cron.job where jobname='keel-evaluate-adherence'` contient `"mode":"fleet"`, et l'appel
# curl rend 200 avec le tally au lieu de 400.
```

---

## 8. Vérification post-migration — 3 requêtes, non négociables

Ces trois-là ferment les bloquants B1/B2/B3 de la MEGA REVIEW. Elles se lancent **après** § 5,
**avant** d'ouvrir l'URL à qui que ce soit.

### 8.1 Les vues Tier B doivent être en lecture seule

```sql
select c.relname,
       has_table_privilege('authenticated', c.oid, 'INSERT') as ins,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as upd,
       has_table_privilege('authenticated', c.oid, 'DELETE') as del
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('coach_student_events','coach_student_directory');
-- attendu: ins/upd/del = false sur les 2 lignes.
-- Un `true` = n'importe quel compte authentifié peut FORGER un fait sur n'importe quel
-- utilisateur (reproduit en HTTP réel via Kong, MEGA_REVIEW B2). Arrêt immédiat.
```

### 8.2 La primitive interne ne doit pas être exécutable par `anon`

```sql
select proname, proacl::text
from pg_proc where proname = 'invoke_internal_edge_function';
-- attendu: aucune trace de `anon=X` ni `authenticated=X`.
-- Sinon: un POST avec la seule clé publishable force la clôture de journée fleet-wide
-- (`{"mode":"sweep","ignore_timezone_gate":true}`). MEGA_REVIEW B3.
```

### 8.3 Inventaire général des ACL (les deux ci-dessus sont des cas particuliers)

```sql
select c.relname, c.relkind, c.relacl::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relacl::text like '%authenticated=a%'
   or c.relacl::text like '%authenticated=w%' or c.relacl::text like '%authenticated=d%';
-- Toute ligne doit être une table que l'élève écrit légitimement (protocol_events,
-- planned_deviations). Une VUE ne doit jamais y figurer.
```

### 8.4 Les 5 crons KEEL, et l'ordre qui compte

```sql
select jobname, schedule, active from cron.job
where jobname like 'keel%' or jobname in ('schedule-whatsapp-v2-checkins','reseed-recurring-reminders')
order by jobname;
```

Attendu :

| jobname | schedule | pourquoi cette minute |
|---|---|---|
| `keel-provision-day` | `0 * * * *` | ouvre la journée locale à minuit, dans chaque fuseau |
| `keel-evaluate-adherence` | `45 * * * *` | **avant** le balayage, sinon le sweep verrouille en `missed` ce que l'évaluateur aurait résolu |
| `keel-sweep-day` | `55 * * * *` | ferme la journée locale |
| `keel-week-rollover-v1` | `10 0 * * *` | activation des items de la semaine qui commence |
| `schedule-whatsapp-v2-checkins` | `0 * * * *` | horaire, pour que chaque fuseau ait son minuit local |
| `reseed-recurring-reminders` | `0 18 * * 0` | reseed hebdo (horizon corrigé, pas le cron — W1 D1) |

**`active = true` ne prouve rien.** Va lire RUNBOOK § I-3 : un job actif dont `app_config` est
vide n'émet aucune requête, et `job_run_details` dit `succeeded`.

### 8.5 RLS

```bash
# depuis le dépôt, contre le projet distant (lecture seule)
psql "$PROD_DB_URL" -f supabase/functions/_shared/keel/tenancy_rls_test.sql
```

28/28 attendus. Ce fichier est un test, pas une migration : il crée et détruit ses propres
fixtures. Les comptes sont scopés aux ids du test depuis W4 — il reste vert avec de vrais élèves
dans la même base.

---

## 9. Vercel

**Variables d'environnement** (Project Settings → Environment Variables, portée `Production`) :

| Variable | Valeur | Note |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` | |
| `VITE_SUPABASE_ANON_KEY` | clé anon du projet | publique par nature |
| `VITE_PRELAUNCH_LOCKDOWN` | `true` **pendant tout le pré-vol** | routes réservées aux `internal_admins`, signup masqué |
| `VITE_WHATSAPP_NUMBER` | le numéro Meta affiché à l'élève | |
| `VITE_STRIPE_PRICE_ID_*` | 6 ids | uniquement si la facturation legacy est allumée |

⚠️ **Vite fige ces valeurs au build.** Changer une variable sans **redéployer** ne change rien —
et c'est le genre de diagnostic qui coûte une heure à 3 h du matin.

**CSP** : `frontend/vercel.json` fixe `connect-src 'self' https://*.supabase.co
wss://*.supabase.co …`. Si le projet Supabase est sur un domaine personnalisé, la CSP le bloque
et le symptôme est un écran blanc avec une erreur console — pas un 500.

**Séquence** : garde `VITE_PRELAUNCH_LOCKDOWN=true`, déploie, fais la fumée du § 11 avec le
compte admin, puis passe-le à `false` **et redéploie**.

---

## 10. Meta / WhatsApp

### 10.1 Webhook

Meta App → WhatsApp → Configuration :

- **Callback URL** : `https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`
- **Verify token** : la valeur de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- **Champs abonnés** : `messages` (suffit)

`whatsapp-webhook` porte `verify_jwt = false` (Meta ne présente aucun JWT) et vérifie la
signature `X-Hub-Signature-256` avec `WHATSAPP_APP_SECRET`. Si la vérification Meta échoue, le
secret côté Edge Function et celui saisi chez Meta diffèrent — il n'y a pas d'autre cause.

### 10.2 Templates à faire approuver 🔒 GATE HUMAIN — **le chemin critique le plus long**

> **Le catalogue du dépôt est intégralement en FRANÇAIS**
> (`_shared/whatsapp_templates.ts`, 20 templates). KEEL est un produit **anglophone** : l'app est
> 100 % EN et `render.ts` **throw** hors `en-US`. Envoyer `sophia_checkin_v1` à l'élève d'un coach
> britannique lui écrit « Hello 🙂 J'aimerais prendre rapidement de tes nouvelles ».
> L'approbation Meta prend de quelques heures à plusieurs jours : **commence par là**, pas la veille.

Pour le pilote KEEL, 3 templates suffisent (les autres appartiennent au produit B2C legacy) :

| Rôle | Variable d'env | Corps attendu | Paramètres |
|---|---|---|---|
| rappel de créneau + digest dominical | `WHATSAPP_KEEL_REMINDER_TEMPLATE_NAME` | ré-ouvre la fenêtre 24 h, le vrai corps est délivré ensuite depuis le brouillon stocké | **zéro** placeholder |
| opt-in élève | `WHATSAPP_OPTIN_TEMPLATE_NAME` | consentement explicite (LEGAL § 2) | `{{1}}` = prénom |
| bilan du soir | `WHATSAPP_DAILY_BILAN_TEMPLATE_NAME` | | `{{1}}` = prénom |

Et `WHATSAPP_*_TEMPLATE_LANG` = `en` (ou `en_GB`) pour chacun.

**Deux pièges déjà payés :**

1. **Le corps approuvé chez Meta fait autorité, pas le catalogue du dépôt.** Screenshot du 23/07 :
   `sophia_checkin_v2` était approuvé avec le corps « Hello Thomas 🙂 » — un prénom en dur pour
   toute la flotte. Le catalogue TS ne sert qu'au rendu local et au simulateur ; il ne synchronise
   rien. **Relis le corps dans le Business Manager, pas dans le code.**
2. **Nombre de placeholders.** Injecter un paramètre dans un template qui n'en a pas fait échouer
   l'envoi côté Meta ; l'inverse laisse `{{1}}` visible dans le message. `injectBodyNameParam`
   est décidé par purpose dans `whatsapp-send/index.ts:120-260` — vérifie que le template approuvé
   correspond au purpose.

### 10.3 Fenêtre de 24 h

Hors fenêtre, seul un template approuvé passe. C'est pour ça que le rappel de créneau est un
template **sans placeholder** qui ré-ouvre la fenêtre : le contenu réel part ensuite en message
libre depuis le brouillon stocké. Si tu remplaces ce template par un template porteur de contenu,
tu déplaces le contenu du produit dans un objet que Meta doit approuver à chaque changement.

---

## 11. Fumée de bout en bout — 12 étapes, avec un vrai coach

Aucune n'est facultative : chacune correspond à un défaut réellement rencontré.

| # | Étape | Ce qu'on vérifie |
|---|---|---|
| 1 | Signup coach sur `/coach` | `coaches` créée (la table n'a **pas** de policy INSERT — c'est la fonction qui écrit) |
| 2 | Import d'un vrai protocole (texte d'abord, PDF ensuite) | commitments structurés, file « À vérifier » séparée |
| 3 | Édition d'une ligne + publication | `student_instruction` copiée **verbatim**, lignes d'audit |
| 4 | Invitation d'un élève par e-mail | l'e-mail **arrive** (RESEND + SENDER_EMAIL + APP_BASE_URL) |
| 5 | `/join?token=…` puis création du compte | `coach_clients.status='active'` |
| 6 | `/app/today` | 100 % anglais, badge **Insufficient data**, **zéro pourcentage** |
| 7 | Clic « Log it » | ligne `protocol_events` écrite ; le badge ne prétend pas être une note |
| 8 | Attendre `:45` **ou** appeler l'évaluateur | la ligne passe `met` — **c'est le test qui échoue aujourd'hui**, RUNBOOK § I-1 |
| 9 | Message WhatsApp « I took my magnesium » | `handler=log_protocol_event`, `committed=1`, ligne en base |
| 10 | Photo de repas | analyse OK, et **tous** les champs quantitatifs NULL (CONTRACT non-input #4) |
| 11 | Message d'un fait **non traçable** (« I did my 30-minute walk ») | soit un effet committé, soit **aucun accusé** — RUNBOOK § I-4 |
| 12 | Un coach B tente de publier chez l'élève du coach A | **403 `not_your_student`**, 0 ligne écrite |

Après l'étape 12 : `VITE_PRELAUNCH_LOCKDOWN=false` + redéploiement Vercel.

---

## 12. Ce qu'on regarde le lendemain matin

Les 4 requêtes de § Monitoring du [RUNBOOK](RUNBOOK.md#monitoring). Dans l'ordre d'importance :

1. **Jours sans provisionnement** — la santé du pipeline. Un trou ici invalide tout le reste.
2. **Taux de déclenchement de la garde d'accusé fantôme** — combien de fois l'IA a failli mentir.
3. **Coût LLM par élève** — la marge du modèle 49 $ + 12 $.
4. **Lignes `cost_unpriced`** — le contrôle du contrôle : elles disent que le point 3 est faux.

---

## 13. Rollback

| Cas | Geste |
|---|---|
| Une edge function casse | redéploie la version précédente depuis git : `git checkout <sha> -- supabase/functions/<nom>` puis 🔒 `functions deploy <nom>` |
| Un cron fait des dégâts | `select cron.unschedule('<jobname>');` — réversible, immédiat, et **c'est le geste de nuit** |
| Une migration casse | **il n'y a pas de rollback automatique.** `db push` est en avant seulement. Écris une migration de correction ; ne modifie jamais une migration déjà poussée |
| Fuite de secret | rotation : Vault **et** secret Edge Function ensemble (§ 3 + § 4). S'ils divergent, tous les crons partent en 403 — bruyant, donc préférable au silence |
| Le front casse | Vercel → Deployments → Promote to Production sur le déploiement précédent |

Le cas « il faut tout arrêter sans rien détruire » : `cron.unschedule` sur les 5 jobs KEEL, plus
`VITE_PRELAUNCH_LOCKDOWN=true` + redéploiement. Les données restent intactes, le produit se tait.
