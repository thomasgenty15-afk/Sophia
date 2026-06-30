# Bug Sheet - coachingrec-novice-vague-20260619-r1

## R1-B01

- Bug id: R1-B01
- Tours: 2, 4
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: visible agent `action_plan_coaching` / contexte local de follow-up; la sous-intention explicative ou comparative du dernier message n'est pas assez priorisee.
- Symptome visible:
  - T2: le user demande "c'est quoi une carte d'attaque" et "Préparer le terrain", Sophia repete la recommandation et ajoute la destination Plan.
  - T4: le user demande la difference defense/potion, Sophia ignore defense/potion et boucle sur carte d'attaque + navigation.
- Preuve systeme:
  - T2/T4: `response_owner=coaching_recommendation`, `visible_task=action_plan_coaching`, `coaching_type=plan_action`.
  - L'ownership est correct; le probleme est la selection de sous-reponse visible.
- Correction attendue: quand le dernier user demande "c'est quoi", "je connais pas", "difference", "comment je sais que ce n'est pas X", l'agent action doit expliquer le concept ou comparer les leviers avant de revenir a la recommandation.
- Statut: open
- Fix reference: none
- Tests requis:
  - action_plan active + question "c'est quoi carte d'attaque ?" -> reponse definit carte d'attaque + technique.
  - action_plan active + question "defense ou potion ?" -> reponse compare attaque/defense/potion et justifie pourquoi attaque reste prioritaire.

## R1-B02

- Bug id: R1-B02
- Tours: 7
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: reducer/local dispatcher conserve l'ancien `action_context` plan alors que le dernier message introduit explicitement une action hors plan.
- Symptome visible: le user dit "mail perso qui n'est pas dans mon Plan Sophia"; Sophia repond quand meme sur `Préparer le dossier mutuelle` dans `Dashboard > Plan`.
- Preuve systeme:
  - T7: `response_owner=coaching_recommendation`, `visible_task=action_plan_coaching`, `coaching_type=plan_action`.
  - T7 state: `action_context.action_title=Préparer le dossier mutuelle`, `plan_item_id=c78463bc-9446-4a10-8b70-ddc23cbf01f1`.
  - T7 user message contient explicitement `mail perso` et `n'est pas dans mon Plan Sophia`.
- Correction attendue: une action explicitement hors plan doit invalider l'ancien plan action context et passer en `no_plan_coaching`, ou demander une confirmation ciblee seulement si le signal est faible.
- Statut: open
- Fix reference: none
- Tests requis:
  - action_plan active -> user dit "autre exemple, action pas dans mon plan" -> `coaching_type=no_plan_action`, `visible_task=no_plan_coaching`, destination Ressources/cartes libres.
  - Verifier que l'ancien `plan_item_id` n'est pas conserve dans `difficulty` ni `dispatcher_signal_context`.

## R1-B03

- Bug id: R1-B03
- Tours: 6
- Famille: BF-TEST-01 - Trace/test incoherent ou suite malsaine
- Domaine owner: runtime local / edge function QA
- Source amont: incident HTTP local non isole.
- Symptome visible: `http_status=502`, reponse assistant vide.
- Preuve systeme:
  - T6 trace courte vide: `response_owner=null`, `selected_handler=null`, `selected_skill_id=null`.
  - Aucun effet durable observe.
- Correction attendue: analyser logs runtime si le 502 se reproduit; ne pas masquer par fallback.
- Statut: open
- Fix reference: none
- Tests requis: rerun du tour de transition hors plan apres correction R1-B02; documenter si 502 recurrent ou incident ponctuel.
