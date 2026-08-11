# RAPPORT · FF-058 — La bande du soir

**Date** : 2026-08-12 (nuit) · **Branche** : `ff-001-quotidien-du-coach` · aucun push
**Fiche** : `docs/fonctionnalites/suivi-quotidien/FF-058-la-bande-du-soir.md`
**Commits** : `f00c4f1`-ish (2 commits, voir `git log --oneline -2`)

---

## 1. État initial constaté — avec preuves

| Constat | Preuve |
|---|---|
| **La coche existe et elle est bonne.** `mealTickKey(mealId, dishIndex)` → clé `meal_tick:<id>:<i>`, bâtie sur la POSITION. `parseMealTickKey` rend `null` sur une clé mal formée. `MEAL_UNTICK_REASON = 'food_not_eaten'`. | `_shared/keel/meal_tick.ts:50-94` |
| **L'idempotence est arbitrée par Postgres**, rien à coder côté client. | `protocol_events_source_message_idx UNIQUE (user_id, source_message_id) WHERE source_message_id IS NOT NULL` — relu en base |
| **Le chemin d'écriture de l'écran** : `protocol_events`, `source='quick_tap'`, `evidence_weight 0.4`, `plan_relation='as_planned'`, `student_note = dish.title`, ré-armement sur 23505. | `frontend/src/keel/api/mealTicks.ts:76-147` |
| **Le véhicule du soir existait déjà** : `renderPulseMessage` rendait trois formes (fait+question / fait / question). | `_shared/keel/daily_pulse.ts` (avant ce lot) |
| **Aucune bande n'existait.** Aucun `KEEL_STRIP_`, aucun bouton de plat, aucun lecteur. | `grep -rn "KEEL_STRIP" .` → 0 résultat avant ce lot |
| **Les coches de la liste de courses meurent au rechargement** — `React.useState`, jamais la base. R16 confirmé sur pièces. | `frontend/src/keel/components/ShoppingListPanel.tsx:123` (`const [ticked, setTicked] = React.useState<Set<number>>(new Set())`) |
| **`grocery_waves.ts` calcule déjà `buyOn` et `servesCookOn`**, et les vagues sont **bucketées par date d'achat** (`byDate: Map`). | `_shared/keel/grocery_waves.ts:200-229` |
| **La réclamation de profil EXISTE en base** (contrairement à ce que le bloc de nuit indiquait), mais **aucun profil n'est réclamé** : la mécanique `keel_household_join` + `household_members.user_id` est livrée, la population est à zéro. | `migration 20260810200000_household_profile_claim.sql` · `select count(*) filter (where user_id is not null) from household_members` → **0 sur 1** |
| **`restriction_flag` n'a aucun producteur.** `isRestrictionFlagged` retiré en L3 le 2026-08-08 ; `keel-daily-pulse-v1` passe `false` en dur. | `keel-daily-pulse-v1/index.ts`, pavé « LE PLANCHER TCA DURABLE » |
| **Aucun aval ne transforme les coches en pourcentage.** `adherence_score` est une surface supprimée ; les seuls lecteurs de `quick_tap` sont le chargeur d'écran, la coche auto de la photo, et `loadDayFacts`. | `grep -rn "quick_tap"` (hors tests/scratchpad) → 3 lecteurs, aucun ratio |

---

## 2. Écarts fiche / code, et ce qui a été fait

Aucun écart *fiche contre code* : la fonctionnalité n'existait pas. Ce qui suit
est ce qui a été construit, section par section de la fiche.

| Fiche | Construit | Où |
|---|---|---|
| ① les plats du jour en boutons | `buildEveningStrip` (pur) : ligne + `[✓ Tout comme prévu]` / `[Pas tout]`, id agrégé portant **la liste des index**, ids par plat = **la clé de coche elle-même** | `_shared/keel/evening_strip.ts` |
| ② la bande dans le message existant | `renderPulseMessage` gagne `strip` **requis** ; ordre **fait → bande → question**, boutons bande-puis-niveaux | `_shared/keel/daily_pulse.ts` |
| ③ le traitement des taps | `handleStripTap` sur le chemin déterministe, avant le pouls | `_shared/chat/deterministic_buttons.ts` |
| ④ le foyer | `respondsForHousehold` (owner / sans foyer ⇒ `true` ; `member` ⇒ `false`) ; `masterOnly` **requis** dans `buildEveningStrip` | `_shared/keel/evening_strip_io.ts` |
| ⑤ la ligne de courses | ligne seulement le soir d'un `buyOn`, maître seulement ; **table** `grocery_wave_states` | `migration 20260812120000` |
| R8 | `restrictionFlag` **requis** dans `buildEveningStrip`, garde en tête de fonction, armée et testée | `evening_strip.ts` |

**Deux règles de la fiche sont tenues par construction, pas par du code neuf**, et
c'est signalé au rapport plutôt que codé en double :

- **« Deux vagues le même jour ⇒ une seule ligne »** : `planGroceryWaves` range
  les articles dans une `Map` clé par `buyOn`. Deux vagues le même jour ne sont
  pas représentables. Épinglé par un test (`§7 — two waves cannot fall on the
  same day`).
- **R11 (le maître ne coche jamais pour un profil réclamé)** : il n'existe
  aucun chemin. `protocol_events` n'a ni `member_id`, ni `on_behalf_of`, ni
  `household_id` (vérifié : `select count(*) from information_schema.columns …`
  → **0**), et le seul `user_id` que le chemin de tap connaisse est le porteur
  du JWT.

### Amendements de fiche PROPOSÉS (non appliqués — l'humain tranche)

1. **§3 « le fait du jour d'abord, la bande ensuite » ne dit rien de la question
   du pouls.** J'ai tranché : **fait → bande → question**, boutons
   bande-puis-niveaux. Raison au §6 (Décisions). La fiche gagnerait la phrase.
2. **§7 « deux vagues le même jour »** : la fiche décrit une garde ; c'est en
   réalité une impossibilité de `planGroceryWaves`. À reformuler en « la
   question porte sur les courses du jour, et le calcul ne produit qu'une vague
   par date ».
3. **§11 « la réclamation de profil n'existe pas encore »** : **faux** depuis la
   migration `20260810200000`. Elle existe ; elle n'a simplement **aucun
   utilisateur**. R11–R13 sont donc déjà exerçables le jour où quelqu'un
   réclame, sans code neuf de ma part.
4. **§3 hors périmètre, « jamais un second message »** : l'étape `Pas tout`
   produit bien un second message — mais c'est une **réponse à un tap**
   (`isReply: true`), pas une notification du soir. La fiche gagnerait à
   nommer la frontière, comme `daily_pulse.ts` le fait déjà pour la question
   d'axe.

---

## 3. Tableau des tests

### Unitaires (purs) — `deno test`, environnement purgé

`supabase/functions/_shared/keel/evening_strip_test.ts` : **24 verts**
`supabase/functions/_shared/keel/daily_pulse_test.ts` : **37 verts** (dont 5 neufs FF-058)

| Test | Règle | Verdict |
|---|---|---|
| un tap agrégé porte tous les index, reconstructible | R1 | 🟢 |
| au-delà de 4 titres la ligne compte, le tap coche quand même tout | — | 🟢 |
| zéro plat ⇒ `null`, même avec une vague | R7 | 🟢 |
| la ligne de courses seulement avec une vague, seulement au maître | R14/R15 | 🟢 |
| un profil réclamé reçoit ses plats, jamais la ligne | R14 | 🟢 |
| chaque id est lié au plan du jour, relu par `parseMealTickKey` | §5 | 🟢 |
| 12 charges malformées ⇒ `none`, jamais une supposition | §5 | 🟢 |
| les 3 vocabulaires déterministes ne se croisent pas | — | 🟢 |
| `Pas tout` ouvre ✓ **et** ✗ par plat (jamais ✗ seul) | « aucune coche auto » | 🟢 |
| la ceinture **mord** sur 11 tournures interrogatives, FR + EN | R2 / T9 | 🟢 |
| la ceinture **ne mord pas** sur le texte réel de la bande, FR + EN | R2 | 🟢 |
| un `?` dans un titre est neutralisé, la bande survit | R2 | 🟢 |
| les 6 accusés × 2 langues : aucun verdict, aucun chiffre | R4 | 🟢 |
| la ceinture d'accusé **mord** sur « Well done », « Bien joué », « 3 of 3 », « 4e soir » | R4 | 🟢 |
| `banNumbers` requis **change** le verdict (muté pour le prouver) | — | 🟢 |
| sous plancher : aucune bande ; **et** le cas qui passe, plancher désarmé | R8 | 🟢 |
| le plancher ne voyage pas d'un membre à l'autre | R8 | 🟢 |
| deux vagues le même jour sont impossibles à représenter | §7 | 🟢 |
| la bande seule est une raison d'envoyer, la SEULE neuve | §7 | 🟢 |
| la bande n'écrase **aucune** garde antérieure (6 gardes) | — | 🟢 |
| `strip: null` rend le message d'avant, octet pour octet | — | 🟢 |

### Conditions réelles — `FF058_evening_strip.ts`, **30 verts / 0 rouge, 3 runs sur 3**

Vrai cron (`keel-daily-pulse-v1`), vrai modèle (Gemini pour le fait du soir),
vraie base locale, vrais taps par `chat-inbound-v1`, vraies coches relues en base.

| Niveau | Scénario | Verdict | Preuve (ligne DB / texte relu) |
|---|---|---|---|
| easy | 3 plats nommés (EN) | 🟢 | `"Today : Chicken and rice bowl · Lentil soup · Greek yoghurt and berries\n\nHow was today?"` |
| easy | 3 plats nommés (FR) | 🟢 | `"Aujourd'hui : Poulet-riz · Soupe de lentilles · Yaourt grec et fruits rouges…"` |
| easy | bande en français pour `fr-FR` | 🟢 | bouton `✓ Tout comme prévu`, payload `KEEL_STRIP_ALL\|<uuid>\|0,1,2` |
| easy | `[✓ Tout comme prévu]` ⇒ **3 coches**, chemin de l'écran | 🟢 | `meal_tick:da37…:0\|2026-08-11\|Chicken and rice bowl\|-\|as_planned\|0.4\|quick_tap` (×3) |
| easy | l'accusé ne porte ni compliment, ni score, ni série | 🟢 | `handled_by="keel_evening_strip_all"`, `ack="Noted."` / `"C'est noté."` |
| medium | double tap ⇒ 3 lignes, pas 6 | 🟢 | 3 lignes relues après second tap |
| medium | `[Pas tout]` déplie 6 boutons et **n'écrit rien** | 🟢 | `✓ Porridge \| ✗ Porridge \| … ` · `protocol_events = 0` |
| medium | un `✗` écrit la décoche, et rien de plus | 🟢 | `meal_tick:9d0e…:0\|…\|Porridge\|food_not_eaten\|as_planned` |
| medium | un `✓` sur un autre plat n'efface pas la décoche | 🟢 | 2 lignes, 1 seule `food_not_eaten` |
| medium | recocher ré-arme **la même** ligne | 🟢 | 2 lignes, 0 `food_not_eaten` |
| medium | zéro plat prévu ⇒ aucune bande | 🟢 | message = `"How was today?"`, aucun `KEEL_STRIP_` |
| medium | coche par la conversation + décoche par l'ÉCRAN (PATCH PostgREST, JWT élève) ⇒ **une seule histoire** | 🟢 | `PATCH 200` · `select … group by → 1\|food_not_eaten` |
| courses | le soir d'un `buyOn`, la ligne apparaît **une fois** | 🟢 | `"…\nShopping was on the plan for today."` + 2 boutons |
| courses | l'état de la VAGUE est écrit avec sa date, dernière réponse gagne | 🟢 | `f\|2026-08-11\|2026-08-11\|<planId>` puis `t\|2026-08-11\|…` |
| courses | **aucun** état par article | 🟢 | colonnes = `user_id,generated_meal_id,buy_on,done,answered_at,answered_local_date` |
| courses | le lendemain, sans `buyOn`, **la ligne disparaît** — sur une vague toujours « pas encore » | 🟢 | vague en base = `f` · boutons = `✓ All as planned \| Not everything` · message = `"Today : Leftover plate"` |
| foyer | le maître (owner) reçoit bande **et** ligne de courses | 🟢 | roster : `Ff058Kid1\|member\|<no account>` ; `Maya\|owner\|<uuid>` |
| foyer | le tap du maître n'écrit **aucune** coche pour les bouches sans compte | 🟢 | 2 coches, toutes sur `user_id` du maître |
| foyer | R11 par absence de chemin | 🟢 | 0 colonne `member_id`/`on_behalf_of`/`household_id` dans `protocol_events` |
| extra-hard | plan courant + plan suivant : la bande ne cite que le plan du jour | 🟢 | bande = `"Today : Current soup · Current stew"`, payload sur le plan COURANT |
| extra-hard | aucun ratio > 100 % | 🟢 | aucun ratio émis (le modèle a nommé le fait sans fraction) |
| extra-hard | chaque coche rattachée à SON plan | 🟢 | 2 clés sur `572e…`, 1 sur `7804…` |
| hard | personne ne répond ⇒ rien écrit, rien inféré | 🟢 | `protocol_events=0` · `grocery_wave_states=0` |
| hard | 3 soirs ignorés ⇒ le 4e ne mentionne rien | 🟢 | transcript : `Today : Untouched pasta ⏎ ⏎ How was today?`, puis `How was today?` — aucun « hier », aucune série |
| hard | plan raccourci entre l'envoi et le tap | 🟢 | 1 seule coche (`Kept dish`), la disparue **n'est pas fabriquée** |
| extra-hard | **le pire soir possible** tient | 🟢 | voir §4 |
| extra-hard | il ne porte **qu'une** question | 🟢 | 1 point d'interrogation dans tout le message |
| extra-hard | la bande ne consomme **aucune** place du budget T4 | 🟢 | `meal_precision_questions` : aucune ligne `evening_strip` |

### Revue adversariale — `FF058_adversarial.ts`, **9 verts / 0 rouge après correction**

---

## 4. Les quatre mesures demandées

### a) Le message du soir, avant / après (R6)

| Composition | caractères | éléments interactifs |
|---|---|---|
| **SANS bande** — le fait seul, composé par le modèle | 80 – 155 (varie, run réel) | **3** (les niveaux du pouls) |
| **AVEC bande** — bande seule + question | **87** | **5** |
| **AVEC bande + ligne de courses** | **86** | **7** |
| **SAPIN DE NOËL** — fait composé + pratique + bande + courses + question | **246 – 288** | **7** |

Texte réel du pire soir mesuré :

> `Tara ticked off Overnight oats with berries and sent a meal photo today. Drink water across the day.`
> `Today : Overnight oats with berries · Roast chicken and potato bowl · White bean and kale stew`
> `Shopping was on the plan for today.`
> `How was today?`
> boutons : `✓ All as planned | Not everything | ✓ Shopping done | Not yet | All good | So-so | Rough`

**Lecture** : la bande coûte **+2 éléments interactifs** (+4 avec la ligne de
courses) et **~35 caractères** de texte. Le plafond du corps composé
(`RECAP_MAX_CHARS_WITH_PRACTICE = 320`) n'est pas touché : la bande vit **hors**
du texte jugé par `acceptComposedRecap`. **R6 tient**, et le message reste à
4 blocs / 7 boutons dans le pire cas.

**⚠️ Ce que le « pire soir » NE PEUT PAS contenir, et ce n'est pas un oubli** :
la recommandation quotidienne (FF-028). `keel-daily-pulse-v1` se retire
entièrement quand elle a parlé le même soir (`recommendation_sent_today`), et
cette garde est **antérieure** à ce lot. Le sapin de Noël plafonne donc à
5 objets, pas 6.

### b) Densité des coches

Sur chaque run : **14 coches actives + 1 décoche, sur 7 élèves**, toutes posées
**par la conversation** (aucun élève n'a ouvert l'écran). La densité *avant*
FF-058 est structurellement **0** : aucune coche ne pouvait naître d'une bulle.

La mesure honnête est le **coût du geste** : la journée nominale de 3 plats
coûte **1 tap** au lieu de « ouvrir l'app → trouver l'écran → retrouver les
plats → 3 clics ». La déviation coûte **2 taps** (`Pas tout` + le ✗ concerné).

### c) Le choix fait pour l'état de vague, et son raisonnement

> **Décision** — une **table** `grocery_wave_states (user_id, generated_meal_id, buy_on, done, answered_at, answered_local_date)`, clé primaire sur le triplet, upsert.
> **Pourquoi** — la donnée est un ÉTAT par (personne, plan, jour d'achat) et la dernière réponse gagne ; une clé primaire composite + `on conflict do update` le dit en une ligne de schéma. Une colonne `jsonb` sur `student_generated_meals` aurait forcé une lecture-modification-écriture complète sur la ligne du plan — exactement la course que `user_chat_states.temp_memory` fait déjà payer à ce dépôt (deux écrivains, le dernier gagne, sans qu'on l'ait voulu). La table donne aussi un point d'accrochage RLS et un `on delete cascade` gratuits.
> **Options rejetées** — (a) colonne jsonb sur le plan : course en lecture-modification-écriture, et la ligne du plan est partagée par le foyer ; (b) une ligne append-only par réponse : contredit « c'est un état, pas un journal » (§7), et forcerait chaque lecteur à faire un `distinct on` ; (c) réutiliser `protocol_events` : la vague n'est pas un fait de consommation, et le vocabulaire fermé de `source` la refuserait.
> **Réversibilité** — élevée. La table est neuve, sans lecteur autre que FF-057 (qui n'existe pas encore) ; `drop table` la retire sans toucher une seule ligne existante.

Droits vérifiés **aux deux bouts** :

```
auth_select | auth_insert | auth_update | auth_delete | anon_select | anon_insert | svc_insert | rls
     t      |      f      |      f      |      f      |      f      |      f      |     t      |  t
```

### d) Le taux de réponse au message du soir (la contre-mesure de la fiche)

**Non mesurable cette nuit, et il faut le dire** : il n'y a aucun élève réel en
base ; les taux observés sont ceux de mes propres fixtures, qui tapent parce que
le script les fait taper. Ce qui est **installé** pour le mesurer demain :

- `keel-daily-pulse-v1` rend `strips_sent` et `strip_shopping_lines` dans son
  compte-rendu (mesuré : `{"sent":2,"strips_sent":2,"strip_shopping_lines":0}`) ;
- chaque envoi journalise `keel.evening_strip.sent` avec `message_chars` et
  `interactive_count` ;
- chaque tap journalise `keel.evening_strip.ticks` avec
  `written/rearmed/stale/future/failed`.

Le dénominateur du taux de réponse existe déjà : `outbound_messages` avec
`metadata->>purpose = 'keel_daily_pulse'`. Le numérateur : les
`chat_messages` entrants de `kind=button`.

---

## 5. Hypothèses adversariales et leur sort

Chacune a été **écrite avant** d'être testée (en-tête de `FF058_adversarial.ts`).

| # | Hypothèse | Sort | Preuve |
|---|---|---|---|
| **H1** | La charge d'un bouton porte des index. Un index forgé désignant le plat de **demain** ferait-il écrire un fait daté de demain ? | **🔴 CONFIRMÉE — défaut réel, corrigé** | Mesuré : `meal_tick:49fe…:1\|2026-08-12\|Tomorrow dinner`. Une « preuve fabriquée », append-only, dans la table que le coach lit. Correctif : `isReportable(localDate, today)` — **la garde de `meal_stretch.ts`, pas une seconde** — et `today` devient un paramètre **requis**. Re-testé : `lignes datées de demain : 0` |
| **H2** | Une charge forgée citant la composition d'un **autre élève** ferait-elle fuir son plat ? | **🔴 CONFIRMÉE — défaut réel, corrigé** | Mesuré : coche écrite chez l'attaquant portant `student_note = "SECRET private dish of Vera"`, prête à être citée dans son message du soir. Le chemin tourne sous `service_role` (pas de RLS) et le `mealId` vient d'une chaîne que le client contrôle. Correctif : `.eq("user_id", userId)` **dans le chargeur** + même vérification sur l'état de vague. Re-testé : `attaquant : (aucune ligne)`, ack = `"That one is out of date now — nothing was saved."` |
| **H3** | Existe-t-il un chemin, même indirect, pour écrire une coche attribuée à quelqu'un d'autre ? | 🟢 réfutée | 0 ligne du plan de la victime portée par un autre `user_id` ; 0 état de vague croisé ; 0 colonne d'attribution tierce dans `protocol_events` |
| **H4** | Deux taps **simultanés** sur `[✓ Tout]` font-ils deux lignes par plat ? | 🟢 réfutée | `Promise.all` de deux taps, `client_message_id` différents (la dedup ne devait pas sauver) → 1 ligne par plat. Idem sur la vague : 1 ligne |
| **H5** | Un titre de plat interrogatif fait-il lire la bande comme une question ? | 🟢 réfutée | Plat nommé `"Did you eat it?"` → bande = `"Today : Did you eat it · Comment ça va soup"`, 0 `?` |
| **H6** | Un accusé peut-il porter un verdict par un chemin que les ceintures du soir ne regardent pas ? | 🟢 réfutée | Tous les accusés relus en base : `Noted.` / `C'est noté.` / le message de péremption. `findQualifyingVerdict` est **appelée** dans `renderStripAck`, pas seulement testée |
| **H7** | La coche qui devient un score : un aval peut-il en tirer un pourcentage ? | 🟢 réfutée (statique) | `grep` : 3 lecteurs de `quick_tap` (écran, coche auto photo, `loadDayFacts`) ; aucun ne divise. `adherence_score` est une surface supprimée et déjà listée dans `SUPPRESSED_STUDENT_SURFACES` |
| **H8** | La ligne de courses s'installe-t-elle « tant que ce n'est pas fait » ? | 🟢 réfutée | Le lendemain, vague toujours `done=false`, bande présente, **0 bouton de courses** |
| **H9** | L'état par article revient-il par la porte de derrière ? | 🟢 réfutée | La table n'a aucune colonne pour ça, et le commentaire de table l'interdit nommément |
| **H10** | La donnée neuve est-elle réclamée par le cycle de vie RGPD ? | **🟠 partiellement** | **Suppression : OK** — `on delete cascade` sur `auth.users`, et `purge-deleted-accounts` supprime le compte auth (« cascades profiles + the ~80 ON DELETE CASCADE tables »). **Export : NON** — voir §7, commande pour l'humain |

---

## 6. Décisions prises seul

> **Décision** — l'ordre du message est **fait → bande → question**, et les boutons suivent : bande d'abord, niveaux du pouls ensuite.
> **Pourquoi** — la fiche impose « le fait d'abord, la bande ensuite » mais ne place pas la question du pouls. Mettre la bande **après** la question ferait lire `✓ Tout comme prévu` comme une réponse à « ta journée ? ». Avec cet ordre, le **dernier texte lu est la question** et les **derniers boutons sont ses réponses** — c'est le même contrat d'adjacence que `pulseTemplateButtonComponents` documente déjà (« un élève qui tape "All good" voit "Rough" enregistré — sans erreur, sans trace, et le bilan du coach est faux »).
> **Options rejetées** — (a) bande en dernier : brise l'adjacence de la question ; (b) supprimer la bande les soirs où le pouls demande : perd la bande 1 soir sur 3, c'est-à-dire l'essentiel du bénéfice, et la cadence du pouls est verrouillée par R3 de N2.
> **Réversibilité** — triviale : trois lignes dans `renderPulseMessage`, un test qui pinne la chaîne exacte.

> **Décision** — un `✗` sur un plat **jamais coché** INSÈRE la ligne avec `disqualified_reason`, au lieu de ne toucher aucune ligne.
> **Pourquoi** — c'est le cas **nominal** de la bande : personne n'a ouvert l'écran, donc rien n'est coché. Un `update` qui touche 0 ligne rend un 204 muet (cicatrice `rls-is-not-a-substitute-for-eq-user-id`), et la fiche demande que « un ✗ écrit la décoche ». Ce n'est pas un second chemin : c'est le **même écrivain** avec `disqualified_reason` en paramètre, exactement comme l'en-tête de `meal_tick.ts` le décrit.
> **Options rejetées** — (a) n'écrire que si une coche existe : le ✗ ne dirait rien 9 fois sur 10, et FF-057 n'aurait aucune entrée ; (b) un `source` distinct : ferait diverger la couverture selon le chemin.
> **Réversibilité** — élevée : un paramètre du writer.

> **Décision** — la ceinture de R2 juge **ce que nous écrivons** (entêtes + libellés), pas les titres de plats ; les titres perdent seulement leur `?`.
> **Pourquoi** — un titre est de la DONNÉE. Le faire tomber sous la ceinture ferait disparaître la bande **tous les soirs, en silence**, chez l'élève dont un plat porte un mot malheureux : une panne permanente pour une ponctuation. R2 protège contre *Sophia qui pose une question*, pas contre un plat mal nommé.
> **Options rejetées** — (a) ceinture sur le texte entier : panne silencieuse quotidienne ; (b) rien du tout : un `?` dans un titre ferait lire la bande comme une question.
> **Réversibilité** — élevée, un `join` à changer dans `buildEveningStrip`.

> **Décision** — `respondsForHousehold` rend **`true` pour une personne sans foyer**.
> **Pourquoi** — c'est le cas nominal d'aujourd'hui (0 foyer sur la quasi-totalité des comptes). Rendre `false` ferait disparaître la ligne de courses pour tout le monde, et R14 serait « respectée » par le silence total.
> **Options rejetées** — fail-closed universel : R14 devient vraie et R15 devient morte.
> **Réversibilité** — une ligne.

> **Décision** — la question de session (« la cuisson de dimanche a eu lieu ? ») **n'est pas construite**.
> **Pourquoi** — c'est l'entrée de FF-057 (la cascade), et le bloc de nuit l'interdit explicitement. Ce qui est posé pour elle : `respondsForHousehold` existe déjà et le routage maître-seulement est prouvé par le run foyer.
> **Réversibilité** — sans objet, rien n'a été écrit.

---

## 7. Ce qui reste ouvert

1. **🟠 `grocery_wave_states` n'est pas dans l'export RGPD.** `account-export-v1/index.ts`
   est **pris par une autre session** cette nuit : je ne l'ai pas écrit. La
   suppression, elle, est couverte (`on delete cascade`). Voir §8 pour la
   modification exacte.
2. **Le taux de réponse global au message du soir** — la contre-mesure de la
   fiche — n'est pas mesurable sans élèves réels. Le compteur est installé
   (`strips_sent`, `keel.evening_strip.sent`), il faut une semaine de trafic.
3. **Les logs `console.info` du runtime edge ne sont pas visibles dans
   `docker logs supabase_edge_runtime_Sophia_2`** sur cette pile. Tous les
   verdicts de ce rapport reposent donc sur **des lignes en base**, jamais sur
   un log. À vérifier si quelqu'un compte s'appuyer sur ces tags.
4. **`restrictionFlag` reste `false` en dur** dans `keel-daily-pulse-v1`. La
   garde R8 est **armée et testée** dans `buildEveningStrip` ; son producteur
   n'existe toujours pas (retiré en L3 le 2026-08-08). Un seul littéral à
   changer le jour où une source est rebranchée.
5. **La bande d'un profil réclamé n'est pas construite** — conformément au
   bloc de nuit. La mécanique EXISTE en base (contrairement à ce que la fiche
   §11 dit), la population est à 0. Rien dans ce lot ne rend R11–R13
   impossibles : `masterOnly` est déjà un paramètre requis, et le tap n'a
   aucun chemin d'attribution tierce.
6. **Idée consignée et NON construite** (l'interdit le demande) : persister les
   coches article-par-article de `ShoppingListPanel`. Elles meurent au
   rechargement, ce qui est agaçant dans un magasin. **Aucun consommateur en
   aval aujourd'hui ⇒ T1 violé.** Si on la veut, c'est une fiche à part avec
   son lecteur.
7. **Idée consignée** : le message du soir sort le fait dans la langue de
   l'élève et la question du pouls **toujours en anglais**
   (`PULSE_QUESTION_EN`). Ma bande, elle, est bilingue. L'incohérence est
   **antérieure** à ce lot et visible dans les preuves ci-dessus
   (`"Aujourd'hui : … \n\nHow was today?"`). Je ne l'ai pas réparée : ce n'est
   pas mon lot, et c'est un choix produit.
8. **Deux rouges préexistants** dans `supabase/functions/_shared/chat/recent_history_test.ts`
   (« la borne garde les N DERNIERS », « une horloge illisible ne fait pas
   disparaître l'historique »). **Prouvés antérieurs** par `git stash -u` avant
   toute écriture de ma part : 11 verts / 2 rouges sur l'arbre propre. Non
   touchés.

---

## 8. Commandes pour l'humain

**a) Ajouter `grocery_wave_states` à l'export RGPD** (fichier pris par une autre
session cette nuit — modification exacte) :

Dans `supabase/functions/account-export-v1/index.ts`, à côté de la ligne 593
(`fetchKeelRows(admin, "protocol_events", SCOPE.protocolEvents, "user_id", user.id, keelUnavailable)`),
ajouter dans le même tableau :

```ts
fetchKeelRows(
  admin,
  "grocery_wave_states",
  // FF-058 — l'état d'une vague de courses. Aucune donnée sensible: un
  // booléen, une date d'achat et l'identifiant du plan.
  ["generated_meal_id", "buy_on", "done", "answered_at", "answered_local_date"],
  "user_id",
  user.id,
  keelUnavailable,
),
```

…et déclarer `grocery_wave_states` dans le `SCOPE` du même fichier si la
convention l'exige (vérifier la forme exacte de `SCOPE.protocolEvents` sur
place — je n'ai pas pu éditer le fichier).

**b) Rejouer les runs** (ce que j'ai lancé) :

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
ANON=$(grep -m1 '^SUPABASE_ANON_KEY=' supabase/.env | cut -d= -f2-)
SVC=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' supabase/.env | cut -d= -f2-)
ISEC=$(grep -m1 '^INTERNAL_FUNCTION_SECRET=' supabase/.env | cut -d= -f2-)

# Avant tout run réel — le runtime sert des `_shared` périmés sinon.
docker restart supabase_edge_runtime_Sophia_2 && sleep 8
./scripts/local_extend_kong_functions_timeout.sh   # relance AUSSI le DNS de Kong

SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SVC" INTERNAL_FUNCTION_SECRET="$ISEC" \
  deno run -A docs/nutrition-pivot/qa-web/FF058_evening_strip.ts

SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SVC" INTERNAL_FUNCTION_SECRET="$ISEC" \
  deno run -A docs/nutrition-pivot/qa-web/FF058_adversarial.ts
```

> ⚠️ **`docker restart supabase_edge_runtime_Sophia_2` casse la résolution DNS
> de Kong** (503 `name resolution failed`, puis 502). Relancer
> `./scripts/local_extend_kong_functions_timeout.sh` — il recharge Kong — avant
> tout run. Coûté deux runs cette nuit.

**c) Tests unitaires** :

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/evening_strip_test.ts \
  supabase/functions/_shared/keel/daily_pulse_test.ts
```

**d) La migration est déjà appliquée en local** et enregistrée dans
`supabase_migrations.schema_migrations` (`20260812120000`). Pour la prod, **à
lancer par vous** :

```bash
supabase db push
```

**e) Déploiement des fonctions modifiées** (`keel-daily-pulse-v1`,
`chat-inbound-v1` — le second parce qu'il embarque `_shared/chat/deterministic_buttons.ts`) :

```bash
supabase functions deploy keel-daily-pulse-v1
supabase functions deploy chat-inbound-v1
```

**f) Vérifier les droits de la table neuve après `db push`** :

```bash
supabase db remote query "
select has_table_privilege('authenticated','public.grocery_wave_states','SELECT') auth_select,
       has_table_privilege('authenticated','public.grocery_wave_states','INSERT') auth_insert,
       has_table_privilege('anon','public.grocery_wave_states','SELECT') anon_select;"
# attendu : t | f | f
```

---

## 9. Note pour l'agent FF-057, qui lit cette table juste après

`grocery_wave_states` porte **un état, pas un journal**. La forme exacte est
documentée en tête de `supabase/migrations/20260812120000_grocery_wave_states.sql`
et dans le `comment on table`. En deux lignes :

- `(user_id, generated_meal_id, buy_on)` est la clé ; `done` vaut `true`/`false`
  et **jamais NULL** — l'absence de ligne EST « on ne sait pas » ;
- `user_id` est **le maître du foyer** : la ligne de courses ne part qu'à lui
  (R14), et `writeGroceryWaveState` vérifie que le plan lui appartient.

Le lecteur naturel existe déjà : index partiel
`grocery_wave_states_pending_idx (generated_meal_id, buy_on) where done = false`.
