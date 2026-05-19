# QA Test Guidelines

Cette fiche rassemble les consignes transversales importantes pour les runs QA
conversationnels Sophia. Elle complete les fiches specialisees, notamment :

- `01-qa-run-report-structure.md`
- `02-operation-suggestion-qa-test-sheet.md`
- `10-real-persona-connections.md`
- `11-skill-qa-conversation-runs.md`
- `12-daily-weekly-review-qa-test-sheet.md`
- `13-architecture-skills`

## Regles Generales

- Les runs sont locaux par defaut : Supabase local, connexions locales, chemin IA reel local de Sophia.
- Ne pas utiliser staging, remote ou deploy sauf consigne explicite.
- Le mot de passe local attendu pour Alex, Nina, Paul et Rose est `1234567`.
- Si `bash scripts/get-jwt.sh <persona>` echoue parce que `connection.json` n'a pas de `refresh_token` valide ou de `password`, remettre le compte Auth local de la persona sur `1234567`, puis aligner `connection.json` avec ce mot de passe.
- Ne jamais afficher le JWT.
- Ne jamais utiliser un renderer deterministe, un fallback direct `processMessage`, ou un executor appele directement pour fabriquer un succes QA.
- Le chemin IA reel de Sophia doit produire les reponses assistant.
- Pour `POST /functions/v1/test-send-message`, mettre `force_full_ai=true` dans le body. Sans ce flag, le endpoint de test peut desactiver le dispatcher LLM et le run ne teste pas le vrai routage IA.
- A la fin de chaque tour, rétablir ce qui a été changé dans la base de donnée.  / TU AS L'AUTORISATION EXPLICITE DE FAIRE LE RESET DE L'ETAT A LA FIN DU RUN 

## Auth Locale Et JWT

- Le user Auth cree ou retrouve ne suffit pas : verifier separement que le token obtenu par login password est accepte par Auth.
- Chemin recommande :
  1. recuperer le vrai `ANON_KEY` local avec `supabase status --output json` ;
  2. se connecter avec `POST /auth/v1/token?grant_type=password` en utilisant ce `ANON_KEY`, l'email de test et le mot de passe local `1234567` ;
  3. verifier le token avec `GET /auth/v1/user`, headers `apikey: <ANON_KEY>` et `Authorization: Bearer <access_token>` ;
  4. appeler `/functions/v1/test-send-message` avec `apikey: <ANON_KEY>`, `Authorization: Bearer <ANON_KEY>` pour passer le gateway local, et `x-user-authorization: Bearer <access_token>` pour que la fonction identifie le vrai user.
- Ne pas confondre le `SUPABASE_ANON_KEY` de `supabase/.env` avec le vrai `ANON_KEY` local. Dans certains environnements, `.env` contient une cle `sb_publishable_...`; elle peut marcher pour Auth mais etre rejetee par le gateway local des Edge Functions avec `{"msg":"Invalid JWT"}`.
- Si `/auth/v1/user` retourne `200` mais `/functions/v1/...` retourne `401 {"msg":"Invalid JWT"}`, le probleme vient probablement du gateway et de la cle mise dans `Authorization`, pas du mot de passe ni du user.
- Ne jamais mettre le JWT user dans le rapport. Documenter seulement la methode d'obtention, le user id/email de test et le statut des verifications.

## Pilotage Conversationnel

- L'agent QA doit parler avec Sophia tour par tour.
- Chaque message user doit etre choisi apres lecture de la reponse Sophia et de la trace courte utile.
- Ne jamais utiliser une liste fixe de reponses user pre-ecrites comme script ferme.
- Les tours decrits dans les fiches sont des intentions de test, pas des phrases a rejouer mot pour mot.
- Ne pas reprendre mot pour mot une formulation user depuis une fiche, un ancien rapport ou une note de test.
- Il n'y a pas de limite fixe de tours : continuer tant que c'est necessaire pour couvrir clarifications, confirmations, execution et verification DB.
- Si Sophia demande une clarification, repondre au slot manquant.
- Si Sophia demande deja confirmation, confirmer ou corriger selon l'objectif du test.
- Ne pas forcer le tour prevu dans la fiche si l'etat reel de Sophia a bifurque.

## Gestion Des Incidents

- Si un tour echoue, timeoute, renvoie une reponse vide, abort ou erreur HTTP, ne pas remplacer par un fallback.
- Retenter ou reprendre au point d'arret quand c'est possible, puis documenter l'incident.
- Avant un retry ambigu, verifier si possible que le premier essai n'a pas cree d'effet durable ou de message duplique.
- Garder un `run_id` propre par tentative exploitable.
- Ne pas melanger les essais qui ont echoue avant vraie conversation avec le run QA final.
- Si le probleme persiste apres plusieurs tentatives raisonnables, arreter avec un verdict `red` et documenter le blocage.

## Rapport QA

- Chaque rapport doit suivre `01-qa-run-report-structure.md`.
- Le rapport doit inclure : contexte du test, tours exacts, analyse de fluidite humaine, analyse systeme, verdict global.
- Le transcript doit etre exact ou suffisamment complet pour juger la qualite.
- Ne pas produire un rapport base seulement sur un `trace_id`, un resume ou une sortie partielle.
- Inclure les tours rates, vides, aborted ou en erreur.
- Ne pas noyer le rapport avec le JSON complet si une trace courte suffit.
- Verdicts :
  - `green` : conversation et systeme alignes.
  - `yellow` : logique globale bonne mais friction UX, metadata incomplete, confirmation maladroite ou trace insuffisante.
  - `red` : mauvais routage, mauvais effet durable, confirmation ratee, safety ratee ou run techniquement invalide.

## Verifications Systeme

- Verifier la trace et la DB apres chaque run.
- Le handler correct ne suffit pas : l'effet durable doit etre correct.
- Aucun executor ne doit etre appele directement depuis un skill conversationnel.
- Aucune operation engageante ne doit etre appliquee sans confirmation quand le flow l'exige.
- Les side effects doivent etre bloques pendant un signal safety actif.
- Si le probleme est systeme, corriger le code avant de conclure `green`.

## Organisation Des Variantes

- Le scenario initial d'un test global est toujours `N.1`.
- Les tests complementaires deviennent `N.2`, `N.3`, etc.
- Ne pas creer un nouveau test global pour une variation du meme objectif.
- Ne pas relancer exactement le meme scenario avec les memes mots.
- Varier le ton, le niveau d'implicite, la temporalite ou la cible.
- Garder le meme objectif QA.
- Documenter ce qui a change entre `N.1` et la nouvelle variante.

## Daily / Weekly

- Ne jamais hardcoder de `user_id`, `plan_id`, `plan_item_id`, `occurrence_id`, date, titre d'action, pending id, numero WhatsApp, scheduled checkin id ou message Sophia dans un runner QA.
- Les runners doivent decouvrir les valeurs depuis `connection.json`, Supabase local, le pending, le scheduled checkin ou les payloads generes par le systeme.
- Si aucun daily n'est disponible, une fixture peut etre generee uniquement dynamiquement, depuis le schema et le contexte courant.
- Pour Paul et Rose, si `current-plan.md` est incomplet, faire un grounding DB avant le run et documenter les IDs/dates utilises.
- Daily : verifier `chat_capability=daily_action_review`, `review_state`, entries `daily_action_review_v1`, `reason_category`, `reschedule_decision`, statut occurrence, et absence de report interdit.
- Weekly : aucun patch de plan ne doit etre applique sans confirmation explicite.
- Weekly : verifier `plan_patch.requires_confirmation=true`.
- Weekly : Sophia ne doit pas refaire tout le bilan action par action si les causes sont deja disponibles dans les daily.
- Les supports sont hors scope des decisions weekly.

## Operation Suggestions Et Tool Skills

- Pour les cartes d'attaque, ne pas forcer une technique par mot-cle.
- Verifier que la technique proposee correspond a la nature de l'action.
- `Mot de bascule` convient surtout quand le user risque de craquer, abandonner, esquiver ou a besoin d'un mot court dans une fenetre de rupture.
- Une action de reperage ou regulation peut appeler une autre technique ou une carte de defense.
- Pour les cartes de defense, identifier le moment precis ou ca craque et le piege concret qui embarque le user.
- Si le wording user force une technique incoherente, Sophia doit garder un doute, expliquer simplement la difference et proposer les options les plus proches.
- Les tool skills doivent respecter `13-architecture-skills` : comprehension par JSON IA, garde-fous deterministes legitimes, routing deterministe depuis sorties structurees.

## Connexions Et Isolation

- Utiliser un `connection.json` local par persona.
- Ne jamais commit `connection.json` ou `connections/*.json`.
- Ne pas utiliser `connection.example.json` pour un run reel.
- Le user Auth doit etre marque `is_test_persona = true`.
- Pour les probes longs, transversaux ou paralleles, utiliser une connexion temporaire par run.
- Une connexion temporaire evite les collisions dans les traces, la memoire et `user_chat_states.temp_memory`.
