import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini } from '../lib/gemini.ts'

interface Question {
  id: string
  text: string
  type: 'number' | 'boolean' | 'text'
}

interface InvestigationState {
  step_index: number
  answers: Record<string, any>
  questions: Question[]
}

// VRAI EXTRACTEUR GEMINI
async function extractDataWithLLM(userMessage: string, questionType: string, questionText: string): Promise<{ valid: boolean, value?: any, correction?: string }> {
  const systemPrompt = `
    Tu es un extracteur de données strict pour une IA de coaching.
    
    CONTEXTE :
    L'IA a posé la question : "${questionText}"
    Type attendu : "${questionType}"
    Réponse utilisateur : "${userMessage}"
    
    TA MISSION :
    1. Analyser si la réponse contient la donnée demandée.
    2. Si OUI, extraire la valeur standardisée (true/false pour boolean, nombre pour number).
    3. Si NON (ou ambigu), générer une phrase de correction polie pour redemander.
    
    SORTIE JSON :
    {
      "valid": true/false,
      "value": (la valeur si valid=true),
      "correction": (la phrase de relance si valid=false)
    }
  `

  try {
    const jsonStr = await generateWithGemini(systemPrompt, "Analyse cette réponse.", 0.1, true)
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error("Erreur extraction Gemini:", e)
    return { valid: false, correction: "Désolée, je n'ai pas compris. Peux-tu reformuler ?" }
  }
}

export async function runInvestigator(
  supabase: SupabaseClient, 
  userId: string, 
  message: string, 
  currentState: InvestigationState | null
): Promise<{ content: string, investigationComplete: boolean, newState: InvestigationState | null }> {

  // 1. INITIALISATION (Si premier appel)
  if (!currentState) {
    // TODO: Récupérer les vraies questions basées sur les modules actifs de l'user
    const initialQuestions: Question[] = [
      { id: 'cigarettes', text: "Combien de cigarettes as-tu fumé aujourd'hui ?", type: 'number' },
      { id: 'sport', text: "As-tu fait ta séance de sport ?", type: 'boolean' },
      { id: 'mood', text: "Sur une échelle de 1 à 10, comment te sens-tu ?", type: 'number' }
    ]

    return {
      content: initialQuestions[0].text,
      investigationComplete: false,
      newState: {
        step_index: 0,
        answers: {},
        questions: initialQuestions
      }
    }
  }

  // 2. TRAITEMENT DE LA RÉPONSE COURANTE
  const currentQ = currentState.questions[currentState.step_index]
  
  // Appel à Gemini Extracteur
  const extraction = await extractDataWithLLM(message, currentQ.type, currentQ.text)

  if (!extraction.valid) {
    return {
      content: extraction.correction || currentQ.text,
      investigationComplete: false,
      newState: currentState
    }
  }

  // 3. STOCKAGE DE LA RÉPONSE
  const updatedAnswers = { ...currentState.answers, [currentQ.id]: extraction.value }
  
  // 4. PASSAGE À LA SUIVANTE
  const nextIndex = currentState.step_index + 1

  if (nextIndex >= currentState.questions.length) {
    // FIN DU QUESTIONNAIRE
    console.log("Saving data for user:", userId, updatedAnswers)
    // TODO: Insérer dans module_tracking ici

    return {
      content: "Merci, c'est noté dans ton journal. Je mets à jour tes graphiques.",
      investigationComplete: true,
      newState: null
    }
  } else {
    // ON CONTINUE
    const nextQ = currentState.questions[nextIndex]
    
    // Transition fluide générée par Gemini ? Non, gardons simple pour la rapidité
    const transition = `C'est noté. ` 
    
    return {
      content: transition + nextQ.text,
      investigationComplete: false,
      newState: {
        ...currentState,
        step_index: nextIndex,
        answers: updatedAnswers
      }
    }
  }
}
