/**
 * Mode management for Roam Vim Mode
 */

import { Selectors } from './constants.js';
import { getActiveEditElement } from './utils.js';
import { pageHintState } from './page-hints.js';
import { searchState } from './search.js';
import { clearSearchHighlightsIfActive } from './search.js';

// ============== Mode Enum ==============
export const Mode = {
    INSERT: 'INSERT',
    VISUAL: 'VISUAL',
    NORMAL: 'NORMAL',
    HINT: 'HINT',
    SEARCH: 'SEARCH',
};

// ============== Get Current Mode ==============
export function getMode() {
    let currentMode;

    if (searchState.active) {
        currentMode = Mode.SEARCH;
    } else if (pageHintState.active) {
        currentMode = Mode.HINT;
    } else if (getActiveEditElement() && !document.querySelector(Selectors.commandBar)) {
        currentMode = Mode.INSERT;
    } else if (document.querySelector(Selectors.highlight)) {
        currentMode = Mode.VISUAL;
    } else {
        currentMode = Mode.NORMAL;
    }

    // Clear search highlights when entering INSERT, VISUAL, or HINT mode
    // This allows n/N navigation in NORMAL mode after search completes
    if (searchState.highlightsActive) {
        if (currentMode === Mode.INSERT || currentMode === Mode.VISUAL || currentMode === Mode.HINT) {
            clearSearchHighlightsIfActive();
        }
    }

    return currentMode;
}
