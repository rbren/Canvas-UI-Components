import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { classes, type UIProps } from "./common";
import { useUILabels } from "./labels";
export function sanitizeUrl(value: string, image = false): string | undefined {
  const url = value.trim();
  if (
    !url ||
    [...url].some(
      (char) =>
        char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "\\",
    ) ||
    url.startsWith("//")
  )
    return undefined;
  const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (
    protocol &&
    !["https", "http", ...(image ? [] : ["mailto"])].includes(protocol)
  )
    return undefined;
  return url;
}
export interface SafeImageProps extends UIProps {
  src: string;
  alt?: string;
  allowImages?: boolean;
}
export function SafeImage({
  src,
  alt,
  allowImages = false,
  labels: overrides,
  className,
  style,
}: SafeImageProps) {
  const labels = useUILabels(overrides);
  const safe = sanitizeUrl(src, true);
  const description = alt || labels.image;
  if (!safe) return <span>{description}</span>;
  return allowImages ? (
    <img
      className={classes("oh-image", className)}
      style={style}
      src={safe}
      alt={description}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <a
      className={classes("oh-image-link", className)}
      style={style}
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      {labels.openImage}: {description}
    </a>
  );
}
export interface MarkdownProps extends UIProps {
  text: string;
  allowImages?: boolean;
  renderCode?: (code: ReactNode, className?: string) => ReactNode;
}
export function Markdown({
  text,
  allowImages = false,
  renderCode,
  labels,
  className,
  style,
}: MarkdownProps) {
  return (
    <div className={classes("oh-markdown", className)} style={style}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => sanitizeUrl(url, key === "src") ?? ""}
        components={{
          a: ({ href, children, title }) =>
            href ? (
              <a
                href={href}
                title={title}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) => (
            <SafeImage
              src={typeof src === "string" ? src : ""}
              alt={alt}
              allowImages={allowImages}
              labels={labels}
            />
          ),
          code: ({ children, className: codeClass }) =>
            renderCode ? (
              renderCode(children, codeClass)
            ) : (
              <code className={codeClass}>{children}</code>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
