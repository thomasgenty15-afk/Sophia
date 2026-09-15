# QA Run Report - Weekly Server-Owned Full R1

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `weekly-server-owned-full-r1`
- Persona: Rose
- Objectif: verifier en IA reelle locale que le weekly stateful tient un run complet apres le durcissement server-owned: gates, detour defense card, retour parent, synthese, cloture, plan_patch non applique.
- Trajectoire: weekly actif prepare par runner -> bilan actions -> ressenti objectif global -> detour `prepare_defense_card` -> retour weekly -> synthese -> cloture.
- Surfaces visees: `weekly_adaptive_review_v1`, `prepare_defense_card`, local dispatcher, reducer weekly, `active_skill_state`, suspended parent flow, platform handoff, trace `state_mutation_audit`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. Cleanup cible OK: `remaining_scope_messages=0`.

Artefacts:
- Raw: `tests/real-personas/rose/runs/weekly/2026-06-15-weekly-local-dispatcher-weekly-server-owned-full-r1.raw.json`
- Summary: `tests/real-personas/rose/runs/weekly/2026-06-15-weekly-local-dispatcher-weekly-server-owned-full-r1.summary.json`
- Durable: `tests/real-personas/rose/runs/weekly/2026-06-15-weekly-local-dispatcher-weekly-server-owned-full-r1.durable.json`
- Cleanup: `tests/real-personas/rose/runs/weekly/2026-06-15-weekly-local-dispatcher-weekly-server-owned-full-r1.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Franchement la semaine a ete inegale. J'ai range le materiel trois jours, puis jeudi et vendredi j'ai relache. Le soir, la fatigue me fait perdre le fil.

**Sophia**
> Je note que la fatigue a pese sur tes actions en fin de semaine. Malgre ces resultats en demi-teinte, as-tu le sentiment d'avoir tout de meme progresse vers ton objectif global de liberation du cannabis ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- operation: `answered`, `flow_action=confirm_weekly_diagnostic`, `visible_task=ask_global_progress_feeling`
- durable_effect: aucun, `committed_effects=[]`
- audit: present, `validation_unlock_status` preserve, `plan_patch.requires_confirmation` applique/preserve.

### Tour 2

**Verdict du tour:** green

**User**
> Oui un peu, parce que je vois mieux le moment critique du soir. Mais je suis aussi decue : des que je rentre vide, le sas sans fumer saute.

**Sophia**
> Je suis convaincue que reperer ce moment precis du retour au calme est une etape cle. Pour t'aider a proteger ce sas de decompression malgre la fatigue, je te propose de preparer une carte de defense. Cela servira notre bilan et on reprendra le fil du point hebdo juste apres. Est-ce que tu veux explorer cette piste avec moi ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- operation: `answered`, `visible_task=qualify_solution_fit`
- detour_candidate: `defense_card`, target `Faire un sas de decompression (sans fumer)`, readiness `explore_fit`, `user_consent=false`
- durable_effect: aucun

### Tour 3

**Verdict du tour:** green

**User**
> Oui, je veux explorer la carte de defense pour le moment ou je rentre epuisee le soir, surtout pour proteger le sas de decompression.

**Sophia**
> Je comprends bien cette sensation d'epuisement qui te fait perdre le fil en fin de journee. Quel est le tout premier signal, une pensee ou un ressenti physique, qui t'indique que ton sas de decompression est menace ?

**Trace courte**
- selected_handler: `prepare_defense_card`
- route_reason: `weekly_adaptive_review_v1_handoff_to_prepare_defense_card`
- operation: `collecting`, `reason_code=prepare_defense_card_local_collecting`
- durable_effect: aucun

### Tour 4

**Verdict du tour:** green

**User**
> Le premier signal c'est quand je pose mon sac et que je me dis 'je n'ai plus aucune energie'. La je cherche juste le raccourci le plus facile.

**Sophia**
> Je comprends, c'est le moment ou l'on a juste envie de lacher prise. Qu'est-ce que tu voudrais que cette parade t'aide a interrompre ou a preserver en priorite quand tu poses ton sac et que tu te sens videe ?

**Trace courte**
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- operation: `collecting`
- durable_effect: aucun

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs:** `BF-EFFECT-03` - Payload durable faux/incomplet

**User**
> Je veux interrompre le geste automatique d'aller chercher de quoi fumer, et preserver les dix premieres minutes : poser le sac, boire un verre d'eau, aller direct sous la douche.

**Sophia**
> C'est une excellente parade pour proteger tes premieres minutes de retour et eviter le geste automatique. Voici les elements que nous avons prepares ensemble. Tu peux maintenant les recopier pour creer ta carte dans l'action concernee du Plan, section Cartes de defense (la carte n'est pas creee directement depuis notre echange) : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : Quand je rentre le soir, que je pose mon sac et que je me sens videe de toute energie. Contexte : Le moment ou la fatigue fait perdre le fil et menace le sas de decompression. Action : proteger le sas de decompression

**Trace courte**
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- operation: `handoff_delivered`, `reason_code=platform_handoff_delivered`
- platform_handoff: `prepare_defense_card`, `executable_from_chat=false`
- committed_effects: `[]`
- prepared_fields: `risk_context`, `defense_action=proteger le sas de decompression`, `ritual_phrase=null`
- durable_effect: pas de creation DB; handoff plateforme uniquement.

**Analyse si yellow**
- Symptome: les actions concretes donnees par Rose (`poser le sac`, `boire un verre d'eau`, `aller direct sous la douche`) ne sont pas reprises dans `prepared_fields`; le payload garde seulement une action generique.
- Source amont probable: reducer/intake `prepare_defense_card`, compilation du payload de handoff.
- Owner runtime: `prepare_defense_card`.
- Meilleure correction selon guidelines: conserver la sequence de parade utilisateur dans un champ structure de la carte defense, sans creer la carte depuis le chat.
- Pourquoi ce n'est pas un patch local: le weekly a bien route et suspendu/repris; la perte arrive dans le child flow qui compile le handoff.

### Tour 6

**Verdict du tour:** green

**User**
> Ok c'est clair. On peut revenir au point weekly et conclure avec ca en tete.

**Sophia**
> Je suis prete a reprendre notre point hebdomadaire. Les elements pour ta carte de defense ont ete prepares pour que tu puisses les saisir dans ton Plan sur la plateforme. Est-ce qu'on passe a la synthese de ta semaine pour conclure ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- operation: `answered`, `visible_task=return_from_child_flow`
- blocked_effects: `weekly_review_gate_order_requires_return_from_child_flow`
- child_flow: restaure, result `platform_handoff_delivered`, `result_details.return_acknowledged=true`
- durable_effect: aucun commit.

### Tour 7

**Verdict du tour:** green

**User**
> Oui, fais-moi la synthese. Je veux garder l'idee que j'ai progresse un peu, mais que le soir reste le vrai point fragile.

**Sophia**
> Cette semaine a ete marquee par la fatigue. Le rangement du materiel et le travail sur le joint reflexe sont restes partiels, et le sas de decompression n'a pas pu etre mis en place. Malgre ces freins, tu notes une legere progression, meme si le soir reste fragile. J'ai prepare les elements d'une carte de defense pour ton sas : tu pourras les reprendre pour creer la carte dans ton Plan sur la plateforme. Est-ce qu'on cloture cette semaine ainsi ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- operation: `answered`, `visible_task=weekly_synthesis`
- committed_effects: `[]`
- audit: gates/synthesis progresses, `plan_patch.requires_confirmation` preserve.

### Tour 8

**Verdict du tour:** green

**User**
> Oui, on cloture comme ca.

**Sophia**
> C'est entendu. J'ai prepare les elements pour ta carte de defense afin que tu puisses les saisir dans ton Plan. Malgre la fatigue, tu as tout de meme progresse cette semaine. Je suis contente de voir que tu gardes le cap. Notre point hebdomadaire est maintenant termine.

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- operation: `closed`, `visible_task=weekly_closure`
- validation_unlock: `available`
- final weekly state: `status=completed`, `stage=closing`
- `plan_patch.requires_confirmation=true`
- `child_flow.result_details.committed_effect_count=0`
- durable_effect: aucun effet engageant cree depuis le chat.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le weekly garde une trajectoire claire: bilan action -> ressenti objectif global -> detour defense utile -> retour -> synthese -> cloture.
- Sophia ne transforme pas une semaine partielle en reussite pleine.
- Le detour defense est propose avant lancement, puis revient au weekly.
- La cloture est claire.

**Problemes**
- Tour 5: la sequence concrete de defense donnee par Rose est trop compressee dans le handoff. Famille: `BF-EFFECT-03`. Impact: la carte creee manuellement depuis la plateforme risque d'etre moins utile que la parade exprimee par le user. Severite: yellow.

**Fix propose**
- Source amont: `prepare_defense_card` reducer/intake, payload `prepared_fields`.
- Correction recommandee: ajouter/preserver un champ de sequence defensive ou action concrète, par exemple `defense_steps`, qui garde `poser le sac -> boire eau -> douche`, et l'inclure dans `card_draft_summary`.
- Tests d'invariant attendus: user donne une sequence de defense en plusieurs gestes -> handoff garde chaque geste; anti-FP: ne pas inventer de gestes si le user donne seulement un objectif general.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1-T2: `weekly_adaptive_review_v1` conserve l'ownership, global dispatcher non utilise.
- T3: handoff local correct vers `prepare_defense_card`.
- T6-T8: parent weekly restaure puis cloture.

**Skills / Operations / Tools**
- `prepare_defense_card` collecte avant livraison.
- Handoff plateforme livre, `executable_from_chat=false`.
- Aucun executor durable n'est appele directement.

**Memory / Effets durables**
- `committed_effects=[]` tous les tours.
- `plan_patch.requires_confirmation=true` dans le durable final.
- `validation_unlock.status=available` uniquement apres cloture.
- `child_flow.result_details` contient le retour child, sans remplacer la weekly state.
- Cleanup: scope QA supprime, `remaining_scope_messages=0`.

**Problemes**
- Tour 5: payload de handoff defense incomplet. Famille: `BF-EFFECT-03`. Impact systeme: handoff valide mais moins fidele au contenu user. Severite: yellow.

**Fix propose**
- Source amont: `prepare_defense_card` payload compiler.
- Correction recommandee: enrichir le contrat de sortie/handoff defense pour inclure la sequence concrete et la rendre visible dans la recommandation plateforme.
- Tests d'invariant attendus: un test reducer + un mini-run QA defense card avec sequence utilisateur.

## Verdict Global

- Verdict: yellow
- Raison principale: le flow weekly server-owned fonctionne bien de bout en bout, mais le child flow `prepare_defense_card` perd une partie concrete du payload utilisateur au moment du handoff.
- Follow-up prioritaire: corriger `prepare_defense_card` pour conserver les gestes concrets de defense dans `prepared_fields`/`card_draft_summary`, puis rerun un detour defense cible.
