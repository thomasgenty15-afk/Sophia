# QA Run Report - flow_opportunity_verification Local Real R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Cadre: Supabase local, endpoint `POST /functions/v1/test-send-message`
- Mode IA: `force_full_ai=true`, `disable_debounce=true`
- Persona: connexions temporaires `qa-skill`, scopes isoles par run
- Contraintes respectees: aucun `supabase db reset`, aucun restart/stop Supabase, aucune correction de code applicatif pendant le run
- Cleanup: connexions temporaires r1/r2/r3/r4 supprimees via `scripts/qa-cleanup-run-connection.sh` apres sauvegarde des artefacts
- Artefacts bruts:
  - `tests/real-personas/qa-skill/runs/flow_opportunity_verification/flow-opportunity-verification-r1-20260608.raw.json`
  - `tests/real-personas/qa-skill/runs/flow_opportunity_verification/flow-opportunity-verification-r2-20260608.raw.json`
  - `tests/real-personas/qa-skill/runs/flow_opportunity_verification/flow-opportunity-verification-r3-20260608.raw.json`
  - `tests/real-personas/qa-skill/runs/flow_opportunity_verification/flow-opportunity-verification-r4-20260608.raw.json`

Note infra: `supabase status` signalait des services annexes arretes (`imgproxy`, `analytics`, `vector`, `pooler`), mais API/Auth/Functions/DB etaient joignables. Le premier essai r1 a recu un `502` pendant un redemarrage du runtime Edge local; il est conserve comme incident infra, non utilise pour juger le comportement Sophia.

## 2. Tours De Conversation

### Run r2 - demande naturelle status recap implicite

User: "Je suis un peu perdu sur ce que j'ai deja comme carte d'attaque et ou j'en suis. Tu peux m'aider a y voir plus clair ?"

Resultat:
- HTTP 200
- Trace: `response_owner=normal_reply`, `reason_code=normal_reply_default`
- Aucun `selected_handler`
- Aucun etat `flow_opportunity_verification`
- Reponse visible donne un recap direct et propose de repartir de zero, sans verification courte.

Attendu:
- Opportunity implicite vers `status_recap`, puis offre locale `flow_opportunity_verification`.

### Run r3 - formulation canonique du contrat

User: "Je sais plus ce qu'il y a dans ma carte d'attaque."

Resultat:
- HTTP 200
- Trace: `response_owner=normal_reply`, `reason_code=normal_reply_default`
- `turn_frame.tool_skill_opportunity.type=none`
- Aucun champ `flow_opportunity` produit
- Aucun etat `flow_opportunity_verification`

Attendu documente:
- `flow_opportunity: status_recap.attack_card_uncertainty`
- `target_flow=status_recap`
- offre locale demandant confirmation avant recap.

### Run r4 - opportunity update coach preferences

Tour 1:
- User: "Tu me poses trop de questions en ce moment."
- Trace: `response_owner=tool_skill`, `selected_handler=flow_opportunity_verification`, `selected_action=offer_opportunity`, `target_flow=update_coach_preferences`
- Etat actif cree: `skill_id=flow_opportunity_verification`, `status=waiting_confirmation`, `confirmation_anchor.target_flow=update_coach_preferences`
- Aucun outil execute.

Tour 2:
- User: "Avant de dire oui, c'est quoi exactement une preference coach dans Sophia ?"
- Trace: `selected_handler=flow_opportunity_verification`, `selected_action=get_info_product`
- `product_help` est appele inline dans `subskill_history`
- L'ancre de confirmation reste sur `update_coach_preferences`
- Aucun outil execute.

Tour 3:
- User: "Oui, fais le changement pour me poser moins de questions."
- Trace: `selected_handler=update_coach_preferences`, `selected_action=write_preferences`, `launched_by=flow_opportunity_verification`
- `executed_tools=["update_coach_preferences"]`
- `effect_ledger.counts.committed=1`
- Etat `flow_opportunity_verification` nettoye apres lancement.

## 3. Analyse De Fluidite Humaine

Points valides:
- Le run r4 est naturel: Sophia reconnait la friction, propose un changement, explique les preferences coach sans perdre le contexte, puis traite le "oui" tardif comme acceptation de l'ancre initiale.
- La reponse produit du tour 2 est claire et ne pretend pas avoir mute quoi que ce soit.
- La reponse finale du tour 3 est coherente avec l'effet durable consenti.

Points problematiques:
- Sur r2/r3, Sophia repond comme si elle devait gerer elle-meme le besoin de status, au lieu d'offrir le flow de recap. La formulation canonique du contrat aboutit meme a demander au user de copier/coller sa carte d'attaque, ce qui inverse la responsabilite attendue du `status_recap`.

## 4. Analyse Systeme

Valide:
- Le chemin `tool_skill_opportunity` legacy -> `flow_opportunity_verification` fonctionne pour `update_coach_preferences`.
- Pendant le flow actif, la trace du tour 3 bloque le dispatcher global avec `active_flow_opportunity_verification_uses_local_dispatcher`.
- `product_help` reste sub-skill inline et ne devient pas owner final.
- L'acceptation tardive lance bien le flow cible, avec `launched_by=flow_opportunity_verification`.

Defauts:
- `status_recap.attack_card_uncertainty` n'est pas produit par le dispatcher global sur la phrase canonique du contrat. Classification: `BF-ROUTE-01`.
- Apres `get_info_product`, l'etat actif conserve l'ancre, mais `origin.user_message` est remplace par le message courant et `recent_user_messages` contient deux fois le tour 2; `turn_count` passe de 1 a 3 apres seulement deux tours. Classification secondaire: `BF-STATE-01`.

Bug sheet:
- `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-08-flow-opportunity-verification-local-real-r1-bugs.md`

## 5. Verdict Global

RED.

Le flow local est fonctionnel sur l'opportunity `update_coach_preferences`, y compris product help inline et acceptation tardive. Mais le scope recommande incluait aussi `status_recap`, et la phrase canonique "Je sais plus ce qu'il y a dans ma carte d'attaque" ne declenche aucune `flow_opportunity`. Le comportement attendu n'est donc pas completement atteint en QA real IA locale.
