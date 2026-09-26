import OpsShell, { Placeholder } from "../_components/OpsShell";
export default function Page() {
  return (
    <OpsShell title="Usage" subtitle="AI usage, token consumption and cost control.">
      <Placeholder
        title="AI Usage & Cost"
        text="OpenAI usage by project, agent, workflow and model will be displayed here."
      />
    </OpsShell>
  );
}
