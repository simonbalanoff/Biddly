"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../../components/app-shell";
import { Icon } from "../../../components/icons";
import { Badge, Button, EmptyState, Input, Select, Spinner } from "../../../components/ui";
import { apiRequest } from "../../../lib/api";
import { useAuth } from "../../../providers/auth-provider";
import styles from "./system.module.css";

type SystemState = {
  status: "ok" | "degraded";
  environment: string;
  database: string;
  services: { storage: boolean; email: boolean; stripe: boolean; errorReporting: boolean };
  process: { node: string; uptimeSeconds: number; rssBytes: number; heapUsedBytes: number };
  traffic: { requests: number; errors: number; status4xx: number; status5xx: number; averageDurationMs: number; uptimeSeconds: number };
};

type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
  createdAt: string;
  actor: { firstName: string; lastName: string; email: string };
};

export default function PlatformSystemPage() {
  const { context } = useAuth();
  const [system, setSystem] = useState<SystemState | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("ALL");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [systemData, auditData] = await Promise.all([
        apiRequest<SystemState>("/platform/system"),
        apiRequest<AuditEntry[]>("/platform/audit")
      ]);
      setSystem(systemData);
      setAudit(auditData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load system status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (context?.user.platformRole === "PLATFORM_ADMIN") void load();
  }, [context?.user.platformRole]);

  const actions = useMemo(() => [...new Set(audit.map((item) => item.action))].sort().map((value) => ({ value, label: pretty(value) })), [audit]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return audit.filter((item) => (action === "ALL" || item.action === action) && (!q || `${item.action} ${item.targetType} ${item.targetId || ""} ${item.actor.firstName} ${item.actor.lastName} ${item.actor.email}`.toLowerCase().includes(q)));
  }, [action, audit, search]);

  if (context?.user.platformRole !== "PLATFORM_ADMIN") {
    return <AppShell><div className="panel panel-spacious"><EmptyState icon="shield" title="Platform access required" copy="This page is only available to Biddly platform administrators." /></div></AppShell>;
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Biddly admin" title="System" description="Production readiness, service connections, and platform-level administrative history." actions={<Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>} />
      {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}
      {loading && !system ? <div className="detail-loading"><Spinner /><span>Checking Biddly…</span></div> : null}
      {system ? <>
        <section className={styles.healthCard}>
          <div className={styles.healthIcon}><Icon name={system.status === "ok" ? "check" : "activity"} size={20} /></div>
          <div><span>Current system state</span><h2>{system.status === "ok" ? "Biddly is operational" : "Biddly is degraded"}</h2><p>Database {system.database === "ok" ? "connected" : "unavailable"} · {system.environment} environment · API up {formatDuration(system.process.uptimeSeconds)}</p></div>
          <Badge tone={system.status === "ok" ? "success" : "danger"}>{system.status === "ok" ? "Healthy" : "Degraded"}</Badge>
        </section>

        <section className={styles.serviceGrid}>
          <Service title="Database" enabled={system.database === "ok"} detail={system.database === "ok" ? "Connected" : "Unavailable"} />
          <Service title="Object storage" enabled={system.services.storage} detail={system.services.storage ? "Configured" : "Not configured"} />
          <Service title="Transactional email" enabled={system.services.email} detail={system.services.email ? "Resend configured" : "Development fallback only"} />
          <Service title="Billing" enabled={system.services.stripe} detail={system.services.stripe ? "Stripe configured" : "Manual billing only"} />
          <Service title="Error reporting" enabled={system.services.errorReporting} detail={system.services.errorReporting ? "Webhook configured" : "Server logs only"} />
        </section>

        <section className={`panel ${styles.runtimePanel}`}>
          <div className={styles.sectionHeader}><div><span className="section-kicker">Runtime</span><h2>API process</h2><p>Lightweight in-process indicators since the current API process started.</p></div></div>
          <div className={styles.runtimeRows}>
            <Runtime label="Requests" value={system.traffic.requests.toLocaleString()} />
            <Runtime label="Average response" value={`${system.traffic.averageDurationMs} ms`} />
            <Runtime label="4xx responses" value={system.traffic.status4xx.toLocaleString()} />
            <Runtime label="5xx responses" value={system.traffic.status5xx.toLocaleString()} attention={system.traffic.status5xx > 0} />
            <Runtime label="Memory" value={`${formatBytes(system.process.heapUsedBytes)} heap`} />
            <Runtime label="Node" value={system.process.node} />
          </div>
        </section>
      </> : null}

      <section className={`panel ${styles.auditPanel}`}>
        <div className={styles.sectionHeader}><div><span className="section-kicker">Platform audit</span><h2>Administrative changes</h2><p>Recent platform-level operations such as suspension, storage cleanup, billing support, and access changes.</p></div></div>
        <div className={styles.toolbar}><label className={styles.searchBox}><Icon name="search" size={16} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actor, action, or target" /></label><Select compact searchable value={action} onChange={setAction} options={[{ value: "ALL", label: "All actions" }, ...actions]} /></div>
        {filtered.length ? <div className={styles.auditList}>{filtered.map((item) => <div className={styles.auditRow} key={item.id}><div className={styles.auditIcon}><Icon name="activity" size={15} /></div><div><strong>{pretty(item.action)}</strong><span>{item.actor.firstName} {item.actor.lastName} · {pretty(item.targetType)}{item.targetId ? ` · ${shortId(item.targetId)}` : ""}</span></div><time title={new Date(item.createdAt).toLocaleString()}>{relative(item.createdAt)}</time></div>)}</div> : <div className={styles.empty}><EmptyState icon="activity" title="No matching administrative activity" copy="Try a different search or action filter." /></div>}
      </section>
    </AppShell>
  );
}

function Service({ title, enabled, detail }: { title: string; enabled: boolean; detail: string }) {
  return <div className={styles.service}><StatusDot enabled={enabled} /><div><strong>{title}</strong><span>{detail}</span></div></div>;
}

function StatusDot({ enabled }: { enabled: boolean }) {
  return <span className={`${styles.dot} ${enabled ? styles.dotActive : styles.dotInactive}`} />;
}

function Runtime({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return <div className={styles.runtime}><span>{label}</span><strong className={attention ? styles.attention : undefined}>{value}</strong></div>;
}

function pretty(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value;
}

function relative(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(value).toLocaleDateString();
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
