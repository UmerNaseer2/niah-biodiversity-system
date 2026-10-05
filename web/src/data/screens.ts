// Every screen in the wireframe with the release items it belongs to. The
// numbers come from the Initial Release Schedule in our proposal, the same
// ones docs/sprint-1.md uses. /screens lists these as the demo running order.

export type Screen = {
  title: string;
  path: string;
  items: number[];
  works: string;
};

export const publicScreens: Screen[] = [
  {
    title: "Home",
    path: "/",
    items: [13],
    works: "Search sends you to the plant list. The tag in the hero opens a real tag page.",
  },
  {
    title: "Plant list",
    path: "/plants",
    items: [16],
    works: "Search and the status filters update as you type.",
  },
  {
    title: "Plant page",
    path: "/plants/eusideroxylon-zwageri",
    items: [16, 18, 20],
    works:
      "Text, family and IUCN status are in. The photo gallery is item 18 (Sprint 2) and real maps are item 20 (Sprint 3).",
  },
  {
    title: "Scan a tag",
    path: "/tag",
    items: [12, 16],
    works: "Typing a tag code works. Printing the QR codes comes in item 12.",
  },
  {
    title: "Tag page",
    path: "/tag/NNP-3F2A9C",
    items: [12, 16],
    works: "What a visitor sees after scanning. Try NNP-B17D03 for a species that shows its location.",
  },
  {
    title: "Staff sign in",
    path: "/login",
    items: [2, 15],
    works: "No real sign in yet. The button opens the demo dashboard.",
  },
];

export const staffScreens: Screen[] = [
  {
    title: "Overview",
    path: "/dashboard",
    items: [13],
    works: "What needs attention today, with links into each area.",
  },
  {
    title: "Species",
    path: "/dashboard/species",
    items: [14, 17],
    works: "The species table. Edit and delete are marked for Sprint 2.",
  },
  {
    title: "Add a species",
    path: "/dashboard/species/new",
    items: [14],
    works: "The full form. Threatened species lock the location setting to rough area only.",
  },
  {
    title: "Review queue",
    path: "/dashboard/review",
    items: [19],
    works: "Approve and reject work on the page. Rejecting asks for a reason.",
  },
  {
    title: "Reports",
    path: "/dashboard/reports",
    items: [21],
    works: "The CSV download works with the mock records. Reports are a Sprint 3 item, so PDF is taped.",
  },
  {
    title: "Sensors",
    path: "/dashboard/sensors",
    items: [30, 31, 32],
    works: "Alerts can be acknowledged. Readings are made up.",
  },
  {
    title: "Users and roles",
    path: "/dashboard/users",
    items: [2, 4],
    works: "Who can do what. Invites and role changes come with real sign in.",
  },
];
