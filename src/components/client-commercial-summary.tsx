import { ClientPackageScope } from "@/components/client-package-scope";
import {
  ENGAGEMENT_TYPES,
  packageDefinition,
  packageDisplayLabel,
  type PackageCode,
  type PackageScope,
} from "@/lib/client-packages";

function amount(value: string | null) {
  if (value === null || value === "" || !Number.isFinite(Number(value)))
    return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function ClientCommercialSummary({
  packageCode,
  scope,
  monthly,
  oneTime,
}: {
  packageCode: PackageCode;
  scope: PackageScope;
  monthly: string | null;
  oneTime: string | null;
}) {
  const definition = packageDefinition(packageCode)!;
  return (
    <section
      aria-label="סיכום התקשרות"
      className="border-y border-r-2 border-[#e4e7ec] border-r-[#42dfcf] bg-white px-4 py-3"
    >
      <p className="text-xs text-[#667085]">
        {ENGAGEMENT_TYPES.find((item) => item.code === definition.type)?.label}
      </p>
      <h4 className="mt-1 text-base font-semibold text-[#111318]">
        {packageDisplayLabel(packageCode)}
      </h4>
      <dl className="my-3 grid grid-cols-2 gap-3 border-y border-[#eaecf0] py-3">
        {[
          ["ריטיינר חודשי בפועל", monthly],
          ["סכום חד פעמי בפועל", oneTime],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-[#667085]">{label}</dt>
            <dd className="mt-1 break-words text-lg font-semibold tabular-nums text-[#111318]">
              <bdi>{amount(value)}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[#667085]">התחייבות</dt>
          <dd className="mt-1">
            {scope.initialCommitmentMonths === 3
              ? "התחייבות ראשונית ל-3 חודשים"
              : definition.type === "email_management"
                ? "ללא התחייבות ראשונית"
                : "פרויקט חד-פעמי"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#667085]">הקמת אוטומציות</dt>
          <dd className="mt-1">
            {scope.automationSetupTier > 0
              ? `${scope.automationSetupTier} אוטומציות + פופאפ`
              : "ללא setup ראשוני"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#667085]">WhatsApp</dt>
          <dd className="mt-1">
            {definition.type === "whatsapp"
              ? "כלול בהתקשרות"
              : scope.whatsappAddon
                ? "כלול כתוספת"
                : "ללא תוספת"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-[#eaecf0] pt-3">
        <h5 className="mb-2 text-xs font-semibold text-[#344054]">
          היקף העבודה
        </h5>
        <ClientPackageScope scope={scope} showConfiguration={false} />
      </div>
    </section>
  );
}
