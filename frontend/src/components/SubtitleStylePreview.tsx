"use client";

import { useEffect } from "react";
import type { CaptionLook } from "@/utils/resolveSubtitlePack";

interface SubtitleStylePreviewProps {
    look: CaptionLook | string;
    active?: boolean;
}

export function SubtitleStylePreview({ look, active }: SubtitleStylePreviewProps) {
    const play = active ? "is-playing" : "";

    useEffect(() => {
        if (typeof document === "undefined") return;
        if (document.getElementById("resolve-sub-fonts")) return;
        const link = document.createElement("link");
        link.id = "resolve-sub-fonts";
        link.rel = "stylesheet";
        link.href =
            "https://fonts.googleapis.com/css2?family=Lobster&family=Marck+Script&family=Manrope:wght@700&family=Montserrat:wght@800;900&display=swap";
        document.head.appendChild(link);
    }, []);

    if (look === "stacked") {
        return (
            <div className={`sub-prev sub-prev-stacked ${play}`}>
                <span className="sub-prev-front">Every</span>
                <span className="sub-prev-script">makes</span>
                <span className="sub-prev-back">day me</span>
                <span className="sub-prev-tail">stronger</span>
            </div>
        );
    }

    if (look === "dropcap") {
        return (
            <div className={`sub-prev sub-prev-dropcap ${play}`}>
                <span className="sub-prev-cap">A</span>
                <div className="sub-prev-body">
                    <span className="sub-prev-fill">WHY NO</span>
                    <span className="sub-prev-fill">ONE SAYS</span>
                    <span className="sub-prev-flourish">this</span>
                </div>
            </div>
        );
    }

    if (look === "boxed") {
        return (
            <div className={`sub-prev ${play}`}>
                <span className="sub-prev-box">YOUR MOVE</span>
            </div>
        );
    }

    if (look === "cinema") {
        return (
            <div className={`sub-prev sub-prev-cinema ${play}`}>
                <span>Stay with me</span>
            </div>
        );
    }

    if (look === "neon") {
        return (
            <div className={`sub-prev sub-prev-neon ${play}`}>
                <span>NEON NIGHT</span>
            </div>
        );
    }

    if (look === "karaoke") {
        return (
            <div className={`sub-prev sub-prev-karaoke ${play}`}>
                <span className="dim">MAKE IT</span>
                <span className="hot">GOLD</span>
            </div>
        );
    }

    if (look === "bar") {
        return (
            <div className={`sub-prev sub-prev-bar ${play}`}>
                <span>Lower third</span>
                <i />
            </div>
        );
    }

    if (look === "pill") {
        return (
            <div className={`sub-prev sub-prev-pill ${play}`}>
                <span>WORD</span>
                <span>PILLS</span>
            </div>
        );
    }

    if (look === "minimal") {
        return (
            <div className={`sub-prev sub-prev-minimal ${play}`}>
                <span>keep it quiet</span>
            </div>
        );
    }

    return (
        <div className={`sub-prev sub-prev-outline ${play}`}>
            <span>CLASSIC</span>
        </div>
    );
}
