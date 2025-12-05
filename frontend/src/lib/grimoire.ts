import { supabase } from './supabase';
import type { Action, CompletedTransformation } from '../types/grimoire';

export async function fetchCompletedTransformations(): Promise<CompletedTransformation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 1. Fetch completed plans with their linked goals
  const { data: plans, error: plansError } = await supabase
    .from('user_plans')
    .select(`
      id,
      updated_at,
      completed_at,
      title,
      deep_why,
      context_problem,
      content,
      status,
      user_goals (
        axis_title,
        theme_id
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['completed', 'archived'])
    .order('updated_at', { ascending: false });

  if (plansError) {
    console.error('Error fetching completed plans:', plansError);
    return [];
  }

  if (!plans || plans.length === 0) return [];

  const planIds = plans.map(p => p.id);

  // 2. Fetch associated actions for these plans
  const { data: actionsData, error: actionsError } = await supabase
    .from('user_actions')
    .select('*')
    .in('plan_id', planIds);

  if (actionsError) {
    console.error('Error fetching actions:', actionsError);
  }

  // 3. Fetch associated framework tracking for these plans
  const { data: frameworksData, error: frameworksError } = await supabase
    .from('user_framework_tracking')
    .select('*')
    .in('plan_id', planIds);

  if (frameworksError) {
     console.error('Error fetching frameworks:', frameworksError);
  }

  // 4. Map to CompletedTransformation objects
  const transformations: CompletedTransformation[] = plans.map(plan => {
    const content = plan.content as any; 
    const strategy = {
      identity: content.identity || content.strategy || "Identité non définie",
      bigWhy: plan.deep_why || content.deepWhy || content.inputs_why || "Pourquoi non défini", // Priorité DB
      goldenRules: content.goldenRules || "Règles non définies"
    };

    const planActions = (actionsData || []).filter(a => a.plan_id === plan.id);
    const planFrameworks = (frameworksData || []).filter(f => f.plan_id === plan.id);

    const mappedActions: Action[] = [
      ...planActions.map(a => ({
        id: a.id,
        type: a.type === 'habit' ? 'habitude' : 'mission',
        title: a.title || 'Action sans titre',
        description: a.description,
        isCompleted: a.status === 'completed',
        mantra: a.rationale,
        isHypnosis: a.title?.toLowerCase().includes('hypno') || a.description?.toLowerCase().includes('hypno'),
        targetReps: a.target_reps,
      } as Action)),
      ...planFrameworks.map(f => {
        // Try to find description in JSON content
        let description = 'Outil du Grimoire';
        if (content?.phases) {
            for (const phase of content.phases) {
                const found = phase.actions?.find((a: any) => a.id === f.action_id);
                if (found && found.description) {
                    description = found.description;
                    break;
                }
            }
        }

        return {
            id: f.id,
            type: 'framework',
            title: f.title,
            description: description, 
            isCompleted: f.status === 'completed',
            originalActionId: f.action_id, // Important for reactivation
            frameworkType: f.type,
            targetReps: f.target_reps
        } as Action;
      })
    ];

    // Determine the best date to show (Completion date > Update date)
    const dateToUse = plan.completed_at || plan.updated_at;
    const date = new Date(dateToUse);
    const formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const goal = Array.isArray(plan.user_goals) ? plan.user_goals[0] : plan.user_goals;
    
    // Determine title: New Column > JSON > Fallback
    const displayTitle = plan.title || content.grimoireTitle || goal?.axis_title || `Transformation du ${formattedDate}`;

    return {
      id: plan.id,
      title: displayTitle,
      theme: goal?.theme_id || 'Général',
      completedDate: formattedDate,
      strategy,
      contextProblem: plan.context_problem || content.context_problem, // Fallback JSON si pas en colonne
      actions: mappedActions,
      status: plan.status as any // 'completed' | 'archived' | 'active'
    };
  });

  return transformations;
}

export async function reactivateAction(action: Action): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Utilisateur non connecté");

    // 1. Find the currently active plan
    const { data: activePlan, error: planError } = await supabase
        .from('user_plans')
        .select('id, submission_id, content')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

    if (planError) throw planError;
    if (!activePlan) {
        throw new Error("Tu dois avoir un plan actif (une quête en cours) pour y ajouter cet outil.");
    }

    const planContent = activePlan.content as any;
    const phases = planContent?.phases || [];

    // Trouver la phase active (la première qui a status 'active' ou la première tout court)
    let activePhaseIndex = phases.findIndex((p: any) => p.status === 'active');
    if (activePhaseIndex === -1) activePhaseIndex = 0; // Fallback phase 1

    let newJsonAction: any = null;

    // 2. Insert based on type AND prepare JSON object
    if (action.type === 'framework') {
        // We need a unique action_id if we are adding it to a new plan. 
        // Using the original ID might cause collision if the new plan has 'a1' too.
        // So we generate a suffix.
        const newActionId = (action.originalActionId || 'fw') + '_reactivated_' + Date.now();

        // DB INSERT
        const { error } = await supabase
            .from('user_framework_tracking')
            .insert({
                user_id: user.id,
                plan_id: activePlan.id,
                submission_id: activePlan.submission_id,
                action_id: newActionId,
                title: action.title,
                type: action.frameworkType || 'one_shot',
                target_reps: action.targetReps || 1,
                current_reps: 0,
                status: 'active'
            });
        
        if (error) throw error;

        // JSON OBJECT PREP
        newJsonAction = {
            id: newActionId,
            type: 'framework',
            title: action.title,
            description: "Outil réactivé depuis le Grimoire",
            targetReps: action.targetReps || 1,
            status: 'active',
            // Important: on essaie de récupérer les frameworkDetails si possible, 
            // mais ici 'action' vient du Grimoire (CompletedTransformation) qui a perdu les details...
            // Pour l'instant, on met un placeholder ou on fetchera l'historique plus tard.
            // Idéalement, il faudrait stocker le 'schema_snapshot' dans l'action archivée aussi.
            // SOLUTION TEMPORAIRE : On met un type générique qui déclenchera le modal par défaut
            frameworkDetails: {
                type: action.frameworkType || 'one_shot',
                intro: "Session de rappel pour cet outil.",
                sections: [
                    { id: "notes", label: "Notes de session", inputType: "textarea", placeholder: "Comment s'est passée cette réactivation ?" }
                ]
            }
        };

    } else {
        // Mission or Habit
        let dbType = 'mission';
        if (action.type === 'habitude') dbType = 'habit';

        // DB INSERT
        const { error } = await supabase
            .from('user_actions')
            .insert({
                user_id: user.id,
                plan_id: activePlan.id,
                submission_id: activePlan.submission_id,
                type: dbType,
                title: action.title,
                description: action.description || '',
                target_reps: action.targetReps || 1,
                current_reps: 0,
                status: 'active'
            });

        if (error) throw error;

        // JSON OBJECT PREP
        // Pour les actions simples, l'ID n'est pas critique dans le JSON car le Dashboard matche par titre
        // Mais on va mettre un ID unique quand même
        newJsonAction = {
            id: `reactivated_${Date.now()}`,
            type: action.type,
            title: action.title,
            description: action.description,
            targetReps: action.targetReps || 1,
            status: 'active',
            rationale: action.mantra || "Réactivé pour ancrer l'habitude."
        };
    }

    // 3. Update user_plans JSON to display it in Dashboard
    if (phases[activePhaseIndex] && newJsonAction) {
        phases[activePhaseIndex].actions.push(newJsonAction);
        
        await supabase
            .from('user_plans')
            .update({ content: { ...planContent, phases } })
            .eq('id', activePlan.id);
    }

    return true;
}
