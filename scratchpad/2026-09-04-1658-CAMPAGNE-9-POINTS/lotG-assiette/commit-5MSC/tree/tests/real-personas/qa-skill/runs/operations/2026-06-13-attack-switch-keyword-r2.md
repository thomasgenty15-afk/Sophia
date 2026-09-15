# QA Run - attack-switch-platform-20260613-r2

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `attack-switch-platform-20260613-r2`
- Persona: `qa-skill` temporaire, email `qa-qa-skill-attack-switch-platform-20260613-r2@example.com`, user id `d616ea0e-7a48-4c65-a706-86da59dd2f8e`
- Objectif: verifier qu'une carte d'attaque creee par la plateforme avec technique `Mot de bascule` declenche un soutien quand le mot est envoye seul.
- Trajectoire: contexte actif minimal -> `generate-attack-card-v1` -> `generate-attack-technique-v1` avec `pre_engagement` -> envoi `URSSAF` via `/functions/v1/test-send-message`.
- Surfaces visees: plateforme cartes d'attaque, `user_attack_cards`, `keyword_trigger`, routage Sophia, reponse de soutien.
- Cadre IA reel: Supabase local, fonctions plateforme locales, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide.

## 2. Tours De Conversation

### Setup Plateforme

**Verdict du setup:** green

La carte a ete creee par le chemin plateforme:

- `generate-attack-card-v1`: success
- `generate-attack-technique-v1`: success
- attack_card_id: `9a1236bd-dd4b-405a-b2f5-c3e10dcfefc4`
- status DB: `active`
- technique: `pre_engagement`
- keyword trigger:
  - activation_keyword: `URSSAF`
  - activation_keyword_normalized: `urssaf`
  - risk_situation: `L'envie de ranger le bureau pour fuir la connexion au portail`
  - first_response_intent: `Stopper l'esquive et ramener l'attention sur l'ouverture du portail et du dossier`

### Tour 1

**Verdict du tour:** green

**User**
> URSSAF

**Sophia**
> Ok, on tient l'essentiel maintenant 🙂 Evite de toucher/"ranger" ton bureau : clique juste sur le portail URSSAF, puis ouvre ton dossier.  
> Go, tu y es. 🎯

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `low`
- tool_skill_intents: []
- direct_effects: []
- operation: null
- executed_tools: []
- durable_effect: aucun nouvel effet durable attendu

**Note trace**
- Le comportement visible est conforme: soutien immediat, bref, sans redemander le contexte, avec action unique.
- La trace courte ne remonte pas explicitement `attack_keyword_trigger_detected`; a surveiller comme observabilite, mais pas bloquant sur ce run.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia comprend que `URSSAF` est un signal de bascule.
- Elle ne demande pas d'explication longue.
- Elle donne une consigne immediate et concrete: ne pas ranger, cliquer sur le portail, ouvrir le dossier.

**Problemes**
- Aucun probleme bloquant observe sur l'experience.
- Warning faible: emojis presents dans un moment de friction; acceptable ici, mais selon le style cible on peut preferer encore plus sobre.

**Fix propose**
- Source amont: observabilite trace.
- Correction recommandee: exposer dans la trace courte un champ indiquant que le mot de bascule a ete detecte.
- Tests d'invariant attendus: exact keyword, keyword accent/casse, anti-faux-positif phrase longue.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Le tour n'est pas route vers `prepare_attack_card`.
- Aucun tool skill intent parasite n'est detecte.
- `normal_reply` produit le soutien attendu a partir du contexte de carte active.

**Skills / Operations / Tools**
- Creation carte: fonctions plateforme OK.
- Envoi mot: `/test-send-message` OK avec `force_full_ai=true`.
- Pas d'effet durable supplementaire attendu.

**Effets durables**
- Carte plateforme active avant envoi.
- Aucun checkin/rappel/mutation annexe observee dans la trace du tour.
- Connexion temporaire nettoyee apres run.

## Verdict Global

`green` - Avec une carte creee par la plateforme, l'envoi du mot de bascule `URSSAF` declenche bien le message de soutien attendu.

## Artefacts

- Setup plateforme: `tmp/attack-switch-platform-20260613-r2/platform-setup.summary.json`
- Raw fonctions plateforme: `tmp/attack-switch-platform-20260613-r2/attack-switch-platform-20260613-r2-platform-card.generate-attack-card-v1.json`, `tmp/attack-switch-platform-20260613-r2/attack-switch-platform-20260613-r2-platform-technique.generate-attack-technique-v1.json`
- Raw trigger: `tmp/attack-switch-platform-20260613-r2/trigger-turn-01.raw.json`
- Summary trigger: `tmp/attack-switch-platform-20260613-r2/trigger-turn-01.summary.json`
