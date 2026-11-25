import type {
  AblationResponse,
  DocumentsResponse,
  HealthResponse,
  RunState,
  ScenariosResponse,
} from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { detail?: string };
      if (errBody.detail) {
        message = errBody.detail;
      }
    } catch {
      // Keep status message if body is not JSON
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health");
}

export function fetchScenarios(): Promise<ScenariosResponse> {
  return requestJson<ScenariosResponse>("/api/scenarios");
}

export function fetchDocuments(): Promise<DocumentsResponse> {
  return requestJson<DocumentsResponse>("/api/documents");
}

export function createRun(
  scenarioId: string | null,
  customEco?: Record<string, unknown> | null
): Promise<RunState> {
  return requestJson<RunState>("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      scenario_id: scenarioId,
      custom_eco: customEco ?? null,
    }),
  });
}

export function fetchRun(runId: string): Promise<RunState> {
  return requestJson<RunState>(`/api/runs/${encodeURIComponent(runId)}`);
}

export function resolveConflict(
  runId: string,
  conflictId: string,
  resolutionChoice: string,
  reviewerRationale: string
): Promise<RunState> {
  return requestJson<RunState>(
    `/api/runs/${encodeURIComponent(runId)}/conflicts/${encodeURIComponent(conflictId)}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({
        resolution_choice: resolutionChoice,
        reviewer_rationale: reviewerRationale,
      }),
    }
  );
}

export function signOffRun(runId: string, signOffNote: string): Promise<RunState> {
  return requestJson<RunState>(`/api/runs/${encodeURIComponent(runId)}/sign-off`, {
    method: "POST",
    body: JSON.stringify({ sign_off_note: signOffNote }),
  });
}

export function fetchAblation(): Promise<AblationResponse> {
  return requestJson<AblationResponse>("/api/ablation");
}
