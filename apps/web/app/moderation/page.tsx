"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, Button, EmptyState } from "../../components/ui";
import { apiRequest } from "../../lib/api";

type Report = {
  id: string;
  reason: string;
  details?: string | null;
  status: "PENDING" | "DISMISSED" | "ACTIONED";
  createdAt: string;
  comment: {
    id: string;
    body: string;
    state: string;
    user: { id: string; firstName: string; lastName: string };
    candidate: { id: string; firstName: string; lastName: string };
  };
  reportedBy: { id: string; firstName: string; lastName: string };
  reviewedBy?: { id: string; firstName: string; lastName: string } | null;
};

export default function ModerationPage() {
  const [status, setStatus] = useState<Report["status"]>("PENDING");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setReports(await apiRequest<Report[]>(`/chapter/moderation/reports?status=${status}`)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [status]);

  const resolve = async (report: Report, resolution: "DISMISS" | "ACTION", action?: "HIDE" | "REMOVE") => {
    const note = resolution === "ACTION" ? window.prompt("Optional moderation note") : null;
    try {
      await apiRequest(`/chapter/moderation/reports/${report.id}/resolve`, { method: "POST", body: JSON.stringify({ resolution, action, note: note || null }) });
      await load();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Unable to resolve report");
    }
  };

  return <AppShell>
    <PageHeader title="Moderation" description="Review reported discussion and keep chapter feedback useful and appropriate." />
    <div className="segmented-tabs"><button className={status === "PENDING" ? "active" : ""} onClick={() => setStatus("PENDING")}>Pending</button><button className={status === "ACTIONED" ? "active" : ""} onClick={() => setStatus("ACTIONED")}>Actioned</button><button className={status === "DISMISSED" ? "active" : ""} onClick={() => setStatus("DISMISSED")}>Dismissed</button></div>
    <section className="panel moderation-panel">
      {loading ? <div className="detail-loading"><span>Loading reports…</span></div> : reports.length ? <div className="moderation-list">{reports.map((report) => <article className="report-card" key={report.id}><div className="report-card-top"><div><Badge tone={report.reason === "SENSITIVE_INFORMATION" ? "danger" : "warning"}>{report.reason.replaceAll("_", " ").toLowerCase()}</Badge><span>Reported by {report.reportedBy.firstName} {report.reportedBy.lastName} · {new Date(report.createdAt).toLocaleString()}</span></div><Link href={`/candidates/${report.comment.candidate.id}`} className="text-link">{report.comment.candidate.firstName} {report.comment.candidate.lastName} <Icon name="chevron" size={14} /></Link></div><blockquote>{report.comment.body}</blockquote><div className="report-author">Comment by {report.comment.user.firstName} {report.comment.user.lastName}</div>{report.details ? <div className="report-details"><strong>Reporter note</strong><p>{report.details}</p></div> : null}{status === "PENDING" ? <div className="report-actions"><Button variant="secondary" size="sm" onClick={() => void resolve(report, "DISMISS")}>Dismiss report</Button><Button variant="secondary" size="sm" onClick={() => void resolve(report, "ACTION", "HIDE")}>Hide comment</Button><Button variant="danger" size="sm" onClick={() => void resolve(report, "ACTION", "REMOVE")}>Remove comment</Button></div> : <div className="report-resolution"><Badge tone={status === "ACTIONED" ? "success" : "neutral"}>{status.toLowerCase()}</Badge>{report.reviewedBy ? <span>Reviewed by {report.reviewedBy.firstName} {report.reviewedBy.lastName}</span> : null}</div>}</article>)}</div> : <EmptyState icon="shield" title={status === "PENDING" ? "No pending reports" : `No ${status.toLowerCase()} reports`} copy={status === "PENDING" ? "Reported discussion will appear here for moderator review." : "There is nothing to show in this moderation state."} />}
    </section>
  </AppShell>;
}
