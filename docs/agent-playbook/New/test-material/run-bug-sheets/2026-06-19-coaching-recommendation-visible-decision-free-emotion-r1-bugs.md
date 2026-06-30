# Bug Sheet - coachingrec-visible-decision-free-emotion-20260619-r1

## R1-B01

- Bug id: R1-B01
- Tours: 2
- Famille: BF-INTAKE-03 - Contrainte explicite perdue
- Domaine owner: `coaching_recommendation`
- Source amont: visible agent `no_plan_coaching` / decision visible fine; le dernier message utilisateur dit explicitement qu'il ne veut pas de support produit tout de suite, mais la decision reste `free_attack_card`.
- Symptome visible: Sophia recommande encore une carte d'attaque libre et la technique `Mot de bascule`, puis explique en meme temps que le vrai besoin est de clarifier l'intention avant d'ecrire.
- Preuve systeme:
  - T2: `response_owner=coaching_recommendation`
  - T2: `visible_task=no_plan_coaching`
  - T2: `coaching_type=no_plan_action`
  - T2: `last_visible_decision=free_attack_card / mot_de_bascule`
  - User T2: "Je n'ai pas besoin d'un support a preparer tout de suite."
- Correction attendue: dans `no_plan_coaching`, quand le user refuse explicitement un support ou dit devoir d'abord comprendre l'objectif/l'intention, la decision visible doit pouvoir passer a `coaching_only` et la reponse doit aider a clarifier l'intention sans pousser de carte.
- Statut: open
- Fix reference: none
- Tests requis:
  - `no_plan_action` actif + "je n'ai pas besoin d'un support a preparer tout de suite" -> `last_visible_decision.lever=coaching_only`.
  - `no_plan_action` actif + "je dois comprendre ce que je veux obtenir avant d'ecrire" -> coaching conversationnel, pas de carte.
  - Anti-faux-positif: si le user demande ensuite "ok, je veux quand meme un support pour commencer", le visible agent peut revenir vers `free_attack_card`.
