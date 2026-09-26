import OpsShell from "../_components/OpsShell";
import ActivityReal from "../_components/ActivityReal";

export default function Page() {
  return (
    <OpsShell
      title="Activity"
      subtitle="Real event timeline from Afuza generation and site version activity."
    >
      <ActivityReal />
    </OpsShell>
  );
}
