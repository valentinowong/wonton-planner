import { PropsWithChildren, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  DefaultOptions,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { MMKV } from "react-native-mmkv";

const createMmkv = () => {
  const isNativeRuntime =
    typeof navigator !== "undefined" && navigator.product === "ReactNative" && Platform.OS !== "web";
  if (!isNativeRuntime) return null;
  try {
    return new MMKV({ id: "planner-react-query" });
  } catch (error) {
    console.warn("Failed to initialize MMKV", error);
    return null;
  }
};

const mmkvStorage = createMmkv();

const defaultOptions: DefaultOptions = {
  queries: {
    retry: 1,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60,
  },
  mutations: {
    retry: 0,
  },
};

let queryClientSingleton: QueryClient | null = null;
let hasConfiguredManagers = false;

function configureManagers() {
  if (hasConfiguredManagers) {
    return;
  }

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (status) => {
      handleFocus(status === "active");
    });
    return () => subscription.remove();
  });

  onlineManager.setEventListener((setOnline) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const webListener = () => setOnline(window.navigator.onLine);
      window.addEventListener("online", webListener);
      window.addEventListener("offline", webListener);
      webListener();
      return () => {
        window.removeEventListener("online", webListener);
        window.removeEventListener("offline", webListener);
      };
    }
    setOnline(true);
    return () => undefined;
  });

  hasConfiguredManagers = true;
}

function createStoragePersister() {
  if (Platform.OS === "web" || typeof window === "undefined") {
    // Hydrating large query caches from localStorage blocks the web UI, so only persist on native.
    return null;
  }

  if (!mmkvStorage) {
    return null;
  }

  const storage = {
    getItem: async (key: string) => mmkvStorage.getString(key) ?? null,
    setItem: async (key: string, value: string) => {
      mmkvStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mmkvStorage.delete(key);
    },
  };

  return createAsyncStoragePersister({
    storage,
    key: "planner-query-cache",
  });
}

function createQueryClient() {
  configureManagers();

  const client = new QueryClient({
    queryCache: new QueryCache(),
    defaultOptions,
  });

  const persister = createStoragePersister();
  if (persister) {
    persistQueryClient({
      queryClient: client,
      persister,
      maxAge: 1000 * 60 * 60 * 24,
    });
  }

  return client;
}

export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => {
    if (!queryClientSingleton) {
      queryClientSingleton = createQueryClient();
    }
    return queryClientSingleton;
  });

  // Re-run persister setup on web reloads where QueryClient survives Fast Refresh.
  useEffect(() => {
    if (!queryClientSingleton) {
      return;
    }
    const persister = createStoragePersister();
    if (persister) {
      persistQueryClient({
        queryClient: queryClientSingleton,
        persister,
        maxAge: 1000 * 60 * 60 * 24,
      });
    }
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
