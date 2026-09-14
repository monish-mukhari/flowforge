import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@repo/db/client";
import { asyncRoute, HttpError } from "../errors";
import { authMiddleware } from "../middleware";
import {
  ZapCreateSchema,
  ZapIdSchema,
  ZapListQuerySchema,
  ZapReorderSchema,
  ZapUpdateSchema,
} from "../types";
import {
  createDefinitionSnapshot,
  validateConnectorConfiguration,
  type WorkflowActionInput,
} from "../workflow-definition";

const router = Router();
const workflowInclude = {
  actions: { include: { type: true }, orderBy: { sortingOrder: "asc" } },
  trigger: { include: { type: true } },
  _count: { select: { versions: true } },
} satisfies Prisma.ZapInclude;

async function ensureAvailableConnectors(
  triggerId: string,
  actions: WorkflowActionInput[],
) {
  const [trigger, availableActions] = await Promise.all([
    prisma.availableTrigger.findUnique({
      where: { id: triggerId },
      select: { id: true },
    }),
    prisma.availableAction.findMany({
      where: { id: { in: actions.map((action) => action.availableActionId) } },
      select: { id: true },
    }),
  ]);
  const requestedActionIds = new Set(
    actions.map((action) => action.availableActionId),
  );
  if (!trigger || availableActions.length !== requestedActionIds.size)
    throw new HttpError(
      400,
      "UNKNOWN_CONNECTOR",
      "Workflow contains an unavailable trigger or action",
    );
  validateConnectorConfiguration(actions);
}

async function findOwnedWorkflow(userId: number, zapId: string) {
  const workflow = await prisma.zap.findFirst({
    where: { id: zapId, userId },
    include: workflowInclude,
  });
  if (!workflow)
    throw new HttpError(404, "WORKFLOW_NOT_FOUND", "Workflow not found");
  return workflow;
}

router.post(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const input = ZapCreateSchema.parse(req.body);
    await ensureAvailableConnectors(input.availableTriggerId, input.actions);
    const workflow = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const zap = await tx.zap.create({
          data: {
            userId,
            name: input.name,
            description: input.description,
            triggerId: "",
            webhookSecret: randomBytes(32).toString("base64url"),
            actions: {
              create: input.actions.map((action, sortingOrder) => ({
                actionId: action.availableActionId,
                sortingOrder,
                metadata: (action.actionMetadata ??
                  {}) as Prisma.InputJsonValue,
              })),
            },
          },
        });
        const trigger = await tx.trigger.create({
          data: {
            zapId: zap.id,
            triggerId: input.availableTriggerId,
            metadata: (input.triggerMetadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        return tx.zap.update({
          where: { id: zap.id },
          data: { triggerId: trigger.id },
          include: workflowInclude,
        });
      },
    );
    return res.status(201).json({ zapId: workflow.id, zap: workflow });
  }),
);

router.get(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const query = ZapListQuerySchema.parse(req.query);
    const where: Prisma.ZapWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              {
                description: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };
    const [zaps, total] = await Promise.all([
      prisma.zap.findMany({
        where,
        include: workflowInclude,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.zap.count({ where }),
    ]);
    return res.json({
      zaps,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  }),
);

router.patch(
  "/:zapId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const input = ZapUpdateSchema.parse(req.body);
    const current = await findOwnedWorkflow(userId, zapId);
    if (current.status === "ARCHIVED")
      throw new HttpError(
        409,
        "WORKFLOW_ARCHIVED",
        "Archived workflows cannot be edited",
      );
    const triggerId = input.availableTriggerId ?? current.trigger?.triggerId;
    if (!triggerId)
      throw new HttpError(
        400,
        "WORKFLOW_TRIGGER_REQUIRED",
        "Workflow must have a trigger",
      );
    const actions =
      input.actions ??
      current.actions.map((action) => ({
        availableActionId: action.actionId,
        actionMetadata: action.metadata as Record<string, unknown>,
      }));
    await ensureAvailableConnectors(triggerId, actions);
    const workflow = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        if (input.availableTriggerId || input.triggerMetadata) {
          await tx.trigger.update({
            where: { zapId },
            data: {
              ...(input.availableTriggerId
                ? { triggerId: input.availableTriggerId }
                : {}),
              ...(input.triggerMetadata
                ? {
                    metadata: input.triggerMetadata as Prisma.InputJsonValue,
                  }
                : {}),
            },
          });
        }
        if (input.actions) {
          await tx.action.deleteMany({ where: { zapId } });
          await tx.action.createMany({
            data: input.actions.map((action, sortingOrder) => ({
              zapId,
              actionId: action.availableActionId,
              sortingOrder,
              metadata: (action.actionMetadata ?? {}) as Prisma.InputJsonValue,
            })),
          });
        }
        return tx.zap.update({
          where: { id: zapId },
          data: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.requireSignature !== undefined
              ? { requireSignature: input.requireSignature }
              : {}),
          },
          include: workflowInclude,
        });
      },
    );
    return res.json({ zap: workflow });
  }),
);

router.post(
  "/:zapId/publish",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const workflow = await findOwnedWorkflow(userId, zapId);
    if (workflow.status === "ARCHIVED")
      throw new HttpError(
        409,
        "WORKFLOW_ARCHIVED",
        "Archived workflows cannot be published",
      );
    validateConnectorConfiguration(
      workflow.actions.map((action) => ({
        availableActionId: action.actionId,
        actionMetadata: action.metadata as Record<string, unknown>,
      })),
    );
    const definition = createDefinitionSnapshot(workflow);
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const latest = await tx.workflowVersion.aggregate({
          where: { zapId },
          _max: { version: true },
        });
        const version = (latest._max.version ?? 0) + 1;
        const published = await tx.workflowVersion.create({
          data: { zapId, version, definition },
        });
        const zap = await tx.zap.update({
          where: { id: zapId },
          data: {
            status: "PUBLISHED",
            publishedVersion: version,
            publishedAt: published.publishedAt,
            pausedAt: null,
          },
          include: workflowInclude,
        });
        return { zap, version: published };
      },
      { isolationLevel: "Serializable" },
    );
    return res.status(201).json(result);
  }),
);

router.post(
  "/:zapId/pause",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const workflow = await findOwnedWorkflow(userId, zapId);
    if (workflow.status !== "PUBLISHED")
      throw new HttpError(
        409,
        "INVALID_WORKFLOW_STATE",
        "Only published workflows can be paused",
      );
    const zap = await prisma.zap.update({
      where: { id: zapId },
      data: { status: "PAUSED", pausedAt: new Date() },
      include: workflowInclude,
    });
    return res.json({ zap });
  }),
);

router.post(
  "/:zapId/resume",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const workflow = await findOwnedWorkflow(userId, zapId);
    if (workflow.status !== "PAUSED" || !workflow.publishedVersion)
      throw new HttpError(
        409,
        "INVALID_WORKFLOW_STATE",
        "Only paused published workflows can be resumed",
      );
    const zap = await prisma.zap.update({
      where: { id: zapId },
      data: { status: "PUBLISHED", pausedAt: null },
      include: workflowInclude,
    });
    return res.json({ zap });
  }),
);

router.post(
  "/:zapId/archive",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId);
    const zap = await prisma.zap.update({
      where: { id: zapId },
      data: { status: "ARCHIVED", archivedAt: new Date(), pausedAt: null },
      include: workflowInclude,
    });
    return res.json({ zap });
  }),
);

router.post(
  "/:zapId/duplicate",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const source = await findOwnedWorkflow(userId, zapId);
    if (!source.trigger)
      throw new HttpError(
        409,
        "WORKFLOW_TRIGGER_REQUIRED",
        "Workflow has no trigger to duplicate",
      );
    const sourceTrigger = source.trigger;
    const duplicate = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const zap = await tx.zap.create({
          data: {
            userId,
            name: `${source.name} copy`.slice(0, 120),
            description: source.description,
            triggerId: "",
            webhookSecret: randomBytes(32).toString("base64url"),
            requireSignature: source.requireSignature,
            actions: {
              create: source.actions.map((action) => ({
                actionId: action.actionId,
                sortingOrder: action.sortingOrder,
                metadata: action.metadata as Prisma.InputJsonValue,
              })),
            },
          },
        });
        const trigger = await tx.trigger.create({
          data: {
            zapId: zap.id,
            triggerId: sourceTrigger.triggerId,
            metadata: sourceTrigger.metadata as Prisma.InputJsonValue,
          },
        });
        return tx.zap.update({
          where: { id: zap.id },
          data: { triggerId: trigger.id },
          include: workflowInclude,
        });
      },
    );
    return res.status(201).json({ zapId: duplicate.id, zap: duplicate });
  }),
);

router.put(
  "/:zapId/actions/order",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const { actionIds } = ZapReorderSchema.parse(req.body);
    const workflow = await findOwnedWorkflow(userId, zapId);
    const existingIds = new Set(workflow.actions.map((action) => action.id));
    if (
      actionIds.length !== existingIds.size ||
      new Set(actionIds).size !== actionIds.length ||
      actionIds.some((id) => !existingIds.has(id))
    )
      throw new HttpError(
        400,
        "INVALID_ACTION_ORDER",
        "Action order must contain every workflow action exactly once",
      );
    await prisma.$transaction(
      actionIds.map((id, sortingOrder) =>
        prisma.action.update({ where: { id }, data: { sortingOrder } }),
      ),
    );
    const zap = await findOwnedWorkflow(userId, zapId);
    return res.json({ zap });
  }),
);

router.get(
  "/:zapId/versions",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId);
    const versions = await prisma.workflowVersion.findMany({
      where: { zapId },
      orderBy: { version: "desc" },
    });
    return res.json({ versions });
  }),
);

router.get(
  "/:zapId/test-captures/latest",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId);
    const capture = await prisma.testTriggerCapture.findFirst({
      where: { zapId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ capture });
  }),
);

router.post(
  "/:zapId/webhook-secret/rotate",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId);
    const zap = await prisma.zap.update({
      where: { id: zapId },
      data: { webhookSecret: randomBytes(32).toString("base64url") },
      include: workflowInclude,
    });
    return res.json({ zap });
  }),
);

router.delete(
  "/:zapId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId);
    await prisma.zap.delete({ where: { id: zapId } });
    return res.status(204).send();
  }),
);

router.get(
  "/:zapId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const zap = await findOwnedWorkflow(userId, zapId);
    return res.json({ zap });
  }),
);

export const zapRouter = router;
