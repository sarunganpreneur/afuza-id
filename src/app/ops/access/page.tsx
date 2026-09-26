import {
  redirect,
} from "next/navigation";

import OpsShell
  from "../_components/OpsShell";

import AccessTeam
  from "../_components/AccessTeam";

import {
  getOpsAccess,
} from "@/lib/ops/access";

export const dynamic =
  "force-dynamic";

export default async function AccessPage() {
  const access =
    await getOpsAccess(
      "OPS_ADMIN",
    );

  if (!access.ok) {
    redirect(
      "https://ops.afuza.id/",
    );
  }

  return (
    <OpsShell
      title="Access & Team"
      subtitle="Manage Afuza Ops membership, roles, permissions and access history."
    >
      <AccessTeam />
    </OpsShell>
  );
}
