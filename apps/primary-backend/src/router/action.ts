import { Router } from "express";
import { authMiddleware } from "../middleware";
import prisma from "@repo/db/client";
import { asyncRoute } from "../errors";

const router = Router();

router.get(
  "/available",
  authMiddleware,
  asyncRoute(async (_req, res) => {
    const availableActions = await prisma.availableAction.findMany();

    return res.json({
      availableActions,
    });
  }),
);

export const actionRouter = router;
