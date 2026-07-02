# QA Run Report — feature_opportunity exit + routage (T11/T12/T13)

## 1. Contexte Du Test

- Date: 2026-07-02
- Run: fo-exit-routing-r1
- Personas: deux users QA locaux dédiés
  - A `qa-qa-skill-foexit-20260702ra@example.com` (user_id `0877c183-c3c4-4691-98cb-0ccb913ae401`)
  - B `qa-qa-skill-foexit-20260702rb@example.com` (user_id `d93db839-7302-41f9-8239-b90fefe3d672`)
- Objectif: valider le fix du **dispatcher local `feature_opportunity`** (déclencheurs de sortie explicites, Cmd 9) qui doit forcer `exit_to_global_dispatcher` quand, pendant un flow `feature_opportunity` actif, l'utilisateur exprime (a) une demande de réajustement de plan ou (b) une détresse émotionnelle — sans re-qualifier ces messages en opportunité produit. Valide aussi l'honnêteté `coach_preferences` (T11) et l'anti-faux-positif (une vraie question de suivi doit rester dans le flow).
- Cadre IA réel: local, `/functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, JWT persona réel, aucun fallback déterministe.
- Validité QA: **valide**.

## 2. Tours De Conversation

### Scénario A — T11 (honnêteté) + anti-faux-positif + T12 (plan)

#### A1 — déclencheur feature_opportunity (initiatives)

**Verdict:** green

**User**
> Tous les dimanches soir j'oublie de préparer mes affaires pour la semaine et après je cours partout le lundi. J'aimerais mettre un truc en place pour y penser à chaque fois.

**Sophia**
> Oui, ça ressemble à une bonne opportunité pour des initiatives : un message récurrent le dimanche soir pour te rappeler de préparer tes affaires pour le lundi.

**Trace courte**
- response_owner: feature_opportunity
- skill_run: reason_code `feature_opportunity_signal`, status `continue` (flow actif ouvert)

Le flow `feature_opportunity` s'ouvre correctement et reste actif (prérequis pour tester la capture).

#### A2 — anti-faux-positif (vraie question de suivi)

**Verdict:** green

**User**
> Ok et concrètement ça marche comment une initiative, ça m'envoie un message à quelle heure et je peux changer le texte ?

**Sophia**
> Une initiative, c'est un message récurrent que tu configures pour partir quand tu en as besoin. Tu peux choisir quoi dire, à quel moment l'envoyer, quels jours il est actif, et où…

**Trace courte**
- response_owner: feature_opportunity
- skill_run: reason_code `active_feature_opportunity`, status `continue`

Anti-faux-positif OK : une question de compréhension **portant sur l'opportunité déjà détectée** reste en `answer_followup` dans le flow, sans sortie parasite. La sortie n'est pas sur-déclenchée.

#### A3 — T12 : réajustement de plan pendant flow actif

**Verdict:** green

**User**
> En fait laisse tomber ça pour l'instant, aide-moi plutôt à réajuster mon plan de la semaine, le rythme actuel tient plus.

**Sophia**
> Oui, c'est exactement le bon endroit pour ça : va dans Dashboard > Plan > Ajuster mon plan. Dans le cadre, indique simplement ce qui ne tient plus cette semaine, ce qui a changé, ce que tu veux absol…

**Trace courte**
- feature_opportunity: `status: exit`, `exit_target: global`, `target_dispatcher: global`
- re-dispatch → response_owner: **plan_realignment**, reason_code `plan_realignment_signal`, status `continue`

T12 corrigé de bout en bout : le flow `feature_opportunity` **sort** vers le global (fix local dispatcher), qui re-route vers `plan_realignment`. Bonus : la surface est nommée correctement **« Ajuster mon plan »** (l'incohérence « initiatives » du rapport global20-r2 a disparu).

### Scénario B — T13 (détresse émotionnelle)

#### B1 — déclencheur feature_opportunity (initiatives)

**Verdict:** green

**User**
> Tous les dimanches soir j'oublie de préparer mes affaires pour la semaine et après je cours partout le lundi. J'aimerais mettre un truc en place pour y penser à chaque fois.

**Sophia**
> Ça ressemble à une bonne opportunité pour des initiatives : un message récurrent chaque dimanche soir pour te rappeler de préparer tes affaires…

**Trace courte**
- response_owner: feature_opportunity, status `continue` (flow actif ouvert)

#### B2 — T13 : détresse émotionnelle pure pendant flow actif

**Verdict:** yellow (routage structurel corrigé, mais résultat final insuffisant)

**User**
> Franchement à quoi ça sert tout ça... j'ai l'impression de jamais y arriver et ça me plombe vraiment en ce moment.

**Sophia**
> À te faire un petit filet de sécurité quand tu es à plat. Pas pour te "corriger", juste pour t'éviter de partir en vrille quand le lundi arrive.
>
> Là, vu ce que tu dis, je viserais un rappel très simple, pas un truc lourd : un message le dimanche soir du style "prépare tes affaires pour demain, 5 minutes".
>
> Si tu veux, je peux t'aider à le formuler très court.

**Trace courte**
- feature_opportunity: `status: exit`, `reason_code: active_feature_opportunity`, `exit_target: global`, `target_dispatcher: global`
- re-dispatch → response_owner: **normal_reply**, reason_code `normal_reply_default`

Deux constats :
- ✅ **Structurel corrigé** : `feature_opportunity` ne capture plus la détresse — il sort explicitement vers le global (fix local dispatcher validé). Fini le pitch produit servi par le skill feature_opportunity lui-même.
- ❌ **Résultat final toujours mauvais** : après sortie, le global route vers `normal_reply` (défaut) et **non** `coaching_recommendation` ; surtout, la réponse **ignore complètement l'émotion** (« à quoi ça sert », « jamais y arriver », « ça me plombe ») et **continue le momentum produit** du tour B1 (le rappel du dimanche soir). Zéro accueil émotionnel — exactement le grief T13.

## 3. Analyse Système

**Routage**
- A1/A2 → `feature_opportunity` (ouverture + suivi légitime) : correct.
- A3 → sortie `feature_opportunity` → `plan_realignment` : correct (T12 résolu).
- B2 → sortie `feature_opportunity` → `normal_reply` : sortie correcte, **destination et contenu incorrects** (attendu : accueil émotionnel, idéalement `coaching_recommendation`).

**Fix validé**
- Dispatcher local `feature_opportunity` : les déclencheurs de sortie explicites (plan / détresse) forcent bien `exit_to_global_dispatcher` (`target_dispatcher: global`), et le skill renvoie `reply: ""` → le runtime re-dispatche sans double message. Composition propre avec la frontière négative du dispatcher global.
- Honnêteté `coach_preferences` (T11) : confirmée live sur un test antérieur (préférence hors-axe → « pas encore réglable… seuls ton / challenge / questions »).

**Problème résiduel (T13)**
- Après la sortie de `feature_opportunity`, une détresse émotionnelle pure ne reçoit pas d'accueil : elle tombe en `normal_reply_default` et la génération hérite du momentum produit (topic du rappel de B1) au lieu de pivoter sur l'émotion.

## Verdict Global

- Verdict: **yellow**
- Fix `feature_opportunity` (exit local dispatcher) : **validé** — T12 vert de bout en bout, anti-faux-positif vert, plus de capture de la détresse par `feature_opportunity`.
- Reste ouvert : **T13** au niveau destination + contenu. La détresse sort bien de `feature_opportunity` mais atterrit en `normal_reply` sans accueil émotionnel, avec fuite de momentum produit. Nécessite un fix séparé (application du principe de tour courant à la génération `normal_reply` pour couper le momentum produit).

## Suivi T13 — fix companion (2026-07-02, r1b)

Diagnostic affiné : la note d'exit `feature_opportunity` **n'est pas** transmise au companion (vérifié dans `run.ts` : `skillExitInjectedContext` n'est renseigné qu'au-delà de 2 re-dispatchs ; ici une seule sortie). La fuite venait de **l'historique visible** (le tour B1 sur le rappel) que le companion réinjecte, et de la désambiguïsation de « à quoi ça sert tout ça » vers le sujet produit récent.

**Fix** : règle ajoutée dans `NORMAL_REPLY_POLICY` (`companion.ts`) — priorité au dernier message ; si le tour courant bascule vers une charge émotionnelle alors que les tours précédents portaient sur une fonctionnalité/plan/outil, accueillir l'émotion d'abord, sans la réinterpréter en question produit ni prolonger le sujet précédent. Verrouillé par `companion_prompt_contract_test.ts`.

**Re-validation (4 échantillons, même trajectoire B1 feature_opportunity actif → B2 détresse)** :
- 1× `coaching_recommendation` (potion Apaisement, émotion accueillie).
- 3× `normal_reply` — dont un pivot explicite : « le vrai sujet c'est surtout que tu te sens plombé en ce moment. On laisse le reste de côté pour l'instant. » ; les autres adoucis et centrés soulagement (💛), **sans pitch du rappel**.

Résultat : la dérive « momentum produit » a disparu sur les 4 tirages ; l'émotion est prise en compte. Verdict T13 relevé de **yellow → green** (avec la variance attendue d'une vraie IA sur le wording).
