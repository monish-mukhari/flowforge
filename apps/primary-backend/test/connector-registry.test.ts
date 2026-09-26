import { describe, expect, it } from "vitest";
import {
  connectorContract,
  connectorRegistry,
} from "../src/connectors/registry";

describe("versioned connector registry", () => {
  it("publishes unique v1 contracts for the supported actions", () => {
    expect(
      connectorRegistry.map(({ key, version }) => `${key}@${version}`),
    ).toEqual(["email@1", "solana@1", "http@1", "slack@1", "google-sheets@1"]);
  });

  it("validates connection-bound Slack and Sheets configuration", () => {
    expect(
      connectorContract("slack")!.schema.safeParse({
        channel: "C1",
        text: "hello",
      }).success,
    ).toBe(false);
    expect(
      connectorContract("google-sheets")!.schema.safeParse({
        connectionId: crypto.randomUUID(),
        spreadsheetId: "sheet",
        range: "A:Z",
        values: "[]",
      }).success,
    ).toBe(true);
  });
});
