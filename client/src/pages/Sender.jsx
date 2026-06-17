import { useState, useCallback } from "react";
import { useSender } from "../hooks/useWebRTC";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STATUS_LABELS = {
  idle: null,
  waiting: "Waiting for receiver to open the link…",
  connecting: "Establishing direct connection…",
  transferring: "Transferring…",
  done: "Transfer complete!",
  error: "Something went wrong.",
};

export default function Sender() {
  const { startTransfer, status, progress, speed, roomId, error } = useSender();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [copied, setCopied] = useState(false);

  const shareLink = roomId
    ? `${window.location.origin}/room/${roomId}`
    : null;

  const handleFile = useCallback(
    (f) => {
      if (!f) return;
      if (f.size > 50 * 1024 * 1024) {
        alert("File too large. Max 50 MB for browser memory.");
        return;
      }
      setFile(f);
      startTransfer(f);
    },
    [startTransfer]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      handleFile(f);
    },
    [handleFile]
  );

  const onInputChange = (e) => handleFile(e.target.files[0]);

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">P2P Share</h1>
          <p className="text-gray-400 text-sm">
            Direct browser-to-browser transfer. Your file never touches a server.
          </p>
        </div>

        {/* Drop zone — shown only in idle state */}
        {status === "idle" && (
          <label
            className={`block border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
              dragging
                ? "border-indigo-400 bg-indigo-950/40"
                : "border-gray-700 hover:border-gray-500 bg-gray-900/40"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              className="hidden"
              onChange={onInputChange}
            />
            <div className="space-y-3">
              <div className="text-5xl">📂</div>
              <p className="text-gray-300 font-medium">
                Drop a file here, or click to browse
              </p>
              <p className="text-gray-500 text-xs">Max 50 MB</p>
            </div>
          </label>
        )}

        {/* File info + status card — shown after file selected */}
        {file && status !== "idle" && (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-5 border border-gray-800">
            {/* File info */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-900/60 flex items-center justify-center text-xl">
                📄
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-gray-400 text-sm">{formatSize(file.size)}</p>
              </div>
            </div>

            {/* Share link */}
            {shareLink && (
              <div className="space-y-2">
                <p className="text-gray-400 text-xs uppercase tracking-widest">
                  Share this link
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareLink}
                    className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 border border-gray-700 outline-none"
                  />
                  <button
                    onClick={copyLink}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {/* Progress bar */}
            {(status === "transferring" || status === "done") && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{progress}%</span>
                  {status === "transferring" && <span>{formatBytes(speed)}</span>}
                  {status === "done" && <span className="text-green-400">✓ Done</span>}
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status text */}
            <p className={`text-sm text-center ${
              status === "done" ? "text-green-400" :
              status === "error" ? "text-red-400" :
              "text-gray-400"
            }`}>
              {error || STATUS_LABELS[status]}
            </p>

            {/* Connection indicator */}
            <div className="flex items-center gap-2 justify-center">
              <span className={`w-2 h-2 rounded-full ${
                status === "waiting" ? "bg-yellow-400 animate-pulse" :
                status === "connecting" ? "bg-blue-400 animate-pulse" :
                status === "transferring" ? "bg-indigo-400 animate-pulse" :
                status === "done" ? "bg-green-400" :
                status === "error" ? "bg-red-400" :
                "bg-gray-600"
              }`} />
              <span className="text-xs text-gray-500 capitalize">{status}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
