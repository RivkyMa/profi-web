import Image from "next/image";

/** Still render of the supplied GLB; consistent during loading or without WebGL. */
export function ShieldFallback({ className }: { className?: string }) {
  return (
    <Image
      src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/models/abstract-sculpture-poster.jpg`}
      alt=""
      aria-hidden
      width={532}
      height={360}
      unoptimized
      className={className}
      style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "100%" }}
    />
  );
}
