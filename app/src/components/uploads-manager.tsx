"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteUpload, updateUploadLabel } from "@/app/app/projects/[id]/actions";
import { MAX_UPLOADS } from "@/lib/uploads";

export type UploadView = { id: string; label: string };

const MAX_SIDE = 1600;

/** Screenshots are often 3-5x larger than a 720×1280 video needs; shrink before sending. */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.88));
}

function UploadCard({ item, onError }: { item: UploadView; onError: (message: string) => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(item.label);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-card p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, owner-checked media route */}
      <img src={`/api/uploads/${item.id}`} alt={label || "תמונה שהעליתם"} className="aspect-[9/16] w-full rounded-xl object-cover" />
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={() => label.trim() !== item.label && start(async () => {
          const result = await updateUploadLabel(item.id, label);
          if (result.error) onError(result.error);
        })}
        maxLength={60}
        placeholder="מה רואים? (למשל: מסך הבית)"
        className="field px-3 py-2 text-sm"
      />
      <button
        type="button"
        className="btn btn-ghost px-3 py-1.5 text-xs"
        disabled={pending}
        onClick={() => start(async () => {
          const result = await deleteUpload(item.id);
          if (result.error) onError(result.error);
          else router.refresh();
        })}
      >
        הסרה
      </button>
    </li>
  );
}

/** The customer's own screenshots/photos, shown crisp in the video (never through a video model). */
export function UploadsManager({ projectId, uploads }: { projectId: string; uploads: UploadView[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_UPLOADS - uploads.length;
    const chosen = [...files].slice(0, room);
    if (files.length > room) setError(`אפשר עד ${MAX_UPLOADS} תמונות — העלינו את ${room} הראשונות.`);
    setUploading(chosen.length);
    for (const file of chosen) {
      try {
        const body = new FormData();
        body.set("file", new File([await downscale(file)], "image.jpg", { type: "image/jpeg" }));
        body.set("label", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 60));
        const response = await fetch(`/api/projects/${projectId}/uploads`, { method: "POST", body });
        if (!response.ok) setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "ההעלאה נכשלה.");
      } catch {
        setError("לא הצלחנו לקרוא את התמונה. נסו קובץ JPG או PNG.");
      }
      setUploading((left) => left - 1);
    }
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        צילומי מסך של האתר או האפליקציה, או תמונות מהעסק. הם מופיעים בסרטון חדים, כמו שהם, ברגע שהקריינות מדברת עליהם. כתבו
        ליד כל תמונה במילים ספורות מה רואים בה.
      </p>
      {uploads.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {uploads.map((item) => (
            <UploadCard key={item.id} item={item} onError={setError} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" id="uploads-input" onChange={(event) => add(event.target.files)} />
        <label htmlFor="uploads-input" className={`btn ${uploads.length >= MAX_UPLOADS || uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? `מעלה… (${uploading})` : "הוספת תמונות"}
        </label>
        <span className="text-xs text-ink-3">
          {uploads.length}/{MAX_UPLOADS} · JPG, PNG או WEBP
        </span>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
