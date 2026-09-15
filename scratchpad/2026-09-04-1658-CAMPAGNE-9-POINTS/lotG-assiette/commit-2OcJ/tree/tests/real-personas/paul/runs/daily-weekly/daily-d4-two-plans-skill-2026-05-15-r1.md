# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-15
- Run: `daily-d4-two-plans-skill-2026-05-15-r1`
- Persona: paul
- Objectif: Test D1.1 daily minimal, une seule action, conversation ouverte par Sophia puis conduite manuellement tour par tour.
- Trajectoire: daily action review avec 4 target, puis continuation conversationnelle minimum 5 tours user.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `false`
- pending_id decouvert/genere au runtime: `ea9aee7a-d744-414c-9d9e-42de8ae50cf7`
- targets.length: `4`
- local_date: `2026-05-22`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d4-two-plans-skill-2026-05-15-r1.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Je reviens sur “Faire une session de travail focus (2h)” et “Bloquer tes créneaux de la semaine”.  
> Tu en es où avec ta session de travail focus et le fait de bloquer tes créneaux pour la semaine ?

### Tour 1

**User**
> Pour ces deux-là, c'est bon : j'ai fait la session focus presque complète, et j'ai aussi bloqué mes créneaux de la semaine juste après.

### Tour 1

**Sophia**
> Et pour ta marche de décompression et l'exercice sur ton énergie, qu'en est-il ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `20`
- assistant_message_count: `1`

### Tour 2

**User**
> La marche de décompression, oui, je l'ai faite après le dîner et ça m'a aidé à redescendre. Par contre je n'ai pas noté ce qui avait vidé mon énergie : j'ai oublié, mais ça reste utile, donc reporte-le à demain.

### Tour 2

**Sophia**
> Qu'est-ce qui a fait que ta session focus n'a été que partielle ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `20`
- assistant_message_count: `1`

### Tour 3

**User**
> Elle a été partielle uniquement parce que j'ai dû couper dix minutes avant la fin pour un appel urgent. Le bloc de focus a quand même été utile.

### Tour 3

**Sophia**
> C'est noté. Voici le bilan de tes actions : ta session focus a été partielle à cause d'un appel urgent, mais tu as bloqué tes créneaux et fait ta marche de décompression. L'exercice sur l'énergie est reporté à demain.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `20`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: A remplir apres analyse finale**

**Ce qui marche**
- A remplir.

**Problemes**
- A remplir.

**Fix propose**
- A remplir.

## 4. Analyse Systeme

**Verdict: A remplir apres analyse finale**

**Routage**
- A remplir.

**Skills / Operations / Tools**
- A remplir.

**Memory / Effets durables**
- A remplir.

**Problemes**
- A remplir.

**Fix propose**
- A remplir.

## Verdict Global

- Verdict: A remplir
- Raison principale: A remplir
- Follow-up prioritaire: A remplir
