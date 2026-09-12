// VINOTE — Module: Smart Undo/Redo Stack (per sentence/block history)

        // --- MODULE 2: SMART UNDO/REDO MODULE (Per Sentence / Block History) ---
        class UndoRedoStack {
            constructor(maxSize = 50) {
                this.history = [];
                this.redoStack = [];
                this.maxSize = maxSize;
                this.lastContent = '';
            }

            clear() {
                this.history = [];
                this.redoStack = [];
                this.lastContent = '';
            }

            pushState(content, force = false) {
                if (content === this.lastContent) return;
                
                // Snapshot state on sentence boundaries, line breaks, or forced actions
                if (force || this.history.length === 0) {
                    this.history.push(content);
                    if (this.history.length > this.maxSize) this.history.shift();
                    this.redoStack = [];
                    this.lastContent = content;
                } else {
                    const lastChar = content.slice(-1);
                    const isSentenceBoundary = ['.', '!', '?', '\n', ' ', '>'].includes(lastChar);
                    if (isSentenceBoundary && Math.abs(content.length - this.lastContent.length) > 3) {
                        this.history.push(content);
                        if (this.history.length > this.maxSize) this.history.shift();
                        this.redoStack = [];
                        this.lastContent = content;
                    }
                }
            }

            undo(currentContent) {
                if (this.history.length === 0) return null;
                this.redoStack.push(currentContent);
                const prevState = this.history.pop();
                this.lastContent = prevState;
                return prevState;
            }

            redo(currentContent) {
                if (this.redoStack.length === 0) return null;
                this.history.push(currentContent);
                const nextState = this.redoStack.pop();
                this.lastContent = nextState;
                return nextState;
            }
        }
