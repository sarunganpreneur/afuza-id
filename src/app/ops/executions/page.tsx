import OpsShell from "../_components/OpsShell";
import ExecutionsReal from "../_components/ExecutionsReal";

export default function Page() {
  return (
    <OpsShell
      title="Executions"
      subtitle="Read-only visibility into the Afuza execution control plane, safety gate, lifecycle ledger and audit trail."
    >
      <ExecutionsReal />
    </OpsShell>
  );
}
