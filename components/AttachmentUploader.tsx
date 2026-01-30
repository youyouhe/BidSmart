import React, { useRef, useState } from 'react';
import { Paperclip, X, File, FileText, Image, FileCode, Download } from 'lucide-react';
import { clsx } from 'clsx';

export interface AttachmentFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

interface AttachmentUploaderProps {
  attachments: AttachmentFile[];
  onAttachmentsChange: (files: AttachmentFile[]) => void;
  maxSize?: number; // in bytes, default 10MB
  accept?: string; // MIME types, default common document types
  maxCount?: number; // max number of files, default 5
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.txt,.xls,.xlsx,.png,.jpg,.jpeg,.gif';
const DEFAULT_MAX_COUNT = 5;

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <Image size={16} />;
  if (type.includes('pdf')) return <FileText size={16} className="text-red-500" />;
  if (type.includes('word') || type.includes('document')) return <FileText size={16} className="text-blue-500" />;
  if (type.includes('sheet') || type.includes('excel')) return <FileText size={16} className="text-green-500" />;
  if (type.includes('text') || type.includes('code')) return <FileCode size={16} />;
  return <File size={16} />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({
  attachments,
  onAttachmentsChange,
  maxSize = DEFAULT_MAX_SIZE,
  accept = DEFAULT_ACCEPT,
  maxCount = DEFAULT_MAX_COUNT
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string>('');

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize) {
      return `文件 "${file.name}" 超过大小限制 (${formatFileSize(maxSize)})`;
    }
    return null;
  };

  const processFiles = (files: FileList | File[]) => {
    setError('');
    const fileArray = Array.from(files);
    const newAttachments: AttachmentFile[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      // Check max count
      if (attachments.length + newAttachments.length >= maxCount) {
        errors.push(`最多只能上传 ${maxCount} 个文件`);
        break;
      }

      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      // Create attachment object
      const attachment: AttachmentFile = {
        id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file)
      };
      newAttachments.push(attachment);
    }

    if (errors.length > 0) {
      setError(errors[0]);
      setTimeout(() => setError(''), 3000);
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (id: string) => {
    const attachment = attachments.find(a => a.id === id);
    if (attachment?.url) {
      URL.revokeObjectURL(attachment.url);
    }
    onAttachmentsChange(attachments.filter(a => a.id !== id));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="relative">
      {/* Upload Button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={attachments.length >= maxCount}
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors",
          attachments.length >= maxCount
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-gray-100 hover:bg-gray-200 text-gray-600"
        )}
        title={attachments.length >= maxCount ? `已达到最大文件数量 (${maxCount})` : "上传附件"}
      >
        <Paperclip size={14} />
        附件 ({attachments.length}/{maxCount})
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Attachments Dropdown */}
      {attachments.length > 0 && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
          {/* Drag & Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={clsx(
              "p-4 border-b border-gray-100 transition-colors",
              dragActive ? "bg-blue-50 border-blue-200" : ""
            )}
          >
            <div
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                dragActive
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              )}
            >
              <Paperclip size={20} className="mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600">
                {dragActive ? '释放文件以上传' : '拖拽文件到此处'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                或点击选择文件 • 最大 {formatFileSize(maxSize)}
              </p>
            </div>
          </div>

          {/* File List */}
          <div className="max-h-64 overflow-y-auto">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <div className="text-gray-400">
                  {getFileIcon(attachment.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {attachment.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(attachment.size)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {attachment.url && (
                    <a
                      href={attachment.url}
                      download={attachment.name}
                      className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700 transition-colors"
                      title="下载"
                    >
                      <Download size={14} />
                    </a>
                  )}
                  <button
                    onClick={() => handleRemove(attachment.id)}
                    className="p-1.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 transition-colors"
                    title="删除"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Info */}
          <div className="p-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
            {attachments.length >= maxCount
              ? `已达到最大文件数量 (${maxCount})`
              : `还可以添加 ${maxCount - attachments.length} 个文件`
            }
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-red-500 text-white text-xs rounded-lg shadow-lg z-50 whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
};

export default AttachmentUploader;
