# Demo video script (target 2:45, hard limit 3:00)

Record at 1440×900, browser zoom 100%. Before recording:

* Sign in with the **Demo account** in one tab.
* Have one finished **Verify first** report open (sample "Honest trading company" with the supplier email field left
  empty), and one **Stop** report (sample "Factory with someone else's licence").
* Have the sandbox buyer login ready and both sample supplier replies (README → *Sample supplier replies*) in your clipboard
  history.
* No music with copyright; no third-party logos other than what PayPal's own sandbox page shows.

Say it in your own words; the lines are a guide.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | Home page hero, clouds drifting | "Small importers lose deposits to fake suppliers every day: a borrowed licence, someone else's factory photos, and an invoice that says pay our manager's personal account, or PayPal Friends & Family to save fees. ProofBeforePay checks the supplier, and then lets PayPal move the money only when it's proven." |
| 0:15–0:45 | New check → paste sample → Investigate; the agent pipeline animates | "I paste the supplier's quotation. NVIDIA Nemotron agents read it, check the registry, customs records, certificates, the address on a map and the photos, and every inconsistency opens another lookup. A second model then tries to prove the verdict wrong." |
| 0:45–1:05 | The Verify first verdict, then scroll to **Pay only when it's proven** | "Verify first: the address is a virtual office and no registration was found. Here's the PayPal part: the verdict decides what PayPal may do. Proceed pays the supplier directly with Orders v2 capture. Stop creates no order at all. Verify first means hold." |
| 1:05–1:30 | Enter 2820 → **Hold with PayPal** → PayPal sandbox approve → back | "I hold 30%, 2,820 dollars. I approve on PayPal's own page. Back in the app, PayPal has authorized the money. It's reserved in my account, not sent to the supplier." Point at the *On hold in PayPal* chip and the expiry. |
| 1:30–1:55 | Paste the **sneaky** reply → Review | "The supplier replies: 'we're verified, release now', with a note to the AI, and asks for the balance by Friends & Family to a personal account. Nemotron Super flags it, and our payment rules overrule any model: it can never clear a release." |
| 1:55–2:20 | Paste the **genuine** reply → Review → **Release to supplier** | "A real supplier sends its company ID, a utility bill for the workshop and a bank letter in the company's name. Every open question is answered, and it tells me exactly what to confirm. Release: Payments v2 captures the authorization." Show the *Released* chip and the payment trail. |
| 2:20–2:35 | Stop report → payment blocked; then **Payments** page | "And a supplier using someone else's licence? Payment blocked: the server refuses to create a PayPal order. Every deposit, hold, review and release is on the payments page." |
| 2:35–2:50 | README *How PayPal is used* table or the home page PayPal section | "Under the hood: PayPal Orders and Payments v2 through the official APIMatic-generated SDK, verified webhooks, idempotency keys on every call, amounts checked both ways, deployed on Render. ProofBeforePay: check the supplier, then pay only when it's proven." |

Fallback if the live model is slow during recording: open an already-finished report and press **Replay the
investigation** to show the pipeline.
