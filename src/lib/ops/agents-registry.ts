export type AgentStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DEGRADED"
  | "PLANNED";

export type AgentHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "NOT_CONNECTED";

export type AgentRegistryEntry = {
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  health: AgentHealth;
  scope: string[];
  capabilities: string[];
  runtime: string;
  source: "AFUZA_CORE" | "PLANNED";
  pause_state: "RUNNING" | "LOCKED" | "PAUSED";
  execution_enabled: boolean;
};

export const AGENTS_REGISTRY: AgentRegistryEntry[] = [
  {
    id: "ai-ceo",
    name: "AI CEO",
    role: "Executive Orchestrator",
    description:
      "Supervisory agent for planning, delegation and cross-agent orchestration.",
    status: "PLANNED",
    health: "NOT_CONNECTED",
    scope: ["strategy", "planning", "delegation", "agent orchestration"],
    capabilities: [
      "create plans",
      "delegate work",
      "coordinate specialist agents",
      "request approvals",
    ],
    runtime: "Future supervisory runtime",
    source: "PLANNED",
    pause_state: "LOCKED",
    execution_enabled: false,
  },
  {
    id: "website-generation-agent",
    name: "Website Generation Agent",
    role: "Website Production",
    description:
      "Existing Afuza generation pipeline that creates website content and site versions.",
    status: "ACTIVE",
    health: "HEALTHY",
    scope: ["sites", "site briefs", "site versions"],
    capabilities: [
      "analyze website brief",
      "generate website content",
      "commit site versions",
    ],
    runtime: "Afuza Core",
    source: "AFUZA_CORE",
    pause_state: "RUNNING",
    execution_enabled: true,
  },
  {
    id: "visual-generation-agent",
    name: "Visual Generation Agent",
    role: "Creative Production",
    description:
      "Existing image-generation capability used by the Afuza website generation pipeline.",
    status: "ACTIVE",
    health: "HEALTHY",
    scope: ["hero images", "product images", "section visuals"],
    capabilities: [
      "build image prompts",
      "generate AI visuals",
      "attach generated assets",
    ],
    runtime: "Afuza Core",
    source: "AFUZA_CORE",
    pause_state: "RUNNING",
    execution_enabled: true,
  },
  {
    id: "system-observer",
    name: "System Observer",
    role: "Operational Observability",
    description:
      "Read-only observer for system health, projects, execution activity and alerts.",
    status: "ACTIVE",
    health: "HEALTHY",
    scope: ["system health", "projects", "activity", "alerts"],
    capabilities: [
      "read system health",
      "derive operational alerts",
      "summarize current execution state",
    ],
    runtime: "AFUZA OPS",
    source: "AFUZA_CORE",
    pause_state: "RUNNING",
    execution_enabled: false,
  },
  {
    id: "lead-finder-agent",
    name: "Lead Finder Agent",
    role: "Customer Acquisition",
    description:
      "Planned specialist agent for discovering and qualifying prospective buyers or customers.",
    status: "PLANNED",
    health: "NOT_CONNECTED",
    scope: ["lead discovery", "qualification", "buyer research"],
    capabilities: [
      "discover leads",
      "score opportunities",
      "prepare qualified prospects",
    ],
    runtime: "Planned external workflow",
    source: "PLANNED",
    pause_state: "LOCKED",
    execution_enabled: false,
  },
  {
    id: "sales-outreach-agent",
    name: "Sales Outreach Agent",
    role: "Outbound Sales",
    description:
      "Planned agent for preparing and coordinating outbound commercial communication.",
    status: "PLANNED",
    health: "NOT_CONNECTED",
    scope: ["offers", "outreach", "follow-up"],
    capabilities: [
      "prepare outreach",
      "generate offers",
      "coordinate follow-up",
    ],
    runtime: "Planned external workflow",
    source: "PLANNED",
    pause_state: "LOCKED",
    execution_enabled: false,
  },
  {
    id: "approval-guardian",
    name: "Approval Guardian",
    role: "Risk & Approval",
    description:
      "Planned safety agent that classifies high-impact actions and routes them for human approval.",
    status: "PLANNED",
    health: "NOT_CONNECTED",
    scope: ["approvals", "risk classification", "audit"],
    capabilities: [
      "classify action risk",
      "request owner approval",
      "enforce approval gates",
    ],
    runtime: "AFUZA OPS",
    source: "PLANNED",
    pause_state: "LOCKED",
    execution_enabled: false,
  },
];
