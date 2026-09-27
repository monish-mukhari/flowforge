export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  accent: string;
  trigger: string;
  triggerMetadata?: Record<string, string>;
  actions: Array<{ id: string; metadata: Record<string, string> }>;
};

export const starterTemplates: StarterTemplate[] = [
  { id: "lead-email", name: "New lead notification", description: "Receive an email whenever a webhook receives a new lead.", accent: "from-[#fff0e8] to-[#ffe1d2]", trigger: "webhook", actions: [{ id: "email", metadata: { email: "team@example.com", subject: "New lead received", body: "A new lead was received: {email}" } }] },
  { id: "scheduled-health", name: "Scheduled health check", description: "Call an HTTPS health endpoint on a recurring schedule.", accent: "from-[#e0f7f4] to-[#c5eee9]", trigger: "schedule", triggerMetadata: { intervalSeconds: "3600" }, actions: [{ id: "http", metadata: { method: "GET", url: "https://example.com/health" } }] },
  { id: "polling-alert", name: "Polling change alert", description: "Watch an API for changes and send the result by email.", accent: "from-[#e9efff] to-[#d9e3ff]", trigger: "polling", triggerMetadata: { intervalSeconds: "300", method: "GET", url: "https://example.com/feed" }, actions: [{ id: "email", metadata: { email: "team@example.com", subject: "API changed", body: "Latest response: {poll.body}" } }] },
];
