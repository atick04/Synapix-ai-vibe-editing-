---
name: video-graphics-design
description: >
  Design specification and generation guide for premium video graphic overlays,
  kinetic cards, infographic elements, and motion titles for AI video editors.
  Activate when generating HTML/CSS/GSAP graphics for talking-head video overlays,
  Bento cards, stat callouts, kinetic typography, SVG diagrams, lower-thirds,
  and any animated graphic element in a video production pipeline.
---

# Video Graphics Design System — Synapix AI Motion Studio

## Принцип работы

Ты — Art Director уровня Apple/Vox/MrBeast.
Ты создаёшь **кинематографические графические оверлеи** для видеоконтента.
Каждый элемент должен выглядеть как продакшн-готовый продукт, а не как шаблон из Canva.

---

## 1. DESIGN TOKENS — ОБЯЗАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ

```css
/* === COLOR SYSTEM === */
--bg-glass:      rgba(12, 12, 20, 0.72);     /* Главный фон карточки */
--bg-glass-2:    rgba(255, 255, 255, 0.04);  /* Светлый вариант */
--border-glass:  rgba(255, 255, 255, 0.12);  /* Тонкая светящаяся грань */
--border-accent: rgba(99, 102, 241, 0.45);   /* Акцентная грань */

--accent-blue:   #6366F1;  /* Indigo — основной акцент */
--accent-cyan:   #00E5FF;  /* Cyan — энергичный акцент */
--accent-gold:   #FACC15;  /* Gold — выделение, TikTok-стиль */
--accent-purple: #A855F7;  /* Purple — премиум */
--accent-green:  #22C55E;  /* Success, growth */
--accent-red:    #FF3B30;  /* Alert, contrast */

--text-primary:   #F5F7FA;  /* Главный текст */
--text-secondary: rgba(245, 247, 250, 0.55);  /* Второстепенный */
--text-muted:     rgba(245, 247, 250, 0.30);  /* Метки, подписи */

/* === SHADOWS & GLOWS === */
--shadow-card:    0 24px 64px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.35);
--glow-blue:      0 0 30px rgba(99, 102, 241, 0.5), 0 0 60px rgba(99, 102, 241, 0.2);
--glow-cyan:      0 0 25px rgba(0, 229, 255, 0.45);
--glow-gold:      0 0 20px rgba(250, 204, 21, 0.5);

/* === BORDER RADIUS === */
--radius-card:  20px;   /* Основные карточки */
--radius-badge: 12px;   /* Небольшие бейджи */
--radius-pill:  999px;  /* Pill-кнопки */

/* === TYPOGRAPHY SCALE (9:16 video, 1080×1920) === */
--font-hero:    clamp(72px, 8vw, 110px);  /* Герой-заголовок */
--font-title:   clamp(48px, 5vw, 72px);   /* Заголовок карточки */
--font-stat:    clamp(80px, 9vw, 130px);  /* Большая цифра */
--font-body:    clamp(24px, 2.5vw, 34px); /* Основной текст */
--font-label:   clamp(18px, 1.8vw, 24px); /* Подписи, метки */
--font-micro:   clamp(14px, 1.4vw, 18px); /* Микро-текст */
```

---

## 2. КАРТОЧКИ — ТИПЫ И КОД

### 2.1 Glassmorphism Card — основная карточка

```html
<div class="glass-card">
  <div class="card-glow"></div>
  <div class="card-content">
    <!-- контент -->
  </div>
</div>

<style>
.glass-card {
  position: relative;
  background: rgba(12, 12, 20, 0.72);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35);
  overflow: hidden;
}

/* Верхняя светящаяся полоса-акцент */
.glass-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #6366F1, #00E5FF, transparent);
}

/* Градиентное свечение за карточкой */
.card-glow {
  position: absolute;
  top: -60px; left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 120px;
  background: radial-gradient(ellipse, rgba(99,102,241,0.25) 0%, transparent 70%);
  filter: blur(20px);
  pointer-events: none;
}
</style>
```

### 2.2 Stat Callout Card — большая цифра

```html
<div class="stat-card">
  <div class="stat-label">РОСТ ВЫРУЧКИ</div>
  <div class="stat-value" id="stat-num">0</div>
  <div class="stat-suffix">%</div>
  <div class="stat-bar">
    <div class="stat-bar-fill" id="bar-fill"></div>
  </div>
  <div class="stat-caption">за последний квартал</div>
</div>

<style>
.stat-card {
  background: rgba(12, 12, 20, 0.80);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px;
  padding: 36px 40px;
  text-align: center;
}

.stat-label {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: rgba(99,102,241,0.9);
  text-transform: uppercase;
  margin-bottom: 12px;
}

.stat-value {
  font-family: 'Unbounded', sans-serif;
  font-size: 110px;
  font-weight: 900;
  line-height: 1;
  background: linear-gradient(135deg, #FFFFFF 30%, #6366F1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-bar {
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 999px;
  margin: 20px 0 12px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #6366F1, #00E5FF);
  border-radius: 999px;
  box-shadow: 0 0 12px rgba(0,229,255,0.5);
  transition: width 1.2s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
```

### 2.3 Kinetic Typography Card — кинетический текст

```html
<!-- Используй GSAP SplitText или ручной split по словам -->
<div class="kinetic-wrap">
  <div class="kinetic-line" id="l1">ГЛАВНАЯ</div>
  <div class="kinetic-line accent" id="l2">ИДЕЯ</div>
  <div class="kinetic-sub" id="l3">подзаголовок с контекстом</div>
</div>

<style>
.kinetic-wrap {
  text-align: center;
  padding: 0 48px;
}

.kinetic-line {
  font-family: 'Unbounded', sans-serif;
  font-size: 96px;
  font-weight: 900;
  line-height: 1.05;
  color: #F5F7FA;
  display: block;
}

.kinetic-line.accent {
  background: linear-gradient(135deg, #FACC15 0%, #F59E0B 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 20px rgba(250,204,21,0.4));
}

.kinetic-sub {
  font-family: 'Inter', sans-serif;
  font-size: 28px;
  font-weight: 400;
  color: rgba(245,247,250,0.55);
  margin-top: 20px;
}
</style>
```

### 2.4 Lower Third — плашка-тайтл (говорящая голова)

```html
<div class="lower-third" id="lt">
  <div class="lt-accent-line"></div>
  <div class="lt-name">Имя Спикера</div>
  <div class="lt-role">Должность / Роль / Контекст</div>
</div>

<style>
.lower-third {
  position: absolute;
  bottom: 18%;
  left: 6%;
  background: rgba(10, 10, 18, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1);
  border-left: 4px solid #6366F1;
  border-radius: 0 14px 14px 0;
  padding: 18px 28px;
  min-width: 280px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
}

.lt-name {
  font-family: 'Inter', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: #F5F7FA;
  line-height: 1.2;
}

.lt-role {
  font-family: 'Inter', sans-serif;
  font-size: 18px;
  font-weight: 400;
  color: rgba(245,247,250,0.60);
  margin-top: 4px;
}
</style>
```

### 2.5 Process Steps Card — список шагов

```html
<div class="steps-card">
  <div class="step" id="s1">
    <div class="step-num">01</div>
    <div class="step-text">Первый шаг процесса</div>
  </div>
  <div class="step-divider"></div>
  <div class="step" id="s2">
    <div class="step-num">02</div>
    <div class="step-text">Второй шаг процесса</div>
  </div>
  <div class="step-divider"></div>
  <div class="step" id="s3">
    <div class="step-num">03</div>
    <div class="step-text">Третий шаг процесса</div>
  </div>
</div>

<style>
.steps-card {
  background: rgba(12, 12, 20, 0.75);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  padding: 32px 36px;
}

.step {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 0;
}

.step-num {
  font-family: 'Unbounded', sans-serif;
  font-size: 32px;
  font-weight: 900;
  color: #6366F1;
  min-width: 56px;
  line-height: 1;
}

.step-text {
  font-family: 'Inter', sans-serif;
  font-size: 26px;
  font-weight: 500;
  color: #F5F7FA;
  line-height: 1.3;
}

.step-divider {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 0 -36px;
}
</style>
```

---

## 3. GSAP АНИМАЦИИ — ПАТТЕРНЫ

### 3.1 Вылет карточки (обязательный стандарт)
```javascript
// ВСЕГДА регистрируй window.__timelines["main"]
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["main"] = tl;

// Вход карточки
tl.fromTo("#card",
  { opacity: 0, y: 60, scale: 0.88, rotateX: 12 },
  { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.75, ease: "back.out(1.4)" },
  0.1
);

// Выход карточки (за 0.5s до конца)
tl.to("#card",
  { opacity: 0, y: -40, scale: 0.94, duration: 0.45, ease: "power2.in" },
  DURATION - 0.6  // DURATION = длительность сцены
);
```

### 3.2 Анимация счётчика (Stat Callout)
```javascript
// Countup animation
gsap.to({ val: 0 }, {
  val: 140,
  duration: 1.8,
  ease: "power2.out",
  delay: 0.4,
  onUpdate: function() {
    document.getElementById("stat-num").textContent = Math.round(this.targets()[0].val);
  }
});

// Progress bar
gsap.to("#bar-fill", { width: "78%", duration: 1.5, ease: "power2.out", delay: 0.5 });
```

### 3.3 Stagger вылет слов (Kinetic Typography)
```javascript
const words = gsap.utils.toArray(".word");
tl.fromTo(words,
  { opacity: 0, y: 45, rotateX: 15 },
  { opacity: 1, y: 0, rotateX: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" },
  0.15
);
```

### 3.4 Анимация SVG-линий (Draw-on effect)
```javascript
// Сначала сохрани длину пути: path.getTotalLength()
gsap.fromTo("#path-arrow",
  { strokeDashoffset: 400, strokeDasharray: 400 },
  { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut", delay: 0.3 }
);
```

### 3.5 Lower Third вход
```javascript
tl.fromTo("#lt",
  { opacity: 0, x: -60 },
  { opacity: 1, x: 0, duration: 0.55, ease: "power3.out" },
  0.2
);
tl.to("#lt",
  { opacity: 0, x: -40, duration: 0.4, ease: "power2.in" },
  DURATION - 0.5
);
```

---

## 4. SAFE ZONES — ПОЗИЦИОНИРОВАНИЕ

```
┌─────────────────────────────────────────┐  ← TOP (safe for badges/titles)
│  [TOP ZONE: 0% - 25%]                   │
│  Только компактные верхние бейджи        │
├─────────────────────────────────────────┤
│                                         │
│  [DANGER ZONE: 25% - 70%]              │
│  ⚠️ ЛИЦО СПИКЕРА — НЕ ПЕРЕКРЫВАЙ!     │
│                                         │
├─────────────────────────────────────────┤
│  [BOTTOM ZONE: 70% - 92%]              │
│  Lower thirds, stat cards, labels       │
│  [SUBTITLE ZONE: 78% - 90%]            │
└─────────────────────────────────────────┘
  ← LEFT ZONE: 0-44% │ RIGHT ZONE: 50-94%→
```

**Правила по `safe_zone`:**
- `"left"` → `left: 6%; width: 42%; top: 55%`
- `"right"` → `left: 52%; width: 42%; top: 55%`
- `"top"` → `top: 6%; left: 50%; transform: translateX(-50%); width: 88%`
- `"bottom"` / `"none"` → `top: 68%; left: 6%; width: 88%`
- `"full_broll"` → весь экран, фон закрывает видео полностью

---

## 5. ОБЯЗАТЕЛЬНЫЕ CDN

```html
<!-- Всегда подключай именно так -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Inter:wght@400;500;600;700&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
```

---

## 6. ЧЕКЛИСТ ПЕРЕД ГЕНЕРАЦИЕЙ

Перед написанием кода ответь на вопросы:

1. **Какой тип данных?** (цифра, процесс, концепция, имя, факт)
2. **Какой шаблон подходит?** (Stat / Kinetic / Bento / Lower Third / Process)
3. **Где `safe_zone`?** (left / right / top / bottom / full_broll)
4. **Какой акцентный цвет?** (indigo / cyan / gold / purple / green)
5. **Длительность?** → Рассчитай выход карточки = `duration - 0.6s`

---

## 7. АНТИ-ПАТТЕРНЫ — НИКОГДА НЕ ДЕЛАЙ

- ❌ Белый или светлый фон карточки (всегда тёмный `rgba(...)`)
- ❌ `font-family: Arial, sans-serif` (всегда Inter / Unbounded / Manrope)
- ❌ `font-size: 14px` в основных элементах (минимум 24px для 9:16)
- ❌ Карточки без `backdrop-filter: blur()` 
- ❌ GSAP без `window.__timelines["main"]` — рендер не синхронизируется
- ❌ Перекрытие зоны лица (25%-70% высоты экрана)
- ❌ Более 3 разных акцентных цветов в одной сцене
- ❌ `z-index` без указания у всех оверлеев
- ❌ Inline-стили для типографики (используй CSS-классы)
- ❌ Анимации без `ease` параметра (всегда указывай ease)

---

## 8. ПРИМЕРЫ КОНЦЕПТОВ → ШАБЛОН

| Концепт | Рекомендуемый шаблон |
|---|---|
| "рост продаж на 140%" | Stat Callout + progress bar |
| "3 шага к успеху" | Process Steps Card |
| "имя эксперта" | Lower Third |
| "главная мысль видео" | Kinetic Typography |
| "сравнение A vs B" | Bento Split 2 карточки |
| "объяснение концепции" | Full-screen Bento + diagram |
| "статистика рынка" | Stat Callout + SVG chart line |
| "временная шкала" | SVG Timeline horizontal |
| "цитата спикера" | Quote Card + accent border |

---

## 9. REACTBITS MOTION COMPONENT LIBRARY INTEGRATION

Агент по графике обязан использовать готовые кинетические компоненты из библиотеки **ReactBits** через инструмент `add_motion_preset` для мгновенного наложения эффектов кинематографического уровня.

### Полный Каталог Компонентов ReactBits:

1. **BlurText** (`preset: "BlurText"`)
   - Кинетическое размытие слов при появлении (TikTok/Reels заголовок).
   - *Применение*: Заголовки, первичные хуки, появление важных вопросов.
   - *Пропсы*: `text`, `color`, `fontSize`, `animateBy="words"`, `direction="top"`.

2. **ShinyText** (`preset: "ShinyText"`)
   - Переливающийся неоновый/золотой глянец (премиум-состояние, офферы).
   - *Применение*: Финансовые результаты, ключевые ценности, брендовые слова.
   - *Пропсы*: `text`, `color="#FACC15"`, `fontSize`, `speed=4`.

3. **DecryptedText** (`preset: "DecryptedText"`)
   - Хакерское матричное разгадывание букв (для IT, стартапов, ИИ-тезисов).
   - *Применение*: Технологические термины, киберпанк/AI инсайты, коды.
   - *Пропсы*: `text`, `color="#00E5FF"`, `fontSize`, `speed=40`.

4. **TrueFocus** (`preset: "TrueFocus"`)
   - Плавающая неоновая рамка фокуса на произносимых ключевых словах.
   - *Применение*: Акцентирование главной мысли в длинной фразе.
   - *Пропсы*: `text`, `borderColor="#FACC15"`, `glowColor="rgba(250,204,21,0.4)"`, `fontSize`.

5. **GlitchText** (`preset: "GlitchText"`)
   - Киберпанк глитч с расслоением цвета RGB.
   - *Применение*: Внезапные инсайты, срывы покровов, драма.
   - *Пропсы*: `text`, `color="#FF0055"`, `fontSize`.

6. **GradientText** (`preset: "GradientText"`)
   - Анимированный динамический градиент текста.
   - *Применение*: Заголовки роликов, плашки соцсетей.
   - *Пропсы*: `text`, `fontSize`.

7. **CountUp** (`preset: "CountUp"`)
   - Динамический отсчет цифр и процентов.
   - *Применение*: Метрики роста, конверсии, деньги, рост подписчиков ($x10$, $+140\%$).
   - *Пропсы*: `text="140%"`, `color="#FACC15"`, `fontSize=90`.

8. **EchoText** (`preset: "EchoText"`)
   - Эффект неонового эха и световых импульсных волн.
   - *Применение*: Важные предупреждения, кульминационные фразы.
   - *Пропсы*: `text`, `color="#A855F7"`, `fontSize`.

---

## 10. APPLE FLUID MOTION & DESIGN PRINCIPLES (WWDC FLUID INTERFACES)

Каждый графический элемент, оверлей и текстовый плагин обязан соответствовать физическим стандартам **Apple Fluid Motion Systems** (WWDC Designing Fluid Interfaces):

### 1. Прерывание и физика пружин (Interruptibility & Springs)
- Анимация **не имеет фиксированного времени**: она использует фреймворк пружин (`spring`, `damping`, `response`).
- Движение моментально подхватывает текущую скорость (velocity) и позицию объекта без микро-скачков.
- **Параметры пружин Apple**:
  - Карточки и выплывающие плашки: `damping: 0.8`, `response: 0.3`.
  - Всплывающие заголовки / титры: `damping: 1.0`, `response: 0.4` (без отскока).
  - Энергичные отклики (flick/momentum): `damping: 0.75-0.8`, `bounce: 0.2`.

### 2. Прямое манипулирование (Direct Manipulation & 1:1 Tracking)
- При интерактивном перетаскивании элементов на холсте (`SandboxPlayer.tsx` pointer events):
  - Элемент удерживается ровно за ту точку, в которой его захватил пользователь (`grabOffset`).
  - `setPointerCapture` обеспечивает отслеживание движения даже за пределами вьюпорта.

### 3. Проекция импульса (Momentum Projection)
- При отпускании перетаскиваемого объекта скорость передачи продолжается формулой экспоненциального затухания:
  ```js
  projectedEndpoint = currentPosition + (releaseVelocity / 1000) * 0.998 / (1 - 0.998);
  ```

### 4. Пространственная согласованность (Spatial Consistency)
- **Вход и выход по одинаковой траектории**: Если элемент выплывает справа, он обязан уплывать вправо.
- **Якорение истока (`transform-origin`)**: Карточка или плашка расширяется ровно из той точки, где находится её маркер или иконка.


