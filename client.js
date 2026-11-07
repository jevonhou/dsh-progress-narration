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

    /** 统一使用 Harness 的 business 蓝，随亮/暗主题自动适配。 */
    const ACCENT = 'var(--dsw-alias-state-business-primary, #3F77D8)';

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
        box-sizing: border-box; position: fixed; z-index: 1100; padding: 4px;
        display: flex; flex-direction: column; width: max-content;
        --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
        box-shadow: var(--dsw-elevation-prominent);
        color: var(--dsw-alias-label-primary);
      }
      .pnn-panel {
        display: flex; flex-direction: column; gap: 10px; padding: 16px 12px 14px;
        width: 280px; box-sizing: border-box; animation: pnn-in .16s ease-out;
      }
      @keyframes pnn-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
      .pnn-track {
        position: relative; height: 34px; cursor: pointer; touch-action: none;
        border-radius: 999px; outline: none;
      }
      .pnn-track:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3F77D8));
        outline-offset: 3px;
      }
      .pnn-rail {
        position: absolute; left: 0; right: 0; top: 50%; height: 24px; margin-top: -12px;
        border-radius: 12px; corner-shape: round; overflow: hidden;
        background: var(--dsw-alias-state-business-primary, #3F77D8);
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, .10);
      }
      .pnn-stars {
        position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        background-repeat: repeat-x; background-size: 120px 100%;
        animation: pnn-drift 26s linear infinite;
      }
      .pnn-stars-a {
        background-image:
          radial-gradient(1.4px 1.4px at 8px 30%, rgba(255,255,255,.85), transparent 60%),
          radial-gradient(1.1px 1.1px at 34px 68%, rgba(255,255,255,.6), transparent 60%),
          radial-gradient(1.6px 1.6px at 62px 40%, rgba(255,255,255,.75), transparent 60%),
          radial-gradient(1px 1px at 88px 74%, rgba(255,255,255,.5), transparent 60%),
          radial-gradient(1.2px 1.2px at 104px 24%, rgba(255,255,255,.65), transparent 60%);
        animation: pnn-drift 34s linear infinite, pnn-twinkle 3.6s ease-in-out infinite alternate;
      }
      .pnn-stars-b {
        background-image:
          radial-gradient(1.2px 1.2px at 18px 62%, rgba(255,255,255,.55), transparent 60%),
          radial-gradient(1.5px 1.5px at 46px 26%, rgba(255,255,255,.7), transparent 60%),
          radial-gradient(1px 1px at 72px 58%, rgba(255,255,255,.45), transparent 60%),
          radial-gradient(1.3px 1.3px at 96px 36%, rgba(255,255,255,.6), transparent 60%);
        animation: pnn-drift 48s linear infinite reverse, pnn-twinkle 5.2s ease-in-out infinite alternate-reverse;
      }
      @keyframes pnn-drift { from { background-position-x: 0; } to { background-position-x: -240px; } }
      @keyframes pnn-twinkle { from { opacity: .55; } to { opacity: 1; } }
      .pnn-stop {
        position: absolute; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px;
        border-radius: 50%; background: rgba(255, 255, 255, .9);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, .12);
        pointer-events: none;
      }
      .pnn-thumb {
        position: absolute; top: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px;
        border-radius: 50%; corner-shape: round; background: #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, .18), 0 4px 12px rgba(0, 0, 0, .12);
        transition: left .24s cubic-bezier(.3, 1.2, .5, 1), transform .16s ease, box-shadow .16s ease;
      }
      .pnn-track.pnn-dragging .pnn-thumb {
        transition: transform .16s ease, box-shadow .16s ease;
        transform: scale(.96); box-shadow: 0 2px 6px rgba(0, 0, 0, .2), 0 8px 18px rgba(0, 0, 0, .14);
      }
      @media (hover: hover) {
        .pnn-track:hover .pnn-thumb { transform: scale(1.05); }
        .pnn-track.pnn-dragging:hover .pnn-thumb { transform: scale(.96); }
      }
      .pnn-ticks {
        position: relative; height: 18px;
        font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #8a8a8a);
      }
      .pnn-tick {
        position: absolute; top: 0; transform: translateX(-50%);
        white-space: nowrap; transition: color .16s ease;
      }
      .pnn-tickOn { color: var(--dsw-alias-label-primary, #111); font-weight: 500; }
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
        .pnn-stars { animation: none; opacity: .7; }
        .pnn-thumb, .pnn-tick, .pnn-reset { transition: none; }
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

    /** 三档密度滑轨：可点击、可拖动，方向键可调。 */
    function DensitySlider({ index, disabled, onChange }) {
      const trackRef = useRef(null);
      const [dragging, setDragging] = useState(false);
      const last = MODES.length - 1;
      const ratio = last === 0 ? 0 : index / last;
      const INSET = 14;

      const pickFromX = (clientX) => {
        const track = trackRef.current;
        if (track === null) return;
        const rect = track.getBoundingClientRect();
        const inner = Math.max(1, rect.width - INSET * 2);
        const offset = Math.min(Math.max(clientX - rect.left - INSET, 0), inner);
        const next = Math.round((offset / inner) * last);
        if (next !== index) onChange(next);
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
        }
      };

      const position = (fraction) => `calc(${INSET}px + (100% - ${INSET * 2}px) * ${fraction})`;

      return h(
        'div',
        {
          className: `pnn-track${dragging ? ' pnn-dragging' : ''}`,
          ref: trackRef,
          role: 'slider',
          tabIndex: disabled ? -1 : 0,
          'aria-label': '说话密度',
          'aria-valuemin': 0,
          'aria-valuemax': last,
          'aria-valuenow': index,
          'aria-valuetext': MODES[index].label,
          'aria-disabled': disabled ? 'true' : undefined,
          onKeyDown,
          onPointerDown: (event) => {
            if (disabled) return;
            setDragging(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            pickFromX(event.clientX);
          },
          onPointerMove: (event) => {
            if (!dragging) return;
            pickFromX(event.clientX);
          },
          onPointerUp: (event) => {
            setDragging(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          },
          onPointerCancel: () => setDragging(false),
        },
        h(
          'div',
          { className: 'pnn-rail' },
          h('div', { className: 'pnn-stars pnn-stars-a' }),
          h('div', { className: 'pnn-stars pnn-stars-b' }),
        ),
        MODES.map((mode, stop) =>
          h('div', {
            key: mode.id,
            className: 'pnn-stop',
            style: { left: position(last === 0 ? 0 : stop / last) },
          }),
        ),
        h('div', { className: 'pnn-thumb', style: { left: position(ratio) } }),
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
            h(
              'div',
              { className: 'pnn-ticks' },
              MODES.map((mode, stop) =>
                h(
                  'span',
                  {
                    key: mode.id,
                    className: `pnn-tick${stop === index ? ' pnn-tickOn' : ''}`,
                    style: {
                      left: `calc(14px + (100% - 28px) * ${stop / Math.max(1, MODES.length - 1)})`,
                      ...(stop === index ? { color: ACCENT } : {}),
                    },
                  },
                  h('span', null, mode.label),
                ),
              ),
            ),
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
