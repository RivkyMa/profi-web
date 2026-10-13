import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { ChainGate } from "@/components/app/chain/ChainGate";

const chainMode = process.env.NEXT_PUBLIC_DATA_MODE === "chain";

export const metadata: Metadata = {
  title: chainMode
    ? { default: "App (testnet)", template: "%s | PROFI app (testnet)" }
    : { default: "App (mock)", template: "%s | PROFI app (mock)" },
  description: "Dashboard for PROFI. Testnet / Mock data. Not live.",
  robots: { index: false },
};

/** The dashboard has no background canvas or smooth scroll: those belong to the landing group. */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <ChainGate>
      <AppShell>{children}</AppShell>
    </ChainGate>
  );
}
