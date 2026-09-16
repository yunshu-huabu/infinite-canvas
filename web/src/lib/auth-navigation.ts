export function safeReturnPath(state: unknown) {
    const from = state && typeof state === "object" && "from" in state ? String((state as { from?: string }).from || "") : "";
    return from.startsWith("/") && !from.startsWith("//") ? from : "/";
}
