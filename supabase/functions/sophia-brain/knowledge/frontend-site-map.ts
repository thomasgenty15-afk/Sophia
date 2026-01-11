// Fact-based site map for Sophia (tech assistant).
// Source of truth: frontend/src/App.tsx routes.
//
// Keep this concise and stable. The goal is to help the assistant give non-hallucinatory navigation hints.

export const FRONTEND_SITE_MAP_V1 = `
STRUCTURE DU SITE (routes connues)

Public
- "/" : Landing
- "/le-plan" : Page produit "Le plan"
- "/l-architecte" : Page produit "L'architecte"
- "/formules" : Formules / pricing
- "/legal" : Mentions légales
- "/auth" : Connexion / auth

App (après accès)
- "/dashboard" : Tableau de bord
- "/chat" : Chat
- "/global-plan" : Plan global
- "/plan-priorities" : Priorités
- "/plan-generator" : Génération de plan
- "/framework-execution" : Exécution d’un framework/exercice
- "/grimoire" (et "/grimoire/:id") : Grimoire
- "/architecte" : Modules (espace architecte)
- "/architecte/:weekId" : Semaine / identité (architecte)
- "/architecte/alignment" : Weekly alignment (architecte)
- "/architecte/evolution" : Identity evolution (architecte)
- "/upgrade" : Upgrade

Admin
- "/admin" : Admin dashboard
- "/admin/evals" : Admin evals
- "/admin/usage" : Usage dashboard
- "/admin/production-log" : Production log
`.trim();


