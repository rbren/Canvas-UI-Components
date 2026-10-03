import { classes, type UIProps } from "./common";
import { useUILabels } from "./labels";
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";
export interface ConnectionStatusProps extends UIProps {
  connection: ConnectionState;
  onReconnect?: () => void;
  disabled?: boolean;
}
export function ConnectionStatus({
  connection,
  onReconnect,
  disabled,
  labels: overrides,
  className,
  style,
}: ConnectionStatusProps) {
  const labels = useUILabels(overrides);
  return (
    <div className={classes("oh-connection", className)} style={style}>
      <span
        role="status"
        className="oh-connection-state"
        data-state={connection}
      >
        <span className="oh-connection-dot" aria-hidden="true" />
        {labels[connection]}
      </span>
      {connection === "disconnected" && onReconnect && (
        <button
          className="oh-button"
          type="button"
          onClick={onReconnect}
          disabled={disabled}
        >
          {labels.reconnect}
        </button>
      )}
    </div>
  );
}
