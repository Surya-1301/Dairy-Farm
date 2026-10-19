import { Directory, Filesystem } from "@capacitor/filesystem";
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

  await Filesystem.writeFile({
    path: safeFileName(fileName),
    data: await blobToBase64(blob),
    directory: Directory.Documents,
    recursive: true
  });
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
