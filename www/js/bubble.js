// VINOTE — Module: Selection Bubble (context toolbar on text selection)

        // --- MODULE 4: SELECTION BUBBLE MODULE ---
        const BubbleModule = {
            init() {
                const editorArea = document.getElementById('editorArea');

                // BLOCK Native Android context menu popup on long press
                editorArea.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                });

                // Selection Change Event.
                // 'selectionchange' fires very rapidly and repeatedly while
                // the user is actively drag-selecting. checkSelection() does
                // layout-forcing work (positionBubble reads offsetWidth/
                // offsetHeight and writes inline styles/classes), so running
                // it synchronously on every single event floods the main
                // thread mid-gesture. Coalescing to one check per animation
                // frame keeps the bubble just as responsive while leaving
                // the thread free for the OS to actually track the
                // touch/drag gesture.
                this._selectionRafPending = false;
                document.addEventListener('selectionchange', () => {
                    if (this._selectionRafPending) return;
                    this._selectionRafPending = true;
                    requestAnimationFrame(() => {
                        this._selectionRafPending = false;
                        this.checkSelection();
                    });
                });

                // --- Touch drag-select: keep the finger's grip on the
                // handle, and auto-scroll #paperCanvas near the edges ---
                //
                // Two problems this section fixes together (they share a
                // root cause):
                //
                // 1) Dragging a selection handle down toward the bottom
                //    edge silently exited selection mode — the handle felt
                //    "not grabbed" even with a precise touch.
                // 2) There was no auto-scroll at all while drag-selecting,
                //    so extending a selection past the visible area meant
                //    letting go and scrolling manually over and over.
                //
                // Root cause of (1): while a finger is down actively
                // dragging a native selection handle, Android WebView is
                // mid-tracking that touch at the OS level. Any extra
                // layout-forcing JS work happening on the same frames
                // (positionBubble() reads offsetWidth/offsetHeight and
                // writes styles) competes for the main thread right when
                // the OS needs it, and enough contention makes the OS drop
                // its own grip on the handle/selection. The fix: while a
                // touch is actually down, skip the bubble positioning
                // entirely (checkSelection() below returns early via
                // this._isTouchDown) and only compute/show it once the
                // finger lifts. This also gives us a natural place to do
                // fix (2): a cheap rAF loop that just nudges
                // #paperCanvas.scrollTop while the touch is near the top or
                // bottom edge, without ever calling preventDefault (so it
                // never fights the native handle-drag/selection itself).
                this._isTouchDown = false;
                this._autoScrollSpeed = 0;
                this._autoScrollRAF = null;

                const paperCanvas = document.getElementById('paperCanvas');

                const runAutoScroll = () => {
                    if (this._autoScrollSpeed !== 0 && paperCanvas) {
                        paperCanvas.scrollTop += this._autoScrollSpeed;
                        this._autoScrollRAF = requestAnimationFrame(runAutoScroll);
                    } else {
                        this._autoScrollRAF = null;
                    }
                };

                const stopAutoScroll = () => {
                    this._autoScrollSpeed = 0;
                    if (this._autoScrollRAF) {
                        cancelAnimationFrame(this._autoScrollRAF);
                        this._autoScrollRAF = null;
                    }
                };

                editorArea.addEventListener('touchstart', () => {
                    this._isTouchDown = true;
                    // Hide the (now stale) bubble immediately rather than
                    // leaving it floating over wherever the selection used
                    // to be while the user repositions the handle.
                    UIModule.hideBubble();
                }, { passive: true });

                editorArea.addEventListener('touchmove', (e) => {
                    // Only auto-scroll while there's an actual in-progress
                    // (non-collapsed) selection — i.e. a handle is being
                    // dragged, not just an ordinary scroll/tap.
                    const selection = window.getSelection();
                    const hasSelection = selection && selection.rangeCount && !selection.isCollapsed;
                    const touch = e.touches && e.touches[0];
                    if (!hasSelection || !touch || !paperCanvas) {
                        stopAutoScroll();
                        return;
                    }

                    const rect = paperCanvas.getBoundingClientRect();
                    const edgeZone = 70; // px from the top/bottom edge that triggers scrolling
                    const maxSpeed = 16; // px scrolled per animation frame at full intensity

                    const distFromTop = touch.clientY - rect.top;
                    const distFromBottom = rect.bottom - touch.clientY;

                    let speed = 0;
                    if (distFromBottom < edgeZone) {
                        const intensity = Math.min(1, (edgeZone - Math.max(distFromBottom, 0)) / edgeZone);
                        speed = maxSpeed * intensity;
                    } else if (distFromTop < edgeZone) {
                        const intensity = Math.min(1, (edgeZone - Math.max(distFromTop, 0)) / edgeZone);
                        speed = -maxSpeed * intensity;
                    }

                    this._autoScrollSpeed = speed;
                    if (speed !== 0 && !this._autoScrollRAF) {
                        this._autoScrollRAF = requestAnimationFrame(runAutoScroll);
                    } else if (speed === 0) {
                        stopAutoScroll();
                    }
                }, { passive: true });

                const endTouchSelecting = () => {
                    this._isTouchDown = false;
                    stopAutoScroll();
                    // The bubble was skipped for the whole drag (see
                    // checkSelection() below) — do that positioning now
                    // that the finger has lifted and the selection is
                    // settled.
                    requestAnimationFrame(() => this.checkSelection());
                };
                editorArea.addEventListener('touchend', endTouchSelecting, { passive: true });
                editorArea.addEventListener('touchcancel', endTouchSelecting, { passive: true });

                // Context bubble commands
                document.getElementById('bubbleBold').addEventListener('click', () => this.format('bold'));
                document.getElementById('bubbleItalic').addEventListener('click', () => this.format('italic'));
                document.getElementById('bubbleH1').addEventListener('click', () => this.formatBlock('<h1>'));
                document.getElementById('bubbleH2').addEventListener('click', () => this.formatBlock('<h2>'));
                document.getElementById('bubbleSelectAll').addEventListener('click', () => {
                    document.execCommand('selectAll', false, null);
                });

                document.getElementById('bubbleCopy').addEventListener('click', () => {
                    document.execCommand('copy');
                    UIModule.showToast('Teks tersalin!');
                    UIModule.hideBubble();
                });

                document.getElementById('bubbleCut').addEventListener('click', () => {
                    document.execCommand('cut');
                    EditorModule.onEditorInput();
                    UIModule.showToast('Teks dipotong!');
                    UIModule.hideBubble();
                });

                document.getElementById('bubblePaste').addEventListener('click', async () => {
                    try {
                        const text = await navigator.clipboard.readText();
                        document.execCommand('insertText', false, text);
                    } catch(err) {
                        UIModule.showToast('Gunakan opsi tempel');
                    }
                    UIModule.hideBubble();
                });

                // Inline Font Selector Buttons inside Bubble
                document.querySelectorAll('.btnBubbleFont').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const fontClass = btn.getAttribute('data-bubble-font');
                        EditorModule.applyFontToSelection(fontClass);
                        UIModule.hideBubble();
                    });
                });

                // Highlight ("stabilo") Color Buttons inside Bubble
                document.querySelectorAll('.btnHighlight').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const color = btn.getAttribute('data-color');
                        this.highlight(color);
                    });
                });

                // ">" toggle: collapse default actions, reveal the font-style page
                document.getElementById('bubbleFontPageToggle').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showPage('font');
                });

                // "<" back: return to the default compact actions page
                document.getElementById('bubbleFontPageBack').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showPage('default');
                });
            },

            // Switches between the compact default page and the font-style page,
            // then repositions the bubble since its width changes between pages.
            // Animates as a small sliding crossfade: the outgoing page slides out
            // in the direction of travel while the incoming page slides in from
            // the opposite side, mirroring the ">" / "<" bubble buttons.
            // Pass animate=false to swap instantly (used when the bubble first
            // appears for a brand new selection).
            showPage(page, animate = true) {
                const pageDefault = document.getElementById('bubblePageDefault');
                const pageFont = document.getElementById('bubblePageFont');
                const goingForward = page === 'font';
                const outgoing = goingForward ? pageDefault : pageFont;
                const incoming = goingForward ? pageFont : pageDefault;

                const reposition = () => {
                    const selection = window.getSelection();
                    if (selection.rangeCount && !selection.isCollapsed) {
                        UIModule.positionBubble(selection.getRangeAt(0).getBoundingClientRect());
                    }
                };

                const swap = () => {
                    outgoing.classList.add('hidden');
                    outgoing.classList.remove('flex');
                    outgoing.classList.remove('bubble-slide-left', 'bubble-slide-right');
                    incoming.classList.remove('hidden');
                    incoming.classList.add('flex');
                };

                if (!animate || outgoing.classList.contains('hidden')) {
                    swap();
                    incoming.classList.remove('bubble-slide-left', 'bubble-slide-right');
                    reposition();
                    return;
                }

                // 1) Slide/fade the current page out.
                outgoing.classList.add(goingForward ? 'bubble-slide-left' : 'bubble-slide-right');

                setTimeout(() => {
                    // 2) Swap visibility, placing the incoming page just off to the
                    // opposite side so it has somewhere to animate in from.
                    swap();
                    incoming.classList.add(goingForward ? 'bubble-slide-right' : 'bubble-slide-left');
                    reposition();

                    // 3) Let the browser paint the offset start state, then remove
                    // it on the next frame so the transition actually animates
                    // (setting start + end state in the same frame skips straight
                    // to the end with no visible motion).
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            incoming.classList.remove('bubble-slide-left', 'bubble-slide-right');
                        });
                    });
                }, 140);
            },

            checkSelection() {
                const selection = window.getSelection();
                const editorArea = document.getElementById('editorArea');

                if (!selection.rangeCount || selection.isCollapsed) {
                    UIModule.hideBubble();
                    return;
                }

                const range = selection.getRangeAt(0);
                if (!editorArea.contains(range.commonAncestorContainer)) {
                    UIModule.hideBubble();
                    return;
                }

                // While a finger is physically down (dragging a selection
                // handle), don't do the layout-forcing bubble positioning
                // work at all — see the long comment in init() for why.
                // The selection itself is untouched; we just defer showing
                // the bubble until touchend calls checkSelection() again.
                if (this._isTouchDown) {
                    return;
                }

                // Reset to the compact default page whenever the bubble re-appears
                // for a fresh selection, so it doesn't stay stuck on the font page.
                const wasHidden = UIModule.bubbleElement.classList.contains('hidden');
                if (wasHidden) {
                    this.showPage('default', false);
                }

                const rect = range.getBoundingClientRect();
                UIModule.positionBubble(rect);
            },

            format(command) {
                document.execCommand(command, false, null);
                EditorModule.onEditorInput();
            },

            // Applies a "stabilo" (highlighter) background color to the
            // current selection. Uses the same execCommand approach as
            // bold/italic since it's well supported in contenteditable.
            highlight(color) {
                document.execCommand('hiliteColor', false, color);
                EditorModule.onEditorInput();
                UIModule.hideBubble();
            },

            formatBlock(tag) {
                const targetTag = tag.replace(/[<>]/g, '').toUpperCase(); // 'H1' or 'H2'

                // Walk up from the caret to find the nearest block-level element
                // so we know whether it's ALREADY the tag being requested.
                // (document.queryCommandValue('formatBlock') is unreliable on
                // Android WebView, so we check the DOM directly instead.)
                const sel = window.getSelection();
                let node = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
                if (node && node.nodeType === 3) node = node.parentElement;

                let block = node;
                while (block && block !== EditorModule.editorArea && !['H1', 'H2', 'P', 'DIV'].includes(block.tagName)) {
                    block = block.parentElement;
                }

                const isAlreadyActive = block && block.tagName === targetTag;
                document.execCommand('formatBlock', false, isAlreadyActive ? '<p>' : tag);
                EditorModule.onEditorInput();
            }
        };
