"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: LoginState = {};
const SAVED_MANAGEMENT_KEY_STORAGE_KEY = "pbt_management_key";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialState);
  const [managementKey, setManagementKey] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(SAVED_MANAGEMENT_KEY_STORAGE_KEY) ?? "";
  });
  const [rememberPasswd, setRememberPasswd] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return Boolean(
      window.localStorage.getItem(SAVED_MANAGEMENT_KEY_STORAGE_KEY),
    );
  });

  async function handleSubmit(formData: FormData) {
    const trimmedKey = managementKey.trim();

    if (rememberPasswd && trimmedKey) {
      window.localStorage.setItem(
        SAVED_MANAGEMENT_KEY_STORAGE_KEY,
        trimmedKey,
      );
    } else {
      window.localStorage.removeItem(SAVED_MANAGEMENT_KEY_STORAGE_KEY);
    }

    action(formData);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-[color:var(--muted)]">
        Management key
        <input
          type="password"
          name="managementKey"
          value={managementKey}
          onChange={(event) => setManagementKey(event.target.value)}
          required
          autoComplete="current-password"
          className="field rounded-2xl px-4 py-3 text-base"
          placeholder="Enter your management key"
        />
      </label>

      <label className="flex items-center gap-3 text-sm font-medium text-[color:var(--muted)]">
        <input
          type="checkbox"
          checked={rememberPasswd}
          onChange={(event) => setRememberPasswd(event.target.checked)}
          className="h-4 w-4 accent-[color:var(--accent)]"
        />
        Remember Passwd
      </label>

      {state.error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton
        pendingLabel="Verifying..."
        className="action-primary mt-2 h-11 rounded-2xl"
      >
        Open dashboard
      </SubmitButton>
    </form>
  );
}
