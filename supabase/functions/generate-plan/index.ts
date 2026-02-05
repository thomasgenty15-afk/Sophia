import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { retryOn429 } from "../_shared/retry429.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts"
import { validatePlan } from "../_shared/plan-validator.ts"
import { getRequestContext } from "../_shared/request_context.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req)
  }
  const corsErr = enforceCors(req)
  if (corsErr) return corsErr
  const corsHeaders = getCorsHeaders(req)

  let ctx = getRequestContext(req)

  try {
    // Parse once so we can both support MEGA stub and also allow forcing real generation in local.
    const body = await req.json().catch(() => ({} as any))
    ctx = getRequestContext(req, body)
    const forceRealGeneration = Boolean((body as any)?.force_real_generation)

    // Deterministic test mode (no network / no GEMINI_API_KEY required).
    // This function historically called Gemini directly; MEGA_TEST_MODE makes it stable for the mega runner.
    const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
    const isLocalSupabase =
      (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
      (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
    if (!forceRealGeneration && (megaRaw === "1" || (megaRaw === "" && isLocalSupabase))) {
      const { currentAxis, mode, inputs } = body as any;
      const axisTitle = currentAxis?.title ?? "Axe";
      const pacing = (inputs?.pacing ?? "balanced") as string;
      const durationByPacing: Record<string, { estimatedDuration: "1 mois" | "2 mois" | "3 mois"; subtitles: string[] }> = {
        fast: { estimatedDuration: "1 mois", subtitles: ["Semaine 1", "Semaine 2", "Semaine 3", "Semaine 4"] },
        balanced: { estimatedDuration: "2 mois", subtitles: ["Semaines 1-2", "Semaines 3-4", "Semaines 5-6", "Semaines 7-8"] },
        slow: { estimatedDuration: "3 mois", subtitles: ["Semaines 1-3", "Semaines 4-6", "Semaines 7-9", "Semaines 10-12"] },
      };
      const pacingCfg = durationByPacing[pacing] ?? durationByPacing.balanced;

      const mkActions = (phaseIdx: number) => ([
        {
          id: `h_${phaseIdx}`,
          type: "habitude",
          title: `MEGA_TEST_STUB: Habitude P${phaseIdx}`,
          description: "MEGA_TEST_STUB: description",
          tracking_type: "boolean",
          time_of_day: "morning",
          targetReps: 7,
        },
        // Alterner entre mission et framework pour les phases paires/impaires
        phaseIdx % 2 === 1
          ? {
          id: `m_${phaseIdx}`,
          type: "mission",
          title: `MEGA_TEST_STUB: Mission P${phaseIdx}`,
          description: "MEGA_TEST_STUB: description",
          tracking_type: "boolean",
          time_of_day: "any_time",
            }
          : {
          id: `f_${phaseIdx}`,
          type: "framework",
          title: `MEGA_TEST_STUB: Framework P${phaseIdx}`,
          description: "MEGA_TEST_STUB: description",
          tracking_type: "boolean",
          time_of_day: "evening",
          targetReps: 1,
          frameworkDetails: { type: "one_shot", intro: "MEGA_TEST_STUB", sections: [{ id: "s1", label: "Q", inputType: "text", placeholder: "A" }] },
        },
      ]);

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
        estimatedDuration: pacingCfg.estimatedDuration,
        phases: Array.from({ length: 4 }).map((_, idx) => ({
          id: idx + 1,
          title: `MEGA_TEST_STUB: Phase ${idx + 1} (${mode ?? "standard"})`,
          subtitle: pacingCfg.subtitles[idx]!,
          // Status convention used by Dashboard:
          // - Phase 1 is active
          // - Other phases are locked until unlocked by progression
          status: idx === 0 ? "active" : "locked",
          actions: mkActions(idx + 1),
        })),
      };
      // Validate in stub mode too, to guarantee deterministic conformity.
      const validated = validatePlan(plan);
      return new Response(JSON.stringify(validated), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim()
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    // 2. Data Retrieval
    const { inputs, currentAxis, currentPlan, feedback, mode, answers, userProfile, previousPlanContext } = body as any
    
    // On utilise les réponses passées par le frontend
    const onboardingResponses = answers || {}
    const assistantContext =
      (onboardingResponses as any)?.assistant_context || (onboardingResponses as any)?.assistantContext || null
    const assistantContextBlock = assistantContext
      ? `
          CE QUE SOPHIA SAIT DÉJÀ (PRIORITÉ ÉLEVÉE) :
          ${JSON.stringify(assistantContext, null, 2)}
          
        `
      : ""

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
          5. Si l'utilisateur demande de changer le rythme (ex: "plus lent"), applique STRICTEMENT les règles de pacing suivantes :
             - fast : 4 semaines (1 mois) = 4 phases de 1 semaine, 2 actions par phase.
             - balanced : 8 semaines (2 mois) = 4 phases de 2 semaines, 2 actions par phase.
             - slow : 12 semaines (3 mois) = 4 phases de 3 semaines, 2 actions par phase.
             => Si le rythme change, mets à jour estimatedDuration + sous-titres des phases + nombre de phases + actions par phase pour respecter ces contraintes.
          6. Renvoie UNIQUEMENT le JSON complet mis à jour.
          7. Assure-toi que chaque action a bien un "tracking_type" ('boolean' ou 'counter').

          STATUTS / VERROUILLAGE (CRITIQUE) :
          - Tu DOIS mettre exactement 1 phase en "active" : la phase 1.
          - Les phases 2 à 4 DOIVENT être "locked".
          - Tu NE DOIS PAS activer des phases futures. Le déblocage se fait plus tard via la progression.
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

          ${assistantContextBlock}

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
          
          RÈGLES DE DURÉE ET STRUCTURE (PACING) — STRICTES :
          Le plan DOIT être construit en PHASES, et la structure dépend du choix "pacing".
          Ces règles sont NON-NÉGOCIABLES : tu dois les respecter à la lettre.

          1) SI PACING = "fast" (Intense / Hyper motivé) :
             - Durée totale : 1 mois (4 semaines).
             - Structure : 4 phases de 1 semaine chacune.
             - Sous-titres : Semaine 1, Semaine 2, Semaine 3, Semaine 4.
             - estimatedDuration DOIT être exactement : "1 mois".

          2) SI PACING = "balanced" (Progressif / Recommandé) :
             - Durée totale : 2 mois (8 semaines).
             - Structure : 4 phases de 2 semaines chacune.
             - Sous-titres : Semaines 1-2, 3-4, 5-6, 7-8.
             - estimatedDuration DOIT être exactement : "2 mois".

          3) SI PACING = "slow" (Prendre son temps / Douceur) :
             - Durée totale : 3 mois (12 semaines).
             - Structure : 4 phases de 3 semaines chacune.
             - Sous-titres : Semaines 1-3, 4-6, 7-9, 10-12.
             - estimatedDuration DOIT être exactement : "3 mois".

          RÈGLES DE DENSITÉ — STRICTES :
          - Tu DOIS produire EXACTEMENT 4 phases (ni plus, ni moins).
          - Tu DOIS produire EXACTEMENT 2 actions par phase (donc 8 actions au total).
          - CHAQUE PHASE DOIT contenir EXACTEMENT 1 habitude. C'est NON-NÉGOCIABLE.

          STATUTS / VERROUILLAGE (CRITIQUE) :
          - Tu DOIS mettre exactement 1 phase en "active" : la phase 1.
          - Les phases 2 à 4 DOIVENT être "locked".
          - Ne mets PAS plusieurs phases en "active".

          RÈGLES DE CONTENU (PERSONNALISÉ) :
          1. **Titres des phases** : Créatifs, personnalisés, évocateurs (pas de "Phase 1" générique).
             - Exemples : "Le Grand Nettoyage", "Protocole Sommeil Profond", "Mode Moine Activé", "L'Architecture Invisible".
          2. **Distribution (CRITIQUE)** :
              - **RÈGLE DE RATIO GLOBALE** : Sur la totalité du plan :
                * 4 Habitudes OBLIGATOIRES (1 par phase)
                * Les 4 autres actions sont des Missions ("mission") ou Frameworks ("framework")
                (Exemple : Pour 8 actions au total -> 4 Habitudes + 2 Missions + 2 Frameworks).
              - Au moins 1 "Quête Principale" ('main') par phase.
          3.  **Types d'Actions** (CRITIQUE - STRICTES DÉFINITIONS) :
              - "habitude" (Groupe A) : Action RÉELLE et RÉPÉTITIVE (ex: "Faire 5min de cohérence cardiaque", "Rituel de relaxation", "Prendre ses compléments").
                * ATTENTION : Les exercices de respiration, méditation ou visualisation SONT DES HABITUDES (car c'est une action à faire, pas forcément à écrire).
                * A besoin de 'targetReps' = FRÉQUENCE HEBDO (Combien de fois / semaine).
                * CONTRAINTE : 'targetReps' DOIT être compris entre 1 et 6 (recommandé: 2 à 5). 
                * Optionnel : tu peux ajouter "scheduledDays": ["mon","wed","fri"] si tu veux proposer des jours, sinon ne mets pas ce champ.
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
            "estimatedDuration": "2 mois",
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
          
          ${assistantContextBlock}

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

          PROGRESSION (CRITIQUE — OBLIGATOIRE) :
          - Le plan doit être INCRÉMENTAL : on commence très facile, puis on augmente la difficulté/engagement à chaque phase.
          - Principe : Phase 1 = friction minimale (facile à réussir même fatigué), Phase 4 = plus exigeant/structurant.
          - Pour l'action "habitude" (hebdo), respecte une rampe de fréquence selon le pacing choisi :
            * fast     : Phase 1=3×/semaine, Phase 2=4×, Phase 3=5×, Phase 4=6×
            * balanced : Phase 1=2×/semaine, Phase 2=3×, Phase 3=4×, Phase 4=5×
            * slow     : Phase 1=1×/semaine, Phase 2=2×, Phase 3=3×, Phase 4=4×
          - IMPORTANT : ne JAMAIS mettre 7×/semaine. Maximum = 6×/semaine pour une habitude.
          - Choisis les actions en tenant compte de la "capacité" implicite de l'utilisateur (contexte, énergie, blocages, rythme/pacing).
          - Évite les contraintes très strictes ("absolu", "jamais", "tous les jours") en Phase 1 sauf si l'utilisateur l'a explicitement demandé.

          RÈGLES DE DURÉE ET STRUCTURE (PACING) — STRICTES :
          Le plan DOIT être construit en PHASES, et la structure dépend du choix "pacing".
          Ces règles sont NON-NÉGOCIABLES : tu dois les respecter à la lettre.

          1) SI PACING = "fast" (Intense / Hyper motivé) :
             - Durée totale : 1 mois (4 semaines).
             - Structure : 4 phases de 1 semaine chacune.
             - Sous-titres : Semaine 1, Semaine 2, Semaine 3, Semaine 4.
             - estimatedDuration DOIT être exactement : "1 mois".

          2) SI PACING = "balanced" (Progressif / Recommandé) :
             - Durée totale : 2 mois (8 semaines).
             - Structure : 4 phases de 2 semaines chacune.
             - Sous-titres : Semaines 1-2, 3-4, 5-6, 7-8.
             - estimatedDuration DOIT être exactement : "2 mois".

          3) SI PACING = "slow" (Prendre son temps / Douceur) :
             - Durée totale : 3 mois (12 semaines).
             - Structure : 4 phases de 3 semaines chacune.
             - Sous-titres : Semaines 1-3, 4-6, 7-9, 10-12.
             - estimatedDuration DOIT être exactement : "3 mois".

          RÈGLES DE DENSITÉ — STRICTES :
          - Tu DOIS produire EXACTEMENT 4 phases (ni plus, ni moins).
          - Tu DOIS produire EXACTEMENT 2 actions par phase (donc 8 actions au total).
          - CHAQUE PHASE DOIT contenir EXACTEMENT 1 habitude. C'est NON-NÉGOCIABLE.

          STATUTS / VERROUILLAGE (CRITIQUE) :
          - Tu DOIS mettre exactement 1 phase en "active" : la phase 1.
          - Les phases 2 à 4 DOIVENT être "locked".
          - Ne mets PAS plusieurs phases en "active".

          RÈGLES DE CONTENU (PERSONNALISÉ) :
          1. **Titres des phases** : Créatifs, personnalisés, évocateurs (pas de "Phase 1" générique).
             - Exemples : "Le Grand Nettoyage", "Protocole Sommeil Profond", "Mode Moine Activé", "L'Architecture Invisible".
          2. **Distribution (CRITIQUE)** :
              - **RÈGLE DE RATIO GLOBALE** : Sur la totalité du plan :
                * 4 Habitudes OBLIGATOIRES (1 par phase)
                * Les 4 autres actions sont des Missions ("mission") ou Frameworks ("framework")
                (Exemple : Pour 8 actions au total -> 4 Habitudes + 2 Missions + 2 Frameworks).
              - OBLIGATOIRE : Chaque phase contient exactement 2 actions : 1 "Quête Principale" (questType="main") et 1 "Quête Secondaire" (questType="side").
          3.  **Types d'Actions** :
              - "habitude" (Groupe A) : Action récurrente (ex: Couvre-feu digital). A besoin de 'targetReps'.
                * 'targetReps' = FRÉQUENCE HEBDO (fois / semaine), entre 1 et 6 (recommandé: 2 à 5).
                * Optionnel : "scheduledDays": ["mon","wed","fri"] si tu proposes des jours. Sinon ne mets pas ce champ.
              - "mission" (Groupe B) : Action "one-shot" concrète à faire dans la vraie vie, à cocher. PAS un exercice à remplir dans l'interface.
                * Si l'action consiste surtout à écrire/structurer/répondre à des questions => ce n'est PAS une mission, c'est un framework.
              - "framework" (Groupe B - TYPE SPÉCIAL) : EXERCICE à remplir DANS L'INTERFACE (questions, fiche, journaling, to-do list, worksheet).
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
                * IMPORTANT : Les champs "startValue" et "targetValue" doivent TOUJOURS être des chaînes de caractères (ex: "5", "10 min", "01:00"), même si ce sont des nombres.
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
            "estimatedDuration": "2 mois",
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
          
          ${assistantContextBlock}

          DONNÉES BACKGROUND (Questionnaire) :
          ${JSON.stringify(onboardingResponses)}
          
          Génère le JSON maintenant. Pas de markdown, pas de texte avant/après. Juste le JSON.
        `
    }

    // 4. LLM API Call (critical mode: gpt-5.2 → gemini-2.5-flash → gpt-5-mini)
    // Uses generateWithGemini which handles multi-provider fallback chain.
    const requestId = ctx.requestId ?? crypto.randomUUID();
    
    // Model policy: critical mode (gpt-5.2) for plan generation - complex reasoning required.
    // Can be overridden by env vars if needed.
    const planModel =
      (Deno.env.get("GEMINI_PLAN_MODEL") ?? "").trim() || "gpt-5.2";

    console.log("[generate-plan] Using critical model chain starting with:", planModel);

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    let lastValidationFeedback = "";

    const formatValidationError = (err: any) => {
      const issues = (err?.issues ?? err?.errors ?? []) as any[];
      if (Array.isArray(issues) && issues.length > 0) {
        return issues
          .slice(0, 8)
          .map((i) => {
            const path = Array.isArray(i?.path) ? i.path.join(".") : String(i?.path ?? "");
            const msg = String(i?.message ?? "invalid");
            return path ? `${path}: ${msg}` : msg;
          })
          .join(" | ");
      }
      return String(err?.message ?? err ?? "invalid_plan");
    };

    const normalizePlanForValidation = (raw: any, pacing?: string) => {
      const plan = raw && typeof raw === "object" ? raw : {};

      // estimatedDuration fallback (helps if the model forgets this field)
      if (!plan.estimatedDuration) {
        const p = (pacing ?? "").toLowerCase().trim();
        plan.estimatedDuration = p === "fast" ? "1 mois" : p === "slow" ? "3 mois" : "2 mois";
      }

      // Progressive ramp (deterministic): enforce habit frequency per phase based on pacing.
      // Goal: avoid "too hard too soon" (e.g., 7x/week in phase 1) and make plans incremental.
      const rampByPacing: Record<string, number[]> = {
        // Never 7×/week (discouraging). Cap habits at 6×/week max.
        fast: [3, 4, 5, 6],
        balanced: [2, 3, 4, 5],
        slow: [1, 2, 3, 4],
      };
      const ramp = rampByPacing[(pacing ?? "").toLowerCase().trim()] ?? rampByPacing.balanced;
      const clampInt = (n: any, lo: number, hi: number) => {
        const x = Number(n);
        if (!Number.isFinite(x)) return lo;
        return Math.max(lo, Math.min(hi, Math.floor(x)));
      };

      // Ensure phases/actions ids + defaults (best-effort)
      if (Array.isArray(plan.phases)) {
        for (let p = 0; p < plan.phases.length; p++) {
          const phase = plan.phases[p] ?? {};
          if (!phase.id) phase.id = String(p + 1);
          // Canonical status policy:
          // - Phase 1 is active
          // - Other phases are locked until progression unlocks them
          // This prevents LLM from accidentally "activating" future phases and leaking active rows into DB.
          phase.status = p === 0 ? "active" : "locked";
          if (!Array.isArray(phase.actions)) continue;

          // Quest types: enforce exactly 1 main + 1 side for the 2 actions in the phase.
          // If model outputs missing/duplicate questType, we deterministically repair it.
          if (phase.actions.length === 2) {
            const a0 = phase.actions[0] ?? {};
            const a1 = phase.actions[1] ?? {};
            const q0 = String(a0.questType ?? "").toLowerCase().trim();
            const q1 = String(a1.questType ?? "").toLowerCase().trim();
            const isMain0 = q0 === "main";
            const isSide0 = q0 === "side";
            const isMain1 = q1 === "main";
            const isSide1 = q1 === "side";
            // Already good
            if ((isMain0 && isSide1) || (isSide0 && isMain1)) {
              // noop
            } else {
              // Default: first action main, second action side
              a0.questType = "main";
              a1.questType = "side";
            }
            phase.actions[0] = a0;
            phase.actions[1] = a1;
          }

          for (let a = 0; a < phase.actions.length; a++) {
            const act = phase.actions[a] ?? {};
            if (!act.id) act.id = `${p + 1}_${a + 1}_${crypto.randomUUID().slice(0, 8)}`;
            if (!act.tracking_type) act.tracking_type = "boolean";
            if (!act.time_of_day) act.time_of_day = "any_time";

            const t = String(act.type ?? "").toLowerCase().trim();
            const phaseTarget = ramp[Math.min(ramp.length - 1, Math.max(0, p))] ?? 5;

            // Habits: required targetReps + progressive ramp
            if (t === "habitude" || t === "habit") {
              act.targetReps = clampInt(act.targetReps ?? phaseTarget, 1, 6);
              // Clamp scheduledDays length if present (validator requires <= targetReps)
              if (Array.isArray(act.scheduledDays)) {
                act.scheduledDays = act.scheduledDays.slice(0, Math.max(0, act.targetReps));
              }
            }

            // Frameworks: validator requires targetReps + frameworkDetails.
            // We do a light auto-repair to avoid regeneration loops on missing fields.
            if (t === "framework") {
              // If the model forgot: default to one_shot + targetReps=1
              const fType = String(act.frameworkDetails?.type ?? "one_shot").toLowerCase().trim();
              if (fType === "one_shot") {
                act.targetReps = 1;
              } else {
                act.targetReps = clampInt(act.targetReps ?? 3, 1, 30);
              }
              if (!act.frameworkDetails || typeof act.frameworkDetails !== "object") {
                act.frameworkDetails = {
                  type: "one_shot",
                  intro: "Remplis cette fiche en quelques minutes. Sois concret(ète) et honnête.",
                  sections: [
                    { id: "notes", label: "Notes", inputType: "textarea", placeholder: "Écris ici..." },
                  ],
                };
                act.targetReps = 1;
              }
            }
          }
        }
      }

      return plan;
    };

    const pacingForValidation = (inputs?.pacing ?? "").toString();

    // Retry loop for validation (re-prompt if JSON is invalid)
    const MAX_VALIDATION_ATTEMPTS = 6;
    for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt++) {
      const validationBlock = lastValidationFeedback
        ? `\n\n=== VALIDATION_FEEDBACK (MUST FIX) ===\nTon précédent JSON n'est pas conforme. Corrige uniquement ces points et renvoie UNIQUEMENT le JSON corrigé.\n${lastValidationFeedback}\n`
        : "";

      try {
        const rawText = await generateWithGemini(
          systemPrompt,
          userPrompt + validationBlock,
          0.7,
          true, // jsonMode
          [], // no tools
          "auto",
          {
            requestId: `${requestId}:plan:${attempt}`,
            model: planModel,
            source: "generate-plan",
            forceRealAi: forceRealGeneration,
            maxRetries: 4,
          }
        );

        if (typeof rawText !== "string") {
          throw new Error("Unexpected tool call response from LLM");
        }

        const firstBrace = rawText.indexOf("{");
        const lastBrace = rawText.lastIndexOf("}");
        const jsonString =
          firstBrace !== -1 && lastBrace !== -1
            ? rawText.substring(firstBrace, lastBrace + 1)
            : rawText.replace(/```json\n?|```/g, "").trim();

        let plan = JSON.parse(jsonString);
        plan = normalizePlanForValidation(plan, pacingForValidation);

        const validated = validatePlan(plan);
        return new Response(JSON.stringify(validated), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        const errMsg = String((e as any)?.message ?? e ?? "");
        // Check if it's a validation error (not an LLM error)
        const isValidationError = errMsg.includes("validation") || 
          errMsg.includes("Invalid") || 
          errMsg.includes("JSON") ||
          (e as any)?.issues;
        
        if (isValidationError) {
          lastValidationFeedback = formatValidationError(e);
          console.warn(`[generate-plan] Invalid JSON/schema (attempt ${attempt}/${MAX_VALIDATION_ATTEMPTS}): ${lastValidationFeedback}`);
          if (attempt < MAX_VALIDATION_ATTEMPTS) {
            await sleep(800);
            continue;
          }
        }
        // LLM error or final validation failure
        throw e;
      }
    }

    // If we reach here, all validation attempts failed.
    if (lastValidationFeedback) {
      throw new Error(`Plan non conforme (validation): ${lastValidationFeedback}`);
    }
    throw new Error("Plan non conforme (validation) et aucun détail n'a été capturé.");

  } catch (error) {
    console.error('Func Error:', error)
    await logEdgeFunctionError({
      functionName: "generate-plan",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
        client_request_id: ctx.clientRequestId,
      },
    })
    // On renvoie 200 (OK) même en cas d'erreur pour que le client Supabase puisse lire le JSON de l'erreur
    // au lieu de lancer une exception générique "FunctionsHttpError".
    return new Response(
      JSON.stringify({ error: (error as any)?.message ?? String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
