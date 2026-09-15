# Conversation Risk Flow Exit Context Rerun

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `qa-conv-risk-context4-20260513211226`
- Persona: Nina
- Compte technique: `qa-skill` temporary connection `all_skills_conv_risk_context4_20260513211226`
- User id technique: `6175473a-931a-4548-96e5-0ebb7679e597`
- Objectif: verifier que, dans un tool-skill actif, le score `conversation_risk >= 8` coupe le flow, efface les slots actifs, passe un `flow_exit_context` structure, et laisse l'IA generer un message de reprise non deterministe.
- Trajectoire: demande de carte de defense -> slot filling confus -> user mecontent -> coupe-feu -> message IA attendu: reprise au debut + resume + confirmation/correction, sans prochaine question de slot.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`.
- Validite QA: valide. Edge Runtime local redemarre avant ce rerun pour charger le dernier code.

## 2. Tours De Conversation

### Tour 1

**User**
> Je suis Nina, dans mon plan j'ai l'action Faire le choix du brut et le piege c'est le retour du travail: stress, fatigue, biscuits. Je veux que tu me crees une carte de defense pour ce moment-la, pas un discours nutrition.

**Sophia**
> Salut Nina. On oublie la nutrition, on reste sur le terrain du concret 🛡️
>
> Pour ta carte de defense, on va cibler ce moment critique du retour. L'idee, c'est d'avoir un geste de moins de 30 secondes qui casse le reflexe biscuits quand le stress et la fatigue poussent au crime.
>
> On peut imaginer un truc du genre : des que tu passes la porte, tu bois un grand verre d'eau ou tu croques une pomme avant meme d'ouvrir le placard.
>
> Qu'est-ce qui te semble le plus simple a faire sans reflechir quand tu rentres videe ?
>
> Pour creer la carte officiellement et l'avoir sous la main, il faudra passer par Dashboard > Ressources une fois qu'on aura cale ton geste.

**Trace courte**
- request_id: `71e8be6c-cc80-4055-8574-1d80cff1e4a7`
- conversation_risk: score `0`, exit `false`, history `[0]`
- active_tool: `false`

### Tour 2

**User**
> Bah justement je sais pas, je pensais que tu allais me la faire la carte. Le premier geste peut etre poser mon sac et boire un verre d'eau, mais je suis deja paumee avec ta question.

**Sophia**
> Je veux eviter de creer la mauvaise carte: tu veux plutot une carte d'attaque pour aider a demarrer, ou une carte de defense pour le moment ou tu risques de deraper ?

**Trace courte**
- request_id: `cfd537e6-fa6d-4cf7-bcfd-cc8aa20ed74a`
- conversation_risk: score `0`, exit `false`, history `[0,0]`
- active_tool: `true`

### Tour 3

**User**
> Carte de defense. Je l'ai deja dit: c'est quand je rentre crevee et que je risque de deraper sur les biscuits. La tu me redemandes le truc de base et ca me perd.

**Sophia**
> Il me manque le moment de risque a couvrir. Decris ce qui risque de te faire decrocher.

**Trace courte**
- request_id: `80d97e45-0517-4773-b636-331e36563d52`
- conversation_risk: score `1`, exit `false`, history `[0,0,1]`
- active_tool: `true`

### Tour 4

**User**
> Non mais stop, tu comprends rien. Je te l'ai deja dit trois fois: retour du travail, stress, biscuits. Ce n'est pas ce que j'ai dit, je veux repartir a zero parce que la Sophia me perd completement.

**Sophia**
> Ouf, ok. On repart vraiment a zero, proprement. 🛡️
>
> Carte de defense (moment precis) :
> - Quand tu rentres du travail, stress + fatigue
> - Et que le reflexe "biscuits" arrive
> - Ton but: casser le mode automatique tout de suite, avec un geste ultra simple avant de "negocier" avec toi-meme
>
> Je recapitule ce que je crois avoir compris pour la carte de defense: retour du travail + stress + biscuits (pas de nutrition, que du concret). Confirme-moi si c'est bien ca, ou dis-moi ce qu'il faut ajuster.

**Trace courte**
- request_id: `053af1d2-3551-495b-970a-315c0781396f`
- conversation_risk: score `9.1`, threshold `8`, exit `true`
- flow_exit_context: `interrupted_flow_type=tool_skill`, `restart_scope=tool_subskill`, `active_tool_skill_type=prepare_defense_card`
- active_tool apres tour: `false`
- active_skill apres tour: `false`
- pending apres tour: `false`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 4 respecte la logique produit: reprise au debut, resume de ce que Sophia croit avoir compris, demande confirmation/correction.
- Le message n'est pas deterministe; il est formule par l'IA avec le contexte structure.
- Sophia ne demande plus directement un slot specifique au tour de coupe-feu.

**Problemes**
- Tours 2-3 restent la cause UX racine: le tool-skill redemande des informations deja donnees.
- Tour 4 contient encore une mini-structure de carte avant confirmation. Ce n'est pas bloquant, mais on peut viser encore plus sobre.

**Fix propose**
- Corriger `prepare_defense_card` pour accepter "retour du travail + stress/fatigue + biscuits" comme `risk_situation` suffisant.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Le dispatcher produit bien `flow_exit_context` avec `tool_skill`.
- Le router conserve un snapshot du tool-skill actif pour le dispatcher meme si le message est un escape `stop/repartir a zero`.
- Le router nettoie les slots actifs et ne laisse pas `__active_tool_skill_intake` dans `temp_memory`.

**Skills / Operations / Tools**
- Aucun executor appele.
- Aucune carte creee sans confirmation.
- Le prochain tour repartira avec des slots effaces, mais avec un resume visible de ce qui etait compris.

## Verdict Global

- Verdict: green/yellow
- Raison principale: le coupe-feu et le message IA de reprise fonctionnent; le flow carte de defense reste a ameliorer en amont.
- Follow-up prioritaire: assouplir le slot filling `risk_situation` de `prepare_defense_card`.
