// VINOTE — Module: Editor (note content editing logic)

        // --- MODULE 5: EDITOR MODULE ---
        const EditorModule = {
            currentNoteId: null,
            undoStack: new UndoRedoStack(),
            activeFont: 'font-typewriter', // re-synced from settings in SettingsModule.init() → EditorModule.loadNote()
            pendingFont: null, // font style to apply to the NEXT characters typed
            autosaveTimer: null, // pending debounced disk write, see scheduleAutosave()
            AUTOSAVE_DEBOUNCE_MS: 500,

            init() {
                this.editorArea = document.getElementById('editorArea');
                this.titleInput = document.getElementById('noteTitleInput');

                // Input Events for Auto-save & Undo Snapshots
                this.editorArea.addEventListener('input', () => {
                    this.onEditorInput();
                    this.scrollCaretIntoView();
                });
                this.titleInput.addEventListener('input', () => {
                    this.saveCurrentNote();
                    this.autoSizeTitle();
                });

                // Enter in the title moves focus into the body instead of
                // doing nothing/whatever a lone <textarea> outside a form
                // would otherwise do — this is handled explicitly (rather
                // than left to native/IME "next field" behavior) specifically
                // so we can pass preventScroll:true to focus() below. Without
                // that, the native focus-triggered scroll-into-view some
                // Android WebViews do for a freshly-focused element (the
                // same one described in the scrollCaretIntoView comment
                // further down, for a plain tap) fires completely
                // unchecked here — there's no pointerdown on #editorArea to
                // hang the tap-restore trick off of when focus arrives this
                // way, so it was free to overshoot and yank the whole paper
                // up far enough to sit under the notch. Suppressing that
                // native jump and then deciding the scroll ourselves via
                // scrollCaretIntoView() (the same path a normal tap already
                // uses safely) fixes it without touching that other flow.
                this.titleInput.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();

                    this.editorArea.focus({ preventScroll: true });

                    // Land the caret at the very start of the body, ready to
                    // type from the top — matches what "moving down into the
                    // next field" should feel like.
                    const range = document.createRange();
                    range.selectNodeContents(this.editorArea);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);

                    // Wait a frame so the title's own height (it may have
                    // just grown/shrunk) has settled before measuring where
                    // the caret actually landed.
                    requestAnimationFrame(() => this.scrollCaretIntoView());
                });

                // --- Keyboard-aware caret scrolling ---
                // The <meta viewport ... interactive-widget=resizes-content> tag
                // already makes the browser shrink the real layout viewport (and
                // every h-screen/100vh/fixed-inset-0 container along with it)
                // when the keyboard opens — no JS needed for that part. What the
                // browser does NOT do on its own is scroll the caret above the
                // keyboard when it's inside a *nested* scrollable container
                // (#paperCanvas), since native caret-follow only ever scrolls the
                // document itself. That's the only thing still patched manually
                // here.
                //
                // (This used to ALSO manually resize #appRoot/#settingsModal/
                // <body> to visualViewport.height on every tick, in lockstep
                // with this same listener, via applyViewportHeightFix(). That
                // duplicated what interactive-widget=resizes-content already
                // does — and the two resize mechanisms landing on slightly
                // different animation frames during the keyboard's open/close
                // animation is what caused the intermittent tan-colored strip
                // flashing above the keyboard: body's bg-vintage-base peeking
                // through a momentary gap between its JS-forced height and the
                // real, natively-resized viewport. Removing the JS side of that
                // duplication removes the race entirely.)
                if (window.visualViewport) {
                    window.visualViewport.addEventListener('resize', () => {
                        requestAnimationFrame(() => this.scrollCaretIntoView());
                    });
                }

                // Capture the paper's scroll position the instant BEFORE a tap
                // can turn into a focus, while it's still definitely untouched.
                // Some Android WebViews auto-scroll a large contenteditable's
                // whole bounding box into view the moment it gains focus (not
                // just the caret line) — which is what was yanking the title
                // out of view on a plain tap even after the rect-measurement
                // fix above. We can't reliably prevent that native jump, so we
                // undo it instead: once focus settles, snap the paper back to
                // where it was, then let scrollCaretIntoView() decide fresh
                // whether any scroll is genuinely needed.
                const paperCanvas = document.getElementById('paperCanvas');
                let scrollTopBeforeFocus = null;
                this.editorArea.addEventListener('pointerdown', () => {
                    if (document.activeElement !== this.editorArea) {
                        scrollTopBeforeFocus = paperCanvas.scrollTop;
                    }
                });

                this.editorArea.addEventListener('focus', () => {
                    // Give the keyboard-open animation time to finish before measuring.
                    setTimeout(() => {
                        if (scrollTopBeforeFocus !== null) {
                            paperCanvas.scrollTop = scrollTopBeforeFocus;
                            scrollTopBeforeFocus = null;
                        }
                        this.scrollCaretIntoView();
                    }, 300);
                });

                // Applies the pending font style to freshly typed characters.
                // Using beforeinput (rather than relying on a pre-placed empty
                // span) means the style keeps working even if the caret moves
                // after picking a font style (e.g. tapping the paper first).
                this.editorArea.addEventListener('beforeinput', (e) => {
                    if (!this.pendingFont) return;
                    if (e.inputType === 'insertText' && e.data) {
                        e.preventDefault();
                        this.insertPendingFontText(e.data);
                    }
                });

                // Floating "More" Menu Toggle (Undo / Redo / Hapus Catatan)
                const moreMenuBtn = document.getElementById('btnEditorMoreMenu');
                const moreDropdown = document.getElementById('editorMoreDropdown');

                moreMenuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moreDropdown.classList.toggle('hidden');
                });

                document.addEventListener('click', (e) => {
                    if (!moreDropdown.contains(e.target) && e.target !== moreMenuBtn) {
                        moreDropdown.classList.add('hidden');
                    }
                });

                // Font style option click handler — lives on the Settings
                // page. This sets the note's persisted DEFAULT font (saved to
                // settings, survives reload/new notes), unlike the per-
                // selection font buttons inside the selection bubble
                // (.btnBubbleFont) which only restyle the text currently
                // selected. Previously this called applyFontToSelection()
                // here too, which only ever set an in-memory activeFont/
                // pendingFont that reset to 'font-typewriter' on every reload
                // and was never actually saved — so picking "Tulisan Tangan"
                // looked like it did nothing.
                document.querySelectorAll('.btnFontOption').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const fontClass = btn.getAttribute('data-font');
                        SettingsModule.setDefaultFont(fontClass);
                    });
                });

                // Undo / Redo Handlers
                document.getElementById('btnUndo').addEventListener('click', () => {
                    const prev = this.undoStack.undo(this.editorArea.innerHTML);
                    if (prev !== null) {
                        this.editorArea.innerHTML = prev;
                        this.saveCurrentNote();
                    }
                    moreDropdown.classList.add('hidden');
                });

                document.getElementById('btnRedo').addEventListener('click', () => {
                    const next = this.undoStack.redo(this.editorArea.innerHTML);
                    if (next !== null) {
                        this.editorArea.innerHTML = next;
                        this.saveCurrentNote();
                    }
                    moreDropdown.classList.add('hidden');
                });

                // "Salin Semua" — one-tap copy of the whole note (title +
                // body) to the clipboard. Tries the modern async Clipboard
                // API first; some Android WebView builds don't expose it
                // (or refuse it outside a "secure context"), so a hidden
                // textarea + execCommand('copy') fallback covers those.
                document.getElementById('btnCopyAll').addEventListener('click', () => {
                    moreDropdown.classList.add('hidden');
                    this.copyAllText();
                });

                this.updateFontIndicator();
            },

            // Keeps the text caret visible above the keyboard by scrolling
            // #paperCanvas manually. Needed because contenteditable inside a
            // nested scroll container doesn't reliably auto-scroll on Android
            // WebView the way a plain <textarea> or the page body would.
            scrollCaretIntoView() {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                if (!this.editorArea.contains(sel.anchorNode)) return;

                const range = sel.getRangeAt(0).cloneRange();
                range.collapse(true);
                let rect = range.getBoundingClientRect();

                // A collapsed range at an empty line (e.g. right after pressing
                // Enter, or the very first tap into a blank note) reports an
                // all-zero rect. This used to fall back to the FULL bounding
                // box of the caret's containing element — but on an empty note
                // that element is #editorArea itself, whose box includes its
                // min-height (400px) and ~14rem of bottom padding reserved for
                // the keyboard. That made `rect.bottom` land far below the
                // actual caret line, so the code below thought the caret was
                // off-screen and scrolled the paper down to "fix" it — which is
                // exactly what was yanking the title out of view on a simple
                // tap. Only the element's TOP is trustworthy here; synthesize a
                // single-line-height rect from it instead of trusting its full,
                // oversized box.
                if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.bottom === 0) {
                    const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
                    if (node && node.getBoundingClientRect) {
                        const nodeRect = node.getBoundingClientRect();
                        const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 28;
                        rect = {
                            top: nodeRect.top,
                            bottom: nodeRect.top + lineHeight,
                            left: nodeRect.left,
                            right: nodeRect.right
                        };
                    }
                }
                if (!rect || (rect.top === 0 && rect.bottom === 0)) return;

                // getBoundingClientRect() on a collapsed range often only
                // wraps the caret glyph's own ink (ascent/descent), not the
                // full CSS line-height box that line actually occupies on
                // the page — with this app's fairly tall default line
                // height (1.8x), that gap is noticeable. Normalize rect
                // into a plain writable object (a real DOMRect's
                // top/bottom are read-only getters) and pad its bottom out
                // to the full line-height, so the WHOLE line — not just
                // the letters' ink — is what gets kept clear of the
                // keyboard. Without this, the last line can end up sitting
                // flush against the edge with none of the breathing room a
                // normal note app leaves.
                rect = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
                const caretEl = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
                if (caretEl && caretEl.nodeType === 1) {
                    const lineHeight = parseFloat(getComputedStyle(caretEl).lineHeight) || (rect.bottom - rect.top);
                    rect.bottom = Math.max(rect.bottom, rect.top + lineHeight);
                }

                const vv = window.visualViewport;
                const visibleTop = vv ? vv.offsetTop : 0;
                const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
                const margin = 32; // buffer so the caret line has real breathing room, not glued to the edge

                const paperCanvas = document.getElementById('paperCanvas');
                if (rect.bottom > visibleBottom - margin) {
                    this.forceScrollTop(paperCanvas, paperCanvas.scrollTop + (rect.bottom - (visibleBottom - margin)));
                } else if (rect.top < visibleTop + margin) {
                    this.forceScrollTop(paperCanvas, paperCanvas.scrollTop - (visibleTop + margin - rect.top));
                }
            },

            // Sets #paperCanvas.scrollTop to an absolute target and
            // reasserts that same target for a few more animation frames.
            // Why: if the caret-follow check above runs right as the user's
            // manual scroll gesture is still decelerating (finger already
            // lifted, WebView still coasting on inertia), a single
            // synchronous scrollTop write gets silently overwritten by the
            // next inertia tick a moment later — visually indistinguishable
            // from the auto-scroll not having run at all, which is exactly
            // the "ngetik lagi tapi layar nggak ngikutin" complaint. `target`
            // is a fixed point in the document's own scroll coordinates
            // (not relative to whatever the current scrollTop happens to be
            // mid-momentum), so reapplying it for a few more frames is safe
            // and just lets our correction "win" once the residual
            // momentum dies down — typically within 5-6 frames (~90ms).
            forceScrollTop(el, target) {
                let frames = 0;
                const reassert = () => {
                    el.scrollTop = target;
                    frames++;
                    if (frames < 6) requestAnimationFrame(reassert);
                };
                reassert();
            },

            // Grows/shrinks the title <textarea> to fit however many lines
            // it actually wraps to (a plain textarea never does this on its
            // own). Resetting height to 'auto' first is required before
            // reading scrollHeight — otherwise scrollHeight just reports the
            // CURRENT (possibly now-too-tall-for-the-content) height back,
            // and the box would only ever grow, never shrink back down after
            // deleting text.
            autoSizeTitle() {
                this.titleInput.style.height = 'auto';
                this.titleInput.style.height = this.titleInput.scrollHeight + 'px';
                // The title growing/shrinking moves #editorArea's top edge,
                // which is exactly what the ruled-line background's phase
                // is measured from — without re-syncing here, typing a
                // title long enough to wrap to a 2nd/3rd line would leave
                // the ruled lines increasingly misaligned with the actual
                // text baseline until the next window resize.
                if (typeof SettingsModule !== 'undefined') SettingsModule.syncRuledLineAlignment();
            },

            loadNote(noteId) {
                // Flush whatever note was open before this one. Since
                // autosave is now debounced (see scheduleAutosave), the
                // last keystroke typed just before switching notes could
                // still be sitting in that timer — flushing here writes it
                // for real before we swap the DOM/currentNoteId out from
                // under it.
                this.flushAutosave();

                this.currentNoteId = noteId;
                this.undoStack.clear();
                // Fresh typing in this note starts from the persisted default
                // font (Settings > Gaya Font Tulisan), not whatever font was
                // last active in a previously-open note.
                this.pendingFont = SettingsModule.currentSettings.fontStyle;
                this.activeFont = SettingsModule.currentSettings.fontStyle;
                this.updateFontIndicator();

                const notes = StorageModule.getNotes();
                const note = notes.find(n => n.id === noteId);

                if (note) {
                    this.titleInput.value = note.title || '';
                    this.editorArea.innerHTML = note.content || '';
                } else {
                    // New Note
                    this.titleInput.value = '';
                    this.editorArea.innerHTML = '';
                }

                this.sanitizeInlineFontSizes();

                // Textarea height doesn't auto-track a value set via JS
                // (only real typing triggers 'input'), so every note load
                // needs its own explicit resize — otherwise a short note
                // opened right after a long one would inherit the long
                // one's tall title box until the user typed something.
                this.autoSizeTitle();

                // Initial Undo Snapshot
                this.undoStack.pushState(this.editorArea.innerHTML, true);
            },

            onEditorInput() {
                this.sanitizeInlineFontSizes();
                this.undoStack.pushState(this.editorArea.innerHTML);
                this.scheduleAutosave();
            },

            // Writing to disk is the expensive part of every keystroke —
            // saveCurrentNote() re-reads and re-writes the ENTIRE notes
            // list (JSON.parse/JSON.stringify + localStorage.setItem of
            // ALL notes, not just this one), and that cost grows with how
            // many notes exist and how long this one is. Running it
            // synchronously on every single character (as before) could
            // momentarily block the main thread — and on this Android
            // WebView, a long enough block during active typing is what
            // makes the soft keyboard lose its sync with the caret (it
            // then needs a fresh tap/Enter/scroll to "wake back up",
            // exactly the reported bug). Debouncing means the actual disk
            // write only happens once typing pauses for a moment, instead
            // of on every keystroke; scrollCaretIntoView() (called
            // separately, right after this, in the 'input' listener) stays
            // immediate so the screen still follows the cursor instantly.
            scheduleAutosave() {
                if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
                this.autosaveTimer = setTimeout(() => {
                    this.autosaveTimer = null;
                    this.saveCurrentNote();
                }, this.AUTOSAVE_DEBOUNCE_MS);
            },

            // Cancels any pending debounced write and saves immediately.
            // Call this anywhere the current note is about to stop being
            // "the one on screen" (switching to another note, closing the
            // editor, the app going to background) — otherwise the very
            // last keystroke before that moment could still be waiting on
            // the debounce timer and never get written.
            flushAutosave() {
                if (this.autosaveTimer) {
                    clearTimeout(this.autosaveTimer);
                    this.autosaveTimer = null;
                }
                this.saveCurrentNote();
            },

            // Chrome (and some Android WebViews) can hardcode a literal pixel
            // font-size as an inline style when a block is split off from one
            // that had a relative (em-based) size — most commonly when the
            // user presses Enter right after an <h1>/<h2> heading. That frozen
            // px value then ignores the "Ukuran Huruf Default" slider forever,
            // since it out-specifies the CSS class / --note-font-size custom
            // property this app actually uses for sizing. This app never
            // intentionally sets inline font-size anywhere, so it's always
            // safe to strip it the moment it shows up.
            sanitizeInlineFontSizes() {
                this.editorArea.querySelectorAll('[style*="font-size"]').forEach(el => {
                    el.style.removeProperty('font-size');
                    if (!el.getAttribute('style')) el.removeAttribute('style');
                });
            },

            // Applies font to selected text range or sentence independently
            applyFontToSelection(fontClass) {
                const selection = window.getSelection();
                if (!selection.rangeCount || selection.isCollapsed) {
                    // No text selected: just remember this as the style for
                    // whatever gets typed next. We deliberately do NOT insert
                    // a placeholder span here — that broke as soon as the
                    // caret moved (e.g. tapping the paper before typing).
                    this.pendingFont = fontClass;
                    this.activeFont = fontClass;
                    this.updateFontIndicator();
                    this.editorArea.focus();
                    return;
                }

                const range = selection.getRangeAt(0);
                const span = document.createElement('span');
                span.className = fontClass;

                try {
                    const contents = range.extractContents();
                    this.stripFontClasses(contents);
                    span.appendChild(contents);
                    range.insertNode(span);

                    // Re-select newly styled span
                    selection.removeAllRanges();
                    const newRange = document.createRange();
                    newRange.selectNodeContents(span);
                    selection.addRange(newRange);
                } catch(e) {
                    console.error("Font apply fallback", e);
                }

                // Keep typing in the same style right after the formatted text
                this.pendingFont = fontClass;
                this.activeFont = fontClass;
                this.updateFontIndicator();
                this.onEditorInput();
            },

            // Wraps a freshly-typed character/word in the pending font style.
            // Runs on every keystroke instead of relying on a stale caret
            // position, and avoids nesting font spans inside each other
            // (nesting is what made font sizes compound and grow over time).
            insertPendingFontText(text) {
                const selection = window.getSelection();
                if (!selection.rangeCount) return;
                const range = selection.getRangeAt(0);

                const fontClasses = ['font-typewriter', 'font-handwriting', 'font-cursive'];
                let ancestor = range.startContainer;
                while (ancestor && ancestor !== this.editorArea) {
                    if (ancestor.nodeType === 1 && fontClasses.some(c => ancestor.classList.contains(c))) break;
                    ancestor = ancestor.parentNode;
                }
                if (ancestor === this.editorArea) ancestor = null;

                if (ancestor && ancestor.classList.contains(this.pendingFont)) {
                    // Caret is already inside a span with the same style: just
                    // insert plain text so it extends that same span.
                    document.execCommand('insertText', false, text);
                    return;
                }

                const span = document.createElement('span');
                span.className = this.pendingFont;
                span.textContent = text;

                if (ancestor) {
                    // Caret is inside a span with a DIFFERENT font style:
                    // insert the new span right after that whole span instead
                    // of nesting inside it.
                    ancestor.parentNode.insertBefore(span, ancestor.nextSibling);
                } else {
                    range.deleteContents();
                    range.insertNode(span);
                }

                const newRange = document.createRange();
                newRange.setStart(span.firstChild, span.firstChild.length);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);

                this.onEditorInput();
            },

            // Reflects the currently active font style by highlighting the
            // matching option on the Settings page and in the selection bubble.
            updateFontIndicator() {
                // .btnFontOption (Settings page) indicator is driven by
                // SettingsModule.updateFontIndicator() instead — it reflects
                // the persisted default, which can differ from whatever this
                // module's activeFont currently is (e.g. right after
                // formatting one selection to a one-off style).
                document.querySelectorAll('.btnBubbleFont').forEach(btn => {
                    const isActive = btn.getAttribute('data-bubble-font') === this.activeFont;
                    btn.classList.toggle('font-option-active', isActive);
                });
            },

            // Removes any previously-applied font-style spans from an extracted
            // selection fragment so a new font style REPLACES the old one instead
            // of nesting inside it (nesting caused compounding font sizes and
            // stale inner styles bleeding through).
            stripFontClasses(fragment) {
                const fontClasses = ['font-typewriter', 'font-handwriting', 'font-cursive'];

                const unwrap = (el) => {
                    fontClasses.forEach(c => el.classList.remove(c));
                    // If the span no longer carries any class/attributes, unwrap it
                    // entirely so we don't leave behind empty wrapper spans.
                    if (el.tagName === 'SPAN' && el.className.trim() === '' && el.attributes.length === 0) {
                        const parent = el.parentNode;
                        while (el.firstChild) parent.insertBefore(el.firstChild, el);
                        parent.removeChild(el);
                    }
                };

                // Nested occurrences anywhere inside the fragment
                Array.from(fragment.querySelectorAll('.font-typewriter, .font-handwriting, .font-cursive')).forEach(unwrap);

                // Top-level children can themselves carry a font class when the
                // selection cut across the edge of an existing styled span.
                Array.from(fragment.childNodes).forEach(node => {
                    if (node.nodeType === 1 && fontClasses.some(c => node.classList.contains(c))) {
                        unwrap(node);
                    }
                });
            },

            saveCurrentNote() {
                const title = this.titleInput.value.trim();
                const content = this.editorArea.innerHTML;

                if (!title && (!content || content === '<br>')) {
                    return; // Don't save empty notes
                }

                const notes = StorageModule.getNotes();
                const now = new Date().toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric'
                });

                if (this.currentNoteId) {
                    const index = notes.findIndex(n => n.id === this.currentNoteId);
                    if (index !== -1) {
                        notes[index] = {
                            ...notes[index],
                            title: title || 'Catatan Tanpa Judul',
                            content,
                            updatedAt: now
                        };
                    }
                } else {
                    // Create new
                    const newNote = {
                        id: 'note_' + Date.now(),
                        title: title || 'Catatan Tanpa Judul',
                        content,
                        createdAt: now,
                        updatedAt: now
                    };
                    this.currentNoteId = newNote.id;
                    notes.unshift(newNote);
                }

                StorageModule.saveNotes(notes);
            },

            // Copies the current note's title + body as plain text in one
            // tap. innerText (not innerHTML/textContent) is used so line
            // breaks between paragraphs/headings come through the way they
            // visually read on the paper, instead of one run-on line.
            async copyAllText() {
                const title = this.titleInput.value.trim();
                const body = this.editorArea.innerText.trim();
                const fullText = title ? `${title}\n\n${body}` : body;

                if (!fullText) {
                    UIModule.showToast('Catatan masih kosong');
                    return;
                }

                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(fullText);
                        UIModule.showToast('Semua teks disalin');
                        return;
                    }
                    throw new Error('Clipboard API unavailable');
                } catch (e) {
                    // Fallback for WebViews without (or refusing) the
                    // Clipboard API: a temporary offscreen textarea + the
                    // legacy execCommand('copy').
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = fullText;
                        ta.style.position = 'fixed';
                        ta.style.top = '-9999px';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.focus();
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        UIModule.showToast('Semua teks disalin');
                    } catch (fallbackErr) {
                        console.error('Copy all failed', fallbackErr);
                        UIModule.showToast('Gagal menyalin teks');
                    }
                }
            },

            deleteCurrentNote() {
                if (!this.currentNoteId) return;
                if (this.autosaveTimer) {
                    clearTimeout(this.autosaveTimer);
                    this.autosaveTimer = null;
                }
                let notes = StorageModule.getNotes();
                notes = notes.filter(n => n.id !== this.currentNoteId);
                StorageModule.saveNotes(notes);
                UIModule.showToast('Catatan dihapus');
                NavigationModule.closeEditor();
            }
        };
