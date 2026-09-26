import OpsShell from "./_components/OpsShell";
import OverviewReal from "./_components/OverviewReal";

export default function OpsPage() {
  return (
    <OpsShell
      title="Command Center"
      subtitle="Executive visibility across Afuza operations."
    >
      <OverviewReal />
    </OpsShell>
  );
}
