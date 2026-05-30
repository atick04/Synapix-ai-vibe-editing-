"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith("video/")) {
      setFile(dropped);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

    try {
      const response = await fetch(`${API_URL}/api/video/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("upload failed");
      const data = await response.json();
      router.push(`/editor/${data.file_id}?filename=${data.filename}`);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Upload failed. Please ensure the backend is running at: " + API_URL);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6 select-none overflow-hidden relative"
      style={{ background: "#0B0B0F" }}
    >
      {/* Ambient glow background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(59,130,246,0.06) 0%, rgba(124,58,237,0.04) 50%, transparent 100%)",
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Main Card */}
      <div
        className="relative z-10 w-full max-w-[420px] animate-fade-blur"
        style={{ animationDelay: "0.05s" }}
      >
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="w-10 h-10 rounded-2xl mb-5 flex items-center justify-center overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 0 24px rgba(59,130,246,0.12)",
            }}
          >
            {/* Synapix icon — stylised S */}
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6 8.5C6 7.12 7.12 6 8.5 6H15.5C16.88 6 18 7.12 18 8.5C18 9.88 16.88 11 15.5 11H8.5C7.12 11 6 12.12 6 13.5C6 14.88 7.12 16 8.5 16H15.5C16.88 16 18 14.88 18 13.5"
                stroke="#F5F7FA"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <h1
            className="text-[15px] font-semibold tracking-tight mb-2"
            style={{ color: "#F5F7FA", letterSpacing: "-0.01em" }}
          >
            Synapix Cinematic Studio
          </h1>
          <p
            className="text-[12px] text-center leading-relaxed max-w-[280px]"
            style={{ color: "#5A6478" }}
          >
            AI-native video editor. Upload your footage — the system does the rest.
          </p>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="relative group cursor-pointer transition-all duration-300 mb-4"
          style={{
            borderRadius: "20px",
            background: isDragging
              ? "rgba(59,130,246,0.07)"
              : file
              ? "rgba(59,130,246,0.05)"
              : "rgba(255,255,255,0.03)",
            border: `1px dashed ${
              isDragging
                ? "rgba(59,130,246,0.5)"
                : file
                ? "rgba(59,130,246,0.35)"
                : "rgba(255,255,255,0.1)"
            }`,
            transition: "all 0.3s cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {!uploading && (
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          )}

          <div className="flex flex-col items-center justify-center py-12 px-6">
            {uploading ? (
              <div className="flex flex-col items-center gap-4">
                {/* Spinner */}
                <div
                  className="w-8 h-8 rounded-full"
                  style={{
                    border: "1.5px solid rgba(255,255,255,0.08)",
                    borderTopColor: "rgba(59,130,246,0.7)",
                    animation: "spin 0.9s linear infinite",
                  }}
                />
                <span className="text-[12px]" style={{ color: "#5A6478" }}>
                  Analyzing footage...
                </span>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center gap-3 animate-slide-up">
                {/* File icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)" }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" stroke="rgba(59,130,246,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 2v5h5M10 9l2 2 4-4" stroke="rgba(59,130,246,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[13px] font-medium" style={{ color: "#F5F7FA" }}>
                    {file.name}
                  </span>
                  <span className="text-[11px]" style={{ color: "#5A6478" }}>
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: "rgba(59,130,246,0.6)" }}>
                  click to change
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {/* Upload icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[13px] font-medium" style={{ color: "#9AA4B2" }}>
                    Drop video here
                  </span>
                  <span className="text-[11px]" style={{ color: "#5A6478" }}>
                    or click to browse
                  </span>
                </div>
                <span
                  className="text-[10px] px-3 py-1 rounded-full"
                  style={{
                    color: "#5A6478",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  MP4 · MOV · up to 500 MB
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full py-3 px-4 flex items-center justify-center gap-2.5 transition-all duration-300 font-medium text-[13px] cursor-pointer"
          style={{
            borderRadius: "14px",
            background: file && !uploading
              ? "linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(124,58,237,0.12) 100%)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${
              file && !uploading ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"
            }`,
            color: file && !uploading ? "#F5F7FA" : "#3A4151",
            boxShadow: file && !uploading ? "0 0 20px rgba(59,130,246,0.08)" : "none",
          }}
        >
          {uploading ? (
            <>
              <div
                className="w-3.5 h-3.5 rounded-full shrink-0"
                style={{
                  border: "1.5px solid rgba(255,255,255,0.15)",
                  borderTopColor: "#3B82F6",
                  animation: "spin 0.9s linear infinite",
                }}
              />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Start Composition</span>
            </>
          )}
        </button>

        {/* Bottom footnote */}
        <p className="text-center text-[10px] mt-6" style={{ color: "#3A4151" }}>
          Powered by Synapix Cinematic Engine
        </p>
      </div>
    </main>
  );
}
