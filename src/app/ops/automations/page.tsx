import OpsShell, { Placeholder } from "../_components/OpsShell";
export default function Page() {
  return (
    <OpsShell title="Automations" subtitle="Monitor orchestration and n8n executions.">
      <Placeholder
        title="Automation Monitor"
        text="Workflow status, success rate, failures and retry controls will be connected here."
      />
    </OpsShell>
  );
}
