# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-15
- Run: `daily-d2-two-actions-skill-2026-05-15-r8`
- Persona: paul
- Objectif: Test daily deux actions du plan, conversation ouverte par Sophia depuis un trigger local process-checkins, puis conduite manuellement tour par tour.
- Trajectoire: daily action review avec 2 targets, une action completed et une mission missed avec raison, puis confirmation explicite avant report.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `false`
- pending_id decouvert/genere au runtime: `1e2b8b75-f69e-4044-8247-e95dfe36afed`
- targets.length: `2`
- local_date: `2026-05-21`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d2-two-actions-skill-2026-05-15-r8.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Je repense à tes deux actions “Faire une session de travail focus (2h)” et “Bloquer tes créneaux de la semaine” : où tu en es avec la session de travail focus et le fait de bloquer tes créneaux pour la semaine ?

### Tour 1

**User**
> La session de travail focus, oui, je l'ai faite. J'ai eu du mal à m'y mettre mais après j'ai tenu presque les deux heures. Par contre je n'ai toujours pas bloqué mes créneaux de la semaine : j'étais rincé et j'ai évité l'agenda.

### Tour 1

**Sophia**
> Est-ce que tu souhaites reporter le blocage de tes créneaux à demain ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `20`
- assistant_message_count: `1`

### Tour 2

**User**
> Oui, reporte-le à demain. Ça reste utile, mais je veux le faire avec un peu plus de calme.

### Tour 2

**Sophia**
> C'est noté. Tu as terminé ta session de travail focus. Pour le blocage de tes créneaux, je note que tu étais fatigué et je le reporte donc à demain comme demandé.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `20`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: PASS**

**Ce qui marche**
- L'ouverture vient de Sophia, pas du user, et couvre clairement les deux actions: `Faire une session de travail focus (2h)` et `Bloquer tes créneaux de la semaine`.
- Sophia laisse une reponse libre et ne force pas un choix multiple ni un statut "partiel" visible.
- Quand la mission est manquee, Sophia ne reporte pas automatiquement: elle pose une question courte de confirmation.
- Apres confirmation, le recap est factuel et ne lance pas d'operation parasite.

**Problemes**
- L'ouverture est correcte mais un peu redondante: elle cite les deux titres puis reformule les deux actions. Ce n'est pas bloquant, mais le style peut etre encore plus leger.

**Fix propose**
- Garder le guard de couverture des deux actions, mais continuer a optimiser le prompt d'ouverture pour eviter les doubles formulations quand les titres exacts sont deja cites.

## 4. Analyse Systeme

**Verdict: PASS**

**Routage**
- `process-checkins` cree le pending `daily_action_review` depuis deux occurrences ouvertes du plan.
- `whatsapp-webhook` route les reponses utilisateur vers le pending daily, sans dispatcher operationnel concurrent.

**Skills / Operations / Tools**
- Le skill `daily_action_review_v1` remplit le JSON conversationnellement via IA.
- Aucune classification regex/fallback visible n'a ete utilisee pour determiner completed/missed/reason/still_relevant.
- Le message visible de clarification vient de `generated_user_message` du skill.

**Memory / Effets durables**
- Tour 1: pending reste `pending`, aucune application finale avant confirmation de report.
- Tour 2: pending passe `done`.
- L'habitude est marquee `done`; son entry `progress/completed` garde `metadata.still_relevant=null`.
- La mission est marquee `missed`, raison `fatigue`, puis reschedule vers `fri` apres confirmation explicite; `metadata.rescheduled_to= fri` et `metadata.still_relevant=true`.
- Dans le `review_state`, l'habitude completed a `still_relevant="unknown"`, donc le champ ne pollue plus les actions non missed.

**Problemes**
- Aucun probleme bloquant observe sur ce run.
- Note QA: pour lancer le run frais sans attendre, le profil Paul local a ete ajuste pour simuler une derniere activite WhatsApp vieille d'environ deux heures et contourner la quiet-window locale.

**Fix propose**
- Aucun fix obligatoire restant pour ce scenario.

## Verdict Global

- Verdict: PASS
- Raison principale: le flow respecte les nouvelles regles: ouverture IA couvrant deux actions, collecte libre, pas de report sans confirmation, effets appliques seulement apres accord.
- Follow-up prioritaire: lisser le style de l'ouverture IA pour eviter la repetition quand les titres exacts sont deja presents.
