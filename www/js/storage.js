// VINOTE — Module: Storage (localStorage persistence layer)

        // --- MODULE 1: STORAGE MODULE ---
        const StorageModule = {
            STORAGE_KEY_NOTES: 'vinote_notes_data',
            STORAGE_KEY_SETTINGS: 'vinote_settings_data',

            getNotes() {
                try {
                    return JSON.parse(localStorage.getItem(this.STORAGE_KEY_NOTES)) || [];
                } catch(e) {
                    return [];
                }
            },

            saveNotes(notes) {
                localStorage.setItem(this.STORAGE_KEY_NOTES, JSON.stringify(notes));
            },

            getSettings() {
                const defaults = {
                    paperStyle: 'vintage',
                    hasLines: false,
                    fontStyle: 'font-handwriting',
                    fontSize: 18,
                    lineHeight: 1.8,
                    ruledLineSpacing: 36,
                    letterSpacing: 0,
                    agedPaperEffect: false,
                    eyeProtection: false,
                    // App-wide Dark Mode for the Home/Settings chrome
                    // (headers, cards, buttons). Deliberately does NOT
                    // touch the note editor's own "paper" look — that
                    // stays governed by paperStyle above, same as a real
                    // sheet of paper doesn't change color with the room
                    // lighting.
                    darkMode: false,
                    // Home screen note-list layout: 1 = single column
                    // (default), 2 = two columns. Purely a Home/UI
                    // preference — doesn't touch the note content or the
                    // editor in any way.
                    noteListColumns: 1
                };
                try {
                    const stored = JSON.parse(localStorage.getItem(this.STORAGE_KEY_SETTINGS)) || {};
                    // Migrate the old "vhsEffect" key (renamed to
                    // agedPaperEffect when the VHS/CRT look was replaced
                    // with a static aged-paper look) so anyone who already
                    // had it turned on doesn't lose that choice.
                    if (stored.agedPaperEffect === undefined && stored.vhsEffect !== undefined) {
                        stored.agedPaperEffect = stored.vhsEffect;
                    }
                    delete stored.vhsEffect;
                    // ruledLineSpacing used to just be lineHeight (the two
                    // were the same value). For anyone upgrading with an
                    // existing lineHeight but no ruledLineSpacing yet,
                    // carry that value over so their paper doesn't
                    // suddenly look different — from here on the two are
                    // independent sliders.
                    if (stored.ruledLineSpacing === undefined && stored.lineHeight !== undefined) {
                        stored.ruledLineSpacing = stored.lineHeight;
                    }
                    // lineHeight used to be an absolute px value (e.g. 36),
                    // set once on #editorArea. Because line-height is an
                    // inherited CSS property, a fixed px value is inherited
                    // as-is by every nested span regardless of that span's
                    // OWN font-size — so a "Tulisan Tangan"/"Sambung" run
                    // (which renders 15-20% larger than the base size via
                    // its own calc() multiplier) was squeezed into the same
                    // fixed-height line box as plain text. Caveat/Dancing
                    // Script also have unusually tall ascenders/descenders,
                    // so which specific letters happened to land on a given
                    // line decided whether it looked cramped or fine —
                    // exactly the "kadang ketinggian, kadang kependekan"
                    // symptom. Switching to a unitless multiplier fixes
                    // this: unitless line-height is inherited as the raw
                    // number, and each element recomputes its own actual
                    // line-height from ITS OWN font-size, so bigger-font
                    // runs automatically get proportionally more room.
                    // Anyone with an old px value gets it converted to the
                    // equivalent ratio here so their existing notes don't
                    // visibly jump.
                    if (typeof stored.lineHeight === 'number' && stored.lineHeight > 6) {
                        const baseFontSize = stored.fontSize || defaults.fontSize;
                        const ratio = stored.lineHeight / baseFontSize;
                        stored.lineHeight = Math.min(2.6, Math.max(1.2, Math.round(ratio * 20) / 20));
                    }
                    return { ...defaults, ...stored };
                } catch(e) {
                    return defaults;
                }
            },

            saveSettings(settings) {
                localStorage.setItem(this.STORAGE_KEY_SETTINGS, JSON.stringify(settings));
            },

            exportBackup() {
                const data = {
                    notes: this.getNotes(),
                    settings: this.getSettings(),
                    version: '1.1',
                    exportedAt: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vinote_backup_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            },

            importBackup(jsonString) {
                try {
                    const parsed = JSON.parse(jsonString);
                    if (parsed && Array.isArray(parsed.notes)) {
                        this.saveNotes(parsed.notes);
                        if (parsed.settings) this.saveSettings(parsed.settings);
                        return true;
                    }
                } catch(e) {
                    console.error('Import error', e);
                }
                return false;
            }
        };
