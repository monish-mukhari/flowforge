import { Router } from "express";
import { authMiddleware } from "../middleware";
import { asyncRoute } from "../errors";
import {
  connectorRegistry,
  publicConnectorContract,
} from "../connectors/registry";

const router = Router();

router.get(
  "/available",
  authMiddleware,
  asyncRoute(async (_req, res) => {
    const availableActions = connectorRegistry.map(publicConnectorContract);

    return res.json({
      availableActions,
    });
  }),
);

router.get(
  "/registry",
  authMiddleware,
  asyncRoute(async (_req, res) => {
    return res.json({
      connectors: connectorRegistry.map(publicConnectorContract),
    });
  }),
);

export const actionRouter = router;
