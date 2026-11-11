"use client";

import { useEffect, useReducer } from "react";
import { eventsUrl } from "@/lib/api-client";
import type {
  Challenge,
  Claim,
  Entities,
  Judgement,
  Lead,
  LinkCheck,
  LlmCall,
  Report,
  RunEvent,
  RunStatus,
  Signal,
  Source,
  StageKey,
  TavilyCall,
} from "@/types";

export type StageState = { state: "pending" | "active" | "done" | "error"; durationMs?: number };
export type Activity =
  | { t: number; kind: "log"; level: "info" | "warn"; stage?: StageKey; message: string }
  | { t: number; kind: "tavily"; call: TavilyCall };

export interface LiveState {
  status: RunStatus | "connecting";
  stages: Record<StageKey, StageState>;
  activity: Activity[];
  stream: { kind: "thinking" | "content"; text: string }[];
  llmCalls: LlmCall[];
  tavilyCalls: TavilyCall[];
  sources: Source[];
  signals: Signal[];
  claims: Claim[];
  entities: Entities | null;
  official: string | null;
  judgement: Judgement | null;
  challenge: Challenge | null;
  links: LinkCheck[];
  leads: Lead[];
  round: number;
  report: Report | null;
  error: string | null;
  elapsed: number;
  disconnected: boolean;
}

const STAGE_KEYS: StageKey[] = ["intake", "investigate", "judge", "challenge", "brief"];

function initialState(): LiveState {
  return {
    status: "connecting",
    stages: Object.fromEntries(STAGE_KEYS.map((k) => [k, { state: "pending" }])) as Record<StageKey, StageState>,
    activity: [],
    stream: [],
    llmCalls: [],
    tavilyCalls: [],
    sources: [],
    signals: [],
    claims: [],
    entities: null,
    official: null,
    judgement: null,
    challenge: null,
    links: [],
    leads: [],
    round: 0,
    report: null,
    error: null,
    elapsed: 0,
    disconnected: false,
  };
}

type Action = { type: "event"; event: RunEvent } | { type: "reset" } | { type: "disconnected" };

function apply(state: LiveState, event: RunEvent): LiveState {
  const next = { ...state, elapsed: event.t };
  switch (event.type) {
    case "status":
      return { ...next, status: event.status, error: event.status === "error" ? (event.message ?? state.error) : state.error };
    case "stage": {
      const state_ = event.state === "start" ? "active" : event.state;
      return { ...next, stages: { ...state.stages, [event.stage]: { state: state_, durationMs: event.duration_ms } } };
    }
    case "log":
      return { ...next, activity: [...state.activity, { t: event.t, kind: "log", level: event.level, stage: event.stage, message: event.message }] };
    case "tavily_call":
      return {
        ...next,
        tavilyCalls: [...state.tavilyCalls, event.call],
        activity: [...state.activity, { t: event.t, kind: "tavily", call: event.call }],
      };
    case "llm_call":
      return { ...next, llmCalls: [...state.llmCalls, event.call] };
    case "stream": {
      const last = state.stream[state.stream.length - 1];
      const stream =
        last && last.kind === event.kind
          ? [...state.stream.slice(0, -1), { kind: last.kind, text: last.text + event.text }]
          : [...state.stream, { kind: event.kind, text: event.text }];
      return { ...next, stream };
    }
    case "source":
      return { ...next, sources: [...state.sources, event.source] };
    case "signal":
      return { ...next, signals: [...state.signals, event.signal] };
    case "entities":
      return {
        ...next,
        entities: event.entities,
        claims: event.claims.map((c) => ({ ...c, status: "pending" as const })),
      };
    case "lead": {
      const exists = state.leads.some((l) => l.id === event.lead.id);
      const leads = exists ? state.leads.map((l) => (l.id === event.lead.id ? event.lead : l)) : [...state.leads, event.lead];
      return { ...next, leads };
    }
    case "round":
      return { ...next, round: event.round };
    case "official":
      return { ...next, official: event.domain };
    case "claim": {
      const exists = state.claims.some((c) => c.id === event.claim.id);
      const claims = exists
        ? state.claims.map((c) => (c.id === event.claim.id ? { ...c, ...event.claim } : c))
        : [...state.claims, event.claim];
      return { ...next, claims };
    }
    case "judgement":
      return { ...next, judgement: event.judgement };
    case "challenge":
      return { ...next, challenge: event.challenge };
    case "link":
      return { ...next, links: [...state.links, event.link] };
    case "report":
      return { ...next, report: event.report };
    case "error":
      return { ...next, error: event.message };
    default:
      return next;
  }
}

function reduce(state: LiveState, action: Action): LiveState {
  if (action.type === "reset") return initialState();
  if (action.type === "disconnected") return { ...state, disconnected: true };
  return apply(state, action.event);
}

export type StreamMode = "live" | "replay" | "instant" | null;

const REPLAY_SPEED = { live: undefined, replay: 5, instant: 0 } as const;

/** Streams an investigation's events into UI state: live, a paced replay (5×), or all at once ("instant"). */
export function useInvestigationStream(id: string, mode: StreamMode, session = 0): LiveState {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);

  useEffect(() => {
    if (!mode) return;
    dispatch({ type: "reset" });
    const source = new EventSource(eventsUrl(id, REPLAY_SPEED[mode]));
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      dispatch({ type: "event", event });
      if (event.type === "status" && (event.status === "done" || event.status === "error")) source.close();
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) dispatch({ type: "disconnected" });
    };
    return () => source.close();
  }, [id, mode, session]);

  return state;
}
