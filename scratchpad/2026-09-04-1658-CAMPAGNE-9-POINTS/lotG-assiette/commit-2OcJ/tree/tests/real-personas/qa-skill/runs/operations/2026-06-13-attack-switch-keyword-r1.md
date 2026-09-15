# QA Run - attack-switch-20260613-r1

> Correction protocole 2026-06-13: ce run R1 est conserve comme trace
> d'erreur de protocole QA. La creation d'une carte d'attaque ne doit pas etre
> exigee depuis la conversation: le chat prepare les champs et renvoie vers la
> plateforme. Le verdict produit final est donne par le rerun plateforme R2:
> `tests/real-personas/qa-skill/runs/operations/2026-06-13-attack-switch-keyword-r2.md`.

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `attack-switch-20260613-r1`
- Persona: `qa-skill` temporaire, email `qa-qa-skill-attack-switch-20260613-r1@example.com`, user id `94b4f5d3-30dd-47c6-a228-9d341cfc9db6`
- Objectif: verifier qu'une carte d'attaque `Mot de bascule` permet d'envoyer le mot seul dans une conversation et declenche un message de soutien immediat.
- Trajectoire: demande de carte d'attaque -> collecte des slots -> tentative de creation -> fixture carte active ciblee -> envoi `URSSAF` dans le meme scope puis dans un scope propre.
- Surfaces visees: `prepare_attack_card`, `user_attack_cards`, detection `attack_keyword_trigger`, routing dispatcher, reponse de soutien.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage` direct.
- Validite QA: invalide pour conclure sur le produit, car le protocole a exige a tort une creation de carte depuis le chat. Les tours IA reels restent exploitables comme diagnostic du handoff, mais pas comme verdict final.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai un vrai point de rupture demain a 9h: je dois ouvrir le dossier URSSAF, mais des que je vois le portail je pars ranger mon bureau. Prepare-moi une carte d'attaque avec un mot de bascule tres court que je pourrai t'envoyer tel quel quand je decroche.

**Sophia**
> On part donc sur un Mot de bascule pour t'aider a rester concentre sur l'ouverture de ton dossier URSSAF. Est-ce que c'est bien la technique que tu veux utiliser ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: aucune carte creee

### Tour 2

**Verdict du tour:** green

**User**
> Oui, c'est bien Mot de bascule. Mets le mot: URSSAF. Je veux que la carte me ramene juste a ouvrir le portail, puis cliquer sur le dossier, rien de plus.

**Sophia**
> Quand tu tiens bon face a l'envie de fuir pour ouvrir ce dossier, qu'est-ce que tu proteges de vraiment important chez toi ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: aucune carte creee

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Je protege ma tranquillite: si je regle ce dossier, je n'aurai plus ce poids en arriere-plan toute la journee.

**Sophia**
> Tout est pret pour ta carte. Rends-toi dans la section Cartes d'attaque pour la finaliser avec ces elements :
>
> Technique : Mot de bascule
> Dans quelle situation precise tu sens que tu vas craquer ou perdre le controle ? : des que je vois le portail URSSAF
> Quand tu tiens bon dans ce moment-la, qu'est-ce que tu proteges de vraiment important chez toi ? : ma tranquillite (ne plus avoir ce poids en arriere-plan toute la journee)
> Mot d'activation : URSSAF
> Objectif : ouvrir le dossier URSSAF (portail puis clic dossier)
>
> Est-ce que tu sais comment y acceder ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: aucune carte creee

**Analyse si yellow/red**
- Symptome: le run attendait une creation chat alors que le contrat produit est un handoff plateforme.
- Source amont probable: protocole QA incorrect.
- Owner runtime: QA, pas runtime produit.
- Meilleure correction selon les guidelines: relancer par la plateforme.
- Pourquoi ce n'est pas un patch local: le produit n'a pas a creer la carte depuis ce flow conversationnel.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Je ne veux pas passer par la section. Cree-la ici avec ces elements. Je confirme: mot URSSAF, situation portail URSSAF, action ouvrir le portail puis cliquer sur le dossier.

**Sophia**
> Je ne peux pas creer ta carte directement ici dans notre discussion. Pour qu'elle soit operationnelle, tu dois la valider dans tes **Cartes d'attaque**. C'est tres rapide : ouvre la section Cartes, choisis Carte d'attaque et reprends le brouillon propose. Utilise ta technique **Mot de bascule** avec le mot-cle **URSSAF**. Ton objectif est d'**ouvrir le dossier URSSAF (portail puis clic dossier)** au lieu de **partir ranger ton bureau des que tu vois le portail**.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: `user_attack_cards=0`

**Analyse si yellow/red**
- Symptome: le run a insiste sur une creation chat qui n'est pas la capacite produit attendue.
- Source amont probable: protocole QA incorrect.
- Owner runtime: QA.
- Meilleure correction selon les guidelines: utiliser la surface plateforme ou les fonctions plateforme utilisees par la surface.
- Pourquoi ce n'est pas un patch local: le comportement visible est coherent avec le contrat produit.

### Setup Fixture

Pour isoler le trigger apres carte active, une fixture DB ciblee a ete creee sur le user temporaire. Cette fixture n'etait pas equivalente a une creation plateforme complete et ne doit pas servir de verdict final:

- cycle actif: `b81b92aa-a31b-48af-87f0-b94fa5cb823c`
- transformation active: `8711acd4-878c-4fce-8562-ddc7dd0fb8bf`
- plan actif: `07f45aea-1a55-4836-b34d-ec4f363fcca9`
- carte active: `feeaf689-cadf-4e05-a3f9-73b3ff2f5602`
- metadata: `qa_run_id=attack-switch-20260613-r1`
- RLS check: le JWT user voit bien `user_cycles=1`, `user_transformations=1`, `user_plans_v2=1`, `user_attack_cards=1`.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> URSSAF

**Sophia**
> C'est exactement ca pour ton mot de bascule URSSAF. Pour que tout soit pret, tu dois maintenant finaliser l'operation dans la section Cartes d'attaque : ouvre la section Cartes, choisis Carte d'attaque et reprends le brouillon propose. Est-ce que tu arrives a y acceder ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: carte active presente, mais pas de soutien declenche

**Analyse si yellow/red**
- Symptome: le mot seul est traite comme continuation du flow de creation, pas comme declencheur de soutien.
- Source amont probable: priorite active flow avant detection `attack_keyword_trigger`.
- Owner runtime: arbitration active flow / `prepare_attack_card.local_dispatcher`.
- Meilleure correction selon les guidelines: faire preempter un exact match `keyword_trigger` par rapport a un ancien flow actif, ou fermer correctement le flow apres handoff/refus.
- Pourquoi ce n'est pas un patch local: le bug est une politique d'interruption/ownership.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> URSSAF

**Sophia**
> On cible l'URSSAF, c'est bien ca ? Dis-moi ce qui te bloque ou te freine le plus quand tu dois t'en occuper.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: carte active presente et visible RLS, mais pas de trace `attack_keyword_trigger_detected`

**Analyse si yellow/red**
- Symptome: dans un scope propre, le mot de bascule exact `URSSAF` est traite comme demande de creation de carte.
- Source amont probable: detection pre-dispatch `loadAttackKeywordMatch` / injection `attackKeywordContextOverride` non effective.
- Owner runtime: `sophia-brain/router/run.ts` + `prepare_attack_card/run_support.ts`.
- Meilleure correction selon les guidelines: ajouter un invariant integration: carte active avec `pre_engagement.generated_result.keyword_trigger.activation_keyword_normalized=urssaf` + message `URSSAF` doit produire `attack_keyword_trigger_detected` et bloquer `prepare_attack_card`.
- Pourquoi ce n'est pas un patch local: il faut corriger le routage avant le dispatcher visible, pas juste modifier la phrase de reponse.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le demarrage du flow comprend l'intention de carte d'attaque et la technique demandee.
- Sophia demande un ancrage de valeur pertinent au tour 2.

**Problemes**
- Tour 3: Sophia collecte les slots puis renvoie vers l'UI sans draft confirmable. Famille: BF-STATE-03. Impact: l'utilisateur a l'impression d'avoir fait le travail mais n'obtient pas la carte.
- Tour 4: confirmation explicite ignoree; aucun effet durable. Famille: BF-EFFECT-02. Impact: impossible d'atteindre "apres creation de carte" par le chemin conversationnel.
- Tour 5: l'ancien flow capture le mot. Famille: BF-ROUTE-02. Impact: le moment de rupture recoit une consigne produit froide.
- Tour 6: meme sans ancien flow, le mot est interprete comme nouvelle creation. Famille: BF-ROUTE-01. Impact: aucun soutien immediat au moment critique.

**Fix propose**
- Source amont: contrat `prepare_attack_card` + pre-dispatch `attack_keyword_trigger`.
- Correction recommandee: aligner la capacite de creation chat et prioriser le trigger exact d'une carte active avant toute interpretation de creation.
- Tests d'invariant attendus: creation/draft/confirmation, exact keyword en scope propre, exact keyword avec ancien flow actif, anti-faux-positif sur message qui contient le mot dans une phrase longue.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1-T4 restent dans `prepare_attack_card`, mais le flow finit en handoff produit et aucun executor ne cree la carte.
- T5 reste capture par `active_prepare_attack_card_local_dispatcher`.
- T6 selectionne `prepare_attack_card` avec `tool_skill_intent_start` au lieu d'activer le contexte de soutien du mot de bascule.

**Skills / Operations / Tools**
- `prepare_attack_card` ne produit aucun `executed_tools` sur la creation demandee.
- La fixture montre que les lignes necessaires existent et sont visibles via RLS.
- Aucune trace `attack_keyword_trigger_detected` n'est presente sur T5/T6.

**Effets durables**
- Creation conversationnelle: `user_attack_cards=0` apres T4.
- Fixture ciblee: `user_attack_cards=1`, status `active`, technique `pre_engagement`, `keyword_trigger.activation_keyword_normalized=urssaf`.
- Nettoyage: connexion temporaire `attack-switch_20260613-r1` supprimee via script QA cible.

**Fix systeme propose**
- Source amont: `loadAttackKeywordMatch` / runtime prefetch / route arbitration.
- Correction recommandee: rendre la detection observable dans la trace courte et faire passer le trigger exact avant les intents `prepare_attack_card`.
- Tests d'invariant attendus: test integration DB + `test-send-message force_full_ai=true`, avec assertion sur route, reponse visible de soutien, et absence de nouveau pending `prepare_attack_card`.

## Verdict Global

`invalid / superseded` - Le protocole R1 etait faux: il exigeait une creation chat. Le verdict final doit etre lu dans R2, ou la carte est creee par les fonctions plateforme et le mot `URSSAF` declenche bien un soutien.

## Artefacts

- State redige: `tmp/attack-switch-20260613-r1/state.json`
- Raw turns: `tmp/attack-switch-20260613-r1/turn-01.raw.json` a `turn-06.raw.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-13-attack-switch-20260613-r1-bugs.md`
