# KEEL — RUNBOOK

> **Écrit pour 3 h du matin.** Chaque incident : le **symptôme tel qu'il se présente**, la
> **requête de diagnostic** qui tranche en une exécution, le **correctif**, et ce qui **prouve**
> que c'est réparé. Aucun incident ici n'est hypothétique : ils ont tous été rencontrés pendant
> la construction (sources : [EXECUTION_LOG.md](EXECUTION_LOG.md), [MEGA_REVIEW.md](MEGA_REVIEW.md)).
>
> Déploiement et séquence d'installation : [DEPLOY.md](DEPLOY.md).
> 🔒 = commande que seul l'humain peut lancer (hook `block-risky-commands.sh`).

## Le réflexe qui compte

**Un cron « actif » ne prouve rien. `succeeded` dans `cron.job_run_details` ne prouve rien.**
pg_net rend un *request id*, pas un statut HTTP : un job qui prend un 400 à chaque tick est
enregistré `succeeded`, éternellement. Le seul état de santé qui vaut est **la ligne écrite en
base**, pas le job qui aurait dû l'écrire.

Ordre de triage, du plus au moins probable :

```
Un élève dit « j'ai fait X et ça dit missed »   → I-1, puis I-5, puis I-4
Rien ne se passe depuis N heures                → I-3, puis I-2
Un écran / un webhook rend 401 ou 404           → I-2, puis I-6
Le coach voit « Insufficient data » à vie       → I-7
Une réponse de l'IA est fausse ou en français   → I-4, I-8
Les coûts LLM semblent nuls ou absurdes         → Monitoring M-3 / M-4
```

---

## I-1 — Tout est noté `missed` alors que l'élève a loggé *(CORRIGÉ le 28/07 — W7.5)*

> **État** : corrigé par `evaluate-adherence-v1` mode flotte (`fleet.ts`) + migration
> `20260728090000`, qui replanifie `keel-evaluate-adherence` avec `{"mode":"fleet"}`.
> Vérification en une commande — elle doit rendre `200` et un tally, jamais `400` :
>
> ```bash
> curl -sS -X POST "$BASE/functions/v1/evaluate-adherence-v1" \
>   -H "content-type: application/json" -H "apikey: $ANON" \
>   -H "authorization: Bearer $ANON" -H "x-internal-secret: $INTERNAL_SECRET" \
>   -d '{"mode":"fleet"}' | jq '{students_evaluated,skipped_by_reason,errored_students,truncated_by}'
> ```
>
> `truncated_by` non nul = la passe a été coupée par une borne : rejouer avec
> `{"mode":"fleet","after_student_id":"<next_after_student_id>"}` (idempotent).
> La section ci-dessous décrit le défaut d'origine ; elle reste ici parce que le diagnostic
> (« des faits existent, l'évaluation dit `missed` ») est la sonde qui prouve que ça ne revient pas.

### Symptôme
L'élève tape « Log it » à 09:00, la ligne apparaît. Le lendemain matin elle affiche **Missed**.
Le coach voit une adhérence catastrophique sur un élève exemplaire. Aucune erreur nulle part.

### Cause
`keel-sweep-day` (23:55 local) passe en `missed` tout ce qui est encore `unknown`.
`keel-evaluate-adherence` (`45 * * * *`) est censé résoudre les faits **avant** lui. Il est
planifié, actif — et **inerte** : il poste `{"mode":"due"}` à `evaluate-adherence-v1`, une
fonction qui **ne contient aucune occurrence de `mode`** et exige `user_id`.

Mesuré en local le 27/07 :

```
POST /functions/v1/evaluate-adherence-v1  {"mode":"due"}
-> HTTP 400 {"error":"user_id is required"}
```

C'est le bloquant **B1** de la MEGA REVIEW : il avait été refermé par un cron, mais le cron parle
un langage que la fonction n'a jamais appris. Le check `deploy-manifest-check.mjs` le signale à
chaque exécution CI.

### Diagnostic — la signature qui ne trompe pas

```sql
-- Les `met` sont écrits par du TypeScript (timestamp JS, milliseconde).
-- Les `missed` sont écrits par le balayage SQL (now(), microseconde).
-- Si TOUS les `met` viennent d'appels manuels, l'évaluateur ne tourne pas.
select status,
       resolved_by,
       count(*),
       count(*) filter (where date_part('microsecond', resolved_at)::int % 1000 = 0) as ms_precision
from public.commitment_evaluations
where local_date >= current_date - 7
group by 1,2 order by 1,2;
```

```sql
-- Deuxième preuve, plus directe : des faits existent, l'évaluation dit missed.
select e.local_date, e.status, e.resolved_by, count(pe.id) as facts_that_day
from public.commitment_evaluations e
left join public.protocol_events pe
       on pe.user_id = e.user_id and pe.local_date = e.local_date
where e.status = 'missed' and e.local_date >= current_date - 7
group by 1,2,3 having count(pe.id) > 0
order by 1 desc;
-- Toute ligne = un fait rapporté qui n'a pas été évalué. Zéro ligne attendu.
```

### Correctif immédiat (nuit) — rattraper la journée

```bash
# pour un élève, une date. persist=false d'abord pour voir sans écrire.
curl -sS -X POST "$BASE/functions/v1/evaluate-adherence-v1" \
  -H "content-type: application/json" -H "apikey: $ANON" \
  -H "authorization: Bearer $ANON" -H "x-internal-secret: $INTERNAL_SECRET" \
  -d '{"user_id":"<uuid>","local_date":"2026-07-27","day_is_closed":true,"persist":false}' | jq
```

Retire `"persist":false` quand la sortie est celle attendue. Boucle sur les élèves actifs si
nécessaire — **c'est un pansement de nuit, pas un correctif.**

### Correctif structurel (W7.5 — livré le 28/07)
`evaluate-adherence-v1` accepte `{"mode":"fleet"}` (alias `"due"`, le corps déjà déployé) :
il pagine les élèves KEEL actifs ayant une `plan_version` publiée, calcule pour **chacun** sa
date locale courante dans **son** fuseau, et lance l'évaluation per-user existante — idempotente.
Pas de gate de fuseau : l'évaluation est un total courant, pas un événement. La migration
`20260728090000` replanifie le job avec le bon corps et lève (R7) si l'horaire, l'activité, le
corps ou le câblage vault ne sont pas ceux attendus. La ligne `keel-evaluate-adherence:mode` a été
retirée du bloc ```keel-cron-contract-pending``` de DEPLOY.md.

### Preuve que c'est réparé
La commande de DEPLOY § 0 rend **200**, et la requête « faits sans évaluation » ci-dessus rend
**0 ligne** le lendemain.

---

## I-2 — Une fonction rend 404 (ou 401) alors qu'elle est sur le disque

### Symptôme A — 404 après un `db reset` ou après avoir ajouté une fonction
En local, `POST /functions/v1/<nouvelle-fonction>` rend **404** alors que le dossier existe et
compile. Un `deno check` passe. Le fichier est là.

**Cause** : le conteneur `supabase_edge_runtime_<project_id>` construit sa table de routage **au
démarrage**. Un dossier créé après `supabase start` n'y est pas ; `db reset` ne redémarre pas ce
conteneur (il ne touche qu'à la base). Le hot-reload de `policy = "per_worker"` recharge le *code*
d'une fonction connue, pas la *liste* des fonctions.

**Correctif** :

```bash
docker restart supabase_edge_runtime_Sophia_2
# si ça ne suffit pas (rare) :
npx supabase stop && ./scripts/supabase_local.sh start
```

**Cousin connu, même famille** : après un `db reset`, Kong garde parfois l'IP amont périmée du
conteneur storage → `/storage/v1/*` rend **502**. `scripts/local_reset.sh` redémarre Kong
automatiquement pour ça ; si tu as fait `supabase db reset` à la main, fais-le toi :

```bash
docker restart supabase_kong_Sophia_2
```

### Symptôme B — 401 en production sur une fonction qui s'authentifie elle-même
Le navigateur envoie un JWT valide, la fonction répond 401 **sans `request_id`** dans le corps.

**Cause** : l'absence de `request_id` est le tell. Le 401 vient de **Kong**, pas de la fonction —
la fonction n'a jamais tourné. Elle manque de `verify_jwt = false` dans `supabase/config.toml`
alors qu'elle authentifie en interne. C'est le défaut `coach-invite-student-v1` (EXECUTION_LOG D3).

**Diagnostic** :

```bash
curl -i -X POST "$BASE/functions/v1/<nom>" -H "apikey: $ANON" \
  -H "authorization: Bearer $USER_JWT" -H "content-type: application/json" -d '{}'
# corps SANS request_id  -> gateway (config.toml)
# corps AVEC request_id  -> la fonction, son auth interne a refusé (vrai problème d'auth)
```

**Correctif** : ajouter la section dans `supabase/config.toml` (racine), **jamais** dans
`supabase/functions/<nom>/config.toml` — ce dernier **n'est pas lu par le CLI** (vérifié 27/07) —
puis 🔒 redéployer la fonction. `node scripts/ci/deploy-manifest-check.mjs` liste les fonctions
concernées et échoue si l'une manque.

> ❌ **Ne corrige jamais ça par `--no-verify-jwt`** : le drapeau est global et désarme la gateway
> sur `sophia-brain`, que le navigateur appelle avec le JWT de l'utilisateur.

---

## I-3 — Rien ne se passe : aucun rappel, aucune journée ouverte, aucun bilan

### Symptôme
Depuis le déploiement (ou depuis une restauration de base), plus aucune ligne
`commitment_evaluations` n'est semée, plus aucun message proactif ne part. Les jobs sont là,
`active = true`, et `cron.job_run_details` dit `succeeded`.

### Cause
Chaque job KEEL est un `net.http_post` **enveloppé dans un `where`** :

```sql
where (select base_url from cfg) <> ''
  and (select anon_key from cfg) <> ''
  and (select internal_secret from cfg) <> '';
```

Si `app_config` est vide (elle n'est seedée que par `supabase/seed.sql`, **que `db push`
n'exécute pas**) ou si le secret Vault manque, la requête sélectionne **zéro ligne**, aucun POST
n'est émis, et le job se termine avec succès. C'est le silence le plus cher du dépôt : la
configuration a été résolue **à l'exécution** précisément pour survivre à l'ordre
migrations-avant-seed, mais l'absence de config ne produit toujours aucun signal.

### Diagnostic — 3 lignes, dans cet ordre

```sql
-- 1. La config existe-t-elle ?
select key, case when value = '' then '<VIDE>' else 'set' end
from public.app_config
where key in ('edge_functions_base_url','edge_functions_anon_key','supabase_project_ref');
-- attendu: 3 lignes, aucune <VIDE>

-- 2. Le secret Vault existe-t-il ? (ne jamais imprimer decrypted_secret)
select name, created_at from vault.secrets where name = 'INTERNAL_FUNCTION_SECRET';
-- attendu: 1 ligne

-- 3. Le job a-t-il RÉELLEMENT posté ? `0 rows` = il n'a rien émis.
select j.jobname, d.start_time, d.status, d.return_message
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname like 'keel%'
order by d.start_time desc limit 10;
-- `return_message = '0 rows'` -> le where a tout filtré : c'est CE symptôme.
-- un id numérique          -> le POST est parti ; le problème est en aval (I-1, I-2).
```

### Correctif
DEPLOY § 4 (Vault) puis § 6.1 (`app_config`). **Aucun redéploiement n'est nécessaire** : la
config est lue au tick suivant. Attends le prochain tick et relance la requête 3.

### Vérification en aval — le POST est-il arrivé ?

```sql
select id, status_code, left(content, 200), created
from net._http_response
order by created desc limit 10;
-- 200 = ok · 400 = corps refusé (I-1) · 401/403 = secret désaccordé · 404 = fonction non déployée
```

**403 partout** = le secret Vault et `INTERNAL_FUNCTION_SECRET` (Edge Functions) ont divergé.
Repose **les deux** avec la même valeur ; les reposer séparément est la cause n°1 de récidive.

---

## I-4 — Accusé fantôme : l'IA remercie pour un fait qu'elle n'a pas écrit

### Symptôme
L'élève écrit « I did my 30-minute walk ». L'IA répond « noté ✅ ». **Aucune ligne
`protocol_events`.** L'évaluateur note `missed`. L'élève a suivi son protocole, l'a dit, a été
remercié, et est noté défaillant.

### Cause
Le dispatcher n'émet **aucun** effet. Toutes les ceintures historiques
(`stripTrackClaimWithoutCommit`, `ensureCommittedRenderParity`) réconcilient un rendu avec un
**ledger** : elles ont besoin d'un effet *demandé puis bloqué* pour mordre. Quand rien n'est
émis, il n'y a rien à réconcilier et le composeur écrit librement.
La ceinture `keel_ack_without_committed_effect`
(`sophia-brain/skills/_shared/keel_ack_without_effect_guard.ts`) s'ancre sur le **message de
l'élève** et non sur le ledger : fait accompli rapporté + zéro effet committé ⇒ les phrases
d'accusé sont retirées et la question de liage manquante est posée.

Cause racine fréquente derrière le zéro-effet : la ligne n'est **matchable par rien**. `matchEvent`
n'a que 4 branches (liage explicite, `substance_ref`, `avoid`+`substance_ref`, `food_group_ref`).
Une ligne « marche », « lumière », « coucher » n'a ni slug de substance ni groupe alimentaire :
sans `commitment_id` rendu et repris, aucun chemin ne peut la créditer (MEGA_REVIEW G2).

### Diagnostic

```sql
-- 1. Combien de fois la ceinture a-t-elle mordu ? (elle log dans system_error_logs)
select date_trunc('day', created_at) as day,
       count(*) as guard_triggers,
       count(*) filter (where metadata->>'reason_code' = 'ack_without_committed_effect') as phantom
from public.system_error_logs
where source = 'guards' and title like '%keel_ack_without_committed_effect%'
  and created_at > now() - interval '7 days'
group by 1 order by 1 desc;
```

```sql
-- 2. Les lignes structurellement inloggables par conversation
select id, title, activity_class, measure, substance_ref, food_group_ref
from public.plan_commitments
where status = 'active'
  and substance_ref is null and food_group_ref is null
  and polarity <> 'capture';
-- Chacune exige un liage explicite (commitment_id) pour être créditée par le chat.
```

### Correctif
**De nuit** : rien à faire côté prod, la ceinture dégrade proprement (elle retire l'accusé et
demande la ligne). Crédite le fait à la main si l'élève le signale :

```sql
insert into public.protocol_events
  (user_id, occurred_at, local_date, source, recognized, content_locale)
values
  ('<uuid>', now(), '2026-07-27', 'coach',
   jsonb_build_object('commitment_id','<commitment_uuid>'), 'en-US');
```
puis rejoue l'évaluateur (I-1). `protocol_events` est **append-only** : il n'y a pas d'`update`
à écrire, et c'est voulu.

**Structurel** : un taux de déclenchement qui monte n'est pas un problème de ceinture, c'est le
dispatcher qui n'émet pas. La ceinture est un **thermomètre** : voir Monitoring M-2.

> ⚠️ **Une ceinture qui ne se déclenche jamais n'est pas forcément saine** — elle peut être
> désarmée. Ses 6 conditions de désarmement sont nommées dans le module ; `disarmed_not_keel_student`
> couvre tous les tours hors élève KEEL. Croise toujours M-2 avec le volume de tours élèves.

---

## I-5 — Adhérence tombée à 0 après une republication du plan

### Symptôme
Le coach corrige une virgule mercredi et republie. Jeudi, les deux premiers jours de la semaine
affichent « Archived commitment » sur chaque ligne, et l'adhérence de la semaine s'effondre.
Une preuve `partial` apportée par l'élève lundi est devenue `missed`.

### Cause
Publier crée une **nouvelle version** et supersède l'ancienne. Les faits et les évaluations
pointaient l'`id` des commitments de la version morte. **L'action du coach détruisait la preuve
de l'élève.** Correctif livré en W7 : remap des liages par `template_commitment_key`, plus
`reseedOnPublish` appelé par `plan-publish-v1`. Si le symptôme réapparaît, c'est que le reseed
n'a pas tourné pour cette version.

### Diagnostic

```sql
-- 1. Combien de versions, et laquelle est publiée ?
select id, version, status, published_at, supersedes_version_id
from public.plan_versions where student_id = '<uuid>' order by version desc;

-- 2. Des évaluations orphelines : elles pointent une version qui n'est plus publiée
select e.local_date, e.plan_version_id, count(*)
from public.commitment_evaluations e
where e.user_id = '<uuid>' and e.local_date >= date_trunc('week', current_date)
  and e.plan_version_id <> (
    select id from public.plan_versions
    where student_id = '<uuid>' and status = 'published' order by version desc limit 1)
group by 1,2 order by 1;
-- Toute ligne = un jour de la semaine courante rattaché à une version morte.

-- 3. Les clés de template ont-elles survécu à la republication ?
select template_commitment_key, count(*) filter (where status='active') as live
from public.plan_commitments where user_id = '<uuid>'
group by 1 having count(*) filter (where status='active') = 0;
-- Une clé sans ligne active = la ligne a été retirée du plan, pas orphelinée.
-- Une clé absente des DEUX versions = le remap n'a pas de point d'ancrage : c'est le vrai bug.
```

### Correctif

```bash
# rejouer le reseed sur la version publiée
curl -sS -X POST "$BASE/functions/v1/provision-day-v1" \
  -H "content-type: application/json" -H "apikey: $ANON" \
  -H "authorization: Bearer $ANON" -H "x-internal-secret: $INTERNAL_SECRET" \
  -d '{"mode":"reseed_on_publish","plan_version_id":"<uuid>"}' | jq
# puis réévaluer chaque jour touché (I-1)
```

Le drapeau `weekly_reviews.plan_version_changed_midweek` existe pour marquer la semaine ; s'il
n'est écrit par personne, une semaine republiée en son milieu reste **comparable à tort** avec
les autres. À dire au coach plutôt qu'à masquer.

### Prévention à dire au coach
Republier **le lundi**. Une correction en milieu de semaine est licite, mais elle segmente la
semaine — et le produit ne prétend pas le contraire.

---

## I-6 — Clé Gemini invalide : import mort, photo muette, **et diagnostic empoisonné**

### Symptôme
`plan-import-v1` rend 500 ou une erreur d'authentification fournisseur. L'analyse photo ne rend
rien. Le chat reste muet ou tombe en repli.

### ⚠️ Le piège, avant toute chose : **il y a DEUX fichiers `.env` avec une clé Gemini**

| Fichier | Contenu | Statut |
|---|---|---|
| `supabase/.env` | la clé réellement injectée dans le conteneur edge | **c'est celle-ci qui compte** |
| `.env` (racine) | une clé Gemini historique | **invalide — elle ne sert qu'à empoisonner les diagnostics** |

Une review adversariale entière a conclu « la voie vision est morte, elle n'a jamais été exercée
contre un vrai modèle ». Les trois affirmations étaient fausses : l'agent avait testé la clé de la
racine (EXECUTION_LOG D6). `scripts/supabase_local.sh` charge la racine **puis** `supabase/.env`,
qui gagne — donc le conteneur a la bonne clé pendant que le testeur en lit une autre.

**Action encore ouverte côté fondateur : supprimer `GEMINI_API_KEY` de la racine `.env`.**

### Diagnostic — teste la clé que le CONTENEUR porte, pas celle du disque

```bash
# 1. quelle clé le runtime porte-t-il ? (empreinte seulement, jamais la valeur)
docker exec supabase_edge_runtime_Sophia_2 sh -c \
  'printf "%s" "$GEMINI_API_KEY" | wc -c; printf "%s" "$GEMINI_API_KEY" | tail -c 4'

# 2. cette clé est-elle valide chez Google ? (une clé valide liste ~40 modèles)
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | jq '.models | length // .error.message'
```

En production, la clé vient des secrets Edge Functions du projet — pas d'un `.env`. Vérifie sa
présence dans la console Supabase, jamais sa valeur dans un log.

```sql
-- côté base : le trafic LLM s'est-il arrêté, et avec quel statut ?
select date_trunc('hour', created_at) as h, provider, model, status, count(*)
from public.llm_usage_events
where created_at > now() - interval '6 hours'
group by 1,2,3,4 order by 1 desc;
-- une chute à zéro OU un pic de status <> 'success' = clé, quota, ou modèle retiré.
```

### Correctif
Reposer le secret 🔒 (`GEMINI_API_KEY`), puis **redéployer** les fonctions concernées : un secret
n'est pris en compte qu'au démarrage suivant de l'isolat. En local : `docker restart
supabase_edge_runtime_Sophia_2`.

### Cas voisin — modèle retiré
`KEEL_VISION_MODEL` vaut `gemini-3.1-pro-preview`. Un modèle **preview** peut disparaître sans
préavis : le symptôme est un 404 côté fournisseur, pas une erreur d'auth. La variable existe
justement pour repointer sans redéployer de code.

---

## I-7 — Le coach voit « Insufficient data » indéfiniment

### Symptôme
L'élève logge 6 jours sur 7 depuis trois semaines. `/app/progress` et la page coach affichent
toujours **Insufficient data**, jamais un pourcentage.

### Deux causes possibles — il faut les distinguer AVANT de toucher à quoi que ce soit

1. **Le gate est correct et fait son travail.** Sous 4 jours loggés sur 7, aucun pourcentage n'est
   affiché. Ce n'est pas un bug : c'est la règle du produit, et elle est structurelle (union
   discriminée sans champ de pourcentage dans la variante de refus).
2. **`weekly_reviews` n'a pas d'écrivain** (bloquant **B5**). Les trois lecteurs existent,
   `computeWeekAdherence` est écrit et testé — et ne tourne que dans ses tests. Sans ligne écrite,
   le refus est affiché à vie et `risk_band` n'est jamais calculé.

### Diagnostic

```sql
-- couverture réelle de la semaine (le numérateur du gate 4/7)
select e.local_date, count(distinct pe.id) as facts
from public.commitment_evaluations e
left join public.protocol_events pe
       on pe.user_id = e.user_id and pe.local_date = e.local_date
where e.user_id = '<uuid>' and e.local_date >= date_trunc('week', current_date)
group by 1 order by 1;
-- >= 4 jours avec des faits ET toujours "Insufficient data" -> cause 2.

select count(*) from public.weekly_reviews where user_id = '<uuid>';
-- 0 alors que les semaines sont passées -> cause 2, confirmée.
```

### Correctif
Cause 1 : **rien**. Explique la règle au coach — elle est le produit.
Cause 2 : dépend de W7 (l'écrivain de `weekly_reviews`). En attendant, ne promets **aucun
chiffre d'adhérence** au coach ; MEGA_REVIEW § 7 liste ce qu'il ne faut pas promettre.

---

## I-8 — WhatsApp : le mauvais message part (ou aucun)

### Symptôme A — l'élève reçoit « J'ai une info pour toi, je peux te la donner ? 😊 »
En français, à la place du rappel ou du bilan.

**Cause** : c'est `global_reach_template`, le **repli terminal** de `getFallbackTemplate`. On y
tombe quand le `purpose` n'a pas de mapping **ou** que le nom de template configuré n'est pas
approuvé chez Meta. Incident du 12/07 : trois envois de la relance générique à la place du bilan.

**Diagnostic** :

```sql
select date_trunc('day', created_at)::date as day,
       metadata->>'purpose'                  as purpose,
       graph_payload->'template'->>'name'    as template,
       status,
       count(*)
from public.whatsapp_outbound_messages
where created_at > now() - interval '7 days' and message_type = 'template'
group by 1,2,3,4 order by 1 desc, 5 desc;
-- toute ligne `global_reach_template` avec un purpose keel_* (ou action_evening_review,
-- weekly_progress_review) EST l'incident. Un `status='failed'` avec un nom de template
-- correct = le template n'est pas approuvé côté Meta pour cette langue.
```

**Correctif** : poser `WHATSAPP_KEEL_REMINDER_TEMPLATE_NAME` / `_LANG` 🔒 et vérifier que ce nom
est **approuvé** dans le Business Manager. Voir DEPLOY § 10.2.

### Symptôme B — le corps reçu ne correspond pas au catalogue du dépôt
`_shared/whatsapp_templates.ts` ne synchronise **rien** : il sert au rendu local et au
simulateur. **Le corps approuvé chez Meta fait autorité.** Cas réel du 23/07 : `sophia_checkin_v2`
était approuvé avec « Hello Thomas 🙂 » — un prénom en dur pour toute la flotte. Relis le corps
dans le Business Manager, pas dans le code.

### Symptôme C — rien ne part du tout
Fenêtre de 24 h fermée + aucun template approuvé = aucun envoi possible. Vérifie d'abord
`WHATSAPP_DELIVERY_ENABLED`, ensuite la date du dernier message entrant de l'élève.

### Symptôme D — la conversation répond en français
Défaut connu (D5, W9) : l'app est 100 % anglaise, `dispatcher.prompts.ts` et `companion.ts` sont
intégralement français. Ce n'est **pas** un incident de production à corriger de nuit ; c'est un
lot. Ne bricole pas le prompt à chaud.

---

## I-9 — Une journée n'est jamais ouverte pour un élève

### Symptôme
Un élève n'a aucune ligne `commitment_evaluations` pour aujourd'hui, alors que ses camarades en
ont. Aucune erreur.

### Causes, par ordre de fréquence

1. **Fuseau horaire** : `keel-provision-day` n'agit que dans la fenêtre locale `[00,01)`. Si le
   tick horaire est manqué, la journée saute.
2. **DST à minuit** (Santiago, La Havane, Beyrouth, Asunción) : l'heure locale 0 **n'existe pas**
   ce jour-là. La fenêtre `[00,01)` n'est jamais vraie. Dette nommée dans MEGA_REVIEW.
3. **Deux fuseaux divergents** : `plan_versions.timezone` est celui du **navigateur du coach**,
   `profiles.timezone` celui de l'élève. Rien ne les réconcilie : rappels et notation peuvent
   vivre dans deux calendriers.
4. **`scheduled_days = '{}'`** : le CHECK `<@` est vrai pour l'ensemble vide → la ligne est
   invisible à vie.

### Diagnostic

```sql
select p.id, p.timezone as student_tz, v.timezone as plan_tz,
       (select count(*) from public.commitment_evaluations e
        where e.user_id = p.id and e.local_date = current_date) as rows_today
from public.profiles p
join public.plan_versions v on v.student_id = p.id and v.status = 'published'
where p.keel_role = 'student';
-- student_tz <> plan_tz  -> cause 3
-- rows_today = 0 sur un seul élève -> causes 1/2

select id, title, scheduled_days from public.plan_commitments
where status = 'active' and cardinality(scheduled_days) = 0;   -- cause 4
```

### Correctif — rejouer une journée précise pour un élève

```bash
curl -sS -X POST "$BASE/functions/v1/provision-day-v1" \
  -H "content-type: application/json" -H "apikey: $ANON" \
  -H "authorization: Bearer $ANON" -H "x-internal-secret: $INTERNAL_SECRET" \
  -d '{"mode":"provision","student_id":"<uuid>","local_date":"2026-07-27","ignore_timezone_gate":true}' | jq
```

Le mode est **idempotent** : rejouable sans doublon (index unique fonctionnel sur
`(user_id, commitment_id, local_date, coalesce(slot_key,'no_slot'))`).

> ⚠️ `ignore_timezone_gate:true` **sans** `student_id` force la clôture de journée pour **toute
> la flotte**. Ne le tape jamais sans `student_id`. C'est le geste qu'exploitait le bloquant B3.

---

## I-10 — Un coach voit les données d'un élève qui n'est pas le sien

### Symptôme
Un coach lit un protocole ou des faits qu'il n'a pas écrits.

### Diagnostic — arrêt immédiat si l'une des deux rend autre chose que ce qui est indiqué

```sql
-- 1. les vues Tier B doivent être en lecture seule (bloquant B2)
select c.relname,
       has_table_privilege('authenticated', c.oid, 'INSERT') as ins,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as upd,
       has_table_privilege('authenticated', c.oid, 'DELETE') as del
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname in ('coach_student_events','coach_student_directory');
-- attendu: false, false, false

-- 2. la primitive interne ne doit pas être exécutable par anon (bloquant B3)
select proname, proacl::text from pg_proc where proname = 'invoke_internal_edge_function';
-- attendu: ni anon=X ni authenticated=X

-- 3. un élève ne doit avoir qu'UN lien vivant
select student_user_id, count(*) from public.coach_clients
where status in ('invited','active') group by 1 having count(*) > 1;
-- attendu: 0 ligne
```

### Fuite connue et **non corrigée** (MEGA_REVIEW G9)
Quand un élève **change de coach**, les policies Tier A ne scopent que l'élève, jamais le coach :
le nouveau coach lit le protocole verbatim de l'ancien, `source_span` compris (page + citation du
PDF). C'est de la propriété intellectuelle qui passe à un concurrent. **À dire au coach avant le
pilote** ; ne pas prétendre que c'est cloisonné (LEGAL § 5).

### Correctif de nuit
```sql
select public.revoke_coach_access('<student_uuid>');   -- passe le lien à 'ended'
```
Réversible, immédiat, et n'enferme pas l'élève (le prédicat de l'index unique a été corrigé en W1 :
`status in ('invited','active')`).

---

## Monitoring

Quatre requêtes. Elles se lisent dans cet ordre, parce que chacune conditionne la lecture de la
suivante.

### M-1 — Santé du pipeline : les jours sans provisionnement *(la plus importante)*

Un trou ici invalide **toutes** les autres métriques : sans évaluations semées, l'adhérence, la
couverture et les déclencheurs TCA lisent une table vide.

```sql
with active_students as (
  select p.id, p.timezone
  from public.profiles p
  join public.coach_clients cc on cc.student_user_id = p.id and cc.status = 'active'
),
days as (
  select generate_series(current_date - 13, current_date, interval '1 day')::date as d
)
select d.d as local_date,
       count(distinct s.id) as students,
       count(distinct e.user_id) as provisioned,
       count(distinct s.id) - count(distinct e.user_id) as missing
from days d
cross join active_students s
left join public.commitment_evaluations e on e.user_id = s.id and e.local_date = d.d
group by 1 order by 1 desc;
-- `missing > 0` un jour donné = I-9. Deux jours de suite = I-3.
```

### M-2 — Taux de déclenchement de la garde d'accusé fantôme

Le thermomètre de l'honnêteté du produit. Une valeur qui **monte** ne dit pas que la ceinture va
mal : elle dit que le dispatcher n'émet rien sur des faits que l'élève rapporte.

```sql
select date_trunc('day', created_at) as day,
       count(*) as guard_triggers,
       count(distinct user_id) as students_affected,
       metadata->>'detected_locale' as locale
from public.system_error_logs
where source = 'guards'
  and (title like '%keel_ack_without_committed_effect%' or message like '%keel_ack%')
  and created_at > now() - interval '14 days'
group by 1, 4 order by 1 desc;
```

**Zéro n'est pas automatiquement bon** : la ceinture a 6 conditions de désarmement nommées, dont
`disarmed_not_keel_student`. Croise avec le volume de tours élèves KEEL avant de conclure.
**Seuil d'alerte** : > 5 % des tours d'élèves KEEL sur une journée ⇒ le liage conversationnel est
cassé pour une famille de lignes (I-4, diagnostic n°2).

### M-3 — Coût LLM par élève

La marge du modèle 49 $ + 12 $/élève actif dépend directement de ce chiffre.

```sql
select date_trunc('day', ue.created_at)::date as day,
       ue.user_id,
       round(sum(ue.cost_usd)::numeric, 4) as usd,
       sum(ue.prompt_tokens) as in_tok,
       sum(ue.output_tokens) as out_tok,
       count(*) filter (where ue.operation_family = 'message_generation') as gen_calls,
       count(*) filter (where ue.model like '%pro%')                      as vision_or_pro_calls
from public.llm_usage_events ue
where ue.created_at > now() - interval '30 days' and ue.user_id is not null
group by 1,2
having sum(ue.cost_usd) > 0.50          -- le seuil qui doit réveiller quelqu'un
order by usd desc limit 50;
```

Repère mesuré : **~0,011 $/photo**, **~0,30-0,80 $/élève/mois** (3 appels réels, EXECUTION_LOG D6).
Un élève au-dessus de 2 $/mois est une boucle, pas un usage.

```sql
-- coût agrégé par famille d'opération : où part l'argent
select operation_family, count(*), round(sum(cost_usd)::numeric,2) as usd
from public.llm_usage_events
where created_at > now() - interval '30 days'
group by 1 order by usd desc;
```

### M-4 — Le contrôle du contrôle : ce qui échoue **silencieusement**

`logLlmUsageEvent` est un `try { … } catch {}` intégral (`_shared/llm-usage.ts:207`) : la
télémétrie ne casse jamais un tour — **donc elle ne prévient jamais non plus**. Trois choses
disparaissent sans un mot :

1. **Un modèle absent de `llm_pricing`** → `cost_usd = 0`, `cost_unpriced = true`. M-3 dit alors
   « tout va bien » pour la mauvaise raison. Sur un projet neuf, `llm_pricing` est **vide**
   (`db push` n'exécute pas `seed.sql`) : **tout** est à zéro (DEPLOY § 6.2).
2. **Une colonne inconnue dans l'INSERT** — typiquement `cache_read_input_tokens` : ce champ
   **n'existe pas** dans `llm_usage_events` (schéma vérifié) et n'est écrit nulle part. Le jour où
   quelqu'un l'ajoute au payload sans migration, PostgREST rejette la ligne **entière** et le
   `catch {}` avale l'erreur : **l'événement complet disparaît**, pas seulement le champ. Le coût
   se met à baisser tout seul — le pire des signaux, parce qu'il ressemble à une bonne nouvelle.
3. **Un `user_id` non résolu** → le coût existe mais n'est imputable à personne.

```sql
-- (1) modèles non tarifés
select provider, model, count(*) as events, min(created_at), max(created_at)
from public.llm_usage_events
where cost_unpriced and created_at > now() - interval '7 days'
group by 1,2 order by 3 desc;
-- attendu: 0 ligne.

-- (2) l'INSERT lui-même passe-t-il encore ? une chute brutale du volume = lignes rejetées
select date_trunc('hour', created_at) as h, count(*) as events,
       count(*) filter (where cost_usd is null or cost_usd = 0) as zero_cost
from public.llm_usage_events
where created_at > now() - interval '48 hours'
group by 1 order by 1 desc;
-- Compare `events` au nombre de tours réels (public.chat_messages). Un écart qui se creuse
-- = des lignes rejetées et avalées. C'est le seul symptôme que ce catch produise jamais.

-- (3) coût non imputable
select date_trunc('day', created_at)::date as day,
       round(sum(cost_usd)::numeric,2) as orphan_usd,
       metadata->>'user_id_resolution' as resolution
from public.llm_usage_events
where user_id is null and created_at > now() - interval '7 days'
group by 1,3 order by 1 desc;
```

**Vérification manuelle du colmatage** : si tu ajoutes un champ au payload de `logLlmUsageEvent`,
ajoute la colonne dans la même PR **et** lance la requête (2) après déploiement. Il n'existe
aucun autre signal.

---

## Annexe — variables des commandes de ce document

```bash
BASE="https://<PROJECT_REF>.supabase.co"     # local: http://127.0.0.1:54321
ANON="<anon key>"                            # local: supabase status
INTERNAL_SECRET="<INTERNAL_FUNCTION_SECRET>" # local: grep dans supabase/.env — JAMAIS la racine .env
```

Toutes les requêtes SQL de ce document sont en **lecture seule** sauf celles explicitement
marquées comme correctifs. Une lecture ne se demande à personne ; une écriture en production, si.
