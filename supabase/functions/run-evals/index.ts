/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serveRunEvals } from "./serve.ts";

serveRunEvals();
