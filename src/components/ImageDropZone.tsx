"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Photo picker for the receipt scanner.
 *
 * A drag target, a file input and a paste handler reach the same callback so
 * the scanner has one entry point: a photo taken on the spot, a screenshot
 * dragged in from the desktop, or an image pasted from the clipboard.
 */
export default function ImageDropZone({
  onSelect,
  disabled = false,
}: {
  onSelect: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled) return;

      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/")
      );
      if (file) onSelect(file);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled, onSelect]);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onSelect(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!disabled) pick(event.dataTransfer.files);
      }}
      className={`rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
        isDragging
          ? "border-cornflower-blue-400 bg-cornflower-blue-50"
          : "border-space-indigo-200 bg-space-indigo-50"
      }`}
    >
      {/* Deliberately no `capture` attribute. It is not "prefer the camera": it
          tells the browser to open the camera directly and skip its own chooser, so
          the photo library became unreachable. Without it, mobile browsers offer
          Take Photo / Photo Library / Choose File themselves, which is the choice
          the user should be making. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          pick(event.target.files);
          // Allows re-picking the same file after a failed scan.
          event.target.value = "";
        }}
      />

      <p className="text-sm font-medium text-space-indigo-700">
        Take a photo or pick one from your phone
      </p>
      <p className="mt-1 text-xs text-space-indigo-400">
        The photo is read on this device. Nothing is uploaded.
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-space-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
        >
          Choose a photo
        </button>
      </div>

      <p className="mt-3 text-[10px] text-space-indigo-400">
        You can also drop an image here, or paste one with Ctrl/Cmd&nbsp;+&nbsp;V.
      </p>
    </div>
  );
}
