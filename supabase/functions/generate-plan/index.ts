import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Auth & Client Setup - BYPASS TEMPORAIRE DEBUG
    // On ignore totalement l'auth Supabase pour voir si Gemini fonctionne
    
    // 2. Data Retrieval
    const { inputs, currentAxis, currentPlan, feedback, mode, answers } = await req.json()
    
    // On utilise les réponses passées par le frontend
    const onboardingResponses = answers || {}

    let systemPrompt = '';
    let userPrompt = '';

    if (mode === 'refine' && currentPlan && feedback) {
        console.log("🛠️ Mode Refine activé avec feedback :", feedback);
        
        systemPrompt = `
          Tu es Sophia. L'utilisateur veut modifier son plan d'action existant.
          Ton but est de mettre à jour le JSON du plan pour respecter STRICTEMENT son feedback.

          RÈGLES IMPÉRATIVES :
          1. Conserve la structure JSON intacte (mêmes clés, mêmes types).
          2. Ne modifie QUE ce qui est nécessaire pour répondre au feedback.
          3. Si l'utilisateur dit "c'est trop dur", allège le rythme ou supprime des actions complexes.
          4. Si l'utilisateur veut changer une action spécifique, remplace-la par une alternative pertinente.
          5. Si l'utilisateur demande de changer le rythme (ex: "plus lent"), ajuste la durée (estimatedDuration) et la densité des actions.
          6. Renvoie UNIQUEMENT le JSON complet mis à jour.
        `;

        userPrompt = `
          PLAN ACTUEL (JSON) :
          ${JSON.stringify(currentPlan)}

          FEEDBACK UTILISATEUR :
          "${feedback}"

          CONTEXTE INITIAL :
          - Motivation : "${inputs.why}"
          - Blocages : "${inputs.blockers}"
          - Contexte : "${inputs.context}"

          DONNÉES BACKGROUND (Questionnaire) :
          ${JSON.stringify(onboardingResponses)}

          INSTRUCTION :
          Mets à jour le plan en prenant en compte le feedback. Si le feedback est flou, interprète-le de manière bienveillante pour aider l'utilisateur.
          Renvoie le JSON complet.
        `;

    } else {
        // --- MODE GÉNÉRATION STANDARD ---
        systemPrompt = `
          Tu es Sophia, l'Architecte de Vie ultime. Tu ne donnes pas des conseils génériques, tu construis des systèmes de comportement sur-mesure basés sur les neurosciences.
          
          ... (Reste du prompt inchangé pour brevity si possible, mais je dois le remettre car je remplace tout le bloc)


          TA MISSION :
          Générer un plan de transformation complet pour l'utilisateur, formaté STRICTEMENT en JSON.

          RÈGLES DE DURÉE ET INTENSITÉ :
          - Le plan complet doit durer entre 4 et 12 semaines.
          - ADAPTE L'INTENSITÉ SELON LA DEMANDE DE L'UTILISATEUR ("Pacing") :
            * "fast" (Intense) : Actions radicales, phases courtes (4-6 semaines), charge cognitive élevée.
            * "balanced" (Progressif) : Équilibre classique, durée moyenne (8 semaines).
            * "slow" (Douceur) : Micro-habitudes très faciles, phases longues (10-12 semaines), charge très faible.

          RÈGLES DE CONTENU (FLEXIBLE ET PERSONNALISÉ) :
          1.  **Structure** : Entre 3 et 6 phases maximum. 
              - Tu es LIBRE de définir le nombre de phases nécessaire pour atteindre l'objectif.
              - Les titres des phases doivent être CRÉATIFS, PERSONNALISÉS et ÉVOCATEURS (Pas de "Phase 1", "Phase 2" générique).
              - Exemple de bons titres : "Le Grand Nettoyage", "Protocole Sommeil Profond", "Mode Moine Activé", "L'Architecture Invisible".
          2.  **Densité** : 1 à 3 actions par phase maximum :
              - Au moins 1 "Quête Principale" ('main') par phase.
              - Optionnel : 1 ou 2 "Quêtes Secondaires" ('side') pour soutenir.
          3.  **Types d'Actions** :
              - "habitude" (Groupe A) : Action récurrente (ex: Couvre-feu digital). A besoin de 'targetReps'.
              - "mission" (Groupe B) : Action logistique "One-shot" à cocher (ex: Acheter des boules Quies).
              - "framework" (Groupe B - TYPE SPÉCIAL) : C'est un EXERCICE D'ÉCRITURE ou de RÉFLEXION que l'utilisateur doit remplir DANS L'INTERFACE. Ce N'EST PAS une action physique comme "respirer". C'est "Remplir le journal", "Compléter le bilan", "Écrire la lettre". La description doit être explicite sur ce qu'il faut saisir.
          4.  **Actions Spéciales** :
              - "constat" (Groupe C) : Le KPI "Signe Vital" OBLIGATOIRE (métrique chiffrée à suivre).
              - "surveillance" (Groupe D) : La question de maintenance OBLIGATOIRE.
          
          5.  **Stratégie Identitaire** : Identité, Pourquoi, Règles d'or.
          6.  **Métriques OBLIGATOIRES** : Tu dois inclure un objet "vitalSignal" (le KPI principal) et un objet "maintenanceCheck" (la question de suivi long terme) à la racine du JSON.
          7.  **Ce que Sophia sait déjà** : Tu dois générer un résumé synthétique de la situation de l'utilisateur ("sophiaKnowledge") qui explique ce que tu as compris de lui.

          STRUCTURE JSON ATTENDUE (Exemple complet) :
          {
            "strategy": "Phrase de synthèse de la méthode (ex: On répare le sommeil avant de toucher à la productivité).",
            "sophiaKnowledge": "Tu es un parent fatigué qui veut bien faire mais qui compense le stress par le scrolling. Ton environnement est bruyant.",
            "identity": "Je suis un Athlète du Sommeil (Phrase d'identité au présent).",
            "deepWhy": "Pour avoir l'énergie d'être un père présent le soir (Motivation émotionnelle).",
            "goldenRules": "1. Jamais de téléphone dans la chambre.\\n2. Le lit ne sert qu'à dormir.\\n3. Si je ne dors pas en 20min, je me lève.",
            "vitalSignal": {
              "name": "Heure de coucher moyenne",
              "unit": "h",
              "startValue": "01:00",
              "targetValue": "22:30",
              "description": "On décalera progressivement de 15min tous les 3 jours.",
              "type": "constat"
            },
            "maintenanceCheck": {
              "question": "Combien de fois t'es-tu couché après minuit cette semaine ?",
              "frequency": "hebdomadaire",
              "type": "surveillance"
            },
            "estimatedDuration": "8 semaines",
            "phases": [
              {
                "id": 1,
                "title": "Phase 1 : La Fondation - Le Nettoyage",
                "subtitle": "Semaines 1-2 • Sortir de la zone rouge",
                "rationale": "C'est la fondation car on ne peut pas construire sur un terrain miné par la dopamine facile.",
                "status": "active",
                "actions": [
                  {
                    "id": "a1",
                    "type": "mission",
                    "title": "Le Grand Reset",
                    "description": "Sortir tous les écrans de la chambre définitivement.",
                    "questType": "main",
                    "tips": "Achète un réveil analogique à 10€.",
                    "rationale": "Ton cerveau associe la chambre au scroll. Il faut briser ce lien spatial."
                  },
                  {
                    "id": "a2",
                    "type": "framework",
                    "title": "Journal de décharge mentale",
                    "description": "Écrire tout ce qui tourne en boucle dans ta tête avant de dormir sur papier.",
                    "questType": "side",
                    "tips": "Ne cherche pas à faire joli, vide juste ton cache.",
                    "rationale": "Réduit le cortisol pré-endormissement."
                  }
                ]
              }
            ]
          }
        `

        userPrompt = `
          PROFIL UTILISATEUR :
          - Axe prioritaire : ${currentAxis.title} (Thème: ${currentAxis.theme})
          - Problèmes spécifiques : ${JSON.stringify(currentAxis.problems)}
          
          SES MOTS (Analyse psychologique requise) :
          - Motivation (Why) : "${inputs.why}"
          - Blocages (Blockers) : "${inputs.blockers}"
          - Contexte : "${inputs.context}"
          - RYTHME SOUHAITÉ (PACING) : "${inputs.pacing || 'balanced'}"
          
          DONNÉES BACKGROUND (Questionnaire) :
          ${JSON.stringify(onboardingResponses)}
          
          Génère le JSON maintenant. Pas de markdown, pas de texte avant/après. Juste le JSON.
        `
    }

    // 4. Gemini API Call
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    
    if (!GEMINI_API_KEY) {
      console.error("CRITICAL: GEMINI_API_KEY is missing from env vars.")
      throw new Error('Configuration serveur incomplète (Clé API manquante)')
    }
    
    console.log("Calling Gemini API with key length:", GEMINI_API_KEY.length)

    // Utilisation du modèle spécifié par l'utilisateur (Modèle 2.0 Flash)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    )

    const data = await response.json()
    
    // LOG DEBUG
    console.log("Gemini Response Status:", response.status);
    if (!response.ok) {
        console.log("Gemini Error Body:", JSON.stringify(data, null, 2));
    } else {
        // Vérifions si candidates est vide
        if (!data.candidates || data.candidates.length === 0) {
             console.log("Gemini OK but no candidates:", JSON.stringify(data, null, 2));
        }
    }

    // 5. Parsing & Cleanup
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) throw new Error('Réponse vide de Gemini')
    
    const jsonString = rawText.replace(/```json\n?|```/g, '').trim()
    const plan = JSON.parse(jsonString)

    return new Response(
      JSON.stringify(plan),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Func Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
