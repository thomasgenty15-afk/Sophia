# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-14
- Run: `daily-d2-two-actions-rerun-2026-05-14-r1`
- Persona: paul
- Objectif: Test D1.1 daily minimal, une seule action, conversation ouverte par Sophia puis conduite manuellement tour par tour.
- Trajectoire: daily action review avec 2 target, puis continuation conversationnelle minimum 5 tours user.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `false`
- pending_id decouvert/genere au runtime: `4ac70489-ed17-48b1-8193-cecf8633e341`
- targets.length: `2`
- local_date: `2026-05-18`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d2-two-actions-rerun-2026-05-14-r1.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> J’ai noté pour ton daily que le Parking à idées est commencé mais pas terminé.  
> Et que le blocage principal venait surtout du fait de vouloir organiser parfaitement la structure avant de t’en servir.  
> Pour aujourd’hui, ta session de travail focus (2h) s’est passée comment ?

### Tour 1

**User**
> La session focus, oui, je l'ai faite presque jusqu'au bout. Par contre je n'ai pas bloqué mes créneaux de la semaine : j'ai repoussé parce que j'étais déjà saturé et je ne voulais pas regarder tout mon agenda ce soir.

### Tour 1

**Sophia**
> C'est noté pour tes créneaux. Qu'est-ce qui t'a empêché de terminer complètement ta session focus ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `14`
- assistant_message_count: `1`

### Tour 2

**User**
> Rien de spécial à noter pour la session focus : j'ai fait environ 1h45, donc pour moi c'est fait. Le vrai truc à traiter c'est plutôt les créneaux : oui ça reste utile, mais je préfère confirmer avant que tu le reportes.

### Tour 2

**Sophia**
> Tu veux qu'on reporte "Bloquer tes créneaux de la semaine" à demain ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `14`
- assistant_message_count: `1`

### Tour 3

**User**
> Oui, reporte-le à demain.

### Tour 3

**Sophia**
> Tu veux qu'on reporte "Bloquer tes créneaux de la semaine" à demain ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `14`
- assistant_message_count: `1`

### Tour 4

**User**
> Oui, je confirme : reporte Bloquer mes créneaux à demain.

### Tour 4

**Sophia**
> Tu veux qu'on reporte "Bloquer tes créneaux de la semaine" à demain ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `14`
- assistant_message_count: `1`

### Tour 5

**User**
> Oui, je confirme le report à demain.

### Tour 5

**Sophia**
> Tu veux qu'on reporte "Bloquer tes créneaux de la semaine" à demain ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `14`
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
