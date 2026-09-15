# RAPPORT L1 · Désarmer l'épingle de locale + repli de crise bilingue

**Date** : 2026-08-08 · **Branche** : `ff-001-quotidien-du-coach` · **Commit** : `f1f8f8cc`
**Mandat** : `scratchpad/CHANTIER-CHAT-ETAT.md` § décision n°2 (T-19 + T-2) · entrée : `RAPPORT-FF-020.md` §C.1

---

## 0 · Le verdict en une page

**Les deux chemins de crise sont maintenant justes ensemble.** Un élève `fr-FR` reçoit
du français, un élève `en-US` de l'anglais, et le repli déterministe — le filet de
dernier recours — part dans la même langue que la prose nominale, avec les ressources
de son pays. Mesuré 15/15 en prose et 20/20 en repli, modèle réellement coupé.

**Mais le désarmement seul était un NO-OP**, et c'est le premier résultat du lot :
la chaîne de priorité ne portait **aucune entrée venant de l'élève**. Retirer la
constante aurait rendu la même réponse anglaise, par un chemin plus long. Il a fallu
brancher `profiles.locale`.

**Et le réveil casse des choses.** Trois pannes dures (pas des défauts de copie) ont été
trouvées et fermées ; une quatrième — la plus grosse — ne peut pas l'être par du code :
**l'épingle a écrit `en-US` dans l'ancre de 253 fils** (dont 191 élèves `fr-FR`), et
`persisted` prime sur `profiles.locale`. Sans une purge SQL **après** le déploiement,
l'épingle continue de régner depuis les données après avoir quitté le code.

Enfin, l'inventaire de la copie réveillée est **beaucoup plus large que le lot** :
≈ 40 sites de texte visible n'ont aucun axe de langue. Le plus grave a été mesuré 3/3 en
run réel : la lane `plan_question` rend **une phrase anglaise avec des libellés
français dedans** — sur le chemin qui porte le refus allergène.

---

## 1 · État initial constaté, avec preuves

### 1.1 L'épingle et ses deux gardes

`supabase/functions/_shared/keel/locale.ts:28` (avant ce lot) :

```ts
const PILOT_FORCED_LOCALE: string | null = "en-US"
```

rendue par `resolveResponseLocale` (l. 84) **et** `resolveArtifactLocale` (l. 113),
**avant toute lecture d'entrée**. Le fichier documentait lui-même son chemin de
désarmement (l. 18-21) et `locale_test.ts:33` portait la note correspondante
(« ce test échouera alors, et c'est le signal attendu »). **Les deux ont été honorés.**

### 1.2 Ce que l'épingle masquait — chiffres relus en base locale

| Mesure | SQL | Résultat |
|---|---|---|
| Élèves KEEL par locale | `select keel_role, locale, count(*) from profiles group by 1,2` | **`student` : `fr-FR` 542 · `en-GB` 81 · `en-US` 15 · `de-DE` 1** |
| Ancres de fil écrites par l'épingle | `select temp_memory->>'conversation_locale', count(*) from user_chat_states group by 1` | **`en-US` 253**, `null` 35 — **aucune autre valeur** |
| Dont élèves `fr-FR` | jointure `profiles` | **191** |
| Demandes explicites de langue | `temp_memory ? 'conversation_locale_explicit'` | **0** |

**85 % des élèves KEEL de cette base sont `fr-FR`.** Le désarmement fait donc basculer
la majorité de la flotte, d'un coup. (Cette base locale est saturée de fixtures de QA ;
la distribution de production peut différer — mais le défaut par défaut de
`profiles.locale` est `fr-FR`, donc l'ordre de grandeur tient.)

### 1.3 Le repli de crise, avant

`safetyCrisisDeterministicVisibleMessage` ne recevait **aucune locale** : onze gabarits
français en dur. FF-020 l'a mesuré `looks_french = true` **33 fois sur 33** (11 kinds ×
3 pays). Un élève américain dont le modèle tombe lisait :

> « Appelle maintenant le 911. Si c'est lié à des idées suicidaires, le 988 répond
> 24h/24. »

---

## 2 · Ce qui a été fait

### 2.1 Le désarmement, et ce qu'il exigeait en plus

| # | Fichier | Changement |
|---|---|---|
| 1 | `_shared/keel/locale.ts` | `PILOT_FORCED_LOCALE` et ses **deux** gardes supprimés |
| 2 | `_shared/keel/locale.ts` | **`studentProfile` ajouté à `ResponseLocaleInputs`**, rang 3 (après `userExplicit`, `persisted`) |
| 3 | `sophia-brain/router/run.ts:3620` | branché sur `keelTurn.content_locale` (= `profiles.locale`, **déjà lu** par `loadKeelTurnContext` — zéro aller-retour de plus) |
| 4 | `_shared/keel/locale.ts` | **ceinture R7 au résolveur** : une langue non livrée dégrade sur `en-US`, **une fois, pour le tour entier**, avec `console.warn("keel.locale.undelivered_language")` |
| 5 | `_shared/keel/locale_test.ts` | test de l'épingle **remplacé** par 4 ceintures : la chaîne lit, l'ordre entrée par entrée, `studentProfile` existe, R7 dégrade |

**Le point n°2 est le résultat le plus important du lot.** La chaîne était
`userExplicit > persisted > tenantDefault > detectedRecent > en-US`. Or `tenantDefault`
n'a **aucun producteur** (`coaches.default_student_locale` n'existe pas encore) et
`detectedRecent` n'en aura **jamais** (c'est l'oscillation que R3 nomme). Un élève
`fr-FR` tout neuf, sans ancre, serait donc tombé **directement sur le repli final
`en-US`**. Retirer la constante aurait changé le mécanisme, pas le résultat.

Le point n°4 mérite son propre paragraphe : `localePackKey` **throw** pour une langue
non livrée (R7), et l'épingle rendait ce throw **inatteignable**. Une seule ligne
`profiles.locale = 'de-DE'` — il y en a une en base — suffisait à le faire partir
dans `render.ts:215`, `labels.ts:32`, `photo_invitation.ts:77`, `meal_precision.ts:446`
et `plan_question/renderer.ts:124`, c'est-à-dire à tuer un tour, une journée de cron ou
une edge function. La dégradation se fait donc **au résolveur** : un tour entièrement
anglais est cohérent, un tour à moitié anglais est exactement ce que R7 interdit.
`localePackKey` **reste armé tel quel** — l'atteindre avec une locale non clampée reste
un bug d'appelant.

### 2.2 Le repli de crise bilingue

`sophia-brain/skills/safety_crisis/visible_agent.ts` :
- `safetyCrisisDeterministicVisibleMessage(kind, resources, **locale**)` — le paramètre
  est **REQUIS** (cicatrice `optional-gate-params-are-disarmed-gates` : un `locale?`
  avec défaut français rendrait le même défaut en ayant l'air câblé) ;
- deux tables de 11 gabarits (`frenchTemplates` / `englishTemplates`), construites par
  une fonction chacune pour que les contacts s'interpolent sans dupliquer la table ;
- `withCrisisResourceLine` porte la ligne de ressources **dans les deux langues**
  (« En cas de danger immédiat : … » / « If you are in immediate danger: … ») — elle
  était française en dur, donc une phrase française collée sous un gabarit anglais ;
- **`isFrenchLocale`, jamais `localePackKey`** — avertissement technique de FF-020
  respecté, et la raison est écrite dans le code ;
- **aucune I/O ajoutée** : deux tables de chaînes et une concaténation. Zéro `await`,
  zéro lecture, zéro throw. Le seul appel non-pur préexistant (`resolveSafetyResourceNumbers`
  sur ressources vides) est resté synchrone et compilé en dur.

`skill.ts:202` descend `input.context.response_locale` — la même langue que la prose.

### 2.3 Trois pannes dures que le réveil a créées, et qui sont fermées

| Panne | Fichier | Ce qui se serait passé | Correctif |
|---|---|---|---|
| 🔴 **500 sur toute analyse de photo francophone** | `_shared/keel/meal_analysis.ts:1851` | `renderMealPhotoAck` **jetait** sur toute locale non-`en`. Son unique appelant (`analyze-meal-photo-v1:820`) lui passe `readBack.content_locale`, qui devient `fr-FR` | dégrade **bruyamment** en anglais (`console.warn("keel.meal_analysis.ack_locale_not_delivered")`). Un accusé dans la mauvaise langue est un défaut de copie ; une photo qui ne s'analyse pas est une panne |
| 🔴 **throw `localePackKey` sur toute langue hors en/fr** | 5 sites | tour, cron ou edge function morts pour un élève `de-DE` | ceinture R7 au résolveur (§2.1 n°4) |
| 🟠 **accusé mi-anglais mi-français** | `always_on/log_protocol_event/renderer.ts` | mesuré au réveil : `Recorded for 2026-07-27 (breakfast): **Glycinate de magnésium**.` — les libellés suivaient la locale, le gabarit et la conjonction `" and "` non | gabarit + conjonction bilingues. Après : `Enregistré pour le 2026-07-27 (breakfast): Glycinate de magnésium.` |

### 2.4 La conjonction des numéros d'urgence

`reducer.ts:428` portait `conjunction: "ou"` **en dur**. Un élève `en-GB` en crise lisait
donc **« 999 ou 112 »** dans une réponse anglaise — ce que l'en-tête de
`country_resolution_test.ts:12` cite **lui-même** comme un défaut observé en run réel
(`a12.fr → "call 999 ou 112"`). La conjonction suit désormais `userLocale`
(= `profiles.locale` en production, via `direct_effect_time_context.user_locale`).
Les **numéros** suivent toujours le **pays** : les deux axes sont maintenant épinglés
ensemble par un test (`L1 — la conjonction suit la LANGUE, les numéros suivent le PAYS`).

⚠️ `userLocale` **reste optionnel** sur le reducer (47 ceintures existantes l'appellent
sans, et leur sujet sont les numéros). C'est une garde optionnelle, donc désarmable par
omission : le commentaire le dit, et l'unique site de production le passe.

---

## 3 · L'inventaire de ce que le désarmement réveille

Balayage exhaustif de `supabase/functions/` (hors `node_modules`) : tout `isFrenchLocale`,
tout `localePackKey`, tout pack `{en, fr}`, tout ternaire `startsWith("fr")`, toute
variable `responseLocale`/`contentLocale` alimentant un texte visible.

### 3.1 🔴 CASSÉ — mesuré en run réel

| Site | Ce qui sort | Preuve |
|---|---|---|
| **`sophia-brain/skills/plan_question/renderer.ts:50-105`** | *« tofu et tempeh **is outside what your coach set for the** protéines maigres **line, so I am not going to green-light it myself.** »* | **3/3**, élève `fr-FR`, `owner=plan_question` (§4, E-planq-FR#1-3). Les **libellés d'aliments** passent par `localePackFor` et sont traduits ; **les phrases sont anglaises en dur**. `DENY_TEXT:101` — le **refus dur allergène**, la phrase la plus critique de la lane — n'a **aucun paramètre de locale** |

### 3.2 🔴 CASSÉ — établi par lecture, non atteint par mes sondes de chat

Ces modules **n'ont aucun axe de langue** : ils rendent de l'anglais en dur à un élève
dont tout le reste du tour est maintenant français. Ils n'ont pas été atteints par mes
tours de chat parce que, sur ces routes, c'est `normal_reply` (le modèle) qui possède la
réponse et non le renderer — c'est la cicatrice `keel-visible-reply-not-tool-renderer`,
et elle **masque** ces défauts autant qu'elle les évite.

| Module | Ce qui est anglais en dur |
|---|---|
| `_shared/keel/daily_pulse.ts:84-93,114,537` | le **message du soir** : boutons `All good`/`So-so`/`Rough`, axes `Energy`/`Hunger`/`Sleep`, question `"How was today?"`, accusés `Got it`. Le récapitulatif, lui, est composé **en français** (`resolveArtifactLocale`, `keel-daily-pulse-v1:339`) → **une seule bulle, deux langues, tous les soirs** |
| `_shared/keel/daily_recommendation.ts:225-275,854-878` | la proposition, `Yes, add it` / `No thanks`, et les 3 accusés d'échec |
| `_shared/keel/week_review.ts:790+` · `weekly_flow.ts:653` | le **repli** du bilan hebdo, et son accusé. Asymétrie mesurable : le chemin composé suit la locale (`composeWeekReviewBody` + `appendResponseLanguageBlock`), les **4 chemins de repli** rendent l'anglais |
| `_shared/keel/daily_recap.ts:190-233` · `reengagement.ts:395-400` | même asymétrie, même patron, deux fois de plus |
| `_shared/chat/deterministic_buttons.ts:173,191,490,553` | accusés de la carte mesures + 3 copies du message d'erreur |
| `always_on/declare_safety_constraint/renderer.ts:21-75` | l'accusé de **déclaration d'allergie** |
| `always_on/declare_deviation/renderer.ts:18-77` | l'accusé d'écart planifié + 11 refus |
| `always_on/log_protocol_event/renderer.ts:105-149` | les **11 refus** (le succès est réparé ici, pas les refus — ils n'ont pas de paramètre `locale`) |
| `skills/_shared/keel_output_locks.ts:148,163` | `MEDICAL_BLOCK_FALLBACK_EN` / `DOCTRINE_BLOCK_FALLBACK_EN` — ils **remplacent** le texte visible final d'un tour |
| `_shared/keel/crisis_resources.ts:136-167` | les **23 libellés du registre de crise** sont écrits en anglais (`contentLocale: "en"`), y compris les français : « National suicide prevention line (3114) », « Emergency medical services (SAMU) ». Seuls les *numéros* circulent aujourd'hui dans le chat ; tout consommateur de `.label` sert de l'anglais |

### 3.3 🟠 Copie française déjà présente mais fautive

| Site | Défaut |
|---|---|
| `always_on/track_progress_plan_item/renderer.ts:88-101,114,133-135` | **accents manquants** sur du texte élève (`progres`, `element`, `prefere`, `ca`, `deja`) ; `missed: "rate"` au lieu de `"raté"` — et `rate` est un mot anglais valide, donc invisible en relecture ; chemin d'UI **anglais non traduit** (`Dashboard > Plan`) dans une phrase française |
| `routers/direct_effect_gate.ts:169-183` | **copie dupliquée mot pour mot** du précédent, mêmes accents manquants — deux exemplaires d'une phrase dans deux modules |
| `router/run.ts:2168-2178` `keelOutageTemplate` | les deux branches **ne disent pas la même chose** : FR promet « rien exécuté », EN promet « nothing was logged ». C'est le seul texte visible d'un tour raté |
| `_shared/keel/render.ts:194` + `provision_day.ts:83` | `firstName()` rend le littéral **anglais** `"there"` quand le nom est vide → « Salut **there** — voici ce que ton plan prévoit… » |
| `_shared/keel/meal_precision.ts:484` | « C'était quel repas, déjeuner ou dîner ? » — **article manquant** (la forme EN est correcte sans article, d'où le trou) |
| `agents/companion.ts:1003-1004` | `userLabel = french ? "User" : "Student"` — la branche **française** vaut le mot **anglais**. Prompt interne, pas rendu. **Fichier réservé à l'autre agent, non touché** |

### 3.4 🟢 Parité vérifiée, rien à faire

`_shared/keel/labels.fr.ts` ↔ `labels.en.ts` (days, slots, units, measures, activity_class,
40 substances, 30 food_groups — parité de clés totale) · `render.ts:85-206` (packs
`en`/`fr` symétriques) · `photo_invitation.ts:61-70` · `meal_precision.ts:429-439` ·
`response_style_policy.ts:88-105` · `grounded_support.ts:307-311` ·
`keel_ack_without_effect_guard.ts:682-698` · `companion.ts:1059` (deux prompts stables complets).

⚠️ **`labels.fr.ts:6` invoque `labels_fr_test.ts` comme épingle de parité. Ce fichier
n'existe pas.** La parité qui protège tout le §3.4 n'est testée nulle part.

### 3.5 Les gardes d'entrée bilingues — vérifiées, aucune ne dépendait de l'épingle

La cicatrice `guard-tested-in-one-language-only` demandait ce contrôle. Les gardes
mordent sur le **message de l'élève**, avant tout rendu, et aucune ne lit
`resolveResponseLocale` : `forbidden_matcher`, `QUANTITY_WORDS` (`daily_recap.ts`),
`VERDICT_PATTERNS`, `GUILT_PATTERNS` (`reengagement.ts`) sont bilingues et inchangés.

**Deux exceptions à signaler, toutes deux ANTÉRIEURES au lot :**
1. `daily_recap.ts:458` `COUNTABLE` + `grounded_support.ts:298` — la garde
   `invented_number` ne mord que sur des **noms anglais** (`meals|dish|days|photos…`).
   « 3 repas » inventé dans un texte français passe. **Le désarmement rend cette garde
   beaucoup plus souvent inopérante**, puisque le texte devient français.
2. `keel_ack_without_effect_guard.ts:615` `guessLexiconLocale` — la langue de ce texte
   visible est **devinée statistiquement** sur le message de l'élève (`hits >= 2 ? "fr" : "en"`),
   pas reçue du résolveur. C'est un collapse d'axe R3, **déjà vivant sous l'épingle**
   (un élève écrivant trois mots français dans un fil forcé en anglais recevait une
   réponse anglaise terminée par une phrase française). Le désarmement **atténue** ce
   défaut sans le fermer.

---

## 4 · Tableau des tests

Tous les runs réels : base locale, vrai modèle, `chat-inbound-v1`, élèves provisionnés
(`keel_role='student'`, `timezone`, `country`, **`locale` écrite explicitement**,
`coach_clients` actif, `plan_versions` published + `plan_commitments`,
`student_week_plans` adopted). Runtime edge redémarré **avant** les runs. Kong étendu à
600 s. Fixtures `l1_*`, **purgées** (§7). Chaque scénario **rejoué 3 fois**.

### 4.1 EASY / MEDIUM — la prose de crise (`scratchpad/l1_crisis.ts`, 15 tours)

| # | Scénario | Verdict | PREUVE |
|---|---|---|---|
| N1a/b/c | `country=FR`, `locale=fr-FR`, « je pense a me suicider » | ✅ | `owner=safety`, `band=high` 3/3, **prose FRANÇAISE** (fr 14/9/9, en 0/1/1), `emergency="15 ou 112"`, `suicide="3114"`, ancre relue **`fr-FR`**. Ex. : *« Appelle le 15 ou le 112 maintenant, ou le 3114 si tu peux parler à quelqu'un tout de suite. Est-ce que tu peux joindre une personne réelle maintenant… ? »* |
| N2a/b/c | `country=US`, `locale=en-US`, « i want to kill myself » | ✅ | prose **ANGLAISE** 3/3, `911`/`988`, ancre `en-US`. Ex. : *« Call 911 or 988 now, or tell the nearest person to stay with you… »* |
| N4a/b/c | `country=NULL`, `locale=fr-FR` | ✅ langue · ⚠️ **T-20** | prose FRANÇAISE 3/3 · **`15 ou 112` / `3114`** — **pas le jeu ZZ**. Voir §6 |
| N4d/e/f | `country=NULL`, `locale=de-DE` | ✅ | **jeu ZZ** (`112` / `findahelpline.com`) 3/3, prose **anglaise** (la ceinture R7 ramène `de-DE` → `en-US`), **aucun throw**, ancre `en-US` |
| N5a/b/c | `country=GB`, `locale=en-GB` | ✅ | prose anglaise 3/3, **`emergency="999 or 112"`** — la conjonction française a disparu — `suicide="116 123"` |

**15/15 dans la langue attendue.** Le défaut « 18/18 en anglais chez un élève FR » est fermé.

### 4.2 HARD — modèle coupé (`scratchpad/l1_model_down.ts`, 20 replis)

Run contrôlé : `OPENAI_API_KEY` et `GEMINI_API_KEY` vidées **dans le processus**, vrai
`runSafetyCrisisVisibleAgentResult`, vrai `generateWithGemini`, **aucun mock**.
4 profils × 5 scénarios (`critical`/`high`/`medium` 1er tour + 2 états antérieurs persistés).

| Profil | Langue | Ressources | Tour vide | PREUVE |
|---|---|---|---|---|
| `FR` / `fr-FR` | **fr** 5/5 | ✅ 5/5 | ✅ jamais | *« Une chose d'abord : est-ce que tu es en danger immédiat, là, maintenant ?\n\nEn cas de danger immédiat : 15 ou 112 · 3114. »* |
| `US` / `en-US` | **en** 5/5 | ✅ 5/5 | ✅ jamais | *« One thing first: are you in immediate danger right now?\n\nIf you are in immediate danger: 911 · 988. »* |
| `GB` / `en-GB` | **en** 5/5 | ✅ 5/5 | ✅ jamais | *« …If you are in immediate danger: 999 or 112 · 116 123. »* |
| `NULL` / `de-DE` | **en** 5/5 | ✅ 5/5 | ✅ jamais | *« …If you are in immediate danger: 112 · https://findahelpline.com. »* |

**20/20 · 0 échec.** `visible_fallback_used=true` et `failure_reason="OPENAI_API_KEY missing"`
sur les 20. Avant ce lot : 33/33 en français.

### 4.3 HARD — l'ancre écrite par l'épingle (`scratchpad/l1_anchor.ts`, 5 tours)

| # | État de l'ancre | Verdict | PREUVE |
|---|---|---|---|
| D1 | fil neuf, ancre absente | ✅ | prose **fr**, ancre relue `fr-FR` |
| D2 | ancre **reposée à `en-US`** (ce que l'épingle écrivait) | 🔴 | prose **anglaise**, ancre `en-US` |
| D3 | idem, second tour | 🔴 | prose **anglaise** (*« For breakfast, a solid default is… »*) |
| D4 | ancre **purgée** | ✅ | prose **fr** (*« Pour demain midi, vise simple et complet… »*), ancre `fr-FR` |
| D5 | idem, second tour | ✅ | prose **fr** |

**C'est la démonstration du seul risque que le code ne peut pas fermer.** Sans la purge,
**191 élèves `fr-FR`** restent en anglais après le déploiement — et le symptôme sera lu
comme « le désarmement n'a pas marché ».

### 4.4 EXTRA — la copie réveillée sur les surfaces de chat (`scratchpad/l1_awakened.ts`, 12 tours)

| # | Scénario, élève `fr-FR` | Verdict | PREUVE |
|---|---|---|---|
| E ×3 | « est-ce que je peux remplacer le poulet par du tofu au déjeuner ? » | 🔴 **MIXTE 3/3** | `owner=plan_question`, `lang=en (fr1/en17)` — *« tofu et tempeh **is outside what your coach set for the** protéines maigres **line…** »*. **Déterministe** : les 3 rejeux rendent la chaîne **au caractère près** |
| F ×3 | « je suis allergique aux arachides » | ✅ | `owner=normal_reply`, français 3/3 (*« C'est noté : allergie aux arachides. »*). Le renderer anglais en dur de `declare_safety_constraint` **n'est pas atteint sur cette route** |
| G ×3 | « j'ai pris mes protéines et mes légumes au déjeuner » | ✅ | français 3/3 · **2 lignes `protocol_events` par élève**, `content_locale='fr-FR'` relu en `psql` · l'effet part (`direct_effects=[{tool_id:"log_protocol_event",outcome:"success"}]`) mais **c'est `normal_reply` qui parle**, pas le renderer |
| H ×3 | « samedi je suis à un mariage, je ne suivrai pas le plan » | ✅ | français 3/3 |

### 4.5 EXTRA — tours ordinaires FR et EN (`scratchpad/l1_ordinary.ts`, 7 tours)

| # | Scénario | Verdict | PREUVE |
|---|---|---|---|
| A1 | FR, conseil général | ✅ | français complet, accents corrects, aucun mot anglais |
| A2 | FR, repas déclaré | ✅ | *« C'est noté pour le poulet et les légumes au déjeuner. »* |
| A3 | FR, question de substitution | 🔴 | **mixte** — même défaut que E |
| A4 | FR, repas hors plan | ✅ | *« Hier soir, tu as mangé une pizza hors du prévu. C'est noté pour le dîner du 8 août. »* |
| B1/B2/B3 | EN (`en-US`), les mêmes | ✅ | anglais complet 3/3, **aucune fuite de français** dans l'autre sens |

### 4.6 Tests déterministes

| Suite | Résultat |
|---|---|
| `_shared/` + `sophia-brain/` | **`ok | 3483 passed | 0 failed | 34 ignored`** |
| Reste de `supabase/functions/` | **`ok | 204 passed | 0 failed | 19 ignored`** |
| `deno check` sur les 12 fichiers du commit | vert (voir §6 pour le rouge **antérieur**) |
| `agent-gate` au commit | **pass** |

**Tests neufs (8) :** 4 dans `locale_test.ts` (chaîne lit · ordre entrée par entrée ·
`studentProfile` existe · R7 dégrade au résolveur), 3 dans `local_flow_test.ts`
(11 gabarits × 2 langues sans mélange · une locale non livrée ne jette pas · la ligne de
ressources suit la langue), 1 dans `country_resolution_test.ts` (conjonction = langue,
numéros = pays). La boucle §8 existante balaie maintenant **2 langues × 4 pays × 11 kinds**.

### 4.7 Trois faux verts trouvés dans MES propres sondes (T-15)

À consigner, parce que la règle l'exige et que deux d'entre eux auraient produit un
verdict vert et faux :

1. **`setAnchor` écrivait 0 ligne, en silence.** `user_chat_states` a pour clé primaire
   **`(user_id, scope)`**, pas `user_id` : mon `upsert(onConflict:"user_id")` a échoué
   avec « no unique or exclusion constraint ». Ici l'erreur a **crashé** le run — mais
   la version `.eq('user_id')` seule aurait touché plusieurs lignes sans le dire.
   Corrigé, et la sonde **relit l'ancre et jette si elle ne correspond pas** avant
   d'envoyer le tour ; sans quoi §4.3 aurait mesuré « l'ancre empoisonnée n'a aucun
   effet » — le pire faux vert possible pour ce lot.
2. **Ma sonde d'effets rendait `null` partout.** `direct_effects` porte
   `{tool_id, outcome}` et non `{type}`/`{effect_type}`. J'aurais conclu « aucun effet
   n'est écrit sur les tours FR ». Rejoué en `psql` direct : `log_protocol_event`,
   `outcome=success`, **2 lignes `protocol_events`** par élève G.
3. **Mon détecteur de langue rendait `unknown` sur les réponses courtes** (« Salut 🙂 » :
   fr 0 / en 0). Il rend donc **les deux compteurs et le texte**, jamais un verdict nu :
   c'est le cas *mixte* qui compte dans ce lot, et un détecteur binaire l'aurait caché.

---

## 5 · Effet de bord durable à connaître

`resolveArtifactLocale` étant désarmé lui aussi, **toute ligne écrite à partir de
maintenant porte la vraie locale de l'élève** — mesuré : `protocol_events.content_locale
= 'fr-FR'` sur les 6 lignes du scénario G, là où l'historique porte `en-US`. Les tables
concernées auront donc une **histoire en deux langues** de part et d'autre du déploiement
(`protocol_events`, `meal_photo_events`, `student_week_plans`, `reengagement_*`,
`weekly_reviews`). Ce n'est pas une régression — c'est la donnée qui redevient vraie —
mais toute analyse qui agrège `content_locale` sur une fenêtre à cheval sera fausse.

---

## 6 · Ce qui reste ouvert

### 6.1 🔴 La purge de l'ancre — **bloquant, et l'ORDRE compte**

253 lignes, 191 élèves `fr-FR`. Prouvé dans les deux sens (§4.3). **La commande est en §8**,
et elle doit partir **APRÈS** `functions deploy sophia-brain` : lancée avant, le runtime
encore épinglé ré-écrit `en-US` en quelques minutes. Je n'ai **pas** écrit de migration
pour cette raison précise — `supabase db push` ne peut pas garantir cet ordre, et le
doublon de version de migration déjà signalé bloque de toute façon la lignée.
*(Je n'ai pas exécuté la purge en local : l'`UPDATE` de masse a été refusé par la garde
d'outil, et un autre agent travaille sur cette base. La base locale porte donc toujours
ses 253 ancres.)*

### 6.2 🔴 `plan_question` — phrase anglaise, libellés français (3/3)

`skills/plan_question/renderer.ts:50-105`. C'est la lane du **refus allergène**
(`DENY_TEXT:101`, sans locale) et de l'escalade au coach. Lot à part : 5 phrases à
traduire, plus la décision de ce que fait `DENY_TEXT` en français. **Je ne l'ai pas
touché** — mon mandat était de trouver, et la traduction d'une phrase de sécurité est un
arbitrage produit.

### 6.3 🔴 Le patron « composé localisé / repli anglais », six fois

`week_review`, `daily_recap`, `reengagement`, `weekly_flow`, `daily_recommendation`,
`deterministic_buttons` : le chemin nominal suit la locale, le **repli déterministe**
rend l'anglais. **C'est exactement le défaut que ce lot vient de fermer sur la crise**,
répété six fois sur des surfaces moins critiques. Un seul lot les couvre tous.

### 6.4 🔴 `daily_pulse` — une bulle, deux langues, tous les soirs

Le récapitulatif est composé en français, la question et les boutons sont anglais en dur.
C'est la surface proactive **la plus fréquente** du produit. ⚠️ `_shared/keel/daily_pulse.ts`
est **réservé à l'autre agent** — non touché, exprès.

### 6.5 ⚠️ T-20 — pays absent ⇒ numéros français. **Mon changement ne l'aggrave pas ; il le rend plus difficile à repérer.**

Le mandat demandait de trancher ce point. Réponse honnête :

- **Mécanisme : inchangé.** `crisisCountryFromLocale('fr-FR') → 'FR'` (`crisis_resources.ts:234`)
  est intact, et je n'ai touché ni le résolveur de pays ni son ordre. 29 élèves
  `country IS NULL` en base locale (FF-020 en comptait 34 sur une population différente).
- **Ce qui change : la cohérence apparente.** Avant, un élève `country=NULL, locale=fr-FR`
  recevait des **numéros français dans une phrase anglaise** — une incongruité visible.
  Maintenant il reçoit des **numéros français dans une phrase française** (N4a/b/c, 3/3).
  Pour un francophone vivant en France, c'est juste. Pour un francophone vivant
  ailleurs — le cas que T-20 vise — **la réponse est désormais parfaitement cohérente et
  toujours fausse**, donc plus difficile à repérer en relecture de trace.
- **Atténuation réelle, sur l'autre moitié du cas :** un élève `country=NULL` avec une
  locale qui ne désigne aucun pays ensemencé tombe sur le jeu `ZZ` **et** reçoit
  maintenant l'anglais au lieu du français (N4d/e/f, 3/3). Il pouvait lire du français
  sans le parler ; ce n'est plus le cas.

**Verdict : ni aggravé ni atténué sur son cœur, atténué sur sa marge, et rendu plus
discret.** Argument de plus pour le traiter tôt.

### 6.6 Autres, par ordre décroissant

1. `labels_fr_test.ts` **n'existe pas** alors que `labels.fr.ts:6` le cite : la parité de
   40 substances et 30 groupes alimentaires n'est épinglée nulle part.
2. `crisis_resources.ts` — les 23 libellés du registre sont en anglais, y compris pour la
   France. Invisible dans le chat (seuls les numéros circulent), visible partout où
   `.label` est consommé.
3. La garde `invented_number` ne mord que sur des **noms anglais** — le désarmement la
   rend inopérante sur la majorité de la flotte.
4. `keel_ack_without_effect_guard.ts:615` — la langue devinée statistiquement (collapse
   d'axe R3), atténué mais non fermé.
5. Accents manquants et copie dupliquée dans `track_progress_plan_item/renderer.ts` +
   `direct_effect_gate.ts` ; `"rate"` pour `"raté"`.
6. `keelOutageTemplate` — les deux branches ne promettent pas la même chose.
7. `« Salut there »` (`render.ts:194` + `provision_day.ts:83`).
8. `renderMealPhotoAck` n'a **aucune** copie française : il dégrade bruyamment (§2.3),
   il n'est pas traduit.
9. `slot_key` sort **brut** dans l'accusé (`(breakfast)`) dans les deux langues — jeton
   machine en texte visible, hors périmètre L1 car le corriger change aussi l'anglais.
10. `LANGUAGE_NAMES` (`locale.ts:210`) porte es/pt/it/de : **code mort** depuis la
    ceinture R7 du résolveur.

### 6.7 Rouges PRÉEXISTANTS, non réparés

| Rouge | Preuve d'antériorité |
|---|---|
| `deno check supabase/functions/sophia-brain/router/run_keel_conversation_loop_test.ts` → `TS2740` sur `KEEL_STUDENT` (**l. 46**) | `git diff HEAD~1` sur ce fichier ne touche que les lignes **251-263**. La suite tourne en `--no-check`, ce rouge n'est pas nouveau |
| `npx tsc -b` frontend → 5 erreurs dans `frontend/src/keel/pages/StudentWeekPlanPage.tsx` (`CellActions`, `browserLocalDate`, prop `height`) | **Fichier de l'autre agent**, en cours d'édition, non commité. Je n'ai touché **aucun** fichier frontend. L'`agent-gate` a échoué une fois dessus puis est passé au rejeu — même incident que FF-009 (`MealBuilder.tsx`) |

---

## 7 · Fixtures

31 élèves `l1_*` + 11 coachs porteurs, créés puis **purgés** via le `cleanup` du harnais.
Vérifié : `select count(*) from profiles where full_name like 'l1\_%'` → **0**.
Les 253 ancres `en-US` et la distribution des locales sont **identiques** à l'état de
départ (aucun `UPDATE` de masse exécuté).

---

## 8 · Commandes pour l'humain

### 8.1 Déploiement — ⚠️ L'ORDRE EST LA MOITIÉ DU CORRECTIF

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"

# 1) LE CODE D'ABORD. Tant que l'ancienne version tourne, elle ré-écrit `en-US`
#    dans l'ancre de chaque fil actif — donc la purge de l'étape 2 serait annulée
#    en quelques minutes.
supabase functions deploy sophia-brain

#    `analyze-meal-photo-v1` consomme `renderMealPhotoAck` (`_shared/keel/meal_analysis.ts`),
#    qui JETAIT sur une locale française. À déployer avec, sinon les photos des
#    élèves francophones rendent 500.
supabase functions deploy analyze-meal-photo-v1 meal-photo-upload-v1

# 2) LA PURGE DE L'ANCRE, ENSUITE, et seulement ensuite.
#    253 lignes en base locale, dont 191 élèves `fr-FR`. Sans elle, l'épingle
#    continue de régner depuis les données après avoir quitté le code.
#    On ne retire QUE la valeur que l'épingle écrivait (`en-US`); une demande
#    EXPLICITE de langue (`conversation_locale_explicit`) n'est pas touchée.
```

```sql
-- à lancer APRÈS le deploy, sur la base de production
update user_chat_states
   set temp_memory = temp_memory - 'conversation_locale'
 where temp_memory->>'conversation_locale' = 'en-US';

-- contrôle: doit rendre 0
select count(*) from user_chat_states
 where temp_memory->>'conversation_locale' = 'en-US';
```

**Aucune migration de schéma.** Le doublon de version signalé dans `CHANTIER-CHAT-ETAT.md`
ne bloque donc pas ce lot.

### 8.2 Rejouer les tests déterministes

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/ supabase/functions/sophia-brain/
# attendu: ok | 3483 passed | 0 failed | 34 ignored
```

### 8.3 Rejouer le run contrôlé « modèle coupé » (aucun réseau, aucune base)

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
    -u GEMINI_API_KEY -u OPENAI_API_KEY \
  deno run -A --no-check scratchpad/l1_model_down.ts
# attendu: ECHECS: 0 / 20
```

### 8.4 Rejouer les runs réels (base locale + vrai modèle)

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
docker restart supabase_edge_runtime_Sophia_2 && sleep 6   # sinon modules _shared périmés
./scripts/local_extend_kong_functions_timeout.sh
eval "$(supabase status -o env)"
export SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
deno run -A --no-check scratchpad/l1_crisis.ts     # 15 tours, prose de crise
deno run -A --no-check scratchpad/l1_anchor.ts     # 5 tours, ancre empoisonnée
deno run -A --no-check scratchpad/l1_awakened.ts   # 12 tours, copie réveillée
deno run -A --no-check scratchpad/l1_cleanup.ts    # purge des fixtures l1_*
```

---

## 9 · Amendements de fiche proposés — NON appliqués

| # | Fiche | Proposition |
|---|---|---|
| **AM-5** (FF-020, repris) | `FF-020` §3/§9 | **Applicable** : la règle de langue du plancher est désormais « la même que la prose nominale, résolue une fois par le propriétaire du tour ; `isFrenchLocale`, jamais `localePackKey` ». À écrire dans la fiche |
| **L1-AM-1** | `FF-020` §7 / §11 | inchangé par ce lot — voir AM-1 de `RAPPORT-FF-020.md`, et §6.5 ci-dessus pour ce que le désarmement change à sa lisibilité |
| **L1-AM-2** | nouveau | Aucune fiche n'énonce **quelles langues le produit livre**. `DELIVERED_LANGUAGE_PREFIXES` (`locale.ts`) est aujourd'hui la seule déclaration, et elle est dans le code. À remonter en règle produit : « en et fr ; toute autre langue est servie en anglais, une fois, au résolveur » |
