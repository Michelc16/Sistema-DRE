'use client';

import { DragEvent, useCallback, useRef } from 'react';

interface FileDropProps {
  onFiles: (files: FileList) => void;
  accept?: string;
  label?: string;
}

export function FileDrop({ onFiles, accept, label }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      if (event.dataTransfer?.files?.length) {
        onFiles(event.dataTransfer.files);
      }
    },
    [onFiles],
  );

  const openFileDialog = () => inputRef.current?.click();

  return (
    <label
      className="file-drop"
      onClick={openFileDialog}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) onFiles(files);
        }}
      />
      {label ?? 'Arraste seu arquivo ou clique para selecionar'}
    </label>
  );
}
