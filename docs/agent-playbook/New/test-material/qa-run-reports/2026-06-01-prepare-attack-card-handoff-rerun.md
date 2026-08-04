# Prepare Attack Card Handoff Rerun - 3 Runs

## 1. Contexte Du Test

- Date: 2026-06-01
- Run: `prepare-attack-card-handoff-rerun`
- Persona: `qa-skill`
- Connexions dediees: `attack_card_handoff_rerun_r1_20260601`, `attack_card_handoff_rerun_r2_20260601`, `attack_card_handoff_rerun_r3_20260601`
- Objectif: reverifier le flow `prepare_attack_card` transforme en coaching + handoff plateforme, sans mutation chat.
- Trajectoire: ambiguite product/help vs preparation, handoff direct no-create, repeat, cancel, revise, apply_attempt.
- Surfaces visees: dispatcher, active handoff arbitration, `prepare_attack_card`, renderer, effect/handoff contract.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, connexions QA temporaires, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Incident prealable: un runner groupe s'est suspendu sans sortie; il a ete arrete, puis les runs ont ete relances un par un avec timeout explicite par tour. Les connexions temporaires ont ete nettoyees.

## 2. Tours De Conversation

### Run R1 - Ambiguite Puis Preparation

#### Tour 1

**Verdict du tour:** green

**User**
> Je ne sais pas si je veux juste comprendre les cartes d’attaque ou en préparer une pour mon action du matin.

**Sophia**
> Une carte d'attaque, c'est un outil concret pour t'aider à déclencher ton action quand tu hésites, comme pour ton carnet le matin. Je peux t'expliquer comment l'une de ces techniques fonctionne ou on en prépare un brouillon ensemble pour que tu vois ce que ça donne. Qu'en penses-tu ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `ask_question`
- operation: no execution
- executed_tools: `[]`
- durable_effect: none observed

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Je veux en préparer une pour mon action du matin : ouvrir mon carnet avant le café. Le piège, c’est que je me dis que je regarderai après. Ne la crée pas depuis le chat.

**Sophia**
> Je ne confirme aucun changement durable sans effet confirmé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `ask_question`
- operation: no execution
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: le user donne la cible, le piege et la contrainte no-create apres clarification, mais Sophia ne produit pas le handoff et repond par un message de guard generique.
- Source amont probable: reprise d'intake apres clarification; contrainte `no_create` et slots complets non transformes en handoff draft.
- Owner runtime: `prepare_attack_card` intake/router.
- Meilleure correction selon les guidelines: traiter la reponse post-clarification comme une continuation de collecte qui peut produire `handoff_delivered`, pas comme un etat de confirmation durable generique.
- Pourquoi ce n'est pas un patch local: la sortie visible vient d'une mauvaise transition de flow, pas d'une phrase renderer isolee.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok crée-la.

**Sophia**
> C'est entendu, je vais la créer directement. Pour t'aider à ouvrir ton carnet, quelle technique préfères-tu : l'Ancre visuelle, Le texte magique ou Preparer le terrain ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `ask_question`
- operation: no execution
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: Sophia annonce une creation directe et relance une selection de technique, alors que le contrat interdit le terminal executable et les formulations de creation.
- Source amont probable: state reducer post-clarification; `ok crée-la` n'est pas converti en `apply_attempt` no-mutation parce que le handoff actif n'a pas ete etabli au tour 2.
- Owner runtime: `prepare_attack_card` router/state.
- Meilleure correction selon les guidelines: garantir qu'une intention d'approbation apres preparation de carte passe toujours par `apply_attempt` non-mutant, avec destination plateforme.
- Pourquoi ce n'est pas un patch local: il faut corriger l'etat actif et l'arbitrage apply_attempt, pas seulement bannir une phrase.

### Run R2 - Handoff Direct, Repeat, Cancel

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Prépare-moi une carte d’attaque en Ancre visuelle pour poser ma tenue de sport sur la chaise ce soir. Le piège, c’est que je repousse en disant que je verrai demain. Ne la crée pas depuis le chat.

**Sophia**
> Cible/action comprise : Poser ma tenue de sport sur la chaise ce soir
>
> Obstacle ou piège identifié : je repousse en disant que je verrai demain
>
> Technique recommandée : Ancre visuelle
> Pourquoi : L'ancre visuelle court-circuite la négociation mentale en rendant l'intention impossible à ignorer.
>
> Brouillon de carte :
> Tenue prête, esprit libre
> Demain commence ce soir.
> Mode d'emploi : Place cette phrase près de ta chaise ce soir comme signal de départ.
>
> À préserver :
> - Demain commence ce soir.
> - Casse le cycle du 'je verrai demain'
> - Rend l'engagement physique et immédiat
>
> À éviter :
> - Transformer ce brouillon en promesse trop longue.
> - Ajouter plusieurs techniques concurrentes dans la même carte.
>
> Destination plateforme : dans la section Cartes d’attaque
> 1. ouvre la section Cartes
> 2. choisis Carte d’attaque
> 3. reprends le brouillon proposé
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `repeat_handoff`
- platform_handoff: `delivered`, reason_code `repeat_platform_handoff`, `no_chat_mutation=true`
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: la reponse visible est bonne, mais la trace classe le premier handoff comme `repeat_handoff` au lieu d'un initial `handoff_delivered`.
- Source amont probable: initial state/handoff builder ou classification trace.
- Owner runtime: `prepare_attack_card` router/state.
- Meilleure correction selon les guidelines: distinguer initial delivery et repeat delivery dans le status et le reason_code.
- Pourquoi ce n'est pas un patch local: le renderer est correct; c'est le contrat d'etat/telemetrie qui est incoherent.

#### Tour 2

**Verdict du tour:** green

**User**
> Redis-moi quoi mettre et où je la mets.

**Sophia**
> Cible/action comprise : Poser ma tenue de sport sur la chaise ce soir
>
> Obstacle ou piège identifié : je repousse en disant que je verrai demain
>
> Technique recommandée : Ancre visuelle
> Pourquoi : L'ancre visuelle court-circuite la négociation mentale en rendant l'intention impossible à ignorer.
>
> Brouillon de carte :
> Tenue prête, esprit libre
> Demain commence ce soir.
> Mode d'emploi : Place cette phrase près de ta chaise ce soir comme signal de départ.
>
> Destination plateforme : dans la section Cartes d’attaque
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `repeat_handoff`
- platform_handoff: `delivered`, reason_code `repeat_platform_handoff`, `no_chat_mutation=true`
- executed_tools: `[]`
- durable_effect: none observed

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> pas de carte finalement

**Sophia**
> Ok, pas de carte. 🙂 On fait ultra simple: tu poses ta tenue de sport sur la chaise ce soir, point.
>
> Tu le fais tout de suite (A) ou après ton prochain truc (B) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- operation: none
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: le contenu annule bien la carte, mais l'owner n'est pas `prepare_attack_card`; le contrat demandait que `pas de carte` reste au skill en handoff actif.
- Source amont probable: active handoff arbitration ou clearing premature de l'etat apres repeat.
- Owner runtime: active handoff arbitrator / `prepare_attack_card` state.
- Meilleure correction selon les guidelines: garder `cancelled` dans le skill et tracer la sortie handoff avant toute reprise par `normal_reply`.
- Pourquoi ce n'est pas un patch local: la reponse visible est acceptable; le probleme est le routage et la continuite d'etat.

### Run R3 - Revision Puis Apply Attempt

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Prépare-moi une carte d’attaque pour envoyer mon dossier administratif avant 16h. Je bloque parce que je veux que ce soit parfait avant d’appuyer sur envoyer. Ne la crée pas, je veux seulement le brouillon.

**Sophia**
> Cible/action comprise : Envoyer mon dossier administratif avant 16h
>
> Obstacle ou piège identifié : je veux que ce soit parfait avant d’appuyer sur envoyer
>
> Technique recommandée : Le texte magique
> Pourquoi : Faire baisser le combat intérieur quand tu commences à négocier avec toi-même.
>
> Brouillon de carte :
> Dossier administratif : Le texte magique
> Ce dossier n'a pas besoin d'être parfait, il a juste besoin d'être envoyé. Je clique maintenant pour m'en libérer.
> Mode d'emploi : Lis ou recopie ce texte au moment où tu sens la résistance monter, puis fais le premier geste.
>
> Destination plateforme : dans la section Cartes d’attaque
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `repeat_handoff`
- platform_handoff: `delivered`, reason_code `repeat_platform_handoff`, `no_chat_mutation=true`
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: visible handoff correct, mais premier delivery trace comme repeat.
- Source amont probable: meme incoherence state/telemetry que R2 tour 1.
- Owner runtime: `prepare_attack_card` router/state.
- Meilleure correction selon les guidelines: initial handoff doit etre `handoff_delivered` avec reason_code initial, pas repeat.
- Pourquoi ce n'est pas un patch local: le contenu est bon; le bug est contractuel.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-03 - Draft lifecycle casse

**User**
> Rends-la plus simple, une seule proposition.

**Sophia**
> Cible/action comprise : Envoyer mon dossier administratif avant 16h
>
> Obstacle ou piège identifié : je veux que ce soit parfait avant d’appuyer sur envoyer
>
> Technique recommandée : Le texte magique
>
> Brouillon de carte :
> Dossier administratif : Le texte magique
> Ce dossier n'a pas besoin d'être parfait, il a juste besoin d'être envoyé. Je clique maintenant pour m'en libérer.
>
> Destination plateforme : dans la section Cartes d’attaque
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `repeat_handoff`
- platform_handoff: `delivered`, reason_code `repeat_platform_handoff`, `no_chat_mutation=true`
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: la demande de revision "plus simple" ne regenere pas la recommandation; Sophia repete le meme brouillon et trace `repeat_handoff`.
- Source amont probable: draft review decision ou active handoff routing classe `revise` comme `repeat`.
- Owner runtime: `prepare_attack_card` router / intake review.
- Meilleure correction selon les guidelines: mapper les demandes de simplification/changement en `revise_handoff` et regenerer un draft effectivement plus simple.
- Pourquoi ce n'est pas un patch local: il faut corriger la decision de transition, pas raccourcir statiquement le texte.

#### Tour 3

**Verdict du tour:** green

**User**
> Ok crée-la.

**Sophia**
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque.
>
> Version à reprendre :
> Dossier administratif : Le texte magique
> Ce dossier n'a pas besoin d'être parfait, il a juste besoin d'être envoyé. Je clique maintenant pour m'en libérer.
> Mode d'emploi : Lis ou recopie ce texte au moment où tu sens la résistance monter, puis fais le premier geste.
>
> Destination plateforme : dans la section Cartes d’attaque 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- status: `apply_attempt`
- platform_handoff: `delivered`, reason_code `apply_attempt_no_chat_mutation`, `no_chat_mutation=true`
- executed_tools: `[]`
- durable_effect: none observed

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les handoffs directs R2/R3 contiennent les sections attendues: cible, obstacle, technique, brouillon, preservations, evitements, destination plateforme, ligne no-mutation.
- `redis-moi quoi mettre` reste dans le skill et repete la version plateforme.
- `ok crée-la` apres un handoff livre une reponse no-mutation et ne pretend pas creer.

**Problemes**
- R1 Tour 2: la continuation apres clarification produit un guard generique au lieu du brouillon. Famille: BF-INTAKE-03. Impact: l'utilisateur donne exactement les infos demandees et n'obtient pas la carte. Severite: red.
- R1 Tour 3: Sophia dit "je vais la créer directement". Famille: BF-STATE-01. Impact: formulation interdite et contraire au nouveau contrat. Severite: red.
- R3 Tour 2: "Rends-la plus simple" repete la meme version. Famille: BF-STATE-03. Impact: la revision ne marche pas humainement. Severite: red.
- R2 Tour 3: annulation visible correcte mais terminee par une question d'action immediate hors skill. Famille: BF-ROUTE-02. Impact: leger flou UX apres annulation. Severite: yellow.

**Fix propose**
- Source amont: `prepare_attack_card` active handoff state, review decision et continuation post-clarification.
- Correction recommandee: garantir les transitions `continue_collecting -> produce_handoff`, `revise_handoff` et `apply_attempt` meme apres une clarification initiale; bannir les claims de creation depuis le reducer/renderer du skill.
- Tests d'invariant attendus: run reel post-clarification no-create, active revise paraphrase, apply_attempt apres clarification, cancel owner `prepare_attack_card`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- L'ambiguite initiale R1 est correctement routee vers `prepare_attack_card` et clarifiee.
- La continuation R1 ne sort pas en `handoff_delivered` malgre slots complets.
- Les handoffs directs R2/R3 restent dans `prepare_attack_card`.
- L'annulation R2 Tour 3 sort en `normal_reply`, alors que le contrat d'arbitrage actif demandait `cancelled` dans le skill.

**Skills / Operations / Tools**
- Aucun `executed_tools` observe sur les tours; aucun writer DB visible dans ces traces courtes.
- Les handoffs directs contiennent `platform_handoff.delivered` et `no_chat_mutation=true`.
- Les premiers handoffs directs sont traces comme `repeat_handoff` avec `reason_code=repeat_platform_handoff`, ce qui est incoherent pour un premier delivery.
- La revision ne passe pas en `revise_handoff`; elle est traitee comme repeat.

**Effets Durables**
- Aucun effet durable n'a ete observe pendant les runs.
- `apply_attempt` R3 respecte le no-mutation visible et trace.
- Le risque systeme restant n'est pas une creation DB, mais une mauvaise continuite d'etat et des claims interdits dans un chemin post-clarification.

**Fix propose**
- Source amont: router/state `prepare_attack_card`, active handoff arbitration, review decision mapping.
- Correction recommandee: separer explicitement initial handoff vs repeat, conserver le handoff actif apres clarification, router les demandes de revision vers regeneration, router l'annulation vers `cancelled`.
- Tests d'invariant attendus: QA reelle 3 runs apres fix, plus tests unitaires couvrant post-clarification `no_create`, reason_code initial, cancel owner, revision avec contenu modifie.

## Verdict Global

`red` - Les handoffs directs sans mutation fonctionnent, mais le chemin post-clarification et la revision active ne respectent pas encore le contrat cible.
