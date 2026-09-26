import OpsShell from "../_components/OpsShell";
import ProjectsReal from "../_components/ProjectsReal";
import TasksReal from "../_components/TasksReal";

export default function Page() {
  return (
    <OpsShell
      title="Projects"
      subtitle="Real project and generation pipeline health across Afuza."
    >
      <ProjectsReal />

      <div className="section-title">
        <h2>Execution Pulse</h2>
        <span>generation_jobs</span>
      </div>

      <TasksReal />
    </OpsShell>
  );
}
