import { useId, useState, type ReactNode } from "react";
import { classes, ErrorNotice, useAsyncAction, type UIProps } from "./common";
import { useUILabels } from "./labels";
export interface ChatComposerProps extends UIProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  pending?: boolean;
  defaultValue?: string;
  onError?: (error: Error) => void;
  renderFooter?: (state: { pending: boolean; disabled: boolean }) => ReactNode;
}
export function ChatComposer({
  onSend,
  disabled = false,
  pending = false,
  defaultValue = "",
  onError,
  renderFooter,
  labels: overrides,
  className,
  style,
}: ChatComposerProps) {
  const labels = useUILabels(overrides);
  const id = useId();
  const [text, setText] = useState(defaultValue);
  const action = useAsyncAction(onError);
  const busy = pending || action.pending;
  const submit = async () => {
    if (disabled || busy || !text.trim()) return;
    const sent = text;
    if (await action.run(() => onSend(sent)))
      setText((current) => (current === sent ? "" : current));
  };
  return (
    <form
      className={classes("oh-composer", className)}
      style={style}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      aria-busy={busy}
    >
      <label className="oh-sr-only" htmlFor={id}>
        {labels.message}
      </label>
      <textarea
        id={id}
        className="oh-input oh-composer-input"
        value={text}
        disabled={disabled}
        readOnly={busy}
        rows={3}
        placeholder={labels.messagePlaceholder}
        aria-describedby={`${id}-hint`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className="oh-composer-footer">
        <small id={`${id}-hint`} className="oh-muted">
          {labels.composerHint}
        </small>
        <button
          className="oh-button oh-button-primary"
          type="submit"
          disabled={disabled || busy || !text.trim()}
        >
          {busy ? labels.sending : labels.send}
        </button>
      </div>
      {renderFooter?.({ pending: busy, disabled })}
      {action.error && <ErrorNotice error={action.error} labels={labels} />}
    </form>
  );
}
