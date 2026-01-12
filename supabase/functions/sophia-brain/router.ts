/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Thin facade: keep stable imports across functions (web/whatsapp/evals/internal jobs)
export { processMessage } from "./router/run.ts"



