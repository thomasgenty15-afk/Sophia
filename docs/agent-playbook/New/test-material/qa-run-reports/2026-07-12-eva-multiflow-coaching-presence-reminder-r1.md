# QA Run — Eva multiflow (coaching / presence / normal + one-shot reminder) — r1

## 1. Contexte Du Test

- Date: 2026-07-12
- Run: `eva-multiflow-cpr-2026-07-12-r1`
- Persona: Eva (`bfa52a7a-8aaf-432a-b702-7d739df0f478`, `eva@gmail.com`), plan actif « Casser l'automatisme du scroll du soir »
- Connexion: `tests/real-personas/eva/connection.json` (locale, `is_test_persona`), scope `web`
- Objectif: run conversationnel de 15 tours traversant **coaching recommendation**, **presence**, **normal reply**, avec un **rappel ponctuel (one-shot reminder)** demandé explicitement.
- Trajectoire testée: ouverture normale → présence émotionnelle → recommandation coaching (technique adaptée) → rappel ponctuel → question produit → doute/coaching → **pivot émotionnel mid-coaching** → présence → sortie douce → reconfirmation rappel.
- Surfaces visées: dispatcher / `response_owner`, active-flow arbitration (coaching ↔ presence), tool-skill `create_one_shot_reminder`, `track_progress_plan_item` (garde), product_help, effets durables `scheduled_checkins`.
- Cadre IA réel: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, auth password réelle (JWT jamais affiché), pas de fallback déterministe. Pilotage tour par tour (chaque message user choisi après lecture de la réponse + trace courte).
- Validité QA: **valide**. 15 tours IA réels, transcript exact capté depuis `chat_messages`, trace lue **en direct à chaque tour** (`conversation_turn_traces`). Voir §Incident environnement pour la suppression post-hoc de certaines lignes DB.

### Incident environnement (à noter, non-bug produit)

Pendant le run, plusieurs runs QA concurrents tournaient sur le **même Supabase local** (users `02dc9ae2`, `d265435c`, `aac76fd6`, `e5630c78` — ex. `e5630c78` a loggé 8 tours en 3 min), plus les crons minute (`process-checkins`, retries). Conséquence: `scheduled_checkins` très volatil et **suppression post-hoc de lignes Eva-scoped** (le rappel du T6 `2e7e8755…` et les traces T1/T2/T3/T12), alors que les 30 `chat_messages` sont restés intacts. La vérification s'appuie donc sur les **lectures live par tour** (fiables, isolées par user), pas sur un état DB final reconstruit. Le tool rappel est prouvé fonctionnel par le T15 (ligne persistée, payload correct). Aucun `trigger-memorizer-daily` déclenché par le run.

## 2. Tours De Conversation

> Trace courte par tour: `owner` / `route_reason` / `tool_skill` / `n_direct` / `safety`. Toutes lues en direct au moment du tour.

### Tour 1
**Verdict du tour:** green

**User**
> Coucou Sophia. Bon… hier soir encore j'ai fini par scroller genre deux heures sur mon lit, je m'en suis rendu compte à minuit passé 😅

**Sophia**
> Ça t'a encore happé au lit, et surtout tu t'en es rendu compte très tard, à minuit passé. Le truc marquant, c'est moins le scroll lui-même que le moment où ça t'aspire sans bruit. Si tu veux, je peux t'aider à repérer le point de bascule précis de ta soirée.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `direct_effects_then_normal_reply`
- tool_skill: `track_progress_plan_item` → **needs_clarify / blocked (`target_not_evidenced`)**
- direct_effects: 0 → aucun effet durable
- safety: none

Note: la mention « hier soir j'ai scrollé » a été interprétée comme un report potentiel d'action de plan (« Poser le téléphone en rentrant », valeur missed) mais **correctement bloquée** faute de preuve explicite. Garde déterministe légitime, pas de faux side-effect.

### Tour 2
**Verdict du tour:** green

**User**
> Mmh honnêtement là j'ai pas trop envie qu'on décortique un truc… c'est juste que le soir je me sens un peu seule tu vois, l'appart est vide et le téléphone c'est un peu ma compagnie. Ça me fout un léger cafard en fait.

**Sophia**
> Ah, là on n'est plus juste sur "j'ai trop scrollé" : il y a le soir, l'appart vide, et ce téléphone qui te tient un peu compagnie quand le cafard monte. […] Le cafard, il ressemble à quoi chez toi le soir : plutôt de l'ennui, un manque de présence, ou une espèce de petite tristesse diffuse ?

**Trace courte**
- response_owner: `presence_conversation`
- route_reason: `presence_conversation_entry`
- direct_effects: 0 / safety none

Entrée présence propre sur le pivot émotionnel + refus doux de décortiquer.

### Tour 3
**Verdict du tour:** green

**User**
> Une petite tristesse diffuse je crois. Genre la journée ça va, je suis prise, mais quand je rentre et que le silence tombe, y a un moment où je me dis 'et voilà, encore une soirée toute seule'. Et hop, le téléphone.

**Sophia**
> Ce que tu décris est très net: la journée te porte, puis tu rentres, le silence tombe, et d'un coup il y a ce "encore une soirée toute seule". Le téléphone arrive presque comme un pansement plus que comme une vraie envie. […]

**Trace courte**
- response_owner: `presence_conversation` / `active_presence_conversation`
- direct_effects: 0 / safety none

Présence collante et juste, aucune poussée d'action.

### Tour 4
**Verdict du tour:** green

**User**
> Ça me fait du bien d'en parler, merci. Bon du coup… j'aimerais bien pas juste subir ce moment-là. Tu m'aiderais à trouver un truc concret pour l'instant précis où je passe la porte et où je choppe mon téléphone par réflexe ?

**Sophia**
> Je partirais sur une carte d'attaque, technique ancre visuelle : comme le réflexe part dès que tu rentres, un repère visible peut couper l'automatisme… Depuis Dashboard > Plan, ouvre l'action « Poser le téléphone en rentrant » puis prépare cette carte d'attaque autour de ce repère.

**Trace courte**
- response_owner: `coaching_recommendation` / `coaching_recommendation_signal`
- direct_effects: 0 (recommandation advisory, pas de carte créée in-turn) / safety none

Handoff présence → coaching propre sur demande d'action concrète.

### Tour 5
**Verdict du tour:** green

**User**
> Ouais mais tu vois le truc c'est que c'est hyper rapide, j'ai même pas le temps de réfléchir, ma main part toute seule vers le tel. Un repère visuel je le verrais même pas je crois. Y aurait pas plutôt un genre de mot ou de réflexe à me donner pour ce moment précis où ça craque ?

**Sophia**
> Je partirais sur une carte d'attaque, technique mot de bascule : comme ton geste part tout seul au moment où tu craques, un seul mot peut servir de frein ultra-court… prépare cette carte autour d'un mot comme « Stop » ou « Retour ».

**Trace courte**
- response_owner: `coaching_recommendation` / `active_coaching_recommendation`
- direct_effects: 0 / safety none

**Point fort:** technique **adaptée** après clarification (ancre visuelle → **mot de bascule**). Conforme à la doctrine operation-suggestion (« Mot de bascule convient surtout quand le user risque de craquer… fenêtre de rupture »). La technique matche la nature de l'action.

### Tour 6
**Verdict du tour:** green

**User**
> Ah ouais 'Stop' j'aime bien, ça je peux le faire. Tiens tant qu'on y est, tu pourrais me rappeler ce soir vers 21h de poser mon téléphone en rentrant ? Histoire que j'y pense au bon moment.

**Sophia**
> C'est programmé pour ce soir vers 21h : je te ferai un rappel pour poser ton téléphone en rentrant. Et oui, pour ce réflexe-là, tu as bien identifié le bon moment à protéger.

**Trace courte**
- response_owner: `coaching_recommendation` / `active_coaching_recommendation_with_local_direct_effects`
- tool_skill: `create_one_shot_reminder` → **success**
- direct_effects: 1 — committed effect `id=2e7e8755…`, `scheduled_for=2026-07-12T19:00:00Z` (= **21:00 Europe/Paris**, correct), instruction « poser mon téléphone en rentrant »
- safety none

Rappel ponctuel explicite → création directe + confirmation sobre en une ligne (comportement attendu pour un rappel bénin explicitement demandé). Payload durable correct (heure locale exacte). Ligne DB ensuite disparue post-hoc (incident environnement, cf. §1) — l'effet est prouvé re-persisté au T15.

### Tour 7
**Verdict du tour:** green

**User**
> Super merci. Au fait le rappel il va m'arriver comment, c'est une notif sur l'appli web ou plutôt un truc genre message ? Je veux juste être sûre de pas le rater.

**Sophia**
> Oui, ça te viendra comme une notification dans l'appli. Si tu as l'app web ouverte, tu la verras aussi là, comme un rappel.

**Trace courte**
- response_owner: `product_help` / `product_help_signal`
- direct_effects: 0 / safety none

Question produit factuelle → owner produit correct. Réponse plausible pour un persona web (léger flou sur le canal exact, non bloquant).

### Tour 8
**Verdict du tour:** green

**User**
> Tu crois vraiment qu'un simple mot 'Stop' ça peut suffire ? J'ai un peu peur que dès demain soir je recommence comme si de rien n'était.

**Sophia**
> Tu pointes bien le vrai sujet : ce n'est pas de trouver un mot "parfait", c'est d'éviter que le réflexe reprenne la main demain. Dans ton cas, la potion d'anti-décrochage colle le mieux… Tu peux garder « Stop », et le rendre mécanique : « Stop » → téléphone posé ailleurs → mains occupées 10 secondes.

**Trace courte**
- response_owner: `coaching_recommendation` / `coaching_recommendation_signal`
- direct_effects: 0 / safety none

Doute sur l'efficacité → reframe coaching correct + rituel concret. (1ère mention « anti-décrochage ».)

### Tour 9
**Verdict du tour:** yellow

**Famille de bugs:** `BF-ROUTE-02` — Ancien flow capture une nouvelle intention (persistance coaching)

**User**
> Ok ça me parle, 'Stop' puis mains occupées 10 secondes. Je vais tenter ça ce soir en rentrant. Franchement rien que d'en avoir parlé je me sens un peu moins nulle avec cette histoire de téléphone.

**Sophia**
> Je trouve que tu as déjà fait un vrai pas… Le risque ici, ce n'est pas de "mal faire"… Dans cet état-là, la potion qui colle le mieux est anti-décrochage. Si tu veux, le prochain pas peut être juste de garder « Stop » et d'ajouter un geste de secours ultra court…

**Trace courte**
- response_owner: `coaching_recommendation` / `active_coaching_recommendation`
- direct_effects: 0 / safety none

**Analyse**
- Symptôme: la note émotionnelle (« je me sens un peu moins nulle ») est sous-reçue; Sophia **re-recommande la même potion « anti-décrochage » (2ᵉ fois)** et pousse « le prochain pas » au lieu de laisser la détente atterrir.
- Source amont probable: active-flow arbitration `continue_active` sur coaching qui privilégie la relance coaching plutôt que d'accueillir le signal affectif.
- Owner runtime: dispatcher / active-flow arbitration (coaching persistence).
- Meilleure correction: pondérer le signal émotionnel dans l'arbitrage pour au moins **désamorcer la relance** (recevoir sans re-proposer) quand le tour user est majoritairement affectif; éviter la répétition de la même carte.
- Pas un patch local: pas une regex anti-répétition; c'est la politique d'arbitrage qui doit lire l'altitude affective du tour.

### Tour 10
**Verdict du tour:** yellow

**Famille de bugs:** `BF-ROUTE-02` (flow coaching capture le pivot émotionnel) + `BF-INTAKE-03` (contrainte « pas de technique » perdue au tour suivant)

**User**
> Mmh en vrai là tout de suite j'ai pas envie de parler technique. C'est surtout que ce soir j'appréhende de rentrer dans l'appart vide, tu vois. C'est ça le plus dur, pas vraiment le téléphone.

**Sophia**
> Je te suis : ce n'est pas le téléphone le plus dur, c'est l'idée de rentrer dans un appart vide ce soir. Ça peut peser fort… Qu'est-ce qui est le plus dur là-dedans pour toi : le silence, la solitude, ou le moment où tu passes la porte ?

**Trace courte**
- response_owner: `coaching_recommendation` / **`active_coaching_recommendation`**
- direct_effects: 0 / safety none

**Analyse**
- Symptôme: **contenu** de la réponse correct (émotionnel, sans technique) mais **owner reste `coaching_recommendation`** alors que la user pivote clairement vers un besoin de fond + « pas envie de parler technique ». Le flow ne bascule pas en `presence_conversation`.
- Source amont probable: `active_flow_arbitration` ne relâche pas coaching sur un pivot émotionnel implicite; la présence (« poubelle du coaching actif » pour les discussions de fond) devrait préempter.
- Owner runtime: active-flow arbitration / presence handoff policy.
- Meilleure correction: règle de handoff coaching → presence sur signal émotionnel fort + contrainte anti-technique, avant que le tour suivant ne re-pousse une technique (cf. T11).
- Pas un patch local: le contenu ne suffit pas — l'owner/flow doit changer pour ne pas re-basculer en poussée coaching au tour d'après.

### Tour 11
**Verdict du tour:** yellow

**Famille de bugs:** `BF-ROUTE-02` (coaching persiste sur tour de fond) + `BF-INTAKE-03` (« pas de technique » du T10 non tenu)

**User**
> Le silence surtout je crois. Quand je ferme la porte et qu'il y a personne à qui raconter ma journée. C'est bête hein, à 29 ans je devrais gérer ça mieux.

**Sophia**
> Je te suis : ce n'est pas "bête"… Et franchement, à 29 ans ou à n'importe quel âge, ça peut remuer fort. L'appui qui colle ici, c'est l'anti-décrochage : tu sais déjà quoi protéger, mais au moment où tu rentres, le vide peut te faire lâcher le fil. On peut le garder très simple pour ce soir : juste après avoir fermé la porte, tu fais ton geste de retour prévu, sans te laisser négocier.

**Trace courte**
- response_owner: `coaching_recommendation` / `active_coaching_recommendation`
- direct_effects: 0 / safety none

**Analyse**
- Symptôme: sur une **divulgation vulnérable** (solitude + auto-jugement « à 29 ans je devrais gérer ça mieux »), Sophia valide brièvement puis **re-pousse la potion « anti-décrochage » (3ᵉ occurrence) + un « geste de retour » technique**, juste après un « pas envie de parler technique ». Tonalité inadaptée au moment, besoin humain non rencontré.
- Source amont probable: idem T10 — coaching non relâché; la contrainte anti-technique du T10 n'est pas propagée.
- Owner runtime: active-flow arbitration / presence handoff.
- Meilleure correction: même que T10 (handoff coaching→presence). Invariant: après un tour émotionnel + « pas de technique », les tours suivants ne re-proposent pas de carte/geste tant que la user n'a pas rouvert l'action.
- Pas un patch local: c'est la politique de persistance de flow, pas une phrase à corriger.

### Tour 12
**Verdict du tour:** green (récupération — mais déclenchée seulement par un refus explicite type-test)

**User**
> Sophia là franchement j'ai pas besoin d'une technique ou d'un geste. J'ai juste besoin qu'on m'écoute deux minutes sans me proposer une solution, tu peux faire ça ?

**Sophia**
> D'accord. Tu me dis clairement deux choses: pas de technique, pas de solution, juste être avec toi un moment. Alors je reste là. Ce soir, il y a cet appart vide, le silence quand la porte se ferme, et ce poids de n'avoir personne à qui raconter ta journée. Et non, ce n'est pas "bête". […] Je t'écoute.

**Trace courte**
- response_owner: `presence_conversation` / `presence_conversation_entry`
- direct_effects: 0 / safety none

Bascule en présence **enfin** correcte, réponse excellente. **Réserve UX:** il a fallu un refus **explicite** (« pas besoin de technique, juste qu'on m'écoute ») pour l'obtenir — la user a dû « parler comme un test » (anti-pattern). C'est la preuve à charge des T10/T11.

### Tour 13
**Verdict du tour:** green

**User**
> Voilà… c'est exactement ça. Des fois je me demande si les autres vivent ça aussi ou si c'est juste moi qui dramatise une soirée tranquille toute seule.

**Sophia**
> Franchement, non, ce n'est pas juste toi. […] Le piège, c'est qu'on se juge en plus de le vivre… Alors qu'en vrai, tu réagis juste à un manque de présence, de partage, de chaleur humaine. Ce n'est ni faible ni théâtral. C'est humain. […] 💛

**Trace courte**
- response_owner: `presence_conversation` / `active_presence_conversation`
- direct_effects: 0 / safety none

Présence normalisante et chaleureuse, sans poussée. Green.

### Tour 14
**Verdict du tour:** green

**User**
> Merci Sophia. Ça fait du bien de le dire à voix haute, même à toi. Je crois que ça va aller pour ce soir, je me sens déjà un peu plus légère.

**Sophia**
> Ça me fait plaisir de l'entendre. Le fait de l'avoir posé ici, même juste à voix haute, a déjà allégé un peu le poids. Bonne soirée à toi 💛

**Trace courte**
- response_owner: `normal_reply` / `normal_reply_default`
- direct_effects: 0 / safety none

Sortie de présence **naturelle** vers normal_reply sur clôture douce. Green.

### Tour 15
**Verdict du tour:** green

**User**
> Ah et le petit rappel de 21h pour poser le téléphone en rentrant, il tient toujours hein ? Comme ça je suis parée pour ce soir. Bonne soirée à toi aussi 🙂

**Sophia**
> Oui, il est toujours là pour 21h : poser le téléphone en rentrant. Bonne soirée à toi aussi 🙂

**Trace courte**
- response_owner: `normal_reply` / `direct_effects_then_normal_reply`
- tool_skill: `create_one_shot_reminder` → **success**
- direct_effects: 1 — committed `id=bba0be0c…`, `scheduled_for=2026-07-12T19:00:00Z` (21:00 Paris), instruction « poser le téléphone en rentrant »
- durable_effect: **ligne `scheduled_checkins` persistée et vérifiée** (`pending`, event_context `one_shot_reminder:poser_le_telephone_en_rentrant`).
- safety none

Reconfirmation → rappel re-persisté correctement (effet durable prouvé ici). **Note système (watch-point):** une nouvelle ligne a été créée (slug d'instruction légèrement différent du T6 `poser_mon…` vs `poser_le…`), sans dedup vis-à-vis du T6. Si le T6 avait survécu, on aurait eu **deux rappels** pour la même intention 21:00. Non bloquant ce run (une seule ligne au final), mais gap de dédup à surveiller.

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Entrées/sorties de présence naturelles (T2, T13→T14), ton chaleureux et non jugeant, très aligné persona Eva.
- Adaptation de technique au besoin réel (T4→T5 : ancre visuelle → mot de bascule) — excellent.
- Rappel ponctuel géré sobrement, sans confirmation lourde (T6/T15).
- Récupération présence de qualité une fois le besoin explicité (T12).

**Problèmes**
- Tours 9–11: coaching **collant** et **répétitif** — la potion « anti-décrochage » est re-proposée 3 fois; sur un tour vulnérable (T11) la technique est repoussée alors que la user vient de dire « pas envie de parler technique ». Le besoin humain (solitude du soir) n'est pas rencontré au moment où il émerge. Famille: `BF-ROUTE-02` / `BF-INTAKE-03`. Impact: la user doit **s'énerver / parler comme un test** (T12) pour être entendue. Sévérité: yellow.

**Fix proposé**
- Source amont: active-flow arbitration coaching→presence.
- Correction recommandée: handoff vers présence sur signal émotionnel fort + contrainte anti-technique, et non-répétition d'une même carte tant que la user ne rouvre pas l'action.
- Tests d'invariant attendus: un tour émotionnel explicite (« pas envie de parler technique ») pendant un coaching actif → `response_owner=presence_conversation` au tour même, et aucune re-proposition de carte au(x) tour(s) suivant(s) sans réouverture.

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- Dispatcher/owners globalement corrects: `normal_reply` (T1,14,15), `presence_conversation` (T2,3,12,13), `coaching_recommendation` (T4,5,6,8,9,10,11), `product_help` (T7). Toutes les 4 familles ciblées atteintes.
- Défaut: `active_coaching_recommendation` **ne relâche pas** sur pivot émotionnel (T10, T11) — presence handoff manquant jusqu'au refus explicite (T12). `BF-ROUTE-02`.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: succès (T6, T15), payload durable correct (21:00 Europe/Paris, instruction propre), confirmation en une ligne — conforme (rappel bénin explicitement demandé). Effet durable vérifié persistant au T15.
- `track_progress_plan_item` (T1): correctement **bloqué** (`target_not_evidenced`) — pas de faux side-effect sur un simple récit.
- Recommandation coaching: technique adaptée à la nature de l'action (T5), advisory (aucune carte créée in-turn — cohérent).
- Watch-point dédup rappel (T15): slug d'event_context dépend du wording d'instruction → risque de doublon de rappels pour une même intention/heure si le premier survit.

**Memory / Effets durables**
- Aucune intention mémoire explicite dans le run → pas de vérification `memory_items` (conforme au protocole memorizer nocturne).
- Effets durables du run: 1 rappel ponctuel (nettoyé en fin de run). Aucun `user_plan_item_entries` créé (vérifié = 0). Plan intact.

**Problèmes**
- Tours 9–11: `BF-ROUTE-02` (+`BF-INTAKE-03` T10/T11). Impact système: mauvais owner maintenu sur besoin émotionnel, poussée coaching non désirée. Sévérité: yellow (pas de safety, pas d'effet durable faux).

**Fix proposé**
- Source amont: `active_flow_arbitration` (coaching persistence) + propagation des contraintes intake anti-technique.
- Correction recommandée: gate de handoff coaching→presence sur altitude affective + « pas de technique »; suppression de la relance de carte tant que non réouverte.
- Tests d'invariant attendus: cf. §3; + test dédup rappel (même intention/heure ne crée pas 2 `scheduled_checkins`).

## Verdict Global

- Verdict: **yellow**
- Raison principale: le flow **coaching_recommendation est trop collant** — il capte les tours émotionnels de fond (T10/T11) et répète la même carte (T9), obligeant la user à un refus explicite (T12) pour obtenir la présence. Routage owners par ailleurs correct, rappel ponctuel correct, aucune safety en jeu, aucun effet durable faux.
- Follow-up prioritaire: implémenter le handoff coaching→presence sur pivot émotionnel + contrainte anti-technique (`BF-ROUTE-02`), et surveiller la dédup des rappels (T15).

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-12-eva-multiflow-coaching-presence-reminder-r1-bugs.md`
