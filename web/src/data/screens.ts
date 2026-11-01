// Every screen on the site with the release items it belongs to. The
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
    items: [13, 16],
    works:
      "Search sends you to the plant list, and Recently tagged shows the newest approved records. The tag in the hero opens a real tag page.",
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
      "Text, family, IUCN status, the photo gallery and a map of where it’s been tagged. A threatened or protected species only gets a rough square on the map.",
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
    items: [12, 16, 20],
    works: "What a visitor sees after scanning. Every sample species is threatened or protected, so tag pages hide the exact spot.",
  },
  {
    title: "Staff sign in",
    path: "/login",
    items: [2, 15],
    works: "Email and password sign in with Supabase. Only conservation officers and administrators get into the dashboard, and there’s no sign up page.",
  },
];

export const staffScreens: Screen[] = [
  {
    title: "Overview",
    path: "/dashboard",
    items: [13, 20, 30],
    works: "Today's date, the records waiting for review, counts and the newest records from Supabase, a map of every plant record, and the open sensor alerts. Sensors stay off the map until item 32.",
  },
  {
    title: "Species",
    path: "/dashboard/species",
    items: [14],
    works: "The species table, read from Supabase, with edit and delete for each species.",
  },
  {
    title: "Add a species",
    path: "/dashboard/species/new",
    items: [14],
    works: "The full form, which saves to Supabase. Only Least Concern and Near Threatened species that are not protected can show their exact spot.",
  },
  {
    title: "Edit a species",
    path: "/dashboard/species/eusideroxylon-zwageri/edit",
    items: [14, 18],
    works: "The same form filled in from Supabase. The scientific name can’t change, since the public page link uses it. Under the form, photos can be uploaded, removed or made the main one.",
  },
  {
    title: "Delete a species",
    path: "/dashboard/species/eusideroxylon-zwageri/delete",
    items: [14],
    works: "Says how many records the species has and what happens to them, then deletes it from Supabase.",
  },
  {
    title: "Review queue",
    path: "/dashboard/review",
    items: [19],
    works: "Reads the waiting records from Supabase. Approve and reject save the decision, rejecting asks for a reason, and a decided record can be sent back to the queue.",
  },
  {
    title: "Reports",
    path: "/dashboard/reports",
    items: [21],
    works: "Counts of the plant records in Supabase by IUCN status, condition, species and month, filtered by date. It prints or saves as a PDF, and the server builds the CSV download after checking the role.",
  },
  {
    title: "Sensors",
    path: "/dashboard/sensors",
    items: [30, 31],
    works: "Real readings and threat alerts from Supabase, checking again every 15 seconds while the page is open. Officers and admins can acknowledge and resolve alerts. Without the sensor SQL it says so and shows no numbers.",
  },
  {
    title: "Sensor devices",
    path: "/dashboard/sensors/devices",
    items: [28, 29],
    works: "Admins add edge devices and nodes, link them, make a token that's shown once, and turn a device off.",
  },
  {
    title: "Users and roles",
    path: "/dashboard/users",
    items: [2, 4],
    works: "Who can do what, the same rules the database checks. Administrators can also invite people, change roles and deactivate accounts.",
  },
];
