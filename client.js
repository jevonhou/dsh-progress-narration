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
    /**
     * 菜单外壳来自 primitives；锚定 hook 在 0.2.2-rc.2 起不再导出，
     * 由下面的本地实现兜底。外壳缺失时保持惰性，不做半残的降级 UI。
     */
    if (typeof primitives.MenuSurface === 'undefined') {
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
        --pnn-pill-fill: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 87%, var(--dsw-alias-label-primary, #111));
        --pnn-pill-text: var(--dsw-alias-label-primary-foreground, #fff);
        --pnn-pill-motion: transform .26s cubic-bezier(.3, 1.05, .5, 1);
        position: relative; display: flex; align-items: stretch;
        height: 34px; padding: 3px; box-sizing: border-box;
        border-radius: 999px; corner-shape: round;
        /* 与官方输入框「+」按钮同一灰：--dsw-specific-selector */
        background: var(--dsw-specific-selector, rgba(38, 49, 72, .10));
        cursor: pointer; outline: none; touch-action: none;
        -webkit-user-select: none; user-select: none;
      }
      .pnn-seg:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3F77D8));
        outline-offset: 3px;
      }
      .pnn-seg.pnn-dragging { cursor: grabbing; }
      .pnn-segments { position: relative; display: flex; width: 100%; }
      .pnn-segLabel {
        flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center;
        font-size: 12px; line-height: 1; font-weight: 500;
        color: var(--dsw-alias-label-secondary, #61666b);
        white-space: nowrap; pointer-events: none;
      }
      .pnn-segPill {
        position: absolute; inset: 0 auto 0 0;
        width: calc(100% / var(--pnn-segments));
        border-radius: 999px; corner-shape: round; overflow: hidden;
        background: var(--pnn-pill-fill);
        box-shadow: 0 1px 2px rgba(0, 0, 0, .10);
        transform: translateX(calc(var(--pnn-pos) * 100%));
        transition: var(--pnn-pill-motion);
      }
      .pnn-seg.pnn-dragging { --pnn-pill-motion: none; }
      .pnn-segPillText {
        position: absolute; top: 0; left: 0; width: calc(100% * var(--pnn-segments)); height: 100%;
        display: flex; align-items: stretch; z-index: 1;
        transform: translateX(calc(var(--pnn-pos) * -100% / var(--pnn-segments)));
        transition: var(--pnn-pill-motion);
      }
      .pnn-segPillText .pnn-segLabel { color: var(--pnn-pill-text); font-weight: 600; }
      .pnn-head {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 0; min-height: 20px;
      }
      .pnn-headMain {
        display: flex; align-items: center; gap: 7px; min-width: 0;
        animation: pnn-caption-in .18s ease-out;
      }
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
      .pnn-reset:enabled:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14)); color: var(--dsw-alias-label-primary, #111); }
      .pnn-reset:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3F77D8));
        outline-offset: 1px;
      }
      .pnn-reset:disabled { opacity: .38; cursor: default; }

      @media (prefers-reduced-motion: reduce) {
        .pnn-panel, .pnn-headMain { animation: none; }
        .pnn-seg { --pnn-pill-motion: none; }
        .pnn-reset { transition: none; }
      }
    `;

    /** 菜单未定位前的测量样式：不可见但参与布局。 */
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

    /**
     * 0.2.2-rc.2 移除了 primitives.useAnchoredPosition，MenuSurface 只当容器。
     * 这里补回同等语义：贴着锚点、默认在它上方、空间不足时翻到下方，并收在视口内。
     * 旧版宿主仍优先用官方 hook。
     */
    function useFallbackAnchorPosition({
      open,
      anchorRef,
      panelRef,
      side = 'top',
      align = 'end',
      gap = 8,
      margin = 12,
    }) {
      const [position, setPosition] = useState(null);
      useEffect(() => {
        if (!open) {
          setPosition(null);
          return undefined;
        }
        let frame = 0;
        const measure = () => {
          const anchor = anchorRef.current;
          if (anchor === null) return;
          const rect = anchor.getBoundingClientRect();
          const panel = panelRef.current;
          const width = panel === null ? 0 : panel.offsetWidth;
          const height = panel === null ? 0 : panel.offsetHeight;
          const aligned = align === 'end'
            ? rect.right - width
            : align === 'start'
              ? rect.left
              : rect.left + rect.width / 2 - width / 2;
          const left = Math.min(Math.max(margin, aligned), Math.max(margin, window.innerWidth - width - margin));
          let top = side === 'top' ? rect.top - height - gap : rect.bottom + gap;
          if (side === 'top' && top < margin && rect.bottom + gap + height <= window.innerHeight - margin) {
            top = rect.bottom + gap;
          }
          if (side === 'bottom' && top + height > window.innerHeight - margin && rect.top - height - gap >= margin) {
            top = rect.top - height - gap;
          }
          setPosition({ top, left });
        };
        measure();
        frame = requestAnimationFrame(measure);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
          cancelAnimationFrame(frame);
          window.removeEventListener('resize', measure);
          window.removeEventListener('scroll', measure, true);
        };
      }, [open, side, align, gap, margin]);
      return position;
    }

    /** 优先用宿主 export；rc.2 起回落到本地实现，hook 调用次数保持稳定。 */
    const useAnchorPosition = typeof primitives.useAnchoredPosition === 'function'
      ? primitives.useAnchoredPosition
      : useFallbackAnchorPosition;

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

    /**
     * 三档密度分段控件。
     * 拖动时只移动胶囊的视觉位置（不写入设置）；松手后吸附到最近一档，
     * 档位有变化才保存一次；取消拖动回到原档，不保存。点击与方向键仍然可用。
     */
    function DensitySlider({ index, disabled, onChange, trackRef }) {
      const segmentsRef = useRef(null);
      const dragRef = useRef(null);
      const [preview, setPreview] = useState(null);
      const [settle, setSettle] = useState(null);
      const last = MODES.length - 1;
      const position = preview ?? settle ?? index;
      const clamp = (value) => Math.min(Math.max(value, 0), last);

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

      const finishDrag = (pointerId) => {
        dragRef.current = null;
        const track = trackRef.current;
        if (track?.hasPointerCapture(pointerId)) track.releasePointerCapture(pointerId);
        setPreview(null);
      };

      const onKeyDown = (event) => {
        const active = dragRef.current;
        if (event.key === 'Escape' && active !== null) {
          event.preventDefault();
          event.stopPropagation();
          finishDrag(active.pointerId);
          return;
        }
        if (disabled) return;
        let target;
        switch (event.key) {
          case 'ArrowLeft':
          case 'ArrowDown': target = clamp(index - 1); break;
          case 'ArrowRight':
          case 'ArrowUp': target = clamp(index + 1); break;
          case 'Home': target = 0; break;
          case 'End': target = last; break;
          default: return;
        }
        event.preventDefault();
        if (active === null && target !== index) onChange(target);
      };

      const startDrag = (event) => {
        if (disabled || event.button !== 0 || dragRef.current !== null) return;
        const track = event.currentTarget;
        event.preventDefault();
        track.focus({ preventScroll: true });
        track.setPointerCapture(event.pointerId);
        dragRef.current = {
          startX: event.clientX,
          startPos: index,
          moved: false,
          pointerId: event.pointerId,
        };
        setSettle(null);
        setPreview(index);
      };

      const isDragMovement = (dx) => Math.abs(dx) > 3;

      const moveDrag = (event) => {
        const active = dragRef.current;
        if (active?.pointerId !== event.pointerId) return;
        const dx = event.clientX - active.startX;
        active.moved ||= isDragMovement(dx);
        if (!active.moved) return;
        const { width } = segmentsRef.current.getBoundingClientRect();
        setPreview(clamp(active.startPos + dx / (width / MODES.length)));
      };

      const endDrag = (event) => {
        const active = dragRef.current;
        if (active?.pointerId !== event.pointerId) return;
        finishDrag(event.pointerId);
        if (disabled) return;
        const { left, width } = segmentsRef.current.getBoundingClientRect();
        const step = width / MODES.length;
        const dx = event.clientX - active.startX;
        const target = active.moved || isDragMovement(dx)
          ? Math.round(clamp(active.startPos + dx / step))
          : clamp(Math.floor((event.clientX - left) / step));
        if (target === index) return;
        setSettle(target);
        onChange(target);
      };

      const cancelDrag = (event) => {
        if (dragRef.current?.pointerId === event.pointerId) finishDrag(event.pointerId);
      };

      return h(
        'div',
        {
          className: `pnn-seg${preview !== null ? ' pnn-dragging' : ''}`,
          ref: trackRef,
          role: 'slider',
          tabIndex: disabled ? -1 : 0,
          'aria-label': '说话密度',
          'aria-valuemin': 0,
          'aria-valuemax': last,
          'aria-valuenow': index,
          'aria-valuetext': MODES[index].label,
          'aria-disabled': disabled ? 'true' : undefined,
          style: { '--pnn-pos': String(position), '--pnn-segments': String(MODES.length) },
          onKeyDown,
          onPointerDown: startDrag,
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: cancelDrag,
          onLostPointerCapture: cancelDrag,
        },
        h(
          'div',
          { className: 'pnn-segments', ref: segmentsRef, 'aria-hidden': 'true' },
          MODES.map((mode) => h('span', { key: mode.id, className: 'pnn-segLabel' }, mode.label)),
          h(
            'div',
            { className: 'pnn-segPill' },
            h(
              'div',
              { className: 'pnn-segPillText' },
              MODES.map((mode) => h('span', { key: mode.id, className: 'pnn-segLabel' }, mode.label)),
            ),
          ),
        ),
      );
    }

    function Trigger() {
      const isOpen = useOpen();
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
          'aria-expanded': isOpen,
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
      const sliderRef = useRef(null);
      const menuPos = useAnchorPosition({
        open: isOpen,
        anchorRef: triggerRef,
        panelRef: menuRef,
        side: 'top',
        align: 'end',
        gap: 8,
        margin: 12,
      });
      const isPositioned = isOpen && menuPos != null;

      useEffect(() => {
        if (isPositioned) sliderRef.current?.focus({ preventScroll: true });
      }, [isPositioned]);

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
              { className: 'pnn-head' },
              h(
                'div',
                { key: active.id, className: 'pnn-headMain' },
                h('span', { className: 'pnn-headIcon' }, h(BubbleIcon, { kind: active.face, size: 18 })),
                h('p', { className: 'pnn-caption' }, active.caption),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'pnn-reset',
                  disabled: isDefault || config === null,
                  title: '重置为默认',
                  'aria-label': '重置为默认',
                  onClick: () => {
                    sliderRef.current?.focus({ preventScroll: true });
                    api?.write('mode', 'balanced');
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
              trackRef: sliderRef,
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
