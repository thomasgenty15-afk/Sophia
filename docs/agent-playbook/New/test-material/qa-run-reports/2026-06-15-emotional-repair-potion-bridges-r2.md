# QA Run Report - emotional-repair-potion-bridges-r2

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `emotional-repair-potion-bridges-r2`
- Persona: `qa-skill`, connexions temporaires locales:
  - `emotional_repair_emotional_repair_potion_bridges_r2_amour`
  - `emotional_repair_emotional_repair_potion_bridges_r2_guerison`
  - `emotional_repair_emotional_repair_potion_bridges_r2_apaisement`
- Objectif: verifier apres fix que `emotional_repair` bridge correctement vers les potions `amour`, `guerison`, `apaisement`.
- Trajectoire: detresse emotionnelle -> stabilisation -> besoin durable -> offre potion -> consentement -> `select_state_potion`.
- Surfaces visees: `emotional_repair`, local dispatcher/reducer, active flow state, bridge `select_state_potion`, note information, absence d'effets durables avant handoff.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Les trois runs ont utilise le chemin IA reel local. Aucun code n'a ete modifie pendant les runs.

## 2. Tours De Conversation

### Run A - Potion amour

#### Tour A1

**Verdict du tour:** green

**User**
> Je viens de me faire recadrer sur un dossier et depuis je me parle comme si j'étais quelqu'un de nul. J'ai honte et je suis très dur avec moi.

**Sophia**
> Je comprends que ce recadrage soit difficile à encaisser et que la honte prenne beaucoup de place en ce moment. [...] ce qui s'est passé sur ce dossier est un événement extérieur, pas une définition de ta valeur.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- direct_effects: `[]`
- durable_effect: aucun

#### Tour A2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Là ça se calme un peu. Ce dont j'aurais besoin, ce n'est pas une méthode ou une action, c'est un appui sur quelques jours pour me parler avec plus de chaleur quand la voix dure revient.

**Sophia**
> Je suis là, tout près de toi. [...] Tu as simplement besoin de douceur en ce moment pour contrer cette voix dure, et je compte bien te l'apporter sans aucune pression [...]

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- local_flow_action: `potion_bridge_offer`
- local_visible_task: `separate_fact_from_identity`
- reason_code: `emotional_repair_potion_bridge_blocked`
- blocked_effects: `select_state_potion`, `bridge_not_mature`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le local dispatcher tente une offre bridge, mais le reducer la bloque et ne rend pas l'offre visible.
- Source amont probable: maturite/persistabilite de `potion_bridge_offer` dans `emotional_repair`.
- Owner runtime: `emotional_repair` local reducer / conversation context.
- Meilleure correction selon les guidelines: rendre l'offre atomique quand le besoin durable et la potion sont identifies, ou produire une vraie question de clarification si le bridge n'est pas encore mature.
- Pourquoi ce n'est pas un patch local: le probleme est l'etat de bridge et sa persistance, pas une phrase visible a corriger.

#### Tour A3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Oui, si ça existe sous forme de potion, je voudrais plutôt une potion d'amour ou de douceur envers moi. Quelque chose pour garder cette chaleur quand je replonge dans la honte.

**Sophia**
> Je suis contente que tu cherches à préserver cette chaleur. [...] Tu mérites de garder cette douceur envers toi-même [...]

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- local_flow_action: `confirm_potion_bridge`
- local_visible_task: `separate_fact_from_identity`
- reason_code: `emotional_repair_potion_bridge_blocked`
- blocked_effects: `select_state_potion`, `missing_previous_potion_offer`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: la confirmation explicite ne bridge pas, car l'offre precedente n'a pas ete persistee.
- Source amont probable: `last_potion_bridge_offer` absent apres A2.
- Owner runtime: `emotional_repair` reducer.
- Correction recommandee: persister l'offre quand `flow_action=potion_bridge_offer` et que `selected_potion=amour` est disponible; sinon ne pas traiter le tour suivant comme confirmation.

### Run B - Potion guerison

#### Tour B1

**Verdict du tour:** green

**User**
> J'ai blessé quelqu'un hier avec une phrase sèche, et depuis je tourne en boucle avec une culpabilité lourde. Je ne veux pas me punir, mais j'ai du mal à me réparer intérieurement.

**Sophia**
> Je sens à quel point cette culpabilité est lourde pour toi. [...] Tu as le droit de reconnaître ton erreur et de chercher une réparation intérieure sans pour autant te condamner.

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- durable_effect: aucun

#### Tour B2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Oui, c'est exactement ça. La crise retombe un peu, mais j'aimerais garder quelque chose pour cicatriser cette culpabilité sur plusieurs jours, sans me flageller à chaque fois que j'y repense.

**Sophia**
> Je suis soulagée de sentir que la pression redescende enfin. [...] Tu as le droit de retrouver de l'apaisement sans que ce souvenir ne devienne une arme contre toi-même.

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- local_flow_action: `regulation_without_potion`
- local_visible_task: `de_shame`
- reason_code: `emotional_repair_local_continue`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: conversation humainement acceptable, mais le besoin durable de cicatrisation ne declenche pas de proposition `guerison`.
- Source amont probable: classification locale du besoin durable `healing_after_hurt`.
- Owner runtime: `emotional_repair` local dispatcher.

#### Tour B3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Dans ce cas je veux bien passer sur une potion de guérison. Je voudrais qu'elle m'aide à réparer ce souvenir sans le transformer en punition contre moi.

**Sophia**
> C'est une intention très douce que tu as là : vouloir soigner ce souvenir sans te punir. [...] Je reste à tes côtés pour t'accompagner vers cette réparation apaisée [...]

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- local_flow_action: `regulation_without_potion`
- local_visible_task: `de_shame`
- reason_code: `emotional_repair_local_continue`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: demande explicite de potion de guerison ignoree par le bridge.
- Source amont probable: active `emotional_repair` absorbe la demande potion au lieu de la transformer en bridge consenti.
- Owner runtime: `emotional_repair` local dispatcher/reducer.

### Run C - Potion apaisement

#### Tour C1

**Verdict du tour:** green

**User**
> Je suis à cran depuis ce matin. J'ai l'impression que tout appuie sur moi, même les petits messages, et mon corps reste tendu comme si je devais encaisser encore.

**Sophia**
> Je sens à quel point c'est pesant pour toi. [...] Je suis simplement là, à tes côtés, pour t'accompagner dans ce moment.

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- durable_effect: aucun

#### Tour C2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Merci, ça baisse un peu. J'aimerais garder un soutien pour les prochains jours, surtout pour relâcher cette pression qui revient dès que je vois une notification.

**Sophia**
> Je suis contente que la tension commence à baisser. Pour t'aider à relâcher durablement la pression liée aux notifications ces prochains jours, je te propose la Potion d'apaisement. Est-ce que tu veux qu'on l'utilise ?

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- local_flow_action: `potion_bridge_offer`
- local_visible_task: `potion_bridge_offer`
- reason_code: `emotional_repair_local_continue`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: offre visible correcte, mais a confirmer au tour suivant.
- Source amont probable: aucun probleme visible a ce tour; le warning vient de la suite qui prouve que l'offre n'est pas persistable correctement.

#### Tour C3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Oui, je veux qu'on l'utilise. La pression des notifications est exactement le sujet.

**Sophia**
> Je comprends. Est-ce que cette pression te donne le sentiment d'être toujours sur le qui-vive ?

**Trace courte**
- http_status: 200
- selected_handler: `emotional_repair`
- local_flow_action: `confirm_potion_bridge`
- local_visible_task: `ask_gentle_clarification`
- reason_code: `emotional_repair_potion_bridge_blocked`
- blocked_effects: `select_state_potion`, `missing_previous_potion_offer`
- note_information_consumed: null
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: l'offre `Potion d'apaisement` etait visible au tour C2, mais le tour C3 ne retrouve pas l'offre precedente et ne bridge pas vers `select_state_potion`.
- Source amont probable: `last_potion_bridge_offer` non persiste dans l'active state ou non relu au tour suivant.
- Owner runtime: `emotional_repair` reducer / active flow state persistence.
- Correction recommandee: verifier la construction et la persistence de `last_potion_bridge_offer` dans le state patch, puis ajouter un test integration local multi-turn offre -> consentement.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les entrees emotionnelles sont bien recues et routees vers `emotional_repair`.
- Le ton est globalement doux et non dangereux.
- Le run `apaisement` montre que Sophia peut formuler une offre potion visible.
- Aucun 502 ni reponse vide observe dans `r2`.

**Problemes**
- Tour A2/A3: Sophia parle de soutien durable mais ne rend pas le bridge `amour` exploitable. Famille: `BF-STATE-01`. Impact: l'utilisateur demande un appui concret mais reste dans une boucle de soutien verbal.
- Tour B2/B3: la potion de guerison explicite est ignoree. Famille: `BF-STATE-01`. Impact: l'utilisateur doit repeter ou parler comme un test sans obtenir le bon flow.
- Tour C3: apres une offre claire, le consentement est perdu. Famille: `BF-STATE-01`. Impact: la confiance est casse; Sophia propose puis ne sait plus reprendre sa propre proposition.

**Fix propose**
- Source amont: `emotional_repair` local reducer et persistence de `last_potion_bridge_offer`.
- Correction recommandee: rendre atomique l'offre bridge visible: si `visible_task=potion_bridge_offer`, alors l'active state du tour suivant doit contenir `last_potion_bridge_offer.selected_potion`, `durable_need`, `prefill_candidates`, et la note/handoff cible. Si cette persistence n'est pas possible, ne jamais afficher l'offre.
- Tests d'invariant attendus: test multi-turn reel/local `offer -> consent` pour `amour`, `guerison`, `apaisement`; test que `confirm_potion_bridge` apres offre visible produit `status=handoff`, `target_dispatcher=select_state_potion`, `selected_potion` non null; test que demande explicite de potion pendant `emotional_repair` ne reste pas en `regulation_without_potion`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Entree dans `emotional_repair`: OK sur les trois runs.
- Sortie vers `select_state_potion`: KO sur les trois runs.
- Le global dispatcher est volontairement saute pendant l'active flow (`active_emotional_repair_local_dispatcher`), donc le bridge doit etre gere par le local dispatcher/reducer.

**Skills / Operations / Tools**
- `emotional_repair` observe: oui.
- `select_state_potion` observe: non.
- `note_information_consumed`: null sur le consentement `apaisement`.
- `direct_effects`, `committed_effects`, `response_executed_tools`: aucun effet durable engageant, ce qui est correct avant handoff.

**Effets durables**
- `chat_messages`: 6 par run.
- `memory_items`: 0.
- `scheduled_checkins`: 0.
- `user_recurring_reminders`: 0.
- Aucune potion session verifiee via les artefacts exposes; le handoff n'ayant pas eu lieu, aucun effet durable potion attendu.

**Regression vs r1**
- Amelioration: plus de HTTP 502 sur les trois variantes.
- Amelioration: le faux handoff avec `selected_potion=null` n'apparait plus; il est bloque.
- Probleme restant: le bridge fonctionnel n'est toujours pas atteint. L'offre visible n'est pas persistable ou non relue au consentement.

## Verdict Global

**red**

Le fix unitaire a corrige le faux handoff dangereux, et le runtime ne renvoie plus 502. Mais la fonctionnalite attendue reste cassee: aucun des trois runs ne bridge vraiment de `emotional_repair` vers `select_state_potion`.

Artefacts:
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r2-amour.{raw,summary,durable}.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r2-guerison.{raw,summary,durable}.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r2-apaisement.{raw,summary,durable}.json`
