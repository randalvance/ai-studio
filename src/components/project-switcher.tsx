"use client";

import { useState } from "react";
import { createProject, selectProject, updateProject, deleteProject } from "@/app/actions";
import type { Project } from "@/lib/types";
import { AutoSubmitSelect } from "./auto-submit-select";
import { buttonClass, dangerButtonClass, ghostButtonClass, inputClass, sectionLabelClass } from "./ui";

export function ProjectSwitcher({ projects, current, kind }: { projects: Project[]; current: Project | null; kind: string }) {
  const [creating, setCreating] = useState(projects.length === 0);
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <span className={sectionLabelClass}>Project</span>
      {projects.length > 0 && (
        <form action={selectProject} className="flex gap-2">
          <input type="hidden" name="kind" value={kind} />
          <AutoSubmitSelect name="projectId" defaultValue={current?.id ?? ""} className={inputClass}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <button type="button" onClick={() => setCreating((v) => !v)} className={ghostButtonClass} title="New project">
            +
          </button>
        </form>
      )}

      {creating && (
        <form action={createProject} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <input type="hidden" name="kind" value={kind} />
          <input name="name" required placeholder="Project name" className={inputClass} autoFocus />
          <textarea name="description" rows={3} placeholder="What is this project about?" className={inputClass} />
          <div className="flex gap-2">
            <button className={buttonClass}>Create project</button>
            {projects.length > 0 && (
              <button type="button" onClick={() => setCreating(false)} className={ghostButtonClass}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {current && !creating && (
        <div className="text-xs text-muted">
          {editing ? (
            <form action={updateProject} className="flex flex-col gap-2">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="projectId" value={current.id} />
              <input name="name" defaultValue={current.name} className={inputClass} />
              <textarea name="description" defaultValue={current.description} rows={3} className={inputClass} />
              <div className="flex items-center gap-2">
                <button className={buttonClass} onClick={() => setEditing(false)}>
                  Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className={ghostButtonClass}>
                  Cancel
                </button>
                <button formAction={deleteProject} className={`${dangerButtonClass} ml-auto`}>
                  Delete project
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-left hover:text-foreground">
              {current.description ? <span className="line-clamp-3">{current.description}</span> : "Add a description…"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
