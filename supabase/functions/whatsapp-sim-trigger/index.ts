/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";

type SimEvent =
  | "optin"
  | "checkin"
  | "weekly_bilan"
  | "weekly_planning_validation"
  | "recurring_reminder"
  | "end_trial"
  | "end_subscription"
  | "winback_step1_soft"
  | "winback_step2_refocus"
  | "winback_step3_opendoor"
  | "process_checkins";

type Body = {
  event?: SimEvent;
  template_name?: string;
  dashboard_url?: string;
  template_params?: string[];
};

function env(name: string): string {
  return String(Deno.env.get(name) ?? "").trim();
}

function isEnabled(): boolean {
  const raw = env("WHATSAPP_WEB_SIMULATION_ENABLED").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function bodyParam(text: string) {
  return {
    type: "body",
    parameters: [{ type: "text", text }],
  };
}

function templateForEvent(event: SimEvent, body: Body, fallbackName: string) {
  const firstParam = Array.isArray(body.template_params) && body.template_params[0]
    ? String(body.template_params[0])
    : fallbackName;
  if (event === "optin") {
    return {
      purpose: "optin",
      require_opted_in: false,
      message: {
        type: "template",
        name: "sophia_optin_v2",
        language: "fr",
        components: [bodyParam(firstParam)],
      },
    };
  }
  if (event === "checkin") {
    return {
      purpose: "scheduled_checkin",
      require_opted_in: false,
      message: {
        type: "template",
        name: "sophia_checkin_v2",
        language: "fr",
        // Meta-approved sophia_checkin_v2 has zero placeholders.
        components: [],
      },
    };
  }
  if (event === "weekly_bilan") {
    return {
      purpose: "weekly_progress_review",
      require_opted_in: false,
      message: {
        type: "template",
        name: "sophia_bilan_weekly_v1",
        language: "fr",
        components: [bodyParam(firstParam)],
      },
    };
  }
  if (event === "weekly_planning_validation") {
    return {
      purpose: "weekly_planning_validation",
      require_opted_in: false,
      message: {
        type: "template",
        name: "weekly_planning_validation_v1",
        language: "fr",
        components: [bodyParam(body.dashboard_url || "https://sophia-coach.ai/")],
      },
    };
  }
  if (event === "recurring_reminder") {
    return {
      purpose: "recurring_reminder",
      require_opted_in: false,
      message: {
        type: "template",
        name: "sophia_reminder_consent_v1_",
        language: "fr",
      },
    };
  }
  if (event === "end_trial") {
    return {
      purpose: "end_trial",
      require_opted_in: false,
      message: {
        type: "template",
        name: "end_trial_v1",
        language: "fr",
        components: [bodyParam(firstParam)],
      },
    };
  }
  if (event === "end_subscription") {
    return {
      purpose: "end_subscription",
      require_opted_in: false,
      message: {
        type: "template",
        name: "end_subscription_v1",
        language: "fr",
        components: [bodyParam(firstParam)],
      },
    };
  }

  const winbackTemplateByEvent: Record<string, string> = {
    winback_step1_soft: "sophia_winback_step1_soft",
    winback_step2_refocus: "sophia_winback_step2_refocus",
    winback_step3_opendoor: "sophia_winback_step3_opendoor",
  };
  return {
    purpose: "daily_bilan_winback",
    require_opted_in: false,
    message: {
      type: "template",
      name: winbackTemplateByEvent[event] || "sophia_winback_step1_soft",
      language: "fr",
    },
  };
}

async function readBody(req: Request): Promise<Body> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Body
    : {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, { status: 405 });
  }
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const requestId = getRequestId(req);
  try {
    if (!isEnabled()) {
      return jsonResponse(
        req,
        { error: "WhatsApp web simulation is disabled", request_id: requestId },
        { status: 403 },
      );
    }

    const authHeader = String(req.headers.get("authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData.user;
    if (authError || !user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await readBody(req);
    const event = String(body.event ?? "checkin").trim() as SimEvent;
    if (event === "process_checkins") {
      const processRes = await fetch(
        `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/process-checkins`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
            "x-internal-secret": env("INTERNAL_FUNCTION_SECRET") || env("SECRET_KEY"),
          },
          body: JSON.stringify({ source: "whatsapp_web_sim", user_id: user.id }),
        },
      );
      const processJson = await processRes.json().catch(() => ({}));
      return jsonResponse(
        req,
        { ok: processRes.ok, process_checkins: processJson, request_id: requestId },
        { status: processRes.ok ? 200 : processRes.status },
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const fullName = String(
      (profile as any)?.full_name ??
        user.user_metadata?.full_name ??
        user.email?.split("@")[0] ??
        "Alex",
    ).trim() || "Alex";
    const payload = templateForEvent(event, body, fullName);
    const sendRes = await fetch(
      `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/whatsapp-send`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "x-internal-secret": env("INTERNAL_FUNCTION_SECRET") || env("SECRET_KEY"),
        },
        body: JSON.stringify({
          user_id: user.id,
          ...payload,
          metadata_extra: {
            source: "whatsapp_web_sim_trigger",
            sim_event: event,
          },
        }),
      },
    );
    const sendJson = await sendRes.json().catch(() => ({}));
    return jsonResponse(
      req,
      { ok: sendRes.ok, event, whatsapp_send: sendJson, request_id: requestId },
      { status: sendRes.ok ? 200 : sendRes.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(
      req,
      { error: message, request_id: requestId },
      { status: 500 },
    );
  }
});
