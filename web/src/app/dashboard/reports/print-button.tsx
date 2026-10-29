"use client";

import { Icon } from "@/components/icon";

/** Opens the browser's print dialog, where "Save as PDF" makes the PDF report */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-secondary print:hidden"
    >
      <Icon name="printer" className="size-4" />
      Print or save as PDF
    </button>
  );
}
