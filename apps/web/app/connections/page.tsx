"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "../../components/DashboardShell";
import { AppIcon } from "../../components/AppIcon";
import { api, getErrorMessage } from "../../lib/api";
import type { AppConnection, AppOption } from "../../lib/types";

function ConnectionsPageContent() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<AppConnection[]>([]);
  const [catalog, setCatalog] = useState<AppOption[]>([]);
  const [mode, setMode] = useState<"email" | "http" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState<
    Array<{ id: string; name: string; role: string }>
  >([]);
  const [shareTarget, setShareTarget] = useState<Record<string, string>>({});

  async function load() {
    const [saved, definitions, workspaceResponse] = await Promise.all([
      api.get("/api/v1/connections"),
      api.get("/api/v1/connections/catalog"),
      api.get("/api/v1/organizations"),
    ]);
    setConnections(saved.data.connections);
    setCatalog(definitions.data.connectors);
    setOrganizations(workspaceResponse.data.organizations);
  }

  useEffect(() => {
    void load().catch((caught) => setError(getErrorMessage(caught)));
  }, []);

  async function connectOAuth(provider: "slack" | "google-sheets") {
    setBusy(provider);
    setError("");
    try {
      const response = await api.post(
        `/api/v1/connections/oauth/${provider}/start`,
      );
      window.location.assign(response.data.authorizationUrl);
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy("");
    }
  }

  async function createManual() {
    if (!mode) return;
    setBusy("create");
    setError("");
    try {
      const credentials =
        mode === "email"
          ? {
              host: form.host,
              port: Number(form.port || 587),
              secure: form.secure === "true",
              username: form.username || undefined,
              password: form.password || undefined,
              from: form.from,
            }
          : {
              authType: form.authType || "NONE",
              token: form.token || undefined,
              headerName: form.headerName || undefined,
              apiKey: form.apiKey || undefined,
              username: form.username || undefined,
              password: form.password || undefined,
            };
      await api.post("/api/v1/connections", {
        connectorKey: mode,
        name: form.name,
        credentials,
      });
      setMode(null);
      setForm({});
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function test(id: string) {
    setBusy(id);
    setError("");
    try {
      await api.post(`/api/v1/connections/${id}/test`);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      await load();
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (
      !window.confirm(
        "Remove this connection? Workflows using it will need another connection.",
      )
    )
      return;
    setBusy(id);
    try {
      await api.delete(`/api/v1/connections/${id}`);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function share(id: string) {
    const organizationId = shareTarget[id];
    if (!organizationId) return;
    setBusy(id);
    try {
      await api.post(`/api/v1/connections/${id}/share`, { organizationId });
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  const oauthResult = searchParams.get("connected");
  const oauthError = searchParams.get("error");
  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff4f00]">
          Connector platform
        </p>
        <h1 className="mt-1 text-4xl font-black tracking-[-0.045em]">
          Connections
        </h1>
        <p className="mt-2 text-[#6d6660]">
          Connect once, test securely, and reuse credentials across workflows.
          Secrets are encrypted and never returned to the browser.
        </p>
        {oauthResult && (
          <Notice tone="success">{oauthResult} connected successfully.</Notice>
        )}
        {(error || oauthError) && (
          <Notice tone="error">
            {error || `Connection failed: ${oauthError}`}
          </Notice>
        )}

        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {catalog
            .filter((item) =>
              ["email", "http", "slack", "google-sheets"].includes(item.id),
            )
            .map((connector) => (
              <div
                key={connector.id}
                className="rounded-2xl border border-[#e3ded8] bg-white p-5"
              >
                <AppIcon app={connector} size="lg" />
                <h2 className="mt-3 font-black">
                  {connector.name}{" "}
                  <span className="text-xs text-[#8d8580]">
                    v{connector.version}
                  </span>
                </h2>
                <p className="mt-1 min-h-10 text-xs text-[#6d6660]">
                  {connector.description}
                </p>
                <button
                  type="button"
                  disabled={busy === connector.id}
                  onClick={() =>
                    connector.oauthProvider
                      ? void connectOAuth(
                          connector.id as "slack" | "google-sheets",
                        )
                      : setMode(connector.id as "email" | "http")
                  }
                  className="mt-4 w-full rounded-lg bg-[#2d2525] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {connector.oauthProvider
                    ? `Connect ${connector.name}`
                    : `Add ${connector.name}`}
                </button>
              </div>
            ))}
        </section>

        {mode && (
          <ManualConnection
            mode={mode}
            form={form}
            setForm={setForm}
            close={() => setMode(null)}
            save={createManual}
            busy={busy === "create"}
          />
        )}

        <section className="mt-8">
          <h2 className="text-xl font-black">Saved connections</h2>
          {connections.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-[#d8d1ca] p-10 text-center text-sm text-[#6d6660]">
              No connections yet.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {connections.map((connection) => (
                <article
                  key={connection.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e3ded8] bg-white p-5"
                >
                  <AppIcon
                    app={{
                      id: connection.connectorKey,
                      name: connection.connectorKey,
                    }}
                  />
                  <div>
                    <strong>{connection.name}</strong>
                    <p className="text-xs text-[#6d6660]">
                      {connection.connectorKey} ·{" "}
                      {connection.externalAccountName || "manual credentials"}
                    </p>
                    {connection.lastError && (
                      <p className="text-xs text-red-700">
                        {connection.lastError}
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-auto rounded-full px-2 py-1 text-[10px] font-black ${connection.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                  >
                    {connection.status}
                  </span>
                  {!connection.owned && (
                    <span className="rounded-full bg-[#eee9ff] px-2 py-1 text-[10px] font-black text-[#503eb6]">
                      Shared by {connection.organization?.name ?? "workspace"}
                    </span>
                  )}
                  {connection.owned &&
                    organizations.some(
                      (organization) =>
                        organization.role === "OWNER" ||
                        organization.role === "ADMIN",
                    ) && (
                      <div className="flex items-center gap-1 rounded-lg border border-[#d8d1ca] px-2 py-1">
                        <select
                          value={
                            shareTarget[connection.id] ??
                            connection.organizationId ??
                            ""
                          }
                          onChange={(event) =>
                            setShareTarget((current) => ({
                              ...current,
                              [connection.id]: event.target.value,
                            }))
                          }
                          className="max-w-32 bg-transparent text-xs font-bold outline-none"
                        >
                          <option value="">Share…</option>
                          {organizations
                            .filter(
                              (organization) =>
                                organization.role === "OWNER" ||
                                organization.role === "ADMIN",
                            )
                            .map((organization) => (
                              <option
                                key={organization.id}
                                value={organization.id}
                              >
                                {organization.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => void share(connection.id)}
                          disabled={
                            busy === connection.id ||
                            !shareTarget[connection.id]
                          }
                          className="rounded bg-[#503eb6] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                        >
                          Share
                        </button>
                      </div>
                    )}
                  {connection.owned && (
                    <>
                      <button
                        disabled={busy === connection.id}
                        onClick={() => test(connection.id)}
                        className="rounded-lg border px-3 py-2 text-xs font-bold"
                      >
                        Test
                      </button>
                      <button
                        disabled={busy === connection.id}
                        onClick={() => remove(connection.id)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </DashboardShell>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f5f2]" />}>
      <ConnectionsPageContent />
    </Suspense>
  );
}

function ManualConnection({
  mode,
  form,
  setForm,
  close,
  save,
  busy,
}: {
  mode: "email" | "http";
  form: Record<string, string>;
  setForm: (value: Record<string, string>) => void;
  close: () => void;
  save: () => void;
  busy: boolean;
}) {
  const set = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <section className="mt-6 rounded-2xl border border-[#d8d1ca] bg-white p-6">
      <div className="flex justify-between">
        <h2 className="text-xl font-black">
          New {mode === "email" ? "SMTP" : "HTTP auth"} connection
        </h2>
        <button onClick={close}>Close</button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Input
          label="Connection name"
          value={form.name || ""}
          onChange={(value) => set("name", value)}
        />
        {mode === "email" ? (
          <>
            <Input
              label="SMTP host"
              value={form.host || ""}
              onChange={(value) => set("host", value)}
            />
            <Input
              label="Port"
              value={form.port || "1025"}
              onChange={(value) => set("port", value)}
            />
            <Input
              label="From email"
              value={form.from || ""}
              onChange={(value) => set("from", value)}
            />
            <Input
              label="Username (optional)"
              value={form.username || ""}
              onChange={(value) => set("username", value)}
            />
            <Input
              label="Password (optional)"
              type="password"
              value={form.password || ""}
              onChange={(value) => set("password", value)}
            />
          </>
        ) : (
          <HttpCredentials form={form} set={set} />
        )}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-5 rounded-lg bg-[#ff4f00] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        Save encrypted connection
      </button>
    </section>
  );
}

function HttpCredentials({
  form,
  set,
}: {
  form: Record<string, string>;
  set: (key: string, value: string) => void;
}) {
  const auth = form.authType || "NONE";
  return (
    <>
      <label className="text-xs font-bold">
        Authentication
        <select
          value={auth}
          onChange={(event) => set("authType", event.target.value)}
          className="mt-2 block w-full rounded-lg border p-2.5 text-sm"
        >
          <option>NONE</option>
          <option>BEARER</option>
          <option>API_KEY</option>
          <option>BASIC</option>
        </select>
      </label>
      {auth === "BEARER" && (
        <Input
          label="Bearer token"
          type="password"
          value={form.token || ""}
          onChange={(value) => set("token", value)}
        />
      )}
      {auth === "API_KEY" && (
        <>
          <Input
            label="Header name"
            value={form.headerName || "X-API-Key"}
            onChange={(value) => set("headerName", value)}
          />
          <Input
            label="API key"
            type="password"
            value={form.apiKey || ""}
            onChange={(value) => set("apiKey", value)}
          />
        </>
      )}
      {auth === "BASIC" && (
        <>
          <Input
            label="Username"
            value={form.username || ""}
            onChange={(value) => set("username", value)}
          />
          <Input
            label="Password"
            type="password"
            value={form.password || ""}
            onChange={(value) => set("password", value)}
          />
        </>
      )}
    </>
  );
}
function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs font-bold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-lg border border-[#cfc8c1] px-3 py-2.5 text-sm"
      />
    </label>
  );
}
function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "error";
}) {
  return (
    <div
      className={`mt-5 rounded-xl border p-4 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
    >
      {children}
    </div>
  );
}
