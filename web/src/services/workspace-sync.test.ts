import { describe, expect, test } from "bun:test";

import { mergeWorkspaceSnapshots } from "./workspace-sync-merge";

describe("workspace snapshots", () => {
    test("keeps the newest project and respects deletion tombstones", () => {
        const result = mergeWorkspaceSnapshots(
            {
                projects: [{ id: "local", title: "new", updatedAt: "2026-09-16T02:00:00.000Z" } as never, { id: "deleted", title: "old", updatedAt: "2026-09-15T00:00:00.000Z" } as never],
                assets: [],
                deletedProjects: [{ id: "deleted", deletedAt: "2026-09-16T01:00:00.000Z" }],
            },
            {
                projects: [{ id: "local", title: "remote-old", updatedAt: "2026-09-16T01:00:00.000Z" } as never],
                assets: [],
                deletedProjects: [],
            },
        );
        expect(result.projects.map((item) => item.id)).toEqual(["local"]);
        expect(result.projects[0].title).toBe("new");
    });
});
