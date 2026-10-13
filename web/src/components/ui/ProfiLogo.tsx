import Image from "next/image";
import { cn } from "@/lib/cn";

/** Display the supplied wordmark without its surrounding empty canvas. */
export function ProfiLogo({ className = "w-32" }: { className?: string }) {
  return (
    <span
      className={cn("relative block aspect-[1660/530] shrink-0 overflow-hidden", className)}
    >
      <Image
        src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/brand/profi-wordmark.png`}
        alt="PROFI"
        width={2172}
        height={724}
        unoptimized
        className="absolute h-auto max-w-none"
        style={{ width: "130.8434%", left: "-16.8675%", top: "-22.6415%" }}
      />
    </span>
  );
}
