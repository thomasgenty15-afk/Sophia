# Run Bug Sheet - product-help-local-flow-r6

## Bug PH-R6-01

- Famille: `BF-INTAKE-02` - Extraction trop large ou polluee
- Statut: open
- Severite: yellow
- Tours: T2
- Owner: `adjust_plan_item`
- Source amont probable: `adjust_plan_item.local_dispatcher` / `adjust_plan_item.visible.plan_handoff_ready`
- Symptome: apres handoff Product Help -> `adjust_plan_item`, Sophia propose "Trier les factures du mois" alors que le user a seulement dit que "Ranger mes papiers administratifs" est trop vague.
- Impact utilisateur: Sophia ajoute un detail non fourni; l'utilisateur doit corriger la proposition avant de pouvoir continuer.
- Fix contractuel recommande: si le handoff contient une action vague sans details concrets, demander une precision ou produire une proposition neutre sans exemple specifique invente.
- Tests attendus: run Product Help -> Adjust Plan avec action vague; verifier `selected_handler=adjust_plan_item`, pas de Carte d'attaque, pas d'effet durable, et pas de contenu concret absent du message/DB dans `visible_task.conversation_context` ou la reponse visible.
- Notes: Product Help a correctement transmis le handoff; le bug n'est pas un probleme de routing Product Help.
