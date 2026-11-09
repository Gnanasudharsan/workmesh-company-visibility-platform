/**
 * Synthetic demo personas for Northstar Labs (a fictional company). Used by the seed and by the
 * one-click demo login, which only works when DEMO_MODE=true outside production.
 */
export const DEMO_PERSONAS = [
  { key: "employee", email: "maya.chen@northstar.example", name: "Maya Chen", label: "Employee", description: "Software engineering intern on the Payments team." },
  { key: "manager", email: "daniel.okafor@northstar.example", name: "Daniel Okafor", label: "Manager", description: "Engineering manager for Payments and Platform." },
  { key: "lead", email: "priya.nair@northstar.example", name: "Priya Nair", label: "Project lead", description: "Product manager leading Checkout Launch across teams she doesn't manage." },
  { key: "executive", email: "elena.vasquez@northstar.example", name: "Elena Vasquez", label: "Executive", description: "Co-founder & CEO. Sees the approved roadmap and aggregate risk." },
  { key: "admin", email: "sam.patel@northstar.example", name: "Sam Patel", label: "Org admin", description: "Operations lead who manages members and configuration." },
] as const;

export const ISOLATION_PERSONA = { email: "noah.berg@meridian.example", name: "Noah Berg", org: "Meridian Systems" } as const;
