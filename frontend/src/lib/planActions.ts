import { supabase } from './supabase';
import { GeneratedPlan } from '../types/plan';

/**
 * Cette fonction est appelée au moment de la VALIDATION du plan (passage en 'active').
 * Elle éclate le JSON du plan pour remplir les tables relationnelles de suivi :
 * - user_actions (pour les missions et habitudes)
 * - user_vital_signs (pour le signe vital)
 */
export const distributePlanActions = async (
  userId: string,
  planId: string,
  submissionId: string | null, // Peut être null si vieux plan
  planContent: GeneratedPlan
) => {
  console.log("🚀 Distribution des actions pour le plan:", planId);

  // 0. NETTOYAGE PRÉALABLE (Idempotence)
  // On supprime les anciennes actions/signes liés à ce plan pour éviter les doublons si on re-valide
  await supabase.from('user_actions').delete().eq('plan_id', planId);
  await supabase.from('user_vital_signs').delete().eq('plan_id', planId);

  // 1. Préparer les actions (Missions & Habitudes)
  const actionsToInsert: any[] = [];
  
  // On parcourt toutes les phases
  planContent.phases.forEach(phase => {
    phase.actions.forEach(action => {
      // On ignore les frameworks car ils ont leur propre table (user_framework_entries)
      // On ne prend que 'mission' et 'habitude' (mappé en 'habit' en base, ou on garde 'habitude' ?)
      // La migration dit: check (type in ('mission', 'habit'))
      // Le JSON de l'IA renvoie 'habitude'. Il faut mapper.
      
      let dbType = '';
      if (action.type === 'mission') dbType = 'mission';
      if (action.type === 'habitude') dbType = 'habit';
      
      if (dbType) {
        actionsToInsert.push({
          user_id: userId,
          plan_id: planId,
          submission_id: submissionId,
          type: dbType,
          title: action.title,
          description: action.description,
          target_reps: action.targetReps || (dbType === 'mission' ? 1 : null), // Mission = 1 fois par défaut
          current_reps: 0,
          status: 'active'
        });
      }
    });
  });

  // 2. Préparer le Signe Vital
  // Le JSON a: vitalSignal: { name, unit, startValue, targetValue, ... }
  const vitalSignal = (planContent as any).vitalSignal;
  let vitalSignToInsert = null;

  if (vitalSignal) {
    vitalSignToInsert = {
      user_id: userId,
      plan_id: planId,
      submission_id: submissionId,
      label: vitalSignal.name,
      target_value: vitalSignal.targetValue,
      current_value: vitalSignal.startValue,
      unit: vitalSignal.unit,
      status: 'active'
    };
  }

  // 3. Exécution des requêtes (en parallèle pour la vitesse)
  const promises = [];

  if (actionsToInsert.length > 0) {
    console.log(`📝 Insertion de ${actionsToInsert.length} actions...`);
    promises.push(
      supabase.from('user_actions').insert(actionsToInsert)
    );
  }

  if (vitalSignToInsert) {
    console.log("❤️ Insertion du signe vital...", vitalSignToInsert.label);
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

        // 4. Supprimer les frameworks liés à cette submission
        // (Attention : Framework Entries a submission_id maintenant ? Oui via migration 20241203000001)
        supabase.from('user_framework_entries').delete().eq('user_id', userId).eq('submission_id', submissionId)
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
        supabase.from('user_framework_entries').delete().eq('plan_id', planId)
    ]);
};
