"use client";

import { CircleCheck, Clock3, Coins, ExternalLink, Landmark, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DepositList } from "@/components/payments/PaymentGate";
import { Button, Card, CardHeader, cx, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/ui/page";
import { useApi } from "@/hooks/useApi";
import { billing } from "@/lib/api-client";
import { dateTime } from "@/lib/formatters";
import type { BillingState, CaptureResult, CreditPack } from "@/types";

type Notice = { tone: "ok" | "warn" | "bad"; text: string } | null;

const money = (price: string, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(price));

function PackCard({ pack, cost, busy, disabled, onBuy }: { pack: CreditPack; cost: number; busy: boolean; disabled: boolean; onBuy: () => void }) {
  const checks = Math.floor(pack.credits / cost);
  return (
    <Card className="flex flex-col p-6">
      <p className="font-mono text-[11px] tracking-[0.14em] text-bone-500 uppercase">{pack.label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-bone-50">
        {pack.credits} <span className="text-lg font-medium text-bone-400">credits</span>
      </p>
      <p className="mt-1 text-sm text-bone-400">
        {checks} supplier check{checks === 1 ? "" : "s"} · {money((Number(pack.price) / pack.credits).toFixed(2), pack.currency)} each
      </p>
      <p className="mt-6 text-2xl font-semibold text-bone-100">{money(pack.price, pack.currency)}</p>
      <Button className="mt-5 w-full justify-center" onClick={onBuy} disabled={disabled}>
        {busy ? <Spinner className="size-4" /> : null}
        {busy ? "Opening PayPal…" : "Pay with PayPal"}
      </Button>
    </Card>
  );
}

export function BillingPage() {
  const state = useApi<BillingState>(() => billing.get(), []);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [finishing, setFinishing] = useState(false);
  const handled = useRef(false);

  // PayPal sends the buyer back with ?paid=1&token=<order id>. The server captures and verifies the payment.
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (params.get("cancelled")) setNotice({ tone: "warn", text: "Checkout cancelled. You weren't charged." });
    if (params.get("paid") && token) {
      setFinishing(true);
      billing
        .capture(token)
        .then((result: CaptureResult) => {
          if (result.status === "completed") {
            setNotice({
              tone: "ok",
              text: result.already_applied ? "That payment was already applied to your balance." : `Payment received. ${result.credits} credits added.`,
            });
          } else {
            setNotice({ tone: "warn", text: "PayPal is still processing this payment. Your credits will be added once it clears; refresh in a moment." });
          }
        })
        .catch((err: unknown) => setNotice({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't confirm the payment." }))
        .finally(() => {
          setFinishing(false);
          void state.reload();
        });
    }
    if (params.size) window.history.replaceState(null, "", "/billing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy(pack: CreditPack) {
    setBuying(pack.id);
    setNotice(null);
    try {
      const { approve_url } = await billing.createOrder(pack.id);
      window.location.assign(approve_url);
    } catch (err) {
      setNotice({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't start checkout." });
      setBuying(null);
    }
  }

  const data = state.data;
  const sandbox = data?.environment === "sandbox";

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Payments" title="PayPal, end to end">
        Supplier deposits you paid or held through PayPal, gated by each report&apos;s verdict, and the credits that pay for checks.
      </PageHeader>

      <section className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Landmark className="size-4 text-brand-300" aria-hidden />
          <h2 className="text-sm font-semibold text-bone-50">Supplier deposits</h2>
          <span className="text-xs text-bone-500">Proceed pays now · Verify first holds until the proof clears · Stop blocks</span>
        </div>
        <DepositList />
      </section>

      <div className="mb-3 flex items-center gap-2">
        <Coins className="size-4 text-brand-300" aria-hidden />
        <h2 className="text-sm font-semibold text-bone-50">Check credits</h2>
        <span className="text-xs text-bone-500">Each check uses {data?.cost_per_check ?? 1} credit; credits never expire</span>
      </div>

      {sandbox && data?.enabled && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-caution-400/25 bg-caution-400/[0.06] px-4 py-3 text-sm text-caution-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">PayPal sandbox.</strong> This is a test environment: sign in to PayPal with a sandbox buyer account. No real money moves.
          </span>
        </div>
      )}

      {finishing && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-bone-200">
          <Spinner className="size-4" /> Confirming your payment with PayPal…
        </div>
      )}
      {notice && (
        <div
          role="status"
          className={cx(
            "mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
            notice.tone === "ok" && "border-brand-500/30 bg-brand-500/[0.07] text-brand-200",
            notice.tone === "warn" && "border-caution-400/25 bg-caution-400/[0.06] text-caution-200",
            notice.tone === "bad" && "border-stop-500/30 bg-stop-500/[0.07] text-stop-200",
          )}
        >
          {notice.tone === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {notice.text}
        </div>
      )}

      {state.error && <p className="text-sm text-stop-300">{state.error}</p>}

      {data && !data.enabled && (
        <Card className="p-6 text-sm text-bone-300">
          Payments aren&apos;t switched on for this server, so checks are free. To enable them, set <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code>.
        </Card>
      )}

      {data?.enabled && (
        <>
          <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-brand-300">
                <Coins className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-mono text-[11px] tracking-[0.14em] text-bone-500 uppercase">Your balance</p>
                <p className="text-3xl font-semibold tracking-[-0.04em] text-bone-50">
                  {data.exempt ? "Unlimited" : `${data.balance ?? 0} credits`}
                </p>
              </div>
            </div>
            {data.exempt && (
              <p className="max-w-xs text-sm text-bone-400">
                Administrator and demo accounts run checks for free. You can still try a sandbox purchase below.
              </p>
            )}
          </Card>

          {data.packs.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {data.packs.map((pack) => (
                <PackCard key={pack.id} pack={pack} cost={data.cost_per_check} busy={buying === pack.id} disabled={buying !== null || finishing} onBuy={() => void buy(pack)} />
              ))}
            </div>
          )}

          <p className="mt-4 flex items-center gap-2 text-xs text-bone-500">
            <ShieldCheck className="size-3.5" aria-hidden />
            You pay on PayPal&apos;s own page; we never see your card or PayPal password. A check that fails is refunded automatically.
            <ExternalLink className="size-3" aria-hidden />
          </p>

          {data.history && data.history.length > 0 && (
            <Card className="mt-8">
              <CardHeader icon={<Clock3 className="size-4" />} title="Activity" subtitle="Purchases, checks and refunds" />
              <ul className="divide-y divide-white/[0.06]">
                {data.history.map((row) => (
                  <li key={row.ref} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-bone-100">{row.reason}</span>
                      <span className="font-mono text-[11px] text-bone-500">{dateTime(new Date(row.created_at).getTime() / 1000)}</span>
                    </span>
                    <span className={cx("font-mono tabular-nums", row.delta > 0 ? "text-brand-300" : "text-bone-300")}>
                      {row.delta > 0 ? "+" : ""}
                      {row.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
