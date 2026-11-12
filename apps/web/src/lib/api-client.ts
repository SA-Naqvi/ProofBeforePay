import type {
  AdminOverview,
  AdminUser,
  BillingState,
  CaptureResult,
  ContactMessage,
  ContactTopic,
  Deposit,
  FeedbackItem,
  Health,
  InvestigationDetail,
  InvestigationSummary,
  OfferInput,
  PaymentPlan,
  ProofReview,
  PublicStats,
  User,
} from "@/types";

/** Empty everywhere: production serves the app from FastAPI, and the dev server proxies /api to it. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "",
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // Only send a JSON content type with a body, so plain GETs stay simple requests.
    const headers = init?.body ? { "content-type": "application/json" } : undefined;
    response = await fetch(apiUrl(`/api/v1${path}`), { credentials: "same-origin", ...init, headers });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (!response.ok) {
    let message = `Something went wrong (${response.status}). Please try again.`;
    let code = "";
    try {
      const { detail } = await response.json();
      if (typeof detail === "string") message = detail;
      else if (detail && typeof detail.message === "string") ({ message, code = "" } = detail);
      else if (Array.isArray(detail) && detail[0]?.msg) message = String(detail[0].msg).replace(/^Value error, /, "");
    } catch {
      // Non-JSON error body: keep the status-based message.
    }
    throw new ApiError(message, response.status, code);
  }
  return response.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const eventsUrl = (id: string, replay?: number) =>
  apiUrl(`/api/v1/investigations/${encodeURIComponent(id)}/events${replay !== undefined ? `?replay=${replay}` : ""}`);

export const api = {
  health: () => request<Health>("/health"),
  examples: () => request<InvestigationSummary[]>("/examples"),
  get: (id: string) => request<InvestigationDetail>(`/investigations/${encodeURIComponent(id)}`),
  create: (input: OfferInput) => post<{ id: string }>("/investigations", input),
  feedback: (body: { investigation_id?: string; rating: number; comment?: string }) => post<{ status: string }>("/feedback", body),
  ask: (id: string, question: string) => post<{ answer: string }>(`/investigations/${encodeURIComponent(id)}/ask`, { question }),
  transcribe: (image: string) => post<{ text: string; model: string }>("/transcribe", { image }),
  stats: () => request<PublicStats>("/stats"),
  contact: (body: { name: string; email: string; topic: ContactTopic; message: string }) => post<{ status: string }>("/contact", body),
};

export const auth = {
  me: () => request<{ user: User | null }>("/auth/me"),
  signup: (body: { name: string; email: string; password: string }) => post<{ status: "verify"; email: string }>("/auth/signup", body),
  verify: (body: { email: string; code: string }) => post<{ user: User }>("/auth/verify", body),
  resend: (body: { email: string; purpose: "verify" | "reset" }) => post<{ status: string }>("/auth/resend", body),
  login: (body: { email: string; password: string }) => post<{ user: User }>("/auth/login", body),
  demo: (kind: "judge" | "admin") => post<{ user: User }>("/auth/demo", { kind }),
  forgot: (body: { email: string }) => post<{ status: string }>("/auth/forgot", body),
  reset: (body: { email: string; code: string; password: string }) => post<{ user: User }>("/auth/reset", body),
  logout: () => post<{ status: string }>("/auth/logout"),
};

export const billing = {
  get: () => request<BillingState>("/billing"),
  createOrder: (packId: string) => post<{ order_id: string; approve_url: string }>("/billing/orders", { pack_id: packId }),
  capture: (orderId: string) => post<CaptureResult>(`/billing/orders/${encodeURIComponent(orderId)}/capture`),
};

const dep = (id: string, action: string) => `/deposits/${encodeURIComponent(id)}/${action}`;

/** Deposits to a supplier through PayPal. The server reads the report's verdict itself and decides pay vs hold. */
export const deposits = {
  plan: (runId: string) => request<PaymentPlan>(`/investigations/${encodeURIComponent(runId)}/payment`),
  list: () => request<Deposit[]>("/deposits"),
  start: (runId: string, amount: string, payeeEmail: string) =>
    post<{ deposit_id: string; order_id: string; approve_url: string; mode: "pay" | "hold" }>("/deposits", {
      run_id: runId,
      amount,
      payee_email: payeeEmail || null,
    }),
  complete: (id: string) => post<Deposit>(dep(id, "complete")),
  review: (id: string, proof: string) => post<ProofReview>(dep(id, "review"), { proof }),
  release: (id: string, acknowledgeRisk = false) => post<Deposit>(dep(id, "release"), { acknowledge_risk: acknowledgeRisk }),
  cancel: (id: string) => post<Deposit>(dep(id, "cancel")),
  track: (id: string, trackingNumber: string, carrier: string) => post<Deposit>(dep(id, "tracking"), { tracking_number: trackingNumber, carrier }),
};

export const me = {
  investigations: () => request<InvestigationSummary[]>("/me/investigations"),
  rename: (name: string) => request<{ user: User }>("/me", { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: () => request<{ status: string }>("/me", { method: "DELETE" }),
};

export const admin = {
  overview: () => request<AdminOverview>("/admin/overview"),
  users: () => request<AdminUser[]>("/admin/users"),
  investigations: () => request<InvestigationSummary[]>("/admin/investigations"),
  feedback: () => request<FeedbackItem[]>("/admin/feedback"),
  messages: () => request<ContactMessage[]>("/admin/messages"),
};
