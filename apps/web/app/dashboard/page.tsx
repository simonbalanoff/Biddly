"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, Button, EmptyState, Score, Skeleton, StatusDot } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { CandidateList, CandidateStatus, RecruitmentCycle } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";

export default function DashboardPage() {
  const { context } = useAuth();
  const router = useRouter();
  const cycleId = context?.chapter?.activeRecruitmentCycle?.id;
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null);
  const [recent, setRecent] = useState<CandidateList | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (context && !context.chapter && context.user.platformRole === "PLATFORM_ADMIN") {
      router.replace("/platform");
      return;
    }
    if (!context) return;
    if (!cycleId) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const cycleData = await apiRequest<RecruitmentCycle>(`/recruitment-cycles/${cycleId}`);
        const [recentData, ...counts] = await Promise.all([
          apiRequest<CandidateList>("/candidates?sort=recent&pageSize=6"),
          ...cycleData.statuses.map((status) => apiRequest<CandidateList>(`/candidates?statusId=${encodeURIComponent(status.id)}&pageSize=1`))
        ]);
        if (!active) return;
        setCycle(cycleData);
        setRecent(recentData);
        setStatusCounts(Object.fromEntries(cycleData.statuses.map((status, index) => [status.id, counts[index]?.total ?? 0])));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [context, cycleId, router]);

  const scoreMax = context?.chapter?.settings?.scoreMax ?? 10;
  const total = recent?.total ?? cycle?._count.candidates ?? 0;
  const evaluatedCoverage = useMemo(() => {
    if (!recent?.items.length) return 0;
    return Math.round((recent.items.filter((item) => item.myEvaluation).length / recent.items.length) * 100);
  }, [recent]);

  return (
    <AppShell>
      <PageHeader title="Overview" description={context?.chapter?.activeRecruitmentCycle?.name ? `${context.chapter.activeRecruitmentCycle.name} recruitment at a glance.` : "Your chapter’s recruitment activity at a glance."} actions={<Link href="/candidates" className="button button-primary button-md">View PNMs <Icon name="chevron" size={16} /></Link>} />

      {!cycleId && !loading ? (
        <div className="panel panel-spacious"><EmptyState icon="workflow" title="No active recruitment cycle" copy="A chapter admin needs to create and activate a recruitment cycle before members can start evaluating PNMs." action={context?.membership?.role === "CHAPTER_ADMIN" ? <Link href="/recruitment" className="button button-primary button-md">Set up recruitment</Link> : undefined} /></div>
      ) : (
        <>
          <section className="metric-grid">
            <div className="metric-card"><span className="metric-label">Active PNMs</span>{loading ? <Skeleton className="metric-skeleton" /> : <strong>{total}</strong>}<span className="metric-detail">Current recruitment cycle</span></div>
            <div className="metric-card"><span className="metric-label">Scores submitted</span>{loading ? <Skeleton className="metric-skeleton" /> : <strong>{cycle?._count.evaluations ?? 0}</strong>}<span className="metric-detail">Across all PNMs</span></div>
            <div className="metric-card"><span className="metric-label">Discussion</span>{loading ? <Skeleton className="metric-skeleton" /> : <strong>{cycle?._count.comments ?? 0}</strong>}<span className="metric-detail">Comments and replies</span></div>
            <div className="metric-card"><span className="metric-label">Your recent coverage</span>{loading ? <Skeleton className="metric-skeleton" /> : <strong>{evaluatedCoverage}%</strong>}<span className="metric-detail">Of recently added PNMs</span></div>
          </section>

          <section className="dashboard-grid">
            <div className="panel">
              <div className="panel-header"><div><span className="section-kicker">Pipeline</span><h2>Recruitment status</h2></div><Link href="/candidates" className="text-link">Open all PNMs <Icon name="chevron" size={14} /></Link></div>
              <div className="pipeline-list">
                {loading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="pipeline-skeleton" />) : cycle?.statuses.map((status) => <PipelineRow key={status.id} status={status} count={statusCounts[status.id] ?? 0} total={Math.max(total, 1)} />)}
              </div>
            </div>

            <div className="panel recent-panel">
              <div className="panel-header"><div><span className="section-kicker">Recently added</span><h2>New PNMs</h2></div></div>
              <div className="recent-list">
                {loading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="recent-skeleton" />) : recent?.items.length ? recent.items.map((candidate) => (
                  <Link href={`/candidates/${candidate.id}`} className="recent-row" key={candidate.id}>
                    <div className="candidate-initials">{candidate.firstName[0]}{candidate.lastName[0]}</div>
                    <div className="recent-copy"><strong>{candidate.firstName} {candidate.lastName}</strong><span><StatusDot color={candidate.status.color} />{candidate.status.name}</span></div>
                    <Score value={candidate.aggregate?.averageScore} max={scoreMax} />
                    <Icon name="chevron" size={15} className="row-chevron" />
                  </Link>
                )) : <EmptyState title="No PNMs yet" copy="PNMs will appear here as soon as they are added or submit the chapter recruitment form." />}
              </div>
            </div>
          </section>

          <section className="panel dashboard-bottom">
            <div className="panel-header"><div><span className="section-kicker">Quick actions</span><h2>Keep recruitment moving</h2></div></div>
            <div className="quick-actions">
              <Link href="/candidates" className="quick-action"><span className="quick-icon"><Icon name="candidate" /></span><div><strong>Evaluate PNMs</strong><span>Find someone and add your score.</span></div><Icon name="chevron" /></Link>
              {context?.membership?.role === "CHAPTER_ADMIN" ? <Link href="/recruitment/form" className="quick-action"><span className="quick-icon"><Icon name="form" /></span><div><strong>Recruitment form</strong><span>Share or configure the public PNM form.</span></div><Icon name="chevron" /></Link> : null}
              {context?.membership?.role === "CHAPTER_ADMIN" ? <Link href="/members" className="quick-action"><span className="quick-icon"><Icon name="users" /></span><div><strong>Invite members</strong><span>Give the chapter access to the active cycle.</span></div><Icon name="chevron" /></Link> : null}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function PipelineRow({ status, count, total }: { status: CandidateStatus; count: number; total: number }) {
  const width = Math.max(count ? 4 : 0, Math.min(100, (count / total) * 100));
  return (
    <Link href={`/candidates?status=${encodeURIComponent(status.id)}`} className="pipeline-row">
      <div className="pipeline-name"><StatusDot color={status.color} /><span>{status.name}</span></div>
      <div className="pipeline-track"><span style={{ width: `${width}%`, background: status.color || "var(--chapter-primary)" }} /></div>
      <strong>{count}</strong>
    </Link>
  );
}
