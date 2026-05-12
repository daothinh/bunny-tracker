"use server";

import { redirect } from "next/navigation";
import { isManagementKeyValid, setManagerSession } from "@/lib/auth";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const managementKey = formData.get("managementKey");

  if (typeof managementKey !== "string" || !isManagementKeyValid(managementKey)) {
    return {
      error: "Management key khong hop le.",
    };
  }

  await setManagerSession();
  redirect("/dashboard");
}
