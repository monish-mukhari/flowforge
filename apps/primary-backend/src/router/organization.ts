import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import prisma from "@repo/db/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncRoute, HttpError } from "../errors";
import { authMiddleware } from "../middleware";

const router = Router();
const role = z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
const orgId = z.object({ organizationId: z.string().uuid() });

async function membership(userId: number, organizationId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!member)
    throw new HttpError(
      403,
      "ORGANIZATION_ACCESS_REQUIRED",
      "You are not a member of this organization",
    );
  return member;
}
function canManage(value: string) {
  return value === "OWNER" || value === "ADMIN";
}
function canEdit(value: string) {
  return canManage(value) || value === "EDITOR";
}
async function audit(
  organizationId: string,
  actorId: number,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata: Record<string, unknown> = {},
) {
  await prisma.auditEvent.create({
    data: {
      organizationId,
      actorId,
      action,
      resourceType,
      resourceId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

router.get(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: req.userId! },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      organizations: memberships.map((item) => ({
        ...item.organization,
        role: item.role,
      })),
    });
  }),
);

router.post(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(2).max(100) })
      .parse(req.body);
    const slug = `${input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${randomBytes(3).toString("hex")}`;
    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name: input.name, slug, ownerId: req.userId! },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: created.id,
          userId: req.userId!,
          role: "OWNER",
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: created.id,
          actorId: req.userId!,
          action: "organization.created",
          resourceType: "organization",
          resourceId: created.id,
        },
      });
      return created;
    });
    res.status(201).json({ organization, role: "OWNER" });
  }),
);

router.get(
  "/:organizationId/members",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    await membership(req.userId!, organizationId);
    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({ members });
  }),
);

router.get(
  "/:organizationId/overview",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    const [workflows, connections, invitations, approvals, events] =
      await Promise.all([
        prisma.zap.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            status: true,
            updatedAt: true,
            user: { select: { id: true, name: true, email: true } },
            trigger: { select: { type: true } },
            actions: {
              orderBy: { sortingOrder: "asc" },
              select: { id: true, type: true },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.appConnection.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            connectorKey: true,
            status: true,
            externalAccountName: true,
            userId: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        }),
        canManage(actor.role)
          ? prisma.organizationInvitation.findMany({
              where: {
                organizationId,
                acceptedAt: null,
                expiresAt: { gt: new Date() },
              },
              select: {
                id: true,
                email: true,
                role: true,
                expiresAt: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve([]),
        prisma.publishApproval.findMany({
          where: { organizationId },
          include: {
            zap: { select: { id: true, name: true, status: true } },
            requestedBy: { select: { name: true, email: true } },
            reviewedBy: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.auditEvent.findMany({
          where: { organizationId },
          include: { actor: { select: { name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);
    res.json({
      role: actor.role,
      workflows,
      connections,
      invitations,
      approvals,
      events,
    });
  }),
);

router.post(
  "/:organizationId/invitations",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    if (!canManage(actor.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Only owners and admins can invite members",
      );
    const input = z
      .object({
        email: z.string().email(),
        role: role.exclude(["OWNER"]).default("VIEWER"),
      })
      .parse(req.body);
    const raw = randomBytes(32).toString("base64url");
    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId,
        email: input.email.toLowerCase(),
        role: input.role,
        tokenHash: createHash("sha256").update(raw).digest("hex"),
        invitedById: req.userId!,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    await audit(
      organizationId,
      req.userId!,
      "invitation.created",
      "invitation",
      invitation.id,
      { email: input.email, role: input.role },
    );
    res
      .status(201)
      .json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
        token: raw,
      });
  }),
);

router.post(
  "/invitations/:token/accept",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const token = z.string().min(20).parse(req.params.token);
    const invitation = await prisma.organizationInvitation.findFirst({
      where: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation)
      throw new HttpError(
        400,
        "INVITATION_INVALID",
        "Invitation is invalid or expired",
      );
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { email: true },
    });
    if (user.email.toLowerCase() !== invitation.email)
      throw new HttpError(
        403,
        "INVITATION_EMAIL_MISMATCH",
        "This invitation belongs to another email address",
      );
    await prisma.$transaction([
      prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: req.userId!,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: req.userId!,
          role: invitation.role,
        },
        update: { role: invitation.role },
      }),
      prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    await audit(
      invitation.organizationId,
      req.userId!,
      "invitation.accepted",
      "invitation",
      invitation.id,
    );
    res.json({
      organizationId: invitation.organizationId,
      role: invitation.role,
    });
  }),
);

router.patch(
  "/:organizationId/members/:userId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    if (!canManage(actor.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Only owners and admins can change roles",
      );
    const input = z.object({ role: role.exclude(["OWNER"]) }).parse(req.body);
    const userId = z.coerce.number().int().parse(req.params.userId);
    const target = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!target)
      throw new HttpError(
        404,
        "MEMBER_NOT_FOUND",
        "Workspace member not found",
      );
    if (target.role === "OWNER")
      throw new HttpError(
        409,
        "OWNER_ROLE_LOCKED",
        "Transfer ownership before changing the owner role",
      );
    const updated = await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role: input.role },
    });
    await audit(
      organizationId,
      req.userId!,
      "member.role_changed",
      "member",
      String(userId),
      { role: input.role },
    );
    res.json({ member: updated });
  }),
);

router.delete(
  "/:organizationId/members/:userId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    if (!canManage(actor.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Only owners and admins can remove members",
      );
    const userId = z.coerce.number().int().parse(req.params.userId);
    const target = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!target)
      throw new HttpError(
        404,
        "MEMBER_NOT_FOUND",
        "Workspace member not found",
      );
    if (target.role === "OWNER")
      throw new HttpError(
        409,
        "OWNER_ROLE_LOCKED",
        "The workspace owner cannot be removed",
      );
    await prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
    await audit(
      organizationId,
      req.userId!,
      "member.removed",
      "member",
      String(userId),
    );
    res.status(204).send();
  }),
);

router.delete(
  "/:organizationId/workflows/:zapId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    if (!canManage(actor.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Only owners and admins can remove shared workflows",
      );
    const zapId = z.string().uuid().parse(req.params.zapId);
    const updated = await prisma.zap.updateMany({
      where: { id: zapId, organizationId },
      data: { organizationId: null },
    });
    if (!updated.count)
      throw new HttpError(
        404,
        "WORKFLOW_NOT_FOUND",
        "Shared workflow not found",
      );
    await audit(organizationId, req.userId!, "workflow.unshared", "zap", zapId);
    res.status(204).send();
  }),
);

router.delete(
  "/:organizationId/connections/:connectionId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    if (!canManage(actor.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Only owners and admins can remove shared connections",
      );
    const connectionId = z.string().uuid().parse(req.params.connectionId);
    const updated = await prisma.appConnection.updateMany({
      where: { id: connectionId, organizationId },
      data: { organizationId: null },
    });
    if (!updated.count)
      throw new HttpError(
        404,
        "CONNECTION_NOT_FOUND",
        "Shared connection not found",
      );
    await audit(
      organizationId,
      req.userId!,
      "connection.unshared",
      "connection",
      connectionId,
    );
    res.status(204).send();
  }),
);

router.get(
  "/:organizationId/audit",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    await membership(req.userId!, organizationId);
    const events = await prisma.auditEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ events });
  }),
);

router.post(
  "/:organizationId/approvals",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    if (!canEdit(actor.role))
      throw new HttpError(403, "ROLE_REQUIRED", "Editor access is required");
    const input = z
      .object({
        zapId: z.string().uuid(),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);
    const zap = await prisma.zap.findFirst({
      where: { id: input.zapId, organizationId },
    });
    if (!zap)
      throw new HttpError(
        404,
        "WORKFLOW_NOT_FOUND",
        "Shared workflow not found",
      );
    const pending = await prisma.publishApproval.findFirst({
      where: { organizationId, zapId: input.zapId, status: "PENDING" },
    });
    if (pending)
      throw new HttpError(
        409,
        "APPROVAL_ALREADY_PENDING",
        "A publish approval is already pending for this workflow",
      );
    const approval = await prisma.publishApproval.create({
      data: {
        organizationId,
        zapId: input.zapId,
        requestedById: req.userId!,
        note: input.note,
      },
    });
    await audit(
      organizationId,
      req.userId!,
      "publish_approval.requested",
      "zap",
      input.zapId,
    );
    res.status(201).json({ approval });
  }),
);

router.get(
  "/:organizationId/approvals",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    await membership(req.userId!, organizationId);
    res.json({
      approvals: await prisma.publishApproval.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        include: { zap: { select: { id: true, name: true, status: true } } },
      }),
    });
  }),
);

router.post(
  "/:organizationId/approvals/:approvalId/review",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { organizationId } = orgId.parse(req.params);
    const actor = await membership(req.userId!, organizationId);
    if (!canManage(actor.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Only owners and admins can review approvals",
      );
    const input = z
      .object({
        status: z.enum(["APPROVED", "REJECTED"]),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);
    const existing = await prisma.publishApproval.findFirst({
      where: { id: req.params.approvalId, organizationId, status: "PENDING" },
    });
    if (!existing)
      throw new HttpError(
        404,
        "APPROVAL_NOT_FOUND",
        "Pending approval not found",
      );
    const approval = await prisma.publishApproval.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        note: input.note,
        reviewedById: req.userId!,
        reviewedAt: new Date(),
      },
    });
    await audit(
      organizationId,
      req.userId!,
      `publish_approval.${input.status.toLowerCase()}`,
      "zap",
      approval.zapId,
    );
    res.json({ approval });
  }),
);

export { router as organizationRouter };
