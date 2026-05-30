import { useEffect, useState } from "react";
import type { AssetManifest, ClientSessionState, ProviderProfile } from "@hushline/shared";
import { getSessionV2 } from "../api-v2";
import { sessionStorageKey } from "../constants/theme-presets";

export interface BootDataState {
  assets: AssetManifest | null;
  providerProfiles: ProviderProfile[];
  restoredSession: ClientSessionState | null;
  bootError: string | null;
}

export function useBootData(): BootDataState {
  const [assets, setAssets] = useState<AssetManifest | null>(null);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([]);
  const [restoredSession, setRestoredSession] = useState<ClientSessionState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const [assetResponse, providerResponse] = await Promise.all([
        fetch("/api/assets"),
        fetch("/api/provider-profiles"),
      ]);

      if (!assetResponse.ok || !providerResponse.ok) {
        throw new Error("초기 데이터를 열 수 없습니다.");
      }

      const nextAssets = (await assetResponse.json()) as AssetManifest;
      const providerPayload = (await providerResponse.json()) as { profiles: ProviderProfile[] };

      if (!cancelled) {
        setAssets(nextAssets);
        setProviderProfiles(providerPayload.profiles);
      }

      const savedSessionId = localStorage.getItem(sessionStorageKey);
      if (savedSessionId && !cancelled) {
        try {
          const savedSession = await getSessionV2(savedSessionId);
          if (savedSession && !cancelled) {
            setRestoredSession(savedSession);
          } else {
            localStorage.removeItem(sessionStorageKey);
          }
        } catch {
          localStorage.removeItem(sessionStorageKey);
        }
      }
    }

    boot().catch((reason: unknown) => {
      if (!cancelled) {
        setBootError(reason instanceof Error ? reason.message : "초기화 실패");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    assets,
    providerProfiles,
    restoredSession,
    bootError,
  };
}
