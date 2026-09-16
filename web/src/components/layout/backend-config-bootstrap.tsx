import { Spin } from "antd";
import { useEffect, useState, type ReactNode } from "react";

import { fetchBackendConfig } from "@/services/backend-config";
import { useConfigStore } from "@/stores/use-config-store";

export function BackendConfigBootstrap({ children }: { children: ReactNode }) {
    const [settled, setSettled] = useState(false);
    const applyBackendConfig = useConfigStore((state) => state.applyBackendConfig);
    const setBackendConfigReady = useConfigStore((state) => state.setBackendConfigReady);

    useEffect(() => {
        let active = true;
        fetchBackendConfig()
            .then((config) => {
                if (active) applyBackendConfig(config);
            })
            .catch(() => {
                if (active) setBackendConfigReady(true);
            })
            .finally(() => {
                if (active) setSettled(true);
            });
        return () => {
            active = false;
        };
    }, [applyBackendConfig, setBackendConfigReady]);

    if (!settled) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background">
                <Spin size="large" />
            </div>
        );
    }
    return children;
}
