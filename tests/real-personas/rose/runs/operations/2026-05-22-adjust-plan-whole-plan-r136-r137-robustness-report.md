# QA Run Report - Adjust Plan Whole Plan r136-r137 Robustness

## 1. Contexte Du Test

- Date: 2026-05-22
- Runs: r136, r137
- Persona: Rose
- Objectif: tester la robustesse whole-plan avec une formulation moins explicite que les runs precedents.
- Trajectoire: le user ne dit pas "ajuster le plan global", mais parle de la prochaine partie du plan et d'une mini marche de reconnexion apres accrochage avant de reparler du fond.
- Surfaces visees: routing, `adjust_plan_item`, whole-plan intake, draft review details.
- Cadre IA reel: Supabase local, `force_full_ai=true`, aucun fallback deterministe utilise comme resultat QA.
- Validite QA: r136 valide comme detection de bug routing; r137 invalide comme run conversationnel complet car bloque par erreurs upstream apres 3 retries.

## 2. Tours De Conversation

### Run r136 - Variation implicite avant fix

#### Tour 1

**User**
> Je viens de relire la prochaine partie du plan. Ce qui me manque, ce n est pas analyser la dispute, c est une mini marche pour revenir en lien apres un accrochage avant de reparler du fond.

**Sophia**
> Ouais, je vois exactement : t’as pas besoin de “tout analyser”, t’as besoin d’un petit rituel concret pour revenir au même endroit avant de replonger dans le sujet. Et franchement c’est une super idée.
>
> On peut le cadrer comme une mini marche en 2 temps très simple...

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason_code: skill_entry_signal
- direct_effects: aucun
- durable_effect: aucun

**Resultat**
- Mauvais routing: Sophia coache un rituel local au lieu d'ouvrir `adjust_plan_item`.
- Cleanup OK: aucun message scope restant, aucun plan/item cree restant, 7 lignes restaurees.

### Correctifs appliques apres r136

- Ajout d'un detecteur `isImplicitWholePlanRepairAdjustmentRequestForTest`.
- Promotion routing vers `tool_skill` / `adjust_plan_item` quand le message combine:
  - contexte de trajectoire du plan;
  - marche/etape/transition;
  - besoin de reconnexion/reparation apres tension ou accrochage.
- Ajout d'un test de non-regression sur cette variation.
- Durcissement du rendu details:
  - "pas trois nouvelles actions" repond maintenant explicitement a la question;
  - "on garde l'idee de progression ?" reste specifique a la marche de reparation et ne recycle pas le template chaleur/fiabilite.

### Run r137 - Variation post-fix

#### Tour 1 - Essai 1

**User**
> Je viens de relire la prochaine partie du plan. Ce qui me manque, ce n est pas analyser la dispute, c est une mini marche pour revenir en lien apres un accrochage avant de reparler du fond.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 502
- error: An invalid response was received from the upstream server
- durable_effect: aucun observe

#### Tour 1 - Essai 2

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 503
- error: name resolution failed
- durable_effect: aucun observe

#### Tour 1 - Essai 3

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 503
- error: name resolution failed
- durable_effect: aucun observe

**Resultat**
- Run arrete apres 3 retries, conformement a la regle.
- Cleanup OK: aucun message scope restant, aucun plan/item cree restant, 7 lignes restaurees.

## 3. Analyse De Fluidite Humaine

**Verdict: red pour r136 avant fix, non jugeable pour r137**

**Ce qui marche**
- Le contenu conversationnel r136 etait humainement comprehensible.

**Problemes**
- r136 Tour 1: Sophia repond comme coach conversationnel alors que la demande porte sur la trajectoire du plan. Impact: le user obtient une suggestion hors flow, sans brouillon ni validation. Severite: red.
- r137: impossible de juger la fluidite apres fix a cause des erreurs upstream. Severite: runtime, pas conversationnelle.

**Fix propose**
- Deja applique: promotion deterministe de cette famille de demande vers `adjust_plan_item`.
- A retester quand la resolution reseau/upstream est stable.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Avant fix: le router laisse passer une demande whole-plan implicite vers `product_help`.
- Apres fix: le code local force cette famille vers `tool_skill` / `adjust_plan_item`.
- Le run reel post-fix n'a pas pu confirmer le routing a cause de 502/503 avant trace exploitable.

**Skills / Operations / Tools**
- Tests unitaires ajoutes ou renforces:
  - `implicit whole-plan repair bridge request is detected`
  - `adjust plan whole-plan no-extra-actions confirmation is concrete`
  - `adjust plan whole-plan repair progression concern stays specific`
  - regression existante `progression concern gets coaching answer`

**Memory / Effets durables**
- Aucun changement durable conserve.
- r136 cleanup: scope supprime, snapshots runtime crees supprimes, Rose restauree.
- r137 cleanup: scope supprime, Rose restauree.

**Problemes**
- r137 bloque par upstream:
  - essai 1: 502 `An invalid response was received from the upstream server`
  - essais 2 et 3: 503 `name resolution failed`
- Cela ressemble a un probleme de resolution reseau/runtime local vers le provider, pas a une erreur de parsing du flow.

**Fix propose**
- Reprendre les runs des que le runtime local a de nouveau une resolution reseau stable.
- Si le probleme revient, regarder les logs edge/local au moment du `name resolution failed`.

## Verdict Global

**yellow**

Le bug de robustesse trouve par variation a ete corrige au niveau routing et couvert par tests. Les runs reels ne peuvent pas encore valider la correction de bout en bout, car le run post-fix est bloque par 502/503 apres 3 retries. La DB de Rose a ete restauree.
