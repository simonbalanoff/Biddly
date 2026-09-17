export type Role = "MEMBER" | "MODERATOR" | "CHAPTER_ADMIN";
export type PlatformRole = "USER" | "PLATFORM_ADMIN";
export type CycleStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

export type Organization = {
  id: string;
  name: string;
  shortName?: string | null;
  slug?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  crestUrl?: string | null;
  isActive?: boolean;
};

export type University = {
  id: string;
  name: string;
  shortName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  isActive?: boolean;
};

export type ChapterBranding = {
  id?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  crestUrl?: string | null;
};

export type ChapterSettings = {
  id?: string;
  commentsEnabled: boolean;
  repliesEnabled: boolean;
  reactionsEnabled: boolean;
  scoreMin: number;
  scoreMax: number;
  scoreStep: number;
};

export type RecruitmentCycleSummary = {
  id: string;
  name: string;
  status: CycleStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MeContext = {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    platformRole: PlatformRole;
  };
  membership: {
    id: string;
    role: Role;
  } | null;
  chapter: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    organization: Organization;
    university: University;
    branding: ChapterBranding | null;
    settings: ChapterSettings | null;
    activeRecruitmentCycle: RecruitmentCycleSummary | null;
    subscription?: unknown;
  } | null;
  chapterAccess: {
    active: boolean;
    reason: "CHAPTER_SUSPENDED" | "ORGANIZATION_SUSPENDED" | "UNIVERSITY_SUSPENDED" | null;
  } | null;
  subscriptionAccess: {
    active: boolean;
    mode: "FULL" | "READ_ONLY" | "LOCKED";
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "NONE";
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export type CandidateStatus = {
  id: string;
  recruitmentCycleId?: string;
  name: string;
  position: number;
  color?: string | null;
  isTerminal: boolean;
  _count?: {
    candidates: number;
    historyTo: number;
  };
};

export type CandidateField = {
  id: string;
  recruitmentCycleId?: string;
  key: string;
  label: string;
  type: "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "EMAIL" | "PHONE" | "DATE" | "YEAR" | "SELECT" | "MULTI_SELECT" | "BOOLEAN";
  required: boolean;
  visibleOnPublicForm: boolean;
  position: number;
  options?: { choices?: string[] } | null;
  validation?: Record<string, unknown> | null;
};

export type PublicFormConfig = {
  id: string;
  recruitmentCycleId: string;
  slug: string;
  isOpen: boolean;
  title?: string | null;
  introText?: string | null;
  confirmationMessage?: string | null;
  emailMode: "HIDDEN" | "OPTIONAL" | "REQUIRED";
  phoneMode: "HIDDEN" | "OPTIONAL" | "REQUIRED";
  photoMode: "HIDDEN" | "OPTIONAL" | "REQUIRED";
  recruitmentCycle?: {
    fieldDefinitions: CandidateField[];
  };
};

export type RecruitmentCycle = RecruitmentCycleSummary & {
  statuses: CandidateStatus[];
  fieldDefinitions: CandidateField[];
  publicForm: PublicFormConfig | null;
  _count: {
    candidates: number;
    evaluations: number;
    comments: number;
  };
};

export type CandidateAggregate = {
  averageScore: number;
  evaluationCount: number;
};

export type Candidate = {
  id: string;
  chapterId: string;
  recruitmentCycleId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  source: "MANUAL" | "PUBLIC_FORM" | "IMPORT";
  statusId: string;
  statusPosition: number;
  status: CandidateStatus;
  aggregate?: CandidateAggregate | null;
  myEvaluation?: { id?: string; score: number; updatedAt: string } | null;
  hasPhoto?: boolean;
  photoUrl?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customValues?: Array<{
    id: string;
    value: unknown;
    field: CandidateField;
  }>;
  statusHistory?: Array<{
    id: string;
    createdAt: string;
    fromStatus?: { id: string; name: string } | null;
    toStatus: { id: string; name: string } | null;
    changedBy: { id: string; firstName: string; lastName: string };
  }>;
  _count?: { comments: number };
};

export type CandidateList = {
  items: Candidate[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ChapterMember = {
  id: string;
  role: Role;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
    createdAt: string;
  };
};

export type ChapterInvite = {
  id: string;
  email?: string | null;
  label?: string | null;
  role: Role;
  expiresAt?: string | null;
  maxUses?: number | null;
  useCount: number;
  revokedAt?: string | null;
  acceptedAt?: string | null;
  createdAt: string;
  inviteUrl?: string | null;
};

export type CommentReaction = {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string };
};

export type CandidateComment = {
  id: string;
  candidateId: string;
  userId: string;
  parentId?: string | null;
  body: string;
  state: "VISIBLE" | "HIDDEN" | "REMOVED";
  createdAt: string;
  updatedAt: string;
  user: { id: string; firstName: string; lastName: string };
  authorScore: number | null;
  reactions: CommentReaction[];
  replies: CandidateComment[];
};

export type CatalogItem = {
  id: string;
  name: string;
  shortName?: string | null;
  city?: string | null;
  state?: string | null;
};

export type PublicForm = {
  slug: string;
  isOpen: boolean;
  title?: string | null;
  introText?: string | null;
  organization: { name: string; shortName?: string | null };
  chapter: { name: string; universityName: string; universityShortName?: string | null };
  branding: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    logoUrl?: string | null;
    crestUrl?: string | null;
  };
  coreFields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  customFields: Array<{
    key: string;
    label: string;
    type: CandidateField["type"];
    required: boolean;
    options?: { choices?: string[] } | null;
    validation?: Record<string, unknown> | null;
  }>;
};
