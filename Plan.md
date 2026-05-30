Необходимо полностью переработать систему AI Reasoning / Activity Feed.

Текущая реализация выглядит как debug console:

* события появляются хаотично
* tool calls дублируются
* completed events повторяются несколько раз
* reasoning отображается слишком технически
* все сообщения выводятся мгновенно
* отсутствует staging и cinematic pacing
* UI перегружен и визуально шумный

Новая система должна работать как:
“Cinematic Multi-Stage AI Reasoning Pipeline”.

────────────────────────────────────
ГЛАВНАЯ ЦЕЛЬ
────────────────────────────────────

Reasoning UI должен ощущаться:

* как работа AI production system
* как cinematic pipeline
* как интеллектуальный workflow

А НЕ:

* как терминал
* как debug logger
* как поток сырых tool calls

────────────────────────────────────
ЧТО НУЖНО РЕАЛИЗОВАТЬ
────────────────────────────────────

1. Multi-Stage Reasoning Architecture

Разделить reasoning на стадии:

* ANALYSIS
* PLANNING
* EXECUTION
* FINALIZATION

Каждая стадия отображается отдельно и последовательно.

────────────────────────────────────
2. Progressive Reveal System

Сейчас:
все события появляются одновременно.

Нужно:
показывать события постепенно.

Интервал появления:
300–800ms.

Reasoning должен “дышать”.

────────────────────────────────────
3. Event Queue System

Создать centralized reasoning queue.

Нельзя:
сразу рендерить incoming events.

Нужно:

* batching
* throttling
* staged reveal
* ordered rendering

────────────────────────────────────
4. Event Deduplication

Убрать:

* дубли completed events
* повторяющиеся tool logs
* одинаковые summaries

Если событие уже было отображено —
не показывать его снова.

────────────────────────────────────
5. Humanized Event Translation

Запрещено отображать:

* raw MCP calls
* internal tool ids
* technical executor logs

Пример:

ПЛОХО:
Calling MCP tool 'build_kinetic_typography'

ХОРОШО:
Building cinematic subtitles

ПЛОХО:
select_bgm()

ХОРОШО:
Selecting cinematic soundtrack

Создать слой:
reasoning_humanizer.py

────────────────────────────────────
6. Collapsible Execution Groups

Вместо:
20 отдельных logs.

Сделать grouped activities.

Пример:

Motion Graphics
├── Generated overlays
├── Added typography
└── Synced transitions

Audio Processing
├── Selected soundtrack
├── Balanced levels
└── Synced music cuts

────────────────────────────────────
7. Clean Final Summary

Финальный summary показывать:
ТОЛЬКО ОДИН РАЗ.

Без повторений.

Пример:

✓ Removed filler words
✓ Built cinematic cuts
✓ Added motion graphics
✓ Selected soundtrack
✓ Optimized retention

────────────────────────────────────
8. Visual UX Requirements

Reasoning UI должен:

* быть минималистичным
* плавным
* cinematic
* без визуального шума

Добавить:

* soft fade animations
* smooth transitions
* subtle glow states
* stage separation
* clean typography hierarchy

────────────────────────────────────
9. Activity Priority System

High-priority events:

* transcript analysis
* graphics generation
* soundtrack selection
* retention optimization

Low-priority technical events:
НЕ отображать пользователю.

────────────────────────────────────
10. Final UX Goal

Пользователь должен ощущать:
что работает AI production studio,
а не набор хаотичных агентов и tool logs.

Reasoning должен выглядеть:
как cinematic thought process,
а не как debug terminal.
