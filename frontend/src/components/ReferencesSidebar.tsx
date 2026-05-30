import React, { useState, useRef, useEffect } from 'react';

interface ReferencesSidebarProps {
    activeEdits: any[];
    onActiveEditsChange?: (edits: any[]) => void;
    duration?: number;
    onClose?: () => void;
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

export default function ReferencesSidebar({ activeEdits, onActiveEditsChange, duration = 10, onClose }: ReferencesSidebarProps) {
    const [sidebarTab, setSidebarTab] = useState<'media' | 'music'>('media');
    const [playingTrack, setPlayingTrack] = useState<string | null>(null);
    const [playingSfx, setPlayingSfx] = useState<string | null>(null);
    const [hoveredBroll, setHoveredBroll] = useState<string | null>(null);
    const [tracks, setTracks] = useState<MusicTrack[]>(STATIC_FALLBACK_TRACKS);
    const [isLoadingTracks, setIsLoadingTracks] = useState(true);
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const sfxPreviewRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const fetchTracks = async () => {
            try {
                const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
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
    };

    const togglePlayTrack = (track: MusicTrack) => {
        if (!audioPreviewRef.current) {
            audioPreviewRef.current = new Audio();
        }
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
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
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
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
    };

    // Manual Quick Insert Buttons (Fallback in case they don't drag)
    const insertLibraryBroll = (item: typeof LIBRARY_BROLLS[0]) => {
        if (!onActiveEditsChange) return;
        const newEdit = {
            action: "add_broll",
            start: 0.0,
            end: Math.min(3.0, duration),
            query: item.query,
            broll_url: item.url
        };
        onActiveEditsChange([...activeEdits, newEdit]);
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
            className="w-full h-full flex flex-col overflow-hidden relative font-sans select-none text-zinc-200"
            style={{
                background: "rgba(11, 11, 15, 0.45)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)"
            }}
        >
            
            {/* Header Tabs */}
            <div className="bg-transparent border-b border-white/5 flex flex-col shrink-0 px-5 pt-4 pb-3">
                <div className="flex items-center justify-between mb-3.5">
                    <h2 className="text-[11px] font-bold tracking-widest text-zinc-400 uppercase">control deck</h2>
                    {onClose && (
                        <button 
                            onClick={onClose}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer bg-white/5 border border-white/10 shadow-sm"
                            title="Hide library"
                        >
                            ✕
                        </button>
                    )}
                </div>
                
                <div className="flex bg-zinc-950/60 p-1.5 rounded-2xl border border-white/5 shadow-inner">
                    <button 
                        onClick={() => setSidebarTab('media')}
                        className={`flex-1 py-2 rounded-xl text-[12.5px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${sidebarTab === 'media' ? 'bg-zinc-900 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-350'}`}
                    >
                        <span>assets library</span>
                    </button>
                    <button 
                        onClick={() => setSidebarTab('music')}
                        className={`flex-1 py-2 rounded-xl text-[12.5px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${sidebarTab === 'music' ? 'bg-zinc-900 text-amber-500 border border-white/5 shadow-sm' : 'text-zinc-400 hover:text-zinc-350'}`}
                    >
                        <span>soundtrack</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-hide space-y-7">
                
                {sidebarTab === 'media' && (
                    <div className="space-y-7">
                        <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-zinc-350 flex flex-col gap-2 shadow-sm">
                            <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                                💡 Interactive Drag & Drop
                            </span>
                            <span className="text-[12px] leading-relaxed text-zinc-300 font-medium">
                                Drag any reference card below and drop it directly onto the timeline tracks to overlay visual pacing elements.
                            </span>
                        </div>

                        {/* Video B-Rolls Library */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">video b-roll library</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                {LIBRARY_BROLLS.map((item) => (
                                    <div 
                                        key={item.id} 
                                        draggable="true"
                                        onDragStart={(e) => handleDragStart(e, "broll", item)}
                                        onMouseEnter={() => setHoveredBroll(item.id)}
                                        onMouseLeave={() => setHoveredBroll(null)}
                                        className="relative aspect-video bg-zinc-950 border border-white/5 rounded-2xl overflow-hidden cursor-grab hover:border-amber-500/50 active:cursor-grabbing transition-all group flex flex-col items-center justify-center shadow-lg"
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
                                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-0 opacity-80" />
                                        )}
                                        
                                        <div className="absolute top-2 right-2 z-10">
                                            <button 
                                                onClick={() => insertLibraryBroll(item)}
                                                className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/15 hover:border-amber-500 hover:text-amber-500 flex items-center justify-center text-[13px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 text-zinc-200"
                                                title="Quick insert at playhead"
                                            >
                                                +
                                            </button>
                                        </div>
                                        
                                        <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-col font-sans">
                                            <span className="text-[13px] font-semibold text-white truncate text-shadow">
                                                {item.name}
                                            </span>
                                            <span className="text-[11px] text-zinc-300 truncate mt-[2px] font-medium">
                                                {item.description}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* SFX Sounds Library */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">sfx click & sweeps</h3>
                            </div>
                            
                            <div className="flex flex-col gap-3">
                                {LIBRARY_SFX.map((item) => {
                                    const isPlaying = playingSfx === item.id;
                                    return (
                                        <div 
                                            key={item.id}
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, "sfx", item)}
                                            className="p-4 bg-white/5 rounded-2xl border border-white/10 cursor-grab hover:border-amber-500/50 hover:bg-white/8 active:cursor-grabbing flex items-center gap-4 group transition-all duration-200 shadow-md"
                                        >
                                            <button 
                                                onClick={() => togglePlaySfx(item)}
                                                className={`w-10 h-10 bg-zinc-950 border rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-all hover:scale-105 active:scale-95 ${isPlaying ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-white/10 text-zinc-450 hover:text-white hover:border-white/20'}`}
                                            >
                                                {isPlaying ? (
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                                ) : (
                                                    <svg className="w-4 h-4 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                )}
                                            </button>
                                            
                                            <div className="flex-1 min-w-0 font-sans">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[13.5px] font-bold text-zinc-150 truncate">{item.name}</p>
                                                    <button 
                                                        onClick={() => insertLibrarySfx(item)}
                                                        className="text-[12px] text-amber-500 hover:text-amber-400 font-bold px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-all cursor-pointer"
                                                        title="Quick insert at playhead"
                                                    >
                                                        + add
                                                    </button>
                                                </div>
                                                <p className="text-[11.5px] text-zinc-300 mt-1.5 leading-normal font-medium">{item.description}</p>
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
                            
                            <div className="flex flex-col gap-3.5">
                                {LIBRARY_GRAPHICS.map((item) => (
                                    <div 
                                        key={item.id}
                                        draggable="true"
                                        onDragStart={(e) => handleDragStart(e, "graphics", item)}
                                        className="relative bg-white/5 rounded-2xl border border-white/10 cursor-grab hover:border-amber-500/50 hover:bg-white/8 active:cursor-grabbing flex flex-col group overflow-hidden transition-all duration-200 shadow-md"
                                    >
                                        <div className="w-full h-20 bg-zinc-950 pointer-events-none overflow-hidden opacity-60 group-hover:opacity-90 transition-opacity">
                                            <iframe
                                                srcDoc={`<!doctype html><html><head><meta charset="UTF-8"/><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;overflow:hidden;background:#050507;display:flex;align-items:center;justify-content:center;}.clip{position:absolute;}#root{width:1080px;height:1920px;position:relative;transform-origin:top left;transform:scale(0.074);}</style></head><body><div id="root">${item.html}</div></body></html>`}
                                                className="w-full h-full border-none rounded-t-2xl"
                                                style={{ background: 'transparent' }}
                                                title={`lib-graphic-${item.id}`}
                                            />
                                        </div>
                                        
                                        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-[#08080a]/90 font-sans">
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-bold text-zinc-200">{item.name}</span>
                                                <span className="text-[11px] text-zinc-300 mt-1 font-medium">{item.description}</span>
                                            </div>
                                            
                                            <button 
                                                onClick={() => insertLibraryGraphic(item)}
                                                className="w-8 h-8 rounded-full bg-zinc-950 border border-white/10 hover:border-amber-500 hover:text-amber-500 flex items-center justify-center text-[14px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 text-zinc-200"
                                                title="Quick insert at playhead"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
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
                                                <span className="text-zinc-400 shrink-0 font-sans text-[11px] font-semibold">{e.start != null ? `${e.start.toFixed(1)}s` : '0s'}</span>
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
                        <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-zinc-350 flex flex-col gap-2 font-sans shadow-sm">
                            <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                                💡 Soundtrack Management
                            </span>
                            <span className="text-[12px] leading-relaxed text-zinc-300 font-medium">
                                Select a track below. You can also **drag and drop** the card onto the **music m1** track of the timeline.
                            </span>
                        </div>
                        
                        {Object.entries(categories).map(([catName, tracks]) => (
                            <div key={catName}>
                                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
                                    <span className="w-1 h-3 bg-amber-500 shrink-0 rounded-full" />
                                    {catName.toLowerCase()}
                                </h3>
                                
                                <div className="space-y-3.5">
                                    {tracks.map(track => {
                                        const isApplied = activeBgmName.toLowerCase().includes(track.name.split(" - ").pop()?.toLowerCase() || "___non_existent___") || activeBgmName.toLowerCase().includes(track.title.toLowerCase());
                                        const isPlaying = playingTrack === track.name;
                                        
                                        return (
                                            <div 
                                                key={track.name} 
                                                draggable="true"
                                                onDragStart={(e) => handleDragStart(e, "music", track)}
                                                className={`p-4.5 bg-white/5 border flex flex-col gap-3.5 transition-all duration-200 rounded-2xl cursor-grab active:cursor-grabbing hover:bg-white/8 shadow-md ${
                                                    isApplied 
                                                        ? 'border-amber-500/40 bg-amber-500/5' 
                                                        : 'border-white/10 hover:border-white/15'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className={`text-[14.5px] font-bold truncate ${isApplied ? 'text-amber-500' : 'text-white'}`}>
                                                            {track.title}
                                                        </h4>
                                                        <p className="text-[12px] text-zinc-350 font-sans">by {track.artist}</p>
                                                    </div>
                                                    
                                                    {isApplied && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full border border-amber-500/20 shrink-0 select-none animate-pulse">
                                                            active
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <p className="text-[12.5px] text-zinc-200 leading-relaxed font-medium">{track.description}</p>
                                                
                                                <div className="flex items-center gap-3 mt-1 shrink-0">
                                                    <button 
                                                        onClick={(ev) => { ev.stopPropagation(); togglePlayTrack(track); }}
                                                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border cursor-pointer hover:scale-105 active:scale-95 ${
                                                            isPlaying 
                                                                ? 'bg-amber-500/10 border-amber-500 text-amber-500' 
                                                                : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'
                                                        }`}
                                                    >
                                                        {isPlaying ? (
                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                                        ) : (
                                                            <svg className="w-4 h-4 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                        )}
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={(ev) => { ev.stopPropagation(); applyMusicTrack(track.name); }}
                                                        disabled={isApplied}
                                                        className={`flex-1 h-10 rounded-xl text-[12.5px] font-semibold tracking-wide transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                            isApplied 
                                                                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 cursor-default shadow-sm' 
                                                                : 'bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-200 active:scale-98 shadow-sm'
                                                        }`}
                                                    >
                                                        {isApplied ? (
                                                            <>
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                <span>applied</span>
                                                            </>
                                                        ) : (
                                                            <span>select track</span>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
