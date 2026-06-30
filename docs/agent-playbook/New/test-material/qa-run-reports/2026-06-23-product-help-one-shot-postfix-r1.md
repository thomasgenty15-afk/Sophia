# QA Run Report - Product Help One-Shot Postfix R1

## 1. Contexte Du Test

- Date: 2026-06-23
- Run: `product-help-one-shot-postfix-20260623-r1`
- Persona: `qa-skill`, connexions temporaires locales:
  - `product_help_product_help_one_shot_postfix_global_20260623_r1`
  - `product_help_product_help_one_shot_postfix_local_20260623_r1`
  - `product_help_product_help_one_shot_postfix_antifp_20260623_r1`
- Objectif: verifier apres fix que Product Help + `create_one_shot_reminder` fonctionne sans phrase visible deterministe prefixee, avec un seul rendu de confirmation.
- Trajectoire:
  - R1.1: cold start global, question Product Help + rappel explicite.
  - R1.2: Product Help en deux tours, puis question Product Help + rappel explicite.
  - R1.3: anti-faux-positif, duree conversationnelle sans demande de rappel.
- Surfaces visees: `/functions/v1/test-send-message`, `force_full_ai=true`, dispatcher global, `product_help`, direct-effect lane, `create_one_shot_reminder`, `scheduled_checkins`, final response composition.
- Cadre IA reel: Supabase local, connexions temporaires, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, pas de staging/remote.
- Validite QA: valide. Les 3 variantes passent par le chemin IA reel local. Artefacts bruts dans `tmp/qa-one-shot-transverse/`.

## 2. Tours De Conversation

### Run R1.1 - Tour 1

**Verdict du tour:** green

**User**
> Dans Sophia, la carte d attaque c est pour m aider a commencer une action ou pour me proteger d un risque ? Rappelle-moi demain a 8h30 de revoir cette difference.

**Sophia**
> Oui, plutôt pour t’aider à démarrer l’action : la carte d’attaque réduit la friction avant de commencer. La carte de défense, elle, sert à te protéger d’un risque pendant l’action. Et je te le rappellerai demain à 8h30 pour revoir cette différence.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- safety: `none`
- direct_effects: `["create_one_shot_reminder"]`
- operation: direct-effect lane `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: `product_help_with_reminder`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_checkins.id=89194514-0a92-46bd-8553-39ea0b9b7596`, `scheduled_for=2026-06-24T06:30:00+00:00`, instruction `revoir cette difference`

### Run R1.2 - Tour 1

**Verdict du tour:** green

**User**
> Je veux comprendre les ressources Sophia : une carte de defense, ca se retrouve ou ?

**Sophia**
> Oui : tu la retrouves dans Dashboard > Ressources.
> Si elle est liée à une mission ou une habitude, tu peux aussi en voir un aperçu depuis Dashboard > Plan, puis la retrouver dans Ressources.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `explain where to find a defense card in Sophia`
- executed_tools: `[]`
- durable_effect: none

### Run R1.2 - Tour 2

**Verdict du tour:** green

**User**
> Et une carte d attaque, je la retrouve au meme endroit ? Rappelle-moi dans 35 minutes de relire ta reponse.

**Sophia**
> Oui : une carte d’attaque se retrouve dans Dashboard > Ressources. Si elle est liée à une mission ou une habitude, tu peux aussi la voir depuis Dashboard > Plan.
>
> Et je te rappelle de relire ma réponse mardi 23 juin à 01:23.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- safety: `none`
- direct_effects: `["create_one_shot_reminder"]`
- operation: direct-effect lane `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: `product_help_with_reminder`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_checkins.id=56ef36d4-8190-4179-a10e-7e6de5cd257e`, `scheduled_for=2026-06-22T23:23:22.007+00:00`, instruction `relire ta reponse`

### Run R1.3 - Tour 1

**Verdict du tour:** green

**User**
> J ai cinq minutes, explique-moi rapidement ou retrouver les cartes de defense dans Sophia.

**Sophia**
> Tu les retrouves dans Dashboard > Ressources. Si une carte de défense est liée à un item du plan, elle peut aussi apparaître depuis Dashboard > Plan, mais le lieu canonique reste Ressources.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `product_help_about_defense_cards_location`
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Les reponses Product Help sont courtes, naturelles et directement utiles.
- Le rappel est confirme une seule fois dans les deux cas positifs.
- La confirmation n'a plus la forme d'un bloc deterministe prefixe; elle est integree dans la reponse visible.
- Le cas anti-faux-positif reste fluide: Sophia respecte "j'ai cinq minutes" comme contrainte conversationnelle, pas comme rappel.

**Problemes**
- Aucun probleme observe.

**Fix propose**
- Aucun fix requis sur ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- R1.1 route correctement `product_help` + `direct_effects_to_run=["create_one_shot_reminder"]`.
- R1.2 T1 route Product Help seul.
- R1.2 T2 route Product Help + direct effect sans absorber la question produit.
- R1.3 ne declenche aucun direct effect malgre la duree conversationnelle.

**Skills / Operations / Tools**
- `product_help` reste owner visible sur les trois variantes.
- `create_one_shot_reminder` execute seulement sur demandes explicites.
- Aucun executor n'est appele sur l'anti-faux-positif.

**Memory / Effets durables**
- R1.1 cree un `scheduled_checkins` pending pour `revoir cette difference`.
- R1.2 T2 cree un `scheduled_checkins` pending pour `relire ta reponse`.
- R1.3 ne cree aucun `scheduled_checkins`.
- Le texte visible ne contient plus deux confirmations ni de prefixe direct-effect deterministe.

**Problemes**
- Aucun probleme observe.

**Fix propose**
- Aucun fix requis sur ce run.

## Verdict Global

- Verdict: green
- Raison principale: Product Help et `create_one_shot_reminder` cohabitent correctement; les rappels explicites sont commits, les questions produit restent traitees, et le rendu visible ne duplique plus la confirmation.
- Follow-up prioritaire: aucun pour ce perimetre.
