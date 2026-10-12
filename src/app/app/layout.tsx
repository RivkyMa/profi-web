import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: { default: "App (mock)", template: "%s | PROFI app (mock)" },
  description: "Mock dashboard for PROFI. Testnet / Mock data. Not live.",
  robots: { index: false },
};

/** The dashboard has no background canvas or smooth scroll: those belong to the landing group. */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <AppShell>{children}</AppShell>;
}
