"use client";

import { ArrowUp, MessageCircleQuestion } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { prefersReducedMotion } from "@/lib/gsap";
import { DECISION_LABEL } from "@/features/decision-brief/markdown";
import type { Decision } from "@/types";
import { Card, CardHeader, cx, RefText } from "@/components/ui";

const MIN = 3;
const MAX = 500;

interface Turn {
  question: string;
  answer?: string;
  error?: string;
}

function suggestions(decision: Decision): string[] {
  const why = `Why is this a ${DECISION_LABEL[decision]}?`;
  if (decision === "PROCEED") return [why, "Is anything still worth checking?", "Is a 30% deposit reasonable?", "How do I confirm the factory is real?"];
  return [why, "What should I ask the supplier for?", "Could this supplier still be genuine?", "What would make this safe?"];
}

/** Shows an answer a few words at a time, the way a person would read it out. */
function Typed({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? words.length : 0));

  useEffect(() => {
    if (shown >= words.length) return;
    const id = window.setTimeout(() => setShown((n) => Math.min(words.length, n + 4)), 40);
    return () => window.clearTimeout(id);
  }, [shown, words.length]);

  return shown >= words.length ? <RefText text={text} /> : <span>{words.slice(0, shown).join("")}</span>;
}

/** Follow-up questions about one finished report, answered by Nemotron Super from that report's evidence only. */
export function AskReport({ runId, decision }: { runId: string; decision: Decision }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (busy || q.length < MIN) return;
    setBusy(true);
    setDraft("");
    setTurns((t) => [...t, { question: q }]);
    let result: Turn;
    try {
      const { answer } = await api.ask(runId, q);
      result = { question: q, answer };
    } catch (err) {
      result = { question: q, error: err instanceof Error ? err.message : "Couldn't get an answer. Try again in a moment." };
    }
    setTurns((t) => [...t.slice(0, -1), result]);
    setBusy(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  const asked = new Set(turns.map((t) => t.question));
  const chips = suggestions(decision).filter((s) => !asked.has(s));

  return (
    <Card spotlight>
      <CardHeader
        icon={<MessageCircleQuestion className="size-4" />}
        title="Ask about this report"
        subtitle="Nemotron Super answers from this report's evidence only"
      />
      <div className="space-y-4 p-5">
        {turns.length > 0 && (
          <div ref={list} className="scroll-slim max-h-[420px] space-y-4 overflow-y-auto pr-1" aria-live="polite">
            <AnimatePresence initial={false}>
              {turns.map((turn, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-500/[0.12] px-3.5 py-2 text-sm text-bone-50 ring-1 ring-brand-500/25 ring-inset">
                    {turn.question}
                  </p>
                  <div
                    className={cx(
                      "w-fit max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed ring-1 ring-inset",
                      turn.error ? "bg-stop-500/[0.06] text-stop-200 ring-stop-400/25" : "bg-white/[0.03] text-bone-300 ring-white/[0.07]",
                    )}
                  >
                    {turn.error ? (
                      turn.error
                    ) : turn.answer ? (
                      <Typed text={turn.answer} />
                    ) : (
                      <span className="dots inline-flex gap-1 py-1" aria-label="Thinking">
                        <span className="size-1.5 rounded-full bg-bone-400" />
                        <span className="size-1.5 rounded-full bg-bone-400" />
                        <span className="size-1.5 rounded-full bg-bone-400" />
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => void ask(s)}
                className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs text-bone-300 ring-1 ring-white/10 ring-inset transition-colors hover:bg-white/[0.07] hover:text-bone-50 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-xl bg-black/25 p-1.5 ring-1 ring-white/[0.08] ring-inset focus-within:ring-brand-500/45">
          <label htmlFor="ask-report" className="sr-only">
            Your question about this report
          </label>
          <input
            id="ask-report"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
            placeholder="Ask anything about this supplier…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm text-bone-50 placeholder:text-bone-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length < MIN}
            aria-label="Ask"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-ink-950 transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </form>
        <p className="text-[11px] text-bone-500">Numbers in brackets link to the evidence. It won&apos;t guess beyond what the check found.</p>
      </div>
    </Card>
  );
}
