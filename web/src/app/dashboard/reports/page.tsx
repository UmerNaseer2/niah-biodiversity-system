import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Planned } from "@/components/tape";
import { getPerson } from "@/data/people";
import { records } from "@/data/records";
import { getSpecies, hidesLocation } from "@/data/species";
import { formatDateTime } from "@/lib/format";
import { tagCode } from "@/lib/tags";
import { ReportBuilder, type ReportRow } from "./report-builder";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  // The wireframe builds the CSV in the browser. The real one (item 21)
  // should build it on the server after checking the person's role, so exact
  // spots never reach someone who isn't allowed to see them.
  const rows: ReportRow[] = [...records]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .map((r) => {
      const plant = getSpecies(r.speciesSlug);
      if (!plant) throw new Error(`Record points at a missing species: ${r.speciesSlug}`);
      return {
        id: r.id,
        code: tagCode(r.id),
        commonName: plant.commonNames[0],
        scientificName: plant.scientificName,
        family: plant.family,
        iucn: plant.iucn,
        hidesLocation: hidesLocation(plant),
        status: r.status,
        heightM: r.heightM,
        condition: r.condition,
        recordedBy: getPerson(r.recordedBy).name,
        // Spreadsheets sort "2026-10-02 10:24" properly, so the file gets that
        recordedAt: r.recordedAt.replace("T", " "),
        recordedAtLabel: formatDateTime(r.recordedAt),
        lat: r.gps?.lat ?? null,
        lng: r.gps?.lng ?? null,
        accuracyM: r.gps?.accuracyM ?? null,
        notes: r.notes ?? null,
      };
    });

  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Reports"
        description="Download plant records as a spreadsheet for SFC or for your own analysis. Pick what goes in and check the preview first."
      />
      <ReportBuilder rows={rows} />
      <Planned items={[21]} title="PDF reports and charts" className="mt-12">
        <p>
          A formatted PDF for SFC, with counts per species and condition
          over time, is part of the reports item in Sprint 3.
        </p>
      </Planned>
    </div>
  );
}
