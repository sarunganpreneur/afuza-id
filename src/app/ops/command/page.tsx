import OpsShell, { Placeholder } from "../_components/OpsShell";
export default function Page() {
  return (
    <OpsShell title="Command" subtitle="Natural-language control surface for Afuza.">
      <Placeholder
        title="AI Command Center"
        text="OpenAI planner, risk classification and approval gates will be connected here."
      />
    </OpsShell>
  );
}
