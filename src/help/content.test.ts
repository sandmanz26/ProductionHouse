import { describe, expect, it } from "vitest";
import { GLOSSARY, HELP_TOPICS, topicFor } from "./content";

describe("help content", () => {
  it("finds the most specific topic for a page", () => {
    expect(topicFor("/")?.id).toBe("home");
    expect(topicFor("/work-orders")?.id).toBe("work-orders");
    expect(topicFor("/board")?.id).toBe("board");
    expect(topicFor("/work-orders/abc")?.id).toBe("work-orders");
    expect(topicFor("/stock/offcuts")?.id).toBe("offcuts");
    expect(topicFor("/stock/items/x")?.id).toBe("stock");
    expect(topicFor("/nowhere")).toBeUndefined();
  });

  it("only refers to glossary terms that exist", () => {
    const names = new Set(GLOSSARY.map((g) => g.term));
    for (const t of HELP_TOPICS) for (const term of t.terms ?? []) expect(names.has(term), `${t.id}: ${term}`).toBe(true);
  });

  it("has unique topic ids", () => {
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length);
  });
});
