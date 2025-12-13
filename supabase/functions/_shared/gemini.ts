export async function generateWithGemini(
  systemPrompt: string, 
  userMessage: string, 
  temperature: number = 0.7,
  jsonMode: boolean = false,
  tools: any[] = []
): Promise<string | { tool: string, args: any }> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) {
    throw new Error('Clé API Gemini manquante')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

  const payload: any = {
    contents: [{ 
      role: "user",
      parts: [{ text: systemPrompt + "\n\nMessage Utilisateur:\n" + userMessage }] 
    }],
    generationConfig: {
      temperature: temperature,
    }
  }

  if (jsonMode) {
    payload.generationConfig.responseMimeType = "application/json"
  }

  if (tools && tools.length > 0) {
    payload.tools = [{ function_declarations: tools }];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini Error Payload:", errorData);
    throw new Error(`Erreur Gemini: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  
  // 1. Priorité absolue aux outils : On cherche SI n'importe quelle partie est un appel d'outil
  const toolCallPart = parts.find((p: any) => p.functionCall)
  
  if (toolCallPart) {
    console.log("Gemini Tool Call Found:", toolCallPart.functionCall.name)
    return {
      tool: toolCallPart.functionCall.name,
      args: toolCallPart.functionCall.args
    }
  }

  // 2. Sinon on prend le texte
  const textPart = parts.find((p: any) => p.text)
  const text = textPart?.text
  
  if (!text) throw new Error('Réponse vide de Gemini')

  return jsonMode ? text.replace(/```json\n?|```/g, '').trim() : text
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) throw new Error('Clé API Gemini manquante')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] }
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini Embedding Error:", errorData);
    throw new Error(`Erreur Embedding: ${response.statusText}`)
  }

  const data = await response.json()
  return data.embedding.values
}
