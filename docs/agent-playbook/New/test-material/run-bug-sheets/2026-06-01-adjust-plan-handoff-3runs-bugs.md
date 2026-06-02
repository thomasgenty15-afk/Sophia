# Bug Sheet - adjust_plan_item handoff - 2026-06-01

Run set: 3 runs full AI locaux, 6 tours chacun.

## B01 - Formulation de brouillon avant brouillon visible

- Famille: BF-INTAKE-01
- Run: action / T1
- Severite: yellow
- Observation: l'assistant demande une clarification utile, mais dit "Je dois reprendre le brouillon proprement" alors qu'aucun brouillon visible n'a encore ete produit.
- Attendu: clarification domaine sans mentionner un brouillon inexistant.
- Impact: degradation de coherence conversationnelle, sans effet durable.
- Statut: open

## B02 - Contrainte de concision ignoree dans repeat_handoff

- Famille: BF-INTAKE-03
- Run: action / T4
- Severite: yellow
- Observation: l'utilisateur demande "Redis-moi quoi faire dans Plan, mais court"; le renderer repete le handoff complet au lieu d'une version courte.
- Attendu: `repeat_handoff` conserve la destination Plan et la phrase no-mutation, mais respecte la contrainte "court".
- Impact: le handoff reste conforme no-mutation mais perd une contrainte explicite de style/utilite.
- Statut: open

## B03 - Sur-clarification apres decision de volume

- Famille: BF-INTAKE-01
- Run: niveau / T2
- Severite: yellow
- Observation: l'utilisateur donne une decision exploitable ("garde seulement deux mini-actions prioritaires cette semaine et reporte le reste"), mais le skill redemande une precision generique.
- Attendu: soit produire une recommandation de niveau/semaine prudente, soit poser une clarification precise sur les deux mini-actions si l'identification manque vraiment.
- Impact: friction intake, flow ralenti.
- Statut: open

## B04 - Perte du flow actif adjust_plan_item

- Famille: BF-ROUTE-02
- Run: niveau / T3
- Severite: red
- Observation: apres deux tours `adjust_plan_item`, le troisieme tour passe a `response_owner=normal_reply` et `selected_handler=null`.
- Attendu: le message reste dans le handoff actif et produit une clarification fine ou une recommandation handoff.
- Impact: rupture du contrat active flow; risque de routage vers un comportement non proprietaire du skill.
- Statut: open

## B05 - Incoherence de trace selected_handler

- Famille: BF-TEST-01
- Run: whole_plan / T2
- Severite: yellow
- Observation: la trace top-level indique `selected_handler=orientation_clarification` alors que `operation=adjust_plan_item` et `tool_skill_run.selected_handler=adjust_plan_item`.
- Attendu: metadata coherente pour permettre l'audit QA du owner reel.
- Impact: rend le diagnostic moins fiable, meme si le rendu visible et le no-mutation sont conformes.
- Statut: open
