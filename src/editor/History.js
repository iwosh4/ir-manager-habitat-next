/**
 * Snapshot-based undo/redo. Snapshots are JSON strings of the logical document, which keeps the
 * implementation trivially correct (visuals are always rebuilt from logical state).
 * Continuous interactions (dragging, rotating) are grouped with begin()/commit().
 */
export class History {
  constructor(limit = 120) { this.limit = limit; this.undoStack = []; this.redoStack = []; this.pending = null; }
  reset(snapshot) { this.undoStack = [snapshot]; this.redoStack = []; this.pending = null; }
  get current() { return this.undoStack[this.undoStack.length - 1]; }
  push(snapshot, label = '') {
    if (snapshot === this.current) return false;
    this.undoStack.push(snapshot); this.labels = this.labels || []; this.labels.push(label);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }
  canUndo() { return this.undoStack.length > 1; }
  canRedo() { return this.redoStack.length > 0; }
  undo() { if (!this.canUndo()) return null; this.redoStack.push(this.undoStack.pop()); return this.current; }
  redo() { if (!this.canRedo()) return null; const s = this.redoStack.pop(); this.undoStack.push(s); return s; }
}
