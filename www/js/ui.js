// VINOTE — Module: UI (view switching, rendering, toasts, bubble positioning)

        // --- MODULE 7: UI MODULE ---
        const UIModule = {
            bubbleElement: document.getElementById('selectionBubble'),

            // Batch selection state for the notes list ("home") view
            selectionMode: false,
            selectedIds: new Set(),
            longPressTimer: null,
            longPressTriggered: false,

            // Tracks whether we've pushed a history entry for "search bar is
            // focused" / "note title or body has a caret" — see
            // enterSearchFocus/exitSearchFocus and enterTypingFocus/
            // exitTypingFocus below. Mirrors the exact same pushState/back
            // pattern already used for selectionMode, so the Android
            // hardware back button dismisses the keyboard first instead of
            // immediately leaving the search bar / the note.
            searchFocusPushed: false,
            typingFocusPushed: false,
            _searchFocusPending: false,
            _searchFocusTimer: null,
            _typingFocusPending: false,
            _typingFocusTimer: null,

            // Debounce handle for the search filter's animated re-render —
            // see the 'input' listener below for why this exists.
            _searchRenderTimer: null,

            // "Lihat Penuh" (full view) state for the editor — a read-only,
            // chrome-free way to re-read a note: no three-dot menu, no
            // caret/selection. Entered via the dropdown, exited only via
            // the Android hardware back button (see NavigationModule).
            viewModeActive: false,

            enterNoteViewMode() {
                this.viewModeActive = true;
                document.getElementById('editorMoreDropdown').classList.add('hidden');
                document.getElementById('btnEditorMoreMenu').classList.add('hidden');
                this.hideBubble();

                // If a "typing focus" history entry is currently on top (the
                // caret was active a moment ago), REPLACE it with the
                // viewMode entry instead of pushing a new one on top of it —
                // otherwise that entry would be left stranded underneath
                // viewMode and a later back-press would land on it instead
                // of cleanly exiting the note.
                const hadTypingFocus = this.typingFocusPushed;
                this.exitTypingFocus(true); // silent: just clears the flag, no history.back()

                const titleEl = document.getElementById('noteTitleInput');
                const editorEl = document.getElementById('editorArea');
                titleEl.blur();
                editorEl.blur();
                titleEl.readOnly = true;
                editorEl.setAttribute('contenteditable', 'false');

                const method = hadTypingFocus ? 'replaceState' : 'pushState';
                history[method]({ page: 'editor', noteId: EditorModule.currentNoteId, viewMode: true }, '', '#lihat-penuh');
            },

            exitNoteViewMode() {
                this.viewModeActive = false;
                document.getElementById('btnEditorMoreMenu').classList.remove('hidden');

                const titleEl = document.getElementById('noteTitleInput');
                const editorEl = document.getElementById('editorArea');
                titleEl.readOnly = false;
                editorEl.setAttribute('contenteditable', 'true');
            },

            init() {
                this.applyListLayout(StorageModule.getSettings().noteListColumns);
                this.renderNotesList();

                // Button Event Listeners
                document.getElementById('btnNewNote').addEventListener('click', () => {
                    this.morphFabToEditor();
                });

                document.getElementById('btnOpenSettings').addEventListener('click', () => {
                    NavigationModule.openSettings();
                });

                document.getElementById('btnCloseSettings').addEventListener('click', () => {
                    window.history.back();
                });

                document.getElementById('btnDeleteNote').addEventListener('click', () => {
                    document.getElementById('editorMoreDropdown').classList.add('hidden');
                    if (confirm('Apakah Anda yakin ingin menghapus catatan ini?')) {
                        EditorModule.deleteCurrentNote();
                    }
                });

                document.getElementById('btnViewMode').addEventListener('click', () => {
                    this.enterNoteViewMode();
                });

                // Search input filter.
                // Filtering can shrink the list a lot (e.g. from 20 notes
                // down to 1), which shrinks #viewNotesList's scrollHeight.
                // If the user had scrolled down before typing, the browser
                // immediately clamps scrollTop to fit the new, shorter
                // content — which visually looks like the sticky search
                // header "jumped" to a different height/position, when
                // really the whole list just got yanked up underneath it.
                // Snapping back to the top on every keystroke keeps the
                // header rock-steady and matches how search normally
                // behaves (results start from the top anyway).
                const searchInput = document.getElementById('searchInput');
                searchInput.addEventListener('input', (e) => {
                    const value = e.target.value.toLowerCase();
                    // Debounced (120ms) so fast typing doesn't retrigger a
                    // full animated re-render on every single keystroke.
                    // renderNotesList wipes and rebuilds every card
                    // (innerHTML = '') each time it runs — without this,
                    // typing quickly cuts the previous keystroke's FLIP
                    // animation short mid-flight on every new letter, which
                    // is what read as choppy/not-smooth. Waiting a short
                    // beat after the user pauses lets each animation
                    // actually finish before the next one starts.
                    clearTimeout(this._searchRenderTimer);
                    this._searchRenderTimer = setTimeout(() => {
                        this.renderNotesList(value, { animate: true, resetScroll: true });
                    }, 120);
                });

                // Pressing the Android back button while the search bar is
                // focused should just close the keyboard, not leave the
                // search bar or the app.
                searchInput.addEventListener('focus', () => this.enterSearchFocus());
                searchInput.addEventListener('blur', () => this.exitSearchFocus());

                // Same idea for the note editor: back button closes the
                // keyboard/caret first, THEN (on a second press) leaves the
                // note. Moving focus directly between the title and the body
                // (e.g. tapping from one into the other) should NOT count as
                // "closing" — handleTypingBlur waits a tick to check that.
                const titleInputEl = document.getElementById('noteTitleInput');
                const editorAreaEl = document.getElementById('editorArea');
                [titleInputEl, editorAreaEl].forEach(el => {
                    el.addEventListener('focus', () => this.enterTypingFocus());
                    el.addEventListener('blur', () => this.handleTypingBlur());
                });

                // Batch selection controls. There's no dedicated header
                // button to enter selection mode anymore — long-pressing a
                // note card (see attachCardGestures) does that instead —
                // but Cancel/Delete/Pin inside the selection header still work.
                document.getElementById('btnCancelSelect').addEventListener('click', () => this.exitSelectionMode());
                document.getElementById('btnDeleteSelected').addEventListener('click', () => this.deleteSelected());
                document.getElementById('btnPinSelected').addEventListener('click', () => this.togglePinSelected());
                document.getElementById('btnDuplicateSelected').addEventListener('click', () => this.duplicateSelected());

                // Home-screen layout toggle (1 column <-> 2 columns).
                // Purely a display preference for the notes list — has no
                // effect on the editor/canvas. Animated (animate: true) so
                // every card visibly slides/stretches from its old spot
                // into its new column position instead of just popping
                // into the new layout.
                document.getElementById('btnToggleLayout').addEventListener('click', () => {
                    const s = StorageModule.getSettings();
                    s.noteListColumns = s.noteListColumns === 2 ? 1 : 2;
                    StorageModule.saveSettings(s);
                    // Snapshot BEFORE switching layout classes. applyListLayout()
                    // changes the container's grid/column classes synchronously,
                    // which immediately reflows these same card elements into
                    // their NEW positions — snapshotting after that (like
                    // renderNotesList would do on its own) captures the new
                    // layout twice, making dx/dy always ~0 and silently killing
                    // the morph/slide animation between 1-column and 2-column.
                    const prevRects = this.snapshotCardRects();
                    this.applyListLayout(s.noteListColumns);
                    this.renderNotesList(document.getElementById('searchInput').value.toLowerCase(), {
                        animate: true,
                        prevRects,
                        // A bit slower/more pronounced than the search-filter
                        // animation — this is a bigger, more deliberate
                        // reshuffle of the whole grid, so it reads better as
                        // a visible "morph" than a quick snap.
                        duration: 460,
                        // Smoother, slightly slower-building deceleration
                        // than the default FLIP easing — the search-filter
                        // re-render is a small, frequent nudge so it wants a
                        // snappy curve, but a full 1<->2 column reshuffle is
                        // a rarer, bigger move that reads better with a
                        // softer landing.
                        easing: 'cubic-bezier(.32,.72,.35,1)',
                        // 1<->2 column switches don't just nudge each card a
                        // little: multi-column ("masonry") flow fills each
                        // column top-to-bottom BEFORE moving to the next
                        // one, so cards jump to very different spots (and
                        // very different widths) than in the 1-column grid,
                        // not just a short slide. A plain scale-only FLIP
                        // stretches each card's already-reflowed text across
                        // that whole jump, which is what read as "aneh" —
                        // the letters visibly squash/stretch mid-flight
                        // because the text itself didn't actually resize
                        // that way, only the box did. Fading each card down
                        // through the middle of its move (see morphFade in
                        // animateListChanges) hides that mismatch instead of
                        // trying to fully mask it with easing alone.
                        morphFade: true
                    });
                });
            },

            // Toggles the notes/pinned grid between 1 and 2 columns and
            // swaps the header button's icon + title to reflect the
            // CURRENT state (so the icon shown is the layout you're on,
            // not the one you'd switch to — matches how this pattern reads
            // in Office mobile apps).
            //
            // 2-column mode uses a CSS multi-column ("masonry") flow instead
            // of `display: grid` — grid would stretch every card in a row to
            // match the tallest one, so a one-line note would end up just as
            // tall as a long one next to it. Columns let each card keep its
            // own natural, content-sized height instead.
            applyListLayout(columns) {
                const cols = columns === 2 ? 2 : 1;
                const notesContainer = document.getElementById('notesContainer');
                const pinnedContainer = document.getElementById('pinnedContainer');
                [notesContainer, pinnedContainer].forEach(el => {
                    el.classList.remove('grid', 'grid-cols-1', 'grid-cols-2', 'gap-3', 'notes-masonry');
                    if (cols === 2) {
                        el.classList.add('notes-masonry');
                    } else {
                        el.classList.add('grid', 'grid-cols-1', 'gap-3');
                    }
                });

                const btn = document.getElementById('btnToggleLayout');
                const iconSingle = document.getElementById('iconLayoutSingle');
                const iconGrid = document.getElementById('iconLayoutGrid');
                iconSingle.classList.toggle('hidden', cols === 2);
                iconGrid.classList.toggle('hidden', cols !== 2);
                btn.title = cols === 2 ? 'Tampilan 2 kolom (ketuk untuk 1 kolom)' : 'Tampilan 1 kolom (ketuk untuk 2 kolom)';
            },

            // filter: search text (lowercased) to match against title/content.
            // opts.animate: when true, cards that survive the re-render
            //   glide from their previous position/size to the new one
            //   (FLIP technique) instead of just popping into place, cards
            //   that are new fade+scale in, and cards that disappeared get
            //   a fading "ghost" left briefly in their old spot instead of
            //   vanishing instantly. Used for search filtering and layout
            //   switching; left off (default) for routine re-renders
            //   (delete/pin/import/etc.) that don't need the extra work.
            // opts.resetScroll: snaps #viewNotesList back to the top after
            //   rendering — see the search input listener above for why.
            renderNotesList(filter = '', opts = {}) {
                const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                const shouldAnimate = !!opts.animate && !reduceMotion;
                // A caller that already changed the DOM/layout before calling
                // this (e.g. the column-layout toggle above, or a selection
                // action that mutates storage first) can pass its own
                // pre-captured snapshot via opts.prevRects instead of letting
                // this grab one — grabbing it here would already be too late
                // in those cases. Falls back to snapshotting right now for
                // ordinary callers (e.g. search) that haven't touched the DOM yet.
                const prevRects = shouldAnimate ? (opts.prevRects || this.snapshotCardRects()) : null;

                const pinnedSection = document.getElementById('pinnedSection');
                const pinnedContainer = document.getElementById('pinnedContainer');
                const allNotesLabel = document.getElementById('allNotesLabel');
                const container = document.getElementById('notesContainer');
                const emptyState = document.getElementById('emptyState');
                const notes = StorageModule.getNotes();

                pinnedContainer.innerHTML = '';
                container.innerHTML = '';

                const filteredNotes = notes.filter(n => 
                    (n.title && n.title.toLowerCase().includes(filter)) ||
                    (n.content && n.content.toLowerCase().includes(filter))
                );

                if (filteredNotes.length === 0) {
                    emptyState.classList.remove('hidden');
                    pinnedSection.classList.add('hidden');
                    allNotesLabel.classList.add('hidden');
                } else {
                    emptyState.classList.add('hidden');

                    const pinnedNotes = filteredNotes.filter(n => n.pinned);
                    const restNotes = filteredNotes.filter(n => !n.pinned);

                    if (pinnedNotes.length > 0) {
                        pinnedSection.classList.remove('hidden');
                        pinnedNotes.forEach(note => pinnedContainer.appendChild(this.createNoteCard(note)));
                    } else {
                        pinnedSection.classList.add('hidden');
                    }

                    // Only bother labeling "Semua Catatan" when it's sitting below
                    // a Pinned section — otherwise it's the only section on screen
                    // and a label just adds noise.
                    allNotesLabel.classList.toggle('hidden', pinnedNotes.length === 0);

                    restNotes.forEach(note => container.appendChild(this.createNoteCard(note)));
                }

                // Reset scroll BEFORE measuring the "after" rects for the FLIP
                // animation below, so the animation's end state matches where
                // things actually land — resetting scroll AFTER would shift
                // everything again right as the animation finishes.
                if (opts.resetScroll) {
                    document.getElementById('viewNotesList').scrollTop = 0;
                }

                if (prevRects) this.animateListChanges(prevRects, { duration: opts.duration, easing: opts.easing, morphFade: opts.morphFade });
            },

            // Captures the current on-screen position/size of every note
            // card, keyed by note id, so a later re-render can compute how
            // far each surviving card needs to visually travel (FLIP:
            // First-Last-Invert-Play). Returns null when the list isn't
            // actually visible (e.g. mid-editor) — measuring a hidden
            // (display:none) list would just return zeroed-out rects and
            // produce a bogus animation.
            snapshotCardRects() {
                const listView = document.getElementById('viewNotesList');
                if (!listView || listView.classList.contains('hidden')) return null;
                const rects = new Map();
                document.querySelectorAll('#pinnedContainer [data-note-id], #notesContainer [data-note-id]').forEach(el => {
                    rects.set(el.dataset.noteId, el.getBoundingClientRect());
                });
                return rects;
            },

            // Plays the actual FLIP animation given a "before" snapshot from
            // snapshotCardRects(), comparing it against the DOM as it stands
            // right now (the "after" state, already rendered).
            // - Cards present in both: animate the delta between old and new
            //   position/size, from delta -> identity (a genuine move/morph,
            //   not a fade).
            // - Cards only present now (new to the list): fade + scale up
            //   from slightly below their final spot, like settling in.
            // - Cards only present before (removed by the filter, or
            //   deleted/pinned-away elsewhere): a short-lived "ghost" element
            //   is placed over their old screen position and faded out,
            //   since the real element is already gone from the DOM by the
            //   time this runs and can't be animated directly.
            // opts.duration: base duration (ms) for the move/morph animation.
            // Entrance and exit (ghost) durations scale off this one number
            // so every part of one re-render feels like it belongs to the
            // same motion instead of three animations with unrelated timings.
            animateListChanges(prevRects, opts = {}) {
                if (!prevRects) return;
                const duration = opts.duration || 340;
                // A standard "ease-out" material-style curve — decelerates
                // smoothly into the resting position instead of the old
                // curve's slightly harder snap at the end, which is what
                // made back-to-back renders (e.g. fast typing) feel a bit
                // jerky rather than fluid. Callers with a bigger, rarer
                // reshuffle (e.g. the column-layout toggle) can pass their
                // own softer curve instead.
                const easing = opts.easing || 'cubic-bezier(.25,.8,.25,1)';
                // See the column-layout toggle handler above for why this
                // exists: a plain scale-only FLIP looks fine for small
                // nudges (search filtering) but visibly distorts text when
                // a card jumps to a very different position AND width at
                // once, which is what 1<->2 column switches do.
                const morphFade = !!opts.morphFade;
                const currentEls = document.querySelectorAll('#pinnedContainer [data-note-id], #notesContainer [data-note-id]');
                const currentIds = new Set();

                currentEls.forEach(el => {
                    const id = el.dataset.noteId;
                    currentIds.add(id);
                    const prev = prevRects.get(id);
                    const curr = el.getBoundingClientRect();

                    if (prev) {
                        const dx = prev.left - curr.left;
                        const dy = prev.top - curr.top;
                        const sx = curr.width ? prev.width / curr.width : 1;
                        const sy = curr.height ? prev.height / curr.height : 1;
                        const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
                        const resized = Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02;
                        if (moved || resized) {
                            if (morphFade) {
                                // Dip opacity through the midpoint of the
                                // move instead of holding it at 1 the whole
                                // time. The card is most visibly "wrong"
                                // (its real, already-reflowed text being
                                // stretched by a box scale that doesn't
                                // match how that text actually re-wrapped)
                                // right around the middle of the animation —
                                // fading it down there hides the mismatch,
                                // then it fades back up once it's settled
                                // into its real new size/position, where the
                                // text is correct again.
                                el.animate([
                                    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 1 },
                                    { transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) scale(${(sx + 1) / 2}, ${(sy + 1) / 2})`, opacity: 0.28, offset: 0.5 },
                                    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 }
                                ], { duration, easing, fill: 'both' });
                            } else {
                                el.animate([
                                    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                                    { transform: 'translate(0px, 0px) scale(1, 1)' }
                                ], { duration, easing, fill: 'both' });
                            }
                        }
                    } else {
                        el.animate([
                            { opacity: 0, transform: 'scale(0.92) translateY(10px)' },
                            { opacity: 1, transform: 'scale(1) translateY(0)' }
                        ], { duration: Math.round(duration * 0.8), easing, fill: 'both' });
                    }
                });

                prevRects.forEach((rect, id) => {
                    if (currentIds.has(id)) return;
                    const ghostDuration = Math.round(duration * 0.7);
                    const ghost = document.createElement('div');
                    ghost.setAttribute('aria-hidden', 'true');
                    ghost.style.cssText = `position:fixed; left:${rect.left}px; top:${rect.top}px; ` +
                        `width:${rect.width}px; height:${rect.height}px; margin:0; pointer-events:none; ` +
                        `z-index:25; background-color:${SettingsModule.getPaperColor()}; ` +
                        `border-radius:10px; border:1px solid #ddcbb0;`;
                    document.body.appendChild(ghost);
                    const anim = ghost.animate([
                        { opacity: 1, transform: 'scale(1) translateY(0)' },
                        { opacity: 0, transform: 'scale(0.94) translateY(6px)' }
                    ], { duration: ghostDuration, easing: 'ease-out' });
                    const cleanup = () => ghost.remove();
                    if (anim.finished && anim.finished.then) anim.finished.then(cleanup).catch(cleanup);
                    setTimeout(cleanup, ghostDuration + 150);
                });
            },

            // Builds a single note card, wired for both the normal "tap to
            // open" flow and the long-press-to-select / tap-to-toggle flow
            // used while batch selection mode is active.
            createNoteCard(note) {
                const isSelected = this.selectedIds.has(note.id);

                const card = document.createElement('div');
                // Background color is set inline (not via a Tailwind class) so it
                // always matches the actual paper color used in the editor —
                // that's what makes the open/close morph look like the card is
                // really stretching into the page instead of just a generic
                // animated rectangle. Everything ELSE about the card (border,
                // font, badges) is the new flat Office-Mobile style — only the
                // morph-target background color still has to match the editor.
                card.className = `office-card-note font-ui-modern p-4 flex flex-col justify-between cursor-pointer relative select-none ${isSelected ? 'note-card-ring' : ''}`;
                card.style.backgroundColor = SettingsModule.getPaperColor();
                card.dataset.noteId = note.id;

                // Strip HTML tags for clean card preview
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = note.content || '';
                const plainText = tempDiv.textContent || tempDiv.innerText || 'Tidak ada teks...';

                // NOTE: these badges/text use the fixed .note-card-* CSS
                // classes (not text-office-*/bg-office-*/border-office-*)
                // on purpose — the card always previews the note's own
                // light "paper" fill, so its own contents need fixed
                // colors too, or they'd sit light-on-light against that
                // paper. See the comment on .office-card-note in
                // styles.css for the full reasoning.
                const pinBadge = note.pinned ? `
                    <div class="absolute top-2 right-2 w-5 h-5 note-card-pin-flag text-white rounded-sm flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6z"/></svg>
                    </div>` : '';

                const selectionDot = this.selectionMode ? `
                    <div class="w-5 h-5 mt-0.5 rounded-sm note-card-dot flex items-center justify-center shrink-0 ${isSelected ? 'note-card-dot-checked' : ''}">
                        ${isSelected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
                    </div>` : '';

                // Both the title and the body preview clamp to a LINE COUNT
                // that grows a little with how much text is actually there,
                // instead of a single fixed clamp for every card — that's
                // what makes a one-line "Beli susu" note render as a short,
                // compact card while a longer note renders as a visibly
                // taller one. Kept deliberately modest (title caps at 2,
                // body caps at 4) so a huge note still looks like a
                // reasonably-sized card next to the others, not the
                // near-uncapped wall of text a too-generous cap produced.
                //
                // Applied as an inline -webkit-line-clamp style rather than
                // a dynamic Tailwind class (line-clamp-${n}) — Tailwind's
                // Play CDN build only reliably generates CSS for utility
                // classes it can see, and a class name assembled at runtime
                // from a template literal isn't guaranteed to be picked up,
                // which is what let these previews render fully unclamped
                // instead of actually being limited. The inline style has
                // no such dependency.
                const titleClamp = this.pickClampLines(note.title || '', [26], 2);
                const bodyClamp = this.pickClampLines(plainText, [55, 120, 200], 4);
                const clampStyle = (n) => `style="display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:${n}; overflow:hidden;"`;

                card.innerHTML = `
                    ${pinBadge}
                    <div class="flex items-start gap-2">
                        ${selectionDot}
                        <div class="min-w-0 flex-1">
                            <h2 class="text-sm font-semibold note-card-title-text note-card-divider-b pb-1 mb-2" ${clampStyle(titleClamp)}>${this.escapeHtml(note.title)}</h2>
                            <p class="text-xs note-card-muted-text mb-3" ${clampStyle(bodyClamp)}>${this.escapeHtml(plainText)}</p>
                        </div>
                    </div>
                    <div class="flex justify-between items-center text-[10px] note-card-muted-text pt-2 note-card-divider-t">
                        <span>${note.updatedAt || ''}</span>
                        <span class="font-semibold uppercase tracking-wider note-card-accent-text">${this.selectionMode ? '' : 'Buka &rarr;'}</span>
                    </div>
                `;

                this.attachCardGestures(card, note.id);
                return card;
            },

            // Picks a line-clamp count (1..maxLines) for a piece of text
            // given a set of ascending character-length thresholds — e.g.
            // thresholds [55, 120, 200] with maxLines 4 means: under 55
            // chars -> clamp 1, under 120 -> clamp 2, under 200 -> clamp 3,
            // at or past that -> clamp 4. Kept as a small shared helper
            // (rather than inlined twice) since both the title and the body
            // preview in createNoteCard use the same "more text -> a few
            // more visible lines, up to a cap" logic.
            pickClampLines(text, thresholds, maxLines) {
                const len = (text || '').trim().length;
                for (let i = 0; i < thresholds.length; i++) {
                    if (len <= thresholds[i]) return i + 1;
                }
                return maxLines;
            },

            // Wires a card for: tap-to-open (default), tap-to-toggle
            // (selection mode), and long-press-to-enter-selection-mode
            // (from either state). Uses Pointer Events so it works
            // uniformly across touch and mouse.
            attachCardGestures(card, noteId) {
                const cancelLongPress = () => clearTimeout(this.longPressTimer);

                card.addEventListener('pointerdown', (e) => {
                    if (e.button !== undefined && e.button !== 0) return;
                    this.longPressTriggered = false;
                    this.longPressTimer = setTimeout(() => {
                        this.longPressTriggered = true;
                        if (navigator.vibrate) navigator.vibrate(15);
                        if (!this.selectionMode) this.enterSelectionMode();
                        this.toggleNoteSelection(noteId);
                    }, 480);
                });
                card.addEventListener('pointerup', cancelLongPress);
                card.addEventListener('pointerleave', cancelLongPress);
                card.addEventListener('pointermove', cancelLongPress);
                card.addEventListener('pointercancel', cancelLongPress);

                card.addEventListener('click', () => {
                    // Swallow the synthetic click that follows a long-press
                    // so it doesn't also toggle selection a second time.
                    if (this.longPressTriggered) {
                        this.longPressTriggered = false;
                        return;
                    }
                    if (this.selectionMode) {
                        this.toggleNoteSelection(noteId);
                    } else {
                        this.morphCardToEditor(card, noteId);
                    }
                });
            },

            // Animates the REAL #viewEditor element itself — header, paper
            // and note content included — from the clicked card's on-screen
            // position/size up to fill the whole viewport, using the Web
            // Animations API instead of manual transitions. Only `transform`
            // (on viewEditor) and `opacity` (on the title/body) are ever
            // animated — both are GPU-composited and never force the browser
            // to re-layout/repaint the note's text on every frame, which is
            // what was causing the flicker/stiffness/jumping with the old
            // border+shadow+radius CSS-transition version. The opacity
            // keyframes have an offset so the content stays invisible for
            // the first chunk of the stretch, then fades in while the view
            // is still growing — it materializes mid-motion, not after.
            morphCardToEditor(cardEl, noteId) {
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    NavigationModule.openEditor(noteId);
                    return;
                }

                const rect = cardEl.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const viewEditor = document.getElementById('viewEditor');
                const titleEl = document.getElementById('noteTitleInput');
                const editorEl = document.getElementById('editorArea');
                const DURATION = 380;

                // Unhide FIRST, then load — autoSizeTitle() (called from
                // loadNote) needs the title textarea actually laid out to
                // read a real scrollHeight; while viewEditor is still
                // display:none it would measure 0 and size the title box
                // wrong for the whole rest of this session with the note.
                viewEditor.style.transformOrigin = 'top left';
                viewEditor.style.willChange = 'transform';
                viewEditor.classList.remove('hidden');

                EditorModule.loadNote(noteId);

                const stretchAnim = viewEditor.animate([
                    { transform: `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / vw}, ${rect.height / vh})` },
                    { transform: 'translate(0px, 0px) scale(1, 1)' }
                ], { duration: DURATION, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' });

                const contentAnims = [titleEl, editorEl].map(el => el.animate([
                    { opacity: 0, offset: 0 },
                    { opacity: 0, offset: 0.4 },
                    { opacity: 1, offset: 1 }
                ], { duration: DURATION, easing: 'ease-out', fill: 'forwards' }));

                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    // Cancel the animations (rather than just clearing inline
                    // styles) so their held effect actually releases back to
                    // the normal stylesheet-driven state, with no visible jump
                    // since the end keyframes already match that state.
                    stretchAnim.cancel();
                    contentAnims.forEach(a => a.cancel());
                    viewEditor.style.transformOrigin = '';
                    viewEditor.style.willChange = '';
                    NavigationModule.activeView = 'editor';
                    const method = this.collapseTransientFocusState() ? 'replaceState' : 'pushState';
                    history[method]({ page: 'editor', noteId }, '', '#editor');
                    document.getElementById('viewNotesList').classList.add('hidden');
                };
                stretchAnim.finished.then(finish).catch(finish);
                setTimeout(finish, DURATION + 120); // safety net if 'finished' never resolves
            },

            // Same technique as morphCardToEditor, sourced from the "+" FAB
            // instead of an existing card — a brand new note has no card
            // yet to morph from, but it should still open with the same
            // "stretching into the page" motion instead of just popping
            // into view like a plain view-switch would. morphEditorToCard
            // mirrors this on the way back out (it lands back on the FAB
            // itself when the new note was left empty and never actually
            // saved — see the fallback there), so opening and closing a
            // fresh note reads as one continuous morph in and back out of
            // the same button.
            morphFabToEditor() {
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    NavigationModule.openEditor(null);
                    return;
                }

                const fab = document.getElementById('btnNewNote');
                const rect = fab.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const viewEditor = document.getElementById('viewEditor');
                const titleEl = document.getElementById('noteTitleInput');
                const editorEl = document.getElementById('editorArea');
                const DURATION = 380;

                // Unhide first, then load — see the same reordering (and
                // why) in morphCardToEditor above.
                viewEditor.style.transformOrigin = 'top left';
                viewEditor.style.willChange = 'transform';
                viewEditor.classList.remove('hidden');

                EditorModule.loadNote(null);

                const stretchAnim = viewEditor.animate([
                    { transform: `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / vw}, ${rect.height / vh})` },
                    { transform: 'translate(0px, 0px) scale(1, 1)' }
                ], { duration: DURATION, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' });

                const contentAnims = [titleEl, editorEl].map(el => el.animate([
                    { opacity: 0, offset: 0 },
                    { opacity: 0, offset: 0.4 },
                    { opacity: 1, offset: 1 }
                ], { duration: DURATION, easing: 'ease-out', fill: 'forwards' }));

                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    stretchAnim.cancel();
                    contentAnims.forEach(a => a.cancel());
                    viewEditor.style.transformOrigin = '';
                    viewEditor.style.willChange = '';
                    NavigationModule.activeView = 'editor';
                    const method = this.collapseTransientFocusState() ? 'replaceState' : 'pushState';
                    history[method]({ page: 'editor', noteId: null }, '', '#editor');
                    document.getElementById('viewNotesList').classList.add('hidden');
                };
                stretchAnim.finished.then(finish).catch(finish);
                setTimeout(finish, DURATION + 120);
            },

            // The reverse of morphCardToEditor: shrinks the real #viewEditor
            // (header, paper and content together) back down onto the note's
            // card once it's visible again in the list, again using only
            // transform + opacity for a jank-free animation. Uses an
            // "accelerate" easing (fast finish) since that reads more
            // naturally for something shrinking away than the "decelerate"
            // curve used for opening. The title/body fade out early in the
            // shrink so the text is gone well before the box gets small, and
            // the box itself only starts fading its own opacity in the very
            // last stretch (78%→100%) — right as it reaches the target
            // card's exact position/size — so hiding it at the end reveals
            // the real card (with its own border/shadow) as a soft dissolve
            // instead of a hard, mismatched pop.
            morphEditorToCard(noteId) {
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    this.showNotesListView();
                    return;
                }

                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const viewEditor = document.getElementById('viewEditor');
                const titleEl = document.getElementById('noteTitleInput');
                const editorEl = document.getElementById('editorArea');
                const DURATION = 340;

                // Reveal the list underneath right away (without hiding the
                // editor yet) so there's a target card to shrink onto.
                document.getElementById('viewNotesList').classList.remove('hidden');
                this.renderNotesList();

                const targetCard = noteId ? document.querySelector(`[data-note-id="${noteId}"]`) : null;
                let targetRect = null;
                if (targetCard) {
                    targetCard.scrollIntoView({ block: 'nearest' });
                    targetRect = targetCard.getBoundingClientRect();
                } else {
                    // No card to land on — most commonly a brand-new note
                    // opened via morphFabToEditor and then left empty
                    // (EditorModule.saveCurrentNote never persists an empty
                    // note, so it never gets a card). Collapse back onto the
                    // "+" button itself instead of just fading the whole
                    // view out, so the open-from-FAB and close-back-to-FAB
                    // motions match — one continuous morph in, same morph
                    // back out.
                    const fab = document.getElementById('btnNewNote');
                    if (fab && !fab.classList.contains('hidden')) {
                        targetRect = fab.getBoundingClientRect();
                    }
                }

                viewEditor.style.transformOrigin = 'top left';
                viewEditor.style.willChange = 'transform';

                const stretchAnim = targetRect
                    ? viewEditor.animate([
                        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 0 },
                        { transform: `translate(${targetRect.left}px, ${targetRect.top}px) scale(${targetRect.width / vw}, ${targetRect.height / vh})`, opacity: 1, offset: 0.78 },
                        { transform: `translate(${targetRect.left}px, ${targetRect.top}px) scale(${targetRect.width / vw}, ${targetRect.height / vh})`, opacity: 0, offset: 1 }
                    ], { duration: DURATION, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
                    // Card isn't on screen (filtered out by search, or
                    // scrolled far away) — just fade the whole view out.
                    : viewEditor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION, easing: 'ease', fill: 'forwards' });

                const contentAnims = [titleEl, editorEl].map(el => el.animate([
                    { opacity: 1, offset: 0 },
                    { opacity: 0, offset: 0.4 },
                    { opacity: 0, offset: 1 }
                ], { duration: DURATION, easing: 'ease-in', fill: 'forwards' }));

                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    // Hide FIRST: cancel() snaps transform/opacity back to
                    // their un-animated defaults (fullscreen, fully opaque)
                    // for an instant before any inline cleanup lands. Adding
                    // .hidden (display:none) first takes the element out of
                    // the render tree entirely, so that revert — however
                    // briefly it exists — is never actually painted. This is
                    // what was showing up as the header content "popping in"
                    // right at the end of the close animation.
                    viewEditor.classList.add('hidden');
                    stretchAnim.cancel();
                    contentAnims.forEach(a => a.cancel());
                    viewEditor.style.transformOrigin = '';
                    viewEditor.style.willChange = '';
                };
                stretchAnim.finished.then(finish).catch(finish);
                setTimeout(finish, DURATION + 120);
            },

            // --- Search bar: back button closes it before leaving the screen ---
            //
            // The pushState below is deliberately delayed until AFTER the
            // on-screen keyboard's open animation has settled (350ms, same
            // ballpark as EditorModule's own keyboard-aware scroll timing).
            // Pushing a history entry the INSTANT the input focuses —
            // exactly when the keyboard starts animating in and the
            // viewport is resizing — was fighting with that resize and is
            // what caused the screen to jump/blink. The short delay costs
            // nothing visible; the keyboard is still opening anyway.
            enterSearchFocus() {
                if (this.searchFocusPushed || this._searchFocusPending) return;
                this._searchFocusPending = true;
                clearTimeout(this._searchFocusTimer);
                this._searchFocusTimer = setTimeout(() => {
                    this._searchFocusPending = false;
                    if (document.activeElement === document.getElementById('searchInput')) {
                        this.searchFocusPushed = true;
                        history.pushState({ mode: 'searchFocus' }, '', '#search');
                    }
                }, 350);
            },

            // fromPopState is true when this was called because the
            // "#search" history entry was just popped (hardware back
            // button) — in that case the stack is already correct and we
            // must NOT pop it again. Otherwise (search naturally loses
            // focus because the user tapped elsewhere) we pop it ourselves,
            // matching the same convention exitSelectionMode uses below.
            exitSearchFocus(fromPopState = false) {
                clearTimeout(this._searchFocusTimer);
                this._searchFocusPending = false;
                if (!this.searchFocusPushed) return;
                this.searchFocusPushed = false;
                document.getElementById('searchInput').blur();
                if (fromPopState) return;
                // Deferred: if this blur happened because the user tapped
                // straight into another screen (e.g. a note card or the
                // Settings button), that tap's own navigation may still be
                // about to push its own history entry. Waiting a tick lets
                // that happen first, so we only pop the leftover "#search"
                // entry if nothing else already took its place.
                setTimeout(() => {
                    if (history.state && history.state.mode === 'searchFocus') {
                        history.back();
                    }
                }, 0);
            },

            // --- Note title/body: back button closes the caret/keyboard
            // before leaving the note ---
            //
            // Same delayed-push reasoning as enterSearchFocus above — this
            // is the exact focus event that opens the keyboard over the
            // note editor, so the pushState is deferred past the keyboard's
            // open animation instead of firing in the same instant as it.
            enterTypingFocus() {
                if (this.typingFocusPushed || this._typingFocusPending) return;
                this._typingFocusPending = true;
                clearTimeout(this._typingFocusTimer);
                this._typingFocusTimer = setTimeout(() => {
                    this._typingFocusPending = false;
                    const active = document.activeElement;
                    const titleEl = document.getElementById('noteTitleInput');
                    const editorEl = document.getElementById('editorArea');
                    if (active === titleEl || active === editorEl) {
                        this.typingFocusPushed = true;
                        history.pushState({ mode: 'typingFocus' }, '', '#typing');
                    }
                }, 350);
            },

            exitTypingFocus(fromPopState = false) {
                clearTimeout(this._typingFocusTimer);
                this._typingFocusPending = false;
                if (!this.typingFocusPushed) return;
                this.typingFocusPushed = false;
                document.getElementById('noteTitleInput').blur();
                document.getElementById('editorArea').blur();
                if (fromPopState) return;
                setTimeout(() => {
                    if (history.state && history.state.mode === 'typingFocus') {
                        history.back();
                    }
                }, 0);
            },

            // Runs a tick after title/body blurs. Waiting lets us tell a
            // genuine "user left both fields" apart from focus simply
            // hopping from the title straight into the body (or vice versa),
            // which should keep the typing-focus state active.
            handleTypingBlur() {
                setTimeout(() => {
                    const active = document.activeElement;
                    const titleEl = document.getElementById('noteTitleInput');
                    const editorEl = document.getElementById('editorArea');
                    if (active !== titleEl && active !== editorEl) {
                        this.exitTypingFocus();
                    }
                }, 0);
            },

            // Call this right before intentionally pushing a new "page"
            // history entry (opening the editor, opening Settings). If the
            // search bar or note caret currently has a transient focus
            // entry on top of the stack, this clears it — the caller should
            // then use history.replaceState instead of pushState, so that
            // entry gets overwritten in place instead of left stranded
            // underneath the new page (which would otherwise need an extra,
            // invisible back-press to get past later).
            collapseTransientFocusState() {
                if (this.searchFocusPushed) {
                    this.searchFocusPushed = false;
                    document.getElementById('searchInput').blur();
                    return true;
                }
                if (this.typingFocusPushed) {
                    this.typingFocusPushed = false;
                    document.getElementById('noteTitleInput').blur();
                    document.getElementById('editorArea').blur();
                    return true;
                }
                return false;
            },

            enterSelectionMode() {
                if (this.selectionMode) return;
                this.selectionMode = true;
                // Push a dedicated history entry so the hardware/browser back
                // button has something of ours to pop first, instead of
                // falling straight through to whatever was open before this
                // page (which is what was making back exit the app). If the
                // search bar happened to have focus a moment ago (long-press
                // can start while search is focused), replace that entry
                // instead of stacking on top of it.
                const method = this.collapseTransientFocusState() ? 'replaceState' : 'pushState';
                history[method]({ mode: 'selection' }, '', '#select');
                document.getElementById('headerDefault').classList.add('hidden');
                document.getElementById('headerSelection').classList.remove('hidden');
                document.getElementById('headerSelection').classList.add('flex');
                document.getElementById('btnNewNote').classList.add('hidden');
                this.updateSelectionHeader();
                this.renderNotesList(document.getElementById('searchInput').value.toLowerCase());
            },

            // fromPopState is true when this was called because the "#select"
            // history entry was just popped (hardware back button) — in that
            // case the history stack is already correct and we must NOT pop
            // it again. In every other case (Cancel button, delete/pin
            // finishing, deselecting the last item) we pop it ourselves so a
            // second back-press later doesn't land on a stale, invisible entry.
            // renderOpts is forwarded straight to renderNotesList — deleteSelected/
            // duplicateSelected/togglePinSelected pass { animate: true, prevRects }
            // here (prevRects captured by them BEFORE they mutated storage) so the
            // re-render this triggers actually slides/morphs the surviving cards
            // into their new spots instead of just popping into place.
            exitSelectionMode(fromPopState = false, renderOpts = {}) {
                if (!this.selectionMode) return;
                this.selectionMode = false;
                this.selectedIds.clear();
                document.getElementById('headerSelection').classList.add('hidden');
                document.getElementById('headerSelection').classList.remove('flex');
                document.getElementById('headerDefault').classList.remove('hidden');
                document.getElementById('btnNewNote').classList.remove('hidden');
                this.renderNotesList(document.getElementById('searchInput').value.toLowerCase(), renderOpts);

                if (!fromPopState && history.state && history.state.mode === 'selection') {
                    history.back();
                }
            },

            toggleNoteSelection(noteId) {
                if (this.selectedIds.has(noteId)) this.selectedIds.delete(noteId);
                else this.selectedIds.add(noteId);

                // Deselecting the last item exits selection mode, matching
                // the behavior people already know from Google Keep/Photos.
                if (this.selectionMode && this.selectedIds.size === 0) {
                    this.exitSelectionMode();
                    return;
                }

                this.updateSelectionHeader();
                this.renderNotesList(document.getElementById('searchInput').value.toLowerCase());
            },

            updateSelectionHeader() {
                const count = this.selectedIds.size;
                document.getElementById('selectionCount').textContent = `${count} dipilih`;
                document.getElementById('btnPinSelected').classList.toggle('opacity-40', count === 0);
                document.getElementById('btnDuplicateSelected').classList.toggle('opacity-40', count === 0);
                document.getElementById('btnDeleteSelected').classList.toggle('opacity-40', count === 0);
            },

            deleteSelected() {
                if (this.selectedIds.size === 0) return;
                const count = this.selectedIds.size;
                if (!confirm(`Hapus ${count} catatan terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;

                // Snapshot BEFORE removing the notes from storage — the
                // deleted cards are still on screen in their real positions
                // right now; exitSelectionMode()'s re-render below is what
                // actually drops them, so "before" has to be captured here.
                const prevRects = this.snapshotCardRects();

                let notes = StorageModule.getNotes();
                notes = notes.filter(n => !this.selectedIds.has(n.id));
                StorageModule.saveNotes(notes);

                this.showToast(`${count} catatan dihapus`);
                this.exitSelectionMode(false, { animate: true, prevRects });
            },

            // Duplicates every selected note as an independent copy (new id,
            // "(Salinan)" suffix on the title, freshly stamped created/updated
            // dates, never carries the pin over so the Pinned section doesn't
            // silently fill up with duplicates). Each copy is inserted right
            // after its own original in storage order, instead of all of them
            // landing at the very top, so a duplicated note stays next to the
            // note it came from.
            duplicateSelected() {
                if (this.selectedIds.size === 0) return;
                const count = this.selectedIds.size;

                // See deleteSelected() above for why this has to happen
                // before storage is mutated.
                const prevRects = this.snapshotCardRects();

                let notes = StorageModule.getNotes();
                const now = new Date().toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric'
                });

                // Snapshot the originals BEFORE mutating notes — inserting
                // duplicates shifts array indices, so looking up each
                // original's position has to happen fresh per iteration
                // against the array as it grows (see splice below), not off
                // a stale index computed up front.
                const originalIds = Array.from(this.selectedIds);
                originalIds.forEach((id, i) => {
                    const originalIndex = notes.findIndex(n => n.id === id);
                    if (originalIndex === -1) return;
                    const original = notes[originalIndex];
                    const duplicate = {
                        ...original,
                        // Timestamp alone can collide when several notes are
                        // duplicated in the same synchronous loop (Date.now()
                        // won't have ticked between iterations) — the index
                        // suffix guarantees uniqueness even then.
                        id: `note_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
                        title: `${original.title} (Salinan)`,
                        pinned: false,
                        createdAt: now,
                        updatedAt: now
                    };
                    notes.splice(originalIndex + 1, 0, duplicate);
                });

                StorageModule.saveNotes(notes);
                this.showToast(count === 1 ? 'Catatan digandakan' : `${count} catatan digandakan`);
                this.exitSelectionMode(false, { animate: true, prevRects });
            },

            togglePinSelected() {
                if (this.selectedIds.size === 0) return;

                // See deleteSelected() above for why this has to happen
                // before storage is mutated. Pinning also moves a card
                // between #notesContainer and #pinnedContainer — since
                // snapshotCardRects()/animateListChanges track cards by note
                // id across BOTH containers, this same mechanism naturally
                // produces a slide from the old spot to the new section
                // instead of the card just popping into the Pinned list.
                const prevRects = this.snapshotCardRects();

                let notes = StorageModule.getNotes();
                const selectedNotes = notes.filter(n => this.selectedIds.has(n.id));
                const allAlreadyPinned = selectedNotes.every(n => n.pinned);

                notes = notes.map(n => this.selectedIds.has(n.id) ? { ...n, pinned: !allAlreadyPinned } : n);
                StorageModule.saveNotes(notes);

                this.showToast(allAlreadyPinned ? 'Sematan dilepas' : 'Catatan disematkan');
                this.exitSelectionMode(false, { animate: true, prevRects });
            },

            showEditorView(noteId) {
                document.getElementById('viewNotesList').classList.add('hidden');
                document.getElementById('viewEditor').classList.remove('hidden');

                // Always open a note in normal (editable, chrome-visible)
                // mode, never carried over in "Lihat Penuh" state.
                if (this.viewModeActive) this.exitNoteViewMode();

                const titleEl = document.getElementById('noteTitleInput');
                const editorEl = document.getElementById('editorArea');

                // Start invisible, load the note's content while it's still
                // invisible, then fade it in on the next frame. Without this,
                // the title/body pop in instantly the moment the view is
                // unhidden — this makes it a smooth fade instead of a blink.
                titleEl.style.opacity = '0';
                editorEl.style.opacity = '0';

                EditorModule.loadNote(noteId);

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        titleEl.style.opacity = '1';
                        editorEl.style.opacity = '1';
                        // Now that #paperCanvas/#editorArea are actually
                        // laid out and visible, the measurement this needs
                        // (getBoundingClientRect) is meaningful — it was
                        // skipped earlier if this ran while the view was
                        // still hidden (e.g. on app init).
                        SettingsModule.syncRuledLineAlignment();
                    });
                });
            },

            showNotesListView() {
                document.getElementById('viewEditor').classList.add('hidden');
                document.getElementById('viewNotesList').classList.remove('hidden');

                this.renderNotesList();
            },

            toggleModal(modalId, show) {
                const modal = document.getElementById(modalId);
                if (show) modal.classList.remove('hidden');
                else modal.classList.add('hidden');
            },

            positionBubble(rect) {
                const bubble = this.bubbleElement;
                // Only touch classList when it's actually changing state.
                // Tailwind's CDN build watches the DOM and rebuilds its whole
                // stylesheet on class-attribute mutations, so toggling a
                // class every single call (even to the same value) adds
                // needless work right in the middle of a drag-select gesture.
                if (bubble.classList.contains('hidden')) {
                    bubble.classList.remove('hidden');
                }

                const margin = 10;
                const bubbleWidth = bubble.offsetWidth;
                const viewportWidth = window.innerWidth;

                // Decide horizontal anchor based on where the selection sits on screen,
                // instead of always centering, so the bubble never gets cut off at the edges.
                const nearLeftEdge = rect.left < viewportWidth * 0.25;
                const nearRightEdge = rect.right > viewportWidth * 0.75;

                let left;
                if (nearLeftEdge && !nearRightEdge) {
                    // Selection starts near the left edge: keep the bubble's left edge
                    // aligned with the selection and let it extend rightward.
                    left = rect.left;
                } else if (nearRightEdge && !nearLeftEdge) {
                    // Selection ends near the right edge: keep the bubble's right edge
                    // aligned with the selection and let it extend leftward.
                    left = rect.right - bubbleWidth;
                } else {
                    // Otherwise, center the bubble over the selection as before.
                    left = rect.left + (rect.width / 2) - (bubbleWidth / 2);
                }

                // Safety clamp so it always stays fully inside the viewport.
                left = Math.min(viewportWidth - bubbleWidth - margin, Math.max(margin, left));
                const top = Math.max(margin, rect.top + window.scrollY - bubble.offsetHeight - 8);

                bubble.style.top = `${top}px`;
                bubble.style.left = `${left}px`;
            },

            hideBubble() {
                if (!this.bubbleElement.classList.contains('hidden')) {
                    this.bubbleElement.classList.add('hidden');
                }
            },

            showToast(message) {
                const toast = document.getElementById('toast');
                document.getElementById('toastMessage').textContent = message;
                toast.classList.remove('hidden');
                setTimeout(() => {
                    toast.classList.add('hidden');
                }, 2200);
            },

            escapeHtml(str) {
                return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            }
        };
