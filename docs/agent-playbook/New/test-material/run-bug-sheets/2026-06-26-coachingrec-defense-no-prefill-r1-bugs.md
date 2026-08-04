# Bug Sheet - coachingrec-defense-no-prefill-20260626-r1

## R1-B01

- Bug id: R1-B01
- Tours: 2, 3, 5
- Famille: BF-INTAKE-03 - Contrainte explicite perdue
- Domaine owner: `coaching_recommendation/visible_agents/shared.ts`, `action_plan_coaching`, `no_plan_coaching`
- Source amont: contrat visible defense insuffisant; absence de validation structuree sur les messages qui pre-remplissent les composants/champs de carte de defense.
- Symptome visible: Sophia donne des contenus quasi pre-remplis pour les composants de defense malgre la consigne "pas de sections/champs exacts". T5 produit une liste explicite `moment critique: ...`, `piege observable: ...`, `geste de retour: ...`, `plan B: ...`.
- Preuve systeme: T2 `coaching_type=plan_action`, `visible_decision.lever=defense_card`, `variant=null`, mais message contient "le moment ou ca deraille : apres quelques minutes...", "le piege observable : l'envie d'ouvrir YouTube"; T5 `coaching_type=no_plan_action`, `visible_decision.lever=free_defense_card`, `variant=null`, mais message contient des champs avec valeurs concretes.
- Correction attendue: si `visible_decision.lever=defense_card/free_defense_card`, le visible peut expliquer les types de composants de facon generale mais ne doit jamais produire une liste de champs avec valeurs concretes, ni proposer de formuler les composants pour la carte. La creation/remplissage doit etre clairement renvoye a la plateforme.
- Statut: open
- Fix reference: a faire
- Tests requis: positif in-plan "quoi mettre dans les sections" -> limite produit + explication generale sans valeurs a copier; positif no-plan "redige le contenu exact avec chaque champ" -> refus de pre-remplissage; anti-FP "c'est quoi une carte de defense ?" -> explication informelle des composants autorisee; integration run reel 5t.

## R1-B02

- Bug id: R1-B02
- Tours: 1, 4, 6
- Famille: N/A - verification positive
- Domaine owner: `coaching_recommendation`
- Source amont: routing et selection de levier.
- Symptome visible: aucun bug observe sur le choix de levier ni destination.
- Preuve systeme: T1-T3 `coaching_type=plan_action`, `current_recommendation=defense_card`; T4-T6 `coaching_type=no_plan_action`, `visible_decision.lever=free_defense_card`; destinations Plan/Ressources correctes; aucun direct effect.
- Correction attendue: conserver ce comportement.
- Statut: verified
- Fix reference: changements precedents `ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES`.
- Tests requis: garder les tests contractuels et rerun reel si le routing/visible defense est retouche.
