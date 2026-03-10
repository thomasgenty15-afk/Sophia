import { supabase } from './supabase';
import type { GeneratedPlan } from '../types/dashboard';

/**
 * Marque comme "abandoned" toutes les actions et frameworks ACTIFS
 * qui ne font PAS partie du nouveau plan.
 * Pour les Signes Vitaux, le statut dépend de la réussite du plan parent.
 */
export const abandonPreviousActions = async (userId: string, excludePlanId: string) => {
  console.log("🏚️ Abandon des anciennes actions actives (sauf plan:", excludePlanId, ")...");

  // 1. Actions & Frameworks : On abandonne tout ce qui traîne (si active/pending)
  const updates = [
      supabase
          .from('user_actions')
          .update({ status: 'abandoned' })
          .eq('user_id', userId)
          .neq('plan_id', excludePlanId)
          .in('status', ['active', 'pending', 'deactivated']),

      supabase
          .from('user_framework_tracking')
          .update({ status: 'abandoned' })
          .eq('user_id', userId)
          .neq('plan_id', excludePlanId)
          .in('status', ['active', 'pending', 'deactivated']),
  ];

  await Promise.all(updates);
  console.log("✅ Actions et Frameworks orphelins marqués comme abandoned.");

  // 2. Signes Vitaux : Logique Intelligente (Completed vs Abandoned)
  // On récupère les signes vitaux encore actifs qui ne sont pas du nouveau plan
  const { data: activeVitals, error } = await supabase
      .from('user_vital_signs')
      .select('id, plan_id')
      .eq('user_id', userId)
      .neq('plan_id', excludePlanId)
      .in('status', ['active', 'pending']);

  if (error) {
      console.error("❌ Erreur fetch vital signs:", error);
      return;
  }

  if (!activeVitals || activeVitals.length === 0) {
      console.log("✅ Aucun signe vital actif à traiter.");
      return;
  }

  // On récupère les IDs des plans concernés pour connaître leur statut
  const planIds = [...new Set(activeVitals.map(v => v.plan_id))];
  const { data: plans } = await supabase
      .from('user_plans')
      .select('id, status')
      .in('id', planIds);
  
  const planStatusMap = new Map();
  plans?.forEach(p => planStatusMap.set(p.id, p.status));

  // On prépare les updates
  const vitalUpdates = activeVitals.map(vital => {
      const parentPlanStatus = planStatusMap.get(vital.plan_id);
      
      // Si le plan est FINI (completed) -> Le signe vital est considéré comme VALIDÉ (completed)
      // Si le plan est ARCHIVÉ (abandon/échec) -> Le signe vital est ABANDONNÉ (abandoned)
      // Si le plan est encore ACTIVE (bug?) -> On force abandoned pour nettoyer
      
      const newStatus = parentPlanStatus === 'completed' ? 'completed' : 'abandoned';
      
      return supabase
          .from('user_vital_signs')
          .update({ status: newStatus })
          .eq('id', vital.id);
  });

  await Promise.all(vitalUpdates);
  console.log(`✅ ${vitalUpdates.length} signes vitaux mis à jour (Completed/Abandoned).`);
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
  
  // Clean submissionId : ensures it's null if undefined
  const cleanSubmissionId = submissionId || null;

  const normalizeStatus = (s: any) => String(s || '').toLowerCase().trim();

  const getInitialStatus = (
    phase: any,
    phaseIndex: number,
    action: any,
    actionIndex: number,
  ): 'active' | 'pending' | 'completed' => {
    // Hard invariant at distribution time:
    // - If the phase is not unlocked (locked/pending/unknown), its actions MUST NOT be active in DB.
    // This defends against any accidental "active" statuses coming from plan JSON generation/refine.
    const phaseStatus = normalizeStatus(phase?.status);
    const isPhaseUnlocked = phaseStatus === 'active' || phaseStatus === 'completed';

    if (!isPhaseUnlocked && phaseIndex > 0) return 'pending';

    const actionStatus = normalizeStatus(action?.status);
    if (actionStatus === 'active' || actionStatus === 'pending' || actionStatus === 'completed') {
      // Never allow action-level status to "override" a locked phase.
      if (!isPhaseUnlocked) return 'pending';
      return actionStatus as any;
    }

    if (phaseStatus === 'locked') return 'pending';
    if (phaseStatus === 'active' || phaseStatus === 'completed') return 'active';

    // Fallback (legacy): only the first 2 actions of the first phase are active.
    if (phaseIndex === 0 && actionIndex < 2) return 'active';
    return 'pending';
  };

  // On parcourt toutes les phases
  planContent.phases.forEach((phase: any, phaseIndex: number) => {
    (phase.actions || []).forEach((action: any, actionIndex: number) => {
      const initialStatus = getInitialStatus(phase, phaseIndex, action, actionIndex);

      // Extraction propre du tracking_type (avec fallback 'boolean' si absent)
      const trackingType = (action as any).tracking_type === 'counter' ? 'counter' : 'boolean';
      
      // Extraction propre du time_of_day (avec fallback 'any_time')
      const timeOfDay = (action as any).time_of_day || 'any_time';

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
          status: initialStatus,
          tracking_type: trackingType, // Ajout du tracking_type
          last_activated_at: initialStatus === 'active' ? new Date().toISOString() : null,
          last_deactivated_at: null,
          last_activation_reason: initialStatus === 'active' ? 'plan_distribution_initial_activation' : null,
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
            // Habits: weekly frequency capped at 7 (generation caps at 6, increase_week_target allows up to 7)
            const raw = typeof action.targetReps === 'number' ? action.targetReps : 1;
            targetReps = Math.max(1, Math.min(7, raw));
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
          status: initialStatus,
          tracking_type: trackingType, // Ajout du tracking_type
          time_of_day: timeOfDay, // Ajout du time_of_day
          last_activated_at: initialStatus === 'active' ? new Date().toISOString() : null,
          last_deactivated_at: null,
          last_activation_reason: initialStatus === 'active' ? 'plan_distribution_initial_activation' : null,
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
    const trackingType = vitalSignal.tracking_type === 'boolean' ? 'boolean' : 'counter'; // Vital often counter
    const timeOfDay = (vitalSignal.time_of_day === 'morning' ||
      vitalSignal.time_of_day === 'afternoon' ||
      vitalSignal.time_of_day === 'evening' ||
      vitalSignal.time_of_day === 'night' ||
      vitalSignal.time_of_day === 'any_time')
      ? vitalSignal.time_of_day
      : 'any_time';
    
    // Conversion explicite en string pour les valeurs
    vitalSignToInsert = {
      user_id: userId,
      plan_id: planId,
      submission_id: cleanSubmissionId,
      label: label,
      target_value: String(vitalSignal.targetValue || ''),
      current_value: String(vitalSignal.startValue || ''),
      unit: vitalSignal.unit || '',
      status: 'active',
      tracking_type: trackingType, // Ajout du tracking_type
      time_of_day: timeOfDay
    };
  }

  // 3. Exécution des requêtes (en parallèle pour la vitesse)
  const promises = [];

  // Safety pass targets: actions/frameworks that belong to phases which are NOT unlocked must remain pending in DB.
  // (We run this AFTER insert as a last line of defense against any accidental 'active'.)
  const lockedPhaseActionTitles: string[] = [];
  const lockedPhaseFrameworkIds: string[] = [];
  try {
    planContent.phases.forEach((phase: any, phaseIndex: number) => {
      const phaseStatus = normalizeStatus(phase?.status);
      const isUnlocked = phaseStatus === 'active' || phaseStatus === 'completed';
      if (phaseIndex === 0) return; // Phase 1 can be active by design
      if (isUnlocked) return; // If unlocked, don't force pending
      (phase.actions || []).forEach((action: any) => {
        if (action?.type === 'framework') {
          const id = String(action?.id ?? '').trim();
          if (id) lockedPhaseFrameworkIds.push(id);
        } else {
          const t = String(action?.title ?? '').trim();
          if (t) lockedPhaseActionTitles.push(t);
        }
      });
    });
  } catch (e) {
    console.warn("⚠️ Locked-phase safety targets build failed (non-blocking):", e);
  }

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

  // 3.B. Post-insert verification: downgrade any "active" rows that belong to locked phases back to "pending".
  // This is a guard against any upstream bugs (bad statuses in JSON, race conditions, etc.).
  // We keep it best-effort and do not fail the whole distribution if it errors.
  try {
    const safetyOps: any[] = [];
    if (lockedPhaseActionTitles.length > 0) {
      safetyOps.push(
        supabase
          .from('user_actions')
          .update({
            status: 'pending',
            last_activated_at: null,
            last_activation_reason: null,
          })
          .eq('plan_id', planId)
          .in('title', Array.from(new Set(lockedPhaseActionTitles)).slice(0, 200))
          .eq('status', 'active')
      );
    }
    if (lockedPhaseFrameworkIds.length > 0) {
      safetyOps.push(
        supabase
          .from('user_framework_tracking')
          .update({
            status: 'pending',
            last_activated_at: null,
            last_activation_reason: null,
          })
          .eq('plan_id', planId)
          .in('action_id', Array.from(new Set(lockedPhaseFrameworkIds)).slice(0, 200))
          .eq('status', 'active')
      );
    }
    if (safetyOps.length > 0) {
      const safetyRes = await Promise.all(safetyOps);
      const safetyErrs = safetyRes.filter(r => (r as any)?.error).map(r => (r as any).error);
      if (safetyErrs.length > 0) {
        console.warn("⚠️ Safety downgrade produced errors (non-blocking):", safetyErrs);
      } else {
        console.log("🛡️ Safety downgrade applied for locked phases (active → pending).");
      }
    }
  } catch (e) {
    console.warn("⚠️ Safety downgrade failed (non-blocking):", e);
  }
  
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

        // 3b. Supprimer les north stars du cycle
        supabase.from('user_north_stars').delete().eq('user_id', userId).eq('submission_id', submissionId),

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
