export type AppOption = {
  id: string;
  name: string;
  image: string;
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
};
