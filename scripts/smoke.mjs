const apiUrl = process.env.BACKEND_URL || "http://localhost:3002";
const hooksUrl = process.env.HOOKS_URL || "http://localhost:3001/hooks/catch";
const mailpitUrl = process.env.MAILPIT_URL || "http://localhost:8025";
const workerUrl = process.env.WORKER_URL || "http://localhost:3003";
const sweeperUrl = process.env.SWEEPER_URL || "http://localhost:3004";
const hooksOrigin = new URL(hooksUrl).origin;
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

async function mailWithSubject(subject, address = email) {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok) return undefined;
  const data = await response.json();
  const summary = data.messages?.find(
    (message) =>
      message.Subject === subject &&
      message.To?.some((recipient) => recipient.Address === address),
  );
  if (!summary) return undefined;
  const detail = await fetch(`${mailpitUrl}/api/v1/message/${summary.ID}`);
  return detail.ok ? detail.json() : undefined;
}

function sessionCookies(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return ["flowforge_access", "flowforge_refresh"]
    .map((name) => setCookie.match(new RegExp(`${name}=([^;]+)`)))
    .filter(Boolean)
    .map((match) => `${match[0].split(";")[0]}`)
    .join("; ");
}

await waitFor(
  async () => (await fetch(`${apiUrl}/ready`).catch(() => undefined))?.ok,
  "primary API readiness",
);
await waitFor(
  async () => (await fetch(`${hooksOrigin}/ready`).catch(() => undefined))?.ok,
  "hooks API readiness",
);
await waitFor(
  async () => (await fetch(`${workerUrl}/ready`).catch(() => undefined))?.ok,
  "worker readiness endpoint",
);
await waitFor(
  async () => (await fetch(`${sweeperUrl}/ready`).catch(() => undefined))?.ok,
  "sweeper readiness endpoint",
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
const cookies = sessionCookies(login.response);
if (!cookies.includes("flowforge_access"))
  throw new Error("Login did not issue secure session cookies");

const connectionCatalog = await request(
  `${apiUrl}/api/v1/connections/catalog`,
  {
    headers: { cookie: cookies },
  },
);
for (const connector of ["email", "http", "slack", "google-sheets"]) {
  if (
    !connectionCatalog.body.connectors.some(
      (item) => item.id === connector && item.version === 1,
    )
  )
    throw new Error(`Versioned connector catalog is missing ${connector}`);
}
const smtpConnection = await request(`${apiUrl}/api/v1/connections`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({
    connectorKey: "email",
    name: "Smoke Mailpit",
    credentials: {
      host: "mailpit",
      port: 1025,
      secure: false,
      from: "smoke@flowforge.local",
    },
  }),
});
if ("encryptedCredentials" in smtpConnection.body.connection)
  throw new Error("Connection API exposed encrypted credential material");
await request(
  `${apiUrl}/api/v1/connections/${smtpConnection.body.connection.id}/test`,
  { method: "POST", headers: { cookie: cookies } },
);

const created = await request(`${apiUrl}/api/v1/zap`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({
    availableTriggerId: "webhook",
    actions: [
      {
        availableActionId: "email",
        actionMetadata: {
          connectionId: smtpConnection.body.connection.id,
          email,
          body: "Smoke run {event.id}",
        },
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
const acceptedWebhook = await request(webhook, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
  },
  body: JSON.stringify({
    event: { id: "passed" },
    password: "must-not-reach-the-browser",
    nested: { apiKey: "also-sensitive" },
  }),
});
const duplicateWebhook = await request(webhook, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
  },
  body: JSON.stringify({
    event: { id: "passed" },
    password: "must-not-reach-the-browser",
    nested: { apiKey: "also-sensitive" },
  }),
});
if (!duplicateWebhook.body.duplicate)
  throw new Error("Repeated webhook was not reported as duplicate");
await waitFor(
  () => mailWithSubject("FlowForge workflow notification"),
  "workflow delivery",
  90_000,
);
const completedRun = await waitFor(async () => {
  const history = await request(`${apiUrl}/api/v1/zap/${workflow.id}/runs`, {
    headers: { cookie: cookies },
  });
  return history.body.runs.find(
    (run) =>
      run.id === acceptedWebhook.body.runId && run.status === "SUCCEEDED",
  );
}, "durable successful run history");
if (
  completedRun.steps.length !== 1 ||
  completedRun.steps[0].status !== "SUCCEEDED" ||
  completedRun.steps[0].attempts.length !== 1
)
  throw new Error(
    "Successful run did not persist its step and attempt records",
  );
if (
  completedRun.metadata.password !== "[REDACTED]" ||
  completedRun.metadata.nested?.apiKey !== "[REDACTED]"
)
  throw new Error("Run history returned an unredacted sensitive value");

const failing = await request(`${apiUrl}/api/v1/zap`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({
    name: "Reliable execution smoke failure",
    availableTriggerId: "webhook",
    actions: [
      {
        availableActionId: "email",
        actionMetadata: {
          email: "{event.missing}",
          body: "This action should retry safely",
        },
      },
    ],
  }),
});
await request(`${apiUrl}/api/v1/zap/${failing.body.zapId}/publish`, {
  method: "POST",
  headers: { cookie: cookies },
});
const failingWorkflow = (
  await request(`${apiUrl}/api/v1/zap/${failing.body.zapId}`, {
    headers: { cookie: cookies },
  })
).body.zap;
const failedAccepted = await request(
  `${hooksUrl}/${failingWorkflow.id}/${failingWorkflow.webhookToken}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: {} }),
  },
);
const deadLetterRun = await waitFor(
  async () => {
    const history = await request(
      `${apiUrl}/api/v1/zap/${failingWorkflow.id}/runs`,
      { headers: { cookie: cookies } },
    );
    return history.body.runs.find(
      (run) =>
        run.id === failedAccepted.body.runId && run.status === "DEAD_LETTER",
    );
  },
  "retry exhaustion and dead-letter state",
  90_000,
);
if (
  deadLetterRun.steps[0]?.attemptCount !== 3 ||
  deadLetterRun.steps[0]?.attempts.length !== 3
)
  throw new Error("Dead-letter run did not persist all retry attempts");
const failureNotification = await waitFor(async () => {
  const response = await request(
    `${apiUrl}/api/v1/zap/notifications?unreadOnly=true`,
    { headers: { cookie: cookies } },
  );
  return response.body.notifications.find(
    (notification) => notification.zapRun.id === deadLetterRun.id,
  );
}, "persistent dead-letter notification");
const metrics = (
  await request(`${apiUrl}/api/v1/zap/runs/metrics`, {
    headers: { cookie: cookies },
  })
).body.metrics;
if (
  metrics.successful < 1 ||
  metrics.failed < 1 ||
  metrics.unreadNotifications < 1
)
  throw new Error("Operational run metrics did not include the smoke runs");
await request(
  `${apiUrl}/api/v1/zap/notifications/${failureNotification.id}/read`,
  { method: "POST", headers: { cookie: cookies } },
);
const notificationState = await request(
  `${apiUrl}/api/v1/zap/notifications?unreadOnly=true`,
  { headers: { cookie: cookies } },
);
if (
  notificationState.body.notifications.some(
    (notification) => notification.id === failureNotification.id,
  )
)
  throw new Error("Failure notification was not marked as read");
const replay = await request(
  `${apiUrl}/api/v1/zap/${failingWorkflow.id}/runs/${deadLetterRun.id}/replay`,
  { method: "POST", headers: { cookie: cookies } },
);
if (replay.body.run.replayOfId !== deadLetterRun.id)
  throw new Error("Run replay did not preserve replay lineage");
await request(`${apiUrl}/api/v1/zap/${workflow.id}/pause`, {
  method: "POST",
  headers: { cookie: cookies },
});
await request(`${apiUrl}/api/v1/zap/${workflow.id}/resume`, {
  method: "POST",
  headers: { cookie: cookies },
});

const organizations = await request(`${apiUrl}/api/v1/organizations`, {
  headers: { cookie: cookies },
});
const workspace = organizations.body.organizations.find(
  (item) => item.role === "OWNER",
);
if (!workspace)
  throw new Error("New account did not receive a personal workspace");
await request(`${apiUrl}/api/v1/zap/${workflow.id}/share`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({ organizationId: workspace.id }),
});
await request(
  `${apiUrl}/api/v1/connections/${smtpConnection.body.connection.id}/share`,
  {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies },
    body: JSON.stringify({ organizationId: workspace.id }),
  },
);
const editorEmail = `editor-${Date.now()}@example.com`;
const invitation = await request(
  `${apiUrl}/api/v1/organizations/${workspace.id}/invitations`,
  {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies },
    body: JSON.stringify({ email: editorEmail, role: "EDITOR" }),
  },
);
await request(`${apiUrl}/api/v1/user/signup`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Workspace Editor",
    username: editorEmail,
    password,
  }),
});
const editorVerificationMail = await waitFor(
  () => mailWithSubject("Verify your FlowForge account", editorEmail),
  "editor verification email",
);
const editorVerificationToken = editorVerificationMail.Text.match(
  /verificationToken=([^\s]+)/,
)?.[1];
if (!editorVerificationToken)
  throw new Error("Editor verification token was not present in the email");
await request(`${apiUrl}/api/v1/user/verify-email`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: decodeURIComponent(editorVerificationToken) }),
});
const editorLogin = await request(`${apiUrl}/api/v1/user/signin`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: editorEmail, password }),
});
const editorCookies = sessionCookies(editorLogin.response);
await request(
  `${apiUrl}/api/v1/organizations/invitations/${invitation.body.token}/accept`,
  { method: "POST", headers: { cookie: editorCookies } },
);
const editorWorkflows = await request(`${apiUrl}/api/v1/zap`, {
  headers: { cookie: editorCookies },
});
const sharedWorkflow = editorWorkflows.body.zaps.find(
  (item) => item.id === workflow.id,
);
if (!sharedWorkflow || sharedWorkflow.accessRole !== "EDITOR")
  throw new Error("Invited editor could not see the shared workflow");
if (sharedWorkflow.webhookSecret)
  throw new Error("Shared workflow exposed its signing secret to an editor");
const editorConnections = await request(`${apiUrl}/api/v1/connections`, {
  headers: { cookie: editorCookies },
});
if (
  !editorConnections.body.connections.some(
    (item) =>
      item.id === smtpConnection.body.connection.id && item.owned === false,
  )
)
  throw new Error("Invited editor could not see the shared connection");
const forbiddenDelete = await fetch(`${apiUrl}/api/v1/zap/${workflow.id}`, {
  method: "DELETE",
  headers: { cookie: editorCookies },
});
if (forbiddenDelete.status !== 403)
  throw new Error("Editor was allowed to delete a shared workflow");
const approval = await request(
  `${apiUrl}/api/v1/organizations/${workspace.id}/approvals`,
  {
    method: "POST",
    headers: { "content-type": "application/json", cookie: editorCookies },
    body: JSON.stringify({ zapId: workflow.id }),
  },
);
await request(
  `${apiUrl}/api/v1/organizations/${workspace.id}/approvals/${approval.body.approval.id}/review`,
  {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies },
    body: JSON.stringify({ status: "APPROVED" }),
  },
);
await request(`${apiUrl}/api/v1/zap/${workflow.id}/publish`, {
  method: "POST",
  headers: { cookie: editorCookies },
});
await request(`${apiUrl}/api/v1/user/logout`, {
  method: "POST",
  headers: { cookie: editorCookies },
});
await request(`${apiUrl}/api/v1/user/logout`, {
  method: "POST",
  headers: { cookie: cookies },
});
console.log(`Production and workspace smoke test passed for ${workflow.id}`);
