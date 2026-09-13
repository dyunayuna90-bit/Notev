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
                    NavigationModule.openEditor(null);
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
                    this.renderNotesList(e.target.value.toLowerCase());
                    document.getElementById('viewNotesList').scrollTop = 0;
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

                // Home-screen layout toggle (1 column <-> 2 columns).
                // Purely a display preference for the notes list — has no
                // effect on the editor/canvas.
                document.getElementById('btnToggleLayout').addEventListener('click', () => {
                    this.switchListLayout();
                });

                document.getElementById('btnCopySelected').addEventListener('click', () => this.duplicateSelected());
            },

            // Swaps the 1-/2-column layout with a brief crossfade instead
            // of an instant reflow: fade the two containers out, swap the
            // column classes + rebuild the cards while invisible, then fade
            // back in. The cards' own .note-card-enter animation (applied
            // fresh by createNoteCard on every rebuild) does the actual
            // "coming in" motion; this wrapper just hides the jarring
            // in-between reflow frame so the two effects read as one
            // smooth transition rather than a hard jump cut.
            switchListLayout() {
                const notesContainer = document.getElementById('notesContainer');
                const pinnedContainer = document.getElementById('pinnedContainer');
                const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

                const applyNewLayout = () => {
                    const s = StorageModule.getSettings();
                    s.noteListColumns = s.noteListColumns === 2 ? 1 : 2;
                    StorageModule.saveSettings(s);
                    this.applyListLayout(s.noteListColumns);
                    this.renderNotesList(document.getElementById('searchInput').value.toLowerCase());
                    notesContainer.classList.remove('notes-layout-fading');
                    pinnedContainer.classList.remove('notes-layout-fading');
                };

                if (reduceMotion) {
                    applyNewLayout();
                    return;
                }

                notesContainer.classList.add('notes-layout-fading');
                pinnedContainer.classList.add('notes-layout-fading');
                setTimeout(applyNewLayout, 120);
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

            renderNotesList(filter = '') {
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
                    return;
                } else {
                    emptyState.classList.add('hidden');
                }

                const pinnedNotes = filteredNotes.filter(n => n.pinned);
                const restNotes = filteredNotes.filter(n => !n.pinned);

                // A single running counter across BOTH sections, so the
                // entrance-animation stagger (see createNoteCard) reads as
                // one continuous cascade down the screen instead of
                // restarting at the top of "Semua Catatan".
                let renderIndex = 0;

                if (pinnedNotes.length > 0) {
                    pinnedSection.classList.remove('hidden');
                    pinnedNotes.forEach(note => pinnedContainer.appendChild(this.createNoteCard(note, renderIndex++)));
                } else {
                    pinnedSection.classList.add('hidden');
                }

                // Only bother labeling "Semua Catatan" when it's sitting below
                // a Pinned section — otherwise it's the only section on screen
                // and a label just adds noise.
                allNotesLabel.classList.toggle('hidden', pinnedNotes.length === 0);

                restNotes.forEach(note => container.appendChild(this.createNoteCard(note, renderIndex++)));
            },

            // Builds a single note card, wired for both the normal "tap to
            // open" flow and the long-press-to-select / tap-to-toggle flow
            // used while batch selection mode is active.
            createNoteCard(note, index = 0) {
                const isSelected = this.selectedIds.has(note.id);

                const card = document.createElement('div');
                // Background color is set inline (not via a Tailwind class) so it
                // always matches the actual paper color used in the editor —
                // that's what makes the open/close morph look like the card is
                // really stretching into the page instead of just a generic
                // animated rectangle. Everything ELSE about the card (border,
                // font, badges) is the new flat Office-Mobile style — only the
                // morph-target background color still has to match the editor.
                card.className = `office-card-note font-ui-modern p-4 flex flex-col justify-between cursor-pointer relative select-none note-card-enter ${isSelected ? 'ring-2 ring-office-accent' : ''}`;
                card.style.backgroundColor = SettingsModule.getPaperColor();
                card.dataset.noteId = note.id;

                // Small stagger so the cards cascade in rather than all
                // popping at once — capped at 8 cards' worth of delay so a
                // long list (or fast typing while searching) never leaves
                // late cards waiting on a long queued delay.
                card.style.animationDelay = `${Math.min(index, 8) * 18}ms`;
                // The animation only needs to play once per render; once it
                // finishes, drop the class so this card is never mistaken
                // for one that still needs animating (e.g. by any future
                // code that queries .note-card-enter).
                card.addEventListener('animationend', () => card.classList.remove('note-card-enter'), { once: true });

                // Strip HTML tags for clean card preview
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = note.content || '';
                const plainText = tempDiv.textContent || tempDiv.innerText || 'Tidak ada teks...';

                const pinBadge = note.pinned ? `
                    <div class="absolute top-2 right-2 w-5 h-5 bg-office-accent text-white rounded-sm flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6z"/></svg>
                    </div>` : '';

                const selectionDot = this.selectionMode ? `
                    <div class="note-selection-dot w-5 h-5 mt-0.5 rounded-sm border border-office-border flex items-center justify-center shrink-0 ${isSelected ? 'bg-office-accent border-office-accent' : 'bg-office-surface'}">
                        ${isSelected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
                    </div>` : '';

                card.innerHTML = `
                    ${pinBadge}
                    <div class="flex items-start gap-2">
                        ${selectionDot}
                        <div class="min-w-0 flex-1">
                            <h2 class="text-sm font-semibold text-office-text line-clamp-1 border-b border-office-divider pb-1 mb-2">${this.escapeHtml(note.title)}</h2>
                            <p class="text-xs text-office-muted line-clamp-3 mb-3">${this.escapeHtml(plainText)}</p>
                        </div>
                    </div>
                    <div class="flex justify-between items-center text-[10px] text-office-muted pt-2 border-t border-office-divider">
                        <span>${note.updatedAt || ''}</span>
                        <span class="font-semibold uppercase tracking-wider text-office-accent">${this.selectionMode ? '' : 'Buka &rarr;'}</span>
                    </div>
                `;

                this.attachCardGestures(card, note.id);
                return card;
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

                // Load the note now, while the view is still hidden, so the
                // content is already in place the instant the animation starts.
                EditorModule.loadNote(noteId);

                viewEditor.style.transformOrigin = 'top left';
                viewEditor.style.willChange = 'transform';
                viewEditor.classList.remove('hidden');

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

                const targetCard = document.querySelector(`[data-note-id="${noteId}"]`);
                let targetRect = null;
                if (targetCard) {
                    targetCard.scrollIntoView({ block: 'nearest' });
                    targetRect = targetCard.getBoundingClientRect();
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
            exitSelectionMode(fromPopState = false) {
                if (!this.selectionMode) return;
                this.selectionMode = false;
                this.selectedIds.clear();
                document.getElementById('headerSelection').classList.add('hidden');
                document.getElementById('headerSelection').classList.remove('flex');
                document.getElementById('headerDefault').classList.remove('hidden');
                document.getElementById('btnNewNote').classList.remove('hidden');
                this.renderNotesList(document.getElementById('searchInput').value.toLowerCase());

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
                this.updateCardSelectionVisual(noteId);
            },

            // Patches ONE card's selected look (ring + checkbox) in place,
            // instead of calling renderNotesList() — which used to run on
            // every single tap during batch selection and rebuilt EVERY
            // card, not just the tapped one. Once cards got an entrance
            // animation (for the smooth search/layout-switch effects), that
            // full rebuild made the animation visibly replay on each tap,
            // looking like the whole list "reloaded" every time a card was
            // selected. Selecting/deselecting a card never needs to change
            // any OTHER card's markup, so only the one that changed is
            // touched here.
            updateCardSelectionVisual(noteId) {
                const card = document.querySelector(`[data-note-id="${noteId}"]`);
                if (!card) return;
                const isSelected = this.selectedIds.has(noteId);
                card.classList.toggle('ring-2', isSelected);
                card.classList.toggle('ring-office-accent', isSelected);
                const dot = card.querySelector('.note-selection-dot');
                if (dot) {
                    dot.classList.toggle('bg-office-accent', isSelected);
                    dot.classList.toggle('border-office-accent', isSelected);
                    dot.classList.toggle('bg-office-surface', !isSelected);
                    dot.innerHTML = isSelected
                        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
                        : '';
                }
            },

            updateSelectionHeader() {
                const count = this.selectedIds.size;
                document.getElementById('selectionCount').textContent = `${count} dipilih`;
                document.getElementById('btnPinSelected').classList.toggle('opacity-40', count === 0);
                document.getElementById('btnCopySelected').classList.toggle('opacity-40', count === 0);
                document.getElementById('btnDeleteSelected').classList.toggle('opacity-40', count === 0);
            },

            // Duplicates every selected note as a brand-new, unpinned note
            // (title suffixed with "(Salinan)"), then exits selection mode
            // — matches how Delete/Pin already behave after acting on a
            // selection. Ids are minted from Date.now() + the loop index
            // (not Date.now() alone) since duplicating several notes at
            // once runs in the same tick, and Date.now() alone could hand
            // two of them the exact same millisecond.
            duplicateSelected() {
                if (this.selectedIds.size === 0) return;
                const count = this.selectedIds.size;

                const notes = StorageModule.getNotes();
                const now = new Date().toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric'
                });

                const duplicates = notes
                    .filter(n => this.selectedIds.has(n.id))
                    .map((n, i) => ({
                        ...n,
                        id: `note_${Date.now()}_${i}`,
                        title: `${n.title || 'Catatan Tanpa Judul'} (Salinan)`,
                        pinned: false,
                        createdAt: now,
                        updatedAt: now
                    }));

                StorageModule.saveNotes([...duplicates, ...notes]);

                this.showToast(count === 1 ? 'Catatan digandakan' : `${count} catatan digandakan`);
                this.exitSelectionMode();
            },

            deleteSelected() {
                if (this.selectedIds.size === 0) return;
                const count = this.selectedIds.size;
                if (!confirm(`Hapus ${count} catatan terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;

                let notes = StorageModule.getNotes();
                notes = notes.filter(n => !this.selectedIds.has(n.id));
                StorageModule.saveNotes(notes);

                this.showToast(`${count} catatan dihapus`);
                this.exitSelectionMode();
            },

            togglePinSelected() {
                if (this.selectedIds.size === 0) return;

                let notes = StorageModule.getNotes();
                const selectedNotes = notes.filter(n => this.selectedIds.has(n.id));
                const allAlreadyPinned = selectedNotes.every(n => n.pinned);

                notes = notes.map(n => this.selectedIds.has(n.id) ? { ...n, pinned: !allAlreadyPinned } : n);
                StorageModule.saveNotes(notes);

                this.showToast(allAlreadyPinned ? 'Sematan dilepas' : 'Catatan disematkan');
                this.exitSelectionMode();
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
