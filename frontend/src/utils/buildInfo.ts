
export const BUILD_VERSION = (import.meta.env.VITE_BUILD_VERSION as string) || "dev";

export const BUILD_VERSION_LABEL = BUILD_VERSION === "dev" ? "" : `v1.0+${BUILD_VERSION}`;
