import type { ReactNode } from "react";
import type { MessageItem, NoticeItem } from "@openhands/canvas-core";
import { classes, type UIProps } from "./common";
import { Markdown, SafeImage, type MarkdownProps } from "./markdown";
import { useUILabels } from "./labels";
export interface MessageBubbleProps extends UIProps {
  message: MessageItem;
  allowImages?: boolean;
  renderContent?: (message: MessageItem) => ReactNode;
  renderHeader?: (message: MessageItem) => ReactNode;
  renderFooter?: (message: MessageItem) => ReactNode;
  renderCode?: MarkdownProps["renderCode"];
}
export function MessageBubble({
  message,
  allowImages,
  renderContent,
  renderHeader,
  renderFooter,
  renderCode,
  labels: overrides,
  className,
  style,
}: MessageBubbleProps) {
  const labels = useUILabels(overrides);
  return (
    <article
      className={classes("oh-message", `oh-message-${message.role}`, className)}
      style={style}
      aria-label={labels[message.role]}
    >
      <header className="oh-message-header">
        {renderHeader ? renderHeader(message) : labels[message.role]}
      </header>
      {renderContent ? (
        renderContent(message)
      ) : (
        <>
          <Markdown
            text={message.text}
            allowImages={allowImages}
            renderCode={renderCode}
            labels={labels}
          />
          {message.images.length > 0 && (
            <div className="oh-attachments">
              {message.images.map((src, index) => (
                <SafeImage
                  key={`${index}-${src}`}
                  src={src}
                  allowImages={allowImages}
                  labels={labels}
                />
              ))}
            </div>
          )}
        </>
      )}
      {message.streaming && (
        <small className="oh-muted">{labels.streaming}</small>
      )}
      {renderFooter?.(message)}
    </article>
  );
}
export interface NoticeProps extends UIProps {
  notice: NoticeItem;
  renderContent?: (notice: NoticeItem) => ReactNode;
}
export function Notice({
  notice,
  renderContent,
  className,
  style,
}: NoticeProps) {
  return (
    <div
      className={classes(
        "oh-notice",
        notice.level === "error" && "oh-error",
        className,
      )}
      style={style}
      role={notice.level === "error" ? "alert" : "status"}
    >
      {renderContent ? renderContent(notice) : notice.text}
    </div>
  );
}
