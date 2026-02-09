/**
 * Panel management for Roam Vim Mode
 */

import { Selectors, PANEL_CSS_CLASS, PANEL_SELECTOR, SCROLL_PADDING } from './constants.js';
import { assumeExists, relativeItem, clamp, findLast, delay } from './utils.js';
import { Roam } from './roam.js';

// ============== Panel State ==============
export const panelState = {
    panelOrder: [],
    panels: new Map(),
    focusedPanel: 0,
};

// ============== RoamBlock ==============
export class RoamBlock {
    constructor(element) {
        this.element = element;
    }

    get id() {
        return this.element.id;
    }

    async edit() {
        await Roam.activateBlock(this.element);
    }

    async toggleFold() {
        await Roam.toggleFoldBlock(this.element);
    }

    static get(blockId) {
        return new RoamBlock(assumeExists(document.getElementById(blockId)));
    }

    static selected() {
        return VimRoamPanel.selected().selectedBlock();
    }
}

// ============== VimRoamPanel ==============
export class VimRoamPanel {
    constructor(element) {
        this.element = element;
        this._selectedBlockId = null;
        this.blockIndex = 0;
    }

    blocks() {
        return Array.from(this.element.querySelectorAll(`${Selectors.block}, ${Selectors.blockInput}`));
    }

    relativeBlockId(blockId, blocksToJump) {
        return relativeItem(this.blocks(), this.indexOf(blockId), blocksToJump).id;
    }

    indexOf(blockId) {
        return this.blocks().findIndex(({ id }) => id === blockId);
    }

    get selectedBlockId() {
        if (!this._selectedBlockId || !document.getElementById(this._selectedBlockId)) {
            const blocks = this.blocks();
            this.blockIndex = clamp(this.blockIndex, 0, blocks.length - 1);
            if (blocks.length > 0) {
                this.selectBlock(blocks[this.blockIndex].id);
            }
        }
        return this._selectedBlockId;
    }

    selectedBlock() {
        return RoamBlock.get(this.selectedBlockId);
    }

    selectBlock(blockId) {
        this._selectedBlockId = blockId;
        this.blockIndex = this.indexOf(blockId);
        this.scrollUntilBlockIsVisible(this.selectedBlock().element);
    }

    selectRelativeBlock(blocksToJump) {
        const block = this.selectedBlock().element;
        this.selectBlock(this.relativeBlockId(block.id, blocksToJump));
    }

    selectFirstBlock() {
        this.element.scrollTop = 0;
        this.selectBlock(this.firstBlock().id);
    }

    selectLastBlock() {
        this.selectBlock(this.lastBlock().id);
    }

    selectLastVisibleBlock() {
        this.selectBlock(this.lastVisibleBlock().id);
    }

    selectFirstVisibleBlock() {
        this.selectBlock(this.firstVisibleBlock().id);
    }

    scrollUntilBlockIsVisible(block) {
        block.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }

    firstBlock() {
        return assumeExists(this.element.querySelector(Selectors.block));
    }

    lastBlock() {
        const blocks = this.blocks();
        return assumeExists(blocks[blocks.length - 1]);
    }

    select() {
        panelState.focusedPanel = panelState.panelOrder.indexOf(this.element);
        this.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    static selected() {
        panelState.focusedPanel = Math.min(panelState.focusedPanel, panelState.panelOrder.length - 1);
        return VimRoamPanel.get(panelState.panelOrder[panelState.focusedPanel]);
    }

    static fromBlock(blockElement) {
        return VimRoamPanel.get(assumeExists(blockElement.closest(PANEL_SELECTOR)));
    }

    static at(panelIndex) {
        panelIndex = clamp(panelIndex, 0, panelState.panelOrder.length - 1);
        return VimRoamPanel.get(panelState.panelOrder[panelIndex]);
    }

    static mainPanel() {
        return VimRoamPanel.at(0);
    }

    static previousPanel() {
        return VimRoamPanel.at(panelState.focusedPanel - 1);
    }

    static nextPanel() {
        return VimRoamPanel.at(panelState.focusedPanel + 1);
    }

    static updateSidePanels() {
        tagPanels();
        panelState.panelOrder = Array.from(document.querySelectorAll(PANEL_SELECTOR));
        panelState.panels = new Map(panelState.panelOrder.map(el => [el, VimRoamPanel.get(el)]));
    }

    static get(panelId) {
        if (!panelState.panels.has(panelId)) {
            panelState.panels.set(panelId, new VimRoamPanel(panelId));
        }
        return assumeExists(panelState.panels.get(panelId));
    }

    scrollAndReselectBlockToStayVisible(scrollPx) {
        this.scroll(scrollPx);
        this.selectClosestVisibleBlock(this.selectedBlock().element);
    }

    scroll(scrollPx) {
        this.element.scrollTop += scrollPx;
    }

    selectClosestVisibleBlock(block) {
        const scrollOverflow = blockScrollOverflow(block);
        if (scrollOverflow < 0) {
            this.selectFirstVisibleBlock();
        }
        if (scrollOverflow > 0) {
            this.selectLastVisibleBlock();
        }
    }

    firstVisibleBlock() {
        return assumeExists(this.blocks().find(blockIsVisible), 'Could not find any visible block');
    }

    lastVisibleBlock() {
        return assumeExists(findLast(this.blocks(), blockIsVisible), 'Could not find any visible block');
    }

    /**
     * Find the parent block of the current block
     * @returns {RoamBlock|null} The parent block or null if none exists
     */
    findParentBlock(currentBlockElement) {
        // Roam's structure:
        // parent .roam-block-container
        //   └── .rm-block-children
        //       └── current .roam-block-container

        const currentContainer = currentBlockElement.closest(Selectors.blockContainer);
        if (!currentContainer) return null;

        // Find the .rm-block-children that contains this block
        const childrenContainer = currentContainer.parentElement;
        if (!childrenContainer || !childrenContainer.classList.contains('rm-block-children')) {
            // We're at the top level, no parent
            return null;
        }

        // The parent is the .roam-block-container that contains the .rm-block-children
        const parentContainer = childrenContainer.parentElement;
        if (!parentContainer || parentContainer === currentContainer) return null;

        const parentBlock = parentContainer.querySelector(Selectors.block);
        return parentBlock ? new RoamBlock(parentBlock) : null;
    }

    /**
     * Find the first child block of the current block
     * @returns {RoamBlock|null} The first child block or null if none exists
     */
    findFirstChildBlock(currentBlockElement) {
        // Roam's structure:
        // current .roam-block-container
        //   ├── .rm-block-main (contains the actual block content)
        //   └── .rm-block-children (contains child blocks)
        //       └── child .roam-block-container

        const currentContainer = currentBlockElement.closest(Selectors.blockContainer);
        if (!currentContainer) return null;

        // .rm-block-children is a child of currentContainer, not a sibling
        const childrenContainer = currentContainer.querySelector('.rm-block-children');
        if (!childrenContainer) return null;

        // Find the first .roam-block-container within the children
        const childContainer = childrenContainer.querySelector(Selectors.blockContainer);
        if (!childContainer) return null;

        const childBlock = childContainer.querySelector(Selectors.block);
        return childBlock ? new RoamBlock(childBlock) : null;
    }

    /**
     * Select the parent block of the currently selected block
     * @returns {boolean} True if parent block was found and selected
     */
    selectParentBlock() {
        const currentBlock = this.selectedBlock().element;
        const parentBlock = this.findParentBlock(currentBlock);

        if (parentBlock) {
            this.selectBlock(parentBlock.id);
            return true;
        }
        return false;
    }

    /**
     * Select the first child block of the currently selected block
     * Automatically expands folded blocks if necessary
     * @returns {Promise<boolean>} True if child block was found and selected
     */
    async selectFirstChildBlock() {
        const currentBlock = this.selectedBlock().element;
        let childBlock = this.findFirstChildBlock(currentBlock);

        // If no child found, check if block is folded and expand it
        if (!childBlock) {
            const foldButton = currentBlock.querySelector(Selectors.foldButton);
            if (foldButton && foldButton.classList.contains('rm-caret-closed')) {
                // Block is folded, expand it
                await Roam.toggleFoldBlock(currentBlock);
                // Try again after expansion
                await delay(50);
                childBlock = this.findFirstChildBlock(currentBlock);
            }
        }

        if (childBlock) {
            this.selectBlock(childBlock.id);
            return true;
        }
        return false;
    }
}

// ============== Block Visibility Utilities ==============
export function blockScrollOverflow(block) {
    const { top, height, width } = block.getBoundingClientRect();
    const bottom = top + height;
    const scaledPadding = (width / block.offsetWidth) * SCROLL_PADDING;

    const panel = block.closest(PANEL_SELECTOR);
    if (!panel) return 0;

    const { top: panelTop, height: panelHeight } = panel.getBoundingClientRect();
    const panelBottom = panelTop + panelHeight;

    const overflowTop = panelTop - top + scaledPadding;
    if (overflowTop > 0) {
        return -overflowTop;
    }

    const overflowBottom = bottom - panelBottom + scaledPadding;
    if (overflowBottom > 0) {
        return overflowBottom;
    }

    return 0;
}

export function blockIsVisible(block) {
    return blockScrollOverflow(block) === 0;
}

export function tagPanels() {
    const DEFAULT_SCROLL_PANELS = `${Selectors.mainBody} > div:first-child, ${Selectors.sidebarScrollContainer}`;
    document.querySelectorAll(DEFAULT_SCROLL_PANELS).forEach(el => {
        el.classList.add(PANEL_CSS_CLASS);
    });
}
