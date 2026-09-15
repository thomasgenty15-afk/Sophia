// Test script to inspect module entries for week 12
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// You'll need to set these env vars or replace them with your actual keys
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkWeek12Entries() {
  console.log("Checking entries starting with 'a12_'...");
  
  const { data, error } = await supabase
    .from('user_module_state_entries')
    .select('module_id, content, status, user_id')
    .like('module_id', 'a12_%');

  if (error) {
    console.error("Error fetching entries:", error);
    return;
  }

  console.log(`Found ${data.length} entries for week 12:`);
  data.forEach(entry => {
    console.log(`- ID: ${entry.module_id}, Status: ${entry.status}`);
    console.log(`  Content:`, JSON.stringify(entry.content));
  });
}

checkWeek12Entries();

