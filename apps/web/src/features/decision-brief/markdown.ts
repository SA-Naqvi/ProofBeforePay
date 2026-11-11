import type { Report } from "@/types";
import { usd } from "@/lib/formatters";

export const DECISION_LABEL = { PROCEED: "Proceed", VERIFY_FIRST: "Verify first", STOP: "Stop" } as const;

const POLARITY_MARK = { red: "🔴", amber: "🟡", green: "🟢" } as const;
const STATUS_MARK = { verified: "✅ Verified", contradicted: "❌ Contradicted", inconclusive: "❔ Inconclusive", checking: "…", pending: "…" } as const;

export function reportToMarkdown(report: Report, link: string): string {
  const { judgement: j, brief, entities: e, telemetry: t } = report;
  const lines: string[] = [
    `# ProofBeforePay report: ${DECISION_LABEL[j.decision]}`,
    "",
    `> ${j.headline}`,
    "",
    `**Confidence:** ${j.confidence}/100  `,
    `**Supplier:** ${e.supplier_name || "Unspecified supplier"}${e.claimed_type !== "unknown" ? ` (presents as a ${e.claimed_type})` : ""}  `,
    `**Report link:** ${link}`,
    "",
    "## In short",
    brief.tldr,
    "",
    "## What to do",
    `**Next step:** ${j.next_step}`,
  ];
  if (j.do_not.length) lines.push("", "**Don't, for now:**", ...j.do_not.map((d) => `- ${d}`));
  if (j.verification_questions.length) lines.push("", "**Ask the supplier:**", ...j.verification_questions.map((q) => `- ${q}`));
  if (brief.reply.body) lines.push("", "### Suggested reply", `**Subject:** ${brief.reply.subject}`, "", brief.reply.body);
  lines.push("", "## Assessment", j.assessment);
  if (j.guardrail) lines.push("", `_Guardrail: ${j.guardrail}_`);
  const ch = report.challenge;
  if (ch) {
    lines.push("", "## We tried to prove this wrong", `Nemotron Super searched for evidence against the verdict (${ch.searches.join("; ") || "no new searches"}).`);
    lines.push("", `**Best case against it:** ${ch.strongest_counterpoint || "No credible argument against this verdict turned up."}`);
    if (ch.effect) lines.push("", `_${ch.effect}_`);
    if (ch.would_change.length) {
      lines.push("", "**What would change this verdict:**");
      for (const w of ch.would_change) lines.push(`- If ${w.if.replace(/^if\s+/i, "")} → **${DECISION_LABEL[w.then]}**${w.check ? `. How to check: ${w.check}` : ""}`);
    }
    if (ch.unresolved.length) lines.push("", "**Still unknown:**", ...ch.unresolved.map((u) => `- ${u}`));
  }
  if (report.signals.length) {
    lines.push("", "## Hard signals");
    for (const s of report.signals) lines.push(`- ${POLARITY_MARK[s.polarity]} **[${s.id}] ${s.title}**: ${s.detail}`);
  }
  if (report.claims.length) {
    lines.push("", "## Claim checks");
    for (const c of report.claims) {
      lines.push(`- **[${c.id}] ${c.text}**: ${STATUS_MARK[c.status]}${c.note ? `. ${c.note}` : ""}`);
      if (c.quote && c.source) lines.push(`  > "${c.quote}" ([${c.source.domain}](${c.source.url}))`);
    }
  }
  if (report.leads?.length) {
    lines.push("", "## Chain of evidence");
    for (const l of report.leads) {
      const target = Object.entries(l.target).filter(([k]) => k !== "own_domains" && k !== "role").map(([, v]) => v).join(" · ");
      const origin = l.parent_finding ? `, opened after ${l.parent_finding}` : "";
      lines.push(`${"  ".repeat(l.depth)}- **[${l.id}] ${l.tool}** ${target} (${l.status}${origin}): ${l.why}${l.finding_ids.length ? ` → ${l.finding_ids.join(", ")}` : ""}`);
    }
    if (report.stop_reason) lines.push("", `_${report.stop_reason}_`);
  }
  if (j.limitations) lines.push("", "## Limitations", j.limitations);
  lines.push("", "## Sources");
  for (const s of report.sources) lines.push(`- [${s.id}] [${s.title}](${s.url})`);
  lines.push(
    "",
    "---",
    `Investigated in ${t.duration_s}s with NVIDIA Nemotron on Nebius Token Factory (${t.calls.length} model calls, ${usd(t.cost_usd)}) and ${t.tavily.calls} Tavily calls.`,
    "ProofBeforePay highlights risk signals; it cannot prove that a supplier is fraudulent or genuine.",
  );
  return lines.join("\n");
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
