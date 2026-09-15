# QA Run Report — R2-B01 (confirmation de rappel : création vs recap)

## 1. Contexte Du Test

- Date: 2026-07-02
- Run: r2b01-reminder-recap-r1
- Persona: Alex (`alex12@gmail.com`, user_id `aac76fd6-a688-4027-951a-fa79c628fac5`), connexion locale dédiée
- Objectif: valider le fix de la régression **R2-B01** (Sophia re-confirmait spontanément un rappel dans la fenêtre EffectLedger 5 tours, y compris en contexte non-lié ou émotionnel). Modèle attendu : tour de création = confirmation unique (pipeline one-shot) ; tours 2–5 = rappel disponible mais **jamais** re-confirmé spontanément, seulement sur demande.
- Trajectoire: T1 création rappel → T2 sujet non-lié (blocage tâche) → T3 message émotionnel → T4 tour non-lié (sommeil) → T5 recap explicite du rappel.
- Surfaces visées: routing/dispatcher, `normal_reply`, `coaching_recommendation`, one-shot reminder pipeline, EffectLedger (fenêtre 5 tours), effets durables `scheduled_checkins`.
- Cadre IA reel: local, `/functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, JWT persona réel, aucun fallback déterministe.
- Validite QA: **valide**.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Hey, tu peux me caler un rappel mercredi prochain vers 9h pour que je renvoie mon dossier d'inscription ? j'ai vraiment peur de zapper ça

**Sophia**
> C'est noté : mercredi prochain vers 9h, renvoyer ton dossier d'inscription. Je te le rappelle bien. 🙂
>
> Si tu veux, je peux aussi t'aider à formuler un mini texte pour ce dossier.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- direct_effects: one_shot_reminder.create → committed
- durable_effect: `scheduled_checkins` id `bf596ac7-2884-4537-92dd-31497d390bec`, `scheduled_for=2026-07-08T07:00:00Z` (mer. 9h Paris), status `pending`
- effect_ledger: requested 1 / allowed 1 / committed 1 / failed 0

Confirmation **unique**, sobre, avec le bon `local_label` et l'objet du rappel. Pas de double reformulation. Tour de création conforme.

### Tour 2

**Verdict du tour:** green

**User**
> Bon sinon complètement autre chose : j'arrive pas à m'y mettre sur ma présentation de boulot, je tourne en rond depuis ce matin et ça me stresse

**Sophia**
> Je partirais sur une carte d'attaque libre, technique texte magique : elle t'aide à recadrer la pensée qui te fait tourner en rond et à lancer le premier geste sur ta présentation.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- direct_effects: null
- effect_ledger: vide

Le rappel est dans la fenêtre ledger (tour 2). Sophia répond au besoin réel (déblocage) et **ne re-confirme pas** le rappel. Aucune insertion parasite.

### Tour 3

**Verdict du tour:** green

**User**
> franchement je suis épuisé en ce moment, j'ai l'impression de courir partout et de rien réussir. ça me pèse un peu

**Sophia**
> Je partirais sur une potion d'apaisement : là, le plus saillant c'est la pression et l'épuisement qui montent. Si tu sens surtout que tu es dur avec toi-même, on pourrait plutôt viser l'amour, mais sur ce message l'apaisement me paraît le plus juste. Si tu veux, on peut juste poser ça en une phrase pour ce soir.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- direct_effects: null
- effect_ledger: vide

C'est le cas exact qui déraillait en R2 (moment émotionnel → re-confirmation du rappel). Ici Sophia reste sur l'émotion, **aucune mention du rappel**. Cœur de l'anti-régression : OK.

### Tour 4

**Verdict du tour:** green

**User**
> ok je testerai ça ce soir. sinon t'as un conseil pour mieux dormir en ce moment ? je dors mal

**Sophia**
> Pour ce que tu décris, l'apaisement est le bon appui : quand la pression monte et que le sommeil part en vrille, l'idée c'est de faire redescendre le volume, pas de te forcer.
>
> Ce soir, vise juste un truc simple : coupe les écrans un peu avant, pose-toi dans le calme, et laisse ton corps redescendre sans te battre contre le sommeil.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- direct_effects: null
- effect_ledger: vide

Tour non-lié, toujours dans la fenêtre. Pas de re-confirmation spontanée.

### Tour 5

**Verdict du tour:** green

**User**
> au fait, c'était quoi déjà le rappel que je t'ai demandé tout à l'heure ?

**Sophia**
> Oui : renvoyer ton dossier d'inscription mercredi prochain vers 9h. 🙂

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- direct_effects: null (pas de recréation)
- effect_ledger: vide (aucun nouvel effet)

Côté **vrai-positif** : sur demande explicite, Sophia rappelle correctement le rappel depuis la fenêtre ledger, avec `local_label` exact, sans déni ni recréation. La permission fonctionne.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Confirmation de création nette et unique (T1), sans répétition de l'objet du rappel.
- Transitions naturelles entre rappel → coaching action → soutien émotionnel → conseil → recap.
- T3 : Sophia reste centrée sur l'émotion, ne pollue pas avec un rappel hors sujet.
- T5 : le recap est court, exact, non robotique.

**Problemes**
- Aucun bloquant. Micro-observation non bloquante : T3 propose immédiatement une potion là où un pur accusé de réception émotionnel aurait pu précéder ; hors scope R2-B01.

**Fix propose**
- Aucun requis pour R2-B01.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1/T5 → `normal_reply` (création + recap conversationnel) : correct.
- T2/T3/T4 → `coaching_recommendation` : correct, cohérent avec l'intention.

**Skills / Operations / Tools**
- T1 : one-shot reminder pipeline → `create_one_shot_reminder` requested→allowed→committed, un seul commit. Fix BF-EFFECT-02 (pas de double création) tenu.
- T2–T5 : aucun effet durable déclenché, aucun tool parasite.

**Memory / Effets durables**
- `scheduled_checkins` : exactement **1** enregistrement après le run (`bf596ac7…`), status `pending`, `scheduled_for=2026-07-08T07:00:00Z`. Pas de doublon, pas d'effet créé pendant T2–T5.
- Discrimination `source` du contrat visible validée en conditions réelles : la directive de confirmation active n'apparaît qu'au tour de création (T1) ; sur T2–T5 le rappel reste disponible sans confirmation spontanée, et confirmable uniquement sur demande (T5).

**Problemes**
- Aucun.

**Fix propose**
- Aucun.

## Verdict Global

- Verdict: **green**
- Raison principale: la régression R2-B01 est corrigée — plus aucune re-confirmation spontanée du rappel dans la fenêtre 5 tours (y compris en contexte émotionnel T3), tout en conservant la confirmation unique à la création (T1) et le recap sur demande (T5). Effet durable unique et correct en DB.
- Follow-up prioritaire: aucun sur ce périmètre. Optionnel : variante r2b01-r2 pour tester le comportement en bord de fenêtre (recap au tour 6+, hors fenêtre) afin de documenter le message attendu quand le ledger ne surface plus le rappel.
