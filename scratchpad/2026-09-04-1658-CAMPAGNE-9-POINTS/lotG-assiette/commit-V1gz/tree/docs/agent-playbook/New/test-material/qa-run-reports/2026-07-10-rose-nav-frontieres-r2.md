# QA Run — Frontières de navigation, validation post-fix NAV-B01/B03 (rose, r2)

## 1. Contexte Du Test

- Date: 2026-07-10 (18h30–19h00 locale)
- Run: `rose-nav-frontieres-r2` — validation itérative des fixs du run r1 (`2026-07-10-rose-nav-frontieres-r1.md`), 11 tours, scopes `qa-nav2-*`
- Persona: rose (local, `is_test_persona=true`)
- Objectif: rejouer les frontières rouges/jaunes de r1 après correction — B2' (annonce vague), B7' (coaching → glissement → dépôt lourd), B6' (présence → tool_pull → coaching → re-dépôt) — en itérant sur les défauts découverts (cadre autorisé: run de fix demandé par le user, itération attendue)
- Fixs embarqués au départ: (1) doctrine « DEPOT DISCURSIF PROFOND » dans le dispatcher local coaching (+ exceptions aux invariants 3169/3179/3194); (2) routers.ts: entrée présence déplacée APRÈS toutes les continuations de flows actifs (suppression de la préemption parent→enfant); (3) doctrine dispatcher global: « annonce sans contenu = medium »
- Fixs ajoutés EN COURS de run (itération): (4) contrat dispatcher durci — signal présence avec kind OBLIGATOIRE à chaque tour quand le flow présence est actif, même en double émission avec coaching; (5) run.ts — les re-dispatchs de sortie de flow local passent `presence_flow_enabled` + `applyPresenceEntryAfterLocalFlowExit()` (l'entrée présence s'applique aussi sur un tour de re-dispatch)
- Cadre IA réel: local, `test-send-message` `force_full_ai=true`, tour par tour, formulations nouvelles (pas de reprise verbatim de r1)
- Validité QA: **valide** (11/11 tours ok, 0 vide, 0 abort; cleanup complet, 0 résidu)

## 2. Tours De Conversation

### B2'-T1 — annonce vague (revalidation NAV-B03)

**Verdict du tour:** green

**User**
> faut que je te parle d'un truc mais je sais pas trop comment l'amener

**Sophia**
> Vas-y comme ça vient, même en vrac. Tu peux commencer par le morceau le plus simple, je recolle le reste avec toi 🙂

**Trace courte**
- owner: `normal_reply` (`normal_reply_default`) · presence_signal: **band=medium** kind=maintain · état: AUCUN
- NAV-B03 corrigé: l'annonce sans contenu reste au sol avec une invitation courte (en r1: band=high → entrée immédiate).

### B2'-T2 — vrai dépôt (frère, 3000 €, poker)

**Verdict du tour:** green

**User**
> Ok alors voilà. Mon frère m'a demandé de lui prêter 3000 euros le mois dernier et je lui ai donnés. Sauf que je viens d'apprendre par ma belle-soeur qu'il les a claqués au poker en ligne. […]

**Sophia**
> Aïe. Là il y a plusieurs chocs d'un coup […] qu'est-ce qui te bloque le plus à lui parler — la peur qu'il mente encore, la peur qu'il s'effondre, ou la peur du conflit ?

**Trace courte**
- owner: `presence_conversation` (`presence_conversation_entry`) · band=high · coaching_signal high concurrent, battu par l'entrée présence
- La règle des 2 tours fonctionne: T1 invite, T2 entre.

### B7'-T1 — pull coaching légitime (action du matin zappée)

**Verdict du tour:** green

**User**
> Dis, j'ai un souci avec mon action du matin, je la zappe une fois sur deux parce que je traîne sur mon téléphone au réveil. Tu peux m'aider à trouver un truc ?

**Sophia**
> Je partirais sur une carte d'attaque libre, technique préparer le terrain […]

**Trace courte**
- owner: `coaching_recommendation` (`coaching_recommendation_signal`) · état: coaching actif

### B7'-T2 — dérive légère (anti-sur-sortie)

**Verdict du tour:** green

**User**
> Hmm ouais pourquoi pas... mais bon je sais pas si c'est vraiment le téléphone le problème en fait

**Sophia**
> Je vois : ce n'est pas forcément le téléphone en lui-même […] décris-moi juste ce qui se passe dans les 5 premières minutes du matin, et je te dirai quoi viser.

**Trace courte**
- owner: `coaching_recommendation` (`active_coaching_recommendation`), skill_run status=continue
- L'anti-faux-positif tient: une nuance sur la cause reste du coaching (clarification, pas de re-pitch produit, pas de sur-sortie).

### B7'-T3 — refus outil + dépôt lourd (LE tour rouge de r1)

**Verdict du tour:** green

**User**
> En vrai laisse tomber la carte, c'est pas ça. J'ai juste besoin de parler là. Le matin je reste au lit parce que je redoute ma journée en fait. Depuis que ma boîte a annoncé le plan social je me réveille avec une boule au ventre […]

**Sophia**
> Oui, là c'est plus clair : ce n'est pas une question de discipline, c'est de l'angoisse face à une journée devenue menaçante. […] Si tu veux juste parler, je reste là.

**Trace courte**
- skill_run: `status="exit"`, `exit_target="global"`, note de handoff avec les mots du user (« dit vouloir juste parler… plan social, boule au ventre »)
- re-dispatch: presence_signal band=high émis; owner final: `normal_reply` **`distress_support_priority`** (safety=medium) — la détresse préempte l'entrée présence, ordre voulu
- **Zéro potion, coaching purgé (état AUCUN), accueil pur.** Le pattern « harcèlement de vente » de r1-B7-T4 ne se reproduit pas.

### B7'-T4 — continuation posée

**Verdict du tour:** green

**User**
> Merci. Tu sais ce qui est bizarre, c'est que je suis même pas sûr de vouloir le garder ce poste. […] Mais l'idée qu'on choisisse à ma place, ça me rend dingue. C'est con hein

**Sophia**
> Non, ce n'est pas con du tout. […] Lequel te serre le plus en ce moment : rester, ou ne plus décider toi-même ?

**Trace courte**
- owner: `presence_conversation` (`presence_conversation_entry`) · état: présence active
- La présence entre dès que la vague détresse retombe, fil cohérent avec T1/T3 (« le matin, tu ne fuis pas juste une journée de boulot »).

### B6'-T1 — dépôt fort (appart, endettement, rêve d'ailleurs)

**Verdict du tour:** green — entrée présence immédiate (band=high), réponse riche avec question de relance.

### B6'-T2 — demande de carte pendant présence

**Verdict du tour:** yellow

**Famille de bugs:** BF-ROUTE-01 — kind mal classé (tool_pull attendu, maintain émis)

**User**
> Lui dire la vérité je pense... D'ailleurs en attendant d'oser, tu peux me préparer une carte de défense pour pas craquer et redire oui quand elle relance le sujet ?

**Sophia**
> Oui — pas une "carte" au format fiche, mais je peux te donner un vrai bouclier verbal […]

**Trace courte**
- presence_signal: kind=**maintain** (attendu: tool_pull) · owner: présence (collant)
- Demande explicite d'outil absorbée en conversation. Réponse utile et honnête (pas de fausse carte), mais le pull n'a pas routé vers coaching (r1-B5 l'avait bien classé — variance LLM).

### B6'-T3 — insistance sur la carte

**Verdict du tour:** yellow

**Famille de bugs:** BF-ROUTE-01 — signal présence OMIS par le dispatcher (coaching émis seul → kind incalculable → collant par défaut)

**User**
> C'est bien mais je veux vraiment la carte de défense dans l'app, comme ça je l'ai sur moi. Tu peux me la préparer ?

**Sophia**
> […] Je ne peux pas la créer dans l'app depuis ici. En revanche, je peux te donner un texte prêt à coller dedans […]

**Trace courte**
- presence_signal: **none** (violation de contrat: flow présence actif sans signal) · coaching_signal: high · owner: présence (collant par défaut)
- Cause: le dispatcher a émis coaching sans le signal présence obligatoire → aucune sortie calculable. **Fix appliqué en cours de run** (itération autorisée): contrat durci dans `dispatcher.prompts.ts` — signal présence + kind OBLIGATOIRES à chaque tour de flow actif, y compris en double émission.

### B6'-T4 — nouvelle insistance (post-durcissement)

**Verdict du tour:** green

**User**
> Ok pour le texte, mais vas-y prépare-la moi cette carte de défense, je veux la retrouver dans mes ressources

**Sophia**
> Je vois: c'est pour quand elle relance sur l'achat. Tu veux que je te la cadre pour ce moment précis ?

**Trace courte**
- log: `transition=exit kind=tool_pull` → chaîne de sorties (présence → global → product_help → global) → owner final: `coaching_recommendation`, état actif = coaching, intake démarré
- Le kind est revenu, la sortie tool_pull fonctionne à nouveau. (Chemin un peu scénique via product_help, mais chaque saut est une sortie-vers-global conforme, un seul tour user, réponse correcte.)

### B6'-T5 — re-dépôt de fond pendant coaching actif (2e tour rouge de r1)

**Verdict du tour:** yellow (mécanique coaching parfaite; atterrissage incomplet — corrigé puis revalidé en B6b)

**Famille de bugs:** BF-ROUTE-01 — re-dispatch sans `presence_flow_enabled` (fix run.ts en cours de run)

**User**
> En vrai laisse tomber la carte. Ce qui me bouffe c'est pas de savoir quoi lui répondre quand elle relance. C'est que je me demande si je l'aime encore assez pour construire un truc pareil avec elle. Voilà. Je l'ai jamais dit à voix haute.

**Sophia**
> Ça, c'est le vrai nœud. Pas la phrase à sortir, mais le doute sur le lien lui-même […] Si tu veux, je peux t'aider à démêler ça sans te pousser nulle part.

**Trace courte**
- skill_run: `status="exit"` avec note de handoff fidèle — **la sortie coaching sur dépôt discursif fonctionne, zéro potion** (le red de r1-B6 est mort)
- MAIS owner final: `normal_reply_default` malgré presence_signal high — les `runConversationRouters` des re-dispatchs de sortie de flow local omettaient `presence_flow_enabled`, et l'entrée présence n'était pas appliquée en cours de boucle. **Fix appliqué**: flag passé aux deux sites + `applyPresenceEntryAfterLocalFlowExit()`.

### B6b-T1/T2/T3 — revalidation complète du même-tour coaching→présence

**Verdict des tours:** green

**User (T2, le tour décisif)**
> Laisse tomber la carte en fait. Si je repousse c'est pas la phrase le problème. Ce proprio me rappelle mon père, cette façon de me faire sentir que je dérange dès que je demande un truc. J'ai 40 ans et je me comporte encore comme le gamin qui s'excuse d'exister. C'est de ça que j'aimerais parler en vrai.

**Sophia**
> D'accord, là on est sur tout autre chose. […] Quand ton père te faisait sentir que tu dérangeais, c'était comment, concrètement ?

**Trace courte**
- T1: pull coaching → coaching actif. T2: skill_run `status="exit"` (note de handoff avec ses mots) → re-dispatch → **owner `presence_conversation` (`presence_conversation_entry`) LE MÊME TOUR**, log `transition=enter after_local_flow_exit turns=1`, état = présence, topic hint « rapport a soi, blessure relationnelle, sentiment d'etre de trop »
- T3: continuation → `active_presence_conversation`, presence_turns=2, fil intact (le soupir du père), zéro produit sur tout l'arc.
- **C'est le comportement cible exact: coaching → présence en un tour, par sortie du flow lui-même.**

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le piège central de la nuit du 09/07 est fermé: sur un dépôt vulnérable pendant un coaching, Sophia lâche le mode vente et écoute — deux fois sur deux (B7'-T3, B6b-T2), avec des réponses d'un très bon niveau et zéro poussée produit.
- L'annonce vague reçoit une invitation courte au lieu d'un sur-engagement (B2'-T1).
- La dérive légère ne fait pas sur-sortir le coaching (B7'-T2) — l'anti-faux-positif tient.
- La détresse garde la priorité sur tout, et la présence prend le relais au tour d'après (B7'-T3→T4).

**Problèmes (résolus en cours de run, à surveiller)**
- B6'-T2/T3: deux demandes explicites de carte absorbées par la présence avant le durcissement du contrat. Impact: l'outil demandé n'arrive pas immédiatement (réponse honnête mais frustrante si le user veut l'objet). Corrigé au T4; la robustesse reste probabiliste — à échantillonner sur les prochains runs.

**Fix propose**
- Déjà appliqués (voir §1). Surveillance: taux d'émission du kind sur flow présence actif.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Sortie coaching sur dépôt discursif: 2/2 (`status=exit`, notes de handoff fidèles avec les mots du user, recommendation abandonnée proprement malgré l'invariant).
- Atterrissage post-sortie: entrée présence LE MÊME TOUR (B6b-T2, log `after_local_flow_exit`), ou détresse d'abord si le dépôt est aigu (B7'-T3) — l'ordre de priorité safety > présence est préservé sur le re-dispatch.
- Plus de préemption parent→enfant dans routers.ts: un coaching actif garde le tour face à un signal présence (test unitaire flippé), la main ne change que par sortie du flow.
- NAV-B03: annonce vague = medium → normal_reply (validé live).
- 303 tests unitaires verts sur les suites dispatcher/routers/router/coaching/présence (2 échecs préexistants hors périmètre: `user_facing_messages_architecture_test`, vérifiés présents sans mes changements).

**Memory / Effets durables**
- Aucun effet durable créé sur ce run; zéro side effect sur les tours présence. Cleanup: chat_messages, user_chat_states, traces supprimés — 0 résidu.

**Problemes**
- Aucun ouvert côté mécanique. Reste probabiliste: la classification kind (tool_pull vs maintain) du dispatcher — contrat durci, à échantillonner.

## Verdict Global

- Verdict: **green**
- Raison principale: les deux tours rouges de r1 (poussée produit sur dépôt vulnérable pendant coaching actif) sont morts — le coaching sort de lui-même vers le dispatcher global et la présence entre le même tour; l'entrée précoce sur annonce vague est corrigée. Deux défauts de robustesse découverts en cours de run (kind omis; flag absent des re-dispatchs) ont été corrigés et revalidés dans le même run.
- Follow-up prioritaire: échantillonner la fiabilité du kind tool_pull sur les prochains runs QA; déploiement staging (user).

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-10-rose-nav-frontieres-r1-bugs.md` (mise à jour avec les statuts fixed + 2 bugs r2)
