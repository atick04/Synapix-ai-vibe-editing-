"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'ru';

export const translations = {
  en: {
    // Header
    heroTitlePrefix: "Create your ",
    heroTitleHighlight: "masterpiece",
    heroSubtitle: "Upload source materials — ",
    heroSubtitleBold: "Cinematic AI",
    heroSubtitleSuffix: " handles routine editing.",
    engineVersion: "Synapix Engine 2.0",
    
    // Tips
    aiTipTitle: "AI Insight",
    tips: [
      "The more details in your video, the better the AI can tailor the edit.",
      "Upload sources with clear audio for crisp auto-subtitles.",
      "AI automatically removes silence and bad takes, saving you hours.",
      "Switch aspect ratios instantly for any social media platform."
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
    startEngine: "Start AI Engine",
    initializing: "Initializing...",

    // How it works
    howItWorks: "How it works",
    step1Title: "Upload",
    step1Desc: "Drag & drop source footage. All major formats supported.",
    step2Title: "Deep Analysis",
    step2Desc: "Neural models detect speech, emotional pacing, and cut silence.",
    step3Title: "Editing Magic",
    step3Desc: "Request edits via text chat and export your final cut.",

    // Formats
    formatActive: "Active",
    formatPreview: "Preview",
    formatTitles: {
      "YouTube Long": "YouTube Long",
      "YouTube Shorts": "YouTube Shorts",
      "Reels / TikTok": "Reels / TikTok",
      "SaaS Demo": "SaaS Demo",
      "Подкаст": "Podcast",
      "Обучающее видео": "Tutorial"
    },

    // Chat Sidebar & Agent UI
    assistantTitle: "Synapix AI • Assistant",
    assistantIntro: "I will edit your talking head video: add custom 3D graphics, kinetic typography, music, and zooms.",
    welcomeMessage: "Hi! I'm Synapix AI — your editing director. Tell me what to do with this video: subtitles, B-roll, graphics, music, zooms, or a full cut. Or tap a quick start below.",
    quickStart: "Quick Start:",
    quickPrompts: [
      "Edit talking head video for Shorts",
      "Add custom 3D graphic scenes",
      "Apply energetic soundtrack and auto-zooms",
      "Configure kinetic lettering subtitles"
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
    heroTitlePrefix: "Создайте свой ",
    heroTitleHighlight: "шедевр",
    heroSubtitle: "Загрузите материалы, а ",
    heroSubtitleBold: "Cinematic AI",
    heroSubtitleSuffix: " сделает рутинный монтаж.",
    engineVersion: "Synapix Engine 2.0",

    // Tips
    aiTipTitle: "Совет от ИИ",
    tips: [
      "Чем больше деталей в видео, тем лучше ИИ сможет сделать монтаж.",
      "Загружайте исходники с качественным звуком — это улучшит генерацию субтитров.",
      "ИИ автоматически вырезает тишину и неудачные дубли, экономя ваши часы.",
      "В редакторе вы сможете быстро поменять соотношение сторон под нужную платформу."
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
    startEngine: "Запустить AI Engine",
    initializing: "Инициализация...",

    // How it works
    howItWorks: "Как это работает?",
    step1Title: "Загрузка",
    step1Desc: "Перетащите исходник. Поддерживаются любые форматы.",
    step2Title: "Глубокий анализ",
    step2Desc: "Нейросеть распознает речь, эмоции и вырежет тишину.",
    step3Title: "Магия монтажа",
    step3Desc: "Внесите правки текстом в чате и скачайте шедевр.",

    // Formats
    formatActive: "Активен",
    formatPreview: "Превью",
    formatTitles: {
      "YouTube Long": "YouTube Long",
      "YouTube Shorts": "YouTube Shorts",
      "Reels / TikTok": "Reels / TikTok",
      "SaaS Demo": "SaaS Demo",
      "Подкаст": "Подкаст",
      "Обучающее видео": "Обучающее видео"
    },

    // Chat Sidebar & Agent UI
    assistantTitle: "Synapix AI • Ассистент",
    assistantIntro: "Я помогу смонтировать ролик говорящей головы: добавлю кастомную 3D-графику, кинетическую типографику, музыку и зумы.",
    welcomeMessage: "Привет! Я Synapix AI — твой режиссёр монтажа. Напиши, что сделать с этим видео: субтитры, B-roll, графика, музыка, зумы или полный монтаж. Или выбери быстрый старт ниже.",
    quickStart: "Быстрый старт:",
    quickPrompts: [
      "Смонтировать говорящую голову под Shorts",
      "Добавить кастомные графические перебивки",
      "Наложить энергичный саундтрек и зумы",
      "Настроить кинетический леттеринг"
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
