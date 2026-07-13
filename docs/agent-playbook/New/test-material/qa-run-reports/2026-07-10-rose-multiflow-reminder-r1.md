# QA Run Report - rose-multiflow-reminder-r1

## 1. Contexte Du Test

- Date: 2026-07-10
- Run: `rose-multiflow-reminder-r1` (scenario global 15.1)
- Persona: rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`, `rose@gmail.com`), scope `global`, connexion locale par défaut
- Objectif: run conversationnel de 15 tours traversant **normal_reply**, **presence_conversation** et **coaching_recommendation**, avec pose d'un **rappel ponctuel (one-shot reminder)** à un moment du run.
- Trajectoire: coucou léger → confidence sur le vide du soir → recadrage « je veux juste parler » (présence) → creux émotionnel profond → pull vers l'action (coaching, carte de défense) → demande explicite de rappel 18h30 → rappel du plan actif → doute/stress sur la mission → réassurance → clôture.
- Surfaces visées: dispatcher / route_decision (`normal_reply`, `presence_conversation`, `coaching_recommendation`), flow présence (collant / anti-poussée / sortie), skill coaching_recommendation (entrée / exit / local direct effect), always-on tool `create_one_shot_reminder` (payload, effet durable `scheduled_checkins`), grounding plan actif.
- Cadre IA reel: chemin IA réel local via `POST /functions/v1/test-send-message` avec `force_full_ai=true`, Supabase local, JWT user Rose (via `scripts/get-jwt.sh rose`), aucun fallback déterministe, pilotage tour par tour (chaque message user choisi après lecture de la réponse + trace courte).
- Validite QA: **valide** — 15/15 tours HTTP 200, `ok:true`, 0 tour vide, 0 abort, 0 fallback, effets durables vérifiés en DB, owners confirmés dans `conversation_turn_traces`.

**Contexte plan (grounding DB pré-run)** — transformation active « Libération progressive du cannabis » (`user_plans_v2` `ce4e504c…`, thème `cannabis`), 4 items actifs : (1) noter chaque envie, (2) sas de transition 10 min en rentrant, (3) une journée 100% sans cannabis, (4) ranger le matériel hors de vue. Baseline propre : 0 chat_message, 0 `user_chat_states`, 0 `scheduled_checkins`.

## 2. Tours De Conversation

### Tour 1
**Verdict du tour:** green

**User**
> Coucou Sophia, ça va ? Moi journée un peu longue au taf mais rien de fou. Je voulais juste passer te faire un petit coucou.

**Sophia**
> Coucou 🙂 Ça va, merci. Et toi, journée un peu longue au taf mais sans gros drame, je vois. C'est le genre de soirée où on souffle un peu en rentrant.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`
- direct_effects: [] · pending_confirmation: aucune · durable_effect: aucun

Ouverture légère correctement traitée en conversation. Relance naturelle sur « en rentrant » qui ouvre le fil du soir.

---

### Tour 2
**Verdict du tour:** yellow

**Famille de bugs:** BF-ROUTE-01 — Mauvais owner sélectionné (borderline, auto-corrigé)

**User**
> Ouais... en fait c'est exactement ça le truc. Le moment où je rentre et que je pose mes affaires, y'a comme un vide. Et c'est là que le joint arrive tout seul, sans que je réfléchisse. C'est bizarre d'en parler comme ça.

**Sophia**
> Je partirais sur une carte de défense libre : le point à protéger, c'est ce moment où tu rentres, tu poses tes affaires, et le vide ouvre la porte au joint sans réfléchir. Elle sert à repérer le moment critique, voir le piège qui t'embarque, garder un geste de retour en moins de 30 secondes et prévoir un plan B simple. Pour la préparer, va dans Ressources, puis choisis ou crée ce type de carte.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `coaching_recommendation_signal`
- skill_selected: `coaching_recommendation` · skill_status: `continue` · direct_effects: [] · durable_effect: aucun

**Analyse**
- Symptome: Rose dépose une confidence vulnérable (« c'est bizarre d'en parler comme ça » = signal d'écoute), et Sophia bascule directement sur une carte de défense au lieu d'accueillir. La carte proposée est *pertinente* (elle vise exactement le moment de rupture, conforme aux guidelines défense) mais l'altitude est prématurée.
- Source amont probable: pondération du dispatcher global qui privilégie le contenu « moment concret d'échec » (`joint arrive tout seul`) sur la cue de vulnérabilité, et entre en `coaching_recommendation` plutôt qu'en `presence_conversation`.
- Owner runtime: dispatcher global (doctrine `confidence_band` présence vs signal coaching, `dispatcher.prompts.ts`).
- Meilleure correction: même axe que le chantier `rose-nav-frontieres` (2026-07-10) — anti-faux-positif sur l'entrée coaching quand la cue dominante est un dépôt discursif/vulnérable sans demande d'aide. Ici la self-correction a fonctionné dès T3 (sortie propre vers présence), donc résiduel léger, pas un patch de phrase.
- Pourquoi pas un patch local: c'est un arbitrage d'owner au dispatcher, pas un mot à filtrer.

---

### Tour 3
**Verdict du tour:** green

**User**
> Attends, là tout de suite j'ai pas envie qu'on me sorte une technique ou une carte. J'avais juste besoin d'en parler un peu, de poser ça. C'est pas toujours un problème à régler, des fois j'ai juste envie d'être entendue tu vois.

**Sophia**
> Tu as raison. Là, tu n'étais pas en train de demander une solution, tu posais juste quelque chose de très précis: ce moment du retour, le vide, et le fait que le joint arrive presque tout seul. J'ai été trop vite vers un truc à faire, alors que ce que tu demandais surtout, c'était de pouvoir le dire sans qu'on transforme ça immédiatement en problème à corriger. [...] Donc je reste là-dessus avec toi. Pas en mode technique. [...] parfois on a juste besoin que ce soit entendu. 🙂

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason_code: `presence_conversation_entry`
- skill_selected: `coaching_recommendation` · skill_status: `exit` · skill_exit_target: `global` · direct_effects: []

Sortie coaching **propre** sur refus explicite d'outil + entrée présence le même tour. Sophia reconnaît explicitement sa vitesse et se recale sur l'écoute. C'est exactement le comportement cible du fix `nav-frontieres-r2` (BF-ROUTE-02 clean discursive exit) — validé ici.

---

### Tour 4
**Verdict du tour:** green

**User**
> Merci... ça fait du bien que tu le prennes comme ça. En vrai je crois que c'est pas vraiment le joint le sujet. C'est plus que quand je rentre, la journée se vide d'un coup et je me retrouve seule avec rien pour faire le pont entre le boulot et chez moi. Le joint c'est juste le truc qui bouche le trou.

**Sophia**
> Je vois mieux, oui. Ce que tu décris, ce n'est pas juste "une envie de fumer" : c'est ce moment de chute entre deux mondes [...] Le joint vient surtout remplir cette transition, presque comme un faux pont. [...] Quand tu rentres, le plus dur, c'est quoi exactement : le silence, la fatigue, ou le fait de ne plus être attendue par rien ? 💛

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason_code: `active_presence_conversation`
- direct_effects: [] · durable_effect: aucun

Présence collante (flow maintenu), miroir juste, relance par une vraie question ouverte. Comportement présence conforme.

---

### Tour 5
**Verdict du tour:** green *(note fluidité mineure : motif de validation répété)*

**User**
> C'est surtout de plus être attendue par rien je crois. Au boulot y'a un rythme, des gens, des trucs à faire. Et d'un coup le soir plus personne, plus rien qui compte sur moi. Le joint au moins il m'attend, lui. Ça sonne un peu triste dit comme ça.

**Sophia**
> Ça sonne triste, oui — mais surtout très lucide. [...] le joint prend presque la place d'un rendez-vous: au moins, lui, il est là. Et franchement, je trouve important que tu le voies comme ça [...] Ce n'est pas ridicule ni "faible". [...] tu ne parles plus seulement d'un geste automatique, tu parles d'être attendue. Et ça, c'est plus profond que le produit.

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason_code: `active_presence_conversation`

Présence juste et chaleureuse. Léger tic de structure : « et franchement je trouve important / c'est assez fin / c'est plus fort que… de le voir comme ça » revient à T3, T4 et T5 (voir §3).

---

### Tour 6
**Verdict du tour:** green *(note : wording de carte quasi identique à T2)*

**User**
> Ouais... bon là du coup j'aimerais bien arrêter de juste subir ce moment. T'aurais un truc concret à me proposer pour ce basculement du soir ? Un geste, un levier, je sais pas. Là je suis preneuse.

**Sophia**
> Oui — là, je partirais sur une carte de défense libre. Le point à protéger, c'est ton sas du soir [...] Cette carte sert justement à repérer le moment critique, voir le piège qui t'embarque, garder un geste de retour en moins de 30 secondes et prévoir un plan B simple. Tu peux l'ouvrir dans Ressources puis choisir ou créer ce type de carte.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `coaching_recommendation_signal`
- skill_selected: `coaching_recommendation` · skill_status: `continue`

Entrée coaching **sur pull explicite** (« je suis preneuse »), cette fois pleinement justifiée. Technique cohérente (carte de défense = moment où ça craque + piège concret, conforme guidelines). Wording de la carte quasi verbatim T2 (répétition, voir §3).

---

### Tour 7
**Verdict du tour:** green

**User**
> Ok mais concrètement le 'geste de retour en moins de 30 secondes' ça ressemble à quoi dans mon cas ? Parce que si c'est juste 'respire un coup' ça va pas suffire là.

**Sophia**
> Oui, dans ton cas, le geste de retour doit te remettre en mouvement, pas juste te calmer. Par exemple, dès que tu passes la porte : tu poses tes clés, tu ouvres la fenêtre ou tu lances de l'eau à boire, puis tu fais une action très simple qui remplit le sas, comme lancer une douche, préparer un thé, ou mettre une chanson de transition pendant 3 minutes. [...] Si tu veux, je peux te proposer un geste ultra précis en une seule phrase, adapté à ton retour chez toi.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation` · skill_status: `continue`

Clarification concrète, ancrée sur sa situation (recoupe l'item 2 du plan : sas de transition). Pas d'exécution de tool. Cohérent.

---

### Tour 8
**Verdict du tour:** green

**User**
> Ok ouais, la douche + une chanson en rentrant ça me parle bien. Du coup tiens, tu peux me rappeler demain à 18h30 de faire ce sas quand je rentre, avant de toucher à quoi que ce soit ?

**Sophia**
> C'est programmé pour demain à 18h30 : je te rappellerai de faire ce sas quand tu rentres, avant de toucher à quoi que ce soit. Et dans ton cas, garde-le très simple : douche puis une chanson, sans négocier avec le reste avant.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation_with_local_direct_effects`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- tool_skill_run: `create_one_shot_reminder` · status: `success`
- committed_effects: id `c8f9644d-564b-4bed-bca2-654ce3fa62e8`, `scheduled_for=2026-07-11T16:30:00+00:00`, instruction `"faire ce sas quand je rentre, avant de toucher à quoi que ce soit"`
- **durable_effect (DB `scheduled_checkins`)**: 1 ligne, `status=pending`, `origin=rendez_vous`, `message_mode=dynamic`, contenu `one_shot_reminder:faire_ce_sas…`

Rappel ponctuel créé **comme local direct effect à l'intérieur du flow coaching** sur demande explicite. Conversion horaire correcte (18h30 Europe/Paris CEST = 16:30 UTC). Payload fidèle (texte + heure). Confirmation claire, pas de claim sans commit. Le flow coaching admet un effet durable bénin explicite sans dérailler — comportement attendu (always-on `one_shot_reminder` via effect gate). Aucun signal safety, donc pas de contrainte d'ordre safety-first ici.

---

### Tour 9
**Verdict du tour:** yellow

**Famille de bugs:** `a classifier` — glitch de composition (couche renderer / final response, cf. §4)

**User**
> Nickel, merci. Ça me rassure d'avoir ce petit rappel, au moins demain en rentrant je pars pas direct dans le vide.

**Sophia**
> Je suis contente que ça te rassure. Le rappel de demain à 18h30 est bien prévu, et il sert **בדיוק** à ça : te remettre dans ton sas avant de partir dans le vide. Garde juste ce duo simple : douche puis une chanson.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation` · skill_status: `complete`
- direct_effects: [] · durable_effect: aucun (pas de doublon de rappel)

**Analyse**
- Symptome: un token en écriture hébraïque (`בדיוק`, « exactement ») est inséré au milieu de la phrase française. Corruption de sortie visible, casse l'immersion.
- Source amont probable: fuite multilingue du composeur LLM (couche final response / renderer). Pas un problème de routage ni d'effet durable.
- Owner runtime: pipeline de composition de la réponse (composer/renderer normal du flow coaching).
- Meilleure correction: pas une regex de nettoyage a posteriori en premier recours. La cible amont est la contrainte de langue de sortie du composeur (verrouiller la langue de réponse = langue user) et/ou un garde-fou de validation de script de sortie. À surveiller sur d'autres runs pour mesurer la fréquence avant d'investir un garde déterministe.
- Pourquoi pas un patch local: filtrer ce caractère précis ne traiterait pas la classe (n'importe quel token étranger peut fuiter). Le fix est côté contrat de langue du composeur.

---

### Tour 10
**Verdict du tour:** green

**User**
> Au fait, rappelle-moi vite fait c'était quoi déjà mes trucs à faire cette semaine sur mon plan ? J'ai un peu perdu le fil avec tout ça.

**Sophia**
> Tu as surtout 4 choses actives en ce moment : - Cartographier les envies - Faire un sas de décompression (sans fumer) - Journée 100% sans cannabis - Ranger le matériel hors de vue. Et pour la semaine, le point concret qu'on a ajouté, c'est ton rappel de demain à 18h30 pour faire le sas en rentrant [...] 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`

Sortie coaching propre vers `normal_reply`. **Grounding plan parfait** : les 4 items cités correspondent exactement aux items actifs en DB, sans invention. Mention correcte du rappel créé. Excellent tour.

---

### Tour 11
**Verdict du tour:** yellow

**Famille de bugs:** BF-ROUTE-01 — Mauvais owner sélectionné (dépôt émotionnel → carte)

**User**
> Ah oui la journée 100% sans... franchement celle-là elle me stresse un peu. Je sais pas trop si je vais y arriver cette semaine.

**Sophia**
> Je te sens surtout dans l'anticipation qui monte, pas dans un problème de plan lui-même. Je partirais sur une carte d'attaque, technique mantra de force : pour t'aider à tenir le cap quand tu te dis déjà que cette journée va être dure. Et tu as déjà un point d'appui concret pour demain à 18h30 avec ton sas en rentrant [...]

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `coaching_recommendation_signal` · skill_status: `continue`

**Analyse**
- Symptome: Rose exprime un stress/doute (« elle me stresse », « je sais pas si je vais y arriver ») — un aveu émotionnel, pas une demande d'outil. Sophia repart directement sur une carte d'attaque (mantra). Même motif qu'à T2 : divulgation émotionnelle → proposition de carte immédiate.
- Nuance: la *technique* est défendable — mantra / mot de bascule convient à une fenêtre de rupture anticipée (guidelines : « quand le user risque de craquer, abandonner »). Le problème est l'*altitude/temps* : accueillir la peur avant de proposer un levier.
- Source amont probable: dispatcher global — pondère le contenu « mission difficile » vers coaching au lieu d'entendre d'abord l'affect. Résiduel du même axe que T2.
- Owner runtime: dispatcher global (doctrine entrée coaching vs présence sur signal émotionnel).
- Meilleure correction: renforcer l'anti-faux-positif d'entrée coaching sur aveu émotionnel sans demande d'aide (aligné chantier nav-frontieres). Pas un patch de phrase.

---

### Tour 12
**Verdict du tour:** yellow

**Famille de bugs:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention (coaching reste actif sur un besoin de réassurance)

**User**
> Mouais, un mantra je sais pas si ça suffira contre ce stress. En vrai là j'ai juste besoin d'entendre que c'est pas grave si j'y arrive pas parfaitement du premier coup cette semaine.

**Sophia**
> C'est pas grave de ne pas être parfait du premier coup. Tu n'as pas besoin de réussir toute la semaine d'un coup : tu as juste besoin de faire le prochain pas, même imparfait. Le plus important là, c'est de ne pas te juger avant d'avoir essayé.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation` · skill_status: `continue`

**Analyse**
- Symptome: Rose pivote explicitement vers un besoin de réassurance émotionnelle (« j'ai juste besoin d'entendre que… »). Le *contenu* de Sophia est juste et rassurant (elle arrête d'ailleurs de pousser la carte), mais l'**owner reste `coaching_recommendation`** au lieu de sortir vers présence/normal.
- Nuance vs T3: à T3 le refus était frontal (« j'ai pas envie qu'on me sorte une technique ») et la sortie a marché. Ici le pivot est plus doux (pas de refus d'outil explicite, juste un besoin d'écoute) et le flow coaching **ne sort pas**. C'est le résiduel du fix nav-frontieres sur un pivot émotionnel *non frontal*.
- Source amont probable: critère d'`exit_to_global_dispatcher` du dispatcher LOCAL coaching (calibré sur le refus/dépôt discursif franc, pas sur la demande douce de réassurance).
- Owner runtime: dispatcher local coaching + garde de sortie (`local_flow.ts`, cf. bug sheet nav-frontieres NAV-B01).
- Meilleure correction: élargir le critère de sortie discursive du dispatcher local coaching au pivot « besoin de réassurance / juste être entendue » (pas seulement au refus d'outil frontal). Pas de patch de phrase.

---

### Tour 13
**Verdict du tour:** yellow

**Famille de bugs:** BF-ROUTE-02 — flow coaching s'éternise + répétition (couche compose)

**User**
> Ok. Ouais t'as raison, un pas à la fois. Ça me va comme ça, je me sens un peu plus légère là.

**Sophia**
> C'est bien ça : tu n'as pas besoin d'être parfait du premier coup. Tu peux avancer avec un repère tout simple pour te lancer sans te juger.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation` · skill_status: `complete`

**Analyse**
- Symptome: Rose signale qu'elle est apaisée et prête à clore (« ça me va comme ça, je me sens plus légère »). Sophia répète quasi mot pour mot la formule de T12 (« tu n'as pas besoin d'être parfait du premier coup ») et reste en coaching au lieu d'accueillir la clôture. Redondance perçue + flow qui traîne.
- Source amont probable: idem T12 (coaching local ne détecte pas le tour de clôture émotionnelle comme motif de sortie) + tic de répétition du composeur.
- Owner runtime: dispatcher local coaching (sortie) + composeur (anti-répétition).
- Meilleure correction: même axe que T12 (critère de sortie sur clôture/apaisement) — la sortie serait survenue naturellement (comme à T14 dès que Rose change de registre), donc résiduel de calibration de sortie, pas un patch.

---

### Tour 14
**Verdict du tour:** green

**User**
> Allez je vais aller me faire à manger là. Merci de m'avoir écoutée ce soir, ça m'a fait du bien de poser tout ça.

**Sophia**
> Avec plaisir 💛 Prends soin de toi en mangeant, et repose un peu le mental aussi ce soir.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`

Sortie coaching propre dès que Rose change de registre. Clôture chaleureuse et brève.

---

### Tour 15
**Verdict du tour:** green

**User**
> Oui je vais essayer. Bonne soirée Sophia, à demain pour le fameux sas de 18h30 !

**Sophia**
> Bonne soirée à toi aussi 🙂 À demain pour le sas de 18h30.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`

Clôture correcte, référence exacte au rappel posé. Fin de run propre.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- La profondeur présence (T3–T5) est réellement bonne : Sophia accueille, reformule finement (« faux pont », « être attendue »), relance par de vraies questions ouvertes, sans pousser d'action.
- La récupération sur refus frontal (T2→T3) est exemplaire : Sophia admet sa vitesse et se recale — pas de mécanique, ça sonne humain.
- Le grounding plan (T10) et les confirmations de rappel (T8) sont clairs et exacts.
- Handoffs soutien émotionnel ↔ action ↔ produit globalement lisibles ; le rappel est posé sans friction.

**Problemes**
- Tour 9: token hébreu `בדיוק` injecté dans une phrase française. Famille: `a classifier` (compose). Impact: casse d'immersion, la réponse « a l'air buggée ». Severite: yellow.
- Tours 2 & 11: aveu émotionnel accueilli par une proposition de carte immédiate (poussée un peu rapide). Famille: BF-ROUTE-01. Impact: le user doit recadrer pour être juste entendu. Severite: yellow.
- Tours 12 & 13: Sophia répète la formule « pas besoin d'être parfait du premier coup » et le flow coaching s'éternise sur un besoin de réassurance/clôture. Famille: BF-ROUTE-02. Impact: sensation de radotage + registre légèrement à côté. Severite: yellow.
- Tours 3/4/5: tic de structure « et franchement, c'est important / assez fin / plus fort de le voir comme ça ». Impact: léger effet de gabarit sur 3 tours consécutifs. Severite: green (mineur).

**Fix propose**
- Source amont: (1) contrat de langue du composeur (T9) ; (2) doctrine d'entrée coaching vs présence sur signal émotionnel + critère de sortie du dispatcher local coaching sur pivot doux (réassurance/clôture) — même axe que le chantier `rose-nav-frontieres` du 2026-07-10.
- Correction recommandee: élargir les critères d'exit discursive du dispatcher local coaching au-delà du refus d'outil frontal (inclure « besoin d'être entendue / réassurance / apaisement de clôture ») ; verrouiller la langue de sortie côté composeur.
- Tests d'invariant attendus: aveu émotionnel sans demande d'aide → présence (pas coaching) ; pivot réassurance en coaching actif → exit vers présence/normal ; sortie de composeur mono-langue (anti-token étranger) ; anti-répétition inter-tours.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Owners observés (confirmés dans `conversation_turn_traces`): T1 `normal_reply`, T2 `coaching_recommendation`, T3–T5 `presence_conversation`, T6–T9 `coaching_recommendation`, T10 `normal_reply`, T11–T13 `coaching_recommendation`, T14–T15 `normal_reply`. Les **3 flows visés sont couverts**, plus le direct effect rappel.
- Points forts: entrée présence sur refus explicite (T3) + sortie coaching `status=exit` vers `global` ; sortie coaching→normal propre (T10, T14) ; grounding plan exact (T10).
- Résiduels: BF-ROUTE-01 (entrée coaching un peu gloutonne sur aveu émotionnel — T2, T11) et BF-ROUTE-02 (coaching local ne sort pas sur pivot émotionnel doux — T12, T13). Ces axes recoupent directement le chantier `rose-nav-frontieres-r1/r2` (2026-07-10, même branche `clean-v2-redesign`) : le fix y traite le **refus frontal / dépôt discursif profond** (validé ici à T3), mais le **pivot émotionnel non frontal** (T11→T13) survit partiellement.

**Skills / Operations / Tools**
- `coaching_recommendation` : entrées/sorties globalement saines, recommande des cartes cohérentes avec la nature de l'action (défense sur moment de rupture T2/T6 ; mot de bascule sur fenêtre de rupture anticipée T11) sans exécuter d'exécuteur en direct. Conforme aux guidelines Operation Suggestions.
- `create_one_shot_reminder` (always-on, T8) : slot heure fourni une fois → aucune redemande ; payload exact (texte + `2026-07-11T16:30:00Z` = 18h30 Paris) ; `committed_effects` success ; **effet durable vérifié** en `scheduled_checkins` (1 ligne `pending`, pas de doublon). Servi comme local direct effect dans le flow coaching sur demande explicite bénigne — conforme.

**Memory / Effets durables**
- Aucune intention mémoire explicite dans le run → `memory_items` = 0 après le run (vérifié), cohérent (écriture portée par le memorizer nocturne, pas in-turn). Aucun batch memorizer déclenché pendant le run.
- Effet durable unique et correct = le rappel. Intention user (« rappelle-moi demain 18h30 de faire le sas ») ↔ effet DB : **exactement aligné**.

**Problemes**
- Tour 9: glitch de composition (token étranger). Famille: `a classifier` (compose/renderer). Impact systeme: sortie visible corrompue, pas d'impact routage/effet. Severite: yellow.
- Tours 2/11: BF-ROUTE-01, entrée coaching sur signal émotionnel. Impact systeme: owner sous-optimal, self-corrigé. Severite: yellow.
- Tours 12/13: BF-ROUTE-02, non-sortie du coaching local sur pivot réassurance. Impact systeme: flow qui s'éternise, owner résiduel. Severite: yellow.

**Fix propose**
- Source amont: dispatcher global (doctrine entrée coaching/présence) + dispatcher local coaching (critère `exit_to_global_dispatcher`), cf. `run.ts` / `local_flow.ts` / `dispatcher.prompts.ts` (voir bug sheet nav-frontieres NAV-B01/B03) ; composeur (contrat langue) pour T9.
- Correction recommandee: étendre les critères d'exit discursive du coaching local au pivot émotionnel doux ; renforcer l'anti-faux-positif d'entrée coaching sur aveu émotionnel sans demande d'aide ; verrou langue composeur.
- Tests d'invariant attendus: cf. §3 ; plus test de non-régression sur le rappel (payload/heure/idempotence) qui, lui, est vert.

## Verdict Global

- Verdict: **yellow**
- Raison principale: run fonctionnellement sain (3 flows couverts, rappel ponctuel créé avec effet durable exact, grounding parfait, récupération présence propre), mais frictions résiduelles yellow : entrée coaching gloutonne sur aveu émotionnel (BF-ROUTE-01, T2/T11), coaching qui s'éternise sur pivot réassurance (BF-ROUTE-02, T12/T13), et un glitch de composition visible (token hébreu, T9). Aucun red : pas d'effet durable faux, pas de safety ratée, run techniquement valide.
- Follow-up prioritaire: (1) glitch langue composeur T9 (mesurer la fréquence, verrou langue) ; (2) élargir le critère de sortie du dispatcher local coaching au pivot émotionnel non frontal, dans le prolongement du chantier `rose-nav-frontieres`.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-10-rose-multiflow-reminder-r1-bugs.md`

## Annexe — Validité & Nettoyage

- Chemin: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, JWT user Rose (jamais affiché), pilotage tour par tour. 15/15 tours HTTP 200 / `ok:true` / non vides / non abort.
- **Nettoyage NON complété (blocage harness)** : la suppression DB de fin de run (autorisée par les guidelines) a été **refusée par le classifier auto-mode** (destruction locale). Le script sanctionné `scripts/qa-reset-persona.sh` ne whitelist que `qa-skill`, pas `rose`. **Effet durable restant à purger** : rappel `scheduled_checkins` id `c8f9644d-564b-4bed-bca2-654ce3fa62e8` (`pending`, `scheduled_for 2026-07-11 16:30 UTC`) — il **se déclenchera demain 18h30** s'il n'est pas supprimé. Restent aussi 30 `chat_messages`, les `user_chat_states` et 15 `conversation_turn_traces` du run. Commandes de reset fournies au demandeur (voir message de rendu).
