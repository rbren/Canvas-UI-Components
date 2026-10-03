import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentServerSettingsResponse } from "@openhands/typescript-client";
import {
  createSettingsPatch,
  SettingsForm,
  settingsFormValue,
  type SettingsFormProps,
} from "./settings-form";
afterEach(cleanup);
const settings: AgentServerSettingsResponse = {
  agent_settings: {
    mcp_config: {},
    llm: {
      model: "old-model",
      api_key: "**********",
      base_url: "https://llm.example",
    },
  },
  conversation_settings: {},
  llm_api_key_is_set: true,
};
function Form({ onSave }: Pick<SettingsFormProps, "onSave">) {
  const [value, onChange] = useState(() => settingsFormValue(settings));
  return (
    <SettingsForm
      settings={settings}
      value={value}
      onChange={onChange}
      onSave={onSave}
    />
  );
}
it("saves only changed settings and never roundtrips redacted secrets", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  render(<Form onSave={save} />);
  expect(screen.getByLabelText("API key")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
  await user.clear(screen.getByLabelText("Model"));
  await user.type(screen.getByLabelText("Model"), "new-model");
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      agent_settings_diff: { llm: { model: "new-model" } },
    }),
  );
});
it("keeps explicitly entered secrets on failure and reports the save error", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockRejectedValue(new Error("Save failed"));
  render(<Form onSave={save} />);
  await user.type(screen.getByLabelText("API key"), "new-secret");
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByLabelText("API key")).toHaveValue("new-secret");
  expect(save).toHaveBeenCalledWith({
    agent_settings_diff: { llm: { api_key: "new-secret" } },
  });
});

it("clears a removed base URL without resending a redacted key", () => {
  expect(
    createSettingsPatch(settings, {
      model: "old-model",
      baseUrl: "",
      apiKey: "**********",
    }),
  ).toEqual({ agent_settings_diff: { llm: { base_url: null } } });
});
