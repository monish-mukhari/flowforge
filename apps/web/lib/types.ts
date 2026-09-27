export type AppOption = {
  id: string;
  name: string;
  image: string;
  key?: string;
  version?: number;
  description?: string;
  authType?: "NONE" | "OPTIONAL_CONNECTION" | "OAUTH2";
  oauthProvider?: string;
  fields?: Array<{
    key: string;
    label: string;
    type: "text" | "textarea" | "select" | "connection";
    placeholder?: string;
    required?: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
};

export type AppConnection = {
  id: string;
  connectorKey: string;
  name: string;
  status: string;
  externalAccountId: string | null;
  externalAccountName: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  organizationId?: string | null;
  organization?: { id: string; name: string } | null;
  owned?: boolean;
};

export type ZapAction = {
  id: string;
  zapId: string;
  actionId: string;
  sortingOrder: number;
  metadata?: Record<string, unknown>;
  type: AppOption;
};

export type Zap = {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
  publishedVersion: number | null;
  publishedAt: string | null;
  pausedAt: string | null;
  archivedAt: string | null;
  requireSignature: boolean;
  webhookSecret: string;
  createdAt: string;
  updatedAt: string;
  triggerId: string;
  userId: number;
  webhookToken: string;
  actions: ZapAction[];
  trigger: {
    id: string;
    zapId: string;
    triggerId: string;
    metadata?: Record<string, unknown>;
    type: AppOption;
  } | null;
  _count?: { versions: number };
  organizationId?: string | null;
  accessRole?: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  organization?: { id: string; name: string } | null;
};

export type RunAttempt = {
  id: string;
  attemptNumber: number;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  workerId: string;
  errorCode: string | null;
  errorMessage: string | null;
  output: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
};

export type RunStep = {
  id: string;
  sortingOrder: number;
  actionType: string;
  connectorVersion: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status:
    | "PENDING"
    | "RUNNING"
    | "RETRY_SCHEDULED"
    | "SUCCEEDED"
    | "FAILED"
    | "DEAD_LETTER";
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  attempts: RunAttempt[];
};

export type WorkflowRun = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "DEAD_LETTER";
  metadata: Record<string, unknown>;
  lastError: string | null;
  replayOfId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  workflowVersion: { version: number } | null;
  steps: RunStep[];
  zap?: { id: string; name: string };
};

export type RunMetrics = {
  total: number;
  successful: number;
  failed: number;
  active: number;
  successRate: number | null;
  averageDurationMs: number | null;
  p95DurationMs: number | null;
  retryingSteps: number;
  unreadNotifications: number;
};

export type RunNotification = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  zap: { id: string; name: string };
  zapRun: { id: string; status: WorkflowRun["status"]; createdAt: string };
};
