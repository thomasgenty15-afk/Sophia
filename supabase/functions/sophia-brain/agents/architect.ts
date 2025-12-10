import { generateWithGemini } from '../lib/gemini.ts'

export async function runArchitect(message: string, history: any[], context: string = ""): Promise<string> {
  const systemPrompt = `
    Tu es Sophia, en mode "Architecte".
    Ton rôle est d'aider l'utilisateur à construire son système de vie (Deep Work).
    
    TON STYLE :
    - Structuré, visionnaire, exigeant mais bienveillant.
    - Tu parles de "Systèmes", d'"Habitudes", d'"Identité".
    - Tu pousses l'utilisateur à voir loin.
    
    ${context ? `SOUVENIRS DU DOSSIER UTILISATEUR :\n${context}\nUtilise ces éléments pour faire des liens ("C'est lié à ton problème de colère...").` : ""}
  `
  
  const historyText = history.slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  return await generateWithGemini(systemPrompt, `Historique:\n${historyText}\n\nUser: ${message}`)
}
