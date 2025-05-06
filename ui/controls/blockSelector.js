// Block type selector and transparency controls
import { CellType } from '../../types.js';
export function createBlockSelector(container, wasm, renderer) {
    const cellTypeContainer = document.createElement('div');
    cellTypeContainer.style.marginBottom = '15px';
    const cellTypeLabel = document.createElement('div');
    cellTypeLabel.textContent = 'Block Types';
    cellTypeLabel.style.marginBottom = '5px';
    cellTypeContainer.appendChild(cellTypeLabel);
    const cellTypes = [
        { type: CellType.EMPTY, name: 'Empty', color: '#555555' },
        { type: CellType.WALL, name: 'Wall', color: '#808080' },
        { type: CellType.ROBOT, name: 'Robot', color: '#00cc00' },
        { type: CellType.SETTLED_ROBOT, name: 'Settled', color: '#0055ff' },
        { type: CellType.DOOR, name: 'Door', color: '#ff8800' },
        { type: CellType.SLEEPING_ROBOT, name: 'Sleeping', color: '#002200' }
    ];
    const blockTypesGrid = document.createElement('div');
    blockTypesGrid.style.display = 'grid';
    blockTypesGrid.style.gridTemplateColumns = '1fr 1fr';
    blockTypesGrid.style.gap = '8px';
    blockTypesGrid.style.marginBottom = '10px';
    let selectedCellTypeForPlacement = null;
    const slidersContainer = document.createElement('div');
    slidersContainer.style.marginTop = '10px';
    const transparencySliders = {};
    cellTypes.forEach(cellType => {
        const blockButton = document.createElement('span');
        blockButton.textContent = cellType.name;
        blockButton.style.backgroundColor = cellType.color;
        blockButton.style.color = ['Empty', 'Wall'].includes(cellType.name) ? 'black' : 'white';
        blockButton.style.border = '1px solid #444';
        blockButton.style.borderRadius = '3px';
        blockButton.style.padding = '6px 8px';
        blockButton.style.width = '100%';
        blockButton.style.fontWeight = 'bold';
        blockButton.style.fontSize = '14px';
        blockButton.setAttribute('data-block-button', 'true');
        blockButton.setAttribute('data-block-type', cellType.type.toString());
        blockTypesGrid.appendChild(blockButton);
        // const sliderContainer = document.createElement('div');
        // sliderContainer.style.marginBottom = '6px';
        // const sliderHeader = document.createElement('div');
        // sliderHeader.style.display = 'flex';
        // sliderHeader.style.justifyContent = 'space-between';
        // sliderHeader.style.alignItems = 'center';
        // sliderHeader.style.marginBottom = '2px';
        // const sliderLabel = document.createElement('span');
        // sliderLabel.textContent = `${cellType.name} opacity:`;
        // sliderLabel.style.fontSize = '12px';
        // const valueDisplay = document.createElement('span');
        // let currentOpacity = renderer.getMaterialOpacity(cellType.type);
        // valueDisplay.textContent = `${Math.round(currentOpacity * 100)}%`;
        // valueDisplay.style.fontSize = '12px';
        // valueDisplay.style.minWidth = '36px';
        // valueDisplay.style.textAlign = 'right';
        // sliderHeader.appendChild(sliderLabel);
        // sliderHeader.appendChild(valueDisplay);
        // const transparencySlider = document.createElement('input');
        // transparencySlider.type = 'range';
        // transparencySlider.min = '0';
        // transparencySlider.max = '100';
        // transparencySlider.value = (currentOpacity * 100).toString();
        // transparencySlider.style.width = '100%';
        // transparencySlider.style.marginBottom = '0';
        // transparencySlider.style.cursor = 'pointer';
        // transparencySlider.addEventListener('input', () => {
        //     const opacity = parseInt(transparencySlider.value) / 100;
        //     valueDisplay.textContent = `${transparencySlider.value}%`;
        //     renderer.setMaterialOpacity(cellType.type, opacity);
        // });
        // transparencySliders[cellType.type] = {
        //     slider: transparencySlider,
        //     value: valueDisplay
        // };
        // sliderContainer.appendChild(sliderHeader);
        // sliderContainer.appendChild(transparencySlider);
        // slidersContainer.appendChild(sliderContainer);
    });
    cellTypeContainer.appendChild(blockTypesGrid);
    cellTypeContainer.appendChild(slidersContainer);
    container.appendChild(cellTypeContainer);
    // Set default selected cell type and trigger its style
    const defaultButton = blockTypesGrid.querySelector('[data-block-button]');
    if (defaultButton) {
        defaultButton.click();
    }
}
//# sourceMappingURL=blockSelector.js.map