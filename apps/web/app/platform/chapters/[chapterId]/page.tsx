"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Breadcrumbs, PageHeader } from "../../../../components/app-shell";
import { Icon } from "../../../../components/icons";
import { Badge, Button, EmptyState, Modal, Spinner, StatusDot } from "../../../../components/ui";
import { apiRequest } from "../../../../lib/api";
import { useAuth } from "../../../../providers/auth-provider";
import styles from "./chapter-detail.module.css";

type ChapterRole = "MEMBER" | "MODERATOR" | "CHAPTER_ADMIN";
type CycleStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

type ChapterDetail = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  organization: {
    id: string;
    name: string;
    shortName?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    logoUrl?: string | null;
    crestUrl?: string | null;
  };
  university: {
    id: string;
    name: string;
    shortName?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
  branding?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    logoUrl?: string | null;
    crestUrl?: string | null;
  } | null;
  settings?: {
    commentsEnabled: boolean;
    repliesEnabled: boolean;
    reactionsEnabled: boolean;
    scoreMin: number;
    scoreMax: number;
    scoreStep: number;
  } | null;
  activeRecruitmentCycle?: {
    id: string;
    name: string;
    status: CycleStatus;
    startsAt?: string | null;
    endsAt?: string | null;
    createdAt: string;
  } | null;
  subscription?: {
    id: string;
    term: "SEMESTER" | "ACADEMIC_YEAR";
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
    periodStart: string;
    periodEnd: string;
    provider?: string | null;
  } | null;
  counts: {
    members: number;
    chapterAdmins: number;
    moderators: number;
    activeCandidates: number;
    archivedCandidates: number;
    evaluations: number;
    comments: number;
    recruitmentCycles: number;
    candidatePhotos: number;
    openReports: number;
    chapterInvites: number;
    pendingInvites: number;
  };
  members: Array<{
    id: string;
    role: ChapterRole;
    createdAt: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      isActive: boolean;
      emailVerified: boolean;
      createdAt: string;
    };
  }>;
  recruitmentCycles: Array<{
    id: string;
    name: string;
    status: CycleStatus;
    startsAt?: string | null;
    endsAt?: string | null;
    createdAt: string;
    _count: { candidates: number; evaluations: number; comments: number };
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: unknown;
    createdAt: string;
    actor: { id: string; firstName: string; lastName: string; email: string };
  }>;
};

export default function PlatformChapterDetailPage() {
  const params = useParams<{ chapterId: string }>();
  const { context } = useAuth();
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusConfirm, setStatusConfirm] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = async () => {
    setError("");
    try {
      setChapter(await apiRequest<ChapterDetail>(`/platform/chapters/${params.chapterId}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load chapter workspace");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (context?.user.platformRole === "PLATFORM_ADMIN") void load();
  }, [context?.user.platformRole, params.chapterId]);

  const admins = useMemo(() => chapter?.members.filter((member) => member.role === "CHAPTER_ADMIN") ?? [], [chapter]);

  const changeWorkspaceStatus = async () => {
    if (!chapter) return;
    setStatusBusy(true);
    setError("");
    try {
      await apiRequest(`/platform/chapters/${chapter.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !chapter.isActive })
      });
      setStatusConfirm(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update workspace status");
    } finally {
      setStatusBusy(false);
    }
  };

  if (context?.user.platformRole !== "PLATFORM_ADMIN") {
    return <AppShell><div className="panel panel-spacious"><EmptyState icon="shield" title="Platform access required" copy="This page is only available to Biddly platform administrators." /></div></AppShell>;
  }

  if (loading) {
    return <AppShell><div className="detail-loading"><Spinner /><span>Loading workspace…</span></div></AppShell>;
  }

  if (!chapter) {
    return <AppShell><Breadcrumbs items={[{ label: "Platform", href: "/platform" }, { label: "Workspace" }]} /><div className="panel panel-spacious"><EmptyState icon="users" title="Workspace unavailable" copy={error || "This chapter workspace could not be loaded."} /></div></AppShell>;
  }

  const primary = chapter.branding?.primaryColor || chapter.organization.primaryColor || "#2563eb";
  const secondary = chapter.branding?.secondaryColor || chapter.organization.secondaryColor || "#ffffff";
  const accent = chapter.branding?.accentColor || chapter.organization.accentColor || primary;
  const crest = chapter.branding?.crestUrl || chapter.branding?.logoUrl || chapter.organization.crestUrl || chapter.organization.logoUrl || null;
  const currentSubscription = chapter.subscription;

  return (
    <AppShell>
      <Breadcrumbs items={[{ label: "Platform", href: "/platform" }, { label: "Chapters", href: "/platform" }, { label: chapter.name }]} />
      <PageHeader
        eyebrow={`${chapter.organization.shortName || chapter.organization.name} · ${chapter.university.shortName || chapter.university.name}`}
        title={chapter.name}
        description="Platform-level workspace operations and account health. Private PNM content is intentionally not shown here."
        actions={<Button variant={chapter.isActive ? "danger" : "primary"} icon={chapter.isActive ? "lock" : "check"} onClick={() => setStatusConfirm(true)}>{chapter.isActive ? "Suspend workspace" : "Reactivate workspace"}</Button>}
      />

      {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}

      <section className={styles.identityCard} style={{ "--workspace-primary": primary, "--workspace-secondary": secondary, "--workspace-accent": accent } as React.CSSProperties}>
        <div className={styles.crest}>{crest ? <img src={crest} alt="" /> : <span>{chapterInitials(chapter.name)}</span>}</div>
        <div className={styles.identityCopy}>
          <div className={styles.identityTitle}><h2>{chapter.name}</h2><Badge tone={chapter.isActive ? "success" : "warning"}>{chapter.isActive ? "Active" : "Suspended"}</Badge></div>
          <p>{chapter.organization.name} · {chapter.university.name}</p>
          <div className={styles.identityMeta}><span>/{chapter.slug}</span><span>Created {formatDate(chapter.createdAt)}</span><span>Last activity {formatRelativeDate(chapter.lastActivityAt)}</span></div>
        </div>
        <div className={styles.palette} aria-label="Workspace colors">
          <span style={{ background: primary }} title={`Primary ${primary}`} />
          <span style={{ background: secondary }} title={`Secondary ${secondary}`} />
          <span style={{ background: accent }} title={`Accent ${accent}`} />
        </div>
      </section>

      <section className="summary-strip">
        <div><span>Members</span><strong>{chapter.counts.members}</strong></div>
        <div><span>Active PNMs</span><strong>{chapter.counts.activeCandidates}</strong></div>
        <div><span>Evaluations</span><strong>{chapter.counts.evaluations}</strong></div>
        <div><span>Comments</span><strong>{chapter.counts.comments}</strong></div>
      </section>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className="panel">
            <div className="panel-header simple-panel-header"><div><span className="section-kicker">Workspace</span><h2>Account information</h2><p>Operational identity and activity for this customer workspace.</p></div></div>
            <div className={styles.definitionGrid}>
              <Definition label="Organization" value={chapter.organization.name} />
              <Definition label="University" value={chapter.university.name} />
              <Definition label="Workspace status" value={chapter.isActive ? "Active" : "Suspended"} />
              <Definition label="Current cycle" value={chapter.activeRecruitmentCycle?.name || "No active cycle"} />
              <Definition label="Archived PNMs" value={String(chapter.counts.archivedCandidates)} />
              <Definition label="PNM photos" value={String(chapter.counts.candidatePhotos)} />
              <Definition label="Open moderation reports" value={String(chapter.counts.openReports)} />
              <Definition label="Pending member invites" value={String(chapter.counts.pendingInvites)} />
            </div>
          </section>

          <section className={`${styles.tableSection} panel table-panel`}>
            <div className="panel-header simple-panel-header"><div><span className="section-kicker">Recruitment</span><h2>Recruitment cycles</h2><p>Cycle-level usage without exposing private candidate content.</p></div></div>
            {chapter.recruitmentCycles.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Cycle</th><th>Status</th><th>PNMs</th><th>Scores</th><th>Comments</th><th>Period</th></tr></thead><tbody>{chapter.recruitmentCycles.map((cycle) => <tr key={cycle.id}><td><div className="table-primary"><strong>{cycle.name}</strong><small>Created {formatDate(cycle.createdAt)}</small></div></td><td><Badge tone={cycle.status === "ACTIVE" ? "success" : cycle.status === "DRAFT" ? "warning" : "neutral"}>{prettyEnum(cycle.status)}</Badge></td><td>{cycle._count.candidates}</td><td>{cycle._count.evaluations}</td><td>{cycle._count.comments}</td><td>{formatPeriod(cycle.startsAt, cycle.endsAt)}</td></tr>)}</tbody></table></div> : <EmptyState icon="calendar" title="No recruitment cycles" copy="This chapter has not created a recruitment cycle yet." />}
          </section>

          <section className={`${styles.tableSection} panel table-panel`}>
            <div className="panel-header simple-panel-header"><div><span className="section-kicker">Access</span><h2>Chapter leadership</h2><p>Chapter administrators currently responsible for the workspace.</p></div></div>
            {admins.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Administrator</th><th>Email</th><th>Account</th><th>Joined</th></tr></thead><tbody>{admins.map((member) => <tr key={member.id}><td><div className="table-primary"><strong>{member.user.firstName} {member.user.lastName}</strong><small>Chapter admin</small></div></td><td>{member.user.email}</td><td><Badge tone={member.user.isActive ? "success" : "warning"}>{member.user.isActive ? "Active" : "Disabled"}</Badge></td><td>{formatDate(member.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="No chapter admins" copy="This workspace currently has no chapter administrator." />}
          </section>

          <section className="panel">
            <div className="panel-header simple-panel-header"><div><span className="section-kicker">Activity</span><h2>Recent administrative activity</h2><p>Operational history only. PNM discussion content is not exposed here.</p></div></div>
            {chapter.recentActivity.length ? <div className={styles.activityList}>{chapter.recentActivity.map((activity) => <div className={styles.activityRow} key={activity.id}><div className={styles.activityIcon}><Icon name="activity" size={16} /></div><div><strong>{formatAuditAction(activity.action)}</strong><span>{activity.actor.firstName} {activity.actor.lastName} · {activity.targetType}</span></div><time>{formatRelativeDate(activity.createdAt)}</time></div>)}</div> : <div className={styles.emptyInline}>No administrative activity has been recorded yet.</div>}
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className="panel compact-panel">
            <div className="panel-header"><div><span className="section-kicker">Subscription</span><h2>Access period</h2></div><Link href={`/platform/billing/${chapter.id}`} className="text-link">Open billing <Icon name="chevron" size={14} /></Link></div>
            {currentSubscription ? <div className={styles.subscription}><div className={styles.subscriptionTop}><Badge tone={subscriptionTone(currentSubscription.status)}>{prettyEnum(currentSubscription.status)}</Badge><strong>{prettyEnum(currentSubscription.term)}</strong></div><span>{formatDate(currentSubscription.periodStart)} – {formatDate(currentSubscription.periodEnd)}</span>{currentSubscription.provider ? <small>Provider: {currentSubscription.provider}</small> : null}</div> : <div className={styles.emptyInline}>No subscription record yet.</div>}
            <p className="panel-note">Stripe billing and subscription controls are managed from the dedicated billing view.</p>
          </section>

          <section className="panel compact-panel">
            <div className="panel-header"><div><span className="section-kicker">Members</span><h2>Role breakdown</h2></div></div>
            <div className={styles.metricList}>
              <MetricRow label="Chapter admins" value={chapter.counts.chapterAdmins} />
              <MetricRow label="Moderators" value={chapter.counts.moderators} />
              <MetricRow label="Members" value={Math.max(0, chapter.counts.members - chapter.counts.chapterAdmins - chapter.counts.moderators)} />
              <MetricRow label="Total accounts" value={chapter.counts.members} />
            </div>
          </section>

          <section className="panel compact-panel">
            <div className="panel-header"><div><span className="section-kicker">Recruitment settings</span><h2>Workspace configuration</h2></div></div>
            <div className={styles.settingList}>
              <Setting label="Comments" enabled={Boolean(chapter.settings?.commentsEnabled)} />
              <Setting label="Replies" enabled={Boolean(chapter.settings?.repliesEnabled)} />
              <Setting label="Reactions" enabled={Boolean(chapter.settings?.reactionsEnabled)} />
            </div>
            {chapter.settings ? <p className="panel-note">Scores: {chapter.settings.scoreMin}–{chapter.settings.scoreMax} in {chapter.settings.scoreStep} point increments.</p> : null}
          </section>

          <section className={`panel compact-panel ${styles.privacyCard}`}>
            <div className={styles.privacyIcon}><Icon name="shield" size={18} /></div>
            <div><strong>Privacy boundary</strong><p>This operator view intentionally shows counts and configuration, not PNM names, contact information, ratings, comments, or custom form responses.</p></div>
          </section>
        </aside>
      </div>

      <Modal
        open={statusConfirm}
        onClose={() => setStatusConfirm(false)}
        title={chapter.isActive ? "Suspend chapter workspace" : "Reactivate chapter workspace"}
        subtitle={chapter.isActive ? "Members will immediately lose access to chapter operations until the workspace is reactivated." : "Members will regain access to chapter operations."}
        footer={<><Button variant="secondary" onClick={() => setStatusConfirm(false)}>Cancel</Button><Button variant={chapter.isActive ? "danger" : "primary"} disabled={statusBusy} onClick={() => void changeWorkspaceStatus()}>{statusBusy ? "Updating…" : chapter.isActive ? "Suspend workspace" : "Reactivate workspace"}</Button></>}
      >
        <p className="modal-copy">{chapter.isActive ? <>Suspend <strong>{chapter.name}</strong>? The workspace and its data will remain stored, but chapter-role API access will be blocked.</> : <>Reactivate <strong>{chapter.name}</strong> and restore member access?</>}</p>
      </Modal>
    </AppShell>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return <div className={styles.definition}><span>{label}</span><strong>{value}</strong></div>;
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return <div className={styles.metricRow}><span>{label}</span><strong>{value}</strong></div>;
}

function Setting({ label, enabled }: { label: string; enabled: boolean }) {
  return <div className={styles.settingRow}><span><StatusDot color={enabled ? "#16a34a" : "#94a3b8"} />{label}</span><strong>{enabled ? "On" : "Off"}</strong></div>;
}

function prettyEnum(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPeriod(start?: string | null, end?: string | null) {
  if (!start && !end) return "Not set";
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return start ? `Starts ${formatDate(start)}` : `Ends ${formatDate(end!)}`;
}

function formatRelativeDate(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

function chapterInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B";
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    CHAPTER_CREATED: "Chapter workspace created",
    CHAPTER_UPDATED: "Chapter workspace updated",
    BRANDING_UPDATED: "Branding updated",
    SETTINGS_UPDATED: "Recruitment settings updated",
    MEMBER_INVITED: "Member invitation created",
    MEMBER_ROLE_CHANGED: "Member role changed",
    MEMBER_REMOVED: "Member removed",
    INVITE_REVOKED: "Member invitation revoked",
    CYCLE_CREATED: "Recruitment cycle created",
    CYCLE_UPDATED: "Recruitment cycle updated",
    CYCLE_ACTIVATED: "Recruitment cycle activated",
    CYCLE_ARCHIVED: "Recruitment cycle archived",
    FORM_UPDATED: "Recruitment form updated",
    IMPORT_COMPLETED: "PNM import completed",
    EXPORT_CREATED: "PNM export created"
  };
  return labels[action] || prettyEnum(action);
}

function subscriptionTone(status: string): "neutral" | "success" | "warning" | "danger" | "accent" {
  if (status === "ACTIVE" || status === "TRIAL") return "success";
  if (status === "PAST_DUE") return "warning";
  if (status === "CANCELED" || status === "EXPIRED") return "danger";
  return "neutral";
}
