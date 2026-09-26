import OpsShell from "../_components/OpsShell";
import AlertsReal from "../_components/AlertsReal";

export default function Page() {
  return (
    <OpsShell
      title="Alerts"
      subtitle="Derived operational alerts from the current Afuza state."
    >
      <AlertsReal />
    </OpsShell>
  );
}
