// Made-up staff accounts for the wireframe. The emails use example.com on
// purpose, never put real names or emails in mock data.

export type Role =
  | "visitor"
  | "botanist"
  | "conservation_officer"
  | "admin";

export const ROLE_LABEL: Record<Role, string> = {
  visitor: "Visitor",
  botanist: "Botanist",
  conservation_officer: "Conservation officer",
  admin: "Administrator",
};

export type Person = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastActive: string;
};

export const people: Person[] = [
  {
    id: "mira",
    name: "Mira Tan",
    email: "mira.tan@example.com",
    role: "conservation_officer",
    active: true,
    lastActive: "2026-10-04T08:55",
  },
  {
    id: "daniel",
    name: "Daniel Jong",
    email: "daniel.jong@example.com",
    role: "conservation_officer",
    active: true,
    lastActive: "2026-10-04T08:12",
  },
  {
    id: "siti",
    name: "Siti Rahman",
    email: "siti.rahman@example.com",
    role: "botanist",
    active: true,
    lastActive: "2026-10-03T11:05",
  },
  {
    id: "grace",
    name: "Grace Ling",
    email: "grace.ling@example.com",
    role: "admin",
    active: true,
    lastActive: "2026-10-04T07:45",
  },
  {
    id: "alex",
    name: "Alex Lau",
    email: "alex.lau@example.com",
    role: "visitor",
    active: true,
    lastActive: "2026-10-02T16:30",
  },
  {
    id: "hafiz",
    name: "Hafiz Osman",
    email: "hafiz.osman@example.com",
    role: "visitor",
    active: false,
    lastActive: "2026-08-14T10:00",
  },
];

/** The demo is always signed in as this person */
export const DEMO_USER_ID = "mira";

export function getPerson(id: string) {
  const person = people.find((p) => p.id === id);
  if (!person) throw new Error(`No mock person called ${id}`);
  return person;
}
