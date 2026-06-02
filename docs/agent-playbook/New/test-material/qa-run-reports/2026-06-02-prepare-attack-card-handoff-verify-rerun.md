# Prepare Attack Card Handoff Verify Rerun

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `prepare-attack-card-handoff-verify-rerun-20260602`
- Persona: `qa-skill`
- Connexions dediees: `attack_card_handoff_verify_r1_20260602`, `attack_card_handoff_verify_r2_20260602`, `attack_card_handoff_verify_r3_20260602`
- Objectif: relancer le run prepare_attack_card apres correction de preservation du blocker pendant `revise_handoff`, sans faire de correction pendant le run.
- Trajectoire: ambiguite comprendre/preparer puis preparation no-create, demarrage direct avec technique explicite, demarrage direct sans technique puis revision active si handoff livre.
- Surfaces visees: dispatcher, orientation clarification, `prepare_attack_card` intake/generator, active handoff state, renderer, no-mutation.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Aucun correctif n'a ete applique pendant les runs.

## 2. Tours De Conversation

### Run R1 - Ambiguite Puis Preparation

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

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-04 - Executor ou fallback technique fragile

**User**
> Je veux en préparer une pour mon action du matin : ouvrir mon carnet avant le café. Le piège, c’est que je me dis que je regarderai après. Ne la crée pas depuis le chat.

**Sophia**
> Je n'arrive pas à préparer cette carte proprement là. On peut reprendre dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: null
- direct_effects: null
- operation: `failed`
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: apres clarification, le user fournit cible, piege et no-create; Sophia route au bon skill mais retourne une erreur technique au lieu de choisir une technique et livrer le handoff.
- Source amont probable: `prepare_attack_card` AI intake/generator sur le chemin "technique a choisir"; fallback no-mutation incomplet ou sortie IA invalide non recuperee.
- Owner runtime: `prepare_attack_card` intake/generator + runtime adapter.
- Meilleure correction selon les guidelines: rendre le chemin no-create sans technique explicite aussi robuste que le chemin technique explicite, avec recommendation/fallback no-mutation au lieu de `failed`.
- Pourquoi ce n'est pas un patch local: le renderer n'est pas atteint; le probleme est en amont du handoff.

### Run R2 - Demarrage Direct Avec Technique Explicite

#### Tour 1

**Verdict du tour:** green

**User**
> Prépare-moi une carte d’attaque en Ancre visuelle pour poser ma tenue de sport sur la chaise ce soir. Le piège, c’est que je repousse en disant que je verrai demain. Ne la crée pas depuis le chat.

**Sophia**
> Cible/action comprise : Poser ma tenue de sport sur la chaise ce soir
>
> Obstacle ou piège identifié : je repousse en disant que je verrai demain
>
> Technique recommandée : Ancre visuelle
> Pourquoi : L'ancre visuelle transforme une intention floue en un signal physique impossible à ignorer.
>
> Brouillon de carte :
> Le signal du sport
> Demain commence ce soir.
> Mode d'emploi : Pose ta tenue sur la chaise et place ce message bien en vue dessus pour sceller ton choix.
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

### Run R3 - Demarrage Direct Avec Technique A Choisir

#### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-04 - Executor ou fallback technique fragile

**User**
> Prépare-moi une carte d’attaque pour envoyer mon dossier administratif avant 16h. Je bloque parce que je veux que ce soit parfait avant d’appuyer sur envoyer. Ne la crée pas, je veux seulement le brouillon.

**Sophia**
> Je n'arrive pas à préparer cette carte proprement là. On peut reprendre dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: null
- direct_effects: null
- operation: `failed`
- pending_confirmation: null
- memory_plan: null
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: demande directe complete avec cible, blocker et draft_only/no_create, mais sans technique explicite; le skill echoue techniquement au lieu de recommander une technique.
- Source amont probable: meme rupture que R1 Tour 2 sur le chemin "technique a choisir".
- Owner runtime: `prepare_attack_card` intake/generator + fallback no-mutation.
- Meilleure correction selon les guidelines: garantir qu'une demande no-create complete sans technique explicite produit un `platform_handoff` avec technique recommandee, jamais `failed`.
- Pourquoi ce n'est pas un patch local: le contenu visible est le fallback technique, pas le renderer handoff.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- La clarification initiale est naturelle et tutoie.
- Le cas avec technique explicite `Ancre visuelle` produit un handoff complet, utile et no-mutation.
- Aucun tour n'execute d'outil ni ne cree d'effet durable.

**Problemes**
- R1 Tour 2: la continuation apres clarification echoue techniquement. Famille: BF-EFFECT-04. Impact: la conversation s'arrete au moment ou le user fournit exactement les informations demandees. Severite: red.
- R3 Tour 1: le chemin direct sans technique explicite echoue techniquement. Famille: BF-EFFECT-04. Impact: Sophia ne sait pas choisir/recommander une technique dans le cas nominal. Severite: red.
- R3 Tour 2 n'a pas pu etre teste, car aucun handoff actif n'a ete livre en R3 Tour 1.

**Fix propose**
- Source amont: `prepare_attack_card` intake/generator/fallback no-mutation pour les demandes sans technique explicite.
- Correction recommandee: diagnostiquer pourquoi le chemin recommendation de technique tombe en `failed` en runtime reel; ajouter un fallback no-mutation pour les sorties IA invalides quand cible + blocker + no_create sont presents.
- Tests d'invariant attendus: post-clarification no-create et direct no-technique doivent livrer `platform_handoff`, `executed_tools=[]`, pas de pending executable.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- R1 Tour 1: `orientation_clarification` correct.
- R1 Tour 2: resolution de clarification route bien vers `prepare_attack_card`.
- R2/R3: demarrage direct route bien vers `prepare_attack_card`.

**Skills / Operations / Tools**
- R2 livre `response_tool_execution=platform_handoff`.
- R1 Tour 2 et R3 Tour 1 livrent `response_tool_execution=failed`.
- `executed_tools=[]` sur tous les tours.
- Aucun `pending_confirmation` executable observe.
- Aucun `committed_effects` observe.

**Memory / Effets durables**
- Aucun effet durable observe.
- Artefacts QA: `tests/real-personas/qa-skill/runs/operations/2026-06-02-prepare-attack-postfix-*.summary.json`.

**Problemes**
- R1 Tour 2 et R3 Tour 1: le handler est bon mais le skill ne produit pas de handoff sur les cas sans technique explicite. Famille: BF-EFFECT-04. Impact systeme: contrat nominal no-mutation incomplet. Severite: red.

**Fix propose**
- Source amont: `prepare_attack_card` AI intake / draft generator / fallback policy.
- Correction recommandee: exposer le `reason_code/readiness` dans la trace failed, puis corriger le chemin qui transforme "technique a choisir" en erreur technique.
- Tests d'invariant attendus: unitaires + integration locale `/test-send-message force_full_ai=true` sur R1/R3.

## Verdict Global

`red` - Le chemin avec technique explicite reste vert, mais les chemins ou Sophia doit choisir/recommander la technique echouent en runtime reel. Aucun correctif n'a ete fait pendant le run.
