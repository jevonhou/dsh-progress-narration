window.__ModuleLoader__.load({
  id: 'dsh-plugin-progress-narration',
  factory(require) {
    /** 可选依赖：缺任何一个都只让插件退化，绝不让整个页面 boot 失败。 */
    const optional = (name) => {
      try {
        return require(name);
      } catch (error) {
        return null;
      }
    };

    const React = optional('react');
    if (React === null) {
      return { inject: [], apply() {} };
    }
    const ReactDOM = optional('react-dom');
    const primitives = optional('@deepseek-ai/dsh-client-ui-primitives') ?? {};
    /** 菜单外壳与锚定都来自 primitives；缺失时保持惰性，不做半残的降级 UI。 */
    if (typeof primitives.MenuSurface === 'undefined' || typeof primitives.useAnchoredPosition !== 'function') {
      return { inject: [], apply() {} };
    }
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    /** 宿主插件条目 id 的候选写法，取第一个就绪的。 */
    const ENTRY_IDS = ['progress-narration', 'include:progress-narration'];

    const MODES = [
      { id: 'gentle', label: '克制', caption: '只在动手前和关键转折说一句', face: 'quiet' },
      { id: 'balanced', label: '标准', caption: '每两三步同步一次进度', face: 'calm' },
      { id: 'chatty', label: '话多', caption: '每完成一步就说一句', face: 'talk' },
    ];

    const ALIASES = { 克制: 'gentle', 标准: 'balanced', 话多: 'chatty' };

    function normalizeMode(value) {
      if (typeof value !== 'string') return 'balanced';
      const key = value.trim();
      const id = ALIASES[key] ?? key.toLowerCase();
      return MODES.some((mode) => mode.id === id) ? id : 'balanced';
    }

    const CSS = `
      .pnn-trigger {
        width: 28px; height: 28px; border: 0; padding: 6px;
        border-radius: var(--dsw-radius-sm, 6px);
        display: inline-flex; align-items: center; justify-content: center;
        background: transparent; color: var(--dsw-alias-label-secondary, #6b6b6b);
        cursor: pointer; line-height: 1; transition: background .12s, color .12s;
      }
      .pnn-trigger:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14)); color: var(--dsw-alias-label-primary, #111); }
      .pnn-trigger:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3F77D8));
        outline-offset: 1px;
      }
      .pnn-menu {
        box-sizing: border-box; position: fixed; z-index: 1100; padding: 0;
        display: flex; flex-direction: column; width: max-content;
        --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
        box-shadow: var(--dsw-elevation-prominent);
        color: var(--dsw-alias-label-primary);
      }
      .pnn-panel {
        display: flex; flex-direction: column; gap: 10px; padding: 16px 12px 14px;
        width: 280px; box-sizing: border-box; animation: pnn-in .16s ease-out;
        background: var(--dsw-alias-bg-layer-2, #fff); border-radius: var(--dsw-radius-lg, 16px);
      }
      @keyframes pnn-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
      .pnn-seg {
        --pnn-pill-fill: var(--dsw-static-deepseek-500, #4176E6);
        position: relative; display: flex; align-items: stretch;
        height: 34px; padding: 3px; box-sizing: border-box;
        border-radius: 999px; corner-shape: round;
        /* 与官方输入框「+」按钮同一灰：--dsw-specific-selector */
        background: var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, .10));
        background: var(--dsw-specific-selector, rgba(38, 49, 72, .10));
        cursor: pointer; outline: none; touch-action: none;
        -webkit-user-select: none; user-select: none;
      }
      .pnn-seg:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3F77D8));
        outline-offset: 3px;
      }
      .pnn-seg.pnn-dragging { cursor: grabbing; }
      .pnn-segLabels { position: relative; display: flex; width: 100%; z-index: 0; }
      .pnn-segLabel {
        flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center;
        font-size: 12px; line-height: 1; font-weight: 500;
        color: var(--dsw-alias-label-secondary, #61666b);
        white-space: nowrap; pointer-events: none;
      }
      .pnn-segPill {
        position: absolute; top: 3px; bottom: 3px; left: 3px;
        width: calc((100% - 6px) / 3);
        border-radius: 999px; corner-shape: round; overflow: hidden;
        background: var(--pnn-pill-fill);
        box-shadow: 0 1px 2px rgba(0, 0, 0, .10);
        transform: translateX(calc(var(--pnn-pos, 1) * 100%));
        transition: transform .26s cubic-bezier(.3, 1.05, .5, 1);
        will-change: transform;
      }
      .pnn-seg.pnn-dragging .pnn-segPill { transition: none; }
      .pnn-segPillText {
        position: absolute; top: 0; left: 0; width: 300%; height: 100%;
        display: flex; align-items: stretch; z-index: 1;
        transform: translateX(calc(var(--pnn-pos, 1) * -33.3333%));
      }
      .pnn-segPillText .pnn-segLabel { color: #fff; font-weight: 600; }
      .pnn-star {
        position: absolute; width: var(--pnn-star-size, 1.5px); height: var(--pnn-star-size, 1.5px);
        margin: calc(var(--pnn-star-size, 1.5px) * -.5) 0 0 calc(var(--pnn-star-size, 1.5px) * -.5);
        border-radius: 50%; background: #fff; pointer-events: none; z-index: 0;
        opacity: .5;
        animation-name: pnn-twinkle; animation-timing-function: ease-in-out;
        animation-iteration-count: infinite; animation-direction: alternate;
      }
      @keyframes pnn-twinkle { from { opacity: .10; } to { opacity: .66; } }
      .pnn-head {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 0; min-height: 20px; animation: pnn-caption-in .18s ease-out;
      }
      .pnn-headMain { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .pnn-headIcon {
        flex: none; display: inline-flex; align-items: center; justify-content: center;
        width: 18px; height: 18px;
        color: var(--dsw-alias-state-business-primary, #3F77D8);
      }
      .pnn-caption {
        margin: 0; min-height: 18px;
        font-size: 12px; line-height: 18px; text-align: left;
        color: var(--dsw-alias-label-secondary, #6b6b6b);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      @keyframes pnn-caption-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
      .pnn-reset {
        flex: none; display: inline-flex; align-items: center; justify-content: center;
        width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px;
        background: transparent; color: var(--dsw-alias-label-secondary, #6b6b6b);
        cursor: pointer; transition: background .12s ease, color .12s ease, opacity .12s ease;
      }
      .pnn-reset:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14)); color: var(--dsw-alias-label-primary, #111); }
      .pnn-reset:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3F77D8));
        outline-offset: 1px;
      }
      .pnn-resetIdle { opacity: .38; cursor: default; }
      .pnn-resetIdle:hover { background: transparent; color: var(--dsw-alias-label-secondary, #6b6b6b); }

      @media (prefers-reduced-motion: reduce) {
        .pnn-panel, .pnn-head { animation: none; }
        .pnn-star { animation: none; opacity: .55; }
        .pnn-segPill, .pnn-reset { transition: none; }
      }
    `;

    /** 菜单未定位前的测量样式：不可见但参与布局。 */
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

    /* ── 开合状态与锚点，输入框图标和浮层共用 ── */
    let open = false;
    const openListeners = new Set();
    const triggerRef = React.createRef();
    const setOpen = (next) => {
      open = next;
      openListeners.forEach((fn) => fn());
    };
    function useOpen() {
      const [value, setValue] = useState(open);
      useEffect(() => {
        const fn = () => setValue(open);
        openListeners.add(fn);
        return () => openListeners.delete(fn);
      }, []);
      return value;
    }

    /* ── 设置读写：由 apply 里拿到的表单句柄注入 ── */
    let api = null;
    function useConfig() {
      const read = () => (api === null ? null : api.read());
      const [value, setValue] = useState(read);
      useEffect(() => {
        if (api === null) return undefined;
        setValue(read());
        return api.subscribe(() => setValue(read()));
      }, []);
      return value;
    }

    /** 语气图标：描边+点数=克制/标准，实心+射线=话多。 */
    function BubbleIcon({ kind, size = 18 }) {
      const path =
        'M6.6 3.9H13.4A4.2 4.2 0 0 1 17.6 8.1V10A4.2 4.2 0 0 1 13.4 14.2H9.6L7.3 16.3C6.9 16.65 6.3 16.35 6.3 15.85V14.2A4.2 4.2 0 0 1 2.4 10V8.1A4.2 4.2 0 0 1 6.6 3.9Z';
      const filled = kind === 'talk';
      const dots = kind === 'quiet' ? ['10'] : kind === 'calm' ? ['7.9', '12.1'] : ['6.9', '10', '13.1'];
      return h(
        'svg',
        {
          width: String(size),
          height: String(size),
          viewBox: '0 0 20 20',
          fill: 'none',
          'aria-hidden': 'true',
          style: kind === 'quiet' ? { opacity: 0.55 } : undefined,
        },
        h(
          'path',
          filled
            ? { d: path, fill: 'currentColor' }
            : { d: path, stroke: 'currentColor', 'stroke-width': '1.25', 'stroke-linejoin': 'round' },
        ),
        dots.map((cx, index) =>
          h('circle', {
            key: `dot-${index}`,
            cx,
            cy: '9',
            r: filled ? '1.05' : '1.1',
            fill: filled ? '#fff' : 'currentColor',
          }),
        ),
        filled
          ? h('path', {
              d: 'M16.3 3.4l1.2-1.3M17.5 5.7l1.5-.6M14.3 2.1l.5-1.4',
              stroke: 'currentColor',
              'stroke-width': '1.6',
              'stroke-linecap': 'round',
            })
          : null,
      );
    }

    /** 胶囊内的星点：避开文字中线，各自错峰轻闪。 */
    const STARS = [
      { x: 13, y: 24, size: 1.4, duration: 3.1, delay: -0.2 },
      { x: 26, y: 72, size: 1.2, duration: 4.3, delay: -1.6 },
      { x: 38, y: 17, size: 1.6, duration: 3.7, delay: -2.4 },
      { x: 66, y: 78, size: 1.3, duration: 3.4, delay: -1.1 },
      { x: 78, y: 28, size: 1.5, duration: 4.0, delay: -3.3 },
      { x: 21, y: 52, size: 1.0, duration: 4.8, delay: -0.4 },
      { x: 82, y: 84, size: 1.0, duration: 5.8, delay: -2.6 },
    ];

    /** 与 `.pnn-seg` 的 padding 保持一致，用于把指针位置换算成档位。 */
    const SEG_PAD = 3;

    /**
     * 三档密度分段控件。
     * 拖动时只移动胶囊的视觉位置（不写入设置）；松手后吸附到最近一档，
     * 档位有变化才保存一次；取消拖动回到原档，不保存。点击与方向键仍然可用。
     */
    function DensitySlider({ index, disabled, onChange }) {
      const trackRef = useRef(null);
      const dragRef = useRef(null);
      const [drag, setDrag] = useState(null);
      const [settle, setSettle] = useState(null);
      const last = MODES.length - 1;
      const position = drag !== null ? drag.pos : settle !== null ? settle : index;

      /** 目标档位真正生效（或等待超时）后撤掉吸附态，避免视觉与实际档位长期不一致。 */
      useEffect(() => {
        if (settle === null) return undefined;
        if (index === settle) {
          setSettle(null);
          return undefined;
        }
        const timer = setTimeout(() => setSettle(null), 800);
        return () => clearTimeout(timer);
      }, [settle, index]);

      /** 一档的宽度：胶囊宽度与每档位移都是它，不能按「内宽 / 档数-1」算。 */
      const metrics = () => {
        const track = trackRef.current;
        if (track === null) return null;
        const rect = track.getBoundingClientRect();
        const inner = Math.max(1, rect.width - SEG_PAD * 2);
        return { rect, inner, step: inner / MODES.length };
      };

      const indexFromX = (clientX) => {
        const m = metrics();
        if (m === null) return index;
        const raw = (clientX - m.rect.left - SEG_PAD) / m.step;
        return Math.round(Math.min(Math.max(raw - 0.5, 0), last));
      };

      const onKeyDown = (event) => {
        if (disabled) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          if (index > 0) onChange(index - 1);
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (index < last) onChange(index + 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          onChange(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          onChange(last);
        } else if (event.key === 'Escape' && dragRef.current !== null) {
          // 拖动中按 Esc：撤掉手势预览，回到原档，不写入设置，也不关闭面板。
          event.preventDefault();
          event.stopPropagation();
          cancelDrag();
        }
      };

      const startDrag = (event) => {
        if (disabled || event.button !== 0) return;
        const track = trackRef.current;
        if (track === null) return;
        event.preventDefault();
        track.focus({ preventScroll: true });
        track.setPointerCapture?.(event.pointerId);
        dragRef.current = {
          startX: event.clientX,
          startPos: index,
          moved: false,
          pos: index,
          pointerId: event.pointerId,
        };
        setSettle(null);
        setDrag({ pos: index });
      };

      const moveDrag = (event) => {
        const active = dragRef.current;
        if (active === null) return;
        const m = metrics();
        if (m === null) return;
        const dx = event.clientX - active.startX;
        if (!active.moved && Math.abs(dx) > 3) active.moved = true;
        active.pos = Math.min(Math.max(active.startPos + dx / m.step, 0), last);
        setDrag({ pos: active.pos });
      };

      const endDrag = (event) => {
        const active = dragRef.current;
        if (active === null) return;
        dragRef.current = null;
        trackRef.current?.releasePointerCapture?.(event.pointerId);
        const target = active.moved ? Math.round(active.pos) : indexFromX(event.clientX);
        setDrag(null);
        if (target === index) {
          setSettle(null);
          return;
        }
        setSettle(target);
        onChange(target);
      };

      const cancelDrag = () => {
        const active = dragRef.current;
        if (active === null) return;
        dragRef.current = null;
        trackRef.current?.releasePointerCapture?.(active.pointerId);
        setDrag(null);
        setSettle(null);
      };

      return h(
        'div',
        {
          className: `pnn-seg${drag !== null ? ' pnn-dragging' : ''}`,
          ref: trackRef,
          role: 'slider',
          tabIndex: disabled ? -1 : 0,
          'aria-label': '说话密度',
          'aria-valuemin': 0,
          'aria-valuemax': last,
          'aria-valuenow': index,
          'aria-valuetext': MODES[index].label,
          'aria-disabled': disabled ? 'true' : undefined,
          style: { '--pnn-pos': String(position) },
          onKeyDown,
          onPointerDown: startDrag,
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: cancelDrag,
          onLostPointerCapture: cancelDrag,
        },
        h(
          'div',
          { className: 'pnn-segLabels', 'aria-hidden': 'true' },
          MODES.map((mode) => h('span', { key: mode.id, className: 'pnn-segLabel' }, mode.label)),
        ),
        h(
          'div',
          { className: 'pnn-segPill', 'aria-hidden': 'true' },
          STARS.map((star, order) =>
            h('span', {
              key: `star-${order}`,
              className: 'pnn-star',
              style: {
                left: `${star.x}%`,
                top: `${star.y}%`,
                '--pnn-star-size': `${star.size}px`,
                animationDuration: `${star.duration}s`,
                animationDelay: `${star.delay}s`,
              },
            }),
          ),
          h(
            'div',
            { className: 'pnn-segPillText' },
            MODES.map((mode) => h('span', { key: mode.id, className: 'pnn-segLabel' }, mode.label)),
          ),
        ),
      );
    }

    function Trigger() {
      const config = useConfig();
      const mode = config === null ? 'balanced' : config.mode;
      const active = MODES.find((item) => item.id === mode) ?? MODES[1];
      const label = `过程播报：${active.label}`;
      const tooltip = primitives?.Tooltip;
      const button = h(
        'button',
        {
          ref: triggerRef,
          type: 'button',
          className: 'pnn-trigger',
          ...(tooltip === undefined || tooltip === null ? { title: label } : {}),
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onClick: () => setOpen(!open),
        },
        h(BubbleIcon, { kind: active.face, size: 16 }),
      );
      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        tooltip !== undefined && tooltip !== null
          ? h(tooltip, { label, side: 'top', portal: true, delayMs: 300 }, button)
          : button,
      );
    }

    function Overlay() {
      const isOpen = useOpen();
      const config = useConfig();
      const menuRef = useRef(null);
      const menuPos = primitives.useAnchoredPosition({
        open: isOpen,
        anchorRef: triggerRef,
        panelRef: menuRef,
        side: 'top',
        align: 'end',
        gap: 8,
        margin: 12,
      });

      useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            triggerRef.current?.focus?.();
          }
        };
        const onPointerDown = (event) => {
          const menu = menuRef.current;
          if (menu !== null && menu.contains(event.target)) return;
          if (triggerRef.current !== null && triggerRef.current.contains(event.target)) return;
          setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => {
          window.removeEventListener('keydown', onKey);
          document.removeEventListener('pointerdown', onPointerDown, true);
        };
      }, [isOpen]);

      if (!isOpen) return null;

      const current = config === null ? 'balanced' : config.mode;
      const index = Math.max(0, MODES.findIndex((mode) => mode.id === current));
      const active = MODES[index] ?? MODES[1];
      const isDefault = current === 'balanced';

      const render = typeof ReactDOM?.createPortal === 'function' ? ReactDOM.createPortal : (node) => node;
      return render(
        h(
          primitives.MenuSurface,
          {
            ref: menuRef,
            role: 'dialog',
            'aria-label': '过程播报',
            className: 'pnn-menu',
            style: menuPos ?? MEASURE_STYLE,
          },
          h('style', null, CSS),
          h(
            'div',
            { className: 'pnn-panel' },
            h(
              'div',
              { key: active.id, className: 'pnn-head' },
              h(
                'div',
                { className: 'pnn-headMain' },
                h('span', { className: 'pnn-headIcon' }, h(BubbleIcon, { kind: active.face, size: 18 })),
                h('p', { className: 'pnn-caption' }, active.caption),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `pnn-reset${isDefault ? ' pnn-resetIdle' : ''}`,
                  title: '重置为默认',
                  'aria-label': '重置为默认',
                  onClick: () => {
                    if (!isDefault) api?.write('mode', 'balanced');
                  },
                },
                h(
                  'svg',
                  {
                    width: '16',
                    height: '16',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': '1.5',
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'aria-hidden': 'true',
                  },
                  h('path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }),
                  h('path', { d: 'M3 3v5h5' }),
                ),
              ),
            ),
            h(DensitySlider, {
              index,
              disabled: config === null,
              onChange: (next) => api?.write('mode', MODES[next].id),
            }),
          ),
        ),
        document.body,
      );
    }

    return {
      inject: ['slots', 'configForms'],
      apply(ctx) {
        try {
        const forms = [];
        for (const id of ENTRY_IDS) {
          try {
            forms.push(ctx.configForms.get(id));
          } catch (error) {
            /* 某个候选 id 不可用时继续用另一个 */
          }
        }

        const readyForm = () => {
          for (const form of forms) {
            const snapshot = form.getSnapshot();
            if (snapshot !== undefined && snapshot.status === 'ready') return { form, snapshot };
          }
          return null;
        };

        api = {
          read() {
            const ready = readyForm();
            if (ready === null) return null;
            const value = ready.snapshot.value ?? {};
            return { mode: normalizeMode(value.mode) };
          },
          subscribe(listener) {
            const disposers = forms.map((form) => form.subscribe(listener));
            return () => disposers.forEach((dispose) => dispose());
          },
          write(field, value) {
            const ready = readyForm();
            if (ready === null) return;
            void ready.form.set(field, value);
          },
        };

        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'progress-narration', order: 40 }, Trigger),
        );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'progress-narration', order: 60 }, Overlay),
        );
        } catch (error) {
          // 插件内部错误不应影响其他插件与整个页面的启动
          if (typeof console !== 'undefined') console.warn('[process narration] unavailable:', error);
        }
      },
    };
  },
});
