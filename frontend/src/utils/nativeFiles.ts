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

export async function saveFile(blob: Blob, fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }

  let notificationsEnabled = false;
  try {
    await notifyNativeFileSave(fileName, "saving");
    notificationsEnabled = true;
  } catch (error) {
    console.error("Unable to show Android file-save notification.", error);
  }

  await Filesystem.writeFile({
    path: safeFileName(fileName),
    data: await blobToBase64(blob),
    directory: Directory.Documents,
    recursive: true
  });

  if (notificationsEnabled) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });
      await notifyNativeFileSave(fileName, "saved");
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
