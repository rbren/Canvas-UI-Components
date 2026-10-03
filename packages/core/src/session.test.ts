import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "./events";
import { mergeEvents } from "./session";

const reply: ConversationEvent = {
  kind: "MessageEvent",
  id: "reply",
  source: "agent",
  timestamp: "2026-01-01T00:00:02Z",
  llm_message: { role: "assistant", content: [{ text: "Complete" }] },
};

describe("event reconciliation", () => {
  it("deduplicates and orders history/live overlap without mutating either source", () => {
    const older: ConversationEvent = {
      ...reply,
      id: "older",
      timestamp: "2026-01-01T00:00:01Z",
    };
    const history = [reply, older];
    expect(mergeEvents(history, [reply])).toEqual([older, reply]);
    expect(history).toEqual([reply, older]);
  });

  it("lets a durable message supersede a same-ID streaming slot regardless of source order", () => {
    const provisional: ConversationEvent = {
      kind: "StreamingDeltaEvent",
      id: "reply",
      content: "Partial",
    };
    expect(mergeEvents([reply], [provisional])).toEqual([reply]);
    expect(mergeEvents([provisional], [reply])).toEqual([reply]);
  });
});
