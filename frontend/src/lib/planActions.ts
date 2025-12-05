import { supabase } from './supabase';
import type { GeneratedPlan } from '../types/dashboard';

/**
 * Marque comme "abandoned" toutes les actions et frameworks ACTIFS
 * qui ne font PAS partie du nouveau plan.
 * Utilisé pour clore proprement les anciennes transformations quand on en commence une nouvelle.
 */
export const abandonPreviousActions = async (userId: string, excludePlanId: string) => {
  console.log("🏚️ Abandon des anciennes actions actives (sauf plan:", excludePlanId, ")...");

  // 1. Diagnostic : Combien d'actions sont concernées ?
  const { count } = await supabase
      .from('user_actions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('plan_id', excludePlanId)
      .in('status', ['active', 'pending']);
  
  console.log(`🔎 Diagnostic: ${count} anciennes actions à abandonner.`);

  // On sépare pour mieux gérer les erreurs
  const updates = [
      supabase
          .from('user_actions')
          .update({ status: 'abandoned' })
          .eq('user_id', userId)
          .neq('plan_id', excludePlanId)
          .in('status', ['active', 'pending']),

      supabase
          .from('user_framework_tracking')
          .update({ status: 'abandoned' })
          .eq('user_id', userId)
          .neq('plan_id', excludePlanId)
          .in('status', ['active', 'pending'])
  ];

  const results = await Promise.all(updates);
  
  // Vérification des erreurs
  const errors = results.filter(r => r.error).map(r => r.error);
  if (errors.length > 0) {
      console.error("❌ Erreur lors de l'abandon des anciennes actions :", errors);
      // On ne throw pas forcément pour ne pas bloquer la création du nouveau plan, 
      // mais on alerte.
      // Si l'erreur est "check constraint", c'est que la migration manque.
  } else {
      console.log("✅ Anciennes actions abandonnées (ou aucune à abandonner).");
  }
};

/**
 * Cette fonction est appelée au moment de la VALIDATION du plan (passage en 'active').
 * Elle éclate le JSON du plan pour remplir les tables relationnelles de suivi :
 * - user_actions (pour les missions et habitudes)
 * - user_vital_signs (pour le signe vital)
 */
export const distributePlanActions = async (
  userId: string,
  planId: string,
  submissionId: string | null | undefined, // Peut être null si vieux plan
  planContent: GeneratedPlan
) => {
  console.log("🚀 Distribution des actions pour le plan:", planId);

  // 0.A. ABANDON DES ANCIENS PLANS (Requirements: Clean slate transition)
  await abandonPreviousActions(userId, planId);

  // 0.B. NETTOYAGE PRÉALABLE DU PLAN ACTUEL (Idempotence)
  // On supprime les anciennes actions/signes liés à ce plan pour éviter les doublons si on re-valide
  await supabase.from('user_actions').delete().eq('plan_id', planId);
  await supabase.from('user_vital_signs').delete().eq('plan_id', planId);
  await supabase.from('user_framework_tracking').delete().eq('plan_id', planId);

  // 1. Préparer les actions (Missions & Habitudes) ET Frameworks
  const actionsToInsert: any[] = [];
  const frameworksToTrack: any[] = [];
  
  let globalActionIndex = 0; // Pour déterminer les 2 premières actions globales
  
  // Clean submissionId : ensures it's null if undefined
  const cleanSubmissionId = submissionId || null;

  // On parcourt toutes les phases
  planContent.phases.forEach(phase => {
    phase.actions.forEach(action => {
      
      const isInitialActive = globalActionIndex < 2;
      const initialStatus = isInitialActive ? 'active' : 'pending';
      globalActionIndex++;

      // CAS 1: Frameworks (Table user_framework_tracking)
      if (action.type === 'framework') {
        // Validation stricte des données requises
        const actionId = action.id || `fw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const title = action.title || 'Framework sans titre';

        frameworksToTrack.push({
          user_id: userId,
          plan_id: planId,
          submission_id: cleanSubmissionId,
          action_id: actionId,
          title: title,
          type: (action as any).frameworkDetails?.type || 'unknown', // 'one_shot' | 'recurring'
          target_reps: typeof action.targetReps === 'number' ? action.targetReps : 1, // Force integer
          current_reps: 0,
          status: initialStatus
        });
      }
      
      // CAS 2: Missions & Habitudes (Table user_actions)
      let dbType = '';
      // Normalisation des types (supporte 'habit', 'HABIT', 'habitude')
      const normalizedType = action.type?.toLowerCase().trim();
      
      if (normalizedType === 'mission') dbType = 'mission';
      if (normalizedType === 'habitude' || normalizedType === 'habit') dbType = 'habit';
      
      if (dbType) {
        // Handle targetReps logic cleanly
        let targetReps = null;
        if (dbType === 'habit') {
            targetReps = typeof action.targetReps === 'number' ? action.targetReps : 1;
        } else {
            // Missions usually default to 1, but let's be explicit. Null means N/A? No, for mission it is usually 1.
            targetReps = 1;
        }

        const title = action.title || 'Action sans titre';

        actionsToInsert.push({
          user_id: userId,
          plan_id: planId,
          submission_id: cleanSubmissionId,
          type: dbType,
          title: title,
          description: action.description || '',
          target_reps: targetReps,
          current_reps: 0,
          status: initialStatus
        });
      }
    });
  });

  // 2. Préparer le Signe Vital
  // Le JSON a: vitalSignal: { name, unit, startValue, targetValue, ... }
  const vitalSignal = (planContent as any).vitalSignal;
  let vitalSignToInsert = null;

  if (vitalSignal) {
    // Validation stricte : label est requis (NOT NULL constraint)
    const label = vitalSignal.name || vitalSignal.label || 'Signe Vital';
    
    // Conversion explicite en string pour les valeurs
    vitalSignToInsert = {
      user_id: userId,
      plan_id: planId,
      submission_id: cleanSubmissionId,
      label: label,
      target_value: String(vitalSignal.targetValue || ''),
      current_value: String(vitalSignal.startValue || ''),
      unit: vitalSignal.unit || '',
      status: 'active'
    };
  }

  // 3. Exécution des requêtes (en parallèle pour la vitesse)
  const promises = [];

  if (actionsToInsert.length > 0) {
    console.log(`📝 Insertion de ${actionsToInsert.length} actions...`, actionsToInsert[0]); // Log sample
    promises.push(
      supabase.from('user_actions').insert(actionsToInsert)
    );
  }

  if (frameworksToTrack.length > 0) {
    console.log(`📚 Insertion de ${frameworksToTrack.length} frameworks à tracker...`, frameworksToTrack[0]); // Log sample
    promises.push(
        supabase.from('user_framework_tracking').insert(frameworksToTrack)
    );
  }

  if (vitalSignToInsert) {
    console.log("❤️ Insertion du signe vital...", vitalSignToInsert);
    promises.push(
      supabase.from('user_vital_signs').insert(vitalSignToInsert)
    );
  }

  // On attend que tout soit fini
  const results = await Promise.all(promises);
  
  // Vérification des erreurs
  const errors = results.filter(r => r.error).map(r => r.error);
  if (errors.length > 0) {
    console.error("❌ Erreurs lors de la distribution:", errors);
    // On affiche l'erreur en détail pour debug
    errors.forEach(e => console.error("Detailed Error:", JSON.stringify(e, null, 2)));
    throw new Error("Erreur lors de la création du suivi détaillé.");
  }

  console.log("✅ Distribution terminée avec succès !");
  return true;
};

/**
 * Nettoie TOUTES les données liées à un cycle de soumission (submission_id).
 * Utilisé lorsqu'on régénère complètement les priorités (PlanPriorities).
 * Supprime :
 * - Plans
 * - Actions
 * - Signes Vitaux
 * - Entrées Framework
 */
export const cleanupSubmissionData = async (userId: string, submissionId: string) => {
    console.log("🧹 Nettoyage complet pour la submission:", submissionId);

    // Suppression en parallèle pour la performance
    // Note : user_plans cascade sur user_actions et user_vital_signs normalement si configuré,
    // MAIS user_framework_entries a un ON DELETE SET NULL sur plan_id (selon migration),
    // donc il faut le supprimer explicitement si on veut tout nettoyer.
    // Et user_actions/vital_signs ont aussi submission_id, donc on peut cibler large.

    const promises = [
        // 1. Supprimer les plans (Cascade souvent sur le reste, mais on assure)
        supabase.from('user_plans').delete().eq('user_id', userId).eq('submission_id', submissionId),
        
        // 2. Supprimer les actions orphelines (si cascade pas parfaite)
        supabase.from('user_actions').delete().eq('user_id', userId).eq('submission_id', submissionId),
        
        // 3. Supprimer les signes vitaux
        supabase.from('user_vital_signs').delete().eq('user_id', userId).eq('submission_id', submissionId),

        // 4. Supprimer le tracking framework
        supabase.from('user_framework_tracking').delete().eq('user_id', userId).eq('submission_id', submissionId),

        // 5. Supprimer les frameworks liés à cette submission
        supabase.from('user_framework_entries').delete().eq('user_id', userId).eq('submission_id', submissionId),

        // 6. Supprimer les entrées d'historique signes vitaux
        supabase.from('user_vital_sign_entries').delete().eq('user_id', userId).eq('submission_id', submissionId)
    ];

    await Promise.all(promises);
    console.log("✅ Nettoyage terminé.");
};

/**
 * Nettoie les données liées à un plan spécifique (Reset partiel).
 */
export const cleanupPlanData = async (planId: string) => {
    console.log("🧹 Nettoyage pour le plan:", planId);
    
    // Si on supprime le plan, la cascade DB devrait faire le taf pour actions/vital_signs,
    // mais framework_entries est en SET NULL.
    
    await Promise.all([
        supabase.from('user_actions').delete().eq('plan_id', planId),
        supabase.from('user_vital_signs').delete().eq('plan_id', planId),
        supabase.from('user_framework_tracking').delete().eq('plan_id', planId),
        supabase.from('user_framework_entries').delete().eq('plan_id', planId),
        supabase.from('user_vital_sign_entries').delete().eq('plan_id', planId)
    ]);
};
