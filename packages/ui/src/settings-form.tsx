import { useId, useState, type ReactNode } from "react";
import type {
  AgentServerSettingsResponse,
  AgentServerSettingsPatchRequest,
} from "@openhands/typescript-client/clients";
import { classes, ErrorNotice, useAsyncAction, type UIProps } from "./common";
import { useUILabels } from "./labels";
export interface SettingsFormValue {
  model: string;
  apiKey: string;
  baseUrl: string;
}
export function settingsFormValue(
  settings: AgentServerSettingsResponse,
): SettingsFormValue {
  const llm = settings.agent_settings.llm;
  const values =
    llm && typeof llm === "object" ? (llm as Record<string, unknown>) : {};
  return {
    model: typeof values.model === "string" ? values.model : "",
    baseUrl: typeof values.base_url === "string" ? values.base_url : "",
    apiKey: "",
  };
}
export function createSettingsPatch(
  settings: AgentServerSettingsResponse,
  value: SettingsFormValue,
): AgentServerSettingsPatchRequest {
  const baseline = settingsFormValue(settings);
  const llm: Record<string, unknown> = {};
  if (value.model.trim() !== baseline.model) llm.model = value.model.trim();
  if (value.baseUrl.trim() !== baseline.baseUrl)
    llm.base_url = value.baseUrl.trim() || null;
  // Secrets are write-only: a server response is never used as an input value.
  if (
    value.apiKey.trim() &&
    !/^(\*+|<redacted>|\[redacted\])$/i.test(value.apiKey.trim())
  )
    llm.api_key = value.apiKey.trim();
  return Object.keys(llm).length ? { agent_settings_diff: { llm } } : {};
}
export interface SettingsFormProps extends UIProps {
  settings: AgentServerSettingsResponse;
  value: SettingsFormValue;
  onChange: (value: SettingsFormValue) => void;
  onSave: (patch: AgentServerSettingsPatchRequest) => Promise<void>;
  disabled?: boolean;
  saving?: boolean;
  error?: Error | null;
  onError?: (error: Error) => void;
  renderFooter?: (state: { dirty: boolean; saving: boolean }) => ReactNode;
}
export function SettingsForm({
  settings,
  value,
  onChange,
  onSave,
  disabled,
  saving,
  error,
  onError,
  renderFooter,
  labels: overrides,
  className,
  style,
}: SettingsFormProps) {
  const labels = useUILabels(overrides);
  const id = useId();
  const action = useAsyncAction(onError);
  const [saved, setSaved] = useState(false);
  const patch = createSettingsPatch(settings, value);
  const dirty = Object.keys(patch).length > 0;
  const busy = saving || action.pending;
  const supported = settings.agent_settings.agent_kind !== "acp";
  const change = (field: keyof SettingsFormValue, text: string) => {
    setSaved(false);
    onChange({ ...value, [field]: text });
  };
  return (
    <form
      className={classes("oh-settings-form", className)}
      style={style}
      aria-label={labels.settings}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || busy || !dirty || !supported || !value.model.trim())
          return;
        setSaved(false);
        void action.run(async () => {
          await onSave(patch);
          onChange({ ...value, apiKey: "" });
          setSaved(true);
        });
      }}
    >
      {!supported && <p role="status">{labels.unsupportedSettings}</p>}
      <fieldset
        className="oh-settings-fields"
        disabled={disabled || busy || !supported}
      >
        <legend className="oh-sr-only">{labels.settings}</legend>
        <label htmlFor={`${id}-model`}>{labels.model}</label>
        <input
          className="oh-input"
          id={`${id}-model`}
          value={value.model}
          onChange={(event) => change("model", event.target.value)}
          required
          autoComplete="off"
        />
        <label htmlFor={`${id}-key`}>{labels.apiKey}</label>
        <input
          className="oh-input"
          id={`${id}-key`}
          value={value.apiKey}
          onChange={(event) => change("apiKey", event.target.value)}
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          aria-describedby={`${id}-key-hint`}
        />
        <small className="oh-muted" id={`${id}-key-hint`}>
          {labels.apiKeyHint}
        </small>
        <label htmlFor={`${id}-url`}>{labels.baseUrl}</label>
        <input
          className="oh-input"
          id={`${id}-url`}
          value={value.baseUrl}
          onChange={(event) => change("baseUrl", event.target.value)}
          type="url"
          autoComplete="off"
          spellCheck={false}
        />
      </fieldset>
      {(action.error || error) && (
        <ErrorNotice error={(action.error || error)!} labels={labels} />
      )}
      {saved && !action.error && <p role="status">{labels.saved}</p>}
      <div className="oh-settings-footer">
        <button
          className="oh-button oh-button-primary"
          type="submit"
          disabled={
            disabled || busy || !dirty || !supported || !value.model.trim()
          }
        >
          {busy ? labels.saving : labels.saveSettings}
        </button>
        {renderFooter?.({ dirty, saving: !!busy })}
      </div>
    </form>
  );
}
