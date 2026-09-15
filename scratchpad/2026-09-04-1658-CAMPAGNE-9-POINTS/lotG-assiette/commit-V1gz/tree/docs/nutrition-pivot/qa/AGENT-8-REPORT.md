# RAPPORT AGENT 8 — Point hebdo (WhatsApp Flow), bout en bout

**Verdict global : RED** (3 P0 trouvés, tous corrigés et re-prouvés ; le
domaine était intégralement mort avant ce run).

**Environnement**
- Base locale `supabase_db_Sophia_2`, edge functions servies avec un env
  dédié : `MEGA_TEST_MODE=0` (LLM réel, signature X-Hub vérifiée),
  `EMAIL_DELIVERY_ENABLED=0`, `WHATSAPP_DELIVERY_ENABLED=0`,
  `KEEL_WEEKLY_FLOW_ID=1122334455667788` (identifiant FACTICE — aucun Flow
  n'est publié chez Meta).
- Horloge simulée toujours ≥ horloge réelle : dimanches 2026-08-09,
  2026-08-16, 2026-08-23, 2026-10-04, 2026-10-11. Réel = 2026-08-03 (lundi).
- Injection des réponses : `nfm_reply` POSTé au webhook local avec une
  signature `x-hub-signature-256` VALIDE — donc le chemin traversé est celui de
  production (même vérification, même parseur, même routage), pas un bypass.
- 5 personas `a8a80000-…0001..0005` (normal / restriction_flag / plan
  brouillon / opted-out / Asia-Tokyo), coach `nadia.coach.audit`.
- **Attribution par élève** : chaque décision est isolée avec
  `after_user_id` = prédécesseur + `budget_ms: 1`, ce qui borne le run à un
  seul élève (`scanned: 1`). Les agrégats de flotte étaient inutilisables :
  jusqu'à 5 autres agents QA écrivaient dans la même base pendant ce run
  (289 élèves, dont une flotte `a14-fleet-*` apparue en cours de route). Voir
  « Incident d'environnement » en fin de rapport.

---

## Tableau des scénarios

| # | Scénario | Attendu | Observé | Verdict | Preuve |
|---|---|---|---|---|---|
| 0 | Le job tourne | décide, rapporte | **500 `[object Object]`, 0 élève examiné** | **RED→VERT** | `{"ok":false,"error":"[object Object]"}` ; cause : `column profiles.content_locale does not exist` (42703) |
| 1a | Sans `KEEL_WEEKLY_FLOW_ID` | 100 % `flow_not_configured`, 0 envoi | `flow_configured:false, sent:0, flow_not_configured:8` sur 39 examinés | VERT | tick 2026-08-09T17:00Z |
| 1b | Avec un id factice (corps ET env) | décision `send` | `scanned:1, sent:1` ; payload Graph porte `flow_id=1122334455667788`, `flow_token=KEEL_WEEKLY_2026-09-28`, CTA `Take the check-in` | VERT | `graph_payload.interactive.action.parameters` |
| 2 | Plancher TCA (`risk_band='restriction_flag'`) | skip `restriction_flagged` | `{"restriction_flagged":1}` | VERT | tick isolé sur persona 2 |
| 3 | Plan brouillon (non adopté) | skip `no_active_plan` | `{"no_active_plan":1}` | VERT | tick isolé sur persona 3 |
| 3b | Opt-out | skip `opted_out` | `{"opted_out":1}` | VERT | tick isolé sur persona 4 |
| 3c | Asia/Tokyo pendant le soir de Paris | skip `outside_window` | `{"outside_window":1}` | VERT | tick isolé sur persona 5 |
| **4 (H2)** | 3 ticks 18:40/19:40/20:40 même dimanche | 1 seule sollicitation | **3 lignes `whatsapp_outbound_messages` `status='sent'`** | **RED→VERT** | 3 lignes avant fix ; 1 ligne + `already_asked_this_week:1` ×2 après |
| 5 | Réponse complète (6 axes + 78.4 + 86) | 1 ligne, biofeedback complet, accusé sans chiffre | **0 ligne, 0 accusé** (42P10 sur l'upsert) puis, après fix : 1 ligne exacte + « Got it — thanks for taking the two minutes. » | **RED→VERT** | `biofeedback = {mood:4, sleep:2, energy:4, hunger:3, training:3, digestion:5, waist_cm:86, weight_kg:78.4, source:"whatsapp_flow"}`, `plan_version_id` NULL, `content_locale=en-GB` |
| 6 | Virgule décimale « 78,4 » / « 85,5 » | 78.4 / 85.5 | 78.4 / 85.5 | VERT | ligne semaine 2026-08-10 |
| 7 | Hors bornes (poids 500, energy 9, hunger 0, waist 12) | écartés ET nommés, jamais ramenés au bord | 4 valeurs absentes de la ligne, 0 clamp, log nominatif | VERT | `keel.weekly_flow.issues` : `energy: 9 is outside 1-5, dropped` · `weight_kg: 500 is outside 25-400, dropped as a typo` … |
| 8 | Numbers vides | les 6 axes comptent | 6 axes écrits, ni `weight_kg` ni `waist_cm` | VERT | ligne semaine 2026-08-24 |
| 9 | Renvoi du formulaire | MERGE, jamais 2e ligne | 1 ligne ; axes mis à jour 1→5, `weight_kg`/`waist_cm` de la 1re soumission préservés | VERT | 2 injections semaine 2026-09-07 |
| 9b | INSERT SQL direct en double | refusé par l'index partiel | `duplicate key value violates unique constraint "weekly_reviews_user_week_no_plan_uidx"` | VERT | psql direct |
| 10a | Jeton d'une AUTRE semaine (`KEEL_WEEKLY_2020-01-06`) | écrit chez L'EXPÉDITEUR, jamais chez autrui | ligne créée pour l'expéditeur seul ; 0 ligne chez la cible | VERT | voir « sécurité du jeton » |
| 10b | Jeton malformé contenant l'uuid d'un autre élève | ignoré proprement, pas de crash | HTTP **200**, 0 ligne victime, 0 ligne expéditeur, 0 réponse, `keel.weekly_flow.unusable_token` | **RED→VERT** | avant fix : le JSON de formulaire retombait chez le handler d'onboarding, qui répondait à l'élève **en français** |
| 11 | `response_json` corrompu (non-JSON / `[]` / `null`) | dégradation sans crash, JAMAIS conversé | 3× HTTP 200, 0 `chat_messages`, 0 réponse | VERT | 3 injections |
| 11b | Jeton valide + champs malformés (`["3"]`, `{"v":2}`, `["80"]`) | écartés ET nommés | **`["80"]` devenait 80 kg** ; après fix : `weight_kg: ["80"] is not a form value, dropped`, le reste de la semaine survit | **RED→VERT** | `keel.weekly_flow.issues` |
| 12 | `/app/progress` reflète le point | poids affiché, régularité d'abord, poids en dernier | **carte poids vide pour toujours** (l'écran lisait `outcomes.weight_7d_avg`, que personne n'écrit) ; ordre des cartes correct | **RED→VERT** | requête RLS élève : `outcomes` NULL partout, `biofeedback.weight_kg` renseigné |

### Les trois MUST du prompt

| MUST | État | Preuve |
|---|---|---|
| Une ligne par (élève, semaine) quoi qu'il arrive | **TENU** | renvoi du formulaire → 1 ligne ; INSERT direct en double → rejeté par l'index partiel |
| Zéro chiffre dans l'accusé | **TENU** | « Got it — thanks for taking the two minutes. » ; test `the ack returns no number to the student` |
| Le jeton ne porte jamais d'identité | **TENU** | jeton observé sur le fil : `KEEL_WEEKLY_2026-09-28` ; jeton d'une autre semaine → écrit chez l'expéditeur ; jeton contenant l'uuid d'autrui → 0 écriture chez la cible |

---

## Findings par gravité

### P0-1 — Le job ne pouvait examiner AUCUN élève (colonne inexistante)

`keel-weekly-flow-v1` sélectionnait `profiles.content_locale`. **Cette colonne
n'existe pas.** PostgREST rendait `42703` dès la première page, `throw error`
remontait, le job répondait 500 — et il n'a donc jamais examiné un seul élève
depuis sa création. Toutes les gardes en aval — opt-out, crise, plancher TCA,
plan actif, fenêtre — étaient du **code mort derrière un SELECT cassé**, avec
leurs tests unitaires bien verts. `keel-daily-pulse-v1`, lui, avait la bonne
liste : les deux crons avaient divergé sur une simple chaîne.

Preuve : `{"ok":false,"error":"[object Object]"}` puis, en rejouant la requête
seule : `{"code":"42703","message":"column profiles.content_locale does not exist"}`.
Après fix : `scanned:39, sent:0, skipped_by_reason:{opted_out:12, flow_not_configured:8, no_active_plan:11, outside_window:6, restriction_flagged:2}`.

### P0-2 — Chaque envoi recevait 403 (mauvaise porte d'authentification)

Les deux crons KEEL appelaient `whatsapp-send` via
`admin.functions.invoke(...)`, qui n'envoie que l'`Authorization` du client.
Or `whatsapp-send` est gardé par `ensureInternalRequest`, dont la **seule**
porte est l'en-tête `x-internal-secret` (aucun repli service-role). Résultat :
403 sur chaque envoi, compté en `failures`, aucun message jamais parti — en
local **comme en production**.

Preuve : 3 lignes `system_error_logs` `function_name=internal-auth`,
`http_path=/whatsapp-send`, `auth_stage=secret_guard`, `has_header=false`, une
par tick.

### P0-3 — Toute réponse de Flow était perdue (42P10 permanent)

`writeWeeklyFlowReply` faisait
`upsert(..., { onConflict: "user_id,week_start_date" })`. L'index qui
dédoublonne est **PARTIEL** (`where plan_version_id is null`) : Postgres refuse
de le viser sans répéter le prédicat, et `on_conflict` de PostgREST n'émet
jamais de WHERE. Chaque appel échouait en
`42P10 — there is no unique or exclusion constraint matching the ON CONFLICT
specification`, le webhook avalait l'erreur, et l'élève n'avait **ni ligne, ni
accusé** : ses deux minutes disparaissaient en silence.

La migration C4 posait bien l'index et sa garde passait au vert. Personne ne
testait que **le seul écrivain pouvait s'en servir**.

### P1-4 — Le point hebdo sortait en `global_reach_template`, en français

Un `interactive_flow` hors fenêtre 24h ne trouvait pas de branche : il tombait
dans le `else` générique et partait en **template de repli**. `keel_weekly_flow`
n'étant pas dans `getFallbackTemplate`, le repli était
`global_reach_template` — « J'ai une info pour toi, je peux te la donner ? 😊 »,
`lang=fr` — pendant que le job comptait `sent: 1, failures: []`.

C'est le motif exact de l'incident du 2026-07-12, sur un chemin neuf, et sur la
population la PLUS concernée : le point du dimanche vise par construction des
élèves silencieux, donc hors fenêtre. Deux lignes rouges globales franchies
d'un coup (français sur surface élève ; envoi faux compté comme réussi).

Preuve : `content_preview = "J'ai une info pour toi, je peux te la donner ? 😊"`,
`template_name = global_reach_template`, `lang = fr`.

### P1-5 — H2 CONFIRMÉE : trois sollicitations le même dimanche

La fenêtre est 18h-21h locales, le cron passe à `:40`, et `answeredThisWeek` ne
bouge pas tant que l'élève se tait. Trois ticks → **trois envois réels**.

Preuve avant fix : 3 lignes `whatsapp_outbound_messages`, `status='sent'`,
`purpose=keel_weekly_flow`, à 16:26:49.06 / .17 / .24.

### P1-6 — `/app/progress` ne pouvait pas afficher le poids du point hebdo

L'écran lisait `outcomes.weight_7d_avg`. **Personne n'écrit là** dans le modèle
masterclasse (vérifié : aucun écrivain hors fixture de test) ; le Flow range le
poids dans `biofeedback.weight_kg`. La carte « Your weight » restait
définitivement vide et affichait *« No weight in this period yet. You enter it
in the Sunday check-in »* — juste après que l'élève l'ait saisi dans le point
du dimanche.

Preuve (requête EXACTE de l'écran, sous RLS élève) : `outcomes` NULL sur les 8
semaines, `biofeedback.weight_kg` renseigné.

Le reste du scénario 12 était déjà conforme : régularité en premier, poids en
dernier. La légende « A 7-day average » a été corrigée — le Flow donne UNE
pesée hebdomadaire, pas une moyenne 7 jours ; la laisser aurait été une
affirmation fausse sur une surface sensible.

### P2-7 — Un jeton illisible faisait « converser » du JSON de formulaire

Le bloc C4 n'était pris que si `flow_response_json` **et** un jeton valide
étaient présents. Avec un jeton malformé, le tour redescendait vers les
handlers suivants : l'élève a reçu *« Je t'attends encore le temps que le plan
se finalise ou se synchronise. »* — en français, sans rapport, en réponse à un
formulaire. C'est exactement ce que le commentaire du bloc dit vouloir
empêcher.

### P2-8 — Un champ malformé devenait une mesure plausible

`String(["80"])` vaut `"80"` : un tableau produisait **80 kg**, plausible et
inventé. Le module refuse un 500 kg pour cette raison précise, mais rien ne
gardait la FORME de la valeur.

### P2-9 — Un axe manquant était rapporté comme « 0 is outside 1-5 »

`Number("")` vaut 0 : un axe absent ressortait comme une valeur hors bornes,
c'est-à-dire **un chiffre inventé dans le seul canal censé dire la vérité sur
ce qui a été écarté**.

### P2-10 — Le job ne savait pas dire de quoi il était mort

Une erreur PostgREST n'est pas une `Error` : `String(...)` rend
`[object Object]`. C'est ce qu'ont reçu la réponse HTTP **et**
`system_error_logs`, et c'est ainsi qu'un 42703 permanent est resté invisible.

### P3-11 — L'accusé du point hebdo est journalisé sous `keel_daily_pulse_ack`

`sendPulseReply` est réutilisé tel quel : le `purpose` de la ligne outbound dit
« tap quotidien » pour une réponse au point hebdomadaire. Sans effet élève,
mais fausse toute analyse de coût ou de volume par purpose. Non corrigé
(touche le domaine de l'agent 7).

### P3-12 — Le jeton laisse choisir la SEMAINE, sans borne de plausibilité

Un jeton forgé `KEEL_WEEKLY_2020-01-06` écrit bien **chez l'expéditeur** (aucune
fuite cross-tenant — la propriété de sécurité tient), mais dans une semaine
arbitraire de son propre historique, visible par son coach. Sévérité faible.
Correctif PROPOSÉ, non appliqué (voir plus bas).

---

## Fixes appliqués

| Fichier | Changement | Test de non-régression |
|---|---|---|
| `keel-weekly-flow-v1/index.ts` | SELECT réduit aux colonnes existantes ; `errorText()` pour les erreurs PostgREST ; `askedThisWeek` câblé ; `metadata_extra.keel_week_start` posé sur l'envoi ; 409 compté en `window_closed_at_send` | `weekly_flow_schema_test.sql` (dérive de schéma) |
| `_shared/keel/internal_send.ts` **(nouveau)** | `sendKeelWhatsApp()` : POST avec `x-internal-secret`, remonte statut + message d'erreur au lieu de les lisser | prouvé à l'exécution (403 → 200) |
| `keel-daily-pulse-v1/index.ts` | même correctif d'authentification (défaut identique) | run réel : `sent:1`, ligne `keel_daily_pulse` `status='sent'` |
| `_shared/keel/weekly_flow.ts` | garde `already_asked_this_week` (+ sa condition de désarmement) ; `readableText()` contre la coercition de forme ; axe manquant nommé « missing » | 6 tests ajoutés, dont 3 prémisse-fausse |
| `_shared/keel/weekly_flow_io.ts` | `hasAskedWeek()` sur le registre d'envoi ; écriture SELECT→UPDATE/INSERT avec reprise sur 23505 (course) au lieu de l'upsert impossible | `weekly_flow_schema_test.sql` (cible d'upsert) |
| `whatsapp-send/index.ts` | `interactive_flow` hors fenêtre 24h → **409 explicite**, comme `interactive_buttons`, au lieu du repli template | prouvé : 0 ligne outbound, 0 `global_reach_template` |
| `whatsapp-webhook/index.ts` | jeton illisible → tour abandonné + `keel.weekly_flow.unusable_token` (jamais le dispatcher) ; échec d'écriture → message honnête à l'élève au lieu du silence ; erreur PostgREST lisible dans le log | prouvé : HTTP 200, 0 réponse, 0 `chat_messages` |
| `keel/pages/StudentProgressPage.tsx` | `displayWeights()` exporté : lit `biofeedback.weight_kg`, repli `outcomes.weight_7d_avg` (chemin 1:1) ; légende corrigée | `studentProgressWeight.int.test.ts` (5 tests, dont prémisse-fausse) |

**Suites vertes après fixes** : `deno test _shared/keel/` **516 passed / 0
failed** · `deno test whatsapp-webhook/` **79 / 0** · `vitest`
`studentProgressWeight` **5 / 0** · `tsc --noEmit` **0 erreur** ·
`deno check` des 3 fonctions touchées **OK** · `weekly_flow_schema_test.sql`
**6 assertions PASS** (et vérifié qu'il ÉCHOUE si on réintroduit
`content_locale` — un test qui ne peut pas tomber ne protège rien).

### Conditions de désarmement des ceintures ajoutées (règle 4 du socle)

- **`already_asked_this_week`** : portée par `week_start`. Prouvé à
  l'exécution — 3 ticks du 2026-08-09 → 1 envoi ; le dimanche suivant
  (2026-08-16) repart : 2 lignes, une par semaine. Un envoi `failed`/`cancelled`
  ne compte PAS comme question posée (sinon un incident Meta ferait taire
  l'élève une semaine entière). Elle ne prend jamais le pas sur une garde
  clinique : testé contre `restriction_flagged` et `safety_active`.
- **Refus 409 hors fenêtre** : désarmé dès que l'élève écrit dans les 24h.
- **`readableText`** : chaînes et nombres restent lisibles (test prémisse-fausse).

---

## Fixes PROPOSÉS, non appliqués

1. **Le plancher TCA se lève tout seul.** `isRestrictionFlagged` lit le bilan le
   plus récent et prend sa bande. Un bilan ultérieur sans drapeau **rouvre**
   donc la question du poids — prouvé : après insertion d'un bilan `on_track`
   plus récent, la décision repasse à `send`. Or le commentaire de la fonction
   affirme l'inverse : « un drapeau de restriction ne se périme pas […] le lever
   automatiquement par simple écoulement du temps serait une décision clinique
   prise par un `order by` ». Le code et sa doctrine se contredisent.
   **Arbitrage humain requis** : soit rendre le drapeau collant (tout
   `restriction_flag` sur les N dernières semaines maintient le plancher), soit
   corriger le commentaire. Je n'ai pas touché à une garde clinique sans cette
   décision (règle 2).

2. **L'élève silencieux ne reçoit plus rien du tout.** Le 409 supprime le
   mauvais message ; il ne crée pas le bon. Tant qu'aucun template KEEL approuvé
   ne rouvre la fenêtre, tout élève hors 24h est écarté en
   `window_closed_at_send` (5 sur la flotte locale au dernier run). C'est une
   décision produit : approuver un template dédié chez Meta, ou renoncer à
   demander aux silencieux. Le job le DIT désormais dans son compte-rendu au
   lieu de compter un envoi.

3. **Borner la semaine du jeton.** Refuser un `week_start` futur ou antérieur à
   N semaines fermerait P3-12. Non appliqué : c'est un arbitrage (que faire d'un
   élève qui répond le lundi matin à un Flow du dimanche soir ? la semaine du
   jeton est justement ce qui rend ce cas correct).

4. **`budget_ms` n'est vérifié que sur le chemin d'envoi.** Les `continue` des
   branches « écarté » sautent la vérification de budget : un run où tout le
   monde est écarté parcourt la flotte entière quoi qu'il arrive (constaté :
   `budget_ms:1` → `scanned:200`). Chaque élève examiné coûte pourtant 3
   requêtes. À grande échelle le job dépassera son budget, sera tué, et comme le
   curseur n'est rendu qu'à la fin, le tick suivant repartira de zéro. Correctif
   simple (déplacer la vérification en tête de boucle), mais il change le
   comportement de pagination des deux crons : à faire avec l'agent 7.

5. **`purpose` de l'accusé** (P3-11) : `keel_weekly_flow_ack` au lieu de
   `keel_daily_pulse_ack`.

---

## NOT_TESTABLE_LOCALLY

| Quoi | Pourquoi | Comment le prouver en réel |
|---|---|---|
| L'ENVOI du Flow chez Meta | `KEEL_WEEKLY_FLOW_ID` pointe sur un id factice ; aucun Flow n'est publié | Publier `weeklyFlowJson()` dans le Flow Builder, poser le vrai id en secret, envoyer à un numéro de test, vérifier que la bulle porte le CTA |
| Le RENDU du formulaire (2 écrans, dropdowns 1-5, écran Numbers facultatif) | objet hébergé par Meta | Ouvrir le Flow sur un vrai téléphone |
| La forme EXACTE du `response_json` de Meta | reconstituée à partir de `weeklyFlowJson()` | Une soumission réelle : comparer les clés reçues aux six axes + `weight_kg`/`waist_cm`. Le test `every axis the form asks for is an axis the parser reads` est le seul filet en attendant |
| Le repli hors fenêtre 24h | Meta refuse un `interactive` hors fenêtre | Le 409 est désormais la réponse locale ; la vraie erreur Graph reste à observer |
| `/app/progress` rendu dans le navigateur | GoTrue local partagé : la session du profil navigateur appartenait à un autre agent (`b11.coach.alpha@keeltest.dev`) — contamination déjà documentée | Vérifié à la place par la requête EXACTE de l'écran sous **RLS élève** (jeton `a8.normal`) + 5 tests unitaires sur `displayWeights`. Reste à ouvrir l'écran avec une session élève propre |

---

## Incident d'environnement (à lire avant le prochain run)

Le socle impose **un agent à la fois**. Ce run s'est déroulé avec jusqu'à
**5 autres agents QA actifs sur la même base** : la table `profiles` est passée
de 39 à 289 élèves pendant les mesures, le conteneur `supabase_edge_runtime` a
été redémarré trois fois sous mes requêtes (dont un HTTP 502 qui a d'abord
ressemblé à un crash de mon payload, et n'en était pas — re-testé propre :
HTTP 200), et cinq serveurs de dev occupaient les ports.

Conséquence méthodologique : **aucun agrégat de flotte n'est utilisable comme
preuve**. Toutes les assertions de ce rapport sont par élève
(`after_user_id` + `budget_ms:1` → `scanned:1`) ou par ligne DB relue après
coup. Un agent qui lirait `skipped_by_reason` global se tromperait.

Piège associé, rencontré : un `delete from weekly_reviews where user_id like
'a8a80000%'` de nettoyage a **désarmé le plancher TCA** de la persona 2 (le
drapeau vit dans la dernière ligne de bilan). Une garde clinique portée par une
table de données disparaît avec elle.
