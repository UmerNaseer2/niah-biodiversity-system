// Release items from the Initial Release Schedule in our proposal, so the
// numbers match docs/sprint-1.md. Only the items this wireframe points at.

export const RELEASE_ITEMS: Record<number, { name: string; sprint: string }> = {
  2: { name: "User authentication and authorisation", sprint: "Sprint 1" },
  4: { name: "Role-based access control", sprint: "Sprint 1" },
  5: { name: "Mobile app skeleton and navigation", sprint: "Sprint 1" },
  6: { name: "QR code scanner", sprint: "Sprint 1" },
  7: { name: "Plant record form (mobile)", sprint: "Sprint 1" },
  8: { name: "GPS location capture", sprint: "Sprint 1" },
  9: { name: "Offline data collection", sprint: "Sprint 1 to 2" },
  10: { name: "Data sync between phone and cloud", sprint: "Sprint 2" },
  11: { name: "Photo capture (mobile)", sprint: "Sprint 2" },
  12: { name: "QR code generation", sprint: "Sprint 2" },
  13: { name: "Web platform skeleton and dashboard", sprint: "Sprint 1" },
  14: { name: "Plant database and create, edit, delete", sprint: "Sprint 1" },
  15: { name: "Conservation officer sign in (web)", sprint: "Sprint 1" },
  16: { name: "Plant information display and search", sprint: "Sprint 1" },
  17: { name: "Editing and deleting records (web)", sprint: "Sprint 2" },
  18: { name: "Botanical photo upload and gallery", sprint: "Sprint 2" },
  19: { name: "Observation approval workflow", sprint: "Sprint 2" },
  20: { name: "Species distribution maps", sprint: "Sprint 3" },
  21: { name: "Biodiversity reports and export", sprint: "Sprint 3" },
  28: { name: "IoT device integration", sprint: "Sprint 2" },
  29: { name: "Sensor data pipeline", sprint: "Sprint 2" },
  30: { name: "Environmental monitoring dashboard", sprint: "Sprint 2 to 3" },
  31: { name: "Threat detection and alerts", sprint: "Sprint 3" },
  32: { name: "IoT device tracking and GPS map", sprint: "Sprint 3" },
};

export function releaseItem(item: number) {
  const found = RELEASE_ITEMS[item];
  if (!found) throw new Error(`Item ${item} is missing from RELEASE_ITEMS`);
  return found;
}

/** The sprint all the items share, or null when they are spread out */
export function sprintFor(items: number[]) {
  const sprints = new Set(items.map((item) => releaseItem(item).sprint));
  return sprints.size === 1 ? [...sprints][0] : null;
}
