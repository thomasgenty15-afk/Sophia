import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateWithGemini, generateEmbedding } from "../_shared/gemini.ts";
import { WEEKS_CONTENT } from "../_shared/weeksContent.ts";

// --- REGISTRY AMÉLIORÉ ---
// On définit les cibles avec leurs propres règles de délai

type ModuleType = 'week' | 'forge' | 'round_table';

interface TargetModule {
  id: string;
  delayDays?: number; // Délai spécifique pour ce lien (écrase le défaut)
  condition?: 'next_sunday' | 'immediate' | 'fixed_delay';
}

interface ModuleDefinition {
  id: string;
  // Au lieu d'une simple liste de strings, on accepte des objets complexes
  nextModules?: (string | TargetModule)[]; 
  
  // Valeurs par défaut si pas spécifié dans la target
  defaultUnlockDelayDays?: number;
  defaultUnlockCondition?: 'next_sunday' | 'immediate' | 'fixed_delay';
}

const MODULES_REGISTRY: Record<string, ModuleDefinition> = {
  // --- SEMAINE ---
  'week_1': { id: 'week_1', nextModules: ['week_2'], defaultUnlockDelayDays: 7 },
  'week_2': { id: 'week_2', nextModules: ['week_3'], defaultUnlockDelayDays: 7 },
  'week_3': { id: 'week_3', nextModules: ['week_4'], defaultUnlockDelayDays: 7 },
  // ... 
  
  // LE CAS SPÉCIAL : SEMAINE 12
  'week_12': { 
    id: 'week_12', 
    nextModules: [
      // La Forge s'ouvre dans 7 jours (comme une semaine normale)
      { id: 'forge_level_2', delayDays: 7, condition: 'fixed_delay' },
      // La Table Ronde s'ouvre Dimanche prochain
      { id: 'round_table_1', condition: 'next_sunday' } 
    ]
  },

  // --- FORGE ---
  'forge_level_2': { id: 'forge_level_2', nextModules: ['forge_level_3'], defaultUnlockDelayDays: 5 },

  // --- TABLE RONDE ---
  'round_table_1': { id: 'round_table_1', nextModules: ['round_table_2'], defaultUnlockCondition: 'next_sunday' },
  'round_table_2': { id: 'round_table_2', nextModules: ['round_table_3'], defaultUnlockCondition: 'next_sunday' },
};

// --- HELPER DATES ---
function getUnlockDate(condition: string = 'fixed_delay', delayDays: number = 0): Date {
  const now = new Date();
  
  if (condition === 'next_sunday') {
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
    if (nextSunday.getDay() === now.getDay()) { 
        nextSunday.setDate(nextSunday.getDate() + 7);
    }
    nextSunday.setHours(9, 0, 0, 0);
    return nextSunday;
  }

  const unlockDate = new Date(now);
  unlockDate.setDate(now.getDate() + delayDays);
  return unlockDate;
}

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const authHeader = req.headers.get('Authorization')!;
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));

  if (userError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { moduleId } = await req.json();

  // Helper to determine table based on module ID
  const getTableForModule = (id: string) => {
    return id.startsWith('week_') ? 'user_week_states' : 'user_module_state_entries';
  };

  const table = getTableForModule(moduleId);

  // --- FORGE & MEMORY LOGIC ---
  let aiSummary: string | null = null;

  if (table === 'user_module_state_entries') {
    try {
      const { data: entry } = await supabaseClient
        .from('user_module_state_entries')
        .select('content')
        .eq('user_id', user.id)
        .eq('module_id', moduleId)
        .single();
      
      // Extract content string (handle JSON wrapper or direct string)
      const contentStr = typeof entry?.content === 'string' 
        ? entry.content 
        : (entry?.content as any)?.content; 

      if (contentStr && contentStr.length > 10) {
        // 1. Find Question Context
        let questionText = "Question du module";
        let found = false;
        
        for (const week of Object.values(WEEKS_CONTENT)) {
           // Type assertion needed because TS might not know subQuestions exists on all values if type is not explicit
           const w = week as any; 
           if (w.subQuestions) {
             const sq = w.subQuestions.find((s: any) => s.id === moduleId);
             if (sq) {
               questionText = sq.question + " : " + sq.placeholder;
               found = true;
               break;
             }
           }
        }

        // 2. Generate Summary
        const prompt = `Voici la réponse de l'utilisateur au module "${questionText}".
        Fais un résumé dense à la 3ème personne ("Il est stressé par...").
        Inclus les mots-clés de la question.`;

        aiSummary = await generateWithGemini(prompt, contentStr);

        // 3. Vectorize
        // "Question : [Texte Question] + Résumé Réponse : [Synthèse IA]"
        const vectorText = `Question : ${questionText}\nRésumé Réponse : ${aiSummary}`;
        const embedding = await generateEmbedding(vectorText);

        // 4. Store Memory
        
        // A. ARCHIVE OLD MEMORIES
        // Instead of deleting, we downgrade existing 'forge' memories to 'history'
        await supabaseClient
          .from('memories')
          .update({ 
            type: 'history',
            metadata: { 
              archived_at: new Date().toISOString(),
              source: 'complete-module-history'
            }
          })
          .eq('user_id', user.id)
          .eq('source_id', moduleId)
          .eq('source_type', 'module')
          .eq('type', 'insight'); // We only archive active insights

        // B. INSERT NEW MEMORY (Active)
        await supabaseClient
          .from('memories')
          .insert({
            user_id: user.id,
            source_id: moduleId,
            source_type: 'module',
            type: 'insight', // Active truth
            content: vectorText,
            embedding: embedding,
            metadata: { 
              source: 'complete-module', 
              version_date: new Date().toISOString() 
            }
          });
          
        console.log(`Forge Memory created for ${moduleId}`);
      }
    } catch (err) {
      console.error("Error creating Forge Memory:", err);
      // Continue execution even if memory fails
    }
  }

  // 1. Mark completed (and save summary)
  const updatePayload: any = { 
    status: 'completed', 
    completed_at: new Date().toISOString() 
  };
  
  if (aiSummary) {
    updatePayload.ai_summary = aiSummary;
  }

  const { error: updateError } = await supabaseClient
    .from(table)
    .update(updatePayload)
    .eq('user_id', user.id)
    .eq('module_id', moduleId);

  if (updateError) return new Response(JSON.stringify({ error: updateError }), { status: 500 });

  // 2. Unlock next
  const config = MODULES_REGISTRY[moduleId];
  if (config && config.nextModules) {
    
    const nextModulesPayload = config.nextModules.map(target => {
      // Normalisation : target peut être "string" ou "object"
      const targetId = typeof target === 'string' ? target : target.id;
      
      // Calcul des règles (Spécifique > Défaut)
      const specificDelay = typeof target === 'object' ? target.delayDays : undefined;
      const specificCondition = typeof target === 'object' ? target.condition : undefined;
      
      const delay = specificDelay ?? config.defaultUnlockDelayDays ?? 0;
      const condition = specificCondition ?? config.defaultUnlockCondition ?? 'fixed_delay';

      const availableAt = getUnlockDate(condition, delay);

      return {
        targetId,
        payload: {
          user_id: user.id,
          module_id: targetId,
          status: 'available',
          available_at: availableAt.toISOString()
        }
      };
    });

    // We need to group inserts by table
    const weekPayloads = nextModulesPayload
      .filter(item => getTableForModule(item.targetId) === 'user_week_states')
      .map(item => item.payload);

    const modulePayloads = nextModulesPayload
      .filter(item => getTableForModule(item.targetId) === 'user_module_state_entries')
      .map(item => item.payload);

    if (weekPayloads.length > 0) {
      await supabaseClient
        .from('user_week_states')
        .upsert(weekPayloads, { onConflict: 'user_id, module_id' });
    }

    if (modulePayloads.length > 0) {
      await supabaseClient
        .from('user_module_state_entries')
        // For module entries, we might want to preserve content if it exists?
        // Upsert on conflict (user_id, module_id) will overwrite.
        // If row exists, we update status/available_at. Content is not touched unless specified.
        // Wait, supabase .upsert() replaces the whole row by default unless ignoreDuplicates is true, 
        // OR we need to verify if partial update works with upsert.
        // Typically upsert replaces. To merge, we might need a different approach or rely on default.
        // But if content exists, we don't want to lose it!
        // user_module_state_entries has content.
        // Solution: Use onConflict ignore? No, we want to update availability.
        // Better: Use INSERT ... ON CONFLICT (user_id, module_id) DO UPDATE SET status=EXCLUDED.status...
        // Supabase upsert handles this if we provide the columns.
        // But if we don't provide 'content', and the row exists, does it nullify content?
        // Postgres INSERT ... ON CONFLICT DO UPDATE SET ... only updates specified columns if explicitly written.
        // Supabase-js upsert: "If the record exists, it will be updated with the data provided."
        // So if we don't provide 'content', and the row exists, 'content' should be preserved (not touched)?
        // NO. If we provide { id, ... } it replaces? 
        // Actually, supabase-js upsert performs an INSERT ... ON CONFLICT DO UPDATE SET ...
        // It updates columns provided in the object. It does NOT set missing columns to null/default unless it's a new row.
        // So omitting 'content' is safe for existing rows.
        .upsert(modulePayloads, { onConflict: 'user_id, module_id' });
    }
  }

  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
});


