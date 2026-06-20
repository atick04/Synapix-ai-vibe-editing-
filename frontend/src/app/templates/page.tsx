"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/utils/api";
import Sidebar from "@/components/Sidebar";
import { 
  Sparkles, 
  Loader2, 
  UploadCloud, 
  Video,
  X,
  Type,
  Music,
  Tv,
  Play
} from "lucide-react";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const router = useRouter();
  const API_URL = getApiUrl();

  // Load templates from API
  useEffect(() => {
    fetch(`${API_URL}/api/templates`)
      .then(res => res.json())
      .then(data => {
        setTemplates(data || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load templates", err);
        setIsLoading(false);
      });
  }, [API_URL]);

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
    if (!file || !selectedTemplate) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/api/video/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      
      // Navigate to editor with selected template ID
      router.push(`/editor/${data.file_id}?filename=${data.filename}&template=${selectedTemplate.id}`);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Upload failed. Please ensure the backend is running.");
    } finally {
      setUploading(false);
      setFile(null);
      setSelectedTemplate(null);
    }
  };

  return (
    <div className="flex-1 bg-[#070709] text-white overflow-y-auto p-6 md:p-10 scrollbar-hide">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <h1 className="text-[32px] md:text-[40px] font-semibold tracking-tight text-neutral-100 mb-2 flex items-center gap-3">
            Aesthetic Templates
          </h1>
          <p className="text-[15px] text-neutral-400">
            Выберите готовый стиль Apple (Minimal & Expensive) под формат вашего видео.
          </p>
        </header>

        {isLoading ? (
          <div className="flex h-[300px] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((tpl) => (
              <div 
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl)}
                className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden group cursor-pointer hover:border-neutral-700 hover:shadow-lg transition-all duration-300 flex flex-col"
              >
                {/* Image Preview Container */}
                <div className="h-[180px] w-full relative overflow-hidden bg-neutral-950">
                  <img 
                    src={tpl.preview_url} 
                    alt={tpl.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />
                  
                  {/* Select button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                    <div className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 active:scale-95 transition-all">
                      <Play className="w-3.5 h-3.5 fill-black" />
                      Использовать стиль
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-[16px] font-semibold text-neutral-100 mb-2 group-hover:text-amber-500 transition-colors">
                      {tpl.name}
                    </h3>
                    <p className="text-[12px] text-neutral-400 leading-relaxed mb-4">
                      {tpl.description}
                    </p>
                  </div>

                  {/* Highlights list */}
                  <div className="flex flex-wrap gap-1.5 border-t border-neutral-800/80 pt-3">
                    <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-neutral-950 border border-neutral-850 flex items-center gap-1">
                      <Type className="w-2.5 h-2.5 text-blue-400" />
                      {tpl.subtitles?.font_management ? (
                        `${tpl.subtitles.font_management.base_sans_font.replace(/_24pt-Bold|-Medium|\.ttf/i, '')} + ${tpl.subtitles.font_management.accent_serif_font.replace(/-Regular|-Italic|\.ttf/i, '')}`
                      ) : (
                        "Inter + Cormorant"
                      )}
                    </span>
                    <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-neutral-950 border border-neutral-850 flex items-center gap-1">
                      <Music className="w-2.5 h-2.5 text-amber-500" />
                      SA 2.5 BGM
                    </span>
                    <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-neutral-950 border border-neutral-850 flex items-center gap-1">
                      <Tv className="w-2.5 h-2.5 text-purple-400" />
                      Smart Zoom
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Modal Overlay */}
        {selectedTemplate && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-xl p-6 relative flex flex-col shadow-2xl animate-fadeIn">
              <button 
                onClick={() => { setSelectedTemplate(null); setFile(null); }}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="mb-6">
                <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Шаблон применится автоматически</span>
                <h3 className="text-[18px] font-semibold text-white mt-1">
                  Загрузить видео для «{selectedTemplate.name}»
                </h3>
              </div>

              {/* Drag and Drop Upload container */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex-col items-center justify-center border-2 border-dashed rounded-[20px] transition-all duration-200 relative group p-8 min-h-[240px] flex ${
                  isDragging 
                    ? "border-amber-500 bg-neutral-800/40" 
                    : file 
                      ? "border-neutral-700 bg-neutral-850/30" 
                      : "border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850/20"
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
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                    <div>
                      <span className="text-[14px] font-semibold block text-neutral-250">Загрузка и ИИ-анализ...</span>
                      <span className="text-[11px] text-neutral-500 block mt-1">
                        Извлечение аудио, распознавание Whisper и анализ видеоряда Qwen3-VL
                      </span>
                    </div>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-1">
                      <Video className="w-6 h-6 text-amber-500" />
                    </div>
                    <span className="text-[14px] font-semibold text-neutral-200">{file.name}</span>
                    <span className="text-[11px] text-neutral-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform duration-300">
                      <UploadCloud className="w-6 h-6 text-neutral-400" />
                    </div>
                    <span className="text-[14px] font-semibold text-neutral-200">Перетащите видеофайл сюда</span>
                    <span className="text-[11px] text-neutral-500 max-w-[240px]">
                      Поддержка MP4, MOV, WebM. ИИ автоматически подберет саундтрек и настроит стиль.
                    </span>
                  </div>
                )}
              </div>

              {/* Action bar */}
              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-neutral-850">
                <button
                  onClick={() => { setSelectedTemplate(null); setFile(null); }}
                  className="px-4 py-2 rounded-xl text-[12px] font-semibold text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className={`px-5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-2 transition-all ${
                    file && !uploading
                      ? "bg-amber-500 hover:bg-amber-400 text-black shadow-sm active:scale-95 cursor-pointer"
                      : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  }`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    "Начать авто-монтаж"
                  )}
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
