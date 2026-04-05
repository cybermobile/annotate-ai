import { describe, expect, it } from "vitest";

describe("Steel.dev API key validation", () => {
  it("should have STEEL_API_KEY configured", () => {
    expect(process.env.STEEL_API_KEY).toBeDefined();
    expect(process.env.STEEL_API_KEY!.length).toBeGreaterThan(10);
    expect(process.env.STEEL_API_KEY!.startsWith("ste-")).toBe(true);
  });

  it("should be able to connect to Steel.dev WebSocket endpoint", async () => {
    const apiKey = process.env.STEEL_API_KEY;
    // Test that the Steel API responds - use the REST API to check health
    const response = await fetch("https://api.steel.dev/v1/sessions", {
      method: "GET",
      headers: {
        "Steel-Api-Key": apiKey!,
        "Content-Type": "application/json",
      },
    });

    // A valid API key should get 200 (list sessions), not 401/403
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
  });
});
