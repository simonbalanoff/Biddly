"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "../../components/auth-layout";
import { Button, Field, Input, SearchSelect, Spinner } from "../../components/ui";
import { publicApiRequest, setStoredSession } from "../../lib/api";
import type { CatalogItem, Session } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";

type Invite = {
  email: string;
  organization?: CatalogItem | null;
  university?: CatalogItem | null;
  chapterName?: string | null;
  expiresAt: string;
};

export default function SetupClient({ token }: { token: string }) {
  const router = useRouter();
  const { refreshContext } = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [organizations, setOrganizations] = useState<CatalogItem[]>([]);
  const [universities, setUniversities] = useState<CatalogItem[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [chapterName, setChapterName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!token) {
        setError("This setup link is missing its invitation token.");
        setLoading(false);
        return;
      }
      try {
        const [inviteData, orgs, schools] = await Promise.all([
          publicApiRequest<Invite>(`/auth/workspace-invites/${encodeURIComponent(token)}`),
          publicApiRequest<CatalogItem[]>("/catalog/organizations"),
          publicApiRequest<CatalogItem[]>("/catalog/universities")
        ]);
        if (!active) return;
        setInvite(inviteData);
        setOrganizations(orgs);
        setUniversities(schools);
        setOrganizationId(inviteData.organization?.id ?? "");
        setUniversityId(inviteData.university?.id ?? "");
        setChapterName(inviteData.chapterName ?? "");
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load invitation");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [token]);

  const selectedOrg = useMemo(() => organizations.find((item) => item.id === organizationId), [organizations, organizationId]);
  const selectedSchool = useMemo(() => universities.find((item) => item.id === universityId), [universities, universityId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await publicApiRequest<{ session: Session }>("/auth/workspace-invites/accept", {
        method: "POST",
        body: JSON.stringify({ token, firstName, lastName, password, organizationId, universityId, chapterName })
      });
      setStoredSession(result.session);
      await refreshContext();
      router.replace("/recruitment");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create workspace");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="standalone-loading"><Spinner /><span>Loading chapter invitation…</span></div>;

  return (
    <AuthLayout asideTitle="Set up your chapter once. Run recruitment from there." asideCopy="Biddly keeps your chapter’s PNMs, scoring, forms, member access, and recruitment history in one private workspace.">
      <div className="auth-heading"><span className="auth-kicker-dark">Chapter setup</span><h1>Create your workspace</h1><p>{invite ? `This invitation was issued to ${invite.email}.` : "Complete the information below to create your chapter workspace."}</p></div>
      {error && !invite ? <div className="form-alert form-alert-error">{error}</div> : (
        <form className="auth-form" onSubmit={submit}>
          <div className="form-grid form-grid-2"><Field label="First name"><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></Field><Field label="Last name"><Input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></Field></div>
          <Field label="Create password" hint="Use at least 10 characters."><Input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
          <div className="auth-divider"><span>Chapter information</span></div>
          <Field label="Organization"><SearchSelect value={organizationId} onChange={setOrganizationId} disabled={Boolean(invite?.organization)} placeholder="Search organizations" options={organizations.map((item) => ({ value: item.id, label: item.name, description: item.shortName && item.shortName !== item.name ? item.shortName : undefined }))} /></Field>
          <Field label="University"><SearchSelect value={universityId} onChange={setUniversityId} disabled={Boolean(invite?.university)} placeholder="Search universities" options={universities.map((item) => ({ value: item.id, label: item.name, description: item.shortName && item.shortName !== item.name ? item.shortName : undefined }))} /></Field>
          <Field label="Chapter name" hint={selectedOrg && selectedSchool ? `${selectedOrg.shortName || selectedOrg.name} at ${selectedSchool.shortName || selectedSchool.name}` : undefined}><Input value={chapterName} onChange={(event) => setChapterName(event.target.value)} placeholder="Colorado Gamma" required /></Field>
          {error ? <div className="form-alert form-alert-error">{error}</div> : null}
          <Button type="submit" disabled={busy || !organizationId || !universityId}>{busy ? "Creating workspace…" : "Create chapter workspace"}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
