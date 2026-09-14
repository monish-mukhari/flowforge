import { describe, expect, it } from "vitest";
import { HttpError } from "../src/errors";
import {
  createDefinitionSnapshot,
  validateConnectorConfiguration,
} from "../src/workflow-definition";

describe("workflow definitions", () => {
  it("accepts configured connectors and template values", () => {
    expect(() =>
      validateConnectorConfiguration([
        {
          availableActionId: "email",
          actionMetadata: {
            email: "{customer.email}",
            body: "Hello {customer.name}",
          },
        },
      ]),
    ).not.toThrow();
  });

  it("returns actionable connector validation details", () => {
    try {
      validateConnectorConfiguration([
        { availableActionId: "email", actionMetadata: { email: "" } },
      ]);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe("INVALID_CONNECTOR_CONFIGURATION");
      expect((error as HttpError).details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ actionIndex: 0, path: "email" }),
          expect.objectContaining({ actionIndex: 0, path: "body" }),
        ]),
      );
    }
  });

  it("creates an ordered immutable definition payload", () => {
    expect(
      createDefinitionSnapshot({
        name: "Payment confirmation",
        description: null,
        trigger: { triggerId: "webhook", metadata: {} },
        actions: [
          {
            actionId: "email",
            metadata: { email: "{customer.email}", body: "Paid" },
            sortingOrder: 0,
          },
        ],
      }),
    ).toMatchObject({
      name: "Payment confirmation",
      trigger: { availableTriggerId: "webhook" },
      actions: [{ availableActionId: "email", sortingOrder: 0 }],
    });
  });
});
