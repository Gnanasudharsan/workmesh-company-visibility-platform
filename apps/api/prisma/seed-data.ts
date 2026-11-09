/**
 * SYNTHETIC DEMO DATA. Northstar Labs and Meridian Systems are fictional companies; every
 * person, project and update below is invented for local demonstration and testing.
 */

export interface PersonDef {
  key: string;
  name: string;
  title: string;
  team: string;
  manager?: string;
  role?: "OWNER" | "ADMIN" | "EXECUTIVE" | "MEMBER";
  lead?: boolean;
  location?: string;
  responsibilities?: string[];
}

export const NORTHSTAR = {
  name: "Northstar Labs",
  slug: "northstar-labs",
  departments: [
    { key: "exec", name: "Leadership", color: "#0F172A", head: "elena", description: "Company direction, strategy and portfolio decisions." },
    { key: "eng", name: "Engineering", color: "#2563EB", head: "marcus", description: "Builds and operates the Northstar platform and apps." },
    { key: "product", name: "Product", color: "#7C3AED", head: "aisha", description: "Discovers customer problems and shapes what we build." },
    { key: "design", name: "Design", color: "#DB2777", head: "isabel", description: "Product, brand and design-system craft." },
    { key: "sales", name: "Sales", color: "#16A34A", head: "tom", description: "New business, expansion and pricing." },
    { key: "marketing", name: "Marketing", color: "#D97706", head: "lina", description: "Demand generation, content and product-led growth." },
    { key: "cs", name: "Customer Success", color: "#0891B2", head: "grace", description: "Onboarding, support and long-term customer health." },
    { key: "ops", name: "Operations", color: "#64748B", head: "sam", description: "People, finance, legal and internal tooling." },
  ],
  teams: [
    { key: "executive", dept: "exec", name: "Executive Team", mission: "Set direction, allocate resources and unblock the company.", responsibilities: ["Company strategy", "Quarterly planning", "Portfolio reviews"], contact: "#leadership" },
    { key: "payments", dept: "eng", name: "Payments", mission: "Make paying Northstar effortless and trustworthy.", responsibilities: ["Checkout APIs", "Payment gateway integrations", "Invoicing", "Refunds"], contact: "#team-payments" },
    { key: "platform", dept: "eng", name: "Platform", mission: "Provide a reliable, secure foundation every team can build on.", responsibilities: ["Infrastructure", "Secrets & credentials", "Observability", "CI/CD"], contact: "#team-platform", docsUrl: "https://docs.northstar.example/platform" },
    { key: "mobile", dept: "eng", name: "Mobile", mission: "Deliver a fast, delightful Northstar experience on iOS and Android.", responsibilities: ["iOS app", "Android app", "Mobile release train"], contact: "#team-mobile" },
    { key: "data", dept: "eng", name: "Data & Insights", mission: "Turn product data into decisions.", responsibilities: ["Data warehouse", "Customer health analytics", "Reporting"], contact: "#team-data" },
    { key: "pm", dept: "product", name: "Product Management", mission: "Own the problem space and the roadmap.", responsibilities: ["Roadmap", "Discovery", "Launch readiness"], contact: "#product" },
    { key: "designteam", dept: "design", name: "Product Design", mission: "Design coherent, accessible product experiences.", responsibilities: ["UX research", "Design system", "Prototyping"], contact: "#design" },
    { key: "salesteam", dept: "sales", name: "Sales", mission: "Help the right customers succeed with Northstar.", responsibilities: ["Pipeline", "Enterprise deals", "Pricing feedback"], contact: "#sales" },
    { key: "growth", dept: "marketing", name: "Growth Marketing", mission: "Grow qualified pipeline through product-led motions.", responsibilities: ["Campaigns", "Website", "Lifecycle email", "Content"], contact: "#marketing" },
    { key: "csteam", dept: "cs", name: "Customer Success", mission: "Get every customer to value quickly and keep them there.", responsibilities: ["Onboarding", "Support escalations", "Renewals"], contact: "#customer-success" },
    { key: "peopleops", dept: "ops", name: "People & Operations", mission: "Run the company smoothly and help people do their best work.", responsibilities: ["Hiring", "Payroll & finance", "Legal", "Internal tools"], contact: "#ops" },
  ],
  people: [
    { key: "elena", name: "Elena Vasquez", title: "Co-founder & CEO", team: "executive", role: "OWNER", lead: true, location: "San Francisco", responsibilities: ["Company strategy", "Fundraising"] },
    { key: "marcus", name: "Marcus Reed", title: "CTO", team: "executive", manager: "elena", role: "EXECUTIVE", location: "San Francisco", responsibilities: ["Engineering strategy", "Architecture"] },
    { key: "aisha", name: "Aisha Rahman", title: "Chief Product Officer", team: "executive", manager: "elena", role: "EXECUTIVE", location: "New York", responsibilities: ["Product strategy", "Design"] },
    { key: "tom", name: "Tom Becker", title: "VP Sales", team: "executive", manager: "elena", role: "EXECUTIVE", location: "Chicago" },
    { key: "lina", name: "Lina Ortiz", title: "Head of Marketing", team: "executive", manager: "elena", location: "Austin" },
    { key: "grace", name: "Grace Kim", title: "Head of Customer Success", team: "executive", manager: "elena", location: "Seattle" },
    { key: "sam", name: "Sam Patel", title: "Head of Operations", team: "executive", manager: "elena", role: "ADMIN", location: "Boston", responsibilities: ["Workspace administration", "Finance", "Legal operations"] },

    { key: "daniel", name: "Daniel Okafor", title: "Engineering Manager", team: "payments", manager: "marcus", lead: true, location: "Boston", responsibilities: ["Payments team", "Platform team", "Hiring for engineering"] },
    { key: "maya", name: "Maya Chen", title: "Software Engineering Intern", team: "payments", manager: "daniel", location: "Boston", responsibilities: ["Webhook handling", "Gateway test harness"] },
    { key: "leo", name: "Leo Martins", title: "Senior Software Engineer", team: "payments", manager: "daniel", location: "Remote", responsibilities: ["Checkout API", "Payment retries"] },
    { key: "sofia", name: "Sofia Rossi", title: "Software Engineer", team: "payments", manager: "daniel", location: "Remote", responsibilities: ["Invoicing", "Refunds"] },
    { key: "arjun", name: "Arjun Mehta", title: "Software Engineer", team: "payments", manager: "daniel", location: "Boston" },
    { key: "hannah", name: "Hannah Lee", title: "Staff Engineer, Platform Lead", team: "platform", manager: "daniel", lead: true, location: "Boston", responsibilities: ["Secrets management", "Sandbox environments"] },
    { key: "ethan", name: "Ethan Brooks", title: "Platform Engineer", team: "platform", manager: "hannah", location: "Remote" },
    { key: "olivia", name: "Olivia Grant", title: "Platform Engineer", team: "platform", manager: "hannah", location: "Remote" },
    { key: "kenji", name: "Kenji Watanabe", title: "Senior Platform Engineer", team: "platform", manager: "hannah", location: "Tokyo", responsibilities: ["Observability", "On-call tooling"] },
    { key: "tariq", name: "Tariq Aziz", title: "Site Reliability Engineer", team: "platform", manager: "hannah", location: "London" },
    { key: "carlos", name: "Carlos Mendes", title: "Engineering Manager, Mobile", team: "mobile", manager: "marcus", lead: true, location: "Lisbon" },
    { key: "zoe", name: "Zoe Adams", title: "iOS Engineer", team: "mobile", manager: "carlos", location: "Remote" },
    { key: "ravi", name: "Ravi Kumar", title: "Android Engineer", team: "mobile", manager: "carlos", location: "Bangalore" },
    { key: "mia", name: "Mia Johansson", title: "Mobile Engineer", team: "mobile", manager: "carlos", location: "Stockholm" },
    { key: "elif", name: "Elif Demir", title: "QA Engineer", team: "mobile", manager: "carlos", location: "Istanbul" },
    { key: "fatima", name: "Fatima Zahra", title: "Data Engineering Lead", team: "data", manager: "marcus", lead: true, location: "Remote" },
    { key: "ben", name: "Ben Carter", title: "Data Engineer", team: "data", manager: "fatima", location: "Denver" },
    { key: "chloe", name: "Chloe Dubois", title: "Analytics Engineer", team: "data", manager: "fatima", location: "Paris" },
    { key: "lars", name: "Lars Nilsen", title: "Data Analyst", team: "data", manager: "fatima", location: "Oslo" },

    { key: "priya", name: "Priya Nair", title: "Senior Product Manager", team: "pm", manager: "aisha", lead: true, location: "New York", responsibilities: ["Checkout launch", "Payments roadmap"] },
    { key: "jordan", name: "Jordan Blake", title: "Product Manager", team: "pm", manager: "aisha", location: "New York", responsibilities: ["Customer onboarding"] },
    { key: "nina", name: "Nina Popov", title: "Product Manager, Growth", team: "pm", manager: "aisha", location: "Remote" },
    { key: "kevin", name: "Kevin O'Brien", title: "Product Operations", team: "pm", manager: "aisha", location: "Dublin" },
    { key: "isabel", name: "Isabel Cruz", title: "Design Lead", team: "designteam", manager: "aisha", lead: true, location: "Mexico City" },
    { key: "owen", name: "Owen Hughes", title: "Product Designer", team: "designteam", manager: "isabel", location: "Cardiff" },
    { key: "lucy", name: "Lucy Tran", title: "Product Designer", team: "designteam", manager: "isabel", location: "Remote" },

    { key: "rachel", name: "Rachel Green", title: "Account Executive", team: "salesteam", manager: "tom", lead: true, location: "Chicago" },
    { key: "victor", name: "Victor Ng", title: "Enterprise Account Executive", team: "salesteam", manager: "tom", location: "Singapore" },
    { key: "alicia", name: "Alicia Moreno", title: "Account Executive", team: "salesteam", manager: "tom", location: "Madrid" },
    { key: "jake", name: "Jake Wilson", title: "Sales Development Rep", team: "salesteam", manager: "rachel", location: "Chicago" },
    { key: "nora", name: "Nora Fischer", title: "Solutions Engineer", team: "salesteam", manager: "tom", location: "Berlin" },
    { key: "mei", name: "Mei Lin", title: "Account Executive", team: "salesteam", manager: "rachel", location: "Taipei" },
    { key: "max", name: "Max Weber", title: "Growth Marketer", team: "growth", manager: "lina", lead: true, location: "Austin" },
    { key: "emma", name: "Emma Clarke", title: "Lifecycle Marketing Manager", team: "growth", manager: "lina", location: "London" },
    { key: "diego", name: "Diego Ramos", title: "Web Developer", team: "growth", manager: "lina", location: "Remote" },
    { key: "hana", name: "Hana Kobayashi", title: "Content Lead", team: "growth", manager: "lina", location: "Osaka" },
    { key: "hugo", name: "Hugo Lambert", title: "Customer Success Manager", team: "csteam", manager: "grace", lead: true, location: "Montreal" },
    { key: "sara", name: "Sara Haddad", title: "Onboarding Specialist", team: "csteam", manager: "grace", location: "Remote" },
    { key: "peter", name: "Peter Novak", title: "Support Engineer", team: "csteam", manager: "hugo", location: "Prague" },
    { key: "amara", name: "Amara Okeke", title: "Customer Success Manager", team: "csteam", manager: "grace", location: "Lagos" },
    { key: "omar", name: "Omar Farouk", title: "Support Engineer", team: "csteam", manager: "hugo", location: "Cairo" },
    { key: "julia", name: "Julia Svensson", title: "People Partner", team: "peopleops", manager: "sam", lead: true, location: "Boston" },
    { key: "mark", name: "Mark Davies", title: "Finance Manager", team: "peopleops", manager: "sam", location: "Boston" },
    { key: "yuki", name: "Yuki Sato", title: "Legal Counsel", team: "peopleops", manager: "sam", location: "Remote" },
  ] as PersonDef[],
  /** Extra team memberships (cross-functional) and dotted lines. */
  extraTeams: [
    { person: "priya", team: "payments" },
    { person: "owen", team: "payments" },
  ],
  dottedLines: [{ report: "nina", manager: "lina" }],
};

export const MERIDIAN = {
  name: "Meridian Systems",
  slug: "meridian-systems",
  people: [
    { key: "noah", name: "Noah Berg", title: "Founder & CEO", team: "core", role: "OWNER", lead: true },
    { key: "ivy", name: "Ivy Larsen", title: "Engineer", team: "core", manager: "noah" },
    { key: "felix", name: "Felix Moreau", title: "Engineer", team: "core", manager: "noah" },
    { key: "ana", name: "Ana Silva", title: "Sales Lead", team: "gtm", manager: "noah", lead: true },
    { key: "raj", name: "Raj Patel", title: "Account Executive", team: "gtm", manager: "ana" },
    { key: "lea", name: "Lea Kowalski", title: "Operations", team: "gtm", manager: "noah", role: "ADMIN" },
  ] as PersonDef[],
};
