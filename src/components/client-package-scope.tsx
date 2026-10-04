import { Check } from "lucide-react";
import {
  AUTOMATION_DEFINITIONS,
  DELIVERABLE_DEFINITIONS,
  type PackageScope,
} from "@/lib/client-packages";

export function ClientPackageScope({ scope }: { scope: PackageScope }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {scope.campaignLimit !== null && (
          <span className="rounded-md bg-[#eef3f7] px-2.5 py-1 font-medium">
            {scope.campaignLimit} קמפיינים בחודש
          </span>
        )}
        {scope.initialCommitmentMonths === 3 && (
          <span className="rounded-md bg-[#eef3f7] px-2.5 py-1">
            התחייבות ל־3 חודשים
          </span>
        )}
        {scope.automationSetupTier > 0 && (
          <span className="rounded-md bg-[#ecfdf9] px-2.5 py-1 text-[#087f72]">
            {scope.automationSetupTier} אוטומציות + Popup
          </span>
        )}
        {scope.whatsappAddon && (
          <span className="rounded-md bg-[#ecfdf9] px-2.5 py-1 text-[#087f72]">
            WhatsApp addon
          </span>
        )}
      </div>
      {scope.deliverables.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#475467]">
          {scope.deliverables.map((code) => (
            <li className="inline-flex items-center gap-1.5" key={code}>
              <Check size={13} className="text-[#087f72]" />
              {DELIVERABLE_DEFINITIONS.find((item) => item.code === code)
                ?.label ?? code}
            </li>
          ))}
        </ul>
      )}
      {scope.automationCodes.length > 0 && (
        <ul className="grid gap-1.5 text-xs text-[#667085] sm:grid-cols-2">
          {scope.automationCodes.map((code) => (
            <li key={code} className="flex items-center gap-1.5">
              <Check size={13} className="shrink-0 text-[#087f72]" />
              <span dir="ltr">
                {AUTOMATION_DEFINITIONS.find((item) => item.code === code)
                  ?.label ?? code}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
