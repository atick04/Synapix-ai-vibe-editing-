"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/utils/api";
import { 
  Video, 
  FolderClock, 
  Settings, 
  LayoutTemplate,
  Wand2,
  ChevronRight,
  Play,
  UploadCloud,
  Sparkles,
  Loader2
} from "lucide-react";

export default function Dashboard() {
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
    if (dropped) {
      setFile(dropped);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    const API_URL = getApiUrl();

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
    <div className="h-full overflow-y-auto bg-transparent text-neutral-800 dark:text-neutral-200 font-sans">

      <main className="w-full p-6 md:p-8 lg:p-12 lg:pl-6 max-w-6xl mx-auto">
        <div>
          
          <header className="mb-10">
            <h1 className="text-[32px] md:text-[40px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
              Create new project
            </h1>
            <p className="text-[15px] text-neutral-500 dark:text-neutral-400">
              Upload your raw footage and let the Cinematic AI handle the rest.
            </p>
          </header>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            
            {/* Main Upload Card */}
            <div className="md:col-span-2 row-span-2 bg-white dark:bg-neutral-900 rounded-[24px] shadow-sm border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden flex flex-col transition-all duration-300">
              <div className="p-8 flex-1 flex flex-col">
                <h2 className="text-[18px] font-medium mb-6 text-neutral-900 dark:text-neutral-100">Upload Media</h2>
                
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-[20px] transition-all duration-200 relative group p-8 min-h-[300px] ${
                    isDragging 
                      ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50/80 dark:bg-neutral-800/80" 
                      : file 
                        ? "border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30" 
                        : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  {!uploading && (
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                  )}

                  {uploading ? (
                    <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                      <Loader2 className="w-8 h-8 text-neutral-900 dark:text-neutral-100 animate-spin" />
                      <span className="text-[15px] font-medium text-neutral-900 dark:text-neutral-100">Uploading and analyzing...</span>
                    </div>
                  ) : file ? (
                    <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                      <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-2">
                        <Video className="w-8 h-8 text-neutral-900 dark:text-neutral-100" />
                      </div>
                      <span className="text-[16px] font-medium text-neutral-900 dark:text-neutral-100">{file.name}</span>
                      <span className="text-[14px] text-neutral-500 dark:text-neutral-400">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                      <span className="text-[14px] text-neutral-400 dark:text-neutral-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to replace file</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-center">
                      <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform duration-300">
                        <UploadCloud className="w-8 h-8 text-neutral-600 dark:text-neutral-400" />
                      </div>
                      <h3 className="text-[16px] font-medium text-neutral-900 dark:text-neutral-100">Drag & drop your video here</h3>
                      <p className="text-[14px] text-neutral-500 dark:text-neutral-400 max-w-[260px]">
                        Support for MP4, MOV, and WebM formats up to 2GB.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className="bg-neutral-50 dark:bg-neutral-800/30 p-6 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-[14px] text-neutral-500 dark:text-neutral-400">
                  {file ? "Ready to compose" : "Select a file to begin"}
                </span>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className={`px-6 py-3 rounded-[16px] text-[15px] font-medium flex items-center gap-2 transition-all duration-200 ${
                    file && !uploading
                      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm"
                      : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
                  }`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing
                    </>
                  ) : (
                    <>
                      Start Engine
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Side Card 1: AI Commercial Generator */}
            <div className="bg-white dark:bg-neutral-900 rounded-[24px] shadow-sm border border-neutral-200/50 dark:border-neutral-800/50 p-8 flex flex-col justify-between group cursor-pointer hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-300">
              <div>
                <div className="w-12 h-12 rounded-[16px] bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center mb-6">
                  <Wand2 className="w-6 h-6 text-neutral-900 dark:text-neutral-100" />
                </div>
                <h3 className="text-[18px] font-medium text-neutral-900 dark:text-neutral-100 mb-3">Idea-to-Ad Generator</h3>
                <p className="text-[14px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Generate a commercial video completely from scratch using AI. Just type your idea.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-2 text-[14px] font-medium text-neutral-900 dark:text-neutral-100">
                <span>Try Beta</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Side Card 2: Recent Projects */}
            <div className="bg-white dark:bg-neutral-900 rounded-[24px] shadow-sm border border-neutral-200/50 dark:border-neutral-800/50 p-8 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[18px] font-medium text-neutral-900 dark:text-neutral-100">Recent</h3>
                <button className="w-8 h-8 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                  <Play className="w-4 h-4 text-neutral-600 dark:text-neutral-400 ml-0.5" />
                </button>
              </div>
              
              <div className="flex-1 flex flex-col justify-center items-center text-center">
                <FolderClock className="w-10 h-10 text-neutral-200 dark:text-neutral-800 mb-4" />
                <p className="text-[14px] text-neutral-500 dark:text-neutral-400">No recent projects found. Upload a video to start.</p>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
