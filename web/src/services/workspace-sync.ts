import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { mergeWorkspaceSnapshots, type WorkspaceSnapshot } from "./workspace-sync-merge";

async function request<T>(init?: RequestInit) {
    const response = await fetch("/api/workspace/snapshot", { ...init, credentials: "same-origin", headers: { "content-type": "application/json", ...init?.headers } });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(body.error || `Workspace request failed: ${response.status}`);
    return body;
}

export { mergeWorkspaceSnapshots } from "./workspace-sync-merge";

export async function syncWorkspaceSnapshot() {
    if (!useCanvasStore.getState().hydrated || !useAssetStore.getState().hydrated) return;
    const [{ snapshot: remote }] = await Promise.all([request<{ snapshot: WorkspaceSnapshot }>({ method: "GET" })]);
    const local: WorkspaceSnapshot = {
        projects: useCanvasStore.getState().projects,
        assets: useAssetStore.getState().assets,
        deletedProjects: useCanvasStore.getState().deletedProjects,
    };
    const merged = mergeWorkspaceSnapshots(local, remote);
    useCanvasStore.getState().replaceProjects(merged.projects, merged.deletedProjects);
    useAssetStore.getState().replaceAssets(merged.assets);
    await request({ method: "PUT", body: JSON.stringify(merged) });
}
