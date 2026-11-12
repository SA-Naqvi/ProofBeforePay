"use client";

import { Check, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { FormAlert, SelectField, TextArea, TextField } from "@/components/ui/form";
import { api } from "@/lib/api-client";
import { check, contactSchema, type FieldErrors } from "@/lib/schemas";
import { useSession } from "@/stores/session";
import type { ContactTopic } from "@/types";

const TOPICS: { value: ContactTopic; label: string }[] = [
  { value: "question", label: "A question" },
  { value: "feedback", label: "Feedback on a report" },
  { value: "bug", label: "Something isn't working" },
  { value: "partnership", label: "Partnership" },
  { value: "press", label: "Press" },
  { value: "other", label: "Something else" },
];

export function ContactForm() {
  const { user } = useSession();
  const [values, setValues] = useState({ name: "", email: "", topic: "question" as ContactTopic, message: "" });
  const [errors, setErrors] = useState<FieldErrors<typeof values>>({});
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    if (user) setValues((v) => ({ ...v, name: v.name || user.name, email: v.email || user.email }));
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = check(contactSchema, values);
    if (result.errors) return setErrors(result.errors);
    setErrors({});
    setError(null);
    setState("sending");
    try {
      await api.contact(result.data);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your message.");
      setState("idle");
    }
  }

  return (
    <div className="glass relative overflow-hidden rounded-[26px] p-6 sm:p-8">
      <AnimatePresence mode="wait">
        {state === "sent" ? (
          <motion.div key="sent" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex min-h-[420px] flex-col items-center justify-center text-center">
            <motion.span
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="grid size-20 place-items-center rounded-full bg-brand-500 text-ink-950 shadow-[0_0_60px_-6px_rgba(14,165,233,0.7)]"
            >
              <Check className="size-10" strokeWidth={3} aria-hidden />
            </motion.span>
            <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-bone-50">Message sent.</h2>
            <p className="mt-2 max-w-sm text-bone-400">Thanks, {(values.name || "").split(" ")[0]}. We&apos;ll reply to {values.email}.</p>
            <button
              type="button"
              onClick={() => {
                setValues({ ...values, message: "" });
                setState("idle");
              }}
              className="mt-8 text-sm text-bone-400 underline-offset-4 hover:text-bone-50 hover:underline"
            >
              Send another
            </button>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={submit} exit={{ opacity: 0, y: -10 }} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Name" autoComplete="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} error={errors.name} />
              <TextField label="Email" type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} error={errors.email} />
            </div>
            <SelectField label="What's it about?" options={TOPICS} value={values.topic} onChange={(e) => setValues({ ...values, topic: e.target.value as ContactTopic })} />
            <TextArea
              label="Message"
              rows={7}
              value={values.message}
              onChange={(e) => setValues({ ...values, message: e.target.value })}
              error={errors.message}
              hint={`${values.message.length}/5000`}
              maxLength={5000}
              placeholder="Tell us what's on your mind. If it's about a report, paste its link."
            />
            <FormAlert message={error} />
            <button
              type="submit"
              disabled={state === "sending"}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-[15px] font-semibold text-ink-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:px-7"
            >
              {state === "sending" ? <Spinner className="size-4" /> : <Send className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />}
              Send message
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
