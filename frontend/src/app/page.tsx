"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/utils/api";
import AccessKeyModal from "@/components/AccessKeyModal";
import Background3D, { Background3DRef } from "@/components/Background3D";
import { useLanguage } from "@/context/LanguageContext";
import { 
  Video, 
  FolderClock, 
  ChevronRight,
  Play,
  UploadCloud,
  Loader2,
  Lightbulb,
  Info,
  Sparkles,
  FileVideo,
  BrainCircuit,
  Wand2,
  Trash2,
  Volume2,
  VolumeX,
  Music
} from "lucide-react";

interface RecentProject {
  id: string;
  filename: string;
  date: string;
}

const FORMAT_CARDS = [
  { titleKey: "YouTube Long", defaultTitle: "YouTube Long", ratio: "16:9", src: "/formats/youtube-long.png" },
  { titleKey: "YouTube Shorts", defaultTitle: "YouTube Shorts", ratio: "9:16", src: "/formats/youtube-shorts.png" },
  { titleKey: "Reels / TikTok", defaultTitle: "Reels / TikTok", ratio: "9:16", src: "/formats/reels-tiktok.png" },
  { titleKey: "SaaS Demo", defaultTitle: "SaaS Demo", ratio: "16:9", src: "/formats/saas-demo.png" },
  { titleKey: "Подкаст", defaultTitle: "Podcast", ratio: "16:9", src: "/formats/podcast.png" },
  { titleKey: "Обучающее видео", defaultTitle: "Tutorial", ratio: "16:9", src: "/formats/training.png" },
];

const PRODUCT_TAGLINES = {
  en: [
    "Create Your Vibe",
    "AI-Powered Motion & Cinematic Video Editing",
    "Drop Your Clips & Let AI Compose the Story",
    "Instant Smart B-Roll & High-Impact Cuts",
    "Export High-Resolution Motion Graphics",
    "Transform Creative Ideas into Visual Masterpieces",
  ],
  ru: [
    "Создай Свой Вайб",
    "ИИ-Монтаж и Кинематографичный Видеодизайн",
    "Загрузи Клипы и ИИ Создаст Готовый Сюжет",
    "Мгновенный Авто-B-Roll и Динамичные Склейки",
    "Экспорт Графики и Видео Высокого Разрешения",
    "Превращай Идеи в Визуальные Шедевры",
  ],
};

export default function Dashboard() {
  const { lang, setLang, t } = useLanguage();
  const bg3dRef = useRef<Background3DRef>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const [sloganIndex, setSloganIndex] = useState(0);
  const [sloganFade, setSloganFade] = useState(true);

  // Rotate product feature callouts every 5 seconds when music plays
  useEffect(() => {
    if (!isAudioPlaying) return;

    const interval = setInterval(() => {
      setSloganFade(false);
      setTimeout(() => {
        setSloganIndex((prev) => (prev + 1) % PRODUCT_TAGLINES[lang].length);
        setSloganFade(true);
      }, 400);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAudioPlaying, lang]);

  const [accessKeyReady, setAccessKeyReady] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [accessKeyError, setAccessKeyError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>("YouTube Long");
  const router = useRouter();

  useEffect(() => {
      setIsMounted(true);
      const savedKey = localStorage.getItem('vibe_access_key');
      const savedLogin = localStorage.getItem('vibe_user_login');
      if (savedKey) {
          setAccessKeyReady(true);
      }
      const API_URL = getApiUrl();

      if (savedKey && savedLogin) {
          // Validate key immediately on mount
          const validateOnMount = async () => {
              try {
                  const res = await fetch(`${API_URL}/api/admin/validate-key?key=${encodeURIComponent(savedKey)}&login=${encodeURIComponent(savedLogin)}`);
                  const data = await res.json();
                  if (data.valid) {
                      setAccessKeyReady(true);
                  } else {
                      handleAuthError(data.reason || 'access_key_invalid');
                  }
              } catch (err) {
                  setAccessKeyReady(true);
              }
          };
          validateOnMount();
      }
      try {
        const stored = localStorage.getItem("vibe_recent_projects");
        if (stored) {
          setRecentProjects(JSON.parse(stored));
        }
      } catch (e) {
        console.error(e);
      }
  }, []);

  // Periodic check to detect token expiration while the dashboard is open
  useEffect(() => {
      if (!accessKeyReady) return;
      const API_URL = getApiUrl();
      const interval = setInterval(async () => {
          const savedKey = localStorage.getItem('vibe_access_key');
          const savedLogin = localStorage.getItem('vibe_user_login');
          if (savedKey && savedLogin) {
              try {
                  const res = await fetch(`${API_URL}/api/admin/validate-key?key=${encodeURIComponent(savedKey)}&login=${encodeURIComponent(savedLogin)}`);
                  const data = await res.json();
                  if (!data.valid) {
                      handleAuthError(data.reason || 'access_key_invalid');
                  }
              } catch (err) {
                  // Ignore network error to avoid false positives
              }
          }
      }, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
  }, [accessKeyReady]);

  useEffect(() => {
    const tipCount = t?.tips?.length || 1;
    const interval = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % tipCount);
    }, 10000);
    return () => clearInterval(interval);
  }, [t?.tips?.length]);

  const handleAccessKeySuccess = (login: string, key: string) => {
      setAccessKeyError('');
      setAccessKeyReady(true);
  };

  const handleAuthError = (detail: string) => {
    localStorage.removeItem('vibe_access_key');
    localStorage.removeItem('vibe_user_login');
    
    const reasons: Record<string, string> = {
      access_key_required: 'Доступ отклонен: Требуется ключ доступа.',
      access_key_invalid: 'Доступ отклонен: Неверный ключ или логин.',
      access_key_expired: 'Доступ отклонен: Срок действия ключа истёк.',
      access_key_revoked: 'Доступ отклонен: Ключ был отозван администратором.',
      access_key_limit_reached: 'Доступ отклонен: Исчерпан лимит токенов.',
    };
    
    const errorMsg = reasons[detail] || 'Доступ отклонен. Проверьте данные для входа.';
    setAccessKeyError(errorMsg);
    setAccessKeyReady(false);
  };

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
      const accessKey = localStorage.getItem('vibe_access_key') || '';
      const accessLogin = localStorage.getItem('vibe_user_login') || '';

      const response = await fetch(`${API_URL}/api/video/upload`, {
        method: "POST",
        headers: {
          "X-Access-Key": accessKey,
          "X-User-Login": encodeURIComponent(accessLogin),
        },
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 403) {
          handleAuthError(errorData.detail || 'access_key_invalid');
          return;
        }
        throw new Error("upload failed");
      }
      const data = await response.json();
      
      try {
        const stored = localStorage.getItem("vibe_recent_projects");
        let projects = stored ? JSON.parse(stored) : [];
        projects = [{
          id: data.file_id,
          filename: file.name,
          date: new Date().toISOString()
        }, ...projects.filter((p: any) => p.id !== data.file_id)].slice(0, 10);
        localStorage.setItem("vibe_recent_projects", JSON.stringify(projects));
        setRecentProjects(projects);
      } catch(e) {
        console.error(e);
      }

      const formatMap: Record<string, string> = {
        "YouTube Long": "youtube_long",
        "YouTube Shorts": "tutorial",
        "Reels / TikTok": "coaching",
        "SaaS Demo": "saas",
        "Подкаст": "aesthetic_cursive",
        "Обучающее видео": "educational"
      };
      const templateId = formatMap[selectedFormat] || "youtube_long";
      router.push(`/editor/${data.file_id}?filename=${data.filename}&template=${templateId}`);
    } catch (error: any) {
      console.error("Upload failed", error);
      if (!localStorage.getItem('vibe_access_key')) {
        // Auth redirect already occurred inside handleAuthError
        return;
      }
      alert("Upload failed. Please ensure the backend is running at: " + API_URL);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-full w-full overflow-hidden bg-transparent font-sans relative text-neutral-800 dark:text-neutral-200">
      {/* Three.js Interactive 3D Audio-Reactive Floating Glass Logo Background */}
      <Background3D ref={bg3dRef} onAudioStateChange={setIsAudioPlaying} />

      {/* 3D Slogan & 5s Rotating Product Feature Callouts Overlay */}
      <div className={`fixed inset-x-0 bottom-12 md:bottom-16 pointer-events-none flex flex-col items-center justify-center transition-all duration-1000 z-20 ${
        isAudioPlaying ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
      }`}>
        <div className="flex flex-col items-center text-center space-y-2 max-w-3xl px-6">
          <h2 className="font-montserrat text-[44px] sm:text-[58px] md:text-[72px] font-normal text-white tracking-[0.03em] drop-shadow-[0_0_25px_rgba(255,255,255,0.45)]">
            Synapix
          </h2>

          {/* Dynamic 5s Tagline Carousel with Smooth Dissolve Fade */}
          <div className="min-h-[36px] flex items-center justify-center">
            <p className={`font-montserrat text-[13px] sm:text-[15px] md:text-[17px] font-light tracking-[0.32em] uppercase text-neutral-200/90 drop-shadow-[0_0_12px_rgba(255,255,255,0.3)] transition-all duration-500 ${
              sloganFade ? "opacity-100 translate-y-0 filter-none" : "opacity-0 translate-y-2 blur-sm"
            }`}>
              {PRODUCT_TAGLINES[lang][sloganIndex]}
            </p>
          </div>

          {/* Sleek Step Progress Indicator Dots */}
          <div className="flex items-center gap-1.5 mt-2">
            {PRODUCT_TAGLINES[lang].map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === sloganIndex
                    ? "w-6 bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]"
                    : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Floating Header Audio Bar - Always accessible so user can toggle music back off */}
      <div className="fixed top-5 right-5 lg:right-12 z-50 flex items-center gap-3">
        <div className="flex items-center gap-1.5 p-0.5 px-1 rounded-full liquid-glass border border-white/10 text-[11px] font-semibold shadow-xl">
          <button
            type="button"
            onClick={() => bg3dRef.current?.toggleAudio()}
            className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
              isAudioPlaying 
                ? "bg-sky-400/20 text-sky-400 border border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.3)]" 
                : "text-neutral-400 hover:text-white"
            }`}
            title={isAudioPlaying ? "Mute music & restore UI" : "Play music & reveal 3D scene"}
          >
            {isAudioPlaying ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                <span className="text-[11.5px] font-bold">Sound ON</span>
                <span className="flex items-center gap-0.5 ml-0.5">
                  <span className="w-0.5 h-2 bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-0.5 h-3 bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-0.5 h-1.5 bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-[11.5px]">Sound OFF</span>
              </>
            )}
          </button>

          <input 
            type="file" 
            ref={audioInputRef} 
            accept="audio/*" 
            className="hidden" 
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                bg3dRef.current?.loadCustomAudio(e.target.files[0]);
              }
            }}
          />
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-sky-400 transition-colors cursor-pointer"
            title="Upload custom background track (.mp3)"
          >
            <Music className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Ambient Glow Circles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 transition-colors duration-1000">
        <div className="absolute -top-[15%] left-[20%] w-[650px] h-[650px] rounded-full bg-gradient-to-br from-cyan-500/10 via-sky-400/5 to-transparent blur-[140px] mix-blend-screen" />
        <div className="absolute top-[35%] -right-[10%] w-[550px] h-[550px] rounded-full bg-gradient-to-tr from-sky-400/10 via-cyan-300/5 to-transparent blur-[130px] mix-blend-screen" />
      </div>

      {isMounted && !accessKeyReady && <AccessKeyModal onSuccess={handleAccessKeySuccess} initialError={accessKeyError} />}
      
      <main className={`w-full h-full p-4 lg:p-6 xl:px-12 flex flex-col mx-auto max-w-[2500px] transition-all duration-1000 ease-in-out ${
        isAudioPlaying ? "opacity-0 pointer-events-none scale-95" : "opacity-100 pointer-events-auto scale-100"
      }`}>
        <div className="max-w-[1800px] mx-auto w-full h-full flex flex-col">
          <header className="mb-4 lg:mb-6 mt-2 shrink-0 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-[32px] md:text-[38px] font-semibold tracking-tight leading-tight mb-1">
                <span className="text-neutral-900 dark:text-white">{t.heroTitlePrefix}</span>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-cyan-300 to-white font-bold">{t.heroTitleHighlight}</span>
              </h1>
              <p className="text-[14px] text-neutral-500 dark:text-neutral-400 max-w-xl leading-relaxed">
                {t.heroSubtitle}<strong className="text-neutral-300 font-semibold">{t.heroSubtitleBold}</strong>{t.heroSubtitleSuffix}
              </p>
            </div>
            
            <div className="flex items-center gap-3 self-center md:self-auto pr-36">
              {/* Sleek Minimalist Language Switcher Pill */}
              <div className="flex items-center p-0.5 rounded-full liquid-glass border border-white/10 text-[11px] font-semibold">
                <button 
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${lang === 'en' ? 'bg-sky-400 text-black shadow-sm font-bold' : 'text-neutral-400 hover:text-white'}`}
                >
                  EN
                </button>
                <button 
                  type="button"
                  onClick={() => setLang('ru')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${lang === 'ru' ? 'bg-sky-400 text-black shadow-sm font-bold' : 'text-neutral-400 hover:text-white'}`}
                >
                  RU
                </button>
              </div>

              <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 liquid-glass-pill shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[12px] font-medium text-neutral-200">{t.engineVersion}</span>
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 pb-4">
            
            {/* Left Column: History & Tips */}
            <div className="lg:col-span-4 flex flex-col gap-4 lg:gap-6 min-h-0">
              
              {/* Dynamic Tips Card */}
              <div className="relative group rounded-[20px] overflow-hidden shrink-0">
                <div className="relative liquid-glass-card p-5.5 flex flex-col rounded-[20px]">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="w-7 h-7 rounded-full bg-sky-500/15 border border-sky-400/20 flex items-center justify-center">
                      <Lightbulb className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <h3 className="text-[14px] font-semibold text-neutral-900 dark:text-white tracking-tight">{t.aiTipTitle}</h3>
                  </div>
                  <p key={currentTipIndex} className="text-[12.5px] text-neutral-400 leading-relaxed min-h-[38px] flex items-center animate-in fade-in slide-in-from-bottom-1 duration-500">
                    {t.tips[currentTipIndex % t.tips.length]}
                  </p>
                  
                  {/* Pagination Dots indicator */}
                  <div className="flex gap-1.5 mt-3.5">
                    {t.tips.map((_, i) => (
                      <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === (currentTipIndex % t.tips.length) ? 'w-5 bg-sky-400' : 'w-1.5 bg-neutral-700'}`} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Projects */}
              <div className="liquid-glass-card rounded-[20px] p-5.5 flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-3.5 shrink-0">
                  <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-white tracking-tight">{t.recentProjects}</h3>
                  <button className="w-7 h-7 rounded-full liquid-glass-pill flex items-center justify-center hover:scale-105 transition-all cursor-pointer">
                    <Play className="w-3 h-3 text-white ml-0.5" />
                  </button>
                </div>
                
                <div className="flex-1 flex flex-col justify-center items-center text-center overflow-y-auto custom-scrollbar">
                  {recentProjects.length > 0 ? (
                    <div className="w-full flex flex-col gap-2 p-1 h-full overflow-y-auto">
                      {recentProjects.map(p => (
                        <div 
                          key={p.id}
                          className="flex items-center gap-3 p-2.5 rounded-[12px] liquid-glass hover:border-sky-400/40 cursor-pointer transition-all border border-white/5 group text-left shrink-0"
                          onClick={() => router.push(`/editor/${p.id}?filename=${encodeURIComponent(p.filename)}`)}
                        >
                          <div className="w-9 h-9 rounded-[10px] bg-neutral-900/80 border border-white/10 flex items-center justify-center shrink-0">
                             <Video className="w-4 h-4 text-sky-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[12.5px] font-medium text-neutral-200 truncate">{p.filename}</h4>
                            <p className="text-[10.5px] text-neutral-500 mt-0.5">{new Date(p.date).toLocaleDateString()}</p>
                          </div>
                          <button 
                            className="p-1 rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newProjects = recentProjects.filter(rp => rp.id !== p.id);
                              setRecentProjects(newProjects);
                              localStorage.setItem("vibe_recent_projects", JSON.stringify(newProjects));
                            }}
                          >
                             <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-red-400 transition-colors" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="w-11 h-11 rounded-full liquid-glass-pill flex items-center justify-center mb-2.5">
                        <FolderClock className="w-4.5 h-4.5 text-neutral-400" />
                      </div>
                      <p className="text-[12.5px] text-neutral-400 max-w-[200px] leading-relaxed">{t.noRecentProjects}</p>
                    </>
                  )}
                </div>
              </div>

            </div>

            {/* Right Column: Upload & How it works */}
            <div className="lg:col-span-8 flex flex-col gap-4 lg:gap-6 min-h-0">
              
              {/* Main Upload Card */}
              <div className="liquid-glass-card rounded-[20px] overflow-hidden flex flex-col transition-all duration-300 flex-1 min-h-[280px]">
                <div className="p-5.5 flex-1 flex flex-col relative min-h-0">
                  
                  {/* Subtle Glow Circle */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-[80px] -z-10 pointer-events-none"></div>
                  
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`flex-1 flex flex-col items-center justify-center border border-dashed rounded-[18px] transition-all duration-300 relative group p-6 min-h-0 ${
                      isDragging 
                        ? "border-sky-400 bg-sky-500/10 scale-[1.005]" 
                        : file 
                          ? "border-sky-400/50 liquid-glass" 
                          : "border-white/15 hover:border-sky-400/60 liquid-glass"
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
                      <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                        <div className="relative flex items-center justify-center">
                           <div className="absolute w-14 h-14 rounded-full bg-sky-500/20 animate-ping"></div>
                           <Loader2 className="w-7 h-7 text-sky-400 animate-spin relative z-10" />
                        </div>
                        <span className="text-[14px] font-medium text-white">{t.uploadingText}</span>
                      </div>
                    ) : file ? (
                      <div className="flex flex-col items-center gap-2.5 animate-in fade-in zoom-in duration-300 text-center">
                        <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-sky-400 to-cyan-500 p-[1px]">
                           <div className="w-full h-full bg-neutral-900 rounded-[13px] flex items-center justify-center">
                             <Video className="w-5 h-5 text-sky-400" />
                           </div>
                        </div>
                        <div>
                          <h3 className="text-[15px] font-semibold text-white mt-0.5">{file.name}</h3>
                          <p className="text-[12px] text-neutral-400 mt-0.5">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                        <span className="text-[11.5px] font-medium text-sky-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity liquid-glass-pill px-3 py-1">{t.replaceFile}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2.5 text-center">
                        <div className="w-14 h-14 rounded-[16px] liquid-glass-pill flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                          <UploadCloud className="w-7 h-7 text-neutral-300 group-hover:text-sky-400 transition-colors" />
                        </div>
                        <div>
                          <h3 className="text-[16px] font-medium text-white mb-1">{t.dropzoneTitle}</h3>
                          <p className="text-[12.5px] text-neutral-400 max-w-[300px] mx-auto leading-relaxed hidden sm:block">
                            {t.dropzoneSubtitle}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Bar */}
                <div className="liquid-glass border-t border-white/10 px-5.5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${file ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse' : 'bg-neutral-600'}`}></div>
                    <span className="text-[12.5px] font-medium text-neutral-400">
                      {file ? t.fileReady : t.waitingFile}
                    </span>
                  </div>
                  
                  <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className={`w-full sm:w-auto px-5.5 py-2 rounded-[14px] text-[13.5px] font-semibold flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer ${
                      file && !uploading
                        ? "liquid-glass-pill text-white hover:scale-[1.02] active:scale-[0.98] border-sky-400/40"
                        : "bg-neutral-800 text-neutral-500 cursor-not-allowed border-transparent"
                    }`}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t.initializing}
                      </>
                    ) : (
                      <>
                        {t.startEngine}
                        <ChevronRight className="w-4 h-4 text-sky-400" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* How it works */}
              <div className="liquid-glass-card rounded-[20px] p-5.5 flex flex-col shrink-0">
                <div className="flex items-center justify-between mb-3.5">
                   <div className="flex items-center gap-2">
                     <div className="w-7 h-7 rounded-full bg-sky-500/15 border border-sky-400/20 flex items-center justify-center">
                       <Info className="w-3.5 h-3.5 text-sky-400" />
                     </div>
                     <h3 className="text-[15px] font-semibold text-white tracking-tight">{t.howItWorks}</h3>
                   </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="flex flex-col items-start text-left liquid-glass p-4 rounded-[14px] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-[10px] bg-neutral-900 text-white flex items-center justify-center border border-white/10">
                         <FileVideo className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <h4 className="text-[13.5px] font-semibold text-white tracking-tight">{t.step1Title}</h4>
                    </div>
                    <p className="text-[11.5px] text-neutral-400 leading-relaxed">{t.step1Desc}</p>
                  </div>

                  <div className="flex flex-col items-start text-left liquid-glass p-4 rounded-[14px] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-[10px] bg-neutral-900 text-white flex items-center justify-center border border-white/10">
                         <BrainCircuit className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <h4 className="text-[13.5px] font-semibold text-white tracking-tight">{t.step2Title}</h4>
                    </div>
                    <p className="text-[11.5px] text-neutral-400 leading-relaxed">{t.step2Desc}</p>
                  </div>

                  <div className="flex flex-col items-start text-left liquid-glass p-4 rounded-[14px] border border-sky-400/20 relative overflow-hidden group">
                    <div className="flex items-center gap-2 mb-2 relative z-10">
                      <div className="w-7 h-7 rounded-[10px] bg-gradient-to-br from-cyan-400 to-sky-500 text-white flex items-center justify-center">
                         <Wand2 className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="text-[13.5px] font-semibold text-sky-400 tracking-tight">{t.step3Title}</h4>
                    </div>
                    <p className="text-[11.5px] text-neutral-400 leading-relaxed relative z-10">{t.step3Desc}</p>
                  </div>
                </div>
              </div>

              {/* Formats row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 shrink-0 pt-0.5">
                {FORMAT_CARDS.map((card, idx) => {
                  const isActive = selectedFormat === card.titleKey;
                  const displayTitle = (t.formatTitles as any)[card.titleKey] || card.defaultTitle;

                  return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedFormat(card.titleKey)}
                      className={`flex flex-col liquid-glass-card rounded-[16px] overflow-hidden group cursor-pointer ${
                        isActive 
                          ? "border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.25)] scale-[1.01]" 
                          : "border-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="w-full aspect-[4/3] bg-neutral-900/80 relative overflow-hidden flex items-center justify-center">
                        <img 
                          src={card.src} 
                          alt={displayTitle} 
                          className="w-full h-full object-cover opacity-0 group-hover:scale-105 transition-all duration-500" 
                          onLoad={(e) => { e.currentTarget.style.opacity = '1'; }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                        />
                        {isActive ? (
                          <div className="absolute top-2 right-2 px-2 py-0.5 liquid-glass-pill text-white text-[9.5px] font-bold tracking-wider uppercase z-20 shadow-sm border-sky-400/40">
                            {t.formatActive}
                          </div>
                        ) : (
                          <div className="absolute text-[10.5px] text-neutral-500 font-medium">{t.formatPreview}</div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col gap-0.5">
                        <span className={`text-[12.5px] font-semibold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${
                          isActive ? "text-sky-400" : "text-neutral-200"
                        }`}>{displayTitle}</span>
                        <span className="text-[11px] text-neutral-500">{card.ratio}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
