"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../../components/app-shell";
import { Icon } from "../../../components/icons";
import { Badge, Button, EmptyState, Input, Select, Spinner } from "../../../components/ui";
import { apiRequest } from "../../../lib/api";
import type { PlatformBillingList } from "../../../lib/billing-types";
import { useAuth } from "../../../providers/auth-provider";
import styles from "./billing.module.css";

export default function PlatformBillingPage() {
  const { context } = useAuth();
  const [data, setData] = useState<PlatformBillingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("NAME");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<PlatformBillingList>("/platform/billing"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (context?.user.platformRole === "PLATFORM_ADMIN") void load();
  }, [context?.user.platformRole]);

  const workspaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (data?.workspaces ?? []).filter((workspace) => {
      const billingStatus = workspace.subscription?.status ?? "NO_SUBSCRIPTION";
      const matchesStatus = status === "ALL" || status === billingStatus || (status === "ACTION" && ["PAST_DUE", "CANCELED", "EXPIRED", "NO_SUBSCRIPTION"].includes(billingStatus));
      const haystack = `${workspace.name} ${workspace.organization.name} ${workspace.organization.shortName || ""} ${workspace.university.name} ${workspace.university.shortName || ""} ${workspace.billingCustomerId || ""}`.toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
    return filtered.sort((a, b) => {
      if (sort === "STATUS") return billingRank(a.subscription?.status) - billingRank(b.subscription?.status) || a.name.localeCompare(b.name);
      if (sort === "RENEWAL") return new Date(a.subscription?.periodEnd || 0).getTime() - new Date(b.subscription?.periodEnd || 0).getTime();
      return a.name.localeCompare(b.name);
    });
  }, [data, search, sort, status]);

  if (context?.user.platformRole !== "PLATFORM_ADMIN") return <AppShell><div className="panel panel-spacious"><EmptyState icon="shield" title="Platform access required" copy="This page is only available to Biddly platform administrators." /></div></AppShell>;

  return <AppShell>
    <PageHeader eyebrow="Biddly admin" title="Billing" description="Stripe-backed subscriptions, renewal state, and customer billing across every workspace." actions={<Button variant="secondary" icon="activity" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</Button>} />
    {data?.testMode ? <div className="form-alert page-alert">Stripe is connected in test mode. Billing actions on this page affect Stripe test data only.</div> : null}
    {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}
    {!data?.configured && !loading ? <section className="panel panel-spacious"><EmptyState icon="billing" title="Stripe is not configured" copy="Add the Stripe secret, webhook secret, and Biddly price IDs before managing subscriptions here." /></section> : null}
    {loading && !data ? <div className="detail-loading"><Spinner /><span>Loading billing…</span></div> : data?.configured ? <>
      <section className={styles.overview}><div className={styles.overviewIcon}><Icon name="billing" size={21} /></div><div><span>Stripe Billing</span><strong>Subscription operations</strong><p>Biddly mirrors Stripe state but does not manually edit subscription records.</p></div><Badge tone="success">Connected</Badge></section>
      {data.webhookHealth.failed ? <div className="form-alert form-alert-error page-alert">{data.webhookHealth.failed} recent Stripe webhook {data.webhookHealth.failed === 1 ? "event has" : "events have"} not processed successfully. Stripe will retry failed deliveries; use workspace Sync Stripe actions to reconcile immediately.</div> : null}
      <section className="panel">
        <div className={styles.toolbar}>
          <label className={styles.search}><Icon name="search" size={16} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspace, organization, university, or Stripe customer" /></label>
          <Select compact value={status} onChange={setStatus} options={[{ value: "ALL", label: "All billing states" }, { value: "ACTIVE", label: "Active" }, { value: "TRIAL", label: "Trial" }, { value: "PAST_DUE", label: "Past due" }, { value: "ACTION", label: "Needs attention" }, { value: "NO_SUBSCRIPTION", label: "No subscription" }]} />
          <Select compact value={sort} onChange={setSort} options={[{ value: "NAME", label: "Sort: workspace" }, { value: "STATUS", label: "Sort: billing state" }, { value: "RENEWAL", label: "Sort: renewal" }]} />
        </div>
        {workspaces.length ? <div className={styles.list}>{workspaces.map((workspace) => <Link href={`/platform/billing/${workspace.id}`} className={styles.row} key={workspace.id}>
          <div className={styles.workspace}><strong>{workspace.name}</strong><span>{workspace.organization.shortName || workspace.organization.name} · {workspace.university.shortName || workspace.university.name}</span></div>
          <div className={styles.plan}>{workspace.subscription ? <><strong>{termLabel(workspace.subscription.term)}</strong><span>{formatMoney(workspace.subscription.unitAmount, workspace.subscription.currency)}{workspace.subscription.billingInterval ? ` / ${workspace.subscription.billingInterval}` : ""}</span></> : <><strong>No Stripe plan</strong><span>{workspace.billingCustomerId ? "Customer attached" : "No customer"}</span></>}</div>
          <div className={styles.status}><Badge tone={statusTone(workspace.subscription?.status)}>{workspace.subscription ? pretty(workspace.subscription.status) : "Not subscribed"}</Badge>{workspace.subscription ? <span>{workspace.subscription.cancelAtPeriodEnd ? `Ends ${formatDate(workspace.subscription.periodEnd)}` : `Renews ${formatDate(workspace.subscription.periodEnd)}`}</span> : null}</div>
          <Icon name="chevron" size={16} />
        </Link>)}</div> : <div className={styles.empty}><EmptyState icon="billing" title="No matching workspaces" copy="Try a different billing filter or search." /></div>}
      </section>
    </> : null}
  </AppShell>;
}

function billingRank(status?: string) {
  if (status === "PAST_DUE") return 0;
  if (!status || status === "EXPIRED" || status === "CANCELED") return 1;
  if (status === "TRIAL") return 2;
  return 3;
}

function statusTone(status?: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "ACTIVE" || status === "TRIAL") return "success";
  if (status === "PAST_DUE") return "danger";
  if (status === "CANCELED" || status === "EXPIRED") return "warning";
  return "neutral";
}
function termLabel(term: string) { return term === "ACADEMIC_YEAR" ? "Academic year" : "Semester"; }
function pretty(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function formatMoney(amount: number | null, currency: string | null) { if (amount === null) return "Price unavailable"; try { return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "usd").toUpperCase() }).format(amount / 100); } catch { return `${(amount / 100).toFixed(2)} ${(currency || "USD").toUpperCase()}`; } }
