// Every screen on the site. /screens lists these, and nothing links to that
// page, so it's only reached by typing the address.

export type Screen = {
  title: string;
  path: string;
  works: string;
};

export const publicScreens: Screen[] = [
  {
    title: "Home",
    path: "/",
    works:
      "Search sends you to the plant list, and Recently tagged shows the newest approved records. The tag in the hero opens a real tag page.",
  },
  {
    title: "Plant list",
    path: "/plants",
    works: "Search and the status filters update as you type.",
  },
  {
    title: "Plant page",
    path: "/plants/eusideroxylon-zwageri",
    works:
      "Text, family, IUCN status, the photo gallery and a map of where it’s been tagged. A threatened or protected species only gets a rough square on the map.",
  },
  {
    title: "Scan a tag",
    path: "/tag",
    works: "Typing a tag code works, and so does scanning a printed tag with a phone camera. Botanists print the tags from the phone app.",
  },
  {
    title: "Tag page",
    path: "/tag/NNP-3F2A9C",
    works: "What a visitor sees after scanning. The tag page of a threatened or protected plant hides the exact spot.",
  },
  {
    title: "Staff sign in",
    path: "/login",
    works: "Email and password sign in with Supabase. Only conservation officers and administrators get into the dashboard, and there’s no sign up page.",
  },
];

export const staffScreens: Screen[] = [
  {
    title: "Overview",
    path: "/dashboard",
    works: "Today's date, the records waiting for review, counts and the newest records from Supabase, a map of every plant record, and the open sensor alerts.",
  },
  {
    title: "Species",
    path: "/dashboard/species",
    works: "The species table, read from Supabase, with edit and delete for each species.",
  },
  {
    title: "Add a species",
    path: "/dashboard/species/new",
    works: "The full form, which saves to Supabase. Only Least Concern and Near Threatened species that are not protected can show their exact spot.",
  },
  {
    title: "Edit a species",
    path: "/dashboard/species/eusideroxylon-zwageri/edit",
    works: "The same form filled in from Supabase. The scientific name can’t change, since the public page link uses it. Under the form, photos can be uploaded, removed or made the main one.",
  },
  {
    title: "Delete a species",
    path: "/dashboard/species/eusideroxylon-zwageri/delete",
    works: "Says how many records the species has and what happens to them, then deletes it from Supabase.",
  },
  {
    title: "Review queue",
    path: "/dashboard/review",
    works: "Reads the waiting records from Supabase. Approve and reject save the decision, rejecting asks for a reason, and a decided record can be sent back to the queue.",
  },
  {
    title: "Reports",
    path: "/dashboard/reports",
    works: "Counts of the plant records in Supabase by IUCN status, condition, species and month, filtered by date. It prints or saves as a PDF, and the server builds the CSV download after checking the role.",
  },
  {
    title: "Sensors",
    path: "/dashboard/sensors",
    works: "Real readings and threat alerts from Supabase, checking again every 15 seconds while the page is open. Officers and admins can acknowledge and resolve alerts.",
  },
  {
    title: "Sensor devices",
    path: "/dashboard/sensors/devices",
    works: "Admins add edge devices and nodes, link them, make a token that's shown once, and turn a device off.",
  },
  {
    title: "Users and roles",
    path: "/dashboard/users",
    works: "Who can do what, the same rules the database checks. Administrators can also invite people, change roles and deactivate accounts.",
  },
];
