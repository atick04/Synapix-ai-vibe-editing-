import React, { useState, useRef, useEffect } from 'react';
import { getApiUrl } from "@/utils/api";

interface ReferencesSidebarProps {
    activeEdits: any[];
    onActiveEditsChange?: (edits: any[]) => void;
    duration?: number;
    onClose?: () => void;
    isMobile?: boolean;
    fileId?: string;
    mediaLibrary?: any[];
    onMediaLibraryChange?: (lib: any[]) => void;
    onStitchClip?: (assetId: string, duration: number) => void;
    focusedClipId?: string | null;
    focusedItem?: any;
    onClearFocus?: () => void;
    multiTrackEdl?: any;
    onEdlChange?: (edl: any) => void;
    onDragStateChange?: (draggingType: string | null) => void;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
    selectedSubIndices?: number[];
    subtitleChunks?: any[];
}

interface MusicTrack {
    name: string;
    title: string;
    artist: string;
    category: string;
    rel_path: string;
    description: string;
}

const STATIC_FALLBACK_TRACKS: MusicTrack[] = [
    {
        name: "dj akeeni - my favorite coffee shop",
        title: "Cozy Coffee Shop",
        artist: "dj akeeni",
        category: "cozy lofi",
        rel_path: "Music/Background/dj akeeni - my favorite coffee shop.mp3",
        description: "warm and pleasant cozy lofi vibes for casual visual backdrops"
    },
    {
        name: "chirrrex - Just chill it out",
        title: "Just Chill It Out",
        artist: "chirrrex",
        category: "cozy lofi",
        rel_path: "Music/Background/chirrrex - Just chill it out.mp3",
        description: "soft chill beats for high audio engagement and dialogue retention"
    },
    {
        name: "dj akeeni - midnight mood",
        title: "Midnight Mood",
        artist: "dj akeeni",
        category: "cozy lofi",
        rel_path: "Music/Background/dj akeeni - midnight mood.mp3",
        description: "calm midnight beats for deep reflection or voiceover clips"
    },
    {
        name: "Colorful Cat - Sakura-iro",
        title: "Sakura-iro (Acoustic)",
        artist: "Colorful Cat",
        category: "cozy lofi",
        rel_path: "Music/Background/Colorful Cat - Sakura-iro.mp3",
        description: "gentle acoustic piano keys and acoustic guitar sweeps"
    },
    {
        name: "(120.79, 99, D#m)",
        title: "Electronic Beat (120 BPM)",
        artist: "Synapix Beat",
        category: "upbeat beats",
        rel_path: "Music/Beat/(120.79, 99, D#m).mp3",
        description: "energetic electronic rhythm designed for rapid visual cuts"
    },
    {
        name: "(128.81, 172, Cm)",
        title: "Techno Beat (128 BPM)",
        artist: "Synapix Beat",
        category: "upbeat beats",
        rel_path: "Music/Beat/(128.81, 172, Cm).mp3",
        description: "high tempo tech rhythms for active sports or fast edits"
    },
    {
        name: "(118.78, 130, Gm)",
        title: "Synth Wave Beat (118 BPM)",
        artist: "Synapix Beat",
        category: "upbeat beats",
        rel_path: "Music/Beat/(118.78, 130, Gm).mp3",
        description: "retro synth wave beat inspired by 80s aesthetic"
    },
    {
        name: "METAMORPHOSIS",
        title: "METAMORPHOSIS (Phonk)",
        artist: "INTERWORLD",
        category: "phonk & trap",
        rel_path: "Music//METAMORPHOSIS.mp3",
        description: "aggressive high pace phonk for active shorts and action reels"
    },
    {
        name: "Anikdote - Turn It Up",
        title: "Turn It Up (Trap)",
        artist: "Anikdote",
        category: "phonk & trap",
        rel_path: "Music/Trap/Anikdote - Turn It Up.mp3",
        description: "heavy trap beats with deep sub bass drops"
    },
    {
        name: "Content Sounds - Pursuit",
        title: "Pursuit (Chase)",
        artist: "Content Sounds",
        category: "phonk & trap",
        rel_path: "Music/Trap/Content Sounds - Pursuit.mp3",
        description: "dynamic cinematic suspense score for tense storylines"
    }
];

const LIBRARY_BROLLS = [
    {
        id: "broll-cyberpunk",
        name: "cyberpunk city rain",
        query: "cyberpunk neon street rain",
        url: "https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-street-wet-with-rain-41865-large.mp4",
        description: "neon lights reflecting on wet cyberpunk streets"
    },
    {
        id: "broll-coffee",
        name: "relaxing coffee warm",
        query: "steaming warm coffee cup",
        url: "https://assets.mixkit.co/videos/preview/mixkit-coffee-stream-warm-bokeh-large.mp4",
        description: "steaming hot cup of coffee with warm lighting"
    },
    {
        id: "broll-forest",
        name: "forest walk sun rays",
        query: "magic forest beams sun",
        url: "https://assets.mixkit.co/videos/preview/mixkit-sun-beams-through-forest-trees-large.mp4",
        description: "sunbeams shining through tall forest trees"
    },
    {
        id: "broll-office",
        name: "business office typing",
        query: "programmer typing hands laptop",
        url: "https://assets.mixkit.co/videos/preview/mixkit-hands-typing-on-a-laptop-keyboard-close-up-large.mp4",
        description: "close-up of hands typing on a laptop keyboard"
    }
];

const LIBRARY_SFX = [
    {
        id: "sfx-whoosh",
        name: "cinematic whoosh",
        rel_path: "SFX Sounds/Переходы/Whoosh 1.mp3",
        description: "fast cinematic whoosh transition sound"
    },
    {
        id: "sfx-glitch",
        name: "scifi glitch sweep",
        rel_path: "SFX Sounds/Сбои/Glitch 2.mp3",
        description: "high-tech sci-fi glitch sound effect"
    },
    {
        id: "sfx-click",
        name: "tactile click pop",
        rel_path: "SFX Sounds/Клики мышки/Клик 1.mp3",
        description: "clean computer click sound effect"
    },
    {
        id: "sfx-impact",
        name: "heavy deep impact",
        rel_path: "SFX Sounds/Переходы/Sweep 3.mp3",
        description: "dramatic deep riser sweep transition"
    }
];

const LIBRARY_GRAPHICS = [
    {
        id: "graphic-vox",
        name: "vox retention card",
        style: "vox",
        html: `<div id="root" style="background: rgba(0,0,0,0.7); border: 2px solid #3B82F6; border-radius: 12px; font-family: Inter, sans-serif; text-align: center; color: white; width: 1080px; height: 1920px; display: flex; align-items: center; justify-content: center;"><div style="padding:40px;"><h2 style="font-size:80px; color:#3B82F6; margin-bottom:10px;">84% RETENTION</h2><p style="font-size:36px; color:#9AA4B2;">Professional Vox Infographic</p></div></div>`,
        description: "clean blue statistical vox infographic"
    },
    {
        id: "graphic-mograph",
        name: "neon motion design",
        style: "mograph",
        html: `<div id="root" style="background: transparent; border: 2px solid #7C3AED; border-radius: 20px; box-shadow: 0 0 20px #7C3AED; font-family: Inter, sans-serif; text-align: center; color: white; width: 1080px; height: 1920px; display: flex; align-items: center; justify-content: center;"><div style="padding:40px;"><h2 style="font-size:80px; color:#F5F7FA; text-shadow: 0 0 10px #7C3AED;">NEON SHIMMER</h2><p style="font-size:36px; color:#7C3AED;">cyberpunk motion graphic overlay</p></div></div>`,
        description: "violet neon glowing motion design title"
    },
    {
        id: "graphic-scene",
        name: "chapter split override",
        style: "scene_override",
        html: `<div id="root" style="background: linear-gradient(135deg, #09090b, #111318); border: 2px solid #3B82F6; font-family: Inter, sans-serif; text-align: center; color: white; width: 1080px; height: 1920px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px;"><h1 style="font-size: 96px; font-weight: 900; margin-bottom: 20px; color:#FFFFFF;">VOX CHAPTER</h1><p style="font-size: 38px; color: #a1a1aa; max-width: 800px; line-height:1.6;">Full-frame opaque scene split override screen</p></div>`,
        description: "full screen scene override chapter screen"
    }
];

const LUT_PRESETS = [
    { id: 'cinema', name: 'Кино', label: 'Cinema', brightness: 1.0, contrast: 1.1, saturation: 1.1, hue: 0, description: 'Кинематографичный контрастный пресет' },
    { id: 'vintage', name: 'Винтаж', label: 'Vintage', brightness: 0.95, contrast: 0.9, saturation: 0.8, hue: 5, description: 'Мягкий ретро стиль с теплыми тонами' },
    { id: 'cyberpunk', name: 'Киберпанк', label: 'Cyberpunk', brightness: 1.0, contrast: 1.2, saturation: 1.4, hue: -10, description: 'Насыщенные неоновые цвета' },
    { id: 'monochrome', name: 'Чёрно-белый', label: 'Monochrome', brightness: 1.0, contrast: 1.2, saturation: 0.0, hue: 0, description: 'Классический черно-белый стиль' },
    { id: 'teal_orange', name: 'Teal & Orange', label: 'Teal & Orange', brightness: 1.0, contrast: 1.1, saturation: 1.2, hue: 10, description: 'Голливудская цветовая палитра' },
    { id: 'vibrant', name: 'Сочный', label: 'Vibrant', brightness: 1.0, contrast: 1.1, saturation: 1.3, hue: 0, description: 'Яркие, насыщенные цвета' },
    { id: 'cold', name: 'Холодный', label: 'Cold', brightness: 1.0, contrast: 1.05, saturation: 0.9, hue: -15, description: 'Прохладная цветовая гамма' },
    { id: 'warm', name: 'Тёплый', label: 'Warm', brightness: 1.05, contrast: 1.0, saturation: 1.1, hue: 15, description: 'Теплые солнечные оттенки' },
];

const classifyTrack = (track: { name: string; rel_path: string }): MusicTrack => {
    const path = track.rel_path.toLowerCase();
    const name = track.name.toLowerCase();
    
    let category = "other";
    let title = track.name;
    let artist = "Synapix";
    let description = "premium audio soundtrack for custom edits";
    
    if (path.includes('music/background') || name.includes('akeeni') || name.includes('shiruku') || name.includes('taranofu') || name.includes('colorful cat') || name.includes('chirrrex')) {
        category = "cozy lofi";
        title = track.name.split(' - ').slice(1).join(' - ') || track.name;
        artist = track.name.split(' - ')[0] || "Lofi Artist";
        description = "relaxing lofi background beat";
    } else if (path.includes('music/beat')) {
        category = "upbeat beats";
        const match = track.name.match(/\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
        const bpm = match ? `${match[2]} BPM` : "120 BPM";
        const key = match ? match[3] : "";
        title = `Electronic Beat (${bpm}${key ? ' ' + key : ''})`;
        artist = "Synapix Beat";
        description = "high energy electronic rhythm";
    } else if (path.includes('music/trap') || name.includes('metamorphosis') || name.includes('pursuit') || name.includes('void beats') || name.includes('anikdote') || name.includes('sayyian') || name.includes('yajna') || name.includes('wonky') || name.includes('helium')) {
        category = "phonk & trap";
        title = track.name.includes(' - ') ? track.name.split(' - ').slice(1).join(' - ') : track.name;
        artist = track.name.includes(' - ') ? track.name.split(' - ')[0] : "Trap Producer";
        description = "aggressive trap beats with sub bass frequencies";
    } else {
        category = "cinematic & ambient";
        title = track.name.includes(' - ') ? track.name.split(' - ').slice(1).join(' - ') : track.name;
        artist = track.name.includes(' - ') ? track.name.split(' - ')[0] : "Cinematic";
        description = "melodic ambient scoring for atmospheric visual edits";
    }
    
    title = title.replace(/\.mp3$/i, '').replace(/\.wav$/i, '').replace(/\_/g, '').trim();
    artist = artist.trim();
    
    return {
        name: track.name,
        title: title || track.name,
        artist: artist || "Ambient",
        category,
        rel_path: track.rel_path,
        description
    };
};

export default function ReferencesSidebar({
    activeEdits,
    onActiveEditsChange,
    duration = 10,
    onClose,
    isMobile,
    fileId,
    mediaLibrary = [],
    onMediaLibraryChange,
    onStitchClip,
    focusedClipId,
    focusedItem,
    onClearFocus,
    multiTrackEdl,
    onEdlChange,
    onDragStateChange,
    videoRef,
    selectedSubIndices,
    subtitleChunks
}: ReferencesSidebarProps) {
    const [sidebarTab, setSidebarTab] = useState<'media' | 'music' | 'stock' | 'color' | 'inspect'>('media');
    const [selectedSubMode, setSelectedSubMode] = useState<'single' | 'all'>('single');
    const [projectSession, setProjectSession] = useState<any>(null);

    useEffect(() => {
        if (focusedClipId) {
            setSidebarTab('inspect');
        } else if (sidebarTab === 'inspect') {
            setSidebarTab('media');
        }
    }, [focusedClipId]);

    useEffect(() => {
        if (focusedClipId && focusedClipId.startsWith('T1-Sub-')) {
            setSelectedSubMode('single');
        }
    }, [focusedClipId]);
    const [playingTrack, setPlayingTrack] = useState<string | null>(null);
    const [playingSfx, setPlayingSfx] = useState<string | null>(null);
    const [hoveredBroll, setHoveredBroll] = useState<string | null>(null);
    const [tracks, setTracks] = useState<MusicTrack[]>(STATIC_FALLBACK_TRACKS);
    const [isLoadingTracks, setIsLoadingTracks] = useState(true);
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const sfxPreviewRef = useRef<HTMLAudioElement | null>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Stock Search States
    const [stockQuery, setStockQuery] = useState('');
    const [stockType, setStockType] = useState<'stickers' | 'music' | 'ai_audio'>('stickers');
    const [stockResults, setStockResults] = useState<any[]>([]);
    const [isSearchingStock, setIsSearchingStock] = useState(false);
    const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);
    const [stockError, setStockError] = useState<string | null>(null);
    const [downloadedAssets, setDownloadedAssets] = useState<Record<string, string>>({});

    // AI Audio Generator States
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiDuration, setAiDuration] = useState(10);
    const [aiIsBgm, setAiIsBgm] = useState(false);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [aiAudioError, setAiAudioError] = useState<string | null>(null);

    const handleGenerateAiAudio = async (e: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!aiPrompt.trim() || !fileId) return;
        setIsGeneratingAudio(true);
        setAiAudioError(null);
        try {
            const apiBase = getApiUrl();
            const res = await fetch(`${apiBase}/api/video/${fileId}/generate_audio`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: aiPrompt,
                    duration: aiDuration,
                    is_bgm: aiIsBgm,
                    start_time: 0.0,
                    volume: aiIsBgm ? -22.0 : -10.0
                })
            });

            if (res.ok) {
                const data = await res.json();
                
                // Добавляем ассет локально на таймлайн
                if (onActiveEditsChange) {
                    const newEdit = {
                        action: "add_asset",
                        start: 0,
                        end: aiDuration,
                        asset_query: data.filename,
                        resolved_path: data.local_path,
                        asset_type: "audio",
                        volume: aiIsBgm ? -22.0 : -10.0,
                        is_bgm: aiIsBgm
                    };
                    onActiveEditsChange([...activeEdits, newEdit]);
                }
                
                // Обновляем медиабиблиотеку
                if (onMediaLibraryChange) {
                    const libRes = await fetch(`${apiBase}/api/video/${fileId}/media_library`);
                    if (libRes.ok) {
                        const libData = await libRes.json();
                        onMediaLibraryChange(libData);
                    }
                }
                
                triggerAddedFeedback(data.asset_id);
                setAiPrompt('');
            } else {
                const errData = await res.json().catch(() => ({}));
                setAiAudioError(errData.detail || "Не удалось сгенерировать аудиоклип.");
            }
        } catch (err: any) {
            setAiAudioError(err.message || "Сбой сети при генерации.");
        } finally {
            setIsGeneratingAudio(false);
        }
    };

    const applySticker = (stickerId: string, resolvedPath: string) => {
        if (!onActiveEditsChange) return;
        const newEdit = {
            action: "add_sticker",
            sticker_id: stickerId,
            resolved_path: resolvedPath,
            start: 0,
            end: Math.min(3.0, duration),
            position: "center",
            scale: 0.3
        };
        onActiveEditsChange([...activeEdits, newEdit]);
        triggerAddedFeedback(stickerId);
    };

    const applyDownloadedMusic = (musicId: string, title: string, resolvedPath: string) => {
        if (!onActiveEditsChange) return;
        const newBgm = {
            action: "add_asset",
            start: 0,
            end: duration,
            asset_query: title,
            resolved_path: resolvedPath,
            asset_type: "audio",
            volume: -22,
            is_bgm: true
        };
        const existingIdx = activeEdits.findIndex(e => 
            e.action === 'add_asset' && 
            !e.asset_query?.toLowerCase().includes('sfx') && 
            !e.asset_query?.toLowerCase().includes('click') && 
            !e.asset_query?.toLowerCase().includes('whoosh') &&
            !e.asset_query?.toLowerCase().includes('impact')
        );
        let updatedEdits = [...activeEdits];
        if (existingIdx !== -1) {
            updatedEdits[existingIdx] = newBgm;
        } else {
            updatedEdits.push(newBgm);
        }
        onActiveEditsChange(updatedEdits);
        triggerAddedFeedback(musicId);
    };

    const handleStockSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!stockQuery.trim()) return;
        setIsSearchingStock(true);
        setStockError(null);
        try {
            const apiBase = getApiUrl();
            const endpoint = stockType === 'stickers' ? 'search_stickers' : 'search_music';
            const res = await fetch(`${apiBase}/api/video/${endpoint}?query=${encodeURIComponent(stockQuery)}`);
            if (res.ok) {
                const data = await res.json();
                setStockResults(data);
            } else {
                setStockError("Ошибка поиска на сервере");
            }
        } catch (err: any) {
            setStockError(err.message || "Сбой сети при поиске");
        } finally {
            setIsSearchingStock(false);
        }
    };

    const handleDownloadAsset = async (item: any) => {
        const assetId = stockType === 'stickers' ? `stock_sticker_${item.id}` : `stock_music_${item.id}`;
        setDownloadingAssetId(assetId);
        setStockError(null);
        try {
            const apiBase = getApiUrl();
            const res = await fetch(`${apiBase}/api/video/download_asset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    asset_id: assetId,
                    url: item.url,
                    type: stockType === 'stickers' ? 'sticker' : 'music',
                    file_id: fileId
                })
            });
            if (res.ok) {
                const data = await res.json();
                setDownloadedAssets(prev => ({ ...prev, [assetId]: data.url }));
                
                if (stockType === 'stickers') {
                    applySticker(assetId, data.local_path);
                } else {
                    applyDownloadedMusic(assetId, item.title || item.name, data.local_path);
                }
                
                if (fileId && onMediaLibraryChange) {
                    const libRes = await fetch(`${apiBase}/api/video/${fileId}/media_library`);
                    if (libRes.ok) {
                        const libData = await libRes.json();
                        onMediaLibraryChange(libData);
                    }
                }
            } else {
                setStockError("Не удалось скачать ассет на сервер");
            }
        } catch (err: any) {
            setStockError(err.message || "Сбой загрузки ассета");
        } finally {
            setDownloadingAssetId(null);
        }
    };

    useEffect(() => {
        if (stockType !== 'ai_audio' && stockQuery.trim()) {
            handleStockSearch();
        }
    }, [stockType]);

    const [justAddedIds, setJustAddedIds] = useState<string[]>([]);
    const triggerAddedFeedback = (id: string) => {
        setJustAddedIds(prev => [...prev, id]);
        setTimeout(() => {
            setJustAddedIds(prev => prev.filter(x => x !== id));
        }, 1000);
    };

    // Poll the media library periodically to get progress updates (such as visual/transcript analysis completion)
    useEffect(() => {
        if (!fileId || !onMediaLibraryChange) return;
        const apiBase = getApiUrl();
        
        const pollLibrary = async () => {
            try {
                const res = await fetch(`${apiBase}/api/video/${fileId}/media_library`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        onMediaLibraryChange(data);
                    }
                }
            } catch (e) {
                console.error("Failed to poll media library:", e);
            }
        };

        const interval = setInterval(pollLibrary, 5000);
        return () => clearInterval(interval);
    }, [fileId, onMediaLibraryChange]);

    // Poll the project session periodically to get hook detection and styling progress
    useEffect(() => {
        if (!fileId) return;
        const apiBase = getApiUrl();
        
        const pollSession = async () => {
            try {
                const res = await fetch(`${apiBase}/api/video/${fileId}/session`);
                if (res.ok) {
                    const data = await res.json();
                    setProjectSession(data);
                }
            } catch (e) {
                console.error("Failed to poll project session:", e);
            }
        };

        pollSession(); // Initial fetch
        const interval = setInterval(pollSession, 5000);
        return () => clearInterval(interval);
    }, [fileId]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            await handleUploadFile(files[0]);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            await handleUploadFile(files[0]);
        }
    };

    const handleUploadFile = async (file: File) => {
        if (!fileId) {
            setUploadError("Project ID not found");
            return;
        }
        setIsUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        try {
            const apiBase = getApiUrl();
            const url = `${apiBase}/api/video/${fileId}/upload_additional`;
            const formData = new FormData();
            formData.append("file", file);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", url, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(percentComplete);
                }
            };

            xhr.onload = () => {
                setIsUploading(false);
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (onMediaLibraryChange) {
                            onMediaLibraryChange(data);
                        }
                    } catch (e) {
                        setUploadError("Failed to parse response from server");
                    }
                } else {
                    setUploadError(`Upload failed with status ${xhr.status}`);
                }
            };

            xhr.onerror = () => {
                setIsUploading(false);
                setUploadError("Network error occurred during upload");
            };

            xhr.send(formData);
        } catch (err: any) {
            setIsUploading(false);
            setUploadError(err.message || "An unexpected error occurred");
        }
    };

    const additionalAssets = (mediaLibrary || []).filter(item => item.id !== 'main');

    useEffect(() => {
        const fetchTracks = async () => {
            try {
                const apiBase = getApiUrl();
                const response = await fetch(`${apiBase}/assets/index.json`);
                if (!response.ok) throw new Error("Failed to fetch assets index");
                const data = await response.json();
                
                const musicAssets = (data.assets || []).filter((a: any) => a.category === "Music");
                if (musicAssets.length > 0) {
                     const mappedTracks = musicAssets.map((asset: any) => classifyTrack(asset));
                     setTracks(mappedTracks);
                }
            } catch (err) {
                console.error("Error loading dynamic music list:", err);
            } finally {
                setIsLoadingTracks(false);
            }
        };
        fetchTracks();
    }, []);

    const brollEdits = activeEdits.filter(e => e.action === 'add_broll');
    const hasGraphics = activeEdits.some(e => e.action === 'canvas_overlay' || e.action === 'hyperframes_html' || e.action === 'add_hyperframes_graphics');
    
    const sfxEdits = activeEdits.filter(e => 
        e.action === 'add_asset' && 
        (e.asset_query?.toLowerCase().includes('sfx') || 
         e.asset_query?.toLowerCase().includes('click') || 
         e.asset_query?.toLowerCase().includes('whoosh') ||
         e.asset_query?.toLowerCase().includes('impact'))
    );

    const activeBgmEdit = activeEdits.find(e => 
        e.action === 'add_asset' && 
        !e.asset_query?.toLowerCase().includes('sfx') && 
        !e.asset_query?.toLowerCase().includes('click') && 
        !e.asset_query?.toLowerCase().includes('whoosh') &&
        !e.asset_query?.toLowerCase().includes('impact')
    );
    const activeBgmName = activeBgmEdit?.asset_query || '';

    // HTML5 Drag and Drop Start Handler
    const handleDragStart = (e: React.DragEvent, assetType: string, assetData: any) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("assetType", assetType);
        e.dataTransfer.setData("assetData", JSON.stringify(assetData));
        onDragStateChange?.(assetType);
    };

    const togglePlayTrack = (track: MusicTrack) => {
        if (!audioPreviewRef.current) {
            audioPreviewRef.current = new Audio();
        }
        const apiBase = getApiUrl();
        const fullUrl = `${apiBase}/assets/${encodeURI(track.rel_path)}`;

        if (playingTrack === track.name) {
            audioPreviewRef.current.pause();
            setPlayingTrack(null);
        } else {
            audioPreviewRef.current.src = fullUrl;
            audioPreviewRef.current.volume = 0.5;
            audioPreviewRef.current.play().catch(e => console.error("Audio preview failed:", e));
            setPlayingTrack(track.name);
            audioPreviewRef.current.onended = () => {
                setPlayingTrack(null);
            };
        }
    };

    const togglePlaySfx = (sfx: typeof LIBRARY_SFX[0]) => {
        if (!sfxPreviewRef.current) {
            sfxPreviewRef.current = new Audio();
        }
        const apiBase = getApiUrl();
        const fullUrl = `${apiBase}/assets/${encodeURI(sfx.rel_path)}`;

        if (playingSfx === sfx.id) {
            sfxPreviewRef.current.pause();
            setPlayingSfx(null);
        } else {
            sfxPreviewRef.current.src = fullUrl;
            sfxPreviewRef.current.volume = 0.7;
            sfxPreviewRef.current.play().catch(e => console.error("SFX preview failed:", e));
            setPlayingSfx(sfx.id);
            sfxPreviewRef.current.onended = () => {
                setPlayingSfx(null);
            };
        }
    };

    const applyMusicTrack = (trackName: string) => {
        if (!onActiveEditsChange) return;

        const existingIdx = activeEdits.findIndex(e => 
            e.action === 'add_asset' && 
            !e.asset_query?.toLowerCase().includes('sfx') && 
            !e.asset_query?.toLowerCase().includes('click') && 
            !e.asset_query?.toLowerCase().includes('whoosh') &&
            !e.asset_query?.toLowerCase().includes('impact')
        );

        const track = tracks.find(t => t.name === trackName);
        const newBgm = {
            action: "add_asset",
            start: 0,
            end: duration,
            asset_query: trackName,
            resolved_path: track ? track.rel_path : undefined,
            asset_type: "audio",
            volume: -22
        };

        let updatedEdits = [...activeEdits];
        if (existingIdx !== -1) {
            updatedEdits[existingIdx] = newBgm;
        } else {
            updatedEdits.push(newBgm);
        }

        onActiveEditsChange(updatedEdits);
        triggerAddedFeedback(trackName);
    };

    // Manual Quick Insert Buttons (Fallback in case they don't drag)
    const insertLutPreset = (item: typeof LUT_PRESETS[0]) => {
        if (!onActiveEditsChange) return;
        const playheadTime = videoRef?.current?.currentTime || 0;
        const newEdit = {
            action: "color_correction",
            start: Number(playheadTime.toFixed(2)),
            end: Number(Math.min(playheadTime + 3.0, duration).toFixed(2)),
            preset: item.id,
            lut: item.id,
            brightness: 100,
            contrast: 100,
            saturation: 100,
            hue: 0
        };
        onActiveEditsChange([...activeEdits, newEdit]);
        triggerAddedFeedback(item.id);
    };

    const insertLibraryBroll = (item: typeof LIBRARY_BROLLS[0]) => {
        if (!onActiveEditsChange) return;
        const playheadTime = videoRef?.current?.currentTime || 0;
        const newEdit = {
            action: "add_broll",
            start: Number(playheadTime.toFixed(2)),
            end: Number(Math.min(playheadTime + 3.0, duration).toFixed(2)),
            query: item.query,
            broll_url: item.url
        };
        onActiveEditsChange([...activeEdits, newEdit]);
        triggerAddedFeedback(item.id);
    };

    const insertCustomBroll = (asset: any) => {
        if (!onActiveEditsChange) return;
        const playheadTime = videoRef?.current?.currentTime || 0;
        const newEdit = {
            action: "add_broll",
            start: Number(playheadTime.toFixed(2)),
            end: Number(Math.min(playheadTime + (asset.duration || 3.0), duration).toFixed(2)),
            query: asset.filename,
            resolved_path: asset.path
        };
        onActiveEditsChange([...activeEdits, newEdit]);
        triggerAddedFeedback(asset.id);
    };

    const insertLibrarySfx = (item: typeof LIBRARY_SFX[0]) => {
        if (!onActiveEditsChange) return;
        const newEdit = {
            action: "add_asset",
            start: 0.0,
            end: Math.min(1.5, duration),
            asset_query: item.name,
            resolved_path: item.rel_path,
            asset_type: "audio",
            volume: -10
        };
        onActiveEditsChange([...activeEdits, newEdit]);
        triggerAddedFeedback(item.id);
    };

    const insertLibraryGraphic = (item: typeof LIBRARY_GRAPHICS[0]) => {
        if (!onActiveEditsChange) return;
        const newEdit = {
            action: item.style === 'scene_override' ? "scene_override" : "canvas_overlay",
            start: 0.0,
            end: Math.min(3.0, duration),
            style: item.style,
            html_content: item.html
        };
        onActiveEditsChange([...activeEdits, newEdit]);
        triggerAddedFeedback(item.id);
    };

    useEffect(() => {
        return () => {
            if (audioPreviewRef.current) audioPreviewRef.current.pause();
            if (sfxPreviewRef.current) sfxPreviewRef.current.pause();
        };
    }, []);

    const categories: { [key: string]: MusicTrack[] } = {};
    tracks.forEach(track => {
        if (!categories[track.category]) {
            categories[track.category] = [];
        }
        categories[track.category].push(track);
    });

    return (
        <div 
            className="w-full h-full flex flex-col overflow-hidden relative font-sans select-none text-neutral-800 dark:text-neutral-200"
            style={{
                background: "rgba(20, 20, 20, 0.65)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderLeft: "1px solid rgba(255, 255, 255, 0.08)"
            }}
        >
            
            {/* Header Tabs */}
            <div className="bg-transparent border-b border-white/5 flex flex-col shrink-0 px-4 pt-2.5 pb-2">
                <div className="flex items-center justify-between mb-3.5">
                    <h2 className="text-[12px] font-bold tracking-widest text-zinc-400 uppercase">control deck</h2>
                    {onClose && (
                        <button 
                            onClick={onClose}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer bg-white/5 border border-white/10 shadow-sm"
                            title="Hide library"
                        >
                            ✕
                        </button>
                    )}
                </div>
                
                <div className="flex bg-zinc-950/60 p-1 rounded-xl border border-white/5 shadow-inner gap-1">
                    <button 
                        onClick={() => setSidebarTab('media')}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === 'media' ? 'bg-zinc-900 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-350'}`}
                    >
                        <span>library</span>
                    </button>
                    <button 
                        onClick={() => setSidebarTab('music')}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === 'music' ? 'bg-zinc-900 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-350'}`}
                    >
                        <span>soundtrack</span>
                    </button>
                    <button 
                        onClick={() => setSidebarTab('stock')}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === 'stock' ? 'bg-zinc-900 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-350'}`}
                    >
                        <span>stock</span>
                    </button>
                    <button 
                        onClick={() => setSidebarTab('color')}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === 'color' ? 'bg-zinc-900 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-350'}`}
                    >
                        <span>луты</span>
                    </button>
                    {focusedClipId && (
                        <button 
                            onClick={() => setSidebarTab('inspect')}
                            className={`flex-1 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === 'inspect' ? 'bg-zinc-900 text-blue-400 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-350'}`}
                        >
                            <span>inspect</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide space-y-4">
                
                {sidebarTab === 'media' && (
                    <div className="space-y-7">
                        {isMobile ? (
                            <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-zinc-350 flex flex-col gap-2 shadow-sm font-sans">
                                <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                                    💡 Touch Tap-to-Insert
                                </span>
                                <span className="text-[12px] leading-relaxed text-zinc-300 font-medium">
                                    Tap the "+" button or click "select track" on any card to instantly insert the media element into your timeline.
                                </span>
                            </div>
                        ) : (
                            <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-zinc-350 flex flex-col gap-2 shadow-sm font-sans">
                                <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                                    💡 Interactive Drag & Drop
                                </span>
                                <span className="text-[12px] leading-relaxed text-zinc-300 font-medium">
                                    Drag any reference card below and drop it directly onto the timeline tracks to overlay visual pacing elements.
                                </span>
                            </div>
                        )}

                        {/* Auto-detected Hook Card */}
                        {projectSession?.narrative_arc?.hook && (
                            <div 
                                onClick={() => {
                                    if (videoRef?.current) {
                                        videoRef.current.currentTime = projectSession.narrative_arc.hook_start || 0;
                                    }
                                }}
                                className="group relative cursor-pointer overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-[0_8px_32px_rgba(245,158,11,0.05)] backdrop-blur-md transition-all duration-300 hover:bg-amber-500/10 hover:border-amber-500/50 hover:shadow-[0_8px_32px_rgba(245,158,11,0.15)] font-sans"
                            >
                                <div className="absolute -inset-px bg-gradient-to-r from-amber-500/10 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl" />
                                
                                <div className="relative flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform duration-300 text-xl">
                                        🪝
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/10">
                                                Фраза-хук
                                            </span>
                                            <span className="text-[11px] font-semibold text-zinc-400 font-mono">
                                                {projectSession.narrative_arc.hook_start?.toFixed(1)}с - {projectSession.narrative_arc.hook_end?.toFixed(1)}с
                                            </span>
                                        </div>
                                        <p className="text-[13px] text-zinc-200 font-medium italic leading-relaxed line-clamp-2">
                                            «{projectSession.narrative_arc.hook}»
                                        </p>
                                        <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-500/70 font-semibold uppercase tracking-wider group-hover:text-amber-400 transition-colors">
                                            <span>Перемотать к хуку</span>
                                            <svg className="w-3 h-3 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Project Media Section */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">project media library</h3>
                            </div>
                            
                            {/* Upload Zone */}
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`relative border border-dashed rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
                                    isDragging 
                                        ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                                        : 'border-white/10 bg-zinc-950/40 hover:bg-zinc-950/60 hover:border-white/20'
                                }`}
                            >
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="video/*" 
                                    onChange={handleFileSelect} 
                                />
                                
                                {isUploading ? (
                                    <div className="flex flex-col items-center gap-3 w-full">
                                        <div className="w-8 h-8 rounded-full border-[1.5px] border-white/10 border-t-amber-500 animate-spin" />
                                        <span className="text-[16px] text-zinc-400 font-sans font-semibold">
                                            Uploading video... {uploadProgress}%
                                        </span>
                                        <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                                            <div 
                                                className="bg-amber-500 h-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-center">
                                        <svg className="w-6 h-6 text-zinc-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                        <span className="text-[12.5px] font-bold text-zinc-200">
                                            Stitch additional video
                                        </span>
                                        <span className="text-[15px] text-zinc-450 font-medium">
                                            Drag and drop or click to browse
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            {uploadError && (
                                <div className="mt-2 text-[15px] text-rose-500 bg-rose-950/20 border border-rose-500/20 rounded-xl p-2.5 font-sans">
                                    ⚠️ {uploadError}
                                </div>
                            )}

                            {/* Video List */}
                            <div className="mt-4 space-y-2.5">
                                {additionalAssets.length === 0 ? (
                                    <div className="text-center p-6 bg-white/3 border border-white/5 rounded-2xl">
                                        <span className="text-[11.5px] text-zinc-500 font-medium">
                                            No additional videos uploaded.
                                        </span>
                                    </div>
                                ) : (
                                    additionalAssets.map((asset) => {
                                        const isJustAdded = justAddedIds.includes(asset.id);
                                        const hasTranscript = !!asset.transcript;
                                        
                                        return (
                                            <div 
                                                key={asset.id}
                                                draggable="true"
                                                onDragStart={(e) => handleDragStart(e, "stitch", asset)}
                                                onDragEnd={() => onDragStateChange?.(null)}
                                                className={`p-2 rounded-xl border flex items-center justify-between gap-2.5 group transition-all duration-200 shadow-sm cursor-grab active:cursor-grabbing ${
                                                    isJustAdded 
                                                        ? 'border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.2)] scale-[0.98]' 
                                                        : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {/* Video Icon */}
                                                    <div className="w-7 h-7 rounded-lg bg-zinc-950 border border-white/5 flex items-center justify-center shrink-0">
                                                        <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm11 9l-3.5-3.5L10 11l-3-3L4 11V5h12v7z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                    
                                                    <div className="min-w-0 font-sans">
                                                        <p className="text-[11.5px] font-bold text-zinc-200 truncate" title={asset.filename}>
                                                            {asset.filename}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-[9.5px] font-bold text-zinc-400">
                                                                {asset.duration ? `${asset.duration.toFixed(1)}s` : '0.0s'}
                                                            </span>
                                                            <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                                                            {hasTranscript ? (
                                                                <span className="text-[8.5px] font-semibold text-emerald-400 bg-emerald-950/30 px-1 py-0.5 rounded border border-emerald-500/20">
                                                                    AI Ready
                                                                </span>
                                                            ) : (
                                                                <span className="text-[8.5px] font-semibold text-amber-400 bg-amber-950/30 px-1 py-0.5 rounded border border-amber-500/20 animate-pulse">
                                                                    AI Processing...
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {/* Stitch to Main V1 Track Button */}
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onStitchClip) {
                                                                onStitchClip(asset.id, asset.duration || 0);
                                                                triggerAddedFeedback(asset.id);
                                                            }
                                                        }}
                                                        className={`h-6 px-1.5 rounded-lg bg-zinc-950 border flex items-center justify-center text-[9.5px] font-sans font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 shrink-0 ${
                                                            isJustAdded 
                                                                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/80' 
                                                                : 'border-white/10 hover:border-amber-500 hover:text-amber-500 text-zinc-350'
                                                        }`}
                                                        title="Stitch clip onto main timeline (V1)"
                                                    >
                                                        +Main
                                                    </button>
                                                    
                                                    {/* Overlay as B-Roll V2 Track Button */}
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            insertCustomBroll(asset);
                                                        }}
                                                        className={`h-6 px-1.5 rounded-lg bg-zinc-950 border flex items-center justify-center text-[9.5px] font-sans font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 shrink-0 ${
                                                            isJustAdded 
                                                                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/80' 
                                                                : 'border-white/10 hover:border-amber-500 hover:text-amber-500 text-zinc-350'
                                                        }`}
                                                        title="Overlay clip as B-Roll (V2)"
                                                    >
                                                        +B-Roll
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Video B-Rolls Library */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">video b-roll library</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2.5">
                                {LIBRARY_BROLLS.map((item) => {
                                    const isJustAdded = justAddedIds.includes(item.id);
                                    return (
                                        <div 
                                            key={item.id} 
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, "broll", item)}
                                            onDragEnd={() => onDragStateChange?.(null)}
                                            onMouseEnter={() => setHoveredBroll(item.id)}
                                            onMouseLeave={() => setHoveredBroll(null)}
                                            className={`relative aspect-video bg-zinc-950 border rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all group flex flex-col items-center justify-center shadow-sm ${
                                                isJustAdded 
                                                    ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] scale-[0.98]' 
                                                    : 'border-white/5 bg-white/[0.01]'
                                            }`}
                                        >
                                            {hoveredBroll === item.id ? (
                                                <video 
                                                    src={item.url} 
                                                    autoPlay 
                                                    loop 
                                                    muted 
                                                    playsInline 
                                                    className="absolute inset-0 w-full h-full object-cover z-0" 
                                                />
                                            ) : (
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-0 opacity-80" />
                                            )}
                                            
                                            <div className="absolute top-1.5 right-1.5 z-10">
                                                <button 
                                                    onClick={() => insertLibraryBroll(item)}
                                                    className={`w-5.5 h-5.5 rounded-full bg-black/60 backdrop-blur-md border flex items-center justify-center text-[12px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                                                        isJustAdded 
                                                            ? 'border-emerald-500 text-emerald-400 bg-emerald-950/85' 
                                                            : 'border-white/15 hover:border-amber-500 hover:text-amber-500 text-zinc-200'
                                                    }`}
                                                    title="Quick insert at playhead"
                                                >
                                                    {isJustAdded ? '✓' : '+'}
                                                </button>
                                            </div>
                                            
                                            <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-col font-sans">
                                                <span className="text-[11.5px] font-semibold text-white truncate text-shadow leading-tight">
                                                    {item.name}
                                                </span>
                                                <span className="text-[9.5px] text-zinc-350 truncate mt-[1px] font-medium leading-none">
                                                    {item.description}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* SFX Sounds Library */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">sfx click & sweeps</h3>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                {LIBRARY_SFX.map((item) => {
                                    const isPlaying = playingSfx === item.id;
                                    const isJustAdded = justAddedIds.includes(item.id);
                                    return (
                                        <div 
                                            key={item.id}
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, "sfx", item)}
                                            onDragEnd={() => onDragStateChange?.(null)}
                                            className={`p-2 rounded-xl border cursor-grab active:cursor-grabbing flex items-center gap-2.5 group transition-all duration-200 shadow-sm ${
                                                isJustAdded 
                                                    ? 'border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.2)] scale-[0.98]' 
                                                    : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                                            }`}
                                        >
                                            <button 
                                                onClick={() => togglePlaySfx(item)}
                                                className={`w-7 h-7 bg-zinc-950 border rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-all hover:scale-105 active:scale-95 ${isPlaying ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-white/10 text-zinc-450 hover:text-white hover:border-white/20'}`}
                                            >
                                                {isPlaying ? (
                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                                ) : (
                                                    <svg className="w-3 h-3 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                )}
                                            </button>
                                            
                                            <div className="flex-1 min-w-0 font-sans">
                                                <div className="flex items-center justify-between gap-1.5">
                                                    <p className="text-[11.5px] font-bold text-zinc-150 truncate">{item.name}</p>
                                                    <button 
                                                        onClick={() => insertLibrarySfx(item)}
                                                        className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                                                            isJustAdded 
                                                                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                                                                : 'text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/15'
                                                        }`}
                                                        title="Quick insert at playhead"
                                                    >
                                                        {isJustAdded ? '✓' : '+ add'}
                                                    </button>
                                                </div>
                                                <p className="text-[9.5px] text-zinc-350 mt-0.5 leading-normal truncate font-medium">{item.description}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Motion Graphics Library */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">motion designs & layouts</h3>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                {LIBRARY_GRAPHICS.map((item) => {
                                    const isJustAdded = justAddedIds.includes(item.id);
                                    return (
                                        <div 
                                            key={item.id}
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, "graphics", item)}
                                            onDragEnd={() => onDragStateChange?.(null)}
                                            className={`relative rounded-xl border cursor-grab active:cursor-grabbing flex flex-col group overflow-hidden transition-all duration-200 shadow-sm ${
                                                isJustAdded 
                                                    ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] scale-[0.98]' 
                                                    : 'border-white/5 bg-white/[0.03] hover:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                                            }`}
                                        >
                                            <div className="w-full h-15 bg-zinc-950 pointer-events-none overflow-hidden opacity-60 group-hover:opacity-90 transition-opacity">
                                                <iframe
                                                    srcDoc={`<!doctype html><html><head><meta charset="UTF-8"/><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;overflow:hidden;background:#050507;display:flex;align-items:center;justify-content:center;}.clip{position:absolute;}#root{width:1080px;height:1920px;position:relative;transform-origin:top left;transform:scale(0.074);}</style></head><body><div id="root">${item.html}</div></body></html>`}
                                                    className="w-full h-full border-none rounded-t-xl"
                                                    style={{ background: 'transparent' }}
                                                    title={`lib-graphic-${item.id}`}
                                                />
                                            </div>
                                            
                                            <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-white/5 bg-[#08080a]/90 font-sans">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[11.5px] font-bold text-zinc-200 truncate">{item.name}</span>
                                                    <span className="text-[9.5px] text-zinc-355 truncate font-medium mt-0.5">{item.description}</span>
                                                </div>
                                                
                                                <button 
                                                    onClick={() => insertLibraryGraphic(item)}
                                                    className={`w-6 h-6 rounded-full bg-zinc-950 border flex items-center justify-center text-[13px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 shrink-0 ml-1.5 ${
                                                        isJustAdded 
                                                            ? 'border-emerald-500 text-emerald-400 bg-emerald-950/80' 
                                                            : 'border-white/10 hover:border-amber-500 hover:text-amber-500 text-zinc-200'
                                                    }`}
                                                    title="Quick insert at playhead"
                                                >
                                                    {isJustAdded ? '✓' : '+'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Applied Edits Tracker */}
                        {activeEdits.length > 0 && (
                            <div className="pt-5 border-t border-white/5 space-y-4">
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">currently active edits ({activeEdits.length})</h3>
                                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                                    {activeEdits.map((e, i) => {
                                        let label = e.action.replace("add_", "").replace("_overlay", "");
                                        if (e.action === 'add_broll') label = `broll: ${e.query}`;
                                        else if (e.action === 'add_asset') label = `${e.asset_query?.toLowerCase().includes('sfx') ? 'sfx' : 'music'}: ${e.asset_query}`;
                                        return (
                                            <div key={i} className="flex items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-2xl text-[12.5px] text-zinc-200 font-sans shadow-md">
                                                <span className="truncate max-w-[200px] font-medium">{label}</span>
                                                <span className="text-zinc-400 shrink-0 font-sans text-[15px] font-semibold">{e.start != null ? `${e.start.toFixed(1)}s` : '0s'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {sidebarTab === 'music' && (
                    <div className="space-y-7">
                        {isMobile ? (
                            <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-zinc-350 flex flex-col gap-2 font-sans shadow-sm">
                                <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                                    💡 Soundtrack Management
                                </span>
                                <span className="text-[12px] leading-relaxed text-zinc-300 font-medium">
                                    Tap "select track" below to overlay the selected audio track onto your timeline.
                                </span>
                            </div>
                        ) : (
                            <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-zinc-350 flex flex-col gap-2 font-sans shadow-sm">
                                <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                                    💡 Soundtrack Management
                                </span>
                                <span className="text-[12px] leading-relaxed text-zinc-300 font-medium">
                                    Select a track below. You can also **drag and drop** the card onto the **music m1** track of the timeline.
                                </span>
                            </div>
                        )}
                        
                        {Object.entries(categories).map(([catName, tracks]) => (
                            <div key={catName}>
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
                                    <span className="w-1 h-3 bg-amber-500 shrink-0 rounded-full" />
                                    {catName.toLowerCase()}
                                </h3>
                                
                                <div className="space-y-2">
                                    {tracks.map(track => {
                                        const isApplied = activeBgmName.toLowerCase().includes(track.name.split(" - ").pop()?.toLowerCase() || "___non_existent___") || activeBgmName.toLowerCase().includes(track.title.toLowerCase());
                                        const isPlaying = playingTrack === track.name;
                                        const isJustAdded = justAddedIds.includes(track.name);
                                        return (
                                            <div 
                                                key={track.name} 
                                                draggable="true"
                                                onDragStart={(e) => handleDragStart(e, "music", track)}
                                                onDragEnd={() => onDragStateChange?.(null)}
                                                className={`p-2 border flex flex-col gap-1.5 transition-all duration-200 rounded-xl cursor-grab active:cursor-grabbing shadow-sm ${
                                                    isApplied 
                                                        ? 'border-amber-500/40 bg-amber-500/5' 
                                                        : isJustAdded
                                                            ? 'border-emerald-500 bg-emerald-950/10 shadow-[0_0_12px_rgba(16,185,129,0.2)] scale-[0.98]'
                                                            : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <h4 className={`text-[12px] font-bold truncate ${isApplied ? 'text-amber-500' : isJustAdded ? 'text-emerald-400' : 'text-zinc-150'}`}>
                                                            {track.title}
                                                        </h4>
                                                        <p className="text-[10px] text-zinc-450 font-sans">{track.artist}</p>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-1">
                                                        <button 
                                                            onClick={(ev) => { ev.stopPropagation(); togglePlayTrack(track); }}
                                                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all border cursor-pointer hover:scale-105 active:scale-95 shrink-0 ${
                                                                isPlaying 
                                                                    ? 'bg-amber-500/10 border-amber-500 text-amber-500' 
                                                                    : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'
                                                            }`}
                                                        >
                                                            {isPlaying ? (
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                                            ) : (
                                                                <svg className="w-3 h-3 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                            )}
                                                        </button>
                                                        <button 
                                                            onClick={(ev) => { ev.stopPropagation(); applyMusicTrack(track.name); }}
                                                            disabled={isApplied}
                                                            className={`h-7 px-3 rounded-lg text-[11px] font-semibold tracking-wide transition-all flex items-center justify-center cursor-pointer ${
                                                                isApplied 
                                                                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 cursor-default shadow-sm' 
                                                                    : isJustAdded
                                                                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm'
                                                                        : 'bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-200 active:scale-98 shadow-sm'
                                                            }`}
                                                        >
                                                            {isApplied ? 'applied' : isJustAdded ? 'added' : 'select'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {sidebarTab === 'stock' && (
                    <div className="space-y-4 animate-fadeIn">
                        <div className="bg-white/[0.02] border border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] rounded-lg p-2 flex flex-col gap-1 shadow-sm">
                            <span className="text-[9.5px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1">
                                🔍 Global Stock Engine
                            </span>
                            <span className="text-[9px] leading-relaxed text-zinc-400 font-medium font-sans">
                                Search and download copyright-free background soundtracks or vector emoji stickers.
                            </span>
                        </div>

                        {/* Search Mode Switcher */}
                        <div className="flex bg-white/[0.02] backdrop-blur-md p-0.5 rounded-lg border border-white/5 shadow-inner gap-0.5">
                            <button
                                onClick={() => setStockType('stickers')}
                                className={`flex-1 py-0.5 rounded-md text-[8.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    stockType === 'stickers' ? 'bg-zinc-900/80 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                stickers
                            </button>
                            <button
                                onClick={() => setStockType('music')}
                                className={`flex-1 py-0.5 rounded-md text-[8.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    stockType === 'music' ? 'bg-zinc-900/80 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                music
                            </button>
                            <button
                                onClick={() => setStockType('ai_audio')}
                                className={`flex-1 py-0.5 rounded-md text-[8.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    stockType === 'ai_audio' ? 'bg-zinc-900/80 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                AI stable-audio
                            </button>
                        </div>

                        {stockType !== 'ai_audio' ? (
                            <>
                                {/* Search Input Bar */}
                                <form onSubmit={handleStockSearch} className="flex gap-1">
                                    <input
                                        type="text"
                                        value={stockQuery}
                                        onChange={(e) => setStockQuery(e.target.value)}
                                        placeholder={stockType === 'stickers' ? "Search stickers (fire, subscribe)..." : "Search music (cozy, lofi)..."}
                                        className="flex-1 bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-lg px-2 py-1 text-[9.5px] text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/20 transition-colors font-sans"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSearchingStock}
                                        className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-black px-2.5 py-1 rounded-lg text-[9.5px] font-bold transition-all shadow-md active:scale-95 cursor-pointer shrink-0 font-sans"
                                    >
                                        {isSearchingStock ? '...' : 'Search'}
                                    </button>
                                </form>

                                {/* Search Results Display */}
                                {stockError && (
                                    <div className="text-[10px] text-rose-500 bg-rose-950/20 border border-rose-500/20 rounded-lg p-1.5 font-sans">
                                        ⚠️ {stockError}
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    {isSearchingStock ? (
                                        <div className="text-center py-4">
                                            <div className="w-4 h-4 rounded-full border-[1.5px] border-white/10 border-t-amber-500 animate-spin mx-auto mb-1" />
                                            <span className="text-[9.5px] text-zinc-450 font-medium font-sans">Searching stock catalog...</span>
                                        </div>
                                    ) : stockResults.length === 0 ? (
                                        <div className="text-center py-4 bg-white/[0.01] border border-white/5 rounded-lg">
                                            <span className="text-[9.5px] text-zinc-550 font-medium font-sans">
                                                {stockQuery.trim() ? "No assets matched your search." : "Type a query and click Search."}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {stockResults.map((item) => {
                                                const assetId = stockType === 'stickers' ? `stock_sticker_${item.id}` : `stock_music_${item.id}`;
                                                const isDownloading = downloadingAssetId === assetId;
                                                const isDownloaded = !!downloadedAssets[assetId];
                                                const isTrackPlaying = playingTrack === item.name || (stockType === 'music' && playingTrack === item.title);

                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="p-1 border rounded-lg flex flex-col gap-1 transition-all shadow-sm border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)]"
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            {stockType === 'stickers' && item.url && (
                                                                <div className="w-6 h-6 bg-zinc-950/80 border border-white/5 rounded-md flex items-center justify-center p-0.5 shrink-0 shadow-inner">
                                                                    <img
                                                                        src={item.url}
                                                                        alt={item.name}
                                                                        className="w-full h-full object-contain"
                                                                        onError={(e) => {
                                                                            (e.target as any).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233f3f46'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'/%3E%3C/svg%3E";
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}

                                                            <div className="flex-1 min-w-0 font-sans">
                                                                <h4 className="text-[10px] font-bold text-zinc-150 truncate leading-tight">
                                                                    {stockType === 'stickers' ? item.name : item.title}
                                                                </h4>
                                                                <div className="flex items-center justify-between gap-1 mt-0.5">
                                                                    {item.artist && (
                                                                        <p className="text-[8.5px] text-zinc-400 font-sans truncate">by {item.artist}</p>
                                                                    )}
                                                                    <p className="text-[8px] text-zinc-450 font-medium truncate leading-none">{item.description}</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 mt-0.5">
                                                            {stockType === 'music' && (
                                                                <button
                                                                    onClick={() => {
                                                                        if (!audioPreviewRef.current) {
                                                                            audioPreviewRef.current = new Audio();
                                                                        }
                                                                        if (isTrackPlaying) {
                                                                            audioPreviewRef.current.pause();
                                                                            setPlayingTrack(null);
                                                                        } else {
                                                                            audioPreviewRef.current.src = item.url;
                                                                            audioPreviewRef.current.volume = 0.5;
                                                                            audioPreviewRef.current.play().catch(err => console.error("Audio preview failed:", err));
                                                                            setPlayingTrack(item.title);
                                                                            audioPreviewRef.current.onended = () => {
                                                                                setPlayingTrack(null);
                                                                            };
                                                                        }
                                                                    }}
                                                                    className={`w-5.5 h-5.5 rounded-full flex items-center justify-center transition-all border cursor-pointer shrink-0 ${
                                                                        isTrackPlaying
                                                                            ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-sm'
                                                                            : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'
                                                                    }`}
                                                                    title="Preview audio track"
                                                                >
                                                                    {isTrackPlaying ? (
                                                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                                                    ) : (
                                                                        <svg className="w-2.5 h-2.5 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                                    )}
                                                                </button>
                                                            )}

                                                    <button
                                                        onClick={() => handleDownloadAsset(item)}
                                                        disabled={isDownloading || isDownloaded}
                                                        className={`flex-1 h-5.5 rounded-lg text-[8.5px] font-semibold tracking-wide transition-all flex items-center justify-center gap-0.5 cursor-pointer ${
                                                            isDownloaded
                                                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 cursor-default'
                                                                : isDownloading
                                                                    ? 'bg-zinc-900/50 border border-white/5 text-zinc-400 cursor-default'
                                                                    : 'bg-amber-500 hover:bg-amber-400 text-black font-bold active:scale-[0.98]'
                                                        }`}
                                                    >
                                                        {isDownloading ? (
                                                            <>
                                                                <div className="w-2.5 h-2.5 rounded-full border-[1.2px] border-zinc-400 border-t-white animate-spin" />
                                                                <span>Downloading...</span>
                                                            </>
                                                        ) : isDownloaded ? (
                                                            <>
                                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>
                                                                <span>Downloaded & Active</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                                                <span>Download & Add</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                            <form onSubmit={handleGenerateAiAudio} className="space-y-3 font-sans animate-fadeIn">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-wide">Sound/Music prompt</span>
                                    <textarea
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        placeholder="e.g. 80s synthwave retro beat or cinematic deep impact whoosh..."
                                        rows={2}
                                        className="w-full bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-lg px-2 py-1 text-[9.5px] text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/20 transition-colors resize-none font-sans"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <div className="flex-1 flex flex-col gap-1">
                                        <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-wide">Type</span>
                                        <div className="flex bg-zinc-950/40 p-0.5 rounded-lg border border-white/5 gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setAiIsBgm(false)}
                                                className={`flex-1 py-1 rounded-md text-[8.5px] font-bold uppercase transition-all cursor-pointer ${
                                                    !aiIsBgm ? 'bg-zinc-900 text-amber-500 border border-white/5' : 'text-zinc-400 hover:text-zinc-200'
                                                }`}
                                            >
                                                sfx
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAiIsBgm(true)}
                                                className={`flex-1 py-1 rounded-md text-[8.5px] font-bold uppercase transition-all cursor-pointer ${
                                                    aiIsBgm ? 'bg-zinc-900 text-amber-500 border border-white/5' : 'text-zinc-400 hover:text-zinc-200'
                                                }`}
                                            >
                                                music
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <span className="text-[8.5px] font-bold text-zinc-450 uppercase tracking-wide">Seconds: {aiDuration}s</span>
                                        <input
                                            type="range"
                                            min="3"
                                            max="45"
                                            value={aiDuration}
                                            onChange={(e) => setAiDuration(parseInt(e.target.value))}
                                            className="w-full accent-amber-500 h-1.5 bg-zinc-950/60 rounded-lg appearance-none cursor-pointer mt-1.5"
                                        />
                                    </div>
                                </div>

                                {aiAudioError && (
                                    <div className="text-[9px] text-rose-500 bg-rose-950/20 border border-rose-500/20 rounded-lg p-1.5 font-sans leading-tight">
                                        ⚠️ {aiAudioError}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isGeneratingAudio || !aiPrompt.trim()}
                                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-black py-1.5 rounded-lg text-[9.5px] font-bold transition-all shadow-md active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 font-sans"
                                >
                                    {isGeneratingAudio ? (
                                        <>
                                            <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-zinc-900 border-t-transparent animate-spin" />
                                            <span>Generating via Replicate...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                            </svg>
                                            <span>Generate Audio with Stable AI</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                )}

                {sidebarTab === 'color' && (
                    <div className="space-y-7">
                        <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-zinc-350 flex flex-col gap-2 font-sans shadow-sm">
                            <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                                💡 Цветокоррекция и LUTs
                            </span>
                            <span className="text-[12px] leading-relaxed text-zinc-300 font-medium">
                                Перетащите пресет на дорожку «Цветокор» (C1) или нажмите кнопку «+» на карточке пресета для добавления на позицию плейхеда.
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            {LUT_PRESETS.map((item) => {
                                const isJustAdded = justAddedIds.includes(item.id);
                                return (
                                    <div 
                                        key={item.id} 
                                        draggable="true"
                                        onDragStart={(e) => handleDragStart(e, "color", item)}
                                        onDragEnd={() => onDragStateChange?.(null)}
                                        className={`relative aspect-video bg-zinc-950 border rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all group flex flex-col items-center justify-center shadow-sm ${
                                            isJustAdded 
                                                ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] scale-[0.98]' 
                                                : 'border-white/5 bg-white/[0.01] hover:border-white/20'
                                        }`}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-900 to-zinc-950 opacity-90 z-0" />
                                        
                                        <div 
                                            className="absolute top-3 left-3 w-4 h-4 rounded-full border border-white/20 shadow z-10" 
                                            style={{
                                                background: item.id === 'cinema' ? 'linear-gradient(135deg, #1e3a8a, #b45309)' :
                                                            item.id === 'vintage' ? 'linear-gradient(135deg, #78350f, #d97706)' :
                                                            item.id === 'cyberpunk' ? 'linear-gradient(135deg, #ec4899, #06b6d4)' :
                                                            item.id === 'monochrome' ? 'linear-gradient(135deg, #111827, #f9fafb)' :
                                                            item.id === 'teal_orange' ? 'linear-gradient(135deg, #0f766e, #c2410c)' :
                                                            item.id === 'vibrant' ? 'linear-gradient(135deg, #e11d48, #fbbf24)' :
                                                            item.id === 'cold' ? 'linear-gradient(135deg, #1e40af, #60a5fa)' :
                                                            'linear-gradient(135deg, #b45309, #f59e0b)'
                                            }}
                                        />

                                        <div className="absolute top-1.5 right-1.5 z-10">
                                            <button 
                                                onClick={() => insertLutPreset(item)}
                                                className={`w-5.5 h-5.5 rounded-full bg-black/60 backdrop-blur-md border flex items-center justify-center text-[12px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                                                    isJustAdded 
                                                        ? 'border-emerald-500 text-emerald-400 bg-emerald-950/85' 
                                                        : 'border-white/15 hover:border-amber-500 hover:text-amber-500 text-zinc-200'
                                                }`}
                                                title="Добавить на позицию плейхеда"
                                            >
                                                {isJustAdded ? '✓' : '+'}
                                            </button>
                                        </div>
                                        
                                        <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-col font-sans">
                                            <span className="text-[11.5px] font-semibold text-white truncate text-shadow leading-tight">
                                                {item.name}
                                            </span>
                                            <span className="text-[9.5px] text-zinc-355 truncate mt-[1px] font-medium leading-none">
                                                {item.description}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {sidebarTab === 'inspect' && focusedItem && (() => {
                    const subEdit = activeEdits.find(e => e.action === 'add_subtitles') || {
                        action: 'add_subtitles',
                        font: 'Arial',
                        font_size: 100,
                        font_color: 'White',
                        use_outline: true,
                        position: 'bottom',
                        animation_style: 'fade'
                    };

                    const isSub = focusedItem.type === 'subtitles';
                    const isBroll = focusedItem.type === 'broll';
                    const isMusic = focusedItem.type === 'music';
                    const isSfx = focusedItem.type === 'sfx';
                    const isGraphic = focusedItem.type === 'graphics';
                    const isScene = focusedItem.type === 'scene';
                    const isEdl = focusedItem.type === 'video' || focusedItem.type === 'audio';
                    const isColor = focusedItem.type === 'color';

                    const targetEdit = focusedItem.editIndex !== undefined && focusedItem.editIndex !== -1 
                        ? activeEdits[focusedItem.editIndex] 
                        : null;

                    const startVal = isEdl 
                        ? (focusedItem.type === 'video' ? multiTrackEdl?.v1[focusedItem.editIndex]?.start : multiTrackEdl?.a1[focusedItem.editIndex]?.start) || 0
                        : targetEdit?.start != null ? targetEdit.start : focusedItem.start;

                    const endVal = isEdl 
                        ? (focusedItem.type === 'video' ? multiTrackEdl?.v1[focusedItem.editIndex]?.end : multiTrackEdl?.a1[focusedItem.editIndex]?.end) || duration
                        : targetEdit?.end != null ? targetEdit.end : focusedItem.end;

                    const currentVolume = targetEdit?.volume != null ? targetEdit.volume : (isMusic ? -22 : -10);

                    // Helpers
                    const updateSubtitleGlobalStyle = (field: string, value: any) => {
                        if (!onActiveEditsChange) return;
                        const exists = activeEdits.some(e => e.action === 'add_subtitles');
                        if (exists) {
                            const updated = activeEdits.map(e => {
                                if (e.action === 'add_subtitles') {
                                    return { ...e, [field]: value };
                                }
                                return e;
                            });
                            onActiveEditsChange(updated);
                        } else {
                            const newSubEdit = {
                                action: 'add_subtitles',
                                font: 'Arial',
                                font_size: 100,
                                font_color: 'White',
                                use_outline: true,
                                position: 'bottom',
                                animation_style: 'fade',
                                [field]: value
                            };
                            onActiveEditsChange([...activeEdits, newSubEdit]);
                        }
                    };

                    const updateEditProperty = (field: string, value: any) => {
                        if (!onActiveEditsChange || focusedItem.editIndex === undefined || focusedItem.editIndex === -1) return;
                        const updated = [...activeEdits];
                        updated[focusedItem.editIndex] = {
                            ...updated[focusedItem.editIndex],
                            [field]: value
                        };
                        onActiveEditsChange(updated);
                    };

                    const updateSceneEntityProperty = (entityId: string, field: string, value: any) => {
                        if (!onActiveEditsChange || focusedItem.editIndex === undefined || focusedItem.editIndex === -1) return;
                        const targetEdit = activeEdits[focusedItem.editIndex];
                        if (!targetEdit || !targetEdit.scene_data || !targetEdit.scene_data.entities) return;

                        const updatedEntities = targetEdit.scene_data.entities.map((ent: any) => {
                            if (ent.id === entityId) {
                                return { ...ent, [field]: value };
                            }
                            return ent;
                        });

                        const updatedSceneData = { ...targetEdit.scene_data, entities: updatedEntities };
                        const updated = [...activeEdits];
                        updated[focusedItem.editIndex] = {
                            ...targetEdit,
                            scene_data: updatedSceneData
                        };
                        onActiveEditsChange(updated);
                    };

                    const updateSingleChunkProperty = (field: string, value: any) => {
                        if (!onActiveEditsChange || focusedItem.subIdx === undefined) return;
                        const indices = (selectedSubIndices && selectedSubIndices.length > 0)
                            ? selectedSubIndices
                            : [focusedItem.subIdx];

                        let updatedEdits = [...activeEdits];

                        indices.forEach(idx => {
                            const chunk = subtitleChunks ? subtitleChunks[idx] : null;
                            if (!chunk) return;

                            // 1. Ensure subtitle_override exists and is deleted
                            let overrideIndex = updatedEdits.findIndex(e => e.action === 'subtitle_override' && e.chunk_index === idx);
                            if (overrideIndex === -1) {
                                const spokenText = chunk.words.map((w: any) => w.word).join(' ');
                                updatedEdits.push({
                                    action: 'subtitle_override',
                                    chunk_index: idx,
                                    deleted: true,
                                    text: spokenText,
                                    start: chunk.start,
                                    end: chunk.end
                                });
                            } else {
                                updatedEdits[overrideIndex] = {
                                    ...updatedEdits[overrideIndex],
                                    deleted: true
                                };
                            }

                            // 2. Ensure custom add_text_overlay exists with is_subtitle: true
                            const overlayId = `G1-Graphic-Sub-${idx}`;
                            let overlayIndex = updatedEdits.findIndex(e => e.action === 'add_text_overlay' && e.is_subtitle && e.id === overlayId);
                            
                            const defaultText = chunk.words.map((w: any) => w.word).join(' ');

                            if (overlayIndex === -1) {
                                const newOverlay: any = {
                                    action: 'add_text_overlay',
                                    is_subtitle: true,
                                    id: overlayId,
                                    chunk_index: idx,
                                    text: defaultText,
                                    start: chunk.start,
                                    end: chunk.end,
                                    font: subEdit.font || 'Arial',
                                    font_size: subEdit.font_size || 100,
                                    fontsize: subEdit.font_size || 100,
                                    font_color: subEdit.font_color || 'White',
                                    color: subEdit.font_color || 'White',
                                    use_outline: subEdit.use_outline !== false,
                                    position: subEdit.position || 'bottom',
                                    animation_style: subEdit.animation_style || 'fade',
                                    x: subEdit.x !== undefined ? subEdit.x : 50,
                                    y: subEdit.y !== undefined ? subEdit.y : 78,
                                    use_shadow: subEdit.use_shadow !== false,
                                    shadow_blur: subEdit.shadow_blur !== undefined ? subEdit.shadow_blur : 18,
                                    text_case: subEdit.text_case || 'Sentence_Case'
                                };
                                newOverlay[field] = value;
                                if (field === 'font_size' || field === 'fontsize') {
                                    newOverlay.font_size = value;
                                    newOverlay.fontsize = value;
                                }
                                if (field === 'font_color' || field === 'color') {
                                    newOverlay.font_color = value;
                                    newOverlay.color = value;
                                }
                                updatedEdits.push(newOverlay);
                            } else {
                                updatedEdits[overlayIndex] = {
                                    ...updatedEdits[overlayIndex],
                                    [field]: value
                                };
                                if (field === 'font_size' || field === 'fontsize') {
                                    updatedEdits[overlayIndex].font_size = value;
                                    updatedEdits[overlayIndex].fontsize = value;
                                }
                                if (field === 'font_color' || field === 'color') {
                                    updatedEdits[overlayIndex].font_color = value;
                                    updatedEdits[overlayIndex].color = value;
                                }
                            }
                        });

                        onActiveEditsChange(updatedEdits);
                    };

                    const getActiveSubValue = (field: string, defaultValue: any) => {
                        if (selectedSubMode === 'single') {
                            const firstIdx = (selectedSubIndices && selectedSubIndices.length > 0) ? selectedSubIndices[0] : focusedItem.subIdx;
                            const overlayId = `G1-Graphic-Sub-${firstIdx}`;
                            const chunkOverlay = activeEdits.find(e => e.action === 'add_text_overlay' && e.is_subtitle && e.id === overlayId);
                            if (chunkOverlay) {
                                if (field === 'font_size' || field === 'fontsize') {
                                    return chunkOverlay.font_size || chunkOverlay.fontsize || defaultValue;
                                }
                                if (field === 'font_color' || field === 'color') {
                                    return chunkOverlay.font_color || chunkOverlay.color || defaultValue;
                                }
                                return chunkOverlay[field] !== undefined ? chunkOverlay[field] : defaultValue;
                            }
                        }
                        return subEdit[field] !== undefined ? subEdit[field] : defaultValue;
                    };

                    const updateSubtitleText = (newText: string) => {
                        if (!onActiveEditsChange || focusedItem.subIdx === undefined) return;
                        const idx = focusedItem.subIdx;
                        
                        let updatedEdits = [...activeEdits];
                        
                        // Update subtitle_override
                        let overrideIndex = updatedEdits.findIndex(e => e.action === 'subtitle_override' && e.chunk_index === idx);
                        if (overrideIndex === -1) {
                            updatedEdits.push({
                                action: 'subtitle_override',
                                chunk_index: idx,
                                deleted: selectedSubMode === 'single',
                                text: newText,
                                start: startVal,
                                end: endVal
                            });
                        } else {
                            updatedEdits[overrideIndex] = {
                                ...updatedEdits[overrideIndex],
                                text: newText
                            };
                        }
                        
                        // If single mode, update add_text_overlay text as well
                        if (selectedSubMode === 'single') {
                            const overlayId = `G1-Graphic-Sub-${idx}`;
                            let overlayIndex = updatedEdits.findIndex(e => e.action === 'add_text_overlay' && e.is_subtitle && e.id === overlayId);
                            if (overlayIndex !== -1) {
                                updatedEdits[overlayIndex] = {
                                    ...updatedEdits[overlayIndex],
                                    text: newText
                                };
                            }
                        }
                        
                        onActiveEditsChange(updatedEdits);
                    };

                    const deleteSubtitleText = () => {
                        if (!onActiveEditsChange || focusedItem.subIdx === undefined) return;
                        const idx = focusedItem.subIdx;
                        let updatedEdits = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === idx));
                        
                        // Filter out add_text_overlay override too
                        const overlayId = `G1-Graphic-Sub-${idx}`;
                        updatedEdits = updatedEdits.filter(ae => !(ae.action === 'add_text_overlay' && ae.is_subtitle && ae.id === overlayId));
                        
                        // Add deleted subtitle_override
                        updatedEdits.push({ 
                            action: 'subtitle_override', 
                            chunk_index: idx, 
                            deleted: true 
                        });
                        onActiveEditsChange(updatedEdits);
                        if (onClearFocus) onClearFocus();
                    };

                    const updateEdlTiming = (field: 'start' | 'end', value: number) => {
                        if (!onEdlChange || !multiTrackEdl || focusedItem.editIndex === undefined) return;
                        const track = focusedItem.type === 'video' ? 'v1' : 'a1';
                        const newEdl = { ...multiTrackEdl };
                        newEdl[track] = newEdl[track].map((c: any, i: number) => 
                            i === focusedItem.editIndex ? { ...c, [field]: value } : c
                        );
                        onEdlChange(newEdl);
                    };

                    return (
                        <div className="space-y-6 animate-fadeIn font-sans pb-8 text-zinc-200">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-[13.5px] font-bold text-white leading-none">
                                        Свойства
                                    </span>
                                    <span className="text-[15px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/10 select-none">
                                        {focusedItem.type}
                                    </span>
                                </div>
                                <button 
                                    onClick={onClearFocus}
                                    className="text-zinc-550 hover:text-white text-[10.5px] font-bold h-6 w-6 rounded-lg flex items-center justify-center cursor-pointer transition-all hover:bg-white/5"
                                    title="Сбросить фокус"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Focus info */}
                            <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-zinc-350 shadow-sm flex flex-col gap-1.5">
                                <span className="text-[15px] font-mono font-semibold uppercase tracking-wider text-zinc-500">выделенный клип:</span>
                                <span className="text-[12.5px] leading-relaxed text-white font-bold">{focusedItem.label}</span>
                                <span className="text-[11px] font-mono text-zinc-400 mt-1 select-none">
                                    Интервал: {startVal.toFixed(2)}s - {endVal.toFixed(2)}s ({(endVal - startVal).toFixed(2)}s)
                                </span>
                            </div>

                            {/* 1. Subtitles Form */}
                            {isSub && (
                                <div className="space-y-5">
                                    {/* Edit Mode Switcher */}
                                    <div className="flex bg-zinc-950/40 p-0.5 rounded-xl border border-white/5 gap-0.5 mb-1 font-sans">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSubMode('single')}
                                            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer ${
                                                selectedSubMode === 'single' ? 'bg-zinc-900 text-blue-500 border border-white/5' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            Фрагмент
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSubMode('all')}
                                            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer ${
                                                selectedSubMode === 'all' ? 'bg-zinc-900 text-blue-500 border border-white/5' : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                        >
                                            Всю дорожку
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[15px] font-mono uppercase text-zinc-500">Текст субтитра</label>
                                        <textarea
                                            value={focusedItem.label.replace(/^💬 Subtitle: "/, "").replace(/"$/, "")}
                                            onChange={(e) => updateSubtitleText(e.target.value)}
                                            rows={2}
                                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-[12.5px] text-white focus:outline-none focus:border-blue-500/40 shadow-inner resize-none font-sans"
                                            placeholder="Введите text оверлея..."
                                        />
                                    </div>

                                    <div className="w-full h-px bg-white/5 my-4" />

                                    <div className="space-y-4">
                                        <h4 className="text-[15px] font-bold text-zinc-300 uppercase tracking-wider font-mono">
                                            {selectedSubMode === 'single' ? 'Оформление фрагмента' : 'Оформление дорожки (Глобально)'}
                                        </h4>
                                        
                                        {/* Font Family */}
                                        <div className="flex items-center justify-between gap-6">
                                            <span className="text-[16px] font-medium text-zinc-400">Шрифт</span>
                                            <select
                                                value={getActiveSubValue('font', 'Arial')}
                                                onChange={(e) => selectedSubMode === 'single' ? updateSingleChunkProperty('font', e.target.value) : updateSubtitleGlobalStyle('font', e.target.value)}
                                                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[16px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                            >
                                                {['Inter', 'Manrope', 'Rubik', 'Oswald', 'Montserrat', 'Comfortaa', 'Lobster', 'JetBrainsMono', 'IBMPlexSans', 'BebasNeue', 'Arial', 'Impact', 'Courier New'].map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Font Size */}
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                <span>Размер</span>
                                                <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{getActiveSubValue('font_size', 100)}px</span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="30"
                                                max="200"
                                                value={getActiveSubValue('font_size', 100)}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value, 10);
                                                    if (selectedSubMode === 'single') {
                                                        updateSingleChunkProperty('font_size', val);
                                                    } else {
                                                        updateSubtitleGlobalStyle('font_size', val);
                                                    }
                                                }}
                                                className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                            />
                                        </div>

                                        {/* Font Color Buttons */}
                                        <div className="flex items-center justify-between gap-6">
                                            <span className="text-[16px] font-medium text-zinc-400">Цвет текста</span>
                                            <div className="flex gap-2">
                                                {['White', 'Yellow', 'Green', 'Red', 'Cyan'].map(color => {
                                                    const hex = color === 'White' ? '#ffffff' :
                                                                color === 'Yellow' ? '#FFD700' :
                                                                color === 'Green' ? '#55ff55' :
                                                                color === 'Red' ? '#ff5555' : '#00ffff';
                                                    const isAct = (getActiveSubValue('font_color', 'White')).toLowerCase() === color.toLowerCase();
                                                    return (
                                                        <button
                                                            key={color}
                                                            onClick={() => selectedSubMode === 'single' ? updateSingleChunkProperty('font_color', color) : updateSubtitleGlobalStyle('font_color', color)}
                                                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer shadow-md ${
                                                                isAct ? 'border-white scale-110 shadow-blue-500/30' : 'border-white/20 hover:border-white/50 hover:scale-105'
                                                            }`}
                                                            style={{ backgroundColor: hex }}
                                                            title={color}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Animation Style */}
                                        <div className="flex items-center justify-between gap-6">
                                            <span className="text-[16px] font-medium text-zinc-400">Анимация</span>
                                            <select
                                                value={getActiveSubValue('animation_style', 'fade')}
                                                onChange={(e) => selectedSubMode === 'single' ? updateSingleChunkProperty('animation_style', e.target.value) : updateSubtitleGlobalStyle('animation_style', e.target.value)}
                                                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[16px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                            >
                                                {[
                                                    { value: 'fade', label: 'Появление (Fade)' },
                                                    { value: 'pop', label: 'Увеличение (Pop)' },
                                                    { value: 'slide_up', label: 'Снизу (Slide Up)' },
                                                    { value: 'bounce', label: 'Пружина (Bounce)' },
                                                    { value: 'glow', label: 'Размытие (Glow/Blur)' },
                                                    { value: 'typewriter', label: 'Печатная машинка (Typewriter)' },
                                                    { value: 'karaoke', label: 'Караоке (Karaoke)' },
                                                    { value: 'slide_left', label: 'Слева (Slide Left)' },
                                                    { value: 'slide_right', label: 'Справа (Slide Right)' }
                                                ].map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Position Screen Anchor */}
                                        <div className="flex items-center justify-between gap-6">
                                            <span className="text-[16px] font-medium text-zinc-400">Положение</span>
                                            <select
                                                value={getActiveSubValue('position', 'bottom')}
                                                onChange={(e) => selectedSubMode === 'single' ? updateSingleChunkProperty('position', e.target.value) : updateSubtitleGlobalStyle('position', e.target.value)}
                                                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[16px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                            >
                                                {['bottom', 'center', 'top', 'left', 'right'].map(pos => (
                                                    <option key={pos} value={pos}>{pos}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Use Outline */}
                                        <div className="flex items-center justify-between gap-6">
                                            <span className="text-[16px] font-medium text-zinc-400">Обводка и тень</span>
                                            <button
                                                onClick={() => {
                                                    const nextVal = getActiveSubValue('use_outline', true) === false ? true : false;
                                                    if (selectedSubMode === 'single') {
                                                        updateSingleChunkProperty('use_outline', nextVal);
                                                    } else {
                                                        updateSubtitleGlobalStyle('use_outline', nextVal);
                                                    }
                                                }}
                                                className={`w-10 h-5 rounded-full p-0.5 transition-all cursor-pointer ${
                                                    getActiveSubValue('use_outline', true) !== false ? 'bg-blue-500' : 'bg-zinc-800'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                                                    getActiveSubValue('use_outline', true) !== false ? 'translate-x-5' : 'translate-x-0'
                                                }`} />
                                            </button>
                                        </div>

                                        {/* Position X Slider */}
                                        <div className="space-y-1.5 pt-2">
                                            <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                <span>Позиция X (%)</span>
                                                <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{getActiveSubValue('x', 50)}%</span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={getActiveSubValue('x', 50)}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value, 10);
                                                    if (selectedSubMode === 'single') {
                                                        updateSingleChunkProperty('x', val);
                                                    } else {
                                                        updateSubtitleGlobalStyle('x', val);
                                                    }
                                                }}
                                                className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                            />
                                        </div>

                                        {/* Position Y Slider */}
                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                <span>Позиция Y (%)</span>
                                                <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{getActiveSubValue('y', 78)}%</span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={getActiveSubValue('y', 78)}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value, 10);
                                                    if (selectedSubMode === 'single') {
                                                        updateSingleChunkProperty('y', val);
                                                    } else {
                                                        updateSubtitleGlobalStyle('y', val);
                                                    }
                                                }}
                                                className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                            />
                                        </div>

                                        {/* Letter Spacing Slider */}
                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                <span>Межбуквенный интервал (px)</span>
                                                <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{getActiveSubValue('letter_spacing', 0)}px</span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="-5"
                                                max="20"
                                                value={getActiveSubValue('letter_spacing', 0)}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value, 10);
                                                    if (selectedSubMode === 'single') {
                                                        updateSingleChunkProperty('letter_spacing', val);
                                                    } else {
                                                        updateSubtitleGlobalStyle('letter_spacing', val);
                                                    }
                                                }}
                                                className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                            />
                                        </div>

                                        {/* Line Spacing Slider */}
                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                <span>Межстрочный интервал (px)</span>
                                                <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{getActiveSubValue('line_spacing', 0)}px</span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="-20"
                                                max="80"
                                                value={getActiveSubValue('line_spacing', 0)}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value, 10);
                                                    if (selectedSubMode === 'single') {
                                                        updateSingleChunkProperty('line_spacing', val);
                                                    } else {
                                                        updateSubtitleGlobalStyle('line_spacing', val);
                                                    }
                                                }}
                                                className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="w-full h-px bg-white/5 my-4" />
                                    
                                    <button
                                        onClick={deleteSubtitleText}
                                        className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 hover:border-rose-500/45 text-rose-400 rounded-xl text-[16px] font-bold font-sans transition-all active:scale-[0.98] cursor-pointer"
                                    >
                                        Скрыть этот субтитр
                                    </button>
                                </div>
                            )}

                            {/* 2. B-Roll Form */}
                            {isBroll && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[15px] font-mono uppercase text-zinc-500">Запрос для кадра</label>
                                        <input
                                            type="text"
                                            value={targetEdit?.query || ''}
                                            onChange={(e) => updateEditProperty('query', e.target.value)}
                                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-[12.5px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                        />
                                    </div>
                                    
                                    <div className="flex gap-6">
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Начало (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={startVal}
                                                onChange={(e) => updateEditProperty('start', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Конец (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={endVal}
                                                onChange={(e) => updateEditProperty('end', parseFloat(e.target.value) || duration)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 3. Audio / Soundtrack Form */}
                            {(isMusic || isSfx) && (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                            <span>Громкость</span>
                                            <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{currentVolume} dB</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="-40"
                                            max="0"
                                            value={currentVolume}
                                            onChange={(e) => updateEditProperty('volume', parseInt(e.target.value, 10))}
                                            className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                        />
                                    </div>
                                    
                                    <div className="flex gap-6">
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Начало (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={startVal}
                                                onChange={(e) => updateEditProperty('start', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Конец (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={endVal}
                                                onChange={(e) => updateEditProperty('end', parseFloat(e.target.value) || duration)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 4. Graphics Form */}
                            {isGraphic && (
                                <div className="space-y-4">
                                    {targetEdit?.action === 'add_text_overlay' ? (
                                        <div className="space-y-4">
                                            {/* Text Content */}
                                            <div className="space-y-2">
                                                <label className="text-[15px] font-mono uppercase text-zinc-500">Текст оверлея</label>
                                                <textarea
                                                    value={targetEdit?.text || ''}
                                                    onChange={(e) => updateEditProperty('text', e.target.value)}
                                                    rows={3}
                                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-[12.5px] text-white focus:outline-none focus:border-blue-500/40 shadow-inner resize-none font-sans"
                                                    placeholder="Введите текст..."
                                                />
                                            </div>

                                            {/* Font Family */}
                                            <div className="flex items-center justify-between gap-6">
                                                <span className="text-[16px] font-medium text-zinc-400">Шрифт</span>
                                                <select
                                                    value={targetEdit?.font || 'Arial'}
                                                    onChange={(e) => updateEditProperty('font', e.target.value)}
                                                    className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[16px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                                >
                                                    {['Inter', 'Manrope', 'Rubik', 'Oswald', 'Montserrat', 'Comfortaa', 'Lobster', 'JetBrainsMono', 'IBMPlexSans', 'BebasNeue', 'Arial', 'Impact', 'Courier New'].map(f => (
                                                        <option key={f} value={f}>{f}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Font Size */}
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                    <span>Размер</span>
                                                    <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.fontsize || targetEdit?.font_size || 80}px</span>
                                                </div>
                                                <input 
                                                    type="range"
                                                    min="20"
                                                    max="250"
                                                    value={targetEdit?.fontsize || targetEdit?.font_size || 80}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value, 10);
                                                        updateEditProperty('fontsize', val);
                                                        updateEditProperty('font_size', val);
                                                    }}
                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                />
                                            </div>

                                            {/* Font Color Buttons */}
                                            <div className="flex items-center justify-between gap-6">
                                                <span className="text-[16px] font-medium text-zinc-400">Цвет текста</span>
                                                <div className="flex gap-2">
                                                    {['White', 'Yellow', 'Green', 'Red', 'Cyan'].map(color => {
                                                        const hex = color === 'White' ? '#ffffff' :
                                                                    color === 'Yellow' ? '#FFD700' :
                                                                    color === 'Green' ? '#55ff55' :
                                                                    color === 'Red' ? '#ff5555' : '#00ffff';
                                                        const isAct = (targetEdit?.color || targetEdit?.font_color || 'White').toLowerCase() === color.toLowerCase();
                                                        return (
                                                            <button
                                                                key={color}
                                                                onClick={() => {
                                                                    updateEditProperty('color', color);
                                                                    updateEditProperty('font_color', color);
                                                                }}
                                                                className={`w-6 h-6 rounded-full border transition-all cursor-pointer shadow-md ${
                                                                    isAct ? 'border-white scale-110 shadow-blue-500/30' : 'border-white/20 hover:border-white/50 hover:scale-105'
                                                                }`}
                                                                style={{ backgroundColor: hex }}
                                                                title={color}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Custom Coordinates (X, Y) Sliders */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                    <span>Позиция X (%)</span>
                                                    <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.x !== undefined ? targetEdit.x : 50}%</span>
                                                </div>
                                                <input 
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={targetEdit?.x !== undefined ? targetEdit.x : 50}
                                                    onChange={(e) => updateEditProperty('x', parseInt(e.target.value, 10))}
                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                />
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                    <span>Позиция Y (%)</span>
                                                    <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.y !== undefined ? targetEdit.y : 50}%</span>
                                                </div>
                                                <input 
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={targetEdit?.y !== undefined ? targetEdit.y : 50}
                                                    onChange={(e) => updateEditProperty('y', parseInt(e.target.value, 10))}
                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                />
                                            </div>

                                            {/* Letter Spacing Slider */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                    <span>Межбуквенный интервал (px)</span>
                                                    <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.letter_spacing !== undefined ? targetEdit.letter_spacing : 0}px</span>
                                                </div>
                                                <input 
                                                    type="range"
                                                    min="-5"
                                                    max="20"
                                                    value={targetEdit?.letter_spacing !== undefined ? targetEdit.letter_spacing : 0}
                                                    onChange={(e) => updateEditProperty('letter_spacing', parseInt(e.target.value, 10))}
                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                />
                                            </div>

                                            {/* Line Spacing Slider */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                    <span>Межстрочный интервал (px)</span>
                                                    <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.line_spacing !== undefined ? targetEdit.line_spacing : 0}px</span>
                                                </div>
                                                <input 
                                                    type="range"
                                                    min="-20"
                                                    max="80"
                                                    value={targetEdit?.line_spacing !== undefined ? targetEdit.line_spacing : 0}
                                                    onChange={(e) => updateEditProperty('line_spacing', parseInt(e.target.value, 10))}
                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                />
                                            </div>

                                            {/* Timing */}
                                            <div className="flex gap-6">
                                                <div className="flex-1 space-y-1.5">
                                                    <span className="text-[15px] font-mono uppercase text-zinc-500">Начало (сек)</span>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={startVal}
                                                        onChange={(e) => updateEditProperty('start', parseFloat(e.target.value) || 0)}
                                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <span className="text-[15px] font-mono uppercase text-zinc-500">Конец (сек)</span>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={endVal}
                                                        onChange={(e) => updateEditProperty('end', parseFloat(e.target.value) || duration)}
                                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                                    />
                                                </div>
                                            </div>

                                            {/* Animation Style */}
                                            <div className="flex items-center justify-between gap-6">
                                                <span className="text-[16px] font-medium text-zinc-400">Анимация</span>
                                                <select
                                                    value={targetEdit?.animation_style || 'fade'}
                                                    onChange={(e) => updateEditProperty('animation_style', e.target.value)}
                                                    className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[16px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                                >
                                                    {[
                                                        { value: 'fade', label: 'Появление (Fade)' },
                                                        { value: 'pop', label: 'Увеличение (Pop)' },
                                                        { value: 'slide_up', label: 'Снизу (Slide Up)' },
                                                        { value: 'bounce', label: 'Пружина (Bounce)' },
                                                        { value: 'glow', label: 'Размытие (Glow/Blur)' },
                                                        { value: 'typewriter', label: 'Печатная машинка (Typewriter)' },
                                                        { value: 'karaoke', label: 'Караоке (Karaoke)' },
                                                        { value: 'slide_left', label: 'Слева (Slide Left)' },
                                                        { value: 'slide_right', label: 'Справа (Slide Right)' }
                                                    ].map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Delete Overlay Button */}
                                            <div className="w-full h-px bg-white/5 my-4" />
                                            <button
                                                onClick={() => {
                                                    if (!onActiveEditsChange || focusedItem.editIndex === undefined) return;
                                                    const updated = activeEdits.filter((_, idx) => idx !== focusedItem.editIndex);
                                                    onActiveEditsChange(updated);
                                                    if (onClearFocus) onClearFocus();
                                                }}
                                                className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 hover:border-rose-500/45 text-rose-400 rounded-xl text-[16px] font-bold font-sans transition-all active:scale-[0.98] cursor-pointer"
                                            >
                                                Удалить этот оверлей
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between gap-6">
                                                <span className="text-[16px] font-medium text-zinc-400">Привязка</span>
                                                <select
                                                    value={targetEdit?.position || 'center'}
                                                    onChange={(e) => updateEditProperty('position', e.target.value)}
                                                    className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[16px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                                >
                                                    {['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
                                                        <option key={pos} value={pos}>{pos}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                                    <span>Масштаб</span>
                                                    <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.scale || 0.3}x</span>
                                                </div>
                                                <input 
                                                    type="range"
                                                    min="0.1"
                                                    max="2.0"
                                                    step="0.05"
                                                    value={targetEdit?.scale || 0.3}
                                                    onChange={(e) => updateEditProperty('scale', parseFloat(e.target.value))}
                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                />
                                            </div>

                                            <div className="flex gap-6">
                                                <div className="flex-1 space-y-1.5">
                                                    <span className="text-[15px] font-mono uppercase text-zinc-500">Начало (сек)</span>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={startVal}
                                                        onChange={(e) => updateEditProperty('start', parseFloat(e.target.value) || 0)}
                                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <span className="text-[15px] font-mono uppercase text-zinc-500">Конец (сек)</span>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={endVal}
                                                        onChange={(e) => updateEditProperty('end', parseFloat(e.target.value) || duration)}
                                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                                    />
                                                </div>
                                            </div>

                                            {(targetEdit?.action === 'canvas_overlay' || targetEdit?.action === 'hyperframes_html') && (
                                                <div className="space-y-2 pt-2">
                                                    <label className="text-[15px] font-mono uppercase text-zinc-500">HTML Код графики</label>
                                                    <textarea
                                                        value={targetEdit?.html_content || targetEdit?.html || ''}
                                                        onChange={(e) => updateEditProperty('html_content', e.target.value)}
                                                        rows={6}
                                                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-[10.5px] font-mono text-zinc-300 focus:outline-none focus:border-blue-500/40 shadow-inner resize-y"
                                                        placeholder="<div>...</div>"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* 5. Scene Form */}
                            {isScene && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[15px] font-mono uppercase text-zinc-500">Стиль сцены</label>
                                        <input
                                            type="text"
                                            value={targetEdit?.style || ''}
                                            onChange={(e) => updateEditProperty('style', e.target.value)}
                                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-[12.5px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                        />
                                    </div>

                                    <div className="flex gap-6">
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Начало (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={startVal}
                                                onChange={(e) => updateEditProperty('start', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Конец (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={endVal}
                                                onChange={(e) => updateEditProperty('end', parseFloat(e.target.value) || duration)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                    </div>

                                    {targetEdit?.action === 'semantic_scene' && targetEdit.scene_data?.entities && (
                                        <div className="space-y-4 pt-3 border-t border-white/5 font-sans">
                                            <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Элементы сцены</h4>
                                            <div className="space-y-3">
                                                {targetEdit.scene_data.entities.map((entity: any) => (
                                                    <div key={entity.id} className="bg-white/[0.03] border border-white/5 rounded-xl p-3.5 space-y-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)]">
                                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                            <span className="text-[10px] font-mono text-zinc-400 capitalize">{entity.type || 'element'}</span>
                                                            <span className="text-[11.5px] font-bold text-blue-400 font-mono">{entity.id}</span>
                                                        </div>
                                                        
                                                        {/* Text Edit */}
                                                        {entity.text !== undefined && (
                                                            <div className="space-y-1">
                                                                <label className="text-[9.5px] font-mono uppercase text-zinc-500">Текст содержимого</label>
                                                                <input
                                                                    type="text"
                                                                    value={entity.text || ''}
                                                                    onChange={(e) => updateSceneEntityProperty(entity.id, 'text', e.target.value)}
                                                                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-blue-500/40"
                                                                />
                                                            </div>
                                                        )}
                                                        
                                                        {/* Grid layout for coordinates & size */}
                                                        <div className="grid grid-cols-2 gap-3.5 pt-1">
                                                            {/* X Slider */}
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[11px] font-medium text-zinc-400">
                                                                    <span>Позиция X</span>
                                                                    <span className="font-mono text-white font-bold">{entity.x ?? 50}%</span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="0"
                                                                    max="100"
                                                                    value={entity.x ?? 50}
                                                                    onChange={(e) => updateSceneEntityProperty(entity.id, 'x', parseInt(e.target.value, 10))}
                                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                                />
                                                            </div>
                                                            
                                                            {/* Y Slider */}
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[11px] font-medium text-zinc-400">
                                                                    <span>Позиция Y</span>
                                                                    <span className="font-mono text-white font-bold">{entity.y ?? 50}%</span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="0"
                                                                    max="100"
                                                                    value={entity.y ?? 50}
                                                                    onChange={(e) => updateSceneEntityProperty(entity.id, 'y', parseInt(e.target.value, 10))}
                                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                                />
                                                            </div>
                                                            
                                                            {/* Width Slider */}
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[11px] font-medium text-zinc-400">
                                                                    <span>Ширина</span>
                                                                    <span className="font-mono text-white font-bold">{entity.width ?? 28}%</span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="2"
                                                                    max="100"
                                                                    value={entity.width ?? 28}
                                                                    onChange={(e) => updateSceneEntityProperty(entity.id, 'width', parseInt(e.target.value, 10))}
                                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                                />
                                                            </div>
                                                            
                                                            {/* Height Slider */}
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[11px] font-medium text-zinc-400">
                                                                    <span>Высота</span>
                                                                    <span className="font-mono text-white font-bold">{entity.height ?? 12}%</span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="2"
                                                                    max="100"
                                                                    value={entity.height ?? 12}
                                                                    onChange={(e) => updateSceneEntityProperty(entity.id, 'height', parseInt(e.target.value, 10))}
                                                                    className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 5.5 Color correction Form */}
                            {isColor && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-6">
                                        <span className="text-[16px] font-medium text-zinc-400">Пресет (LUT)</span>
                                        <select
                                            value={targetEdit?.preset || targetEdit?.lut || 'cinema'}
                                            onChange={(e) => {
                                                updateEditProperty('preset', e.target.value);
                                                updateEditProperty('lut', e.target.value);
                                            }}
                                            className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[16px] text-white focus:outline-none focus:border-blue-500/40 shadow-sm font-sans"
                                        >
                                            {LUT_PRESETS.map(opt => (
                                                <option key={opt.id} value={opt.id}>{opt.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                            <span>Яркость</span>
                                            <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.brightness ?? 100}%</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="50"
                                            max="150"
                                            value={targetEdit?.brightness ?? 100}
                                            onChange={(e) => updateEditProperty('brightness', parseInt(e.target.value, 10))}
                                            className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                            <span>Контраст</span>
                                            <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.contrast ?? 100}%</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="50"
                                            max="150"
                                            value={targetEdit?.contrast ?? 100}
                                            onChange={(e) => updateEditProperty('contrast', parseInt(e.target.value, 10))}
                                            className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                            <span>Насыщенность</span>
                                            <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.saturation ?? 100}%</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="0"
                                            max="200"
                                            value={targetEdit?.saturation ?? 100}
                                            onChange={(e) => updateEditProperty('saturation', parseInt(e.target.value, 10))}
                                            className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center text-[16px] font-medium text-zinc-400">
                                            <span>Оттенок (Hue)</span>
                                            <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">{targetEdit?.hue ?? 0}°</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="-180"
                                            max="180"
                                            value={targetEdit?.hue ?? 0}
                                            onChange={(e) => updateEditProperty('hue', parseInt(e.target.value, 10))}
                                            className="w-full accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                        />
                                    </div>

                                    <div className="flex gap-6">
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Начало (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={startVal}
                                                onChange={(e) => updateEditProperty('start', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Конец (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={endVal}
                                                onChange={(e) => updateEditProperty('end', parseFloat(e.target.value) || duration)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="w-full h-px bg-white/5 my-4" />
                                    <button
                                        onClick={() => {
                                            if (!onActiveEditsChange || focusedItem.editIndex === undefined) return;
                                            const updated = activeEdits.filter((_, idx) => idx !== focusedItem.editIndex);
                                            onActiveEditsChange(updated);
                                            if (onClearFocus) onClearFocus();
                                        }}
                                        className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 hover:border-rose-500/45 text-rose-400 rounded-xl text-[16px] font-bold font-sans transition-all active:scale-[0.98] cursor-pointer"
                                    >
                                        Удалить клип цветокоррекции
                                    </button>
                                </div>
                            )}

                            {/* 6. EDL Main Track Form */}
                            {isEdl && (
                                <div className="space-y-4">
                                    <div className="flex gap-6">
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Начало (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={startVal}
                                                onChange={(e) => updateEdlTiming('start', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[15px] font-mono uppercase text-zinc-500">Конец (сек)</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={endVal}
                                                onChange={(e) => updateEdlTiming('end', parseFloat(e.target.value) || duration)}
                                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-1.5 text-[12.5px] font-mono text-white focus:outline-none focus:border-blue-500/40 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
