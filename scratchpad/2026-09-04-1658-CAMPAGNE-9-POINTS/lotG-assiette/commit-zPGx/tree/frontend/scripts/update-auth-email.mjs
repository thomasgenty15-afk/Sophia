import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing env: SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

// Usage:
// SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/update-auth-email.mjs <userId> <newEmail>
const [userId, newEmail] = process.argv.slice(2);
if (!userId) throw new Error("Missing arg: userId (UUID)");
if (!newEmail) throw new Error("Missing arg: newEmail");

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
  email: newEmail,
  email_confirm: true,
});

if (error) throw error;
console.log("OK", { id: data.user?.id, email: data.user?.email });



