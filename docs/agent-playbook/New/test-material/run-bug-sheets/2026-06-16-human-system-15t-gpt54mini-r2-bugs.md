# Bug Sheet — Human/System 15T GPT 5.4 Mini R2

Run: `qa-human-system-15t-gpt54mini-20260616-r2`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-16-human-system-15t-gpt54mini-r2.md`  
Statut global: `open`

## R2-B01 — Emotional repair garde l'ownership apres demande d'action

- Tours: T3, T4
- Famille: `BF-ROUTE-02` — Ancien flow capture une nouvelle intention
- Domaine owner: `emotional_repair`
- Source amont: local dispatcher / lifecycle policy / active skill ownership
- Symptome visible: le user demande "le prochain geste raisonnable"; Sophia repete le de-shame au lieu de donner l'action. Au tour suivant, elle donne l'action mais reste encore sous owner `emotional_repair`.
- Preuve systeme:
  - T3 `response_owner=conversation_handler`
  - T3 `selected_handler=emotional_repair`
  - T3 `route_reason=active_emotional_repair_local_dispatcher`
  - T4 meme owner/handler malgre "je ne veux plus analyser l'emotion"
- Correction attendue:
  - Le dispatcher local d'`emotional_repair` doit emettre un signal structure d'exit/handoff quand le user demande explicitement une action concrete ou refuse de continuer l'analyse emotionnelle.
  - Le visible agent peut ensuite repondre action concrete via normal reply ou handoff explicite, sans rester proprietaire du tour.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: self-shame fort -> entree emotional repair.
  - Exit: "prochain geste raisonnable" -> sortie/handoff et reponse action.
  - Exit explicite: "je ne veux plus analyser l'emotion" -> pas d'ownership emotional repair.
  - Anti-faux-positif: user continue a parler de honte/souffrance -> emotional repair peut continuer.

## R2-B02 — Status recap nie puis liste les effets existants

- Tours: T7
- Famille: `BF-STATUS-02` — Historique incomplet / rendu contradictoire
- Domaine owner: `status_recap`
- Source amont: projection/restitution `status_recap.visible.recent_effects`
- Symptome visible: Sophia dit "Je ne vois aucun effet recent commis pendant cet echange", puis liste un rappel pending et des preferences coach.
- Preuve systeme:
  - T7 `selected_handler=status_recap`
  - DB: `scheduled_checkins=1`
  - T6 preference update confirmee visiblement
- Correction attendue:
  - Si des objets actifs existent dans le perimetre demande, commencer par "Créé/noté: ..." ou equivalent.
  - Ne jamais utiliser une phrase negative globale quand la suite va enumerer des effets actifs.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Rappel + preference -> recap factuel sans contradiction.
  - Aucun effet -> phrase negative autorisee.
  - Effets hors perimetre -> ne restituer que le perimetre demande.

## R2-B03 — Preference "moins de questions" appliquee partiellement

- Tours: T8
- Famille: `BF-PREF-01` — Preference non appliquee runtime
- Domaine owner: `normal_reply`
- Source amont: preference runtime policy / companion prompt context / question rhythm
- Symptome visible: apres "moins de questions a la fin", Sophia termine une reformulation simple par "Si tu veux, je peux..."
- Preuve systeme:
  - T6 `update_coach_preferences` explicit high
  - T8 `response_owner=normal_reply`
  - T8 question/proposition optionnelle non necessaire
- Correction attendue:
  - Quand `question_tendency=low`, normal reply doit eviter les questions/propositions finales optionnelles si la demande est complete.
  - Les questions restent possibles seulement si une info manque vraiment ou si le user demande des variantes.
- Statut: `open`
- Fix reference: autre agent en cours selon discussion utilisateur
- Tests requis:
  - Preference fewer questions -> reformulation simple sans question finale.
  - Info manquante -> question autorisee.
  - Preference neutre -> proposition de variante autorisee.

## R2-B04 — Grignotage/envie route vers prepare_attack_card

- Tours: T12
- Famille: `BF-ROUTE-01` — Mauvais owner selectionne
- Domaine owner: dispatcher/tool skill arbitration
- Source amont: classification semantique tool skill intent
- Symptome visible: demande "carte courte si l'envie revient apres le diner" selectionne `prepare_attack_card`.
- Preuve systeme:
  - T12 `selected_handler=prepare_attack_card`
  - T12 `tool_skill_intents[0].operation_type=prepare_attack_card`
  - Domaine user: envie de grignoter / prevention de craquage
- Correction attendue:
  - Les cas "envie revient", "grignoter sans faim", "apres diner", "risque de craquer" doivent preferer une carte de defense/prevention sauf demande explicite d'une carte d'attaque ou d'une action proactive.
  - Garder le choix par comprehension semantique structuree, pas par regex.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Grignotage sans faim + demande carte -> defense/prevention.
  - Action proactive "preparer mon environnement avant le diner" -> attack card possible.
  - Refus carte -> normal reply.

## R2-B05 — Carte courte: slot fourni mais redemande

- Tours: T13
- Famille: `BF-INTAKE-01` — Slot fourni mais redemande
- Domaine owner: `prepare_attack_card`
- Source amont: local flow intake / slot filler / compact draft policy
- Symptome visible: le user confirme la technique et donne une phrase exploitable; Sophia redemande "Qu'est-ce qui te fait derailler..."
- Preuve systeme:
  - T13 `selected_handler=prepare_attack_card`
  - T13 `route_reason=active_prepare_attack_card_local_dispatcher`
  - User fournit: technique `mot de bascule`, contexte `ce soir/apres diner`, phrase/action `the, quitter cuisine, revenir canape`
- Correction attendue:
  - Si technique + moment/contexte + phrase/action cible sont fournis, passer a brouillon court ou validation finale.
  - Ne poser une clarification que si l'information manquante bloque vraiment la carte.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Carte courte + phrase fournie -> brouillon ou validation.
  - Carte longue/ambigue sans phrase -> clarification autorisee.
  - User dit "pas trois questions" -> mode compact obligatoire.
