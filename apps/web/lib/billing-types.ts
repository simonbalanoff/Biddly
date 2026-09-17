export type BillingTerm = "SEMESTER" | "ACADEMIC_YEAR";
export type BillingStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

export type BillingSubscription = {
  id: string;
  term: BillingTerm;
  status: BillingStatus;
  periodStart: string;
  periodEnd: string;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerStatus: string | null;
  providerPriceId: string | null;
  providerSubscriptionItemId: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEnd: string | null;
  currency: string | null;
  unitAmount: number | null;
  billingInterval: string | null;
  latestInvoiceId: string | null;
  latestInvoiceStatus: string | null;
  livemode: boolean | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingPlan = {
  term: BillingTerm;
  priceId: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  intervalCount: number | null;
  nickname: string | null;
  productId: string | null;
};

export type BillingInvoice = {
  id: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  currency: string;
  createdAt: string;
  dueAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  dashboardUrl: string | null;
  subscriptionId: string | null;
};

export type BillingCustomer = {
  id: string;
  email: string | null;
  name: string | null;
  delinquent: boolean;
  balance: number;
  currency: string | null;
};

export type ChapterBillingState = {
  configured: boolean;
  testMode: boolean;
  stripeError: string | null;
  customerAttached: boolean;
  customer: BillingCustomer | null;
  currentSubscription: BillingSubscription | null;
  subscriptions: BillingSubscription[];
  plans: BillingPlan[];
  invoices: BillingInvoice[];
};

export type PlatformBillingWorkspace = {
  id: string;
  name: string;
  isActive: boolean;
  billingCustomerId: string | null;
  organization: { name: string; shortName?: string | null; isActive: boolean };
  university: { name: string; shortName?: string | null; isActive: boolean };
  subscription: BillingSubscription | null;
};

export type PlatformBillingList = {
  configured: boolean;
  testMode: boolean;
  webhookHealth: {
    failed: number;
    pending: number;
    recent: Array<{ id: string; stripeEventId: string; type: string; livemode: boolean; stripeCreatedAt: string | null; processedAt: string | null; error: string | null; createdAt: string; updatedAt: string }>;
  };
  workspaces: PlatformBillingWorkspace[];
};

export type PlatformBillingDetail = ChapterBillingState & {
  chapter: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    organization: { id: string; name: string; shortName?: string | null; isActive: boolean };
    university: { id: string; name: string; shortName?: string | null; isActive: boolean };
    admins: Array<{ id: string; firstName: string; lastName: string; email: string; isActive: boolean }>;
  };
  dashboard: {
    customer: string | null;
    subscription: string | null;
  };
};
