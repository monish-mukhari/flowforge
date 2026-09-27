import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@repo/db/client";
import { z } from "zod";
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
import { redactRun } from "../run-redaction";
import { calculateRunMetrics } from "../run-metrics";

const router = Router();
const workflowInclude = {
  actions: { include: { type: true }, orderBy: { sortingOrder: "asc" } },
  trigger: { include: { type: true } },
  organization: { select: { id: true, name: true } },
  _count: { select: { versions: true } },
} satisfies Prisma.ZapInclude;

const runListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    status: z
      .enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD_LETTER"])
      .optional(),
    workflowId: z.string().uuid().optional(),
    search: z.string().trim().max(120).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.enum(["newest", "oldest"]).default("newest"),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "The start date must be before the end date",
    path: ["from"],
  });
const runParamsSchema = ZapIdSchema.extend({ runId: z.string().uuid() });
const notificationParamsSchema = z.object({
  notificationId: z.string().uuid(),
});
const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  unreadOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default("false"),
});
const replaySnapshotSchema = z.object({
  actions: z.array(
    z.object({
      availableActionId: z.string(),
      connectorVersion: z.number().int().min(1).default(1),
      actionMetadata: z.record(z.string(), z.unknown()),
      sortingOrder: z.number().int().min(0),
    }),
  ),
});

type RunListQuery = z.infer<typeof runListQuerySchema>;

function runDateFilter(query: RunListQuery): Prisma.DateTimeFilter | undefined {
  if (!query.from && !query.to) return undefined;
  return {
    ...(query.from ? { gte: query.from } : {}),
    ...(query.to ? { lte: query.to } : {}),
  };
}

function ownedRunWhere(
  userId: number,
  query: RunListQuery,
): Prisma.ZapRunWhereInput {
  const createdAt = runDateFilter(query);
  return {
    zap: {
      OR: [{ userId }, { organization: { members: { some: { userId } } } }],
      ...(query.workflowId ? { id: query.workflowId } : {}),
    },
    ...(query.status ? { status: query.status } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(query.search
      ? {
          OR: [
            { id: { contains: query.search, mode: "insensitive" } },
            { zap: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

async function ensureAvailableConnectors(
  userId: number,
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
  const requestedConnections = actions.flatMap((action) => {
    const connectionId = action.actionMetadata?.connectionId;
    return typeof connectionId === "string"
      ? [{ id: connectionId, connectorKey: action.availableActionId }]
      : [];
  });
  if (requestedConnections.length) {
    const connections = await prisma.appConnection.findMany({
      where: {
        id: { in: requestedConnections.map((connection) => connection.id) },
        status: { not: "REVOKED" },
        OR: [{ userId }, { organization: { members: { some: { userId } } } }],
      },
      select: { id: true, connectorKey: true },
    });
    const byId = new Map(
      connections.map((connection) => [connection.id, connection.connectorKey]),
    );
    const invalid = requestedConnections.some(
      (connection) => byId.get(connection.id) !== connection.connectorKey,
    );
    if (
      invalid ||
      connections.length !==
        new Set(requestedConnections.map((item) => item.id)).size
    )
      throw new HttpError(
        400,
        "INVALID_CONNECTION",
        "Workflow uses a missing, revoked, or incompatible connection",
      );
  }
}

type AccessRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
const roleRank: Record<AccessRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

async function findOwnedWorkflow(
  userId: number,
  zapId: string,
  minimum: AccessRole = "EDITOR",
) {
  const workflow = await prisma.zap.findUnique({
    where: { id: zapId },
    include: workflowInclude,
  });
  if (!workflow)
    throw new HttpError(404, "WORKFLOW_NOT_FOUND", "Workflow not found");
  let accessRole: AccessRole | null =
    workflow.userId === userId ? "OWNER" : null;
  if (!accessRole && workflow.organizationId) {
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: workflow.organizationId,
          userId,
        },
      },
      select: { role: true },
    });
    accessRole = member?.role ?? null;
  }
  if (!accessRole)
    throw new HttpError(404, "WORKFLOW_NOT_FOUND", "Workflow not found");
  if (roleRank[accessRole] < roleRank[minimum])
    throw new HttpError(
      403,
      "WORKFLOW_ROLE_REQUIRED",
      `${minimum.toLowerCase()} access is required for this workflow`,
    );
  return workflow;
}

async function workflowAccessRole(
  userId: number,
  workflow: { userId: number; organizationId: string | null },
): Promise<AccessRole> {
  if (workflow.userId === userId) return "OWNER";
  if (!workflow.organizationId) return "VIEWER";
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: workflow.organizationId,
        userId,
      },
    },
    select: { role: true },
  });
  return member?.role ?? "VIEWER";
}

router.post(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const input = ZapCreateSchema.parse(req.body);
    await ensureAvailableConnectors(
      userId,
      input.availableTriggerId,
      input.actions,
    );
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
      AND: [
        {
          OR: [{ userId }, { organization: { members: { some: { userId } } } }],
        },
        ...(query.search
          ? [
              {
                OR: [
                  {
                    name: {
                      contains: query.search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    description: {
                      contains: query.search,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
      ...(query.status ? { status: query.status } : {}),
    };
    const [zaps, total, memberships] = await Promise.all([
      prisma.zap.findMany({
        where,
        include: workflowInclude,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.zap.count({ where }),
      prisma.organizationMember.findMany({
        where: { userId },
        select: { organizationId: true, role: true },
      }),
    ]);
    const roles = new Map(
      memberships.map((membership) => [
        membership.organizationId,
        membership.role,
      ]),
    );
    return res.json({
      zaps: zaps.map((zap) => {
        const accessRole =
          zap.userId === userId
            ? "OWNER"
            : zap.organizationId
              ? roles.get(zap.organizationId)
              : "VIEWER";
        return {
          ...zap,
          webhookSecret:
            roleRank[accessRole ?? "VIEWER"] >= roleRank.ADMIN
              ? zap.webhookSecret
              : "",
          accessRole,
        };
      }),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  }),
);

router.get(
  "/:zapId/export",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { zapId } = ZapIdSchema.parse(req.params);
    const workflow = await findOwnedWorkflow(req.userId!, zapId, "VIEWER");
    res.json({
      version: 1,
      workflow: {
        name: workflow.name,
        description: workflow.description,
        trigger: {
          id: workflow.trigger?.triggerId,
          metadata: workflow.trigger?.metadata ?? {},
        },
        actions: workflow.actions.map((action) => ({
          id: action.actionId,
          metadata: action.metadata,
        })),
      },
    });
  }),
);

router.post(
  "/import",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        version: z.number().int().default(1),
        workflow: z.object({
          name: z.string().trim().min(1).max(120),
          description: z.string().max(1000).nullable().optional(),
          trigger: z.object({
            id: z.string().min(1),
            metadata: z.record(z.string(), z.unknown()).default({}),
          }),
          actions: z
            .array(
              z.object({
                id: z.string().min(1),
                metadata: z.record(z.string(), z.unknown()).default({}),
              }),
            )
            .min(1)
            .max(25),
        }),
      })
      .parse(req.body);
    const createInput = {
      name: input.workflow.name,
      description: input.workflow.description,
      availableTriggerId: input.workflow.trigger.id,
      triggerMetadata: input.workflow.trigger.metadata,
      actions: input.workflow.actions.map((action) => ({
        availableActionId: action.id,
        actionMetadata: action.metadata,
      })),
    };
    await ensureAvailableConnectors(
      req.userId!,
      createInput.availableTriggerId,
      createInput.actions,
    );
    const workflow = await prisma.$transaction(async (tx) => {
      const zap = await tx.zap.create({
        data: {
          userId: req.userId!,
          name: createInput.name,
          description: createInput.description,
          triggerId: "",
          webhookSecret: randomBytes(32).toString("base64url"),
          actions: {
            create: createInput.actions.map((action, sortingOrder) => ({
              actionId: action.availableActionId,
              sortingOrder,
              metadata: action.actionMetadata as Prisma.InputJsonValue,
            })),
          },
        },
      });
      await tx.trigger.create({
        data: {
          zapId: zap.id,
          triggerId: createInput.availableTriggerId,
          metadata: createInput.triggerMetadata as Prisma.InputJsonValue,
        },
      });
      return tx.zap.update({
        where: { id: zap.id },
        data: {
          triggerId: (
            await tx.trigger.findUniqueOrThrow({ where: { zapId: zap.id } })
          ).id,
        },
        include: workflowInclude,
      });
    });
    res.status(201).json({ zapId: workflow.id, zap: workflow });
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
    await ensureAvailableConnectors(userId, triggerId, actions);
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
  "/:zapId/share",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { zapId } = ZapIdSchema.parse(req.params);
    const input = z
      .object({ organizationId: z.string().uuid() })
      .parse(req.body);
    const workflow = await findOwnedWorkflow(req.userId!, zapId, "ADMIN");
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: req.userId!,
        },
      },
    });
    if (!member || !["OWNER", "ADMIN", "EDITOR"].includes(member.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Editor access is required to share workflows",
      );
    const updated = await prisma.zap.update({
      where: { id: zapId },
      data: { organizationId: input.organizationId },
      include: workflowInclude,
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: req.userId!,
        action: "workflow.shared",
        resourceType: "zap",
        resourceId: zapId,
      },
    });
    res.json({ zap: updated });
  }),
);

router.post(
  "/:zapId/publish",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const workflow = await findOwnedWorkflow(userId, zapId);
    const accessRole = await workflowAccessRole(userId, workflow);
    if (workflow.organizationId && accessRole === "EDITOR") {
      const approval = await prisma.publishApproval.findFirst({
        where: {
          organizationId: workflow.organizationId,
          zapId,
          status: "APPROVED",
          createdAt: { gte: workflow.updatedAt },
        },
        orderBy: { reviewedAt: "desc" },
      });
      if (!approval)
        throw new HttpError(
          409,
          "PUBLISH_APPROVAL_REQUIRED",
          "An owner or admin must approve this workflow before an editor can publish it",
        );
    }
    if (workflow.status === "ARCHIVED")
      throw new HttpError(
        409,
        "WORKFLOW_ARCHIVED",
        "Archived workflows cannot be published",
      );
    if (!workflow.trigger)
      throw new HttpError(
        400,
        "WORKFLOW_TRIGGER_REQUIRED",
        "Workflow must have a trigger before it can be published",
      );
    await ensureAvailableConnectors(
      userId,
      workflow.trigger.triggerId,
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
    if (workflow.organizationId)
      await prisma.auditEvent.create({
        data: {
          organizationId: workflow.organizationId,
          actorId: userId,
          action: "workflow.published",
          resourceType: "zap",
          resourceId: zapId,
          metadata: { version: result.version.version },
        },
      });
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
    await findOwnedWorkflow(userId, zapId, "ADMIN");
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
    const source = await findOwnedWorkflow(userId, zapId, "VIEWER");
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
    await findOwnedWorkflow(userId, zapId, "VIEWER");
    const versions = await prisma.workflowVersion.findMany({
      where: { zapId },
      orderBy: { version: "desc" },
    });
    return res.json({ versions });
  }),
);

router.get(
  "/:zapId/runs",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const query = runListQuerySchema.parse(req.query);
    await findOwnedWorkflow(userId, zapId, "VIEWER");
    const createdAt = runDateFilter(query);
    const summaryWhere: Prisma.ZapRunWhereInput = {
      zapId,
      ...(createdAt ? { createdAt } : {}),
    };
    const where: Prisma.ZapRunWhereInput = {
      ...summaryWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { id: { contains: query.search, mode: "insensitive" } }
        : {}),
    };
    const [runs, total, statusCounts] = await Promise.all([
      prisma.zapRun.findMany({
        where,
        orderBy: { createdAt: query.sort === "newest" ? "desc" : "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          steps: {
            orderBy: { sortingOrder: "asc" },
            include: { attempts: { orderBy: { attemptNumber: "asc" } } },
          },
          workflowVersion: { select: { version: true } },
        },
      }),
      prisma.zapRun.count({ where }),
      prisma.zapRun.groupBy({
        by: ["status"],
        where: summaryWhere,
        _count: { _all: true },
      }),
    ]);
    return res.json({
      runs: runs.map(redactRun),
      summary: Object.fromEntries(
        statusCounts.map((entry) => [entry.status, entry._count._all]),
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  }),
);

router.get(
  "/runs",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const query = runListQuerySchema.parse(req.query);
    const where = ownedRunWhere(userId, query);
    const summaryWhere = ownedRunWhere(userId, { ...query, status: undefined });
    const [runs, total, statusCounts] = await Promise.all([
      prisma.zapRun.findMany({
        where,
        orderBy: { createdAt: query.sort === "newest" ? "desc" : "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          zap: { select: { id: true, name: true } },
          steps: {
            orderBy: { sortingOrder: "asc" },
            include: { attempts: { orderBy: { attemptNumber: "asc" } } },
          },
          workflowVersion: { select: { version: true } },
        },
      }),
      prisma.zapRun.count({ where }),
      prisma.zapRun.groupBy({
        by: ["status"],
        where: summaryWhere,
        _count: { _all: true },
      }),
    ]);
    return res.json({
      runs: runs.map(redactRun),
      summary: Object.fromEntries(
        statusCounts.map((entry) => [entry.status, entry._count._all]),
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  }),
);

router.get(
  "/runs/metrics",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const query = runListQuerySchema.parse(req.query);
    const where = ownedRunWhere(userId, query);
    const [runs, retryingSteps, unreadNotifications] = await Promise.all([
      prisma.zapRun.findMany({
        where,
        select: { status: true, startedAt: true, completedAt: true },
      }),
      prisma.zapRunStep.count({
        where: { status: "RETRY_SCHEDULED", zapRun: where },
      }),
      prisma.runNotification.count({ where: { userId, readAt: null } }),
    ]);
    return res.json({
      metrics: {
        ...calculateRunMetrics(runs),
        retryingSteps,
        unreadNotifications,
      },
    });
  }),
);

router.get(
  "/notifications",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const query = notificationQuerySchema.parse(req.query);
    const where: Prisma.RunNotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [notifications, total, unread] = await Promise.all([
      prisma.runNotification.findMany({
        where,
        include: {
          zap: { select: { id: true, name: true } },
          zapRun: { select: { id: true, status: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.runNotification.count({ where }),
      prisma.runNotification.count({ where: { userId, readAt: null } }),
    ]);
    return res.json({
      notifications,
      unread,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  }),
);

router.post(
  "/notifications/read-all",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const result = await prisma.runNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.json({ updated: result.count });
  }),
);

router.post(
  "/notifications/:notificationId/read",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { notificationId } = notificationParamsSchema.parse(req.params);
    const notification = await prisma.runNotification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    });
    if (!notification)
      throw new HttpError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification not found",
      );
    await prisma.runNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    return res.status(204).send();
  }),
);

router.get(
  "/:zapId/runs/:runId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId, runId } = runParamsSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId, "VIEWER");
    const run = await prisma.zapRun.findFirst({
      where: { id: runId, zapId },
      include: {
        steps: {
          orderBy: { sortingOrder: "asc" },
          include: { attempts: { orderBy: { attemptNumber: "asc" } } },
        },
        workflowVersion: { select: { version: true } },
      },
    });
    if (!run)
      throw new HttpError(404, "RUN_NOT_FOUND", "Workflow run not found");
    return res.json({ run: redactRun(run) });
  }),
);

router.post(
  "/:zapId/runs/:runId/replay",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId, runId } = runParamsSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId);
    const source = await prisma.zapRun.findFirst({
      where: { id: runId, zapId },
      include: { steps: { orderBy: { sortingOrder: "asc" } } },
    });
    if (!source)
      throw new HttpError(404, "RUN_NOT_FOUND", "Workflow run not found");
    if (!source.definitionSnapshot)
      throw new HttpError(
        409,
        "RUN_NOT_REPLAYABLE",
        "This run has no saved execution snapshot",
      );
    if (!["FAILED", "DEAD_LETTER"].includes(source.status))
      throw new HttpError(
        409,
        "RUN_NOT_FAILED",
        "Only failed or dead-letter runs can be replayed",
      );
    const snapshot = replaySnapshotSchema.parse(source.definitionSnapshot);
    const actions = source.steps.length
      ? source.steps.map((step) => ({
          sortingOrder: step.sortingOrder,
          actionType: step.actionType,
          connectorVersion: step.connectorVersion,
          input: step.input,
          maxAttempts: step.maxAttempts,
        }))
      : snapshot.actions.map((action) => ({
          sortingOrder: action.sortingOrder,
          actionType: action.availableActionId,
          connectorVersion: action.connectorVersion,
          input: action.actionMetadata as Prisma.InputJsonValue,
          maxAttempts: 3,
        }));
    const replayId = randomUUID();
    const replay = await prisma.zapRun.create({
      data: {
        id: replayId,
        zapId,
        workflowVersionId: source.workflowVersionId,
        definitionSnapshot: source.definitionSnapshot as Prisma.InputJsonValue,
        metadata: source.metadata as Prisma.InputJsonValue,
        replayOfId: source.id,
        steps: {
          create: actions.map((action) => ({
            sortingOrder: action.sortingOrder,
            actionType: action.actionType,
            connectorVersion: action.connectorVersion,
            input: action.input as Prisma.InputJsonValue,
            maxAttempts: action.maxAttempts,
            idempotencyKey: `${replayId}:${action.sortingOrder}`,
          })),
        },
        zapRunOutbox: { create: { stage: 0 } },
      },
      include: { steps: { orderBy: { sortingOrder: "asc" } } },
    });
    return res.status(202).json({ run: redactRun(replay) });
  }),
);

router.get(
  "/:zapId/test-captures/latest",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const userId = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    await findOwnedWorkflow(userId, zapId, "VIEWER");
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
    await findOwnedWorkflow(userId, zapId, "ADMIN");
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
    await findOwnedWorkflow(userId, zapId, "ADMIN");
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
    const zap = await findOwnedWorkflow(userId, zapId, "VIEWER");
    const accessRole = await workflowAccessRole(userId, zap);
    return res.json({
      zap: {
        ...zap,
        webhookSecret:
          roleRank[accessRole] >= roleRank.ADMIN ? zap.webhookSecret : "",
        accessRole,
      },
    });
  }),
);

export const zapRouter = router;
