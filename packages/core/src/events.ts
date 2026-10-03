import type {
  ACPToolCallEvent,
  ActionEvent,
  AgentErrorEvent,
  CondensationEvent,
  CondensationRequestEvent,
  CondensationSummaryEvent,
  ConversationErrorEvent,
  ConversationEvent as SDKConversationEvent,
  ConversationStateUpdateEvent,
  HookExecutionEvent,
  LLMCompletionLogEvent,
  MessageEvent,
  ObservationEvent,
  PauseEvent,
  StreamingDeltaEvent,
  SystemPromptEvent,
  TokenEvent,
  UserRejectObservation,
} from "@openhands/typescript-client";

// SDK 1.50.1's generated aggregate intersects incompatible kind literals.
// Compose its exported members until that upstream aggregate is repaired.
export type ConversationEvent =
  | SDKConversationEvent
  | ACPToolCallEvent
  | ActionEvent
  | AgentErrorEvent
  | CondensationEvent
  | CondensationRequestEvent
  | CondensationSummaryEvent
  | ConversationErrorEvent
  | ConversationStateUpdateEvent
  | HookExecutionEvent
  | LLMCompletionLogEvent
  | MessageEvent
  | ObservationEvent
  | PauseEvent
  | StreamingDeltaEvent
  | SystemPromptEvent
  | TokenEvent
  | UserRejectObservation;
