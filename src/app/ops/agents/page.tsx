import OpsShell from "../_components/OpsShell";
import AgentsReal from "../_components/AgentsReal";

export default function Page() {
  return (
    <OpsShell
      title="Agents"
      subtitle="Registry, capability map and operational health of Afuza's AI workforce."
    >
      <AgentsReal />
    </OpsShell>
  );
}
