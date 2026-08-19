/**
 * DaVinci Resolve–inspired subtitle looks.
 * Fusion .setting / DRFX cannot be imported; these recreate the pack language
 * (Text+, boxed titles, glow, karaoke, lower-third bar) for our canvas + ASS.
 */

export type CaptionLook =
    | 'outline'
    | 'boxed'
    | 'cinema'
    | 'neon'
    | 'karaoke'
    | 'bar'
    | 'pill'
    | 'minimal'
    | 'stacked'
    | 'dropcap';

export interface ResolveSubtitlePreset {
    id: string;
    label: string;
    hint: string;
    look: CaptionLook;
    font: string;
    font_size: number;
    font_color: string;
    accent_color: string;
    text_case: 'UPPER' | 'Sentence_Case';
    use_outline: boolean;
    use_shadow: boolean;
    shadow_blur: number;
    animation_style: string;
    inactive_opacity?: number;
    active_scale?: number;
    box_color?: string;
    outline_width?: number;
    font_pairing?: string;
    max_words?: number;
}

export const RESOLVE_SUBTITLE_PACK: ResolveSubtitlePreset[] = [
    {
        id: 'resolve_stacked',
        label: 'Stacked Script',
        hint: 'Стек + жёлтый скрипт сквозь строки',
        look: 'stacked',
        font: 'Montserrat-ExtraBold',
        font_pairing: 'Lobster',
        font_size: 72,
        font_color: '#FFFFFF',
        accent_color: '#FFD000',
        text_case: 'Sentence_Case',
        use_outline: false,
        use_shadow: false,
        shadow_blur: 0,
        animation_style: 'weave',
        outline_width: 0,
        max_words: 5,
    },
    {
        id: 'resolve_dropcap',
        label: 'Neon Dropcap',
        hint: 'Текстовая маска: видео внутри букв с инверсией + розовая буквица',
        look: 'dropcap',
        font: 'Montserrat-ExtraBold',
        font_pairing: 'Marck Script',
        font_size: 68,
        font_color: '#FFFFFF',
        accent_color: '#FF2D95',
        text_case: 'UPPER',
        use_outline: true,
        use_shadow: true,
        shadow_blur: 18,
        animation_style: 'pop',
        outline_width: 0.06,
        max_words: 6,
    },
    {
        id: 'resolve_classic',
        label: 'Classic Outline',
        hint: 'Text+ Resolve: белый + толстая чёрная обводка',
        look: 'outline',
        font: 'Montserrat-ExtraBold',
        font_size: 72,
        font_color: '#FFFFFF',
        accent_color: '#FACC15',
        text_case: 'UPPER',
        use_outline: true,
        use_shadow: false,
        shadow_blur: 0,
        animation_style: 'pop',
        outline_width: 0.1,
    },
    {
        id: 'resolve_boxed',
        label: 'Boxed',
        hint: 'Плашка под строкой, как Text Box в Resolve',
        look: 'boxed',
        font: 'Montserrat-ExtraBold',
        font_size: 64,
        font_color: '#FFFFFF',
        accent_color: '#FACC15',
        text_case: 'UPPER',
        use_outline: false,
        use_shadow: false,
        shadow_blur: 0,
        animation_style: 'slide_up',
        box_color: 'rgba(0,0,0,0.78)',
    },
    {
        id: 'resolve_cinema',
        label: 'Cinema',
        hint: 'Мягкая тень, без обводки — кинотитр',
        look: 'cinema',
        font: 'Inter',
        font_size: 58,
        font_color: '#F5F5F7',
        accent_color: '#F2E16A',
        text_case: 'Sentence_Case',
        use_outline: false,
        use_shadow: true,
        shadow_blur: 22,
        animation_style: 'fade',
    },
    {
        id: 'resolve_neon',
        label: 'Neon Glow',
        hint: 'Свечение как Glow Title',
        look: 'neon',
        font: 'Montserrat-ExtraBold',
        font_size: 68,
        font_color: '#FFFFFF',
        accent_color: '#00E5FF',
        text_case: 'UPPER',
        use_outline: false,
        use_shadow: true,
        shadow_blur: 28,
        animation_style: 'glow',
    },
    {
        id: 'resolve_karaoke',
        label: 'Karaoke Gold',
        hint: 'Активное слово золотом — Fairlight/karaoke',
        look: 'karaoke',
        font: 'Montserrat-ExtraBold',
        font_size: 70,
        font_color: '#FFFFFF',
        accent_color: '#FACC15',
        text_case: 'UPPER',
        use_outline: true,
        use_shadow: false,
        shadow_blur: 0,
        animation_style: 'karaoke',
        inactive_opacity: 0.4,
        active_scale: 1.18,
        outline_width: 0.07,
    },
    {
        id: 'resolve_bar',
        label: 'Lower Bar',
        hint: 'Тонкая линия под текстом, как lower third',
        look: 'bar',
        font: 'Manrope',
        font_size: 56,
        font_color: '#F5F7FA',
        accent_color: '#FACC15',
        text_case: 'Sentence_Case',
        use_outline: false,
        use_shadow: true,
        shadow_blur: 14,
        animation_style: 'slide_up',
    },
    {
        id: 'resolve_pill',
        label: 'Word Pills',
        hint: 'Каждое слово в pill — callout из Resolve',
        look: 'pill',
        font: 'Montserrat-ExtraBold',
        font_size: 54,
        font_color: '#FFFFFF',
        accent_color: '#6366F1',
        text_case: 'UPPER',
        use_outline: false,
        use_shadow: false,
        shadow_blur: 0,
        animation_style: 'pop',
        box_color: 'rgba(12,12,20,0.82)',
    },
    {
        id: 'resolve_minimal',
        label: 'Minimal',
        hint: 'Тонкий sans, почти без эффектов',
        look: 'minimal',
        font: 'Inter',
        font_size: 48,
        font_color: '#FFFFFF',
        accent_color: '#A1A1AA',
        text_case: 'Sentence_Case',
        use_outline: false,
        use_shadow: true,
        shadow_blur: 10,
        animation_style: 'fade',
    },
];

export function getResolveSubtitlePreset(id?: string | null): ResolveSubtitlePreset {
    return RESOLVE_SUBTITLE_PACK.find((p) => p.id === id) || RESOLVE_SUBTITLE_PACK[0];
}

export function resolvePresetToEditFields(preset: ResolveSubtitlePreset): Record<string, unknown> {
    return {
        subtitle_preset: preset.id,
        caption_look: preset.look,
        font: preset.font,
        font_size: preset.font_size,
        font_color: preset.font_color,
        accent_color: preset.accent_color,
        text_case: preset.text_case,
        use_outline: preset.use_outline,
        use_shadow: preset.use_shadow,
        shadow_blur: preset.shadow_blur,
        animation_style: preset.animation_style,
        inactive_opacity: preset.inactive_opacity ?? null,
        active_scale: preset.active_scale ?? null,
        box_color: preset.box_color ?? null,
        outline_width: preset.outline_width ?? null,
        font_pairing: preset.font_pairing ?? null,
        max_words: preset.max_words ?? null,
    };
}
