# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-15
- Run: `daily-d4-two-plans-skill-2026-05-15-r2`
- Persona: paul
- Objectif: Test daily avec 4 actions reparties sur 2 plans, conversation ouverte par Sophia puis conduite manuellement tour par tour.
- Trajectoire: ouverture limitee a 2 actions du premier plan, collecte de ces 2 actions, bascule vers les 2 actions du second plan, clarification avant report d'une action non faite.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `false`
- pending_id decouvert/genere au runtime: `d654ea63-b14f-4ea3-9a69-050d0deab759`
- targets.length: `4`
- local_date: `2026-05-23`
- fixture: plan Paul existant + plan QA secondaire local `QA Plan secondaire - Energie personnelle`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d4-two-plans-skill-2026-05-15-r2.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Je reviens sur tes deux actions “Faire une session de travail focus (2h)” et “Auditer tes fuites d'attention”.  
> Tu peux me dire ce qu’il s’est passé pour ta session de travail focus et pour auditer tes fuites d’attention ?

### Tour 1

**User**
> Pour ces deux actions, c'est fait : j'ai fait la session focus complète, et j'ai aussi audité mes fuites d'attention en notant les trois distractions principales.

### Tour 1

**Sophia**
> C'est noté pour la session focus et l'audit. Et pour ta marche de décompression et le fait de noter ce qui a vidé ton énergie ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `20`
- assistant_message_count: `1`

### Tour 2

**User**
> La marche de décompression, oui, je l'ai faite vingt minutes. Par contre je n'ai pas noté ce qui a vidé mon énergie, j'ai complètement oublié.

### Tour 2

**Sophia**
> C'est noté pour la marche. Est-ce que tu souhaites quand même noter ce qui a vidé ton énergie plus tard ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `20`
- assistant_message_count: `1`

### Tour 3

**User**
> Oui, ça reste utile. Reporte-le à demain, je préfère le faire à froid.

### Tour 3

**Sophia**
> C'est noté. Voici le bilan : tu as complété ta session focus, l'audit de tes fuites d'attention et ta marche de décompression. Pour ce qui est de noter ton énergie, c'est reporté à demain comme tu le souhaites.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `20`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: PASS**

**Ce qui marche**
- L'ouverture part bien de Sophia et ne couvre que 2 actions, malgre 4 targets dans le payload.
- Les 2 actions d'ouverture appartiennent au meme plan: `Faire une session de travail focus (2h)` et `Auditer tes fuites d'attention`.
- Apres la reponse complete sur ces 2 actions, Sophia bascule naturellement vers les 2 actions du second plan: marche de decompression + note sur l'energie.
- Quand une action du second plan est non faite sans confirmation d'utilite, Sophia ne reporte pas automatiquement et pose une clarification courte.
- Le recap final reste factuel et ne propose pas d'operation parasite.

**Problemes**
- Aucun probleme bloquant sur ce run.
- Micro-style: Sophia dit deux fois `C'est note`, ce qui reste acceptable mais pourrait etre varie a terme.

**Fix propose**
- Aucun fix obligatoire.

## 4. Analyse Systeme

**Verdict: PASS**

**Routage**
- `process-checkins` a cree un pending `daily_action_review` avec 4 targets.
- Le pending initial a garde une question visible sur 2 actions max.
- Le webhook a conserve le pending en `pending` jusqu'a remplissage complet des slots.

**Skills / Operations / Tools**
- `asked_occurrence_ids_history` confirme le grouping 2+2:
  - groupe 1: session focus + audit des fuites d'attention.
  - groupe 2: noter l'energie + marche de decompression.
- `remaining_occurrence_ids` est vide a la fin.
- Le skill a rempli le JSON conversationnellement via IA; pas de questionnaire choix multiple, pas de regex de classification.
- Le durcissement ajoute avant R2 impose de ne pas passer au groupe suivant si les actions deja demandees ont encore des `missing_slots`.

**Memory / Effets durables**
- 4 entries daily ont ete creees au moment final, pas avant:
  - session focus: `completed`, occurrence `done`.
  - audit fuites d'attention: `completed`, occurrence `done`.
  - marche de decompression: `completed`, occurrence `done`.
  - noter l'energie: `missed`, raison `forgot`, `still_relevant=true`, reschedule vers `sun`.
- Les actions completed gardent `metadata.still_relevant=null`.
- L'action non faite n'est reportee qu'apres confirmation explicite au tour 3.

**Problemes**
- Aucun probleme systeme bloquant observe sur R2.
- Note QA: un premier run R1 avait montre qu'une reponse ambigue `presque complete` pouvait laisser un slot partiel a clarifier; le prompt du skill a ete renforce avant R2 pour prioriser les trous du groupe courant.

**Fix propose**
- Garder un test conversationnel permanent sur le cas 4 actions / 2 plans / report confirme.

## Verdict Global

- Verdict: PASS
- Raison principale: le daily respecte la contrainte 2 actions max par message, groupe par plan, passe au second plan apres collecte du premier, puis attend confirmation avant report.
- Follow-up prioritaire: ajouter ce scenario au set d'integration automatise si on veut eviter une regression du 2+2.
