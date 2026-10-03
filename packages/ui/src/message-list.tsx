import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ChatItem,
  MessageItem,
  NoticeItem,
  ToolItem,
} from "@openhands/canvas-core";
import { classes, ErrorNotice, useAsyncAction, type UIProps } from "./common";
import { useUILabels } from "./labels";
import { MessageBubble, Notice } from "./message-bubble";
import { ToolCallCard } from "./tool-call-card";
export type ToolRenderer = (tool: ToolItem) => ReactNode;
export type ToolRendererRegistry = Readonly<Record<string, ToolRenderer>>;
export interface MessageListProps extends UIProps {
  items: readonly ChatItem[];
  loading?: boolean;
  loadingOlder?: boolean;
  hasOlder?: boolean;
  onLoadOlder?: () => Promise<void>;
  onError?: (error: Error) => void;
  allowImages?: boolean;
  toolRenderers?: ToolRendererRegistry;
  renderMessage?: (message: MessageItem) => ReactNode;
  renderTool?: ToolRenderer;
  renderNotice?: (notice: NoticeItem) => ReactNode;
  renderEmpty?: () => ReactNode;
}
const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
export function MessageList({
  items,
  loading,
  loadingOlder,
  hasOlder,
  onLoadOlder,
  onError,
  allowImages,
  toolRenderers,
  renderMessage,
  renderTool,
  renderNotice,
  renderEmpty,
  labels: overrides,
  className,
  style,
}: MessageListProps) {
  const labels = useUILabels(overrides);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  const previous = useRef<{
    first?: string;
    height: number;
    top: number;
  } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const action = useAsyncAction(onError);
  useClientLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const old = previous.current;
    const prepended =
      old?.first &&
      old.first !== items[0]?.id &&
      items.some((item) => item.id === old.first);
    if (prepended)
      element.scrollTop = old.top + element.scrollHeight - old.height;
    else if (pinned.current) element.scrollTop = element.scrollHeight;
    previous.current = {
      first: items[0]?.id,
      height: element.scrollHeight,
      top: element.scrollTop,
    };
  }, [items]);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !content.current) return;
    const observer = new ResizeObserver(() => {
      const element = viewport.current;
      if (!element) return;
      if (pinned.current) element.scrollTop = element.scrollHeight;
      if (previous.current) {
        previous.current.height = element.scrollHeight;
        previous.current.top = element.scrollTop;
      }
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const renderItem = (item: ChatItem) => {
    if (item.type === "message")
      return renderMessage ? (
        renderMessage(item)
      ) : (
        <MessageBubble
          message={item}
          allowImages={allowImages}
          labels={labels}
        />
      );
    if (item.type === "notice")
      return renderNotice ? (
        renderNotice(item)
      ) : (
        <Notice notice={item} labels={labels} />
      );
    const custom =
      toolRenderers && Object.hasOwn(toolRenderers, item.name)
        ? toolRenderers[item.name]
        : renderTool;
    return custom ? custom(item) : <ToolCallCard tool={item} labels={labels} />;
  };
  return (
    <div className={classes("oh-transcript", className)} style={style}>
      <div
        className="oh-message-scroll"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label={labels.messages}
        onScroll={() => {
          const element = viewport.current!;
          pinned.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <=
            48;
          setAtBottom(pinned.current);
          if (previous.current) {
            previous.current.top = element.scrollTop;
            previous.current.height = element.scrollHeight;
          }
        }}
      >
        {hasOlder && onLoadOlder && (
          <button
            className="oh-button oh-history-button"
            type="button"
            disabled={loadingOlder || action.pending}
            onClick={() => {
              void action.run(onLoadOlder);
            }}
          >
            {loadingOlder || action.pending ? labels.loading : labels.loadOlder}
          </button>
        )}
        {action.error && <ErrorNotice error={action.error} labels={labels} />}
        {loading && (
          <p role="status" className="oh-empty">
            {labels.loading}
          </p>
        )}
        {!loading &&
          items.length === 0 &&
          (renderEmpty ? (
            renderEmpty()
          ) : (
            <p className="oh-empty">{labels.emptyMessages}</p>
          ))}
        <ol
          className="oh-messages"
          ref={content}
          role="log"
          aria-label={labels.messages}
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={loading}
        >
          {items.map((item) => (
            <li key={item.id} className="oh-message-item">
              {renderItem(item)}
            </li>
          ))}
        </ol>
      </div>
      {!atBottom && (
        <button
          className="oh-button oh-jump"
          type="button"
          onClick={() => {
            if (viewport.current)
              viewport.current.scrollTop = viewport.current.scrollHeight;
            pinned.current = true;
            setAtBottom(true);
          }}
        >
          {labels.latest}
        </button>
      )}
    </div>
  );
}
