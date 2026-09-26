import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { HttpError } from "./errors";
import { connectorContract } from "./connectors/registry";

export type WorkflowActionInput = {
  availableActionId: string;
  actionMetadata?: Record<string, unknown>;
};

export function validateConnectorConfiguration(actions: WorkflowActionInput[]) {
  const issues = actions.flatMap((action, index) => {
    const schema = connectorContract(action.availableActionId)?.schema;
    if (!schema) return [];
    const parsed = schema.safeParse(action.actionMetadata ?? {});
    return parsed.success
      ? []
      : parsed.error.issues.map((issue) => ({
          actionIndex: index,
          path: issue.path.join("."),
          message: issue.message,
        }));
  });
  if (issues.length)
    throw new HttpError(
      400,
      "INVALID_CONNECTOR_CONFIGURATION",
      "One or more workflow actions are not configured correctly",
      issues,
    );
}

type DefinitionSource = {
  name: string;
  description: string | null;
  trigger: { triggerId: string; metadata: Prisma.JsonValue } | null;
  actions: Array<{
    actionId: string;
    metadata: Prisma.JsonValue;
    sortingOrder: number;
  }>;
};

export function createDefinitionSnapshot(workflow: DefinitionSource) {
  if (!workflow.trigger)
    throw new HttpError(
      400,
      "WORKFLOW_TRIGGER_REQUIRED",
      "Workflow must have a trigger before it can be published",
    );
  return {
    name: workflow.name,
    description: workflow.description,
    trigger: {
      availableTriggerId: workflow.trigger.triggerId,
      triggerMetadata: workflow.trigger.metadata,
    },
    actions: workflow.actions.map((action) => ({
      availableActionId: action.actionId,
      connectorVersion: connectorContract(action.actionId)?.version ?? 1,
      actionMetadata: action.metadata,
      sortingOrder: action.sortingOrder,
    })),
  } satisfies Prisma.InputJsonObject;
}
