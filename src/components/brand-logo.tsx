import Image from "next/image";

export function BrandLogo({
  compact = false,
  showProductName = true,
  className = "",
}: {
  compact?: boolean;
  showProductName?: boolean;
  className?: string;
}) {
  return (
    <div dir="ltr" className={`flex min-w-0 items-center gap-3 ${className}`}>
      <Image
        src="/addz-logo.svg"
        alt="addz"
        width={196}
        height={75}
        loading="eager"
        className={compact ? "h-8 w-auto shrink-0" : "h-11 w-auto shrink-0"}
      />
      {showProductName && (
        <span className="min-w-0 border-l border-white/20 pl-3 text-left">
          <b className="block truncate text-sm font-bold text-white">Growth OS</b>
          {!compact && <small className="mt-0.5 block truncate text-[10px] text-white/50">Intelligence & Operations</small>}
        </span>
      )}
    </div>
  );
}
