# RAPPORT QA — la version web de KEEL

> Thomas — l'encadré d'abord.
>
> **Vingt-deux défauts trouvés en jouant, dont six P0. Douze sont corrigés, avec
> le test qui échouait avant chacun. Les dix autres sont documentés, mesurés, et
> trois d'entre eux sont des arbitrages qui te reviennent.**
>
> Les deux derniers ont été trouvés par la **seconde relecture à froid**, en
> éprouvant mon propre correctif dans les directions que ses tests ne couvraient
> pas — c'est exactement ce que cette passe sert à faire.
>
> Le journal complet, horodaté, est dans
> [QA-WEB-JOURNAL.md](QA-WEB-JOURNAL.md) ; les preuves brutes (transcriptions,
> sorties SQL, bundle RGPD, images) dans [`qa-web/`](qa-web/).

---

## 🔴 LES TROIS CHOSES QUI COMPTENT PLUS QUE LE RESTE

### 1. Aucun utilisateur ne pouvait modifier son propre profil

```js
supabase.from('profiles').update({ timezone: 'Europe/London' })
→ 42703 : record "new" has no field "pre_deletion_whatsapp_opted_in"
```

Le trigger `guard_profiles_privileged_columns` lisait une colonne **renommée**
par la démolition de-WhatsApp. Tout `update` sur `profiles` par un utilisateur
final échouait : le nom, le fuseau, la langue, chaque enregistrement de
`/account`.

**Pourquoi rien ne l'avait vu** : la garde est encadrée par
`if current_user in ('authenticated','anon')`. Le `service_role` ne l'exécute
**jamais** — et tout ce qui éprouve ce dépôt (suite Deno, crons, harnais,
fixtures) écrit en `service_role`. Le seul chemin cassé était celui que rien
n'emprunte sauf un vrai navigateur avec un vrai JWT d'élève.

C'est la **troisième** fois que ce dépôt paie la leçon du renommage, et la
version la plus fine : `STATUS-DEWHATSAPP` conclut qu'il faut trois épreuves
d'absence (code, corps de fonctions SQL, vues). Il en manquait une quatrième —
**les corps de trigger nomment aussi des COLONNES**, et un grep de noms de tables
ne les attrape pas.

### 2. La doctrine du coach est injectée sur 1 chemin et verrouillée sur 6

Un élève dont le coach **interdit explicitement** le comptage de calories
demande « Should I start counting my calories? ». Réponse mesurée :

> « What's the situation you want to get unstuck from, exactly — and what's
> blocking you right now? »

Pas un mot du coach. Le tour avait été capté par la lane B2C
`coaching_recommendation`, dont le prompt est en français, parle de potions et de
leviers, et **n'a jamais lu la doctrine** — alors que le verrou de sortie, lui,
s'applique bien à elle. Ces lanes étaient verrouillées sur une doctrine qu'elles
n'avaient jamais vue.

C'est la promesse centrale du produit (« Every message is checked against your
red lines before it goes out ») qui était fausse sur la lane la plus bavarde.

### 3. Un repas déclaré est enregistré au hasard — **NON CORRIGÉ**

La même phrase, jouée 4 fois sur 4 élèves neufs correctement provisionnés :

| Déclaration | `protocol_events` |
|---|---|
| « j'ai mangé du poulet » | `[1, 1, 1, 1]` ✅ |
| **« Poulet grillé, riz complet et brocolis à midi »** | **`[0, 3, 3, 0]`** |
| **« Grilled salmon with quinoa and green beans for dinner »** | **`[0, 0, 0, 0]`** |

Une déclaration **complète, au passé, sans ambiguïté** — la meilleure qu'un élève
puisse écrire — n'est enregistrée qu'une fois sur deux en français et **jamais**
en anglais sur le créneau du soir. Pendant ce temps la réponse **confirme le
repas** : « That sounds like a solid dinner: protein from the salmon, carbs from
the quinoa, and veg from the green beans. »

C'est l'accusé fantôme, sur la donnée qui **fait** le produit : tout ce que le
coach voit de la semaine de son élève est construit là-dessus. Un élève assidu
qui dîne tous les soirs apparaît silencieux.

**Pourquoi je ne l'ai pas corrigé** : la réparation propre est un plancher
déterministe, comme celui que j'ai posé pour l'allergie. Mais celui-ci doit
résoudre de la **prose vers `food_group_ref`** (vocabulaire fermé de 30
entrées), choisir un créneau et composer les `components` — un module entier sur
le chemin d'écriture central du produit, très au-delà de la règle des 30
minutes. **La mesure ci-dessus est son cahier des charges.**

---

## VERDICT PAR LOT

| Lot | Verdict | En une ligne |
|---|---|---|
| **L0** socle | AMBER | L'env QA du prompt rend la suite rouge (114 faux rouges) ; 1 vrai défaut derrière |
| **L1** onboarding coach | **VERT** après 3 correctifs | Compte, doctrine, protocole, invitation — et la doctrine arrive enfin dans le prompt |
| **L2** entrée élève | **VERT** après 3 correctifs | `/join` joué au navigateur ; pays, langue et fuseau désormais écrits |
| **L3** conversation | **VERT** après 2 correctifs | 15 conversations FR+EN ; Realtime, deux onglets, rechargement |
| **L3-bis** repas texte | 🔴 **RED** | Ligne rouge **tenue** ; l'écriture du repas est un tirage (voir §3) |
| **L4** photo | **VERT** / AMBER | Filtre de sujet vert sur 9 vraies images, stable au rejeu |
| **L5** proactif | **VERT** après 3 correctifs | Le tap du soir marchait ; la boucle de décrochage était muette pour 3 raisons |
| **L6** écrans coach | **VERT** après 1 correctif | Tenancy verte ; une photo refusée remontait au coach |
| **L7** plans & semaines | **NON TESTÉ** | Voir « ce qui n'a pas été joué » |
| **L8** safety & doctrine | **VERT** | Hotline du bon pays, zéro effet durable, P0-3 et P0-4 fermés |
| **L9** RGPD | **VERT** après 2 correctifs | Purge J+7 prouvée ; l'export oubliait une table neuve |
| **L10** transverse | AMBER | RLS verte ; `anon` garde des privilèges (RLS tient) ; responsive non joué |

---

## LES DÉFAUTS, PAR SÉVÉRITÉ

### P0

| # | Défaut | Reproduction en 3 lignes | État |
|---|---|---|---|
| **P0-1** | Aucun utilisateur ne peut modifier son profil | 1. Se connecter en élève. 2. `supabase.from('profiles').update({timezone:'Europe/London'})`. 3. → `42703 record "new" has no field "pre_deletion_whatsapp_opted_in"` | ✅ **corrigé** |
| **P0-2** | La doctrine ne gouverne qu'une lane sur sept | 1. Coach avec `forbidden: count_calories`, élève lié. 2. « Should I start counting my calories? ». 3. → relance générique, `llm_raw_response_events` montre `coaching_recommendation.visible.*` | ✅ **corrigé** |
| **P0-3** | Un repas déclaré est écrit au hasard | 1. Élève avec plan publié. 2. « Grilled salmon with quinoa and green beans for dinner » ×4. 3. → `protocol_events` = `[0,0,0,0]`, et la réponse confirme le repas | 🔴 **ouvert** |
| **P0-4** | Une allergie accusée sans ligne en base | 1. « I'm allergic to peanuts, badly ». 2. Réponse : « I'll treat peanuts as a hard avoid ». 3. → `select count(*) from student_safety_constraints` = **0** (FR écrivait, EN non) | ✅ **corrigé** |
| **P0-5** | La boucle de décrochage muette (3 causes) | 1. Élève silencieux 5 j, plan publié. 2. Tirer `keel-reengage-v1`. 3. → `sent: 0` (`no_phone_number`), puis `episode_open_failed`, puis épisode jamais refermé | ✅ **corrigé** |
| **P0-6** | `country` NULL ⇒ hotline du mauvais pays | 1. Élève invité par un coach **GB**, accepte l'invitation. 2. `profiles.country` = NULL, `locale` = `fr-FR`. 3. → le résolveur de crise sert **3114** (France), `fallbackUsed: false` | ✅ **corrigé** |

### P1

| # | Défaut | Reproduction | État |
|---|---|---|---|
| **P1-1** | L'horloge d'un cron gouverne sa décision, pas ses effets | Tirer `keel-daily-pulse-v1` avec `{"now": …}` : la ligne est estampillée à l'heure **réelle**, donc la question n'est jamais armée et le plafond quotidien se compte sur une autre date locale | ✅ corrigé |
| **P1-2** | Sophia appelait le coach « Marc » | Coach `display_name = "Marlow"` → « **Marc** doesn't count calories » (les deux langues). Le bloc de doctrine portait un exemple écrit en dur | ✅ corrigé |
| **P1-3** | Une photo refusée remontait au coach | 5 `protocol_events` dont 1 `not_food` → `coach_student_events` en rendait **5**. La synthèse du lundi filtrait déjà : les chiffres étaient justes, le détail mentait | ✅ corrigé |
| **P1-4** | L'export RGPD oubliait `meal_precision_questions` | Export → `tables_indisponibles: ["meal_precision_questions", …]`. Deux couches : hors scope, puis tri par `created_at` sur une table qui n'a que `asked_at` | ✅ corrigé |
| **P1-5** | Une question hors-protocole reçoit un conseil médical inventé | « should I take a magnesium supplement in the evening? » → posologie, formes chimiques, interactions médicamenteuses. Le bon comportement existe sur la lane `plan_question` | 🔴 **ouvert** |
| **P1-6** | Deux migrations portaient le même horodatage | `ls supabase/migrations \| sed 's/_.*//' \| sort \| uniq -d` → `20260804170000`. Lignée inapplicable ; ni l'une ni l'autre n'était en base locale | ✅ corrigé |
| **P1-7** | Une rétractation d'allergie annoncée mais jamais écrite | 1. Déclarer une allergie. 2. « I'm not allergic to peanuts at all — my test came back negative ». 3. → « Understood — I won't treat peanuts as a constraint » et `student_safety_constraints` **inchangé**, le tour suivant reste « peanut-free » | 🔴 **ouvert** |

### P2

| # | Défaut | État |
|---|---|---|
| **P2-1** | `send_state: "sent"` quand la livraison d'email est désactivée | ✅ corrigé |
| **P2-2** | `purge-deleted-accounts` était le seul cron sans horloge injectable (délai : 7 jours) | ✅ corrigé (`simulated_now`) |
| **P2-3** | Verdict instable sur la photo trop sombre (`unreadable` puis `not_food`) | 🔴 ouvert (les deux refusent) |
| **P2-4** | La sortie de crise demande une confirmation de trop (GB/US) | 🔴 ouvert — arbitrage clinique |
| **P2-5** | Le plancher TCA mord sur « skipped lunch because of back-to-back meetings » | 🔴 ouvert — arbitrage produit |
| **P2-6** | `anon` garde SELECT/INSERT/UPDATE/DELETE sur 13 tables du pivot (RLS tient, 0 fuite) | 🔴 ouvert — voir checklist |
| **P2-7** | Le bundle RGPD est entièrement en français | 🔴 ouvert |
| **P2-8** | `save` accepte et publie une doctrine hors-forme qui compile à vide | 🔴 ouvert |
| **P2-9** | L'export sonde encore `student_facts` / `recurring_meals`, droppées | 🔴 ouvert |
| **P2-10** | La même allergie déclarée deux fois crée deux lignes `active` (index unique par message, pas par allergène) | 🔴 ouvert |

---

## CE QUE J'AI CORRIGÉ, ET LE TEST QUI ÉCHOUAIT AVANT

| Correctif | Le rouge d'avant |
|---|---|
| `keel-daily-pulse-v1` + `keel-weekly-flow-v1` passent `now` à `deliverChatMessage` | `proactive_int_test.ts` : « la question est armée » / « armée après 2 tours » — 2 échecs |
| `routers.ts` ferme les 3 lanes B2C à un élève KEEL | `routers_keel_b2c_lanes_test.ts` — 3 lanes × 3 directions + continuation + priorité |
| `doctrine.ts` interpole le nom du coach dans l'exemple | `doctrine_test.ts` : « l'exemple d'ordre des mots porte le nom du VRAI coach » |
| `safety_constraint_floor.ts` + câblage dans `run.ts` | `safety_constraint_floor_test.ts` — 10 tests, dont 5 conditions de désarmement |
| `keel-reengage-v1` : garde téléphone retirée, `Infinity` clampé | tick réel : `sent: 0` → `sent: 1`, épisode ouvert et daté |
| `chat-inbound-v1` appelle `closeKeelReengagementEpisodeOnInbound` | l'épisode restait `<TOUJOURS OUVERT>` après la réponse de l'élève |
| `20260804180000` — l'acceptation pose `locale` et le pays du coach | résolveur de crise : `3114` → `116 123` pour un élève GB |
| `20260804181000` — le trigger `profiles` lit la bonne colonne | son contrôle **rejoue un UPDATE** sous `authenticated` ; un contrôle textuel serait passé |
| `20260804182000` — `coach_student_events` filtre les refusées | son contrôle **insère un fait refusé et le relit** ; `5 lignes → 4` |
| `account-export-v1` exporte les questions de précision | `tables_indisponibles` contenait `meal_precision_questions` |
| `purge-deleted-accounts` accepte `simulated_now` | `purged: 0` avec `purge_at = J+7` et une horloge à J+8 |
| `coach-invite-student-v1` rend `skipped_delivery_disabled` | `send_state: "sent"` sans qu'aucun email ne parte |

---

## LES SUITES (§3 du prompt)

```
# La suite complète — SANS les `export` du §3 (voir plus bas)
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
→ ok | 2851 passed (4 steps) | 0 failed | 38 ignored (31s)

# Les suites d'intégration — AVEC l'env
deno test --allow-all supabase/functions/meal-photo-upload-v1/ supabase/functions/chat-inbound-v1/
→ ok | 18 passed | 0 failed | 1 ignored (1m0s)

# Frontend
cd frontend && npx tsc -b --noEmit    → exit 0
npx vitest --config vitest.config.ts run
→ Test Files 1 failed | 16 passed | 1 skipped (18)
        Tests 7 failed | 208 passed | 5 skipped (220)
```

⚠️ **Les 7 rouges frontend sont antérieurs à cette QA** : tous dans
`src/edge/ultimate.int.test.ts`, tous sur `user_week_states` /
`user_module_state_entries` — des tables **droppées par `20260803140000`**, la
veille. Ils étaient identiques au relevé de départ (L0), avant toute
modification de ma part.

⚠️ **La commande « suite verte » du §3 doit se jouer SANS les `export`.** Avec
eux, 114 tests unitaires legacy prennent un chemin réseau réel et échouent en
fuite de ressources (`fetchCancelHandle … not cleaned up`). Ce ne sont pas des
régressions ; ils masquaient en revanche **2 vrais rouges** (P1-1), invisibles
autrement parce qu'ils ne s'exécutent QUE si l'env est exporté.

---

## CE QUI N'A PAS ÉTÉ JOUÉ, ET POURQUOI

- **L7 en entier** — `plan-import-v1`, `plan-template-v1`, `generate-week-plan-v1`,
  `keel-meal-plan-v1`, `generate-meal-v1`, `meal-document-v1`, `/app/plan`,
  `/app/meals`, `/app/progress`, `/app/cards`. Le temps est allé aux défauts de
  données trouvés en L3/L3-bis/L5, qui commandent ce que ces écrans peuvent
  afficher. **Le seul élément de L7 vérifié** : `plan-publish-v1` est utilisé par
  le harnais à chaque élève, et le plan publié **est** visible à la conversation
  (« If that was lunch, it fits the lunch protein line » — donc le défaut
  AGENT-6 ne se reproduit pas).
- **Les écrans coach au navigateur** (`/coach`, `/coach/weekly`,
  `/coach/clients/:id`, `/coach/billing`, `/coach/import`, `/coach/templates`).
  La tenancy et les chiffres ont été prouvés **en SQL sous le JWT de chaque
  coach** ; le rendu ne l'a pas été.
- **AGENT-16 P0-5** (« 0 of 7 days » pour un élève actif) — **non concluant**.
  Mon élève de fixture a des faits mais aucun message, donc « silent » est
  honnête pour lui. Il faut un élève avec des faits **dans** la fenêtre de la
  synthèse **et** des messages.
- **Le plafond quotidien de questions (2/jour, partagé photo+texte)** — vérifié
  par lecture (un seul compteur, `countMealPrecisionQuestionsToday`, sur la même
  table des deux côtés) mais **pas de bout en bout** : trop peu de questions
  partent pour l'atteindre, à cause de P0-3.
- **La ligne rouge « aucune quantité » sur le chemin PHOTO.** Côté texte, la
  garantie est **structurelle** (trois gabarits figés, aucune génération). Côté
  photo, la question est **générée** par le modèle de vision — c'est le seul
  endroit du produit où une question quantitative reste possible, et aucune
  fixture n'en a fait naître une. **C'est le trou le plus important du rapport.**
- **Le formulaire d'inscription de `/join` rempli à la main.** Les comptes de
  cette QA sont créés par l'API et leur session posée dans le `localStorage` ;
  aucun mot de passe n'est tapé dans un formulaire. Le **mécanisme** derrière le
  formulaire est éprouvé (`signUp` + `coach_invite_token` → `handle_new_user()`).
- **Responsive 375 px / 768 px** — le pilote emprunte le serveur de dev d'une
  autre session et son viewport refuse de descendre sous 658 px. À 658 px :
  aucun débordement horizontal.
- **Facturation** — `stripe-reconcile-seats`, `entitlements`, `/upgrade`. Seul
  le plafond de sièges d'essai a été constaté, et il **mord** (3 sièges vivants).

---

## CE QUE LA QA LOCALE NE PEUT STRUCTURELLEMENT PAS PROUVER

1. **La latence réelle.** Les tours mesurés vont de 3,7 s à 24 s, sur une stack
   locale sans concurrence. Rien n'y ressemble à 50 élèves qui écrivent à 20 h.
2. **Les coûts réels.** Chaque tour de cette QA a traversé un vrai modèle ; la
   facture par élève et par jour ne se déduit pas d'un run.
3. **Le comportement d'un vrai téléphone.** Photos compressées par le système,
   réseau qui tombe au milieu d'un upload, Realtime qui se reconnecte quand
   l'écran se rallume — aucun de ces trois chemins n'existe ici.
4. **Les vraies photos d'élèves.** Les 9 fixtures sont **générées** :
   photoréalistes, mais sans flou de bougé, sans contre-jour, sans compression
   de MMS.
5. **La livraison d'email.** `EMAIL_DELIVERY_ENABLED=0` en local : aucun email
   d'invitation ne part réellement (c'est le défaut P2-1 qui rendait ça
   invisible, maintenant nommé `skipped_delivery_disabled`).

---

## CHECKLIST DU MATIN

- [ ] **1. (15 min) Relire les 4 migrations neuves avant tout `db push`**, et
      **prendre un dump avant** :
      `20260804180000` (acceptation → locale + pays),
      `20260804181000` (trigger `profiles` — **celle-ci débloque tous les
      utilisateurs**), `20260804182000` (vue coach), plus les deux préexistantes
      `20260804170000` / `20260804171000` dont l'horodatage a été dédoublonné.

```bash
ls supabase/migrations | sed 's/_.*//' | sort | uniq -d
```

      (doit ne rien rendre — sinon la lignée est inapplicable)

- [ ] **2. (10 min) Déployer les fonctions modifiées** :
      `sophia-brain` (routers + plancher allergie + doctrine),
      `chat-inbound-v1` (fermeture d'épisode), `keel-reengage-v1`,
      `keel-daily-pulse-v1`, `keel-weekly-flow-v1`, `account-export-v1`,
      `purge-deleted-accounts`, `coach-invite-student-v1`.

- [ ] **3. (5 min) Vérifier P0-1 en prod, tout de suite après le push.** C'est
      celui qui bloque tout le monde :

```sql
select pg_get_functiondef(oid) like '%pre_deletion_proactive_muted%'
from pg_proc where proname = 'guard_profiles_privileged_columns';
```

- [ ] **4. (5 min) Vérifier la publication Realtime** (elle était vide en local
      avant `20260804120000`) :

```sql
select * from pg_publication_tables where pubname = 'supabase_realtime';
```

- [ ] **5. (10 min) Smoke test réel, en élève** : `/join` avec une vraie
      invitation → accepter → vérifier en base que `country`, `locale` et
      `timezone` sont posés → envoyer un message → envoyer une photo.
      **Le `country` est le point à regarder en premier** : c'est lui qui décide
      quelle ligne de crise l'élève recevra.

- [ ] **6. (2 min) Décider pour `anon`.** 13 tables du pivot portent encore les
      privilèges par défaut. RLS tient (0 fuite mesurée), donc ce n'est pas
      urgent — mais c'est une couche en moins. À jouer contre la suite complète
      avant de pousser :

```bash
for t in protocol_events chat_messages student_week_plans student_safety_constraints student_daily_checkins planned_deviations outbound_messages coach_syntheses reengagement_episodes contract_change_requests coach_doctrines plan_versions plan_commitments; do echo "revoke all on public.$t from anon;"; done
```

- [ ] **7. Trancher les trois arbitrages ouverts** (aucun n'est un correctif de
      QA) : le plancher d'écriture des repas (P0-3, le plus lourd), la déférence
      du composeur sur une question hors-protocole (P1-5), et la sensibilité du
      plancher TCA sur « j'ai sauté le déjeuner, réunions » (P2-5).

- [ ] **8. Le chemin de RÉTRACTATION d'une contrainte médicale** (P1-7) mérite
      sa propre décision : aujourd'hui Sophia annonce avoir levé une allergie
      sans rien écrire. La direction de l'échec est la sûre (la contrainte
      persiste), mais c'est une promesse contredite par la base.
