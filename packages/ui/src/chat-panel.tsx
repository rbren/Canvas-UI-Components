import type { ReactNode } from "react";
import {
  AgentProvider,
  ConversationProvider,
  useConversation,
  useConversationSession,
  type UseConversationResult,
} from "@openhands/canvas-react";
import type { AgentServices } from "@openhands/canvas-core";
import { ChatComposer, type ChatComposerProps } from "./chat-composer";
import { ConnectionStatus } from "./connection-status";
import { MessageList, type MessageListProps } from "./message-list";
import { classes, ErrorNotice, useAsyncAction, type UIProps } from "./common";
import { UILabelsProvider, useUILabels } from "./labels";
import { scopeKey } from "./scope-key";
export interface ChatPanelProps extends UIProps {
  title?: ReactNode;
  disabled?: boolean;
  onError?: (error: Error) => void;
  allowImages?: boolean;
  toolRenderers?: MessageListProps["toolRenderers"];
  renderMessage?: MessageListProps["renderMessage"];
  renderTool?: MessageListProps["renderTool"];
  renderNotice?: MessageListProps["renderNotice"];
  renderEmpty?: MessageListProps["renderEmpty"];
  renderHeader?: (conversation: UseConversationResult) => ReactNode;
  renderControls?: (conversation: UseConversationResult) => ReactNode;
  renderComposer?: (props: ChatComposerProps) => ReactNode;
  renderError?: (error: Error, retry: () => void) => ReactNode;
}
function ChatPanelContent({
  title,
  disabled,
  onError,
  allowImages,
  toolRenderers,
  renderMessage,
  renderTool,
  renderNotice,
  renderEmpty,
  renderHeader,
  renderControls,
  renderComposer,
  renderError,
  labels: overrides,
  className,
  style,
}: ChatPanelProps) {
  const state = useConversation();
  const labels = useUILabels(overrides);
  const action = useAsyncAction(onError);
  const executionLabels: Record<string, string> = {
    idle: labels.idle,
    running: labels.running,
    paused: labels.paused,
    stuck: labels.stuck,
    finished: labels.finished,
    error: labels.error,
    deleting: labels.deleting,
    waiting_for_confirmation: labels.waitingForConfirmation,
  };
  const online = state.connection === "connected";
  const blocked = disabled || !online || state.loading || action.pending;
  const error = action.error || state.error;
  const retry = () => {
    void action.run(async () => {
      await state.refresh();
      state.reconnect();
    });
  };
  const composer: ChatComposerProps = {
    onSend: state.sendMessage,
    disabled: blocked || state.sending,
    pending: state.sending,
    onError,
    labels,
  };
  return (
    <UILabelsProvider labels={labels}>
      <section
        className={classes("oh-chat", className)}
        style={style}
        aria-label={typeof title === "string" ? title : labels.chat}
      >
        <header className="oh-chat-header">
          {renderHeader ? (
            renderHeader(state)
          ) : (
            <>
              <h2>{title ?? state.conversation?.title ?? labels.chat}</h2>
              <span className="oh-badge" role="status">
                {executionLabels[state.status] ?? state.status}
              </span>
              <ConnectionStatus
                connection={state.connection}
                labels={labels}
                disabled={action.pending}
                onReconnect={() => {
                  void action.run(state.reconnect);
                }}
              />
            </>
          )}
        </header>
        <div className="oh-chat-controls">
          {renderControls ? (
            renderControls(state)
          ) : (
            <>
              {state.status === "running" && (
                <button
                  className="oh-button"
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    void action.run(state.pause);
                  }}
                >
                  {labels.pause}
                </button>
              )}
              {["paused", "stuck", "error"].includes(state.status) && (
                <button
                  className="oh-button"
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    void action.run(state.resume);
                  }}
                >
                  {labels.resume}
                </button>
              )}
              {state.status === "waiting_for_confirmation" && (
                <>
                  <span role="status">{labels.confirmation}</span>
                  <button
                    className="oh-button oh-button-primary"
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      void action.run(() => state.confirm(true));
                    }}
                  >
                    {labels.approve}
                  </button>
                  <button
                    className="oh-button"
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      void action.run(() => state.confirm(false));
                    }}
                  >
                    {labels.reject}
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {error &&
          (renderError ? (
            renderError(error, retry)
          ) : (
            <ErrorNotice
              error={error}
              onRetry={retry}
              retrying={action.pending}
              labels={labels}
            />
          ))}
        <MessageList
          items={state.items}
          loading={state.loading}
          loadingOlder={state.loadingOlder}
          hasOlder={state.hasOlder}
          onLoadOlder={state.loadOlder}
          onError={onError}
          allowImages={allowImages}
          toolRenderers={toolRenderers}
          renderMessage={renderMessage}
          renderTool={renderTool}
          renderNotice={renderNotice}
          renderEmpty={renderEmpty}
          labels={labels}
        />
        {renderComposer ? (
          renderComposer(composer)
        ) : (
          <ChatComposer {...composer} />
        )}
      </section>
    </UILabelsProvider>
  );
}
export function ChatPanel(props: ChatPanelProps) {
  const session = useConversationSession();
  return <ChatPanelContent key={scopeKey(session)} {...props} />;
}
export interface AgentChatProps extends ChatPanelProps {
  services: AgentServices;
  conversationId: string;
}
export function AgentChat({
  services,
  conversationId,
  ...props
}: AgentChatProps) {
  return (
    <AgentProvider services={services}>
      <ConversationProvider conversationId={conversationId}>
        <ChatPanel {...props} />
      </ConversationProvider>
    </AgentProvider>
  );
}
