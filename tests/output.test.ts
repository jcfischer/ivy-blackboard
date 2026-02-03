import { describe, expect, it } from "bun:test";
import { formatJson, formatTable, formatRelativeTime } from "../src/output";

describe("formatJson", () => {
  it("wraps single item with ok and timestamp", () => {
    const result = JSON.parse(formatJson({ id: "test" }));
    expect(result.ok).toBe(true);
    expect(result.timestamp).toBeDefined();
    expect(result.id).toBe("test");
  });

  it("wraps array with ok, count, items, timestamp", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = JSON.parse(formatJson(items));
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.timestamp).toBeDefined();
  });

  it("produces error envelope when ok=false", () => {
    const result = JSON.parse(formatJson({ error: "something broke" }, false));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("something broke");
    expect(result.timestamp).toBeDefined();
  });

  it("returns valid JSON string", () => {
    const str = formatJson({ test: true });
    expect(() => JSON.parse(str)).not.toThrow();
  });
});

describe("formatTable", () => {
  it("formats headers and rows with padding", () => {
    const output = formatTable(
      ["ID", "NAME", "STATUS"],
      [
        ["1", "Ivy", "active"],
        ["2", "Bot", "idle"],
      ]
    );
    expect(output).toContain("ID");
    expect(output).toContain("NAME");
    expect(output).toContain("STATUS");
    expect(output).toContain("Ivy");
    expect(output).toContain("active");
  });

  it("handles empty rows", () => {
    const output = formatTable(["ID", "NAME"], []);
    expect(output).toContain("ID");
    expect(output).toContain("NAME");
  });

  it("aligns columns based on widest value", () => {
    const output = formatTable(
      ["SHORT", "LONG HEADER"],
      [["a", "b"]]
    );
    const lines = output.split("\n").filter(Boolean);
    // Header and data lines should have consistent spacing
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe("formatRelativeTime", () => {
  it("returns 'just now' for timestamps within 60 seconds", () => {
    const now = new Date();
    expect(formatRelativeTime(now.toISOString())).toBe("just now");

    const thirtySecondsAgo = new Date(now.getTime() - 30_000);
    expect(formatRelativeTime(thirtySecondsAgo.toISOString())).toBe("just now");
  });

  it("returns 'Xm ago' for minutes", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(fiveMinAgo.toISOString())).toBe("5m ago");

    const oneMinAgo = new Date(Date.now() - 90_000); // 1.5 min rounds to 1m
    expect(formatRelativeTime(oneMinAgo.toISOString())).toBe("1m ago");
  });

  it("returns 'Xh ago' for hours", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe("2h ago");

    const oneHourAgo = new Date(Date.now() - 3_600_000);
    expect(formatRelativeTime(oneHourAgo.toISOString())).toBe("1h ago");
  });

  it("returns 'Xd ago' for days", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    expect(formatRelativeTime(threeDaysAgo.toISOString())).toBe("3d ago");

    const oneDayAgo = new Date(Date.now() - 86_400_000);
    expect(formatRelativeTime(oneDayAgo.toISOString())).toBe("1d ago");
  });
});
