"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../providers/auth-provider";
import type { Role } from "../lib/types";
import { Brand } from "./brand";
import { Icon } from "./icons";
import { Avatar, Spinner } from "./ui";

const primaryNav = [
  { href: "/dashboard", label: "Overview", icon: "home" as const, roles: ["MEMBER", "MODERATOR", "CHAPTER_ADMIN"] as Role[] },
  { href: "/candidates", label: "PNMs", icon: "candidate" as const, roles: ["MEMBER", "MODERATOR", "CHAPTER_ADMIN"] as Role[] },
  { href: "/recruitment", label: "Recruitment", icon: "workflow" as const, roles: ["CHAPTER_ADMIN"] as Role[] },
  { href: "/members", label: "Members", icon: "users" as const, roles: ["CHAPTER_ADMIN"] as Role[] }
];

const adminNav = [
  { href: "/moderation", label: "Moderation", icon: "shield" as const, roles: ["MODERATOR", "CHAPTER_ADMIN"] as Role[] },
  { href: "/data", label: "Import & export", icon: "data" as const, roles: ["CHAPTER_ADMIN"] as Role[] },
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

  const role = context?.membership?.role ?? null;
  const platformAdmin = context?.user.platformRole === "PLATFORM_ADMIN";
  const chapter = context?.chapter;
  const theme = useMemo(() => {
    const organization = chapter?.organization;
    const branding = chapter?.branding;
    return {
      "--chapter-primary": branding?.primaryColor || organization?.primaryColor || "#2563eb",
      "--chapter-secondary": branding?.secondaryColor || organization?.secondaryColor || "#ffffff",
      "--chapter-accent": branding?.accentColor || organization?.accentColor || branding?.primaryColor || organization?.primaryColor || "#2563eb"
    } as React.CSSProperties;
  }, [chapter]);

  if (loading || (!signedIn && !context)) {
    return <div className="app-loading"><Brand /><Spinner size={28} /></div>;
  }

  if (!context) return null;

  const visiblePrimary = role ? primaryNav.filter((item) => item.roles.includes(role)) : [];
  const visibleAdmin = role ? adminNav.filter((item) => item.roles.includes(role)) : [];

  return (
    <div className="app-frame" style={theme}>
      <button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Link href={chapter ? "/dashboard" : "/platform"} className="sidebar-brand"><Brand /></Link>
          <button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><Icon name="x" /></button>
        </div>

        {chapter ? (
          <div className="workspace-card">
            <div className="workspace-crest">
              {chapter.branding?.crestUrl || chapter.organization.crestUrl ? <img src={chapter.branding?.crestUrl || chapter.organization.crestUrl || ""} alt="" /> : <span>{(chapter.organization.shortName || chapter.organization.name).slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className="workspace-copy"><strong>{chapter.name}</strong><span>{chapter.university.shortName || chapter.university.name}</span></div>
          </div>
        ) : <div className="platform-label"><span>Biddly</span><strong>Platform admin</strong></div>}

        <nav className="sidebar-nav">
          {visiblePrimary.map((item) => <Link key={item.href} href={item.href} className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span></Link>)}
          {platformAdmin ? <Link href="/platform" className={`nav-link ${isActive(pathname, "/platform") ? "nav-link-active" : ""}`}><Icon name="shield" /><span>Platform</span></Link> : null}
        </nav>

        {visibleAdmin.length ? <div className="sidebar-secondary"><div className="sidebar-section-label">Manage</div>{visibleAdmin.map((item) => <Link key={item.href} href={item.href} className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span></Link>)}</div> : null}

        <div className="sidebar-user">
          <Avatar firstName={context.user.firstName} lastName={context.user.lastName} />
          <div className="sidebar-user-copy"><strong>{context.user.firstName} {context.user.lastName}</strong><span>{role ? role.replaceAll("_", " ").toLowerCase() : "Platform admin"}</span></div>
          <button className="icon-button" onClick={async () => { await logout(); router.replace("/login"); }} aria-label="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>
      {mobileOpen ? <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}
      <main className="app-main"><div className="app-content">{children}</div></main>
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
