# BANC CHAT — 2026-09-08

Chantier de réduction du chat (lots A, D, B). **L'attendu est écrit AVANT le
tir.** Un `INCONCLUSIVE` n'est jamais compté `PASS`.

## Les fixtures

| compte | objectif | fuseau | rythme | foyer |
|---|---|---|---|---|
| `qa-chat-perte@keeltest.dev` | `fat_loss` | Europe/Paris | 08:00 · 12:30 · 19:30 | non |
| `qa-chat-maintien@keeltest.dev` | `maintenance` | Europe/Paris | 08:00 · 12:30 · 19:30 | non |
| `qa-chat-solo@keeltest.dev` | `fat_loss` | Europe/Paris | 08:00 · 12:30 · 19:30 | non |

`slot_meal_ask_enabled = null` partout : personne n'a choisi, l'objectif décide.

## Les cas, et ce qu'on attend

| # | cas | attendu ÉCRIT AVANT |
|---|---|---|
| C1 | cron à 13:00 Paris, aucun plan | `perte` et `solo` reçoivent **une** bulle « Rien n'était prévu pour le déjeuner » avec 4 boutons (`photo`/`describe`/`skip`/`mute`) |
| C2 | le même tir | `maintien` reçoit **zéro** bulle, motif `goal_not_covered` |
| C3 | même cron rejoué à 13:30 | **zéro** envoi de plus : `already_asked` (R2 — « sans plafond » n'est pas « sans idempotence ») |
| C4 | cron à 10:00 Paris | zéro envoi, motif `not_elapsed` (le déjeuner n'est pas passé) |
| C5 | cron à 16:00 Paris | zéro envoi, motif `too_late` (plus de 2 h après 12:30) |
| C6 | tap `mute` | `profiles.slot_meal_ask_enabled = false`, accusé qui nomme le « + » ET la case de profil |
| C7 | cron après le mute | motif `ask_muted`, **distinct** de `muted` |
| C8 | tap d'une charge désarmée (`KEEL_STRIP_`, `KEEL_FIX_`, `KEEL_SHARE_`, `KEEL_PULSE_`, `KEEL_MEMCLAR_`, `KEEL_KCAL_`) | `keel_unusable_button_ack` — jamais une réponse de modèle |
| C9 | requêtes de preuve A.7 | zéro charge des six familles dans `outbound_messages` |
| C10 | pesée : cadence | `fat_loss` = 3 jours (et non 2) |

## Les tirs

Empreinte code stable sur tous les tirs : `20b177c28dbe`. Runtime edge
redémarré à 03:04:39 local, après la dernière édition d'un fichier servi
(03:03:03) — vérifié avant le premier tir.

| # | verdict | mesuré |
|---|---|---|
| C1 | ✅ **PASS** | `envoyés=2` — `perte` et `solo`. Texte : « Rien n'était prévu pour le déjeuner aujourd'hui — tu as mangé quoi ? », 4 boutons, `status=sent` |
| C2 | ✅ **PASS** | `maintien` : **zéro** bulle, jamais. `goal_not_covered` passe de 31 à 32 |
| C3 | ✅ **PASS** | rejoué : `envoyés=0`, `already_asked: 2` |
| C4 | ✅ **PASS** | 10 h : mes fixtures restent à 1 bulle (celle de C1) |
| C5 | ✅ **PASS** | 16 h : idem, `too_late` |
| C6 | ✅ **PASS** | tap `mute` → `slot_meal_ask_enabled = false`; accusé nomme le « + » ET les réglages |
| C7 | ✅ **PASS** | `ask_muted: 1`, **distinct** de `muted: 12` |
| C8 | ✅ **PASS** | 6 charges désarmées → 6 × `keel_unusable_button_ack`. Aucune n'atteint le modèle |
| C9 | ✅ **PASS** | ① zéro charge des six familles émise · ② zéro ligne sur les six tables · ③ aucun bilan hebdo écrit |
| C10 | ✅ **PASS** | `{"fat_loss":3,"maintenance":2,"muscle_gain":5}` |

## C11 — LE CAS `planned`, le rouge qu'on ferme

Attendu ÉCRIT AVANT le tir. Un vrai plan a été composé pour `perte`
(`12-plan.sh`, HTTP 200 en 65 s, **1 plan vivant**), trois plats, un par
créneau, jeton de jour `tue` — cohérent avec aujourd'hui.

Le tir vise le **dîner** (déclaré 19:30, grâce 2 h → fenêtre 19:30–21:30), et
pas le déjeuner : celui-ci a déjà été demandé au tir C1, donc il rendrait
`already_asked` et on ne mesurerait rien. `slot_meal_ask_enabled` est remis à
`null` — l'extinction de C6 a été mesurée, elle ne doit pas masquer C11.

| attendu | |
|---|---|
| bulle | **une**, à `perte` |
| texte | « Tu as mangé le « Poulet épicé, riz, salade croquante et tahini » prévu pour le dîner ? » — le plat est **NOMMÉ** |
| boutons | **3** : `ate` · `notplanned` · `mute` |
| charges | `ate` et `notplanned` portent `\|<mealId>@<index>` ; `mute` ne le porte PAS |
| `solo` | rien : il n'a aucun plan, et son dîner est un cas `uncovered` |

### Le tir, et ce qu'il a trouvé

**Premier tir : ❌ ÉCHEC, et c'est un vrai défaut.** `perte`, dont le plan
compose un dîner, a reçu la question du créneau NON COUVERT :
« Rien n'était prévu pour le dîner ». Le journal du runtime le disait :

    keel.slot_meal.ticks_unreadable · user=50c6ddad… · error=[object Object]
    effect: fail-closed: tout est tenu pour repondu, aucune question ne part

`answeredDishIndexes` interrogeait `protocol_events.key` — **colonne qui
n'existe pas**. La clé de coche vit dans `source_message_id`, là où
`writeMealTick` l'écrit. La requête levait, le fail-closed tenait TOUT pour
répondu, et la question du créneau composé ne partait jamais : elle était
remplacée EN SILENCE par celle du créneau non couvert.

C'est la **même erreur** que dans les requêtes de preuve de la migration,
commise deux fois le même jour. Et le test unitaire était vert : son stub
répondait à `key`, parce que c'est ce que le code demandait — un décor qui ment
sur la forme cache le défaut qu'il devrait montrer.

Corrigé, plus une garde qui ne peut pas être un stub : `slot_meal_planned_io_test`
compare le LECTEUR à l'ÉCRIVAIN, tous deux lus sur le disque. Elle a
immédiatement trouvé un **troisième** site où l'erreur PostgREST était dépliée
naïvement en `[object Object]` — le journal ne disait donc pas que la colonne
manquait, et c'est ce qui a fait chercher ailleurs.

**Second tir (C11b), après relance de `functions serve` : ✅ PASS.**

    qa-chat-perte | Tu as mangé le « Yaourt, flocons d'avoine, fruits rouges
                  | et amandes » prévu pour le petit-déjeuner ?          | 3 boutons
    qa-chat-solo  | Rien n'était prévu pour le petit-déjeuner — tu as
                  | mangé quoi ?                                        | 4 boutons

    KEEL_SLOTMEAL_ate|2026-09-08|breakfast|33d0b5db-…@0
    KEEL_SLOTMEAL_notplanned|2026-09-08|breakfast|33d0b5db-…@0
    KEEL_SLOTMEAL_mute|2026-09-08|breakfast          ← sans segment de plan

Les DEUX branches partent dans le **même** passage de cron, sur le **même**
créneau, distinguées seulement par le fait que le plan le couvre. C'est l'axe
unique, mesuré.

| C12 | ✅ **PASS** | tap `Oui` → `meal_tick:33d0b5db…:0`, `as_planned`, aucun motif de disqualification, `slot_key=breakfast`. Accusé : « C'est coché. Dis-moi si ce n'était pas ça. » |
| C13 | ✅ **PASS** | zéro `ticks_unreadable` depuis la relance ; rejeu → `already_asked: 2` |

## Ce que le banc a corrigé, au total

1. **Les trois requêtes de preuve de la migration** — colonnes inexistantes.
2. **`answeredDishIndexes` lisait une colonne qui n'existe pas** — la question
   du créneau composé ne serait jamais partie, en production, en silence.
3. **Le dépliage naïf des erreurs PostgREST**, à trois endroits — `[object
   Object]` au moment exact où le journal doit tout dire.
4. **La garde du tir de composition comptait les appels modèle, pas les plans**
   — elle rougissait sur un `…density_repair` parfaitement sain.

## Ce que le banc a corrigé

**Les requêtes de preuve de la migration étaient fausses.** Trois erreurs, et
elles ne se voient qu'en les JOUANT : `updated_at` nommé sur deux tables qui
n'en ont pas, et `protocol_events.key` — colonne qui n'existe pas, la clé vit
dans `source_message_id`, préfixe en minuscules. Corrigées dans l'en-tête de
`20260908010000`, avec le mesuré.

**Une preuve qui plante est une preuve que personne ne joue.** C'est la seule
raison pour laquelle ce banc valait d'être lancé avant huit jours : les
requêtes, elles, se vérifient tout de suite.

## Le rouge est FERMÉ

Il disait : « la jointure entre un plan réel et la question reste non mesurée ».
Elle l'est maintenant — et elle était CASSÉE. Voir C11.
