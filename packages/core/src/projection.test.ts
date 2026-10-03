import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "./events";
import { projectEvents } from "./projection";

const action: ConversationEvent = {
  kind: "ActionEvent",
  id: "action",
  tool_call_id: "call",
  tool_name: "terminal",
  action: { kind: "ExecuteBashAction", command: "pwd" },
  llm_response_id: "response",
  thought: [],
  tool_call: {
    id: "call",
    name: "terminal",
    arguments: '{"command":"pwd"}',
    origin: "completion",
  },
  summary: "Read working directory",
  security_risk: "LOW",
};

describe("projectEvents", () => {
  it("projects text, images and system messages without mutating events", () => {
    const events: ConversationEvent[] = [
      {
        kind: "MessageEvent",
        id: "user",
        source: "user",
        llm_message: {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "image", image_urls: ["https://example.com/image.png"] },
          ],
        },
      },
      {
        kind: "MessageEvent",
        id: "system",
        source: "environment",
        llm_message: { role: "system", content: [{ text: "Instructions" }] },
      },
    ];
    const before = structuredClone(events);
    expect(projectEvents(events)).toEqual([
      {
        type: "message",
        id: "user",
        role: "user",
        text: "Hello",
        images: ["https://example.com/image.png"],
      },
      {
        type: "message",
        id: "system",
        role: "system",
        text: "Instructions",
        images: [],
      },
    ]);
    expect(events).toEqual(before);
  });

  it("pairs actions and observations even when delivered out of order", () => {
    const observation: ConversationEvent = {
      kind: "ObservationEvent",
      id: "result",
      action_id: "action",
      tool_call_id: "call",
      tool_name: "terminal",
      observation: {
        kind: "ExecuteBashObservation",
        output: "/workspace",
        exit_code: 0,
        command: "pwd",
      },
    };
    const [item] = projectEvents([observation, action]);
    expect(item).toMatchObject({
      type: "tool",
      id: "action",
      name: "terminal",
      status: "completed",
      input: action.action,
      output: observation.observation,
      risk: "LOW",
    });
    expect(projectEvents([action, observation])).toEqual([item]);
  });

  it("merges agent errors, user rejections and ACP tool updates", () => {
    expect(
      projectEvents([
        action,
        {
          kind: "AgentErrorEvent",
          id: "error",
          tool_call_id: "call",
          tool_name: "terminal",
          error: "Failed",
        },
      ]),
    ).toMatchObject([{ id: "action", status: "error", output: "Failed" }]);
    expect(
      projectEvents([
        action,
        {
          kind: "UserRejectObservation",
          id: "rejection",
          action_id: "action",
          tool_call_id: "call",
          tool_name: "terminal",
          rejection_reason: "Not allowed",
        },
      ]),
    ).toMatchObject([
      { id: "action", status: "rejected", output: "Not allowed" },
    ]);
    expect(
      projectEvents([
        {
          kind: "ACPToolCallEvent",
          id: "acp-start",
          tool_call_id: "acp",
          title: "Read file",
          status: "in_progress",
          raw_input: { path: "file" },
        },
        {
          kind: "ACPToolCallEvent",
          id: "acp-end",
          tool_call_id: "acp",
          title: "Read file",
          status: "completed",
          raw_output: "content",
        },
      ]),
    ).toEqual([
      {
        type: "tool",
        id: "acp-start",
        name: "Read file",
        summary: "Read file",
        status: "completed",
        input: { path: "file" },
        output: "content",
      },
    ]);
  });

  it("accumulates actual streaming text, ignores token IDs, and retires the provisional reply", () => {
    const deltas: ConversationEvent[] = [
      {
        kind: "StreamingDeltaEvent",
        id: "delta-1",
        content: "Hel",
        reasoning_content: "private reasoning",
      },
      {
        kind: "TokenEvent",
        id: "tokens",
        source: "agent",
        prompt_token_ids: [1],
        response_token_ids: [2],
      },
      { kind: "StreamingDeltaEvent", id: "delta-2", content: "lo" },
    ];
    expect(projectEvents(deltas)).toEqual([
      {
        type: "message",
        id: "delta-1",
        role: "assistant",
        text: "Hello",
        images: [],
        streaming: true,
      },
    ]);
    expect(
      projectEvents([
        ...deltas,
        {
          kind: "MessageEvent",
          id: "done",
          source: "agent",
          llm_message: { role: "assistant", content: [{ text: "Hello!" }] },
        },
      ]),
    ).toEqual([
      {
        type: "message",
        id: "done",
        role: "assistant",
        text: "Hello!",
        images: [],
      },
    ]);
  });
});
