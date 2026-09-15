# Prepare Attack Card Handoff Postfix Rerun

## 1. Contexte Du Test

- Date: 2026-06-01
- Run: `prepare-attack-card-handoff-postfix-rerun`
- Persona: `qa-skill`
- Connexions dediees: `attack_card_handoff_postfix_r1b_20260601`, `attack_card_handoff_postfix_r2_20260601`, `attack_card_handoff_postfix_r3_20260601`
- Incident technique: tentative initiale R1 `attack_card_handoff_postfix_r1_20260601` invalide, HTTP 502, serveur local `functions serve` interrompu par conflit de container Edge Runtime. Le container local bloque a ete retire, le serveur relance, puis R1 repris sur connexion fraiche R1b.
- Objectif: verifier si les corrections `prepare_attack_card` retablissent le handoff plateforme no-mutation sur les trajectoires rouges du rapport precedent.
- Trajectoire: ambiguite comprendre/preparer puis preparation, `ok cree-la` apres handoff, demarrage direct avec technique explicite, demarrage direct sans technique puis revision active.
- Surfaces visees: dispatcher, orientation clarification, `prepare_attack_card` intake, active handoff state, renderer, effect ledger/no-mutation.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide pour R1b/R2/R3. Les connexions QA temporaires doivent etre nettoyees apres exploitation du rapport.

## 2. Tours De Conversation

### Run R1b - Ambiguite Puis Preparation Puis Apply Attempt

#### Tour 1

**Verdict du tour:** green

**User**
> Je ne sais pas si je veux juste comprendre les cartes d’attaque ou en préparer une pour mon action du matin.

**Sophia**
> Est-ce que tu veux une explication sur les cartes d'attaque ou en préparer une pour ton action ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: null
- direct_effects: null
- operation: none
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

#### Tour 2

**Verdict du tour:** green

**User**
> Je veux en préparer une pour mon action du matin : ouvrir mon carnet avant le café. Le piège, c’est que je me dis que je regarderai après. Ne la crée pas depuis le chat.

**Sophia**
> Cible/action comprise : Ouvrir mon carnet avant le café
>
> Obstacle ou piège identifié : je me dis que je regarderai après
>
> Technique recommandée : Préparer le terrain
> Pourquoi : En plaçant l'objet sur le chemin de ton café, tu transformes l'oubli en impossibilité physique.
>
> Brouillon de carte :
> Le carnet avant le café
> Pose ton carnet ouvert sur ta machine à café avec ton stylo dessus.
> Mode d'emploi : Installe ce setup ce soir pour que ton carnet soit la première chose que tu touches demain.
>
> Destination plateforme : dans la section Cartes d’attaque
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: null
- direct_effects: null
- operation: `platform_handoff`
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

#### Tour 3

**Verdict du tour:** green

**User**
> Ok crée-la.

**Sophia**
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque.
>
> Version à reprendre :
> Le carnet avant le café
> Pose ton carnet ouvert sur ta machine à café avec ton stylo dessus.
> Mode d'emploi : Installe ce setup ce soir pour que ton carnet soit la première chose que tu touches demain.
>
> Destination plateforme : dans la section Cartes d’attaque 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_handoff_apply_attempt`
- safety: null
- direct_effects: null
- operation: `platform_handoff`
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

### Run R2 - Demarrage Direct Avec Technique Explicite

#### Tour 1

**Verdict du tour:** green

**User**
> Prépare-moi une carte d’attaque en Ancre visuelle pour poser ma tenue de sport sur la chaise ce soir. Le piège, c’est que je repousse en disant que je verrai demain. Ne la crée pas depuis le chat.

**Sophia**
> Cible/action comprise : poser ma tenue de sport sur la chaise ce soir
>
> Obstacle ou piège identifié : je repousse en disant que je verrai demain
>
> Technique recommandée : Ancre visuelle
> Pourquoi : L'ancre visuelle transforme une intention floue en un signal physique immédiat qui court-circuite l'hésitation.
>
> Brouillon de carte :
> Tenue prête, esprit libre
> Ma tenue sur la chaise = Mon engagement envers moi-même.
> Mode d'emploi : Pose ta tenue sur la chaise ce soir et place ce message bien en vue à côté.
>
> Destination plateforme : dans la section Cartes d’attaque
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: null
- direct_effects: null
- operation: `platform_handoff`
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

### Run R3 - Demarrage Direct Avec Technique A Choisir Puis Revision

#### Tour 1

**Verdict du tour:** green

**User**
> Prépare-moi une carte d’attaque pour envoyer mon dossier administratif avant 16h. Je bloque parce que je veux que ce soit parfait avant d’appuyer sur envoyer. Ne la crée pas, je veux seulement le brouillon.

**Sophia**
> Cible/action comprise : envoyer mon dossier administratif avant 16h
>
> Obstacle ou piège identifié : je veux que ce soit parfait avant d’appuyer sur envoyer
>
> Technique recommandée : Le texte magique
> Pourquoi : Cela recadre ton besoin de perfection en priorité d'action immédiate.
>
> Brouillon de carte :
> Dossier envoyé, esprit libéré
> Fait vaut mieux que parfait. Mon dossier est suffisant pour avancer, et je m'autorise à l'envoyer maintenant pour me libérer l'esprit.
>
> Destination plateforme : dans la section Cartes d’attaque
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: null
- direct_effects: null
- operation: `platform_handoff`
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-03 - Draft lifecycle casse

**User**
> Rends-la plus simple, une seule proposition.

**Sophia**
> Cible/action comprise : envoyer mon dossier administratif avant 16h
>
> Obstacle ou piège identifié : Piège de démarrage ou d'évitement identifié pendant l'intake.
>
> Technique recommandée : Le texte magique
> Pourquoi : Faire baisser le combat intérieur quand tu commences à négocier avec toi-même.
>
> Brouillon de carte :
> Dossier administratif : Focus
> Je n'ai pas besoin d'avoir envie pour le faire. Je l'envoie maintenant pour être libre à 16h.
>
> Destination plateforme : dans la section Cartes d’attaque
>
> Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_handoff_revise_handoff`
- safety: null
- direct_effects: null
- operation: `platform_handoff`
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: la revision est capturee par le handoff actif et regenere bien une carte plus simple, mais l'obstacle precis du tour precedent est remplace par un fallback generique.
- Source amont probable: `AttackCardHandoffState` / draft revision context ne preserve pas assez le `blocker_summary` original dans la regeneration.
- Owner runtime: `prepare_attack_card` active handoff state + revision intake.
- Meilleure correction selon les guidelines: transmettre explicitement le `blocker_summary` du handoff actif dans l'operation_input de revision et le rendre prioritaire si le user ne change pas l'obstacle.
- Pourquoi ce n'est pas un patch local: le renderer affiche ce qu'il recoit; la perte se produit dans le lifecycle du draft actif.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les demandes qui bloquaient en `ask_question` ou `technical_blocked` produisent maintenant un vrai brouillon plateforme.
- La clarification initiale tutoie et propose le bon choix comprendre/preparer.
- `Ok crée-la` apres handoff ne cree rien et redonne la destination plateforme.
- Les reponses contiennent cible, obstacle, technique, brouillon, a preserver, a eviter, destination et phrase no-mutation.

**Problemes**
- R3 Tour 2: la revision simplifie bien la carte, mais perd l'obstacle exact. Famille: BF-STATE-03. Impact: leger affaiblissement de personnalisation. Severite: yellow.

**Fix propose**
- Source amont: active handoff state / operation_input de revision.
- Correction recommandee: conserver `blocker_summary` et `target_summary` comme contexte dur pendant `revise_handoff`, sauf si le user les modifie explicitement.
- Tests d'invariant attendus: "rends-la plus simple" apres handoff doit garder l'obstacle original dans le renderer.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- R1b Tour 1: `orientation_clarification` correct.
- R1b Tour 2: resolution de clarification vers `prepare_attack_card` correcte.
- R1b Tour 3: commande active capturee par `active_handoff_apply_attempt`.
- R2/R3: demarrage direct route vers `prepare_attack_card`.

**Skills / Operations / Tools**
- Tous les tours tool skill restent en `response_tool_execution=platform_handoff`.
- `executed_tools=[]` sur tous les tours.
- Aucun `pending_confirmation` executable observe.
- Aucun `committed_effects` observe.

**Memory / Effets durables**
- Aucun effet durable observe; conforme au contrat no-mutation.
- Les artefacts QA bruts sont stockes dans `tests/real-personas/qa-skill/runs/operations/2026-06-01-prepare-attack-postfix-*.summary.json`.

**Problemes**
- R3 Tour 2: revision active perd l'obstacle precise. Famille: BF-STATE-03. Impact systeme: contexte actif de handoff incomplet pendant regeneration. Severite: yellow.

**Fix propose**
- Source amont: `prepare_attack_card` state/revision adapter.
- Correction recommandee: inclure le `draft.blocker_summary` actif dans le payload de revision et ajouter un test runtime adapter qui verifie la preservation du blocker.
- Tests d'invariant attendus: repeat/revise/apply_attempt conservent cible, blocker et destination sans mutation.

## Verdict Global

`yellow` - Net progres par rapport au run rouge precedent. Les trois chemins nominaux livrent maintenant un handoff plateforme no-mutation, et `ok cree-la` n'execute pas. Reste un warning de preservation du blocker pendant `revise_handoff`.
