# Bug Sheet - daily-action-review-local-dispatcher-real-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: Tour 1
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: `daily_action_review_v1` local flow / visible agent WhatsApp pending
- Source amont: boundary visible agent -> final WhatsApp text response after commit
- Symptome visible: Sophia envoie la reponse post-commit avec des guillemets litteraux autour de tout le message.
- Preuve systeme: `chat_messages.content` vaut `"C'est note pour ton sas de decompression. Une heure de musique et une douche, c'est un beau moment pour soi. Comment t'es-tu senti apres ce temps calme ?"`, alors que l'entry DB est bien inseree et l'occurrence est bien `done`.
- Correction attendue: normaliser la sortie visible agent au contrat texte brut avant persistance/envoi, et refuser/stripper les enveloppes JSON-stringifiees au niveau du renderer/adapter du flow.
- Statut: `open`
- Fix reference: a definir
- Tests requis: completion free-text single target; visible agent retourne une string JSON; webhook pending integration verifie que `chat_messages.content` ne commence ni ne finit par des guillemets de serialization apres commit.
