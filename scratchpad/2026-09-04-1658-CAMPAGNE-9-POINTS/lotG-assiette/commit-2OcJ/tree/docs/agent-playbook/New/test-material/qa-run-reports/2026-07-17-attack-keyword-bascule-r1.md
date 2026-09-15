# QA Run Report — Mot de bascule (attack_keyword_support) — 2026-07-17

Deux runs IA réels sur le câblage runtime du mot de bascule (route
`attack_keyword_support` + présence collante), livré le 17/07. Un run facile
(déclenchement à froid), un run difficile (flow local actif, faux positifs,
normalisation, effet durable pendant le soutien).

---

# Run 1 — nina-bascule-easy

## 1. Contexte Du Test

- Date: 2026-07-17 (13h00 → 13h01 UTC)
- Run: `qa-nina-bascule-easy-20260717-r1`
- Persona: Nina (`nina@gmail.com`, `is_test_persona=true`), scope QA dédié frais
- Objectif: valider le chemin nominal du mot de bascule — mot envoyé à froid,
  soutien contextualisé depuis la carte, suite de conversation collante, sortie
  propre
- Trajectoire: trigger à froid → confidence FOMO → clôture
- Surfaces visées: routing (détection déterministe + route dédiée), skill
  attack_keyword_support, présence (armement `attack_keyword_support_door_opener`,
  maintain, exit), absence d'effets durables parasites
- Cadre IA réel: `POST /functions/v1/test-send-message` avec
  `force_full_ai=true`, Supabase local, aucun renderer déterministe, pilotage
  tour par tour
- Préparation: carte d'attaque QA seedée (technique `pre_engagement`, mot
  `Phare`, contexte scroll du soir / sommeil), aucune carte préexistante,
  `temp_memory` du scope vierge
- Validité QA: **valide**

## 2. Tours De Conversation

### Tour 1 — mot de bascule à froid

**Verdict du tour:** green

**User**
> Phare

**Sophia**
> Tu protèges ton sommeil et ton énergie de demain. Pose le téléphone maintenant, puis mets-le en charge hors de portée pour aller te coucher.

**Trace courte**
- http_status: 200
- response_owner: `attack_keyword_support`
- selected_handler: `attack_keyword_support`
- route_reason: `attack_keyword_exact_match`
- safety: none
- direct_effects: aucun
- operation: aucune
- executed_tools: []
- durable_effect: aucun (attendu) ; présence armée en DB
  (`entry_context.source=attack_keyword_support`, `attack_card_id` correct,
  `awaiting_first_reply=true`)

Le soutien reprend exactement l'ancrage stocké à la création de la carte
(sommeil, énergie du matin), donne UN geste immédiat, ne mentionne ni carte ni
technique, ne pose pas de question.

### Tour 2 — suite dans le flow de soutien

**Verdict du tour:** green

**User**
> ok je l ai pose mais j ai l impression de rater un truc si je coupe la, c est bete non ?

**Sophia**
> Non, ce n'est pas bête du tout. Tu as posé le téléphone, et juste après ton cerveau te vend le vieux "attends encore un peu, tu vas rater quelque chose" — c'est ultra classique.
>
> En vrai, ce "truc" à rater est presque toujours moins important que le sommeil que tu es en train de protéger. Le manque, là, c'est surtout une sensation, pas un vrai danger. Tiens 5 minutes de plus sans le reprendre, et ça redescend. 🙂

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- route_reason: `active_presence_conversation`
- arbitration: `continue_active → presence_conversation`
- safety: none | direct_effects: aucun | durable_effect: aucun

La présence armée au T1 tient le tour suivant : réponse au vrai besoin (FOMO),
pas de re-récitation du T1, pas de retour à la machinerie produit.

### Tour 3 — clôture

**Verdict du tour:** green

**User**
> t as raison. bon allez je file me coucher, merci, bonne nuit

**Sophia**
> Bonne nuit, dors bien 🌙

**Trace courte**
- http_status: 200
- response_owner: `normal_reply` (sortie présence sur closure, re-dispatch global)
- safety: none | direct_effects: aucun | durable_effect: aucun
- DB post-tour: `__active_conversation_skill_v1` vide (présence bien purgée)

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le mot seul suffit : aucune friction d'entrée, la réponse arrive directement
  ancrée sur ce que Nina protège (sommeil, promesse de se coucher avant minuit).
- Le geste proposé est unique et faisable dans la minute (poser/charger le
  téléphone hors de portée).
- Le tour 2 répond à l'émotion réelle (peur de rater) sans re-servir le script
  du tour 1 ; ton chaleureux sans tendresse non groundée.
- La clôture est sobre et proportionnée (une ligne).

**Problemes**
- Aucun.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 : détection déterministe → `attack_keyword_exact_match`, owner et handler
  `attack_keyword_support`. T2 : présence collante (`continue_active`).
  T3 : sortie closure → `normal_reply`. Séquence exactement conforme au design.

**Skills / Operations / Tools**
- `skill_run.status=generated` au T1 (pas de fallback). Aucun tool appelé sur
  les 3 tours, aucun effet demandé ni bloqué.

**Memory / Effets durables**
- Zéro effet durable sur tout le run (attendu). L'état présence est créé au T1,
  maintenu au T2, purgé au T3 — vérifié en DB à chaque étape.

**Problemes**
- Aucun.

## Verdict Global — Run 1

- Verdict: **green**
- Raison principale: chemin nominal complet (trigger → soutien contextualisé →
  suite collante → sortie) aligné conversation/système, zéro effet parasite.
- Follow-up prioritaire: aucun.

---

# Run 2 — paul-bascule-hard

## 1. Contexte Du Test

- Date: 2026-07-17 (13h01 → 13h05 UTC)
- Run: `qa-paul-bascule-hard-20260717-r1`
- Persona: Paul (`paul@gmail.com`, `is_test_persona=true`), scope QA dédié frais
- Objectif: durcir le câblage — mot dans une phrase (anti-faux-positif), mot nu
  sans accent/minuscule/ponctué pendant un flow local ACTIF (préemption +
  normalisation), effet durable demandé pendant le soutien, re-trigger accentué,
  anti-doublon
- Trajectoire: plainte procrastination (arme un coaching) → `elan !!` →
  résistance → demande de rappel 21h30 → `Élan` → clôture avec re-mention 21h30
- Surfaces visées: routing/arbitrage de flow actif, normalisation
  (accents/casse/ponctuation), présence, direct effect lane
  `create_one_shot_reminder` (commit + dédup), ledger
- Cadre IA réel: `test-send-message` + `force_full_ai=true`, Supabase local,
  pilotage tour par tour
- Préparation: carte QA seedée (mot `Élan`, normalisé `elan`, contexte
  évitement du dossier difficile), scope vierge
- Validité QA: **valide**

## 2. Tours De Conversation

### Tour 1 — le mot noyé dans une phrase (anti-faux-positif)

**Verdict du tour:** green

**User**
> je sens que j ai perdu mon elan sur le dossier compta, je tourne autour depuis 20 min

**Sophia**
> Je partirais sur une carte d'attaque libre, technique texte magique : ici, le blocage a l'air surtout mental, donc une phrase courte peut te remettre dans le premier geste sans te disperser.
>
> Exemple pour ton dossier compta : « Je n'ai pas besoin de tout finir d'un coup, je commence par ouvrir le dossier et traiter une seule pièce. »

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation` | route_reason:
  `coaching_recommendation_signal` | skill status: `continue` (flow local armé)
- safety: none | direct_effects: aucun | durable_effect: aucun

Aucun déclenchement du mot de bascule (le mot est dans une phrase) : le
pré-gate déterministe ne matche que le message réduit au mot seul. Le tour
part en coaching, ce qui arme un flow local actif — terrain voulu pour le T2.
Bonus doctrine opération : la technique proposée (texte magique) est cohérente
avec la nature du blocage, pas un forçage mot-clé vers « mot de bascule ».

### Tour 2 — mot nu, minuscule, sans accent, ponctué, pendant flow actif

**Verdict du tour:** green

**User**
> elan !!

**Sophia**
> Là, ton dossier attend pour de vrai, et c'est lui qui protège ton avancement réel et ta soirée plus tard. Ouvre-le maintenant et reste assis dessus 2 minutes, sans faire autre chose.

**Trace courte**
- http_status: 200
- response_owner: `attack_keyword_support` | route_reason:
  `attack_keyword_exact_match`
- arbitration: **`preempt_active` → attack_keyword_support** (le coaching actif
  vérifié en DB avant le tour est correctement préempté)
- safety: none | direct_effects: aucun | durable_effect: aucun ; présence
  ré-armée source `attack_keyword_support`
- skill status: `generated`

La normalisation fonctionne (`Élan` stocké ↔ `elan !!` reçu) et le flow
coaching actif ne capture pas le mot (pas de BF-ROUTE-02).

### Tour 3 — résistance dans le soutien

**Verdict du tour:** green

**User**
> bon il est ouvert. mais rien que de voir la pile de factures a saisir ca me decourage d avance

**Sophia**
> Déjà, tu l'as ouvert. Et là le vrai mur, c'est la pile entière qui te saute au visage, pas la prochaine facture.
>
> Ne regarde pas le tas. Prends seulement la toute première facture et saisis-la jusqu'au bout. Puis la deuxième. Ton cerveau te montre "2 heures de corvée", alors que ton seul boulot maintenant, c'est "1 facture". 🙂

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation` | arbitration: `continue_active`
- safety: none | direct_effects: aucun | durable_effect: aucun

### Tour 4 — effet durable demandé pendant le soutien

**Verdict du tour:** green

**User**
> ca marche. tu peux me mettre un rappel a 21h30 ce soir pour verifier ou j en suis sur la compta ?

**Sophia**
> C'est fait : je t'ai mis un rappel ce soir à 21h30 pour vérifier où tu en es sur la compta.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply` | route_reason: `direct_effects_then_normal_reply`
  (sortie présence sur tool_pull → re-dispatch global, chemin architecturé)
- direct_effects: `create_one_shot_reminder` exécuté
- durable_effect: **ligne DB vérifiée** — `scheduled_checkins` pending,
  2026-07-17 21:30 Europe/Paris, instruction « verifier ou j en suis sur la
  compta » (write-through P0 respecté : le « c'est fait » est adossé à la ligne)

### Tour 5 — re-trigger forme accentuée exacte

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** à classifier (voir analyse — friction de
contexte de session, aucune famille BF exacte ; la plus proche par symptôme est
BF-STATUS-01 mais la projection en cause n'est pas une lecture DB)

**User**
> Élan

**Sophia**
> Ce que tu veux protéger, c'est ton avancement réel sur le dossier et la fierté que tu auras ce soir d'avoir vraiment commencé. Ouvre maintenant le dossier et pose juste un stylo ou un onglet prêt, sans faire autre chose.

**Trace courte**
- http_status: 200
- response_owner: `attack_keyword_support` | route_reason:
  `attack_keyword_exact_match` | skill status: `generated`
- safety: none | direct_effects: aucun | durable_effect: aucun

**Analyse**
- Symptome: le soutien re-propose « Ouvre maintenant le dossier » alors que
  Paul a dit au T3 que le dossier est ouvert et au T4 qu'il s'y met. Routage,
  normalisation accentuée et re-armement présence sont corrects ; seule la
  FORMULATION ignore l'état de la session.
- Source amont probable: par conception anti-confabulation, le prompt
  spécialisé ne reçoit QUE le payload de la carte (risk_situation, ancrage,
  intention, consigne) — aucun historique de session. Sur un re-trigger dans la
  même session, cette cécité produit un geste déjà accompli.
- Owner runtime: `renderAttackKeywordSupportReply`
  (`_shared/attack-keyword-support.ts`) + bloc owner de `router/run.ts`.
- Meilleure correction selon les guidelines: enrichir la tâche du prompt
  spécialisé d'un champ déterministe `recent_user_messages` (2-3 derniers
  messages user verbatim, données réelles, pas de contexte produit) avec la
  consigne « ne re-propose pas un geste que le user dit déjà fait » ;
  alternative structurelle : un re-trigger pendant une présence
  attack_keyword_support encore armée pourrait router en maintain avec
  directive de ré-ancrage au lieu d'un rendu à froid.
- Pourquoi ce n'est pas un patch local: une regex ou une phrase de plus dans le
  prompt ne peut pas savoir ce que le user a déjà fait ; la correction est un
  ajout de données réelles au contrat d'entrée du renderer, pas un habillage.

### Tour 6 — clôture avec re-mention de l'heure (anti-doublon)

**Verdict du tour:** green

**User**
> ok la je suis lance pour de bon, premiere facture saisie. merci, on se voit a 21h30

**Sophia**
> Bien joué, la première est passée. À 21h30, tu reprends juste où tu en es sur la compta 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply` | route_reason: `direct_effects_then_normal_reply`
- direct_effect lane: `toolExecution=blocked`, `blocked_effects=[{create_one_shot_reminder, reason_code=duplicate_pending}]`,
  `committed_effects=[]`
- durable_effect: **aucun nouveau** — toujours UNE seule ligne
  `scheduled_checkins` en DB (vérifié). La réponse confirme l'existant sans
  prétendre créer quoi que ce soit.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le T1 ne sur-déclenche pas et propose une technique cohérente avec le
  blocage (pas de forçage « mot de bascule » par mot-clé).
- La bascule T2 est immédiate et le contraste de registre (coaching → soutien
  bref et directif) est exactement l'effet produit voulu.
- T3 est la meilleure réponse du run : reprend l'acquis (« Déjà, tu l'as
  ouvert »), nomme le vrai mur (la pile), réduit à « 1 facture ».
- T4/T6 : la demande de rappel est servie dans le fil sans casser le moment, et
  la re-mention de 21h30 au T6 n'invente pas un deuxième rappel.

**Problemes**
- Tour 5: re-proposition d'un geste déjà accompli (« Ouvre maintenant le
  dossier »). Famille: à classifier (cécité de session du prompt spécialisé,
  design anti-confabulation). Impact: friction visible mais réponse toujours
  utilisable comme ré-ancrage. Sévérité: yellow.

**Fix propose**
- Source amont: contrat d'entrée de `renderAttackKeywordSupportReply` limité au
  payload de carte.
- Correction recommandée: injecter les 2-3 derniers messages user verbatim
  (données réelles de session, aucune surface produit) + consigne de ne pas
  re-prescrire un geste déclaré fait ; ou basculer le re-trigger intra-présence
  en maintain avec directive de ré-ancrage.
- Tests d'invariant attendus: re-trigger après déclaration « c'est ouvert /
  j'ai commencé » → le geste proposé n'est pas le geste déclaré fait ;
  re-trigger à froid (session vide) → comportement actuel inchangé ;
  anti-confabulation → aucun fait absent des messages ou de la carte.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Anti-faux-positif T1 (mot dans une phrase → coaching), préemption T2 d'un
  flow local actif réel (`preempt_active`, vérifié armé en DB avant le tour),
  normalisation accents/casse/ponctuation dans les deux sens (carte accentuée ↔
  message non accentué au T2 ; message accentué au T5), présence collante T3,
  sortie tool_pull T4 conforme à la charte (le pull produit rend la main au
  dispatcher global), re-trigger T5 propre.

**Skills / Operations / Tools**
- `attack_keyword_support` en `generated` aux deux triggers (pas de fallback).
- La lane `create_one_shot_reminder` s'exécute au T4 (commit) et se bloque au
  T6 (`duplicate_pending`) : la cardinalité tient, le ledger reflète
  exactement requested/blocked/committed.

**Memory / Effets durables**
- Un seul effet durable sur le run = exactement la demande utilisateur
  (rappel 21h30 Paris, bon objet, pending). Aucun effet fantôme aux tours de
  trigger (la route les bloque par contrat). Claim T4 adossé à la ligne DB,
  claim T6 honnête sans nouvelle ligne (pas de BF-LEDGER-01).

**Problemes**
- Aucun côté système.

## Verdict Global — Run 2

- Verdict: **yellow**
- Raison principale: système entièrement vert (routage, préemption,
  normalisation, effet durable, anti-doublon) ; une friction UX au T5 — le
  prompt spécialisé, aveugle à la session par conception, re-prescrit un geste
  déjà fait sur un re-trigger.
- Follow-up prioritaire: enrichir le contrat d'entrée du renderer avec les
  derniers messages user (correction amont proposée ci-dessus), puis rejouer un
  re-trigger intra-session.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-17-paul-bascule-hard-r1-bugs.md`

---

# Synthèse des deux runs

- Run 1 (facile, Nina) : **green** — chemin nominal complet validé en IA réelle.
- Run 2 (difficile, Paul) : **yellow** — toutes les surfaces système durcies
  tiennent (faux positifs, préemption de flow actif, normalisation, effet
  durable pendant soutien, anti-doublon) ; une friction de formulation sur
  re-trigger intra-session, correction amont identifiée, non bloquante pour le
  déploiement.
- Hygiène: cartes QA seedées, rappel créé, messages, états de chat et traces
  des deux scopes supprimés en fin de run (vérification à zéro sur chaque
  table). Aucun run n'a touché staging/remote.
