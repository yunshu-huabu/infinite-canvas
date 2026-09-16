import type { Asset } from "@/stores/use-asset-store";
import type { CanvasDeletedProject, CanvasProject } from "@/stores/canvas/use-canvas-store";

export type WorkspaceSnapshot = {
    projects: CanvasProject[];
    assets: Asset[];
    deletedProjects: CanvasDeletedProject[];
    updatedAt?: string;
};

export function mergeWorkspaceSnapshots(local: WorkspaceSnapshot, remote: WorkspaceSnapshot): WorkspaceSnapshot {
    const deleted = new Map<string, CanvasDeletedProject>();
    for (const item of [...(local.deletedProjects || []), ...(remote.deletedProjects || [])]) {
        if (!item?.id || !item.deletedAt) continue;
        const current = deleted.get(item.id);
        if (!current || item.deletedAt > current.deletedAt) deleted.set(item.id, item);
    }
    const projects = mergeById(local.projects || [], remote.projects || [], "updatedAt").filter((project) => {
        const tombstone = deleted.get(project.id);
        if (!tombstone) return true;
        if (project.updatedAt > tombstone.deletedAt) {
            deleted.delete(project.id);
            return true;
        }
        return false;
    });
    return {
        projects,
        assets: mergeById(local.assets || [], remote.assets || [], "updatedAt"),
        deletedProjects: [...deleted.values()],
    };
}

function mergeById<T extends { id: string; updatedAt: string }>(local: T[], remote: T[], key: "updatedAt") {
    const merged = new Map<string, T>();
    for (const item of remote) if (item?.id) merged.set(item.id, item);
    for (const item of local) {
        if (!item?.id) continue;
        const current = merged.get(item.id);
        if (!current || item[key] >= current[key]) merged.set(item.id, item);
    }
    return [...merged.values()].sort((a, b) => b[key].localeCompare(a[key]));
}
