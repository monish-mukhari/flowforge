import { describe, expect, it } from "vitest";
import { insertItem, reorderItem } from "./workflow-order";

describe("workflow ordering", () => {
  it("reorders without mutating the saved sequence", () => {
    const original = ["email", "solana", "email-2"];
    expect(reorderItem(original, 0, 2)).toEqual(["solana", "email-2", "email"]);
    expect(original).toEqual(["email", "solana", "email-2"]);
  });

  it("inserts actions at a selected connector position", () => {
    expect(insertItem(["first", "third"], 1, "second")).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});
