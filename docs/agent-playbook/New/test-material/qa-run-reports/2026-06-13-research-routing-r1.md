# QA Run — research-routing-r1

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `qa-research-routing-20260613-r1`
- Persona: `qa-skill`, connexion temporaire `all_skills_researchqa0613r1`
- Objectif: verifier qu'un `needs_research=true` produit par le dispatcher IA lance la recherche, injecte les infos dans le contexte, puis force `normal_reply`.
- Trajectoire: demande factuelle fraiche sur modeles OpenAI -> reponse normale fondee sur recherche -> follow-up sans nouvelle recherche.
- Surfaces visees: dispatcher global, `needs_research`, router global, recherche Gemini grounding, prompt companion, metadata `router_decision_v2`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Incident pre-run: un premier runner Node local a echoue avant tout appel HTTP Sophia (`await` hors module), puis le tour a ete relance proprement. Connexion QA reset avant et apres run.
- Artefacts: `tmp/qa-research-routing-20260613-r1/turn1.raw.json`, `turn2.raw.json`, `db_after_turn1.json`, `db_after_turn2.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** a classifier — fuite renderer/final-response comment

**User**
> Je dois choisir une API IA pour un petit outil interne. Peux-tu vérifier les infos récentes sur le modèle OpenAI le plus économique pour générer du texte court, et me dire quoi regarder en priorité ?

**Sophia**
> OK — pour du texte court “en masse” (ex: résumés très courts, routage, extraction légère), le modèle OpenAI le plus économique à regarder en priorité (d’après les infos récentes) est : GPT-5.4 Nano ✅🙂
>
> Ce qu’il faut regarder en priorité avant de décider :
> 1) Le coût input/output par million de tokens
> - GPT-5.4 Nano est positionné pour générer du texte court à bas coût (souvent le meilleur choix quand tes sorties sont petites).
> 2) La taille des sorties réelles (c’est souvent là que le budget explose)
> - Si tes réponses font plus que “court”, le rapport coût/qualité peut changer.
> 3) Le besoin de raisonnement vs simple génération
> - Si ton outil fait juste de l’extraction/tri/formatage, Nano est typiquement suffisant.
> - Si tu as des tâches plus “raisonnement”, tu devras peut-être monter en gamme (même si ça coûte plus).
> 4) Le caching / réutilisation de contexte (si ton outil en a)
> - Si une partie de ton prompt est identique d’une requête à l’autre, tu peux réduire fortement le coût.
> 5) Le type de texte court
> - “Routage + classification” ≠ “rédaction fluide” : ça influence le bon modèle.
>
> Si tu me dis en 1 phrase le type exact de texte court que ton outil produit (ex: “classification en 3 labels”, “extraction de champs”, “réécriture en 1 phrase”), je te dis lequel de Nano/Mini est le plus logique pour ton cas. 💡
>
> `<!--fil_rouge_whatsapp: Modèle économique recommandé: GPT-5.4 Nano pour texte court; vérifier coûts input/output, taille de sortie, besoin de raisonnement et usage possible du caching; prochaine étape: préciser le type de sortie du tool.-->`

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `needs_research_forces_normal_reply`
- safety: `NONE`, risk_score 2
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`, `context_need=minimal`
- executed_tools: []
- durable_effect: assistant message persisted
- research: `research_requested=true`, `research_executed=true`, `research_query="OpenAI most economical model for short text generation June 2026"`, `research_sources_count=2`
- dispatcher signal: `turn_frame.needs_research.value=true`, `confidence=0.9`, `domain_hint=software`

**Analyse si yellow/red**
- Symptome: la reponse utilisateur contient un commentaire interne `<!--fil_rouge_whatsapp: ...-->`.
- Source amont probable: rendu final / companion output sanitation, pas le dispatcher research.
- Owner runtime: final response renderer / WhatsApp-visible response sanitation.
- Meilleure correction selon les guidelines: filtrer ou convertir les marqueurs internes avant persistance/envoi, avec test d'invariant sur toute reponse utilisateur visible.
- Pourquoi ce n'est pas un patch local: le leak peut toucher plusieurs skills/owners; il faut un garde-fou final-response transversal.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** a classifier — fuite renderer/final-response comment

**User**
> Ok, mon cas c’est surtout classer des tickets internes en trois catégories et générer une phrase courte. Choisis entre Nano et Mini, sans refaire toute la recherche.

**Sophia**
> Go Nano ✅🙂 (pour du classement + génération de phrases courtes, tu seras surtout gagnant en coût/volume).
>
> Avant de valider : tes tickets font plutôt des textes courts (1-3 phrases) ou des longs (plusieurs paragraphes) ?
>
> `<!--fil_rouge_whatsapp: Tu fais un outil de tri en 3 catégories + phrase courte; recommandation immédiate: Nano pour optimiser le coût. Prochaine étape: confirmer la longueur moyenne des tickets pour ajuster éventuellement vers Mini si c’est long.-->`

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `NONE`, risk_score 0
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: minimal
- executed_tools: []
- durable_effect: assistant message persisted
- research: `research_requested=false`, `research_executed=false`, `research_sources_count=0`
- dispatcher signal: `turn_frame.needs_research.value=false`, `confidence=0`

**Analyse si yellow/red**
- Symptome: meme fuite du commentaire interne dans la reponse visible.
- Source amont probable: rendu final / sanitation.
- Owner runtime: final response renderer.
- Meilleure correction selon les guidelines: sanitation transversale des marqueurs internes avant stockage et retour API.
- Pourquoi ce n'est pas un patch local: le marqueur n'est pas propre au scenario research; il doit etre bloque comme invariant global.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia repond directement au besoin humain: elle recommande un modele et liste des criteres utiles.
- Le second tour suit naturellement la precision de l'utilisateur et ne relance pas inutilement une recherche.
- Les questions de follow-up sont courtes et pertinentes.

**Problemes**
- Tours 1-2: commentaire interne `fil_rouge_whatsapp` expose dans le contenu visible. Famille: a classifier — renderer/final-response comment leak. Impact: la reponse parait technique/interne et casse l'experience utilisateur. Severite: yellow.

**Fix propose**
- Source amont: final response renderer / sanitation pipeline.
- Correction recommandee: supprimer ou transformer tout bloc `<!--fil_rouge_whatsapp: ...-->` avant persistance et retour API utilisateur.
- Tests d'invariant attendus: toute reponse visible ne contient pas `<!--`, `fil_rouge_whatsapp`, ni marqueur interne equivalent, pour normal_reply et conversation skills.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: le dispatcher IA a produit `needs_research.value=true`, `confidence=0.9`, query autonome et `domain_hint=software`.
- Tour 1: le router a applique `needs_research_forces_normal_reply`, donc pas de tool skill ni skill conversationnel parasite.
- Tour 2: `needs_research=false`, routing `normal_reply_default`, ce qui correspond au follow-up sans nouvelle recherche.

**Skills / Operations / Tools**
- Aucune operation/tool skill declenchee.
- Aucun pending confirmation cree.
- Aucun direct effect execute.

**Memory / Effets durables**
- Les messages user/assistant ont ete persistes pendant le run puis la connexion QA temporaire a ete reset apres capture des artefacts.
- Metadata assistant T1 confirme `research_requested=true`, `research_executed=true`, `research_sources_count=2`.
- Metadata assistant T2 confirme `research_requested=false`, `research_executed=false`.

**Problemes**
- Aucun probleme systeme observe sur le routing research.
- Warning hors routing: fuite de commentaire interne dans la reponse visible, documentee dans la fluidite.

**Fix propose**
- Source amont: renderer/sanitation final-response.
- Correction recommandee: garde-fou global de sortie visible.
- Tests d'invariant attendus: test integration `test-send-message` verifiant absence de commentaire interne dans `response.content`.

## Verdict Global

`yellow` — Le comportement research/routing cible est valide et fonctionne en IA reelle locale. Le run reste jaune uniquement a cause d'une fuite de commentaire interne visible dans les reponses Sophia.
