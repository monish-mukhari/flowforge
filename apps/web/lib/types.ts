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
