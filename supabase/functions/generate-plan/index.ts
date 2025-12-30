import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { retryOn429 } from "../_shared/retry429.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // DEBUG ENV VARS
  console.log("--- ENV VARS DEBUG ---");
  console.log("Keys available:", Object.keys(Deno.env.toObject()));
  console.log("GEMINI_API_KEY present?", !!Deno.env.get('GEMINI_API_KEY'));
  console.log("----------------------");

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse once so we can both support MEGA stub and also allow forcing real generation in local.
    const body = await req.json().catch(() => ({} as any))
    const forceRealGeneration = Boolean((body as any)?.force_real_generation)

    // Deterministic test mode (no network / no GEMINI_API_KEY required).
    // This function historically called Gemini directly; MEGA_TEST_MODE makes it stable for the mega runner.
    const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
    const isLocalSupabase =
      (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
      (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
    if (!forceRealGeneration && (megaRaw === "1" || (megaRaw === "" && isLocalSupabase))) {
      const { currentAxis, mode } = body as any;
      const axisTitle = currentAxis?.title ?? "Axe";
      const plan = {
        grimoireTitle: `MEGA_TEST_STUB: ${axisTitle}`,
        strategy: "MEGA_TEST_STUB: strategy",
        sophiaKnowledge: "MEGA_TEST_STUB: knowledge",
        context_problem: "MEGA_TEST_STUB: context_problem",
        identity: "MEGA_TEST_STUB: identity",
        deepWhy: "MEGA_TEST_STUB: deepWhy",
        goldenRules: "MEGA_TEST_STUB: goldenRules",
        vitalSignal: {
          name: "Sommeil (heures)",
          unit: "h",
          startValue: "7",
          targetValue: "8",
          tracking_type: "counter",
          type: "number",
        },
        maintenanceCheck: {
          question: "MEGA_TEST_STUB: maintenance question",
          frequency: "weekly",
          type: "reflection",
        },
        estimatedDuration: "4 semaines",
        phases: [
          {
            id: 1,
            title: `MEGA_TEST_STUB: Phase 1 (${mode ?? "standard"})`,
            subtitle: "Semaines 1-2",
            status: "active",
            actions: [
              {
                id: "a1",
                type: "habitude",
                title: "MEGA_TEST_STUB: Habitude",
                description: "MEGA_TEST_STUB: description",
                tracking_type: "boolean",
                time_of_day: "morning",
                targetReps: 7,
                isCompleted: false,
              },
              {
                id: "a2",
                type: "mission",
                title: "MEGA_TEST_STUB: Mission",
                description: "MEGA_TEST_STUB: description",
                tracking_type: "boolean",
                time_of_day: "any_time",
                isCompleted: false,
              },
              {
                id: "a3",
                type: "framework",
                title: "MEGA_TEST_STUB: Framework",
                description: "MEGA_TEST_STUB: description",
                tracking_type: "boolean",
                time_of_day: "evening",
                targetReps: 3,
                isCompleted: false,
                frameworkDetails: { type: "recurring", intro: "MEGA_TEST_STUB", sections: [{ id: "s1", label: "Q", inputType: "text", placeholder: "A" }] },
              },
            ],
          },
        ],
      };
      return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Auth & Client Setup - BYPASS TEMPORAIRE DEBUG
    // On ignore totalement l'auth Supabase pour voir si Gemini fonctionne
    
    // 2. Data Retrieval
    const { inputs, currentAxis, currentPlan, feedback, mode, answers, userProfile, previousPlanContext } = body as any
    
    // On utilise les réponses passées par le frontend
    const onboardingResponses = answers || {}

    let systemPrompt = '';
    let userPrompt = '';

    if (mode === 'refine' && currentPlan && feedback) {
        // ... (Existing Refine Logic) ...
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
          7. Assure-toi que chaque action a bien un "tracking_type" ('boolean' ou 'counter').
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

    } else if (mode === 'recraft' && previousPlanContext) {
        // --- MODE RECRAFT (REFAIRE UN PLAN ÉCHOUÉ) ---
        console.log("♻️ Mode Recraft activé. Historique récupéré.");

        systemPrompt = `
          Tu es Sophia, l'Architecte de Vie. L'utilisateur revient vers toi car le plan précédent n'a pas fonctionné.
          C'est une opportunité critique : tu dois analyser l'échec pour proposer une stratégie différente.
          
          TA MISSION :
          Générer un NOUVEAU plan de transformation complet pour l'utilisateur, formaté STRICTEMENT en JSON, en prenant en compte l'échec du précédent.
          
          RÈGLES SPÉCIFIQUES AU RECRAFT :
          1. Analyse pourquoi ça a raté (donné dans "RAISON DE L'ÉCHEC").
          2. Si c'était "trop dur", propose une approche "Tiny Habits" (très petits pas).
          3. Si c'était "ennuyeux", propose une approche plus ludique ou intense ("fast").
          4. Ne redonne PAS les mêmes actions qui ont échoué. Change d'angle d'attaque.
          
          RÈGLES DE DURÉE ET INTENSITÉ (PACING) :
          Adapte STRICTEMENT la structure selon le choix "pacing" de l'utilisateur :

          1. SI PACING = "fast" (Intense / Hyper motivé) :
             - Durée Totale : 4 semaines (1 mois).
             - Structure : 4 Phases de 1 semaine chacune.
             - Densité : Jusqu'à 3 actions par phase.
             - Ton : Radical, rapide, résultats immédiats.

          2. SI PACING = "balanced" (Progressif / Recommandé) :
             - Durée Totale : 8 semaines (2 mois).
             - Structure : 4 Phases de 2 semaines chacune (ex: Semaines 1-2, 3-4...).
             - Densité : 2 actions par phase maximum.
             - Ton : Équilibré, durable.

          3. SI PACING = "slow" (Prendre son temps / Douceur) :
             - Durée Totale : 12 semaines (3 mois).
             - Structure : 6 Phases de 2 semaines chacune.
             - Densité : 2 actions par phase maximum.
             - Ton : Micro-habitudes, très faible pression, ancrage profond.

          RÈGLES DE CONTENU (FLEXIBLE ET PERSONNALISÉ) :
          1.  **Structure** : Entre 3 et 6 phases maximum. 
              - Tu es LIBRE de définir le nombre de phases nécessaire pour atteindre l'objectif.
              - Les titres des phases doivent être CRÉATIFS, PERSONNALISÉS et ÉVOCATEURS (Pas de "Phase 1", "Phase 2" générique).
              - Exemple de bons titres : "Le Grand Nettoyage", "Protocole Sommeil Profond", "Mode Moine Activé", "L'Architecture Invisible".
          2.  **Densité et Distribution (CRITIQUE)** :
              - 1 à 3 actions par phase maximum.
              - **RÈGLE DE RATIO GLOBALE** : Sur la totalité du plan, tu DOIS respecter cette distribution :
                * 50% d'Habitudes ("habitude")
                * 25% de Missions ("mission")
                * 25% de Frameworks ("framework")
                (Exemple : Pour 8 actions au total -> 4 Habitudes, 2 Missions, 2 Frameworks).
              - Au moins 1 "Quête Principale" ('main') par phase.
          3.  **Types d'Actions** (CRITIQUE - STRICTES DÉFINITIONS) :
              - "habitude" (Groupe A) : Action RÉELLE et RÉPÉTITIVE (ex: "Faire 5min de cohérence cardiaque", "Rituel de relaxation", "Prendre ses compléments").
                * ATTENTION : Les exercices de respiration, méditation ou visualisation SONT DES HABITUDES (car c'est une action à faire, pas forcément à écrire).
                * A besoin de 'targetReps' (Combien de fois).
                * CONTRAINTE STRICTE : 'targetReps' DOIT être compris entre 7 (minimum, 1/jour) et 14 (maximum, 2/jour). Pas moins de 7.
              - "mission" (Groupe B) : Action RÉELLE "One-shot" à cocher (ex: "Acheter des boules Quies", "Ranger le bureau").
              - "framework" (Groupe B - TYPE SPÉCIAL) : EXERCICE D'ÉCRITURE ou de SAISIE.
                * L'utilisateur doit ÉCRIRE quelque chose dans l'interface.
                * Ce type est RÉSERVÉ aux actions nécessitant une INPUT CLAVIER (Journaling, Bilan, Worksheet).
                * Si l'action est juste "Réfléchir" ou "Méditer" sans rien noter, C'EST UNE HABITUDE.
                **IMPORTANT POUR FRAMEWORK** : 
                - Tu DOIS définir 'targetReps'.
                - Tu DOIS définir 'title'.
                - Tu DOIS inclure un objet "frameworkDetails" avec :
                - "type": "one_shot" ou "recurring"
                - "intro": (Texte inspirant)
                - "sections": Array de champs à remplir (id, label, inputType, placeholder).
              
          4.  **Actions Spéciales** :
              - "constat" (Groupe C) : Le KPI "Signe Vital" OBLIGATOIRE (métrique chiffrée à suivre). DOIT AVOIR UN NAME et un TYPE ('time', 'duration', 'number', 'range', 'text').
                * CRITIQUE : Ce signe doit être tracké CHAQUE JOUR. Ne donne PAS de métrique hebdomadaire.
                * Exemple : Pas de "Moyenne par semaine", mais "Temps de sommeil cette nuit" ou "Nombre de réveils cette nuit".
              - "surveillance" (Groupe D) : La question de maintenance OBLIGATOIRE.
          
          5.  **Stratégie Identitaire** : Identité, Pourquoi, Règles d'or.
          6.  **Métriques OBLIGATOIRES** : Tu dois inclure un objet "vitalSignal" (le KPI principal) et un objet "maintenanceCheck" (la question de suivi long terme) à la racine du JSON.
          7.  **Ce que Sophia sait déjà** : Tu dois générer un résumé synthétique de la situation de l'utilisateur ("sophiaKnowledge") qui explique ce que tu as compris de lui.
          8.  **Problème Contextuel (Grimoire)** : Tu dois générer un résumé court (2-3 phrases max) intitulé "context_problem" qui décrit la situation initiale, les blocages et le pourquoi de l'utilisateur. Ce texte servira de "Rappel du point de départ" dans le Grimoire une fois le plan terminé. Il doit être factuel mais empathique.
          9.  **Titre du Grimoire** : Tu dois inventer un nom ÉPIQUE, MYSTIQUE ou PUISSANT pour cette transformation spécifique (ex: "Le Protocole Phénix", "L'Architecture de l'Invisible", "La Citadelle du Calme"). Ce titre servira de nom d'archive dans le Grimoire de l'utilisateur.
          10. **Type de Tracking (NOUVEAU - CRITIQUE)** : 
              Pour CHAQUE action et pour le vitalSignal, tu DOIS ajouter le champ "tracking_type" :
              - "boolean" : Si c'est une action binaire (Fait/Pas fait). Ex: Sport, Méditation, Dormir.
              - "counter" : Si c'est une quantité accumulable. Ex: Cigarettes, Verres d'eau, Pages lues.
              
          11. **Timing de l'Action (NOUVEAU - CRITIQUE)** :
              Pour CHAQUE action, tu DOIS ajouter le champ "time_of_day" pour savoir QUAND vérifier l'action :
              - "morning" : Matin (au réveil, petit déj). Ex: Méditation, Sport matin.
              - "afternoon" : Midi/Après-midi.
              - "evening" : Soir (fin de journée, dîner).
              - "night" : Juste avant de dormir ou pendant la nuit (Sommeil). Ex: Couvre-feu digital, Dormir.
              - "any_time" : N'importe quand dans la journée.

          STRUCTURE JSON ATTENDUE (Exemple complet) :
          {
            "grimoireTitle": "Le Protocole Phénix",
            "strategy": "Phrase de synthèse de la méthode (ex: On répare le sommeil avant de toucher à la productivité).",
            "sophiaKnowledge": "Tu es un parent fatigué qui veut bien faire mais qui compense le stress par le scrolling. Ton environnement est bruyant.",
            "context_problem": "Tu te sentais épuisé par tes nuits hachées et tu n'arrivais plus à être patient avec tes enfants. Ton principal blocage était l'usage du téléphone au lit.",
            "identity": "Je suis un Athlète du Sommeil (Phrase d'identité au présent).",
            "deepWhy": "Pour avoir l'énergie d'être un père présent le soir (Motivation émotionnelle).",
            "goldenRules": "1. Jamais de téléphone dans la chambre.\\n2. Le lit ne sert qu'à dormir.\\n3. Si je ne dors pas en 20min, je me lève.",
            "vitalSignal": {
              "name": "Heure de coucher",
              "unit": "h",
              "startValue": "01:00",
              "targetValue": "22:30",
              "description": "On décalera progressivement de 15min tous les 3 jours.",
              "type": "time"
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
                    "rationale": "Réduit le cortisol pré-endormissement.",
                    "frameworkDetails": {
                        "type": "recurring",
                        "intro": "Le but est de vider ta RAM. Ne filtre rien. Si tu penses à ta liste de course, écris-la. Si tu es en colère contre ton chat, écris-le.",
                        "sections": [
                            { "id": "s1", "label": "Ce qui me préoccupe", "inputType": "textarea", "placeholder": "Je pense à..." },
                            { "id": "s2", "label": "Niveau de stress (1-10)", "inputType": "scale", "placeholder": "5" }
                        ]
                    }
                  }
                ]
              }
            ]
          }
        `;

        userPrompt = `
          PROFIL UTILISATEUR :
          - Axe prioritaire : ${currentAxis.title} (Thème: ${currentAxis.theme})
          - Problèmes spécifiques : ${JSON.stringify(currentAxis.problems)}
          - INFO PHYSIOLOGIQUE : ${userProfile ? `Né(e) le ${userProfile.birth_date}, Sexe: ${userProfile.gender}` : "Non renseigné"}
          
          HISTORIQUE DU PREMIER ESSAI (Ce qui était prévu à la base) :
          - Motivation Initiale : "${previousPlanContext.initialWhy}"
          - Blocages Initiaux : "${previousPlanContext.initialBlockers}"
          - Contexte Initial : "${previousPlanContext.initialContext}"
          
          POURQUOI ÇA A RATÉ (Le Recraft) :
          - RAISON DE L'ÉCHEC (Why) : "${inputs.why}"
          - NOUVEAUX BLOCAGES (Blockers) : "${inputs.blockers}"
          - NOUVEAU RYTHME SOUHAITÉ (Pacing) : "${inputs.pacing || 'balanced'}"
          
          DONNÉES BACKGROUND (Questionnaire) :
          ${JSON.stringify(onboardingResponses)}
          
          Génère le NOUVEAU JSON maintenant. Prends en compte l'échec pour ajuster le tir.
        `;

    } else {
        // --- MODE GÉNÉRATION STANDARD ---
        systemPrompt = `
          Tu es Sophia, l'Architecte de Vie ultime. Tu ne donnes pas des conseils génériques, tu construis des systèmes de comportement sur-mesure basés sur les neurosciences.
          
          TA MISSION :
          Générer un plan de transformation complet pour l'utilisateur, formaté STRICTEMENT en JSON.

          RÈGLES DE DURÉE ET INTENSITÉ (PACING) :
          Adapte STRICTEMENT la structure selon le choix "pacing" de l'utilisateur :

          1. SI PACING = "fast" (Intense / Hyper motivé) :
             - Durée Totale : 4 semaines (1 mois).
             - Structure : 4 Phases de 1 semaine chacune.
             - Densité : Jusqu'à 3 actions par phase.
             - Ton : Radical, rapide, résultats immédiats.

          2. SI PACING = "balanced" (Progressif / Recommandé) :
             - Durée Totale : 8 semaines (2 mois).
             - Structure : 4 Phases de 2 semaines chacune (ex: Semaines 1-2, 3-4...).
             - Densité : 2 actions par phase maximum.
             - Ton : Équilibré, durable.

          3. SI PACING = "slow" (Prendre son temps / Douceur) :
             - Durée Totale : 12 semaines (3 mois).
             - Structure : 6 Phases de 2 semaines chacune.
             - Densité : 2 actions par phase maximum.
             - Ton : Micro-habitudes, très faible pression, ancrage profond.

          RÈGLES DE CONTENU (FLEXIBLE ET PERSONNALISÉ) :
          1.  **Structure** : Entre 3 et 6 phases maximum. 
              - Tu es LIBRE de définir le nombre de phases nécessaire pour atteindre l'objectif.
              - Les titres des phases doivent être CRÉATIFS, PERSONNALISÉS et ÉVOCATEURS (Pas de "Phase 1", "Phase 2" générique).
              - Exemple de bons titres : "Le Grand Nettoyage", "Protocole Sommeil Profond", "Mode Moine Activé", "L'Architecture Invisible".
          2.  **Densité et Distribution (CRITIQUE)** :
              - 1 à 3 actions par phase maximum.
              - **RÈGLE DE RATIO GLOBALE** : Sur la totalité du plan, tu DOIS respecter cette distribution :
                * 50% d'Habitudes ("habitude")
                * 25% de Missions ("mission")
                * 25% de Frameworks ("framework")
                (Exemple : Pour 8 actions au total -> 4 Habitudes, 2 Missions, 2 Frameworks).
              - Au moins 1 "Quête Principale" ('main') par phase.
          3.  **Types d'Actions** :
              - "habitude" (Groupe A) : Action récurrente (ex: Couvre-feu digital). A besoin de 'targetReps'.
                * CONTRAINTE STRICTE : 'targetReps' DOIT être compris entre 7 (minimum, 1/jour) et 14 (maximum, 2/jour). Pas moins de 7.
              - "mission" (Groupe B) : Action logistique "One-shot" à cocher (ex: Acheter des boules Quies).
              - "framework" (Groupe B - TYPE SPÉCIAL) : C'est un EXERCICE D'ÉCRITURE ou de RÉFLEXION que l'utilisateur doit remplir DANS L'INTERFACE.
                **IMPORTANT** : 
                - Tu DOIS définir 'targetReps' pour ce type (Nombre de fois à réaliser, entre 1 et 30).
                - Tu DOIS inclure un objet "frameworkDetails" dans l'action avec :
                - "type": "one_shot" (une fois, targetReps=1) ou "recurring" (répétable, ex: journal, targetReps > 1)
                - "intro": (Texte court expliquant l'exercice ou donnant de l'inspiration. Sois concrète et inspirante.)
                - "sections": Array de champs à remplir. Chaque champ doit avoir : 
                    - "id": string unique
                    - "label": string (La question posée)
                    - "inputType": Choisir le plus adapté :
                        * "text" (Réponse courte unique)
                        * "textarea" (Réflexion longue, Journaling)
                        * "scale" (Note de 1 à 10)
                        * "list" (Liste à puces dynamique - Pour accumuler plusieurs éléments)
                        * "categorized_list" (Liste structurée Tâche + Catégorie - ex: Matrice Eisenhower, Inventaire)
                    - "placeholder": (Exemple de réponse ou début de phrase. Pour categorized_list: "Tâche...|Catégorie...")
              
          4.  **Actions Spéciales** :
              - "constat" (Groupe C) : Le KPI "Signe Vital" OBLIGATOIRE (métrique chiffrée à suivre).
                * CRITIQUE : Ce signe doit être tracké CHAQUE JOUR. Ne donne PAS de métrique hebdomadaire.
                * Exemple : Pas de "Moyenne par semaine", mais "Temps de sommeil cette nuit" ou "Nombre de réveils cette nuit".
              - "surveillance" (Groupe D) : La question de maintenance OBLIGATOIRE.
          
          5.  **Stratégie Identitaire** : Identité, Pourquoi, Règles d'or.
          6.  **Métriques OBLIGATOIRES** : Tu dois inclure un objet "vitalSignal" (le KPI principal) et un objet "maintenanceCheck" (la question de suivi long terme) à la racine du JSON.
          7.  **Ce que Sophia sait déjà** : Tu dois générer un résumé synthétique de la situation de l'utilisateur ("sophiaKnowledge") qui explique ce que tu as compris de lui.
          8.  **Problème Contextuel (Grimoire)** : Tu dois générer un résumé court (2-3 phrases max) intitulé "context_problem" qui décrit la situation initiale, les blocages et le pourquoi de l'utilisateur. Ce texte servira de "Rappel du point de départ" dans le Grimoire une fois le plan terminé. Il doit être factuel mais empathique.
          9.  **Titre du Grimoire** : Tu dois inventer un nom ÉPIQUE, MYSTIQUE ou PUISSANT pour cette transformation spécifique (ex: "Le Protocole Phénix", "L'Architecture de l'Invisible", "La Citadelle du Calme"). Ce titre servira de nom d'archive dans le Grimoire de l'utilisateur.
          10. **Type de Tracking (NOUVEAU - CRITIQUE)** : 
              Pour CHAQUE action et pour le vitalSignal, tu DOIS ajouter le champ "tracking_type" :
              - "boolean" : Si c'est une action binaire (Fait/Pas fait). Ex: Sport, Méditation, Dormir.
              - "counter" : Si c'est une quantité accumulable. Ex: Cigarettes, Verres d'eau, Pages lues.
              
          11. **Timing de l'Action (NOUVEAU - CRITIQUE)** :
              Pour CHAQUE action, tu DOIS ajouter le champ "time_of_day" pour savoir QUAND vérifier l'action :
              - "morning" : Matin (au réveil, petit déj). Ex: Méditation, Sport matin.
              - "afternoon" : Midi/Après-midi.
              - "evening" : Soir (fin de journée, dîner).
              - "night" : Juste avant de dormir ou pendant la nuit (Sommeil). Ex: Couvre-feu digital, Dormir.
              - "any_time" : N'importe quand dans la journée.

          STRUCTURE JSON ATTENDUE (Exemple complet) :
          {
            "grimoireTitle": "Le Protocole Phénix",
            "strategy": "Phrase de synthèse de la méthode (ex: On répare le sommeil avant de toucher à la productivité).",
            "sophiaKnowledge": "Tu es un parent fatigué qui veut bien faire mais qui compense le stress par le scrolling. Ton environnement est bruyant.",
            "context_problem": "Tu te sentais épuisé par tes nuits hachées et tu n'arrivais plus à être patient avec tes enfants. Ton principal blocage était l'usage du téléphone au lit.",
            "identity": "Je suis un Athlète du Sommeil (Phrase d'identité au présent).",
            "deepWhy": "Pour avoir l'énergie d'être un père présent le soir (Motivation émotionnelle).",
            "goldenRules": "1. Jamais de téléphone dans la chambre.\\n2. Le lit ne sert qu'à dormir.\\n3. Si je ne dors pas en 20min, je me lève.",
            "vitalSignal": {
              "name": "Heure de coucher",
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
                    "rationale": "Réduit le cortisol pré-endormissement.",
                    "frameworkDetails": {
                        "type": "recurring",
                        "intro": "Le but est de vider ta RAM. Ne filtre rien. Si tu penses à ta liste de course, écris-la. Si tu es en colère contre ton chat, écris-le.",
                        "sections": [
                            { "id": "s1", "label": "Ce qui me préoccupe", "inputType": "textarea", "placeholder": "Je pense à..." },
                            { "id": "s2", "label": "Niveau de stress (1-10)", "inputType": "scale", "placeholder": "5" }
                        ]
                    }
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
          - INFO PHYSIOLOGIQUE : ${userProfile ? `Né(e) le ${userProfile.birth_date}, Sexe: ${userProfile.gender}` : "Non renseigné"}
          
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
    // RETRY LOGIC for 429
    const MAX_ATTEMPTS = 20; // Tentatives max (environ 100s d'attente max) pour absorber les pics
    const response = await retryOn429(
      () =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
              generationConfig: { responseMimeType: "application/json" }
            })
          }
        ),
      { maxAttempts: MAX_ATTEMPTS, delayMs: 5000 },
    )

    const data = await response.json()
    
    // LOG DEBUG
    console.log("Gemini Response Status:", response.status);
    
    if (!response.ok) {
        console.log("Gemini Error Body:", JSON.stringify(data, null, 2));
        
        // GESTION ERREUR 429 (QUOTA EXCEEDED) - Si on arrive ici c'est que les retries ont échoué
        if (response.status === 429) {
            throw new Error('Le cerveau de Sophia est en surchauffe (Quota atteint). Veuillez réessayer dans quelques minutes.')
        }

        const errorMessage = data.error?.message || 'Erreur inconnue de Gemini';
        throw new Error(`Erreur Gemini (${response.status}): ${errorMessage}`);
    } else {
        // Vérifions si candidates est vide
        if (!data.candidates || data.candidates.length === 0) {
             console.log("Gemini OK but no candidates:", JSON.stringify(data, null, 2));
             // Parfois Gemini renvoie OK mais filtre tout le contenu (Safety settings)
             if (data.promptFeedback?.blockReason) {
                 throw new Error(`Génération bloquée par sécurité: ${data.promptFeedback.blockReason}`);
             }
        }
    }

    // 5. Parsing & Cleanup
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) throw new Error('Réponse vide de Gemini (structure inattendue)')
    
    // Nettoyage plus robuste : extraction du JSON entre les accolades
    // On cherche la première accolade ouvrante et la dernière fermante
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    
    let jsonString;
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonString = rawText.substring(firstBrace, lastBrace + 1);
    } else {
        // Fallback si pas d'accolades (peu probable)
        jsonString = rawText.replace(/```json\n?|```/g, '').trim()
    }

    let plan;
    try {
        plan = JSON.parse(jsonString)
    } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        console.error("Raw Text:", rawText);
        console.error("Extracted String:", jsonString);
        throw new Error(`Erreur de syntaxe JSON dans la réponse IA: ${parseError.message}`);
    }

    // Normalize: ensure required fields exist even if the model forgets them.
    // This makes the function resilient and keeps the app + tests stable.
    try {
      if (plan && Array.isArray(plan.phases)) {
        for (const phase of plan.phases) {
          const actions = phase?.actions;
          if (!Array.isArray(actions)) continue;
          for (const a of actions) {
            if (!a) continue;
            if (!a.tracking_type) a.tracking_type = "boolean";
            if (!a.time_of_day) a.time_of_day = "any_time";
          }
        }
      }
    } catch {
      // best-effort only
    }

    return new Response(
      JSON.stringify(plan),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Func Error:', error)
    // On renvoie 200 (OK) même en cas d'erreur pour que le client Supabase puisse lire le JSON de l'erreur
    // au lieu de lancer une exception générique "FunctionsHttpError".
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
