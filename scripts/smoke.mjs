const apiUrl = process.env.BACKEND_URL || "http://localhost:3002";
const hooksUrl = process.env.HOOKS_URL || "http://localhost:3001/hooks/catch";
const mailpitUrl = process.env.MAILPIT_URL || "http://localhost:8025";
const email = `smoke-${Date.now()}@example.com`;
const password = "smoke-test-password";

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok)
    throw new Error(
      `${options.method || "GET"} ${url} failed (${response.status}): ${text}`,
    );
  return { response, body };
}

async function waitFor(getValue, description, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await getValue();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function mailWithSubject(subject) {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok) return undefined;
  const data = await response.json();
  const summary = data.messages?.find(
    (message) =>
      message.Subject === subject &&
      message.To?.some((recipient) => recipient.Address === email),
  );
  if (!summary) return undefined;
  const detail = await fetch(`${mailpitUrl}/api/v1/message/${summary.ID}`);
  return detail.ok ? detail.json() : undefined;
}

await waitFor(
  async () => (await fetch(`${apiUrl}/health`).catch(() => undefined))?.ok,
  "primary API",
);
await request(`${apiUrl}/api/v1/user/signup`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Test", username: email, password }),
});
const verificationMail = await waitFor(
  () => mailWithSubject("Verify your FlowForge account"),
  "verification email",
);
const verificationToken = verificationMail.Text.match(
  /verificationToken=([^\s]+)/,
)?.[1];
if (!verificationToken)
  throw new Error("Verification token was not present in the email");
await request(`${apiUrl}/api/v1/user/verify-email`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: decodeURIComponent(verificationToken) }),
});

const login = await request(`${apiUrl}/api/v1/user/signin`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: email, password }),
});
const setCookie = login.response.headers.get("set-cookie") || "";
const cookies = ["flowforge_access", "flowforge_refresh"]
  .map((name) => setCookie.match(new RegExp(`${name}=([^;]+)`)))
  .filter(Boolean)
  .map((match) => `${match[0].split(";")[0]}`)
  .join("; ");
if (!cookies.includes("flowforge_access"))
  throw new Error("Login did not issue secure session cookies");

const created = await request(`${apiUrl}/api/v1/zap`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({
    availableTriggerId: "webhook",
    actions: [
      {
        availableActionId: "email",
        actionMetadata: { email, body: "Smoke run {event.id}" },
      },
    ],
  }),
});
await request(`${apiUrl}/api/v1/zap/${created.body.zapId}/publish`, {
  method: "POST",
  headers: { cookie: cookies },
});
const workflow = (
  await request(`${apiUrl}/api/v1/zap/${created.body.zapId}`, {
    headers: { cookie: cookies },
  })
).body.zap;
const webhook = `${hooksUrl}/${workflow.id}/${workflow.webhookToken}`;
const idempotencyKey = `smoke-${Date.now()}`;
await request(webhook, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
  },
  body: JSON.stringify({ event: { id: "passed" } }),
});
const duplicateWebhook = await request(webhook, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
  },
  body: JSON.stringify({ event: { id: "passed" } }),
});
if (!duplicateWebhook.body.duplicate)
  throw new Error("Repeated webhook was not reported as duplicate");
await waitFor(
  () => mailWithSubject("FlowForge workflow notification"),
  "workflow delivery",
  90_000,
);
await request(`${apiUrl}/api/v1/zap/${workflow.id}/pause`, {
  method: "POST",
  headers: { cookie: cookies },
});
await request(`${apiUrl}/api/v1/zap/${workflow.id}/resume`, {
  method: "POST",
  headers: { cookie: cookies },
});
await request(`${apiUrl}/api/v1/user/logout`, {
  method: "POST",
  headers: { cookie: cookies },
});
console.log(`Phase 0 smoke test passed for ${workflow.id}`);
