# How ProofBeforePay decides

Methodology version 3 (supplier verification). The version is stored with every report (`report.version`, `investigations.methodology_version`), so an old report can still be explained after the rules change. Version 2 and earlier judged job offers and client messages.

ProofBeforePay answers one question: **is it safe to send this supplier a deposit?** It does not produce a fraud probability. The confidence number is the model's own estimate of how sure it is about the decision, adjusted by the rules below. It is not a statistically validated score and the UI never calls it one.

## The three answers

| Decision | Meaning |
|----------|---------|
| **Proceed** | The supplier's identity, registration and (if claimed) its status as a manufacturer are confirmed by independent sources, payment goes to an account in the company's name, and there are no material red flags. |
| **Verify first** | It may be genuine, but key facts are unconfirmed, or there are inconsistencies a document request or a live video could settle. The report says exactly what to ask for. |
| **Stop** | Concrete evidence of misrepresentation: a registration that belongs to a different entity, a certificate that doesn't exist or belongs to someone else, photos taken from another company, a payment account that isn't the company's. |

A trading company that says it is a trader is not a scam. The risk this tool looks for is a trader, a middleman or a shell posing as a factory.

## The investigation is a loop, not a checklist

Intake turns the paperwork into **claims** (the supplier is registered; this number is its number; it operates from this address; it is a manufacturer; it holds this certificate; these photos are its own; the money goes to its own account) and opens the first **leads**, one per kind of source. Each lead is a targeted lookup:

| Lead | Source | What it can show |
|------|--------|------------------|
| `registry` | Corporate registries (OpenCorporates when keyed, otherwise registry sites through Tavily) | Legal name, registration number, registered address, status, incorporation date, registered scope |
| `trade` | Customs and trade-log sites (ImportYeti, Panjiva, Volza… through Tavily) | Whether the entity ever exports, and how much |
| `certificate` | Certification directories | Holder, status, scope of a certificate |
| `domain` | RDAP | How old the supplier's website domain is |
| `address` | OpenStreetMap (Nominatim and Overpass) and a web search | Industrial, commercial or residential surroundings; virtual office or co-working listings |
| `image` | Reverse-image search (Google Vision, when keyed) | Other sites that use the same photo |
| `web` | Tavily search | Public complaints; whoever owns a site; any relationship between two names |

A model (Nano) reads the pages a lead returns and reports what they state, as assertions with a verbatim quote. **Code** then compares each assertion with the claim (`agent/reconcile.py`), so whether two names, numbers or addresses are "the same" never depends on a model's mood. An inconsistency opens new leads aimed at a different kind of source:

- the registry says the number belongs to another company → customs records under *that* name, a search for any link between the two names, a map survey of *its* address;
- the registered address differs from the invoice address → survey the registered address too;
- a certificate is held by someone else → find out who that is;
- a factory photo appears on another site → find out who owns that site, then whether that owner is the real factory;
- the account holder isn't the company → look that name up;
- a very new domain → look for reports about it.

After each round, if a finding is still open and the rules didn't follow it up, Nemotron Super may propose up to two more leads (never more than the allowed tools, never a repeat). The loop ends when no lead is open, or at the budget: `MAX_ROUNDS` (4), `MAX_LEADS` (16), `MAX_DEPTH` (3 hops from the original claim). Anything not run is reported as such.

Every finding records the lookup that produced it and the lookups it opened, so the report can show the **chain of evidence** from claim to conclusion.

## Evidence comes in four kinds

**Hard signals `[F#]`** are found by code and each carries the record or text it came from.

| Rule | Severity | What triggers it |
|------|----------|------------------|
| `reg_mismatch` | high | The registration number belongs to a different company, or the name matches but the number doesn't |
| `cert_invalid` | high | A certificate is held by someone else, or is expired, withdrawn or suspended |
| `image_reuse` | high | A photo's other location is run by a different company (found by following the photo to its owner) |
| `identity_conflict` | high | The registered company is dissolved, struck off or suspended |
| `beneficiary_mismatch` | high | The bank account holder named on the invoice isn't the supplier |
| `personal_account` | high | Payment to a personal or third-party account |
| `irreversible_payment` | high | Crypto, gift cards, wire services |
| `full_prepayment` | high | 70% or more, or all, of the payment upfront |
| `prompt_injection` | high | Text aimed at AI checkers |
| `not_manufacturer` | high | The supplier presents as a factory; its registered scope is trading only |
| `address_residential` | medium | Residential surroundings or a virtual office at the address of a supposed factory |
| `address_mismatch`, `registry_missing`, `no_trade_history`, `cert_unverified`, `new_company`, `domain_new`, `scam_reports`, `off_platform`, `inspection_refusal`, `pressure` | medium / low | See the table of lookups above |

Green signals come from the same comparisons: registration matches the company, registered address matches, industrial surroundings, certificate confirmed, customs history exists.

**Claims `[C#]`.** Each claim is marked **verified**, **contradicted** or **inconclusive** by code. A contradiction is never overwritten by a later confirmation from a weaker source. A quote is shown only if it appears word for word in the cited page; the model's assertions are dropped otherwise.

**Leads `[L#]`.** The lookups themselves: what was asked, why it was opened (and after which finding), how it ended. A lookup that couldn't run (no key configured, a service down) is **not checked**: it creates no finding and leaves its claim inconclusive.

**Sources `[S#]`.** Every page any lookup read, with the time it was read.

## Rules enforced by code

1. **No Proceed with a hard red flag.** Payment risks, identity conflicts, a supposed factory in a residential area, or text aimed at the checker rule out a Proceed. The decision becomes Verify first and the report says why.
2. **Citations are checked.** References to ids that don't exist are removed; quotes that can't be found in their source are removed.
3. **Missing evidence is never proof of fraud.** Absence from a registry, a customs log or a certificate directory is amber, and the claim stays inconclusive.
4. **The challenge.** After Ultra's verdict, Nemotron Super runs its own searches against it, considers benign explanations (a rename, a group company, a transliterated name, a trading arm), and names the decision it thinks is right plus how much doubt remains. Code then applies:
   - same decision, little doubt → the verdict holds;
   - same decision, serious doubt → confidence drops by 15 (not below 40);
   - a different decision → the answer becomes **Verify first** (confidence capped at 60);
   - except: a Stop that rests on a hard red flag (a payment or identity rule) stays a Stop (confidence drops by 20, not below 50).
5. **Findings are audited.** The challenger checks each of Ultra's findings against the sources it cites. Findings that claim more than their sources say stay in the report, marked as disputed.
6. **"What would change this verdict"** never promises a Proceed while rule 1 applies.
7. **Paperwork and web pages are data.** They are never followed as instructions by any agent, including the lead planner, whose output is limited to a fixed list of tools and validated before use.

## What it can't do

It can't prove a supplier is genuine. A registry match shows a company exists and holds that number; it doesn't show the person you're talking to works there. Map data can be incomplete, customs data covers only some countries, and reverse-image search is not exhaustive. A video call, a third-party inspection and a bank letter showing the account is in the company's name remain the strongest checks, which is why the report always says which to ask for.
