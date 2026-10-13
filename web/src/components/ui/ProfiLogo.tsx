import Image from "next/image";
import { cn } from "@/lib/cn";

/** Display the supplied wordmark without its surrounding empty canvas. */
export function ProfiLogo({ className = "w-32" }: { className?: string }) {
  return (
    <span
      className={cn("relative block aspect-[1434/454] shrink-0 overflow-hidden", className)}
    >
      <Image
        src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/brand/profi-wordmark-cyan.png`}
        alt="PROFI"
        width={1672}
        height={941}
        unoptimized
        className="absolute h-auto max-w-none mix-blend-screen"
        style={{ width: "116.5969%", left: "-8.3682%", top: "-53.3040%" }}
      />
    </span>
  );
}
