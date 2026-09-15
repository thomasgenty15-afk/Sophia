# Bug Sheet - coachingrec-attack-technique-20260624-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: 5
- Famille: `BF-INTAKE-06` - Mauvais domaine semantique
- Domaine owner: `coaching_recommendation`
- Source amont: post-traitement visible `completeAttackCardTechnique`
- Symptome visible: Sophia repete deux fois la recommandation: `Je partirais sur une carte d'attaque, technique Le texte magique : Je partirais sur une carte d’attaque libre, technique texte magique...`
- Preuve systeme: T5 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`, `last_visible_decision.variant=texte_magique`; reponse visible dupliquee.
- Correction attendue: rendre la detection de technique deja nommee idempotente avec des aliases canoniques (`texte magique`, `Le texte magique`, `technique texte magique`) afin que le garde n'ajoute pas de prefixe quand la technique est deja visible.
- Statut: `open`
- Fix reference: a venir
- Tests requis: pas de prefixe si le visible agent dit `technique texte magique`; prefixe ajoute si aucune technique n'est presente; pas d'ecrasement si visible agent choisit defense_card.
