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
  triggerId: string;
  userId: number;
  actions: ZapAction[];
  trigger: {
    id: string;
    zapId: string;
    triggerId: string;
    type: AppOption;
  } | null;
};
