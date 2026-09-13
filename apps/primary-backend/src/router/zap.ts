import { Router } from "express";
import { authMiddleware } from "../middleware";
import { ZapCreateSchema, ZapIdSchema } from "../types";
import prisma from "@repo/db/client";
import { asyncRoute, HttpError } from "../errors";
import type { Prisma } from "@prisma/client";

const router = Router();

router.post(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const id = req.userId!;
    const parsedBody = ZapCreateSchema.parse(req.body);
    const triggerExists = await prisma.availableTrigger.findUnique({
      where: { id: parsedBody.availableTriggerId },
      select: { id: true },
    });
    const actionCount = await prisma.availableAction.count({
      where: {
        id: {
          in: parsedBody.actions.map((action) => action.availableActionId),
        },
      },
    });
    if (
      !triggerExists ||
      actionCount !==
        new Set(parsedBody.actions.map((action) => action.availableActionId))
          .size
    )
      throw new HttpError(
        400,
        "UNKNOWN_APP",
        "Workflow contains an unavailable trigger or action",
      );

    const zapId = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const zap = await tx.zap.create({
          data: {
            userId: id,
            triggerId: "",
            actions: {
              create: parsedBody.actions.map((x, index) => ({
                actionId: x.availableActionId,
                sortingOrder: index,
                metadata: (x.actionMetadata ?? {}) as Prisma.InputJsonValue,
              })),
            },
          },
        });

        const trigger = await tx.trigger.create({
          data: {
            zapId: zap.id,
            triggerId: parsedBody.availableTriggerId,
          },
        });

        await tx.zap.update({
          where: {
            id: zap.id,
          },
          data: {
            triggerId: trigger.id,
          },
        });

        return zap.id;
      },
    );

    return res.json({
      zapId,
    });
  }),
);

router.get(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const id = req.userId!;

    const zaps = await prisma.zap.findMany({
      where: {
        userId: id,
      },
      include: {
        actions: {
          include: {
            type: true,
          },
        },
        trigger: {
          include: {
            type: true,
          },
        },
      },
    });

    return res.json({
      zaps,
    });
  }),
);

router.get(
  "/:zapId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const id = req.userId!;
    const { zapId } = ZapIdSchema.parse(req.params);
    const zap = await prisma.zap.findFirst({
      where: {
        id: zapId,
        userId: id,
      },
      include: {
        actions: {
          include: {
            type: true,
          },
        },
        trigger: {
          include: {
            type: true,
          },
        },
      },
    });

    if (!zap)
      throw new HttpError(404, "WORKFLOW_NOT_FOUND", "Workflow not found");
    return res.json({ zap });
  }),
);

export const zapRouter = router;
