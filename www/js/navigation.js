// VINOTE — Module: Navigation (Popstate & Android Back Button)

        // --- MODULE 3: NAVIGATION MODULE (Popstate & Android Back Button) ---
        const NavigationModule = {
            activeView: 'list', // 'list' | 'editor'
            activeModal: false,

            init() {
                history.replaceState({ page: 'list' }, '', '');

                // Listen to Android Hardware Back Button / Browser Popstate
                window.addEventListener('popstate', (e) => {
                    this.handlePopState(e.state);
                });
            },

            openEditor(noteId = null) {
                this.activeView = 'editor';
                const method = UIModule.collapseTransientFocusState() ? 'replaceState' : 'pushState';
                history[method]({ page: 'editor', noteId }, '', '#editor');
                UIModule.showEditorView(noteId);
            },

            closeEditor() {
                if (this.activeView === 'editor') {
                    this.activeView = 'list';
                    UIModule.showNotesListView();
                }
            },

            openSettings() {
                this.activeModal = true;
                const method = UIModule.collapseTransientFocusState() ? 'replaceState' : 'pushState';
                history[method]({ modal: 'settings' }, '', '#settings');
                UIModule.toggleModal('settingsModal', true);
            },

            closeSettings() {
                if (this.activeModal) {
                    this.activeModal = false;
                    UIModule.toggleModal('settingsModal', false);
                }
            },

            handlePopState(state) {
                // Priority -1: Search bar has focus (keyboard open) — close
                // just the keyboard/focus first, don't leave the screen yet.
                if (UIModule.searchFocusPushed) {
                    UIModule.exitSearchFocus(true);
                    return;
                }

                // Priority -0.5: Note title/body has the caret (keyboard
                // open) — same idea: first back press just closes the
                // keyboard, a second press is needed to actually leave.
                if (UIModule.typingFocusPushed) {
                    UIModule.exitTypingFocus(true);
                    return;
                }

                // Priority 0: Exit batch selection mode on the home screen
                if (UIModule.selectionMode) {
                    UIModule.exitSelectionMode(true);
                    return;
                }

                // Priority 1: Close Selection Bubble
                if (!UIModule.bubbleElement.classList.contains('hidden')) {
                    UIModule.hideBubble();
                    return;
                }

                // Priority 2: Close Floating "More" Menu (Undo/Redo/Hapus)
                const moreMenu = document.getElementById('editorMoreDropdown');
                if (moreMenu && !moreMenu.classList.contains('hidden')) {
                    moreMenu.classList.add('hidden');
                    return;
                }

                // Priority 3: Close Settings Modal
                if (this.activeModal) {
                    this.activeModal = false;
                    UIModule.toggleModal('settingsModal', false);
                    return;
                }

                // Priority 3.5: Exit "Lihat Penuh" (full view) mode — stays
                // on the same note, just restores the menu/caret.
                if (UIModule.viewModeActive) {
                    UIModule.exitNoteViewMode();
                    return;
                }

                // Priority 4: Close Editor View
                if (this.activeView === 'editor') {
                    // Save FIRST, then read currentNoteId — for a brand new
                    // note (opened with noteId === null) saveCurrentNote()
                    // is what actually assigns its real id. Reading the id
                    // beforehand would always capture null for a new note,
                    // even after it got saved with real content, so the
                    // close animation could never find that note's own card
                    // to morph onto and would fall back to a generic
                    // collapse every time.
                    // flushAutosave (not saveCurrentNote directly) so any
                    // still-pending debounced write (see
                    // EditorModule.scheduleAutosave) gets cancelled and
                    // written for real right now, instead of possibly
                    // firing a moment later after we've already left.
                    EditorModule.flushAutosave();
                    const noteId = EditorModule.currentNoteId;
                    this.activeView = 'list';
                    UIModule.morphEditorToCard(noteId);
                    return;
                }
            }
        };
