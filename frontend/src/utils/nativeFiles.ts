import { Directory, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-z0-9._-]+/gi, "-");
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function notifyNativeFileSave(fileName: string, status: "saving" | "saved"): Promise<void> {
  if (Capacitor.getPlatform() !== "android") {
    return;
  }

  const permission = await LocalNotifications.checkPermissions();
  const notificationPermission = permission.display === "granted"
    ? permission
    : await LocalNotifications.requestPermissions();

  if (notificationPermission.display !== "granted") {
    console.warn("Android notifications are disabled; file save notifications will not be shown.");
    return;
  }

  const title = status === "saving" ? "Saving file" : "File saved";
  await LocalNotifications.schedule({
    notifications: [{
      id: 1001,
      title,
      body: status === "saving"
        ? `Saving ${fileName}...`
        : `${fileName} is available in the Downloads folder.`,
      ongoing: status === "saving",
      autoCancel: status === "saved",
      foreground: true,
      silent: status === "saving",
      isExactNotification: false,
      schedule: { at: new Date(Date.now() + 100) }
    }]
  });
}

export function requestNativePermissions(): void {
  if (typeof window === "undefined") return;
  const win = window as any;
  const bridge = win?.DairyFarmBlobDownloader || win?.PDFVerseBlobDownloader;
  if (bridge && typeof bridge.requestAppPermissions === "function") {
    try {
      bridge.requestAppPermissions();
    } catch (err) {
      console.warn("Failed to invoke requestAppPermissions:", err);
    }
  }
}

export async function saveFile(blob: Blob, fileName: string): Promise<void> {
  const safeName = safeFileName(fileName);
  const win = typeof window !== "undefined" ? (window as any) : null;
  const bridge = win?.DairyFarmBlobDownloader || win?.PDFVerseBlobDownloader;

  // 1. Direct native download via Android Java bridge interface (matches PDFVerse)
  if (bridge && typeof bridge.processBlobData === "function") {
    try {
      const base64 = await blobToBase64(blob);
      const mimeType = blob.type || (safeName.endsWith(".pdf") ? "application/pdf" : safeName.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/octet-stream");
      bridge.processBlobData(base64, safeName, mimeType);
      return;
    } catch (bridgeErr) {
      console.warn("[saveFile] Native blob downloader failed, trying fallback:", bridgeErr);
    }
  }

  // 2. Web browser download fallback
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  // 3. Fallback: LocalNotifications & Filesystem
  let notificationsEnabled = false;
  try {
    await notifyNativeFileSave(safeName, "saving");
    notificationsEnabled = true;
  } catch (error) {
    console.error("Unable to show Android file-save notification.", error);
  }

  await Filesystem.writeFile({
    path: safeName,
    data: await blobToBase64(blob),
    directory: Directory.Documents,
    recursive: true
  });

  if (notificationsEnabled) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });
      await notifyNativeFileSave(safeName, "saved");
    } catch (error) {
      console.error("Unable to show Android file-save completion notification.", error);
    }
  }
}

export async function shareFile(blob: Blob, fileName: string, title: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, files: [file] });
      return;
    }

    await saveFile(blob, fileName);
    return;
  }

  const result = await Filesystem.writeFile({
    path: safeFileName(fileName),
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true
  });

  await Share.share({
    title,
    url: result.uri,
    dialogTitle: `Share ${title}`
  });
}
