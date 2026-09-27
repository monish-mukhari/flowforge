"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/DashboardShell";
import { AppIcon } from "../../components/AppIcon";
import { api, getErrorMessage } from "../../lib/api";

type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
type Organization = { id: string; name: string; slug: string; role: Role };
type Member = {
  id: string;
  userId: number;
  role: Role;
  user: { id: number; name: string; email: string };
};
type Overview = {
  role: Role;
  workflows: Array<{
    id: string;
    name: string;
    status: string;
    updatedAt: string;
    user: { name: string; email: string };
    trigger: { type: { id: string; name: string } } | null;
    actions: Array<{ id: string; type: { id: string; name: string } }>;
  }>;
  connections: Array<{
    id: string;
    name: string;
    connectorKey: string;
    status: string;
    externalAccountName: string | null;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: Role;
    expiresAt: string;
  }>;
  approvals: Array<{
    id: string;
    status: string;
    note: string | null;
    createdAt: string;
    zap: { id: string; name: string };
    requestedBy: { name: string; email: string };
  }>;
  events: Array<{
    id: string;
    action: string;
    resourceType: string;
    createdAt: string;
    actor: { name: string; email: string } | null;
  }>;
};
const emptyOverview: Overview = {
  role: "VIEWER",
  workflows: [],
  connections: [],
  invitations: [],
  approvals: [],
  events: [],
};

export default function WorkspacePage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [tab, setTab] = useState<
    "workflows" | "members" | "connections" | "approvals" | "activity"
  >("workflows");
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("EDITOR");
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const canManage = overview.role === "OWNER" || overview.role === "ADMIN";

  async function loadWorkspace(organization: Organization) {
    setError("");
    try {
      const [memberResponse, overviewResponse] = await Promise.all([
        api.get(`/api/v1/organizations/${organization.id}/members`),
        api.get(`/api/v1/organizations/${organization.id}/overview`),
      ]);
      setMembers(memberResponse.data.members);
      setOverview(overviewResponse.data);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  useEffect(() => {
    api
      .get("/api/v1/organizations")
      .then((response) => {
        const items = response.data.organizations as Organization[];
        setOrganizations(items);
        setSelected(items[0] ?? null);
      })
      .catch((caught) => setError(getErrorMessage(caught)));
  }, []);
  useEffect(() => {
    if (selected) void loadWorkspace(selected);
  }, [selected]);

  async function createWorkspace() {
    if (!workspaceName.trim()) return;
    try {
      const response = await api.post("/api/v1/organizations", {
        name: workspaceName,
      });
      const next = {
        ...response.data.organization,
        role: "OWNER",
      } as Organization;
      setOrganizations((current) => [...current, next]);
      setSelected(next);
      setWorkspaceName("");
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  async function invite() {
    if (!selected || !inviteEmail.trim()) return;
    try {
      const response = await api.post(
        `/api/v1/organizations/${selected.id}/invitations`,
        { email: inviteEmail, role: inviteRole },
      );
      setInviteLink(
        `${window.location.origin}/workspace/invite/${String(response.data.token)}`,
      );
      setInviteEmail("");
      await loadWorkspace(selected);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  async function changeRole(member: Member, role: Role) {
    if (!selected) return;
    try {
      await api.patch(
        `/api/v1/organizations/${selected.id}/members/${member.userId}`,
        { role },
      );
      await loadWorkspace(selected);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  async function removeMember(member: Member) {
    if (!selected) return;
    try {
      await api.delete(
        `/api/v1/organizations/${selected.id}/members/${member.userId}`,
      );
      await loadWorkspace(selected);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  async function unshareWorkflow(zapId: string) {
    if (!selected) return;
    try {
      await api.delete(
        `/api/v1/organizations/${selected.id}/workflows/${zapId}`,
      );
      await loadWorkspace(selected);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  async function unshareConnection(connectionId: string) {
    if (!selected) return;
    try {
      await api.delete(
        `/api/v1/organizations/${selected.id}/connections/${connectionId}`,
      );
      await loadWorkspace(selected);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  async function requestApproval(zapId: string) {
    if (!selected) return;
    try {
      await api.post(`/api/v1/organizations/${selected.id}/approvals`, {
        zapId,
      });
      setTab("approvals");
      await loadWorkspace(selected);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }
  async function reviewApproval(id: string, status: "APPROVED" | "REJECTED") {
    if (!selected) return;
    try {
      await api.post(
        `/api/v1/organizations/${selected.id}/approvals/${id}/review`,
        { status },
      );
      await loadWorkspace(selected);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#503eb6]">
          Workspace
        </p>
        <h1 className="mt-1 text-4xl font-black tracking-[-0.045em]">
          People, access and shared assets
        </h1>
        <p className="mt-3 text-[#6d6660]">
          A workflow or connection appears here only after its owner explicitly
          shares it with this workspace.
        </p>
        {error && (
          <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="mt-8 grid gap-5 md:grid-cols-[250px_1fr]">
          <aside className="h-fit rounded-2xl border border-[#e3ded8] bg-white p-3">
            <div className="mb-2 px-3 text-xs font-black uppercase tracking-[0.12em] text-[#8d8580]">
              Your workspaces
            </div>
            {organizations.map((organization) => (
              <button
                key={organization.id}
                onClick={() => setSelected(organization)}
                className={`w-full rounded-xl px-3 py-3 text-left text-sm font-bold ${selected?.id === organization.id ? "bg-[#eee9ff] text-[#503eb6]" : "hover:bg-[#f7f5f2]"}`}
              >
                {organization.name}
                <span className="mt-1 block text-[10px] uppercase tracking-wide opacity-60">
                  {organization.role}
                </span>
              </button>
            ))}
            <div className="mt-4 border-t border-[#eee9e4] pt-4">
              <input
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                className="w-full rounded-lg border border-[#d8d1ca] px-3 py-2 text-sm"
              />
              <button
                onClick={() => void createWorkspace()}
                className="mt-2 w-full rounded-lg bg-[#503eb6] px-3 py-2 text-xs font-bold text-white"
              >
                Create workspace
              </button>
            </div>
          </aside>
          <section className="min-w-0">
            <div className="rounded-2xl border border-[#e3ded8] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">
                    {selected?.name ?? "Select a workspace"}
                  </h2>
                  <p className="mt-1 text-xs text-[#8d8580]">
                    Your access: <strong>{overview.role}</strong>
                  </p>
                </div>
                <div className="flex -space-x-2">
                  {members.slice(0, 5).map((member) => (
                    <span
                      key={member.id}
                      title={`${member.user.name} · ${member.role}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#503eb6] text-xs font-black text-white"
                    >
                      {member.user.name.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
              <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-[#eee9e4]">
                {(
                  [
                    "workflows",
                    "members",
                    "connections",
                    "approvals",
                    "activity",
                  ] as const
                ).map((item) => (
                  <button
                    key={item}
                    onClick={() => setTab(item)}
                    className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold capitalize ${tab === item ? "border-[#503eb6] text-[#503eb6]" : "border-transparent text-[#6d6660]"}`}
                  >
                    {item}
                    {item === "workflows"
                      ? ` (${overview.workflows.length})`
                      : item === "members"
                        ? ` (${members.length})`
                        : ""}
                  </button>
                ))}
              </nav>
              {tab === "workflows" && (
                <div className="mt-5 space-y-3">
                  {overview.workflows.length === 0 ? (
                    <Empty text="No workflows are shared with this workspace yet. Open a workflow and use ‘Share to workspace’." />
                  ) : (
                    overview.workflows.map((workflow) => (
                      <div
                        key={workflow.id}
                        className="flex flex-col justify-between gap-4 rounded-xl border border-[#eee9e4] p-4 sm:flex-row sm:items-center"
                      >
                        <Link
                          href={`/zap/${workflow.id}`}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <AppIcon app={workflow.trigger?.type} />
                          <div className="min-w-0">
                            <div className="truncate font-bold">
                              {workflow.name}
                            </div>
                            <div className="mt-1 text-xs text-[#8d8580]">
                              Owner: {workflow.user.name} · {workflow.status}
                            </div>
                          </div>
                        </Link>
                        <div className="flex gap-2">
                          {overview.role === "EDITOR" && (
                            <button
                              onClick={() => void requestApproval(workflow.id)}
                              className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold"
                            >
                              Request publish approval
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => void unshareWorkflow(workflow.id)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {tab === "members" && (
                <div className="mt-5">
                  <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { role: "OWNER", text: "Full control and ownership" },
                      {
                        role: "ADMIN",
                        text: "Manage people, assets and approvals",
                      },
                      {
                        role: "EDITOR",
                        text: "Edit and run; request publishing",
                      },
                      {
                        role: "VIEWER",
                        text: "View workflows and run history",
                      },
                    ].map((item) => (
                      <div
                        key={item.role}
                        className="rounded-xl bg-[#f7f5f2] p-3"
                      >
                        <div className="text-xs font-black text-[#503eb6]">
                          {item.role}
                        </div>
                        <div className="mt-1 text-xs text-[#6d6660]">
                          {item.text}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-[#eee9e4]">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                      >
                        <div>
                          <div className="font-bold">{member.user.name}</div>
                          <div className="text-xs text-[#8d8580]">
                            {member.user.email}
                          </div>
                        </div>
                        {canManage && member.role !== "OWNER" ? (
                          <div className="flex gap-2">
                            <select
                              value={member.role}
                              onChange={(event) =>
                                void changeRole(
                                  member,
                                  event.target.value as Role,
                                )
                              }
                              className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold"
                            >
                              <option>ADMIN</option>
                              <option>EDITOR</option>
                              <option>VIEWER</option>
                            </select>
                            <button
                              onClick={() => void removeMember(member)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <span className="rounded-full bg-[#f1eeea] px-3 py-1 text-xs font-bold">
                            {member.role}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {canManage && (
                    <div className="mt-5 rounded-xl bg-[#f7f5f2] p-4">
                      <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                        <input
                          value={inviteEmail}
                          onChange={(event) =>
                            setInviteEmail(event.target.value)
                          }
                          type="email"
                          placeholder="teammate@company.com"
                          className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-sm"
                        />
                        <select
                          value={inviteRole}
                          onChange={(event) =>
                            setInviteRole(event.target.value as Role)
                          }
                          className="rounded-lg border border-[#d8d1ca] px-3 py-2 text-xs font-bold"
                        >
                          <option>ADMIN</option>
                          <option>EDITOR</option>
                          <option>VIEWER</option>
                        </select>
                        <button
                          onClick={() => void invite()}
                          className="rounded-lg bg-[#ff4f00] px-4 py-2 text-sm font-bold text-white"
                        >
                          Invite
                        </button>
                      </div>
                      {inviteLink && (
                        <div className="mt-3 rounded-lg border border-[#ccebd8] bg-white p-3">
                          <p className="text-xs font-bold text-[#126b38]">
                            Invitation created
                          </p>
                          <p className="mt-1 break-all font-mono text-[11px]">
                            {inviteLink}
                          </p>
                          <button
                            onClick={() =>
                              void navigator.clipboard.writeText(inviteLink)
                            }
                            className="mt-2 text-xs font-bold text-[#503eb6]"
                          >
                            Copy link
                          </button>
                        </div>
                      )}
                      {overview.invitations.length > 0 && (
                        <div className="mt-4 text-xs text-[#6d6660]">
                          Pending:{" "}
                          {overview.invitations
                            .map((invite) => `${invite.email} (${invite.role})`)
                            .join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {tab === "connections" && (
                <div className="mt-5 space-y-3">
                  {overview.connections.length === 0 ? (
                    <Empty text="No connections are shared. Connection owners can share them from the Connections page." />
                  ) : (
                    overview.connections.map((connection) => (
                      <div
                        key={connection.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#eee9e4] p-4"
                      >
                        <div>
                          <div className="font-bold">{connection.name}</div>
                          <div className="mt-1 text-xs text-[#8d8580]">
                            {connection.connectorKey} ·{" "}
                            {connection.externalAccountName ??
                              "Reusable credentials"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#e3f8eb] px-3 py-1 text-xs font-bold text-[#168047]">
                            {connection.status}
                          </span>
                          {canManage && (
                            <button
                              onClick={() =>
                                void unshareConnection(connection.id)
                              }
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {tab === "approvals" && (
                <div className="mt-5 space-y-3">
                  {overview.approvals.length === 0 ? (
                    <Empty text="No publishing approvals have been requested." />
                  ) : (
                    overview.approvals.map((approval) => (
                      <div
                        key={approval.id}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-[#eee9e4] p-4 sm:flex-row sm:items-center"
                      >
                        <div>
                          <Link
                            href={`/zap/${approval.zap.id}`}
                            className="font-bold hover:text-[#503eb6]"
                          >
                            {approval.zap.name}
                          </Link>
                          <div className="mt-1 text-xs text-[#8d8580]">
                            Requested by {approval.requestedBy.name} ·{" "}
                            {approval.status}
                          </div>
                        </div>
                        {canManage && approval.status === "PENDING" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                void reviewApproval(approval.id, "APPROVED")
                              }
                              className="rounded-lg bg-[#168047] px-3 py-2 text-xs font-bold text-white"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                void reviewApproval(approval.id, "REJECTED")
                              }
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
              {tab === "activity" && (
                <div className="mt-5 divide-y divide-[#eee9e4]">
                  {overview.events.length === 0 ? (
                    <Empty text="Workspace activity will appear here." />
                  ) : (
                    overview.events.map((event) => (
                      <div key={event.id} className="py-3">
                        <div className="text-sm font-bold">
                          {event.action.replaceAll(".", " ")}
                        </div>
                        <div className="mt-1 text-xs text-[#8d8580]">
                          {event.actor?.name ?? "System"} ·{" "}
                          {new Date(event.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </DashboardShell>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8d1ca] p-8 text-center text-sm text-[#6d6660]">
      {text}
    </div>
  );
}
