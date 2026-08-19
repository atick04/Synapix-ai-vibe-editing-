"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'ru';

export const translations = {
  en: {
    // Header
    heroTitlePrefix: "Auto-edit ",
    heroTitleHighlight: "Instagram Reels",
    heroSubtitle: "Upload a talking-head clip — ",
    heroSubtitleBold: "AI Reels Editor",
    heroSubtitleSuffix: " cuts, captions, zooms & sound for Instagram.",
    engineVersion: "Synapix Reels Engine",
    
    // Tips
    aiTipTitle: "AI Insight",
    tips: [
      "Best results: vertical talking-head, clear voice, 15–60 seconds.",
      "Clear audio = sharper auto-captions for Reels.",
      "AI removes silence and filler so the Reel stays punchy.",
      "Output is locked to Instagram Reels 9:16."
    ],

    // Recent Projects
    recentProjects: "Recent Projects",
    noRecentProjects: "No recent projects yet. Upload a video to get started.",

    // Dropzone
    dropzoneTitle: "Drop or select video here",
    dropzoneSubtitle: "Supports MP4, MOV, and WebM formats up to 2GB.",
    replaceFile: "Replace file",
    uploadingText: "Synthesizing and analyzing video...",
    fileReady: "Media file ready for processing",
    waitingFile: "Waiting for video file...",
    startEngine: "Make Instagram Reel",
    initializing: "Initializing...",

    // How it works
    howItWorks: "How it works",
    step1Title: "Upload",
    step1Desc: "Drop your talking-head clip for Instagram Reels.",
    step2Title: "Deep Analysis",
    step2Desc: "AI detects speech peaks, cuts silence, plans retention beats.",
    step3Title: "Reels Montage",
    step3Desc: "Captions, zooms, B-roll and sound — export a ready Reel.",

    // Formats
    formatActive: "Active",
    formatPreview: "Preview",
    formatTitles: {
      "Instagram Reels": "Instagram Reels"
    },

    // Chat Sidebar & Agent UI
    assistantTitle: "Synapix • Reels Director",
    assistantIntro: "I auto-edit talking-head clips into Instagram Reels: captions, zooms, B-roll, music and SFX.",
    welcomeMessage: "Hi! I'm your Instagram Reels director. Ask for a full Reel montage, or captions / zooms / sound. Everything is 9:16 for Instagram.",
    quickStart: "Quick Start:",
    quickPrompts: [
      "Full Instagram Reels montage",
      "Kinetic captions for Reels",
      "Add music + zooms on accents",
      "Hook graphic in the first 2 seconds"
    ],
    processing: "Processing...",
    working: "Working...",
    agentReasoning: "Agent Reasoning",
    editingDone: "Edit Complete",
    stepsCount: "steps",
    editingInProgress: "Auto-editing in progress...",
    collapse: "Collapse",
    details: "Details",
    inputPlaceholder: "Describe your video editing requests...",
    stop: "Stop",
    send: "Send",
    selectClip: "Select clip",
    selectedClip: "Selected clip"
  },
  ru: {
    // Header
    heroTitlePrefix: "Автомонтаж ",
    heroTitleHighlight: "Instagram Reels",
    heroSubtitle: "Загрузи talking-head — ",
    heroSubtitleBold: "ИИ для Reels",
    heroSubtitleSuffix: " сделает нарезку, субтитры, зумы и звук под Instagram.",
    engineVersion: "Synapix Reels Engine",

    // Tips
    aiTipTitle: "Совет от ИИ",
    tips: [
      "Лучший результат: вертикальная говорящая голова, чистый голос, 15–60 сек.",
      "Чистый звук = точные субтитры для Reels.",
      "ИИ вырезает паузы и воду, чтобы Reel оставался динамичным.",
      "Формат зафиксирован: Instagram Reels 9:16."
    ],

    // Recent Projects
    recentProjects: "Недавние проекты",
    noRecentProjects: "Нет недавних проектов. Загрузите видео, чтобы начать.",

    // Dropzone
    dropzoneTitle: "Нажмите или перетащите видео сюда",
    dropzoneSubtitle: "Поддерживаются форматы MP4, MOV и WebM. До 2GB.",
    replaceFile: "Заменить файл",
    uploadingText: "Синтез и анализ видео...",
    fileReady: "Медиафайл готов к обработке",
    waitingFile: "Ожидание файла...",
    startEngine: "Сделать Instagram Reel",
    initializing: "Инициализация...",

    // How it works
    howItWorks: "Как это работает?",
    step1Title: "Загрузка",
    step1Desc: "Загрузи talking-head клип для Instagram Reels.",
    step2Title: "Глубокий анализ",
    step2Desc: "ИИ находит акценты речи, режет паузы, планирует удержание.",
    step3Title: "Монтаж Reels",
    step3Desc: "Субтитры, зумы, B-roll и звук — экспорт готового Reel.",

    // Formats
    formatActive: "Активен",
    formatPreview: "Превью",
    formatTitles: {
      "Instagram Reels": "Instagram Reels"
    },

    // Chat Sidebar & Agent UI
    assistantTitle: "Synapix • Режиссёр Reels",
    assistantIntro: "Монтирую talking-head в Instagram Reels: субтитры, зумы, B-roll, музыка и SFX.",
    welcomeMessage: "Привет! Я режиссёр Instagram Reels. Попроси полный монтаж Reel или субтитры / зумы / звук. Всё только 9:16 под Instagram.",
    quickStart: "Быстрый старт:",
    quickPrompts: [
      "Полный монтаж Instagram Reels",
      "Кинетические субтитры для Reels",
      "Музыка + зумы на акцентах",
      "Хук-графика в первые 2 секунды"
    ],
    processing: "Обработка...",
    working: "Работает...",
    agentReasoning: "Рассуждение агента",
    editingDone: "Монтаж выполнен",
    stepsCount: "шагов",
    editingInProgress: "Выполняется авто-монтаж...",
    collapse: "Свернуть",
    details: "Детали",
    inputPlaceholder: "Опишите ваши пожелания к видео...",
    stop: "Остановить",
    send: "Отправить",
    selectClip: "Выбрать клип",
    selectedClip: "Выбранный клип"
  }
};

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('vibe_lang') as Language;
    if (saved === 'en' || saved === 'ru') {
      setLangState(saved);
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('vibe_lang', newLang);
  };

  const t = translations[lang] || translations.en;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
