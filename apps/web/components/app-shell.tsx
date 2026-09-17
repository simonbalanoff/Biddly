"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../providers/auth-provider";
import type { Role } from "../lib/types";
import { Brand } from "./brand";
import { Icon } from "./icons";
import { Avatar, EmptyState, Spinner } from "./ui";

const primaryNav = [
  { href: "/dashboard", label: "Overview", icon: "home" as const, roles: ["MEMBER", "MODERATOR", "CHAPTER_ADMIN"] as Role[] },
  { href: "/candidates", label: "PNMs", icon: "candidate" as const, roles: ["MEMBER", "MODERATOR", "CHAPTER_ADMIN"] as Role[] },
  { href: "/recruitment", label: "Recruitment", icon: "workflow" as const, roles: ["CHAPTER_ADMIN"] as Role[] },
  { href: "/members", label: "Members", icon: "users" as const, roles: ["CHAPTER_ADMIN"] as Role[] }
];

const adminNav = [
  { href: "/moderation", label: "Moderation", icon: "shield" as const, roles: ["MODERATOR", "CHAPTER_ADMIN"] as Role[] },
  { href: "/data", label: "Data", icon: "data" as const, roles: ["CHAPTER_ADMIN"] as Role[] },
  { href: "/billing", label: "Billing", icon: "billing" as const, roles: ["CHAPTER_ADMIN"] as Role[] },
  { href: "/settings", label: "Settings", icon: "settings" as const, roles: ["CHAPTER_ADMIN"] as Role[] }
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { context, loading, signedIn, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !signedIn) router.replace("/login");
  }, [loading, signedIn, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const role = context?.membership?.role ?? null;
  const platformAdmin = context?.user.platformRole === "PLATFORM_ADMIN";
  const chapter = context?.chapter;
  const memberMode = role === "MEMBER" && !platformAdmin;
  const theme = useMemo(() => {
    const organization = chapter?.organization;
    const branding = chapter?.branding;
    return {
      "--chapter-primary": branding?.primaryColor || organization?.primaryColor || "#2563eb",
      "--chapter-secondary": branding?.secondaryColor || organization?.secondaryColor || "#ffffff"
    } as React.CSSProperties;
  }, [chapter]);

  const memberRouteAllowed = pathname === "/candidates" || pathname.startsWith("/candidates/");

  useEffect(() => {
    if (!loading && signedIn && memberMode && !memberRouteAllowed) {
      router.replace("/candidates");
    }
  }, [loading, memberMode, memberRouteAllowed, router, signedIn]);

  if (loading || (!signedIn && !context)) {
    return <div className="app-loading"><Brand /><Spinner size={28} /></div>;
  }

  if (!context) return null;

  const hierarchyBlocked = Boolean(chapter && context.chapterAccess?.active === false);
  const subscriptionMode = context.subscriptionAccess?.mode ?? "FULL";
  const subscriptionLocked = Boolean(chapter && subscriptionMode === "LOCKED");
  const subscriptionReadOnly = Boolean(chapter && subscriptionMode === "READ_ONLY");
  const workspaceBlocked = hierarchyBlocked || subscriptionLocked;
  const visiblePrimary = role && !workspaceBlocked ? primaryNav.filter((item) => item.roles.includes(role)) : [];
  const visibleAdmin = role && !workspaceBlocked
    ? adminNav.filter((item) => item.roles.includes(role) && (!subscriptionReadOnly || item.href === "/data" || item.href === "/billing"))
    : [];
  const platformPath = pathname.startsWith("/platform");
  const billingPath = pathname === "/billing" || pathname.startsWith("/billing/");

  if (memberMode) {
    const redirecting = !memberRouteAllowed;
    return (
      <div className="member-app-frame" style={theme}>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <header className="member-topbar">
          <div className="member-topbar-inner">
            <Link href="/candidates" className="member-topbar-brand"><Brand /></Link>
            {chapter ? <div className="member-topbar-workspace">
              <div className="member-topbar-crest">{chapter.branding?.crestUrl || chapter.organization.crestUrl ? <img src={chapter.branding?.crestUrl || chapter.organization.crestUrl || ""} alt="" /> : <span>{(chapter.organization.shortName || chapter.organization.name).slice(0, 2).toUpperCase()}</span>}</div>
              <div><strong>{chapter.name}</strong><span>{chapter.university.shortName || chapter.university.name}</span></div>
            </div> : null}
            <nav className="member-topbar-nav" aria-label="Member navigation"><Link href="/candidates" aria-current="page"><Icon name="candidate" size={17} /> PNMs</Link></nav>
            <div className="member-topbar-account">
              <Avatar firstName={context.user.firstName} lastName={context.user.lastName} />
              <div className="member-topbar-user"><strong>{context.user.firstName} {context.user.lastName}</strong><span>Chapter member</span></div>
              <button type="button" className="member-signout" onClick={async () => { await logout(); router.replace("/login"); }}><Icon name="logout" size={17} /><span>Sign out</span></button>
            </div>
          </div>
        </header>
        <main id="main-content" className="member-main" tabIndex={-1}>
          <div className="member-content">
            {redirecting ? <div className="member-route-loading"><Spinner size={26} /></div> : hierarchyBlocked ? <div className="panel panel-spacious"><EmptyState icon="lock" title={suspensionTitle(context.chapterAccess?.reason ?? null)} copy={suspensionCopy(context.chapterAccess?.reason ?? null)} /></div> : subscriptionLocked ? <div className="panel panel-spacious"><EmptyState icon="billing" title="Workspace subscription required" copy="Your chapter’s Biddly subscription is not active right now. A chapter administrator needs to restore billing before member access returns." /></div> : children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-frame" style={theme}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <button type="button" className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="app-sidebar"><Icon name="menu" /></button>
      <aside id="app-sidebar" className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Link href={chapter ? "/dashboard" : "/platform"} className="sidebar-brand"><Brand /></Link>
          <button type="button" className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><Icon name="x" /></button>
        </div>

        {chapter ? (
          <div className="workspace-card">
            <div className="workspace-crest">
              {chapter.branding?.crestUrl || chapter.organization.crestUrl ? <img src={chapter.branding?.crestUrl || chapter.organization.crestUrl || ""} alt="" /> : <span>{(chapter.organization.shortName || chapter.organization.name).slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className="workspace-copy"><strong>{chapter.name}</strong><span>{chapter.university.shortName || chapter.university.name}</span></div>
          </div>
        ) : <div className="platform-label"><div className="platform-label-icon"><Icon name="shield" size={17} /></div><div><span>Biddly admin</span><strong>Platform operations</strong></div></div>}

        {visiblePrimary.length ? <div className="sidebar-nav-group"><div className="sidebar-section-label">Workspace</div><nav className="sidebar-nav">
          {visiblePrimary.map((item) => <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span></Link>)}
        </nav></div> : null}

        {platformAdmin ? <div className="sidebar-platform-group"><div className="sidebar-section-label">Administration</div><Link href="/platform" aria-current={isActive(pathname, "/platform") && !pathname.startsWith("/platform/billing") && !pathname.startsWith("/platform/storage") && !pathname.startsWith("/platform/system") ? "page" : undefined} className={`nav-link ${isActive(pathname, "/platform") && !pathname.startsWith("/platform/billing") && !pathname.startsWith("/platform/storage") && !pathname.startsWith("/platform/system") ? "nav-link-active" : ""}`}><Icon name="shield" /><span>Platform</span></Link><Link href="/platform/billing" aria-current={isActive(pathname, "/platform/billing") ? "page" : undefined} className={`nav-link ${isActive(pathname, "/platform/billing") ? "nav-link-active" : ""}`}><Icon name="billing" /><span>Billing</span></Link><Link href="/platform/storage" aria-current={isActive(pathname, "/platform/storage") ? "page" : undefined} className={`nav-link ${isActive(pathname, "/platform/storage") ? "nav-link-active" : ""}`}><Icon name="storage" /><span>Storage</span></Link><Link href="/platform/system" aria-current={isActive(pathname, "/platform/system") ? "page" : undefined} className={`nav-link ${isActive(pathname, "/platform/system") ? "nav-link-active" : ""}`}><Icon name="activity" /><span>System</span></Link></div> : null}

        {visibleAdmin.length ? <div className="sidebar-secondary"><div className="sidebar-section-label">Manage</div>{visibleAdmin.map((item) => <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span></Link>)}</div> : null}

        <div className="sidebar-user">
          <Avatar firstName={context.user.firstName} lastName={context.user.lastName} />
          <div className="sidebar-user-copy"><strong>{context.user.firstName} {context.user.lastName}</strong><span>{role ? role.replaceAll("_", " ").toLowerCase() : "Platform admin"}</span></div>
          <button type="button" className="icon-button" onClick={async () => { await logout(); router.replace("/login"); }} aria-label="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>
      {mobileOpen ? <button type="button" className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}
      <main id="main-content" className="app-main" tabIndex={-1}>
        <div className="app-content">
          {hierarchyBlocked && !platformPath ? <div className="panel panel-spacious"><EmptyState icon="lock" title={suspensionTitle(context.chapterAccess?.reason ?? null)} copy={suspensionCopy(context.chapterAccess?.reason ?? null)} /></div> : subscriptionLocked && !platformPath ? <div className="panel panel-spacious"><EmptyState icon="billing" title="Workspace subscription required" copy="This workspace does not currently have an active Biddly subscription. Chapter members and moderators cannot access workspace data until a chapter administrator restores billing." /></div> : <>{subscriptionReadOnly && !platformPath && !billingPath ? <div className="subscription-readonly-banner"><div className="subscription-readonly-icon"><Icon name="lock" size={18} /></div><div className="subscription-readonly-copy"><strong>Read-only mode</strong><span>Your Biddly subscription is inactive. Existing workspace data remains available to chapter administrators, but changes are disabled until billing is restored.</span></div><div className="subscription-readonly-actions"><Link href="/data" className="button button-secondary button-sm">Export data</Link><Link href="/billing" className="button button-primary button-sm">Manage billing</Link></div></div> : null}{children}</>}
        </div>
      </main>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span className="breadcrumb-item" key={`${item.label}-${index}`}>
          {index ? <Icon name="chevron" size={13} /> : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>{eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}<h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

function suspensionTitle(reason: MeContextAccessReason) {
  if (reason === "ORGANIZATION_SUSPENDED") return "Organization suspended";
  if (reason === "UNIVERSITY_SUSPENDED") return "University access suspended";
  return "Workspace suspended";
}

function suspensionCopy(reason: MeContextAccessReason) {
  if (reason === "ORGANIZATION_SUSPENDED") return "This organization is temporarily unavailable in Biddly. Workspace data remains stored, but chapter operations are disabled until the organization is reactivated.";
  if (reason === "UNIVERSITY_SUSPENDED") return "Workspaces at this university are temporarily unavailable. Workspace data remains stored, but chapter operations are disabled until access is restored.";
  return "This chapter workspace is temporarily unavailable. Contact your chapter administrator or Biddly support if you believe this is a mistake.";
}

type MeContextAccessReason = "CHAPTER_SUSPENDED" | "ORGANIZATION_SUSPENDED" | "UNIVERSITY_SUSPENDED" | null;
