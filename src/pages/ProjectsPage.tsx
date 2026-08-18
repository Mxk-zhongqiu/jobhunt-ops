import { projectProgress, useAppData } from "../store/appStore";

export function ProjectsPage() {
  const { projects, toggleMilestone } = useAppData();

  return (
    <div className="page">
      {projects.map((project) => {
        const progress = projectProgress(project);
        const doneCount = project.milestones.filter((item) => item.status === "done").length;
        return (
          <section className="card project-card" key={project.id}>
            <div className="card-heading">
              <div>
                <h2>{project.name}</h2>
                <p className="project-goal">{project.goal}</p>
              </div>
              <span className={`badge ${project.status === "active" ? "green" : project.status === "paused" ? "gold" : "blue"}`}>
                {project.status === "active" ? "推进中" : project.status === "paused" ? "暂停" : "已完成"}
              </span>
            </div>

            <div className="project-progress-row">
              <b>{progress}%</b>
              <div className="progress-track big"><i style={{ width: `${progress}%` }} /></div>
              <span>{doneCount} / {project.milestones.length} 里程碑</span>
            </div>

            <ul className="milestone-list">
              {project.milestones.map((milestone) => (
                <li key={milestone.id} className={milestone.status === "done" ? "done" : ""}>
                  <button type="button" className="check-box" aria-label="切换里程碑" onClick={() => toggleMilestone(project.id, milestone.id)} />
                  <div>
                    <strong>{milestone.title}</strong>
                    {milestone.targetDate ? <small>目标 {milestone.targetDate}</small> : null}
                  </div>
                  <span className={`badge ${milestone.status === "done" ? "green" : milestone.status === "active" ? "gold" : "muted"}`}>
                    {milestone.status === "done" ? "完成" : milestone.status === "active" ? "进行中" : "待办"}
                  </span>
                </li>
              ))}
            </ul>

            {project.output ? <div className="project-output">交付物：<a href={project.output} target="_blank" rel="noreferrer">{project.output}</a></div> : null}
          </section>
        );
      })}
    </div>
  );
}
