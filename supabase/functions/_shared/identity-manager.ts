import { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { generateEmbedding, generateWithGemini } from "./gemini.ts";
import { WEEKS_CONTENT } from "./weeksContent.ts";

export async function processCoreIdentity(
  supabase: SupabaseClient, 
  userId: string, 
  weekNum: number,
  triggerReason: 'completion' | 'update_forge'
) {
  console.log(`[IdentityManager] Processing Week ${weekNum} for user ${userId} (${triggerReason})`);

  // 1. Récupérer TOUTES les réponses de cette semaine (Contexte complet)
  // On cherche tous les modules commençant par 'a{weekNum}_'
  const { data: modules, error: modError } = await supabase
      .from('user_module_state_entries')
      .select('module_id, content')
      .eq('user_id', userId)
      .like('module_id', `a${weekNum}_%`)
  
  if (modError || !modules || modules.length === 0) {
      console.log('[IdentityManager] No modules found for this week yet.');
      return;
  }

  // 2. Construire le Transcript de la semaine
  let transcript = `AXE ${weekNum} - RÉPONSES UTILISATEUR :\n\n`;
  
  // On essaie de mapper avec les questions réelles si possible
  const weekContent = (WEEKS_CONTENT as any)[`week_${weekNum}`];
  
  modules.forEach(m => {
      let question = "Question inconnue";
      // Tentative de retrouver le texte de la question
      if (weekContent && weekContent.subQuestions) {
          const sq = weekContent.subQuestions.find((s:any) => s.id === m.module_id);
          if (sq) question = sq.question;
      }

      const contentStr = typeof m.content === 'string' ? m.content : (m.content as any)?.content || JSON.stringify(m.content);
      
      transcript += `[MODULE ${m.module_id}] ${question}\n`;
      transcript += `RÉPONSE: ${contentStr}\n\n`;
  });

  // 3. Récupérer l'ancienne identité (si existe)
  const { data: oldIdentity } = await supabase
      .from('user_core_identity')
      .select('*')
      .eq('user_id', userId)
      .eq('week_id', `week_${weekNum}`)
      .single();

  // 4. Générer le Résumé Identitaire avec Gemini
  let systemPrompt = "";
  
  if (!oldIdentity) {
      systemPrompt = `
        Tu es l'Architecte de l'Identité du système Sophia.
        Ta mission : Analyser les réponses de l'utilisateur pour cet Axe (Semaine ${weekNum}) et extraire l'essence de son identité.
        
        RÈGLES :
        - Produis un résumé dense de 5 lignes maximum.
        - Concentre-toi sur les Valeurs, les Peurs, les Désirs profonds et les Principes directeurs révélés ici.
        - Ne raconte pas les faits, mais le sens.
        - Style : Analytique, psychologique, précis. Pas de blabla.
      `;
  } else {
      systemPrompt = `
        Tu es l'Architecte de l'Identité du système Sophia.
        Mise à jour de l'identité suite à une modification de l'utilisateur (Forge).
        
        ANCIENNE VERSION DE L'IDENTITÉ :
        "${oldIdentity.content}"
        
        Ta mission : Ré-analyser l'ensemble des réponses (inclus les modifications récentes) pour produire une NOUVELLE version de l'identité.
        
        RÈGLES :
        - Garde ce qui est toujours vrai.
        - Ajuste ce qui a changé ou s'est précisé.
        - Produis un résumé dense de 5 lignes maximum.
        - Ne mets pas de titre comme "Nouvelle version". Commence directement le texte.
      `;
  }

  const newIdentityRaw = await generateWithGemini(systemPrompt, transcript, 0.3);
  if (typeof newIdentityRaw !== "string") {
    throw new Error("Identity generation returned a tool call instead of text");
  }
  const newIdentityContent = newIdentityRaw.trim();
  if (!newIdentityContent) {
    throw new Error("Identity generation returned empty content");
  }
  const identityEmbedding = await generateEmbedding(newIdentityContent);

  // 5. Sauvegarde et Archivage
  if (oldIdentity) {
      // Archivage
      await supabase.from('user_core_identity_archive').insert({
          identity_id: oldIdentity.id,
          user_id: userId,
          week_id: `week_${weekNum}`,
          content: oldIdentity.content,
          reason: triggerReason
      });
      
      // Mise à jour
      await supabase.from('user_core_identity').update({
          content: newIdentityContent,
          identity_embedding: identityEmbedding,
          last_updated_at: new Date().toISOString()
      }).eq('id', oldIdentity.id);
      
      console.log(`[IdentityManager] Updated identity for Week ${weekNum}`);
  } else {
      // Création
      await supabase.from('user_core_identity').insert({
          user_id: userId,
          week_id: `week_${weekNum}`,
          content: newIdentityContent,
          identity_embedding: identityEmbedding,
      });
      console.log(`[IdentityManager] Created identity for Week ${weekNum}`);
  }
}
