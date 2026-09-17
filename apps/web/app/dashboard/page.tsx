"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, EmptyState, Score, Skeleton, StatusDot } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { CandidateList, CandidateStatus, RecruitmentCycle } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";
import styles from "./dashboard.module.css";

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
          apiRequest<CandidateList>("/candidates?sort=recent&pageSize=8"),
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
  const needsScore = useMemo(() => recent?.items.filter((candidate) => !candidate.myEvaluation).slice(0, 4) ?? [], [recent]);
  const isAdmin = context?.membership?.role === "CHAPTER_ADMIN";
  const readOnly = context?.subscriptionAccess?.mode === "READ_ONLY";

  return (
    <AppShell>
      <PageHeader
        title="Overview"
        description={readOnly ? "Your subscription is inactive, so this workspace is available in read-only mode." : context?.chapter?.activeRecruitmentCycle?.name ? `${context.chapter.activeRecruitmentCycle.name} recruitment.` : "Your chapter recruitment workspace."}
        actions={<Link href="/candidates" className="button button-primary button-md">Open PNMs <Icon name="chevron" size={16} /></Link>}
      />

      {!cycleId && !loading ? (
        <div className="panel panel-spacious"><EmptyState icon="workflow" title="No active recruitment cycle" copy="A chapter admin needs to create and activate a recruitment cycle before members can start evaluating PNMs." action={isAdmin && !readOnly ? <Link href="/recruitment" className="button button-primary button-md">Set up recruitment</Link> : undefined} /></div>
      ) : (
        <>
          <section className={styles.cycleCard}>
            <div className={styles.cycleIcon}><Icon name="workflow" size={21} /></div>
            <div className={styles.cycleCopy}><span>Active recruitment</span><strong>{cycle?.name || context?.chapter?.activeRecruitmentCycle?.name || "Recruitment"}</strong><p>{loading ? "Loading workspace…" : `${total} active ${total === 1 ? "PNM" : "PNMs"} · ${cycle?.statuses.length ?? 0} workflow stages`}</p></div>
            <Badge tone="success">Active</Badge>
          </section>

          <section className={styles.dashboardGrid}>
            <div className="panel">
              <div className="panel-header"><div><span className="section-kicker">Next up</span><h2>PNMs you have not scored yet</h2><p>Start with recent people who still need your evaluation.</p></div><Link href="/candidates" className="text-link">See all <Icon name="chevron" size={14} /></Link></div>
              <div className={styles.attentionList}>
                {loading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className={styles.rowSkeleton} />) : needsScore.length ? needsScore.map((candidate) => (
                  <Link href={`/candidates/${candidate.id}`} className={styles.personRow} key={candidate.id}>
                    <div className="candidate-initials">{candidate.firstName[0]}{candidate.lastName[0]}</div>
                    <div className={styles.personCopy}><strong>{candidate.firstName} {candidate.lastName}</strong><span><StatusDot color={candidate.status.color} />{candidate.status.name}</span></div>
                    <span className={styles.actionText}>{readOnly ? "Review" : "Evaluate"}</span><Icon name="chevron" size={15} />
                  </Link>
                )) : <div className={styles.inlineEmpty}><Icon name="check" size={18} /><div><strong>You are caught up</strong><span>Your recently added PNMs all have a score from you.</span></div></div>}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header"><div><span className="section-kicker">Pipeline</span><h2>Where recruitment stands</h2></div><Link href="/candidates" className="text-link">Open pipeline <Icon name="chevron" size={14} /></Link></div>
              <div className={styles.pipelineList}>
                {loading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className={styles.pipelineSkeleton} />) : cycle?.statuses.map((status) => <PipelineRow key={status.id} status={status} count={statusCounts[status.id] ?? 0} total={Math.max(total, 1)} />)}
              </div>
            </div>
          </section>

          <section className={`panel ${styles.recentPanel}`}>
            <div className="panel-header"><div><span className="section-kicker">Recently added</span><h2>Latest PNMs</h2><p>Quick access to the newest people in the active cycle.</p></div></div>
            <div className={styles.recentGrid}>
              {loading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className={styles.recentSkeleton} />) : recent?.items.length ? recent.items.slice(0, 6).map((candidate) => (
                <Link href={`/candidates/${candidate.id}`} className={styles.recentCard} key={candidate.id}>
                  <div className="candidate-initials">{candidate.firstName[0]}{candidate.lastName[0]}</div>
                  <div className={styles.recentCopy}><strong>{candidate.firstName} {candidate.lastName}</strong><span><StatusDot color={candidate.status.color} />{candidate.status.name}</span></div>
                  <Score value={candidate.aggregate?.averageScore} max={scoreMax} />
                </Link>
              )) : <EmptyState title="No PNMs yet" copy="PNMs will appear here as soon as they are added or submit the chapter recruitment form." />}
            </div>
          </section>

          <section className={`panel ${styles.actionsPanel}`}>
            <div className="panel-header"><div><span className="section-kicker">Shortcuts</span><h2>Common actions</h2></div></div>
            <div className={styles.quickActions}>
              <Link href="/candidates" className={styles.quickAction}><span><Icon name="candidate" /></span><div><strong>{readOnly ? "Review PNMs" : "Evaluate PNMs"}</strong><small>{readOnly ? "Search and review existing candidate records." : "Search, filter, and score candidates."}</small></div><Icon name="chevron" /></Link>
              {isAdmin && !readOnly ? <Link href="/recruitment/form" className={styles.quickAction}><span><Icon name="form" /></span><div><strong>Recruitment form</strong><small>Open or configure your public form.</small></div><Icon name="chevron" /></Link> : null}
              {isAdmin ? <Link href="/members" className={styles.quickAction}><span><Icon name="users" /></span><div><strong>{readOnly ? "Review members" : "Member access"}</strong><small>{readOnly ? "Review current workspace access." : "Invite members and manage roles."}</small></div><Icon name="chevron" /></Link> : null}
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
    <Link href={`/candidates?statusId=${encodeURIComponent(status.id)}`} className={styles.pipelineRow}>
      <div className={styles.pipelineName}><StatusDot color={status.color} /><span>{status.name}</span></div>
      <div className={styles.pipelineTrack}><span style={{ width: `${width}%`, background: status.color || "var(--chapter-primary)" }} /></div>
      <strong>{count}</strong>
    </Link>
  );
}
