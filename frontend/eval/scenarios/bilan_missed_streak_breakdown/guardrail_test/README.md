# Guardrail Test

Principe cle:
- Ne pas "forcer" l'utilisateur a repondre exactement ce qu'on attend.
- Les users reels donnent des reponses variees, floues, contradictoires, parfois incompletes.
- La simulation IA sert justement a exposer cette variance et a verifier la robustesse du systeme.

Regle de conception:
- On ne modifie les reponses user que s'il y a un blocage majeur qui empeche tout avancement.
- Sinon, on garde la variance et on renforce la machine pour qu'elle avance malgre des reponses imparfaites.

Question a se poser:
- Mauvaise question: "Comment faire pour que le user reponde ce qu'on veut ?"
- Bonne question: "Comment faire avancer le systeme avec ce type de reponse user ?"

Objectif produit:
- Construire une machine resiliente, fluide, et stable, meme quand les reponses ne sont pas "propres".
- Prioriser la robustesse du systeme sur l'alignement artificiel des prompts utilisateurs.
