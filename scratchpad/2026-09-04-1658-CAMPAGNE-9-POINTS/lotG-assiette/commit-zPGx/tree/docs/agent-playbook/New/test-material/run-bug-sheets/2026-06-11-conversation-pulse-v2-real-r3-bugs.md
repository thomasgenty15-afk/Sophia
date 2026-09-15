# Bug Sheet — Conversation Pulse V2 Real R3

## R3-B01 — Demande de soutien morning nudge interpretee comme rappel ponctuel

- Bug id: R3-B01
- Tours: Tour 2
- Famille: BF-ROUTING-01 — Routage produit discutable
- Domaine owner: global dispatcher / direct effect reminder / morning nudge intent boundary
- Source amont: interpretation de `demain matin` comme `create_one_shot_reminder`
- Statut: open
- Fix reference: a faire

## Symptome visible

Dans une conversation emotionnelle, l'utilisateur demande que Sophia lui remette doucement un peu de force demain matin, sans citer tous les details. Sophia repond:

```txt
Il me manque le moment exact pour programmer ce rappel.
```

La reponse est techniquement coherente si on interprete la demande comme un rappel, mais elle est moins fluide pour le produit morning nudge: l'utilisateur cherchait surtout un soutien doux le lendemain, pas forcement une programmation horaire explicite.

## Preuve systeme

Trace du tour 2:

```txt
note_information.source_flow_id=global_dispatcher
note_information.target_dispatcher=create_one_shot_reminder
direct_effect.effect_type=create_one_shot_reminder
direct_effect.explicitness=explicit
direct_effect.payload_hint.when_hint=demain matin
direct_effect.payload_hint.instruction_hint=remettre doucement un peu de force sans citer tous les details
```

## Impact

- Sophia peut interrompre un moment de soutien en demandant une precision horaire.
- Le signal utile pour un morning nudge emotional presence risque d'etre capture comme reminder ponctuel.
- Ce comportement peut rendre le flow moins naturel, meme si le backend pulse V2 fonctionne.

## Correction attendue

Clarifier la frontiere entre:

- demande explicite de rappel programmable, qui peut aller vers `create_one_shot_reminder`;
- demande de soutien "demain matin" dans un contexte emotionnel ou morning nudge, qui peut rester comme signal de nudge/emotional presence ou etre confirmee sans exiger une heure exacte.

La correction doit rester simple:

- pas de regex metier;
- pas de routing par mots-cles;
- pas de renderer fixe;
- pas de fallback legacy.

## Tests requis

- Conversation emotionnelle -> demande "demain matin donne-moi un peu de force" ne doit pas exiger automatiquement une heure exacte.
- Demande explicite "programme-moi un rappel demain a 8h" doit toujours aller vers reminder.
- Variante "demain matin, si possible" doit conserver l'intention douce sans sur-precision.
- Safety non declenchee pour ce cas.
- Aucun writer legacy `conversation_pulse` ne reapparait.
