import { useParams } from "react-router-dom";
import { useReceiver } from "../hooks/useWebRTC";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STATUS_LABELS = {
  joining: "Joining room…",
  waiting: "Waiting for sender to start…",
  receiving: "Receiving file…",
  verifying: "Verifying integrity (SHA-256)…",
  done: "Download complete!",
  error: "Transfer failed.",
};

export default function Receiver() {
  const { roomId } = useParams();
  const { status, progress, speed, meta, error } = useReceiver(roomId);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">P2P Share</h1>
          <p className="text-gray-400 text-sm">
            Receiving a direct transfer. No server middleman.
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 space-y-5 border border-gray-800">
          {/* File info (available after joining) */}
          {meta ? (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-900/60 flex items-center justify-center text-xl">
                📄
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{meta.fileName}</p>
                <p className="text-gray-400 text-sm">{formatSize(meta.fileSize)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gray-800 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-800 rounded animate-pulse w-2/3" />
                <div className="h-3 bg-gray-800 rounded animate-pulse w-1/3" />
              </div>
            </div>
          )}

          {/* Progress bar */}
          {(status === "receiving" || status === "verifying" || status === "done") && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-400">
                <span>{progress}%</span>
                {status === "receiving" && <span>{formatBytes(speed)}</span>}
                {status === "verifying" && <span className="text-yellow-400">Verifying…</span>}
                {status === "done" && <span className="text-green-400">✓ Verified</span>}
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    status === "done" ? "bg-green-500" :
                    status === "verifying" ? "bg-yellow-500" :
                    "bg-indigo-500"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status message */}
          <p className={`text-sm text-center ${
            status === "done" ? "text-green-400" :
            status === "error" ? "text-red-400" :
            "text-gray-400"
          }`}>
            {error || STATUS_LABELS[status]}
          </p>

          {status === "done" && (
            <p className="text-xs text-center text-gray-500">
              SHA-256 hash verified — file integrity confirmed.
            </p>
          )}

          {/* Connection indicator */}
          <div className="flex items-center gap-2 justify-center">
            <span className={`w-2 h-2 rounded-full ${
              status === "joining" || status === "waiting" ? "bg-yellow-400 animate-pulse" :
              status === "receiving" ? "bg-indigo-400 animate-pulse" :
              status === "verifying" ? "bg-yellow-400 animate-pulse" :
              status === "done" ? "bg-green-400" :
              status === "error" ? "bg-red-400" :
              "bg-gray-600"
            }`} />
            <span className="text-xs text-gray-500 capitalize">{status}</span>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600">
          Room: <span className="font-mono text-gray-500">{roomId}</span>
        </p>
      </div>
    </div>
  );
}
