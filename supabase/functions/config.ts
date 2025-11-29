// CE FICHIER EST IGNORÉ PAR GIT
// Gestion hybride des secrets : Prod (Env Vars) > Local (Fallback Hardcodé)

// 1. On tente de récupérer la clé depuis les variables d'environnement (PROD)
// 2. Si elle n'existe pas (LOCAL avec bug Docker), on utilise la clé en dur
export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "AIzaSyAgIDztEeomHDB1A3rV-33sE1yT9O3ZNTE";
