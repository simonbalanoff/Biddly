"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, Breadcrumbs, PageHeader } from "../../../../components/app-shell";
import { Icon } from "../../../../components/icons";
import { Badge, Button, ConfirmDialog, EmptyState, Score, Spinner, StatusDot } from "../../../../components/ui";
import { apiRequest } from "../../../../lib/api";
import type { CandidateList, RecruitmentCycle } from "../../../../lib/types";
import { useAuth } from "../../../../providers/auth-provider";

export default function RecruitmentCyclePage() {
  const params = useParams<{ cycleId: string }>();
  const { context, refreshContext } = useAuth();
  const cycleId = params.cycleId;
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null);
  const [candidates, setCandidates] = useState<CandidateList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"activate" | "archive" | null>(null);
  const [error, setError] = useState("");
  const scoreMax = context?.chapter?.settings?.scoreMax ?? 10;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [cycleData, candidateData] = await Promise.all([
        apiRequest<RecruitmentCycle>(`/recruitment-cycles/${cycleId}`),
        apiRequest<CandidateList>(`/candidates?cycleId=${encodeURIComponent(cycleId)}&archived=all&page=1&pageSize=6&sort=score_desc`)
      ]);
      setCycle(cycleData);
      setCandidates(candidateData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load recruitment cycle");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [cycleId]);

  const activate = async () => {
    if (!cycle) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/recruitment-cycles/${cycle.id}/activate`, { method: "POST" });
      await refreshContext();
      await load();
      setConfirmAction(null);
    } catch (caught) {
      setConfirmAction(null);
      setError(caught instanceof Error ? caught.message : "Unable to activate recruitment cycle");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!cycle) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/recruitment-cycles/${cycle.id}/archive`, { method: "POST" });
      await refreshContext();
      await load();
      setConfirmAction(null);
    } catch (caught) {
      setConfirmAction(null);
      setError(caught instanceof Error ? caught.message : "Unable to archive recruitment cycle");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!cycle) return;
    setBusy(true);
    try {
      await apiRequest(`/recruitment-cycles/${cycle.id}/unarchive`, { method: "POST" });
      await refreshContext();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <AppShell><div className="detail-loading"><Spinner /><span>Loading recruitment cycle…</span></div></AppShell>;
  if (!cycle) return <AppShell><Breadcrumbs items={[{ label: "Recruitment", href: "/recruitment" }, { label: "Cycle" }]} /><div className="panel panel-spacious"><EmptyState title="Recruitment cycle unavailable" copy={error || "This cycle could not be loaded."} action={<Link href="/recruitment" className="button button-secondary button-md">Back to recruitment</Link>} /></div></AppShell>;

  const period = formatPeriod(cycle.startsAt, cycle.endsAt);
  const isArchived = cycle.status === "ARCHIVED";
  const isActive = cycle.status === "ACTIVE";

  return (
    <AppShell>
      <Breadcrumbs items={[{ label: "Recruitment", href: "/recruitment" }, { label: cycle.name }]} />
      <PageHeader
        eyebrow={period}
        title={cycle.name}
        description={isArchived ? "Historical recruitment data is preserved here. Restore the cycle if you need to make changes again." : isActive ? "This is the chapter’s active recruitment cycle." : "This cycle is saved as a draft and is not currently visible to members."}
        actions={<>
          {isActive ? <Link href="/recruitment/form" className="button button-secondary button-md"><Icon name="form" size={17} /> Public form</Link> : null}
          {isArchived ? <Button variant="secondary" disabled={busy} onClick={() => void restore()}>Restore to draft</Button> : null}
          {cycle.status === "DRAFT" ? <Button disabled={busy} onClick={() => context?.chapter?.activeRecruitmentCycle?.id && context.chapter.activeRecruitmentCycle.id !== cycle.id ? setConfirmAction("activate") : void activate()}>Make active</Button> : null}
          {isActive ? <Button variant="ghost" disabled={busy} onClick={() => setConfirmAction("archive")}>Archive</Button> : null}
        </>}
      />
      {error ? <div className="form-alert form-alert-error page-alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}

      <div className="cycle-detail-status"><Badge tone={isActive ? "success" : cycle.status === "DRAFT" ? "warning" : "neutral"}>{cycle.status.toLowerCase()}</Badge>{isArchived ? <span>Read-only history</span> : null}</div>

      <section className="summary-strip cycle-summary-strip">
        <div><span>PNMs</span><strong>{cycle._count.candidates}</strong></div>
        <div><span>Scores submitted</span><strong>{cycle._count.evaluations}</strong></div>
        <div><span>Discussion posts</span><strong>{cycle._count.comments}</strong></div>
        <div><span>Public form</span><strong className="summary-text-value">{cycle.publicForm?.isOpen ? "Open" : "Closed"}</strong></div>
      </section>

      <section className="panel cycle-detail-pnms">
        <div className="panel-header"><div><span className="section-kicker">People</span><h2>PNMs from this cycle</h2><p>Review the people and scoring history captured during {cycle.name}.</p></div><Link href={`/candidates?cycleId=${cycle.id}`} className="button button-secondary button-sm">View all PNMs</Link></div>
        {candidates?.items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>PNM</th><th>Status</th><th>Chapter score</th><th>Added</th><th /></tr></thead><tbody>{candidates.items.map((candidate) => <tr key={candidate.id}><td><Link className="candidate-cell" href={`/candidates/${candidate.id}?cycleId=${cycle.id}`}><span className="candidate-initials candidate-initials-sm">{candidate.firstName[0]}{candidate.lastName[0]}</span><span><strong>{candidate.firstName} {candidate.lastName}</strong><small>{candidate.email || candidate.phone || "No contact info"}</small></span></Link></td><td><span className="status-label"><StatusDot color={candidate.status.color} />{candidate.status.name}</span></td><td><Score value={candidate.aggregate?.averageScore} max={scoreMax} count={candidate.aggregate?.evaluationCount} /></td><td><span className="muted-cell">{new Date(candidate.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span></td><td><Link className="row-action" href={`/candidates/${candidate.id}?cycleId=${cycle.id}`}><Icon name="chevron" size={16} /></Link></td></tr>)}</tbody></table></div> : <EmptyState title="No PNMs in this cycle" copy="This recruitment cycle does not contain any PNM records." />}
      </section>


      <ConfirmDialog
        open={confirmAction === "activate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={activate}
        title={cycle ? `Make ${cycle.name} active?` : "Make cycle active?"}
        description="Your current active recruitment cycle will be archived automatically, and members will begin seeing this cycle instead."
        confirmLabel="Make active"
        tone="warning"
        busy={busy}
      />
      <ConfirmDialog
        open={confirmAction === "archive"}
        onClose={() => setConfirmAction(null)}
        onConfirm={archive}
        title={cycle ? `Archive ${cycle.name}?` : "Archive cycle?"}
        description="The public form will close and this cycle will become read-only until it is restored. Historical data will remain available."
        confirmLabel="Archive cycle"
        tone="warning"
        busy={busy}
      />

      <div className="cycle-detail-grid">
        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Pipeline snapshot</span><h2>PNM statuses</h2><p>The stages used by this recruitment cycle.</p></div></div>
          <div className="config-list">{cycle.statuses.map((status) => <div className="config-row" key={status.id}><div className="config-handle">{status.position + 1}</div><StatusDot color={status.color} /><div className="config-copy"><strong>{status.name}</strong><span>{status.isTerminal ? "Terminal stage" : "Active stage"}</span></div>{status.isTerminal ? <Badge>Final</Badge> : null}</div>)}</div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Information snapshot</span><h2>PNM fields</h2><p>The custom information collected during this cycle.</p></div></div>
          {cycle.fieldDefinitions.length ? <div className="config-list">{cycle.fieldDefinitions.map((field) => <div className="config-row" key={field.id}><div className="config-handle">{field.position + 1}</div><div className="config-copy"><strong>{field.label}</strong><span>{field.type.replaceAll("_", " ").toLowerCase()}</span></div>{field.required ? <Badge tone="accent">Required</Badge> : <Badge>Optional</Badge>}</div>)}</div> : <div className="config-empty"><span>No custom fields were configured for this cycle.</span></div>}
        </section>
      </div>
    </AppShell>
  );
}

function formatPeriod(startsAt?: string | null, endsAt?: string | null) {
  const format = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (startsAt && endsAt) return `${format(startsAt)} – ${format(endsAt)}`;
  if (startsAt) return `Started ${format(startsAt)}`;
  if (endsAt) return `Ends ${format(endsAt)}`;
  return "Dates not set";
}
