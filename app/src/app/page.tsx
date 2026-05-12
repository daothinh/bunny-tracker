import { redirect } from "next/navigation";
import { isManagerAuthenticated } from "@/lib/auth";

export default async function Home() {
  const authenticated = await isManagerAuthenticated();
  redirect(authenticated ? "/dashboard" : "/login");
}
