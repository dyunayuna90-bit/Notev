// VINOTE — Module: Settings (appearance & preferences)

        // --- MODULE 6: SETTINGS MODULE ---
        const SettingsModule = {
            currentSettings: {},

            // Mirrors the calc(var(--note-font-size) * N) multipliers on
            // .font-typewriter/.font-handwriting/.font-cursive in the
            // <style> block above. Kept in one place so computeRuledLineSpacing()
            // below can't silently drift out of sync with the CSS if either
            // one is changed later without updating the other.
            FONT_SIZE_MULTIPLIER: {
                'font-typewriter': 1.05, // Indie Flower — see .font-typewriter in styles.css
                'font-handwriting': 1.2,
                'font-cursive': 1.15
            },

            // The ruled-line pitch a note's DEFAULT font actually needs so
            // each line of text lands exactly on a rule: the default
            // font's own rendered size (base size × that font's own CSS
            // multiplier above) times the line-height multiplier. Per-
            // selection fonts that differ from the note's default (e.g. one
            // word set to "Sambung" inside an otherwise "Mesin Tik" note)
            // won't perfectly match this — ruled paper is one fixed
            // physical grid, so it can only truly line up with one size at
            // a time — but the common case (a note using one font
            // throughout) now always lands exactly on the lines.
            computeRuledLineSpacing() {
                const s = this.currentSettings;
                const multiplier = this.FONT_SIZE_MULTIPLIER[s.fontStyle] ?? 1;
                const effectiveFontSize = s.fontSize * multiplier;
                return Math.round(effectiveFontSize * s.lineHeight);
            },

            // The aged-paper overlay is `position:fixed`, sized in CSS at
            // 100vw/100vh. On mobile, opening the on-screen keyboard
            // shrinks the layout viewport (this page uses
            // <meta interactive-widget=resizes-content>), which shrinks
            // 100vh right out from under it. Since the overlay's age-spot
            // blotches and vignette are positioned as PERCENTAGES of its
            // own box, a box that quietly changes height moves them —
            // which is exactly why the effect looked "different" the
            // instant you tapped in to start typing vs. just viewing the
            // note. Locking the overlay to a fixed pixel size, measured
            // once while the keyboard is guaranteed to be closed (page
            // load), makes it completely immune to that resize.
            lockAgedOverlaySize() {
                const overlay = document.getElementById('agedPaperOverlay');
                if (!overlay) return;
                overlay.style.width = `${window.innerWidth}px`;
                overlay.style.height = `${window.innerHeight}px`;
            },

            // The actual paper background color for the current theme — used
            // to color note cards on the home screen so the card-to-editor
            // morph looks like the card is genuinely stretching into the
            // page, not just an animation layered on top of a mismatched color.
            getPaperColor() {
                return this.currentSettings.paperStyle === 'white' ? '#ffffff' : '#fcf8ec';
            },

            init() {
                this.currentSettings = StorageModule.getSettings();
                this.applySettingsToDOM();
                this.lockAgedOverlaySize();

                // Re-measure on an actual device rotation, but NOT on the
                // keyboard-triggered resizes that happen constantly while
                // typing (see lockAgedOverlaySize() for why those must be
                // ignored). 'orientationchange' only fires for the former.
                window.addEventListener('orientationchange', () => {
                    setTimeout(() => this.lockAgedOverlaySize(), 300);
                });

                // The ruled-line background is one continuous repeating
                // pattern painted from the TOP of #paperCanvas — which
                // includes the title input above the body text. The
                // title's own rendered height (font + padding + margin +
                // border) is essentially never an exact multiple of
                // --ruled-line-height, so without this, every line of
                // body text sits at a fixed but arbitrary offset from the
                // nearest printed rule — some lines' descenders crowd the
                // rule below, others leave a visibly bigger gap, purely
                // because of that leftover offset (title height mod
                // ruled-line-height), not because line spacing itself is
                // inconsistent. Re-sync on rotation/resize since the
                // title's height changes at the md: breakpoint.
                window.addEventListener('resize', () => this.syncRuledLineAlignment());

                // Bind Event Listeners
                document.querySelectorAll('input[name="paperStyle"]').forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        this.currentSettings.paperStyle = e.target.value;
                        this.saveAndApply();
                    });
                });

                document.getElementById('togglePaperLines').addEventListener('change', (e) => {
                    this.currentSettings.hasLines = e.target.checked;
                    this.saveAndApply();
                });

                document.getElementById('sliderFontSize').addEventListener('input', (e) => {
                    this.currentSettings.fontSize = parseInt(e.target.value);
                    document.getElementById('valFontSize').textContent = `${e.target.value}px`;
                    this.saveAndApply();
                });

                document.getElementById('sliderLineHeight').addEventListener('input', (e) => {
                    this.currentSettings.lineHeight = parseFloat(e.target.value);
                    document.getElementById('valLineHeight').textContent = `${e.target.value}×`;
                    this.saveAndApply();
                });

                document.getElementById('sliderLetterSpacing').addEventListener('input', (e) => {
                    this.currentSettings.letterSpacing = parseFloat(e.target.value);
                    document.getElementById('valLetterSpacing').textContent = `${e.target.value}px`;
                    this.saveAndApply();
                });

                document.getElementById('toggleAgedPaper').addEventListener('change', (e) => {
                    this.currentSettings.agedPaperEffect = e.target.checked;
                    this.saveAndApply();
                });

                document.getElementById('toggleEyeProtection').addEventListener('change', (e) => {
                    this.currentSettings.eyeProtection = e.target.checked;
                    this.saveAndApply();
                });

                // Backup buttons
                document.getElementById('btnExportData').addEventListener('click', () => {
                    StorageModule.exportBackup();
                });

                document.getElementById('btnImportData').addEventListener('click', () => {
                    document.getElementById('importFileInput').click();
                });

                document.getElementById('importFileInput').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        const success = StorageModule.importBackup(evt.target.result);
                        if (success) {
                            UIModule.showToast('Data berhasil diimpor!');
                            this.currentSettings = StorageModule.getSettings();
                            this.applySettingsToDOM();
                            UIModule.renderNotesList();
                        } else {
                            UIModule.showToast('Format berkas tidak valid!');
                        }
                    };
                    reader.readAsText(file);
                });
            },

            saveAndApply() {
                StorageModule.saveSettings(this.currentSettings);
                this.applySettingsToDOM();
            },

            // Sets and persists the note's default font style (the "Gaya
            // Font Tulisan" option in Settings), then applies it immediately
            // and syncs the active note's typing style so it actually takes
            // effect right away instead of only on the next reload.
            setDefaultFont(fontClass) {
                this.currentSettings.fontStyle = fontClass;
                this.saveAndApply();

                // Keep the editor's "what am I about to type in" state (and
                // its own, separate indicator in the selection bubble) lined
                // up with the new default, unless the user currently has
                // text selected — applying a global default shouldn't yank
                // formatting out from under an active per-selection edit.
                const selection = window.getSelection();
                const hasActiveSelection = selection && selection.rangeCount && !selection.isCollapsed;
                if (!hasActiveSelection) {
                    EditorModule.activeFont = fontClass;
                    EditorModule.pendingFont = fontClass;
                    EditorModule.updateFontIndicator();
                }
            },

            // Reflects the persisted default font on the Settings page's own
            // option buttons. Kept separate from EditorModule.updateFontIndicator()
            // (which drives the selection-bubble buttons) since the two can
            // legitimately show different active fonts — e.g. while formatting
            // one specific selection to "Sambung" without changing the note's
            // overall default.
            updateFontIndicator() {
                const active = this.currentSettings.fontStyle;
                document.querySelectorAll('.btnFontOption').forEach(btn => {
                    btn.classList.toggle('font-option-active', btn.getAttribute('data-font') === active);
                });
            },

            applySettingsToDOM() {
                const s = this.currentSettings;
                const paperCanvas = document.getElementById('paperCanvas');
                const editorArea = document.getElementById('editorArea');

                // Default font sync — this is the actual base style for any
                // text in the note that isn't wrapped in its own per-selection
                // font span (i.e. almost all of it, for most notes). Setting
                // it directly on #editorArea (rather than leaving it to
                // inherit from <body class="font-typewriter">) is what makes
                // picking "Tulisan Tangan" here actually change how the note
                // looks, immediately, instead of silently doing nothing.
                editorArea.classList.remove('font-typewriter', 'font-handwriting', 'font-cursive');
                editorArea.classList.add(s.fontStyle);
                this.updateFontIndicator();

                // Paper Style sync
                if (s.paperStyle === 'white') {
                    document.getElementById('paperWhite').checked = true;
                    paperCanvas.classList.remove('theme-vintage');
                    paperCanvas.classList.add('theme-white');
                    document.getElementById('paperVintageLabel').classList.replace('border-office-accent', 'border-transparent');
                    document.getElementById('paperWhiteLabel').classList.replace('border-transparent', 'border-office-accent');
                } else {
                    document.getElementById('paperVintage').checked = true;
                    paperCanvas.classList.remove('theme-white');
                    paperCanvas.classList.add('theme-vintage');
                    document.getElementById('paperWhiteLabel').classList.replace('border-office-accent', 'border-transparent');
                    document.getElementById('paperVintageLabel').classList.replace('border-transparent', 'border-office-accent');
                }

                // Ruled lines sync
                paperCanvas.classList.remove('paper-lined-vintage', 'paper-lined-white');
                if (s.hasLines) {
                    if (s.paperStyle === 'white') {
                        paperCanvas.classList.add('paper-lined-white');
                    } else {
                        paperCanvas.classList.add('paper-lined-vintage');
                    }
                }
                // Ruled-line pitch is now DERIVED from the text's own
                // actual rendered line-height (default font's size × its
                // own size multiplier × the line-height multiplier),
                // instead of a separately user-set px value. Two
                // independently-adjustable numbers only matched by
                // coincidence — any mismatch, even a couple px, compounds
                // line after line (line 1 looks fine, line 3 already
                // visibly off), since the ruled grid and the text advance
                // at two different fixed rates down the page. Deriving one
                // from the other guarantees they always advance at the
                // exact same rate.
                const ruledPitch = this.computeRuledLineSpacing();
                this.currentSettings.ruledLineSpacing = ruledPitch;
                paperCanvas.style.setProperty('--ruled-line-height', `${ruledPitch}px`);
                document.getElementById('ruledLineSpacingGroup').classList.toggle('hidden', !s.hasLines);

                // Font adjustments — the text's own line-height, independent
                // of the ruled-line spacing above.
                editorArea.style.fontSize = `${s.fontSize}px`;
                editorArea.style.setProperty('--note-font-size', `${s.fontSize}px`);
                // Unitless on purpose — see the lineHeight migration
                // comment in StorageModule.getSettings(). A unitless
                // value recomputes per element from THAT element's own
                // font-size, so a "Tulisan Tangan"/"Sambung" span (which
                // renders larger via its own font-size multiplier) gets
                // proportionally taller line spacing automatically,
                // instead of inheriting one fixed px box that was sized
                // for the base font only.
                editorArea.style.lineHeight = `${s.lineHeight}`;
                editorArea.style.letterSpacing = `${s.letterSpacing}px`;

                // Controls sync
                document.getElementById('togglePaperLines').checked = s.hasLines;
                document.getElementById('sliderFontSize').value = s.fontSize;
                document.getElementById('valFontSize').textContent = `${s.fontSize}px`;
                document.getElementById('sliderLineHeight').value = s.lineHeight;
                document.getElementById('valLineHeight').textContent = `${s.lineHeight}×`;
                document.getElementById('valRuledLineSpacing').textContent = `${ruledPitch}px`;
                document.getElementById('sliderLetterSpacing').value = s.letterSpacing;
                document.getElementById('valLetterSpacing').textContent = `${s.letterSpacing}px`;

                // Aged Paper Effect sync
                const agedEl = document.getElementById('agedPaperOverlay');
                document.getElementById('toggleAgedPaper').checked = s.agedPaperEffect;
                if (s.agedPaperEffect) {
                    agedEl.classList.remove('hidden');
                } else {
                    agedEl.classList.add('hidden');
                }

                // Eye Protection Mode sync — a warm amber filter over the
                // whole app (both views), toggled independently of the
                // note's own paper/aged-paper look.
                const eyeProtectionEl = document.getElementById('eyeProtectionOverlay');
                document.getElementById('toggleEyeProtection').checked = s.eyeProtection;
                if (eyeProtectionEl) {
                    eyeProtectionEl.classList.toggle('hidden', !s.eyeProtection);
                }

                this.updatePreview();
                this.syncRuledLineAlignment();
            },

            // Shifts the ruled-line background's phase (background-position-y)
            // so a rule boundary lands exactly at the top of #editorArea,
            // instead of the pattern's natural boundary at the top of
            // #paperCanvas (which is `offset` — title height + canvas's own
            // top padding — pixels above where the body text actually
            // starts). Only the leftover fraction (offset mod pitch) needs
            // to shift; whole pitches don't change anything. Skipped
            // entirely when ruled lines are off, or before layout exists
            // (e.g. editor view still hidden), since measurements would be
            // meaningless (0-height) at that point.
            syncRuledLineAlignment() {
                const paperCanvas = document.getElementById('paperCanvas');
                const titleEl = document.getElementById('noteTitleInput');
                const editorArea = document.getElementById('editorArea');
                if (!paperCanvas || !titleEl || !editorArea) return;
                if (!this.currentSettings.hasLines) return;
                if (paperCanvas.offsetParent === null) return; // view is hidden

                const pitch = this.currentSettings.ruledLineSpacing || 36;
                const canvasTop = paperCanvas.getBoundingClientRect().top;
                const editorTop = editorArea.getBoundingClientRect().top;
                // Compensate for internal scroll: as the user scrolls
                // #paperCanvas, editorTop moves relative to the container's
                // own (fixed) frame edge, but the background scrolls right
                // along with it (background-attachment: local), so adding
                // scrollTop back gives the same offset as if scrollTop were 0.
                const offset = (editorTop - canvasTop) + paperCanvas.scrollTop;
                const phase = ((offset % pitch) + pitch) % pitch;
                paperCanvas.style.backgroundPositionY = `${phase}px`;
            },

            // Drives the fixed-size "Pratinjau Kertas" preview box in
            // Settings. Deliberately mirrors applySettingsToDOM()'s logic
            // above 1:1 (same classes, same CSS custom properties, same
            // inline styles) instead of taking any shortcuts, so the
            // preview is a true match for the real note rather than an
            // approximation — the box itself (#settingsPreviewWrap) is
            // fixed-size in the markup/CSS and is never touched here; only
            // the sample paragraph's own styling changes.
            // Drives the fixed-size "Pratinjau Kertas" preview box in
            // Settings. Deliberately mirrors the real editor's structure,
            // not just its settings values: every character typed in a
            // real note ends up wrapped in a <span class="font-xxx"> (see
            // EditorModule.insertPendingFontText), and that span's actual
            // rendered size comes from calc(var(--note-font-size) *
            // multiplier) in CSS — NOT from the plain px font-size that
            // gets set directly on #editorArea (that inline value only
            // ever applies to editorArea itself, which real typed text is
            // never a direct child of). A font like "Tulisan Tangan" also
            // declares its own letter-spacing that overrides the slider
            // the same way. So the preview uses the same two-layer
            // structure — #settingsPreviewTextOuter (mirrors #editorArea:
            // gets the inline font-size/line-height/letter-spacing) wrapping
            // #settingsPreviewText (mirrors the typed-text span: gets ONLY
            // the font class) — instead of applying everything to one
            // element, which was silently overriding the multiplier and
            // per-font overrides and made the preview inaccurate.
            updatePreview() {
                const s = this.currentSettings;
                const paper = document.getElementById('settingsPreviewPaper');
                const outer = document.getElementById('settingsPreviewTextOuter');
                const text = document.getElementById('settingsPreviewText');
                const aged = document.getElementById('settingsPreviewAged');
                if (!paper || !outer || !text || !aged) return;

                // Paper color
                paper.classList.toggle('theme-white', s.paperStyle === 'white');
                paper.classList.toggle('theme-vintage', s.paperStyle !== 'white');

                // Ruled lines. Its own independent --ruled-line-height,
                // separate from the text's own line-height below — the two
                // are now separate sliders, so this preview must set both
                // independently, exactly like the real editor.
                paper.classList.remove('paper-lined-vintage', 'paper-lined-white');
                if (s.hasLines) {
                    paper.classList.add(s.paperStyle === 'white' ? 'paper-lined-white' : 'paper-lined-vintage');
                }
                paper.style.setProperty('--ruled-line-height', `${s.ruledLineSpacing}px`);

                // Outer wrapper = stand-in for #editorArea itself.
                outer.style.fontSize = `${s.fontSize}px`;
                outer.style.setProperty('--note-font-size', `${s.fontSize}px`);
                outer.style.lineHeight = `${s.lineHeight}`;
                outer.style.letterSpacing = `${s.letterSpacing}px`;

                // Inner span = stand-in for the span every real typed
                // character actually lives in. Only the font class — no
                // inline overrides — so calc(var(--note-font-size) *
                // multiplier) and any font-specific rules (Tulisan
                // Tangan's own letter-spacing) take effect exactly like
                // real typed text.
                text.className = s.fontStyle;

                // Aged paper overlay
                aged.classList.toggle('hidden', !s.agedPaperEffect);
            }
        };
