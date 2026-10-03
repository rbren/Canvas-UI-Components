import type { ReactNode } from "react";
import type { ConversationInfo } from "@openhands/canvas-core";
import { classes, ErrorNotice, useAsyncAction, type UIProps } from "./common";
import { useUILabels } from "./labels";
export interface ConversationListProps extends UIProps {
  conversations: readonly ConversationInfo[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate?: () => void | Promise<void>;
  loading?: boolean;
  error?: Error | null;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  onRetry?: () => Promise<void>;
  onError?: (error: Error) => void;
  renderConversation?: (
    conversation: ConversationInfo,
    active: boolean,
  ) => ReactNode;
  renderEmpty?: () => ReactNode;
}
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  loading,
  error,
  hasMore,
  onLoadMore,
  onRetry,
  onError,
  renderConversation,
  renderEmpty,
  labels: overrides,
  className,
  style,
}: ConversationListProps) {
  const labels = useUILabels(overrides);
  const action = useAsyncAction(onError);
  return (
    <nav
      className={classes("oh-conversations", className)}
      style={style}
      aria-label={labels.conversations}
      aria-busy={loading || action.pending}
    >
      <div className="oh-section-header">
        <h2>{labels.conversations}</h2>
        {onCreate && (
          <button
            className="oh-button"
            type="button"
            disabled={action.pending}
            onClick={() => {
              void action.run(onCreate);
            }}
          >
            {labels.newConversation}
          </button>
        )}
      </div>
      {(action.error || error) && (
        <ErrorNotice
          error={(action.error || error)!}
          labels={labels}
          retrying={action.pending}
          onRetry={
            onRetry
              ? () => {
                  void action.run(onRetry);
                }
              : undefined
          }
        />
      )}
      {loading && <p role="status">{labels.loading}</p>}
      {!loading &&
        !conversations.length &&
        (renderEmpty ? (
          renderEmpty()
        ) : (
          <p className="oh-empty">{labels.emptyConversations}</p>
        ))}
      <ul className="oh-conversation-items">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              className="oh-conversation-item"
              type="button"
              aria-current={conversation.id === activeId ? "page" : undefined}
              onClick={() => onSelect(conversation.id)}
            >
              {renderConversation ? (
                renderConversation(conversation, conversation.id === activeId)
              ) : (
                <>
                  <strong>{conversation.title || conversation.id}</strong>
                  <small className="oh-muted">
                    {conversation.execution_status}
                  </small>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
      {hasMore && onLoadMore && (
        <button
          className="oh-button"
          type="button"
          disabled={loading || action.pending}
          onClick={() => {
            void action.run(onLoadMore);
          }}
        >
          {labels.loadMore}
        </button>
      )}
    </nav>
  );
}
