import { redirect } from "next/navigation";
import { Shield, Telescope } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { isManagerAuthenticated } from "@/lib/auth";
import { APP_TITLE } from "@/lib/constants";

export const metadata = {
  title: "Management Login",
};

export default async function LoginPage() {
  if (await isManagerAuthenticated()) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="shell-panel relative overflow-hidden rounded-[2rem] p-8 lg:p-10">
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)] to-transparent" />
          <div className="flex items-center gap-3 text-sm uppercase tracking-[0.28em] text-[color:var(--muted)]">
            <Telescope className="h-4 w-4 text-[color:var(--accent)]" />
            Web3 recon dashboard
          </div>

          <h1 className="mt-6 max-w-xl font-[var(--font-display)] text-4xl font-bold tracking-tight text-[color:var(--foreground)] sm:text-5xl">
            {APP_TITLE}
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
            Tổng hợp, quản lý và trực quan hóa danh sách GitHub repo web3 có
            security signal phù hợp cho bug bounty workflow.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="shell-pill rounded-3xl p-5">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">
                Discovery rule
              </p>
              <p className="mt-3 text-sm leading-7 text-[color:var(--foreground)]">
                Chỉ giữ lại repo có topic web3 và có README hoặc SECURITY.md
                nhắc đến bug bounty, responsible disclosure, hoặc security
                contact.
              </p>
            </div>
            <div className="shell-pill rounded-3xl p-5">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">
                Dashboard scope
              </p>
              <p className="mt-3 text-sm leading-7 text-[color:var(--foreground)]">
                Hiển thị tên repo, URL, type, security evidence và trạng thái
                submit report trong một màn hình quản trị.
              </p>
            </div>
          </div>
        </section>

        <section className="shell-panel rounded-[2rem] p-8 lg:p-10">
          <div className="flex items-center gap-3 text-sm font-medium text-[color:var(--muted)]">
            <Shield className="h-5 w-5 text-[color:var(--teal)]" />
            Management access
          </div>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight">
            Đăng nhập bằng management-key
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
            Sau khi xác thực, hệ thống tạo session cookie HTTP-only và mở dashboard.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
