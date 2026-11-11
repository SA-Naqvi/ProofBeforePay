"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormAlert, PasswordField, TextField } from "@/components/ui/form";
import { ApiError, auth } from "@/lib/api-client";
import { check, signupSchema, type FieldErrors } from "@/lib/schemas";
import { DemoAccess } from "./DemoAccess";
import { AuthHeading, safeNext, stagger, SubmitButton } from "./shared";

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<typeof values>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = check(signupSchema, values);
    if (result.errors) return setErrors(result.errors);
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      await auth.signup(result.data);
      router.push(`/verify?email=${encodeURIComponent(result.data.email)}&next=${encodeURIComponent(next)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "cooldown") {
        router.push(`/verify?email=${encodeURIComponent(result.data.email)}&next=${encodeURIComponent(next)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't create your account.");
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeading eyebrow="Free account" title="Create your account">
        Your checks are saved, so you can come back to the evidence, compare suppliers, and watch how the agents worked.
      </AuthHeading>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <motion.div {...stagger(0)}>
          <TextField label="Name" autoComplete="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} error={errors.name} placeholder="Your name" />
        </motion.div>
        <motion.div {...stagger(1)}>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            error={errors.email}
            placeholder="you@example.com"
            hint="We'll send a code to it"
          />
        </motion.div>
        <motion.div {...stagger(2)}>
          <PasswordField
            label="Password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            error={errors.password}
            hint="At least 8 characters"
            showStrength
          />
        </motion.div>
        <FormAlert message={error} />
        <motion.div {...stagger(3)} className="pt-2">
          <SubmitButton busy={busy}>Create account</SubmitButton>
        </motion.div>
        <motion.p {...stagger(4)} className="text-center text-xs leading-relaxed text-bone-600">
          We use your email only to sign you in and to send codes. Delete your account and everything in it any time from Settings.
        </motion.p>
      </form>
      <motion.p {...stagger(5)} className="mt-8 text-center text-sm text-bone-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-bone-100 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </motion.p>
      <DemoAccess next={next} />
    </>
  );
}
