import type { ConversationEvent } from "./events";
import type { ChatItem, MessageItem, ToolItem } from "./types";

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseArguments(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function projectEvents(
  events: readonly ConversationEvent[],
): ChatItem[] {
  const items: Array<ChatItem | null> = [];
  const tools = new Map<string, number>();
  let streamingIndex: number | undefined;

  const endStream = () => {
    if (streamingIndex !== undefined) items[streamingIndex] = null;
    streamingIndex = undefined;
  };
  const tool = (key: string, initial: ToolItem): ToolItem => {
    const index = tools.get(key);
    if (index !== undefined) return items[index] as ToolItem;
    tools.set(key, items.length);
    items.push(initial);
    return initial;
  };

  for (const [index, event] of events.entries()) {
    const id = event.id ?? `${event.kind}:${event.timestamp ?? index}`;
    switch (event.kind) {
      case "MessageEvent": {
        const message = event.llm_message;
        if (message.role === "tool") break;
        if (message.role === "assistant") endStream();
        const content = message.content ?? [];
        items.push({
          type: "message",
          id,
          role: message.role,
          text: content
            .flatMap((part) => ("text" in part ? [part.text] : []))
            .join("\n"),
          images: content.flatMap((part) =>
            "image_urls" in part ? part.image_urls : [],
          ),
        });
        break;
      }
      case "StreamingDeltaEvent": {
        if (!event.content) break;
        if (streamingIndex === undefined) {
          streamingIndex = items.length;
          items.push({
            type: "message",
            id,
            role: "assistant",
            text: "",
            images: [],
            streaming: true,
          });
        }
        (items[streamingIndex] as MessageItem).text += event.content;
        break;
      }
      // TokenEvent carries tokenizer IDs, not displayable text.
      case "TokenEvent":
        break;
      case "ActionEvent": {
        endStream();
        const action = event.action;
        if (action?.kind === "FinishAction") {
          items.push({
            type: "message",
            id,
            role: "assistant",
            text: String(action.message ?? ""),
            images: [],
          });
          break;
        }
        if (action?.kind === "ThinkAction") {
          items.push({
            type: "notice",
            id,
            text: String(action.thought ?? ""),
            level: "info",
          });
          break;
        }
        const thought =
          typeof event.thought === "string"
            ? event.thought
            : event.thought?.map((part) => part.text).join("\n");
        if (thought)
          items.push({
            type: "message",
            id: `${id}:thought`,
            role: "assistant",
            text: thought,
            images: [],
          });
        const item = tool(event.tool_call_id, {
          type: "tool",
          id,
          name: event.tool_name,
          input: undefined,
          status: "running",
        });
        item.id = id;
        item.input =
          action ?? parseArguments(event.tool_call?.arguments ?? "{}");
        if (event.summary) item.summary = event.summary;
        if (event.security_risk) item.risk = event.security_risk;
        break;
      }
      case "ObservationEvent": {
        const observation = asRecord(event.observation);
        if (
          observation?.kind === "FinishObservation" ||
          observation?.kind === "ThinkObservation"
        )
          break;
        const item = tool(event.tool_call_id, {
          type: "tool",
          id: event.action_id || id,
          name: event.tool_name,
          input: undefined,
          status: "running",
        });
        item.output = event.observation;
        item.status = observation?.is_error === true ? "error" : "completed";
        break;
      }
      case "AgentErrorEvent": {
        endStream();
        const position = tools.get(event.tool_call_id);
        if (position === undefined)
          items.push({ type: "notice", id, text: event.error, level: "error" });
        else
          Object.assign(items[position]!, {
            status: "error",
            output: event.error,
          });
        break;
      }
      case "UserRejectObservation": {
        const item = tool(event.tool_call_id, {
          type: "tool",
          id: event.action_id || id,
          name: event.tool_name,
          input: undefined,
          status: "running",
        });
        item.status = "rejected";
        item.output = event.rejection_reason ?? "Action rejected";
        break;
      }
      case "ACPToolCallEvent": {
        const item = tool(`acp:${event.tool_call_id}`, {
          type: "tool",
          id,
          name: event.tool_kind ?? event.title,
          summary: event.title,
          input: event.raw_input,
          status: "running",
        });
        if (event.raw_input != null) item.input = event.raw_input;
        if (event.raw_output != null || event.content != null)
          item.output = event.raw_output ?? event.content;
        if (event.is_error || event.status === "failed") item.status = "error";
        else if (event.status === "completed") item.status = "completed";
        break;
      }
      case "ConversationErrorEvent":
        endStream();
        items.push({ type: "notice", id, text: event.detail, level: "error" });
        break;
      case "FinishEvent":
        endStream();
        items.push({
          type: "message",
          id,
          role: "assistant",
          text: event.message,
          images: [],
        });
        break;
      case "ThinkEvent":
        items.push({ type: "notice", id, text: event.thought, level: "info" });
        break;
      case "StuckDetectionEvent":
        items.push({
          type: "notice",
          id,
          text: event.description,
          level: "error",
        });
        break;
    }
  }
  return items.filter((item): item is ChatItem => item !== null);
}
