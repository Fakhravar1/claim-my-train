const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClaimAssistantRequest {
  departureDate: string;
  departureTime: string;
  line: string;
  lineName: string;
  from: string;
  to: string;
  scheduledArrivalTime?: string | null;
  actualArrivalTime?: string | null;
  delayMinutes?: number;
  mobileNumber?: string | null;
  ticketId?: string | null;
}

interface WorkerResponse {
  success?: boolean;
  message?: string;
}

const validatePayload = (payload: Partial<ClaimAssistantRequest>) => {
  if (!payload.departureDate || !payload.departureTime) {
    return "Missing departure date/time";
  }
  if (!payload.line || !payload.from || !payload.to) {
    return "Missing route details";
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const workerUrl = Deno.env.get("CLAIM_AUTOFILL_WORKER_URL");
  const workerApiKey = Deno.env.get("CLAIM_AUTOFILL_WORKER_API_KEY");
  if (!workerUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Claim automation worker is not configured",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = (await req.json()) as Partial<ClaimAssistantRequest>;
    const validationError = validatePayload(body);
    if (validationError) {
      return new Response(JSON.stringify({ success: false, message: validationError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timeoutMs = Number(Deno.env.get("CLAIM_AUTOFILL_WORKER_TIMEOUT_MS") || "90000");
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let workerResponse: Response;
    try {
      workerResponse = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workerApiKey ? { Authorization: `Bearer ${workerApiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!workerResponse.ok) {
      const details = await workerResponse.text();
      return new Response(
        JSON.stringify({
          success: false,
          message: `Worker failed (${workerResponse.status})`,
          details,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = (await workerResponse.json()) as WorkerResponse;
    return new Response(
      JSON.stringify({
        success: Boolean(result.success),
        message: result.message ?? (result.success ? "Autofill launched" : "Autofill failed"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return new Response(
      JSON.stringify({
        success: false,
        message: isTimeout ? "Worker request timed out" : "Unexpected claim assistant error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
