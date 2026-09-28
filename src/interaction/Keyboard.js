/** Global keyboard shortcuts (ignored while typing into form fields). */
export class Keyboard {
  constructor(app) {
    this.app = app;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  onKey(e) {
    if (this.app.modal) return; // designer / builder own the keyboard while open
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const app = this.app, ed = app.editor, ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const step = e.shiftKey ? 0.1 : ed.snap.enabled ? ed.snap.grid || 0.01 : 0.01;
    let handled = true;
    if (ctrl && k === 'z' && !e.shiftKey) ed.undo();
    else if ((ctrl && k === 'y') || (ctrl && e.shiftKey && k === 'z')) ed.redo();
    else if (ctrl && k === 'd') app.duplicateSelected();
    else if (ctrl && k === 's') app.exportJSON();
    else if (ctrl && k === 'o') app.toolbar.openFile();
    else if (k === 'delete' || k === 'backspace') app.deleteSelected();
    else if (k === 'escape') {
      if (app.pointer.placing) app.pointer.cancelPlacement();
      else if (app.assemblyContext?.memberId) app.selectMember(null);
      else if (app.assemblyContext) app.exitAssembly();
      else ed.select(null);
    }
    else if (k === 'enter' && !e.altKey && ed.selected?.type === 'assembly' && !app.assemblyContext) app.enterAssembly(ed.selection);
    else if (k === 'r') { if (app.pointer.placing) app.pointer.rotatePlacement(e.shiftKey ? -90 : 90); else app.rotateSelected(e.altKey ? (e.shiftKey ? -ed.snap.angle : ed.snap.angle) : e.shiftKey ? -90 : 90); }
    else if (k === 'f') app.focusSelected();
    else if (k === 'g') { ed.snap.enabled = !ed.snap.enabled; app.toolbar.updateSnap(); app.toast(`Snapping ${ed.snap.enabled ? 'on' : 'off'}`); }
    else if (k === 'm') app.setDimensions(!app.prefs.dims);
    else if (k === 'arrowleft') app.nudgeSelected(-step, 0);
    else if (k === 'arrowright') app.nudgeSelected(step, 0);
    else if (k === 'arrowup') app.nudgeSelected(0, -step);
    else if (k === 'arrowdown') app.nudgeSelected(0, step);
    else if (k === '1') app.setView('top');
    else if (k === '2') app.setView('front');
    else if (k === '3') app.setView('left');
    else if (k === '4') app.setView('right');
    else if (k === '5') app.setView('iso');
    else if (k === '6') app.setView('interior');
    else if (k === '0' || k === 'home') app.setView('hero');
    else if (k === '[') app.setPanel('library', !app.prefs.library);
    else if (k === ']') app.setPanel('inspector', !app.prefs.inspector);
    else if (k === 'f11' || (k === 'enter' && e.altKey)) app.toggleFullscreen();
    else handled = false;
    if (handled) e.preventDefault();
  }
}
