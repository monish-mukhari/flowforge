"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "../../../components/Brand";
import { AppIcon } from "../../../components/AppIcon";
import { api, getErrorMessage } from "../../../lib/api";
import type { AppOption } from "../../../lib/types";

type DraftAction = {
  key: number;
  app?: AppOption;
  metadata: Record<string, string>;
};
type Selection = { kind: "trigger" } | { kind: "action"; index: number };

export default function CreateZap() {
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
  const [publishing, setPublishing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      api.get("/api/v1/trigger/available"),
      api.get("/api/v1/action/available"),
    ])
      .then(([triggerResponse, actionResponse]) => {
        setTriggers(triggerResponse.data.availableTriggers);
        setAvailableActions(actionResponse.data.availableActions);
      })
      .catch((caught) => {
        if (caught.response?.status === 401) router.replace("/login");
        else setError(getErrorMessage(caught));
      })
      .finally(() => setLoading(false));
  }, [router]);

  function updateAction(index: number, next: Partial<DraftAction>) {
    setActions((current) =>
      current.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...next } : action,
      ),
    );
  }

  async function publish() {
    const configuredActions = actions.filter((action) => action.app);
    if (!trigger) {
      setError("Choose a trigger before publishing.");
      setSelection({ kind: "trigger" });
      return;
    }
    if (
      configuredActions.length !== actions.length ||
      configuredActions.length === 0
    ) {
      setError("Configure at least one action before publishing.");
      return;
    }
    setError("");
    setPublishing(true);
    try {
      const response = await api.post("/api/v1/zap", {
        availableTriggerId: trigger.id,
        triggerMetadata: {},
        actions: configuredActions.map((action) => ({
          availableActionId: action.app!.id,
          actionMetadata: action.metadata,
        })),
      });
      router.push(`/zap/${response.data.zapId}`);
    } catch (caught) {
      setError(getErrorMessage(caught));
      setPublishing(false);
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
          <div className="text-sm font-bold">Untitled workflow</div>
          <div className="text-[10px] uppercase tracking-wider text-[#8d8580]">
            Draft
          </div>
        </div>
        <button
          onClick={publish}
          disabled={publishing || loading}
          className="rounded-lg bg-[#ff4f00] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#d94100] disabled:opacity-50"
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>
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
          <Line />
          {actions.map((action, index) => (
            <div key={action.key}>
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
                onRemove={
                  actions.length > 1
                    ? () => {
                        setActions((current) =>
                          current.filter((_, i) => i !== index),
                        );
                        setSelection(null);
                      }
                    : undefined
                }
              />
              <Line />
            </div>
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => {
                const index = actions.length;
                setActions((current) => [
                  ...current,
                  { key: Date.now(), metadata: {} },
                ]);
                setSelection({ kind: "action", index });
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#2d2525] bg-white text-2xl font-medium shadow-sm hover:bg-[#2d2525] hover:text-white"
              aria-label="Add action"
            >
              +
            </button>
          </div>
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
                onSelect={setTrigger}
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
}) {
  return (
    <button
      onClick={onClick}
      className={`soft-shadow relative flex w-full items-center gap-4 rounded-2xl border-2 bg-white p-5 text-left transition ${active ? "border-[#503eb6] ring-4 ring-[#e9e5ff]" : "border-[#d8d1ca] hover:border-[#8d8580]"}`}
    >
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

function Line() {
  return <div className="mx-auto h-10 w-0.5 bg-[#a9a19a]" />;
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
