"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "../../../components/Brand";
import { AppIcon } from "../../../components/AppIcon";
import { api, getErrorMessage } from "../../../lib/api";
import type { AppOption, Zap } from "../../../lib/types";
import { insertItem, reorderItem } from "../../../lib/workflow-order";

type DraftAction = {
  key: number;
  app?: AppOption;
  metadata: Record<string, string>;
};
type Selection = { kind: "trigger" } | { kind: "action"; index: number };

export default function CreateZap() {
  const [name, setName] = useState("Untitled workflow");
  const [triggers, setTriggers] = useState<AppOption[]>([]);
  const [availableActions, setAvailableActions] = useState<AppOption[]>([]);
  const [trigger, setTrigger] = useState<AppOption>();
  const [actions, setActions] = useState<DraftAction[]>([
    { key: 1, metadata: {} },
  ]);
  const [selection, setSelection] = useState<Selection | null>({
    kind: "trigger",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<"draft" | "publish" | null>(
    null,
  );
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "saving" | "saved" | "local" | "error"
  >("idle");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    setEditId(new URLSearchParams(window.location.search).get("edit"));
  }, []);

  useEffect(() => {
    Promise.all([
      api.get("/api/v1/trigger/available"),
      api.get("/api/v1/action/available"),
      editId ? api.get(`/api/v1/zap/${editId}`) : Promise.resolve(null),
    ])
      .then(([triggerResponse, actionResponse, workflowResponse]) => {
        setTriggers(triggerResponse.data.availableTriggers);
        setAvailableActions(actionResponse.data.availableActions);
        const workflow = workflowResponse?.data.zap as Zap | undefined;
        if (workflow) {
          setName(workflow.name);
          setTrigger(workflow.trigger?.type);
          setActions(
            [...workflow.actions]
              .sort((a, b) => a.sortingOrder - b.sortingOrder)
              .map((action, index) => ({
                key: index + 1,
                app: action.type,
                metadata: Object.fromEntries(
                  Object.entries(action.metadata ?? {}).map(([key, value]) => [
                    key,
                    String(value),
                  ]),
                ),
              })),
          );
          setDirty(false);
        } else if (!editId) {
          const saved = window.localStorage.getItem(
            "flowforge:new-workflow-draft",
          );
          if (saved) {
            try {
              const draft = JSON.parse(saved) as {
                name?: string;
                triggerId?: string;
                actions?: {
                  appId?: string;
                  metadata?: Record<string, string>;
                }[];
              };
              if (draft.name) setName(draft.name);
              if (draft.triggerId)
                setTrigger(
                  triggerResponse.data.availableTriggers.find(
                    (item: AppOption) => item.id === draft.triggerId,
                  ),
                );
              if (draft.actions?.length)
                setActions(
                  draft.actions.map((action, index) => ({
                    key: Date.now() + index,
                    app: actionResponse.data.availableActions.find(
                      (item: AppOption) => item.id === action.appId,
                    ),
                    metadata: action.metadata ?? {},
                  })),
                );
              setAutosaveState("local");
            } catch {
              window.localStorage.removeItem("flowforge:new-workflow-draft");
            }
          }
        }
      })
      .catch((caught) => {
        if (caught.response?.status === 401) router.replace("/login");
        else setError(getErrorMessage(caught));
      })
      .finally(() => setLoading(false));
  }, [editId, router]);

  const validationErrors = useMemo(
    () => validateDraft(name, trigger, actions),
    [actions, name, trigger],
  );

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    if (loading || !dirty) return;
    const timer = window.setTimeout(() => {
      const localDraft = {
        name,
        triggerId: trigger?.id,
        actions: actions.map((action) => ({
          appId: action.app?.id,
          metadata: action.metadata,
        })),
      };
      window.localStorage.setItem(
        editId
          ? `flowforge:workflow-draft:${editId}`
          : "flowforge:new-workflow-draft",
        JSON.stringify(localDraft),
      );
      if (!editId || validationErrors.length) {
        setAutosaveState("local");
        return;
      }
      setAutosaveState("saving");
      void api
        .patch(`/api/v1/zap/${editId}`, buildPayload(name, trigger!, actions))
        .then(() => {
          setDirty(false);
          setAutosaveState("saved");
          window.localStorage.removeItem(`flowforge:workflow-draft:${editId}`);
        })
        .catch(() => setAutosaveState("error"));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [actions, dirty, editId, loading, name, trigger, validationErrors.length]);

  function updateAction(index: number, next: Partial<DraftAction>) {
    setDirty(true);
    setActions((current) =>
      current.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...next } : action,
      ),
    );
  }

  function insertAction(index: number) {
    setActions((current) => {
      return insertItem(current, index, { key: Date.now(), metadata: {} });
    });
    setSelection({ kind: "action", index });
    setDirty(true);
  }

  function moveDraftAction(from: number, to: number) {
    if (from === to || to < 0 || to >= actions.length) return;
    setActions((current) => {
      return reorderItem(current, from, to);
    });
    setSelection({ kind: "action", index: to });
    setDirty(true);
  }

  async function save(mode: "draft" | "publish") {
    if (validationErrors.length) {
      setError(validationErrors.join(" "));
      if (!trigger) setSelection({ kind: "trigger" });
      else {
        const invalidIndex = actions.findIndex(
          (action) => validateAction(action).length > 0,
        );
        if (invalidIndex >= 0)
          setSelection({ kind: "action", index: invalidIndex });
      }
      return;
    }
    if (!trigger) {
      setError("Choose a trigger.");
      setSelection({ kind: "trigger" });
      return;
    }
    setError("");
    setSavingMode(mode);
    try {
      const payload = buildPayload(name, trigger, actions);
      const response = editId
        ? await api.patch(`/api/v1/zap/${editId}`, payload)
        : await api.post("/api/v1/zap", payload);
      const workflowId = editId ?? response.data.zapId;
      if (mode === "publish")
        await api.post(`/api/v1/zap/${workflowId}/publish`);
      setDirty(false);
      window.localStorage.removeItem("flowforge:new-workflow-draft");
      window.localStorage.removeItem(`flowforge:workflow-draft:${workflowId}`);
      router.push(`/zap/${workflowId}`);
    } catch (caught) {
      setError(getErrorMessage(caught));
      setSavingMode(null);
    }
  }

  const selectedAction =
    selection?.kind === "action" ? actions[selection.index] : undefined;

  return (
    <main className="min-h-screen bg-[#f7f5f2]">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-[#d8d1ca] bg-white px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Brand compact />
          <span className="hidden h-6 w-px bg-[#d8d1ca] sm:block" />
          <button
            onClick={() => router.push("/dashboard")}
            className="hidden text-sm font-semibold text-[#6d6660] hover:text-black sm:block"
          >
            ← Back to workflows
          </button>
        </div>
        <div className="absolute left-1/2 hidden -translate-x-1/2 text-center md:block">
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setDirty(true);
            }}
            maxLength={120}
            aria-label="Workflow name"
            className="w-64 rounded-md border border-transparent bg-transparent px-2 text-center text-sm font-bold outline-none hover:border-[#d8d1ca] focus:border-[#503eb6]"
          />
          <div className="text-[10px] uppercase tracking-wider text-[#8d8580]">
            {autosaveState === "saving"
              ? "Saving…"
              : autosaveState === "saved"
                ? "All changes saved"
                : autosaveState === "local"
                  ? "Saved locally"
                  : autosaveState === "error"
                    ? "Autosave failed"
                    : dirty
                      ? "Unsaved changes"
                      : "Draft"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => save("draft")}
            disabled={savingMode !== null || loading}
            className="rounded-lg border border-[#bdb5ae] bg-white px-4 py-2.5 text-sm font-bold hover:bg-[#f7f5f2] disabled:opacity-50"
          >
            {savingMode === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button
            onClick={() => save("publish")}
            disabled={savingMode !== null || loading}
            className="rounded-lg bg-[#ff4f00] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#d94100] disabled:opacity-50"
          >
            {savingMode === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      <section
        className={`grid-canvas min-h-screen px-4 pb-24 pt-28 transition-all ${selection ? "lg:pr-[430px]" : ""}`}
      >
        <div className="mx-auto w-full max-w-xl">
          <div className="mb-8 text-center">
            <span className="rounded-full border border-[#d8d1ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#6d6660]">
              Click a step to configure it
            </span>
          </div>
          <StepCard
            number={1}
            label="Trigger"
            title={trigger?.name || "Choose a trigger"}
            description={
              trigger
                ? "Starts when your webhook receives data"
                : "Select the event that starts this workflow"
            }
            app={trigger}
            active={selection?.kind === "trigger"}
            complete={!!trigger}
            onClick={() => setSelection({ kind: "trigger" })}
          />
          <InsertLine onInsert={() => insertAction(0)} />
          {actions.map((action, index) => (
            <div
              key={action.key}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedIndex !== null) moveDraftAction(draggedIndex, index);
                setDraggedIndex(null);
              }}
              className={
                draggedIndex !== null && draggedIndex !== index
                  ? "rounded-2xl outline outline-2 outline-offset-4 outline-transparent hover:outline-[#8f7cff]"
                  : ""
              }
            >
              <StepCard
                number={index + 2}
                label="Action"
                title={action.app?.name || "Choose an action"}
                description={
                  action.app
                    ? actionDescription(action.app.id, action.metadata)
                    : "Select what should happen next"
                }
                app={action.app}
                active={
                  selection?.kind === "action" && selection.index === index
                }
                complete={!!action.app}
                onClick={() => setSelection({ kind: "action", index })}
                draggable
                onDragStart={(event) => {
                  setDraggedIndex(index);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                }}
                onDragEnd={() => setDraggedIndex(null)}
                onMove={(direction) =>
                  moveDraftAction(index, index + direction)
                }
                onRemove={
                  actions.length > 1
                    ? () => {
                        setActions((current) =>
                          current.filter((_, i) => i !== index),
                        );
                        setSelection(null);
                        setDirty(true);
                      }
                    : undefined
                }
              />
              <InsertLine onInsert={() => insertAction(index + 1)} />
            </div>
          ))}
          {error && (
            <div className="mx-auto mt-8 max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-medium text-red-700">
              {error}
            </div>
          )}
        </div>
      </section>

      {selection && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full overflow-y-auto border-l border-[#d8d1ca] bg-white pt-16 shadow-2xl sm:w-[420px]">
          <div className="flex items-center justify-between border-b border-[#e3ded8] px-6 py-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#8d8580]">
                {selection.kind === "trigger"
                  ? "Trigger"
                  : `Action ${selection.index + 1}`}
              </div>
              <h2 className="mt-1 text-xl font-black">
                {selection.kind === "trigger"
                  ? trigger?.name || "Choose an app"
                  : selectedAction?.app?.name || "Choose an app"}
              </h2>
            </div>
            <button
              onClick={() => setSelection(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1eeea]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="p-6">
            {loading && (
              <div className="h-36 animate-pulse rounded-xl bg-[#f1eeea]" />
            )}
            {!loading && selection.kind === "trigger" && (
              <Chooser
                items={triggers}
                selectedId={trigger?.id}
                onSelect={(app) => {
                  setTrigger(app);
                  setDirty(true);
                }}
                title="Trigger event"
              />
            )}
            {!loading &&
              selection.kind === "action" &&
              !selectedAction?.app && (
                <Chooser
                  items={availableActions}
                  onSelect={(app) =>
                    updateAction(selection.index, { app, metadata: {} })
                  }
                  title="Available actions"
                />
              )}
            {!loading && selection.kind === "action" && selectedAction?.app && (
              <ActionConfiguration
                action={selectedAction}
                onChange={(metadata) =>
                  updateAction(selection.index, { metadata })
                }
                onChangeApp={() =>
                  updateAction(selection.index, {
                    app: undefined,
                    metadata: {},
                  })
                }
              />
            )}
          </div>
        </aside>
      )}
    </main>
  );
}

function StepCard({
  number,
  label,
  title,
  description,
  app,
  active,
  complete,
  onClick,
  onRemove,
  draggable = false,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  number: number;
  label: string;
  title: string;
  description: string;
  app?: AppOption;
  active: boolean;
  complete: boolean;
  onClick: () => void;
  onRemove?: () => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onMove?: (direction: -1 | 1) => void;
}) {
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (!onMove || !event.altKey) return;
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove(-1);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove(1);
        }
      }}
      className={`soft-shadow relative flex w-full items-center gap-4 rounded-2xl border-2 bg-white p-5 text-left transition ${active ? "border-[#503eb6] ring-4 ring-[#e9e5ff]" : "border-[#d8d1ca] hover:border-[#8d8580]"}`}
      aria-keyshortcuts={draggable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
    >
      {draggable && (
        <span
          className="cursor-grab select-none text-xl leading-none text-[#8d8580] active:cursor-grabbing"
          title="Drag to reorder. You can also press Alt + Up or Alt + Down."
          aria-hidden="true"
        >
          ⠿
        </span>
      )}
      <AppIcon app={app} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8d8580]">
          {number}. {label}
        </div>
        <div className="mt-1 truncate text-lg font-bold">{title}</div>
        <div className="mt-1 truncate text-sm text-[#6d6660]">
          {description}
        </div>
      </div>
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${complete ? "bg-[#dff7e8] text-[#126b38]" : "bg-[#fff0e8] text-[#d94100]"}`}
      >
        {complete ? "✓" : "!"}
      </span>
      {onRemove && (
        <span
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border border-[#d8d1ca] bg-white text-sm text-[#8d8580] hover:text-red-600"
        >
          ×
        </span>
      )}
    </button>
  );
}

function InsertLine({ onInsert }: { onInsert: () => void }) {
  return (
    <div className="group relative mx-auto flex h-12 w-full items-center justify-center">
      <div className="absolute h-full w-0.5 bg-[#a9a19a]" />
      <button
        type="button"
        onClick={onInsert}
        className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[#8d8580] bg-white text-lg leading-none text-[#6d6660] opacity-0 shadow-sm transition hover:border-[#503eb6] hover:text-[#503eb6] focus:opacity-100 group-hover:opacity-100"
        aria-label="Insert an action here"
      >
        +
      </button>
    </div>
  );
}

function Chooser({
  items,
  selectedId,
  onSelect,
  title,
}: {
  items: AppOption[];
  selectedId?: string;
  onSelect: (app: AppOption) => void;
  title: string;
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-bold">{title}</p>
      <div className="space-y-3">
        {items.map((app) => (
          <button
            key={app.id}
            onClick={() => onSelect(app)}
            className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left hover:bg-[#f7f5f2] ${selectedId === app.id ? "border-[#503eb6] bg-[#f7f5ff] ring-2 ring-[#ebe8ff]" : "border-[#d8d1ca]"}`}
          >
            <AppIcon app={app} />
            <div>
              <div className="font-bold">{app.name}</div>
              <div className="mt-0.5 text-xs text-[#7d756f]">
                {app.id === "webhook"
                  ? "Catch a POST request"
                  : app.id === "email"
                    ? "Send an email"
                    : "Transfer SOL"}
              </div>
            </div>
            {selectedId === app.id && (
              <span className="ml-auto text-[#503eb6]">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionConfiguration({
  action,
  onChange,
  onChangeApp,
}: {
  action: DraftAction;
  onChange: (metadata: Record<string, string>) => void;
  onChangeApp: () => void;
}) {
  const metadata = action.metadata;
  return (
    <div>
      <div className="mb-6 flex items-center gap-3 rounded-xl bg-[#f7f5f2] p-3">
        <AppIcon app={action.app} />
        <div className="font-bold">{action.app?.name}</div>
        <button
          onClick={onChangeApp}
          className="ml-auto text-xs font-bold text-[#503eb6] hover:underline"
        >
          Change
        </button>
      </div>
      <div className="rounded-xl border border-[#e3ded8] p-4">
        <h3 className="font-bold">Configure action</h3>
        <p className="mt-1 text-xs leading-5 text-[#7d756f]">
          Use values like{" "}
          <code className="rounded bg-[#f1eeea] px-1">
            {"{customer.email}"}
          </code>{" "}
          to insert data from the webhook payload.
        </p>
        {action.app?.id === "email" && (
          <div className="mt-5 space-y-4">
            <Field
              label="To"
              value={metadata.email || ""}
              placeholder="{customer.email}"
              onChange={(value) => onChange({ ...metadata, email: value })}
            />
            <TextArea
              label="Message"
              value={metadata.body || ""}
              placeholder="Hi {customer.name}, your payment was received."
              onChange={(value) => onChange({ ...metadata, body: value })}
            />
          </div>
        )}
        {action.app?.id === "solana" && (
          <div className="mt-5 space-y-4">
            <Field
              label="Wallet address"
              value={metadata.address || ""}
              placeholder="{wallet.address}"
              onChange={(value) => onChange({ ...metadata, address: value })}
            />
            <Field
              label="Amount in SOL"
              value={metadata.amount || ""}
              placeholder="{payment.amount}"
              onChange={(value) => onChange({ ...metadata, amount: value })}
            />
          </div>
        )}
      </div>
      <div className="mt-5 rounded-xl bg-[#eef8f2] p-4 text-sm text-[#25613d]">
        <strong>✓ Saved in this draft</strong>
        <p className="mt-1 text-xs leading-5">
          Your configuration will be stored when you publish the workflow.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#cfc8c1] px-3 py-2.5 text-sm outline-none focus:border-[#503eb6] focus:ring-2 focus:ring-[#ebe8ff]"
      />
    </label>
  );
}
function TextArea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold">{label}</span>
      <textarea
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg border border-[#cfc8c1] px-3 py-2.5 text-sm outline-none focus:border-[#503eb6] focus:ring-2 focus:ring-[#ebe8ff]"
      />
    </label>
  );
}
function actionDescription(id: string, metadata: Record<string, string>) {
  if (id === "email")
    return metadata.email
      ? `Send to ${metadata.email}`
      : "Configure recipient and message";
  if (id === "solana")
    return metadata.amount
      ? `Transfer ${metadata.amount} SOL`
      : "Configure wallet and amount";
  return "Configured action";
}

function buildPayload(
  name: string,
  trigger: AppOption,
  actions: DraftAction[],
) {
  return {
    name: name.trim(),
    availableTriggerId: trigger.id,
    triggerMetadata: {},
    actions: actions.map((action) => ({
      availableActionId: action.app!.id,
      actionMetadata: action.metadata,
    })),
  };
}

function validateAction(action: DraftAction) {
  if (!action.app) return ["Choose an app for every action."];
  if (action.app.id === "email") {
    const errors: string[] = [];
    const recipient = action.metadata.email?.trim() ?? "";
    if (!recipient) errors.push("Email actions require a recipient.");
    else if (
      !recipient.includes("{") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
    )
      errors.push("Enter a valid email recipient or payload template.");
    if (!action.metadata.body?.trim())
      errors.push("Email actions require a message.");
    return errors;
  }
  if (action.app.id === "solana") {
    const errors: string[] = [];
    const address = action.metadata.address?.trim() ?? "";
    const amount = action.metadata.amount?.trim() ?? "";
    if (!address) errors.push("Solana actions require a wallet address.");
    if (!amount) errors.push("Solana actions require an amount.");
    else if (!amount.includes("{") && !(Number(amount) > 0))
      errors.push("Solana amount must be positive or use a payload template.");
    return errors;
  }
  return [];
}

function validateDraft(
  name: string,
  trigger: AppOption | undefined,
  actions: DraftAction[],
) {
  const errors: string[] = [];
  if (!name.trim()) errors.push("Give the workflow a name.");
  if (!trigger) errors.push("Choose a trigger.");
  if (!actions.length) errors.push("Add at least one action.");
  actions.forEach((action) => errors.push(...validateAction(action)));
  return [...new Set(errors)];
}
