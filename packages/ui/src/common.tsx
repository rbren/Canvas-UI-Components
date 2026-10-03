import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useUILabels, type UILabels } from "./labels";
export interface UIProps {
  className?: string;
  style?: CSSProperties;
  labels?: Partial<UILabels>;
}
export function classes(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
export interface ErrorNoticeProps extends UIProps {
  error: Error | string;
  onRetry?: () => void;
  retrying?: boolean;
  renderError?: (error: Error | string) => ReactNode;
}
export function ErrorNotice({
  error,
  onRetry,
  retrying,
  renderError,
  className,
  style,
  labels: overrides,
}: ErrorNoticeProps) {
  const labels = useUILabels(overrides);
  return (
    <div className={classes("oh-error", className)} style={style} role="alert">
      {renderError ? (
        renderError(error)
      ) : (
        <span>{typeof error === "string" ? error : error.message}</span>
      )}
      {onRetry && (
        <button
          className="oh-button"
          type="button"
          disabled={retrying}
          onClick={onRetry}
        >
          {labels.retry}
        </button>
      )}
    </div>
  );
}
export function useAsyncAction(onError?: (error: Error) => void) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = async (action: () => void | Promise<unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      const failure = asError(cause);
      setError(failure);
      onError?.(failure);
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  return { run, pending, error };
}
