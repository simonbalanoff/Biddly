"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, Button, CopyButton, EmptyState, Field, Input, Modal, SearchSelect, Select } from "../../components/ui";
import { apiRequest, publicApiRequest } from "../../lib/api";
import type { CatalogItem } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";

type PlatformChapter = {
  id: string;
  name: string;
  createdAt: string;
  organization: { id: string; name: string; shortName?: string | null };
  university: { id: string; name: string; shortName?: string | null };
  activeRecruitmentCycle?: { id: string; name: string; status: string } | null;
  _count: { memberships: number; candidates: number };
};

type WorkspaceInvite = {
  id: string;
  email: string;
  chapterName?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
  organization?: { id: string; name: string; shortName?: string | null } | null;
  university?: { id: string; name: string; shortName?: string | null } | null;
};

function inviteStatus(invite: WorkspaceInvite) {
  if (invite.acceptedAt) return "accepted" as const;
  if (new Date(invite.expiresAt) <= new Date()) return "expired" as const;
  return "pending" as const;
}

export default function PlatformPage() {
  const { context } = useAuth();
  const [chapters, setChapters] = useState<PlatformChapter[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [organizations, setOrganizations] = useState<CatalogItem[]>([]);
  const [universities, setUniversities] = useState<CatalogItem[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteInvite, setDeleteInvite] = useState<WorkspaceInvite | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    const [chapterData, inviteData, orgs, schools] = await Promise.all([
      apiRequest<PlatformChapter[]>("/platform/chapters"),
      apiRequest<WorkspaceInvite[]>("/platform/workspace-invites"),
      publicApiRequest<CatalogItem[]>("/catalog/organizations"),
      publicApiRequest<CatalogItem[]>("/catalog/universities")
    ]);
    setChapters(chapterData);
    setInvites(inviteData);
    setOrganizations(orgs);
    setUniversities(schools);
  };

  useEffect(() => {
    if (context?.user.platformRole === "PLATFORM_ADMIN") void load();
  }, [context?.user.platformRole]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((chapter) => `${chapter.name} ${chapter.organization.name} ${chapter.university.name}`.toLowerCase().includes(q));
  }, [chapters, search]);

  const pendingInvites = invites.filter((item) => inviteStatus(item) === "pending").length;
  const memberCount = chapters.reduce((sum, item) => sum + item._count.memberships, 0);
  const candidateCount = chapters.reduce((sum, item) => sum + item._count.candidates, 0);

  const removeInvite = async () => {
    if (!deleteInvite) return;
    setDeleteBusy(true);
    setPageError("");
    try {
      await apiRequest(`/platform/workspace-invites/${deleteInvite.id}`, { method: "DELETE" });
      setDeleteInvite(null);
      await load();
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Unable to remove the invitation");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (context?.user.platformRole !== "PLATFORM_ADMIN") {
    return <AppShell><div className="panel panel-spacious"><EmptyState icon="shield" title="Platform access required" copy="This page is only available to Biddly platform administrators." /></div></AppShell>;
  }

  return (
    <AppShell>
      <PageHeader title="Biddly administration" description="Provision chapter workspaces and keep track of the chapters using Biddly." actions={<Button icon="plus" onClick={() => setInviteOpen(true)}>Create workspace invite</Button>} />
      {pageError ? <div className="form-alert form-alert-error page-alert">{pageError}</div> : null}

      <section className="summary-strip">
        <div><span>Chapter workspaces</span><strong>{chapters.length}</strong></div>
        <div><span>Members</span><strong>{memberCount}</strong></div>
        <div><span>PNMs stored</span><strong>{candidateCount}</strong></div>
        <div><span>Pending setup invites</span><strong>{pendingInvites}</strong></div>
      </section>

      <section className="panel table-panel page-section">
        <div className="panel-header simple-panel-header"><div><h2>Chapter workspaces</h2><p>Every active chapter account on the platform.</p></div></div>
        <div className="table-toolbar"><div className="search-field search-field-compact"><Icon name="search" size={17} /><input placeholder="Search chapters, organizations, or schools" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        {filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Chapter</th><th>Organization</th><th>University</th><th>Active cycle</th><th>Members</th><th>PNMs</th></tr></thead>
              <tbody>{filtered.map((chapter) => <tr key={chapter.id}><td><div className="table-primary"><strong>{chapter.name}</strong><small>Created {new Date(chapter.createdAt).toLocaleDateString()}</small></div></td><td>{chapter.organization.shortName || chapter.organization.name}</td><td>{chapter.university.shortName || chapter.university.name}</td><td>{chapter.activeRecruitmentCycle ? <Badge tone="success">{chapter.activeRecruitmentCycle.name}</Badge> : <Badge>No active cycle</Badge>}</td><td>{chapter._count.memberships}</td><td>{chapter._count.candidates}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <EmptyState icon="users" title="No workspaces yet" copy="Create a workspace invitation when you are ready to onboard the first chapter." />}
      </section>

      <section className="panel table-panel page-section">
        <div className="panel-header simple-panel-header"><div><h2>Workspace invitations</h2><p>One-time setup links sent to recruitment chairs or chapter leaders.</p></div><Button variant="secondary" size="sm" icon="plus" onClick={() => setInviteOpen(true)}>New invitation</Button></div>
        {invites.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Recipient</th><th>Organization</th><th>University</th><th>Expires</th><th>Status</th><th /></tr></thead>
              <tbody>{invites.map((invite) => {
                const status = inviteStatus(invite);
                return <tr key={invite.id}><td><div className="table-primary"><strong>{invite.email}</strong><small>{invite.chapterName || "Chapter name chosen during setup"}</small></div></td><td>{invite.organization?.shortName || invite.organization?.name || "Any"}</td><td>{invite.university?.shortName || invite.university?.name || "Any"}</td><td>{new Date(invite.expiresAt).toLocaleDateString()}</td><td><Badge tone={status === "accepted" ? "success" : status === "pending" ? "warning" : "neutral"}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge></td><td>{status !== "accepted" ? <Button variant="ghost" size="sm" onClick={() => setDeleteInvite(invite)}>Remove</Button> : null}</td></tr>;
              })}</tbody>
            </table>
          </div>
        ) : <EmptyState icon="mail" title="No setup invitations" copy="Workspace invitations you create will appear here until they are accepted or removed." />}
      </section>

      <WorkspaceInviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} organizations={organizations} universities={universities} onCreated={load} />
      <Modal open={Boolean(deleteInvite)} onClose={() => setDeleteInvite(null)} title="Remove workspace invitation" subtitle="The setup link will stop working immediately." footer={<><Button variant="secondary" onClick={() => setDeleteInvite(null)}>Cancel</Button><Button variant="danger" disabled={deleteBusy} onClick={() => void removeInvite()}>{deleteBusy ? "Removing…" : "Remove invitation"}</Button></>}>{deleteInvite ? <p className="modal-copy">Remove the invitation for <strong>{deleteInvite.email}</strong>?</p> : null}</Modal>
    </AppShell>
  );
}

function WorkspaceInviteModal({ open, onClose, organizations, universities, onCreated }: { open: boolean; onClose: () => void; organizations: CatalogItem[]; universities: CatalogItem[]; onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [chapterName, setChapterName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const close = () => {
    setEmail(""); setOrganizationId(""); setUniversityId(""); setChapterName(""); setExpiresInDays("7"); setError(""); setInviteUrl("");
    onClose();
  };

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ inviteUrl: string }>("/platform/workspace-invites", { method: "POST", body: JSON.stringify({ email, organizationId: organizationId || null, universityId: universityId || null, chapterName: chapterName || null, expiresInDays: Number(expiresInDays) }) });
      setInviteUrl(result.inviteUrl);
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create invitation");
    } finally { setBusy(false); }
  };

  return <Modal open={open} onClose={close} title="Create workspace invitation" subtitle="Send a one-time setup link to the person who will administer the chapter." width="600px" scrollable={false} footer={inviteUrl ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button disabled={busy || !email.trim()} onClick={() => void submit()}>{busy ? "Creating…" : "Create invitation"}</Button></>}>
    {inviteUrl ? <div className="invite-created-card"><div className="invite-created-icon"><Icon name="check" /></div><div><strong>Setup link created</strong><p>Send this link to the chapter leader you are onboarding.</p></div><div className="invite-url-box"><span>{inviteUrl}</span><CopyButton value={inviteUrl} /></div></div> : <>
      <Field label="Recipient email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="recruitmentchair@school.edu" /></Field>
      <div className="form-grid form-grid-2"><Field label="Organization" hint="Optional — leave blank to let them choose during setup."><SearchSelect value={organizationId} onChange={setOrganizationId} placeholder="Search organizations" clearLabel="Let them choose" options={organizations.map((item) => ({ value: item.id, label: item.name, description: item.shortName && item.shortName !== item.name ? item.shortName : undefined }))} /></Field><Field label="University" hint="Optional — leave blank to let them choose during setup."><SearchSelect value={universityId} onChange={setUniversityId} placeholder="Search universities" clearLabel="Let them choose" options={universities.map((item) => ({ value: item.id, label: item.name, description: item.shortName && item.shortName !== item.name ? item.shortName : undefined }))} /></Field></div>
      <div className="form-grid form-grid-2"><Field label="Chapter name" hint="Optional"><Input value={chapterName} onChange={(event) => setChapterName(event.target.value)} placeholder="Colorado Gamma" /></Field><Field label="Link expires"><Select value={expiresInDays} onChange={setExpiresInDays} options={[{ value: "1", label: "After 1 day" }, { value: "7", label: "After 7 days" }, { value: "30", label: "After 30 days" }, { value: "90", label: "After 90 days" }]} /></Field></div>
      {error ? <div className="form-alert form-alert-error">{error}</div> : null}
    </>}
  </Modal>;
}
