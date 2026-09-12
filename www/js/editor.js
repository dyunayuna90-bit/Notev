// VINOTE — Module: Editor (note content editing logic)

        // --- MODULE 5: EDITOR MODULE ---
        const EditorModule = {
            currentNoteId: null,
            undoStack: new UndoRedoStack(),
            activeFont: 'font-typewriter', // re-synced from settings in SettingsModule.init() → EditorModule.loadNote()
            pendingFont: null, // font style to apply to the NEXT characters typed

            init() {
                this.editorArea = document.getElementById('editorArea');
                this.titleInput = document.getElementById('noteTitleInput');

                // Input Events for Auto-save & Undo Snapshots
                this.editorArea.addEventListener('input', () => {
                    this.onEditorInput();
                    this.scrollCaretIntoView();
                });
                this.titleInput.addEventListener('input', () => this.saveCurrentNote());

                // --- Keyboard-aware viewport fix ---
                // On Android WebView, h-screen/h-full containers keep the full
                // layout-viewport height when the soft keyboard opens (only the
                // visual viewport shrinks), so the browser has no way to know the
                // "kertas" area is actually half-covered and never auto-scrolls the
                // caret into view. We shrink the app container to match the real
                // visible height, then manually keep the caret above the keyboard.
                this.applyViewportHeightFix();
                if (window.visualViewport) {
                    window.visualViewport.addEventListener('resize', () => {
                        this.applyViewportHeightFix();
                        requestAnimationFrame(() => this.scrollCaretIntoView());
                    });
                }

                this.editorArea.addEventListener('focus', () => {
                    // Give the keyboard-open animation time to finish before measuring.
                    setTimeout(() => this.scrollCaretIntoView(), 300);
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

                this.updateFontIndicator();
            },

            // Shrinks #appRoot (and the settings page) to the real visible height
            // reported by visualViewport, instead of the fixed 100vh/h-screen that
            // ignores the on-screen keyboard.
            applyViewportHeightFix() {
                if (!window.visualViewport) return;
                const h = `${window.visualViewport.height}px`;
                const appRoot = document.getElementById('appRoot');
                const settingsModal = document.getElementById('settingsModal');
                // Resize <body> in lockstep with #appRoot. Previously only appRoot
                // was shrunk here while <body> kept its full (keyboard-ignoring)
                // height, so body's own background showed through as a beige/
                // yellow strip below the paper, and it re-flowed on every resize
                // tick (the "loncat-loncat" jump). Keeping both in sync removes
                // the gap entirely.
                document.body.style.height = h;
                if (appRoot) appRoot.style.height = h;
                if (settingsModal) settingsModal.style.height = h;
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
                // Enter) can report an all-zero rect; fall back to the caret's
                // containing element so we still have something to measure.
                if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.bottom === 0) {
                    const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
                    if (node && node.getBoundingClientRect) rect = node.getBoundingClientRect();
                }
                if (!rect || (rect.top === 0 && rect.bottom === 0)) return;

                const vv = window.visualViewport;
                const visibleTop = vv ? vv.offsetTop : 0;
                const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
                const margin = 24; // small buffer so the caret line isn't glued to the edge

                const paperCanvas = document.getElementById('paperCanvas');
                if (rect.bottom > visibleBottom - margin) {
                    paperCanvas.scrollTop += (rect.bottom - (visibleBottom - margin));
                } else if (rect.top < visibleTop + margin) {
                    paperCanvas.scrollTop -= (visibleTop + margin - rect.top);
                }
            },

            loadNote(noteId) {
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

                // Initial Undo Snapshot
                this.undoStack.pushState(this.editorArea.innerHTML, true);
            },

            onEditorInput() {
                this.sanitizeInlineFontSizes();
                this.undoStack.pushState(this.editorArea.innerHTML);
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

            deleteCurrentNote() {
                if (!this.currentNoteId) return;
                let notes = StorageModule.getNotes();
                notes = notes.filter(n => n.id !== this.currentNoteId);
                StorageModule.saveNotes(notes);
                UIModule.showToast('Catatan dihapus');
                NavigationModule.closeEditor();
            }
        };
