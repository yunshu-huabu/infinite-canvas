import { Spin } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { userApi } from "@/services/user-api";
import { useUserStore } from "@/stores/use-user-store";

export function ProtectedUserRoute({ children }: { children: ReactNode }) {
    const location = useLocation();
    const user = useUserStore((state) => state.user);
    const setSession = useUserStore((state) => state.setSession);
    const clearSession = useUserStore((state) => state.clearSession);
    const [checking, setChecking] = useState(!user);

    useEffect(() => {
        if (user) return;
        let active = true;
        userApi
            .session()
            .then(({ user: sessionUser }) => {
                if (active) setSession(sessionUser);
            })
            .catch(() => {
                if (active) clearSession();
            })
            .finally(() => {
                if (active) setChecking(false);
            });
        return () => {
            active = false;
        };
    }, [clearSession, setSession, user]);

    if (checking)
        return (
            <div className="flex h-dvh items-center justify-center bg-background">
                <Spin size="large" />
            </div>
        );
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    return children;
}
