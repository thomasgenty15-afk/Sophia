# Conversation Risk Decay Rerun - Defense Card Flow

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `qa-conv-risk-decay-20260513204910`
- Persona: Nina
- Compte technique: `qa-skill` temporary connection `all_skills_conv_risk_decay_20260513204910`
- User id technique: `67aa306c-8196-4fa2-b2d8-25609e44e42d`
- Objectif: verifier la correction du seuil `>= 8` et la retombee naturelle via decay/recovery apres un pic de frustration.
- Trajectoire: demande de carte de defense -> Sophia reclarifie trop -> user mecontent -> coupe-feu -> message calme -> score doit retomber.
- Surfaces visees: `dispatcher.v2`, `conversation_risk`, `prepare_defense_card`, router, `temp_memory`.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de fallback deterministe.
- Validite QA: valide pour transcript et etat persistant; `conversation_turn_trace` reste non exploite dans cet endpoint local.

## 2. Tours De Conversation

### Tour 1

**User**
> Je suis Nina, dans mon plan j'ai l'action Faire le choix du brut et le piege c'est le retour du travail: stress, fatigue, biscuits. Je veux que tu me crees une carte de defense pour ce moment-la, pas un discours nutrition.

**Sophia**
> C'est note Nina, on oublie le cours de nutrition et on se concentre sur l'impact immediat. Pour ta carte de defense, on va viser un geste faisable en moins de 30 secondes des que tu passes la porte. [...] Si tu veux qu'on la vali...

**Trace courte**
- request_id: `f20bca08-a27f-43b9-84ec-c4676f2cd845`
- conversation_risk: score `0`, exit `false`, history `[0]`
- flow actif: non

### Tour 2

**User**
> Bah justement je sais pas, je pensais que tu allais me la faire la carte. Le premier geste peut etre poser mon sac et boire un verre d'eau, mais je suis deja paumee avec ta question.

**Sophia**
> Je veux eviter de creer la mauvaise carte: tu veux plutot une carte d'attaque pour aider a demarrer, ou une carte de defense pour le moment ou tu risques de deraper ?

**Trace courte**
- request_id: `0836e92b-004e-49f4-9bbf-a5c505a452ea`
- conversation_risk: score `0`, exit `false`, history `[0,0]`
- flow actif: `__active_tool_skill_intake=true`

### Tour 3

**User**
> Carte de defense. Je l'ai deja dit: c'est quand je rentre crevee et que je risque de deraper sur les biscuits. La tu me redemandes le truc de base et ca me perd.

**Sophia**
> Il me manque le moment de risque a couvrir. Decris ce qui risque de te faire decrocher.

**Trace courte**
- request_id: `6075956d-2b23-40b7-a422-5d3c91c38b6f`
- conversation_risk: score `1`, reason_codes `[active_flow_pressure]`, exit `false`, history `[0,0,1]`
- flow actif: `__active_tool_skill_intake=true`

### Tour 4

**User**
> Non mais stop, tu comprends rien. Je te l'ai deja dit trois fois: retour du travail, stress, biscuits. Ce n'est pas ce que j'ai dit, je veux repartir a zero parce que la Sophia me perd completement.

**Sophia**
> Ok, j'arrete la. Je ne cree rien d'autre.

**Trace courte**
- request_id: `97395483-afc3-4a30-8ce2-6470cd2f24d0`
- conversation_risk: score `8.1`, threshold `8`, exit `true`
- reason_codes: `[system_misunderstanding, explicit_stop_or_abandon, repetition_or_correction, previous_risk]`
- history: `[0,0,1,8.1]`
- flow actif apres tour: non
- resultat seuil: le coupe-feu declenche bien des que le score atteint/passe `8`

### Tour 5

**User**
> ok merci, on reprend simplement

**Sophia**
> Yes. On reprend a zero, proprement. Ta carte de defense a ecrire = le moment "retour du travail, stress/fatigue, risque de biscuits". Donne-moi juste 1 truc concret: quand tu te vois deraper, c'est plutot 1) des que tu rentres chez toi, 2) juste avant de te mettre a table, ou 3) le soir pose(e) sur le canape ?

**Trace courte**
- request_id: `f698a5f0-bde3-4bf1-ad4a-5318b0436c8e`
- conversation_risk: score `3`, reason_codes `[previous_risk]`, exit `false`
- history: `[0,0,1,8.1,3]`
- flow actif: pas de tool-skill actif; `active_skill=true`
- resultat decay: le score retombe naturellement sous le seuil apres un tour calme

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 4: Sophia arrete net et ne cree rien.
- Tour 5: la conversation peut reprendre car le score retombe a `3`.

**Problemes**
- Tours 2-3: Sophia continue de redemander des slots deja fournis. Impact: la frustration reste legitime. Severite: red pour le flow carte de defense.
- Tour 5: meme apres "on reprend simplement", Sophia revient a une question de carte. Impact: pas dangereux, mais encore trop accroche au sujet precedent. Severite: yellow.

**Fix propose**
- Assouplir `prepare_defense_card` pour accepter le contexte libre "retour du travail, stress, biscuits" comme risque suffisant.
- Apres coupe-feu, ajouter une courte fenetre "no same tool-skill reentry" si le user dit repartir simplement.

## 4. Analyse Systeme

**Verdict: green/yellow**

**Routage**
- Le seuil est maintenant `>= 8`: le tour 4 declenche a `8.1`.
- Le score retombe naturellement: apres `8.1`, le tour calme donne `3`.
- Le reason code `previous_risk` reste present au tour 5, mais sa contribution n'est plus bloquante.

**Skills / Operations / Tools**
- Le tool-skill actif est nettoye au tour 4.
- Aucun pending confirmation ne reste.
- Aucun executor n'est appele sans confirmation.

**Memory / Effets durables**
- `user_defense_cards=0`
- `user_attack_cards=0`
- Pas de side effect durable incorrect.

**Problemes**
- `conversation_turn_trace` reste absent dans l'endpoint local, donc l'observabilite structuree du rapport repose sur `user_chat_states`.

**Fix propose**
- Ajouter une verification de trace locale pour `test-send-message`.

## Verdict Global

- Verdict: yellow
- Raison principale: la correction conversation-risk fonctionne, mais le flow carte de defense reste irritant et peut reposer une question trop vite.
- Follow-up prioritaire: corriger `prepare_defense_card` sur la reconnaissance du `risk_situation` deja fourni.
