eval "$(cd '/Users/ahmedamara/Dev/Sophia 2' && supabase status -o env 2>/dev/null | sed 's/^ANON_KEY/SUPABASE_ANON_KEY/;s/^SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY/')"
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
