# RAPPORT AGENT 7 — Tap quotidien, bout en bout

**Verdict global : AMBER** (RED avant correctifs — un P0 : la question d'axe ne
pouvait physiquement pas partir).

**Environnement**
- Supabase local (`supabase_db_Sophia_2`), edge functions servies avec
  `supabase/functions/night_llm.env` : `MEGA_TEST_MODE=0` (LLM RÉEL, signature
  X-Hub VÉRIFIÉE — aucun contournement), `EMAIL_DELIVERY_ENABLED=0`,
  `WHATSAPP_DELIVERY_ENABLED=0`, `WHATSAPP_WEB_SIMULATION_ENABLED=1`.
- Entrants simulés : POST signé HMAC-SHA256 sur `/whatsapp-webhook` avec
  `WHATSAPP_APP_SECRET`. Le chemin de production est traversé en entier
  (vérification de signature comprise).
- Horloge simulée : `{"now": …}` sur `keel-daily-pulse-v1`, toujours ≥ horloge
  réelle (réel 2026-08-03 16:15 UTC ; ticks utilisés 18:10Z, 19:10Z, 00:10Z et
  11:10Z le 08-04). `whatsapp_pending_actions` purgée avant le run.
- 10 personas `a7.*@keeltest.dev` (Paris, Londres, New York, Tokyo, sans
  timezone, `Mars/Olympus`, opted-out, plan brouillon, sans plan, actif).

> ⚠️ **Contamination inter-agents constatée.** D'autres agents QA ont tourné en
> parallèle sur la même base pendant tout le run (personas `a1/a4/a5/a6/a8/ac12`
> créés en direct, flotte oscillant entre 28 et 294 élèves, runtime edge
> saturé → réponses `upstream server` intermittentes qu'il a fallu réessayer).
> Le socle l'interdit explicitement. **Toutes** les assertions ci-dessous sont
> donc scopées à `user_id LIKE 'a7000000%'`, et les balayages de flotte ont été
> faits en `dry_run` (zéro écriture) ou avec `after_user_id` + `budget_ms: 1`
> pour ne toucher qu'un élève. Un seul débordement : un envoi est parti vers
> `a8a80000-…-000000000001` (détail et remise en état en fin de rapport).

---

## Tableau des scénarios

| # | Scénario | Attendu | Observé | Verdict | Preuve |
|---|---|---|---|---|---|
| 1 | Matrice fuseaux, tick 18:10 UTC | seuls 20h ≤ locale < 22h | `paris`→SENT, `london`/`newyork`/`tokyo`/`notz`/`mars`→`outside_window`, `optout`→`opted_out`, `noplan`→`no_active_plan` | ✅ | matrice par élève, ci-dessous |
| 1b | Fenêtre qui glisse | Londres à 19:10Z, NY à 00:10Z, Tokyo à 11:10Z | exactement ça, un élève à la fois | ✅ | 4 ticks, tableau ci-dessous |
| 1c | Sans timezone / `Mars/Olympus` | pas de crash, comptés | `outside_window` à chacun des 4 ticks, `failures: []` | ✅ | `localHourFor` rend `null` → jamais de spam sur donnée manquante |
| 2 | Round-trip complet | ligne DB + relance d'axe dans UN message + axe en base | **cassé au départ (P0-1)** ; après correctif : `overall='hard'` → 1 message `interactive_buttons` « Got it.\n\nWhat was hard? » + 3 boutons → `axis='hunger'` → « Got it, thanks. » | ✅ après fix | lignes DB relues, ci-dessous |
| 3 | CHECK `axis_coherent` | refus d'un axe sur un jour `good` | UPDATE **et** INSERT refusés | ✅ | `student_daily_checkins_axis_coherent_check` |
| 4 | Tap `good` | pas de question d'axe | ligne `good`/`axis=NULL`, un seul sortant texte « Got it 👌 », aucun bouton | ✅ | table des sortants |
| 5 | Double tap | une seule ligne, pas d'erreur élève | même wamid rejoué **et** nouveau wamid même bouton → `count=1`, webhook `{"ok":true}` deux fois | ✅ | dédup `whatsapp_inbound_dedup` + upsert `(user_id, local_date)` |
| 6 | Texte libre « so-so » | pas lu comme réponse au tap | **zéro** ligne `student_daily_checkins`, routé au dispatcher (`response_owner=normal_reply`), réponse en anglais | ✅ | transcript ci-dessous |
| 7 | **H1 — double envoi** | à prouver | **CONFIRMÉ** : 2 sortants `keel_daily_pulse` le même jour local pour un élève silencieux | 🔴→✅ | ci-dessous, corrigé |
| 8 | **H3 — plan brouillon** | à prouver | **CONFIRMÉ** : brouillon jamais adopté compté comme plan actif | 🔴→✅ | ci-dessous, corrigé |
| 9 | Opted-out | jamais rien, même dans la fenêtre | `opted_out` dans la fenêtre, **0 sortant** sur tout le run | ✅ | `count=0` |
| 10 | `dry_run: true` | décisions comptées, zéro envoi | `scanned=67, sent=4, exhausted=true` ; sortants avant=47, après=47 | ✅ | comptage avant/après |
| 11 | Activité récente | l'activité ne supprime jamais la question | élève à 4 messages entrants dont un 90 s plus tôt → question envoyée quand même | ✅ | ci-dessous |
| 12 | Hors fenêtre 24h Meta | échec réel constaté | `whatsapp-send 409: Interactive buttons require an open 24h WhatsApp window` | ⚠️ `NOT_TESTABLE_LOCALLY` | ci-dessous |
| 13 | **H7 — `safetyBand: null`** | documenté comme limitation | documenté au point d'appel (12 lignes) **et** dans STATUS-MORNING §1 + tableau des limites | ✅ | non câblé, conformément à la consigne |

### MUST

| Exigence | Verdict | Preuve |
|---|---|---|
| Jamais deux lignes pour un `(user, jour)` | ✅ | `unique (user_id, local_date)` + upsert ; scénario 5 vérifié à deux mécanismes (dédup wamid, puis upsert) |
| Accusé jamais bavard | ✅ | les trois accusés sortis en base sont exactement `Got it 👌` / `Got it.` / `Got it, thanks.` — aucun « courage », aucun rebond |
| Libellés EXACTS (template Meta) | ✅ | `How was today?` / `All good` / `So-so` / `Rough` — identiques à `META-TEMPLATES.md §1`. **Test ajouté** pour les épingler (ils n'étaient vérifiés qu'en longueur) |

---

## Preuves

### 1. Matrice des fuseaux (par élève, `dry_run`)

Attribution par **différence** : `after_user_id` ne coupe que la tête du
balayage, donc `counts(after=prédécesseur(P)) − counts(after=P)` est exactement
la décision de P. Zéro écriture.

```
TICK 2026-08-03T18:10Z            TICK 2026-08-03T19:10Z
paris   Europe/Paris     → SENT           → SENT
london  Europe/London    → outside_window → SENT
newyork America/New_York → outside_window → outside_window
tokyo   Asia/Tokyo       → outside_window → outside_window
notz    <NULL>           → outside_window → outside_window
mars    Mars/Olympus     → outside_window → outside_window
optout  Europe/Paris     → opted_out      → opted_out
draft   plan=draft       → SENT  ← H3     → SENT  ← H3
noplan  aucun plan       → no_active_plan → no_active_plan
active  Europe/Paris     → SENT           → SENT

TICK 2026-08-04T00:10Z → seul newyork SENT (20:10 locale)
TICK 2026-08-04T11:10Z → seul tokyo   SENT (20:10 locale)
```

### 2. Round-trip (après correctif P0-1)

```sql
select local_date, overall, axis, source from student_daily_checkins
where user_id='a7000000-…-000000000001';
 local_date | overall |  axis  |     source
 2026-08-03 | hard    | hunger | whatsapp_button
```
```
message_type        | content_preview          | purpose               | boutons
interactive_buttons | "Got it.\n\nWhat was hard?" | keel_daily_pulse_axis | KEEL_PULSE_AXIS_ENERGY/HUNGER/SLEEP
text                | "Got it, thanks."        | keel_daily_pulse_ack  | —
```
Un seul message porte l'accusé **et** la relance. Le second tap écrit l'axe.

### 3. Scénario 6 — le texte libre n'est pas un tap

```
user      | so-so                                                   | 16:28:26
assistant | A bit flat, then. Keep it simple tonight and don't       | 16:28:31
          | force a read on it.        response_owner=normal_reply
student_daily_checkins pour cet élève : 0 ligne
```

### 4. H1 — le double envoi (CONFIRMÉ)

Élève `a7.active`, aucune réponse. Deux ticks (20:10 puis 21:10 locales) :

```sql
select content_preview, metadata->>'purpose',
       (created_at at time zone 'Europe/Paris')::date as jour_local
from whatsapp_outbound_messages where user_id='a7000000-…-00000000000a';
 How was today? | keel_daily_pulse | 2026-08-03
 How was today? | keel_daily_pulse | 2026-08-03      ← deux fois le même jour
student_daily_checkins : 0 ligne (il n'a jamais répondu)
```

Après correctif, 3ᵉ tick le même jour :
`{"sent":0,"skipped_by_reason":{"already_asked_today":1}}` — le compteur reste
à 2 sortants.

### 5. H3 — le plan brouillon (CONFIRMÉ)

`a7.draft` a une ligne `student_week_plans` `status='draft'`, jamais adoptée.
Décision avant correctif : **SENT**. Le point hebdomadaire, lui, filtrait déjà
`status='adopted'` (`keel-weekly-flow-v1/index.ts:204`) : les deux surfaces ne
donnaient pas le même sens à « avoir un plan ».
Après correctif : `no_active_plan`.

### 6. Scénario 11 — l'activité ne supprime jamais la question

`a7.newyork` : 4 messages entrants, le dernier 90 s avant le tick.
Tick à sa fenêtre (00:10Z = 20:10 locale) → `sent: 1`, ligne
`How was today? | keel_daily_pulse` en base. Tick suivant (21:10 locale) →
`already_asked_today`. L'activité change le canal, jamais la question.

---

## Findings par gravité

### P0-1 — La question d'axe ne pouvait PAS partir (corrigé)

`createWhatsAppOutboundRow` accepte `message_type: 'interactive_buttons'` depuis
N2 (l'union TypeScript a été élargie, commentaire à l'appui). Le CHECK SQL de
`whatsapp_outbound_messages`, lui, est resté à `('text','template')`.

Chaîne observée, mesurée : tap « Rough » → `student_daily_checkins.overall='hard'`
écrit ✅ → `sendPulseReply` → `sendWhatsAppButtonsTracked` →
`createWhatsAppOutboundRow` → **INSERT refusé** → exception avalée par le
`try/catch` de `sendPulseReply` (« un échec d'accusé ne doit pas faire échouer le
webhook ») → **l'élève ne reçoit rien**. Ni accusé, ni question d'axe.

Reproduit à froid :
```
ERROR: new row for relation "whatsapp_outbound_messages" violates check
constraint "whatsapp_outbound_messages_message_type_check"
```

Conséquences : la colonne `axis` n'était **jamais** renseignée par qui que ce
soit — c'est-à-dire que la moitié utile du tap (« quand ça coince chez Julie,
c'est la faim 4 fois sur 5 ») n'existait pas. Et l'asymétrie est cruelle : « All
good » passe par le chemin texte et répond ; seul celui qui dit que sa journée a
été dure est ignoré.

Pourquoi c'était invisible : chaque côté est correct lu seul, et aucun test ne
traversait `createWhatsAppOutboundRow` avec ce type. C'est la classe de défaut
n°1 du dépôt vue en miroir — d'habitude un test vert sur un chemin que la
production ne prend pas ; ici la production prend un chemin qu'aucun test ne
prend.

**Fix** : `20260804090000_pivot_outbound_interactive_buttons.sql` (CHECK élargi
aux trois valeurs, assertion `fail loud`). Round-trip re-testé vert.

### P1-1 — Le tap était rangé au jour UTC, pas au jour de l'élève (corrigé)

Le webhook lisait le profil sans jamais sélectionner `timezone` :
`keelLocalDateForUser` retombait donc **toujours** sur la date UTC.

Mesuré : tap Tokyo à 01h34 locale (2026-08-04) → ligne écrite au **2026-08-03**.
Le job du soir, lui, calcule bien la date locale : il interrogeait le 08-04,
n'y trouvait rien, et **reposait la question** —
`{"sent":1}` alors que l'élève venait de répondre.

Portée réelle : pour tout le continent américain, la fenêtre 20h-22h locale
tombe entre 00h et 02h UTC. Le décalage y était **systématique, à chaque tap** :
donnée rangée au mauvais jour et garde `already_answered_today` désarmée.

**Fix** : `timezone` ajoutée à la liste de colonnes du webhook, et les **trois**
copies de « quel jour est-on pour cet élève » (job, weekly flow, webhook)
ramenées à une seule — `localDateFor` dans `_shared/keel/reengagement_io.ts`.
Re-testé : tap Tokyo → `local_date = 2026-08-04` ✅, et la garde du job mord
maintenant (`already_answered_today`).

### P1-2 — H1, le double envoi (corrigé)

La fenêtre fait deux heures, le cron est horaire : deux ticks dedans. La seule
garde était `already_answered_today`, qui ne bouge que si l'élève **répond**.
L'élève silencieux — précisément celui qu'on ne veut pas harceler — recevait la
même question à 20h10 puis à 21h10.

**Fix** : garde `already_asked_today`, fondée sur les **messages sortants** du
jour local (`purpose='keel_daily_pulse'`), pas sur la réponse. C'est la seule
trace de « on a demandé » quand personne ne répond.
- Champ `askedToday` **requis** dans `PulseDecisionInput` (pas optionnel : ce
  dépôt a un incident documenté de garde optionnelle jamais renseignée).
- Aucun filtre sur `status` : un envoi `failed` reste une question posée, et le
  worker de retry reprend la même ligne. Les refus de préflight n'écrivent
  aucune ligne, donc ne bloquent rien — vérifié sur le 409 du scénario 12.
- Rattachement au jour fait dans le fuseau de l'élève, avec la même fonction que
  celle qui calcule `localDate`.
- Ordre : `already_answered` **avant** `already_asked`. Les deux coupent au même
  endroit, mais « il a répondu » et « on l'a sollicité en vain » sont deux
  journées différentes pour le coach, et le compteur du job est ce qui les
  distingue.

### P1-3 — H3, le plan brouillon (corrigé)

`student_week_plans` était lu sans filtre de statut : un plan généré et jamais
adopté comptait comme plan actif. L'élève qui a regardé une proposition sans la
prendre recevait « How was today? » tous les soirs. `no_active_plan` — « rien à
suivre, rien à demander » — ne mordait pas.

**Fix** : `.eq("status", "adopted")`, aligné sur le point hebdomadaire.

### P2-1 — Le tap ne peut pas atteindre un élève silencieux (NON corrigé, voir plus bas)

`whatsapp-send` refuse `interactive_buttons` hors fenêtre 24h Meta, sans repli
template :
```
whatsapp-send 409: Interactive buttons require an open 24h WhatsApp window
```
Le refus est **sain** (le repli aveugle sur `global_reach` est l'incident de
juillet). Mais la conséquence produit l'est moins : **le tap du soir n'atteint
aujourd'hui que les élèves qui ont écrit dans les 24 h** — alors qu'il est fait
pour mesurer la vivabilité chez ceux qui se taisent. Le template
`keel_daily_pulse_v1` existe en spec mais n'est pas soumis à Meta. Rien à
corriger en code : c'est le câblage template + la soumission Meta qui manquent.

### P3-1 — Un axe répondu après minuit local est perdu (NON corrigé)

`writePulseAxis` cherche la ligne du jour **au moment du second tap**. Question
posée à 20h10, réponse à 00h05 → le niveau est sur J, l'axe cherché sur J+1 →
`no_pending_level_for_today`, axe perdu en silence. Fenêtre étroite mais réelle.
Fix possible : ancrer l'axe sur la ligne du niveau via `context.id` du bouton,
ou prendre la dernière ligne en attente d'axe des 24 h. C'est un arbitrage sur
« à quel jour appartient un axe » — proposition écrite, pas d'édit.

### P3-2 — Le compteur de raisons diverge du contrat de l'ordre des gardes

Le job pré-filtre la fenêtre **avant** d'appeler le décideur (« le filtre le
moins cher »). Un élève opted-out hors fenêtre est donc compté `outside_window`
et non `opted_out`. Comportement identique (skip dans les deux cas), seule
l'attribution ment. Laissé tel quel : le pré-filtre économise 3 requêtes DB par
élève écarté, ce qui est le bon arbitrage à l'échelle d'une flotte. À savoir en
lisant les compteurs.

---

## Fixes appliqués

| Fichier | Changement | Test |
|---|---|---|
| `supabase/migrations/20260804090000_pivot_outbound_interactive_buttons.sql` | **nouveau** — CHECK `message_type` élargi à `interactive_buttons`, assertion `fail loud` | round-trip réel re-testé vert (P0-1) |
| `whatsapp-webhook/index.ts` | `timezone` ajoutée aux colonnes du profil ; `keelLocalDateForUser` délègue à `localDateFor` | tap Tokyo → `local_date=2026-08-04` (P1-1) |
| `_shared/keel/reengagement_io.ts` | `localDateFor` exportée (fin des 3 copies) | 79 tests webhook + 512 tests keel verts |
| `_shared/keel/daily_pulse.ts` | garde `already_asked_today`, champ `askedToday` **requis** | `daily_pulse_test.ts` : 3 tests dont **prémisse-fausse** |
| `_shared/keel/daily_pulse_io.ts` | `wasPulseAskedToday` (sortants du jour local) | `daily_pulse_io_test.ts` : **nouveau**, 6 tests |
| `keel-daily-pulse-v1/index.ts` | `askedToday` câblé ; `student_week_plans` filtré `status='adopted'` ; `localDateFor` partagée | matrice re-jouée : `draft→no_active_plan`, `active→already_asked_today` |
| `_shared/keel/daily_pulse_test.ts` | libellés Meta épinglés au caractère près | ils n'étaient vérifiés qu'en longueur |

**Conditions de désarmement** (R : toute ceinture porte la sienne) :
`already_asked_today` ne mord que si un sortant `keel_daily_pulse` existe dans
le jour **local** de l'élève. Trois tests prémisse-fausse : rien envoyé →
`send` ; envoyé hier → `send` ; accusé/relance d'axe (`_ack`, `_axis`) →
ne ferment PAS la journée.

**Re-run** : `deno test _shared/keel/` → **512 passed, 0 failed**.
`deno test whatsapp-webhook/` → **79 passed, 0 failed**.
`deno check keel-daily-pulse-v1/index.ts _shared/keel/daily_pulse_io.ts` → OK.

⚠️ La migration a été appliquée **en local uniquement** (`psql` + ligne dans
`supabase_migrations.schema_migrations`). Aucun `db push`, aucun `deploy`.
**Elle reste à pousser en distant**, et sans elle le correctif P0-1 n'existe pas
en production.

---

## Fixes proposés NON appliqués

1. **Template `keel_daily_pulse_v1` chez Meta + branche de repli** (P2-1). Sans
   ça le tap n'atteint que les élèves déjà en conversation. Décision produit +
   soumission Meta, pas une ligne de code.
2. **Ancrage de l'axe sur la ligne du niveau** (P3-1). Demande de trancher « à
   quel jour appartient un axe répondu après minuit ».
3. **Garde crise (H7)**. Conforme à la consigne : vérifiée comme documentée, pas
   câblée. `safetyBand: null` est une **déclaration** (12 lignes de commentaire
   au point d'appel) et la limitation est reprise dans `STATUS-MORNING.md` §1 et
   dans le tableau des limites. La câbler demande de décider où l'état de crise
   se persiste — aucune table ne le porte aujourd'hui.
4. **Purpose de l'accusé du point hebdo** : `renderWeeklyFlowAck` part sous
   `purpose='keel_daily_pulse_ack'` (observé sur un persona de l'agent 8). Sans
   effet sur la garde ajoutée ici (elle filtre `keel_daily_pulse` strictement, et
   un test le verrouille), mais le libellé est faux. Domaine agent 8.

---

## NOT_TESTABLE_LOCALLY

| Quoi | Pourquoi | Comment le prouver en réel |
|---|---|---|
| Envoi hors fenêtre 24h | template `keel_daily_pulse_v1` non soumis ; `whatsapp-send` rend 409 et n'a pas de branche template pour ce purpose | soumettre le template, câbler la branche, puis vérifier qu'un élève muet depuis 48 h reçoit bien les 3 boutons |
| Libellés Meta au caractère près | comparés à la spec `META-TEMPLATES.md`, pas au template approuvé | relire les libellés dans le Business Manager après approbation |
| `payload` des boutons de template | fourni à l'envoi, pas testable sans template | vérifier qu'un tap revient en `messages[].button.payload = KEEL_PULSE_*` |
| Statut de livraison réel | `WHATSAPP_DELIVERY_ENABLED=0` : les lignes valent `sent`/`skipped` par simulation | run réel avec livraison activée |

---

## Remise en état / traçabilité

- Un envoi `keel_daily_pulse` est parti vers `a8a80000-…-000000000001` (persona
  agent 8) : la nouvelle garde a fait sauter mon élève cible, et la boucle a
  continué jusqu'au suivant (le contrôle de budget n'est atteint qu'après un
  envoi, jamais après un skip). Les deux lignes créées
  (`whatsapp_outbound_messages` + `chat_messages`) ont été **supprimées
  nominativement**. Non restaurable : `profiles.whatsapp_last_outbound_at` de ce
  persona a été touché (valeur précédente inconnue) — à savoir si l'agent 9
  (relance) travaille sur cette flotte.
- Personas `a7.*` laissés en place pour rejouabilité. Nettoyage :
  `delete from auth.users where email like 'a7.%@keeltest.dev';`
