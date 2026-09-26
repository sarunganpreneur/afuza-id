import OpsShell from "../_components/OpsShell";
import ApprovalsReal from "../_components/ApprovalsReal";

export default function Page() {
  return (
    <OpsShell
      title="Approvals"
      subtitle="Human approval gate for high-impact actions across the Afuza ecosystem."
    >
      <ApprovalsReal />
    </OpsShell>
  );
}
