# QA AGENT 9 — `keel-reengage-v1` : relance d'inactivité & conversation de retour

**Date** : 2026-08-03 · **Environnement** : Supabase local, LLM réel (gpt-5.4-mini),
`WHATSAPP_DELIVERY_ENABLED=0` (simulation web, aucun message réel n'est parti chez Meta).

**Statut** : 6 défauts trouvés, **6 corrigés et revalidés en conditions réelles**.

**Fixtures** : [`agent-9-fixtures.sql`](agent-9-fixtures.sql) — 8 élèves + 1 coach,
UUID préfixés `f9f9…` au-dessus de toutes les personas existantes, chaque appel du job
portant `after_user_id: 'f0000000-…'` pour ne pas croiser les runs QA concurrents.
*(Un élève d'un autre agent, `a13.full` / `faf20bcd…`, est apparu en cours de run au-dessus
de ce curseur : les agrégats `skipped_by_reason` peuvent l'inclure, jamais les conclusions —
chaque verdict est adossé à une ligne DB nominative.)*

---

## Verdict d'ensemble

La **mécanique de décision était juste** — seuil, ancrage, heures calmes, unicité et course
étaient tous verts au premier passage, et les deux invariants de spam tiennent.

Mais **la boucle n'existait pas de bout en bout**. Le job ouvrait un épisode, écrivait
`touch1_sent_at`, et **n'envoyait rien** : aucun composeur, aucun outbound, aucun
consommateur de sa réponse HTTP. Comme rien ne refermait l'épisode côté KEEL, chaque tick
mettait l'élève hors de la boucle jusqu'au cap de 30 jours du sweep — qui le classait alors
`no_reply` alors qu'il avait répondu.

| # | Scénario | Avant | Après |
|---|---|---|---|
| 1 | 71h → rien / 73h → nudge | 🟢 | 🟢 |
| 2 | Ancrage sur l'entrant | 🟢 | 🟢 |
| 3 | Heures calmes → différé | 🟢 | 🟢 |
| 4 | Un seul nudge par épisode | 🟢 | 🟢 |
| 5 | Course : deux ticks → un épisode | 🟢 | 🟢 |
| 6 | Réponse → clôture → nouvel épisode, ton suivant | 🔴 R2 + R4 | 🟢 |
| 7 | `restriction_flag` → skip | 🔴 R3 | 🟢 |
| 8 | Hors fenêtre Meta 24h | ⚪ | ⚪ `NOT_TESTABLE_LOCALLY` (template non soumis) |
| 9 | `safetyBand: null` documenté | 🟢 | 🟢 |
| 10 | Texte du nudge | 🔴 R1 | 🟢 |
| 11 | Retour après relance | 🟢 | 🟢 |
| 12 | Retour fâché → opt-out | 🟢 fond / 🔴 R6 langue | 🟢 |

---

## R1 — le job n'envoyait aucun message · **CORRIGÉ**

**Le défaut.** Aucun appel à `whatsapp-send`. `toneInstruction()` n'avait qu'un appelant en
production — la réponse HTTP du job, que `net.http_post` jette. `assertNoGuiltTripping()`
n'était appelée **nulle part** hors tests. Preuve : 6 élèves armés sur 4 ticks réels →
**0 outbound** issu du job.

Aggravant : l'épisode portait `touch1_sent_at = <heure du tick>`, écrit à l'ouverture. Le
ledger affirmait qu'une touche était partie **avant tout envoi**.

**Le correctif.**
- `sendReengageNudge()` ([`reengagement_io.ts`](../../../supabase/functions/_shared/keel/reengagement_io.ts))
  envoie un **template nommé** (`keel_reengage_v1`, `{{1}}` = prénom), jamais du texte libre.
  À 72h la fenêtre 24h est fermée **par construction** — c'est un entrant qui l'ouvre, et le
  seuil dit qu'il n'y en a pas eu. `type: "text"` aurait laissé le repli de `whatsapp-send`
  choisir, et un purpose non mappé tombe sur `global_reach_template` (« J'ai une info pour
  toi », en français) : l'incident du 2026-07-12, mais **systématique** au lieu d'accidentel.
- Mapping `keel_reengage` ajouté dans `getFallbackTemplate`
  ([`whatsapp-send/index.ts`](../../../supabase/functions/whatsapp-send/index.ts)) — ceinture
  pour tout autre appelant.
- `renderReengageNudge(firstName)` garde le corps exact du template, **pour que la ceinture
  anti-culpabilisation ait prise sur ce qui part réellement**. Elle tourne avant chaque envoi.
- `touch1_sent_at` n'est plus posé qu'après un `whatsapp-send` accepté
  (`markReengagementTouchSent`). Sur échec **observé** d'avant-livraison, l'épisode est
  supprimé (`rollbackReengagementEpisode`) : l'élève reste relançable.
- `sent` (messages acceptés) et `armed` (élèves retenus) sont désormais **deux nombres
  distincts**, et `failures` porte l'écart. Ils étaient le même nombre — c'est exactement ce
  qui rendait la panne invisible.

**Ce que ça coûte, dit franchement** : ce message n'est pas dans la voix du coach, il est
neutre. Un template est un texte figé approuvé par Meta ; composer ici serait du code mort.
La voix du coach revient au **tour suivant**, quand l'élève répond — et ce tour-là est vert
(scénario 11).

**Revalidation** — tick réel, 5 relances :

```
sent: 5 | armed: 5 | failures: []
whatsapp_outbound_messages → 5 × message_type=template, purpose=keel_reengage,
                                 template_name=keel_reengage_v1
```

---

## R2 — l'épisode ne se refermait jamais · **CORRIGÉ**

**Le défaut.** Les trois fermetures existantes sont câblées au winback legacy, et son flow
« n'a pas d'entrée fraîche par signal ». Aucun chemin KEEL ne refermait l'épisode.

Prouvé bout en bout : tick → épisode ouvert → l'élève répond pour de vrai (LLM réel) →
`closed_at` null → tick **73h après sa réponse** → `already_nudged_this_episode`.

**Magnitude exacte** (correction d'une première rédaction qui disait « plus jamais ») : le
sweep de `process-checkins` balaie tous les épisodes ouverts, sans filtre de rôle. Il ferme
donc l'épisode KEEL — mais seulement au cap de 30 jours
(`REENGAGEMENT_STALE_OPEN_CLOSE_DAYS`), ou plus tôt si l'élève passe **sur le site**. Il ne
le ferme jamais sur une réponse WhatsApp, par conception (« le sweep ne CLASSE JAMAIS une
réponse conversationnelle »). Donc : **jusqu'à 30 jours d'exclusion**, terminés par un
`exit_status = 'no_reply'` sur quelqu'un qui avait répondu. Vérifié en rejouant le décideur
de sweep à J+17 (`keep`) et J+33 (`close / no_reply`).

**Le correctif.**
- Migration [`20260804110500_reengagement_episodes_source.sql`](../../../supabase/migrations/20260804110500_reengagement_episodes_source.sql) :
  colonne `source` (`winback_daily_bilan` | `keel_reengage`) + index partiel. Sans marqueur
  d'origine, un closer KEEL couperait l'escalade 3-touches du winback legacy en plein milieu.
- `closeKeelReengagementEpisodeOnInbound()` appelée par le webhook **à chaque inbound**, juste
  après l'écriture du message et **avant tout routage** : la clôture ne doit dépendre ni du
  handler qui répondra ni du fait qu'il y ait une réponse. C'est le silence qui a ouvert
  l'épisode ; il n'y a plus de silence.
- Un STOP ferme aussi, mais en `stopped` — un opt-out n'est pas un réengagement réussi, et
  la synthèse du coach le compte.

**Revalidation** :

| Étape | Résultat |
|---|---|
| Nour reçoit la relance | épisode `keel_reengage` ouvert, `touch1_sent_at` posé |
| Nour répond « sorry, rough week » | `closed_at` posé, `exit_status=reengaged`, `first_reply_at`, `entry_kind=replied_to_template` |
| +84h de silence, tick de jour | **2ᵉ épisode ouvert, 2ᵉ relance envoyée** |
| Épisode `winback_daily_bilan` (step 2) + inbound | **intact** (`closed_at` null) — l'isolation tient |

---

## R3 — la garde TCA était désarmée · **CORRIGÉ**

`restrictionFlag: false` en dur, sous un commentaire affirmant qu'il « EST câblé et mord
réellement ». A/B sur le même élève, la même ligne `weekly_reviews` : `keel-weekly-flow-v1`
écartait, la relance armait.

**Le correctif.** `isRestrictionFlagged()` déplacée dans le module partagé et importée par
les **deux** jobs ; la copie locale de `keel-weekly-flow-v1` est supprimée. Deux lecteurs
pour un plancher clinique, c'est un lecteur de trop. Une lecture qui échoue **remonte** :
rater une relance coûte une relance, rater le plancher TCA envoie de la pression d'adhérence
à quelqu'un qu'il faut laisser tranquille.

**Revalidation** : `skipped_by_reason: {"restriction_flag": 1}` — Lena est écartée. Elle
était armée.

---

## R4 — `lighter` était inatteignable · **CORRIGÉ**

`declaredHardWeek` était figé à `false`, donc le ton valait toujours `gentle`. Démonstration :
`a9.hardweek`, dont le dernier message était littéralement « rough week honestly », était
armée en `gentle`.

**Le correctif.**
- `hasDeclaredHardWeek()` lit `student_daily_checkins.overall = 'hard'` — une réponse de
  l'élève à « How was today? », donc une **déclaration**, pas une inférence d'humeur. On ne
  déduit rien d'un `biofeedback.mood` bas : `lighter` adoucit le ton sur ce que l'élève a dit.
- **Deux jours, pas un** : un seul mauvais jour est dans la variance d'un rythme normal —
  même raisonnement que le seuil 72h-plutôt-que-48h de ce module.
- `warm_return` **n'est pas** un ton de job, et c'est désormais dit par le type :
  `ReengageDecision` rend un `JobReachableTone` (`gentle` | `lighter`). C'est la posture du
  tour de RETOUR ; aucun cron ne peut la décider, l'événement qui la déclenche est un message
  entrant.
- Le ton est **décidé et écrit au ledger**, mais un ton ne change le message que si Meta a
  approuvé un second template — et `META-TEMPLATES.md` a tranché l'inverse (« commencer avec
  le seul `gentle` »). `reengageTemplateFor()` rend donc `toneDelivered: false` et le job
  compte `tone_not_delivered`, au lieu de laisser croire qu'un ton adouci est parti. Le jour
  où un template `lighter` est approuvé : un secret, pas une ligne de code.

**Revalidation** : Rae est armée en `tone: "lighter"`, et le tick réel rapporte
`tone_not_delivered: 1`.

---

## R6 — la confirmation d'opt-out était bilingue · **CORRIGÉ**

**Le défaut.** [`handlers_optout.ts`](../../../supabase/functions/whatsapp-webhook/handlers_optout.ts)
codait en dur une consigne française qui **citait la phrase à produire** :
`Confirme clairement: "Sophia ne te contactera plus sur WhatsApp"`. Le modèle recopiait la
citation et rédigeait le reste en anglais :

> « Sophia ne te contactera plus sur WhatsApp. You can pick this back up from the website. »

*(Correction d'une première rédaction : « Sophia » n'est **pas** une marque abandonnée —
`brand.wordmark` vaut toujours « Sophia » dans l'i18n KEEL. Le défaut est la langue, pas le
nom.)*

**Le correctif.** La consigne décrit une **intention** et ne dicte plus aucune surface ; la
langue vient de `resolveResponseLocale` et le bloc `RESPONSE_LANGUAGE` est appendu **en
dernier** (la récence l'emporte chez les modèles ; ce dépôt a déjà payé l'oscillation de
langue). La règle qui en sort vaut pour toutes les consignes de ce webhook : **dès qu'une
phrase de sortie est écrite entre guillemets, une langue est codée en dur sans que la revue
le voie** — un test l'interdit désormais.

**Revalidation**, tour réel :

> « We won't message you on WhatsApp any more. You can pick things back up on the website
> whenever you want. »

Et l'opt-out reste tenu : `whatsapp_opted_in=false`, épisode clos `stopped`, et
reengage/pulse/weekly écartent tous l'élève ensuite.

---

## R7 / scénario 9 — `safetyBand: null` : la limitation **est** documentée

Déclarée explicitement au point d'appel (« DÉCLARATION, PAS OUBLI »). L'exigence H7 est
tenue. Reste le fait, qu'il faut dire : `decideReengagement` fait `input.safetyBand ?? "none"`,
donc la garde crise — délibérément placée en n°2 dans l'ordre des gates — **ne mord sur aucun
élève**. La câbler demande de décider **où l'état de crise s'écrit** : une décision de
conception, pas une ligne de code. C'est la seule des sept remontées qui reste ouverte, et
elle est identique dans `keel-daily-pulse-v1`.

*(Constat connexe, hors périmètre : `keel-daily-pulse-v1` ne contient aucune occurrence de
`restriction` — le pulse ignore lui aussi la garde TCA. `grep -c restriction` : pulse 0,
weekly 3, reengage désormais câblé.)*

---

## Le détail des scénarios verts

### 1 — Seuil
`a9.threshold`, dernier entrant `2026-07-31T13:00Z`. À 71h → **pas même candidat** (la
précoupe SQL importe `REENGAGE_AFTER_HOURS`, il n'y a qu'un seul nombre). À 73h → armé.

### 2 — Ancrage sur l'entrant (test serré)
Dernier **entrant** à −102h, dernier **sortant** à **−1 minute** du tick → armé,
`hours_silent: 102`. Un sortant, même immédiat, ne réarme pas le compteur : Sophia ne se
relance pas elle-même.

### 3 — Heures calmes
`Asia/Tokyo` : à 21:00 locales → `deferred_quiet_hours`, **pas** un skip ; à 08:30 le
lendemain → armé. Le même tick met les Londoniens (00:30) en différé — la décision suit bien
l'heure **locale**.

### 4 — Un seul nudge par épisode
Tick 2 (même `now`) et tick 3 (+1h) → `armed: 0`, `already_nudged_this_episode`, **aucune
ligne nouvelle**. C'est l'état en base qui borne la relance, pas la fréquence du cron.

### 5 — Course
Deux appels parallèles sur le **même `now`** → A `armed: 1`, B `episode_open_failed: 1`, **un
seul épisode**. L'index partiel `reengagement_episodes_one_open_per_user` attrape le
fetch-then-insert, et le code échoue fermé.

### 11 — Le retour après la relance (LLM réel)
> « That sounds properly full-on — rough week and completely swamped is a lot to carry. No
> need to force a big update; if you want, you can just leave it there and I'll keep it light. »

Zéro culpabilisation, zéro « où étais-tu », zéro récap chiffré, **zéro question** (borne : une
max), initiative laissée à l'élève. **Le retour n'est pas puni.**

### 8 — Hors fenêtre Meta (`NOT_TESTABLE_LOCALLY`)
À 72h l'élève est **toujours** hors fenêtre : l'envoi réel exige `keel_reengage_v1`, non
soumis à Meta (priorité 1 dans `META-TEMPLATES.md`, « le seul qui n'a **aucune**
alternative »). En local `WHATSAPP_DELIVERY_ENABLED=0`. Le chemin de code, lui, est
désormais complet et testé jusqu'à `whatsapp-send`.

---

## Ce qui reste à faire (hors code)

1. **Soumettre `keel_reengage_v1` à Meta.** Sans lui, aucune relance ne part en production :
   le job enverra, `whatsapp-send` construira le template, et Graph refusera. C'est le seul
   bloquant restant de la boucle.
2. **Vérifier `{{1}}` sur un vrai téléphone** avant d'ouvrir la vanne — le dépôt porte deux
   incidents de paramètre mal câblé.
3. **Décider où s'écrit l'état de crise** (R7), pour `keel-reengage-v1` *et*
   `keel-daily-pulse-v1`.
4. Optionnel : template `lighter`, activable par
   `WHATSAPP_KEEL_REENGAGE_TEMPLATE_NAME_LIGHTER` sans toucher au code.

---

## Reproduire

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < docs/nutrition-pivot/qa/agent-9-fixtures.sql
```

```bash
deno test --no-check --allow-all supabase/functions/_shared/keel/ supabase/functions/whatsapp-webhook/
```

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/keel-reengage-v1 -H 'content-type: application/json' -H "x-internal-secret: $INTERNAL_FUNCTION_SECRET" -d '{"now":"2026-08-03T14:00:00Z","dry_run":true,"after_user_id":"f0000000-0000-0000-0000-000000000000"}'
```

**Note d'environnement** : l'edge runtime local est tombé une dizaine de fois pendant ce run
(plusieurs agents QA en parallèle sur le même conteneur). Chaque appel de conversation a été
relancé après vérification que le runtime répondait ; aucun verdict ne repose sur un tour
interrompu.
