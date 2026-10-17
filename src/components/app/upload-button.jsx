'use client';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUpload } from '@/components/app/upload-provider';

export function UploadButton({ collectionId, label = 'Upload', variant = 'primary', size = 'sm' }) {
  const { openUpload } = useUpload();
  return (
    <Button variant={variant} size={size} onClick={() => openUpload({ collectionId })}>
      <Upload />
      {label}
    </Button>
  );
}
