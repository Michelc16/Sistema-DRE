'use client';
import { useCallback } from 'react';
export function FileDrop({ onFiles}: { onFiles: (files: FileList) => void}) {
    const onDrop = useCallback((e: RecordingState.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files?.lenght) onFiles(e.dataTransfer.files);
    }, [onFiles]);
    return (
        <div onDragOver={e=>e.preventDefault()} onDrop={onDrop} style={{ padding: 24, border: '2px dashed #bbb', borderRadius: 12 }}>Arraste seu arquivo aqui</div>
    );
}