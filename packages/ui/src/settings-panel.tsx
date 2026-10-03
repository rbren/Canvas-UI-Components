import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAgentServices, useSettings } from "@openhands/canvas-react";
import { scopeKey } from "./scope-key";
import type { AgentServerSettingsResponse } from "@openhands/typescript-client/clients";
import { classes, ErrorNotice, useAsyncAction, type UIProps } from "./common";
import { useUILabels } from "./labels";
import {
  SettingsForm,
  settingsFormValue,
  type SettingsFormProps,
} from "./settings-form";
export interface SettingsPanelProps extends UIProps {
  onError?: (error: Error) => void;
  renderHeader?: () => ReactNode;
  renderFooter?: SettingsFormProps["renderFooter"];
}
function SettingsEditor({
  settings,
  ...props
}: Omit<SettingsFormProps, "value" | "onChange"> & {
  settings: AgentServerSettingsResponse;
}) {
  const [value, setValue] = useState(() => settingsFormValue(settings));
  const baseline = useRef(settingsFormValue(settings));
  useEffect(() => {
    const next = settingsFormValue(settings);
    const old = baseline.current;
    setValue((current) => ({
      model: current.model === old.model ? next.model : current.model,
      baseUrl: current.baseUrl === old.baseUrl ? next.baseUrl : current.baseUrl,
      apiKey: current.apiKey,
    }));
    baseline.current = next;
  }, [settings]);
  return (
    <SettingsForm
      {...props}
      settings={settings}
      value={value}
      onChange={setValue}
    />
  );
}
function SettingsPanelContent({
  onError,
  renderHeader,
  renderFooter,
  labels: overrides,
  className,
  style,
}: SettingsPanelProps) {
  const state = useSettings();
  const labels = useUILabels(overrides);
  const action = useAsyncAction(onError);
  return (
    <section
      className={classes("oh-settings-panel", className)}
      style={style}
      aria-label={labels.settings}
    >
      {renderHeader ? renderHeader() : <h2>{labels.settings}</h2>}
      {state.loading && <p role="status">{labels.loading}</p>}
      {!state.settings && (action.error || state.error) && (
        <ErrorNotice
          error={(action.error || state.error)!}
          labels={labels}
          retrying={action.pending}
          onRetry={() => {
            void action.run(state.refresh);
          }}
        />
      )}
      {state.settings && (
        <SettingsEditor
          settings={state.settings}
          onSave={state.save}
          saving={state.saving}
          disabled={state.loading}
          error={state.error}
          onError={onError}
          labels={labels}
          renderFooter={renderFooter}
        />
      )}
    </section>
  );
}

export function SettingsPanel(props: SettingsPanelProps) {
  const services = useAgentServices();
  return <SettingsPanelContent key={scopeKey(services)} {...props} />;
}
