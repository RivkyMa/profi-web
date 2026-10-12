"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function AppIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app/earn");
  }, [router]);

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-ink-2">Opening the mock app...</p>
      <Button href="/app/earn">Open Earn (Mock)</Button>
    </div>
  );
}
