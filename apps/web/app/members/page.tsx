"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Avatar, Badge, Button, CopyButton, EmptyState, Field, Input, Modal, Select, Toggle } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { ChapterInvite, ChapterMember, Role } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";

function inviteStatus(invite: ChapterInvite) {
  if (invite.revokedAt) return "revoked" as const;
  if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) return "expired" as const;
  if (invite.maxUses !== null && invite.maxUses !== undefined && invite.useCount >= invite.maxUses) return "used" as const;
  if (invite.acceptedAt && invite.useCount === 0) return "used" as const;
  return "active" as const;
}

function formatRole(role: Role) {
  if (role === "CHAPTER_ADMIN") return "Chapter admin";
  if (role === "MODERATOR") return "Moderator";
  return "Member";
}

export default function MembersPage() {
  const { context } = useAuth();
  const [members, setMembers] = useState<ChapterMember[]>([]);
  const [invites, setInvites] = useState<ChapterInvite[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [memberData, inviteData] = await Promise.all([
        apiRequest<ChapterMember[]>("/chapter/members"),
        apiRequest<ChapterInvite[]>("/chapter/invites")
      ]);
      setMembers(memberData);
      setInvites(inviteData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load chapter access");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return members;
    return members.filter((member) => `${member.user.firstName} ${member.user.lastName} ${member.user.email}`.toLowerCase().includes(value));
  }, [members, search]);

  const activeInvites = invites.filter((invite) => inviteStatus(invite) === "active");

  const updateRole = async (id: string, role: Role) => {
    try {
      await apiRequest(`/chapter/members/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      await load();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Unable to update role");
    }
  };

  const remove = async (member: ChapterMember) => {
    if (!window.confirm(`Remove ${member.user.firstName} ${member.user.lastName} from this workspace?`)) return;
    try {
      await apiRequest(`/chapter/members/${member.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Unable to remove member");
    }
  };

  const revoke = async (invite: ChapterInvite) => {
    if (!window.confirm("Disable this invitation link? Anyone who has the link will no longer be able to use it.")) return;
    try {
      await apiRequest(`/chapter/invites/${invite.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Unable to revoke invitation");
    }
  };

  return (
    <AppShell>
      <PageHeader title="Members" description="Manage who can access this chapter and create reusable invitation links." actions={<Button icon="plus" onClick={() => setInviteOpen(true)}>Create invite link</Button>} />
      {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}

      <section className="summary-strip">
        <div><span>Total members</span><strong>{members.length}</strong></div>
        <div><span>Chapter admins</span><strong>{members.filter((item) => item.role === "CHAPTER_ADMIN").length}</strong></div>
        <div><span>Moderators</span><strong>{members.filter((item) => item.role === "MODERATOR").length}</strong></div>
        <div><span>Active invite links</span><strong>{activeInvites.length}</strong></div>
      </section>

      <section className="panel table-panel page-section">
        <div className="panel-header simple-panel-header">
          <div><h2>Chapter members</h2><p>People who currently have access to {context?.chapter?.name ?? "this chapter"}.</p></div>
        </div>
        <div className="table-toolbar"><div className="search-field search-field-compact"><Icon name="search" size={17} /><input placeholder="Search by name or email" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        {loading ? <div className="detail-loading"><span>Loading members…</span></div> : filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Member</th><th>Role</th><th>Joined</th><th>Status</th><th /></tr></thead>
              <tbody>{filtered.map((member) => (
                <tr key={member.id}>
                  <td><div className="member-cell"><Avatar firstName={member.user.firstName} lastName={member.user.lastName} size={34} /><span><strong>{member.user.firstName} {member.user.lastName}</strong><small>{member.user.email}</small></span></div></td>
                  <td><Select compact className="role-select" value={member.role} disabled={member.user.id === context?.user.id} onChange={(next) => void updateRole(member.id, next as Role)} options={[{ value: "MEMBER", label: "Member" }, { value: "MODERATOR", label: "Moderator" }, { value: "CHAPTER_ADMIN", label: "Chapter admin" }]} /></td>
                  <td>{new Date(member.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td><Badge tone={member.user.isActive ? "success" : "neutral"}>{member.user.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td><button className="icon-button" disabled={member.user.id === context?.user.id} onClick={() => void remove(member)} aria-label="Remove member"><Icon name="trash" size={16} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState icon="users" title="No matching members" copy="Try a different name or email." />}
      </section>

      <section className="panel table-panel page-section">
        <div className="panel-header simple-panel-header">
          <div><h2>Invite links</h2><p>Create one link and share it with the right group. You control the role, expiration, and number of uses.</p></div>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setInviteOpen(true)}>New link</Button>
        </div>
        {invites.length ? (
          <div className="data-table-wrap">
            <table className="data-table invite-table">
              <thead><tr><th>Invite</th><th>Access</th><th>Uses</th><th>Expires</th><th>Status</th><th /></tr></thead>
              <tbody>{invites.map((invite) => {
                const status = inviteStatus(invite);
                const tone = status === "active" ? "success" : status === "revoked" ? "danger" : "neutral";
                const uses = invite.maxUses == null ? `${invite.useCount} / Unlimited` : `${invite.useCount} / ${invite.maxUses}`;
                return (
                  <tr key={invite.id}>
                    <td><div className="invite-name-cell"><strong>{invite.label || (invite.email ? invite.email : `${formatRole(invite.role)} invite`)}</strong><small>{invite.email ? `Restricted to ${invite.email}` : "Anyone with the link can use it"}</small></div></td>
                    <td>{formatRole(invite.role)}</td>
                    <td>{uses}</td>
                    <td>{invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never"}</td>
                    <td><Badge tone={tone}>{status === "used" ? "Used up" : status.charAt(0).toUpperCase() + status.slice(1)}</Badge></td>
                    <td><div className="row-actions">{status === "active" && invite.inviteUrl ? <CopyButton value={invite.inviteUrl!} label="Copy" variant="ghost" /> : null}{status === "active" ? <Button variant="ghost" size="sm" onClick={() => void revoke(invite)}>Revoke</Button> : null}</div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <EmptyState icon="mail" title="No invite links yet" copy="Create a link for members, moderators, or additional chapter admins." action={<Button onClick={() => setInviteOpen(true)}>Create invite link</Button>} />}
      </section>

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={load} />
    </AppShell>
  );
}

function InviteMemberModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [expires, setExpires] = useState("7");
  const [unlimited, setUnlimited] = useState(false);
  const [maxUses, setMaxUses] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const reset = () => {
    setLabel("");
    setEmail("");
    setRole("MEMBER");
    setExpires("7");
    setUnlimited(false);
    setMaxUses(25);
    setError("");
    setInviteUrl("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<ChapterInvite>("/chapter/invites", {
        method: "POST",
        body: JSON.stringify({
          label: label.trim() || null,
          email: email.trim() || undefined,
          role,
          maxUses: email.trim() ? 1 : unlimited ? null : maxUses,
          expiresInDays: expires === "never" ? null : Number(expires)
        })
      });
      setInviteUrl(result.inviteUrl ?? "");
      await onInvited();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create invitation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Create invite link" subtitle="Share one reusable link with the people who should join this chapter." width="600px" footer={inviteUrl ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button disabled={busy || (!email.trim() && !unlimited && maxUses < 1)} onClick={() => void submit()}>{busy ? "Creating…" : "Create link"}</Button></>}>
      {inviteUrl ? (
        <div className="invite-created-card">
          <div className="invite-created-icon"><Icon name="check" /></div>
          <div><strong>Invite link is ready</strong><p>Copy this link now or anytime from the Invite links table.</p></div>
          <div className="invite-url-box"><span>{inviteUrl}</span><CopyButton value={inviteUrl} /></div>
        </div>
      ) : (
        <>
          <Field label="Invite name" hint="Optional. A useful label like “Fall 2026 members” makes links easier to manage."><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Fall 2026 members" /></Field>
          <div className="form-grid form-grid-2">
            <Field label="Access level"><Select value={role} onChange={(next) => setRole(next as Role)} options={[{ value: "MEMBER", label: "Member", description: "Can view PNMs, score, and use enabled discussion tools." }, { value: "MODERATOR", label: "Moderator", description: "Can also manage PNMs and moderate chapter content." }, { value: "CHAPTER_ADMIN", label: "Chapter admin", description: "Full chapter configuration and member management access." }]} /></Field>
            <Field label="Expires"><Select value={expires} onChange={setExpires} options={[{ value: "1", label: "After 1 day" }, { value: "7", label: "After 7 days" }, { value: "30", label: "After 30 days" }, { value: "90", label: "After 90 days" }, { value: "never", label: "Never" }]} /></Field>
          </div>
          <div className="invite-options-card">
            <div className="invite-option-row"><div><strong>Unlimited uses</strong><span>Allow any number of eligible people to join while the link is active.</span></div><Toggle checked={unlimited && !email.trim()} disabled={Boolean(email.trim())} onChange={setUnlimited} /></div>
            {!unlimited && !email.trim() ? <Field label="Maximum uses"><Input type="number" min={1} max={10000} value={maxUses} onChange={(event) => setMaxUses(Math.max(1, Number(event.target.value)))} /></Field> : null}
          </div>
          <Field label="Restrict to one email" hint="Optional. If you enter an email, the link becomes single-use and only that person can accept it."><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@school.edu" /></Field>
          {error ? <div className="form-alert form-alert-error">{error}</div> : null}
        </>
      )}
    </Modal>
  );
}
